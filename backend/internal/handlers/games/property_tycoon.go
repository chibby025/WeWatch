package games

import (
	"fmt"
	"math/rand"
)

// Property Tycoon: a streamlined property-trading race game in the same
// functional family as Monopoly — buy properties, collect rent, build
// houses/hotels, draw event cards, go to jail, last player solvent wins.
// Deliberately NOT called (or spelled like) "Monopoly" — that name, the real
// board's street names/layout-as-arranged, and its card text are Hasbro's;
// none of that is reused here. Only the generic MECHANICS (which are
// functional game design, not copyrightable) are replicated, same reasoning
// already applied to every other game in this package. The board below uses
// entirely original district names and an original card deck.
//
// Explicit, product-decided simplifications vs. the real game (matches this
// package's precedent of dropping sub-mechanics for a casual build — e.g.
// Blackjack has no betting, Backgammon has no doubling cube):
//   - No trading between players.
//   - No auctions — a declined property just stays unowned for whoever
//     lands on it next.
//   - No mortgaging — a player who can't cover a debt goes bankrupt
//     immediately, even if they own valuable property elsewhere. This is a
//     real, accepted consequence of skipping mortgaging, not an oversight.
//   - No "even building" requirement or bank house/hotel supply limit.
// 2-6 players, no artificial time/turn limit — ends naturally on bankruptcy
// (last player left wins), same as the real game.
//
// Fully perfect-information (all cash/properties/positions are public) — no
// Hands/private-rack machinery needed, like Backgammon.
//
// move_types:
//   roll            {}                    — roll dice and move (or attempt a jail escape if in jail).
//   buy             {}                     — buy the currently-pending unowned property/railroad/utility.
//   decline         {}                     — decline to buy it; stays unowned.
//   build           { space: int }         — build one house (or a hotel on the 5th) on an owned property.
//   pay_jail_fine   {}                     — pay $50 to leave jail immediately (only while in jail, before rolling).
//   use_jail_card   {}                     — spend a Get-Out-Of-Jail-Free card (only while in jail, before rolling).

const ptBoardSize = 40
const ptStartingCash = 1500
const ptJailSpace = 10
const ptGoToJailSpace = 30
const ptJailFine = 50
const ptGoBonus = 200
const ptMaxJailTurns = 3

type ptSpace struct {
	Name      string
	Type      string // go, property, railroad, utility, chance, community_chest, tax, jail, free_parking, go_to_jail
	Group     string // color group key for properties, "" otherwise
	Price     int
	HouseCost int
	TaxAmount int
}

var ptBoard = [ptBoardSize]ptSpace{
	{Name: "GO", Type: "go"},
	{Name: "Riverside Lane", Type: "property", Group: "brown", Price: 60, HouseCost: 50},
	{Name: "City Fund", Type: "community_chest"},
	{Name: "Dockside Alley", Type: "property", Group: "brown", Price: 60, HouseCost: 50},
	{Name: "Income Tax", Type: "tax", TaxAmount: 200},
	{Name: "North Station", Type: "railroad", Price: 200},
	{Name: "Maple Street", Type: "property", Group: "lightblue", Price: 100, HouseCost: 50},
	{Name: "Fortune", Type: "chance"},
	{Name: "Elm Street", Type: "property", Group: "lightblue", Price: 100, HouseCost: 50},
	{Name: "Cedar Street", Type: "property", Group: "lightblue", Price: 120, HouseCost: 50},
	{Name: "Jail / Just Visiting", Type: "jail"},
	{Name: "Sunset Boulevard", Type: "property", Group: "pink", Price: 140, HouseCost: 100},
	{Name: "Power Plant", Type: "utility", Price: 150},
	{Name: "Harbor View", Type: "property", Group: "pink", Price: 140, HouseCost: 100},
	{Name: "Marina Walk", Type: "property", Group: "pink", Price: 160, HouseCost: 100},
	{Name: "South Station", Type: "railroad", Price: 200},
	{Name: "Central Plaza", Type: "property", Group: "orange", Price: 180, HouseCost: 100},
	{Name: "City Fund", Type: "community_chest"},
	{Name: "Market Square", Type: "property", Group: "orange", Price: 180, HouseCost: 100},
	{Name: "Union Court", Type: "property", Group: "orange", Price: 200, HouseCost: 100},
	{Name: "Free Parking", Type: "free_parking"},
	{Name: "Highland Ave", Type: "property", Group: "red", Price: 220, HouseCost: 150},
	{Name: "Fortune", Type: "chance"},
	{Name: "Ridgeway Drive", Type: "property", Group: "red", Price: 220, HouseCost: 150},
	{Name: "Summit Road", Type: "property", Group: "red", Price: 240, HouseCost: 150},
	{Name: "East Terminal", Type: "railroad", Price: 200},
	{Name: "Golden Gate Row", Type: "property", Group: "yellow", Price: 260, HouseCost: 150},
	{Name: "Silver Creek", Type: "property", Group: "yellow", Price: 260, HouseCost: 150},
	{Name: "Water Utility", Type: "utility", Price: 150},
	{Name: "Amber Heights", Type: "property", Group: "yellow", Price: 280, HouseCost: 150},
	{Name: "Go To Jail", Type: "go_to_jail"},
	{Name: "Emerald District", Type: "property", Group: "green", Price: 300, HouseCost: 200},
	{Name: "Jade Terrace", Type: "property", Group: "green", Price: 300, HouseCost: 200},
	{Name: "City Fund", Type: "community_chest"},
	{Name: "Crystal Park", Type: "property", Group: "green", Price: 320, HouseCost: 200},
	{Name: "West Terminal", Type: "railroad", Price: 200},
	{Name: "Fortune", Type: "chance"},
	{Name: "Skyline Tower", Type: "property", Group: "darkblue", Price: 350, HouseCost: 200},
	{Name: "Luxury Tax", Type: "tax", TaxAmount: 100},
	{Name: "Grand Plaza", Type: "property", Group: "darkblue", Price: 400, HouseCost: 200},
}

