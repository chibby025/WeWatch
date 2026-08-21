package games

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"net/url"
	"os"
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
	Image  string  `json:"image,omitempty"`  // when set, the frontend renders a photo instead of text — see rtImg
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
	// Photo-compound puzzles (see rebusPhotoCompoundSpec below) leave Pattern
	// empty at shuffle time — the real photo URL isn't known until rebus_start
	// fetches it live from Pexels, mirroring Four Frames' own round-start
	// fetch. PhotoWord being non-empty is what marks a puzzle as needing this.
	PhotoWord  string
	PhotoFirst bool // true: the fetched photo token comes before TextWord; false: after
	TextWord   string
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
func rtImg(url string) RebusToken                   { return RebusToken{Image: url} }

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

	// Compound words. Entries where BOTH halves would be strong, unambiguous
	// photo subjects have been moved to rebusPhotoCompoundSpecs below instead
	// (real Pexels photo for one half + text for the other — the actual fix
	// for the "EGG + SHELL"-style giveaway, since fully-spelled-out text on
	// both sides makes the answer a trivial concatenation with zero lateral
	// thinking required). What's left here is the entries where at least one
	// half is a preposition/particle or otherwise unphotographable concept
	// (OVER, UP, DOWN, IN, OUT, work, news, print, etc.) — those genuinely
	// can't benefit from the photo treatment.
	{kind: "compound", words: []string{"MOON", "SHINE"}, answer: "moonshine"},
	{kind: "compound", words: []string{"SUN", "SET"}, answer: "sunset"},
	{kind: "compound", words: []string{"SUN", "RISE"}, answer: "sunrise"},
	{kind: "compound", words: []string{"BASE", "BALL"}, answer: "baseball"},
	{kind: "compound", words: []string{"BLACK", "BOARD"}, answer: "blackboard"},
	{kind: "compound", words: []string{"NOTE", "BOOK"}, answer: "notebook"},
	{kind: "compound", words: []string{"WATER", "FALL"}, answer: "waterfall"},
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
	{kind: "compound", words: []string{"FOOT", "PRINT"}, answer: "footprint"},
	{kind: "compound", words: []string{"FINGER", "PRINT"}, answer: "fingerprint"},
	{kind: "compound", words: []string{"SNOW", "MAN"}, answer: "snowman"},
	{kind: "compound", words: []string{"LIGHT", "HOUSE"}, answer: "lighthouse"},
	{kind: "compound", words: []string{"FIRE", "WORK"}, answer: "firework"},
	{kind: "compound", words: []string{"THUNDER", "STORM"}, answer: "thunderstorm"},
	{kind: "compound", words: []string{"NEWS", "PAPER"}, answer: "newspaper"},
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

	// ── Bank expansion (added 2026-08-20) — same generator categories, more
	// word/answer pairs. Cheap to add (no new hand-drawn token art, no photo
	// fetch), which is exactly why this is the fastest lever for growing the
	// bank without new infrastructure.
	{kind: "grow", words: []string{"NUMBER"}, answer: "growing number"},
	{kind: "grow", words: []string{"DEMAND"}, answer: "growing demand"},
	{kind: "grow", words: []string{"THREAT"}, answer: "growing threat"},
	{kind: "grow", words: []string{"TENSION"}, answer: "growing tension"},
	{kind: "grow", words: []string{"AWARENESS"}, answer: "growing awareness"},
	{kind: "grow", words: []string{"INTEREST"}, answer: "growing interest"},
	{kind: "grow", words: []string{"NEED"}, answer: "growing need"},

	{kind: "shrink", words: []string{"ECONOMY"}, answer: "shrinking economy"},
	{kind: "shrink", words: []string{"DEMAND"}, answer: "shrinking demand"},
	{kind: "shrink", words: []string{"FOREST"}, answer: "shrinking forest"},
	{kind: "shrink", words: []string{"GLACIER"}, answer: "shrinking glacier"},
	{kind: "shrink", words: []string{"SALES"}, answer: "shrinking sales"},
	{kind: "shrink", words: []string{"PROFIT"}, answer: "shrinking profit"},

	{kind: "wholeScale", words: []string{"NAME"}, scale: 2.2, answer: "big name"},
	{kind: "wholeScale", words: []string{"PICTURE"}, scale: 2.2, answer: "big picture"},
	{kind: "wholeScale", words: []string{"BREAK"}, scale: 2.2, answer: "big break"},
	{kind: "wholeScale", words: []string{"LEAGUE"}, scale: 2.2, answer: "big league"},
	{kind: "wholeScale", words: []string{"TOWN"}, scale: 0.5, answer: "small town"},
	{kind: "wholeScale", words: []string{"BUSINESS"}, scale: 0.5, answer: "small business"},
	{kind: "wholeScale", words: []string{"WORLD"}, scale: 0.5, answer: "small world"},
	{kind: "wholeScale", words: []string{"STEPS"}, scale: 0.5, answer: "small steps"},
	{kind: "wholeScale", words: []string{"POTATOES"}, scale: 0.5, answer: "small potatoes"},

	{kind: "sub", words: []string{"CAST"}, answer: "downcast"},
	{kind: "sub", words: []string{"RIGHT"}, answer: "downright"},
	{kind: "sub", words: []string{"SIZE"}, answer: "downsize"},
	{kind: "sub", words: []string{"TIME"}, answer: "downtime"},
	{kind: "sub", words: []string{"WARD"}, answer: "downward"},
	{kind: "sub", words: []string{"HILL"}, answer: "downhill"},
	{kind: "sub", words: []string{"LOAD"}, answer: "download"},

	{kind: "sup", words: []string{"LOAD"}, answer: "upload"},
	{kind: "sup", words: []string{"HOLD"}, answer: "uphold"},
	{kind: "sup", words: []string{"HILL"}, answer: "uphill"},
	{kind: "sup", words: []string{"RIGHT"}, answer: "upright"},
	{kind: "sup", words: []string{"WARD"}, answer: "upward"},
	{kind: "sup", words: []string{"DATE"}, answer: "update"},
	{kind: "sup", words: []string{"SET"}, answer: "upset"},
	{kind: "sup", words: []string{"TIGHT"}, answer: "uptight"},
	{kind: "sup", words: []string{"ROOT"}, answer: "uproot"},
	{kind: "sup", words: []string{"TOWN"}, answer: "uptown"},
	{kind: "sup", words: []string{"SHOT"}, answer: "upshot"},

	// Text compounds using OVER/UNDER/IN/OUT — deliberately kept as plain
	// text (not converted to photo-compounds, unlike the noun+noun entries
	// above) since none of these prefixes are photographable on their own.
	{kind: "compound", words: []string{"OVER", "SEAS"}, answer: "overseas"},
	{kind: "compound", words: []string{"OVER", "HEAD"}, answer: "overhead"},
	{kind: "compound", words: []string{"OVER", "LOOK"}, answer: "overlook"},
	{kind: "compound", words: []string{"OVER", "DUE"}, answer: "overdue"},
	{kind: "compound", words: []string{"OVER", "FLOW"}, answer: "overflow"},
	{kind: "compound", words: []string{"OVER", "WHELM"}, answer: "overwhelm"},
	{kind: "compound", words: []string{"OVER", "ALL"}, answer: "overall"},
	{kind: "compound", words: []string{"UNDER", "DOG"}, answer: "underdog"},
	{kind: "compound", words: []string{"UNDER", "GROUND"}, answer: "underground"},
	{kind: "compound", words: []string{"UNDER", "WATER"}, answer: "underwater"},
	{kind: "compound", words: []string{"UNDER", "WEAR"}, answer: "underwear"},
	{kind: "compound", words: []string{"UNDER", "GO"}, answer: "undergo"},
	{kind: "compound", words: []string{"UNDER", "MINE"}, answer: "undermine"},
	{kind: "compound", words: []string{"IN", "COME"}, answer: "income"},
	{kind: "compound", words: []string{"IN", "PUT"}, answer: "input"},
	{kind: "compound", words: []string{"IN", "SIGHT"}, answer: "insight"},
	{kind: "compound", words: []string{"OUT", "COME"}, answer: "outcome"},
	{kind: "compound", words: []string{"OUT", "LOOK"}, answer: "outlook"},
	{kind: "compound", words: []string{"OUT", "LINE"}, answer: "outline"},
	{kind: "compound", words: []string{"OUT", "BREAK"}, answer: "outbreak"},
	{kind: "compound", words: []string{"OUT", "FIT"}, answer: "outfit"},
	{kind: "compound", words: []string{"OUT", "GROW"}, answer: "outgrow"},
	{kind: "compound", words: []string{"OUT", "LAST"}, answer: "outlast"},
}

