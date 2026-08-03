import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
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

// Board is now responsive (see the containerRef/ResizeObserver effect below)
// instead of a fixed 320px square — Expert (8x6=48 pieces) was genuinely
// cramped on a phone at a fixed size; this lets it use whatever room the
// screen actually has, up to a sensible cap.
const MIN_BOARD_PX = 260;
const MAX_BOARD_PX = 520;
const DEFAULT_BOARD_PX = 320;
const TAB_DEPTH = 0.32; // how far a tab/blank bulges, as a fraction of one cell's size

// Must match jigsawSnapFraction in jigsaw.go exactly — used for instant
// client-side "did this snap?" prediction on release, so the actor hears the
// right sound immediately rather than waiting on a server round-trip (same
// "predict locally, server re-validates regardless" pattern already used
// elsewhere in this game system, e.g. Othello/Checkers legal-move highlighting).
const JIGSAW_SNAP_FRACTION = 0.3;

// Live piece-drag position updates are throttled client-side to avoid
// flooding the relay channel — dragging a piece a few times a second is
// plenty smooth, no need to send on every pointermove.
const DRAG_SEND_INTERVAL_MS = 80;

const SOUND_BASE = 'https://letswatchout.b-cdn.net/games/sounds/jigsaw';
const SOUND_FILES = {
  pickup: `${SOUND_BASE}/pickup.wav`,
  snap: `${SOUND_BASE}/snap.wav`,
  wrong: `${SOUND_BASE}/wrong.wav`,
  complete: `${SOUND_BASE}/complete.wav`,
};
let jigsawSoundEnabled = true;
function playJigsawSound(name, { volume = 0.5 } = {}) {
  if (!jigsawSoundEnabled) return;
  const url = SOUND_FILES[name];
  if (!url) return;
  const audio = new Audio(url);
  audio.volume = Math.max(0, Math.min(1, volume));
  audio.play().catch(() => {});
}

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

// A handful of tiny sparkle dots that burst outward and fade — the "particle"
// half of the snap-into-place flourish. Mirrors Glass Bridge's ShatterBurst
// pattern in this same codebase (a fixed small count of divs, each a
// randomized outward trajectory via CSS custom properties consumed by one
// shared @keyframes), simplified since this doesn't need shard rotation.
function SnapSparkle() {
  const sparkles = Array.from({ length: 6 }, (_, i) => i);
  return (
    <div style={{ position: 'absolute', top: '50%', left: '50%', width: 0, height: 0, pointerEvents: 'none' }}>
      {sparkles.map(i => {
        const angle = (i / sparkles.length) * Math.PI * 2;
        const dist = 16 + Math.random() * 10;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        return (
          <span key={i} style={{
            position: 'absolute', width: 5, height: 5, borderRadius: '50%',
            background: 'radial-gradient(circle,#fff,#a5f3fc)',
            '--dx': `${dx}px`, '--dy': `${dy}px`,
            animation: 'jigsawSparkle 0.55s ease-out forwards',
          }} />
        );
      })}
    </div>
  );
}

