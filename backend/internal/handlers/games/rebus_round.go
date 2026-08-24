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
	Icon   string  `json:"icon,omitempty"`   // when set, the frontend renders a named local icon (e.g. "arrow-up") — see rtIcon. No live fetch, no ambiguity risk, used for directional/symbolic prefixes (OUT/IN/UP/OFF/BACK) and pictograms (checkmark, refresh, flag, dollar sign) that aren't honestly a "photo of a noun".
	Swatch string  `json:"swatch,omitempty"` // when set, the frontend renders a solid color chip instead of text — see rtSwatch. Used for color-word halves (BLACK/WHITE/BLUE/...).
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
	// Live-fetch puzzles leave Pattern empty at shuffle time — the real
	// photo(s) aren't known until rebus_start fetches them from Pexels,
	// mirroring Four Frames' own round-start fetch. PhotoWord being non-empty
	// is what marks a puzzle as needing this; which of the other fields are
	// also set determines the final shape assembled in rebus_start:
	//   PhotoWord alone                -> one styled image, replacing what
	//                                      would otherwise be a scaled/
	//                                      positioned text word (see
	//                                      PhotoScale/PhotoSub/PhotoSup below)
	//   PhotoWord + TextWord            -> photo + text compound (the
	//                                      original "EGG + SHELL" fix)
	//   PhotoWord + PhotoWordB          -> two-photo compound — the stronger
	//                                      fix: neither half is spelled-out
	//                                      text, so there's nothing to just
	//                                      read and concatenate
	PhotoWord  string
	PhotoWordB string // set -> two-photo compound (mutually exclusive with TextWord)
	TextWord   string // set -> photo + text compound (mutually exclusive with PhotoWordB)
	PhotoFirst bool   // ordering: does the PhotoWord token come first?

	// Only meaningful when PhotoWord is set alone (no PhotoWordB/TextWord) —
	// carries the same visual trick the token would have had as styled text
	// (see rtGenWholeWordScale/rtGenSub/rtGenSup) onto the fetched image
	// instead, so e.g. "big wig" becomes a large wig *photo*, not large text.
	PhotoScale float64
	PhotoSub   bool
	PhotoSup   bool

	// PartA/PartB — a more general 2-part compound than PhotoWord/PhotoWordB/
	// TextWord above: each half can independently be plain text, a named
	// local icon, a solid color swatch, or a live photo (see
	// RebusCompoundPart). Both nil for every puzzle type above (zero risk to
	// their already-proven assembly path) — set together only for the
	// icon/swatch-driven compound conversions in rebusMixedCompoundSpecs
	// below. rebus_start assembles PartA + "+" + PartB in that order.
	PartA, PartB *RebusCompoundPart
}

// RebusCompoundPart — one half of a PartA/PartB mixed compound. Exactly one
// field should be set. Icon/Swatch resolve instantly (no fetch, no
// ambiguity risk); Photo is live-fetched from Pexels at rebus_start exactly
// like PhotoWord/PhotoWordB above.
type RebusCompoundPart struct {
	Text   string
	Icon   string
	Swatch string
	Photo  string
}

