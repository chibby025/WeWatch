package games

import "fmt"

// Board is 64 cells, row-major (index = row*8+col), but only dark squares
// ((row+col) odd) are ever occupied. "" empty, "b"/"B" black man/king,
// "r"/"R" red man/king. Players[0] is always Black (starts top, rows 0-2,
// moves toward increasing row), Players[1] is always Red (starts bottom,
// rows 5-7, moves toward decreasing row) — mirrors the Black/White,
// Player[0]/Player[1] convention already used by tic_tac_toe and othello.

func (gm *GameManager) processCheckersMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	fromF, ok := moveData["from"].(float64)
	if !ok {
		return false, nil, fmt.Errorf("invalid from")
	}
	toF, ok := moveData["to"].(float64)
	if !ok {
		return false, nil, fmt.Errorf("invalid to")
	}
	from, to := int(fromF), int(toF)

	if from < 0 || from > 63 || to < 0 || to > 63 {
		return false, nil, fmt.Errorf("position out of bounds")
	}

	board, err := getCheckersBoard(gameState)
	if err != nil {
		return false, nil, err
	}

	playerIdx := gameState.CurrentTurn

	if continueFrom, ok := gameState.GameData["must_continue_from"].(float64); ok {
		if from != int(continueFrom) {
			return false, nil, fmt.Errorf("must continue jumping with the same piece")
		}
	}

	piece := board[from]
	if piece == "" || checkersPieceOwner(piece) != playerIdx {
		return false, nil, fmt.Errorf("no piece of yours at that position")
	}
	if board[to] != "" {
		return false, nil, fmt.Errorf("destination occupied")
	}

	valid, isJump, captured := checkersClassifyMove(board, from, to, piece)
	if !valid {
		return false, nil, fmt.Errorf("illegal move")
	}

	// Mandatory capture: if any of the current player's pieces can jump anywhere
	// on the board, only jump moves are legal this turn.
	if !isJump && checkersAnyCaptureAvailable(board, playerIdx) {
		return false, nil, fmt.Errorf("a capture is available — you must take it")
	}

	board[to] = piece
	board[from] = ""
	if isJump {
		board[captured] = ""
	}

	// Kinging.
	toRow := to / 8
	if piece == "b" && toRow == 7 {
		board[to] = "B"
	} else if piece == "r" && toRow == 0 {
		board[to] = "R"
	}

	gameState.GameData["board"] = board

	if isJump && checkersHasCaptureFrom(board, to) {
		// Must continue jumping with the same piece — cancel out the caller's
		// automatic turn-advance the same way othello.go does for a skipped pass,
		// so the same player keeps their turn for the next move.
		gameState.GameData["must_continue_from"] = float64(to)
		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil
	}
	delete(gameState.GameData, "must_continue_from")

	opponentIdx := 1 - playerIdx
	if !checkersPlayerHasPieces(board, opponentIdx) || !checkersPlayerHasAnyMove(board, opponentIdx) {
		winnerID = &gameState.Players[playerIdx].UserID
		return true, winnerID, nil
	}

	return false, nil, nil
}

// checkersInitialBoard places black men on the dark squares of rows 0-2 and red
// men on the dark squares of rows 5-7, with rows 3-4 left empty. Shared by
// game_manager.go's initializeGameState (the DB/initial-broadcast path) and the
// lazy-init fallback below (the runtime GameData path) so both agree exactly.
func checkersInitialBoard() []string {
	board := make([]string, 64)
	for row := 0; row < 3; row++ {
		for col := 0; col < 8; col++ {
			if (row+col)%2 == 1 {
				board[row*8+col] = "b"
			}
		}
	}
	for row := 5; row < 8; row++ {
		for col := 0; col < 8; col++ {
			if (row+col)%2 == 1 {
				board[row*8+col] = "r"
			}
		}
	}
	return board
}

