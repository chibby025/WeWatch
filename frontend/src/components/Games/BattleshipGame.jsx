// src/components/Games/BattleshipGame.jsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// ── Constants ──────────────────────────────────────────────────────────────────
const FLEET = [
  { name: 'carrier',    label: 'Carrier',    size: 5 },
  { name: 'battleship', label: 'Battleship', size: 4 },
  { name: 'cruiser',    label: 'Cruiser',    size: 3 },
  { name: 'submarine',  label: 'Submarine',  size: 3 },
  { name: 'destroyer',  label: 'Destroyer',  size: 2 },
];

const SHIP_STYLES = {
  carrier:    { hull: '#3b0764', deck: '#6d28d9', accent: '#a78bfa' },
  battleship: { hull: '#1e3a8a', deck: '#1d4ed8', accent: '#93c5fd' },
  cruiser:    { hull: '#0d4444', deck: '#0f766e', accent: '#5eead4' },
  submarine:  { hull: '#14532d', deck: '#16a34a', accent: '#86efac' },
  destroyer:  { hull: '#78350f', deck: '#b45309', accent: '#fcd34d' },
};

const SHIP_LIST_COLORS = {
  carrier: 'bg-violet-700', battleship: 'bg-blue-700',
  cruiser: 'bg-teal-700',   submarine:  'bg-green-700', destroyer: 'bg-amber-700',
};

const COL_LABELS = ['A','B','C','D','E','F','G','H','I','J'];
const ROW_LABELS = ['1','2','3','4','5','6','7','8','9','10'];
const GRID_SIZE  = 10;
const CELL_PX    = 28;

const idx = (r, c) => r * GRID_SIZE + c;

// ── Animation CSS (injected once) ─────────────────────────────────────────────
const BS_CSS = `
@keyframes bs-explode {
  0%   { transform: scale(0.15) rotate(0deg);   opacity: 1; }
  55%  { transform: scale(1.7)  rotate(15deg);  opacity: 0.85; }
  100% { transform: scale(2.4)  rotate(25deg);  opacity: 0; }
}
@keyframes bs-ring {
  0%   { transform: scale(0.2); opacity: 0.95; }
  100% { transform: scale(3.2); opacity: 0; }
}
@keyframes bs-fire {
  0%   { transform: scale(1)    translateY(0px);   opacity: 0.85; }
  33%  { transform: scale(1.18) translateY(-2px);  opacity: 1; }
  66%  { transform: scale(0.92) translateY(1px);   opacity: 0.9; }
  100% { transform: scale(1)    translateY(0px);   opacity: 0.85; }
}
@keyframes bs-splash {
  0%   { transform: scale(0.3); opacity: 0.9; }
  100% { transform: scale(2.2); opacity: 0; }
}
@keyframes bs-spark {
  0%   { transform: translate(0, 0) scale(1);    opacity: 1; }
  100% { transform: translate(var(--tx), var(--ty)) scale(0); opacity: 0; }
}
`;
let bsCssInjected = false;
function ensureBSCSS() {
  if (bsCssInjected) return;
  const el = document.createElement('style');
  el.textContent = BS_CSS;
  document.head.appendChild(el);
  bsCssInjected = true;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function shipCells(r, c, size, horizontal) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    const nr = horizontal ? r     : r + i;
    const nc = horizontal ? c + i : c;
    if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) return null;
    cells.push({ r: nr, c: nc });
  }
  return cells;
}

function buildOccupancyMap(ships) {
  const map = {};
  for (const s of ships) {
    const n = s.cells.length;
    const horiz = n <= 1 || s.cells[0].r === s.cells[1]?.r;
    s.cells.forEach(({ r, c }, i) => {
      map[idx(r, c)] = {
        name: s.name,
        position: i === 0 ? 'stern' : i === n - 1 ? 'bow' : 'middle',
        horizontal: horiz,
      };
    });
  }
  return map;
}

function computeSunkCells(ships, board) {
  const sunk = new Set();
  if (!ships?.length || !board?.length) return sunk;
  for (const ship of ships) {
    if (ship.cells.every(({ r, c }) => board[idx(r, c)] === 'hit')) {
      ship.cells.forEach(({ r, c }) => sunk.add(idx(r, c)));
    }
  }
  return sunk;
}

