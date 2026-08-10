package games

import (
	"fmt"
	"math/rand"
	"regexp"
	"strings"
	"time"
)

// ── Token-based rebus pattern encoding ──────────────────────────────────────
// A puzzle's visual clue is a flat sequence of small, safe, JSON-serializable
// tokens (text + style flags) rather than raw HTML — the frontend renders
// each token as a plain styled <span>, no dangerouslySetInnerHTML anywhere.
// Genre and a handful of puzzle concepts (letter-by-letter size growth, the
// "get+get+get+get" math-style word combo) were inspired by the MIT-licensed
// github.com/Youngtechie/Rebus-Puzzles_webpage's {pattern, answer, hint} data
// shape, re-expressed through this project's own structured token scheme
// rather than copied verbatim — that project renders arbitrary raw HTML
// strings, which this codebase avoids by convention.
type RebusToken struct {
	Text   string  `json:"text"`
	Scale  float64 `json:"scale,omitempty"`  // font-size multiplier; 0 means "use default 1.0"
	Sup    bool    `json:"sup,omitempty"`    // superscript (raised)
	Sub    bool    `json:"sub,omitempty"`    // subscript (lowered)
	Strike bool    `json:"strike,omitempty"` // strikethrough — "cross this out"
	Mirror bool    `json:"mirror,omitempty"` // horizontally flipped text
	Flip   bool    `json:"flip,omitempty"`   // upside-down (180° rotated) text
	Color  string  `json:"color,omitempty"`  // optional highlight color (hex)
	Op     bool    `json:"op,omitempty"`     // render small & muted, as a connector symbol
	Break  bool    `json:"break,omitempty"`  // this token starts a new line
}

type RebusPuzzle struct {
	Pattern    []RebusToken
	Answer     string
	Alternates []string
	Hint       string
}

func rt(text string) RebusToken                     { return RebusToken{Text: text} }
func rtScale(text string, scale float64) RebusToken  { return RebusToken{Text: text, Scale: scale} }
func rtOp(sym string) RebusToken                     { return RebusToken{Text: sym, Op: true} }
func rtSup(text string) RebusToken                   { return RebusToken{Text: text, Sup: true} }
func rtSub(text string) RebusToken                   { return RebusToken{Text: text, Sub: true} }
func rtColor(text, color string) RebusToken          { return RebusToken{Text: text, Color: color} }
func rtBreak(text string) RebusToken                 { return RebusToken{Text: text, Break: true} }
func rtMirror(text string) RebusToken                { return RebusToken{Text: text, Mirror: true} }
func rtFlip(text string) RebusToken                  { return RebusToken{Text: text, Flip: true} }
func rtStrike(text string) RebusToken                { return RebusToken{Text: text, Strike: true} }

