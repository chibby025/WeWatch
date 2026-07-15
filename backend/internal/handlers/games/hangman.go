package games

import (
	"fmt"
	"math/rand"
	"strings"

	"wewatch-backend/internal/models"
)

var hangmanWordList = []string{
	"ELEPHANT", "GUITAR", "PYRAMID", "THUNDER", "CAPTAIN", "DOLPHIN",
	"LANTERN", "PENGUIN", "CACTUS", "VOLCANO", "TREASURE", "COMPASS",
	"BLANKET", "CRICKET", "FURNACE", "GLACIER", "HAMMOCK", "JOURNEY",
	"KITCHEN", "LOBSTER", "MINERAL", "OCTOPUS", "PAINTER", "SOLDIER",
	"TOASTER", "VILLAGE", "CABINET", "DIAMOND", "FASHION", "GLASSES",
	"HOLIDAY", "JANUARY", "LIBRARY", "MORNING", "NOTHING", "OPENING",
	"PLAYING", "QUICKLY", "READING", "SHADOWS", "TALKING", "ACADEMY",
	"BUFFALO", "CLIMATE", "DEFENSE", "EMPEROR", "FACTORY", "HARVEST",
	"JUSTICE", "MYSTERY", "NATURAL", "OPINION", "PATIENT", "QUARTER",
	"REALIZE", "SUCCESS", "TEACHER", "UNHAPPY", "VINTAGE", "BALANCE",
	"CHAMPION", "DINOSAUR", "ENVELOPE", "FESTIVAL", "GRATEFUL", "HOSPITAL",
	"INNOCENT", "JEALOUSY", "KEYBOARD", "LANGUAGE", "MAGAZINE", "NAVIGATE",
	"OBSTACLE", "PARADISE", "QUESTION", "ROMANTIC", "SANDWICH", "TOGETHER",
	"UMBRELLA", "VALUABLE", "WEAKNESS", "ABSOLUTE", "BIRTHDAY", "CALENDAR",
	"DAUGHTER", "ELEVATOR", "FOOTBALL", "GORGEOUS", "HOMEWORK", "INTERNET",
	"JUDGMENT", "KINDNESS", "LAUGHTER", "MARRIAGE", "NOTEBOOK", "OVERFLOW",
}

func hangmanInitialState(players []models.Player) map[string]interface{} {
	word := hangmanWordList[rand.Intn(len(hangmanWordList))]
	display := make([]string, len(word))
	for i := range display {
		display[i] = "_"
	}
	scores := map[string]interface{}{}
	for _, p := range players {
		scores[fmt.Sprintf("%d", p.UserID)] = 0
	}
	return map[string]interface{}{
		"word":             word,
		"display":          display,
		"guessed":          []string{},
		"wrong_letters":    []string{},
		"wrong_count":      0,
		"max_wrong":        6,
		"phase":            "guessing",
		"scores":           scores,
		"last_guesser":     nil,
		"word_length":      len(word),
		"hints_remaining":  3,
	}
}

// hangmanPublicState strips the word during active play.
func hangmanPublicState(data map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(data))
	for k, v := range data {
		out[k] = v
	}
	phase, _ := data["phase"].(string)
	if phase == "guessing" {
		delete(out, "word")
	}
	return out
}

// hangmanInitialStatePC creates the initial state for initializeGameState.
// Scores are empty (player IDs unknown here); ensureHangmanState fills them on first move.
func hangmanInitialStatePC(_ int) map[string]interface{} {
	word := hangmanWordList[rand.Intn(len(hangmanWordList))]
	display := make([]string, len(word))
	for i := range display {
		display[i] = "_"
	}
	return map[string]interface{}{
		"word":            word,
		"display":         display,
		"guessed":         []string{},
		"wrong_letters":   []string{},
		"wrong_count":     0,
		"max_wrong":       6,
		"phase":           "guessing",
		"scores":          map[string]interface{}{},
		"last_guesser":    nil,
		"word_length":     len(word),
		"hints_remaining": 3,
	}
}

func ensureHangmanState(gameState *GameSessionState) {
	if gameState.GameData["phase"] == nil {
		// Reuse the word pre-seeded by initializeGameState so display/word_length
		// match what was broadcast at game_started.
		if gameState.GameSession != nil {
			if word, ok := gameState.GameSession.GameState["word"].(string); ok && word != "" {
				for k, v := range gameState.GameSession.GameState {
					gameState.GameData[k] = v
				}
				scores := hangmanScoreMap(gameState.GameData)
				for _, p := range gameState.Players {
					key := fmt.Sprintf("%d", p.UserID)
					if _, exists := scores[key]; !exists {
						scores[key] = 0
					}
				}
				gameState.GameData["scores"] = scores
				return
			}
		}
		// Fallback: pick a fresh word (only if GameSession state was never seeded)
		for k, v := range hangmanInitialState(gameState.Players) {
			gameState.GameData[k] = v
		}
	}
}

