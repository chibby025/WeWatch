// src/components/Games/GolfGame.jsx
// Hot-seat mini-golf, iframe-embedded — a fork of LCmaster/minigolf ("Mini
// Golf Mania", MIT), hosted separately (Vercel) since it needs its own
// SvelteKit build pipeline, same isolation rationale as DOOM/Quake3. The
// fork itself has no WeWatch-specific code beyond a bridge in
// GameScreen.svelte/+page.svelte/Stage.svelte: `?embed=1` auto-starts the
// always-local Practice Course (skips the course picker, never needs
// Firestore), and it posts exactly one `golf:finished` message per turn
// (total strokes across however many holes were played — either all of
// them, or up to an early quit) followed by `golf:exit`. It also posts
// throttled `golf:live` position updates while the ball is moving, and has
// a matching `?spectate=1` read-only mode that renders the SAME
// deterministic course geometry with a non-physics ball driven purely by
// relayed position — a genuine, real 3D live mirror for spectators, not
// just a status card. This component relays golf:live between the two
// iframes via the same generic relay_packet WS mechanism ToadBallGame.jsx/
// FowlPlayGame.jsx already established.
import { useEffect, useRef, useState } from 'react';
import GameRulesButton from './GameRulesButton';

const GOLF_ORIGIN = 'https://wewatch-golf.vercel.app';
const GOLF_URL = `${GOLF_ORIGIN}/game?embed=1`;
const GOLF_SPECTATE_URL = `${GOLF_ORIGIN}/game?spectate=1`;

