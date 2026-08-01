package games

import (
	"testing"
	"wewatch-backend/internal/models"
)

// makeTestPropertyTycoonState builds a deterministic N-player state directly
// (bypassing the DB/StartGame path) so tests can control cash/position/board
// exactly. Player i has UserID i+1, index i.
func makeTestPropertyTycoonState(numPlayers int) *GameSessionState {
	players := make([]models.Player, numPlayers)
	for i := range players {
		players[i] = models.Player{UserID: uint(i + 1)}
	}
	gs := &GameSessionState{
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{},
		GameSession: &models.GameSession{GameType: "property_tycoon"},
	}
	ensurePropertyTycoonState(gs)
	return gs
}

func TestPTBoardStructure(t *testing.T) {
	if len(ptBoard) != 40 {
		t.Fatalf("expected 40 spaces, got %d", len(ptBoard))
	}
	if ptBoard[0].Type != "go" {
		t.Errorf("space 0 should be GO, got %s", ptBoard[0].Type)
	}
	if ptBoard[10].Type != "jail" {
		t.Errorf("space 10 should be jail, got %s", ptBoard[10].Type)
	}
	if ptBoard[20].Type != "free_parking" {
		t.Errorf("space 20 should be free_parking, got %s", ptBoard[20].Type)
	}
	if ptBoard[30].Type != "go_to_jail" {
		t.Errorf("space 30 should be go_to_jail, got %s", ptBoard[30].Type)
	}
	groupCounts := map[string]int{}
	railroads, utilities := 0, 0
	for _, s := range ptBoard {
		if s.Type == "property" {
			groupCounts[s.Group]++
		}
		if s.Type == "railroad" {
			railroads++
		}
		if s.Type == "utility" {
			utilities++
		}
	}
	wantGroups := map[string]int{"brown": 2, "lightblue": 3, "pink": 3, "orange": 3, "red": 3, "yellow": 3, "green": 3, "darkblue": 2}
	for g, want := range wantGroups {
		if groupCounts[g] != want {
			t.Errorf("group %s: expected %d properties, got %d", g, want, groupCounts[g])
		}
	}
	if railroads != 4 {
		t.Errorf("expected 4 railroads, got %d", railroads)
	}
	if utilities != 2 {
		t.Errorf("expected 2 utilities, got %d", utilities)
	}
}

func TestPTLandingOnUnownedSetsPendingPurchase(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}

	gameOver, _, err := gm.ptMovePlayer(gs, 0, 1, false) // GO -> space 1 (Riverside Lane)
	if err != nil {
		t.Fatalf("move: %v", err)
	}
	if gameOver {
		t.Fatal("game should not be over")
	}
	pending := gs.GameData["pending_purchase"]
	if pending == nil || ptAsInt(pending) != 1 {
		t.Errorf("expected pending_purchase=1, got %v", pending)
	}
	// Turn must NOT have advanced yet — a decision is pending.
	if gs.CurrentTurn != 0 {
		t.Errorf("expected turn to stay with player 0 pending a buy/decline decision, got %d", gs.CurrentTurn)
	}
}

func TestPTBuyDeductsCashAndSetsOwner(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}
	gs.GameData["pending_purchase"] = 1 // Riverside Lane, $60

	_, _, err := gm.processPropertyTycoonMove(gs, 1, "buy", map[string]interface{}{})
	if err != nil {
		t.Fatalf("buy: %v", err)
	}
	if got := ptCashOf(gs.GameData, 0); got != ptStartingCash-60 {
		t.Errorf("expected cash %d after buying, got %d", ptStartingCash-60, got)
	}
	owner, houses, owned := ptPropertyInfo(gs.GameData, 1)
	if !owned || owner != 0 || houses != 0 {
		t.Errorf("expected space 1 owned by player 0 with 0 houses, got owner=%d houses=%d owned=%v", owner, houses, owned)
	}
	if gs.CurrentTurn != 1 {
		t.Errorf("expected turn to advance after buying (no double), got %d", gs.CurrentTurn)
	}
}

func TestPTDeclineLeavesUnowned(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}
	gs.GameData["pending_purchase"] = 1

	_, _, err := gm.processPropertyTycoonMove(gs, 1, "decline", map[string]interface{}{})
	if err != nil {
		t.Fatalf("decline: %v", err)
	}
	_, _, owned := ptPropertyInfo(gs.GameData, 1)
	if owned {
		t.Error("expected space 1 to remain unowned after declining")
	}
	if gs.CurrentTurn != 1 {
		t.Errorf("expected turn to advance after declining, got %d", gs.CurrentTurn)
	}
}

