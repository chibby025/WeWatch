package games

import (
	"fmt"
	"strconv"
	"strings"
)

// Battleship: two players, 10x10 grids. Phase "placement" (both place their fleet)
// → "combat" (alternate attacks). Turn-based, NOT simultaneous.
//
// Hidden information: each player's ship layout. Stored privately in Hands[playerID]
// as a single JSON-free encoded string per ship: "carrier:r0,c0,r1,c1,...". The public
// GameData never contains ship positions — only the hit/miss boards (which cells have
// been fired at and the result).
//
// Public state (GameData):
//   phase           — "placement" | "combat"
//   boards          — { "<playerID>": [100]string }  ("" | "hit" | "miss") for shots taken
//                     AGAINST that player (i.e. boards[victim][cell])
//   ships_remaining — { "<playerID>": int }
//   current_turn    — user_id whose turn it is to attack (combat only)
//   placed          — { "<playerID>": bool }

const battleshipSize = 10
const battleshipCells = battleshipSize * battleshipSize

var battleshipFleet = []struct {
	Name string
	Size int
}{
	{"carrier", 5},
	{"battleship", 4},
	{"cruiser", 3},
	{"submarine", 3},
	{"destroyer", 2},
}

// battleshipSeed builds the initial public state given the game's players.
func battleshipSeed(gameState *GameSessionState) map[string]interface{} {
	boards := map[string]interface{}{}
	shipsRemaining := map[string]interface{}{}
	placed := map[string]interface{}{}
	for _, p := range gameState.Players {
		key := fmt.Sprintf("%d", p.UserID)
		emptyBoard := make([]interface{}, battleshipCells)
		for i := range emptyBoard {
			emptyBoard[i] = ""
		}
		boards[key] = emptyBoard
		shipsRemaining[key] = len(battleshipFleet)
		placed[key] = false
	}
	firstTurn := uint(0)
	if len(gameState.Players) > 0 {
		firstTurn = gameState.Players[0].UserID
	}
	return map[string]interface{}{
		"phase":           "placement",
		"boards":          boards,
		"ships_remaining": shipsRemaining,
		"placed":          placed,
		"current_turn":    float64(firstTurn),
	}
}

func ensureBattleshipState(gameState *GameSessionState) {
	if gameState.GameData["phase"] == nil {
		for k, v := range battleshipSeed(gameState) {
			gameState.GameData[k] = v
		}
	}
	if gameState.Hands == nil {
		gameState.Hands = map[uint][]string{}
	}
}

func battleshipBoards(gameState *GameSessionState) map[string]interface{} {
	if m, ok := gameState.GameData["boards"].(map[string]interface{}); ok {
		return m
	}
	m := map[string]interface{}{}
	gameState.GameData["boards"] = m
	return m
}

func battleshipCellsForBoard(boards map[string]interface{}, key string) []interface{} {
	if arr, ok := boards[key].([]interface{}); ok {
		return arr
	}
	arr := make([]interface{}, battleshipCells)
	for i := range arr {
		arr[i] = ""
	}
	boards[key] = arr
	return arr
}

// parseShipCells decodes an encoded ship ("carrier:0,0,0,1,...") into (name, cells).
func parseShipCells(encoded string) (string, [][2]int) {
	parts := strings.SplitN(encoded, ":", 2)
	if len(parts) != 2 {
		return "", nil
	}
	name := parts[0]
	nums := strings.Split(parts[1], ",")
	var cells [][2]int
	for i := 0; i+1 < len(nums); i += 2 {
		r, _ := strconv.Atoi(strings.TrimSpace(nums[i]))
		c, _ := strconv.Atoi(strings.TrimSpace(nums[i+1]))
		cells = append(cells, [2]int{r, c})
	}
	return name, cells
}

func cellIndex(r, c int) int { return r*battleshipSize + c }

