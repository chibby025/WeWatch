package games

import (
	"fmt"
	"math/rand"
)

// Typing Race: every player races to type the same passage as fast and
// accurately as possible. Simultaneous game (all players type at once, no turn
// order) — added to simultaneousGames in game_manager.go. Perfect-information:
// the passage and everyone's live completion % are public. No hidden state.
//
// move_types:
//   "progress" — a player reports { completion_pct, wpm }. Reaching 100% wins.
//   "time_up"  — host reports the countdown hit zero. Highest completion_pct wins
//                (tie → no winner / draw).

// typingRacePassages are short, famous/literary quotes (~100-200 chars) — long
// enough to make WPM meaningful, short enough to finish inside the 90s window.
var typingRacePassages = []string{
	"It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness.",
	"All happy families are alike; each unhappy family is unhappy in its own way, and so the story of Anna begins.",
	"The only thing we have to fear is fear itself, nameless, unreasoning, unjustified terror which paralyzes needed effort.",
	"To be, or not to be, that is the question: whether it is nobler in the mind to suffer the slings of outrageous fortune.",
	"In the beginning the Universe was created. This has made a lot of people very angry and been widely regarded as a bad move.",
	"It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife.",
	"I have a dream that one day this nation will rise up and live out the true meaning of its creed for all people everywhere.",
	"Call me Ishmael. Some years ago, having little money in my purse, I thought I would sail about and see the watery world.",
	"Happiness can be found, even in the darkest of times, if one only remembers to turn on the light and look around.",
	"Not all those who wander are lost; the old that is strong does not wither, deep roots are not reached by the frost.",
	"The mitochondria is the powerhouse of the cell, converting the food we eat into a form of energy the body can actually use.",
	"Ask not what your country can do for you; ask what you can do for your country, and for the freedom of all mankind.",
	"A room without books is like a body without a soul, and a house without laughter is a very cold and empty place indeed.",
	"The quick brown fox jumps over the lazy dog while the five boxing wizards jump quickly past the sleepy old brown cat.",
	"We hold these truths to be self-evident, that all men are created equal, endowed with certain unalienable rights by nature.",
	"Somewhere, something incredible is waiting to be known, and the cosmos is within us; we are made of star stuff, all of us.",
	"The journey of a thousand miles begins with a single step, and every great story starts with someone brave enough to try.",
	"Elementary, my dear Watson: when you have eliminated the impossible, whatever remains, however improbable, must be the truth.",
	"Float like a butterfly, sting like a bee; the hands can't hit what the eyes can't see, so dance around the ring with me.",
	"Two roads diverged in a wood, and I took the one less traveled by, and that has made all the difference in my long life.",
}

func typingRaceInitialState() map[string]interface{} {
	passage := typingRacePassages[rand.Intn(len(typingRacePassages))]
	return map[string]interface{}{
		"passage":  passage,
		"progress": map[string]interface{}{},
		"duration": 90,
	}
}

func ensureTypingRaceState(gameState *GameSessionState) {
	if gameState.GameData["passage"] == nil {
		for k, v := range typingRaceInitialState() {
			gameState.GameData[k] = v
		}
	}
}

func typingRaceProgress(gameState *GameSessionState) map[string]interface{} {
	raw := gameState.GameData["progress"]
	if m, ok := raw.(map[string]interface{}); ok {
		return m
	}
	m := map[string]interface{}{}
	gameState.GameData["progress"] = m
	return m
}

func (gm *GameManager) processTypingRaceMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	ensureTypingRaceState(gameState)

	switch moveType {
	case "progress":
		completion, _ := moveData["completion_pct"].(float64)
		wpm, _ := moveData["wpm"].(float64)
		if completion < 0 {
			completion = 0
		}
		if completion > 100 {
			completion = 100
		}

		progress := typingRaceProgress(gameState)
		progress[fmt.Sprintf("%d", playerID)] = map[string]interface{}{
			"completion_pct": completion,
			"wpm":            wpm,
		}
		gameState.GameData["progress"] = progress

		// First to 100% wins outright.
		if completion >= 100 {
			gameState.GameData["phase"] = "finished"
			winner := playerID
			return true, &winner, nil
		}
		return false, nil, nil

	case "time_up":
		// Host declares the timer expired — settle the result from whatever
		// completion each player reached. A single leader wins; a tie for the
		// top completion is a draw (nil winner).
		if playerID != gameState.GameSession.HostID {
			return false, nil, fmt.Errorf("only the host can end the race")
		}
		progress := typingRaceProgress(gameState)
		var best float64 = -1
		var winners []uint
		for _, p := range gameState.Players {
			entry, _ := progress[fmt.Sprintf("%d", p.UserID)].(map[string]interface{})
			pct, _ := entry["completion_pct"].(float64)
			if pct > best {
				best = pct
				winners = []uint{p.UserID}
			} else if pct == best {
				winners = append(winners, p.UserID)
			}
		}
		gameState.GameData["phase"] = "finished"
		var wid *uint
		if len(winners) == 1 {
			wid = &winners[0]
		}
		return true, wid, nil

	default:
		return false, nil, fmt.Errorf("unknown typing_race move type: %s", moveType)
	}
}
