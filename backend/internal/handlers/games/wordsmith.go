package games

import (
	_ "embed"
	"fmt"
	"math/rand"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Wordsmith: a Scrabble-style tile game. Named "Wordsmith" rather than
// "Scrabble" for the same reason Fowl Play isn't called "Duck Hunt" — the
// board layout, tile distribution, and rules are functional game design (not
// copyrightable), but "Scrabble" itself is a registered Hasbro/Mattel
// trademark. The word list is the public-domain ENABLE word list (~172,800
// words), the standard free dictionary used by open-source word-game clones
// — not the official (licensed) Scrabble dictionary.
//
// 2-4 players, one shared 15x15 board, turn-based. Hidden information: each
// player's own rack (7 tiles) and the bag's remaining contents — same
// private-Hands architecture as Crazy Eights/Uno/Whot (GameSessionState.Hands),
// never placed on GameData / never broadcast room-wide. Only non-revealing
// derivatives (rack_counts, bag_count) go into GameData.
//
// Board cell encoding (GameData["board"], a flat 225-entry []interface{}
// row-major, row*15+col): "" = empty; an uppercase letter = a real tile;
// a lowercase letter = a blank tile that was assigned that letter (blanks
// always score 0 regardless of which letter they represent).
//
// move_types:
//   place    { placements: [{row, col, tile, letter?}] }  — tile is the rack
//            tile being played ("?" for a blank); letter is required only for
//            a blank, and is the letter it's being assigned on the board.
//   exchange { tiles: ["A", "?", "Q"] }  — swap listed rack tiles for new ones
//            from the bag; ends the turn, scores nothing. Requires the bag to
//            hold at least as many tiles as being exchanged.
//   pass     {}  — ends the turn with no other effect.
//
// End of game: either (a) a player empties their rack while the bag is empty
// — that player gets a bonus equal to the sum of every other player's
// remaining rack value, and each other player is docked their own remaining
// rack value; or (b) every player has passed/exchanged for 2 consecutive full
// rounds with no placement (a simplified stand-in for the official "6
// consecutive scoreless turns" rule — reasonable for a casual, no-stakes party
// game, matching this package's existing precedent of simplifying real-world
// rules where exactness doesn't matter, e.g. Blackjack's no-betting model).
// Highest total score wins; a tie is a draw (no winnerID).

const wordsmithBoardSize = 15
const wordsmithRackSize = 7
const wordsmithBingoBonus = 50

//go:embed data/enable_words.txt
var wordsmithWordListRaw string

var wordsmithDictionary map[string]bool

func init() {
	lines := strings.Split(wordsmithWordListRaw, "\n")
	wordsmithDictionary = make(map[string]bool, len(lines))
	for _, w := range lines {
		w = strings.ToUpper(strings.TrimSpace(w))
		if w != "" {
			wordsmithDictionary[w] = true
		}
	}
}

func wordsmithIsValidWord(word string) bool {
	return wordsmithDictionary[strings.ToUpper(word)]
}

// wordsmithExternalCheckTimeout matches hymns_proxy.go's own requestTimeout
// constant for the same kind of ad-hoc external REST call — the established
// idiom in this codebase for a bare `net/http` hit against a third-party API.
const wordsmithExternalCheckTimeout = 10 * time.Second

// wordsmithExternallyConfirmedWords caches words confirmed via the external
// dictionary check (wordsmithValidateWord below) — server-wide, in-memory,
// for the lifetime of the process. A word confirmed once by any player in
// any game session never needs a second network round-trip; deliberately
// not scoped per-game-session since a real word is a real word regardless
// of which puzzle/session encountered it first.
var (
	wordsmithExternallyConfirmedWords   = map[string]bool{}
	wordsmithExternallyConfirmedWordsMu sync.Mutex
)

// wordsmithExternalWordChecker is swappable in tests so the suite never
// needs live network access to pass.
var wordsmithExternalWordChecker = defaultWordsmithExternalCheck

// defaultWordsmithExternalCheck queries the free, keyless Free Dictionary
// API. A 200 response means the word is real; anything else (404, network
// error, timeout) means "couldn't confirm it" — treated as invalid, same as
// not finding it in the embedded list.
// wordsmithExternalCheckMaxAttempts and wordsmithExternalCheckRetryDelay
// exist because the Free Dictionary API is meaningfully flaky in practice —
// confirmed via direct repeated testing that roughly half of all requests,
// even for common, definitely-real words ("dog"), return a transient 502
// with no relation to the word itself, while a genuine "not found" reliably
// comes back as a clean 404. Treating a single non-200 as "not a word"
// would wrongly reject real words on nothing but bad luck against a flaky
// third party — so only a 200 (found) or a 404 (genuinely not found) is
// treated as a definitive answer; anything else is retried a few times.
const (
	wordsmithExternalCheckMaxAttempts = 3
	wordsmithExternalCheckRetryDelay  = 400 * time.Millisecond
)

func defaultWordsmithExternalCheck(word string) bool {
	client := &http.Client{Timeout: wordsmithExternalCheckTimeout}
	url := "https://api.dictionaryapi.dev/api/v2/entries/en/" + strings.ToLower(word)

	for attempt := 0; attempt < wordsmithExternalCheckMaxAttempts; attempt++ {
		if attempt > 0 {
			time.Sleep(wordsmithExternalCheckRetryDelay)
		}
		resp, err := client.Get(url)
		if err != nil {
			continue // network error — transient, retry
		}
		status := resp.StatusCode
		resp.Body.Close()
		if status == http.StatusOK {
			return true
		}
		if status == http.StatusNotFound {
			return false
		}
		// Anything else (5xx, rate limiting, ...) — transient, retry.
	}
	return false
}

// wordsmithValidateWord is the single entry point for "is this a real
// word" — used by the ordinary "place" move (allowExternal=false, the fast
// embedded-list-only path, unchanged behavior) and the "insist" move
// (allowExternal=true — a real-dictionary appeal for a word the embedded
// ENABLE list doesn't happen to contain).
func wordsmithValidateWord(word string, allowExternal bool) bool {
	if wordsmithIsValidWord(word) {
		return true
	}
	if !allowExternal {
		return false
	}

	upper := strings.ToUpper(word)
	wordsmithExternallyConfirmedWordsMu.Lock()
	if wordsmithExternallyConfirmedWords[upper] {
		wordsmithExternallyConfirmedWordsMu.Unlock()
		return true
	}
	wordsmithExternallyConfirmedWordsMu.Unlock()

	if !wordsmithExternalWordChecker(word) {
		return false
	}

	wordsmithExternallyConfirmedWordsMu.Lock()
	wordsmithExternallyConfirmedWords[upper] = true
	wordsmithExternallyConfirmedWordsMu.Unlock()
	return true
}

// wordsmithBoardLayout: '.' = normal, '2' = double letter, '3' = triple letter,
// 'd' = double word, 't' = triple word, '*' = center (double word). The
// standard, symmetric 15x15 layout used across every Scrabble-like game.
var wordsmithBoardLayout = [wordsmithBoardSize]string{
	"t..2...t...2..t",
	".d...3...3...d.",
	"..d...2.2...d..",
	"2..d...2...d..2",
	"....d.....d....",
	".3...3...3...3.",
	"..2...2.2...2..",
	"t..2...*...2..t",
	"..2...2.2...2..",
	".3...3...3...3.",
	"....d.....d....",
	"2..d...2...d..2",
	"..d...2.2...d..",
	".d...3...3...d.",
	"t..2...t...2..t",
}

func wordsmithLayoutAt(row, col int) byte {
	return wordsmithBoardLayout[row][col]
}

var wordsmithTileValues = map[byte]int{
	'A': 1, 'B': 3, 'C': 3, 'D': 2, 'E': 1, 'F': 4, 'G': 2, 'H': 4, 'I': 1,
	'J': 8, 'K': 5, 'L': 1, 'M': 3, 'N': 1, 'O': 1, 'P': 3, 'Q': 10, 'R': 1,
	'S': 1, 'T': 1, 'U': 1, 'V': 4, 'W': 4, 'X': 8, 'Y': 4, 'Z': 10,
}

// wordsmithTileCounts: the standard 100-tile English Scrabble distribution.
// "?" is a blank (2 in the set, worth 0 points, can represent any letter).
var wordsmithTileCounts = map[string]int{
	"?": 2,
	"A": 9, "B": 2, "C": 2, "D": 4, "E": 12, "F": 2, "G": 3, "H": 2, "I": 9,
	"J": 1, "K": 1, "L": 4, "M": 2, "N": 6, "O": 8, "P": 2, "Q": 1, "R": 6,
	"S": 4, "T": 6, "U": 4, "V": 2, "W": 2, "X": 1, "Y": 2, "Z": 1,
}

func wordsmithNewBag() []string {
	bag := make([]string, 0, 100)
	for tile, count := range wordsmithTileCounts {
		for i := 0; i < count; i++ {
			bag = append(bag, tile)
		}
	}
	ShuffleDeck(bag) // reuses cards.go's generic Fisher-Yates shuffle
	return bag
}

func wordsmithEmptyBoard() []interface{} {
	board := make([]interface{}, wordsmithBoardSize*wordsmithBoardSize)
	for i := range board {
		board[i] = ""
	}
	return board
}

func wordsmithIdx(row, col int) int { return row*wordsmithBoardSize + col }

func wordsmithInBounds(row, col int) bool {
	return row >= 0 && row < wordsmithBoardSize && col >= 0 && col < wordsmithBoardSize
}

// dealWordsmith sets up the board, shuffles the bag, and deals 7 tiles to
// each player. Called directly from StartGame (like dealCrazyEights) —
// players need to see their starting rack before anyone acts.
func dealWordsmith(gameState *GameSessionState) {
	bag := wordsmithNewBag()
	hands := make(map[uint][]string, len(gameState.Players))
	for _, p := range gameState.Players {
		n := wordsmithRackSize
		if len(bag) < n {
			n = len(bag)
		}
		hands[p.UserID] = append([]string{}, bag[:n]...)
		bag = bag[n:]
	}

	gameState.Hands = hands
	gameState.DrawPile = bag // reuse the generic DrawPile field as the tile bag

	gameState.GameData["board"] = wordsmithEmptyBoard()
	gameState.GameData["scores"] = map[string]interface{}{}
	gameState.GameData["consecutive_passes"] = 0
	gameState.GameData["last_word"] = ""
	gameState.GameData["last_score"] = 0
	gameState.GameData["last_player_id"] = nil

	syncWordsmithPublicState(gameState)
}

func syncWordsmithPublicState(gameState *GameSessionState) {
	counts := make(map[string]interface{}, len(gameState.Players))
	scores := wordsmithScores(gameState)
	for _, p := range gameState.Players {
		key := fmt.Sprintf("%d", p.UserID)
		counts[key] = len(gameState.Hands[p.UserID])
		if _, ok := scores[key]; !ok {
			scores[key] = 0
		}
	}
	gameState.GameData["rack_counts"] = counts
	gameState.GameData["bag_count"] = len(gameState.DrawPile)
	gameState.GameData["scores"] = scores
}

func wordsmithScores(gameState *GameSessionState) map[string]interface{} {
	raw := gameState.GameData["scores"]
	if m, ok := raw.(map[string]interface{}); ok {
		return m
	}
	return map[string]interface{}{}
}

func wordsmithBoard(gameState *GameSessionState) []interface{} {
	raw := gameState.GameData["board"]
	if b, ok := raw.([]interface{}); ok {
		return b
	}
	// Shouldn't happen (dealWordsmith always sets it), but fail safe rather
	// than panic on a malformed/legacy state.
	return wordsmithEmptyBoard()
}

func wordsmithCellLetter(board []interface{}, row, col int) string {
	v, _ := board[wordsmithIdx(row, col)].(string)
	return v
}

func wordsmithCellEmpty(board []interface{}, row, col int) bool {
	return wordsmithCellLetter(board, row, col) == ""
}

func (gm *GameManager) processWordsmithMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	switch moveType {
	case "place":
		return gm.processWordsmithPlace(gameState, playerID, moveData, false)
	case "insist":
		// Same placements payload as "place" — retries the identical
		// placement, this time allowed to appeal to a real external
		// dictionary for any word the embedded ENABLE list rejected.
		return gm.processWordsmithPlace(gameState, playerID, moveData, true)
	case "exchange":
		return gm.processWordsmithExchange(gameState, playerID, moveData)
	case "pass":
		return gm.processWordsmithPass(gameState, playerID)
	default:
		return false, nil, fmt.Errorf("unknown wordsmith move type: %s", moveType)
	}
}