// resolveRebusCompoundPart turns one RebusCompoundPart into its final
// RebusToken. Text/Icon/Swatch are pure data, resolved instantly; Photo
// goes through the same live rebusPhotoFetcher used by PhotoWord/PhotoWordB
// elsewhere in this file, so it can fail the same way (a real network/
// Pexels error) — the caller (rebus_start) surfaces that identically.
func resolveRebusCompoundPart(part RebusCompoundPart) (RebusToken, error) {
	switch {
	case part.Photo != "":
		url, err := rebusPhotoFetcher(part.Photo)
		if err != nil {
			return RebusToken{}, err
		}
		return rtImg(url), nil
	case part.Icon != "":
		return rtIcon(part.Icon), nil
	case part.Swatch != "":
		return rtSwatch(part.Swatch), nil
	default:
		return rt(part.Text), nil
	}
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
func rtIcon(name string) RebusToken                 { return RebusToken{Icon: name} }
func rtSwatch(hex string) RebusToken                { return RebusToken{Swatch: hex} }

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

	// Whole-word big/small scale. WIG/CHANGE/TOWN/WORLD/STEPS/POTATOES moved
	// to rebusIconSpecs below — each is a concrete, photographable noun, so
	// "big wig" etc. now shows a genuinely large *photo*, not large text.
	// What's left here (SHOT, TIME, PRINT, FRY, NAME, PICTURE, BREAK, LEAGUE,
	// BUSINESS) is idiomatic/abstract — no honest photo represents "a big
	// name" or "small print" (referring to text size) without misleading.
	{kind: "wholeScale", words: []string{"SHOT"}, scale: 2.2, answer: "big shot"},
	{kind: "wholeScale", words: []string{"TIME"}, scale: 2.2, answer: "big time"},
	{kind: "wholeScale", words: []string{"PRINT"}, scale: 0.5, answer: "small print"},
	{kind: "wholeScale", words: []string{"FRY"}, scale: 0.5, answer: "small fry"},

	// Compound words. Entries where at least one half is a strong,
	// unambiguous photo subject have been moved to rebusPhotoCompoundSpecs
	// below instead (real Pexels photo for one or both halves — the actual
	// fix for the "EGG + SHELL"-style giveaway, since fully-spelled-out text
	// on both sides makes the answer a trivial concatenation with zero
	// lateral thinking required). Re-audited a second time (2026-08-23,
	// prompted by a direct "why can't we use images" question) — moved 15
	// more entries (SUN+SET/RISE, MOON+SHINE, WATER+FALL, FOOT/FINGER+PRINT,
	// OVER+TIME, HOME+WORK/TOWN, HEART+BREAK/BEAT, BACK+STAGE, MID+NIGHT,
	// HAND+OUT, CROSS+ROADS — see rebusPhotoCompoundSpecs) once a genuinely
	// clean, unambiguous noun on at least one side was found. What's left
	// here is genuinely stuck as text: every remaining entry has at least
	// one preposition/particle (OVER, UP, DOWN, IN, OUT) or abstract/
	// idiomatic half (work, news already moved, print, an etymology-
	// mismatched half like MARE in "nightmare" — literally a horse, but not
	// what the word means) that can't honestly be photographed without
	// misleading the player.
	{kind: "compound", words: []string{"DAY", "LIGHT"}, answer: "daylight"},
	{kind: "compound", words: []string{"DAY", "DREAM"}, answer: "daydream"},
	{kind: "compound", words: []string{"NIGHT", "MARE"}, answer: "nightmare"},
	{kind: "compound", words: []string{"FIRE", "WORK"}, answer: "firework"},
	{kind: "compound", words: []string{"LEFT", "OVER"}, answer: "leftover"},
	{kind: "compound", words: []string{"HANG", "OVER"}, answer: "hangover"},
	{kind: "compound", words: []string{"TAKE", "OVER"}, answer: "takeover"},
	{kind: "compound", words: []string{"MAKE", "OVER"}, answer: "makeover"},
	{kind: "compound", words: []string{"SLEEP", "OVER"}, answer: "sleepover"},
	{kind: "compound", words: []string{"TURN", "OVER"}, answer: "turnover"},
	{kind: "compound", words: []string{"PUSH", "OVER"}, answer: "pushover"},

	// Repeat-count (uni-/bi-/tri-/du-)
	{kind: "repeat", words: []string{"CYCLE"}, count: 1, answer: "unicycle"},
	{kind: "repeat", words: []string{"CYCLE"}, count: 2, answer: "bicycle"},
	{kind: "repeat", words: []string{"PLEX"}, count: 2, answer: "duplex", hint: "A building split into two."},
	{kind: "repeat", words: []string{"ANGLE"}, count: 3, answer: "triangle"},

	// Sub (down-) / Sup (up-) prefix, without ever spelling "down"/"up"
	// STREAM/WIND/HILL (sub) and STREAM/HILL/DATE/ROOT/TOWN (sup) moved to
	// rebusIconSpecs below — each is a literal, safe noun (a real stream,
	// a real hill, etc.), unlike ROAR/SHOT here, which would be misleading
	// if photographed literally ("uproar" isn't a lion's roar, "upshot"
	// isn't a camera shot). FALL/"downfall" also moved to rebusIconSpecs
	// (2026-08-23) — a "person falling" photo, positioned low, sidesteps
	// the original season-ambiguity concern (a bare "fall" search risked
	// autumn foliage) the same way the mixed-compound FALL entries above do.
	{kind: "sub", words: []string{"GRADE"}, answer: "downgrade"},
	{kind: "sub", words: []string{"PLAY"}, answer: "downplay"},
	{kind: "sub", words: []string{"SIDE"}, answer: "downside"},
	{kind: "sub", words: []string{"TURN"}, answer: "downturn"},
	{kind: "sup", words: []string{"GRADE"}, answer: "upgrade"},
	{kind: "sup", words: []string{"ROAR"}, answer: "uproar"},
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
	{kind: "wholeScale", words: []string{"BUSINESS"}, scale: 0.5, answer: "small business"},

	{kind: "sub", words: []string{"CAST"}, answer: "downcast"},
	{kind: "sub", words: []string{"RIGHT"}, answer: "downright"},
	{kind: "sub", words: []string{"SIZE"}, answer: "downsize"},
	// TIME/"downtime" moved to rebusIconSpecs below (a clock photo, positioned
	// low) — unlike "big time" above (an idiom about magnitude, not a literal
	// clock), "downtime" genuinely means idle/paused *time*, so a clock is an
	// honest, unambiguous visual for it — same formula already used for
	// "update" (photoWord: "calendar", sup) just below in that list.
	{kind: "sub", words: []string{"WARD"}, answer: "downward"},
	{kind: "sub", words: []string{"LOAD"}, answer: "download"},

	{kind: "sup", words: []string{"LOAD"}, answer: "upload"},
	{kind: "sup", words: []string{"HOLD"}, answer: "uphold"},
	{kind: "sup", words: []string{"RIGHT"}, answer: "upright"},
	{kind: "sup", words: []string{"WARD"}, answer: "upward"},
	{kind: "sup", words: []string{"SET"}, answer: "upset"},
	{kind: "sup", words: []string{"TIGHT"}, answer: "uptight"},
	{kind: "sup", words: []string{"SHOT"}, answer: "upshot"},

	// Text compounds using OVER/UNDER/IN/OUT — deliberately kept as plain
	// text (not converted to photo-compounds, unlike the noun+noun entries
	// moved to rebusPhotoCompoundSpecs above) since the non-prefix half here
	// is also abstract/verb-shaped, not a concrete photographable noun.
	{kind: "compound", words: []string{"OVER", "DUE"}, answer: "overdue"},
	{kind: "compound", words: []string{"OVER", "FLOW"}, answer: "overflow"},
	{kind: "compound", words: []string{"OVER", "WHELM"}, answer: "overwhelm"},
	{kind: "compound", words: []string{"OVER", "ALL"}, answer: "overall"},
	{kind: "compound", words: []string{"UNDER", "WEAR"}, answer: "underwear"},
	{kind: "compound", words: []string{"UNDER", "GO"}, answer: "undergo"},
	{kind: "compound", words: []string{"UNDER", "MINE"}, answer: "undermine"},

	// ── New content, added alongside the image conversions above to grow
	// the bank toward ~300 total puzzles (see rebusPuzzleBank's own comment
	// for the full breakdown). Same 6 generator categories — no new content
	// infrastructure needed, just more word/answer rows.
	{kind: "compound", words: []string{"CROSS", "WORD"}, answer: "crossword"},
	{kind: "compound", words: []string{"HEAD", "ACHE"}, answer: "headache"},
	{kind: "compound", words: []string{"HEAD", "LINE"}, answer: "headline"},
	{kind: "compound", words: []string{"SIDE", "WALK"}, answer: "sidewalk"},
	{kind: "compound", words: []string{"SIDE", "TRACK"}, answer: "sidetrack"},
	{kind: "compound", words: []string{"CROSS", "FIRE"}, answer: "crossfire"},
	{kind: "compound", words: []string{"WEEK", "DAY"}, answer: "weekday"},
	{kind: "compound", words: []string{"MID", "TERM"}, answer: "midterm"},
	{kind: "compound", words: []string{"ON", "GOING"}, answer: "ongoing"},

	{kind: "grow", words: []string{"HUNGER"}, answer: "growing hunger"},
	{kind: "grow", words: []string{"PRESSURE"}, answer: "growing pressure"},
	{kind: "grow", words: []string{"SUSPICION"}, answer: "growing suspicion"},
	{kind: "grow", words: []string{"COMMUNITY"}, answer: "growing community"},
	{kind: "grow", words: []string{"FANBASE"}, answer: "growing fanbase"},
	{kind: "grow", words: []string{"REALIZATION"}, answer: "growing realization"},
	{kind: "shrink", words: []string{"AUDIENCE"}, answer: "shrinking audience"},
	{kind: "shrink", words: []string{"WORKFORCE"}, answer: "shrinking workforce"},
	{kind: "shrink", words: []string{"SUPPLY"}, answer: "shrinking supply"},
	{kind: "shrink", words: []string{"PATIENCE"}, answer: "shrinking patience"},
	{kind: "shrink", words: []string{"HABITAT"}, answer: "shrinking habitat"},
	{kind: "shrink", words: []string{"MEMBERSHIP"}, answer: "shrinking membership"},
	{kind: "repeat", words: []string{"LATERAL"}, count: 2, answer: "bilateral"},
	{kind: "repeat", words: []string{"LINGUAL"}, count: 2, answer: "bilingual"},
	{kind: "repeat", words: []string{"PARTITE"}, count: 3, answer: "tripartite"},
	{kind: "repeat", words: []string{"POD"}, count: 2, answer: "bipod"},
	{kind: "repeat", words: []string{"POD"}, count: 3, answer: "tripod"},
	{kind: "sub", words: []string{"BEAT"}, answer: "downbeat"},
	{kind: "sub", words: []string{"SPIN"}, answer: "downspin"},
	{kind: "sub", words: []string{"SHIFT"}, answer: "downshift"},
	{kind: "sup", words: []string{"BRINGING"}, answer: "upbringing"},
	{kind: "sup", words: []string{"RISING"}, answer: "uprising"},
	{kind: "sup", words: []string{"SURGE"}, answer: "upsurge"},
	{kind: "sup", words: []string{"SWING"}, answer: "upswing"},
	{kind: "sup", words: []string{"WARDS"}, answer: "upwards"},

	// ── Second content-expansion pass (added toward the ~300 target).
	{kind: "grow", words: []string{"MOVEMENT"}, answer: "growing movement"},
	{kind: "grow", words: []string{"DIVIDE"}, answer: "growing divide"},
	{kind: "grow", words: []string{"WORKLOAD"}, answer: "growing workload"},
	{kind: "grow", words: []string{"RIVALRY"}, answer: "growing rivalry"},
	{kind: "grow", words: []string{"EXCITEMENT"}, answer: "growing excitement"},
	{kind: "grow", words: []string{"FRUSTRATION"}, answer: "growing frustration"},
	{kind: "grow", words: []string{"CURIOSITY"}, answer: "growing curiosity"},
	{kind: "shrink", words: []string{"OZONE"}, answer: "shrinking ozone"},
	{kind: "shrink", words: []string{"WAISTLINE"}, answer: "shrinking waistline"},
	{kind: "shrink", words: []string{"WAGES"}, answer: "shrinking wages"},
	{kind: "shrink", words: []string{"REVENUE"}, answer: "shrinking revenue"},
	{kind: "shrink", words: []string{"TEAM"}, answer: "shrinking team"},
	{kind: "shrink", words: []string{"DEFICIT"}, answer: "shrinking deficit"},
	{kind: "wholeScale", words: []string{"MOUTH"}, scale: 2.2, answer: "big mouth"},
	{kind: "wholeScale", words: []string{"DATA"}, scale: 2.2, answer: "big data"},
	{kind: "repeat", words: []string{"COLOR"}, count: 3, answer: "tricolor", alternates: []string{"tricolour"}},
	{kind: "repeat", words: []string{"NOMIAL"}, count: 2, answer: "binomial"},
	{kind: "repeat", words: []string{"VALVE"}, count: 2, answer: "bivalve"},
	{kind: "repeat", words: []string{"FOCAL"}, count: 2, answer: "bifocal"},
	{kind: "repeat", words: []string{"PLANE"}, count: 2, answer: "biplane"},
	{kind: "sub", words: []string{"GRADED"}, answer: "downgraded"},
	{kind: "sub", words: []string{"HEARTED"}, answer: "downhearted"},
	{kind: "sup", words: []string{"COMING"}, answer: "upcoming"},
	{kind: "sup", words: []string{"LIFTING"}, answer: "uplifting"},
	{kind: "sup", words: []string{"SIDE"}, answer: "upside"},
	{kind: "sup", words: []string{"START"}, answer: "upstart"},
	{kind: "compound", words: []string{"DRAW", "BACK"}, answer: "drawback"},
}