type ptCard struct {
	Text   string
	Effect string // collect, pay, collect_each, pay_each, move_to, move_relative, jail, jail_free
	Amount int
	Space  int
}

var ptFortuneCards = []ptCard{
	{Text: "Advance to GO — collect $200", Effect: "move_to", Space: 0},
	{Text: "Advance to Grand Plaza", Effect: "move_to", Space: 39},
	{Text: "Advance to North Station", Effect: "move_to", Space: 5},
	{Text: "Bank pays you a dividend of $50", Effect: "collect", Amount: 50},
	{Text: "Get Out of Jail Free — keep this card until needed", Effect: "jail_free"},
	{Text: "Go back 3 spaces", Effect: "move_relative", Amount: -3},
	{Text: "Go directly to Jail", Effect: "jail"},
	{Text: "Pay $100 for property repairs", Effect: "pay", Amount: 100},
	{Text: "Speeding fine — pay $15", Effect: "pay", Amount: 15},
	{Text: "Take a trip to Central Plaza", Effect: "move_to", Space: 16},
	{Text: "You've been elected chairperson — pay each player $50", Effect: "pay_each", Amount: 50},
	{Text: "Your building loan matures — collect $150", Effect: "collect", Amount: 150},
	{Text: "Advance to Water Utility", Effect: "move_to", Space: 28},
	{Text: "Advance to East Terminal", Effect: "move_to", Space: 25},
	{Text: "Collect $20 for winning a contest", Effect: "collect", Amount: 20},
	{Text: "Advance to Sunset Boulevard", Effect: "move_to", Space: 11},
}

var ptCityFundCards = []ptCard{
	{Text: "Bank error in your favor — collect $200", Effect: "collect", Amount: 200},
	{Text: "Doctor's fees — pay $50", Effect: "pay", Amount: 50},
	{Text: "From sale of stock — collect $50", Effect: "collect", Amount: 50},
	{Text: "Get Out of Jail Free — keep this card until needed", Effect: "jail_free"},
	{Text: "Go directly to Jail", Effect: "jail"},
	{Text: "Holiday fund matures — collect $100", Effect: "collect", Amount: 100},
	{Text: "Income tax refund — collect $20", Effect: "collect", Amount: 20},
	{Text: "It's your birthday — collect $10 from every player", Effect: "collect_each", Amount: 10},
	{Text: "Life insurance matures — collect $100", Effect: "collect", Amount: 100},
	{Text: "Pay hospital fees of $100", Effect: "pay", Amount: 100},
	{Text: "Pay school fees of $50", Effect: "pay", Amount: 50},
	{Text: "Receive $25 consultancy fee", Effect: "collect", Amount: 25},
	{Text: "Property repairs — pay $40", Effect: "pay", Amount: 40},
	{Text: "Second prize in a contest — collect $10", Effect: "collect", Amount: 10},
	{Text: "You inherit $100", Effect: "collect", Amount: 100},
	{Text: "Advance to GO — collect $200", Effect: "move_to", Space: 0},
}