type wordsmithPlacement struct {
	row, col int
	tile     string // the rack tile consumed ("?" for a blank)
	letter   byte   // the board letter — same as tile unless tile == "?"
	isBlank  bool
}

func (gm *GameManager) processWordsmithPlace(gameState *GameSessionState, playerID uint, moveData map[string]interface{}, allowExternalCheck bool) (bool, *uint, error) {
	rawPlacements, ok := moveData["placements"].([]interface{})
	if !ok || len(rawPlacements) == 0 {
		return false, nil, fmt.Errorf("placements required")
	}

	rack := append([]string{}, gameState.Hands[playerID]...)
	placements := make([]wordsmithPlacement, 0, len(rawPlacements))
	seen := map[int]bool{}
	rackRemaining := append([]string{}, rack...)

	for _, raw := range rawPlacements {
		pm, ok := raw.(map[string]interface{})
		if !ok {
			return false, nil, fmt.Errorf("invalid placement entry")
		}
		rowF, _ := pm["row"].(float64)
		colF, _ := pm["col"].(float64)
		row, col := int(rowF), int(colF)
		if !wordsmithInBounds(row, col) {
			return false, nil, fmt.Errorf("placement out of bounds")
		}
		if seen[wordsmithIdx(row, col)] {
			return false, nil, fmt.Errorf("duplicate placement at %d,%d", row, col)
		}
		seen[wordsmithIdx(row, col)] = true

		tile, _ := pm["tile"].(string)
		tile = strings.ToUpper(strings.TrimSpace(tile))
		if tile == "" {
			return false, nil, fmt.Errorf("missing tile")
		}

		var letter byte
		if tile == "?" {
			letterStr, _ := pm["letter"].(string)
			letterStr = strings.ToUpper(strings.TrimSpace(letterStr))
			if len(letterStr) != 1 || letterStr[0] < 'A' || letterStr[0] > 'Z' {
				return false, nil, fmt.Errorf("blank tile needs a valid letter")
			}
			letter = letterStr[0]
		} else {
			if len(tile) != 1 || tile[0] < 'A' || tile[0] > 'Z' {
				return false, nil, fmt.Errorf("invalid tile %q", tile)
			}
			letter = tile[0]
		}

		// Consume from the rack copy so a move can't reuse the same physical
		// tile twice (e.g. two placements both claiming the rack's only "Q").
		consumed := false
		for i, t := range rackRemaining {
			if t == tile {
				rackRemaining = append(rackRemaining[:i], rackRemaining[i+1:]...)
				consumed = true
				break
			}
		}
		if !consumed {
			return false, nil, fmt.Errorf("tile %q is not in your rack", tile)
		}

		placements = append(placements, wordsmithPlacement{row: row, col: col, tile: tile, letter: letter, isBlank: tile == "?"})
	}

	board := append([]interface{}{}, wordsmithBoard(gameState)...)
	for _, p := range placements {
		if !wordsmithCellEmpty(board, p.row, p.col) {
			return false, nil, fmt.Errorf("cell %d,%d is already occupied", p.row, p.col)
		}
	}

	isFirstMove := true
	for _, cell := range board {
		if cell != "" {
			isFirstMove = false
			break
		}
	}

	// Determine axis: all same row (horizontal) or all same col (vertical).
	// A single tile has no fixed axis yet — resolved below from board context.
	horizontal := true
	vertical := true
	for i := 1; i < len(placements); i++ {
		if placements[i].row != placements[0].row {
			horizontal = false
		}
		if placements[i].col != placements[0].col {
			vertical = false
		}
	}
	if len(placements) > 1 && !horizontal && !vertical {
		return false, nil, fmt.Errorf("tiles must be placed in a single row or column")
	}
	if len(placements) == 1 {
		// Infer orientation from adjacent existing tiles; default horizontal
		// (matters only for cross-word detection below, not the main word,
		// which is a single letter either way).
		r, c := placements[0].row, placements[0].col
		hasVerticalNeighbor := (wordsmithInBounds(r-1, c) && !wordsmithCellEmpty(board, r-1, c)) ||
			(wordsmithInBounds(r+1, c) && !wordsmithCellEmpty(board, r+1, c))
		hasHorizontalNeighbor := (wordsmithInBounds(r, c-1) && !wordsmithCellEmpty(board, r, c-1)) ||
			(wordsmithInBounds(r, c+1) && !wordsmithCellEmpty(board, r, c+1))
		if hasVerticalNeighbor && !hasHorizontalNeighbor {
			horizontal, vertical = false, true
		} else {
			horizontal, vertical = true, false
		}
	}

	// Contiguity along the main axis: every cell between the min and max
	// placed position must already be filled (by this move or a previous
	// one) — no true gaps.
	newlyPlaced := map[int]bool{}
	for _, p := range placements {
		newlyPlaced[wordsmithIdx(p.row, p.col)] = true
	}
	// Blank tiles render as a lowercase letter on the board — this is the
	// only signal wordsmithScoreWord has to know a cell scores 0 regardless
	// of which letter it represents.
	for _, p := range placements {
		ch := p.letter
		if p.isBlank {
			ch = ch - 'A' + 'a'
		}
		board[wordsmithIdx(p.row, p.col)] = string(ch)
	}

	var minPos, maxPos, fixedOther int
	if horizontal {
		fixedOther = placements[0].row
		minPos, maxPos = placements[0].col, placements[0].col
		for _, p := range placements {
			if p.col < minPos {
				minPos = p.col
			}
			if p.col > maxPos {
				maxPos = p.col
			}
		}
		for c := minPos; c <= maxPos; c++ {
			if wordsmithCellEmpty(board, fixedOther, c) {
				return false, nil, fmt.Errorf("gap in placed tiles — the row must be contiguous")
			}
		}
	} else {
		fixedOther = placements[0].col
		minPos, maxPos = placements[0].row, placements[0].row
		for _, p := range placements {
			if p.row < minPos {
				minPos = p.row
			}
			if p.row > maxPos {
				maxPos = p.row
			}
		}
		for r := minPos; r <= maxPos; r++ {
			if wordsmithCellEmpty(board, r, fixedOther) {
				return false, nil, fmt.Errorf("gap in placed tiles — the column must be contiguous")
			}
		}
	}

	// Extend to the full main word (walking past pre-existing tiles on
	// either end) and validate first-move/connectivity rules.
	mainWord, mainCells, mainHasExisting := wordsmithExtractWord(board, fixedOther, minPos, maxPos, horizontal)

	if isFirstMove {
		coversCenter := false
		for _, idx := range mainCells {
			if idx == wordsmithIdx(7, 7) {
				coversCenter = true
				break
			}
		}
		if !coversCenter {
			return false, nil, fmt.Errorf("the first word must cover the center square")
		}
	} else {
		connected := mainHasExisting
		if !connected {
			for _, p := range placements {
				neighbors := [][2]int{{p.row - 1, p.col}, {p.row + 1, p.col}, {p.row, p.col - 1}, {p.row, p.col + 1}}
				for _, n := range neighbors {
					if wordsmithInBounds(n[0], n[1]) && newlyPlacedOrOriginal(board, newlyPlaced, n[0], n[1]) {
						connected = true
						break
					}
				}
				if connected {
					break
				}
			}
		}
		if !connected {
			return false, nil, fmt.Errorf("word must connect to an existing tile on the board")
		}
	}

	// Collect every word formed this turn: the main word, plus one cross
	// word per newly placed tile that has a perpendicular neighbor.
	type formedWord struct {
		word  string
		cells []int
	}
	var words []formedWord
	if len(mainCells) >= 2 {
		words = append(words, formedWord{word: mainWord, cells: mainCells})
	}
	for _, p := range placements {
		var cw string
		var cc []int
		var hasExisting bool
		if horizontal {
			cw, cc, hasExisting = wordsmithExtractWord(board, p.col, p.row, p.row, false)
		} else {
			cw, cc, hasExisting = wordsmithExtractWord(board, p.row, p.col, p.col, true)
		}
		if len(cc) >= 2 {
			_ = hasExisting
			words = append(words, formedWord{word: cw, cells: cc})
		}
	}

	if len(words) == 0 {
		return false, nil, fmt.Errorf("placement doesn't form a word")
	}
	for _, w := range words {
		if !wordsmithValidateWord(w.word, allowExternalCheck) {
			return false, nil, fmt.Errorf("%q is not a valid word", w.word)
		}
	}

	// Score every formed word — letter/word multipliers apply only on cells
	// placed THIS turn (an already-occupied cell's premium was already
	// consumed the turn it was first covered, and can never be placed on
	// again, so no separate "used" tracking is needed).
	totalScore := 0
	for _, w := range words {
		totalScore += wordsmithScoreWord(board, w.cells, newlyPlaced)
	}
	if len(placements) == wordsmithRackSize {
		totalScore += wordsmithBingoBonus
	}

	// Commit: rack, board, bag refill, score.
	gameState.Hands[playerID] = rackRemaining
	gameState.GameData["board"] = board

	bag := gameState.DrawPile
	need := wordsmithRackSize - len(rackRemaining)
	if need > len(bag) {
		need = len(bag)
	}
	if need > 0 {
		gameState.Hands[playerID] = append(gameState.Hands[playerID], bag[:need]...)
		gameState.DrawPile = bag[need:]
	}

	scores := wordsmithScores(gameState)
	key := fmt.Sprintf("%d", playerID)
	prev, _ := scores[key].(float64)
	if iv, ok := scores[key].(int); ok {
		prev = float64(iv)
	}
	scores[key] = prev + float64(totalScore)
	gameState.GameData["scores"] = scores
	gameState.GameData["consecutive_passes"] = 0
	gameState.GameData["last_word"] = mainWord
	gameState.GameData["last_score"] = totalScore
	gameState.GameData["last_player_id"] = playerID

	syncWordsmithPublicState(gameState)

	if len(gameState.Hands[playerID]) == 0 && len(gameState.DrawPile) == 0 {
		return true, wordsmithSettleEmptyRack(gameState, playerID), nil
	}

	if decided, winnerID := wordsmithCheckMathematicallyDecided(gameState); decided {
		return true, winnerID, nil
	}

	return false, nil, nil
}

