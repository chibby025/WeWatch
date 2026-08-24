package games

import (
	"fmt"
	"math/rand"
	"strings"
)

// Competitive Wordle: all players get the same secret 5-letter word simultaneously.
// Each player submits guesses independently — the server validates and returns
// colour-coded feedback (G=green/correct, Y=yellow/wrong-position, X=grey/absent).
// Win condition: first to guess correctly. After maxGuesses failed attempts a player
// is eliminated (no win, but doesn't block others). Game ends when one player wins
// or all players have exhausted their guesses.
//
// All per-player guess histories are public (great for spectators and friendly trash-talk).
// move_type: "guess" with { word: "CRANE" }

const wordleMaxGuesses = 6

// Common 5-letter words used as the secret word pool.
// A real deployment would load from a file; this embedded list is enough for
// an initial version without adding an asset-loading dependency.
//
// Cleaned + expanded 2026-08-24: the original ~240-entry list had 3 literal
// duplicates ("LAGER"/"HARES"/"ULTRA" each appeared twice) and 4 entries that
// weren't even 5 letters ("HASP", "MADE", "IRONIC", "VOODOO") — all silently
// wasted slots, since wordlePickWord already filters to len==5 before
// picking. Deduplicated down to 233 genuinely valid words, then appended 474
// more common, everyday 5-letter words (checked against the cleaned list for
// dupes) — 707 total, a real ~3x growth in the secret-word pool.
var wordleWordList = []string{
	"ABODE", "ABOVE", "ADOBE", "AFTER", "ALERT", "ALPHA", "ALTER", "ANTIC",
	"ARISE", "AROSE", "ATTIC", "AUDIO", "AXIOM", "BALES", "BASLE", "BELOW",
	"BLADE", "BLASE", "BLAST", "BLAZE", "BLEAT", "BLOWN", "BOXER", "BRAVE",
	"BREED", "BROWN", "CABLE", "CALMS", "CAPED", "CAPES", "CHASE", "CHOIR",
	"CHOSE", "CIVIC", "CLADS", "CLAMP", "CLAMS", "CLAPS", "CLASP", "CLONE",
	"COMIC", "CRAMP", "CRAMS", "CRANE", "CRATE", "CRAZE", "CREED", "CREEP",
	"CROWN", "CUBIC", "DANCE", "DECAL", "DELTA", "DONOR", "DRONE", "DROWN",
	"EARLS", "ELBOW", "EPOCH", "EXTRA", "FAVOR", "FIXED", "FIXER", "FLAKE",
	"FLAME", "FLARE", "FLEET", "FREED", "FROWN", "GLARE", "GLAZE", "GLOBE",
	"GRADE", "GRAZE", "GREED", "GREET", "GROAN", "GROWN", "HARES", "HARPS",
	"HAVOC", "HONOR", "HUMOR", "HYDRA", "IGLOO", "INDEX", "INFER", "IONIC",
	"IRATE", "IVORY", "LABEL", "LABOR", "LACED", "LAGER", "LANCE", "LAPSE",
	"LARES", "LARGE", "LASER", "LATER", "LEAPS", "LEAPT", "LEAST", "LYRIC",
	"MAGIC", "MAJOR", "MALTS", "MANIC", "MANOR", "MARSH", "MAYOR", "MIMIC",
	"MINOR", "MIXED", "MIXER", "MIXES", "MOCHA", "MOTOR", "NOBLE", "OATER",
	"OMEGA", "OPTIC", "OUTER", "OVERT", "OXIDE", "OZONE", "PACED", "PALES",
	"PANEL", "PANIC", "PATHS", "PEACE", "PEALS", "PENAL", "PHASE", "PHONE",
	"PIXEL", "PIZZA", "PLACE", "PLANE", "PLANT", "PLATE", "PLAZA", "PLEAS",
	"PLEAT", "PLUMS", "PRIOR", "PROBE", "PRONE", "QUOTA", "RAISE", "RALES",
	"RATED", "REALS", "REGAL", "ROBES", "ROBOT", "RUMPS", "SABLE", "SANER",
	"SCALP", "SCAPE", "SEPAL", "SHADE", "SHALE", "SHAME", "SHARE", "SHARP",
	"SHAWL", "SHEAR", "SHEET", "SHONE", "SHRED", "SIGMA", "SIXTY", "SKEET",
	"SLANT", "SLATE", "SLEEP", "SLEET", "SLUMP", "SNARE", "SONIC", "SPACE",
	"STALE", "STAMP", "STARE", "STEEP", "STONE", "STUMP", "SWEEP", "SWEET",
	"TABLE", "TABOO", "TALES", "TAMPS", "TARES", "TAXED", "TEALS", "TEARS",
	"TENOR", "THERE", "THOSE", "THREE", "THROE", "THROW", "TIARA", "TONIC",
	"TOXIC", "TRACE", "TRADE", "TRAMP", "TREED", "TRUMP", "TUMOR", "TUNIC",
	"TUTOR", "TWEET", "ULTRA", "UNZIP", "UPEND", "UPSET", "UREAL", "USHER",
	"VALOR", "VAPOR", "VIGOR", "VIXEN", "VOTER", "WHALE", "WHALS", "WHERE",
	"ZEBRA",
	"ABOUT", "ABUSE", "ACTOR", "ADAPT", "ADMIT", "ADOPT", "ADULT", "AGENT",
	"AGREE", "AHEAD", "ALARM", "ALBUM", "ALIEN", "ALIGN", "ALIKE", "ALIVE",
	"ALLOW", "ALONE", "ALONG", "AMBER", "AMONG", "AMPLE", "ANGER", "ANGLE",
	"ANGRY", "ANKLE", "APART", "APPLE", "APPLY", "ARENA", "ARGUE", "ARROW",
	"ASIDE", "ASSET", "AUDIT", "AVOID", "AWAIT", "AWAKE", "AWARD", "AWARE",
	"BADLY", "BAKER", "BASIC", "BASIS", "BATCH", "BEACH", "BEGAN", "BEGIN",
	"BEING", "BENCH", "BILLY", "BIRTH", "BLACK", "BLAME", "BLANK", "BLIND",
	"BLOCK", "BLOOD", "BOARD", "BOAST", "BONUS", "BOOST", "BOOTH", "BOUND",
	"BRAIN", "BRAND", "BREAD", "BREAK", "BRICK", "BRIEF", "BRING", "BROAD",
	"BROKE", "BUILD", "BUILT", "BUNCH", "BURST", "CABIN", "CANDY", "CARGO",
	"CARRY", "CATCH", "CAUSE", "CHAIN", "CHAIR", "CHALK", "CHAOS", "CHARM",
	"CHART", "CHEAP", "CHECK", "CHEER", "CHESS", "CHEST", "CHIEF", "CHILD",
	"CHUNK", "CIVIL", "CLAIM", "CLASS", "CLEAN", "CLEAR", "CLICK", "CLIFF",
	"CLIMB", "CLOCK", "CLOSE", "CLOTH", "CLOUD", "COACH", "COAST", "COLOR",
	"COUCH", "COULD", "COUNT", "COURT", "COVER", "CRACK", "CRAFT", "CRASH",
	"CRAWL", "CREAM", "CROSS", "CROWD", "CRUEL", "CRUSH", "CURVE", "CYCLE",
	"DAILY", "DEATH", "DEBUT", "DELAY", "DEPTH", "DIARY", "DIRTY", "DOUBT",
	"DOZEN", "DRAFT", "DRAMA", "DRANK", "DREAM", "DRESS", "DRIFT", "DRILL",
	"DRINK", "DRIVE", "DROVE", "EAGER", "EARLY", "EARTH", "EIGHT", "ELDER",
	"ELECT", "EMPTY", "ENEMY", "ENJOY", "ENTER", "ENTRY", "EQUAL", "ERROR",
	"EVENT", "EVERY", "EXACT", "EXIST", "FAITH", "FALSE", "FAULT", "FIBER",
	"FIELD", "FIFTH", "FIFTY", "FIGHT", "FINAL", "FIRST", "FLASH", "FLESH",
	"FLOAT", "FLOOD", "FLOOR", "FLUID", "FOCUS", "FORCE", "FORTH", "FORTY",
	"FORUM", "FOUND", "FRAME", "FRANK", "FRAUD", "FRESH", "FRONT", "FROST",
	"FRUIT", "FUNNY", "GHOST", "GIANT", "GLASS", "GLORY", "GOING", "GRACE",
	"GRAND", "GRANT", "GRASS", "GREAT", "GREEN", "GRIEF", "GROSS", "GROUP",
	"GUARD", "GUESS", "GUEST", "GUIDE", "HAPPY", "HARSH", "HEART", "HEAVY",
	"HENCE", "HORSE", "HOTEL", "HOUSE", "HUMAN", "IDEAL", "IMAGE", "IMPLY",
	"INNER", "INPUT", "ISSUE", "JOINT", "JUDGE", "JUICE", "KNIFE", "KNOWN",
	"LAUGH", "LAYER", "LEARN", "LEASE", "LEAVE", "LEGAL", "LEVEL", "LIGHT",
	"LIMIT", "LOCAL", "LOGIC", "LOOSE", "LOWER", "LOYAL", "LUCKY", "LUNCH",
	"LYING", "MAKER", "MARCH", "MATCH", "MEDAL", "MEDIA", "METAL", "MIGHT",
	"MINUS", "MODEL", "MONEY", "MONTH", "MORAL", "MOUNT", "MOUSE", "MOUTH",
	"MOVIE", "MUSIC", "NAKED", "NEEDY", "NERVE", "NEVER", "NIGHT", "NOISE",
	"NORTH", "NOVEL", "NURSE", "OCCUR", "OCEAN", "OFFER", "OFTEN", "ORDER",
	"OTHER", "OUGHT", "PAINT", "PAPER", "PARTY", "PATCH", "PAUSE", "PIANO",
	"PIECE", "PILOT", "PITCH", "PLAIN", "POINT", "POUND", "POWER", "PRESS",
	"PRICE", "PRIDE", "PRIME", "PRINT", "PRIZE", "PROOF", "PROUD", "PROVE",
	"QUEEN", "QUICK", "QUIET", "QUITE", "QUOTE", "RADAR", "RADIO", "RANGE",
	"RAPID", "RATIO", "REACH", "READY", "REALM", "REBEL", "REFER", "RELAX",
	"REPLY", "RIGHT", "RIVAL", "RIVER", "ROUGH", "ROUND", "ROUTE", "ROYAL",
	"RURAL", "SALAD", "SAUCE", "SCALE", "SCENE", "SCOPE", "SCORE", "SENSE",
	"SERVE", "SEVEN", "SHALL", "SHAPE", "SHEEP", "SHELF", "SHELL", "SHIFT",
	"SHINE", "SHIRT", "SHOCK", "SHOOT", "SHORE", "SHORT", "SHOUT", "SIGHT",
	"SIGNS", "SILLY", "SINCE", "SIXTH", "SKILL", "SLIDE", "SMALL", "SMART",
	"SMILE", "SMOKE", "SNAKE", "SOLID", "SOLVE", "SOUND", "SOUTH", "SPARE",
	"SPEAK", "SPEED", "SPEND", "SPENT", "SPLIT", "SPOKE", "SPORT", "STAFF",
	"STAGE", "STAND", "START", "STATE", "STEAM", "STEEL", "STICK", "STIFF",
	"STILL", "STOCK", "STORE", "STORM", "STORY", "STRIP", "STUCK", "STUDY",
	"STYLE", "SUGAR", "SUPER", "SWEAR", "SWIFT", "SWING", "SWORD", "TASTE",
	"TEACH", "THANK", "THEFT", "THEME", "THICK", "THING", "THINK", "THIRD",
	"TIGER", "TIGHT", "TIRED", "TITLE", "TODAY", "TOOTH", "TOPIC", "TOTAL",
	"TOUCH", "TOUGH", "TOWER", "TRACK", "TRAIN", "TREAT", "TREND", "TRIAL",
	"TRIBE", "TRICK", "TRIED", "TRIES", "TRUCK", "TRULY", "TRUNK", "TRUST",
	"TRUTH", "TWICE", "UNCLE", "UNDER", "UNION", "UNITY", "UNTIL", "UPPER",
	"URBAN", "USAGE", "USUAL", "VALID", "VALUE", "VIDEO", "VIRUS", "VISIT",
	"VITAL", "VOICE", "WASTE", "WATCH", "WATER", "WHEEL", "WHICH", "WHILE",
	"WHITE", "WHOLE", "WHOSE", "WOMAN", "WOMEN", "WORLD", "WORRY", "WORSE",
	"WORST", "WORTH", "WOULD", "WOUND", "WRITE", "WRONG", "WROTE", "YIELD",
	"YOUNG", "YOUTH",
}

