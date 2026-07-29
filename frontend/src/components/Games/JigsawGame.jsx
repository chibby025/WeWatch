import { useCallback, useRef, useState } from 'react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

const IMAGE_BASE = 'https://letswatchout.b-cdn.net/games/jigsaw/images';
const CURATED_IMAGES = [
  { id: 'sunset_mountains', name: 'Sunset Mountains', url: `${IMAGE_BASE}/sunset_mountains.webp` },
  { id: 'ocean_bubbles',    name: 'Ocean Bubbles',     url: `${IMAGE_BASE}/ocean_bubbles.webp` },
  { id: 'synthwave',        name: 'Synthwave',         url: `${IMAGE_BASE}/synthwave.webp` },
];
const DIFFICULTIES = [
  { label: 'Easy',   cols: 3, rows: 3 },
  { label: 'Medium', cols: 4, rows: 4 },
  { label: 'Hard',   cols: 6, rows: 5 },
  { label: 'Expert', cols: 8, rows: 6 },
];

const PLAYER_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16'];

const BOARD_PX = 320;   // fixed square board render size
const TAB_DEPTH = 0.32; // how far a tab/blank bulges, as a fraction of one cell's size

// ── Piece silhouette generation ─────────────────────────────────────────────
// Every piece is a unit square (0..1) whose 4 edges are each 'flat' (grid
// border), 'tab' (bulges outward), or 'blank' (notches inward). Rather than
// hand-deriving 4 separately-rotated bezier formulas, one edge shape is
// defined in local (u = 0..1 along the edge, v = perpendicular offset,
// positive v = outward) coordinates, then transformed into each of the 4
// actual edges via a small per-edge coordinate map — much less error-prone
// than re-deriving the curve math four times.

function localEdgeCommands(kind) {
  if (kind === 'flat') return [{ cmd: 'L', u: 1, v: 0 }];
  const s = kind === 'tab' ? 1 : -1; // tab bulges outward (+v), blank inward (-v)
  return [
    { cmd: 'L', u: 0.40, v: 0 },
    { cmd: 'C', u1: 0.40, v1: 0.10 * s, u2: 0.30, v2: 0.20 * s, u: 0.30, v: 0.32 * s },
    { cmd: 'C', u1: 0.30, v1: 0.48 * s, u2: 0.70, v2: 0.48 * s, u: 0.70, v: 0.32 * s },
    { cmd: 'C', u1: 0.70, v1: 0.20 * s, u2: 0.60, v2: 0.10 * s, u: 0.60, v: 0 },
    { cmd: 'L', u: 1, v: 0 },
  ];
}

// Maps local (u,v) for a given edge to piece-local (x,y) in 0..1 space
// (plus TAB_DEPTH margin), tracing the piece clockwise: top L->R, right
// T->B, bottom R->L, left B->T.
function edgeToXY(edge, u, v) {
  switch (edge) {
    case 'top':    return { x: u,     y: -v };
    case 'right':  return { x: 1 + v, y: u };
    case 'bottom': return { x: 1 - u, y: 1 + v };
    case 'left':   return { x: -v,    y: 1 - u };
    default:       return { x: u, y: v };
  }
}

// Builds the SVG path `d` string (in piece-local 0..1 + margin space) for a
// piece given its 4 edge types, in the order { top, right, bottom, left }.
// Explicitly starts at the piece's actual top-left corner (0,0) via M — every
// edge's own command list only ever contains L/C continuations from there,
// never a moveto, so the starting corner can't be silently skipped.
function buildPiecePathUnit(edges) {
  const order = ['top', 'right', 'bottom', 'left'];
  let d = 'M 0 0 ';
  order.forEach((edge) => {
    const commands = localEdgeCommands(edges[edge]);
    commands.forEach(c => {
      if (c.cmd === 'L') {
        const { x, y } = edgeToXY(edge, c.u, c.v);
        d += `L ${x} ${y} `;
      } else {
        const p1 = edgeToXY(edge, c.u1, c.v1);
        const p2 = edgeToXY(edge, c.u2, c.v2);
        const p  = edgeToXY(edge, c.u, c.v);
        d += `C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p.x} ${p.y} `;
      }
    });
  });
  return `${d}Z`;
}