// newlyPlacedOrOriginal reports whether (row,col) has a tile that predates
// this move — i.e. it's filled but wasn't one of this move's own placements.
func newlyPlacedOrOriginal(board []interface{}, newlyPlaced map[int]bool, row, col int) bool {
	idx := wordsmithIdx(row, col)
	if newlyPlaced[idx] {
		return false
	}
	v, _ := board[idx].(string)
	return v != ""
}

// wordsmithExtractWord walks outward from [minPos, maxPos] along the given
// axis (through `fixedOther`, the row if horizontal or the column if
// vertical) to find the full contiguous run of filled cells — i.e. the
// complete word, including any pre-existing tiles beyond the newly placed
// span. Returns the word, its cell indices in order, and whether any cell in
// the final word predates this move (existed before minPos/maxPos were
// walked outward, used for connectivity checks).
func wordsmithExtractWord(board []interface{}, fixedOther, minPos, maxPos int, horizontal bool) (string, []int, bool) {
	start, end := minPos, maxPos
	get := func(pos int) (string, bool) {
		if horizontal {
			if !wordsmithInBounds(fixedOther, pos) {
				return "", false
			}
			return wordsmithCellLetter(board, fixedOther, pos), true
		}
		if !wordsmithInBounds(pos, fixedOther) {
			return "", false
		}
		return wordsmithCellLetter(board, pos, fixedOther), true
	}
	for {
		v, ok := get(start - 1)
		if !ok || v == "" {
			break
		}
		start--
	}
	for {
		v, ok := get(end + 1)
		if !ok || v == "" {
			break
		}
		end++
	}

	var sb strings.Builder
	cells := make([]int, 0, end-start+1)
	extendedBeyondOriginal := start < minPos || end > maxPos
	for pos := start; pos <= end; pos++ {
		v, _ := get(pos)
		sb.WriteString(strings.ToUpper(v))
		if horizontal {
			cells = append(cells, wordsmithIdx(fixedOther, pos))
		} else {
			cells = append(cells, wordsmithIdx(pos, fixedOther))
		}
	}
	return sb.String(), cells, extendedBeyondOriginal
}

