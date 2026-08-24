package games

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// ── Four Frames — "4 real photos, 1 hidden word" ────────────────────────────
// Same race-to-answer shape as Rebus Round (processRebusRoundMove), but
// instead of a hand-built/procedurally-generated typography pattern, each
// round's clue is 4 real photos fetched live from the Pexels API
// (https://www.pexels.com/api/) — never bundled or pre-curated. This is the
// picture-guessing mechanic popularized by "4 Pics 1 Word" (a LOTUM GmbH
// trademark — intentionally not this game's name, same reasoning as Rebus
// Round not being called "Dingbats"), rebuilt from scratch: no open-source
// clone of that game exists with real, legally-usable photo content (checked
// 2026-08-12 — every GitHub result is either a *solver* for the real app, or
// a small hobby project with no content of its own). Fetching from a stock-
// photo API at round-start time solves the actual hard part (a large bank of
// real, licensed photos) without hosting a single image ourselves — the same
// "external content API instead of a fixed bank" pattern already proven in
// this package for Trivia (OpenTDB) and Karaoke (LRCLIB), except this one
// must run server-side: the Pexels API key is a secret and must never reach
// the frontend bundle, unlike OpenTDB/LRCLIB which are called client-side
// because they need no key at all.

// FourFramesRound is one row of the session's word list — just the answer
// word/phrase (+ optional alternates/hint), never the photos. Photos are
// fetched fresh from Pexels the moment a round actually starts, so the same
// word can show different photos across different sessions/rooms.
type FourFramesRound struct {
	Word       string
	Alternates []string
	Hint       string
}

