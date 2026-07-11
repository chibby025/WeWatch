package games

import (
	"fmt"
	"math/rand"
	"time"

	"wewatch-backend/internal/models"
)

// Red Light Green Light: a phase-schedule is pre-generated at game start.
// Both server and client compute the current phase from elapsed time — no
// background goroutines. Players send "move" while the light is green; if
// they move during red they're eliminated. Last player standing wins.
// Host sends "start" to begin the countdown; the phase schedule is embedded
// in the state so every client can self-time.

const (
	rlglGreenMin = 2000 // ms
	rlglGreenMax = 5000
	rlglRedMin   = 1500
	rlglRedMax   = 4000
	rlglRounds   = 8 // number of phase alternations before the game ends
)

func redLightInitialState(players []models.Player) map[string]interface{} {
	alive := map[string]interface{}{}
	positions := map[string]interface{}{} // 0–100, start at 0
	for _, p := range players {
		alive[fmt.Sprintf("%d", p.UserID)] = true
		positions[fmt.Sprintf("%d", p.UserID)] = 0
	}

	// Pre-generate phase schedule: [{color, duration_ms}]
	// Starts green.
	schedule := make([]interface{}, rlglRounds)
	for i := 0; i < rlglRounds; i++ {
		if i%2 == 0 {
			// green
			dur := rlglGreenMin + rand.Intn(rlglGreenMax-rlglGreenMin)
			schedule[i] = map[string]interface{}{"color": "green", "duration_ms": dur}
		} else {
			// red
			dur := rlglRedMin + rand.Intn(rlglRedMax-rlglRedMin)
			schedule[i] = map[string]interface{}{"color": "red", "duration_ms": dur}
		}
	}

	return map[string]interface{}{
		"phase":      "waiting", // "waiting" | "running" | "ended"
		"schedule":   schedule,
		"start_time": 0, // Unix ms, set when host starts
		"alive":      alive,
		"positions":  positions,
		"eliminations": []interface{}{}, // [{player_id, round}]
		"finish_line": 100,
		"move_step":   12, // progress per valid move
	}
}

func ensureRLGLState(gameState *GameSessionState) {
	if gameState.GameData["phase"] == nil {
		for k, v := range redLightInitialState(gameState.Players) {
			gameState.GameData[k] = v
		}
	}
}

// currentPhaseColor computes the phase color from the embedded schedule + start_time.
func rlglCurrentPhaseColor(data map[string]interface{}) string {
	startMs := rlglInt64(data["start_time"])
	if startMs == 0 {
		return "waiting"
	}
	elapsed := time.Now().UnixMilli() - startMs
	schedule := rlglSchedule(data)
	var cumulative int64
	for _, entry := range schedule {
		m, _ := entry.(map[string]interface{})
		dur := int64(rlglInt(m["duration_ms"]))
		if elapsed < cumulative+dur {
			color, _ := m["color"].(string)
			return color
		}
		cumulative += dur
	}
	return "ended" // schedule exhausted
}