// wordsmithScoreWord sums one formed word's score: each letter's base value
// (0 for a blank, regardless of assigned letter), multiplied by its letter
// premium if that cell was placed this turn, then the whole sum multiplied
// by the product of any word premiums among this turn's cells in the word.
func wordsmithScoreWord(board []interface{}, cells []int, newlyPlaced map[int]bool) int {
	letterSum := 0
	wordMultiplier := 1
	for _, idx := range cells {
		row, col := idx/wordsmithBoardSize, idx%wordsmithBoardSize
		cell, _ := board[idx].(string)
		isBlank := cell != "" && cell[0] >= 'a' && cell[0] <= 'z'
		var value int
		if !isBlank {
			value = wordsmithTileValues[strings.ToUpper(cell)[0]]
		}

		if newlyPlaced[idx] {
			switch wordsmithLayoutAt(row, col) {
			case '2':
				value *= 2
			case '3':
				value *= 3
			case 'd', '*':
				wordMultiplier *= 2
			case 't':
				wordMultiplier *= 3
			}
		}
		letterSum += value
	}
	return letterSum * wordMultiplier
}

func (gm *GameManager) processWordsmithExchange(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	rawTiles, ok := moveData["tiles"].([]interface{})
	if !ok || len(rawTiles) == 0 {
		return false, nil, fmt.Errorf("tiles required")
	}
	if len(rawTiles) > len(gameState.DrawPile) {
		return false, nil, fmt.Errorf("not enough tiles left in the bag to exchange")
	}

	rack := append([]string{}, gameState.Hands[playerID]...)
	exchanged := make([]string, 0, len(rawTiles))
	for _, raw := range rawTiles {
		tile, _ := raw.(string)
		tile = strings.ToUpper(strings.TrimSpace(tile))
		found := false
		for i, t := range rack {
			if t == tile {
				rack = append(rack[:i], rack[i+1:]...)
				exchanged = append(exchanged, tile)
				found = true
				break
			}
		}
		if !found {
			return false, nil, fmt.Errorf("tile %q is not in your rack", tile)
		}
	}

	bag := append([]string{}, gameState.DrawPile...)
	drawn := bag[:len(exchanged)]
	bag = bag[len(exchanged):]
	rack = append(rack, drawn...)
	bag = append(bag, exchanged...)
	ShuffleDeck(bag)

	gameState.Hands[playerID] = rack
	gameState.DrawPile = bag
	gameState.GameData["consecutive_passes"] = wordsmithIntField(gameState.GameData, "consecutive_passes") + 1
	syncWordsmithPublicState(gameState)

	if wordsmithIntField(gameState.GameData, "consecutive_passes") >= len(gameState.Players)*2 {
		return true, wordsmithSettleByScore(gameState), nil
	}
	if decided, winnerID := wordsmithCheckMathematicallyDecided(gameState); decided {
		return true, winnerID, nil
	}
	return false, nil, nil
}