func TestPTRentPaidToOwner(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}
	ptSetPropertyOwner(gs.GameData, 1, 0) // player 0 owns Riverside Lane ($60, base rent 6)
	p0Before := ptCashOf(gs.GameData, 0)
	p1Before := ptCashOf(gs.GameData, 1)

	gameOver, _, err := gm.ptMovePlayer(gs, 1, 1, false) // player 1 lands on space 1
	if err != nil {
		t.Fatalf("move onto owned property: %v", err)
	}
	if gameOver {
		t.Fatal("game should not be over")
	}
	if got := ptCashOf(gs.GameData, 1); got != p1Before-6 {
		t.Errorf("expected renter to pay 6, cash went from %d to %d", p1Before, got)
	}
	if got := ptCashOf(gs.GameData, 0); got != p0Before+6 {
		t.Errorf("expected owner to receive 6, cash went from %d to %d", p0Before, got)
	}
}

func TestPTFullSetDoublesRentWithNoHouses(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}
	ptSetPropertyOwner(gs.GameData, 1, 0)
	ptSetPropertyOwner(gs.GameData, 3, 0) // player 0 owns BOTH brown properties
	p1Before := ptCashOf(gs.GameData, 1)

	if _, _, err := gm.ptMovePlayer(gs, 1, 1, false); err != nil {
		t.Fatalf("move: %v", err)
	}
	// Base rent for $60 property is 6; full-set-no-houses doubles it to 12.
	if got := ptCashOf(gs.GameData, 1); got != p1Before-12 {
		t.Errorf("expected full-set rent of 12, cash went from %d to %d", p1Before, got)
	}
}

func TestPTBuildRequiresFullGroupAndCash(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}
	ptSetPropertyOwner(gs.GameData, 1, 0) // only ONE of the two brown properties

	_, _, err := gm.processPropertyTycoonMove(gs, 1, "build", map[string]interface{}{"space": 1.0})
	if err == nil {
		t.Fatal("expected error: must own the full color group to build")
	}

	ptSetPropertyOwner(gs.GameData, 3, 0) // now owns both brown properties
	_, _, err = gm.processPropertyTycoonMove(gs, 1, "build", map[string]interface{}{"space": 1.0})
	if err != nil {
		t.Fatalf("build with full group owned: %v", err)
	}
	_, houses, _ := ptPropertyInfo(gs.GameData, 1)
	if houses != 1 {
		t.Errorf("expected 1 house built, got %d", houses)
	}
}

func TestPTBuildIncreasesRent(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}
	ptSetPropertyOwner(gs.GameData, 1, 0)
	ptSetPropertyOwner(gs.GameData, 3, 0)
	ptSetPropertyHouses(gs.GameData, 1, 2) // 2 houses on Riverside Lane

	p1Before := ptCashOf(gs.GameData, 1)
	if _, _, err := gm.ptMovePlayer(gs, 1, 1, false); err != nil {
		t.Fatalf("move: %v", err)
	}
	// base=6, 2 houses = base*15 = 90.
	if got := ptCashOf(gs.GameData, 1); got != p1Before-90 {
		t.Errorf("expected rent 90 with 2 houses, cash went from %d to %d", p1Before, got)
	}
}

func TestPTRailroadRentScalesWithCount(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}
	ptSetPropertyOwner(gs.GameData, 5, 0)  // North Station
	ptSetPropertyOwner(gs.GameData, 15, 0) // South Station — 2 railroads owned

	p1Before := ptCashOf(gs.GameData, 1)
	if _, _, err := gm.ptMovePlayer(gs, 1, 5, false); err != nil {
		t.Fatalf("move onto railroad: %v", err)
	}
	if got := ptCashOf(gs.GameData, 1); got != p1Before-50 {
		t.Errorf("expected rent 50 with 2 railroads owned, cash went from %d to %d", p1Before, got)
	}
}

func TestPTUtilityRentUsesDiceRoll(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}
	ptSetPropertyOwner(gs.GameData, 12, 0) // Power Plant only (1 of 2 utilities)
	gs.GameData["dice"] = []interface{}{3, 4}

	p1Before := ptCashOf(gs.GameData, 1)
	if _, _, err := gm.ptMovePlayer(gs, 1, 12, false); err != nil {
		t.Fatalf("move onto utility: %v", err)
	}
	// dice sum = 7, 1 utility owned -> 4x = 28.
	if got := ptCashOf(gs.GameData, 1); got != p1Before-28 {
		t.Errorf("expected rent 28 (7*4) with 1 utility, cash went from %d to %d", p1Before, got)
	}
}

