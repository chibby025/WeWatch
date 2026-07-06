// src/components/Games/BattleshipGame.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';

// Must match battleship.go exactly.
const FLEET = [
  { name: 'carrier',    label: 'Carrier',    size: 5 },
  { name: 'battleship', label: 'Battleship', size: 4 },
  { name: 'cruiser',    label: 'Cruiser',    size: 3 },
  { name: 'submarine',  label: 'Submarine',  size: 3 },
  { name: 'destroyer',  label: 'Destroyer',  size: 2 },
];

// Tailwind color per ship name (must stay in sync with FLEET order).
const SHIP_COLORS = {
  carrier:    'bg-purple-600',
  battleship: 'bg-blue-500',
  cruiser:    'bg-teal-500',
  submarine:  'bg-green-600',
  destroyer:  'bg-yellow-500',
};

const COL_LABELS = ['A','B','C','D','E','F','G','H','I','J'];
const ROW_LABELS = ['1','2','3','4','5','6','7','8','9','10'];
const GRID_SIZE  = 10;

const idx = (r, c) => r * GRID_SIZE + c;

// Returns the cells a ship of `size` would occupy starting at (r,c).
// Returns null if it goes out of bounds.
function shipCells(r, c, size, horizontal) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    const nr = horizontal ? r       : r + i;
    const nc = horizontal ? c + i   : c;
    if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) return null;
    cells.push({ r: nr, c: nc });
  }
  return cells;
}

// Build a flat index → ship-name lookup from a placed-ships array.
function buildOccupancyMap(ships) {
  const map = {};
  for (const s of ships) {
    for (const { r, c } of s.cells) map[idx(r, c)] = s.name;
  }
  return map;
}

// ── Shared grid cell ────────────────────────────────────────────────────────
function Cell({ className = '', onClick, children }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`w-7 h-7 border border-slate-700 flex items-center justify-center text-[10px] leading-none transition-colors ${className}`}
    >
      {children}
    </Tag>
  );
}

// ── Column/Row label row ─────────────────────────────────────────────────────
function GridLabels({ labelFirst }) {
  return (
    <div className="flex">
      {/* corner spacer (lines up with row-label column) */}
      <div className="w-6 shrink-0" />
      {COL_LABELS.map(col => (
        <div key={col} className="w-7 text-center text-[10px] text-slate-500 select-none">{col}</div>
      ))}
    </div>
  );
}