func getCheckersBoard(gameState *GameSessionState) ([]string, error) {
	boardInterface, ok := gameState.GameData["board"]
	if !ok {
		// GameData starts as a fresh empty map at game-session creation (separate
		// from the GameSession.GameState the initial game_started broadcast reads
		// from), so the very first move of every game lands here — same lazy-init
		// fallback tic_tac_toe.go and chess.go already rely on for this reason.
		board := checkersInitialBoard()
		gameState.GameData["board"] = board
		return board, nil
	}

	board := make([]string, 64)
	switch v := boardInterface.(type) {
	case []string:
		if len(v) != 64 {
			return nil, fmt.Errorf("invalid board length: %d", len(v))
		}
		copy(board, v)
	case []interface{}:
		if len(v) != 64 {
			return nil, fmt.Errorf("invalid board length: %d", len(v))
		}
		for i, cell := range v {
			cellStr, ok := cell.(string)
			if !ok {
				return nil, fmt.Errorf("invalid cell type at position %d", i)
			}
			board[i] = cellStr
		}
	default:
		return nil, fmt.Errorf("invalid board state type: %T", boardInterface)
	}

	return board, nil
}

// checkersPieceOwner returns 0 for black pieces, 1 for red pieces.
func checkersPieceOwner(piece string) int {
	if piece == "b" || piece == "B" {
		return 0
	}
	return 1
}

func checkersIsKing(piece string) bool {
	return piece == "B" || piece == "R"
}

// checkersClassifyMove reports whether from->to is a legal simple move or jump for
// `piece`. `valid` distinguishes "legal simple move, no capture" (valid=true,
// isJump=false, capturedIndex=-1) from "illegal in every way" (valid=false) — both
// of those legitimately have capturedIndex=-1, so a single (isJump, capturedIndex)
// return value can't tell them apart, which was a real bug in an earlier version of
// this function (every simple move was being rejected as illegal).
func checkersClassifyMove(board []string, from, to int, piece string) (valid bool, isJump bool, capturedIndex int) {
	fromRow, fromCol := from/8, from%8
	toRow, toCol := to/8, to%8
	dr, dc := toRow-fromRow, toCol-fromCol

	forward := 1
	if checkersPieceOwner(piece) == 1 {
		forward = -1
	}
	king := checkersIsKing(piece)

	if abs(dr) == 1 && abs(dc) == 1 {
		if !king && dr != forward {
			return false, false, -1
		}
		return true, false, -1
	}

	if abs(dr) == 2 && abs(dc) == 2 {
		if !king && dr != 2*forward {
			return false, false, -1
		}
		midRow, midCol := fromRow+dr/2, fromCol+dc/2
		midIdx := midRow*8 + midCol
		midPiece := board[midIdx]
		if midPiece == "" || checkersPieceOwner(midPiece) == checkersPieceOwner(piece) {
			return false, false, -1
		}
		return true, true, midIdx
	}

	return false, false, -1
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

func checkersHasCaptureFrom(board []string, from int) bool {
	piece := board[from]
	if piece == "" {
		return false
	}
	row, col := from/8, from%8
	for _, d := range [4][2]int{{-2, -2}, {-2, 2}, {2, -2}, {2, 2}} {
		r, c := row+d[0], col+d[1]
		if r < 0 || r > 7 || c < 0 || c > 7 {
			continue
		}
		to := r*8 + c
		if board[to] != "" {
			continue
		}
		if _, isJump, _ := checkersClassifyMove(board, from, to, piece); isJump {
			return true
		}
	}
	return false
}

func checkersAnyCaptureAvailable(board []string, playerIdx int) bool {
	for i, cell := range board {
		if cell != "" && checkersPieceOwner(cell) == playerIdx && checkersHasCaptureFrom(board, i) {
			return true
		}
	}
	return false
}

func checkersPlayerHasPieces(board []string, playerIdx int) bool {
	for _, cell := range board {
		if cell != "" && checkersPieceOwner(cell) == playerIdx {
			return true
		}
	}
	return false
}

func checkersPlayerHasAnyMove(board []string, playerIdx int) bool {
	for i, cell := range board {
		if cell == "" || checkersPieceOwner(cell) != playerIdx {
			continue
		}
		if checkersHasCaptureFrom(board, i) {
			return true
		}
		row, col := i/8, i%8
		forward := 1
		if playerIdx == 1 {
			forward = -1
		}
		king := checkersIsKing(cell)
		dirs := [][2]int{{forward, -1}, {forward, 1}}
		if king {
			dirs = [][2]int{{-1, -1}, {-1, 1}, {1, -1}, {1, 1}}
		}
		for _, d := range dirs {
			r, c := row+d[0], col+d[1]
			if r >= 0 && r < 8 && c >= 0 && c < 8 && board[r*8+c] == "" {
				return true
			}
		}
	}
	return false
}
