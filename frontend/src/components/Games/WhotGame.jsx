// src/components/Games/WhotGame.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

// ── Suit data ─────────────────────────────────────────────────────────────────
const SUIT_HEX   = { C: '#2563eb', T: '#16a34a', X: '#dc2626', Q: '#d97706', S: '#7c3aed' };
// Sound files hosted on BunnyCDN so they work on Vercel too.
// Upload all MP3s to BunnyCDN storage at path:  sounds/whot/<filename>.mp3
const _CDN = 'https://letswatchout.b-cdn.net/games/sounds/whot/';
const WHOT_SOUNDS = {
  pick2:          `${_CDN}pick2.mp3`,
  pick3:          `${_CDN}pick3.mp3`,
  general_market: `${_CDN}general_market.mp3`,
  hold_on:        `${_CDN}hold_on.mp3`,
  whot:           `${_CDN}whot.mp3`,
  last_card:      `${_CDN}last_card.mp3`,
  checkup:        `${_CDN}CheckUp.mp3`,
};
const SUIT_NAMES = { C: 'Circle', T: 'Triangle', X: 'Cross', Q: 'Square', S: 'Star' };
const SPECIAL_LABELS = { '1': 'Hold On', '2': 'Pick Two', '5': 'Pick Three', '8': 'Hold On', '14': 'Gen. Market' };
const SUIT_ORDER = ['C', 'T', 'X', 'Q', 'S'];

function parseCard(card) {
  if (!card) return { num: '', suit: '' };
  if (card === 'W') return { num: '20', suit: '' };
  return { num: card.slice(0, -1), suit: card.slice(-1) };
}

// ── SVG suit shapes ───────────────────────────────────────────────────────────
function SuitShape({ suit, size = 32, color }) {
  const c = color || SUIT_HEX[suit] || '#888';
  const h = size, w = size;
  switch (suit) {
    case 'C': return (
      <svg width={w} height={h} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="11" stroke={c} strokeWidth="3.5" fill="none"/>
        <circle cx="16" cy="16" r="5.5" fill={c}/>
      </svg>
    );
    case 'T': return (
      <svg width={w} height={h} viewBox="0 0 32 32" fill="none">
        <polygon points="16,3 30,29 2,29" stroke={c} strokeWidth="3" strokeLinejoin="round" fill={c} fillOpacity="0.18"/>
        <line x1="16" y1="8" x2="16" y2="24" stroke={c} strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="9" y1="24" x2="23" y2="24" stroke={c} strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    );
    case 'X': return (
      <svg width={w} height={h} viewBox="0 0 32 32">
        <rect x="13" y="2"  width="6" height="28" rx="3" fill={c}/>
        <rect x="2"  y="13" width="28" height="6" rx="3" fill={c}/>
      </svg>
    );
    case 'Q': return (
      <svg width={w} height={h} viewBox="0 0 32 32" fill="none">
        <rect x="3" y="3" width="26" height="26" rx="3" stroke={c} strokeWidth="3.5" fill={c} fillOpacity="0.15"/>
        <rect x="10" y="10" width="12" height="12" rx="1.5" fill={c}/>
      </svg>
    );
    case 'S': return (
      <svg width={w} height={h} viewBox="0 0 32 32">
        <polygon
          points="16,2 19.8,11.9 30.5,11.9 21.9,18.1 25.2,28 16,22 6.8,28 10.1,18.1 1.5,11.9 12.2,11.9"
          fill={c} stroke={c} strokeWidth="1" strokeLinejoin="round"
        />
      </svg>
    );
    default: return null;
  }
}

// Tiny version for corners
function SuitShapeTiny({ suit, size = 12, color }) {
  return <SuitShape suit={suit} size={size} color={color} />;
}

// ── Card back ─────────────────────────────────────────────────────────────────
function CardBack({ width = 64, height = 92 }) {
  return (
    <svg width={width} height={height} viewBox="0 0 64 92" style={{ display:'block' }}>
      <defs>
        <pattern id="whotback" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#14532d"/>
          <path d="M0 0 L8 8 M8 0 L0 8" stroke="#166534" strokeWidth="0.8"/>
        </pattern>
      </defs>
      <rect x="0" y="0" width="64" height="92" rx="6" fill="url(#whotback)"/>
      <rect x="2" y="2" width="60" height="88" rx="5" fill="none" stroke="#15803d" strokeWidth="1.5"/>
      <rect x="5" y="5" width="54" height="82" rx="4" fill="none" stroke="#166534" strokeWidth="0.8"/>
      <circle cx="32" cy="46" r="16" fill="none" stroke="#15803d" strokeWidth="1.5"/>
      <text x="32" y="52" textAnchor="middle" fontSize="18" fontWeight="900"
        fontFamily="serif" fill="#16a34a" letterSpacing="0">W</text>
    </svg>
  );
}

