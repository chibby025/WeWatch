import { useRef, useEffect, useState, useCallback } from 'react';
import { X as CloseIcon, Volume2, VolumeX } from 'lucide-react';

// 8-ball pool — embeds a forked, GPL-3.0 real-physics 3D engine
// (tailuge/billiards) in a sandboxed iframe, same pattern already
// established in this codebase for DOOM/Quake3/Golf/Micro Racing/Obby
// Parkour: keep the GPL-licensed game module cleanly separate from the
// proprietary WeWatch codebase, communicate only via postMessage.
//
// Both connected players' iframes always run the engine's own
// "isSinglePlayer" local mode (no ruletype other than eightball, no wss/bot
// params) — the embedded game therefore never tries to pass turns or judge
// fouls on its own; it's a pure physics-and-rendering sandbox. WeWatch is the
// sole authority on whose turn it is (gates interaction via a postMessage
// flag) and pool.go is the sole authority on foul/turn/win logic — completely
// unchanged from the previous from-scratch canvas implementation, which is
// why this rewrite needed zero backend changes. The shooter's own device
// reports raw shot facts (which balls pocketed, cue scratch, first contact,
// every ball's resting position) via the engine's own already-built-in
// "stationary" iframe hook (src/controller/playshot.ts in the fork),
// intercepted and re-shaped by dist/wewatch-bridge.js into the exact
// {pocketed, cue_scratched, cue_x, cue_y, first_contact, ball_positions}
// shape pool.go already validates. The non-shooting player's device never
// sees that shot happen locally — it's told the final resting positions via
// a "sync_state" message once pool.go's response comes back, since each
// connected player runs a fully independent local physics simulation.
const POOL_ENGINE_BASE_URL = 'https://wewatch-pool.vercel.app';

const TYPE_LABEL = { solids: '● Solids', stripes: '◑ Stripes' };
const typeLabel = (t) => TYPE_LABEL[t] || 'Open table';

