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
		Src struct {
			Large    string `json:"large"`
			Medium   string `json:"medium"`
			Portrait string `json:"portrait"`
		} `json:"src"`
	} `json:"photos"`
}

var fourFramesHTTPClient = &http.Client{Timeout: 10 * time.Second}

// fetchFourFramesPhotos calls the real Pexels search API server-side (the API
// key is a secret — this must never run client-side, unlike OpenTDB/LRCLIB
// which need no key at all) and returns up to 4 photo URLs for word. Returns
// an error if PEXELS_API_KEY isn't configured, the request fails, or Pexels
// returns fewer than 4 usable photos for this word.
func fetchFourFramesPhotos(word string) ([]string, error) {
	apiKey := os.Getenv("PEXELS_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("PEXELS_API_KEY is not configured")
	}

	endpoint := "https://api.pexels.com/v1/search?query=" + url.QueryEscape(word) + "&per_page=6&orientation=square"
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

	var urls []string
	for _, p := range parsed.Photos {
		// Prefer a square-ish crop (large) for a consistent 2x2 grid on the
		// frontend; medium is Pexels' own fallback if large is ever empty.
		u := p.Src.Large
		if u == "" {
			u = p.Src.Medium
		}
		if u != "" {
			urls = append(urls, u)
		}
		if len(urls) == 4 {
			break
		}
	}

	if len(urls) < 4 {
		return nil, fmt.Errorf("Pexels returned only %d usable photo(s) for query %q, need 4", len(urls), word)
	}
	return urls, nil
}

// fourFramesPhotoFetcher — indirected through a package var (defaulting to
// the real Pexels call above) so tests can substitute a fake, deterministic
// fetcher instead of hitting the real network/needing a real API key. Real
// production code never reassigns this.
var fourFramesPhotoFetcher = fetchFourFramesPhotos

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
		return false, nil, nil

	case "four_frames_end":
		// Host-only, identical semantics to rebus_end/trivia_end: winner is
		// computed from whatever scores exist right now, covering both
		// "Show Results" after the last round and an early "End Game" forfeit.
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
		return false, nil, fmt.Errorf("unknown four_frames move type: %s", moveType)
	}
}