// ── Whot wild card face ───────────────────────────────────────────────────────
function WildFace({ width = 64, height = 92 }) {
  return (
    <svg width={width} height={height} viewBox="0 0 64 92" style={{ display:'block' }}>
      <defs>
        {/* Dark gold gradient for header/footer bands */}
        <linearGradient id="wild-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"    stopColor="#1c1917"/>
          <stop offset="24%"   stopColor="#1c1917"/>
          <stop offset="24.5%" stopColor="#fffef8"/>
          <stop offset="75.5%" stopColor="#fffef8"/>
          <stop offset="76%"   stopColor="#1c1917"/>
          <stop offset="100%"  stopColor="#1c1917"/>
        </linearGradient>
        <linearGradient id="wild-rainbow" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#2563eb"/>
          <stop offset="25%"  stopColor="#16a34a"/>
          <stop offset="50%"  stopColor="#dc2626"/>
          <stop offset="75%"  stopColor="#d97706"/>
          <stop offset="100%" stopColor="#7c3aed"/>
        </linearGradient>
      </defs>

      {/* Card body */}
      <rect x="0" y="0" width="64" height="92" rx="6" fill="url(#wild-bg)"/>
      {/* Outer highlight */}
      <rect x="0.5" y="0.5" width="63" height="91" rx="5.5" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
      {/* Rainbow inner border */}
      <rect x="2.5" y="2.5" width="59" height="87" rx="4.5" fill="none" stroke="url(#wild-rainbow)" strokeWidth="1.5"/>

      {/* Top header: "W!" + gold star */}
      <text x="6" y="16" fontSize="12" fontWeight="900" fontFamily="Arial,sans-serif" fill="#f59e0b">W!</text>
      <text x="47" y="16" fontSize="12" fontWeight="900" fontFamily="Arial,sans-serif" fill="#f59e0b">★</text>

      {/* Separator lines */}
      <line x1="4" y1="22" x2="60" y2="22" stroke="rgba(245,158,11,0.25)" strokeWidth="0.5"/>
      <line x1="4" y1="70" x2="60" y2="70" stroke="rgba(245,158,11,0.25)" strokeWidth="0.5"/>

      {/* 5 suit symbols in quincunx pattern in middle area */}
      {/* Top-left, top-right, center, bottom-left, bottom-right */}
      {[
        { suit:'C', x:16, y:33 },
        { suit:'T', x:48, y:33 },
        { suit:'X', x:32, y:46 },
        { suit:'Q', x:16, y:59 },
        { suit:'S', x:48, y:59 },
      ].map(({ suit, x, y }) => (
        <g key={suit} transform={`translate(${x - 9},${y - 9})`}>
          <SuitShape suit={suit} size={18} />
        </g>
      ))}

      {/* WHOT! label centered in middle */}
      <text x="32" y="48" textAnchor="middle" fontSize="7.5" fontWeight="900"
        fontFamily="Arial,sans-serif" fill="#1c1917" letterSpacing="1">WHOT!</text>

      {/* Bottom (rotated 180° around card center) */}
      <g transform="rotate(180,32,46)">
        <text x="6" y="16" fontSize="12" fontWeight="900" fontFamily="Arial,sans-serif" fill="#f59e0b">W!</text>
        <text x="47" y="16" fontSize="12" fontWeight="900" fontFamily="Arial,sans-serif" fill="#f59e0b">★</text>
      </g>
    </svg>
  );
}