// rebusPuzzleBank — the full curated set. Order here is irrelevant; each game
// session draws a shuffled copy via rebusShuffledPuzzles().
var rebusPuzzleBank = []RebusPuzzle{
	{
		Pattern:    []RebusToken{rtScale("O", 0.6), rtScale("L", 1.1), rtScale("D", 1.7)},
		Answer:     "growing old",
		Alternates: []string{"grow old", "growing older"},
		Hint:       "Watch the letters get bigger…",
	},
	{
		Pattern: []RebusToken{
			rtScale("E", 0.55), rtScale("C", 0.72), rtScale("O", 0.9),
			rtScale("N", 1.08), rtScale("O", 1.28), rtScale("M", 1.5), rtScale("Y", 1.75),
		},
		Answer: "growing economy",
		Hint:   "One word getting steadily bigger — about money.",
	},
	{
		Pattern: []RebusToken{
			rtScale("V", 1.7), rtScale("I", 1.5), rtScale("O", 1.3),
			rtScale("L", 1.1), rtScale("E", 0.9), rtScale("T", 0.65),
		},
		Answer: "shrinking violet",
		Hint:   "It's an idiom for someone very shy.",
	},
	{
		Pattern: []RebusToken{rtScale("DEAL", 2.0)},
		Answer:  "big deal",
		Hint:    "The word itself is oversized.",
	},
	{
		Pattern: []RebusToken{rtScale("TALK", 0.5)},
		Answer:  "small talk",
		Hint:    "The word itself is tiny.",
	},
	{
		Pattern: []RebusToken{
			rtScale("P", 0.6), rtScale("A", 0.85), rtScale("I", 1.1),
			rtScale("N", 1.4), rtScale("S", 1.7),
		},
		Answer: "growing pains",
		Hint:   "The discomfort of getting bigger.",
	},
	{
		Pattern: []RebusToken{rt("get"), rtOp("+"), rt("get"), rtOp("+"), rt("get"), rtOp("+"), rt("get")},
		Answer:  "forget",
		Hint:    "Four of the same small word, added together.",
	},
	{
		Pattern: []RebusToken{rt("CAR"), rtOp("+"), rt("PET")},
		Answer:  "carpet",
	},
	{
		Pattern: []RebusToken{rt("SUN"), rtOp("+"), rt("FLOWER")},
		Answer:  "sunflower",
	},
	{
		Pattern: []RebusToken{rt("CAT"), rtOp("+"), rt("NAP")},
		Answer:  "catnap",
		Hint:    "A short sleep, named after a sneaky pet.",
	},
	{
		Pattern: []RebusToken{rt("SAND"), rtOp("+"), rt("CASTLE")},
		Answer:  "sandcastle",
	},
	{
		Pattern: []RebusToken{rt("MOON"), rtOp("+"), rt("LIGHT")},
		Answer:  "moonlight",
	},
	{
		Pattern: []RebusToken{rt("RAIN"), rtOp("+"), rt("BOW")},
		Answer:  "rainbow",
	},
	{
		Pattern: []RebusToken{rt("⭐"), rtOp("+"), rt("🐟")},
		Answer:  "starfish",
	},
	{
		Pattern: []RebusToken{rt("BOOK"), rtOp("+"), rt("🐛")},
		Answer:  "bookworm",
		Hint:    "Someone who loves reading + a small crawling critter.",
	},
	{
		Pattern: []RebusToken{rt("🔥"), rtOp("+"), rt("🪰")},
		Answer:  "firefly",
	},
	{
		Pattern:    []RebusToken{rt("CYCLE"), rt("CYCLE"), rt("CYCLE")},
		Answer:     "tricycle",
		Alternates: []string{"tri cycle"},
		Hint:       "Count how many times the word repeats.",
	},
	{
		Pattern: []RebusToken{rt("MIND"), rtBreak("MATTER")},
		Answer:  "mind over matter",
		Hint:    "One word is stacked directly above the other.",
	},
	{
		Pattern: []RebusToken{rt("ALL"), rtBreak("THE WORLD")},
		Answer:  "all over the world",
		Hint:    "One phrase is stacked directly above the other.",
	},
	{
		Pattern: []RebusToken{rt("MAN"), rtBreak("BOARD")},
		Answer:  "man overboard",
		Hint:    "A sailor's cry — one word stacked above the other.",
	},
	{
		Pattern: []RebusToken{rt("HEAD"), rtBreak("HEELS")},
		Answer:  "head over heels",
		Hint:    "Describes being madly in love — stacked words.",
	},
	{
		Pattern: []RebusToken{rtSub("TOWN")},
		Answer:  "downtown",
		Hint:    "The word is sitting low on the line.",
	},
	{
		Pattern: []RebusToken{rtSup("SECRET")},
		Answer:  "top secret",
		Hint:    "The word is sitting high on the line.",
	},
	{
		Pattern: []RebusToken{rtSub("POUR")},
		Answer:  "downpour",
		Hint:    "Heavy rain — the word is sitting low.",
	},
	{
		Pattern: []RebusToken{rt("STAND"), rtBreak("I")},
		Answer:  "understand",
		Hint:    "A single letter sits directly beneath a 5-letter word.",
	},
	{
		Pattern: []RebusToken{rtMirror("DRAW")},
		Answer:  "backward",
		Hint:    "Read the flipped word — what does it spell if you reverse it?",
	},
	{
		Pattern: []RebusToken{rt("UP SIDE"), rtFlip("DOWN")},
		Answer:  "upside down",
		Hint:    "The last part is literally flipped.",
	},
	{
		Pattern:    []RebusToken{rt("PAIR"), rtOp("+"), rt("O"), rtOp("+"), rt("DICE")},
		Answer:     "paradise",
		Hint:       "Say it out loud: pair… a… dice…",
	},
	{
		Pattern: []RebusToken{rtStrike("IN"), rt("LAW")},
		Answer:  "outlaw",
		Hint:    "A strikethrough means \"the opposite of\".",
	},
	{
		Pattern: []RebusToken{rt("EGG"), rtOp("+"), rt("SHELL")},
		Answer:  "eggshell",
	},
	{
		Pattern: []RebusToken{rtColor("ONCE", "#60a5fa"), rt(" IN A "), rtColor("MOON", "#60a5fa")},
		Answer:  "once in a blue moon",
		Hint:    "The color of two of the words is the clue.",
	},
}