func ptBaseRent(price int) int { return price / 10 }

// ptPropertyRent computes rent for a color-group property. houses is 0-4
// (regular houses) or 5 (hotel).
func ptPropertyRent(price, houses int, ownsFullSet bool) int {
	base := ptBaseRent(price)
	switch houses {
	case 0:
		if ownsFullSet {
			return base * 2
		}
		return base
	case 1:
		return base * 5
	case 2:
		return base * 15
	case 3:
		return base * 30
	case 4:
		return base * 45
	default: // 5 = hotel
		return base * 60
	}
}

var ptRailroadRents = []int{25, 50, 100, 200}

func ensurePropertyTycoonState(gameState *GameSessionState) {
	if _, ok := gameState.GameData["cash"]; ok {
		return
	}
	cash := map[string]interface{}{}
	positions := map[string]interface{}{}
	jail := map[string]interface{}{}
	getOutFree := map[string]interface{}{}
	bankrupt := map[string]interface{}{}
	for i := range gameState.Players {
		key := fmt.Sprintf("%d", i)
		cash[key] = ptStartingCash
		positions[key] = 0
		jail[key] = map[string]interface{}{"in_jail": false, "turns": 0}
		getOutFree[key] = 0
		bankrupt[key] = false
	}
	gameState.GameData["cash"] = cash
	gameState.GameData["positions"] = positions
	gameState.GameData["properties"] = map[string]interface{}{} // space(string) -> {owner, houses}
	gameState.GameData["jail"] = jail
	gameState.GameData["get_out_free"] = getOutFree
	gameState.GameData["bankrupt"] = bankrupt
	gameState.GameData["dice"] = []interface{}{}
	gameState.GameData["awaiting_roll"] = true
	gameState.GameData["pending_purchase"] = nil
	gameState.GameData["doubles_count"] = 0
	gameState.GameData["last_event"] = ""
	gameState.GameData["fortune_deck"] = ptShuffledIndices(len(ptFortuneCards))
	gameState.GameData["fortune_pos"] = 0
	gameState.GameData["cityfund_deck"] = ptShuffledIndices(len(ptCityFundCards))
	gameState.GameData["cityfund_pos"] = 0
}

func ptShuffledIndices(n int) []interface{} {
	idx := make([]int, n)
	for i := range idx {
		idx[i] = i
	}
	rand.Shuffle(n, func(i, j int) { idx[i], idx[j] = idx[j], idx[i] })
	out := make([]interface{}, n)
	for i, v := range idx {
		out[i] = v
	}
	return out
}

func ptCashOf(gameData map[string]interface{}, playerIdx int) int {
	m, _ := gameData["cash"].(map[string]interface{})
	return ptAsInt(m[fmt.Sprintf("%d", playerIdx)])
}

func ptSetCash(gameData map[string]interface{}, playerIdx, value int) {
	m, ok := gameData["cash"].(map[string]interface{})
	if !ok {
		m = map[string]interface{}{}
	}
	m[fmt.Sprintf("%d", playerIdx)] = value
	gameData["cash"] = m
}

func ptAsInt(v interface{}) int {
	switch n := v.(type) {
	case int:
		return n
	case float64:
		return int(n)
	default:
		return 0
	}
}

func ptPositionOf(gameData map[string]interface{}, playerIdx int) int {
	m, _ := gameData["positions"].(map[string]interface{})
	return ptAsInt(m[fmt.Sprintf("%d", playerIdx)])
}

func ptSetPosition(gameData map[string]interface{}, playerIdx, pos int) {
	m, ok := gameData["positions"].(map[string]interface{})
	if !ok {
		m = map[string]interface{}{}
	}
	m[fmt.Sprintf("%d", playerIdx)] = pos
	gameData["positions"] = m
}

func ptIsBankrupt(gameData map[string]interface{}, playerIdx int) bool {
	m, _ := gameData["bankrupt"].(map[string]interface{})
	b, _ := m[fmt.Sprintf("%d", playerIdx)].(bool)
	return b
}

func ptProperties(gameData map[string]interface{}) map[string]interface{} {
	m, ok := gameData["properties"].(map[string]interface{})
	if !ok {
		m = map[string]interface{}{}
		gameData["properties"] = m
	}
	return m
}

