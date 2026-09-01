import { useState, useRef, useMemo } from 'react';
import { X, Crown } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

// Texas Hold'em — tournament-style, symbolic chips only (no real-money tie-in,
// same precedent as Roulette's flat starting stack). Hole cards are private
// per player (delivered via myHand, never in the broadcast game_state) except
// at a genuine showdown, where the backend explicitly reveals contenders'
// hands into game_state.revealed_hands — a fold-to-win never reveals anything,
// matching real poker's "you can muck without showing" convention.

const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const isRed = (suit) => suit === 'H' || suit === 'D';
function cardParts(card) {
  return { rank: card.slice(0, -1), suit: card.slice(-1) };
}

function Card({ card, small }) {
  const sizeCls = small ? 'w-9 h-12 sm:w-10 sm:h-14' : 'w-11 h-16 sm:w-14 sm:h-20';
  const { rank, suit } = cardParts(card);
  return (
    <div className={`${sizeCls} rounded-lg bg-white border border-gray-300 flex flex-col items-center justify-center shadow-md flex-shrink-0`}>
      <span className={`text-xs sm:text-base font-bold leading-none ${isRed(suit) ? 'text-red-600' : 'text-gray-900'}`}>{rank}</span>
      <span className={`text-sm sm:text-lg leading-none mt-0.5 ${isRed(suit) ? 'text-red-600' : 'text-gray-900'}`}>{SUIT_SYMBOL[suit]}</span>
    </div>
  );
}

function EmptySlot({ small }) {
  const sizeCls = small ? 'w-9 h-12 sm:w-10 sm:h-14' : 'w-11 h-16 sm:w-14 sm:h-20';
  return <div className={`${sizeCls} rounded-lg border-2 border-dashed border-white/15 flex-shrink-0`} />;
}

const PHASE_LABEL = {
  preflop: 'Pre-Flop', flop: 'Flop', turn: 'Turn', river: 'River',
  showdown: 'Showdown', hand_complete: 'Between Hands',
};

function numOf(v) { return Number(v) || 0; }

