// src/components/Games/GameRulesButton.jsx
import { useState } from 'react';
import { Info, X } from 'lucide-react';

const RULES = {
  tic_tac_toe: {
    title: 'Tic-Tac-Toe',
    rules: [
      'Players alternate placing their symbol (X or O) on the 3×3 grid.',
      'Get 3 in a row — horizontally, vertically, or diagonally — to win.',
      'If all 9 squares are filled with no winner, it\'s a draw.',
    ],
  },
  rock_paper_scissors: {
    title: 'Rock Paper Scissors',
    rules: [
      'Each player secretly picks Rock 🪨, Paper 📄, or Scissors ✂️.',
      'Rock beats Scissors, Scissors beats Paper, Paper beats Rock.',
      'Both picks reveal at the same time — same pick is a draw.',
      'Pick before the countdown hits zero or you forfeit the round!',
    ],
  },
  chess: {
    title: 'Chess',
    rules: [
      'Take turns moving one piece per turn. White moves first.',
      'Pawns move forward and capture diagonally; they can move 2 squares on their first move.',
      'Rooks move horizontally or vertically any distance.',
      'Bishops move diagonally any distance.',
      'Knights move in an L-shape and can jump over other pieces.',
      'Queens combine rook + bishop movement.',
      'Kings move one square in any direction — protect them!',
      'Put your opponent\'s king in a position it can\'t escape (checkmate) to win.',
    ],
  },
  othello: {
    title: 'Othello (Reversi)',
    rules: [
      'Black places first. Players alternate placing discs on the 8×8 board.',
      'A move must bracket at least one opponent disc in a straight line (any direction).',
      'All bracketed opponent discs flip to your colour.',
      'If you have no legal move, your turn is skipped automatically.',
      'The game ends when neither player can move. Most discs on the board wins!',
    ],
  },
  checkers: {
    title: 'Checkers',
    rules: [
      'Black moves first. Pieces move diagonally forward on dark squares.',
      'Jump over an adjacent opponent piece to capture it — the captured piece is removed.',
      'Captures are mandatory: if a jump is available, you must take it.',
      'Multi-jump: if you can jump again immediately after a capture, you must continue.',
      'Reach the opponent\'s back row to crown your piece as a King ♛ — Kings move and capture in both directions.',
      'Win by capturing all opponent pieces or leaving them with no legal moves.',
    ],
  },
  crazy_eights: {
    title: 'Crazy Eights',
    rules: [
      'Match the top card of the discard pile by rank OR suit to play a card.',
      '8s are wild — play an 8 and choose any suit for the next player to match.',
      'If you can\'t play, draw a card from the pile.',
      'First player to empty their hand wins!',
    ],
  },
  ludo: {
    title: 'Ludo',
    rules: [
      'Each turn you roll two dice — move a token using either die\'s value (one after another) if it has a legal move.',
      'You must roll a 6 to move a token out of Base onto the starting square.',
      'Roll double sixes (6-6) and you get a full bonus roll afterward — go again!',
      'Land on an opponent\'s token on a non-safe square to send it back to their Base — and your own token instantly races all the way Home as a reward!',
      'Get all 4 of your tokens Home to win!',
    ],
    legend: [
      { swatch: true, label: 'Safe Zone — tokens here cannot be captured' },
    ],
  },
  jigsaw: {
    title: 'Jigsaw Puzzle',
    rules: [
      'Fully cooperative — everyone works on the same puzzle at the same time, no turns.',
      'The host picks an image, a puzzle style, and a difficulty to start.',
      '🧩 Interlocking: tap and drag any unclaimed piece from the tray — while you\'re holding it, nobody else can pick it up. Drop it near its correct spot and it snaps into place. Drop it elsewhere and it just stays where you left it — try again! The faint image outline shows what you\'re building toward.',
      '▦ Swap Grid: every tile starts in the wrong spot, but the grid is always full. Tap a tile, then tap another to swap them. A tile that\'s already correct locks in place and can\'t be swapped again.',
      'The puzzle is solved once every piece is in its correct spot — everyone wins together!',
    ],
  },
  blackjack: {
    title: 'Blackjack',
    rules: [
      'Each player plays their own hand against the shared dealer — get closer to 21 than the dealer without going over.',
      'Number cards are worth their face value. J/Q/K are worth 10. Aces count as 11, or 1 if 11 would bust your hand.',
      'Hit to take another card, Stand to keep your current total, or Double to take exactly one more card and lock in.',
      'Double is only available on your first two cards — not after you\'ve already hit.',
      'Go over 21 and you bust — an automatic loss regardless of what the dealer gets.',
      'The dealer reveals their hidden card once everyone is done, then must hit until reaching at least 17.',
      'Beat the dealer\'s total to win, tie it for a push (no winner), or fall short to lose. Player cards are visible to everyone at the table — only the dealer\'s second card stays hidden until the reveal.',
      'A natural Blackjack (21 on your first 2 cards) beats any total the dealer builds up to by hitting, even a built 21 — only two naturals facing each other is a push.',
    ],
  },
  uno: {
    title: 'UNO',
    rules: [
      'Match the top discard card by color, number, or symbol — or play a Wild card any time.',
      'Skip ⊘ skips the next player. Reverse ⟳ flips turn order (acts as a Skip in 2-player games).',
      'Draw Two forces the next player to draw 2 cards and lose their turn. Wild Draw Four does the same for 4, and also lets you choose the new color.',
      'Can\'t play a card? Draw one from the pile instead.',
      'Down to your last card? Hit UNO! before it\'s your only one left.',
      'First to empty their hand wins!',
    ],
  },
  glass_bridge: {
    title: 'Glass Bridge',
    rules: [
      'Take turns picking the LEFT or RIGHT glass tile on the row directly ahead of you.',
      'One side is safe, the other shatters — you don\'t know which until you step.',
      'Pick correctly and you advance, then go again. Pick wrong and you fall back to the start — the tile is revealed for everyone, and it\'s the next player\'s turn.',
      'A tile\'s safe side stays the same all game once revealed — remember what breaks!',
      'An amber glow marks the furthest anyone has safely reached, even after a fall.',
      'First player to cross every platform wins!',
    ],
  },
  trivia: {
    title: 'Trivia',
    rules: [
      'The host picks a topic category and starts each round.',
      'All players answer the question at the same time within the time limit.',
      'Correct answers score points — be both right and fast for the most points.',
      'The player with the highest total score after all rounds wins.',
      'If scores are tied at the end, it\'s a draw.',
    ],
  },
  space_attack: {
    title: 'Space Attack',
    rules: [
      'Side-scrolling shooter — your cyan ship is on the left, enemies fly in from the right.',
      'Use ↑ ↓ (or W/S) to move. Press SPACE or Z to fire. On mobile, touch and drag to aim.',
      'Collect glowing pickups for weapon upgrades: Missiles, Heat-seeking, Laser, Bomb, Sonic, EMP, and Black Hole.',
      'Bolt upgrades (▲) boost your spread from 1 to 3 beams. You keep upgrades until you\'re hit — then drop one tier.',
      'Every ~400 points an alien boss appears. Bosses have unique attack patterns and tentacle animations.',
      'Defeating a boss restores a life (up to 3) and drops a weapon pickup. Enemies reaching the left edge vanish harmlessly.',
      'Waves speed up the longer you survive — how high can you score?',
    ],
  },
  doom: {
    title: 'DOOM',
    rules: [
      'Classic first-person shooter — fight your way through demon-infested levels.',
      'Move: WASD or Arrow keys. Fire: Space or left-click.',
      'Interact with doors/switches: E. Run: hold Shift.',
      'Switch weapons: number keys 1–7. Map: Tab.',
      'Find the exit to complete the level. Survive!',
    ],
  },
  ping_pong: {
    title: 'Ping Pong',
    rules: [
      'Move your paddle by dragging or moving your mouse/finger — or use the ◀ ▶ buttons on mobile.',
      'Player 1 (blue, top) and Player 2 (red, bottom) rally the ball back and forth.',
      'The first player to reach 7 points wins!',
      'The ball speeds up slightly with each hit — keep your reflexes sharp.',
      'After a point, the scorer gets serve — tap the ball (or the "Tap to Serve" button) to launch the next rally whenever you\'re ready.',
      'Optional — No Walls mode: side edges are open instead of bouncing. If you hit the ball and it exits through a side, you lose that point. Classic table-tennis rules!',
      'Power-ups occasionally appear on the table — hit the ball through one to trigger it on your opponent: ❄️ Freeze (their paddle locks up), 🐌 Slow (their paddle moves at a crawl), or 👻 Ghost Ball (they can\'t see the ball at all). Only one power-up is active at a time, and a new one always replaces the last.',
    ],
  },
  air_hockey: {
    title: 'Air Hockey',
    rules: [
      'Drag your mallet anywhere in your half of the rink to hit the puck.',
      'Player 1 (red) defends the top goal; Player 2 (blue) defends the bottom goal.',
      'Knock the puck into the opponent\'s goal — the narrow zone at their end of the rink.',
      'First to 5 goals wins!',
      'The puck speeds up slightly with each mallet strike, so keep it moving.',
    ],
  },
  wordle: {
    title: 'Wordle',
    rules: [
      'Guess the hidden 5-letter word in 6 tries.',
      '🟩 Green — correct letter in the correct position.',
      '🟨 Yellow — correct letter but in the wrong position.',
      '⬛ Grey — this letter is not in the word at all.',
      'Type any 5-letter word and press Enter to submit your guess.',
      'In competitive mode, the first player to guess the word wins!',
    ],
  },
  hangman: {
    title: 'Hangman',
    rules: [
      'A secret word is chosen — you see blanks for each letter.',
      'All players guess letters at the same time — no waiting for your turn.',
      'Correct guess: every matching letter in the word is revealed. You score 1 point per letter uncovered.',
      'Wrong guess: a body part is added to the hangman figure. 6 wrong guesses and the game is lost.',
      'The word is fully revealed when all blanks are filled — the player who uncovered the most letters wins.',
      'Letters turn 🟢 green (correct) or 🔴 red (wrong) so you can see what has already been tried.',
    ],
  },
  roulette: {
    title: 'Roulette',
    rules: [
      'Everyone starts with 1,000 chips. The host spins when ready.',
      'Before the spin, choose a bet amount (50 / 100 / 250 / 500) and a bet type.',
      'Red / Black / Odd / Even pay 1:1 — double your bet if you win.',
      'A specific number (0–36) pays 35:1 — big risk, big reward!',
      'Landing on 0 (green) loses all colour and odd/even bets.',
      'You can place multiple bets per spin. Chips are held until the result.',
      'The player with the most chips when the host ends the game wins!',
    ],
  },
  snakes_ladders: {
    title: 'Snakes & Ladders',
    rules: [
      'Take turns rolling the dice and moving your token forward that many squares.',
      'Land on a ladder bottom 🪜 and climb straight up to the top.',
      'Land on a snake head 🐍 and slide straight down to its tail.',
      'Land on a warp pad 🌀 and teleport somewhere else on the board — could be forward, could be back. You won\'t know until you land.',
      'Land on a trap 🕸️ and you\'ll miss your next turn — unless you rolled a 6 to get there, which frees you from the trap on the spot!',
      'You must land exactly on square 100 to win — an overshoot forfeits that move.',
      'Roll a 6 and you get an extra turn!',
    ],
  },
  mancala: {
    title: 'Mancala',
    rules: [
      'Each turn, pick one of your own 6 pits and sow its seeds one-by-one into each pit going counter-clockwise — skipping your opponent\'s store.',
      'Land your last seed in your own store and you get another turn!',
      'Land your last seed in an empty pit on your own side, and its seeds plus everything in the directly opposite pit are captured into your store.',
      'When one side\'s pits are all empty, the round ends — the other player sweeps their remaining seeds into their own store.',
      'Whoever has the most seeds in their store wins!',
    ],
  },
  property_tycoon: {
    title: 'Property Tycoon',
    rules: [
      'Roll the dice, move around the board, and buy any unowned property, railroad, or utility you land on.',
      "Land on someone else's property and you owe rent — more if they own every property in that color group, and much more once they've built houses or a hotel on it.",
      'Own every property in a color group? You can build houses on them (up to 4), then a hotel — pushing rent way up.',
      'Landing on Fortune or City Fund draws a card — could be a windfall, a bill, a trip to Jail, or a Get Out of Jail Free card.',
      "In Jail? Pay a $50 fine, use a Get Out of Jail Free card, or try to roll doubles to escape — 3 failed attempts forces the fine.",
      "Roll doubles and you go again — but 3 doubles in a row sends you straight to Jail instead.",
      "Can't cover a debt? You go bankrupt and you're out — your properties pass to whoever you owed, or back to the bank if it was a tax or card.",
      'Last player left standing wins!',
    ],
  },
  backgammon: {
    title: 'Backgammon',
    rules: [
      'Race all 15 of your checkers around the board and off before your opponent does.',
      'Roll two dice each turn and move that many pips per die — you can move one checker twice or two different checkers. Rolling doubles gives you 4 moves of that value instead of 2.',
      'You can move onto an empty point, a point with your own checkers, or a point with exactly one opponent checker (this "hits" it, sending it to the bar). A point with 2+ opponent checkers is blocked.',
      'If you have a checker on the bar, you must re-enter it into the board before making any other move.',
      'Once all 15 of your checkers are in your home board (no checkers outside it or on the bar), you can start bearing them off.',
      'No legal move for a die? That die (or your whole turn) is skipped — you can also choose to stop your turn early with Pass even if a move is still available.',
      'First player to bear off all 15 checkers wins!',
    ],
  },
  wordsmith: {
    title: 'Wordsmith',
    rules: [
      'Build words on the shared 15x15 board, one turn at a time — like a classic tile-word game.',
      'The first word of the game must cross the center star. Every word after that must connect to a tile already on the board.',
      'Place tiles in a single row or column to spell a word — any new word formed in the other direction (crossing an existing tile) counts too and must also be a real word.',
      'Colored squares are bonuses: light blue doubles a letter, dark blue triples it, pink doubles the whole word, red triples the whole word — but only for tiles you place that turn.',
      'Blank tiles can stand in for any letter, but always score 0 points.',
      'No valid move? Exchange some tiles for new ones from the bag (ends your turn, scores nothing), or just Pass.',
      'Play all 7 of your tiles in a single turn for a 50-point bonus!',
      'The game ends when someone empties their rack with an empty bag, or everyone passes/exchanges for 2 rounds straight. Highest score wins!',
    ],
  },
  would_you_rather: {
    title: 'Would You Rather',
    rules: [
      'Each round, everyone sees a "Would you rather…" question with two options (A or B).',
      'All players vote at the same time — once you pick you can\'t change your answer.',
      'After everyone votes, the results are revealed showing how the group split.',
      'The host advances to the next question when ready.',
      'There\'s no single winner — it\'s all about seeing how your friends think! 🎉',
    ],
  },
  sudoku: {
    title: 'Sudoku Race',
    rules: [
      'Everyone gets the exact same puzzle at the same time — it\'s a race, not a turn-based game.',
      'Fill every empty cell so each row, column, and 3×3 box contains the digits 1-9 exactly once.',
      'Given (pre-filled) numbers can\'t be changed — only blank cells are editable.',
      'Tap a cell then a digit to fill it in, or use your keyboard (1-9, arrow keys to move, Backspace/Delete to clear).',
      'Submit as soon as you think the grid is complete. First correct submission wins instantly — an incorrect submission just tells you to keep trying, it doesn\'t end your turn.',
    ],
  },
  vs_battle: {
    title: 'VS Battle',
    rules: [
      'Build a team of up to 3 fantasy characters, then battle another player\'s team — like/inspired by Death Battle.',
      'Each character picks a tier (Regular → Universal). Higher tiers give more HP and a bigger points budget for moves — but every fight is between two teams at whatever tiers you both chose.',
      'Give each character up to 5 attack moves and 5 defense moves, spending points from your tier\'s budget (attack and defense have separate budgets). Punch and Block are always free, built-in defaults.',
      '🎬 You can attach a GIF, video, or image to any custom move — it plays as a short clip whenever that move is used in battle, so your fighters can look and feel exactly how you imagine them.',
      'Once both players confirm their rosters, battle begins: each turn, pick one of your alive characters and lock in a move — moves reveal at the same time.',
      'Attack vs Attack: the weaker attack takes damage equal to the gap between them. Very close power levels can stalemate — or spark a rare counter-attack window.',
      'Attack vs Defense: a big enough gap lands the hit; a close gap deflects or blocks; a very close gap can trigger a counter window where the defender strikes back.',
      'Land or block 3 of the same move type in a row and you earn a dice roll for a random power-up — Stun, Attack/Defense Boost, Health Pack, Shield, or Poison.',
      'Defeat every character on the opponent\'s team to win the battle!',
    ],
  },
  texas_holdem: {
    title: "Texas Hold'em",
    rules: [
      'Everyone starts with the same symbolic chip stack — no real money or platform tokens are involved.',
      'Each hand, you get 2 private hole cards. Five community cards are dealt face-up in the middle over four rounds: the Flop (3), Turn (1), and River (1).',
      'On your turn: Check (pass, only if no bet is on the table), Call (match the current bet), Raise (increase it), or Fold (give up the hand).',
      'Two seats post forced bets before cards are dealt — the small and big blind — so there\'s always something to play for. Blinds double every few hands to keep things moving.',
      'Best 5-card hand using any combination of your 2 hole cards and the 5 community cards wins the pot. Standard ranking from highest to lowest: Straight Flush, Four of a Kind, Full House, Flush, Straight, Three of a Kind, Two Pair, Pair, High Card.',
      'If everyone folds but one player, that player wins the pot without needing to show their cards. If it goes to a showdown, remaining players reveal their hands to determine the winner.',
      'Run out of chips and you\'re eliminated. Last player standing wins the tournament!',
    ],
  },
};