// ptPropertyInfo returns (ownerIdx, houses, owned) for a board space.
func ptPropertyInfo(gameData map[string]interface{}, space int) (int, int, bool) {
	props := ptProperties(gameData)
	raw, ok := props[fmt.Sprintf("%d", space)]
	if !ok {
		return -1, 0, false
	}
	m, ok := raw.(map[string]interface{})
	if !ok {
		return -1, 0, false
	}
	owner := ptAsInt(m["owner"])
	houses := ptAsInt(m["houses"])
	return owner, houses, true
}

func ptSetPropertyOwner(gameData map[string]interface{}, space, ownerIdx int) {
	props := ptProperties(gameData)
	props[fmt.Sprintf("%d", space)] = map[string]interface{}{"owner": ownerIdx, "houses": 0}
	gameData["properties"] = props
}

func ptSetPropertyHouses(gameData map[string]interface{}, space, houses int) {
	props := ptProperties(gameData)
	owner, _, _ := ptPropertyInfo(gameData, space)
	props[fmt.Sprintf("%d", space)] = map[string]interface{}{"owner": owner, "houses": houses}
	gameData["properties"] = props
}

// ptOwnsFullGroup reports whether playerIdx owns every property in the
// given color group.
func ptOwnsFullGroup(gameData map[string]interface{}, playerIdx int, group string) bool {
	if group == "" {
		return false
	}
	for space, s := range ptBoard {
		if s.Group != group {
			continue
		}
		owner, _, owned := ptPropertyInfo(gameData, space)
		if !owned || owner != playerIdx {
			return false
		}
	}
	return true
}

func ptCountOwnedOfType(gameData map[string]interface{}, playerIdx int, spaceType string) int {
	count := 0
	for space, s := range ptBoard {
		if s.Type != spaceType {
			continue
		}
		owner, _, owned := ptPropertyInfo(gameData, space)
		if owned && owner == playerIdx {
			count++
		}
	}
	return count
}

func (gm *GameManager) processPropertyTycoonMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (bool, *uint, error) {
	ensurePropertyTycoonState(gameState)

	playerIdx := -1
	for i, p := range gameState.Players {
		if p.UserID == playerID {
			playerIdx = i
			break
		}
	}
	if playerIdx == -1 {
		return false, nil, fmt.Errorf("you are not a player in this game")
	}
	if ptIsBankrupt(gameState.GameData, playerIdx) {
		return false, nil, fmt.Errorf("you are bankrupt and out of the game")
	}

	switch moveType {
	case "roll":
		return gm.ptProcessRoll(gameState, playerIdx)
	case "buy":
		return gm.ptProcessBuy(gameState, playerIdx)
	case "decline":
		return gm.ptProcessDecline(gameState, playerIdx)
	case "build":
		return gm.ptProcessBuild(gameState, playerIdx, moveData)
	case "pay_jail_fine":
		return gm.ptProcessPayJailFine(gameState, playerIdx)
	case "use_jail_card":
		return gm.ptProcessUseJailCard(gameState, playerIdx)
	default:
		return false, nil, fmt.Errorf("unknown property tycoon move type: %s", moveType)
	}
}

func ptJailInfo(gameData map[string]interface{}, playerIdx int) (bool, int) {
	m, _ := gameData["jail"].(map[string]interface{})
	entry, ok := m[fmt.Sprintf("%d", playerIdx)].(map[string]interface{})
	if !ok {
		return false, 0
	}
	inJail, _ := entry["in_jail"].(bool)
	return inJail, ptAsInt(entry["turns"])
}

func ptSetJailInfo(gameData map[string]interface{}, playerIdx int, inJail bool, turns int) {
	m, ok := gameData["jail"].(map[string]interface{})
	if !ok {
		m = map[string]interface{}{}
	}
	m[fmt.Sprintf("%d", playerIdx)] = map[string]interface{}{"in_jail": inJail, "turns": turns}
	gameData["jail"] = m
}

