import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Ban, Repeat, RotateCw, RotateCcw, Target, Check } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

// ---- Card rendering helpers ----
// H=Red  D=Yellow  C=Green  S=Blue — the 4 UNO colors. These letters are just
// internal codes borrowed from a standard deck's suit letters; real UNO cards
// have no suit symbols at all, just a solid color + rank, so nothing
// suit-shaped is ever rendered here (a heart/diamond/club/spade glyph on an
// UNO card was never actually correct — this was the source of most of the
// "looks like a generic emoji playing card" feel).
const COLOR_HEX   = { H: '#dc2626', D: '#eab308', C: '#16a34a', S: '#2563eb' };
const COLOR_NAMES = { H: 'Red', D: 'Yellow', C: 'Green', S: 'Blue' };
const SUIT_BG     = { H: 'from-red-600 to-red-900', D: 'from-yellow-500 to-yellow-800', C: 'from-green-600 to-green-900', S: 'from-blue-600 to-blue-900' };

// card codes: "7H", "SD" (Skip Hearts), "RH" (Reverse Hearts), "D2H" (Draw2), "WC" (Wild, C=placeholder), "W4C" (WildDraw4)
// `rank` is a stable internal code used purely for match-legality comparisons
// (mirrors the backend's own rank codes, e.g. "S"/"R"/"D2"). What actually
// gets displayed is decided separately in CardChip, driven by `type` — so
// changing an icon here never risks touching game-legality logic.
function parseCard(code) {
  if (!code) return { rank: '?', suit: '?', type: 'number' };
  if (code.startsWith('W4')) return { rank: 'W4', suit: code.slice(2), type: 'wild4' };
  if (code.startsWith('W'))  return { rank: 'W',  suit: code.slice(1), type: 'wild' };
  if (code.startsWith('D2')) return { rank: 'D2', suit: code.slice(2), type: 'draw2' };
  if (code.startsWith('S'))  return { rank: 'S',  suit: code.slice(1), type: 'skip' };
  if (code.startsWith('R'))  return { rank: 'R',  suit: code.slice(1), type: 'reverse' };
  return { rank: code.slice(0, -1), suit: code.slice(-1), type: 'number' };
}

// Classic UNO wild-card badge — 4 color quadrants forming a circle. Same
// clip-path-quadrant technique already used for Ludo's center piece
// elsewhere in this app, kept consistent rather than reinventing it.
function WildBadge({ size = 22 }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, borderRadius: '50%', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.5)', flexShrink: 0 }}>
      <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(0 0,100% 0,50% 50%)', background: COLOR_HEX.H }} />
      <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(100% 0,100% 100%,50% 50%)', background: COLOR_HEX.C }} />
      <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(100% 100%,0 100%,50% 50%)', background: COLOR_HEX.S }} />
      <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(0 100%,0 0,50% 50%)', background: COLOR_HEX.D }} />
    </div>
  );
}

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
  const iconSize = small ? 16 : 22;

  return (
    <button
      onClick={onClick}
      disabled={!playable && !selected}
      className={`relative flex flex-col items-center justify-center rounded-xl bg-gradient-to-br ${bg} transition-all duration-150 ${border} ${size} select-none shadow-lg border border-white/10`}
    >
      {/* White oval in center (authentic Uno card style) */}
      <div className="absolute inset-[20%] rounded-full bg-white/15" />
      {type === 'wild' && <WildBadge size={iconSize} />}
      {type === 'wild4' && (
        <div className="relative flex flex-col items-center gap-0.5">
          <WildBadge size={iconSize} />
          <span className="font-black leading-none text-white drop-shadow" style={{ fontSize: small ? 10 : 13 }}>+4</span>
        </div>
      )}
      {type === 'skip' && <Ban className="relative text-white drop-shadow" size={iconSize} strokeWidth={2.75} />}
      {type === 'reverse' && <Repeat className="relative text-white drop-shadow" size={iconSize} strokeWidth={2.75} />}
      {type === 'draw2' && <span className="relative font-black leading-none text-white drop-shadow">+2</span>}
      {type === 'number' && <span className="relative font-black leading-none text-white drop-shadow">{rank}</span>}
    </button>
  );
}