// ── Top-down ship section SVG ─────────────────────────────────────────────────
// All shapes are designed for horizontal orientation (bow pointing RIGHT).
// Vertical ships apply rotate(90deg) via CSS; the centered 28×28 viewBox means
// the hull strip (y 10–18) maps cleanly to x 10–18 after rotation — still centered.
function ShipSectionSVG({ name, position, horizontal, damaged, sunk }) {
  const s = SHIP_STYLES[name] || SHIP_STYLES.carrier;
  const isSub = name === 'submarine';

  const rotStyle = horizontal ? {} : {
    transform: 'rotate(90deg)',
    transformOrigin: `${CELL_PX / 2}px ${CELL_PX / 2}px`,
  };
  const opacity = sunk ? 0.38 : 1;

  return (
    <svg
      width={CELL_PX} height={CELL_PX}
      viewBox="0 0 28 28"
      style={{ position: 'absolute', inset: 0, opacity, pointerEvents: 'none', ...rotStyle }}
    >
      {/* ── Stern (left end, bow points RIGHT) ── */}
      {position === 'stern' && !isSub && (
        <>
          {/* hull body */}
          <rect x="4" y="10" width="24" height="8" fill={s.deck} />
          {/* stern plate */}
          <rect x="3" y="10" width="3.5" height="8" rx="1.5" fill={s.hull} />
          {/* engine vents */}
          <circle cx="4" cy="12.5" r="1.2" fill={s.accent} opacity="0.95" />
          <circle cx="4" cy="15.5" r="1.2" fill={s.accent} opacity="0.95" />
          {/* deck edge highlights */}
          <line x1="3" y1="10" x2="28" y2="10" stroke={s.accent} strokeWidth="0.8" opacity="0.4" />
          <line x1="3" y1="18" x2="28" y2="18" stroke={s.accent} strokeWidth="0.8" opacity="0.4" />
        </>
      )}

      {position === 'stern' && isSub && (
        <>
          {/* submarine oval hull — stern (left) */}
          <rect x="8" y="10.5" width="20" height="7" fill={s.deck} />
          <ellipse cx="8" cy="14" rx="5.5" ry="3.5" fill={s.deck} />
          {/* propeller hint */}
          <circle cx="5" cy="14" r="2" fill={s.hull} opacity="0.8" />
          <line x1="5" y1="11.5" x2="5" y2="16.5" stroke={s.accent} strokeWidth="1" opacity="0.7" />
          <line x1="2.5" y1="14" x2="7.5" y2="14" stroke={s.accent} strokeWidth="1" opacity="0.7" />
        </>
      )}

      {/* ── Middle sections ── */}
      {position === 'middle' && name === 'carrier' && (
        <>
          <rect x="0" y="10" width="28" height="8" fill={s.deck} />
          {/* flight deck edge stripe */}
          <line x1="0" y1="10.8" x2="28" y2="10.8" stroke={s.accent} strokeWidth="1.4" opacity="0.55" />
          {/* island superstructure */}
          <rect x="6" y="10" width="9" height="4.5" rx="0.8" fill={s.hull} opacity="0.95" />
          <rect x="9" y="8.5" width="3.5" height="2" rx="0.5" fill={s.accent} opacity="0.7" />
          <line x1="0" y1="18" x2="28" y2="18" stroke={s.accent} strokeWidth="0.7" opacity="0.35" />
        </>
      )}

      {position === 'middle' && name === 'battleship' && (
        <>
          <rect x="0" y="10" width="28" height="8" fill={s.deck} />
          {/* gun turret */}
          <circle cx="14" cy="14" r="3.2" fill={s.hull} />
          <circle cx="14" cy="14" r="1.8" fill={s.accent} opacity="0.85" />
          {/* barrels */}
          <line x1="14" y1="11" x2="11" y2="6.5" stroke={s.accent} strokeWidth="1.4" opacity="0.8" />
          <line x1="14" y1="11" x2="17" y2="6.5" stroke={s.accent} strokeWidth="1.4" opacity="0.8" />
          <line x1="0"  y1="10" x2="28" y2="10" stroke={s.accent} strokeWidth="0.7" opacity="0.3" />
          <line x1="0"  y1="18" x2="28" y2="18" stroke={s.accent} strokeWidth="0.7" opacity="0.3" />
        </>
      )}

      {position === 'middle' && name === 'cruiser' && (
        <>
          <rect x="0" y="10" width="28" height="8" fill={s.deck} />
          {/* bridge structure */}
          <rect x="8" y="9.5" width="12" height="5" rx="1.2" fill={s.hull} opacity="0.92" />
          <rect x="11" y="8" width="6" height="2.5" rx="0.6" fill={s.accent} opacity="0.75" />
          <line x1="0" y1="10" x2="28" y2="10" stroke={s.accent} strokeWidth="0.7" opacity="0.35" />
          <line x1="0" y1="18" x2="28" y2="18" stroke={s.accent} strokeWidth="0.7" opacity="0.35" />
        </>
      )}

      {position === 'middle' && name === 'submarine' && (
        <>
          {/* oval sub hull body */}
          <rect x="0" y="10.5" width="28" height="7" fill={s.deck} />
          {/* conning tower */}
          <rect x="9" y="8.5" width="10" height="6.5" rx="2" fill={s.hull} />
          <rect x="12" y="6.5" width="4" height="3" rx="0.8" fill={s.accent} opacity="0.8" />
        </>
      )}

      {position === 'middle' && name === 'destroyer' && (
        <>
          <rect x="0" y="11" width="28" height="6" fill={s.deck} />
          {/* single small gun mount */}
          <circle cx="14" cy="14" r="2.2" fill={s.hull} />
          <line x1="14" y1="12" x2="14" y2="7" stroke={s.accent} strokeWidth="1.3" opacity="0.75" />
          <line x1="0"  y1="11" x2="28" y2="11" stroke={s.accent} strokeWidth="0.7" opacity="0.4" />
          <line x1="0"  y1="17" x2="28" y2="17" stroke={s.accent} strokeWidth="0.7" opacity="0.4" />
        </>
      )}

      {/* ── Bow (right end, pointed) ── */}
      {position === 'bow' && !isSub && (
        <>
          <polygon points="0,10 21,10 27,14 21,18 0,18" fill={s.deck} />
          {/* bow tip highlight */}
          <polygon points="19,10 27,14 19,18" fill={s.accent} opacity="0.3" />
          {/* keel line */}
          <line x1="0" y1="10" x2="23" y2="10" stroke={s.accent} strokeWidth="0.8" opacity="0.35" />
          <line x1="0" y1="18" x2="23" y2="18" stroke={s.accent} strokeWidth="0.8" opacity="0.35" />
        </>
      )}

      {position === 'bow' && isSub && (
        <>
          <rect x="0" y="10.5" width="18" height="7" fill={s.deck} />
          <ellipse cx="18" cy="14" rx="9" ry="3.5" fill={s.deck} />
        </>
      )}

      {/* ── Sunk overlay (dark X) ── */}
      {sunk && (
        <>
          <line x1="6"  y1="9"  x2="22" y2="19" stroke="rgba(160,30,0,0.75)" strokeWidth="1.8" />
          <line x1="22" y1="9"  x2="6"  y2="19" stroke="rgba(160,30,0,0.75)" strokeWidth="1.8" />
        </>
      )}

      {/* ── Damage (static core, behind animated FireDamage in React) ── */}
      {damaged && !sunk && (
        <>
          <circle cx="14" cy="14" r="5.5" fill="rgba(200,40,0,0.55)" />
          <circle cx="14" cy="14" r="2.5" fill="rgba(255,130,0,0.8)" />
          <circle cx="14" cy="14" r="1.2" fill="rgba(255,230,60,1)" />
        </>
      )}
    </svg>
  );
}

