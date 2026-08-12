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
func rtScale(text string, scale float64) RebusToken { return RebusToken{Text: text, Scale: scale} }
func rtOp(sym string) RebusToken                    { return RebusToken{Text: sym, Op: true} }
func rtSup(text string) RebusToken                  { return RebusToken{Text: text, Sup: true} }
func rtSub(text string) RebusToken                  { return RebusToken{Text: text, Sub: true} }
func rtColor(text, color string) RebusToken         { return RebusToken{Text: text, Color: color} }
func rtBreak(text string) RebusToken                { return RebusToken{Text: text, Break: true} }
func rtMirror(text string) RebusToken               { return RebusToken{Text: text, Mirror: true} }
func rtFlip(text string) RebusToken                 { return RebusToken{Text: text, Flip: true} }
func rtStrike(text string) RebusToken               { return RebusToken{Text: text, Strike: true} }

// ── Procedural generators ────────────────────────────────────────────────────
// The 6 pattern "kinds" below (letter-scale, whole-word-scale, compound,
// repeat-count, sub, sup) are the volume categories among the hand-authored
// puzzles above — the ones where the *visual trick* is identical across many
// different words, and only the specific word(s) + answer actually vary. These
// turn "hand-build a token array per puzzle" into "supply a word or two and an
// answer" — the same content-scaling idea already proven for Trivia (external
// question banks instead of a fixed list). The remaining categories above
// (stacked idioms, mirror/flip, phonetic, color, strikethrough-opposite) stay
// hand-authored — each one is a genuinely bespoke visual joke that doesn't
// generalize across a word list the way "make this word bigger" does.

// rtGenScaleWord scales each letter of word individually, linearly ascending
// (growing) or descending (shrinking) across the same 0.55–1.75 range the
// original hand-authored "growing old"/"growing economy" entries used.
func rtGenScaleWord(word string, ascending bool) []RebusToken {
	const minScale, maxScale = 0.55, 1.75
	letters := strings.Split(word, "")
	n := len(letters)
	tokens := make([]RebusToken, n)
	for i, l := range letters {
		t := float64(i) / float64(max(n-1, 1))
		if !ascending {
			t = 1 - t
		}
		tokens[i] = rtScale(l, minScale+t*(maxScale-minScale))
	}
	return tokens
}

// rtGenWholeWordScale renders a single word at one fixed scale — the "big
// deal"/"small talk" trick, where the *whole word itself* is oversized or
// undersized (as opposed to rtGenScaleWord's letter-by-letter gradient).
func rtGenWholeWordScale(word string, scale float64) []RebusToken {
	return []RebusToken{rtScale(word, scale)}
}

// rtGenCompound is the plain "WORD1 + WORD2" combination trick.
func rtGenCompound(partA, partB string) []RebusToken {
	return []RebusToken{rt(partA), rtOp("+"), rt(partB)}
}

// rtGenRepeat renders word count times in a row — the "CYCLE CYCLE CYCLE" =
// tricycle trick, where the repeat count itself is the clue (uni-/bi-/tri-).
func rtGenRepeat(word string, count int) []RebusToken {
	tokens := make([]RebusToken, count)
	for i := range tokens {
		tokens[i] = rt(word)
	}
	return tokens
}

// rtGenSub/rtGenSup render a single word sitting low/high on the line — the
// established "downtown"/"top secret" trick for "down-"/"up-" prefixed words,
// without ever spelling "down"/"up" as text.
func rtGenSub(word string) []RebusToken { return []RebusToken{rtSub(word)} }
func rtGenSup(word string) []RebusToken { return []RebusToken{rtSup(word)} }

// rebusGenSpec is one row of generated-puzzle data — just the words and the
// answer, no hand-built token art. kind selects which rtGen* function above
// turns it into a real RebusPuzzle.
type rebusGenSpec struct {
	kind       string // "grow" | "shrink" | "wholeScale" | "compound" | "repeat" | "sub" | "sup"
	words      []string
	scale      float64 // wholeScale only
	count      int     // repeat only
	answer     string
	alternates []string
	hint       string
}

func (s rebusGenSpec) toPuzzle() RebusPuzzle {
	var pattern []RebusToken
	switch s.kind {
	case "grow":
		pattern = rtGenScaleWord(s.words[0], true)
	case "shrink":
		pattern = rtGenScaleWord(s.words[0], false)
	case "wholeScale":
		pattern = rtGenWholeWordScale(s.words[0], s.scale)
	case "compound":
		pattern = rtGenCompound(s.words[0], s.words[1])
	case "repeat":
		pattern = rtGenRepeat(s.words[0], s.count)
	case "sub":
		pattern = rtGenSub(s.words[0])
	case "sup":
		pattern = rtGenSup(s.words[0])
	}
	return RebusPuzzle{Pattern: pattern, Answer: s.answer, Alternates: s.alternates, Hint: s.hint}
}