func (gm *GameManager) processWordsmithPass(gameState *GameSessionState, playerID uint) (bool, *uint, error) {
	gameState.GameData["consecutive_passes"] = wordsmithIntField(gameState.GameData, "consecutive_passes") + 1
	syncWordsmithPublicState(gameState)

	if wordsmithIntField(gameState.GameData, "consecutive_passes") >= len(gameState.Players)*2 {
		return true, wordsmithSettleByScore(gameState), nil
	}
	if decided, winnerID := wordsmithCheckMathematicallyDecided(gameState); decided {
		return true, winnerID, nil
	}
	return false, nil, nil
}

func wordsmithIntField(gameData map[string]interface{}, key string) int {
	switch v := gameData[key].(type) {
	case int:
		return v
	case float64:
		return int(v)
	default:
		return 0
	}
}

func wordsmithRackValue(rack []string) int {
	total := 0
	for _, t := range rack {
		if t == "?" {
			continue // blanks are worth 0
		}
		if len(t) == 1 {
			total += wordsmithTileValues[t[0]]
		}
	}
	return total
}

// wordsmithSettleEmptyRack applies the standard end-of-game adjustment when
// emptyPlayerID has just used their very last tile with nothing left to draw:
// every other player is docked their own remaining rack value, and
// emptyPlayerID is credited the sum of all those docked values. Returns the
// winner (highest final score), or nil if tied.
func wordsmithSettleEmptyRack(gameState *GameSessionState, emptyPlayerID uint) *uint {
	scores := wordsmithScores(gameState)
	bonus := 0
	for _, p := range gameState.Players {
		if p.UserID == emptyPlayerID {
			continue
		}
		key := fmt.Sprintf("%d", p.UserID)
		rackVal := wordsmithRackValue(gameState.Hands[p.UserID])
		bonus += rackVal
		prev := wordsmithFloatField(scores, key)
		scores[key] = prev - float64(rackVal)
	}
	emptyKey := fmt.Sprintf("%d", emptyPlayerID)
	scores[emptyKey] = wordsmithFloatField(scores, emptyKey) + float64(bonus)
	gameState.GameData["scores"] = scores
	return wordsmithTopScorer(gameState, scores)
}