// ── Explosion (plays briefly on hit/miss, then disappears) ────────────────────
function ExplosionEffect({ result }) {
  const isHit = result === 'hit';
  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ zIndex: 20 }}
    >
      {isHit ? (
        <>
          {/* blast core */}
          <div style={{
            position: 'absolute',
            width: '105%', height: '105%',
            background: 'radial-gradient(circle, rgba(255,255,180,0.95) 0%, #ff8c00 30%, #ff2200 65%, transparent 100%)',
            animation: 'bs-explode 0.65s cubic-bezier(0.22,1,0.36,1) forwards',
            borderRadius: '50%',
          }} />
          {/* shockwave ring */}
          <div style={{
            position: 'absolute',
            width: '88%', height: '88%',
            border: '2.5px solid rgba(255,140,0,0.9)',
            borderRadius: '50%',
            animation: 'bs-ring 0.6s ease-out forwards',
          }} />
          {/* sparks */}
          {[0, 60, 120, 180, 240, 300].map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const tx = `${Math.cos(rad) * 14}px`;
            const ty = `${Math.sin(rad) * 14}px`;
            return (
              <div key={deg} style={{
                position: 'absolute',
                width: 3, height: 3,
                background: '#ffd700',
                borderRadius: '50%',
                '--tx': tx, '--ty': ty,
                animation: 'bs-spark 0.45s ease-out forwards',
              }} />
            );
          })}
        </>
      ) : (
        <>
          {/* water splash ring */}
          <div style={{
            position: 'absolute',
            width: '75%', height: '75%',
            border: '2px solid rgba(120,210,255,0.9)',
            borderRadius: '50%',
            animation: 'bs-splash 0.5s ease-out forwards',
          }} />
          {/* inner splash */}
          <div style={{
            position: 'absolute',
            width: '38%', height: '38%',
            background: 'radial-gradient(circle, rgba(200,240,255,0.85) 0%, transparent 80%)',
            animation: 'bs-explode 0.4s ease-out forwards',
            borderRadius: '50%',
          }} />
        </>
      )}
    </div>
  );
}