// fourFramesWordBank — concrete, unambiguous, commonly-photographed nouns.
// Deliberately avoids anything abstract ("freedom", "happiness") or visually
// ambiguous (a word with many unrelated meanings) — Pexels' own search
// relevance is the thing standing between a fair puzzle and a confusing one,
// so the word itself needs to be a strong, singular visual concept.
var fourFramesWordBank = []FourFramesRound{
	// Animals
	{Word: "elephant"},
	{Word: "giraffe"},
	{Word: "penguin"},
	{Word: "dolphin"},
	{Word: "butterfly"},
	{Word: "owl"},
	{Word: "kangaroo"},
	{Word: "octopus"},
	{Word: "flamingo"},
	{Word: "chameleon"},
	{Word: "koala"},
	{Word: "peacock"},
	{Word: "hedgehog"},
	{Word: "jellyfish"},
	{Word: "seahorse"},
	{Word: "squirrel"},
	{Word: "raccoon"},
	{Word: "polar bear", Alternates: []string{"polarbear"}},
	{Word: "sea turtle", Alternates: []string{"turtle"}},

	// Food & drink
	{Word: "pizza"},
	{Word: "sushi"},
	{Word: "watermelon"},
	{Word: "pancake", Alternates: []string{"pancakes"}},
	{Word: "popcorn"},
	{Word: "avocado"},
	{Word: "croissant"},
	{Word: "taco", Alternates: []string{"tacos"}},
	{Word: "donut", Alternates: []string{"doughnut"}},
	{Word: "strawberry", Alternates: []string{"strawberries"}},
	{Word: "coffee"},
	{Word: "ice cream", Alternates: []string{"icecream"}},
	{Word: "honey"},
	{Word: "pumpkin"},
	{Word: "cactus"},

	// Objects
	{Word: "umbrella"},
	{Word: "bicycle", Alternates: []string{"bike"}},
	{Word: "guitar"},
	{Word: "telescope"},
	{Word: "lighthouse"},
	{Word: "hammock"},
	{Word: "kite"},
	{Word: "compass"},
	{Word: "anchor"},
	{Word: "camera"},
	{Word: "typewriter"},
	{Word: "lantern"},
	{Word: "chandelier"},
	{Word: "violin"},
	{Word: "piano"},
	{Word: "telephone booth", Alternates: []string{"phone booth"}},

	// Nature
	{Word: "waterfall"},
	{Word: "volcano"},
	{Word: "glacier"},
	{Word: "rainbow"},
	{Word: "desert"},
	{Word: "canyon"},
	{Word: "coral reef", Alternates: []string{"coral"}},
	{Word: "sunflower"},
	{Word: "cherry blossom", Alternates: []string{"cherry blossoms"}},
	{Word: "aurora borealis", Alternates: []string{"northern lights", "aurora"}},
	{Word: "sand dune", Alternates: []string{"sand dunes", "dune"}},
	{Word: "iceberg"},

	// Places / structures
	{Word: "castle"},
	{Word: "pyramid", Alternates: []string{"pyramids"}},
	{Word: "windmill"},
	{Word: "igloo"},
	{Word: "treehouse"},
	{Word: "greenhouse"},
	{Word: "bridge"},
	{Word: "maze"},

	// Transport
	{Word: "helicopter"},
	{Word: "submarine"},
	{Word: "hot air balloon", Alternates: []string{"balloon"}},
	{Word: "sailboat"},
	{Word: "train"},
	{Word: "rocket"},
	{Word: "cable car", Alternates: []string{"gondola"}},

	// Weather / phenomena
	{Word: "fireworks"},
	{Word: "campfire"},
	{Word: "snowflake"},
	{Word: "thunderstorm"},
	{Word: "lightning"},

	// ── Bank expansion (added 2026-08-20) — grown well past the original 82
	// so a single sitting takes far longer to exhaust the pool and repeats
	// across sessions become far less noticeable. Same rule as above: only
	// concrete, unambiguous, commonly-photographed nouns — nothing abstract.

	// More animals
	{Word: "tiger"},
	{Word: "lion"},
	{Word: "zebra"},
	{Word: "panda"},
	{Word: "gorilla"},
	{Word: "cheetah"},
	{Word: "leopard"},
	{Word: "rhinoceros", Alternates: []string{"rhino"}},
	{Word: "hippopotamus", Alternates: []string{"hippo"}},
	{Word: "crocodile"},
	{Word: "alligator"},
	{Word: "wolf"},
	{Word: "fox"},
	{Word: "deer"},
	{Word: "moose"},
	{Word: "bison"},
	{Word: "camel"},
	{Word: "llama"},
	{Word: "sloth"},
	{Word: "armadillo"},
	{Word: "otter"},
	{Word: "beaver"},
	{Word: "badger"},
	{Word: "meerkat"},
	{Word: "lemur"},
	{Word: "orangutan"},
	{Word: "chimpanzee"},
	// "bat" removed entirely (2026-08) — genuinely, not just once, confirmed
	// live against the real Pexels API across 5 different search phrasings
	// ("bat", "flying bat", "bat animal", "vampire bat", "bat wings"), every
	// one of which returned mostly baseball, birds, random zoo animals, or
	// Halloween-costume photos rather than the animal — no query phrasing
	// reliably fixed it, so rather than ship a known-unreliable puzzle this
	// entry is dropped instead of "fixed" with a disambiguation that doesn't
	// actually work. See pexelsAltLooksRelevant's own doc comment for the
	// general-purpose filter added alongside this — that filter does work
	// well for ordinary unambiguous nouns (confirmed live for "elephant":
	// 4/4 genuinely correct matches, zero fallback needed); "bat" was a
	// genuine outlier, not evidence the filter itself is unreliable.
	{Word: "eagle"},
	{Word: "falcon"},
	{Word: "parrot"},
	{Word: "toucan"},
	{Word: "hummingbird"},
	{Word: "woodpecker"},
	{Word: "swan"},
	{Word: "pelican"},
	{Word: "puffin"},
	{Word: "stork"},
	{Word: "ostrich"},
	{Word: "rooster"},
	{Word: "turkey"},
	{Word: "goat"},
	{Word: "sheep"},
	{Word: "donkey"},
	{Word: "rabbit"},
	{Word: "hamster"},
	{Word: "guinea pig"},
	{Word: "ferret"},
	{Word: "tortoise"},
	{Word: "iguana"},
	{Word: "gecko"},
	{Word: "frog"},
	{Word: "snail"},
	{Word: "walrus"},
	{Word: "orca", Alternates: []string{"killer whale"}},
	{Word: "shark"},
	{Word: "stingray"},
	{Word: "clownfish"},
	{Word: "crab"},
	{Word: "lobster"},
	{Word: "shrimp"},
	{Word: "seal"},
	{Word: "mongoose"},
	{Word: "wombat"},
	{Word: "platypus"},

	// More food & drink
	{Word: "burger", Alternates: []string{"hamburger"}},
	{Word: "hot dog"},
	{Word: "sandwich"},
	{Word: "spaghetti"},
	{Word: "lasagna"},
	{Word: "dumpling", Alternates: []string{"dumplings"}},
	{Word: "ramen"},
	{Word: "burrito"},
	{Word: "nachos"},
	{Word: "pretzel"},
	{Word: "bagel"},
	{Word: "waffle", Alternates: []string{"waffles"}},
	{Word: "cupcake"},
	{Word: "muffin"},
	{Word: "cookie", Alternates: []string{"cookies"}},
	{Word: "cake"},
	{Word: "pie"},
	{Word: "chocolate bar"},
	{Word: "candy cane"},
	{Word: "lollipop"},
	{Word: "gummy bear", Alternates: []string{"gummy bears"}},
	{Word: "marshmallow", Alternates: []string{"marshmallows"}},
	{Word: "cheese wheel", Alternates: []string{"cheese"}},
	{Word: "grapes"},
	{Word: "banana"},
	{Word: "orange fruit", Alternates: []string{"orange"}},
	{Word: "apple"},
	{Word: "pineapple"},
	{Word: "mango"},
	{Word: "kiwi fruit", Alternates: []string{"kiwi"}},
	{Word: "cherry", Alternates: []string{"cherries"}},
	{Word: "blueberry", Alternates: []string{"blueberries"}},
	{Word: "raspberry", Alternates: []string{"raspberries"}},
	{Word: "coconut"},
	{Word: "lemon"},
	{Word: "lime fruit", Alternates: []string{"lime"}},
	{Word: "peach"},
	{Word: "pear"},
	{Word: "grapefruit"},
	{Word: "fig"},
	{Word: "pomegranate"},
	{Word: "corn on the cob", Alternates: []string{"corn"}},
	{Word: "carrot"},
	{Word: "broccoli"},
	{Word: "mushroom"},
	{Word: "eggplant"},
	{Word: "bell pepper"},
	{Word: "tomato"},
	{Word: "cucumber"},
	{Word: "garlic"},
	{Word: "onion"},
	{Word: "ginger root", Alternates: []string{"ginger"}},
	{Word: "chili pepper", Alternates: []string{"chilli pepper"}},
	{Word: "milk carton"},
	{Word: "teacup"},
	{Word: "lemonade"},
	{Word: "smoothie"},
	{Word: "milkshake"},
	{Word: "popsicle"},
	{Word: "wine glass"},
	{Word: "champagne"},
	{Word: "bacon"},
	{Word: "bread loaf", Alternates: []string{"bread"}},

	// More objects
	{Word: "scissors"},
	{Word: "hourglass"},
	{Word: "magnifying glass"},
	{Word: "binoculars"},
	{Word: "microscope"},
	{Word: "globe"},
	{Word: "treasure chest"},
	{Word: "padlock"},
	{Word: "magnet"},
	{Word: "hammer"},
	{Word: "screwdriver"},
	{Word: "paintbrush"},
	{Word: "easel"},
	{Word: "sewing machine"},
	{Word: "spinning wheel"},
	{Word: "rocking chair"},
	{Word: "wheelbarrow"},
	{Word: "ladder"},
	{Word: "toolbox"},
	{Word: "flashlight", Alternates: []string{"torch"}},
	{Word: "candle"},
	{Word: "matchbox"},
	{Word: "pocket watch"},
	{Word: "wristwatch"},
	{Word: "sunglasses"},
	{Word: "suitcase"},
	{Word: "wallet"},
	{Word: "handbag"},
	{Word: "necklace"},
	{Word: "crown"},
	{Word: "tiara"},
	{Word: "trophy cup", Alternates: []string{"trophy"}},
	{Word: "medal"},
	{Word: "drum set", Alternates: []string{"drums"}},
	{Word: "saxophone"},
	{Word: "trumpet"},
	{Word: "harp"},
	{Word: "accordion"},
	{Word: "tambourine"},
	{Word: "xylophone"},
	{Word: "microphone"},
	{Word: "headphones"},
	{Word: "boombox"},
	{Word: "record player"},
	{Word: "film projector"},
	{Word: "roller skates"},
	{Word: "skateboard"},
	{Word: "surfboard"},
	{Word: "snowboard"},
	{Word: "tennis racket"},
	{Word: "basketball hoop"},
	{Word: "bowling pin"},
	{Word: "dartboard"},
	{Word: "chess board", Alternates: []string{"chessboard"}},
	{Word: "dice"},
	{Word: "playing cards"},
	{Word: "jigsaw puzzle"},
	{Word: "teddy bear"},
	{Word: "rubber duck"},
	{Word: "yo-yo", Alternates: []string{"yoyo"}},
	{Word: "kaleidoscope"},
	{Word: "wind chime", Alternates: []string{"wind chimes"}},
	{Word: "birdhouse"},
	{Word: "mailbox"},
	{Word: "fire hydrant"},
	{Word: "traffic light"},
	{Word: "park bench"},
	{Word: "picnic basket"},
	{Word: "tent", Alternates: []string{"camping tent"}},
	{Word: "sleeping bag"},
	{Word: "canteen"},
	{Word: "fishing rod"},

	// More nature
	{Word: "mountain peak", Alternates: []string{"mountain"}},
	{Word: "forest"},
	{Word: "jungle"},
	{Word: "meadow"},
	{Word: "valley"},
	{Word: "cave"},
	{Word: "geyser"},
	{Word: "hot spring"},
	{Word: "lagoon"},
	{Word: "lake"},
	{Word: "river"},
	{Word: "cliff"},
	{Word: "beach"},
	{Word: "tide pool", Alternates: []string{"tidepool"}},
	{Word: "mangrove"},
	{Word: "bamboo forest", Alternates: []string{"bamboo"}},
	{Word: "redwood tree", Alternates: []string{"redwood"}},
	{Word: "oak tree", Alternates: []string{"oak"}},
	{Word: "palm tree"},
	{Word: "willow tree", Alternates: []string{"willow"}},
	{Word: "autumn leaves", Alternates: []string{"fall leaves"}},
	{Word: "tulip field", Alternates: []string{"tulips"}},
	{Word: "lavender field", Alternates: []string{"lavender"}},
	{Word: "rose"},
	{Word: "daisy"},
	{Word: "orchid"},
	{Word: "lily pad"},
	{Word: "cattail", Alternates: []string{"cattails"}},
	{Word: "dew drop", Alternates: []string{"dewdrop"}},
	{Word: "snowcapped mountain"},
	{Word: "tornado"},
	{Word: "hurricane"},
	{Word: "sunset"},
	{Word: "starry sky"},
	{Word: "milky way"},
	{Word: "comet"},
	{Word: "shooting star"},
	{Word: "meteor shower"},
	{Word: "full moon"},
	{Word: "crescent moon"},
	{Word: "solar eclipse"},

	// More places / structures
	{Word: "skyscraper"},
	{Word: "barn"},
	{Word: "farmhouse"},
	{Word: "cabin"},
	{Word: "cottage"},
	{Word: "mosque"},
	{Word: "temple"},
	{Word: "church building", Alternates: []string{"church"}},
	{Word: "stadium"},
	{Word: "amphitheater", Alternates: []string{"amphitheatre"}},
	{Word: "colosseum"},
	{Word: "fountain"},
	{Word: "clock tower"},
	{Word: "ferris wheel"},
	{Word: "carousel", Alternates: []string{"merry go round"}},
	{Word: "roller coaster"},
	{Word: "amusement park"},
	{Word: "museum building", Alternates: []string{"museum"}},
	{Word: "library building", Alternates: []string{"library"}},
	{Word: "observatory"},
	{Word: "dam"},
	{Word: "aqueduct"},
	{Word: "tunnel"},
	{Word: "spiral staircase"},
	{Word: "gazebo"},
	{Word: "pier"},
	{Word: "dock"},
	{Word: "marketplace stalls", Alternates: []string{"market stall"}},
	{Word: "circus tent"},

	// More transport
	{Word: "airplane", Alternates: []string{"aeroplane", "plane"}},
	{Word: "bus"},
	{Word: "taxi"},
	{Word: "tractor"},
	{Word: "fire truck"},
	{Word: "ambulance"},
	{Word: "motorcycle"},
	{Word: "scooter"},
	{Word: "canoe"},
	{Word: "kayak"},
	{Word: "yacht"},
	{Word: "cruise ship"},
	{Word: "tugboat"},
	{Word: "jet ski"},
	{Word: "unicycle"},
	{Word: "go kart"},
	{Word: "monster truck"},
	{Word: "tram"},
	{Word: "subway train"},
	{Word: "race car"},
	{Word: "bulldozer"},
	{Word: "crane machine", Alternates: []string{"construction crane"}},
	{Word: "forklift"},

	// More weather / phenomena
	{Word: "rainstorm"},
	{Word: "hailstorm"},
	{Word: "fog"},
	{Word: "frost"},
	{Word: "icicle", Alternates: []string{"icicles"}},
	{Word: "blizzard"},
	{Word: "sandstorm"},
	{Word: "whirlwind"},
	{Word: "double rainbow"},
	{Word: "sun rays", Alternates: []string{"sunrays"}},
	{Word: "storm clouds"},

	// ── Bank expansion (added 2026-08-24) — same "concrete, unambiguous,
	// commonly-photographed noun" bar as every entry above, spanning several
	// fresh categories the original bank barely touched.
	// Musical instruments
	{Word: "drum kit"},
	{Word: "cello"},
	{Word: "flute"},
	{Word: "banjo"},
	{Word: "accordion player"},
	{Word: "guitar amplifier"},

	// Sports & games
	{Word: "golf club"},
	{Word: "baseball bat"},
	{Word: "soccer ball"},
	{Word: "skateboard ramp"},
	{Word: "ski boots"},
	{Word: "hockey stick"},
	{Word: "boxing gloves"},
	{Word: "poker chips"},
	{Word: "rubik's cube"},

	// Kitchen & cooking
	{Word: "teapot"},
	{Word: "frying pan"},
	{Word: "whisk"},
	{Word: "rolling pin"},
	{Word: "cutting board"},
	{Word: "colander"},
	{Word: "blender"},
	{Word: "toaster oven"},
	{Word: "oven mitt"},
	{Word: "apron"},
	{Word: "chef hat"},

	// Tools & garden
	{Word: "wrench"},
	{Word: "pliers"},
	{Word: "saw"},
	{Word: "drill"},
	{Word: "garden hose"},
	{Word: "rake"},
	{Word: "shovel"},
	{Word: "lawn mower"},
	{Word: "watering can"},

	// Outdoor gear & clothing
	{Word: "compass tool"},
	{Word: "hiking boots"},
	{Word: "raincoat"},
	{Word: "scarf"},
	{Word: "mittens"},
	{Word: "top hat"},
	{Word: "necktie"},
	{Word: "earrings"},
	{Word: "bracelet"},
	{Word: "wedding ring"},
	{Word: "crown jewelry"},
	{Word: "backpack hiking"},

	// Bugs & small creatures
	{Word: "ladybug"},
	{Word: "dragonfly closeup"},
	{Word: "grasshopper"},
	{Word: "firefly"},
	{Word: "caterpillar"},
	{Word: "spider web"},
	{Word: "beehive"},
	{Word: "ant hill"},
	{Word: "starfish"},
	{Word: "seahorse closeup"},
	{Word: "jellyfish glow"},

	// Birds
	{Word: "seagull"},
	{Word: "robin bird"},
	{Word: "duckling"},
	{Word: "turkey bird"},
	{Word: "barn owl"},

	// Plants & nature
	{Word: "sunflower field"},
	{Word: "tulip"},
	{Word: "rose flower"},
	{Word: "lotus flower"},
	{Word: "cactus flower"},
	{Word: "maple leaf"},
	{Word: "pine cone"},
	{Word: "acorn"},
	{Word: "mushroom forest"},
	{Word: "pumpkin patch"},
	{Word: "corn field"},
	{Word: "wheat field"},
	{Word: "vineyard"},
	{Word: "orchard"},

	// Food & treats
	{Word: "birthday cake"},
	{Word: "ice cream cone"},
	{Word: "popcorn bucket"},
	{Word: "cotton candy"},
	{Word: "gingerbread house"},
	{Word: "lemonade glass"},
	{Word: "coffee cup"},
	{Word: "tea cup"},
	{Word: "champagne bottle"},

	// School & office
	{Word: "piggy bank"},
	{Word: "alarm clock"},
	{Word: "telescope stargazing"},
	{Word: "globe map"},
	{Word: "chalkboard"},
	{Word: "schoolbus"},
	{Word: "backpack school"},
	{Word: "pencil case"},
	{Word: "paint palette"},
	{Word: "camera vintage"},
	{Word: "film reel"},

	// Celebrations & holidays
	{Word: "theater masks"},
	{Word: "ballet shoes"},
	{Word: "disco ball"},
	{Word: "fireworks display"},
	{Word: "birthday balloons"},
	{Word: "christmas tree"},
	{Word: "santa claus"},
	{Word: "easter eggs"},
	{Word: "halloween pumpkin"},
	{Word: "menorah"},
	{Word: "diwali lamps"},

	// Toys
	{Word: "kite flying"},
	{Word: "paper boat"},
	{Word: "snow globe"},
	{Word: "rocking horse"},
	{Word: "jack in the box"},
	{Word: "pinwheel"},
	{Word: "spinning top"},
	{Word: "marbles"},
	{Word: "puzzle pieces"},

	// More places
	{Word: "lighthouse beam"},
	{Word: "windmill field"},
	{Word: "covered bridge"},
	{Word: "stone castle"},
	{Word: "scarecrow"},
	{Word: "haystack"},
}