// ── Main card face ─────────────────────────────────────────────────────────────
// "Blank" card template: two-tone gradient (suit colour top+bottom, cream middle).
// All card details (number, suit symbol, special label) are placed over this template.
function CardFace({ card, width = 64, height = 92 }) {
  const { num, suit } = parseCard(card);
  const isWild = num === '20' || card === 'W';
  if (isWild) return <WildFace width={width} height={height}/>;

  const color  = SUIT_HEX[suit] || '#888';
  const special = SPECIAL_LABELS[num];
  // Gradient ID is per-suit so same-type cards on screen share the same def (identical colour).
  const gradId = `wcard-${suit}`;

  return (
    <svg width={width} height={height} viewBox="0 0 64 92" style={{ display:'block' }}>
      <defs>
        {/* Two-tone: suit colour at top (0-24%) and bottom (76-100%), cream in the middle */}
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"    stopColor={color}/>
          <stop offset="24%"   stopColor={color}/>
          <stop offset="24.5%" stopColor="#fffef8"/>
          <stop offset="75.5%" stopColor="#fffef8"/>
          <stop offset="76%"   stopColor={color}/>
          <stop offset="100%"  stopColor={color}/>
        </linearGradient>
      </defs>

      {/* ── Blank card template ── */}
      <rect x="0" y="0" width="64" height="92" rx="6" fill={`url(#${gradId})`}/>
      {/* Outer white highlight ring */}
      <rect x="0.5" y="0.5" width="63" height="91" rx="5.5" fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth="1"/>
      {/* Subtle inner border on cream zone */}
      <rect x="2.5" y="22" width="59" height="48" fill="none" stroke={color} strokeWidth="0.5" strokeOpacity="0.15"/>
      {/* Band separator lines */}
      <line x1="4" y1="22" x2="60" y2="22" stroke="rgba(255,255,255,0.20)" strokeWidth="0.5"/>
      <line x1="4" y1="70" x2="60" y2="70" stroke="rgba(255,255,255,0.20)" strokeWidth="0.5"/>

      {/* ── Card details ── */}

      {/* Top header: large number (white) + suit icon (white, top-right) */}
      <text x="6" y="16" fontSize="13" fontWeight="900" fontFamily="Arial,sans-serif"
        fill="white" letterSpacing="-0.5">{num}</text>
      <g transform="translate(44,3)">
        <SuitShape suit={suit} size={15} color="white"/>
      </g>

      {/* Central suit symbol — large, in cream zone */}
      <g transform="translate(16,29)">
        <SuitShape suit={suit} size={32} color={color}/>
      </g>

      {/* Special card label just above footer */}
      {special && (
        <text x="32" y="68" textAnchor="middle" fontSize="6.5" fontWeight="800"
          fontFamily="Arial,sans-serif" fill={color} letterSpacing="0.4">
          {special.toUpperCase()}
        </text>
      )}

      {/* Bottom header: same as top, rotated 180° around card centre */}
      <g transform="rotate(180,32,46)">
        <text x="6" y="16" fontSize="13" fontWeight="900" fontFamily="Arial,sans-serif"
          fill="white" letterSpacing="-0.5">{num}</text>
        <g transform="translate(44,3)">
          <SuitShape suit={suit} size={15} color="white"/>
        </g>
      </g>
    </svg>
  );
}

// ── WhotCard wrapper ──────────────────────────────────────────────────────────
function WhotCard({ card, faceDown, onClick, dimmed, selected, playable, size = 'sm' }) {
  const dims = size === 'lg' ? { w: 72, h: 104 } : { w: 56, h: 80 };

  const inner = faceDown
    ? <CardBack width={dims.w} height={dims.h}/>
    : <CardFace card={card} width={dims.w} height={dims.h}/>;

  const isClickable = !!onClick && !dimmed;

  // Visual priority: selected (white glow) > playable (green glow) > default shadow
  const filter = selected
    ? 'drop-shadow(0 0 8px rgba(255,255,255,0.7)) drop-shadow(0 2px 4px rgba(0,0,0,0.5))'
    : playable
    ? 'drop-shadow(0 0 7px rgba(34,197,94,0.65)) drop-shadow(0 2px 4px rgba(0,0,0,0.45))'
    : 'drop-shadow(0 2px 4px rgba(0,0,0,0.45))';

  return (
    <div
      onClick={isClickable ? onClick : undefined}
      style={{
        width: dims.w, height: dims.h,
        borderRadius: 6,
        display: 'inline-block',
        flexShrink: 0,
        opacity: dimmed ? 0.32 : 1,
        outline: selected ? '2.5px solid #fff' : playable ? '1.5px solid rgba(34,197,94,0.6)' : 'none',
        outlineOffset: 2,
        transform: selected ? 'translateY(-10px) scale(1.04)' : undefined,
        cursor: isClickable ? 'pointer' : 'default',
        filter,
        transition: 'transform 0.15s, opacity 0.15s, filter 0.15s',
      }}
      onMouseEnter={e => { if (isClickable) e.currentTarget.style.transform = selected ? 'translateY(-10px) scale(1.04)' : 'translateY(-6px)'; }}
      onMouseLeave={e => { if (isClickable) e.currentTarget.style.transform = selected ? 'translateY(-10px) scale(1.04)' : ''; }}
    >
      {inner}
    </div>
  );
}

