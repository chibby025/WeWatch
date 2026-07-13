// src/components/Games/WhotGame.jsx
import { useState } from 'react';
import { X } from 'lucide-react';

// ── Suit data ─────────────────────────────────────────────────────────────────
const SUIT_HEX   = { C: '#2563eb', T: '#16a34a', X: '#dc2626', Q: '#d97706', S: '#7c3aed' };
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
      {/* Card body */}
      <rect x="0" y="0" width="64" height="92" rx="6" fill="#fff"/>
      <rect x="1" y="1" width="62" height="90" rx="5.5" fill="none" stroke="#e5e7eb" strokeWidth="1"/>
      {/* Rainbow gradient border */}
      <rect x="2" y="2" width="60" height="88" rx="5" fill="none"
        stroke="url(#wildgrd)" strokeWidth="2"/>
      <defs>
        <linearGradient id="wildgrd" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#2563eb"/>
          <stop offset="25%"  stopColor="#16a34a"/>
          <stop offset="50%"  stopColor="#dc2626"/>
          <stop offset="75%"  stopColor="#d97706"/>
          <stop offset="100%" stopColor="#7c3aed"/>
        </linearGradient>
      </defs>
      {/* "20" in corners */}
      <text x="5" y="14" fontSize="9" fontWeight="800" fontFamily="sans-serif" fill="#1f2937">20</text>
      <text x="59" y="82" fontSize="9" fontWeight="800" fontFamily="sans-serif" fill="#1f2937"
        textAnchor="end" transform="rotate(180,59,82)">20</text>
      {/* 5 mini suits arranged around center */}
      {[
        { suit:'C', x:18, y:22 },
        { suit:'T', x:46, y:22 },
        { suit:'X', x:32, y:46 },
        { suit:'Q', x:18, y:66 },
        { suit:'S', x:46, y:66 },
      ].map(({ suit, x, y }) => (
        <g key={suit} transform={`translate(${x - 9},${y - 9})`}>
          <SuitShape suit={suit} size={18} />
        </g>
      ))}
      {/* WHOT! label */}
      <text x="32" y="47" textAnchor="middle" fontSize="7" fontWeight="900"
        fontFamily="sans-serif" fill="#1f2937" letterSpacing="1">WHOT!</text>
    </svg>
  );
}

// ── Main card face ─────────────────────────────────────────────────────────────
function CardFace({ card, width = 64, height = 92 }) {
  const { num, suit } = parseCard(card);
  const isWild = num === '20' || card === 'W';
  if (isWild) return <WildFace width={width} height={height}/>;

  const color = SUIT_HEX[suit] || '#888';
  const special = SPECIAL_LABELS[num];
  const bigNum = num.length > 2 ? '14' : num; // clamp display

  return (
    <svg width={width} height={height} viewBox="0 0 64 92" style={{ display:'block' }}>
      {/* Card body */}
      <rect x="0" y="0" width="64" height="92" rx="6" fill="#fff"/>
      <rect x="1" y="1" width="62" height="90" rx="5.5" fill="none" stroke="#e5e7eb" strokeWidth="1"/>
      <rect x="3" y="3" width="58" height="86" rx="4.5" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.4"/>

      {/* Top-left corner: number + tiny suit */}
      <text x="5" y="14" fontSize="10" fontWeight="800" fontFamily="sans-serif" fill={color}>{bigNum}</text>
      <g transform="translate(4,15)"><SuitShapeTiny suit={suit} size={11} color={color}/></g>

      {/* Bottom-right corner (rotated 180°) */}
      <g transform="rotate(180,32,46)">
        <text x="5" y="14" fontSize="10" fontWeight="800" fontFamily="sans-serif" fill={color}>{bigNum}</text>
        <g transform="translate(4,15)"><SuitShapeTiny suit={suit} size={11} color={color}/></g>
      </g>

      {/* Center suit shape */}
      <g transform="translate(18,28)"><SuitShape suit={suit} size={28} color={color}/></g>

      {/* Special label */}
      {special && (
        <text x="32" y="83" textAnchor="middle" fontSize="6.5" fontWeight="700"
          fontFamily="sans-serif" fill={color} letterSpacing="0.3">{special.toUpperCase()}</text>
      )}
    </svg>
  );
}

// ── WhotCard wrapper ──────────────────────────────────────────────────────────
function WhotCard({ card, faceDown, onClick, dimmed, selected, size = 'sm' }) {
  const dims = size === 'lg' ? { w: 72, h: 104 } : { w: 56, h: 80 };

  const inner = faceDown
    ? <CardBack width={dims.w} height={dims.h}/>
    : <CardFace card={card} width={dims.w} height={dims.h}/>;

  const isClickable = !!onClick && !dimmed;

  return (
    <div
      onClick={isClickable ? onClick : undefined}
      style={{
        width: dims.w, height: dims.h,
        borderRadius: 6,
        display: 'inline-block',
        flexShrink: 0,
        opacity: dimmed ? 0.35 : 1,
        outline: selected ? '2.5px solid #fff' : 'none',
        outlineOffset: 2,
        transform: selected ? 'translateY(-8px)' : undefined,
        cursor: isClickable ? 'pointer' : 'default',
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.45))',
        transition: 'transform 0.15s, opacity 0.15s',
      }}
      onMouseEnter={e => { if (isClickable) e.currentTarget.style.transform = 'translateY(-6px)'; }}
      onMouseLeave={e => { if (isClickable && !selected) e.currentTarget.style.transform = ''; }}
    >
      {inner}
    </div>
  );
}

// ── Game component ────────────────────────────────────────────────────────────
export default function WhotGame({ gameState, players = [], currentUserId, myHand, onMove, onClose, onEndGame }) {
  const [pendingWild, setPendingWild]   = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);

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
      `}</style>

    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl mx-3 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ background: 'linear-gradient(160deg,#052e16 0%,#064e3b 60%,#052e16 100%)', minHeight: 520 }}>

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
              className={`rounded-lg transition-transform ${isMyTurn && !isOver ? 'hover:-translate-y-1 active:scale-95 cursor-pointer' : 'cursor-default'}`}
              style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.6))' }}>
              <CardBack width={64} height={92}/>
            </button>
            <span className="text-white/60 text-xs font-medium">{drawPileCount} left</span>
            {isMyTurn && !isOver && (
              <span className="text-green-400 text-[10px] font-semibold animate-pulse">Draw</span>
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
            <p className={`text-sm font-semibold ${isMyTurn ? 'text-yellow-300' : 'text-white/50'}`}>
              {isMyTurn ? '✦ Your turn' : `${currentPlayer?.username}'s turn…`}
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