export default function PoolGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const iframeRef = useRef(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('pool_sound_enabled') !== 'false'; } catch { return true; }
  });

  const data = gameState?.game_state || {};
  const p0Type = data.p0_type || '';
  const p1Type = data.p1_type || '';
  const lastFoul = data.last_foul || '';
  const ballInHandFromServer = !!data.ball_in_hand;
  const status = gameState?.status;
  const isOver = status === 'finished' || status === 'completed' || status === 'forfeited';
  const winnerId = gameState?.winner_id;

  const myIdx = players?.findIndex(p => p.user_id === currentUserId);
  const myTurnIdx = gameState?.current_turn ?? 0;
  const isMyTurn = myIdx === myTurnIdx;

  const myType = myIdx === 0 ? p0Type : p1Type;
  const oppType = myIdx === 0 ? p1Type : p0Type;
  const myName = players?.[myIdx]?.username || 'You';
  const oppName = players?.[1 - myIdx]?.username || 'Opponent';

  // my_ball_type as the fork's own numeric convention (0 unassigned, 1
  // solids, 2 stripes) — pushed into the embedded engine's own Session so its
  // aim-assist highlighting (which ball to hit) reflects the real assigned
  // group even in an iframe that's never personally potted one of that
  // player's own balls yet. Purely cosmetic inside the engine; the real
  // foul/turn logic never reads it — see pool.go, unchanged.
  const myBallTypeNumeric = myType === 'solids' ? 1 : myType === 'stripes' ? 2 : 0;

  const postToFrame = useCallback((msg) => {
    iframeRef.current?.contentWindow?.postMessage({ source: 'wewatch-parent', ...msg }, '*');
  }, []);

  // Listen for messages FROM the embedded engine (via dist/wewatch-bridge.js
  // in the fork). Validates the sender is genuinely this component's own
  // iframe, not just any postMessage with a matching source string.
  useEffect(() => {
    const handler = (event) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || data.source !== 'wewatch-pool') return;
      if (data.type === 'ready') {
        setIframeReady(true);
      } else if (data.type === 'shot') {
        onMove({ move_type: 'shot', ...data.payload });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onMove]);

  // Sync the embedded board to the authoritative post-shot state and gate
  // interaction to whoever's turn it actually is, every time pool.go's own
  // state changes. Re-syncing the shooter's own device to the exact
  // positions it just reported is a harmless no-op — this is what makes late
  // joins/reconnects and the non-shooting player's board both work for free.
  useEffect(() => {
    if (!iframeReady) return;
    postToFrame({
      type: 'sync_state',
      payload: {
        ball_positions: data.ball_positions || {},
        ball_in_hand: ballInHandFromServer,
        my_ball_type: myBallTypeNumeric,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeReady, JSON.stringify(data.ball_positions), ballInHandFromServer, myBallTypeNumeric, postToFrame]);

  useEffect(() => {
    if (!iframeReady) return;
    postToFrame({ type: 'set_interactive', value: isMyTurn && !isOver });
  }, [iframeReady, isMyTurn, isOver, postToFrame]);

  useEffect(() => {
    if (!iframeReady) return;
    postToFrame({ type: 'set_muted', value: !soundEnabled });
  }, [iframeReady, soundEnabled, postToFrame]);

  useEffect(() => {
    try { localStorage.setItem('pool_sound_enabled', String(soundEnabled)); } catch { /* ignore */ }
  }, [soundEnabled]);

  if (isOver) {
    const iWon = winnerId === currentUserId;
    const isDraw = winnerId == null;
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-950 gap-6 text-white">
        <span className="text-7xl">{isDraw ? '🤝' : iWon ? '🏆' : '😔'}</span>
        <h2 className="text-3xl font-black">{isDraw ? "Draw!" : iWon ? 'You Win!' : 'You Lose!'}</h2>
        <button onClick={() => { onEndGame?.(); onClose?.(); }}
          className="px-8 py-3 bg-purple-600 hover:bg-purple-700 rounded-xl font-semibold">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold">{myName}</span>
          <span className="text-gray-500">{typeLabel(myType)}</span>
          {isMyTurn && <span className="px-2 py-0.5 bg-green-600 rounded text-xs font-bold">YOUR TURN</span>}
        </div>
        <span className="font-bold">🎱 8-Ball Pool</span>
        <div className="flex items-center gap-3 text-sm">
          {!isMyTurn && <span className="px-2 py-0.5 bg-orange-600 rounded text-xs font-bold">{oppName}'s TURN</span>}
          <span className="text-gray-500">{typeLabel(oppType)}</span>
          <span className="font-semibold">{oppName}</span>
          <button
            onClick={() => setSoundEnabled(v => !v)}
            className="ml-1 p-1 hover:text-gray-300 text-gray-500"
            title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button onClick={() => { onEndGame?.(); onClose?.(); }} className="p-1 hover:text-gray-300 text-gray-500">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Foul banner */}
      {lastFoul && (
        <div className="bg-red-700 text-center text-sm py-1 font-semibold flex-shrink-0">
          ⚠️ Foul: {lastFoul.replace(/_/g, ' ')} — opponent gets ball in hand
        </div>
      )}

      {/* Ball in hand instruction */}
      {ballInHandFromServer && isMyTurn && (
        <div className="bg-yellow-700 text-center text-sm py-1 font-semibold flex-shrink-0">
          🖱️ Drag the cue ball to place it, then aim as normal
        </div>
      )}

      {/* Waiting indicator */}
      {!isMyTurn && (
        <div className="bg-gray-800 text-center text-sm py-1 text-gray-400 flex-shrink-0">
          Waiting for {players?.[myTurnIdx]?.username || 'opponent'}…
        </div>
      )}

      {/* Embedded engine */}
      <div className="flex-1 min-h-0 relative">
        <iframe
          ref={iframeRef}
          title="Pool"
          src={`${POOL_ENGINE_BASE_URL}/wewatch.html?ruletype=eightball`}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-pointer-lock"
          allow="autoplay"
        />
      </div>
    </div>
  );
}
