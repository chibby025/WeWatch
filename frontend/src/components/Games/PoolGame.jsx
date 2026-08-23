import { useRef, useEffect, useState, useCallback } from 'react';
import { X as CloseIcon, Volume2, VolumeX, Flag } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';

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

// Real 8-ball colors, one entry per ball number (1-7 solids and 9-15
// stripes share the same 7-color set) — used to render small ball icons in
// the header so each player's row visually accumulates the balls they've
// actually sunk, not just a turn badge.
const POOL_BALL_COLORS = {
  1: '#e8b923', 9: '#e8b923', // yellow
  2: '#1d5fd6', 10: '#1d5fd6', // blue
  3: '#d6362a', 11: '#d6362a', // red
  4: '#7c3aa8', 12: '#7c3aa8', // purple
  5: '#e8791f', 13: '#e8791f', // orange
  6: '#1f8a3d', 14: '#1f8a3d', // green
  7: '#7a2e21', 15: '#7a2e21', // maroon
  8: '#161616', // black
};
const poolBallGroup = (id) => (id === 8 ? 'eight' : id >= 1 && id <= 7 ? 'solids' : id >= 9 && id <= 15 ? 'stripes' : null);

function PoolBallIcon({ id }) {
  const group = poolBallGroup(id);
  const color = POOL_BALL_COLORS[id] || '#888';
  const isStripe = group === 'stripes';
  return (
    <span
      title={`Ball ${id}`}
      className="inline-flex items-center justify-center flex-shrink-0"
      style={{
        width: 17,
        height: 17,
        borderRadius: '50%',
        fontSize: 9,
        fontWeight: 700,
        lineHeight: 1,
        color: isStripe ? '#1a1a1a' : '#fff',
        background: isStripe
          ? `linear-gradient(to bottom, #fff 0%, #fff 27%, ${color} 27%, ${color} 73%, #fff 73%, #fff 100%)`
          : color,
        boxShadow: 'inset -1px -2px 2px rgba(0,0,0,0.35), inset 1px 1px 1px rgba(255,255,255,0.4)',
        border: '1px solid rgba(0,0,0,0.4)',
      }}
    >
      {id}
    </span>
  );
}