// Arcade: solo play, or a hot-seat tournament (players take turns on the room
// host's own device — see ToadBallGame.jsx for the established precedent
// this mirrors). All hooks stay unconditional regardless of isHost/
// isInTournament (Rules of Hooks) — the placeholder branches below just
// return before the iframe ever mounts for a viewer who shouldn't be playing.
export default function GolfGame({
  onClose,
  onEndGame,
  isHost = true,
  hotSeatTournament = null,
  currentUserId = null,
  onTournamentScore = null,
  onRelayPacket = null,
  registerRelayReceiver = null,
}) {
  const [loaded, setLoaded] = useState(false);
  const [myResult, setMyResult] = useState(null); // { totalStrokes, holesCompleted, totalHoles }
  const scoreReportedRef = useRef(false);
  const iframeRef = useRef(null);
  const spectatorIframeRef = useRef(null);

  const isInTournament = !!hotSeatTournament;
  const isMyTurn = isInTournament && hotSeatTournament.current_player_id === currentUserId;
  // Anyone not currently taking their own turn (or, for a solo game, anyone
  // who isn't the one playing) is a live spectator. myResult !== null keeps
  // the just-finished player on their own results screen (branch below)
  // rather than immediately flipping them into spectator mode.
  const isSpectating = isInTournament ? (!isMyTurn && myResult === null) : !isHost;

  // Fresh turn each time the current player changes (or on first solo mount).
  useEffect(() => {
    if (isInTournament && !isMyTurn) return;
    scoreReportedRef.current = false;
    setMyResult(null);
    setLoaded(false);
  }, [hotSeatTournament?.current_player_id, isInTournament, isMyTurn]);

  useEffect(() => {
    function handleMessage(event) {
      if (event.origin !== GOLF_ORIGIN) return;
      if (event.data?.type === 'golf:live') {
        // Relay the active player's own ball-position updates to the rest
        // of the room — only the real active player's iframe ever emits
        // this (the fork's own readOnly guard already prevents a spectator
        // iframe from doing so), but check isMyTurn/isHost here too rather
        // than trust the message's origin/shape alone.
        const amActive = isInTournament ? isMyTurn : isHost;
        if (amActive) onRelayPacket?.(btoa(JSON.stringify(event.data)));
        return;
      }
      if (event.data?.type === 'golf:finished') {
        if (scoreReportedRef.current) return;
        scoreReportedRef.current = true;
        const { totalStrokes = 0, holesCompleted = 0, totalHoles = 0 } = event.data;
        setMyResult({ totalStrokes, holesCompleted, totalHoles });
        // Fewer strokes is better — the backend's HotSeatManager already
        // knows to flip the win condition for "golf" (lowerScoreWinsGameTypes),
        // so the raw stroke count is reported as-is, no inversion needed.
        if (isInTournament && onTournamentScore) onTournamentScore(totalStrokes);
      } else if (event.data?.type === 'golf:exit') {
        // Defensive fallback — golf:finished always fires first in practice
        // (see GameScreen.svelte's reportScoreIfNeeded), but never end a
        // hot-seat turn with no score reported at all.
        if (isInTournament && !scoreReportedRef.current) {
          scoreReportedRef.current = true;
          setMyResult({ totalStrokes: 0, holesCompleted: 0, totalHoles: 0 });
          onTournamentScore?.(0);
        }
        // Solo (no tournament): a real close, matching DOOM's exit semantics.
        if (!isInTournament) onClose?.();
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isInTournament, isMyTurn, isHost, onTournamentScore, onClose, onRelayPacket]);

  // Spectator side: forward every relayed golf:live packet straight into the
  // read-only iframe's own window — it does its own postMessage listening
  // (see GameScreen.svelte's handleLiveMessage), no parsing needed here
  // beyond the same base64/JSON envelope every relay_packet consumer uses.
  useEffect(() => {
    if (!registerRelayReceiver || !isSpectating) return;
    registerRelayReceiver((payload) => {
      try {
        const data = JSON.parse(atob(payload));
        spectatorIframeRef.current?.contentWindow?.postMessage(data, GOLF_ORIGIN);
      } catch {
        // Malformed/foreign relay payload — ignore rather than crash the mirror.
      }
    });
    return () => registerRelayReceiver(null);
  }, [registerRelayReceiver, isSpectating]);

  // 1. Live spectator mirror — a real, read-only 3D view of the same course,
  // driven by the active player's relayed ball position (see golf_source's
  // Stage.svelte readOnly mode). Covers every "not my turn right now" case:
  // a genuinely different viewer, or the narrow race window where this
  // device's own isHost/isMyTurn haven't converged yet after a turn change.
  if (isSpectating) {
    const currentPlayerName = isInTournament ? (hotSeatTournament?.current_player_name ?? 'Someone') : 'Someone';
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black select-none">
        <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
          <h2 className="text-sm font-bold tracking-widest text-green-400">MINI GOLF</h2>
          <div className="flex gap-2">
            {isInTournament && onEndGame && (
              <button onClick={() => { onEndGame?.(); onClose?.(); }} className="px-2 py-1 text-xs bg-red-700 hover:bg-red-800 rounded font-medium">End Tournament</button>
            )}
            <button onClick={onClose} className="px-2 py-1 text-xs bg-white/20 hover:bg-white/30 rounded">✕</button>
          </div>
        </div>
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-purple-700/90 text-white text-sm font-semibold rounded-full shadow">
          ⛳ {currentPlayerName}'s turn — watching live!
        </div>
        <div className="relative flex-1">
          <iframe
            ref={spectatorIframeRef}
            src={GOLF_SPECTATE_URL}
            title="Mini Golf (spectator)"
            className="w-full h-full border-0 pointer-events-none"
            allow="autoplay"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>
    );
  }

  // 2. My hot-seat turn just ended — waiting for the rotation
  // (or, in bracket mode, eliminated from further play).
  if (isInTournament && myResult !== null) {
    const { totalStrokes, holesCompleted, totalHoles } = myResult;
    const isEliminated = hotSeatTournament?.participants?.some(
      (p) => p.user_id === currentUserId && p.eliminated
    );
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">🏌️</span>
        <p className="text-lg font-semibold">
          {totalStrokes} stroke{totalStrokes === 1 ? '' : 's'}
          {holesCompleted > 0 ? ` — ${holesCompleted}/${totalHoles} holes` : ' (quit early)'}
        </p>
        {isEliminated ? (
          <p className="text-sm text-gray-400">You were eliminated — thanks for playing!</p>
        ) : (
          <p className="text-sm text-gray-400">Fewer strokes wins — pass the device to the next player…</p>
        )}
      </div>
    );
  }

  // 3. Actual gameplay — solo arcade, or the active player's hot-seat turn.
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black select-none">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold tracking-widest text-green-400">MINI GOLF</h2>
          <GameRulesButton gameType="golf" className="text-gray-500" />
        </div>
        <div className="flex gap-2">
          {onEndGame && <button onClick={() => { onEndGame?.(); onClose?.(); }} className="px-2 py-1 text-xs bg-red-700 hover:bg-red-800 rounded font-medium">End</button>}
          <button onClick={onClose} className="px-2 py-1 text-xs bg-white/20 hover:bg-white/30 rounded">✕</button>
        </div>
      </div>

      {isInTournament && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-purple-700/90 text-white text-sm font-semibold rounded-full shadow">
          🏆 Your turn — fewest strokes wins!
        </div>
      )}

      <div className="relative flex-1">
        {!loaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 bg-black">
            <div className="w-10 h-10 rounded-full border-2 border-white/25 border-t-white animate-spin" />
            <p className="text-sm text-gray-400">Loading course… (first load may take a moment)</p>
          </div>
        )}
        <iframe
          ref={iframeRef}
          key={hotSeatTournament?.current_player_id ?? 'solo'}
          src={GOLF_URL}
          title="Mini Golf"
          className="w-full h-full border-0"
          onLoad={() => setLoaded(true)}
          allow="autoplay"
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      </div>
    </div>
  );
}
