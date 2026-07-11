package games

import "fmt"

// Sequential Punch-Out-style boxing.
//
// Turn structure per exchange:
//   1. "attacking" phase: attacker sends throw_punch (jab|hook|uppercut).
//      Backend broadcasts phase="telegraphing" + punch_type to both players.
//   2. "defending" phase (1.5 s on the frontend): defender sends defend
//      (block|dodge|counter). Backend resolves, updates HP, broadcasts
//      phase="resolved" with the outcome, then starts the next exchange
//      (roles flip) by broadcasting phase="attacking".
//
// The turn-advance trick used by othello/checkers (decrement CurrentTurn so
// the caller's +1 mod N cancels out) keeps the same player "up" for their
// full two-step exchange; roles flip only after the defending phase resolves.

// Resolution matrix — damage dealt to defender:
//
//   punch    | block   | dodge | counter
//   ---------|---------|-------|--------
//   jab      | base×0.5 | 0    | counter-damage to attacker, 0 to defender
//   hook     | base×0.5 | 0    | counter-damage to attacker, 0 to defender
//   uppercut | base×1.0 | 0    | counter-damage to attacker, 0 to defender
//            |  (block  |      |   (uppercut goes under block — same risk,
//            |  broken) |      |    different flavour than jab/hook)
//
// Wrong counter (defended with counter but guessed wrong logic is N/A here;
// instead, "counter" is always the risky move):
//   correct counter → defender takes 0, attacker takes counterDamage
//   counter on uppercut → dodging would have worked; counter here still works
//     (the attacker overextends) — keeps uppercut's only defence as dodge OR counter.
//
// All three punch types deal the same base damage so skill lives in
// reading the telegraph, not memorising damage tables.

const (
	boxingMaxHP      = 100
	boxingBaseDamage = 20 // jab/hook/uppercut all deal this on a clean hit
	boxingBlockDamage = 10 // reduced hit through a block (jab or hook only)
	boxingCounterDmg  = 15 // damage dealt to attacker on a successful counter
)

func (gm *GameManager) processBoxingMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	// Lazy-init
	if _, ok := gameState.GameData["hp_0"]; !ok {
		gameState.GameData["hp_0"] = float64(boxingMaxHP)
		gameState.GameData["hp_1"] = float64(boxingMaxHP)
		gameState.GameData["phase"] = "attacking"
		gameState.GameData["exchange"] = float64(0)
		// attacker_idx tracks who is currently attacking (0 or 1); starts at
		// CurrentTurn (always 0 on the first exchange).
		gameState.GameData["attacker_idx"] = float64(gameState.CurrentTurn)
	}

	phase, _ := gameState.GameData["phase"].(string)
	attackerIdx, _ := gameState.GameData["attacker_idx"].(float64)
	aIdx := int(attackerIdx)
	dIdx := 1 - aIdx

	attackerID := gameState.Players[aIdx].UserID
	defenderID := gameState.Players[dIdx].UserID

	switch moveType {
	case "throw_punch":
		if phase != "attacking" {
			return false, nil, fmt.Errorf("not the attack phase")
		}
		if playerID != attackerID {
			return false, nil, fmt.Errorf("you are defending this exchange")
		}
		punch, _ := moveData["punch_type"].(string)
		if punch != "jab" && punch != "hook" && punch != "uppercut" {
			return false, nil, fmt.Errorf("invalid punch type: %s", punch)
		}
		gameState.GameData["phase"] = "defending"
		gameState.GameData["pending_punch"] = punch
		// Switch to the defender so they can send the 'defend' move.
		// boxing is in selfManagedTurn — game_manager does not apply its own +1.
		gameState.CurrentTurn = dIdx
		return false, nil, nil

	case "defend":
		if phase != "defending" {
			return false, nil, fmt.Errorf("not the defense phase")
		}
		if playerID != defenderID {
			return false, nil, fmt.Errorf("you are attacking this exchange")
		}
		defense, _ := moveData["defense"].(string)
		if defense != "block" && defense != "dodge" && defense != "counter" {
			return false, nil, fmt.Errorf("invalid defense: %s", defense)
		}

		punch, _ := gameState.GameData["pending_punch"].(string)
		hp0, _ := gameState.GameData["hp_0"].(float64)
		hp1, _ := gameState.GameData["hp_1"].(float64)
		hps := [2]*float64{&hp0, &hp1}

		outcome, dmgToDefender, dmgToAttacker := resolveBoxingExchange(punch, defense)

		*hps[dIdx] -= float64(dmgToDefender)
		*hps[aIdx] -= float64(dmgToAttacker)
		if *hps[dIdx] < 0 { *hps[dIdx] = 0 }
		if *hps[aIdx] < 0 { *hps[aIdx] = 0 }

		gameState.GameData["hp_0"] = hp0
		gameState.GameData["hp_1"] = hp1
		gameState.GameData["last_outcome"] = outcome
		gameState.GameData["last_punch"] = punch
		gameState.GameData["last_defense"] = defense
		gameState.GameData["last_attacker_idx"] = attackerIdx
		gameState.GameData["last_dmg_to_defender"] = float64(dmgToDefender)
		gameState.GameData["last_dmg_to_attacker"] = float64(dmgToAttacker)

		// Check KO.
		if hp0 <= 0 || hp1 <= 0 {
			var wID *uint
			if hp0 > hp1 {
				wID = &gameState.Players[0].UserID
			} else if hp1 > hp0 {
				wID = &gameState.Players[1].UserID
			}
			// Both zero simultaneously = draw (wID stays nil).
			gameState.GameData["phase"] = "ko"
			return true, wID, nil
		}

		// Flip roles for next exchange.
		nextAttackerIdx := dIdx
		gameState.GameData["attacker_idx"] = float64(nextAttackerIdx)
		gameState.GameData["phase"] = "attacking"
		gameState.GameData["pending_punch"] = ""
		exchange, _ := gameState.GameData["exchange"].(float64)
		gameState.GameData["exchange"] = exchange + 1
		// Point CurrentTurn at the new attacker directly.
		// boxing is in selfManagedTurn — game_manager does not apply its own +1.
		gameState.CurrentTurn = nextAttackerIdx
		return false, nil, nil

	default:
		return false, nil, fmt.Errorf("unknown boxing move type: %s", moveType)
	}
}

// resolveBoxingExchange returns (outcome string, dmgToDefender, dmgToAttacker).
func resolveBoxingExchange(punch, defense string) (string, int, int) {
	switch defense {
	case "dodge":
		// Dodge always works — no damage to defender, no counter.
		return "dodged", 0, 0

	case "block":
		// Block reduces jab/hook; uppercut breaks through block entirely.
		if punch == "uppercut" {
			return "block_broken", boxingBaseDamage, 0
		}
		return "blocked", boxingBlockDamage, 0

	case "counter":
		// Counter always reads the punch correctly and retaliates — the risk
		// is that the defender is momentarily open (handled by the frontend
		// animation window being shorter). Mechanically: always 0 to defender,
		// counterDmg to attacker.
		return "countered", 0, boxingCounterDmg

	default:
		return "hit", boxingBaseDamage, 0
	}
}
