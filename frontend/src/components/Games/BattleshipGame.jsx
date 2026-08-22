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

// Real top-down pixel-art hull art (Sea Warfare Set, CC0/public domain, by
// Lowder2 — https://opengameart.org/content/sea-warfare-set-ships-and-more),
// hosted on BunnyCDN matching this app's established asset convention.
// Native orientation is VERTICAL with the bow at the TOP of each image —
// the inverse of the old hand-drawn shapes below, which assumed a
// horizontal, bow-pointing-right source. See ShipSectionImage's own comment
// for how the crop/rotation math accounts for this.
const SHIP_IMAGE_BASE_URL = 'https://letswatchout.b-cdn.net/games/battleship';
const SHIP_IMAGE_URLS = {
  carrier:    `${SHIP_IMAGE_BASE_URL}/carrier.png`,
  battleship: `${SHIP_IMAGE_BASE_URL}/battleship.png`,
  cruiser:    `${SHIP_IMAGE_BASE_URL}/cruiser.png`,
  submarine:  `${SHIP_IMAGE_BASE_URL}/submarine.png`,
  destroyer:  `${SHIP_IMAGE_BASE_URL}/destroyer.png`,
};
// Real native pixel dimensions of each source PNG — needed so a per-section
// crop window is sized proportionally to that ship's own art (a 100px-tall
// destroyer hull and a 209px-tall battleship hull shouldn't be windowed
// using the same generic fraction, or one would look stretched relative to
// the other's level of detail).
const SHIP_IMAGE_NATIVE = {
  carrier:    { w: 57, h: 189 },
  battleship: { w: 31, h: 209 },
  cruiser:    { w: 23, h: 128 },
  submarine:  { w: 35, h: 142 },
  destroyer:  { w: 20, h: 100 },
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
        sectionIndex: i,
        totalSections: n,
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

// ── Shared crop math for windowing the real hull art into one grid cell ───────
// Source art is native-VERTICAL with the bow at the TOP. Our own per-cell
// convention (from buildOccupancyMap) is sectionIndex 0 = stern, last index =
// bow. Naively windowing top-to-bottom would put the source's bow region at
// sectionIndex 0 (labeled stern) — backwards. The fix: read the source in
// REVERSE (sourceSliceIndex = totalSections-1-sectionIndex). This one
// reversed mapping is correct for BOTH orientations, reasoned from how a
// horizontal ship's 90° clockwise rotation moves content: source-top ends up
// pointing right, source-bottom ends up pointing left — so the rightmost
// cell (bow, last index) must show the source's TOP (bow) slice, and the
// leftmost cell (stern, index 0) must show the source's BOTTOM (stern)
// slice — i.e. the same reversed mapping vertical ships already need.
function shipCropStyle(name, sectionIndex, totalSections, cellPx) {
  const native = SHIP_IMAGE_NATIVE[name] || SHIP_IMAGE_NATIVE.destroyer;
  const sourceSliceIndex = totalSections - 1 - sectionIndex;
  const sliceH = native.h / totalSections;
  const scale = cellPx / sliceH;
  const scaledW = native.w * scale;
  const scaledH = native.h * scale;
  return {
    src: SHIP_IMAGE_URLS[name] || SHIP_IMAGE_URLS.destroyer,
    imgStyle: {
      position: 'absolute',
      left: (cellPx - scaledW) / 2,
      top: -(sourceSliceIndex * sliceH * scale),
      width: scaledW,
      height: scaledH,
      imageRendering: 'pixelated',
      pointerEvents: 'none',
    },
  };
}

// ── One grid-cell's worth of real ship art ────────────────────────────────────
// Renders into a cellPx×cellPx box (defaults to the grid's own CELL_PX;
// ShipThumbnailImage below reuses this at a smaller cellPx for the fleet
// list).
//
// Rotation reasoning (traced through explicitly, not guessed — this is easy
// to get backwards): the source art is bow-up/stern-down. This game's own
// convention puts the bow at sectionIndex totalSections-1 — for a VERTICAL
// ship that's the BOTTOM-most cell, the opposite end from the source's own
// bow-at-top. Combined with shipCropStyle's reversed slice order (needed so
// each cell shows the right REGION of the source), a vertical crop with NO
// further transform ends up with its true bow/stern tips at the wrong
// (inner-seam) edge of each cell instead of the ship's outer edge — a real
// bug, caught by tracing pixel positions through by hand before shipping.
// Rotating each vertical crop 180° (safe: these hull silhouettes are
// left-right symmetric, so a 180° turn looks identical to a pure vertical
// mirror) fixes both the outer tips AND the inner-seam continuity between
// adjacent cells. Horizontal ships were separately traced through the same
// way and only need the already-present 90° clockwise rotation.
function ShipSectionImage({ name, sectionIndex, totalSections, horizontal, sunk, cellPx = CELL_PX }) {
  const { src, imgStyle } = shipCropStyle(name, sectionIndex, totalSections, cellPx);
  const rotStyle = {
    transform: horizontal ? 'rotate(90deg)' : 'rotate(180deg)',
    transformOrigin: `${cellPx / 2}px ${cellPx / 2}px`,
  };
  const opacity = sunk ? 0.4 : 1;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity, pointerEvents: 'none', ...rotStyle }}>
      <img src={src} alt="" style={imgStyle} />
      {sunk && (
        <svg width={cellPx} height={cellPx} viewBox="0 0 28 28" style={{ position: 'absolute', inset: 0 }}>
          <line x1="6"  y1="9"  x2="22" y2="19" stroke="rgba(160,30,0,0.75)" strokeWidth="1.8" />
          <line x1="22" y1="9"  x2="6"  y2="19" stroke="rgba(160,30,0,0.75)" strokeWidth="1.8" />
        </svg>
      )}
    </div>
  );
}