// Reads this piece's 4 edge types from the shared v_edges/h_edges arrays.
// See jigsaw.go's header comment for the exact tab/blank convention.
function pieceEdges(row, col, rows, cols, vEdges, hEdges) {
  const top    = row === 0        ? 'flat' : (hEdges[row - 1]?.[col] ? 'blank' : 'tab');
  const bottom = row === rows - 1  ? 'flat' : (hEdges[row]?.[col]     ? 'tab'   : 'blank');
  const left   = col === 0        ? 'flat' : (vEdges[row]?.[col - 1] ? 'blank' : 'tab');
  const right  = col === cols - 1  ? 'flat' : (vEdges[row]?.[col]     ? 'tab'   : 'blank');
  return { top, right, bottom, left };
}

function PuzzlePiece({ pieceId, row, col, cellW, cellH, edges, imageUrl, boardW, boardH, style, onPointerDownPiece, heldByColor }) {
  const marginW = cellW * TAB_DEPTH;
  const marginH = cellH * TAB_DEPTH;
  // Small, cheap string-building — not worth memoizing (and edges/cellW are
  // fresh values from the parent's render every time anyway).
  const pathUnit = buildPiecePathUnit(edges);
  const pathPx = pathUnit.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (_, x, y) =>
    `${(parseFloat(x) * cellW).toFixed(2)} ${(parseFloat(y) * cellH).toFixed(2)}`);

  return (
    <div
      onPointerDown={(e) => onPointerDownPiece(e, pieceId)}
      style={{
        position: 'absolute',
        width: cellW + marginW * 2,
        height: cellH + marginH * 2,
        clipPath: `path('${pathPx}')`,
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: `${boardW}px ${boardH}px`,
        backgroundPosition: `${-(col * cellW - marginW)}px ${-(row * cellH - marginH)}px`,
        boxShadow: heldByColor ? `0 0 0 3px ${heldByColor}, 0 6px 14px rgba(0,0,0,0.5)` : '0 3px 8px rgba(0,0,0,0.45)',
        cursor: 'grab',
        touchAction: 'none',
        transform: `translate(${-marginW}px, ${-marginH}px)`,
        ...style,
      }}
    />
  );
}