// ── Continuous fire on damaged ship cells ─────────────────────────────────────
function FireDamage() {
  return (
    <div
      className="absolute inset-0 flex items-end justify-center pointer-events-none"
      style={{ zIndex: 10, paddingBottom: 2 }}
    >
      {/* outer flame */}
      <div style={{
        width: '55%', height: '70%',
        background: 'radial-gradient(ellipse at bottom, rgba(255,160,0,0.95) 0%, rgba(255,50,0,0.8) 55%, transparent 90%)',
        animation: 'bs-fire 0.85s ease-in-out infinite',
        borderRadius: '50% 50% 25% 25%',
        transformOrigin: 'bottom center',
      }} />
      {/* bright inner core */}
      <div style={{
        position: 'absolute',
        bottom: 5,
        left: '38%',
        width: '24%', height: '40%',
        background: 'radial-gradient(ellipse, rgba(255,240,100,0.98) 0%, rgba(255,160,0,0.6) 100%)',
        animation: 'bs-fire 0.6s ease-in-out infinite reverse',
        borderRadius: '50% 50% 20% 20%',
        transformOrigin: 'bottom center',
      }} />
    </div>
  );
}

// ── Grid cell wrapper ─────────────────────────────────────────────────────────
function Cell({ className = '', onClick, children }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      style={{ position: 'relative' }}
      className={`w-7 h-7 border border-slate-700/70 flex items-center justify-center text-[10px] leading-none transition-colors overflow-hidden ${className}`}
    >
      {children}
    </Tag>
  );
}

// ── Column labels ─────────────────────────────────────────────────────────────
function GridLabels() {
  return (
    <div className="flex">
      <div className="w-6 shrink-0" />
      {COL_LABELS.map(col => (
        <div key={col} className="w-7 text-center text-[10px] text-slate-500 select-none">{col}</div>
      ))}
    </div>
  );
}

