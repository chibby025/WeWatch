package games

import (
    "fmt"
    "math/rand"
)

// Ludo is perfect-information (unlike Crazy Eights) — every token's position is
// visible to all players, so this uses the plain GameData pattern othello.go/
// checkers.go already use, no private-state plumbing needed.
//
// Position convention per token: -1 = in base/yard (not yet on the board);
// 0-50 = on the shared 52-square outer track, expressed RELATIVE to that
// color's own entry point (0 = the color's own entry square); 51-56 = in that
// color's own home column (colored stretch leading to the center); 57 = home
// (finished). A token needs exactly 57 forward steps from its entry to finish.
//
// Turn flow is two-phase, unlike every other game in this package: a player
// must "roll_dice" first, then "move_token" to act on that roll (the roll
// itself ends the turn if no token can use it, or if three 6s are rolled in a
// row — standard anti-stalling rule). GameData's awaiting_move/current_dice
// track this phase so the generic per-move "not your turn" check in
// ProcessMove still applies correctly to both halves of a turn.

var ludoColors = []string{"red", "blue", "green", "yellow"}

var ludoEntryOffset = map[string]int{"red": 0, "blue": 13, "green": 26, "yellow": 39}

// ludoSafeSquares are global track positions (0-51) where a token can never be
// captured: each color's own entry square plus one "star" square roughly
// opposite it — the standard Ludo board layout.
var ludoSafeSquares = map[int]bool{0: true, 8: true, 13: true, 21: true, 26: true, 34: true, 39: true, 47: true}

func ludoGlobalSquare(color string, relPos int) int {
    return (ludoEntryOffset[color] + relPos) % 52
}

// ludoInitialBoard creates 4 tokens for each of the first playerCount colors.
// Colors beyond playerCount are simply never populated — gameState.Players
// only ever has playerCount entries, so nothing else in this file ever
// touches them. Shared by game_manager.go's initializeGameState and the
// lazy-init fallback below, so both agree exactly.
func ludoInitialBoard(playerCount int) map[string]interface{} {
    tokens := make(map[string]interface{})
    for i := 0; i < playerCount; i++ {
        color := ludoColors[i]
        colorTokens := make([]map[string]interface{}, 4)
        for j := 0; j < 4; j++ {
            colorTokens[j] = map[string]interface{}{
                "id":       fmt.Sprintf("%s_%d", color, j),
                "position": -1,
            }
        }
        tokens[color] = colorTokens
    }
    return map[string]interface{}{"tokens": tokens}
}

func ensureLudoDealt(gameState *GameSessionState) {
    if _, ok := gameState.GameData["tokens"]; !ok {
        board := ludoInitialBoard(len(gameState.Players))
        gameState.GameData["tokens"] = board["tokens"]
    }
}

// ludoTokens returns a color's 4 tokens, normalizing whatever underlying type
// GameData happens to hold (a fresh map literal vs. round-tripped through
// JSON) — same []interface{}-vs-typed-slice ambiguity othello.go/checkers.go
// already handle for board state. The returned maps are the SAME underlying
// map objects stored in GameData (Go maps are reference types), so mutating a
// returned token's "position" field correctly updates canonical state without
// needing to write anything back.
func ludoTokens(gameState *GameSessionState, color string) ([]map[string]interface{}, error) {
    tokensRaw, ok := gameState.GameData["tokens"].(map[string]interface{})
    if !ok {
        return nil, fmt.Errorf("invalid tokens state")
    }
    colorRaw, ok := tokensRaw[color]
    if !ok {
        return nil, fmt.Errorf("unknown color: %s", color)
    }

    switch v := colorRaw.(type) {
    case []map[string]interface{}:
        return v, nil
    case []interface{}:
        out := make([]map[string]interface{}, len(v))
        for i, t := range v {
            tm, ok := t.(map[string]interface{})
            if !ok {
                return nil, fmt.Errorf("invalid token at index %d", i)
            }
            out[i] = tm
        }
        return out, nil
    default:
        return nil, fmt.Errorf("invalid color token type: %T", colorRaw)
    }
}

func ludoTokenPosition(token map[string]interface{}) int {
    switch v := token["position"].(type) {
    case int:
        return v
    case float64:
        return int(v)
    default:
        return -1
    }
}

func ludoIntField(gameData map[string]interface{}, key string) int {
    switch v := gameData[key].(type) {
    case int:
        return v
    case float64:
        return int(v)
    default:
        return 0
    }
}

func (gm *GameManager) processLudoMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
    ensureLudoDealt(gameState)

    playerIdx := gameState.CurrentTurn
    color := ludoColors[playerIdx]

    switch moveType {
    case "roll_dice":
        return gm.processLudoRoll(gameState, color)
    case "move_token":
        return gm.processLudoTokenMove(gameState, playerIdx, color, moveData)
    default:
        return false, nil, fmt.Errorf("unknown move type: %s", moveType)
    }
}

