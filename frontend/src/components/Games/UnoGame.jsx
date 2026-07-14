import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

// ---- Card rendering helpers ----
// H=Red  D=Yellow  C=Green  S=Blue  (standard Uno colour convention)
const SUIT_SYMBOLS = { H: '♥', D: '♦', C: '♣', S: '♠' };
const SUIT_COLORS  = { H: 'text-red-200',    D: 'text-yellow-200', C: 'text-green-200', S: 'text-blue-200' };
const BG_COLORS    = { H: 'bg-red-700',       D: 'bg-yellow-600',   C: 'bg-green-700',   S: 'bg-blue-700', W: 'bg-gray-900', X: 'bg-gray-900' };

// card codes: "7H", "SD" (Skip Hearts), "RH" (Reverse Hearts), "D2H" (Draw2), "WC" (Wild, C=placeholder), "W4C" (WildDraw4)
function parseCard(code) {
  if (!code) return { rank: '?', suit: '?', type: 'number', color: 'gray' };
  if (code.startsWith('W4')) return { rank: '+4', suit: code.slice(2), type: 'wild4' };
  if (code.startsWith('W'))  return { rank: '🃏', suit: code.slice(1), type: 'wild' };
  if (code.startsWith('D2')) return { rank: '+2', suit: code.slice(2), type: 'draw2' };
  if (code.startsWith('S'))  return { rank: '⊘', suit: code.slice(1), type: 'skip' };
  if (code.startsWith('R'))  return { rank: '⟳', suit: code.slice(1), type: 'reverse' };
  return { rank: code.slice(0, -1), suit: code.slice(-1), type: 'number' };
}

const SUIT_BG = { H: 'from-red-600 to-red-900', D: 'from-yellow-500 to-yellow-800', C: 'from-green-600 to-green-900', S: 'from-blue-600 to-blue-900' };

function CardChip({ code, onClick, selected, playable, small }) {
  const { rank, suit, type } = parseCard(code);
  const isWild = type === 'wild' || type === 'wild4';
  const bg = isWild ? 'from-purple-700 to-purple-900' : (SUIT_BG[suit] || 'from-gray-700 to-gray-900');
  const border = selected
    ? 'ring-2 ring-yellow-400 scale-110 -translate-y-4 shadow-2xl shadow-yellow-400/30'
    : playable
      ? 'ring-1 ring-white/60 hover:-translate-y-3 hover:scale-105 hover:shadow-xl cursor-pointer'
      : 'opacity-50 cursor-default';
  const size = small ? 'w-9 h-12 text-xs' : 'w-12 h-16 text-sm';
  const suitColor = SUIT_COLORS[suit] || 'text-white';

  return (
    <button
      onClick={onClick}
      disabled={!playable && !selected}
      className={`relative flex flex-col items-center justify-center rounded-xl bg-gradient-to-br ${bg} transition-all duration-150 ${border} ${size} select-none shadow-lg border border-white/10`}
    >
      {/* White oval in center (Uno card style) */}
      <div className="absolute inset-[20%] rounded-full bg-white/15" />
      <span className="relative font-black leading-none text-white drop-shadow">{rank}</span>
      {!isWild && (
        <span className={`relative text-xs leading-none mt-0.5 font-bold ${suitColor} drop-shadow`}>
          {SUIT_SYMBOLS[suit] || suit}
        </span>
      )}
    </button>
  );
}

// ---- Color Picker for Wilds ----
const COLORS = ['H', 'D', 'C', 'S'];
const COLOR_LABELS = { H: '❤️ Red', D: '💛 Yellow', C: '🟢 Green', S: '🔵 Blue' };
const COLOR_PICKER_BG = { H: 'bg-gradient-to-br from-red-600 to-red-900', D: 'bg-gradient-to-br from-yellow-500 to-yellow-800', C: 'bg-gradient-to-br from-green-600 to-green-900', S: 'bg-gradient-to-br from-blue-600 to-blue-900' };