func TestPTTaxPaidToBank(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}
	before := ptCashOf(gs.GameData, 0)

	if _, _, err := gm.ptMovePlayer(gs, 0, 4, false); err != nil { // Income Tax, $200
		t.Fatalf("move onto tax: %v", err)
	}
	if got := ptCashOf(gs.GameData, 0); got != before-200 {
		t.Errorf("expected 200 income tax paid, cash went from %d to %d", before, got)
	}
}

func TestPTPassingGoCollectsBonus(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}
	ptSetPosition(gs.GameData, 0, 38) // near the end of the board
	before := ptCashOf(gs.GameData, 0)

	// 38 + 5 = 43 -> wraps to 3, passing GO.
	if _, _, err := gm.ptMovePlayer(gs, 0, 5, false); err != nil {
		t.Fatalf("move: %v", err)
	}
	if got := ptCashOf(gs.GameData, 0); got != before+ptGoBonus {
		t.Errorf("expected GO bonus of %d, cash went from %d to %d", ptGoBonus, before, got)
	}
	if pos := ptPositionOf(gs.GameData, 0); pos != 3 {
		t.Errorf("expected final position 3, got %d", pos)
	}
}

func TestPTCardCollectEffect(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}
	// Force a known card by pre-seeding the deck order.
	gs.GameData["fortune_deck"] = []interface{}{3} // "Bank pays you a dividend of $50"
	gs.GameData["fortune_pos"] = 0
	before := ptCashOf(gs.GameData, 0)

	if _, _, err := gm.ptDrawCard(gs, 0, "fortune"); err != nil {
		t.Fatalf("draw card: %v", err)
	}
	if got := ptCashOf(gs.GameData, 0); got != before+50 {
		t.Errorf("expected +50 from card, cash went from %d to %d", before, got)
	}
}

func TestPTCardJailEffect(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}
	gs.GameData["cityfund_deck"] = []interface{}{4} // "Go directly to Jail"
	gs.GameData["cityfund_pos"] = 0

	if _, _, err := gm.ptDrawCard(gs, 0, "cityfund"); err != nil {
		t.Fatalf("draw card: %v", err)
	}
	inJail, _ := ptJailInfo(gs.GameData, 0)
	if !inJail {
		t.Error("expected player to be in jail after drawing the jail card")
	}
	if pos := ptPositionOf(gs.GameData, 0); pos != ptJailSpace {
		t.Errorf("expected position to be jail space %d, got %d", ptJailSpace, pos)
	}
}

func TestPTGoToJailSpace(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}

	if _, _, err := gm.ptMovePlayer(gs, 0, 30, false); err != nil { // GO -> Go To Jail
		t.Fatalf("move: %v", err)
	}
	inJail, _ := ptJailInfo(gs.GameData, 0)
	if !inJail {
		t.Error("expected player to be in jail after landing on Go To Jail")
	}
	if pos := ptPositionOf(gs.GameData, 0); pos != ptJailSpace {
		t.Errorf("expected position %d (jail), got %d", ptJailSpace, pos)
	}
	// Landing on Go To Jail must NOT award a passing-GO bonus even though
	// the raw step count would wrap around 0.
	if got := ptCashOf(gs.GameData, 0); got != ptStartingCash {
		t.Errorf("expected no GO bonus when sent to jail, cash=%d", got)
	}
}

func TestPTPayJailFine(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}
	ptSetJailInfo(gs.GameData, 0, true, 1)
	before := ptCashOf(gs.GameData, 0)

	_, _, err := gm.processPropertyTycoonMove(gs, 1, "pay_jail_fine", map[string]interface{}{})
	if err != nil {
		t.Fatalf("pay jail fine: %v", err)
	}
	inJail, _ := ptJailInfo(gs.GameData, 0)
	if inJail {
		t.Error("expected player to be released from jail")
	}
	if got := ptCashOf(gs.GameData, 0); got != before-ptJailFine {
		t.Errorf("expected fine of %d deducted, cash went from %d to %d", ptJailFine, before, got)
	}
}

