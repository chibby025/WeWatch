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
var wordleWordList = []string{
	"CRANE", "SLATE", "AUDIO", "TRACE", "CRATE", "LEAST", "STARE", "ARISE",
	"RAISE", "AROSE", "SNARE", "TEARS", "RATED", "LATER", "ALTER", "ALERT",
	"RALES", "SANER", "EARLS", "LASER", "LARES", "REALS", "LAGER", "GLARE",
	"LARGE", "REGAL", "LAGER", "OATER", "IRATE", "UREAL", "TARES", "STALE",
	"TALES", "TEALS", "LEAPT", "PLEAT", "PLATE", "LEAPS", "PALES", "PEALS",
	"LAPSE", "PLEAS", "SEPAL", "PANEL", "PLANE", "PENAL", "PLANT", "SLANT",
	"BLAST", "BLEAT", "TABLE", "SABLE", "BALES", "BLASE", "BASLE", "LABEL",
	"CABLE", "PLACE", "PEACE", "SPACE", "PACED", "CAPED", "CAPES", "SCAPE",
	"DANCE", "LANCE", "LACED", "DECAL", "CLADS", "CLAPS", "CLASP", "SCALP",
	"CLAMS", "CALMS", "MALTS", "SLUMP", "PLUMS", "RUMPS", "TRUMP", "STUMP",
	"STAMP", "TAMPS", "TRAMP", "CRAMP", "CLAMP", "CRAMS", "MARSH", "SHARP",
	"HARPS", "HASP", "PATHS", "SHAWL", "WHALS", "WHALE", "SHALE", "SHEAR",
	"HARES", "HARES", "SHARE", "SHAME", "FLAME", "FLARE", "FLAKE", "BLADE",
	"GRADE", "TRADE", "SHADE", "MADE", "BRAVE", "CRAZE", "GRAZE", "GLAZE",
	"BLAZE", "PHASE", "CHASE", "CHOSE", "THOSE", "STONE", "PHONE", "SHONE",
	"CLONE", "DRONE", "PRONE", "OZONE", "GROAN", "GROWN", "BROWN", "CROWN",
	"DROWN", "FROWN", "THROW", "THROE", "THREE", "THERE", "WHERE", "SHRED",
	"BREED", "CREED", "GREED", "TREED", "FREED", "GREET", "FLEET", "SHEET",
	"SKEET", "SLEET", "SWEET", "TWEET", "CREEP", "STEEP", "SLEEP", "SWEEP",
	"PIXEL", "VIXEN", "BOXER", "MIXES", "MIXED", "MIXER", "SIXTY", "TAXED",
	"FIXED", "FIXER", "INDEX", "OXIDE", "AXIOM", "ELBOW", "BLOWN", "BELOW",
	"GLOBE", "NOBLE", "PROBE", "ROBES", "ROBOT", "ABODE", "ADOBE", "ABOVE",
	"CHOIR", "IVORY", "PRIOR", "VIGOR", "MINOR", "MANOR", "MAYOR", "MAJOR",
	"VAPOR", "FAVOR", "LABOR", "VALOR", "DONOR", "HONOR", "TENOR", "TUTOR",
	"HUMOR", "TUMOR", "MOTOR", "VOTER", "OUTER", "OVERT", "INFER", "AFTER",
	"ULTRA", "ULTRA", "ZEBRA", "EXTRA", "HYDRA", "LYRIC", "CUBIC", "OPTIC",
	"ANTIC", "ATTIC", "COMIC", "TOXIC", "SONIC", "TONIC", "IRONIC", "IONIC",
	"MAGIC", "PANIC", "MANIC", "TUNIC", "MIMIC", "CIVIC", "HAVOC", "EPOCH",
	"MOCHA", "SIGMA", "OMEGA", "DELTA", "ALPHA", "TIARA", "PLAZA", "PIZZA",
	"QUOTA", "TABOO", "VOODOO", "IGLOO", "UNZIP", "UPEND", "UPSET", "USHER",
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
		"secret":         word,
		"guesses":        map[string]interface{}{}, // playerID → []string guesses
		"results":        map[string]interface{}{}, // playerID → []string feedback sequences
		"eliminated":     []interface{}{},
		"winner_id":      nil,
		"phase":          "playing",
	}
}

func (gm *GameManager) processWordleMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	ensureWordleState(gameState)

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