func (gm *GameManager) ptProcessRoll(gameState *GameSessionState, playerIdx int) (bool, *uint, error) {
	awaiting, _ := gameState.GameData["awaiting_roll"].(bool)
	if !awaiting {
		return false, nil, fmt.Errorf("you've already rolled — resolve the current turn first")
	}

	d1 := rand.Intn(6) + 1
	d2 := rand.Intn(6) + 1
	isDouble := d1 == d2
	gameState.GameData["dice"] = []interface{}{d1, d2}

	inJail, turns := ptJailInfo(gameState.GameData, playerIdx)
	if inJail {
		if isDouble {
			ptSetJailInfo(gameState.GameData, playerIdx, false, 0)
			gameOver, winner, err := gm.ptMovePlayer(gameState, playerIdx, d1+d2, false)
			return gameOver, winner, err
		}
		turns++
		if turns >= ptMaxJailTurns {
			// Forced to pay the fine and move on the 3rd failed attempt.
			cash := ptCashOf(gameState.GameData, playerIdx)
			if cash < ptJailFine {
				return gm.ptBankrupt(gameState, playerIdx, -1)
			}
			ptSetCash(gameState.GameData, playerIdx, cash-ptJailFine)
			ptSetJailInfo(gameState.GameData, playerIdx, false, 0)
			return gm.ptMovePlayer(gameState, playerIdx, d1+d2, false)
		}
		ptSetJailInfo(gameState.GameData, playerIdx, true, turns)
		gameState.GameData["awaiting_roll"] = true
		gameState.CurrentTurn = (gameState.CurrentTurn + 1) % len(gameState.Players)
		return false, nil, nil
	}

	if isDouble {
		count := ptAsInt(gameState.GameData["doubles_count"]) + 1
		gameState.GameData["doubles_count"] = count
		if count >= 3 {
			gameState.GameData["doubles_count"] = 0
			gm.ptSendToJail(gameState, playerIdx)
			gameState.GameData["awaiting_roll"] = true
			gameState.CurrentTurn = (gameState.CurrentTurn + 1) % len(gameState.Players)
			return false, nil, nil
		}
	} else {
		gameState.GameData["doubles_count"] = 0
	}

	return gm.ptMovePlayer(gameState, playerIdx, d1+d2, isDouble)
}

// ptMovePlayer advances playerIdx by steps, resolves the landing space, and
// decides whether the same player continues (rolled a double, or a purchase
// decision is now pending) or the turn passes.
func (gm *GameManager) ptMovePlayer(gameState *GameSessionState, playerIdx, steps int, wasDouble bool) (bool, *uint, error) {
	oldPos := ptPositionOf(gameState.GameData, playerIdx)
	newPos := (oldPos + steps) % ptBoardSize
	if newPos < oldPos {
		cash := ptCashOf(gameState.GameData, playerIdx)
		ptSetCash(gameState.GameData, playerIdx, cash+ptGoBonus)
	}
	ptSetPosition(gameState.GameData, playerIdx, newPos)

	gameOver, winner, err := gm.ptResolveLanding(gameState, playerIdx, newPos)
	if err != nil || gameOver {
		return gameOver, winner, err
	}

	pending := gameState.GameData["pending_purchase"]
	if pending != nil {
		// Awaiting a buy/decline decision — don't advance the turn yet.
		return false, nil, nil
	}

	gameState.GameData["awaiting_roll"] = true
	if !wasDouble {
		gameState.CurrentTurn = (gameState.CurrentTurn + 1) % len(gameState.Players)
	}
	// wasDouble: same player continues — CurrentTurn untouched, awaiting_roll
	// already reset so they can roll again.
	return false, nil, nil
}

// ptResolveLanding applies the effect of landing on `space` for playerIdx.
func (gm *GameManager) ptResolveLanding(gameState *GameSessionState, playerIdx, space int) (bool, *uint, error) {
	s := ptBoard[space]
	switch s.Type {
	case "go", "free_parking", "jail":
		// no-op
	case "go_to_jail":
		gm.ptSendToJail(gameState, playerIdx)
	case "tax":
		return gm.ptPay(gameState, playerIdx, -1, s.TaxAmount)
	case "chance":
		return gm.ptDrawCard(gameState, playerIdx, "fortune")
	case "community_chest":
		return gm.ptDrawCard(gameState, playerIdx, "cityfund")
	case "property", "railroad", "utility":
		owner, _, owned := ptPropertyInfo(gameState.GameData, space)
		if !owned {
			gameState.GameData["pending_purchase"] = space
			return false, nil, nil
		}
		if owner == playerIdx {
			return false, nil, nil // own property, nothing happens
		}
		rent := gm.ptCalculateRent(gameState, space, owner)
		return gm.ptPay(gameState, playerIdx, owner, rent)
	}
	return false, nil, nil
}