function ColorPicker({ onPick }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
      <div className="bg-gray-900 rounded-2xl p-6 flex flex-col gap-4 items-center shadow-2xl">
        <p className="text-white font-bold">Choose a color</p>
        <div className="grid grid-cols-2 gap-3">
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => onPick(c)}
              className={`px-6 py-3 rounded-xl font-semibold text-white hover:scale-105 transition-transform ${COLOR_PICKER_BG[c]}`}
            >
              {COLOR_LABELS[c]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function UnoGame({ gameState, players, currentUserId, myHand, onMove, onClose, onEndGame }) {
  const [gs, setGs]           = useState(null);
  const [selected, setSelected] = useState(null);
  const [pickingColor, setPickingColor] = useState(false);
  const [unoPressed, setUnoPressed]   = useState(false);

  useEffect(() => {
    if (!gameState?.game_state) return;
    setGs(gameState.game_state);
    setSelected(null);
  }, [gameState]);

  if (!gs) return null;

  const hand         = myHand || [];
  const discardTop   = gs.discard_top || '';
  const currentColor = gs.current_color || '';
  const direction    = gs.direction === -1 ? '↺' : '↻';
  const pendingDraw  = gs.pending_draw || 0;
  const isOver       = ['finished','completed','forfeited'].includes(gameState?.status || '');
  const myTurnIdx    = gameState?.current_turn ?? 0;
  const isMyTurn     = !isOver && players[myTurnIdx]?.user_id === currentUserId;
  const drawCount    = gs.draw_pile_count || 0;
  const handCounts   = gs.hand_counts || {};

  // Work out which hand cards are playable.
  function isPlayable(code) {
    if (!isMyTurn) return false;
    const { rank, suit, type } = parseCard(code);
    if (type === 'wild' || type === 'wild4') return true;
    const { rank: topRank, suit: topSuit } = parseCard(discardTop);
    const activeColor = currentColor || topSuit;
    return suit === activeColor || rank === topRank;
  }

  function playCard(code) {
    if (!isMyTurn) return;
    const { type } = parseCard(code);
    if (type === 'wild' || type === 'wild4') {
      setSelected(code);
      setPickingColor(true);
      return;
    }
    onMove({ move_type: 'play', card: code });
    setSelected(null);
  }

  function pickColor(color) {
    setPickingColor(false);
    onMove({ move_type: 'play', card: selected, next_color: color });
    setSelected(null);
  }

  function drawCard() {
    if (!isMyTurn) return;
    onMove({ move_type: 'draw' });
  }

  function pressUno() {
    setUnoPressed(true);
    onMove({ move_type: 'uno' });
    setTimeout(() => setUnoPressed(false), 2000);
  }

  const winner = isOver && gameState?.winner_id
    ? players.find(p => p.user_id === gameState.winner_id)
    : null;

  const { suit: topSuit } = parseCard(discardTop);
  const activeColor = currentColor || topSuit;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 overflow-hidden">
      {pickingColor && <ColorPicker onPick={pickColor} />}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-xl">🃏</span>
          <span className="text-white font-bold">UNO</span>
          <span className="text-gray-500 text-xs ml-2">{direction}</span>
          {pendingDraw > 0 && (
            <span className="bg-red-700 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              +{pendingDraw} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isOver && onEndGame && (
            <button
              onClick={onEndGame}
              className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              End Game
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><X size={18} /></button>
        </div>
      </div>

      {/* Other players' hand counts */}
      <div className="flex gap-2 px-4 py-2 overflow-x-auto bg-gray-900/50 border-b border-gray-800">
        {players.filter(p => p.user_id !== currentUserId).map(p => {
          const count = handCounts[String(p.user_id)] || 0;
          const isTheirTurn = players[myTurnIdx]?.user_id === p.user_id;
          return (
            <div key={p.user_id} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs
              ${isTheirTurn ? 'bg-purple-800/60 ring-1 ring-purple-400' : 'bg-gray-800/50'}`}>
              <span className="text-gray-300 font-semibold">{p.username}</span>
              <span className="text-white font-bold">{count}🃏</span>
              {count === 1 && <span className="text-red-400 font-bold">UNO!</span>}
            </div>
          );
        })}
      </div>

      {/* Play area */}
      <div className="flex-1 flex items-center justify-center gap-8 p-4">
        {/* Draw pile */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={drawCard}
            disabled={!isMyTurn}
            className={`w-14 h-20 rounded-xl bg-gradient-to-br from-purple-700 to-purple-900 flex items-center justify-center
              font-bold text-white text-lg shadow-xl transition-all
              ${isMyTurn ? 'hover:scale-105 cursor-pointer ring-1 ring-purple-400' : 'opacity-60 cursor-default'}`}
          >
            🃏
          </button>
          <span className="text-gray-500 text-xs">{drawCount} left</span>
        </div>

        {/* Discard pile */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-14 h-20">
            <CardChip code={discardTop} small={false} />
          </div>
          {currentColor && currentColor !== topSuit && (
            <span className="text-xs text-purple-300 font-semibold">
              Color: {COLOR_LABELS[currentColor] || currentColor}
            </span>
          )}
        </div>
      </div>

      {/* Status line */}
      <div className="text-center pb-2 text-sm text-gray-400">
        {isOver
          ? winner
            ? <span className="text-white font-bold">{winner.user_id === currentUserId ? '🎉 You won!' : `${winner.username} wins!`}</span>
            : <span className="text-gray-400">Game over</span>
          : isMyTurn
            ? <span className="text-green-400 font-semibold">Your turn — play a card or draw</span>
            : <span>Waiting for {players[myTurnIdx]?.username}…</span>
        }
      </div>

      {/* My hand */}
      <div className="bg-gray-900/80 border-t border-gray-800 px-3 py-3">
        {isOver ? null : (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-xs font-semibold">Your hand ({hand.length} cards)</span>
              {hand.length <= 1 && hand.length > 0 && (
                <button
                  onClick={pressUno}
                  disabled={unoPressed}
                  className={`px-4 py-1 rounded-full font-black text-sm transition-all
                    ${unoPressed ? 'bg-yellow-700 text-yellow-200' : 'bg-yellow-500 text-black hover:bg-yellow-400'}`}
                >
                  {unoPressed ? 'UNO! 🎉' : 'UNO!'}
                </button>
              )}
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1 justify-start">
              {hand.map((code, i) => (
                <CardChip
                  key={`${code}-${i}`}
                  code={code}
                  playable={isMyTurn && isPlayable(code)}
                  selected={selected === code}
                  onClick={() => isMyTurn && isPlayable(code) && playCard(code)}
                  small={hand.length > 10}
                />
              ))}
              {hand.length === 0 && <span className="text-gray-600 text-sm">No cards — game should be ending…</span>}
            </div>
          </>
        )}
        {isOver && (
          <button onClick={onClose} className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold transition-colors">
            Close
          </button>
        )}
      </div>
    </div>
  );
}