// fourFramesShuffledRounds returns a shuffled copy of the full word bank —
// called once per game session at StartGame, mirroring rebusShuffledPuzzles.
func fourFramesShuffledRounds() []FourFramesRound {
	shuffled := make([]FourFramesRound, len(fourFramesWordBank))
	copy(shuffled, fourFramesWordBank)
	rand.Shuffle(len(shuffled), func(i, j int) { shuffled[i], shuffled[j] = shuffled[j], shuffled[i] })
	return shuffled
}

func fourFramesAnswerMatches(r FourFramesRound, guess string) bool {
	g := rebusNormalize(guess) // same normalize (lowercase, strip punctuation/hyphens) — no need for a second copy
	if g == "" {
		return false
	}
	if g == rebusNormalize(r.Word) {
		return true
	}
	for _, alt := range r.Alternates {
		if g == rebusNormalize(alt) {
			return true
		}
	}
	return false
}

func fourFramesScoreRank(rank int) float64 {
	// Identical ranked-race scoring to Rebus Round — same "type an answer,
	// first correct guess scores the most" mechanic, kept consistent so a
	// player doesn't have to learn a different point scale per game.
	return rebusScoreRank(rank)
}

// ── Pexels fetch ─────────────────────────────────────────────────────────────

type pexelsPhotoResponse struct {
	Photos []struct {
		Alt string `json:"alt"`
		Src struct {
			Large    string `json:"large"`
			Medium   string `json:"medium"`
			Portrait string `json:"portrait"`
		} `json:"src"`
	} `json:"photos"`
}

