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
      'Roll the dice to move your tokens around the board towards Home.',
      'You must roll a 6 to move a token out of Base onto the starting square.',
      'Rolling a 6 earns you a bonus roll.',
      'Land on an opponent\'s token on a non-safe square to send it back to their Base.',
      'Starred squares ⭐ are safe — tokens there cannot be captured.',
      'Get all 4 of your tokens to the centre Home triangle to win!',
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
      'Move your paddle left and right by dragging or moving your mouse/finger across the screen.',
      'Player 1 (blue, top) and Player 2 (red, bottom) take turns rallying the ball.',
      'The first player to reach 7 points wins!',
      'The ball speeds up slightly with each hit — keep your reflexes sharp.',
      'After a point the ball resets and the scorer serves next.',
      'Optional — No Walls mode: side edges are open instead of bouncing. If you hit the ball and it exits through a side, you lose that point. Classic table-tennis rules!',
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
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white text-lg font-bold">How to play — {data.title}</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
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
          </div>
        </div>
      )}
    </>
  );
}