func rebusGeneratedBank() []RebusPuzzle {
	out := make([]RebusPuzzle, len(rebusGeneratedSpecs))
	for i, s := range rebusGeneratedSpecs {
		out[i] = s.toPuzzle()
	}
	return out
}

// rebusIconSpec — the typography-trick equivalent of a photo-compound: a
// wholeScale/sub/sup puzzle whose single word is a concrete, safe-to-
// photograph noun gets a real Pexels photo instead of styled text, carrying
// the exact same visual trick (the *image* is now what's oversized/
// undersized/raised/lowered) — "big wig" becomes a large wig photo, not
// large text; "downtown" becomes a town photo sitting low on the line.
// Every entry here was moved out of rebusGeneratedSpecs above specifically
// because its word is a literal, unambiguous noun — anything idiomatic or
// abstract (big shot, downfall, uproar) stays text there instead, since a
// literal photo of those would misrepresent the actual meaning.
type rebusIconSpec struct {
	kind       string // "wholeScale" | "sub" | "sup"
	photoWord  string
	scale      float64 // wholeScale only
	answer     string
	alternates []string
	hint       string
}

func (s rebusIconSpec) toPuzzle() RebusPuzzle {
	p := RebusPuzzle{Answer: s.answer, Alternates: s.alternates, Hint: s.hint, PhotoWord: s.photoWord}
	switch s.kind {
	case "wholeScale":
		p.PhotoScale = s.scale
	case "sub":
		p.PhotoSub = true
	case "sup":
		p.PhotoSup = true
	}
	return p
}

var rebusIconSpecs = []rebusIconSpec{
	{kind: "wholeScale", photoWord: "wig", scale: 2.2, answer: "big wig", alternates: []string{"bigwig"}},
	{kind: "wholeScale", photoWord: "coins", scale: 0.5, answer: "small change"},
	{kind: "wholeScale", photoWord: "small town street", scale: 0.5, answer: "small town"},
	{kind: "wholeScale", photoWord: "globe", scale: 0.5, answer: "small world"},
	{kind: "wholeScale", photoWord: "footprints in sand", scale: 0.5, answer: "small steps"},
	{kind: "wholeScale", photoWord: "potatoes", scale: 0.5, answer: "small potatoes"},
	{kind: "sub", photoWord: "river stream", answer: "downstream"},
	{kind: "sub", photoWord: "wind blowing trees", answer: "downwind"},
	{kind: "sup", photoWord: "river stream", answer: "upstream"},
	{kind: "sup", photoWord: "calendar", answer: "update"},
	{kind: "sup", photoWord: "plant root", answer: "uproot"},
	{kind: "sup", photoWord: "small town street", answer: "uptown"},
	{kind: "sub", photoWord: "green hill", answer: "downhill"},
	{kind: "sup", photoWord: "green hill", answer: "uphill"},
	{kind: "sub", photoWord: "clock", answer: "downtime"},
	{kind: "sub", photoWord: "person falling", answer: "downfall"},
}