var fourFramesHTTPClient = &http.Client{Timeout: 10 * time.Second}

// pexelsAltLooksRelevant is a soft relevance check against Pexels' own alt
// text for a photo (a short description Pexels attaches to most, though not
// all, photos). Confirmed live (2026-08) that this genuinely catches real
// mismatches for an ordinary, unambiguous word: a search for "elephant"
// returns 4/4 correct elephant photos cleanly, while a ambiguous word like
// the former "bat" entry (removed from fourFramesWordBank — see its own
// comment) returned a real bat photo ALONGSIDE a baseball game photo and an
// unrelated insect photo, all for the same query — Pexels' own relevance
// ranking alone was the only signal this pipeline used before, with zero
// validation that a result actually depicts the word searched for.
// Deliberately a soft preference, not a hard filter — see both call sites:
// alt text isn't always present or perfectly worded, and being too strict
// would make "not enough usable photos" fire far more often, trading one
// reliability problem for another. This filter alone can't rescue every
// genuinely pathological word (a word whose own alt-text vocabulary overlaps
// multiple unrelated subjects, like "bat" did) — for those, removing the word
// is the more honest fix; see the word-bank comment for that specific case.
func pexelsAltLooksRelevant(word, alt string) bool {
	if strings.TrimSpace(alt) == "" {
		return true // no alt text to judge by — don't penalize what can't be checked
	}
	altNorm := rebusNormalize(alt)
	for _, w := range strings.Fields(rebusNormalize(word)) {
		if len(w) < 3 {
			continue // skip tiny connector words ("a", "of") that would match almost anything
		}
		if strings.Contains(altNorm, w) {
			return true
		}
	}
	return false
}