// wordsmithSettleByScore ends the game purely on current scores (the
// consecutive-passes end condition) — no rack-value adjustment, since nobody
// emptied their rack.
func wordsmithSettleByScore(gameState *GameSessionState) *uint {
	scores := wordsmithScores(gameState)
	return wordsmithTopScorer(gameState, scores)
}

// wordsmithMaxTilePremium is the highest multiplier any single tile could
// ever receive in one word: landing on both a triple-letter (x3) square and
// contributing to a word that also passes through a triple-word (x3) square
// = x9. Deliberately generous/an upper bound, not a realistic estimate — a
// real placement essentially never hits this, but this function's whole job
// is to prove "even in the best conceivable case, this player cannot win",
// so understating the ceiling would risk wrongly ending a game a trailing
// player could still have won. Overstating it only ever costs a few extra
// turns of normal play before the (still-inevitable) real ending — a safe
// failure direction, unlike the reverse.
const wordsmithMaxTilePremium = 9

// wordsmithMaxPossibleGain upper-bounds how many additional points a player
// could still conceivably score using nothing but the tiles already in their
// rack (valid to call once the bag is empty — see
// wordsmithCheckMathematicallyDecided for why that precondition matters).
// Every tile is scored at its face value times the maximum possible premium,
// plus the bingo bonus for playing the whole rack in one move — the most
// generous single-turn outcome physically expressible by the scoring rules,
// which is also a valid upper bound on any sequence of multiple smaller
// turns using the same fixed set of tiles (splitting a play across turns can
// only ever waste potential compounding, never create more of it).
func wordsmithMaxPossibleGain(rack []string) int {
	total := 0
	for _, t := range rack {
		if t == "?" {
			continue // blanks always score 0, no matter the premium
		}
		if len(t) == 1 {
			total += wordsmithTileValues[t[0]] * wordsmithMaxTilePremium
		}
	}
	if len(rack) > 0 {
		total += wordsmithBingoBonus
	}
	return total
}

