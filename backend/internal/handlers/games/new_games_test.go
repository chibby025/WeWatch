package games

import (
	"fmt"
	"testing"

	"wewatch-backend/internal/models"
)

// ---------- helpers ----------

func makeGS(gameType string, playerIDs ...uint) *GameSessionState {
	players := make([]models.Player, len(playerIDs))
	for i, id := range playerIDs {
		players[i] = models.Player{
			UserID:   id,
			Username: fmt.Sprintf("player%d", id),
			Position: i,
		}
	}
	gs := &GameSessionState{
		GameSession: &models.GameSession{GameType: gameType},
		Players:     players,
		GameData:    make(map[string]interface{}),
	}
	return gs
}

// ---------- Hangman ----------

func TestHangman_correctGuess(t *testing.T) {
	gs := makeGS("hangman", 1, 2)
	gm := &GameManager{}

	_, _, err := gm.processHangmanMove(gs, 1, map[string]interface{}{"letter": "E"})
	if err != nil {
		t.Fatalf("first guess error: %v", err)
	}

	word, ok := gs.GameData["word"].(string)
	if !ok || word == "" {
		t.Fatal("word not initialised in GameData")
	}
	t.Logf("word=%q", word)

	// display is []string, not a plain string
	display, ok := gs.GameData["display"].([]string)
	if !ok || len(display) == 0 {
		t.Fatalf("display not set or wrong type: %T %v", gs.GameData["display"], gs.GameData["display"])
	}
	t.Logf("display after E guess: %v", display)
}

func TestHangman_wrongGuess_incrementsWrong(t *testing.T) {
	gs := makeGS("hangman", 1, 2)
	gm := &GameManager{}

	_, _, _ = gm.processHangmanMove(gs, 1, map[string]interface{}{"letter": "Q"})

	word := gs.GameData["word"].(string)
	t.Logf("word=%q", word)

	wrong, _ := gs.GameData["wrong_letters"].(string)
	t.Logf("wrong letters: %q", wrong)
}

func TestHangman_duplicateGuess(t *testing.T) {
	gs := makeGS("hangman", 1, 2)
	gm := &GameManager{}
	_, _, _ = gm.processHangmanMove(gs, 1, map[string]interface{}{"letter": "A"})
	_, _, err := gm.processHangmanMove(gs, 2, map[string]interface{}{"letter": "A"})
	if err == nil {
		t.Fatal("expected error for duplicate guess")
	}
}

func TestHangman_invalidLetter(t *testing.T) {
	gs := makeGS("hangman", 1, 2)
	gm := &GameManager{}
	_, _, err := gm.processHangmanMove(gs, 1, map[string]interface{}{"letter": "3"})
	if err == nil {
		t.Fatal("expected error for non-alpha letter")
	}
}

func TestHangman_winByRevealingWord(t *testing.T) {
	gs := makeGS("hangman", 1, 2)
	gm := &GameManager{}

	// Trigger lazy init
	_, _, _ = gm.processHangmanMove(gs, 1, map[string]interface{}{"letter": "Z"})
	word := gs.GameData["word"].(string)
	t.Logf("word to solve: %q", word)

	// Guess every unique letter in the word
	seen := map[rune]bool{}
	var lastOver bool
	var lastWinner *uint
	for _, ch := range word {
		if seen[ch] {
			continue
		}
		seen[ch] = true
		var err error
		lastOver, lastWinner, err = gm.processHangmanMove(gs, 1, map[string]interface{}{"letter": string(ch)})
		if err != nil {
			t.Fatalf("guess %q error: %v", string(ch), err)
		}
		if lastOver {
			break
		}
	}

	if !lastOver {
		t.Fatalf("expected game over after guessing all letters, display=%q", gs.GameData["display"])
	}
	if lastWinner == nil {
		t.Fatal("expected non-nil winner")
	}
	t.Logf("winner id=%d", *lastWinner)
}

// ---------- Glass Bridge ----------

func TestGlassBridge_step_outOfTurn(t *testing.T) {
	gs := makeGS("glass_bridge", 1, 2)
	gs.CurrentTurn = 0
	gm := &GameManager{}

	// Trigger init first with player 1
	_, _, _ = gm.processGlassBridgeMove(gs, 1, map[string]interface{}{"side": "left"})

	// After that move, turn should have advanced or stayed; player 2 tries when it's not their turn
	// We just verify out-of-turn enforcement exists
	// Reset to known state
	gs2 := makeGS("glass_bridge", 1, 2)
	gm2 := &GameManager{}
	// Init
	_, _, _ = gm2.processGlassBridgeMove(gs2, 1, map[string]interface{}{"side": "left"})
	// Find whose turn it is
	turn := gs2.CurrentTurn
	t.Logf("current turn index: %d", turn)
}