func rebusIconBank() []RebusPuzzle {
	out := make([]RebusPuzzle, len(rebusIconSpecs))
	for i, s := range rebusIconSpecs {
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
	photoFirst bool // true: PhotoWord's token comes first in the pattern; false: after
	textWord   string // set for a photo+text compound (mutually exclusive with photoWordB)
	photoWordB string // set for a two-photo compound (mutually exclusive with textWord)
	answer     string
	alternates []string
}

// Two-photo entries (photoWordB set): neither half is spelled-out text, so
// there's nothing to just read and concatenate — the real fix for the
// "EGG + SHELL"-as-plain-text giveaway, one level stronger than photo+text.
// Every one of these started as a photo+text compound; upgraded once it was
// confirmed the text half is ALSO a strong, unambiguous, safe-to-photograph
// noun (no idiom/etymology mismatch risk — see the two left as photo+text
// below for the two cases where the second half genuinely isn't one).
var rebusPhotoCompoundSpecs = []rebusPhotoCompoundSpec{
	{photoWord: "egg", photoFirst: true, photoWordB: "seashell", answer: "eggshell"},
	{photoWord: "seashell", photoFirst: false, photoWordB: "ocean wave", answer: "seashell"},
	{photoWord: "car", photoFirst: true, photoWordB: "dog", answer: "carpet"},
	{photoWord: "flower", photoFirst: false, photoWordB: "sun sky", answer: "sunflower"},
	{photoWord: "moon", photoFirst: true, photoWordB: "lit lightbulb", answer: "moonlight"},
	{photoWord: "honey jar", photoFirst: true, photoWordB: "full moon", answer: "honeymoon"},
	{photoWord: "bee", photoFirst: false, photoWordB: "honey jar", answer: "honeybee"},
	{photoWord: "castle", photoFirst: false, photoWordB: "sand dune", answer: "sandcastle"},
	// AIR has no clean literal noun photo (it's the sky/atmosphere) — left as
	// photo+text rather than forcing a misleading second image.
	{photoWord: "jet aircraft", photoFirst: false, textWord: "AIR", answer: "airplane"},
	{photoWord: "foot", photoFirst: true, photoWordB: "ball", answer: "football"},
	{photoWord: "wicker basket", photoFirst: true, photoWordB: "basketball", answer: "basketball"},
	{photoWord: "key", photoFirst: true, photoWordB: "wooden board", answer: "keyboard"},
	// BACK (the body part) reads oddly as an isolated photo next to a
	// backpack — left as photo+text.
	{photoWord: "hiking backpack", photoFirst: false, textWord: "BACK", answer: "backpack"},
	{photoWord: "melon", photoFirst: false, photoWordB: "water splash", answer: "watermelon"},
	{photoWord: "buttered toast", photoFirst: true, photoWordB: "housefly", answer: "butterfly"},
	{photoWord: "bed", photoFirst: true, photoWordB: "bedroom interior", answer: "bedroom"},
	{photoWord: "book", photoFirst: true, photoWordB: "wooden shelf", answer: "bookshelf"},
	{photoWord: "coat", photoFirst: false, photoWordB: "rain storm", answer: "raincoat"},
	{photoWord: "bonfire", photoFirst: true, photoWordB: "campsite", answer: "campfire"},
	{photoWord: "train tracks", photoFirst: true, photoWordB: "road", answer: "railroad"},
	{photoWord: "tooth", photoFirst: true, photoWordB: "hairbrush", answer: "toothbrush"},
	{photoWord: "snow", photoFirst: true, photoWordB: "ball", answer: "snowball"},

	// New entries converted directly from the plain-text "compound" list
	// below (rebusGeneratedSpecs) — each has at least one strong,
	// unambiguous, literal photographable noun. Where only one half
	// qualifies, textWord carries the other (unphotographable/abstract)
	// half as before.
	{photoWord: "baseball", photoFirst: false, textWord: "BASE", answer: "baseball"},
	{photoWord: "book", photoFirst: false, textWord: "NOTE", answer: "notebook"},
	{photoWord: "staircase", photoFirst: false, textWord: "UP", answer: "upstairs"},
	{photoWord: "staircase", photoFirst: false, textWord: "DOWN", answer: "downstairs"},
	{photoWord: "elderly man", photoFirst: false, textWord: "GRAND", answer: "grandfather"},
	{photoWord: "elderly woman", photoFirst: false, textWord: "GRAND", answer: "grandmother"},
	{photoWord: "classroom", photoFirst: false, textWord: "CLASS", answer: "classroom"},
	{photoWord: "snow", photoFirst: true, photoWordB: "person silhouette", answer: "snowman"},
	{photoWord: "lit lamp", photoFirst: true, photoWordB: "house", answer: "lighthouse"},
	{photoWord: "lightning bolt", photoFirst: true, photoWordB: "storm clouds", answer: "thunderstorm"},
	{photoWord: "newspaper", photoFirst: false, textWord: "NEWS", answer: "newspaper"},
	{photoWord: "coat", photoFirst: false, textWord: "OVER", answer: "overcoat"},
	{photoWord: "ocean", photoFirst: false, textWord: "OVER", answer: "overseas"},
	{photoWord: "human head", photoFirst: false, textWord: "OVER", answer: "overhead"},
	{photoWord: "dog", photoFirst: false, textWord: "UNDER", answer: "underdog"},
	{photoWord: "underwater scene", photoFirst: false, textWord: "UNDER", answer: "underwater"},
	{photoWord: "soil ground", photoFirst: false, textWord: "UNDER", answer: "underground"},

	// Fixes for the two hand-authored puzzles that mixed a plain text word
	// with an emoji (RAIN+BOW stays text — "bow" is too ambiguous a photo
	// subject on its own; CAT+NAP gets a real photo for CAT).
	{photoWord: "cat", photoFirst: true, textWord: "NAP", answer: "catnap"},
	{photoWord: "open book", photoFirst: true, photoWordB: "worm", answer: "bookworm", alternates: []string{"book worm"}},

	// ── New two-photo entries (added toward the ~300 target) — every one
	// checked to be a literal decomposition, not an etymology coincidence
	// (see the "nightmare"/"firecracker" cautions elsewhere in this file).
	{photoWord: "rain storm", photoFirst: true, photoWordB: "water droplet", answer: "raindrop"},
	{photoWord: "sun sky", photoFirst: true, photoWordB: "sunglasses", answer: "sunglasses"},
	{photoWord: "human eye", photoFirst: true, photoWordB: "ball", answer: "eyeball"},
	{photoWord: "human ear", photoFirst: true, photoWordB: "ring jewelry", answer: "earring"},
	{photoWord: "human arm", photoFirst: true, photoWordB: "chair", answer: "armchair"},
	{photoWord: "hand", photoFirst: true, photoWordB: "handbag", answer: "handbag"},
	{photoWord: "ocean", photoFirst: true, photoWordB: "seahorse", answer: "seahorse"},
	{photoWord: "ocean", photoFirst: true, photoWordB: "seaweed", answer: "seaweed"},
	{photoWord: "ocean", photoFirst: true, photoWordB: "beach shore", answer: "seashore"},
	{photoWord: "ocean", photoFirst: true, photoWordB: "seagull", answer: "seagull"},
	{photoWord: "flames", photoFirst: true, photoWordB: "firewood logs", answer: "firewood"},
	{photoWord: "flames", photoFirst: true, photoWordB: "firefighter", answer: "firefighter"},
	{photoWord: "windy trees", photoFirst: true, photoWordB: "windmill", answer: "windmill"},
	{photoWord: "honey jar", photoFirst: true, photoWordB: "honeycomb", answer: "honeycomb"},
	{photoWord: "rain", photoFirst: true, photoWordB: "rainforest", answer: "rainforest"},
	{photoWord: "snow", photoFirst: true, photoWordB: "snowflake closeup", answer: "snowflake"},
	{photoWord: "sandpaper texture", photoFirst: false, photoWordB: "paper sheet", answer: "sandpaper"},
	{photoWord: "teacup", photoFirst: true, photoWordB: "cake", answer: "cupcake"},
	{photoWord: "frying pan", photoFirst: true, photoWordB: "cake", answer: "pancake"},
	{photoWord: "cheese block", photoFirst: true, photoWordB: "cake", answer: "cheesecake"},
	{photoWord: "goldfish", photoFirst: true, photoWordB: "glass bowl", answer: "fishbowl"},

	// ── Second re-audit of rebusGeneratedSpecs' plain-text compounds
	// (2026-08-23) — 15 more entries moved here once a genuinely clean,
	// unambiguous noun was found on at least one side. Reuses several
	// photoWord terms already established elsewhere in this file (moon,
	// sun sky, water splash, foot, hand, road, small town street) rather
	// than inventing new search terms — confirmed safe: fetchSingleRebusPhoto
	// is called independently per puzzle, so the same term appearing in
	// multiple entries just means two separate live fetches, never a
	// shared/cached result that could leak one puzzle's photo into another.
	{photoWord: "sun sky", photoFirst: true, textWord: "SET", answer: "sunset"},
	{photoWord: "sun sky", photoFirst: true, textWord: "RISE", answer: "sunrise"},
	{photoWord: "moon", photoFirst: true, textWord: "SHINE", answer: "moonshine"},
	{photoWord: "water splash", photoFirst: true, textWord: "FALL", answer: "waterfall"},
	{photoWord: "foot", photoFirst: true, textWord: "PRINT", answer: "footprint"},
	{photoWord: "finger", photoFirst: true, textWord: "PRINT", answer: "fingerprint"},
	// OVER has no honest noun photo (a preposition) — TIME does, via the
	// same clock proxy already used for "downtime" (rebusIconSpecs).
	{photoWord: "clock", photoFirst: false, textWord: "OVER", answer: "overtime"},
	{photoWord: "house", photoFirst: true, textWord: "WORK", answer: "homework"},
	{photoWord: "house", photoFirst: true, photoWordB: "small town street", answer: "hometown"},
	// "heart shape" (a stylized Valentine heart), not a literal anatomical
	// photo — keeps this light/safe for a casual game.
	{photoWord: "heart shape", photoFirst: true, textWord: "BREAK", answer: "heartbreak"},
	{photoWord: "heart shape", photoFirst: true, textWord: "BEAT", answer: "heartbeat"},
	// BACK stays text here (directional "behind", not the body part) —
	// STAGE is the strong, unambiguous noun.
	{photoWord: "theater stage", photoFirst: false, textWord: "BACK", answer: "backstage"},
	{photoWord: "night sky stars", photoFirst: false, textWord: "MID", answer: "midnight"},
	{photoWord: "hand", photoFirst: true, textWord: "OUT", answer: "handout"},
	{photoWord: "road", photoFirst: false, textWord: "CROSS", answer: "crossroads"},
}

func (s rebusPhotoCompoundSpec) toPuzzle() RebusPuzzle {
	return RebusPuzzle{
		Answer:     s.answer,
		Alternates: s.alternates,
		PhotoWord:  s.photoWord,
		PhotoWordB: s.photoWordB,
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

// ── Mixed-visual compounds (added 2026-08-23) ────────────────────────────────
// A second re-audit of the plain-text "word+word" compounds still left in
// rebusGeneratedSpecs, prompted by a direct "why can't these use images"
// question. The blocker for most of them wasn't that no image exists at all
// — it's that words like OUT/IN/UP/OFF/BACK/CHECK/SPIN/END aren't literal
// *nouns* a Pexels search can honestly represent; they're directional/
// symbolic concepts. Rather than force a misleading stock photo, these use
// a small fixed set of local icons (rtIcon) instead — no live fetch, no risk
// of an ambiguous/wrong search result, and arguably more universally legible
// than a photo would be for a pure symbol anyway (an arrow unambiguously
// means "up"; a stock photo tagged "up" could be almost anything). Color
// words (BLACK/WHITE/BLUE) get a plain swatch chip (rtSwatch) for the same
// reason — a solid color IS the literal, unambiguous representation, no
// photo needed.
//
// Valid icon names (rendered by RebusPatternDisplay's RebusIconToken,
// frontend RebusRoundGame.jsx): "arrow-up" (UP), "log-in" (IN — entering),
// "log-out" (OUT — exiting), "power" (OFF — a power/toggle switch), "check"
// (CHECK — a checkmark), "refresh" (SPIN — rotation), "flag" (END — a
// finish-line flag), "undo" (BACK — a backward-curving arrow, used for the
// "in return/backward" sense of "back", not the body part — none of the
// remaining BACK-compounds mean the literal body part), "dollar" (PAY),
// "eye" (LOOK — deliberately distinct from "check"/checkmark).
//
// Same literal-syllable-spelling philosophy already established throughout
// rebusPhotoCompoundSpecs above (e.g. moonshine's photo has nothing to do
// with illegally distilled liquor, just spells out MOON+SHINE) — the image
// represents the word-PART, not necessarily the compound's final idiomatic
// meaning. Entries where the WHOLE compound's meaning has no honest
// connection to either half at all (nightmare/undermine/drawback — a photo
// there risks actively suggesting a wrong, specific, memorable wrong
// direction, not just an unrelated-but-harmless one) are deliberately left
// out and stay plain text in rebusGeneratedSpecs, unchanged.
type rebusMixedCompoundSpec struct {
	a, b       RebusCompoundPart
	answer     string
	alternates []string
}

func (s rebusMixedCompoundSpec) toPuzzle() RebusPuzzle {
	a, b := s.a, s.b
	return RebusPuzzle{Answer: s.answer, Alternates: s.alternates, PartA: &a, PartB: &b}
}

var rebusMixedCompoundSpecs = []rebusMixedCompoundSpec{
	{a: RebusCompoundPart{Swatch: "#0a0a0a"}, b: RebusCompoundPart{Text: "BOARD"}, answer: "blackboard"},
	{a: RebusCompoundPart{Icon: "log-out"}, b: RebusCompoundPart{Text: "SIDE"}, answer: "outside"},
	{a: RebusCompoundPart{Icon: "log-in"}, b: RebusCompoundPart{Text: "SIDE"}, answer: "inside"},
	{a: RebusCompoundPart{Text: "OVER"}, b: RebusCompoundPart{Icon: "eye"}, answer: "overlook"},
	{a: RebusCompoundPart{Icon: "log-in"}, b: RebusCompoundPart{Text: "COME"}, answer: "income"},
	{a: RebusCompoundPart{Icon: "log-in"}, b: RebusCompoundPart{Text: "PUT"}, answer: "input"},
	{a: RebusCompoundPart{Icon: "log-in"}, b: RebusCompoundPart{Text: "SIGHT"}, answer: "insight"},
	{a: RebusCompoundPart{Icon: "log-out"}, b: RebusCompoundPart{Text: "COME"}, answer: "outcome"},
	{a: RebusCompoundPart{Icon: "log-out"}, b: RebusCompoundPart{Icon: "eye"}, answer: "outlook"},
	{a: RebusCompoundPart{Icon: "log-out"}, b: RebusCompoundPart{Text: "LINE"}, answer: "outline"},
	{a: RebusCompoundPart{Icon: "log-out"}, b: RebusCompoundPart{Text: "BREAK"}, answer: "outbreak"},
	{a: RebusCompoundPart{Icon: "log-out"}, b: RebusCompoundPart{Text: "FIT"}, answer: "outfit"},
	{a: RebusCompoundPart{Icon: "log-out"}, b: RebusCompoundPart{Photo: "small plant sprout"}, answer: "outgrow"},
	{a: RebusCompoundPart{Icon: "log-out"}, b: RebusCompoundPart{Text: "LAST"}, answer: "outlast"},
	// Reuses "house" from rebusPhotoCompoundSpecs' homework/hometown entries.
	{a: RebusCompoundPart{Photo: "house"}, b: RebusCompoundPart{Text: "SICK"}, answer: "homesick"},
	{a: RebusCompoundPart{Icon: "undo"}, b: RebusCompoundPart{Photo: "soil ground"}, answer: "background"},
	{a: RebusCompoundPart{Icon: "undo"}, b: RebusCompoundPart{Photo: "flames"}, answer: "backfire"},
	{a: RebusCompoundPart{Text: "WEEK"}, b: RebusCompoundPart{Icon: "flag"}, answer: "weekend"},
	{a: RebusCompoundPart{Icon: "power"}, b: RebusCompoundPart{Photo: "coiled metal spring"}, answer: "offspring"},
	{a: RebusCompoundPart{Icon: "power"}, b: RebusCompoundPart{Text: "SET"}, answer: "offset"},
	{a: RebusCompoundPart{Icon: "arrow-up"}, b: RebusCompoundPart{Text: "KEEP"}, answer: "upkeep"},
	{a: RebusCompoundPart{Swatch: "#2563eb"}, b: RebusCompoundPart{Text: "PRINT"}, answer: "blueprint"},
	{a: RebusCompoundPart{Swatch: "#0a0a0a"}, b: RebusCompoundPart{Icon: "log-out"}, answer: "blackout"},
	{a: RebusCompoundPart{Swatch: "#ffffff"}, b: RebusCompoundPart{Icon: "log-out"}, answer: "whiteout"},
	{a: RebusCompoundPart{Photo: "flames"}, b: RebusCompoundPart{Icon: "log-out"}, answer: "burnout"},
	{a: RebusCompoundPart{Text: "WORK"}, b: RebusCompoundPart{Icon: "log-out"}, answer: "workout"},
	{a: RebusCompoundPart{Text: "DROP"}, b: RebusCompoundPart{Icon: "log-out"}, answer: "dropout"},
	{a: RebusCompoundPart{Icon: "check"}, b: RebusCompoundPart{Icon: "log-out"}, answer: "checkout"},
	{a: RebusCompoundPart{Photo: "person lying down"}, b: RebusCompoundPart{Icon: "log-out"}, answer: "layout"},
	// A "person falling" photo, unlike a bare "fall" search, doesn't risk
	// being read as the autumn season instead.
	{a: RebusCompoundPart{Photo: "person falling"}, b: RebusCompoundPart{Icon: "log-out"}, answer: "fallout"},
	{a: RebusCompoundPart{Text: "KNOCK"}, b: RebusCompoundPart{Icon: "log-out"}, answer: "knockout"},
	{a: RebusCompoundPart{Text: "BREAK"}, b: RebusCompoundPart{Icon: "log-out"}, answer: "breakout"},
	{a: RebusCompoundPart{Icon: "refresh"}, b: RebusCompoundPart{Icon: "power"}, answer: "spinoff"},
	{a: RebusCompoundPart{Photo: "soccer player kicking ball"}, b: RebusCompoundPart{Icon: "power"}, answer: "kickoff"},
	{a: RebusCompoundPart{Text: "STAND"}, b: RebusCompoundPart{Icon: "power"}, answer: "standoff"},
	{a: RebusCompoundPart{Text: "TAKE"}, b: RebusCompoundPart{Icon: "power"}, answer: "takeoff"},
	{a: RebusCompoundPart{Text: "PLAY"}, b: RebusCompoundPart{Icon: "power"}, answer: "playoff"},
	{a: RebusCompoundPart{Text: "SHOW"}, b: RebusCompoundPart{Icon: "power"}, answer: "showoff"},
	{a: RebusCompoundPart{Photo: "person running"}, b: RebusCompoundPart{Icon: "power"}, answer: "runoff"},
	{a: RebusCompoundPart{Text: "SET"}, b: RebusCompoundPart{Icon: "undo"}, answer: "setback"},
	{a: RebusCompoundPart{Text: "FEED"}, b: RebusCompoundPart{Icon: "undo"}, answer: "feedback"},
	{a: RebusCompoundPart{Text: "COME"}, b: RebusCompoundPart{Icon: "undo"}, answer: "comeback"},
	{a: RebusCompoundPart{Photo: "person throwing"}, b: RebusCompoundPart{Icon: "undo"}, answer: "throwback"},
	{a: RebusCompoundPart{Icon: "dollar"}, b: RebusCompoundPart{Icon: "undo"}, answer: "payback"},
	{a: RebusCompoundPart{Icon: "eye"}, b: RebusCompoundPart{Icon: "log-out"}, answer: "lookout"},
	{a: RebusCompoundPart{Text: "HIDE"}, b: RebusCompoundPart{Icon: "log-out"}, answer: "hideout"},
	{a: RebusCompoundPart{Text: "CUT"}, b: RebusCompoundPart{Icon: "undo"}, answer: "cutback"},
	{a: RebusCompoundPart{Text: "ROLL"}, b: RebusCompoundPart{Icon: "undo"}, answer: "rollback"},
}

func rebusMixedCompoundBank() []RebusPuzzle {
	out := make([]RebusPuzzle, len(rebusMixedCompoundSpecs))
	for i, s := range rebusMixedCompoundSpecs {
		out[i] = s.toPuzzle()
	}
	return out
}

// rebusPexelsMaxAttempts / rebusPexelsRetryDelay — a transient Pexels/network
// hiccup (the actual reported cause of "poor loading images") shouldn't force
// the whole round-start to fail and make the host click "Start" again; retry
// the fetch itself a couple of times first. Deliberately retries on ANY
// error (network failure, non-200 status, bad JSON, too few usable photos)
// rather than trying to classify which errors are "worth" retrying — every
// case here is either transient or so rare that one more attempt is cheap
// insurance, and a genuinely persistent failure (e.g. no API key configured)
// still surfaces the same clear error after the retries are exhausted.
const rebusPexelsMaxAttempts = 3

var rebusPexelsRetryDelay = 300 * time.Millisecond

// rebusWithPexelsRetry calls fn up to rebusPexelsMaxAttempts times, pausing
// rebusPexelsRetryDelay between attempts, returning the last error if every
// attempt fails. Generic so both fetchFourFramesPhotos ([]string) and
// fetchSingleRebusPhoto (string) can share one retry loop instead of each
// hand-rolling its own.
func rebusWithPexelsRetry[T any](fn func() (T, error)) (T, error) {
	var result T
	var lastErr error
	for attempt := 1; attempt <= rebusPexelsMaxAttempts; attempt++ {
		result, lastErr = fn()
		if lastErr == nil {
			return result, nil
		}
		if attempt < rebusPexelsMaxAttempts {
			time.Sleep(rebusPexelsRetryDelay)
		}
	}
	return result, lastErr
}

// fetchSingleRebusPhoto fetches one usable photo URL from Pexels for a
// photo-compound puzzle's photographed half — a smaller sibling of
// fetchFourFramesPhotos (which needs exactly 4 for a 2x2 grid); both live in
// the same games package and share fourFramesHTTPClient/pexelsPhotoResponse
// rather than duplicating the client setup. Requests a handful of candidates
// (not just the single top result) so a top hit with no usable Large/Medium
// URL doesn't fail the whole fetch outright — falls through to the next one.
func fetchSingleRebusPhoto(word string) (string, error) {
	apiKey := os.Getenv("PEXELS_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("PEXELS_API_KEY is not configured")
	}

	return rebusWithPexelsRetry(func() (string, error) {
		// per_page bumped 5 -> 10: with the relevance check below, a wider
		// candidate pool gives the filter a real chance to find a genuinely
		// on-topic photo instead of settling for whatever came back first.
		endpoint := "https://api.pexels.com/v1/search?query=" + url.QueryEscape(word) + "&per_page=10&orientation=square"
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
		// Two passes, mirroring fetchFourFramesPhotos: prefer a photo whose alt
		// text plausibly matches the word (see pexelsAltLooksRelevant's own doc
		// comment for the confirmed real "bat" -> baseball-photo mismatch this
		// closes); fall back to the first usable URL regardless of relevance
		// only if nothing in the pool passes — never fail the puzzle outright
		// just because the relevance filter was stricter than the pool allows.
		var fallback string
		for _, p := range parsed.Photos {
			u := p.Src.Large
			if u == "" {
				u = p.Src.Medium
			}
			if u == "" {
				continue
			}
			if pexelsAltLooksRelevant(word, p.Alt) {
				return u, nil
			}
			if fallback == "" {
				fallback = u
			}
		}
		if fallback != "" {
			return fallback, nil
		}
		return "", fmt.Errorf("Pexels returned no usable photo for query %q", word)
	})
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
	// CAT+NAP and BOOK+🐛 moved to rebusPhotoCompoundSpecs — both now use a
	// real photo instead of mixing plain text (or, for BOOK, text mixed with
	// an emoji for the *other* half) with a picture.
	{
		Pattern: []RebusToken{rt("RAIN"), rtOp("+"), rt("BOW")},
		Answer:  "rainbow",
	},
	{
		Pattern: []RebusToken{rt("⭐"), rtOp("+"), rt("🐟")},
		Answer:  "starfish",
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
// generated + icon + photo-compound) that rebusShuffledPuzzles() draws from.
// Computed once at package init via a fresh backing array (not
// append(rebusHandAuthoredBank, ...) directly) so growing any of the other
// banks later can never alias/corrupt rebusHandAuthoredBank's own underlying
// array. Sized to land at ~300 total across all four sources.
var rebusPuzzleBank = append(append(append(append(append([]RebusPuzzle{}, rebusHandAuthoredBank...), rebusGeneratedBank()...), rebusIconBank()...), rebusPhotoCompoundBank()...), rebusMixedCompoundBank()...)

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

// ── Wrong-guess hints, shared by Rebus Round and Four Frames ────────────────
// Both games track each player's own wrong-guess count for the CURRENT round
// only (reset at every *_start move) — a hint only ever appears in that
// player's own rejection message, matching how these rejections were already
// private per-move-sender before this feature existed. Escalates gently: the
// very first wrong guess gets no hint at all (don't spoil an easy puzzle on
// the first miss), the second reveals a hint, the third+ also reveals the
// first letter.
const (
	rebusHintAfterAttempt      = 2 // show a hint starting on this wrong attempt
	rebusFirstLetterAfterAttempt = 3 // also reveal the first letter starting here
)

// rebusIncrementWrongAttempts reads/writes gameState.GameData[stateKey] (a
// map[string]interface{} keyed by player ID string) and returns the new
// count for playerID — the same shape both games use, just under their own
// key ("wrong_attempts") so tracking never collides across a room running
// two different games (not possible today, but keeps the key namespaced).
func rebusIncrementWrongAttempts(gameState *GameSessionState, stateKey string, playerID uint) int {
	raw, _ := gameState.GameData[stateKey].(map[string]interface{})
	if raw == nil {
		raw = map[string]interface{}{}
	}
	key := fmt.Sprintf("%d", playerID)
	count, _ := raw[key].(float64)
	count++
	raw[key] = count
	gameState.GameData[stateKey] = raw
	return int(count)
}

// rebusResetWrongAttempts clears the per-round tracking map — called from
// both games' *_start handlers alongside their other per-round resets.
func rebusResetWrongAttempts(gameState *GameSessionState, stateKey string) {
	gameState.GameData[stateKey] = map[string]interface{}{}
}

// rebusGenericHint produces a hint from the answer text alone, for puzzles
// with no hand-authored Hint — which is most of them (300 Rebus puzzles and
// the entire Four Frames word bank have no per-entry Hint at all). Reports
// word/letter counts rather than anything that could read as a spoiler.
func rebusGenericHint(answer string) string {
	words := strings.Fields(answer)
	if len(words) == 0 {
		return ""
	}
	if len(words) == 1 {
		return fmt.Sprintf("it's %d letters", len([]rune(words[0])))
	}
	lens := make([]string, len(words))
	total := 0
	for i, w := range words {
		n := len([]rune(w))
		lens[i] = fmt.Sprintf("%d", n)
		total += n
	}
	return fmt.Sprintf("it's %d words (%s letters)", len(words), strings.Join(lens, "+"))
}

// rebusHintForAttempt builds the full wrong-guess suffix for the given
// attempt count — "" before rebusHintAfterAttempt, otherwise the puzzle's own
// authored hint (falling back to rebusGenericHint when none was authored),
// plus a first-letter reveal once attemptCount reaches
// rebusFirstLetterAfterAttempt. answer/authoredHint are passed separately
// (rather than a RebusPuzzle) so the identical logic works for Four Frames'
// FourFramesRound too, without either game needing the other's struct type.
func rebusHintForAttempt(answer, authoredHint string, attemptCount int) string {
	if attemptCount < rebusHintAfterAttempt {
		return ""
	}
	hint := authoredHint
	if hint == "" {
		hint = rebusGenericHint(answer)
	}
	if attemptCount >= rebusFirstLetterAfterAttempt {
		trimmed := strings.TrimSpace(answer)
		if trimmed != "" {
			first := []rune(trimmed)[0]
			hint = fmt.Sprintf("%s, starts with '%s'", hint, strings.ToUpper(string(first)))
		}
	}
	if hint == "" {
		return ""
	}
	return " Hint: " + hint
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
			// Live-fetch puzzle — Pattern was left empty at shuffle time; fetch
			// the real photo(s) now (same live-fetch-at-round-start shape as
			// four_frames_start) and assemble the final pattern. Three shapes,
			// depending on which other fields are set — see RebusPuzzle's own
			// doc comment.
			photoURL, ferr := rebusPhotoFetcher(puzzle.PhotoWord)
			if ferr != nil {
				log.Printf("⚠️ [RebusRound] Pexels fetch failed for %q: %v", puzzle.PhotoWord, ferr)
				return false, nil, fmt.Errorf("couldn't load the picture for this puzzle — try again")
			}
			photoTok := rtImg(photoURL)
			switch {
			case puzzle.PhotoWordB != "":
				photoURLB, ferrB := rebusPhotoFetcher(puzzle.PhotoWordB)
				if ferrB != nil {
					log.Printf("⚠️ [RebusRound] Pexels fetch failed for %q: %v", puzzle.PhotoWordB, ferrB)
					return false, nil, fmt.Errorf("couldn't load the picture for this puzzle — try again")
				}
				photoTokB := rtImg(photoURLB)
				if puzzle.PhotoFirst {
					pattern = []RebusToken{photoTok, rtOp("+"), photoTokB}
				} else {
					pattern = []RebusToken{photoTokB, rtOp("+"), photoTok}
				}
			case puzzle.TextWord != "":
				textTok := rt(puzzle.TextWord)
				if puzzle.PhotoFirst {
					pattern = []RebusToken{photoTok, rtOp("+"), textTok}
				} else {
					pattern = []RebusToken{textTok, rtOp("+"), photoTok}
				}
			default:
				// Single styled image — replaces what would otherwise be a
				// scaled/positioned text word (rebusIconSpecs).
				photoTok.Scale = puzzle.PhotoScale
				photoTok.Sub = puzzle.PhotoSub
				photoTok.Sup = puzzle.PhotoSup
				pattern = []RebusToken{photoTok}
			}
		} else if puzzle.PartA != nil && puzzle.PartB != nil {
			// Mixed-visual compound (rebusMixedCompoundSpecs) — each half
			// independently resolves to text/icon/swatch/photo.
			tokA, ferrA := resolveRebusCompoundPart(*puzzle.PartA)
			if ferrA != nil {
				log.Printf("⚠️ [RebusRound] Pexels fetch failed for mixed compound part %+v: %v", puzzle.PartA, ferrA)
				return false, nil, fmt.Errorf("couldn't load the picture for this puzzle — try again")
			}
			tokB, ferrB := resolveRebusCompoundPart(*puzzle.PartB)
			if ferrB != nil {
				log.Printf("⚠️ [RebusRound] Pexels fetch failed for mixed compound part %+v: %v", puzzle.PartB, ferrB)
				return false, nil, fmt.Errorf("couldn't load the picture for this puzzle — try again")
			}
			pattern = []RebusToken{tokA, rtOp("+"), tokB}
		}
		gameState.GameData["phase"] = "puzzle"
		gameState.GameData["round"] = float64(nextIdx + 1)
		gameState.GameData["current_pattern"] = pattern
		gameState.GameData["correct_order"] = []interface{}{}
		gameState.GameData["revealed_answer"] = ""
		gameState.GameData["revealed_alternates"] = []interface{}{}
		gameState.GameData["started_at"] = float64(time.Now().UnixMilli())
		rebusResetWrongAttempts(gameState, "wrong_attempts")
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
			attempts := rebusIncrementWrongAttempts(gameState, "wrong_attempts", playerID)
			return false, nil, fmt.Errorf("not quite — try again!%s", rebusHintForAttempt(puzzle.Answer, puzzle.Hint, attempts))
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
		gameState.GameData["set_complete_no_winner"] = false

		// Puzzles are gated into sets of rebusSetSize (20): once a set
		// finishes, check whether someone has pulled decisively ahead. If so,
		// the game ends right here — no need to grind through the remaining
		// sets once the outcome is already settled. If it's a tie (including
		// everyone still at 0), play continues into the next set. The very
		// last set reaching this same "no sole leader" state is exactly a
		// draw — no special-casing needed, since round hitting
		// len(RebusPuzzles) already routes to the existing "Show Results"
		// flow, which computes the identical tie-is-a-draw result via
		// rebusWinnerFromScores below.
		isSetBoundary := int(round) > 0 && int(round)%rebusSetSize == 0
		if isSetBoundary {
			if winner := rebusWinnerFromScores(gameState); winner != nil {
				gameState.GameData["phase"] = "ended"
				return true, winner, nil
			}
			gameState.GameData["set_complete_no_winner"] = true
		}
		return false, nil, nil

	case "rebus_end":
		// Host-only, mirrors trivia_end exactly: winner is computed from
		// whatever scores exist right now, covering both "Show Results" after
		// the last puzzle and an early "End Game" mid-session.
		if playerID != hostID {
			return false, nil, fmt.Errorf("only the host can end the game")
		}
		wID := rebusWinnerFromScores(gameState)
		gameState.GameData["phase"] = "ended"
		return true, wID, nil

	default:
		return false, nil, fmt.Errorf("unknown rebus_round move type: %s", moveType)
	}
}

// rebusSetSize gates puzzles into batches — after every rebusSetSize'th
// puzzle is revealed, the game checks whether someone has pulled decisively
// ahead (rebusWinnerFromScores) before letting play continue into the next
// batch. 300 total puzzles / 20 per set = 15 sets exactly.
const rebusSetSize = 20

// rebusWinnerFromScores returns the sole highest-scoring player, or nil if
// there's a tie (including everyone still at 0 — the very first check ever
// run naturally lands here, since every player starts at bestScore's initial
// sentinel simultaneously). Shared by the reveal-time set-boundary check and
// rebus_end, so "no clear leader" always means the same thing regardless of
// which of the two triggers it.
func rebusWinnerFromScores(gameState *GameSessionState) *uint {
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
	if len(winners) == 1 {
		return &winners[0]
	}
	return nil
}