// rebusGeneratedSpecs — the data-only puzzle table. Adding a new puzzle in any
// of these 6 categories is now just one more line here, not a hand-built
// token array — this is the actual "keep it from being repetitive" mechanism
// asked for: growing this list (or adding a 7th category + generator above)
// scales content without scaling authoring effort the way the original 31
// hand-authored entries did.
var rebusGeneratedSpecs = []rebusGenSpec{
	// Letter-scale growing/shrinking
	{kind: "grow", words: []string{"FAMILY"}, answer: "growing family"},
	{kind: "grow", words: []string{"CONCERN"}, answer: "growing concern"},
	{kind: "grow", words: []string{"CROWD"}, answer: "growing crowd"},
	{kind: "grow", words: []string{"DEBT"}, answer: "growing debt"},
	{kind: "shrink", words: []string{"BUDGET"}, answer: "shrinking budget"},
	{kind: "shrink", words: []string{"MARKET"}, answer: "shrinking market"},
	{kind: "shrink", words: []string{"ICE"}, answer: "shrinking ice"},
	{kind: "shrink", words: []string{"POPULATION"}, answer: "shrinking population"},

	// Whole-word big/small scale
	{kind: "wholeScale", words: []string{"SHOT"}, scale: 2.2, answer: "big shot"},
	{kind: "wholeScale", words: []string{"TIME"}, scale: 2.2, answer: "big time"},
	{kind: "wholeScale", words: []string{"WIG"}, scale: 2.2, answer: "big wig"},
	{kind: "wholeScale", words: []string{"PRINT"}, scale: 0.5, answer: "small print"},
	{kind: "wholeScale", words: []string{"FRY"}, scale: 0.5, answer: "small fry"},
	{kind: "wholeScale", words: []string{"CHANGE"}, scale: 0.5, answer: "small change"},

	// Compound words
	{kind: "compound", words: []string{"MOON", "SHINE"}, answer: "moonshine"},
	{kind: "compound", words: []string{"SUN", "SET"}, answer: "sunset"},
	{kind: "compound", words: []string{"SUN", "RISE"}, answer: "sunrise"},
	{kind: "compound", words: []string{"AIR", "PLANE"}, answer: "airplane"},
	{kind: "compound", words: []string{"FOOT", "BALL"}, answer: "football"},
	{kind: "compound", words: []string{"BASKET", "BALL"}, answer: "basketball"},
	{kind: "compound", words: []string{"BASE", "BALL"}, answer: "baseball"},
	{kind: "compound", words: []string{"BLACK", "BOARD"}, answer: "blackboard"},
	{kind: "compound", words: []string{"KEY", "BOARD"}, answer: "keyboard"},
	{kind: "compound", words: []string{"NOTE", "BOOK"}, answer: "notebook"},
	{kind: "compound", words: []string{"BACK", "PACK"}, answer: "backpack"},
	{kind: "compound", words: []string{"WATER", "FALL"}, answer: "waterfall"},
	{kind: "compound", words: []string{"WATER", "MELON"}, answer: "watermelon"},
	{kind: "compound", words: []string{"BUTTER", "FLY"}, answer: "butterfly"},
	{kind: "compound", words: []string{"HONEY", "MOON"}, answer: "honeymoon"},
	{kind: "compound", words: []string{"HONEY", "BEE"}, answer: "honeybee"},
	{kind: "compound", words: []string{"DAY", "LIGHT"}, answer: "daylight"},
	{kind: "compound", words: []string{"DAY", "DREAM"}, answer: "daydream"},
	{kind: "compound", words: []string{"NIGHT", "MARE"}, answer: "nightmare"},
	{kind: "compound", words: []string{"UP", "STAIRS"}, answer: "upstairs"},
	{kind: "compound", words: []string{"DOWN", "STAIRS"}, answer: "downstairs"},
	{kind: "compound", words: []string{"OUT", "SIDE"}, answer: "outside"},
	{kind: "compound", words: []string{"IN", "SIDE"}, answer: "inside"},
	{kind: "compound", words: []string{"GRAND", "FATHER"}, answer: "grandfather"},
	{kind: "compound", words: []string{"GRAND", "MOTHER"}, answer: "grandmother"},
	{kind: "compound", words: []string{"CLASS", "ROOM"}, answer: "classroom"},
	{kind: "compound", words: []string{"BED", "ROOM"}, answer: "bedroom"},
	{kind: "compound", words: []string{"BOOK", "SHELF"}, answer: "bookshelf"},
	{kind: "compound", words: []string{"FOOT", "PRINT"}, answer: "footprint"},
	{kind: "compound", words: []string{"FINGER", "PRINT"}, answer: "fingerprint"},
	{kind: "compound", words: []string{"SNOW", "MAN"}, answer: "snowman"},
	{kind: "compound", words: []string{"SNOW", "BALL"}, answer: "snowball"},
	{kind: "compound", words: []string{"RAIN", "COAT"}, answer: "raincoat"},
	{kind: "compound", words: []string{"SEA", "SHELL"}, answer: "seashell"},
	{kind: "compound", words: []string{"LIGHT", "HOUSE"}, answer: "lighthouse"},
	{kind: "compound", words: []string{"FIRE", "WORK"}, answer: "firework"},
	{kind: "compound", words: []string{"CAMP", "FIRE"}, answer: "campfire"},
	{kind: "compound", words: []string{"THUNDER", "STORM"}, answer: "thunderstorm"},
	{kind: "compound", words: []string{"RAIL", "ROAD"}, answer: "railroad"},
	{kind: "compound", words: []string{"NEWS", "PAPER"}, answer: "newspaper"},
	{kind: "compound", words: []string{"TOOTH", "BRUSH"}, answer: "toothbrush"},
	{kind: "compound", words: []string{"LEFT", "OVER"}, answer: "leftover"},
	{kind: "compound", words: []string{"HANG", "OVER"}, answer: "hangover"},
	{kind: "compound", words: []string{"TAKE", "OVER"}, answer: "takeover"},
	{kind: "compound", words: []string{"MAKE", "OVER"}, answer: "makeover"},
	{kind: "compound", words: []string{"SLEEP", "OVER"}, answer: "sleepover"},
	{kind: "compound", words: []string{"TURN", "OVER"}, answer: "turnover"},
	{kind: "compound", words: []string{"PUSH", "OVER"}, answer: "pushover"},
	{kind: "compound", words: []string{"OVER", "COAT"}, answer: "overcoat"},
	{kind: "compound", words: []string{"OVER", "TIME"}, answer: "overtime"},

	// Repeat-count (uni-/bi-/tri-/du-)
	{kind: "repeat", words: []string{"CYCLE"}, count: 1, answer: "unicycle"},
	{kind: "repeat", words: []string{"CYCLE"}, count: 2, answer: "bicycle"},
	{kind: "repeat", words: []string{"PLEX"}, count: 2, answer: "duplex", hint: "A building split into two."},
	{kind: "repeat", words: []string{"ANGLE"}, count: 3, answer: "triangle"},

	// Sub (down-) / Sup (up-) prefix, without ever spelling "down"/"up"
	{kind: "sub", words: []string{"FALL"}, answer: "downfall"},
	{kind: "sub", words: []string{"GRADE"}, answer: "downgrade"},
	{kind: "sub", words: []string{"PLAY"}, answer: "downplay"},
	{kind: "sub", words: []string{"SIDE"}, answer: "downside"},
	{kind: "sub", words: []string{"STREAM"}, answer: "downstream"},
	{kind: "sub", words: []string{"TURN"}, answer: "downturn"},
	{kind: "sub", words: []string{"WIND"}, answer: "downwind"},
	{kind: "sup", words: []string{"GRADE"}, answer: "upgrade"},
	{kind: "sup", words: []string{"ROAR"}, answer: "uproar"},
	{kind: "sup", words: []string{"STREAM"}, answer: "upstream"},
	{kind: "sup", words: []string{"TURN"}, answer: "upturn"},
	{kind: "sup", words: []string{"LIFT"}, answer: "uplift"},
	{kind: "sup", words: []string{"BEAT"}, answer: "upbeat"},
	{kind: "sup", words: []string{"FRONT"}, answer: "upfront"},
}

