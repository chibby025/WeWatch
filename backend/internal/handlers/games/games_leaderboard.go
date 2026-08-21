package games

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GameLeaderboardEntry is one ranked row — either a best-score or a
// win-count, depending on the parent group's Metric.
type GameLeaderboardEntry struct {
	UserID    uint    `json:"user_id"`
	Username  string  `json:"username"`
	AvatarURL string  `json:"avatar_url"`
	Value     float64 `json:"value"`
}

// GameLeaderboardGroup is one game's top-10 list.
type GameLeaderboardGroup struct {
	GameType string                  `json:"game_type"`
	Label    string                  `json:"label"`
	Metric   string                  `json:"metric"` // "score" | "wins"
	Entries  []GameLeaderboardEntry  `json:"entries"`
}

// gamesLeaderboardConfig is the full, explicit list of games this endpoint
// covers — deliberately NOT every registered game type (see
// game_manager.go's validGameTypes for the full 42-game roster). Excluded,
// and why, so a future pass doesn't have to re-derive this:
//   - No numeric score AND no per-player WinnerID concept that fits a
//     leaderboard at all: would_you_rather (pure group vote, its own move
//     processor never returns a winner), sudoku (correctness-only, no
//     ranking), tug_of_war (wins are tracked at the TEAM level, not
//     per-player, so a per-user leaderboard doesn't apply).
//   - iframe-hosted on a separate service — no WeWatch-side GameState/
//     ProcessMove case exists at all: doom, quake3, obby_parkour.
//   - Score only ever reaches a hot-seat WS broadcast (record_hot_seat_score)
//     and is never persisted to game_sessions — confirmed via
//     HotSeatManager.RecordScore never touching the DB: fowl_play, golf,
//     toad_ball, space_attack, rhythm_hero. Could join this list later, but
//     only after real new persistence work for hot-seat scoring.
//   - Real-time physics relay, confirmed no score field in GameData despite
//     the "first to N points" feel: ping_pong, air_hockey.
//   - Already has its own dedicated leaderboard card
//     (GetVsBattleLeaderboardHandler) — excluded here to avoid a duplicate:
//     vs_battle.
//   - Registered in validGameTypes and fully implemented server-side, but
//     not reachable through the actual game picker (GameLobbyModal.jsx)
//     today — no real games are ever played, so a leaderboard entry would
//     stay permanently empty: quiplash, property_tycoon.
//   - Genuinely tracks a real numeric score, but in a different shape from
//     the shared GameData["scores"] convention every game below uses
//     (typing_race: GameData["progress"][id]["wpm"]; jigsaw:
//     GameData["placed_by"][id], a piece count) — left for a later pass
//     rather than writing a bespoke query for each right now.
var gamesLeaderboardConfig = []struct {
	GameType string
	Label    string
	Metric   string
}{
	// Score-based — GameData["scores"], a map keyed by player-id string,
	// numeric value. Ranked by each player's personal-best single-session
	// score, not a cumulative total across all their sessions.
	{"trivia", "Trivia", "score"},
	{"wordsmith", "Wordsmith", "score"},
	{"rebus_round", "Rebus Round", "score"},
	{"four_frames", "Four Frames", "score"},
	{"hangman", "Hangman", "score"},
	{"draw_guess", "Draw & Guess", "score"},
	// Win-based — GameSession.WinnerID, COUNT(*) GROUP BY per user. Same
	// mechanism GetVsBattleLeaderboardHandler already proves out, just
	// parameterized by game_type instead of hardcoded to vs_battle.
	{"tic_tac_toe", "Tic Tac Toe", "wins"},
	{"chess", "Chess", "wins"},
	{"checkers", "Checkers", "wins"},
	{"othello", "Othello", "wins"},
	{"connect_four", "Connect Four", "wins"},
	{"ludo", "Ludo", "wins"},
	{"backgammon", "Backgammon", "wins"},
	{"rock_paper_scissors", "Rock Paper Scissors", "wins"},
	{"crazy_eights", "Crazy Eights", "wins"},
	{"uno", "UNO", "wins"},
	{"whot", "Whot!", "wins"},
	{"blackjack", "Blackjack", "wins"},
	{"battleship", "Battleship", "wins"},
	{"wordle", "Wordle", "wins"},
	{"pool", "Pool", "wins"},
	{"texas_holdem", "Texas Hold'em", "wins"},
	{"snakes_ladders", "Snakes & Ladders", "wins"},
	{"mancala", "Mancala", "wins"},
}