func wordlePickWord() string {
	// Filter to clean 5-letter ASCII words in case of any encoding issues above.
	var clean []string
	for _, w := range wordleWordList {
		if len(w) == 5 && isAlpha(w) {
			clean = append(clean, w)
		}
	}
	if len(clean) == 0 {
		return "CRANE"
	}
	return clean[rand.Intn(len(clean))]
}

func isAlpha(s string) bool {
	for _, r := range s {
		if r < 'A' || r > 'Z' {
			return false
		}
	}
	return true
}

func wordleInitialState() map[string]interface{} {
	word := wordlePickWord()
	return map[string]interface{}{
		"secret":     word,
		"guesses":    map[string]interface{}{}, // playerID → []string guesses
		"results":    map[string]interface{}{}, // playerID → []string feedback sequences
		"eliminated": []interface{}{},
		"winner_id":  nil,
		"phase":      "playing",
		"hints":      map[string]interface{}{}, // playerID → { position, letter }
		"used_hints": map[string]interface{}{}, // playerID → bool
	}
}

func (gm *GameManager) processWordleMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	ensureWordleState(gameState)

	// move_type is at the top level of moveData (same dict as the WS message)
	if mt, _ := moveData["move_type"].(string); mt == "hint" {
		return gm.processWordleHint(gameState, playerID)
	}

	phase, _ := gameState.GameData["phase"].(string)
	if phase != "playing" {
		return false, nil, fmt.Errorf("game is not in playing phase")
	}

	word, _ := moveData["word"].(string)
	word = strings.ToUpper(strings.TrimSpace(word))
	if len(word) != 5 {
		return false, nil, fmt.Errorf("guess must be exactly 5 letters")
	}
	if !isAlpha(word) {
		return false, nil, fmt.Errorf("guess must only contain letters")
	}

	playerKey := fmt.Sprintf("%d", playerID)
	secret, _ := gameState.GameData["secret"].(string)

	// Check the player hasn't been eliminated already.
	eliminated := wordleEliminated(gameState)
	for _, id := range eliminated {
		if id == playerKey {
			return false, nil, fmt.Errorf("you have been eliminated")
		}
	}

	guesses := wordlePlayerGuesses(gameState, playerKey)
	if len(guesses) >= wordleMaxGuesses {
		return false, nil, fmt.Errorf("no guesses remaining")
	}

	// Score the guess.
	feedback := scoreWordleGuess(secret, word)

	guesses = append(guesses, word)
	results := wordlePlayerResults(gameState, playerKey)
	results = append(results, feedback)

	// Write back.
	allGuesses := wordleAllGuesses(gameState)
	allGuesses[playerKey] = guesses
	gameState.GameData["guesses"] = allGuesses

	allResults := wordleAllResults(gameState)
	allResults[playerKey] = results
	gameState.GameData["results"] = allResults

	// Cancel automatic turn advance — all players guess independently.
	gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)

	// Win: correct guess.
	if word == secret {
		uid := playerID
		gameState.GameData["winner_id"] = fmt.Sprintf("%d", uid)
		gameState.GameData["phase"] = "ended"
		return true, &uid, nil
	}

	// Eliminate if out of guesses.
	if len(guesses) >= wordleMaxGuesses {
		eliminated = append(eliminated, playerKey)
		gameState.GameData["eliminated"] = eliminated
	}

	// All eliminated → game over, no winner.
	if len(eliminated) >= len(gameState.Players) {
		gameState.GameData["phase"] = "ended"
		return true, nil, nil
	}

	return false, nil, nil
}