func rebusGeneratedBank() []RebusPuzzle {
	out := make([]RebusPuzzle, len(rebusGeneratedSpecs))
	for i, s := range rebusGeneratedSpecs {
		out[i] = s.toPuzzle()
	}
	return out
}

// rebusHandAuthoredBank — bespoke puzzles that don't fit any of the
// procedural generators above (stacked idioms, mirror/flip, phonetic, color,
// strikethrough-opposite — each a one-off visual joke, not a word-list-driven
// pattern). Order here is irrelevant; the final combined bank is shuffled per
// session via rebusShuffledPuzzles().
var rebusHandAuthoredBank = []RebusPuzzle{
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
		Pattern: []RebusToken{rt("PAIR"), rtOp("+"), rt("O"), rtOp("+"), rt("DICE")},
		Answer:  "paradise",
		Hint:    "Say it out loud: pair… a… dice…",
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

// rebusPuzzleBank — the full combined set (hand-authored + procedurally
// generated) that rebusShuffledPuzzles() draws from. Computed once at package
// init via a fresh backing array (not append(rebusHandAuthoredBank, ...)
// directly) so growing the generated bank later can never alias/corrupt
// rebusHandAuthoredBank's own underlying array.
var rebusPuzzleBank = append(append([]RebusPuzzle{}, rebusHandAuthoredBank...), rebusGeneratedBank()...)

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