func (gm *GameManager) ptCalculateRent(gameState *GameSessionState, space, ownerIdx int) int {
	s := ptBoard[space]
	switch s.Type {
	case "railroad":
		n := ptCountOwnedOfType(gameState.GameData, ownerIdx, "railroad")
		if n < 1 {
			n = 1
		}
		if n > 4 {
			n = 4
		}
		return ptRailroadRents[n-1]
	case "utility":
		n := ptCountOwnedOfType(gameState.GameData, ownerIdx, "utility")
		dice := backgammonIntSlice(gameState.GameData["dice"]) // reuse the []interface{}->[]int helper
		diceSum := 0
		for _, d := range dice {
			diceSum += d
		}
		if n >= 2 {
			return diceSum * 10
		}
		return diceSum * 4
	default: // property
		_, houses, _ := ptPropertyInfo(gameState.GameData, space)
		fullSet := ptOwnsFullGroup(gameState.GameData, ownerIdx, s.Group)
		return ptPropertyRent(s.Price, houses, fullSet)
	}
}

// ptPay moves `amount` from playerIdx to payeeIdx (-1 = the bank). Triggers
// bankruptcy if playerIdx can't cover it.
func (gm *GameManager) ptPay(gameState *GameSessionState, playerIdx, payeeIdx, amount int) (bool, *uint, error) {
	cash := ptCashOf(gameState.GameData, playerIdx)
	if cash < amount {
		return gm.ptBankrupt(gameState, playerIdx, payeeIdx)
	}
	ptSetCash(gameState.GameData, playerIdx, cash-amount)
	if payeeIdx >= 0 {
		payeeCash := ptCashOf(gameState.GameData, payeeIdx)
		ptSetCash(gameState.GameData, payeeIdx, payeeCash+amount)
	}
	return false, nil, nil
}

// ptBankrupt eliminates playerIdx. Properties transfer to creditorIdx (the
// player owed money) if there is one, or return to the bank (unowned) if
// the debt was owed to the bank (tax/card). Returns gameOver=true with the
// sole remaining player as winner once only one solvent player is left.
func (gm *GameManager) ptBankrupt(gameState *GameSessionState, playerIdx, creditorIdx int) (bool, *uint, error) {
	m, ok := gameState.GameData["bankrupt"].(map[string]interface{})
	if !ok {
		m = map[string]interface{}{}
	}
	m[fmt.Sprintf("%d", playerIdx)] = true
	gameState.GameData["bankrupt"] = m
	ptSetCash(gameState.GameData, playerIdx, 0)

	props := ptProperties(gameState.GameData)
	for space := 0; space < ptBoardSize; space++ {
		owner, _, owned := ptPropertyInfo(gameState.GameData, space)
		if !owned || owner != playerIdx {
			continue
		}
		key := fmt.Sprintf("%d", space)
		if creditorIdx >= 0 {
			props[key] = map[string]interface{}{"owner": creditorIdx, "houses": 0}
		} else {
			delete(props, key)
		}
	}
	gameState.GameData["properties"] = props
	gameState.GameData["last_event"] = fmt.Sprintf("player_bankrupt:%d", playerIdx)

	solvent := []int{}
	for i := range gameState.Players {
		if !ptIsBankrupt(gameState.GameData, i) {
			solvent = append(solvent, i)
		}
	}
	if len(solvent) <= 1 {
		gameState.GameData["pending_purchase"] = nil
		gameState.GameData["awaiting_roll"] = true
		if len(solvent) == 1 {
			winner := gameState.Players[solvent[0]].UserID
			return true, &winner, nil
		}
		return true, nil, nil
	}

	gameState.GameData["pending_purchase"] = nil
	gameState.GameData["awaiting_roll"] = true
	if gameState.CurrentTurn == playerIdx {
		gameState.CurrentTurn = ptNextSolventPlayer(gameState, playerIdx)
	}
	return false, nil, nil
}

func ptNextSolventPlayer(gameState *GameSessionState, from int) int {
	n := len(gameState.Players)
	for i := 1; i <= n; i++ {
		idx := (from + i) % n
		if !ptIsBankrupt(gameState.GameData, idx) {
			return idx
		}
	}
	return from
}