export default function GameRulesButton({ gameType, className = '' }) {
  const [open, setOpen] = useState(false);
  const data = RULES[gameType];
  if (!data) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`text-gray-400 hover:text-white transition-colors ${className}`}
        title="How to play"
        aria-label="Game rules"
      >
        <Info className="w-5 h-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          {/* max-h + flex-col + a scrollable body (not the whole modal) — several
              rule lists (VS Battle, Property Tycoon, Texas Hold'em, ...) are long
              enough to overflow a short mobile viewport entirely; without a height
              cap here, the modal just extended off-screen with no way to scroll
              down to the rest of the rules OR back up to reach the close button. */}
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-sm max-h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 sm:px-6 pt-5 sm:pt-6 pb-4 flex-shrink-0">
              <h3 className="text-white text-lg font-bold pr-3">How to play — {data.title}</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 sm:px-6 pb-5 sm:pb-6 overflow-y-auto">
              <ol className="space-y-3">
                {data.rules.map((rule, i) => (
                  <li key={i} className="flex gap-3 text-sm text-gray-300 leading-snug">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center font-bold mt-0.5">
                      {i + 1}
                    </span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ol>
              {data.legend && (
                <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
                  {data.legend.map((item, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      {item.swatch && (
                        <span style={{
                          display:'inline-flex', flexShrink:0, alignItems:'center', justifyContent:'center',
                          width:16, height:16, borderRadius:3,
                          background:'linear-gradient(135deg,#fcd34d,#f59e0b)',
                          color:'#78350f', fontSize:10, fontWeight:900,
                        }}>✦</span>
                      )}
                      <span className="text-xs text-gray-400">{item.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
