// src/components/Games/GolfGame.jsx
// Hot-seat mini-golf, iframe-embedded — a fork of LCmaster/minigolf ("Mini
// Golf Mania", MIT), hosted separately (Vercel) since it needs its own
// SvelteKit build pipeline, same isolation rationale as DOOM/Quake3. The
// fork itself has no WeWatch-specific code beyond a single bridge in
// GameScreen.svelte/+page.svelte: `?embed=1` auto-starts the always-local
// Practice Course (skips the course picker, never needs Firestore), and it
// posts exactly one `golf:finished` message per turn (total strokes across
// however many holes were played — either all of them, or up to an early
// quit) followed by `golf:exit`. This component never renders its own game
// logic — it's a thin iframe wrapper + hot-seat state machine, mirroring
// ToadBallGame.jsx's tournament branch precedence exactly, since golf has
// no native multiplayer of its own (same category as Toad Ball/Fowl Play,
// not a true simultaneous-multiplayer game like Ping Pong).
import { useEffect, useRef, useState } from 'react';
import GameRulesButton from './GameRulesButton';

const GOLF_ORIGIN = 'https://wewatch-golf.vercel.app';
const GOLF_URL = `${GOLF_ORIGIN}/game?embed=1`;

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
}) {
  const [loaded, setLoaded] = useState(false);
  const [myResult, setMyResult] = useState(null); // { totalStrokes, holesCompleted, totalHoles }
  const scoreReportedRef = useRef(false);
  const iframeRef = useRef(null);

  const isInTournament = !!hotSeatTournament;
  const isMyTurn = isInTournament && hotSeatTournament.current_player_id === currentUserId;

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
  }, [isInTournament, onTournamentScore, onClose]);

  // 1. Non-host, hot-seat tournament active: spectator card naming whoever
  //    currently has the device.
  if (!isHost && isInTournament) {
    const currentPlayerName = hotSeatTournament?.current_player_name ?? 'someone';
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">⛳</span>
        <p className="text-lg font-semibold">{currentPlayerName}'s turn at Mini Golf!</p>
        <p className="text-sm text-gray-400">Sit back and cheer them on.</p>
        <button onClick={onClose} className="mt-2 px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">Close</button>
      </div>
    );
  }

  // 2. Non-host, no tournament: plain spectator.
  if (!isHost) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">⛳</span>
        <p className="text-lg font-semibold">Someone's playing Mini Golf!</p>
        <p className="text-sm text-gray-400">Sit back and cheer them on.</p>
        <button onClick={onClose} className="mt-2 px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">Close</button>
      </div>
    );
  }

  // 3. Host device, tournament active, but it's someone else's turn.
  if (isInTournament && !isMyTurn && myResult === null) {
    const currentPlayerName = hotSeatTournament?.current_player_name ?? '…';
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">⏳</span>
        <p className="text-lg font-semibold">Pass the device to {currentPlayerName}</p>
        <p className="text-sm text-gray-400">Waiting for their turn to start…</p>
        {onEndGame && <button onClick={() => { onEndGame?.(); onClose?.(); }} className="mt-2 px-5 py-2 bg-red-700 hover:bg-red-800 rounded-lg text-sm transition-colors">End Tournament</button>}
      </div>
    );
  }

  // 4. Host device, my hot-seat turn just ended — waiting for the rotation.
  if (isInTournament && myResult !== null) {
    const { totalStrokes, holesCompleted, totalHoles } = myResult;
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">🏌️</span>
        <p className="text-lg font-semibold">
          {totalStrokes} stroke{totalStrokes === 1 ? '' : 's'}
          {holesCompleted > 0 ? ` — ${holesCompleted}/${totalHoles} holes` : ' (quit early)'}
        </p>
        <p className="text-sm text-gray-400">Fewer strokes wins — pass the device to the next player…</p>
      </div>
    );
  }

  // 5. Actual gameplay — solo arcade, or the active player's hot-seat turn.
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