func (gm *GameManager) processLudoRoll(gameState *GameSessionState, color string) (bool, *uint, error) {
    if awaiting, _ := gameState.GameData["awaiting_move"].(bool); awaiting {
        return false, nil, fmt.Errorf("you must move your token before rolling again")
    }

    roll := rand.Intn(6) + 1
    consecutiveSixes := ludoIntField(gameState.GameData, "consecutive_sixes")

    if roll == 6 {
        consecutiveSixes++
    } else {
        consecutiveSixes = 0
    }

    // Three 6s in a row forfeits this roll's move and passes the turn —
    // standard anti-stalling rule. The roll itself is still visible to
    // players via the broadcast, it just grants nothing.
    if roll == 6 && consecutiveSixes >= 3 {
        gameState.GameData["consecutive_sixes"] = 0
        gameState.GameData["current_dice"] = roll
        gameState.GameData["awaiting_move"] = false
        gameState.GameData["last_roll_wasted"] = true
        // Let ProcessMove's automatic turn-advance proceed normally — the
        // turn genuinely passes here, no decrement needed.
        return false, nil, nil
    }
    gameState.GameData["consecutive_sixes"] = consecutiveSixes
    gameState.GameData["last_roll_wasted"] = false

    tokens, err := ludoTokens(gameState, color)
    if err != nil {
        return false, nil, err
    }

    hasLegalMove := false
    for _, t := range tokens {
        pos := ludoTokenPosition(t)
        if pos == -1 && roll == 6 {
            hasLegalMove = true
            break
        }
        if pos >= 0 && pos+roll <= 57 {
            hasLegalMove = true
            break
        }
    }

    gameState.GameData["current_dice"] = roll

    if !hasLegalMove {
        gameState.GameData["awaiting_move"] = false
        if roll == 6 {
            // Six always grants a re-roll even with nothing to use it on —
            // same player continues. Cancel the automatic turn-advance below.
            gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
        }
        // Non-6 with no legal move: the turn genuinely passes — let
        // ProcessMove's automatic advance proceed.
        return false, nil, nil
    }

    // A legal move exists — the SAME player must now send move_token. Cancel
    // the automatic advance here too; it would otherwise hand the turn to
    // someone who never got to act on this roll.
    gameState.GameData["awaiting_move"] = true
    gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
    return false, nil, nil
}

func (gm *GameManager) processLudoTokenMove(gameState *GameSessionState, playerIdx int, color string, moveData map[string]interface{}) (bool, *uint, error) {
    awaiting, _ := gameState.GameData["awaiting_move"].(bool)
    if !awaiting {
        return false, nil, fmt.Errorf("roll the dice first")
    }
    dice := ludoIntField(gameState.GameData, "current_dice")
    if dice == 0 {
        return false, nil, fmt.Errorf("no pending roll")
    }

    tokenIdxF, ok := moveData["token_index"].(float64)
    if !ok {
        return false, nil, fmt.Errorf("missing token_index")
    }
    tokenIdx := int(tokenIdxF)
    if tokenIdx < 0 || tokenIdx > 3 {
        return false, nil, fmt.Errorf("token_index out of range")
    }

    tokens, err := ludoTokens(gameState, color)
    if err != nil {
        return false, nil, err
    }
    token := tokens[tokenIdx]
    pos := ludoTokenPosition(token)

    var newPos int
    if pos == -1 {
        if dice != 6 {
            return false, nil, fmt.Errorf("need a 6 to leave base")
        }
        newPos = 0
    } else {
        newPos = pos + dice
        if newPos > 57 {
            return false, nil, fmt.Errorf("move would overshoot home")
        }
    }

    captured := false
    if newPos >= 0 && newPos <= 50 {
        globalSq := ludoGlobalSquare(color, newPos)
        if !ludoSafeSquares[globalSq] {
            for i, otherColor := range ludoColors {
                if otherColor == color || i >= len(gameState.Players) {
                    continue
                }
                otherTokens, terr := ludoTokens(gameState, otherColor)
                if terr != nil {
                    continue
                }
                for _, ot := range otherTokens {
                    otPos := ludoTokenPosition(ot)
                    if otPos >= 0 && otPos <= 50 && ludoGlobalSquare(otherColor, otPos) == globalSq {
                        ot["position"] = -1
                        captured = true
                    }
                }
            }
        }
    }

    token["position"] = newPos
    reachedHome := newPos == 57

    gameState.GameData["current_dice"] = 0
    gameState.GameData["awaiting_move"] = false
    gameState.GameData["last_capture"] = captured
    gameState.GameData["last_token_home"] = reachedHome

    allHome := true
    for _, t := range tokens {
        if ludoTokenPosition(t) != 57 {
            allHome = false
            break
        }
    }
    if allHome {
        winner := gameState.Players[playerIdx].UserID
        return true, &winner, nil
    }

    // Six, a capture, or reaching home all grant an extra turn (matches the
    // generous Ludo King-style variant) — cancel the automatic advance so the
    // same player continues. consecutive_sixes needs no adjustment here: it's
    // only ever non-zero immediately after a 6 was rolled, which itself
    // already guarantees this same branch runs (same player continues) — by
    // the time a turn genuinely passes to someone else, the prior roll wasn't
    // a 6, so processLudoRoll already reset it to 0 on that call.
    if dice == 6 || captured || reachedHome {
        gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
    }

    return false, nil, nil
}