func rebusGeneratedBank() []RebusPuzzle {
	out := make([]RebusPuzzle, len(rebusGeneratedSpecs))
	for i, s := range rebusGeneratedSpecs {
		out[i] = s.toPuzzle()
	}
	return out
}

// rebusPhotoCompoundSpec — the real fix for the "EGG + SHELL" giveaway: one
// half of the compound is a real photo, fetched live from Pexels at
// rebus_start (reusing the exact fetch mechanism four_frames.go already
// proved out — fetchSingleRebusPhoto below is a smaller, one-photo sibling of
// fetchFourFramesPhotos), the other half stays plain styled text. The player
// has to recognize the photographed object and name it before they can
// combine it with the text half — genuine visual decoding instead of reading
// two fully-spelled-out labels and concatenating them.
//
// Deliberately only ONE half needs to be a strong, unambiguous, commonly-
// photographed noun (not both) — requiring two good photo subjects per entry
// would cut this list down substantially. photoWord is the actual Pexels
// search term, which sometimes differs from the literal compound-half text
// (e.g. "backpack" rather than the ambiguous bare "pack") to get a clean,
// unambiguous result — see fourFramesWordBank's own comment for why word
// choice matters this much for a live photo search.
//
// Entries where NEITHER half is a concrete, unambiguous noun (a preposition/
// particle half like "OVER" in "takeover", "UP" in "upstairs", or an
// abstract half like "news", "print", "thunder") aren't eligible for this
// treatment at all — those stay as plain text compounds in
// rebusGeneratedSpecs/rebusHandAuthoredBank above instead.
type rebusPhotoCompoundSpec struct {
	photoWord  string
	photoFirst bool // true: photo comes before the text half in the pattern; false: after
	textWord   string
	answer     string
	alternates []string
}