// rebusNormalize strips case, punctuation, and extra whitespace so "Growing-Old!",
// "growing old", and "GROWING  OLD" all compare equal. Deliberately no fuzzy
// edit-distance beyond this — the Alternates list on each puzzle is the
// intended way to accept legitimate variant phrasings, so exact (normalized)
// matching stays predictable rather than risking an unintended near-miss
// being silently accepted.
var rebusNonAlnumRe = regexp.MustCompile(`[^a-z0-9 ]+`)
var rebusWhitespaceRe = regexp.MustCompile(`\s+`)

func rebusNormalize(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, "-", " ")
	s = rebusNonAlnumRe.ReplaceAllString(s, "")
	s = rebusWhitespaceRe.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

func rebusAnswerMatches(p RebusPuzzle, guess string) bool {
	g := rebusNormalize(guess)
	if g == "" {
		return false
	}
	if g == rebusNormalize(p.Answer) {
		return true
	}
	for _, alt := range p.Alternates {
		if g == rebusNormalize(alt) {
			return true
		}
	}
	return false
}

// rebusShuffledPuzzles returns a shuffled copy of the full bank — called once
// per game session at StartGame, so every player in a room sees the same
// fixed sequence for that session regardless of when they joined.
func rebusShuffledPuzzles() []RebusPuzzle {
	shuffled := make([]RebusPuzzle, len(rebusPuzzleBank))
	copy(shuffled, rebusPuzzleBank)
	rand.Shuffle(len(shuffled), func(i, j int) { shuffled[i], shuffled[j] = shuffled[j], shuffled[i] })
	return shuffled
}

func rebusScoreRank(rank int) float64 {
	switch rank {
	case 0:
		return 100
	case 1:
		return 75
	case 2:
		return 50
	default:
		return 25
	}
}