// scoreWordleGuess returns a 5-char string: G (green), Y (yellow), X (grey).
func scoreWordleGuess(secret, guess string) string {
	result := [5]byte{'X', 'X', 'X', 'X', 'X'}
	secretCount := [26]int{}

	// First pass: mark greens and count remaining secret letters.
	for i := 0; i < 5; i++ {
		if guess[i] == secret[i] {
			result[i] = 'G'
		} else {
			secretCount[secret[i]-'A']++
		}
	}
	// Second pass: mark yellows.
	for i := 0; i < 5; i++ {
		if result[i] == 'G' {
			continue
		}
		idx := guess[i] - 'A'
		if secretCount[idx] > 0 {
			result[i] = 'Y'
			secretCount[idx]--
		}
	}
	return string(result[:])
}

func ensureWordleState(gameState *GameSessionState) {
	if gameState.GameData["secret"] == nil {
		for k, v := range wordleInitialState() {
			gameState.GameData[k] = v
		}
	}
}

func wordleEliminated(gameState *GameSessionState) []string {
	raw := gameState.GameData["eliminated"]
	if raw == nil {
		return nil
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
	return nil
}

func wordleAllGuesses(gameState *GameSessionState) map[string]interface{} {
	raw := gameState.GameData["guesses"]
	if m, ok := raw.(map[string]interface{}); ok {
		return m
	}
	return map[string]interface{}{}
}

func wordleAllResults(gameState *GameSessionState) map[string]interface{} {
	raw := gameState.GameData["results"]
	if m, ok := raw.(map[string]interface{}); ok {
		return m
	}
	return map[string]interface{}{}
}

func wordlePlayerGuesses(gameState *GameSessionState, playerKey string) []string {
	all := wordleAllGuesses(gameState)
	raw := all[playerKey]
	if raw == nil {
		return nil
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
	return nil
}

func (gm *GameManager) processWordleHint(gameState *GameSessionState, playerID uint) (bool, *uint, error) {
	phase, _ := gameState.GameData["phase"].(string)
	if phase != "playing" {
		return false, nil, fmt.Errorf("game is not in playing phase")
	}

	playerKey := fmt.Sprintf("%d", playerID)

	// One hint per player per game.
	if wordleUsedHints(gameState)[playerKey] {
		return false, nil, fmt.Errorf("hint already used")
	}

	// Check not eliminated.
	for _, id := range wordleEliminated(gameState) {
		if id == playerKey {
			return false, nil, fmt.Errorf("you have been eliminated")
		}
	}

	secret, _ := gameState.GameData["secret"].(string)
	results := wordlePlayerResults(gameState, playerKey)

	// Mark positions already correctly guessed (Green).
	var correctPos [5]bool
	for _, result := range results {
		for i := 0; i < 5 && i < len(result); i++ {
			if result[i] == 'G' {
				correctPos[i] = true
			}
		}
	}

	// Pick the first unrevealed position.
	hintPos := -1
	for i := 0; i < 5; i++ {
		if !correctPos[i] {
			hintPos = i
			break
		}
	}
	if hintPos == -1 {
		return false, nil, fmt.Errorf("no hint available — all positions already found")
	}

	// Persist hint and mark used.
	allHints := wordleAllHints(gameState)
	allHints[playerKey] = map[string]interface{}{
		"position": hintPos,
		"letter":   string(secret[hintPos]),
	}
	usedHints := wordleUsedHints(gameState)
	usedHints[playerKey] = true

	gameState.GameData["hints"] = allHints
	gameState.GameData["used_hints"] = usedHints

	// Undo automatic turn advance — hints don't consume a turn.
	gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)

	return false, nil, nil
}

func wordleAllHints(gameState *GameSessionState) map[string]interface{} {
	raw := gameState.GameData["hints"]
	if m, ok := raw.(map[string]interface{}); ok {
		return m
	}
	return map[string]interface{}{}
}

func wordleUsedHints(gameState *GameSessionState) map[string]bool {
	raw := gameState.GameData["used_hints"]
	if m, ok := raw.(map[string]bool); ok {
		return m
	}
	if m, ok := raw.(map[string]interface{}); ok {
		out := make(map[string]bool, len(m))
		for k, v := range m {
			if b, ok := v.(bool); ok {
				out[k] = b
			}
		}
		return out
	}
	return map[string]bool{}
}

func wordlePlayerResults(gameState *GameSessionState, playerKey string) []string {
	all := wordleAllResults(gameState)
	raw := all[playerKey]
	if raw == nil {
		return nil
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
	return nil
}