// gamesLeaderboardScoreQuery ranks players by their personal-best single-
// session score for gameType, reading the shared GameData["scores"]
// convention (a JSONB map keyed by player-id-as-string). The regex guard on
// kv.value defends against a malformed/non-numeric historical value ever
// breaking the ::numeric cast for the whole query — a genuinely free-form
// JSONB column can't be fully guaranteed clean forever.
func gamesLeaderboardScoreQuery(db *gorm.DB, gameType string) ([]GameLeaderboardEntry, error) {
	entries := []GameLeaderboardEntry{}
	err := db.Raw(`
		SELECT u.id AS user_id, u.username, COALESCE(u.avatar_url, '') AS avatar_url,
		       MAX((kv.value)::numeric) AS value
		FROM game_sessions gs
		CROSS JOIN LATERAL jsonb_each_text(gs.game_state->'scores') AS kv(key, value)
		JOIN users u ON u.id = kv.key::bigint
		WHERE gs.game_type = ?
		  AND gs.status IN ('completed', 'forfeited')
		  AND gs.ended_at IS NOT NULL
		  AND kv.value ~ '^-?[0-9]+(\.[0-9]+)?$'
		GROUP BY u.id, u.username, u.avatar_url
		ORDER BY value DESC
		LIMIT 10
	`, gameType).Scan(&entries).Error
	return entries, err
}

// gamesLeaderboardWinsQuery ranks players by total wins for gameType, via
// GameSession.WinnerID — the same mechanism GetVsBattleLeaderboardHandler
// already uses, generalized. Simpler than that handler's own query since
// this doesn't need total_games/win_rate — just a plain GROUP BY winner_id.
func gamesLeaderboardWinsQuery(db *gorm.DB, gameType string) ([]GameLeaderboardEntry, error) {
	entries := []GameLeaderboardEntry{}
	err := db.Raw(`
		SELECT u.id AS user_id, u.username, COALESCE(u.avatar_url, '') AS avatar_url,
		       COUNT(*)::numeric AS value
		FROM game_sessions gs
		JOIN users u ON u.id = gs.winner_id
		WHERE gs.game_type = ?
		  AND gs.winner_id IS NOT NULL
		  AND gs.status IN ('completed', 'forfeited')
		  AND gs.ended_at IS NOT NULL
		GROUP BY u.id, u.username, u.avatar_url
		ORDER BY value DESC
		LIMIT 10
	`, gameType).Scan(&entries).Error
	return entries, err
}

// GetGamesLeaderboardHandler returns top-10 leaderboards for every game type
// covered by gamesLeaderboardConfig (see its own comment for what's excluded
// and why) — one query per game, bundled into a single response so the
// frontend can fetch once and let its dropdown filter client-side, matching
// the existing rooms/VS-Battle leaderboard cards' one-shot-fetch pattern.
// Games with zero completed sessions simply return an empty Entries list,
// not an error or a missing group — the dropdown still lists them.
// GET /api/games/leaderboard
func GetGamesLeaderboardHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		groups := make([]GameLeaderboardGroup, 0, len(gamesLeaderboardConfig))
		for _, g := range gamesLeaderboardConfig {
			var entries []GameLeaderboardEntry
			var err error
			if g.Metric == "score" {
				entries, err = gamesLeaderboardScoreQuery(db, g.GameType)
			} else {
				entries, err = gamesLeaderboardWinsQuery(db, g.GameType)
			}
			if err != nil {
				// One bad game's query shouldn't fail the whole response —
				// surface it as an empty list and keep going.
				entries = []GameLeaderboardEntry{}
			}
			groups = append(groups, GameLeaderboardGroup{
				GameType: g.GameType,
				Label:    g.Label,
				Metric:   g.Metric,
				Entries:  entries,
			})
		}
		c.JSON(http.StatusOK, gin.H{"games": groups})
	}
}