var rebusPhotoCompoundSpecs = []rebusPhotoCompoundSpec{
	{photoWord: "egg", photoFirst: true, textWord: "SHELL", answer: "eggshell"},
	{photoWord: "shell", photoFirst: false, textWord: "SEA", answer: "seashell"},
	{photoWord: "car", photoFirst: true, textWord: "PET", answer: "carpet"},
	{photoWord: "flower", photoFirst: false, textWord: "SUN", answer: "sunflower"},
	{photoWord: "moon", photoFirst: true, textWord: "LIGHT", answer: "moonlight"},
	{photoWord: "honey jar", photoFirst: true, textWord: "MOON", answer: "honeymoon"},
	{photoWord: "bee", photoFirst: false, textWord: "HONEY", answer: "honeybee"},
	{photoWord: "castle", photoFirst: false, textWord: "SAND", answer: "sandcastle"},
	{photoWord: "jet aircraft", photoFirst: false, textWord: "AIR", answer: "airplane"},
	{photoWord: "foot", photoFirst: true, textWord: "BALL", answer: "football"},
	{photoWord: "wicker basket", photoFirst: true, textWord: "BALL", answer: "basketball"},
	{photoWord: "key", photoFirst: true, textWord: "BOARD", answer: "keyboard"},
	{photoWord: "hiking backpack", photoFirst: false, textWord: "BACK", answer: "backpack"},
	{photoWord: "melon", photoFirst: false, textWord: "WATER", answer: "watermelon"},
	{photoWord: "buttered toast", photoFirst: true, textWord: "FLY", answer: "butterfly"},
	{photoWord: "bed", photoFirst: true, textWord: "ROOM", answer: "bedroom"},
	{photoWord: "book", photoFirst: true, textWord: "SHELF", answer: "bookshelf"},
	{photoWord: "coat", photoFirst: false, textWord: "RAIN", answer: "raincoat"},
	{photoWord: "bonfire", photoFirst: true, textWord: "CAMP", answer: "campfire"},
	{photoWord: "train tracks", photoFirst: true, textWord: "ROAD", answer: "railroad"},
	{photoWord: "tooth", photoFirst: true, textWord: "BRUSH", answer: "toothbrush"},
	{photoWord: "snow", photoFirst: true, textWord: "BALL", answer: "snowball"},
}