export default function TexasHoldemGame({ gameState, players, currentUserId, myHand, onMove, onClose, onEndGame, onPostResult, onPlayAgain }) {
  const gs = gameState?.game_state || {};
  const chips = gs.chips || {};
  const busted = gs.busted || {};
  const folded = gs.folded || {};
  const allIn = gs.all_in || {};
  const currentBets = gs.current_bets || {};
  const revealedHands = gs.revealed_hands || {};
  const community = gs.community_cards || [];
  const pot = numOf(gs.pot);
  const phase = gs.phase || 'preflop';
  const actionOn = gs.action_on ?? -1;
  const dealerIdx = gs.dealer_idx ?? -1;
  const smallBlind = numOf(gs.small_blind);
  const bigBlind = numOf(gs.big_blind);
  const handNumber = gs.hand_number ?? 1;
  const minRaise = numOf(gs.min_raise) || bigBlind;

  const isOver = ['finished', 'completed', 'forfeited'].includes(gameState?.status || '');
  const myIdx = (players || []).findIndex(p => p.user_id === currentUserId);
  const isMyTurn = !isOver && phase !== 'hand_complete' && actionOn === myIdx;
  const iAmBusted = myIdx >= 0 && !!busted[String(myIdx)];
  const iAmFolded = myIdx >= 0 && !!folded[String(myIdx)];

  const maxBet = useMemo(() => {
    let max = 0;
    (players || []).forEach((_, i) => { max = Math.max(max, numOf(currentBets[String(i)])); });
    return max;
  }, [players, currentBets]);

  const myChips = myIdx >= 0 ? numOf(chips[String(myIdx)]) : 0;
  const myBet = myIdx >= 0 ? numOf(currentBets[String(myIdx)]) : 0;
  const owed = Math.max(0, maxBet - myBet);
  const allInAmount = myBet + myChips;
  const raiseMin = Math.min(maxBet + minRaise, allInAmount);
  const canRaise = !iAmFolded && myChips > 0 && allInAmount > maxBet;

  const [raiseAmount, setRaiseAmount] = useState(null);
  const effectiveRaiseAmount = raiseAmount === null ? raiseMin : Math.min(Math.max(raiseAmount, raiseMin), allInAmount);

  // Snapshot chips from the last render where a hand was actively in
  // progress — since this only stops updating once phase flips to
  // hand_complete, the delta between this frozen snapshot and the current
  // (post-award) chips is exactly each player's pot winnings this hand. Pure
  // display cosmetics; the server is fully authoritative on actual chips.
  const chipsBeforeAwardRef = useRef({});
  if (phase !== 'hand_complete') {
    chipsBeforeAwardRef.current = chips;
  }
  const potWinners = phase === 'hand_complete'
    ? (players || [])
        .map((p, i) => ({ idx: i, username: p.username, delta: numOf(chips[String(i)]) - numOf(chipsBeforeAwardRef.current[String(i)]) }))
        .filter(w => w.delta > 0)
    : [];

  const winner = gameState?.winner_id
    ? ((players || []).find(p => p.user_id === gameState.winner_id) || 'draw')
    : 'draw';
  const gameStats = {
    lines: (players || []).map((p, i) => ({
      label: p.username,
      value: busted[String(i)] ? `Eliminated` : `${numOf(chips[String(i)])} chips`,
    })),
  };

  const endOrLeave = () => {
    const isHostUser = (gameState?.host_id ?? players?.[0]?.user_id) === currentUserId;
    if (isHostUser && onEndGame) onEndGame();
    else onClose();
  };

  const doCheck = () => onMove({ move_type: 'check' });
  const doCall = () => onMove({ move_type: 'call' });
  const doFold = () => onMove({ move_type: 'fold' });
  const doRaise = () => { onMove({ move_type: 'raise', amount: effectiveRaiseAmount }); setRaiseAmount(null); };
  const doNextHand = () => onMove({ move_type: 'next_hand' });

  return (
    <>
      {isOver && (
        <GameWinnerBanner
          winner={winner === 'draw' ? null : winner}
          players={players}
          gameType="texas_holdem"
          gameStats={gameStats}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
          secondaryAction={(gameState?.host_id ?? players?.[0]?.user_id) === currentUserId && onPlayAgain ? { label: 'Play Again 🔄', onClick: onPlayAgain } : undefined}
        />
      )}

      <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-green-950 to-gray-950">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-black/40 border-b border-green-900/60 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-lg">Texas Hold'em</span>
            <span className="text-gray-400 text-xs">Hand {handNumber} · Blinds {smallBlind}/{bigBlind}</span>
          </div>
          <div className="flex items-center gap-2">
            <GameRulesButton gameType="texas_holdem" className="text-gray-300 hover:text-white" />
            {!isOver && (
              <button
                onClick={endOrLeave}
                className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                End Game
              </button>
            )}
            <button onClick={onClose} className="text-gray-300 hover:text-white p-1"><X size={18} /></button>
          </div>
        </div>

        {/* Seats row */}
        <div className="flex gap-2 px-3 py-2 overflow-x-auto bg-black/20 border-b border-green-900/40 flex-shrink-0">
          {(players || []).map((p, i) => {
            const isActing = !isOver && phase !== 'hand_complete' && actionOn === i;
            const isBusted = !!busted[String(i)];
            const isFolded = !!folded[String(i)];
            const isAllIn = !!allIn[String(i)];
            const bet = numOf(currentBets[String(i)]);
            const won = potWinners.find(w => w.idx === i);
            return (
              <div
                key={p.user_id}
                className={`relative flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs min-w-[92px]
                  ${isActing ? 'bg-yellow-500/20 ring-2 ring-yellow-400' : 'bg-white/5'}
                  ${isBusted ? 'opacity-40' : ''}`}
              >
                {dealerIdx === i && (
                  <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-white text-black text-[10px] font-black flex items-center justify-center border border-gray-400">D</span>
                )}
                {won && (
                  <Crown size={14} className="absolute -top-2 -right-1 text-yellow-400" />
                )}
                <span className={`font-semibold truncate max-w-[80px] ${isFolded ? 'text-gray-500 line-through' : 'text-white'}`}>
                  {p.username}{p.user_id === currentUserId ? ' (You)' : ''}
                </span>
                <span className="text-green-300 font-bold">{numOf(chips[String(i)])}</span>
                {!isBusted && !isFolded && phase !== 'hand_complete' && p.user_id !== currentUserId && (
                  <div className="flex gap-0.5">
                    <div className="w-3 h-4 rounded-sm bg-gradient-to-br from-red-800 to-red-950 border border-red-600" />
                    <div className="w-3 h-4 rounded-sm bg-gradient-to-br from-red-800 to-red-950 border border-red-600" />
                  </div>
                )}
                {isBusted && <span className="text-gray-500 text-[10px]">Eliminated</span>}
                {!isBusted && isFolded && <span className="text-gray-500 text-[10px]">Folded</span>}
                {!isBusted && !isFolded && isAllIn && <span className="text-orange-400 text-[10px] font-semibold">All-In</span>}
                {!isBusted && !isFolded && bet > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-yellow-600/80 text-white text-[10px] font-bold">Bet {bet}</span>
                )}
                {won && (
                  <span className="text-yellow-300 text-[10px] font-bold">+{won.delta}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Table: pot + community cards */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-3 min-h-0">
          <div className="text-center">
            <span className="text-gray-400 text-xs uppercase tracking-wide">{PHASE_LABEL[phase] || phase}</span>
            <div className="text-yellow-300 font-black text-2xl">Pot: {pot}</div>
          </div>
          <div className="flex gap-1.5 sm:gap-2">
            {Array.from({ length: 5 }, (_, i) => (
              community[i] ? <Card key={i} card={community[i]} /> : <EmptySlot key={i} />
            ))}
          </div>

          {/* Showdown / hand-complete panel */}
          {phase === 'hand_complete' && (
            <div className="w-full max-w-md bg-black/40 rounded-2xl p-3 flex flex-col items-center gap-2">
              {Object.keys(revealedHands).length > 0 ? (
                <>
                  <span className="text-gray-300 text-xs font-semibold">Showdown</span>
                  <div className="flex flex-wrap justify-center gap-3">
                    {Object.entries(revealedHands).map(([idxStr, cards]) => {
                      const idx = Number(idxStr);
                      const p = players?.[idx];
                      const won = potWinners.find(w => w.idx === idx);
                      return (
                        <div key={idxStr} className="flex flex-col items-center gap-1">
                          <span className={`text-[11px] font-semibold ${won ? 'text-yellow-300' : 'text-gray-400'}`}>{p?.username}</span>
                          <div className="flex gap-1">
                            {(cards || []).map((c, ci) => <Card key={ci} card={c} small />)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : potWinners.length > 0 ? (
                <span className="text-gray-300 text-sm">
                  {potWinners.map(w => w.username).join(', ')} won {potWinners.reduce((s, w) => s + w.delta, 0)} chips uncontested
                </span>
              ) : null}
              {!isOver && !iAmBusted && (
                <button
                  onClick={doNextHand}
                  className="mt-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition-colors"
                >
                  Deal Next Hand
                </button>
              )}
              {!isOver && iAmBusted && (
                <span className="text-gray-500 text-xs">You're eliminated — spectating</span>
              )}
            </div>
          )}
        </div>

        {/* My hand + controls */}
        {!isOver && (
          <div className="bg-black/40 border-t border-green-900/60 px-3 py-3 flex-shrink-0">
            <div className="flex items-center justify-center gap-2 mb-3">
              {iAmBusted ? (
                <span className="text-gray-500 text-sm">You're out of the tournament</span>
              ) : iAmFolded ? (
                <span className="text-gray-500 text-sm">You folded this hand</span>
              ) : myHand && myHand.length > 0 ? (
                myHand.map((c, i) => <Card key={i} card={c} />)
              ) : (
                <>
                  <EmptySlot /><EmptySlot />
                </>
              )}
              {!iAmBusted && !iAmFolded && myHand?.length > 0 && (
                <span className="text-gray-400 text-xs ml-2">Chips: {myChips}</span>
              )}
            </div>

            {isMyTurn ? (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <button
                    onClick={doFold}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold rounded-xl transition-colors"
                  >
                    Fold
                  </button>
                  {owed === 0 ? (
                    <button
                      onClick={doCheck}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors"
                    >
                      Check
                    </button>
                  ) : (
                    <button
                      onClick={doCall}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors"
                    >
                      {owed >= myChips ? `All-In (${myChips})` : `Call ${owed}`}
                    </button>
                  )}
                  {canRaise && (
                    <button
                      onClick={doRaise}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition-colors"
                    >
                      {effectiveRaiseAmount >= allInAmount ? `All-In (${allInAmount})` : `Raise to ${effectiveRaiseAmount}`}
                    </button>
                  )}
                </div>
                {canRaise && raiseMin < allInAmount && (
                  <input
                    type="range"
                    min={raiseMin}
                    max={allInAmount}
                    step={Math.max(1, Math.floor(bigBlind / 2))}
                    value={effectiveRaiseAmount}
                    onChange={e => setRaiseAmount(Number(e.target.value))}
                    className="w-full max-w-xs accent-green-500"
                  />
                )}
              </div>
            ) : (
              !iAmBusted && !iAmFolded && phase !== 'hand_complete' && (
                <p className="text-center text-gray-400 text-sm">
                  Waiting for {players?.[actionOn]?.username || 'the next player'}…
                </p>
              )
            )}
          </div>
        )}
      </div>
    </>
  );
}