func (gm *GameManager) ptDrawCard(gameState *GameSessionState, playerIdx int, deckName string) (bool, *uint, error) {
	var deck []ptCard
	var deckKey, posKey string
	if deckName == "fortune" {
		deck, deckKey, posKey = ptFortuneCards, "fortune_deck", "fortune_pos"
	} else {
		deck, deckKey, posKey = ptCityFundCards, "cityfund_deck", "cityfund_pos"
	}
	order := backgammonIntSlice(gameState.GameData[deckKey])
	pos := ptAsInt(gameState.GameData[posKey])
	if len(order) == 0 {
		order = []int{}
		for i := range deck {
			order = append(order, i)
		}
	}
	if pos >= len(order) {
		order = ptShuffledIndicesList(len(deck))
		pos = 0
		gameState.GameData[deckKey] = ptIntListToInterface(order)
	}
	cardIdx := order[pos]
	gameState.GameData[posKey] = pos + 1
	card := deck[cardIdx]
	gameState.GameData["last_event"] = "card:" + card.Text

	switch card.Effect {
	case "collect":
		cash := ptCashOf(gameState.GameData, playerIdx)
		ptSetCash(gameState.GameData, playerIdx, cash+card.Amount)
	case "pay":
		return gm.ptPay(gameState, playerIdx, -1, card.Amount)
	case "collect_each":
		total := 0
		for i := range gameState.Players {
			if i == playerIdx || ptIsBankrupt(gameState.GameData, i) {
				continue
			}
			gameOver, winner, err := gm.ptPay(gameState, i, playerIdx, card.Amount)
			if err != nil || gameOver {
				return gameOver, winner, err
			}
			total += card.Amount
		}
		_ = total
	case "pay_each":
		for i := range gameState.Players {
			if i == playerIdx || ptIsBankrupt(gameState.GameData, i) {
				continue
			}
			gameOver, winner, err := gm.ptPay(gameState, playerIdx, i, card.Amount)
			if err != nil || gameOver {
				return gameOver, winner, err
			}
		}
	case "move_to":
		oldPos := ptPositionOf(gameState.GameData, playerIdx)
		if card.Space < oldPos {
			cash := ptCashOf(gameState.GameData, playerIdx)
			ptSetCash(gameState.GameData, playerIdx, cash+ptGoBonus)
		}
		ptSetPosition(gameState.GameData, playerIdx, card.Space)
		return gm.ptResolveLanding(gameState, playerIdx, card.Space)
	case "move_relative":
		oldPos := ptPositionOf(gameState.GameData, playerIdx)
		newPos := ((oldPos+card.Amount)%ptBoardSize + ptBoardSize) % ptBoardSize
		ptSetPosition(gameState.GameData, playerIdx, newPos)
		return gm.ptResolveLanding(gameState, playerIdx, newPos)
	case "jail":
		gm.ptSendToJail(gameState, playerIdx)
	case "jail_free":
		m, ok := gameState.GameData["get_out_free"].(map[string]interface{})
		if !ok {
			m = map[string]interface{}{}
		}
		key := fmt.Sprintf("%d", playerIdx)
		m[key] = ptAsInt(m[key]) + 1
		gameState.GameData["get_out_free"] = m
	}
	return false, nil, nil
}

func ptShuffledIndicesList(n int) []int {
	idx := make([]int, n)
	for i := range idx {
		idx[i] = i
	}
	rand.Shuffle(n, func(i, j int) { idx[i], idx[j] = idx[j], idx[i] })
	return idx
}

func ptIntListToInterface(ints []int) []interface{} {
	out := make([]interface{}, len(ints))
	for i, v := range ints {
		out[i] = v
	}
	return out
}

func (gm *GameManager) ptSendToJail(gameState *GameSessionState, playerIdx int) {
	ptSetPosition(gameState.GameData, playerIdx, ptJailSpace)
	ptSetJailInfo(gameState.GameData, playerIdx, true, 0)
	gameState.GameData["pending_purchase"] = nil
}