func (gm *GameManager) processRebusRoundMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	hostID := gameState.GameSession.HostID

	switch moveType {
	case "rebus_start":
		if playerID != hostID {
			return false, nil, fmt.Errorf("only the host can start a puzzle")
		}
		round, _ := gameState.GameData["round"].(float64)
		nextIdx := int(round) // round is "puzzles started so far"; next puzzle is at this index
		if nextIdx >= len(gameState.RebusPuzzles) {
			return false, nil, fmt.Errorf("no more puzzles — end the game to see results")
		}
		puzzle := gameState.RebusPuzzles[nextIdx]
		gameState.GameData["phase"] = "puzzle"
		gameState.GameData["round"] = float64(nextIdx + 1)
		gameState.GameData["current_pattern"] = puzzle.Pattern
		gameState.GameData["correct_order"] = []interface{}{}
		gameState.GameData["revealed_answer"] = ""
		gameState.GameData["revealed_alternates"] = []interface{}{}
		gameState.GameData["started_at"] = float64(time.Now().UnixMilli())
		return false, nil, nil

	case "answer":
		phase, _ := gameState.GameData["phase"].(string)
		if phase != "puzzle" {
			return false, nil, fmt.Errorf("no active puzzle to answer right now")
		}
		round, _ := gameState.GameData["round"].(float64)
		idx := int(round) - 1
		if idx < 0 || idx >= len(gameState.RebusPuzzles) {
			return false, nil, fmt.Errorf("no active puzzle")
		}
		guess, _ := moveData["guess"].(string)
		if strings.TrimSpace(guess) == "" {
			return false, nil, fmt.Errorf("type a guess first")
		}

		correctOrderRaw, _ := gameState.GameData["correct_order"].([]interface{})
		playerIDStr := fmt.Sprintf("%d", playerID)
		for _, entry := range correctOrderRaw {
			if m, ok := entry.(map[string]interface{}); ok {
				if fmt.Sprintf("%v", m["user_id"]) == playerIDStr {
					return false, nil, fmt.Errorf("you already solved this one!")
				}
			}
		}

		puzzle := gameState.RebusPuzzles[idx]
		if !rebusAnswerMatches(puzzle, guess) {
			return false, nil, fmt.Errorf("not quite — try again!")
		}

		rank := len(correctOrderRaw)
		correctOrderRaw = append(correctOrderRaw, map[string]interface{}{
			"user_id": float64(playerID),
			"rank":    float64(rank),
		})
		gameState.GameData["correct_order"] = correctOrderRaw

		scores, ok := gameState.GameData["scores"].(map[string]interface{})
		if !ok {
			scores = make(map[string]interface{})
		}
		current, _ := scores[playerIDStr].(float64)
		scores[playerIDStr] = current + rebusScoreRank(rank)
		gameState.GameData["scores"] = scores
		return false, nil, nil

	case "reveal":
		if playerID != hostID {
			return false, nil, fmt.Errorf("only the host can reveal the answer")
		}
		round, _ := gameState.GameData["round"].(float64)
		idx := int(round) - 1
		if idx < 0 || idx >= len(gameState.RebusPuzzles) {
			return false, nil, fmt.Errorf("no active puzzle to reveal")
		}
		puzzle := gameState.RebusPuzzles[idx]
		gameState.GameData["phase"] = "reveal"
		gameState.GameData["revealed_answer"] = puzzle.Answer
		alts := make([]interface{}, len(puzzle.Alternates))
		for i, a := range puzzle.Alternates {
			alts[i] = a
		}
		gameState.GameData["revealed_alternates"] = alts
		return false, nil, nil

	case "rebus_end":
		// Host-only, mirrors trivia_end exactly: winner is computed from
		// whatever scores exist right now, covering both "Show Results" after
		// the last puzzle and an early "End Game" mid-session.
		if playerID != hostID {
			return false, nil, fmt.Errorf("only the host can end the game")
		}
		scores, _ := gameState.GameData["scores"].(map[string]interface{})
		var bestScore float64 = -1
		var winners []uint
		for _, p := range gameState.Players {
			s, _ := scores[fmt.Sprintf("%d", p.UserID)].(float64)
			if s > bestScore {
				bestScore = s
				winners = []uint{p.UserID}
			} else if s == bestScore {
				winners = append(winners, p.UserID)
			}
		}
		var wID *uint
		if len(winners) == 1 {
			wID = &winners[0]
		}
		gameState.GameData["phase"] = "ended"
		return true, wID, nil

	default:
		return false, nil, fmt.Errorf("unknown rebus_round move type: %s", moveType)
	}
}