// fetchFourFramesPhotos calls the real Pexels search API server-side (the API
// key is a secret — this must never run client-side, unlike OpenTDB/LRCLIB
// which need no key at all) and returns 4 photo URLs for word. Wrapped in
// rebusWithPexelsRetry (see rebus_round.go) so a transient network/Pexels
// hiccup doesn't fail the whole round-start outright, and requests a wider
// candidate pool (15, not 6) so a handful of results with no usable
// Large/Medium URL — or a weak, off-topic top hit — still leaves enough
// good candidates to fill all 4 slots from Pexels' own relevance ranking.
func fetchFourFramesPhotos(word string) ([]string, error) {
	apiKey := os.Getenv("PEXELS_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("PEXELS_API_KEY is not configured")
	}

	return rebusWithPexelsRetry(func() ([]string, error) {
		endpoint := "https://api.pexels.com/v1/search?query=" + url.QueryEscape(word) + "&per_page=15&orientation=square"
		req, err := http.NewRequest("GET", endpoint, nil)
		if err != nil {
			return nil, fmt.Errorf("failed to build Pexels request: %w", err)
		}
		req.Header.Set("Authorization", apiKey)

		resp, err := fourFramesHTTPClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("Pexels request failed: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("Pexels returned status %d for query %q", resp.StatusCode, word)
		}

		var parsed pexelsPhotoResponse
		if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
			return nil, fmt.Errorf("failed to decode Pexels response: %w", err)
		}

		// Two passes: relevant (alt text plausibly matches the word) fill the 4
		// slots first; fallback (off-topic or no-alt-text) photos only get used
		// if relevant ones alone don't reach 4 — never fail the round just
		// because the relevance filter was stricter than the pool could satisfy.
		var relevant, fallback []string
		for _, p := range parsed.Photos {
			// Prefer a square-ish crop (large) for a consistent 2x2 grid on the
			// frontend; medium is Pexels' own fallback if large is ever empty.
			u := p.Src.Large
			if u == "" {
				u = p.Src.Medium
			}
			if u == "" {
				continue
			}
			if pexelsAltLooksRelevant(word, p.Alt) {
				relevant = append(relevant, u)
			} else {
				fallback = append(fallback, u)
			}
			if len(relevant) == 4 {
				break
			}
		}
		urls := relevant
		for _, u := range fallback {
			if len(urls) == 4 {
				break
			}
			urls = append(urls, u)
		}

		if len(urls) < 4 {
			return nil, fmt.Errorf("Pexels returned only %d usable photo(s) for query %q, need 4", len(urls), word)
		}
		return urls, nil
	})
}