// ── Game component ────────────────────────────────────────────────────────────
export default function WhotGame({ gameState, players = [], currentUserId, myHand, onMove, onClose, onEndGame }) {
  const [pendingWild, setPendingWild]   = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [announcement, setAnnouncement] = useState(null);
  const soundsRef         = useRef({});
  const prevDiscardRef    = useRef(null);
  const firstDiscardRef   = useRef(true);   // skip initial state on mount
  const prevHandCountsRef = useRef({});
  const announceTimerRef  = useRef(null);
  const prevIsOverRef     = useRef(false);

  // Preload ElevenLabs sounds once on mount.
  // Drop MP3 files in frontend/public/sounds/whot/ matching the keys in WHOT_SOUNDS.
  useEffect(() => {
    Object.entries(WHOT_SOUNDS).forEach(([key, src]) => {
      const a = new Audio(src);
      a.preload = 'auto';
      soundsRef.current[key] = a;
    });
  }, []);

  const playSound = useCallback((key) => {
    const a = soundsRef.current[key];
    if (!a) return;
    a.currentTime = 0;
    a.play().catch(() => {});
  }, []);

  const announce = useCallback((opts) => {
    clearTimeout(announceTimerRef.current);
    setAnnouncement({ ...opts, key: Date.now() });
    announceTimerRef.current = setTimeout(() => setAnnouncement(null), 2800);
  }, []);

  const gs = gameState?.game_state || {};
  const discardTop    = gs.discard_top || null;
  const currentSuit   = gs.current_suit || (discardTop && discardTop !== 'W' ? discardTop.slice(-1) : null);
  const drawPileCount = gs.draw_pile_count ?? 0;
  const handCounts    = gs.hand_counts || {};
  const pendingPick   = gs.pending_pick ?? 0;

  const currentTurn   = gameState?.current_turn ?? 0;
  const currentPlayer = players[currentTurn];
  const isMyTurn  = currentPlayer?.user_id === currentUserId;
  const isPlayer  = players.some(p => p.user_id === currentUserId);
  const winner    = gameState?.winner_id ? players.find(p => p.user_id === gameState.winner_id) : null;
  const isOver    = ['finished', 'forfeited', 'completed'].includes(gameState?.status);

  const hand = myHand || [];

  const canPlay = (card) => {
    if (!discardTop) return true;
    if (card === 'W') return true;
    const { num, suit } = parseCard(card);
    if (pendingPick > 0) return num === '2' || num === '5';
    const topNum = discardTop === 'W' ? '' : discardTop.slice(0, -1);
    return suit === currentSuit || (topNum && num === topNum);
  };

  // True when it's genuinely my turn and none of my cards are playable — covers both
  // the ordinary "nothing matches" case and being stuck under a pending pick-2/pick-3
  // with no 2/5 to counter it, since canPlay already handles both via the same logic
  // the server enforces in whotCardPlayable.
  const noPlayableCard = isMyTurn && !isOver && hand.length > 0 && !hand.some(canPlay);

  // One-time announcement on the false→true transition only — not on every render
  // while the state holds, same pattern as the Pick-2/Hold-On/Last-Card announcements
  // above. Resets when the condition clears so it can fire again on a later turn.
  const prevNoPlayableRef = useRef(false);
  useEffect(() => {
    if (noPlayableCard && !prevNoPlayableRef.current) {
      announce({ icon: '🚫', text: 'NO PLAYABLE CARD', sub: 'Draw from the pile to continue',
        bg: 'linear-gradient(135deg,#c2410c,#7c2d12)' });
    }
    prevNoPlayableRef.current = noPlayableCard;
  }, [noPlayableCard, announce]);

  // Special card events — sound + on-screen announcement
  useEffect(() => {
    if (!discardTop) return;
    if (firstDiscardRef.current) {
      firstDiscardRef.current = false;
      prevDiscardRef.current  = discardTop;
      return;
    }
    if (discardTop === prevDiscardRef.current) return;
    prevDiscardRef.current = discardTop;

    const num = discardTop === 'W' ? 'W' : discardTop.slice(0, -1);

    if (num === 'W') {
      playSound('whot');
      announce({ icon: '🃏', text: 'WHOT!', sub: 'Suit has been changed',
        bg: 'linear-gradient(135deg,#4f46e5 0%,#7c3aed 50%,#1e1b4b 100%)' });
    } else if (num === '2') {
      playSound('pick2');
      announce({ icon: '⚡', text: `PICK ${Math.max(2, pendingPick)}!`,
        sub: pendingPick > 2 ? `Stack or draw all ${pendingPick} cards!` : 'Counter or draw 2!',
        bg: 'linear-gradient(135deg,#dc2626,#7f1d1d)' });
    } else if (num === '5') {
      playSound('pick3');
      const total = pendingPick > 0 ? pendingPick : 3;
      announce({ icon: total > 5 ? '💣' : '⚡', text: `PICK ${total}!`,
        sub: total > 3 ? `Stack or draw all ${total} cards!` : 'Counter or draw 3!',
        bg: total > 5 ? 'linear-gradient(135deg,#7f1d1d,#450a0a)' : 'linear-gradient(135deg,#b91c1c,#7f1d1d)' });
    } else if (num === '14') {
      playSound('general_market');
      announce({ icon: '🌍', text: 'GENERAL MARKET!', sub: 'Everyone draws a card',
        bg: 'linear-gradient(135deg,#15803d,#14532d)' });
    } else if (num === '1' || num === '8') {
      playSound('hold_on');
      announce({ icon: '✋', text: 'HOLD ON!', sub: 'Next player is suspended',
        bg: 'linear-gradient(135deg,#d97706,#92400e)' });
    }
  }, [discardTop, pendingPick, playSound, announce]);

  // "Last Card!" when any player drops to exactly 1 card
  useEffect(() => {
    const prev = prevHandCountsRef.current;
    Object.entries(handCounts).forEach(([uid, rawCount]) => {
      const count = Number(rawCount);
      const prevCount = Number(prev[uid] ?? 99);
      if (count === 1 && prevCount > 1) {
        playSound('last_card');
        const player = players.find(p => String(p.user_id) === String(uid));
        announce({ icon: '🎯', text: 'LAST CARD!',
          sub: player ? `${player.username} has 1 card left!` : 'One card left!',
          bg: 'linear-gradient(135deg,#7c3aed,#2e1065)' });
      }
    });
    prevHandCountsRef.current = handCounts;
  }, [handCounts, players, playSound, announce]);

  // "Checkup!" when the game ends with a winner
  useEffect(() => {
    if (!isOver || !winner || prevIsOverRef.current) return;
    prevIsOverRef.current = true;
    playSound('checkup');
    announce({ icon: '🏆', text: 'CHECKUP!', sub: `${winner.username} wins!`,
      bg: 'linear-gradient(135deg,#ca8a04,#78350f)' });
  }, [isOver, winner, playSound, announce]);

  const handleCardClick = (card) => {
    if (!isMyTurn || isOver) return;
    if (card === 'W') {
      setPendingWild(card);
      setSelectedCard(null);
      return;
    }
    if (!canPlay(card)) return;
    onMove({ move_type: 'play', card });
    setSelectedCard(null);
  };

  const chooseSuit = (suit) => {
    if (!pendingWild) return;
    onMove({ move_type: 'play', card: pendingWild, next_suit: suit });
    setPendingWild(null);
  };

  const handleDraw = () => {
    if (!isMyTurn || isOver) return;
    onMove({ move_type: 'draw' });
  };

  const handleForfeit = () => {
    if (winner || isOver) { onClose(); return; }
    (onEndGame || onClose)();
  };

  const opponents = players.filter(p => p.user_id !== currentUserId);

  return (
    <>
      <style>{`
        @keyframes bannerIn {
          0%   { opacity:0; transform:scale(0.88); }
          100% { opacity:1; transform:scale(1); }
        }
        @keyframes trophySpin {
          0%   { transform:rotate(-15deg) scale(1); }
          50%  { transform:rotate(15deg)  scale(1.15); }
          100% { transform:rotate(-15deg) scale(1); }
        }
        @keyframes confettiFall {
          0%   { transform:translateY(-20px) rotate(0deg);   opacity:1; }
          100% { transform:translateY(120px) rotate(720deg); opacity:0; }
        }
        @keyframes announceIn {
          0%   { opacity:0; transform:translate(-50%,-50%) scale(0.35) rotate(-8deg); }
          18%  { opacity:1; transform:translate(-50%,-50%) scale(1.12) rotate(2deg); }
          28%  { transform:translate(-50%,-50%) scale(0.96) rotate(-0.5deg); }
          55%  { opacity:1; transform:translate(-50%,-50%) scale(1) rotate(0deg); }
          78%  { opacity:1; transform:translate(-50%,-50%) scale(1); }
          92%  { opacity:0; transform:translate(-50%,-50%) scale(0.9); }
          100% { opacity:0; transform:translate(-50%,-50%) scale(0.75); }
        }
      `}</style>

    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="relative w-full max-w-2xl sm:max-w-3xl lg:max-w-5xl mx-auto rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ background: 'linear-gradient(160deg,#052e16 0%,#064e3b 60%,#052e16 100%)', minHeight: 'min(90vh, 640px)' }}>

        {/* Felt texture overlay */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,0.015) 0px,rgba(255,255,255,0.015) 1px,transparent 1px,transparent 8px)', zIndex:0 }}/>

        {/* ── Header ── */}
        <div className="relative z-10 flex items-center justify-between px-5 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center shadow">
              <span className="text-black font-black text-sm">W!</span>
            </div>
            <div>
              <h2 className="text-white font-bold text-lg leading-none">Whot!</h2>
              <p className="text-green-300/70 text-[11px]">{players.map(p => p.username).join(' · ')}</p>
            </div>
          </div>
          <button onClick={handleForfeit} className="text-white/50 hover:text-white p-1 transition-colors">
            <X className="w-5 h-5"/>
          </button>
        </div>

        {/* ── Opponents ── */}
        <div className="relative z-10 flex items-center justify-center gap-4 px-4 py-3 flex-wrap">
          {opponents.map(p => {
            const count   = handCounts[String(p.user_id)] ?? 0;
            const isActive = currentPlayer?.user_id === p.user_id;
            return (
              <div key={p.user_id}
                className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl transition-all ${isActive ? 'ring-2 ring-yellow-400 bg-white/10' : 'bg-white/5'}`}>
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center text-white text-[9px] font-bold">
                    {p.username?.[0]?.toUpperCase()}
                  </div>
                  <span className="text-white/90 text-sm font-medium">{p.username}</span>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse"/>}
                </div>
                {/* Fanned face-down cards */}
                <div className="flex" style={{ gap: -18 }}>
                  {Array.from({ length: Math.min(count, 7) }).map((_, i) => (
                    <div key={i} style={{ marginLeft: i === 0 ? 0 : -20, zIndex: i }}>
                      <WhotCard faceDown size="sm"/>
                    </div>
                  ))}
                  {count > 7 && <span className="text-white/60 text-xs ml-1 self-center">+{count - 7}</span>}
                </div>
                <span className="text-white/50 text-[10px]">{count} card{count !== 1 ? 's' : ''}</span>
              </div>
            );
          })}
        </div>

        {/* ── Table center ── */}
        <div className="relative z-10 flex items-center justify-center gap-10 py-4">

          {/* Draw pile */}
          <div className="flex flex-col items-center gap-2">
            <button onClick={handleDraw} disabled={!isMyTurn || isOver}
              className={`rounded-lg transition-transform ${isMyTurn && !isOver ? 'hover:-translate-y-1 active:scale-95 cursor-pointer' : 'cursor-default'} ${noPlayableCard ? 'animate-pulse' : ''}`}
              style={{
                filter: noPlayableCard
                  ? 'drop-shadow(0 0 10px rgba(251,146,60,0.9)) drop-shadow(0 4px 10px rgba(0,0,0,0.6))'
                  : 'drop-shadow(0 4px 10px rgba(0,0,0,0.6))',
                outline: noPlayableCard ? '2.5px solid rgba(251,146,60,0.85)' : 'none',
                outlineOffset: 3,
                borderRadius: 8,
              }}>
              <CardBack width={64} height={92}/>
            </button>
            <span className="text-white/60 text-xs font-medium">{drawPileCount} left</span>
            {isMyTurn && !isOver && (
              noPlayableCard
                ? <span className="text-orange-400 text-[11px] font-bold animate-pulse">No card — Draw!</span>
                : <span className="text-green-400 text-[10px] font-semibold animate-pulse">Draw</span>
            )}
          </div>

          {/* Discard pile */}
          <div className="flex flex-col items-center gap-2">
            <div style={{ filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.7))' }}>
              {discardTop ? (
                <CardFace card={discardTop} width={64} height={92}/>
              ) : (
                <div style={{ width:64, height:92, borderRadius:6, border:'2px dashed rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <span className="text-white/30 text-xs">Empty</span>
                </div>
              )}
            </div>
            {currentSuit && (
              <div className="flex items-center gap-1">
                <SuitShape suit={currentSuit} size={13} color={SUIT_HEX[currentSuit]}/>
                <span className="text-white/70 text-[10px]">{SUIT_NAMES[currentSuit]}</span>
              </div>
            )}
            {pendingPick > 0 && (
              <span className="text-red-400 text-xs font-bold animate-pulse">+{pendingPick} to pick!</span>
            )}
          </div>
        </div>

        {/* ── Turn banner ── */}
        <div className="relative z-10 text-center pb-1">
          {isOver ? (
            <p className="text-lg font-bold text-white">
              {winner ? `🏆 ${winner.username} wins!` : "🤝 It's a draw!"}
            </p>
          ) : (
            <p className={`text-sm font-semibold ${isMyTurn ? (noPlayableCard ? 'text-orange-300 animate-pulse' : 'text-yellow-300') : 'text-white/50'}`}>
              {isMyTurn
                ? (noPlayableCard ? '🚫 No playable card — draw from the pile!' : '✦ Your turn')
                : `${currentPlayer?.username}'s turn…`}
            </p>
          )}
        </div>

        {/* ── Player's hand ── */}
        {isPlayer && (
          <div className="relative z-10 px-3 pb-4">
            <div className="rounded-xl p-3" style={{ background:'rgba(0,0,0,0.25)' }}>
              {hand.length === 0 ? (
                <p className="text-center text-green-300/70 text-sm py-2">No cards — you've won!</p>
              ) : (
                <div className="flex items-end justify-center flex-wrap gap-1.5">
                  {hand.map((card, i) => {
                    const playable = isMyTurn && !isOver && canPlay(card);
                    return (
                      <WhotCard
                        key={`${card}-${i}`}
                        card={card}
                        size="sm"
                        dimmed={isMyTurn && !isOver && !canPlay(card)}
                        playable={playable}
                        selected={selectedCard === `${card}-${i}`}
                        onClick={isMyTurn && !isOver ? () => handleCardClick(card) : undefined}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        {!isOver && (
          <div className="relative z-10 flex justify-end px-5 pb-4">
            <button onClick={handleForfeit}
              className="px-4 py-1.5 rounded-lg bg-red-700/80 hover:bg-red-600 text-white text-sm font-semibold transition-colors">
              Forfeit
            </button>
          </div>
        )}

        {/* ── Event announcement overlay (Pick 2/3, General Market, Hold On, Whot!, Last Card, Checkup) ── */}
        {announcement && (
          <div
            key={announcement.key}
            style={{
              position: 'absolute', top: '40%', left: '50%',
              zIndex: 60, pointerEvents: 'none',
              animation: 'announceIn 2.8s cubic-bezier(0.34,1.56,0.64,1) forwards',
            }}
          >
            <div style={{
              background: announcement.bg,
              borderRadius: 20,
              padding: '16px 30px',
              textAlign: 'center',
              boxShadow: '0 0 56px rgba(0,0,0,0.7), 0 12px 40px rgba(0,0,0,0.5)',
              border: '1.5px solid rgba(255,255,255,0.2)',
              minWidth: 190, maxWidth: 290,
            }}>
              <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 8 }}>{announcement.icon}</div>
              <div style={{
                color: '#fff', fontSize: 26, fontWeight: 900,
                letterSpacing: 0.5, textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                lineHeight: 1.1,
              }}>{announcement.text}</div>
              {announcement.sub && (
                <div style={{
                  color: 'rgba(255,255,255,0.8)', fontSize: 12,
                  marginTop: 6, fontWeight: 600, letterSpacing: 0.2,
                }}>{announcement.sub}</div>
              )}
            </div>
          </div>
        )}

        {/* ── Wild suit picker overlay ── */}
        {pendingWild && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl"
            style={{ background:'rgba(0,0,0,0.88)', backdropFilter:'blur(4px)' }}>
            <div className="bg-gray-900 rounded-2xl p-6 flex flex-col items-center gap-4 shadow-2xl border border-white/10">
              <p className="text-white font-bold text-base">Choose a suit (Whot!)</p>
              <div className="flex gap-3">
                {SUIT_ORDER.map(suit => (
                  <button key={suit} onClick={() => chooseSuit(suit)}
                    className="flex flex-col items-center gap-2 w-16 h-20 rounded-xl justify-center transition-all hover:scale-105 active:scale-95"
                    style={{ background: `${SUIT_HEX[suit]}22`, border: `2px solid ${SUIT_HEX[suit]}66` }}>
                    <SuitShape suit={suit} size={32} color={SUIT_HEX[suit]}/>
                    <span className="text-xs font-semibold" style={{ color: SUIT_HEX[suit] }}>{SUIT_NAMES[suit]}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setPendingWild(null)}
                className="text-white/40 hover:text-white/70 text-sm transition-colors mt-1">Cancel</button>
            </div>
          </div>
        )}

        {/* ── Winner banner overlay ── */}
        {isOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl"
            style={{ background:'rgba(0,0,0,0.82)', backdropFilter:'blur(6px)' }}>

            {/* Confetti */}
            {[...Array(16)].map((_, i) => {
              const colors = ['#ef4444','#3b82f6','#22c55e','#eab308','#a855f7','#f97316'];
              const left  = 10 + (i * 5.5) % 82;
              const delay = (i * 0.18) % 1.6;
              const dur   = 1.4 + (i % 4) * 0.25;
              const size  = 6 + (i % 4) * 3;
              return (
                <div key={i} style={{
                  position:'absolute', left:`${left}%`, top:'-10px',
                  width:size, height:size,
                  borderRadius: i % 3 === 0 ? '2px' : '50%',
                  background: colors[i % colors.length],
                  animation:`confettiFall ${dur}s ${delay}s ease-in infinite`,
                  pointerEvents:'none',
                }}/>
              );
            })}

            <div className="relative flex flex-col items-center gap-4 px-8 py-8 rounded-2xl mx-6 text-center"
              style={{
                background:'linear-gradient(135deg,#1e1b4b 0%,#1e3a8a 100%)',
                border:'2px solid #6d28d9',
                boxShadow:'0 0 40px rgba(109,40,217,0.5), 0 20px 60px rgba(0,0,0,0.7)',
                animation:'bannerIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
                minWidth:240, maxWidth:320,
              }}>

              {winner ? (
                <>
                  <div style={{ fontSize:60, lineHeight:1, animation:'trophySpin 2s ease-in-out infinite' }}>🏆</div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-14 h-14 rounded-full overflow-hidden"
                      style={{ boxShadow:'0 0 0 4px #16a34a' }}>
                      {winner.avatar ? (
                        <img src={winner.avatar} alt={winner.username} className="w-full h-full object-cover"/>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl font-bold text-white"
                          style={{ background:'#16a34a' }}>
                          {winner.username?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-white/60 text-xs uppercase tracking-widest mb-0.5">Winner</p>
                      <p className="text-white text-xl font-black">{winner.username}</p>
                      {gameState?.status === 'forfeited' && (
                        <p className="text-purple-300 text-xs mt-0.5">by forfeit</p>
                      )}
                    </div>
                    <div className="px-3 py-0.5 rounded-full text-xs font-bold text-black"
                      style={{ background:'#fbbf24' }}>
                      W! Whot Champion
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize:52, lineHeight:1 }}>🤝</div>
                  <div>
                    <p className="text-white text-xl font-black">It's a Draw!</p>
                    <p className="text-purple-300 text-sm mt-1">Well played by all</p>
                  </div>
                </>
              )}

              <button
                onClick={onClose}
                className="mt-2 w-full py-3 rounded-xl text-white font-bold text-sm transition-all active:scale-95"
                style={{
                  background:'linear-gradient(135deg,#7c3aed,#4f46e5)',
                  boxShadow:'0 4px 14px rgba(124,58,237,0.5)',
                }}>
                Close Game
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
    </>
  );
}