func (gm *GameManager) processBattleshipMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	ensureBattleshipState(gameState)
	phase, _ := gameState.GameData["phase"].(string)

	switch moveType {
	case "place":
		if phase != "placement" {
			return false, nil, fmt.Errorf("placement is already complete")
		}
		shipsRaw, ok := moveData["ships"].([]interface{})
		if !ok {
			return false, nil, fmt.Errorf("missing ships")
		}

		// Validate: exactly the right fleet, no overlaps, all in bounds.
		occupied := make(map[int]bool)
		encoded := make([]string, 0, len(shipsRaw))
		seenNames := make(map[string]bool)
		for _, shipRaw := range shipsRaw {
			ship, ok := shipRaw.(map[string]interface{})
			if !ok {
				return false, nil, fmt.Errorf("malformed ship entry")
			}
			name, _ := ship["name"].(string)
			cellsRaw, ok := ship["cells"].([]interface{})
			if !ok {
				return false, nil, fmt.Errorf("ship %s has no cells", name)
			}
			// Confirm this is a real ship name with the correct size.
			expectedSize := -1
			for _, f := range battleshipFleet {
				if f.Name == name {
					expectedSize = f.Size
				}
			}
			if expectedSize == -1 {
				return false, nil, fmt.Errorf("unknown ship: %s", name)
			}
			if len(cellsRaw) != expectedSize {
				return false, nil, fmt.Errorf("ship %s must occupy %d cells", name, expectedSize)
			}
			if seenNames[name] {
				return false, nil, fmt.Errorf("duplicate ship: %s", name)
			}
			seenNames[name] = true

			var coordParts []string
			for _, cellRaw := range cellsRaw {
				cell, ok := cellRaw.(map[string]interface{})
				if !ok {
					return false, nil, fmt.Errorf("malformed cell in %s", name)
				}
				rf, _ := cell["r"].(float64)
				cf, _ := cell["c"].(float64)
				r, c := int(rf), int(cf)
				if r < 0 || r >= battleshipSize || c < 0 || c >= battleshipSize {
					return false, nil, fmt.Errorf("ship %s out of bounds", name)
				}
				idx := cellIndex(r, c)
				if occupied[idx] {
					return false, nil, fmt.Errorf("ships overlap at (%d,%d)", r, c)
				}
				occupied[idx] = true
				coordParts = append(coordParts, strconv.Itoa(r), strconv.Itoa(c))
			}
			encoded = append(encoded, name+":"+strings.Join(coordParts, ","))
		}

		if len(encoded) != len(battleshipFleet) {
			return false, nil, fmt.Errorf("you must place all %d ships", len(battleshipFleet))
		}

		gameState.Hands[playerID] = encoded

		placed, _ := gameState.GameData["placed"].(map[string]interface{})
		if placed == nil {
			placed = map[string]interface{}{}
		}
		placed[fmt.Sprintf("%d", playerID)] = true
		gameState.GameData["placed"] = placed

		// If every player has placed, begin combat.
		allPlaced := true
		for _, p := range gameState.Players {
			if b, _ := placed[fmt.Sprintf("%d", p.UserID)].(bool); !b {
				allPlaced = false
			}
		}
		if allPlaced {
			gameState.GameData["phase"] = "combat"
			gameState.GameData["current_turn"] = float64(gameState.Players[0].UserID)
		}
		return false, nil, nil

	case "attack":
		if phase != "combat" {
			return false, nil, fmt.Errorf("combat hasn't started yet")
		}
		curTurn, _ := gameState.GameData["current_turn"].(float64)
		if uint(curTurn) != playerID {
			return false, nil, fmt.Errorf("not your turn")
		}

		rf, _ := moveData["r"].(float64)
		cf, _ := moveData["c"].(float64)
		r, c := int(rf), int(cf)
		if r < 0 || r >= battleshipSize || c < 0 || c >= battleshipSize {
			return false, nil, fmt.Errorf("attack out of bounds")
		}

		// Find the opponent (2-player game).
		var opponentID uint
		found := false
		for _, p := range gameState.Players {
			if p.UserID != playerID {
				opponentID = p.UserID
				found = true
				break
			}
		}
		if !found {
			return false, nil, fmt.Errorf("no opponent")
		}

		boards := battleshipBoards(gameState)
		victimKey := fmt.Sprintf("%d", opponentID)
		board := battleshipCellsForBoard(boards, victimKey)
		idx := cellIndex(r, c)
		if existing, _ := board[idx].(string); existing == "hit" || existing == "miss" {
			return false, nil, fmt.Errorf("you already fired at that cell")
		}

		// Does the opponent have a ship cell here?
		hit := false
		for _, encoded := range gameState.Hands[opponentID] {
			_, cells := parseShipCells(encoded)
			for _, cell := range cells {
				if cell[0] == r && cell[1] == c {
					hit = true
				}
			}
		}
		if hit {
			board[idx] = "hit"
		} else {
			board[idx] = "miss"
		}
		boards[victimKey] = board
		gameState.GameData["boards"] = boards

		// Recompute the opponent's ships_remaining: a ship is sunk when all its
		// cells are "hit".
		shipsSunk := 0
		for _, encoded := range gameState.Hands[opponentID] {
			_, cells := parseShipCells(encoded)
			allHit := true
			for _, cell := range cells {
				if s, _ := board[cellIndex(cell[0], cell[1])].(string); s != "hit" {
					allHit = false
				}
			}
			if allHit {
				shipsSunk++
			}
		}
		remaining := len(battleshipFleet) - shipsSunk
		shipsRemaining, _ := gameState.GameData["ships_remaining"].(map[string]interface{})
		if shipsRemaining == nil {
			shipsRemaining = map[string]interface{}{}
		}
		shipsRemaining[victimKey] = remaining
		gameState.GameData["ships_remaining"] = shipsRemaining

		if remaining <= 0 {
			gameState.GameData["phase"] = "results"
			winner := playerID
			return true, &winner, nil
		}

		// Pass the turn to the opponent (only advance when the shot missed OR
		// always — standard rules pass on any shot). We pass on every shot.
		gameState.GameData["current_turn"] = float64(opponentID)
		return false, nil, nil

	default:
		return false, nil, fmt.Errorf("unknown battleship move type: %s", moveType)
	}
}