// ── Placement grid ────────────────────────────────────────────────────────────
// previewOccupancy: same shape as occupancyMap but for hover preview cells.
function PlacementGrid({ occupancyMap, previewOccupancy, previewValid, onCellClick, onCellHover, onLeave }) {
  return (
    <div className="select-none" onMouseLeave={onLeave}>
      <GridLabels />
      {ROW_LABELS.map((rowLabel, r) => (
        <div key={r} className="flex">
          <div className="w-6 shrink-0 text-[10px] text-slate-500 flex items-center justify-center select-none">
            {rowLabel}
          </div>
          {COL_LABELS.map((_, c) => {
            const i           = idx(r, c);
            const shipData    = occupancyMap[i];
            const previewData = previewOccupancy?.[i];

            let cls = 'bg-slate-800 hover:bg-slate-700 cursor-pointer';
            if (shipData && !previewData) cls = 'bg-slate-950 cursor-pointer hover:brightness-110';
            if (previewData) cls = previewValid
              ? 'bg-cyan-950 cursor-pointer'
              : 'bg-red-950 cursor-pointer';

            return (
              <Cell
                key={c}
                className={cls}
                onClick={() => onCellClick(r, c)}
                onMouseEnter={() => onCellHover(r, c)}
              >
                {/* Placed ship section */}
                {shipData && !previewData && (
                  <ShipSectionSVG
                    name={shipData.name}
                    position={shipData.position}
                    horizontal={shipData.horizontal}
                    damaged={false}
                    sunk={false}
                  />
                )}
                {/* Preview ship section (valid = tinted, shown as ghost) */}
                {previewData && previewValid && (
                  <>
                    <ShipSectionSVG
                      name={previewData.name}
                      position={previewData.position}
                      horizontal={previewData.horizontal}
                      damaged={false}
                      sunk={false}
                    />
                    <div className="absolute inset-0 bg-cyan-400/25 pointer-events-none" />
                  </>
                )}
                {/* Invalid placement highlight */}
                {previewData && !previewValid && (
                  <div className="absolute inset-0 bg-red-500/35 pointer-events-none" />
                )}
              </Cell>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Combat grid ───────────────────────────────────────────────────────────────
// shipOccupancy: richer map (name, position, horizontal) — only provided for YOUR grid.
// explosions: Map<"${boardKey}-${cellIdx}", 'hit'|'miss'>
// sunkCells: Set<cellIdx> — cells belonging to fully sunk ships (your grid only)
function CombatGrid({ label, board, shipOccupancy, sunkCells, isEnemy, canAttack, onAttack, explosions, boardKey }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-xs font-semibold text-slate-300 mb-1 tracking-wide">{label}</div>
      <GridLabels />
      {ROW_LABELS.map((rowLabel, r) => (
        <div key={r} className="flex">
          <div className="w-6 shrink-0 text-[10px] text-slate-500 flex items-center justify-center select-none">
            {rowLabel}
          </div>
          {COL_LABELS.map((_, c) => {
            const i        = idx(r, c);
            const shot     = board ? (board[i] || '') : '';
            const shipData = shipOccupancy ? shipOccupancy[i] : null;
            const fired    = shot === 'hit' || shot === 'miss';
            const clickable = isEnemy && canAttack && !fired;
            const isSunk   = sunkCells ? sunkCells.has(i) : false;
            const damaged  = !isEnemy && shot === 'hit' && !!shipData && !isSunk;
            const explKey  = `${boardKey}-${i}`;
            const explResult = explosions?.get(explKey);
            const isExploding = !!explResult;

            let cls = 'bg-slate-900';
            if (clickable) cls += ' hover:bg-cyan-900/50 cursor-crosshair';
            if (isSunk && shot === 'hit') cls = 'bg-slate-950';

            return (
              <Cell
                key={c}
                className={cls}
                onClick={clickable ? () => onAttack(r, c) : undefined}
              >
                {/* Own ship (never shown on enemy grid) */}
                {shipData && !isEnemy && (
                  <ShipSectionSVG
                    name={shipData.name}
                    position={shipData.position}
                    horizontal={shipData.horizontal}
                    damaged={damaged}
                    sunk={isSunk}
                  />
                )}

                {/* Fire on own damaged (non-sunk) hit cells */}
                {damaged && !isExploding && <FireDamage />}

                {/* Explosion animation (brief, plays on every new shot) */}
                {isExploding && <ExplosionEffect result={explResult} />}

                {/* Miss marker — water splash dot (non-exploding state) */}
                {shot === 'miss' && !isExploding && (
                  <span
                    className="block rounded-full relative"
                    style={{
                      width: 6, height: 6, zIndex: 5,
                      background: 'radial-gradient(circle, #93c5fd 0%, #3b82f6 60%, #1d4ed8 100%)',
                      boxShadow: '0 0 3px rgba(147,197,253,0.6)',
                    }}
                  />
                )}

                {/* Enemy hit — burning X marker */}
                {shot === 'hit' && isEnemy && !isExploding && (
                  <span
                    className="relative font-black text-red-400 select-none"
                    style={{ fontSize: 13, zIndex: 5, textShadow: '0 0 6px #ef4444, 0 0 2px #fca5a5' }}
                  >
                    ✕
                  </span>
                )}
              </Cell>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function BattleshipGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  ensureBSCSS();

  const gs             = gameState?.game_state || {};
  const phase          = gs.phase || 'placement';
  const boards         = gs.boards || {};
  const shipsRemaining = gs.ships_remaining || {};
  const placed         = gs.placed || {};
  const combatTurnId   = gs.current_turn ?? null;

  const isHostUser = (gameState?.host_id ?? players?.[0]?.user_id) === currentUserId;
  const opponent   = (players || []).find(p => p.user_id !== currentUserId);

  const iHavePlaced  = !!placed[String(currentUserId)];
  const oppHasPlaced = opponent ? !!placed[String(opponent.user_id)] : false;
  const isMyTurn     = phase === 'combat' && Number(combatTurnId) === Number(currentUserId);
  const turnPlayer   = phase === 'combat'
    ? (players || []).find(p => Number(p.user_id) === Number(combatTurnId))
    : null;

  const isOver = phase === 'results'
    || gameState?.status === 'finished'
    || gameState?.status === 'completed'
    || gameState?.status === 'forfeited';

  const winner = isOver && gameState?.winner_id != null
    ? (players || []).find(p => p.user_id === gameState.winner_id)
    : null;

  // ── Placement state ──────────────────────────────────────────────────────
  const [placedShips, setPlacedShips]       = useState([]);
  const [selectedShip, setSelectedShip]     = useState(FLEET[0].name);
  const [horizontal, setHorizontal]         = useState(true);
  const [hoverCell, setHoverCell]           = useState(null);
  const [lockedOccupancy, setLockedOccupancy] = useState({});
  const [lockedShips, setLockedShips]       = useState([]); // for sunk detection

  const occupancyMap = useMemo(() => buildOccupancyMap(placedShips), [placedShips]);

  // Lock the occupancy + ship list when placement is submitted.
  useEffect(() => {
    if (iHavePlaced && Object.keys(lockedOccupancy).length === 0 && placedShips.length > 0) {
      setLockedOccupancy(buildOccupancyMap(placedShips));
      setLockedShips(placedShips);
    }
  }, [iHavePlaced]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentFleet = FLEET.find(f => f.name === selectedShip) || FLEET[0];
  const previewCells = hoverCell && !iHavePlaced
    ? shipCells(hoverCell.r, hoverCell.c, currentFleet.size, horizontal)
    : null;

  const previewValid = useMemo(() => {
    if (!previewCells) return false;
    const othersOccupied = new Set(
      placedShips
        .filter(s => s.name !== selectedShip)
        .flatMap(s => s.cells.map(({ r, c }) => idx(r, c)))
    );
    return previewCells.every(({ r, c }) => !othersOccupied.has(idx(r, c)));
  }, [previewCells, placedShips, selectedShip]);

  // Rich occupancy map for the hover preview (includes name, position, horizontal).
  const previewOccupancy = useMemo(() => {
    if (!previewCells) return null;
    const n     = previewCells.length;
    const horiz = n <= 1 || previewCells[0].r === previewCells[1]?.r;
    const map   = {};
    previewCells.forEach(({ r, c }, i) => {
      map[idx(r, c)] = {
        name:       selectedShip,
        position:   i === 0 ? 'stern' : i === n - 1 ? 'bow' : 'middle',
        horizontal: horiz,
      };
    });
    return map;
  }, [previewCells, selectedShip]);

  const handleCellHover = useCallback((r, c) => {
    if (iHavePlaced) return;
    setHoverCell({ r, c });
  }, [iHavePlaced]);
  const handleCellLeave = useCallback(() => setHoverCell(null), []);

  const handlePlaceCell = useCallback((r, c) => {
    if (iHavePlaced) return;
    const cells = shipCells(r, c, currentFleet.size, horizontal);
    if (!cells) return;
    const othersOccupied = new Set(
      placedShips
        .filter(s => s.name !== selectedShip)
        .flatMap(s => s.cells.map(({ r: pr, c: pc }) => idx(pr, pc)))
    );
    if (cells.some(({ r: nr, c: nc }) => othersOccupied.has(idx(nr, nc)))) return;
    const next = placedShips.filter(s => s.name !== selectedShip);
    next.push({ name: selectedShip, cells });
    setPlacedShips(next);
    const nextUnplaced = FLEET.find(f => !next.find(s => s.name === f.name));
    if (nextUnplaced) setSelectedShip(nextUnplaced.name);
  }, [iHavePlaced, currentFleet, horizontal, placedShips, selectedShip]);

  const allPlaced = FLEET.every(f => placedShips.find(s => s.name === f.name));

  const handleReady = useCallback(() => {
    if (!allPlaced) return;
    const occ = buildOccupancyMap(placedShips);
    setLockedOccupancy(occ);
    setLockedShips(placedShips);
    onMove({
      move_type: 'place',
      ships: placedShips.map(s => ({ name: s.name, cells: s.cells })),
    });
  }, [allPlaced, placedShips, onMove]);

  // ── Combat / attacks ─────────────────────────────────────────────────────
  const handleAttack = useCallback((r, c) => {
    if (!isMyTurn) return;
    const enemyBoard = boards[String(opponent?.user_id)] || [];
    const shot = enemyBoard[idx(r, c)];
    if (shot === 'hit' || shot === 'miss') return;
    onMove({ move_type: 'attack', r, c });
  }, [isMyTurn, boards, opponent, onMove]);

  // ── Sunk ship detection (your grid) ─────────────────────────────────────
  const myBoard   = boards[String(currentUserId)] || [];
  const mySunkCells = useMemo(
    () => computeSunkCells(lockedShips, myBoard),
    [lockedShips, myBoard],
  );

  // ── Explosion tracker ────────────────────────────────────────────────────
  // Map<"${ownerId}-${cellIdx}", 'hit'|'miss'>
  const [explosions, setExplosions] = useState(new Map());
  const knownShotsRef = useRef({}); // { [ownerId]: Set<cellIdx> }

  useEffect(() => {
    const newExp = new Map();
    for (const [ownerId, board] of Object.entries(boards)) {
      if (!Array.isArray(board)) continue;
      if (!knownShotsRef.current[ownerId]) knownShotsRef.current[ownerId] = new Set();
      const known = knownShotsRef.current[ownerId];
      board.forEach((cell, i) => {
        if ((cell === 'hit' || cell === 'miss') && !known.has(i)) {
          known.add(i);
          newExp.set(`${ownerId}-${i}`, cell);
        }
      });
    }
    if (newExp.size === 0) return;
    setExplosions(prev => new Map([...prev, ...newExp]));
    newExp.forEach((_, key) => {
      setTimeout(() => {
        setExplosions(prev => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      }, 700);
    });
  }, [boards]);

  const endOrLeave = () => {
    if (isHostUser && onEndGame) onEndGame();
    else if (onClose) onClose();
  };

  const myShipsLeft  = shipsRemaining[String(currentUserId)]  ?? FLEET.length;
  const oppShipsLeft = opponent ? (shipsRemaining[String(opponent.user_id)] ?? FLEET.length) : null;
  const myBoardKey   = String(currentUserId);
  const oppBoardKey  = String(opponent?.user_id ?? '');

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[60] bg-slate-950 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pl-20 pr-4 py-3 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-lg">Battleship 🚢</span>
          {phase === 'combat' && !isOver && (
            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
              isMyTurn ? 'bg-cyan-700 text-white' : 'bg-slate-700 text-slate-300'
            }`}>
              {isMyTurn ? '🎯 Your Turn' : `${turnPlayer?.username || 'Opponent'}'s Turn`}
            </span>
          )}
        </div>
        <button
          onClick={endOrLeave}
          title={isHostUser ? 'End game for everyone' : 'Leave game'}
          className="text-slate-400 hover:text-white hover:bg-slate-800 p-1.5 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Ships remaining bar */}
      {(phase !== 'placement' || isOver) && (
        <div className="shrink-0 flex items-center justify-center gap-8 px-4 py-1.5 bg-slate-900 border-b border-slate-800 text-xs text-slate-400">
          <span>
            <span className="text-cyan-400 font-semibold">You:</span>{' '}
            {myShipsLeft} ship{myShipsLeft !== 1 ? 's' : ''} left
          </span>
          {opponent && (
            <span>
              <span className="text-red-400 font-semibold">{opponent.username}:</span>{' '}
              {oppShipsLeft} ship{oppShipsLeft !== 1 ? 's' : ''} left
            </span>
          )}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-auto flex flex-col items-center justify-start sm:justify-center p-4 gap-4 min-h-0">

        {/* RESULTS / GAME OVER */}
        {isOver && (
          <div className="text-center mb-2">
            <div className="text-5xl mb-2">{winner ? '🏆' : '🤝'}</div>
            <h2 className="text-2xl font-bold text-white">
              {winner
                ? (winner.user_id === currentUserId ? 'You Win!' : `${winner.username} Wins!`)
                : 'Game Over'}
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              {winner ? 'All enemy ships sunk!' : 'Ships exhausted.'}
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold rounded-xl text-sm transition-all"
            >
              Close
            </button>
          </div>
        )}

        {/* PLACEMENT PHASE */}
        {!isOver && phase === 'placement' && (
          iHavePlaced ? (
            <div className="text-center">
              <div className="text-5xl mb-3">⚓</div>
              <h2 className="text-xl font-bold text-white">Fleet Deployed!</h2>
              <p className="text-slate-400 text-sm mt-1">
                {oppHasPlaced
                  ? 'Starting battle…'
                  : `Waiting for ${opponent?.username || 'opponent'} to place their ships…`}
              </p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-center w-full max-w-2xl">
              {/* Fleet sidebar */}
              <div className="flex flex-col gap-2 w-full sm:w-44 shrink-0">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Fleet</div>
                {FLEET.map(ship => {
                  const isPlaced   = !!placedShips.find(s => s.name === ship.name);
                  const isSelected = selectedShip === ship.name;
                  return (
                    <button
                      key={ship.name}
                      onClick={() => setSelectedShip(ship.name)}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left transition-colors
                        ${isSelected
                          ? 'bg-cyan-700 text-white ring-1 ring-cyan-400'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                    >
                      <span className={`shrink-0 w-3 h-3 rounded-sm ${SHIP_LIST_COLORS[ship.name]}`} />
                      <span className="flex-1 capitalize font-medium">{ship.label}</span>
                      <span className="text-slate-400 tracking-tighter text-[10px]">
                        {'▪'.repeat(ship.size)}
                      </span>
                      {isPlaced && <span className="text-green-400 text-xs">✓</span>}
                    </button>
                  );
                })}

                <button
                  onClick={() => setHorizontal(h => !h)}
                  className="mt-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded flex items-center gap-1.5 transition-colors"
                >
                  {horizontal ? '↔ Horizontal' : '↕ Vertical'}
                </button>

                <p className="text-slate-500 text-[11px] leading-snug">
                  Click a ship, then a cell to place it. Re-click the same ship to move it.
                </p>

                <button
                  onClick={handleReady}
                  disabled={!allPlaced}
                  className={`mt-1 px-3 py-2 rounded font-semibold text-sm transition-colors
                    ${allPlaced
                      ? 'bg-green-600 hover:bg-green-500 text-white'
                      : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
                >
                  {allPlaced ? '⚓ Ready!' : `${placedShips.length}/${FLEET.length} placed`}
                </button>
              </div>

              {/* Placement grid */}
              <div className="flex flex-col items-center">
                <div className="text-xs text-slate-400 mb-1 font-medium">Your Waters</div>
                <PlacementGrid
                  occupancyMap={occupancyMap}
                  previewOccupancy={previewOccupancy}
                  previewValid={previewValid}
                  onCellClick={handlePlaceCell}
                  onCellHover={handleCellHover}
                  onLeave={handleCellLeave}
                />
              </div>
            </div>
          )
        )}

        {/* COMBAT PHASE */}
        {!isOver && phase === 'combat' && (
          <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6 lg:gap-10">
            <CombatGrid
              label="Your Ocean"
              board={boards[myBoardKey] || null}
              shipOccupancy={lockedOccupancy}
              sunkCells={mySunkCells}
              isEnemy={false}
              canAttack={false}
              onAttack={null}
              explosions={explosions}
              boardKey={myBoardKey}
            />
            <div className="text-slate-600 text-xl select-none hidden lg:block self-center">⚔</div>
            <div className="text-slate-600 text-lg select-none block lg:hidden">⚔</div>
            {opponent ? (
              <div className="flex flex-col items-center">
                <CombatGrid
                  label={`${opponent.username}'s Ocean`}
                  board={boards[oppBoardKey] || null}
                  shipOccupancy={null}
                  sunkCells={null}
                  isEnemy={true}
                  canAttack={isMyTurn}
                  onAttack={handleAttack}
                  explosions={explosions}
                  boardKey={oppBoardKey}
                />
                {!isMyTurn && (
                  <p className="text-slate-500 text-xs mt-2">Waiting for your turn…</p>
                )}
              </div>
            ) : (
              <div className="text-slate-500 text-sm">Waiting for opponent…</div>
            )}
          </div>
        )}

        {/* RESULTS — show both final grids */}
        {isOver && opponent && (
          <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6 lg:gap-10 mt-2">
            <CombatGrid
              label="Your Ocean"
              board={boards[myBoardKey] || null}
              shipOccupancy={lockedOccupancy}
              sunkCells={mySunkCells}
              isEnemy={false}
              canAttack={false}
              onAttack={null}
              explosions={new Map()}
              boardKey={myBoardKey}
            />
            <CombatGrid
              label={`${opponent.username}'s Ocean`}
              board={boards[oppBoardKey] || null}
              shipOccupancy={null}
              sunkCells={null}
              isEnemy={false}
              canAttack={false}
              onAttack={null}
              explosions={new Map()}
              boardKey={oppBoardKey}
            />
          </div>
        )}
      </div>

      {/* Footer hint */}
      {phase === 'combat' && !isOver && (
        <div className="shrink-0 text-center text-xs text-slate-500 py-1.5 border-t border-slate-800">
          {isMyTurn ? 'Click a cell on the enemy ocean to fire' : 'Waiting for your turn…'}
        </div>
      )}
    </div>
  );
}