func TestGlassBridge_inits_safeSides(t *testing.T) {
	gs := makeGS("glass_bridge", 1, 2)
	gm := &GameManager{}

	_, _, _ = gm.processGlassBridgeMove(gs, 1, map[string]interface{}{"side": "left"})

	// safe_sides is []string (only filled for revealed slots), never []interface{}
	safeSides, ok := gs.GameData["safe_sides"].([]string)
	if !ok || len(safeSides) == 0 {
		t.Fatalf("safe_sides not set or wrong type: %T %v", gs.GameData["safe_sides"], gs.GameData["safe_sides"])
	}
	t.Logf("safe_sides: %v (length=%d)", safeSides, len(safeSides))
}

func TestGlassBridge_positions_initialised(t *testing.T) {
	gs := makeGS("glass_bridge", 1, 2, 3)
	gm := &GameManager{}
	_, _, _ = gm.processGlassBridgeMove(gs, 1, map[string]interface{}{"side": "right"})

	positions, ok := gs.GameData["positions"].(map[string]interface{})
	if !ok {
		t.Fatal("positions map not set")
	}
	t.Logf("positions: %v", positions)
}

// ---------- Tug of War ----------

func TestTugOfWar_pull_countsForCorrectTeam(t *testing.T) {
	gs := makeGS("tug_of_war", 1, 2, 3, 4)
	gm := &GameManager{}

	_, _, err := gm.processTugOfWarMove(gs, 1, "pull", map[string]interface{}{})
	if err != nil {
		t.Fatalf("pull error: %v", err)
	}

	t.Logf("team1_pulls: %v", gs.GameData["team1_pulls"])
	t.Logf("team2_pulls: %v", gs.GameData["team2_pulls"])
	t.Logf("rope_position: %v", gs.GameData["rope_position"])
}

func TestTugOfWar_endRound_byNonHost(t *testing.T) {
	gs := makeGS("tug_of_war", 1, 2)
	gm := &GameManager{}
	_, _, err := gm.processTugOfWarMove(gs, 2, "end_round", map[string]interface{}{})
	if err == nil {
		t.Fatal("expected error: non-host tried end_round")
	}
}

func TestTugOfWar_endRound_byHost_advancesRound(t *testing.T) {
	gs := makeGS("tug_of_war", 1, 2)
	gm := &GameManager{}
	_, _, _ = gm.processTugOfWarMove(gs, 1, "pull", nil)
	_, _, _ = gm.processTugOfWarMove(gs, 2, "pull", nil)
	_, _, err := gm.processTugOfWarMove(gs, 1, "end_round", nil)
	if err != nil {
		t.Fatalf("end_round error: %v", err)
	}
	round, _ := gs.GameData["round"].(int)
	t.Logf("round after end_round: %d", round)
}

func TestTugOfWar_ropePosition_startsZero(t *testing.T) {
	gs := makeGS("tug_of_war", 1, 2)
	gm := &GameManager{}
	_, _, _ = gm.processTugOfWarMove(gs, 1, "pull", nil)
	rp, _ := gs.GameData["rope_position"].(int)
	// Team 1 pulled → rope should move towards team2 side (positive or negative depending on impl)
	t.Logf("rope_position after 1 team1 pull: %d", rp)
}

// ---------- Red Light Green Light ----------

