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

// Shared validity check used by placement, click-relocate, nudge, and
// rotate: cells must be in bounds (shipCells already returns null
// otherwise) and must not overlap any OTHER placed ship (excludeName is
// the ship being moved, so it never collides with its own old position).
function cellsValid(cells, placedShips, excludeName) {
  if (!cells) return false;
  const otherOccupied = new Set(
    placedShips
      .filter(s => s.name !== excludeName)
      .flatMap(s => s.cells.map(({ r, c }) => idx(r, c)))
  );
  return cells.every(({ r, c }) => !otherOccupied.has(idx(r, c)));
}

// Rotates a placed ship's cells 90° around its own anchor (first) cell,
// clamping the anchor back into bounds if the new orientation would
// otherwise run off the grid edge. shipCells only ever extends in the
// +row/+col direction from the anchor, so any overflow is always on the
// high side — a simple min() clamp is enough to "shift it back in."
function computeRotatedCells(cells) {
  if (!cells || cells.length === 0) return null;
  const size = cells.length;
  const curHorizontal = size <= 1 || cells[0].r === cells[1]?.r;
  const newHorizontal = !curHorizontal;
  let r0 = cells[0].r;
  let c0 = cells[0].c;
  if (newHorizontal) {
    c0 = Math.min(c0, GRID_SIZE - size);
  } else {
    r0 = Math.min(r0, GRID_SIZE - size);
  }
  return shipCells(r0, c0, size, newHorizontal);
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
// Also reused (via PlacedShipOverlay below) for the REAL, placed ship — this
// is the fix for the gap/seam issue: each inner slot here is a plain,
// unbordered flex child sitting flush against its neighbors (no `gap`, exact
// CELL_PX sizing), unlike a grid Cell, which always has its own 1px border
// and `overflow-hidden`. Slicing a ship's art across N bordered/clipped
// Cells put a real border line at every section boundary — no amount of
// widening a section's own crop survives being clipped at its own cell's
// edge, so the ship never looked continuous. Rendering the whole ship here
// instead, then absolutely-positioning ONE overlay over the grid (instead of
// N separate per-cell crops inside N separate Cells), removes the seam
// entirely — exactly how the hover ghost already looked seamless.
function GhostShipOverlay({ name, size, horizontal, sunk = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', pointerEvents: 'none' }}>
      {Array.from({ length: size }, (_, i) => (
        <div key={i} style={{ position: 'relative', width: CELL_PX, height: CELL_PX, flexShrink: 0 }}>
          <ShipSectionImage name={name} sectionIndex={i} totalSections={size} horizontal={horizontal} sunk={sunk} />
        </div>
      ))}
    </div>
  );
}

// ── Real placed-ship overlay — the actual (non-ghost) fix ─────────────────────
// Positions the same continuous hull render above at the ship's true pixel
// footprint on the grid. `top`/`left` are the pixel offset of the ship's
// anchor cell (cells[0] — shipCells always builds outward from the anchor in
// the +row/+col direction, so it's always the min-r,min-c corner) within
// whatever `position: relative` grid container this is rendered into.
// z-index sits below FireDamage(10)/ExplosionEffect(20) — those effects
// visually happen ON the ship, so they need to render on top of its hull —
// but above the plain (unindexed) cell backgrounds/borders underneath.
// pointerEvents stays 'none' throughout: this floats above the grid's own
// clickable Cells (attack / place / relocate) and must never intercept
// those clicks.
function PlacedShipOverlay({ name, cells, sunk, top, left }) {
  const size = cells.length;
  const horizontal = size <= 1 || cells[0].r === cells[1]?.r;
  return (
    <div style={{ position: 'absolute', top, left, zIndex: 1, pointerEvents: 'none' }}>
      <GhostShipOverlay name={name} size={size} horizontal={horizontal} sunk={sunk} />
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

// ── Fine-tune D-pad + rotate cluster ──────────────────────────────────────────
// Floats just outside the selected ship's own footprint (flips to the
// opposite side if it would run off the grid's right edge) — a compact,
// always-reachable alternative to dragging on a small touch screen. Only
// rendered when the currently selected ship is actually placed on the
// board (see PlacementGrid below); click-to-relocate via the grid still
// works on top of this, this is just a one-cell-at-a-time fine-tune.
function ShipAdjustControls({ cells, nudgeValidity, canRotate, onNudge, onRotate, labelH }) {
  if (!cells || cells.length === 0) return null;

  const rs = cells.map(c => c.r);
  const cs = cells.map(c => c.c);
  const minR = Math.min(...rs), maxR = Math.max(...rs);
  const minC = Math.min(...cs), maxC = Math.max(...cs);

  const BTN = 22;
  const BTN_GAP = 2;
  const OFFSET = 6; // gap between the ship's edge and the cluster
  const clusterSize = BTN * 3 + BTN_GAP * 2;

  const shipLeftPx    = ROW_LABEL_W + minC * CELL_PX;
  const shipRightPx   = ROW_LABEL_W + (maxC + 1) * CELL_PX;
  const shipTopPx     = labelH + minR * CELL_PX;
  const shipBottomPx  = labelH + (maxR + 1) * CELL_PX;
  const gridRightEdge = ROW_LABEL_W + GRID_SIZE * CELL_PX;

  let left = shipRightPx + OFFSET;
  if (left + clusterSize > gridRightEdge) {
    left = shipLeftPx - OFFSET - clusterSize;
  }
  let top = (shipTopPx + shipBottomPx) / 2 - clusterSize / 2;
  top = Math.max(labelH, Math.min(top, labelH + GRID_SIZE * CELL_PX - clusterSize));

  const btnStyle = { width: BTN, height: BTN, fontSize: 10, lineHeight: 1 };
  // !min-h-0 !min-w-0 counters a global mobile rule (index.css:
  // `@media (max-width: 640px) { button { min-height: 44px; min-width: 44px; } }`)
  // that otherwise forces every one of these 22px buttons up to 44px on
  // mobile — inside a CSS grid with fixed 22px tracks, that made each
  // button spill into its neighbors' space, which is exactly what looked
  // like "the directional buttons overlap." Same fix already proven for
  // this identical class of bug elsewhere in this app (GameLobbyModal's
  // small dot/chevron buttons hit the same global rule).
  const btnCls = (active) =>
    `flex items-center justify-center rounded transition-colors !min-h-0 !min-w-0 ${
      active
        ? 'bg-cyan-700 hover:bg-cyan-600 active:bg-cyan-500 text-white'
        : 'bg-slate-800/80 text-slate-600 cursor-not-allowed'
    }`;

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        display: 'grid',
        gridTemplateColumns: `${BTN}px ${BTN}px ${BTN}px`,
        gridTemplateRows: `${BTN}px ${BTN}px ${BTN}px`,
        gap: BTN_GAP,
        zIndex: 20,
      }}
    >
      <div />
      <button type="button" title="Move up" disabled={!nudgeValidity.up}
        onClick={() => onNudge(-1, 0)} className={btnCls(nudgeValidity.up)} style={btnStyle}>▲</button>
      <div />

      <button type="button" title="Move left" disabled={!nudgeValidity.left}
        onClick={() => onNudge(0, -1)} className={btnCls(nudgeValidity.left)} style={btnStyle}>◀</button>
      <button type="button" title="Rotate" disabled={!canRotate}
        onClick={onRotate} className={btnCls(canRotate)} style={btnStyle}>⟳</button>
      <button type="button" title="Move right" disabled={!nudgeValidity.right}
        onClick={() => onNudge(0, 1)} className={btnCls(nudgeValidity.right)} style={btnStyle}>▶</button>

      <div />
      <button type="button" title="Move down" disabled={!nudgeValidity.down}
        onClick={() => onNudge(1, 0)} className={btnCls(nudgeValidity.down)} style={btnStyle}>▼</button>
      <div />
    </div>
  );
}