// ---- Color Picker for Wilds ----
function ColorPicker({ onPick }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
      <div className="bg-gray-900 rounded-2xl p-6 flex flex-col gap-4 items-center shadow-2xl">
        <p className="text-white font-bold">Choose a color</p>
        <div className="grid grid-cols-2 gap-3">
          {['H', 'D', 'C', 'S'].map(c => (
            <button
              key={c}
              onClick={() => onPick(c)}
              className="flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-white hover:scale-105 transition-transform"
              style={{ background: `linear-gradient(135deg, ${COLOR_HEX[c]}, ${COLOR_HEX[c]}cc)` }}
            >
              <span className="w-4 h-4 rounded-full bg-white/90 border border-white/40 flex-shrink-0" />
              {COLOR_NAMES[c]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function UnoGame({ gameState, players, currentUserId, myHand, onMove, onClose, onEndGame, onPostResult, onPlayAgain }) {
  const [gs, setGs]           = useState(null);
  const [selected, setSelected] = useState(null);
  const [pickingColor, setPickingColor] = useState(false);
  const [unoPressed, setUnoPressed]   = useState(false);
  const [announcement, setAnnouncement] = useState(null);
  const announceTimerRef = useRef(null);
  const prevEventSeqRef = useRef(0);

  const announce = useCallback((opts) => {
    clearTimeout(announceTimerRef.current);
    setAnnouncement({ ...opts, key: Date.now() });
    announceTimerRef.current = setTimeout(() => setAnnouncement(null), 2600);
  }, []);

  useEffect(() => () => clearTimeout(announceTimerRef.current), []);

  useEffect(() => {
    if (!gameState?.game_state) return;
    setGs(gameState.game_state);
    setSelected(null);
  }, [gameState]);

  // Edge-detect a new event via the monotonic event_seq — fires the correct
  // banner for every connected client, not just whoever triggered it.
  useEffect(() => {
    const seq = gs?.event_seq ?? 0;
    if (seq <= prevEventSeqRef.current) {
      prevEventSeqRef.current = seq;
      return;
    }
    prevEventSeqRef.current = seq;

    const event = gs?.last_event;
    if (!event) return;
    const actorName = players.find(p => p.user_id === gs.last_event_actor)?.username || 'Someone';
    const targetName = players.find(p => p.user_id === gs.last_event_target)?.username || 'Someone';

    const banners = {
      skip:    { Icon: Ban,    text: 'SKIPPED!',        sub: `${actorName} skipped ${targetName}!`, bg: 'linear-gradient(135deg,#7c3aed,#4f46e5)' },
      reverse: { Icon: Repeat, text: 'REVERSED!',       sub: `${actorName} reversed the direction!`, bg: 'linear-gradient(135deg,#7c3aed,#4f46e5)' },
      draw2:   { icon: '+2',   text: 'DRAW TWO!',       sub: `${targetName} must draw 2 (or stack another D2)!`, bg: 'linear-gradient(135deg,#dc2626,#7f1d1d)' },
      wild4:   { icon: '+4',   text: 'WILD DRAW FOUR!', sub: `${targetName} must draw 4 (or stack a W4)!`, bg: 'linear-gradient(135deg,#dc2626,#7f1d1d)' },
      caught:  { Icon: Target, text: 'CAUGHT!',         sub: `${actorName} caught ${targetName} without UNO — +2 cards!`, bg: 'linear-gradient(135deg,#f59e0b,#b45309)' },
    };
    if (banners[event]) announce(banners[event]);
  }, [gs?.event_seq, gs?.last_event, gs?.last_event_actor, gs?.last_event_target, players, announce]);

  if (!gs) return null;

  const hand         = myHand || [];
  const discardTop   = gs.discard_top || '';
  const currentColor = gs.current_color || '';
  const isReversed   = gs.direction === -1;
  const pendingDraw  = gs.pending_draw || 0;
  const isOver       = ['finished','completed','forfeited'].includes(gameState?.status || '');
  const myTurnIdx    = gameState?.current_turn ?? 0;
  const isMyTurn     = !isOver && players[myTurnIdx]?.user_id === currentUserId;
  const drawCount    = gs.draw_pile_count || 0;
  const handCounts   = gs.hand_counts || {};
  const unoDeclared  = gs.uno_declared || {};

  function hasMatchingColor(color) {
    return hand.some(c => {
      const { type, suit } = parseCard(c);
      return type !== 'wild' && type !== 'wild4' && suit === color;
    });
  }

  // Work out which hand cards are playable — mirrors unoCardPlayable /
  // processUnoPlay's legality rules exactly so the UI never offers a move
  // the backend would reject.
  function isPlayable(code) {
    if (!isMyTurn) return false;
    const { rank, suit, type } = parseCard(code);
    const { rank: topRank, suit: topSuit } = parseCard(discardTop);
    const activeColor = currentColor || topSuit;
    if (pendingDraw > 0) {
      // Facing a stacked Draw 2 / Wild Draw 4 — only another D2 or W4 can
      // counter it. W4's own color restriction still applies on top of that.
      if (type === 'draw2') return true;
      if (type === 'wild4') return !hasMatchingColor(activeColor);
      return false;
    }
    if (type === 'wild') return true;
    // Wild Draw Four is only legal with no matching-color card in hand —
    // mirrors the backend's restriction so the UI doesn't offer an illegal play.
    if (type === 'wild4') return !hasMatchingColor(activeColor);
    return suit === activeColor || rank === topRank;
  }

  function catchPlayer(targetId) {
    onMove({ move_type: 'catch_uno', target_id: targetId });
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

  const winner = gameState?.winner_id
    ? (players.find(p => p.user_id === gameState.winner_id) || 'draw')
    : 'draw';
  const gameStats = {
    lines: players.map(p => {
      const count = p.user_id === currentUserId ? hand.length : (handCounts[String(p.user_id)] ?? 0);
      return { label: p.username, value: `${count} card${count === 1 ? '' : 's'} left` };
    }),
  };

  const { suit: topSuit } = parseCard(discardTop);

  return (
    <>
    <style>{`
      @keyframes unoBannerIn {
        0%   { opacity: 0; transform: translate(-50%,-50%) scale(0.8); }
        15%  { opacity: 1; transform: translate(-50%,-50%) scale(1.06); }
        25%  { transform: translate(-50%,-50%) scale(1); }
        80%  { opacity: 1; }
        100% { opacity: 0; transform: translate(-50%,-50%) scale(0.94); }
      }
    `}</style>
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 overflow-hidden">
      {pickingColor && <ColorPicker onPick={pickColor} />}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <WildBadge size={22} />
          <span className="text-white font-bold">UNO</span>
          {isReversed
            ? <RotateCcw className="text-gray-500 ml-1" size={14} />
            : <RotateCw className="text-gray-500 ml-1" size={14} />}
          {pendingDraw > 0 && (
            <span className="bg-red-700 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              +{pendingDraw} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <GameRulesButton gameType="uno" className="text-gray-400 hover:text-white" />
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
          const catchable = count === 1 && !unoDeclared[String(p.user_id)];
          return (
            <div key={p.user_id} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs
              ${isTheirTurn ? 'bg-purple-800/60 ring-1 ring-purple-400' : 'bg-gray-800/50'}`}>
              <span className="text-gray-300 font-semibold">{p.username}</span>
              <span className="flex items-center gap-1 text-white font-bold">
                {count} <WildBadge size={10} />
              </span>
              {catchable && (
                <button
                  onClick={() => catchPlayer(p.user_id)}
                  className="bg-red-600 hover:bg-red-500 text-white font-bold px-1.5 py-0.5 rounded transition-colors animate-pulse"
                >
                  Catch!
                </button>
              )}
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
              shadow-xl transition-all
              ${isMyTurn ? 'hover:scale-105 cursor-pointer ring-1 ring-purple-400' : 'opacity-60 cursor-default'}`}
          >
            <WildBadge size={28} />
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
              Color: {COLOR_NAMES[currentColor] || currentColor}
            </span>
          )}
        </div>
      </div>

      {/* Status line */}
      {!isOver && (
        <div className="text-center pb-2 text-sm text-gray-400">
          {isMyTurn
            ? <span className="text-green-400 font-semibold">Your turn — play a card or draw</span>
            : <span>Waiting for {players[myTurnIdx]?.username}…</span>
          }
        </div>
      )}

      {/* My hand */}
      <div className="bg-gray-900/80 border-t border-gray-800 px-3 py-3">
        {isOver ? null : (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-xs font-semibold">Your hand ({hand.length} cards)</span>
              {hand.length === 1 && (
                unoDeclared[String(currentUserId)] ? (
                  <span className="flex items-center gap-1 px-4 py-1 rounded-full font-bold text-sm bg-green-700/40 text-green-300 border border-green-500/40">
                    <Check size={14} strokeWidth={3} /> Declared
                  </span>
                ) : (
                  <button
                    onClick={pressUno}
                    disabled={unoPressed}
                    className={`px-4 py-1 rounded-full font-black text-sm transition-all
                      ${unoPressed ? 'bg-yellow-700 text-yellow-200' : 'bg-yellow-500 text-black hover:bg-yellow-400 animate-pulse'}`}
                  >
                    {unoPressed ? 'UNO! 🎉' : 'UNO!'}
                  </button>
                )
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
      </div>
    </div>

    {announcement && (
      <div key={announcement.key} className="fixed z-[70] pointer-events-none"
        style={{ top: '30%', left: '50%', animation: 'unoBannerIn 2.6s ease-out forwards' }}>
        <div className="px-6 py-3 rounded-2xl text-center shadow-2xl" style={{ background: announcement.bg }}>
          <div className="flex justify-center mb-0.5">
            {announcement.Icon
              ? <announcement.Icon className="text-white" size={34} strokeWidth={2.5} />
              : <span className="text-3xl font-black text-white">{announcement.icon}</span>}
          </div>
          <div className="text-white font-black text-lg tracking-wide">{announcement.text}</div>
          {announcement.sub && <div className="text-white/85 text-xs mt-0.5">{announcement.sub}</div>}
        </div>
      </div>
    )}

    {isOver && (
      <GameWinnerBanner
        winner={winner === 'draw' ? null : winner}
        players={players}
        gameType="uno"
        gameStats={gameStats}
        isForfeit={gameState?.status === 'forfeited'}
        onClose={onClose}
        onPostResult={onPostResult}
        secondaryAction={(gameState?.host_id ?? players?.[0]?.user_id) === currentUserId && onPlayAgain ? { label: 'Play Again 🔄', onClick: onPlayAgain } : undefined}
      />
    )}
    </>
  );
}