// ── Fleet list thumbnail — a small horizontal row of real ship art ────────────
// Always rendered horizontal (bow on the right) regardless of the ship's
// actual placed orientation, matching the original picker list's convention.
function ShipThumbnailImage({ name, size }) {
  const cellPx = 11;
  return (
    <div style={{ display: 'flex', flexShrink: 0 }}>
      {Array.from({ length: size }, (_, i) => (
        <div key={i} style={{ position: 'relative', width: cellPx, height: cellPx, flexShrink: 0 }}>
          <ShipSectionImage name={name} sectionIndex={i} totalSections={size} horizontal sunk={false} cellPx={cellPx} />
        </div>
      ))}
    </div>
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

// ── Ghost ship overlay — renders all sections as one connected element ────────
// Used during placement to show the full ship shape at the hovered position.
function GhostShipOverlay({ name, size, horizontal }) {
  return (
    <div style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', pointerEvents: 'none' }}>
      {Array.from({ length: size }, (_, i) => (
        <div key={i} style={{ position: 'relative', width: CELL_PX, height: CELL_PX, flexShrink: 0 }}>
          <ShipSectionImage name={name} sectionIndex={i} totalSections={size} horizontal={horizontal} sunk={false} />
        </div>
      ))}
    </div>
  );
}

// ── Grid cell wrapper ─────────────────────────────────────────────────────────
function Cell({ className = '', onClick, onMouseEnter, children }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{ position: 'relative', touchAction: 'manipulation' }}
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
// ghostShip: { r, c, name, size, horizontal } — drives the floating ghost overlay.
const ROW_LABEL_W = 24; // w-6 = 24px
function PlacementGrid({ occupancyMap, previewOccupancy, previewValid, onCellClick, onCellHover, onLeave, ghostShip }) {
  const labelsRef = useRef(null);
  const [labelH, setLabelH] = useState(16);
  useEffect(() => {
    if (labelsRef.current) setLabelH(labelsRef.current.offsetHeight);
  }, []);

  return (
    <div className="select-none relative" onMouseLeave={onLeave}>
      <div ref={labelsRef}><GridLabels /></div>
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
                  <ShipSectionImage
                    name={shipData.name}
                    sectionIndex={shipData.sectionIndex}
                    totalSections={shipData.totalSections}
                    horizontal={shipData.horizontal}
                    sunk={false}
                  />
                )}
                {/* Preview tint only — ghost overlay (below) supplies the ship shape */}
                {previewData && previewValid && (
                  <div className="absolute inset-0 bg-cyan-400/20 pointer-events-none" />
                )}
                {previewData && !previewValid && (
                  <div className="absolute inset-0 bg-red-500/35 pointer-events-none" />
                )}
              </Cell>
            );
          })}
        </div>
      ))}

      {/* Ghost ship overlay — a connected image of the full ship at the hovered cell */}
      {ghostShip && (
        <div
          style={{
            position: 'absolute',
            top: labelH + ghostShip.r * CELL_PX,
            left: ROW_LABEL_W + ghostShip.c * CELL_PX,
            opacity: previewValid ? 0.8 : 0.45,
            pointerEvents: 'none',
            zIndex: 15,
          }}
        >
          <GhostShipOverlay name={ghostShip.name} size={ghostShip.size} horizontal={ghostShip.horizontal} />
        </div>
      )}
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
                  <ShipSectionImage
                    name={shipData.name}
                    sectionIndex={shipData.sectionIndex}
                    totalSections={shipData.totalSections}
                    horizontal={shipData.horizontal}
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

  // Ghost ship: only when cells are in-bounds (previewCells not null).
  const ghostShip = previewCells ? {
    r: hoverCell.r, c: hoverCell.c,
    name: currentFleet.name, size: currentFleet.size, horizontal,
  } : null;

  const previewValid = useMemo(() => {
    if (!previewCells) return false;
    const othersOccupied = new Set(
      placedShips
        .filter(s => s.name !== selectedShip)
        .flatMap(s => s.cells.map(({ r, c }) => idx(r, c)))
    );
    return previewCells.every(({ r, c }) => !othersOccupied.has(idx(r, c)));
  }, [previewCells, placedShips, selectedShip]);

  // Rich occupancy map for the hover preview (includes name, sectionIndex,
  // totalSections, horizontal) — matches buildOccupancyMap's shape, though
  // PlacementGrid currently only reads presence + horizontal/valid for its
  // tint overlay (the ghost overlay supplies the actual ship art).
  const previewOccupancy = useMemo(() => {
    if (!previewCells) return null;
    const n     = previewCells.length;
    const horiz = n <= 1 || previewCells[0].r === previewCells[1]?.r;
    const map   = {};
    previewCells.forEach(({ r, c }, i) => {
      map[idx(r, c)] = {
        name:          selectedShip,
        sectionIndex:  i,
        totalSections: n,
        horizontal:    horiz,
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
    // Click on an already-placed different ship → select it for repositioning
    const clickedEntry = occupancyMap[idx(r, c)];
    if (clickedEntry && clickedEntry.name !== selectedShip) {
      setSelectedShip(clickedEntry.name);
      return;
    }
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
  }, [iHavePlaced, currentFleet, horizontal, placedShips, selectedShip, occupancyMap]);

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
                      <ShipThumbnailImage name={ship.name} size={ship.size} />
                      <span className="flex-1 capitalize font-medium">{ship.label}</span>
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
                  ghostShip={ghostShip}
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