// ── Placement grid ───────────────────────────────────────────────────────────
function PlacementGrid({ occupancyMap, previewCells, previewValid, onCellClick, onCellHover, onLeave }) {
  return (
    <div className="select-none" onMouseLeave={onLeave}>
      <GridLabels />
      {ROW_LABELS.map((rowLabel, r) => (
        <div key={r} className="flex">
          <div className="w-6 shrink-0 text-[10px] text-slate-500 flex items-center justify-center select-none">
            {rowLabel}
          </div>
          {COL_LABELS.map((_, c) => {
            const i        = idx(r, c);
            const shipName = occupancyMap[i];
            const inPrev   = previewCells && previewCells.some(p => p.r === r && p.c === c);
            let cls = 'bg-slate-800 hover:bg-slate-700 cursor-pointer';
            if (shipName) cls = `${SHIP_COLORS[shipName] || 'bg-slate-400'} cursor-pointer hover:brightness-110`;
            if (inPrev)   cls = previewValid ? 'bg-cyan-500 opacity-80 cursor-pointer' : 'bg-red-500 opacity-70 cursor-pointer';
            return (
              <Cell
                key={c}
                className={cls}
                onClick={() => onCellClick(r, c)}
                onMouseEnter={() => onCellHover(r, c)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Combat grid (your ocean or enemy ocean) ──────────────────────────────────
// board: Array(100) of "" | "hit" | "miss" — shots AGAINST this player.
// shipOccupancy: only provided for "your" grid so you can see your own ships.
function CombatGrid({ label, board, shipOccupancy, isEnemy, canAttack, onAttack }) {
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
            const shipName = shipOccupancy ? shipOccupancy[i] : null;
            const fired    = shot === 'hit' || shot === 'miss';
            const clickable = isEnemy && canAttack && !fired;

            let cls = 'bg-slate-800';
            if (!isEnemy && shipName) cls = SHIP_COLORS[shipName] || 'bg-slate-400';
            if (shot === 'hit')  cls = 'bg-red-700';
            if (shot === 'miss') cls = 'bg-slate-700';
            if (clickable)       cls += ' hover:bg-cyan-700 cursor-crosshair';

            return (
              <Cell
                key={c}
                className={cls}
                onClick={clickable ? () => onAttack(r, c) : undefined}
              >
                {shot === 'hit'  && <span className="text-red-300 font-bold text-xs">✕</span>}
                {shot === 'miss' && <span className="w-1.5 h-1.5 rounded-full bg-slate-400 block" />}
              </Cell>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function BattleshipGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const gs              = gameState?.game_state || {};
  const phase           = gs.phase || 'placement';
  const boards          = gs.boards || {};
  const shipsRemaining  = gs.ships_remaining || {};
  const placed          = gs.placed || {};
  // gs.current_turn is a user_id (float) during combat
  const combatTurnId    = gs.current_turn ?? null;

  const isHostUser = (gameState?.host_id ?? players?.[0]?.user_id) === currentUserId;
  const opponent   = (players || []).find(p => p.user_id !== currentUserId);

  const iHavePlaced    = !!placed[String(currentUserId)];
  const oppHasPlaced   = opponent ? !!placed[String(opponent.user_id)] : false;
  const isMyTurn       = phase === 'combat' && Number(combatTurnId) === Number(currentUserId);
  const turnPlayer     = phase === 'combat'
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
  // We pick ships one at a time. The user clicks on the ship selector to pick
  // which one to (re)position, then clicks a grid cell to place it.
  const [placedShips, setPlacedShips]   = useState([]); // [{name, cells:[{r,c}]}]
  const [selectedShip, setSelectedShip] = useState(FLEET[0].name);
  const [horizontal, setHorizontal]     = useState(true);
  const [hoverCell, setHoverCell]       = useState(null);

  // After the player places their fleet and it transitions to combat, keep
  // the occupancy map alive so we can render our own ships on "Your Ocean".
  const [lockedOccupancy, setLockedOccupancy] = useState({});

  // Derived occupancy map from locally placed ships.
  const occupancyMap = useMemo(() => buildOccupancyMap(placedShips), [placedShips]);

  // Lock the occupancy map when placement is submitted.
  useEffect(() => {
    if (iHavePlaced && Object.keys(lockedOccupancy).length === 0 && placedShips.length > 0) {
      setLockedOccupancy(buildOccupancyMap(placedShips));
    }
  }, [iHavePlaced]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hover preview for placement
  const currentFleet = FLEET.find(f => f.name === selectedShip) || FLEET[0];
  const previewCells = hoverCell && !iHavePlaced
    ? shipCells(hoverCell.r, hoverCell.c, currentFleet.size, horizontal)
    : null;

  // A preview is valid if it fits in bounds AND doesn't overlap other ships
  // (excluding the current selected ship which may be getting repositioned).
  const previewValid = useMemo(() => {
    if (!previewCells) return false;
    const othersOccupied = new Set(
      placedShips
        .filter(s => s.name !== selectedShip)
        .flatMap(s => s.cells.map(({ r, c }) => idx(r, c)))
    );
    return previewCells.every(({ r, c }) => !othersOccupied.has(idx(r, c)));
  }, [previewCells, placedShips, selectedShip]);

  const handleCellHover = useCallback((r, c) => {
    if (iHavePlaced) return;
    setHoverCell({ r, c });
  }, [iHavePlaced]);

  const handleCellLeave = useCallback(() => setHoverCell(null), []);

  const handlePlaceCell = useCallback((r, c) => {
    if (iHavePlaced) return;
    const cells = shipCells(r, c, currentFleet.size, horizontal);
    if (!cells) return;

    // Check overlap against all OTHER ships (the selected ship can be moved).
    const othersOccupied = new Set(
      placedShips
        .filter(s => s.name !== selectedShip)
        .flatMap(s => s.cells.map(({ r: pr, c: pc }) => idx(pr, pc)))
    );
    if (cells.some(({ r: nr, c: nc }) => othersOccupied.has(idx(nr, nc)))) return;

    const next = placedShips.filter(s => s.name !== selectedShip);
    next.push({ name: selectedShip, cells });
    setPlacedShips(next);

    // Auto-advance to next unplaced ship.
    const nextUnplaced = FLEET.find(f => !next.find(s => s.name === f.name));
    if (nextUnplaced) setSelectedShip(nextUnplaced.name);
  }, [iHavePlaced, currentFleet, horizontal, placedShips, selectedShip]);

  const allPlaced = FLEET.every(f => placedShips.find(s => s.name === f.name));

  const handleReady = useCallback(() => {
    if (!allPlaced) return;
    setLockedOccupancy(buildOccupancyMap(placedShips));
    onMove({
      move_type: 'place',
      ships: placedShips.map(s => ({ name: s.name, cells: s.cells })),
    });
  }, [allPlaced, placedShips, onMove]);

  // ── Attack ───────────────────────────────────────────────────────────────
  const handleAttack = useCallback((r, c) => {
    if (!isMyTurn) return;
    const enemyBoard = boards[String(opponent?.user_id)] || [];
    const shot = enemyBoard[idx(r, c)];
    if (shot === 'hit' || shot === 'miss') return;
    onMove({ move_type: 'attack', r, c });
  }, [isMyTurn, boards, opponent, onMove]);

  const endOrLeave = () => {
    if (isHostUser && onEndGame) onEndGame();
    else if (onClose) onClose();
  };

  // ── Ships remaining display ───────────────────────────────────────────────
  const myShipsLeft  = shipsRemaining[String(currentUserId)]  ?? FLEET.length;
  const oppShipsLeft = opponent ? (shipsRemaining[String(opponent.user_id)] ?? FLEET.length) : null;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[60] bg-slate-950 flex flex-col overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
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

      {/* ── Ships remaining bar (combat / results) ───────────────────────── */}
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

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto flex flex-col items-center justify-start sm:justify-center p-4 gap-4 min-h-0">

        {/* ─── RESULTS / GAME OVER ─── */}
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

        {/* ─── PLACEMENT PHASE ─── */}
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
              {/* Ship selector + controls */}
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
                      <span className={`shrink-0 w-3 h-3 rounded-sm ${SHIP_COLORS[ship.name]}`} />
                      <span className="flex-1 capitalize font-medium">{ship.label}</span>
                      <span className="text-slate-400 tracking-tighter">{'▪'.repeat(ship.size)}</span>
                      {isPlaced && <span className="text-green-400 text-xs">✓</span>}
                    </button>
                  );
                })}

                {/* Orientation */}
                <button
                  onClick={() => setHorizontal(h => !h)}
                  className="mt-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded flex items-center gap-1.5 transition-colors"
                >
                  <span>{horizontal ? '↔ Horizontal' : '↕ Vertical'}</span>
                </button>

                <p className="text-slate-500 text-[11px] leading-snug">
                  Click a ship, then a cell to place it. Re-click the same ship to move it.
                </p>

                {/* Ready button */}
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
                  previewCells={previewCells}
                  previewValid={previewValid}
                  onCellClick={handlePlaceCell}
                  onCellHover={handleCellHover}
                  onLeave={handleCellLeave}
                />
              </div>
            </div>
          )
        )}

        {/* ─── COMBAT PHASE ─── */}
        {!isOver && phase === 'combat' && (
          <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6 lg:gap-10">
            {/* Your ocean */}
            <CombatGrid
              label="Your Ocean"
              board={boards[String(currentUserId)] || null}
              shipOccupancy={lockedOccupancy}
              isEnemy={false}
              canAttack={false}
              onAttack={null}
            />

            <div className="text-slate-600 text-xl select-none hidden lg:block self-center">⚔</div>
            <div className="text-slate-600 text-lg select-none block lg:hidden">⚔</div>

            {/* Enemy ocean */}
            {opponent ? (
              <div className="flex flex-col items-center">
                <CombatGrid
                  label={`${opponent.username}'s Ocean`}
                  board={boards[String(opponent.user_id)] || null}
                  shipOccupancy={null}
                  isEnemy={true}
                  canAttack={isMyTurn}
                  onAttack={handleAttack}
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

        {/* ─── RESULTS PHASE — show both final grids ─── */}
        {isOver && (phase === 'results' || true) && opponent && (
          <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6 lg:gap-10 mt-2">
            <CombatGrid
              label="Your Ocean"
              board={boards[String(currentUserId)] || null}
              shipOccupancy={lockedOccupancy}
              isEnemy={false}
              canAttack={false}
              onAttack={null}
            />
            <CombatGrid
              label={`${opponent.username}'s Ocean`}
              board={boards[String(opponent.user_id)] || null}
              shipOccupancy={null}
              isEnemy={false}
              canAttack={false}
              onAttack={null}
            />
          </div>
        )}
      </div>

      {/* ── Footer hint ─────────────────────────────────────────────────── */}
      {phase === 'combat' && !isOver && (
        <div className="shrink-0 text-center text-xs text-slate-500 py-1.5 border-t border-slate-800">
          {isMyTurn
            ? 'Click a cell on the enemy ocean to fire'
            : 'Waiting for your turn…'}
        </div>
      )}
    </div>
  );
}