function PlacementGrid({
  occupancyMap, previewOccupancy, previewValid, onCellClick, onCellHover, onLeave, ghostShip,
  selectedPlacedCells, nudgeValidity, canRotate, onNudge, onRotate, placedShips,
}) {
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
                {/* Placed ship art is no longer rendered per-cell here — see
                    the PlacedShipOverlay pass below, one continuous image
                    per ship rather than N separately-bordered/clipped
                    crops. This cell only ever supplies its background tint
                    now. */}
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

      {/* Real placed ships — one continuous hull image per ship, no seams
          between sections (see PlacedShipOverlay's own comment). */}
      {(placedShips || []).map(ship => (
        <PlacedShipOverlay
          key={ship.name}
          name={ship.name}
          cells={ship.cells}
          sunk={false}
          top={labelH + ship.cells[0].r * CELL_PX}
          left={ROW_LABEL_W + ship.cells[0].c * CELL_PX}
        />
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

      {/* Fine-tune D-pad + rotate — shown next to the selected ship once
          it's actually placed on the board. */}
      {selectedPlacedCells && (
        <ShipAdjustControls
          cells={selectedPlacedCells}
          nudgeValidity={nudgeValidity}
          canRotate={canRotate}
          onNudge={onNudge}
          onRotate={onRotate}
          labelH={labelH}
        />
      )}
    </div>
  );
}

// ── Combat grid ───────────────────────────────────────────────────────────────
// shipOccupancy: richer map (name, position, horizontal) — only provided for YOUR grid.
// explosions: Map<"${boardKey}-${cellIdx}", 'hit'|'miss'>
// sunkCells: Set<cellIdx> — cells belonging to fully sunk ships (your grid only)
function CombatGrid({ label, board, shipOccupancy, ships, sunkCells, isEnemy, canAttack, onAttack, explosions, boardKey }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-xs font-semibold text-slate-300 mb-1 tracking-wide">{label}</div>
      <GridLabels />
      <div className="relative">
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
                {/* Own ship art now rendered as a continuous overlay below
                    (see the ships.map pass after the rows) rather than a
                    per-cell crop here — see PlacedShipOverlay's comment. */}

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

      {/* Own ships — one continuous hull image per ship, seamless across its
          full footprint. Never rendered for the enemy board (own ships are
          never revealed there). Positioned relative to this wrapper's own
          origin (top-left of row 0) — no header/label height to account for,
          since the label text + column headers above are siblings of this
          div, not part of it. */}
      {!isEnemy && (ships || []).map(ship => {
        const shipSunk = sunkCells ? ship.cells.every(({ r, c }) => sunkCells.has(idx(r, c))) : false;
        return (
          <PlacedShipOverlay
            key={ship.name}
            name={ship.name}
            cells={ship.cells}
            sunk={shipSunk}
            top={ship.cells[0].r * CELL_PX}
            left={ROW_LABEL_W + ship.cells[0].c * CELL_PX}
          />
        );
      })}
      </div>
    </div>
  );
}

// ── Player avatar — circular image, or initials if none is set ────────────────
// Same image-or-initials fallback pattern already used by TicTacToeGame's
// turn indicator (player.avatar_url from the room's own player-selection
// payload, threaded straight through on the players[] prop).
function PlayerAvatar({ username, avatarUrl, size = 26, highlighted }) {
  return (
    <div
      className={`rounded-full overflow-hidden flex-shrink-0 bg-slate-700 flex items-center justify-center transition-shadow ${
        highlighted ? 'ring-2 ring-cyan-400' : ''
      }`}
      style={{ width: size, height: size }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={username || ''} className="w-full h-full object-cover" />
      ) : (
        <span className="font-bold text-white select-none" style={{ fontSize: size * 0.36 }}>
          {(username || '?').slice(0, 2).toUpperCase()}
        </span>
      )}
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
  const me         = (players || []).find(p => p.user_id === currentUserId);
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
  // Once the selected ship is already on the board, the D-pad is the tool
  // for adjusting it — suppress the floating hover ghost/tint (it was
  // rendering at the same time as the D-pad and looked cluttered/confusing).
  // Click-to-relocate still works underneath, just without the preview.
  const selectedShipIsPlaced = placedShips.some(s => s.name === selectedShip);
  const previewCells = hoverCell && !iHavePlaced && !selectedShipIsPlaced
    ? shipCells(hoverCell.r, hoverCell.c, currentFleet.size, horizontal)
    : null;

  // Ghost ship: only when cells are in-bounds (previewCells not null).
  const ghostShip = previewCells ? {
    r: hoverCell.r, c: hoverCell.c,
    name: currentFleet.name, size: currentFleet.size, horizontal,
  } : null;

  const previewValid = useMemo(
    () => cellsValid(previewCells, placedShips, selectedShip),
    [previewCells, placedShips, selectedShip],
  );

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

  // ── Fine-tune controls for the selected ship, once it's actually placed ──
  // A small D-pad + rotate icon shown next to the ship on the board — a
  // mobile-friendly alternative to drag-repositioning (click-to-relocate via
  // the grid, above, still works too; this is just a one-cell-at-a-time
  // nudge on top of it).
  const selectedPlacedShipEntry = useMemo(
    () => placedShips.find(s => s.name === selectedShip) || null,
    [placedShips, selectedShip],
  );

  const nudgeValidity = useMemo(() => {
    if (!selectedPlacedShipEntry) return { up: false, down: false, left: false, right: false };
    const check = (dr, dc) => {
      const moved = selectedPlacedShipEntry.cells.map(({ r, c }) => ({ r: r + dr, c: c + dc }));
      if (moved.some(({ r, c }) => r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE)) return false;
      return cellsValid(moved, placedShips, selectedShip);
    };
    return { up: check(-1, 0), down: check(1, 0), left: check(0, -1), right: check(0, 1) };
  }, [selectedPlacedShipEntry, placedShips, selectedShip]);

  const handleNudge = useCallback((dr, dc) => {
    if (iHavePlaced || !selectedPlacedShipEntry) return;
    const moved = selectedPlacedShipEntry.cells.map(({ r, c }) => ({ r: r + dr, c: c + dc }));
    if (moved.some(({ r, c }) => r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE)) return;
    if (!cellsValid(moved, placedShips, selectedShip)) return;
    setPlacedShips(prev => prev.map(s => (s.name === selectedShip ? { ...s, cells: moved } : s)));
  }, [iHavePlaced, selectedPlacedShipEntry, placedShips, selectedShip]);

  // Rotating pivots on the ship's own anchor cell; computeRotatedCells
  // handles shifting it back into bounds if the new orientation overflows.
  const rotatedPreview = useMemo(
    () => (selectedPlacedShipEntry ? computeRotatedCells(selectedPlacedShipEntry.cells) : null),
    [selectedPlacedShipEntry],
  );
  const canRotateSelected = !!rotatedPreview && cellsValid(rotatedPreview, placedShips, selectedShip);
  const handleRotateSelected = useCallback(() => {
    if (iHavePlaced || !canRotateSelected || !rotatedPreview) return;
    setPlacedShips(prev => prev.map(s => (s.name === selectedShip ? { ...s, cells: rotatedPreview } : s)));
  }, [iHavePlaced, canRotateSelected, rotatedPreview, selectedShip]);

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
    if (!cellsValid(cells, placedShips, selectedShip)) return;
    const next = placedShips.filter(s => s.name !== selectedShip);
    next.push({ name: selectedShip, cells });
    setPlacedShips(next);
    // No auto-advance — the player must explicitly select the next ship.
    // Staying on the ship just placed keeps its fine-tune arrows/rotate
    // controls visible immediately, which is the whole point on mobile.
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

  // × always just leaves locally for that one client — the match keeps
  // running for whoever's left. "End Game" (host-only, below) is the
  // explicit, separate action that ends it for everyone — same split this
  // codebase already uses consistently across its other games (VS Battle,
  // Ping Pong, Rebus Round, etc.), rather than overloading one icon with
  // two different meanings depending on who clicks it.
  const handleClose = () => {
    if (onClose) onClose();
  };
  const handleEndGame = () => {
    if (isOver) return;
    if (onEndGame) onEndGame();
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
        <div className="flex items-center gap-2">
          {isHostUser && !isOver && (
            <button
              onClick={handleEndGame}
              title="End the game for everyone"
              className="text-xs font-semibold text-red-400 hover:text-red-300 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 px-3 py-1.5 rounded-lg transition-colors"
            >
              End Game
            </button>
          )}
          <button
            onClick={handleClose}
            title="Leave game"
            className="text-slate-400 hover:text-white hover:bg-slate-800 p-1.5 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Players bar — always visible (placement through results), not just
          combat, so both avatars are on screen for the whole match. */}
      {opponent && (
        <div className="shrink-0 flex items-center justify-center gap-4 sm:gap-8 px-4 py-1.5 bg-slate-900 border-b border-slate-800 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <PlayerAvatar username={me?.username} avatarUrl={me?.avatar_url} highlighted={phase === 'combat' && !isOver && isMyTurn} />
            <span>
              <span className="text-cyan-400 font-semibold">You:</span>{' '}
              {myShipsLeft} ship{myShipsLeft !== 1 ? 's' : ''} left
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>
              <span className="text-red-400 font-semibold">{opponent.username}:</span>{' '}
              {oppShipsLeft} ship{oppShipsLeft !== 1 ? 's' : ''} left
            </span>
            <PlayerAvatar username={opponent.username} avatarUrl={opponent.avatar_url} highlighted={phase === 'combat' && !isOver && !isMyTurn} />
          </div>
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
                  Select a ship, then tap a cell to place it — you'll stay on
                  that ship until you pick another one. A placed, selected
                  ship shows arrows next to it on the board (⟳ rotates) for
                  quick adjustments.
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
                  selectedPlacedCells={selectedPlacedShipEntry?.cells || null}
                  nudgeValidity={nudgeValidity}
                  canRotate={canRotateSelected}
                  onNudge={handleNudge}
                  onRotate={handleRotateSelected}
                  placedShips={placedShips}
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
              ships={lockedShips}
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
              ships={lockedShips}
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