func (gm *GameManager) processRedLightMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (bool, *uint, error) {
	ensureRLGLState(gameState)

	phase, _ := gameState.GameData["phase"].(string)

	switch moveType {
	case "start":
		// Only host can start
		if playerID != gameState.Players[0].UserID {
			return false, nil, fmt.Errorf("only the host can start the game")
		}
		if phase != "waiting" {
			return false, nil, fmt.Errorf("game already started")
		}
		gameState.GameData["start_time"] = time.Now().UnixMilli()
		gameState.GameData["phase"] = "running"

		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil

	case "move":
		if phase != "running" {
			return false, nil, fmt.Errorf("game not running")
		}

		playerKey := fmt.Sprintf("%d", playerID)
		alive := rlglAliveMap(gameState.GameData)

		if !rlglBool(alive[playerKey]) {
			return false, nil, fmt.Errorf("you have been eliminated")
		}

		color := rlglCurrentPhaseColor(gameState.GameData)
		if color == "ended" {
			// Schedule exhausted — resolve game
			return gm.rlglResolve(gameState)
		}

		if color == "red" {
			// Eliminated!
			alive[playerKey] = false
			gameState.GameData["alive"] = alive

			elims := rlglEliminations(gameState.GameData)
			elims = append(elims, map[string]interface{}{
				"player_id": playerKey,
				"reason":    "moved_on_red",
			})
			gameState.GameData["eliminations"] = elims

			// Check if only one player left
			aliveCount := 0
			var lastAlive uint
			for _, p := range gameState.Players {
				if rlglBool(alive[fmt.Sprintf("%d", p.UserID)]) {
					aliveCount++
					lastAlive = p.UserID
				}
			}
			if aliveCount <= 1 {
				gameState.GameData["phase"] = "ended"
				gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
				if aliveCount == 1 {
					uid := lastAlive
					return true, &uid, nil
				}
				return true, nil, nil // all eliminated
			}

			gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
			return false, nil, nil
		}

		// Green — advance position
		positions := rlglPositions(gameState.GameData)
		step := rlglInt(gameState.GameData["move_step"])
		finishLine := rlglInt(gameState.GameData["finish_line"])
		pos := rlglInt(positions[playerKey]) + step
		if pos > finishLine {
			pos = finishLine
		}
		positions[playerKey] = pos
		gameState.GameData["positions"] = positions

		// Check if this player crossed the finish line
		if pos >= finishLine {
			gameState.GameData["phase"] = "ended"
			uid := playerID
			gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
			return true, &uid, nil
		}

		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil

	case "end_game":
		// Host can force end
		if playerID != gameState.Players[0].UserID {
			return false, nil, fmt.Errorf("only the host can end the game")
		}
		return gm.rlglResolve(gameState)

	default:
		return false, nil, fmt.Errorf("unknown move type: %s", moveType)
	}
}

func (gm *GameManager) rlglResolve(gameState *GameSessionState) (bool, *uint, error) {
	gameState.GameData["phase"] = "ended"
	gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)

	// Winner = furthest alive player
	positions := rlglPositions(gameState.GameData)
	alive := rlglAliveMap(gameState.GameData)

	var bestPos int
	var winnerID *uint
	for _, p := range gameState.Players {
		key := fmt.Sprintf("%d", p.UserID)
		if !rlglBool(alive[key]) {
			continue
		}
		pos := rlglInt(positions[key])
		if winnerID == nil || pos > bestPos {
			bestPos = pos
			uid := p.UserID
			winnerID = &uid
		}
	}
	return true, winnerID, nil
}

// --- helpers ---

func rlglInt(v interface{}) int {
	switch val := v.(type) {
	case int:
		return val
	case float64:
		return int(val)
	}
	return 0
}

func rlglInt64(v interface{}) int64 {
	switch val := v.(type) {
	case int64:
		return val
	case float64:
		return int64(val)
	case int:
		return int64(val)
	}
	return 0
}

func rlglBool(v interface{}) bool {
	if b, ok := v.(bool); ok {
		return b
	}
	return false
}

func rlglAliveMap(data map[string]interface{}) map[string]interface{} {
	if raw, ok := data["alive"]; ok {
		if m, ok := raw.(map[string]interface{}); ok {
			return m
		}
	}
	return map[string]interface{}{}
}

func rlglPositions(data map[string]interface{}) map[string]interface{} {
	if raw, ok := data["positions"]; ok {
		if m, ok := raw.(map[string]interface{}); ok {
			return m
		}
	}
	return map[string]interface{}{}
}

func rlglEliminations(data map[string]interface{}) []interface{} {
	if raw, ok := data["eliminations"]; ok {
		if s, ok := raw.([]interface{}); ok {
			return s
		}
	}
	return []interface{}{}
}

func rlglSchedule(data map[string]interface{}) []interface{} {
	if raw, ok := data["schedule"]; ok {
		if s, ok := raw.([]interface{}); ok {
			return s
		}
	}
	return []interface{}{}
}