function PuzzlePiece({ pieceId, row, col, cellW, cellH, edges, imageUrl, boardW, boardH, style, onPointerDownPiece, heldByColor, justSnapped }) {
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
        // The pop animation's own keyframes also set `transform` (needed to
        // scale-pulse the piece) — CSS animation shorthand takes over the
        // property for its duration, which would otherwise silently wipe out
        // this translate offset and visibly shift the piece for that 0.4s.
        // --tx/--ty carry the SAME offset into the keyframes via a CSS
        // custom property so every frame of the animation still includes it.
        transform: `translate(${-marginW}px, ${-marginH}px)`,
        '--tx': `${-marginW}px`,
        '--ty': `${-marginH}px`,
        animation: justSnapped ? 'jigsawSnapPop 0.4s ease-out' : undefined,
        ...style,
      }}
    >
      {justSnapped && <SnapSparkle />}
    </div>
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
  // useMemo (not `gs.pieces || {}`) so the fallback empty object is a stable
  // reference — otherwise every render would produce a new {} identity,
  // which the drag callback and the snap-detection effect below both take
  // as a dependency.
  const pieces = useMemo(() => gs.pieces || {}, [gs.pieces]);
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

  // Responsive board size — the outer content column (always rendered,
  // regardless of phase, unlike the board itself which only exists once
  // playing) is what we measure available width from.
  const contentContainerRef = useRef(null);
  const [boardPx, setBoardPx] = useState(DEFAULT_BOARD_PX);
  useEffect(() => {
    const el = contentContainerRef.current;
    if (!el) return;
    const compute = (width) => {
      // -32 for the container's own p-4 (16px) horizontal padding on each side.
      setBoardPx(Math.round(Math.max(MIN_BOARD_PX, Math.min(MAX_BOARD_PX, width - 32))));
    };
    compute(el.clientWidth);
    const obs = new ResizeObserver(([entry]) => compute(entry.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('jigsaw_sound_enabled') !== 'false'; } catch { return true; }
  });
  useEffect(() => {
    jigsawSoundEnabled = soundEnabled;
    try { localStorage.setItem('jigsaw_sound_enabled', String(soundEnabled)); } catch { /* ignore */ }
  }, [soundEnabled]);

  // Throttles piece_drag sends while actively dragging.
  const lastDragSendRef = useRef(0);
  // pieceIds whose snap/wrong sound was already played locally via
  // instant client-side prediction on release — the shared-state diff effect
  // below skips these once, so the actor never hears their own snap twice
  // (once predicted, once again when the confirmed state arrives).
  const predictedSnapsRef = useRef(new Set());
  // Tracks which pieceIds were already known to be placed, so the diff
  // effect below can tell "was just placed this update" from "already placed".
  const knownPlacedRef = useRef(new Set());
  // { [pieceId]: true } — pieces currently mid-pop-animation; entries
  // self-remove after the animation finishes.
  const [justSnapped, setJustSnapped] = useState({});

  const cellW = cols > 0 ? boardPx / cols : 0;
  const cellH = rows > 0 ? boardPx / rows : 0;

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

  // Detects pieces that just transitioned to placed=true (by anyone, on any
  // client) and triggers the snap sound + pop animation for them — skipping
  // any pieceId the local player's own release already predicted/played,
  // so placing your own piece never plays the sound twice.
  useEffect(() => {
    const currentlyPlaced = new Set(Object.keys(pieces).filter(id => pieces[id]?.placed));
    const newlyPlaced = [...currentlyPlaced].filter(id => !knownPlacedRef.current.has(id));
    knownPlacedRef.current = currentlyPlaced;
    if (newlyPlaced.length === 0) return;

    const toAnimate = {};
    newlyPlaced.forEach(id => {
      if (predictedSnapsRef.current.has(id)) {
        predictedSnapsRef.current.delete(id);
      } else {
        playJigsawSound('snap', { volume: 0.45 });
      }
      toAnimate[id] = true;
    });
    setJustSnapped(prev => ({ ...prev, ...toAnimate }));
    const t = setTimeout(() => {
      setJustSnapped(prev => {
        const next = { ...prev };
        newlyPlaced.forEach(id => delete next[id]);
        return next;
      });
    }, 450);
    return () => clearTimeout(t);
  }, [pieces]);

  // Triumphant chime once, the moment the puzzle actually completes.
  const wasOverRef = useRef(false);
  useEffect(() => {
    if (isOver && !wasOverRef.current) playJigsawSound('complete', { volume: 0.55 });
    wasOverRef.current = isOver;
  }, [isOver]);

  const handlePointerDown = useCallback((e, pieceId) => {
    if (isOver) return;
    const piece = pieces[pieceId];
    if (!piece) return;
    const isMine = piece.holder_id === currentUserId;
    if (piece.placed || (piece.holder_id && !isMine)) return; // placed, or held by someone else

    const boardRect = boardRef.current?.getBoundingClientRect();
    if (!boardRect) return;
    const pxX = (piece.x ?? 0) * boardPx;
    const pxY = (piece.y ?? 0) * boardPx;
    const pointerBoardX = e.clientX - boardRect.left;
    const pointerBoardY = e.clientY - boardRect.top;

    dragRef.current = { pieceId, offsetX: pointerBoardX - pxX, offsetY: pointerBoardY - pxY };
    setDragPos({ pieceId, x: pxX, y: pxY });
    playJigsawSound('pickup', { volume: 0.4 });

    if (!isMine) onMove({ move_type: 'pickup', piece_id: pieceId });

    const handleMove = (moveEvt) => {
      if (!dragRef.current) return;
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = moveEvt.clientX - rect.left - dragRef.current.offsetX;
      const y = moveEvt.clientY - rect.top - dragRef.current.offsetY;
      setDragPos({ pieceId: dragRef.current.pieceId, x, y });

      // Live position broadcast — throttled, so teammates see this piece
      // actually moving instead of jumping from tray to final spot on
      // release. No local rendering change needed for the RECEIVING side:
      // any piece that isn't the local client's own active drag already
      // renders from piece.x/piece.y in shared game state.
      const now = Date.now();
      if (now - lastDragSendRef.current >= DRAG_SEND_INTERVAL_MS) {
        lastDragSendRef.current = now;
        onMove({ move_type: 'piece_drag', piece_id: dragRef.current.pieceId, x: x / boardPx, y: y / boardPx });
      }
    };
    const handleUp = (upEvt) => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      if (!dragRef.current) return;
      const rect = boardRef.current?.getBoundingClientRect();
      const x = rect ? (upEvt.clientX - rect.left - dragRef.current.offsetX) / boardPx : 0;
      const y = rect ? (upEvt.clientY - rect.top - dragRef.current.offsetY) / boardPx : 0;

      // Instant local prediction of whether this drop will snap — mirrors
      // jigsaw.go's exact snap-check formula, so the person releasing hears
      // the right sound immediately instead of waiting on the server
      // round-trip. The server re-validates and is the actual source of
      // truth regardless; predictedSnapsRef just stops the shared-state diff
      // effect from playing the snap sound a second time for this same piece.
      const correctX = piece.col / cols;
      const correctY = piece.row / rows;
      const willSnap = Math.abs(x - correctX) < JIGSAW_SNAP_FRACTION / cols &&
        Math.abs(y - correctY) < JIGSAW_SNAP_FRACTION / rows;
      if (willSnap) {
        predictedSnapsRef.current.add(dragRef.current.pieceId);
        playJigsawSound('snap', { volume: 0.45 });
      } else {
        playJigsawSound('wrong', { volume: 0.3 });
      }

      onMove({ move_type: 'release', piece_id: dragRef.current.pieceId, x, y });
      dragRef.current = null;
      setDragPos(null);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [pieces, isOver, currentUserId, onMove, boardPx, cols, rows]);

  const playerColorFor = useCallback((userId) => {
    const idx = (players || []).findIndex(p => p.user_id === userId);
    return idx >= 0 ? PLAYER_COLORS[idx % PLAYER_COLORS.length] : '#94a3b8';
  }, [players]);

  return (
    <>
    <div className="fixed inset-0 z-50 flex flex-col text-white select-none overflow-y-auto"
      style={{ background: 'linear-gradient(180deg,#1e1b4b 0%,#0f172a 100%)' }}>
      <style>{`
        @keyframes jigsawSnapPop {
          0%   { transform: translate(var(--tx), var(--ty)) scale(0.85); filter: brightness(1.6) drop-shadow(0 0 8px rgba(165,243,252,0.9)); }
          60%  { transform: translate(var(--tx), var(--ty)) scale(1.08); filter: brightness(1.25) drop-shadow(0 0 4px rgba(165,243,252,0.6)); }
          100% { transform: translate(var(--tx), var(--ty)) scale(1); filter: brightness(1) drop-shadow(0 0 0 rgba(165,243,252,0)); }
        }
        @keyframes jigsawSparkle {
          0%   { transform: translate(0,0) scale(1); opacity: 1; }
          100% { transform: translate(var(--dx),var(--dy)) scale(0.3); opacity: 0; }
        }
      `}</style>

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
          <button
            onClick={() => setSoundEnabled(v => !v)}
            className="p-1 text-white/60 hover:text-white transition-colors"
            title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <GameRulesButton gameType="jigsaw" className="text-white/60 hover:text-white" />
          {onEndGame && (
            <button onClick={() => { onEndGame?.(); onClose?.(); }} className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded-lg">
              End
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg">✕</button>
        </div>
      </div>

      <div ref={contentContainerRef} className="flex-1 overflow-y-auto p-4 flex flex-col items-center">

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
              style={{ width: boardPx, height: boardPx * 1.9, touchAction: 'none' }}>
              {/* Faint outline of the target picture, so people can see what they're building toward */}
              <div className="absolute top-0 left-0 rounded-lg overflow-hidden"
                style={{ width: boardPx, height: boardPx, opacity: 0.12, border: '1px dashed rgba(255,255,255,0.3)' }}>
                <img src={imageUrl} alt="" className="w-full h-full object-cover" />
              </div>

              {Object.entries(pieces).map(([pieceId, piece]) => {
                const edges = pieceEdges(piece.row, piece.col, rows, cols, vEdges, hEdges);
                const isMine = piece.holder_id === currentUserId;
                const isDraggingThis = dragPos && dragPos.pieceId === pieceId && isMine;
                const x = isDraggingThis ? dragPos.x : (piece.x ?? 0) * boardPx;
                const y = isDraggingThis ? dragPos.y : (piece.y ?? 0) * boardPx;
                const heldColor = piece.holder_id ? playerColorFor(piece.holder_id) : null;
                return (
                  <PuzzlePiece
                    key={pieceId}
                    pieceId={pieceId}
                    row={piece.row} col={piece.col}
                    cellW={cellW} cellH={cellH}
                    edges={edges}
                    imageUrl={imageUrl}
                    boardW={boardPx} boardH={boardPx}
                    heldByColor={heldColor}
                    justSnapped={!!justSnapped[pieceId]}
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