func (gm *GameManager) processHangmanMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	ensureHangmanState(gameState)

	phase, _ := gameState.GameData["phase"].(string)
	if phase != "guessing" {
		return false, nil, fmt.Errorf("game is not in guessing phase")
	}

	if moveType, _ := moveData["move_type"].(string); moveType == "hint" {
		return gm.processHangmanHint(gameState, playerID)
	}

	letterRaw, _ := moveData["letter"].(string)
	letter := strings.ToUpper(strings.TrimSpace(letterRaw))
	if len(letter) != 1 || letter[0] < 'A' || letter[0] > 'Z' {
		return false, nil, fmt.Errorf("invalid letter: must be A-Z")
	}

	// Check already guessed
	guessed := hangmanStringSlice(gameState.GameData["guessed"])
	for _, g := range guessed {
		if g == letter {
			return false, nil, fmt.Errorf("letter %s already guessed", letter)
		}
	}

	word, _ := gameState.GameData["word"].(string)
	display := hangmanDisplaySlice(gameState.GameData["display"])

	guessed = append(guessed, letter)
	gameState.GameData["guessed"] = guessed
	gameState.GameData["last_guesser"] = fmt.Sprintf("%d", playerID)

	found := false
	revealCount := 0
	for i, ch := range word {
		if string(ch) == letter {
			display[i] = letter
			found = true
			revealCount++
		}
	}
	gameState.GameData["display"] = display

	if found {
		playerKey := fmt.Sprintf("%d", playerID)
		scores := hangmanScoreMap(gameState.GameData)
		scores[playerKey] = hangmanIntFrom(scores[playerKey]) + revealCount
		gameState.GameData["scores"] = scores

		// Check win
		allRevealed := true
		for _, d := range display {
			if d == "_" {
				allRevealed = false
				break
			}
		}
		if allRevealed {
			gameState.GameData["phase"] = "won"
			winner := hangmanTopScorer(scores, gameState.Players)
			// cancel auto-advance (simultaneous game, turn doesn't matter)
			gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
			return true, winner, nil
		}
	} else {
		wrongLetters := hangmanStringSlice(gameState.GameData["wrong_letters"])
		wrongLetters = append(wrongLetters, letter)
		gameState.GameData["wrong_letters"] = wrongLetters
		wrongCount := hangmanIntFrom(gameState.GameData["wrong_count"]) + 1
		gameState.GameData["wrong_count"] = wrongCount

		if wrongCount >= hangmanIntFrom(gameState.GameData["max_wrong"]) {
			gameState.GameData["phase"] = "lost"
			gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
			return true, nil, nil
		}
	}

	// Simultaneous game — cancel turn advance so any player can guess next
	gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
	return false, nil, nil
}

func (gm *GameManager) processHangmanHint(gameState *GameSessionState, playerID uint) (bool, *uint, error) {
	var hintsRemaining int
	if hr := gameState.GameData["hints_remaining"]; hr != nil {
		hintsRemaining = hangmanIntFrom(hr)
	} else {
		hintsRemaining = 3 // default matching frontend ?? 3 fallback
	}
	if hintsRemaining <= 0 {
		return false, nil, fmt.Errorf("no hints remaining")
	}

	word, _ := gameState.GameData["word"].(string)
	display := hangmanDisplaySlice(gameState.GameData["display"])
	guessed := hangmanStringSlice(gameState.GameData["guessed"])

	// Collect distinct letters still hidden in the word.
	seen := map[string]bool{}
	unrevealed := []string{}
	for i, ch := range word {
		letter := string(ch)
		if display[i] == "_" && !seen[letter] {
			unrevealed = append(unrevealed, letter)
			seen[letter] = true
		}
	}
	if len(unrevealed) == 0 {
		return false, nil, fmt.Errorf("no letters left to reveal")
	}

	// Pick a random unrevealed letter and reveal all its positions.
	hintLetter := unrevealed[rand.Intn(len(unrevealed))]
	for i, ch := range word {
		if string(ch) == hintLetter {
			display[i] = hintLetter
		}
	}
	gameState.GameData["display"] = display

	// Mark as guessed so the keyboard key turns green.
	guessed = append(guessed, hintLetter)
	gameState.GameData["guessed"] = guessed
	gameState.GameData["hints_remaining"] = hintsRemaining - 1
	gameState.GameData["last_guesser"] = fmt.Sprintf("%d", playerID)

	// Cancel turn advance (simultaneous game).
	n := len(gameState.Players)
	gameState.CurrentTurn = (gameState.CurrentTurn - 1 + n) % n

	// Check win — all blanks filled.
	for _, d := range display {
		if d == "_" {
			return false, nil, nil
		}
	}
	gameState.GameData["phase"] = "won"
	scores := hangmanScoreMap(gameState.GameData)
	winner := hangmanTopScorer(scores, gameState.Players)
	return true, winner, nil
}

// --- helpers ---

func hangmanStringSlice(raw interface{}) []string {
	if raw == nil {
		return []string{}
	}
	if s, ok := raw.([]string); ok {
		return s
	}
	if s, ok := raw.([]interface{}); ok {
		out := make([]string, 0, len(s))
		for _, v := range s {
			if str, ok := v.(string); ok {
				out = append(out, str)
			}
		}
		return out
	}
	return []string{}
}

func hangmanDisplaySlice(raw interface{}) []string {
	return hangmanStringSlice(raw)
}

func hangmanIntFrom(raw interface{}) int {
	switch v := raw.(type) {
	case int:
		return v
	case float64:
		return int(v)
	}
	return 0
}

func hangmanScoreMap(data map[string]interface{}) map[string]interface{} {
	if raw, ok := data["scores"]; ok {
		if m, ok := raw.(map[string]interface{}); ok {
			return m
		}
	}
	return map[string]interface{}{}
}

func hangmanTopScorer(scores map[string]interface{}, players []models.Player) *uint {
	var best int
	var winnerId *uint
	for _, p := range players {
		key := fmt.Sprintf("%d", p.UserID)
		score := hangmanIntFrom(scores[key])
		if score > best {
			best = score
			uid := p.UserID
			winnerId = &uid
		}
	}
	return winnerId
}