func TestPTUseJailCard(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}
	ptSetJailInfo(gs.GameData, 0, true, 1)
	m, _ := gs.GameData["get_out_free"].(map[string]interface{})
	m["0"] = 1
	gs.GameData["get_out_free"] = m

	_, _, err := gm.processPropertyTycoonMove(gs, 1, "use_jail_card", map[string]interface{}{})
	if err != nil {
		t.Fatalf("use jail card: %v", err)
	}
	inJail, _ := ptJailInfo(gs.GameData, 0)
	if inJail {
		t.Error("expected player to be released from jail")
	}
	if got := ptAsInt(gs.GameData["get_out_free"].(map[string]interface{})["0"]); got != 0 {
		t.Errorf("expected jail-free card count to drop to 0, got %d", got)
	}
}

func TestPTUseJailCardFailsWithoutOne(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}
	ptSetJailInfo(gs.GameData, 0, true, 1)

	_, _, err := gm.processPropertyTycoonMove(gs, 1, "use_jail_card", map[string]interface{}{})
	if err == nil {
		t.Fatal("expected error: no Get Out of Jail Free card held")
	}
}

func TestPTBankruptcyToPlayerTransfersProperties(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}
	ptSetPropertyOwner(gs.GameData, 1, 1) // player 1 (index 1) owns a property
	ptSetCash(gs.GameData, 0, 5)          // player 0 has almost nothing

	gameOver, winnerID, err := gm.ptPay(gs, 0, 1, 100) // player 0 owes player 1 $100, can't pay
	if err != nil {
		t.Fatalf("pay: %v", err)
	}
	if !gameOver {
		t.Fatal("expected the game to be over — only 1 solvent player left (2-player game)")
	}
	if winnerID == nil || *winnerID != 2 { // player index 1 = UserID 2
		t.Errorf("expected player UserID 2 to win, got %v", winnerID)
	}
	if !ptIsBankrupt(gs.GameData, 0) {
		t.Error("expected player 0 to be marked bankrupt")
	}
	owner, _, owned := ptPropertyInfo(gs.GameData, 1)
	if !owned || owner != 1 {
		t.Errorf("expected space 1 to remain owned by player 1 (was already theirs), got owner=%d", owner)
	}
}

func TestPTBankruptcyToBankReturnsPropertyToUnowned(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}
	ptSetPropertyOwner(gs.GameData, 1, 0) // player 0 owns a property
	ptSetCash(gs.GameData, 0, 5)

	gameOver, winnerID, err := gm.ptPay(gs, 0, -1, 200) // owes the BANK (e.g. a tax), can't pay
	if err != nil {
		t.Fatalf("pay: %v", err)
	}
	if !gameOver || winnerID == nil || *winnerID != 2 {
		t.Fatalf("expected player 2 to win, got gameOver=%v winnerID=%v", gameOver, winnerID)
	}
	_, _, owned := ptPropertyInfo(gs.GameData, 1)
	if owned {
		t.Error("expected space 1 to return to the bank (unowned) after bankruptcy to the bank")
	}
}

func TestPTBankruptcyInThreePlayerGameContinues(t *testing.T) {
	gs := makeTestPropertyTycoonState(3)
	gm := &GameManager{}
	ptSetCash(gs.GameData, 0, 5)

	gameOver, winnerID, err := gm.ptPay(gs, 0, 1, 100)
	if err != nil {
		t.Fatalf("pay: %v", err)
	}
	if gameOver {
		t.Fatal("expected the game to continue — 2 solvent players remain")
	}
	if winnerID != nil {
		t.Errorf("expected no winner yet, got %v", winnerID)
	}
	if !ptIsBankrupt(gs.GameData, 0) {
		t.Error("expected player 0 to be bankrupt")
	}
}

func TestPTDoublesGrantAnotherRollSamePlayer(t *testing.T) {
	gs := makeTestPropertyTycoonState(2)
	gm := &GameManager{}

	// Simulate what processBackgammonRoll-equivalent logic does for a double:
	// land somewhere with no pending decision, wasDouble=true.
	if _, _, err := gm.ptMovePlayer(gs, 0, 3, true); err != nil {
		t.Fatalf("move: %v", err)
	}
	if gs.CurrentTurn != 0 {
		t.Errorf("expected turn to stay with player 0 after a double, got %d", gs.CurrentTurn)
	}
	awaiting, _ := gs.GameData["awaiting_roll"].(bool)
	if !awaiting {
		t.Error("expected awaiting_roll=true so the same player can roll again")
	}
}
