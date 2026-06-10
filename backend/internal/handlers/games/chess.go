package games

import (
	"fmt"

	chess "github.com/notnil/chess"
)

func (gm *GameManager) processChessMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	from, ok := moveData["from"].(string)
	if !ok || from == "" {
		return false, nil, fmt.Errorf("missing from square")
	}
	to, ok := moveData["to"].(string)
	if !ok || to == "" {
		return false, nil, fmt.Errorf("missing to square")
	}
	promotion, _ := moveData["promotion"].(string)

	fenStr, _ := gameState.GameData["fen"].(string)
	if fenStr == "" {
		fenStr = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
	}

	fenOpt, err := chess.FEN(fenStr)
	if err != nil {
		return false, nil, fmt.Errorf("invalid FEN: %w", err)
	}
	game := chess.NewGame(fenOpt)

	fromSq, err := chessSquare(from)
	if err != nil {
		return false, nil, err
	}
	toSq, err := chessSquare(to)
	if err != nil {
		return false, nil, err
	}

	// Find the matching legal move
	var matched *chess.Move
	for _, m := range game.ValidMoves() {
		if m.S1() != fromSq || m.S2() != toSq {
			continue
		}
		// Promotion: if caller specified one, match it; otherwise default to queen
		if m.Promo() != chess.NoPieceType {
			want := chess.Queen
			if promotion != "" {
				want = promoFromStr(promotion)
			}
			if m.Promo() != want {
				continue
			}
		}
		matched = m
		break
	}
	if matched == nil {
		return false, nil, fmt.Errorf("illegal move: %s→%s", from, to)
	}

	if err := game.Move(matched); err != nil {
		return false, nil, fmt.Errorf("move failed: %w", err)
	}

	newFEN := game.Position().String()
	turn := "w"
	if game.Position().Turn() == chess.Black {
		turn = "b"
	}

	// Check status is handled client-side by chess.js; backend only needs to track
	// active / checkmate / stalemate / draw.
	status := "active"

	outcome := game.Outcome()
	switch outcome {
	case chess.WhiteWon:
		gameState.GameData["fen"] = newFEN
		gameState.GameData["turn"] = turn
		gameState.GameData["status"] = "checkmate"
		winnerID := gameState.Players[0].UserID
		return true, &winnerID, nil
	case chess.BlackWon:
		gameState.GameData["fen"] = newFEN
		gameState.GameData["turn"] = turn
		gameState.GameData["status"] = "checkmate"
		winnerID := gameState.Players[1].UserID
		return true, &winnerID, nil
	case chess.Draw:
		gameState.GameData["fen"] = newFEN
		gameState.GameData["turn"] = turn
		gameState.GameData["status"] = "draw"
		return true, nil, nil
	}

	gameState.GameData["fen"] = newFEN
	gameState.GameData["turn"] = turn
	gameState.GameData["status"] = status
	return false, nil, nil
}

// chessSquare converts a UCI square string (e.g. "e4") to a chess.Square value.
// notnil/chess uses Square = file + rank*8, with file a=0..h=7 and rank 1=0..8=7.
func chessSquare(s string) (chess.Square, error) {
	if len(s) != 2 {
		return chess.NoSquare, fmt.Errorf("invalid square: %s", s)
	}
	file := int(s[0] - 'a')
	rank := int(s[1] - '1')
	if file < 0 || file > 7 || rank < 0 || rank > 7 {
		return chess.NoSquare, fmt.Errorf("square out of range: %s", s)
	}
	return chess.Square(file + rank*8), nil
}

func promoFromStr(s string) chess.PieceType {
	switch s {
	case "r":
		return chess.Rook
	case "b":
		return chess.Bishop
	case "n":
		return chess.Knight
	default:
		return chess.Queen
	}
}