// wordsmithCheckMathematicallyDecided reports whether the game's outcome is
// already provably locked in, and if so, who the (sole, unambiguous) winner
// is — letting the game end before the normal empty-rack/stalling
// conditions are reached, rather than always playing out every remaining
// turn once nothing meaningful can still change.
//
// Only sound once the tile bag is empty: from that point on nobody can ever
// draw again, so each player's entire remaining scoring potential for the
// rest of the game is bounded by exactly the (small, fully known) set of
// tiles already in their own rack — see wordsmithMaxPossibleGain. Before the
// bag empties, any player's rack could still be refreshed with anything, so
// no meaningful bound exists and this deliberately does not run.
//
// Fires only for a single, clear-cut leader: every other player's current
// score plus their own generous best-case ceiling must still fall short of
// the leader's current score. If two or more players are within reach of
// each other (or of the presumptive leader), the game simply continues to
// its normal end condition — a false "not yet decided" costs a few extra
// turns of ordinary play; a false "decided" would incorrectly end a game
// someone could still have won, which this is built to never risk.
func wordsmithCheckMathematicallyDecided(gameState *GameSessionState) (bool, *uint) {
	if len(gameState.DrawPile) > 0 {
		return false, nil
	}
	if len(gameState.Players) < 2 {
		return false, nil
	}

	scores := wordsmithScores(gameState)
	leaderID := gameState.Players[0].UserID
	leaderScore := wordsmithFloatField(scores, fmt.Sprintf("%d", leaderID))
	for _, p := range gameState.Players[1:] {
		s := wordsmithFloatField(scores, fmt.Sprintf("%d", p.UserID))
		if s > leaderScore {
			leaderID, leaderScore = p.UserID, s
		}
	}

	for _, p := range gameState.Players {
		if p.UserID == leaderID {
			continue
		}
		key := fmt.Sprintf("%d", p.UserID)
		ceiling := wordsmithFloatField(scores, key) + float64(wordsmithMaxPossibleGain(gameState.Hands[p.UserID]))
		if ceiling >= leaderScore {
			// This player could still (in the most generous possible case)
			// catch or tie the presumptive leader — not decided yet.
			return false, nil
		}
	}

	id := leaderID
	return true, &id
}

func wordsmithFloatField(m map[string]interface{}, key string) float64 {
	switch v := m[key].(type) {
	case float64:
		return v
	case int:
		return float64(v)
	default:
		return 0
	}
}

func wordsmithTopScorer(gameState *GameSessionState, scores map[string]interface{}) *uint {
	var bestID *uint
	best := -1.0
	tie := false
	for _, p := range gameState.Players {
		key := fmt.Sprintf("%d", p.UserID)
		v := wordsmithFloatField(scores, key)
		if v > best {
			best = v
			id := p.UserID
			bestID = &id
			tie = false
		} else if v == best {
			tie = true
		}
	}
	if tie {
		return nil
	}
	return bestID
}

// wordsmithRandLetterForBlank is unused by move processing (the client always
// supplies the letter) but kept as a small helper for tests / future bot play.
func wordsmithRandLetterForBlank() byte {
	return byte('A' + rand.Intn(26))
}