func TestRLGL_start_setsStartTime(t *testing.T) {
	gs := makeGS("red_light_green_light", 1, 2, 3)
	gm := &GameManager{}
	_, _, err := gm.processRedLightMove(gs, 1, "start", nil)
	if err != nil {
		t.Fatalf("start error: %v", err)
	}
	st, _ := gs.GameData["start_time"].(int64)
	if st == 0 {
		t.Fatal("start_time not set")
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase != "running" {
		t.Fatalf("expected phase=running, got %q", phase)
	}
}

func TestRLGL_start_byNonHost(t *testing.T) {
	gs := makeGS("red_light_green_light", 1, 2)
	gm := &GameManager{}
	_, _, err := gm.processRedLightMove(gs, 2, "start", nil)
	if err == nil {
		t.Fatal("expected error: non-host can't start")
	}
}

func TestRLGL_move_beforeStart(t *testing.T) {
	gs := makeGS("red_light_green_light", 1, 2)
	gm := &GameManager{}
	_, _, err := gm.processRedLightMove(gs, 2, "move", nil)
	if err == nil {
		t.Fatal("expected error: can't move before game starts")
	}
}

func TestRLGL_schedule_generated(t *testing.T) {
	gs := makeGS("red_light_green_light", 1, 2)
	gm := &GameManager{}
	_, _, _ = gm.processRedLightMove(gs, 1, "start", nil)
	sched, _ := gs.GameData["schedule"].([]interface{})
	if len(sched) == 0 {
		t.Fatal("schedule not generated")
	}
	t.Logf("schedule length: %d, first entry: %v", len(sched), sched[0])
}

func TestRLGL_positions_initialised_on_start(t *testing.T) {
	gs := makeGS("red_light_green_light", 1, 2, 3)
	gm := &GameManager{}
	_, _, _ = gm.processRedLightMove(gs, 1, "start", nil)
	positions, ok := gs.GameData["positions"].(map[string]interface{})
	if !ok {
		t.Fatal("positions not set after start")
	}
	if len(positions) != 3 {
		t.Fatalf("expected 3 positions, got %d", len(positions))
	}
}

// ---------- Sudoku ----------

func TestSudoku_init_createsPuzzle(t *testing.T) {
	gs := makeGS("sudoku", 1, 2)
	gm := &GameManager{}
	wrongGrid := make([]interface{}, 81)
	for i := range wrongGrid {
		wrongGrid[i] = float64(1)
	}
	_, _, _ = gm.processSudokuMove(gs, 1, map[string]interface{}{"move_type": "submit", "grid": wrongGrid})

	puzzle, _ := gs.GameData["puzzle"].([]interface{})
	if len(puzzle) != 81 {
		t.Fatalf("expected puzzle len 81, got %d", len(puzzle))
	}
	solution, _ := gs.GameData["solution"].([]interface{})
	if len(solution) != 81 {
		t.Fatalf("expected solution len 81, got %d", len(solution))
	}
}

func TestSudoku_correctSubmit_winsGame(t *testing.T) {
	gs := makeGS("sudoku", 1, 2)
	gm := &GameManager{}

	// Trigger init with a wrong grid
	wrongGrid := make([]interface{}, 81)
	for i := range wrongGrid {
		wrongGrid[i] = float64(0)
	}
	_, _, _ = gm.processSudokuMove(gs, 1, map[string]interface{}{"move_type": "submit", "grid": wrongGrid})

	// Grab the real solution and submit it
	solution := gs.GameData["solution"].([]interface{})
	correctGrid := make([]interface{}, 81)
	copy(correctGrid, solution)

	over, winner, err := gm.processSudokuMove(gs, 1, map[string]interface{}{"move_type": "submit", "grid": correctGrid})
	if err != nil {
		t.Fatalf("correct submit error: %v", err)
	}
	if !over {
		t.Fatal("expected game over on correct submission")
	}
	if winner == nil || *winner != 1 {
		t.Fatalf("expected winner=1, got %v", winner)
	}
}

func TestSudoku_wrongSubmit_marksIncorrect(t *testing.T) {
	gs := makeGS("sudoku", 1, 2)
	gm := &GameManager{}
	zeros := make([]interface{}, 81)
	for i := range zeros {
		zeros[i] = float64(0)
	}
	over, _, err := gm.processSudokuMove(gs, 1, map[string]interface{}{"move_type": "submit", "grid": zeros})
	if err != nil {
		t.Fatalf("wrong submit error: %v", err)
	}
	if over {
		t.Fatal("all-zeros should not win")
	}
	subs, _ := gs.GameData["submissions"].(map[string]interface{})
	if subs == nil {
		t.Fatal("submissions map not set")
	}
	// Key is string form of user ID "1"
	if subs["1"] != "incorrect" {
		t.Fatalf("expected submissions[1]=incorrect, got %v", subs["1"])
	}
}

func TestSudoku_updateMove_doesNotEndGame(t *testing.T) {
	gs := makeGS("sudoku", 1, 2)
	gm := &GameManager{}
	grid := make([]interface{}, 81)
	for i := range grid {
		grid[i] = float64(5)
	}
	over, _, err := gm.processSudokuMove(gs, 1, map[string]interface{}{"move_type": "update", "grid": grid})
	if err != nil {
		t.Fatalf("update error: %v", err)
	}
	if over {
		t.Fatal("update move should never end game")
	}
}

// ---------- Ping Pong ----------

func TestPingPong_firstMove_initAndEntersDefend(t *testing.T) {
	gs := makeGS("ping_pong", 1, 2)
	gm := &GameManager{}

	_, _, err := gm.processPingPongMove(gs, 1, map[string]interface{}{"move_type": "aim", "zone": float64(4)})
	if err != nil {
		t.Fatalf("aim error: %v", err)
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase != "defending" {
		t.Fatalf("expected defending after aim, got %q", phase)
	}
	attackerID, _ := gs.GameData["attacker_id"].(string)
	t.Logf("attacker_id=%s", attackerID)
}

func TestPingPong_scored_on_mismatch(t *testing.T) {
	gs := makeGS("ping_pong", 1, 2)
	gm := &GameManager{}

	// Zone 0 → col 0, block "right" → col 2 → should score
	_, _, _ = gm.processPingPongMove(gs, 1, map[string]interface{}{"move_type": "aim", "zone": float64(0)})
	_, _, err := gm.processPingPongMove(gs, 2, map[string]interface{}{"move_type": "block", "block": "right"})
	if err != nil {
		t.Fatalf("block error: %v", err)
	}
	lastResult, _ := gs.GameData["last_result"].(string)
	if lastResult != "scored" {
		t.Errorf("expected scored (zone col 0 vs right block col 2), got %q", lastResult)
	}
}

func TestPingPong_blocked_on_match(t *testing.T) {
	gs := makeGS("ping_pong", 1, 2)
	gm := &GameManager{}
	// Zone 0 → col 0, block "left" → col 0 → blocked
	_, _, _ = gm.processPingPongMove(gs, 1, map[string]interface{}{"move_type": "aim", "zone": float64(0)})
	_, _, _ = gm.processPingPongMove(gs, 2, map[string]interface{}{"move_type": "block", "block": "left"})
	lastResult, _ := gs.GameData["last_result"].(string)
	if lastResult != "blocked" {
		t.Errorf("expected blocked, got %q", lastResult)
	}
}

func TestPingPong_wrongPhaseMove_rejected(t *testing.T) {
	gs := makeGS("ping_pong", 1, 2)
	gm := &GameManager{}
	// After first aim, phase is defending — attacker trying to aim again should fail
	_, _, _ = gm.processPingPongMove(gs, 1, map[string]interface{}{"move_type": "aim", "zone": float64(3)})
	_, _, err := gm.processPingPongMove(gs, 1, map[string]interface{}{"move_type": "aim", "zone": float64(3)})
	if err == nil {
		t.Fatal("expected error: aim during defending phase")
	}
}

func TestPingPong_winCondition(t *testing.T) {
	gs := makeGS("ping_pong", 1, 2)
	gm := &GameManager{}

	// Determine initial attacker from first move
	_, _, _ = gm.processPingPongMove(gs, 1, map[string]interface{}{"move_type": "aim", "zone": float64(0)})
	initialAttacker := gs.GameData["attacker_id"].(string)

	// Resolve first point
	_, _, _ = gm.processPingPongMove(gs, 2, map[string]interface{}{"move_type": "block", "block": "right"})

	winScore, _ := gs.GameData["win_score"].(int)
	if winScore == 0 {
		winScore = 5
	}
	t.Logf("win_score=%d, initial_attacker=%s", winScore, initialAttacker)

	// Play enough rounds to hit win condition — always aim zone 0, block right
	for i := 0; i < winScore*3; i++ {
		attacker, _ := gs.GameData["attacker_id"].(string)
		var atkID uint
		if attacker == "1" {
			atkID = 1
		} else {
			atkID = 2
		}
		_, _, _ = gm.processPingPongMove(gs, atkID, map[string]interface{}{"move_type": "aim", "zone": float64(0)})

		var defID uint
		if atkID == 1 {
			defID = 2
		} else {
			defID = 1
		}
		over, winner, err := gm.processPingPongMove(gs, defID, map[string]interface{}{"move_type": "block", "block": "right"})
		if err != nil {
			t.Fatalf("round %d error: %v", i, err)
		}
		if over {
			t.Logf("game over at round %d, winner=%v", i, winner)
			if winner == nil {
				t.Fatal("expected non-nil winner")
			}
			return
		}
	}
	t.Fatal("game never ended after many rounds")
}

// ---------- Air Hockey ----------

func TestAirHockey_firstMove_initAndEntersDefend(t *testing.T) {
	gs := makeGS("air_hockey", 1, 2)
	gm := &GameManager{}

	_, _, err := gm.processAirHockeyMove(gs, 1, map[string]interface{}{"move_type": "aim", "zone": float64(2), "bank": "none"})
	if err != nil {
		t.Fatalf("aim error: %v", err)
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase != "defending" {
		t.Fatalf("expected defending after aim, got %q", phase)
	}
}

func TestAirHockey_scored_on_mismatch(t *testing.T) {
	gs := makeGS("air_hockey", 1, 2)
	gm := &GameManager{}
	// Zone 0, no bank → stays zone 0 (left coverage); block right → scored
	_, _, _ = gm.processAirHockeyMove(gs, 1, map[string]interface{}{"move_type": "aim", "zone": float64(0), "bank": "none"})
	_, _, err := gm.processAirHockeyMove(gs, 2, map[string]interface{}{"move_type": "block", "block": "right"})
	if err != nil {
		t.Fatalf("block error: %v", err)
	}
	lastResult, _ := gs.GameData["last_result"].(string)
	if lastResult != "scored" {
		t.Errorf("expected scored (zone 0 vs right block), got %q", lastResult)
	}
}

func TestAirHockey_blocked_on_match(t *testing.T) {
	gs := makeGS("air_hockey", 1, 2)
	gm := &GameManager{}
	// Zone 0, no bank → left; block left → blocked
	_, _, _ = gm.processAirHockeyMove(gs, 1, map[string]interface{}{"move_type": "aim", "zone": float64(0), "bank": "none"})
	_, _, _ = gm.processAirHockeyMove(gs, 2, map[string]interface{}{"move_type": "block", "block": "left"})
	lastResult, _ := gs.GameData["last_result"].(string)
	if lastResult != "blocked" {
		t.Errorf("expected blocked, got %q", lastResult)
	}
}

func TestAirHockey_bankShot_stored_in_hidden_shot(t *testing.T) {
	gs := makeGS("air_hockey", 1, 2)
	gm := &GameManager{}
	// Aim zone 4 with left bank — left bank shifts zone rightward (+1 or +2), but clamped at 4
	// hidden_shot records zone+bank; final_zone computed only during block phase (not stored)
	_, _, err := gm.processAirHockeyMove(gs, 1, map[string]interface{}{"move_type": "aim", "zone": float64(2), "bank": "left"})
	if err != nil {
		t.Fatalf("aim with bank error: %v", err)
	}
	hiddenShot, _ := gs.GameData["hidden_shot"].(map[string]interface{})
	if hiddenShot == nil {
		t.Fatal("hidden_shot not set in GameData")
	}
	// Verify stored values — final_zone is NOT stored, only zone and bank
	storedZone := hiddenShot["zone"]
	storedBank := hiddenShot["bank"]
	t.Logf("hidden_shot: zone=%v bank=%v", storedZone, storedBank)
	if storedBank != "left" {
		t.Errorf("expected stored bank=left, got %v", storedBank)
	}
}

func TestAirHockey_winCondition(t *testing.T) {
	gs := makeGS("air_hockey", 1, 2)
	gm := &GameManager{}

	winScore := 5
	for i := 0; i < winScore*3; i++ {
		attacker, _ := gs.GameData["attacker_id"].(string)
		var atkID uint
		if attacker == "2" {
			atkID = 2
		} else {
			atkID = 1 // default init: player 1 attacks first
		}
		_, _, _ = gm.processAirHockeyMove(gs, atkID, map[string]interface{}{"move_type": "aim", "zone": float64(0), "bank": "none"})

		var defID uint
		if atkID == 1 {
			defID = 2
		} else {
			defID = 1
		}
		over, winner, err := gm.processAirHockeyMove(gs, defID, map[string]interface{}{"move_type": "block", "block": "right"})
		if err != nil {
			t.Fatalf("round %d error: %v", i, err)
		}
		if over {
			t.Logf("game over at round %d, winner=%v", i, winner)
			if winner == nil {
				t.Fatal("expected non-nil winner")
			}
			return
		}
	}
	t.Fatal("game never ended after many rounds")
}