export default function JigsawGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'setup';
  const cols = gs.cols || 0;
  const rows = gs.rows || 0;
  const imageUrl = gs.image_url || '';
  const vEdges = gs.v_edges || [];
  const hEdges = gs.h_edges || [];
  const pieces = gs.pieces || {};
  const placedCount = gs.placed_count || 0;
  const totalPieces = gs.total_pieces || (cols * rows) || 0;
  const placedBy = gs.placed_by || {};

  const isHostUser = (gameState?.host_id ?? players?.[0]?.user_id) === currentUserId;
  const isOver = phase === 'completed' || ['finished', 'completed', 'forfeited'].includes(gameState?.status || '');

  const [selectedImage, setSelectedImage] = useState(CURATED_IMAGES[0].id);
  const [selectedDifficulty, setSelectedDifficulty] = useState(1); // index into DIFFICULTIES
  const [customUrl, setCustomUrl] = useState('');

  const boardRef = useRef(null);
  const dragRef = useRef(null); // { pieceId, pointerId, offsetX, offsetY }
  const [dragPos, setDragPos] = useState(null); // { pieceId, x, y } in board px, for the piece I'm actively holding

  const cellW = cols > 0 ? BOARD_PX / cols : 0;
  const cellH = rows > 0 ? BOARD_PX / rows : 0;

  const winner = gameState?.winner_id
    ? ((players || []).find(p => p.user_id === gameState.winner_id) || 'draw')
    : 'draw';
  const gameStats = {
    lines: (players || []).map(p => {
      const count = placedBy[String(p.user_id)] || 0;
      return { label: p.username, value: `${count} piece${count === 1 ? '' : 's'} placed` };
    }),
  };

  function startPuzzle() {
    const diff = DIFFICULTIES[selectedDifficulty];
    const image = customUrl.trim() || CURATED_IMAGES.find(i => i.id === selectedImage)?.url;
    onMove({ move_type: 'configure', image_url: image, cols: diff.cols, rows: diff.rows });
  }

  const handlePointerDown = useCallback((e, pieceId) => {
    if (isOver) return;
    const piece = pieces[pieceId];
    if (!piece) return;
    const isMine = piece.holder_id === currentUserId;
    if (piece.placed || (piece.holder_id && !isMine)) return; // placed, or held by someone else

    const boardRect = boardRef.current?.getBoundingClientRect();
    if (!boardRect) return;
    const pxX = (piece.x ?? 0) * BOARD_PX;
    const pxY = (piece.y ?? 0) * BOARD_PX;
    const pointerBoardX = e.clientX - boardRect.left;
    const pointerBoardY = e.clientY - boardRect.top;

    dragRef.current = { pieceId, offsetX: pointerBoardX - pxX, offsetY: pointerBoardY - pxY };
    setDragPos({ pieceId, x: pxX, y: pxY });

    if (!isMine) onMove({ move_type: 'pickup', piece_id: pieceId });

    const handleMove = (moveEvt) => {
      if (!dragRef.current) return;
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = moveEvt.clientX - rect.left - dragRef.current.offsetX;
      const y = moveEvt.clientY - rect.top - dragRef.current.offsetY;
      setDragPos({ pieceId: dragRef.current.pieceId, x, y });
    };
    const handleUp = (upEvt) => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      if (!dragRef.current) return;
      const rect = boardRef.current?.getBoundingClientRect();
      const x = rect ? (upEvt.clientX - rect.left - dragRef.current.offsetX) / BOARD_PX : 0;
      const y = rect ? (upEvt.clientY - rect.top - dragRef.current.offsetY) / BOARD_PX : 0;
      onMove({ move_type: 'release', piece_id: dragRef.current.pieceId, x, y });
      dragRef.current = null;
      setDragPos(null);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [pieces, isOver, currentUserId, onMove]);

  const playerColorFor = useCallback((userId) => {
    const idx = (players || []).findIndex(p => p.user_id === userId);
    return idx >= 0 ? PLAYER_COLORS[idx % PLAYER_COLORS.length] : '#94a3b8';
  }, [players]);

  return (
    <>
    <div className="fixed inset-0 z-50 flex flex-col text-white select-none overflow-y-auto"
      style={{ background: 'linear-gradient(180deg,#1e1b4b 0%,#0f172a 100%)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/30 border-b border-white/10 backdrop-blur-sm">
        <div>
          <h2 className="text-lg font-bold text-cyan-300">🧩 Jigsaw Puzzle</h2>
          <p className="text-xs text-gray-400">
            {phase === 'setup' ? (isHostUser ? 'Choose an image to begin' : 'Waiting for the host to set up the puzzle…')
              : phase === 'playing' ? `${placedCount}/${totalPieces} pieces placed — work together!`
              : 'Puzzle complete!'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GameRulesButton gameType="jigsaw" className="text-white/60 hover:text-white" />
          {onEndGame && (
            <button onClick={() => { onEndGame?.(); onClose?.(); }} className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded-lg">
              End
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg">✕</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center">

        {/* Setup phase */}
        {phase === 'setup' && isHostUser && (
          <div className="w-full max-w-sm">
            <p className="text-sm font-semibold text-gray-300 mb-2">Pick an image</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {CURATED_IMAGES.map(img => (
                <button key={img.id} onClick={() => { setSelectedImage(img.id); setCustomUrl(''); }}
                  className="rounded-lg overflow-hidden border-2 transition-all"
                  style={{ borderColor: selectedImage === img.id && !customUrl ? '#22d3ee' : 'transparent' }}>
                  <img src={img.url} alt={img.name} className="w-full h-20 object-cover" />
                </button>
              ))}
            </div>
            <input
              type="text" placeholder="...or paste your own image URL"
              value={customUrl} onChange={e => setCustomUrl(e.target.value)}
              className="w-full px-3 py-2 mb-4 rounded-lg bg-white/10 border border-white/20 text-sm placeholder:text-gray-500"
            />
            <p className="text-sm font-semibold text-gray-300 mb-2">Difficulty</p>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {DIFFICULTIES.map((d, i) => (
                <button key={d.label} onClick={() => setSelectedDifficulty(i)}
                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                    selectedDifficulty === i ? 'bg-cyan-500 text-black' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
                  {d.label}<br /><span className="font-normal opacity-70">{d.cols * d.rows}pc</span>
                </button>
              ))}
            </div>
            <button onClick={startPuzzle}
              className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', boxShadow: '0 4px 14px rgba(124,58,237,0.5)' }}>
              Start Puzzle
            </button>
          </div>
        )}
        {phase === 'setup' && !isHostUser && (
          <div className="text-center text-gray-400 text-sm mt-10">👆 Waiting for the host to choose an image…</div>
        )}

        {/* Playing / completed phase */}
        {phase !== 'setup' && (
          <>
            <div className="h-1.5 w-full max-w-sm bg-white/10 rounded-full mb-4 overflow-hidden flex-shrink-0">
              <div className="h-full rounded-full transition-all" style={{
                width: `${totalPieces ? (placedCount / totalPieces) * 100 : 0}%`,
                background: 'linear-gradient(90deg,#7c3aed,#22d3ee)',
              }} />
            </div>

            <div ref={boardRef} className="relative flex-shrink-0"
              style={{ width: BOARD_PX, height: BOARD_PX * 1.9, touchAction: 'none' }}>
              {/* Faint outline of the target picture, so people can see what they're building toward */}
              <div className="absolute top-0 left-0 rounded-lg overflow-hidden"
                style={{ width: BOARD_PX, height: BOARD_PX, opacity: 0.12, border: '1px dashed rgba(255,255,255,0.3)' }}>
                <img src={imageUrl} alt="" className="w-full h-full object-cover" />
              </div>

              {Object.entries(pieces).map(([pieceId, piece]) => {
                const edges = pieceEdges(piece.row, piece.col, rows, cols, vEdges, hEdges);
                const isMine = piece.holder_id === currentUserId;
                const isDraggingThis = dragPos && dragPos.pieceId === pieceId && isMine;
                const x = isDraggingThis ? dragPos.x : (piece.x ?? 0) * BOARD_PX;
                const y = isDraggingThis ? dragPos.y : (piece.y ?? 0) * BOARD_PX;
                const heldColor = piece.holder_id ? playerColorFor(piece.holder_id) : null;
                return (
                  <PuzzlePiece
                    key={pieceId}
                    pieceId={pieceId}
                    row={piece.row} col={piece.col}
                    cellW={cellW} cellH={cellH}
                    edges={edges}
                    imageUrl={imageUrl}
                    boardW={BOARD_PX} boardH={BOARD_PX}
                    heldByColor={heldColor}
                    onPointerDownPiece={handlePointerDown}
                    style={{
                      left: x, top: y,
                      zIndex: piece.placed ? 1 : (isDraggingThis ? 50 : 10),
                      transition: isDraggingThis ? 'none' : 'left 0.2s ease-out, top 0.2s ease-out',
                      pointerEvents: piece.placed ? 'none' : 'auto',
                    }}
                  />
                );
              })}
            </div>
          </>
        )}

        {/* Player progress list */}
        {phase !== 'setup' && (
          <div className="w-full max-w-sm mt-4 grid grid-cols-2 gap-2">
            {(players || []).map((p, i) => (
              <div key={p.user_id} className="rounded-lg p-2 bg-white/5 border border-white/10 flex items-center justify-between">
                <span className="text-xs text-gray-300 truncate">{p.username}</span>
                <span className="text-xs font-bold" style={{ color: PLAYER_COLORS[i % PLAYER_COLORS.length] }}>
                  {placedBy[String(p.user_id)] || 0}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    {isOver && (
      <GameWinnerBanner
        winner={winner === 'draw' ? null : winner}
        players={players}
        gameType="jigsaw"
        gameStats={gameStats}
        isForfeit={gameState?.status === 'forfeited'}
        onClose={onClose}
        onPostResult={onPostResult}
      />
    )}
    </>
  );
}