export default function PoolGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const iframeRef = useRef(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('pool_sound_enabled') !== 'false'; } catch { return true; }
  });
  // One-time "how to play" hint — the embedded engine drops the player
  // straight onto the table with no on-screen instruction at all. Dismissed
  // state persists the same way soundEnabled does above.
  const [showControlsHint, setShowControlsHint] = useState(() => {
    try { return localStorage.getItem('pool_controls_hint_dismissed') !== 'true'; } catch { return true; }
  });
  const dismissControlsHint = () => {
    setShowControlsHint(false);
    try { localStorage.setItem('pool_controls_hint_dismissed', 'true'); } catch { /* ignore */ }
  };

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

  // Split the shared `pocketed` list by which player's group each ball
  // belongs to, for the small ball-icon row rendered under each name below —
  // a running visual tally of who's actually ahead, not just a turn badge.
  // The 8-ball never "belongs" to a group the way solids/stripes do, so it's
  // only ever shown once the match is over, attached to whichever player
  // legally won by potting it (the deciding, final ball) — never on an
  // ongoing game.
  const pocketedIds = Array.isArray(data.pocketed)
    ? data.pocketed.map(Number).filter((n) => Number.isInteger(n))
    : [];
  const myPocketed = pocketedIds.filter((id) => id !== 8 && myType && poolBallGroup(id) === myType);
  const oppPocketed = pocketedIds.filter((id) => id !== 8 && oppType && poolBallGroup(id) === oppType);
  if (isOver && winnerId != null && pocketedIds.includes(8)) {
    (winnerId === currentUserId ? myPocketed : oppPocketed).push(8);
  }
  // Sort each row ascending, but always keep the 8-ball last regardless of
  // its numeric value — it's the deciding, final ball, not just another
  // group member, and reads better appended at the end of the sequence.
  const ballSortKey = (id) => (id === 8 ? Infinity : id);
  myPocketed.sort((a, b) => ballSortKey(a) - ballSortKey(b));
  oppPocketed.sort((a, b) => ballSortKey(a) - ballSortKey(b));

  // my_ball_type as the fork's own numeric convention (0 unassigned, 1
  // solids, 2 stripes) — pushed into the embedded engine's own Session so its
  // aim-assist highlighting (which ball to hit) reflects the real assigned
  // group even in an iframe that's never personally potted one of that
  // player's own balls yet. Purely cosmetic inside the engine; the real
  // foul/turn logic never reads it — see pool.go, unchanged.
  const myBallTypeNumeric = myType === 'solids' ? 1 : myType === 'stripes' ? 2 : 0;

  // Either player can end the match early (matches pool.go's own backend
  // model — 8-ball is a real 2-player 1v1 game with no host/spectator
  // asymmetry, same as Rock Paper Scissors/Tic-Tac-Toe's established
  // pattern). Backend's handleGameEnd is fully generic ("any participant can
  // forfeit — the other player wins"), so this needs zero pool.go changes —
  // onEndGame already exists as a prop, wired from GameOverlay.jsx.
  const handleForfeit = () => {
    if (onEndGame) onEndGame();
    else onClose?.();
  };

  const winnerPlayer = winnerId != null ? players?.find(p => p.user_id === winnerId) : null;

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
      } else if (data.type === 'shot_progress') {
        // Live, in-progress relay while the shooter's own balls are still
        // rolling — purely cosmetic (see pool.go's processPoolShotProgress),
        // never touches foul/turn/win state.
        onMove({ move_type: 'shot_progress', ...data.payload });
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

  // Forwards the shooter's live, in-progress ball positions to this
  // player's own iframe (a no-op harmless echo on the shooter's own device —
  // the bridge's applyShotProgress ignores it there via isMyTurnNow) as a
  // distinct 'shot_live' message, deliberately NOT reusing 'sync_state' —
  // see wewatch-bridge.js's own header comment for why a bare-snap channel
  // and a velocity-extrapolated live-relay channel need to stay separate.
  useEffect(() => {
    if (!iframeReady) return;
    if (!data.live_ball_positions || Object.keys(data.live_ball_positions).length === 0) return;
    postToFrame({
      type: 'shot_live',
      payload: { live_ball_positions: data.live_ball_positions },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeReady, JSON.stringify(data.live_ball_positions), postToFrame]);

  useEffect(() => {
    if (!iframeReady) return;
    postToFrame({ type: 'set_muted', value: !soundEnabled });
  }, [iframeReady, soundEnabled, postToFrame]);

  useEffect(() => {
    try { localStorage.setItem('pool_sound_enabled', String(soundEnabled)); } catch { /* ignore */ }
  }, [soundEnabled]);

  return (
    <>
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white">
      {/* Header — two rows: title/controls on top, player/turn status below.
          Keeping both on one row got jampacked once real usernames + type
          labels + a turn badge were all fighting for the same line. */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-900 border-b border-gray-800/60 flex-shrink-0">
        <span className="font-bold text-sm">🎱 8-Ball Pool</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSoundEnabled(v => !v)}
            className="p-1 hover:text-gray-300 text-gray-500"
            title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={handleForfeit}
            className="flex items-center gap-1 px-2 py-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 hover:text-red-300 rounded-lg text-xs font-semibold transition-colors"
            title="End the game — your opponent wins"
          >
            <Flag className="w-3.5 h-3.5" />
            End Game
          </button>
          <button onClick={() => { onEndGame?.(); onClose?.(); }} className="p-1 hover:text-gray-300 text-gray-500" title="Leave">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="flex items-start justify-between gap-2 px-4 py-1.5 bg-gray-900 border-b border-gray-800 flex-shrink-0 text-sm">
        <div className="flex flex-col items-start gap-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold truncate">{myName}</span>
            <span className="text-gray-500 text-xs whitespace-nowrap flex-shrink-0">{typeLabel(myType)}</span>
            {isMyTurn && <span className="px-2 py-0.5 bg-green-600 rounded text-xs font-bold flex-shrink-0">YOUR TURN</span>}
          </div>
          {myPocketed.length > 0 && (
            <div className="flex items-center gap-0.5 flex-wrap">
              {myPocketed.map((id) => <PoolBallIcon key={id} id={id} />)}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0 justify-end">
            {!isMyTurn && <span className="px-2 py-0.5 bg-orange-600 rounded text-xs font-bold flex-shrink-0">{oppName}'s TURN</span>}
            <span className="text-gray-500 text-xs whitespace-nowrap flex-shrink-0">{typeLabel(oppType)}</span>
            <span className="font-semibold truncate">{oppName}</span>
          </div>
          {oppPocketed.length > 0 && (
            <div className="flex items-center gap-0.5 flex-wrap justify-end">
              {oppPocketed.map((id) => <PoolBallIcon key={id} id={id} />)}
            </div>
          )}
        </div>
      </div>

      {/* How to play — the embedded 3D table gives no on-screen instruction
          at all otherwise. Dismisses permanently once closed (localStorage);
          skipped whenever a more specific/urgent banner (foul, ball-in-hand)
          is already showing, and only shown on the player's own turn. */}
      {showControlsHint && isMyTurn && !lastFoul && !ballInHandFromServer && (
        <div className="bg-blue-900/60 text-center text-xs py-1.5 px-3 flex items-center justify-center gap-2 flex-shrink-0">
          <span>🎯 Drag to aim (or use the arrow keys) · scroll the wheel or hold to set power · click/tap again (or Space) to shoot</span>
          <button onClick={dismissControlsHint} className="text-gray-300 hover:text-white font-bold flex-shrink-0">✕</button>
        </div>
      )}

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

    {isOver && (
      <GameWinnerBanner
        winner={winnerPlayer}
        gameType="pool"
        gameStats={{
          lines: (players || []).map((p, idx) => ({
            label: p.username,
            value: typeLabel(idx === 0 ? p0Type : p1Type),
          })),
        }}
        isForfeit={status === 'forfeited'}
        onClose={onClose}
        onPostResult={onPostResult}
      />
    )}
    </>
  );
}