func (gm *GameManager) ptProcessBuy(gameState *GameSessionState, playerIdx int) (bool, *uint, error) {
	pendingRaw := gameState.GameData["pending_purchase"]
	if pendingRaw == nil {
		return false, nil, fmt.Errorf("no property is pending purchase")
	}
	space := ptAsInt(pendingRaw)
	s := ptBoard[space]
	cash := ptCashOf(gameState.GameData, playerIdx)
	if cash < s.Price {
		return false, nil, fmt.Errorf("not enough cash to buy %s", s.Name)
	}
	ptSetCash(gameState.GameData, playerIdx, cash-s.Price)
	ptSetPropertyOwner(gameState.GameData, space, playerIdx)
	gameState.GameData["pending_purchase"] = nil

	doubles := ptAsInt(gameState.GameData["doubles_count"])
	dice := backgammonIntSlice(gameState.GameData["dice"])
	wasDouble := doubles > 0 && len(dice) == 2 && dice[0] == dice[1]
	gameState.GameData["awaiting_roll"] = true
	if !wasDouble {
		gameState.CurrentTurn = (gameState.CurrentTurn + 1) % len(gameState.Players)
	}
	return false, nil, nil
}

func (gm *GameManager) ptProcessDecline(gameState *GameSessionState, playerIdx int) (bool, *uint, error) {
	if gameState.GameData["pending_purchase"] == nil {
		return false, nil, fmt.Errorf("no property is pending purchase")
	}
	gameState.GameData["pending_purchase"] = nil

	doubles := ptAsInt(gameState.GameData["doubles_count"])
	dice := backgammonIntSlice(gameState.GameData["dice"])
	wasDouble := doubles > 0 && len(dice) == 2 && dice[0] == dice[1]
	gameState.GameData["awaiting_roll"] = true
	if !wasDouble {
		gameState.CurrentTurn = (gameState.CurrentTurn + 1) % len(gameState.Players)
	}
	return false, nil, nil
}

func (gm *GameManager) ptProcessBuild(gameState *GameSessionState, playerIdx int, moveData map[string]interface{}) (bool, *uint, error) {
	spaceF, ok := moveData["space"].(float64)
	if !ok {
		return false, nil, fmt.Errorf("missing space")
	}
	space := int(spaceF)
	if space < 0 || space >= ptBoardSize || ptBoard[space].Type != "property" {
		return false, nil, fmt.Errorf("not a buildable property")
	}
	owner, houses, owned := ptPropertyInfo(gameState.GameData, space)
	if !owned || owner != playerIdx {
		return false, nil, fmt.Errorf("you don't own this property")
	}
	if !ptOwnsFullGroup(gameState.GameData, playerIdx, ptBoard[space].Group) {
		return false, nil, fmt.Errorf("you must own the full color group to build")
	}
	if houses >= 5 {
		return false, nil, fmt.Errorf("already at a hotel — maximum development reached")
	}
	cost := ptBoard[space].HouseCost
	cash := ptCashOf(gameState.GameData, playerIdx)
	if cash < cost {
		return false, nil, fmt.Errorf("not enough cash to build")
	}
	ptSetCash(gameState.GameData, playerIdx, cash-cost)
	ptSetPropertyHouses(gameState.GameData, space, houses+1)
	return false, nil, nil
}

func (gm *GameManager) ptProcessPayJailFine(gameState *GameSessionState, playerIdx int) (bool, *uint, error) {
	inJail, _ := ptJailInfo(gameState.GameData, playerIdx)
	if !inJail {
		return false, nil, fmt.Errorf("you're not in jail")
	}
	awaiting, _ := gameState.GameData["awaiting_roll"].(bool)
	if !awaiting {
		return false, nil, fmt.Errorf("you've already acted this turn")
	}
	cash := ptCashOf(gameState.GameData, playerIdx)
	if cash < ptJailFine {
		return gm.ptBankrupt(gameState, playerIdx, -1)
	}
	ptSetCash(gameState.GameData, playerIdx, cash-ptJailFine)
	ptSetJailInfo(gameState.GameData, playerIdx, false, 0)
	return false, nil, nil
}

func (gm *GameManager) ptProcessUseJailCard(gameState *GameSessionState, playerIdx int) (bool, *uint, error) {
	inJail, _ := ptJailInfo(gameState.GameData, playerIdx)
	if !inJail {
		return false, nil, fmt.Errorf("you're not in jail")
	}
	m, ok := gameState.GameData["get_out_free"].(map[string]interface{})
	if !ok {
		m = map[string]interface{}{}
	}
	key := fmt.Sprintf("%d", playerIdx)
	count := ptAsInt(m[key])
	if count <= 0 {
		return false, nil, fmt.Errorf("you have no Get Out of Jail Free cards")
	}
	m[key] = count - 1
	gameState.GameData["get_out_free"] = m
	ptSetJailInfo(gameState.GameData, playerIdx, false, 0)
	return false, nil, nil
}