// fourFramesPhotoFetcher — indirected through a package var (defaulting to
// the real Pexels call above) so tests can substitute a fake, deterministic
// fetcher instead of hitting the real network/needing a real API key. Real
// production code never reassigns this.
var fourFramesPhotoFetcher = fetchFourFramesPhotos

// fourFramesCheckpointSize — the word bank is far too long to play
// through in one sitting, so the game is paced in sets of this many rounds:
// at every checkpoint, if a single player is clearly ahead, the game ends
// right there instead of always running to the end of the bank.
const fourFramesCheckpointSize = 20

// fourFramesLeaderInfo computes the current sole leader (nil if the top score
// is tied between 2+ players) and their score. Shared by four_frames_end
// (which accepts a 0-point sole leader, since that's an explicit host
// action) and the checkpoint below (which additionally requires a strictly
// positive score, so a set nobody scored in never auto-ends the game on a
// coin-flip "winner").
func fourFramesLeaderInfo(gameState *GameSessionState) (leaderID *uint, leaderScore float64) {
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
	if len(winners) != 1 {
		return nil, bestScore
	}
	return &winners[0], bestScore
}

// ── Move processing ──────────────────────────────────────────────────────────

func (gm *GameManager) processFourFramesMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	hostID := gameState.GameSession.HostID

	switch moveType {
	case "four_frames_start":
		if playerID != hostID {
			return false, nil, fmt.Errorf("only the host can start a round")
		}
		round, _ := gameState.GameData["round"].(float64)
		nextIdx := int(round)
		if nextIdx >= len(gameState.FourFramesRounds) {
			return false, nil, fmt.Errorf("no more rounds — end the game to see results")
		}
		fr := gameState.FourFramesRounds[nextIdx]

		photos, ferr := fourFramesPhotoFetcher(fr.Word)
		if ferr != nil {
			log.Printf("⚠️ [FourFrames] Pexels fetch failed for %q: %v", fr.Word, ferr)
			return false, nil, fmt.Errorf("couldn't load photos for this round — try again")
		}

		gameState.GameData["phase"] = "puzzle"
		gameState.GameData["round"] = float64(nextIdx + 1)
		gameState.GameData["current_photos"] = photos
		gameState.GameData["correct_order"] = []interface{}{}
		gameState.GameData["revealed_answer"] = ""
		gameState.GameData["revealed_alternates"] = []interface{}{}
		gameState.GameData["started_at"] = float64(time.Now().UnixMilli())
		rebusResetWrongAttempts(gameState, "wrong_attempts")
		return false, nil, nil

	case "answer":
		phase, _ := gameState.GameData["phase"].(string)
		if phase != "puzzle" {
			return false, nil, fmt.Errorf("no active round to answer right now")
		}
		round, _ := gameState.GameData["round"].(float64)
		idx := int(round) - 1
		if idx < 0 || idx >= len(gameState.FourFramesRounds) {
			return false, nil, fmt.Errorf("no active round")
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

		fr := gameState.FourFramesRounds[idx]
		if !fourFramesAnswerMatches(fr, guess) {
			attempts := rebusIncrementWrongAttempts(gameState, "wrong_attempts", playerID)
			return false, nil, fmt.Errorf("not quite — try again!%s", rebusHintForAttempt(fr.Word, fr.Hint, attempts))
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
		scores[playerIDStr] = current + fourFramesScoreRank(rank)
		gameState.GameData["scores"] = scores
		return false, nil, nil

	case "reveal":
		if playerID != hostID {
			return false, nil, fmt.Errorf("only the host can reveal the answer")
		}
		round, _ := gameState.GameData["round"].(float64)
		idx := int(round) - 1
		if idx < 0 || idx >= len(gameState.FourFramesRounds) {
			return false, nil, fmt.Errorf("no active round to reveal")
		}
		fr := gameState.FourFramesRounds[idx]
		gameState.GameData["phase"] = "reveal"
		gameState.GameData["revealed_answer"] = fr.Word
		alts := make([]interface{}, len(fr.Alternates))
		for i, a := range fr.Alternates {
			alts[i] = a
		}
		gameState.GameData["revealed_alternates"] = alts
		gameState.GameData["set_complete_no_winner"] = false

		// Checkpoint: every fourFramesCheckpointSize rounds, end the game
		// early if a single player is clearly ahead, rather than always
		// playing through the entire word bank in one sitting. Mirrors Rebus
		// Round's identical set-boundary gate (rebusSetSize/reveal case) —
		// set_complete_no_winner lets the frontend tell the player why
		// nothing decisive happened yet, instead of a silent continue.
		if int(round)%fourFramesCheckpointSize == 0 {
			if leaderID, leaderScore := fourFramesLeaderInfo(gameState); leaderID != nil && leaderScore > 0 {
				gameState.GameData["phase"] = "ended"
				return true, leaderID, nil
			}
			gameState.GameData["set_complete_no_winner"] = true
		}
		return false, nil, nil

	case "four_frames_end":
		// Host-only, identical semantics to rebus_end/trivia_end: winner is
		// computed from whatever scores exist right now, covering both
		// "Show Results" after the last round and an early "End Game" forfeit.
		if playerID != hostID {
			return false, nil, fmt.Errorf("only the host can end the game")
		}
		wID, _ := fourFramesLeaderInfo(gameState)
		gameState.GameData["phase"] = "ended"
		return true, wID, nil

	default:
		return false, nil, fmt.Errorf("unknown four_frames move type: %s", moveType)
	}
}