func (s rebusPhotoCompoundSpec) toPuzzle() RebusPuzzle {
	return RebusPuzzle{
		Answer:     s.answer,
		Alternates: s.alternates,
		PhotoWord:  s.photoWord,
		PhotoFirst: s.photoFirst,
		TextWord:   s.textWord,
	}
}

func rebusPhotoCompoundBank() []RebusPuzzle {
	out := make([]RebusPuzzle, len(rebusPhotoCompoundSpecs))
	for i, s := range rebusPhotoCompoundSpecs {
		out[i] = s.toPuzzle()
	}
	return out
}

// fetchSingleRebusPhoto fetches exactly one photo URL from Pexels for a
// photo-compound puzzle's photographed half — a smaller sibling of
// fetchFourFramesPhotos (which needs exactly 4 for a 2x2 grid); both live in
// the same games package and share fourFramesHTTPClient/pexelsPhotoResponse
// rather than duplicating the client setup.
func fetchSingleRebusPhoto(word string) (string, error) {
	apiKey := os.Getenv("PEXELS_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("PEXELS_API_KEY is not configured")
	}

	endpoint := "https://api.pexels.com/v1/search?query=" + url.QueryEscape(word) + "&per_page=1&orientation=square"
	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return "", fmt.Errorf("failed to build Pexels request: %w", err)
	}
	req.Header.Set("Authorization", apiKey)

	resp, err := fourFramesHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("Pexels request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Pexels returned status %d for query %q", resp.StatusCode, word)
	}

	var parsed pexelsPhotoResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return "", fmt.Errorf("failed to decode Pexels response: %w", err)
	}
	if len(parsed.Photos) == 0 {
		return "", fmt.Errorf("Pexels returned no photos for query %q", word)
	}
	u := parsed.Photos[0].Src.Large
	if u == "" {
		u = parsed.Photos[0].Src.Medium
	}
	if u == "" {
		return "", fmt.Errorf("Pexels photo had no usable URL for query %q", word)
	}
	return u, nil
}

// rebusPhotoFetcher — indirected through a package var (defaulting to the
// real Pexels call above), mirroring fourFramesPhotoFetcher exactly, so tests
// can substitute a fake, deterministic fetcher instead of hitting the real
// network/needing a real API key.
var rebusPhotoFetcher = fetchSingleRebusPhoto

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
		Pattern: []RebusToken{rt("CAT"), rtOp("+"), rt("NAP")},
		Answer:  "catnap",
		Hint:    "A short sleep, named after a sneaky pet.",
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
var rebusPuzzleBank = append(append(append([]RebusPuzzle{}, rebusHandAuthoredBank...), rebusGeneratedBank()...), rebusPhotoCompoundBank()...)

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
		pattern := puzzle.Pattern
		if puzzle.PhotoWord != "" {
			// Photo-compound puzzle — Pattern was left empty at shuffle time;
			// fetch the real photo now (same live-fetch-at-round-start shape
			// as four_frames_start) and assemble the final pattern from it.
			photoURL, ferr := rebusPhotoFetcher(puzzle.PhotoWord)
			if ferr != nil {
				log.Printf("⚠️ [RebusRound] Pexels fetch failed for %q: %v", puzzle.PhotoWord, ferr)
				return false, nil, fmt.Errorf("couldn't load the picture for this puzzle — try again")
			}
			photoTok := rtImg(photoURL)
			textTok := rt(puzzle.TextWord)
			if puzzle.PhotoFirst {
				pattern = []RebusToken{photoTok, rtOp("+"), textTok}
			} else {
				pattern = []RebusToken{textTok, rtOp("+"), photoTok}
			}
		}
		gameState.GameData["phase"] = "puzzle"
		gameState.GameData["round"] = float64(nextIdx + 1)
		gameState.GameData["current_pattern"] = pattern
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
