import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Keyboard, Trophy, Flag } from 'lucide-react';

const RACE_SECONDS = 90;
const COUNTDOWN_SECONDS = 3;

// Typing Race: everyone types the same passage. Character-by-character coloring
// (green = correct, red = wrong, gray = untyped). Progress + WPM reported to the
// backend every second and on completion; the host declares time_up when the
// countdown hits zero.
export default function TypingRaceGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const gs = gameState?.game_state || {};
  const passage = gs.passage || '';
  const progress = gs.progress || {};
  const phase = gs.phase || 'racing';

  const isHostUser = (gameState?.host_id ?? players?.[0]?.user_id) === currentUserId;
  const isPlayer = (players || []).some(p => p.user_id === currentUserId);
  const finished = phase === 'finished' || gameState?.status === 'finished';

  const [typed, setTyped] = useState('');
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [started, setStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(RACE_SECONDS);
  const inputRef = useRef(null);
  const startMsRef = useRef(null);
  const lastReportRef = useRef(0);
  const timeUpSentRef = useRef(false);
  const finishSentRef = useRef(false);

  const winner = gameState?.winner_id != null
    ? (players || []).find(p => p.user_id === gameState.winner_id)
    : null;

  // "Race starts in 3…" countdown before typing opens.
  useEffect(() => {
    if (finished) return;
    if (countdown <= 0) {
      if (!started) {
        setStarted(true);
        startMsRef.current = Date.now();
        if (isPlayer) inputRef.current?.focus();
      }
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, started, finished, isPlayer]);

  // 90-second race timer. Host declares time_up at zero.
  useEffect(() => {
    if (!started || finished) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startMsRef.current) / 1000;
      const remaining = Math.max(0, RACE_SECONDS - elapsed);
      setTimeLeft(Math.ceil(remaining));
      if (remaining <= 0 && isHostUser && !timeUpSentRef.current) {
        timeUpSentRef.current = true;
        onMove({ move_type: 'time_up' });
      }
    }, 250);
    return () => clearInterval(interval);
  }, [started, finished, isHostUser, onMove]);

  // Compute completion % and WPM from what's typed, and report to the backend.
  const reportProgress = (currentTyped) => {
    if (!isPlayer || !startMsRef.current) return;
    // Count correctly-typed leading characters.
    let correctChars = 0;
    for (let i = 0; i < currentTyped.length && i < passage.length; i++) {
      if (currentTyped[i] === passage[i]) correctChars++;
      else break;
    }
    const completion = passage.length ? (correctChars / passage.length) * 100 : 0;
    const minutes = Math.max((Date.now() - startMsRef.current) / 60000, 1 / 60);
    const wpm = (correctChars / 5) / minutes;

    if (completion >= 100 && !finishSentRef.current) {
      finishSentRef.current = true;
      onMove({ move_type: 'progress', completion_pct: 100, wpm });
      return;
    }
    onMove({ move_type: 'progress', completion_pct: completion, wpm });
  };

  // Throttle regular progress reports to ~1/sec.
  useEffect(() => {
    if (!started || finished || !isPlayer) return;
    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastReportRef.current >= 1000) {
        lastReportRef.current = now;
        reportProgress(typed);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [started, finished, isPlayer, typed, passage]);

  const handleChange = (e) => {
    if (!started || finished || !isPlayer) return;
    const value = e.target.value;
    // Prevent typing past the passage length.
    setTyped(value.slice(0, passage.length));
    // Immediate report on completion so the winner is decided instantly.
    let correctChars = 0;
    for (let i = 0; i < value.length && i < passage.length; i++) {
      if (value[i] === passage[i]) correctChars++;
      else break;
    }
    if (correctChars >= passage.length && !finishSentRef.current) {
      lastReportRef.current = Date.now();
      reportProgress(value);
    }
  };

  // Character-colored passage.
  const coloredChars = useMemo(() => {
    return passage.split('').map((ch, i) => {
      let cls = 'text-gray-500';
      if (i < typed.length) {
        cls = typed[i] === ch ? 'text-green-400' : 'text-red-400 bg-red-500/20';
      } else if (i === typed.length) {
        cls = 'text-gray-300 bg-purple-500/40 rounded-sm';
      }
      return (
        <span key={i} className={cls}>
          {ch === ' ' && i >= typed.length ? ' ' : ch}
        </span>
      );
    });
  }, [passage, typed]);

  const myProgress = progress[String(currentUserId)]?.completion_pct || 0;

  const endOrLeave = () => {
    if (isHostUser && onEndGame) onEndGame();
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-gray-950/98 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pl-20 pr-5 py-4 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Keyboard className="w-6 h-6 text-purple-400" />
          <span className="text-white font-bold text-xl">Typing Race</span>
          {started && !finished && (
            <span className={`text-sm ml-1 flex items-center gap-1 ${timeLeft <= 10 ? 'text-red-400' : 'text-gray-400'}`}>
              <Flag className="w-3.5 h-3.5" /> {timeLeft}s
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!finished && isHostUser && onEndGame && (
            <button
              onClick={onEndGame}
              className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              End Race
            </button>
          )}
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white hover:bg-gray-800 p-1.5 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Progress bars */}
      <div className="px-5 py-3 space-y-2 bg-gray-900 flex-shrink-0">
        {(players || []).map(p => {
          const pct = progress[String(p.user_id)]?.completion_pct || 0;
          const wpm = progress[String(p.user_id)]?.wpm || 0;
          const isWinner = winner?.user_id === p.user_id;
          return (
            <div key={p.user_id} className="flex items-center gap-3">
              <div className="w-24 flex items-center gap-1.5 flex-shrink-0">
                {isWinner && <Trophy className="w-3.5 h-3.5 text-yellow-400" />}
                <div className="w-3 h-3 rounded-full border border-white/30 flex-shrink-0" style={{ backgroundColor: p.color }} />
                <span className="text-white text-xs truncate">{p.username}</span>
              </div>
              <div className="flex-1 bg-gray-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, pct)}%`, backgroundColor: p.color }}
                />
              </div>
              <span className="text-gray-400 text-xs w-16 text-right tabular-nums">{Math.round(wpm)} wpm</span>
            </div>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-6 overflow-y-auto">
        {finished ? (
          <div className="text-center max-w-md">
            <div className="text-6xl mb-4">{winner ? '🏆' : '🤝'}</div>
            <h2 className="text-3xl font-bold text-white mb-1">
              {winner ? `${winner.username} Wins!` : "It's a Tie!"}
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              {winner ? 'Fastest to the finish' : 'No single fastest typist'}
            </p>
            <button
              onClick={onClose}
              className="px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold rounded-xl text-base transition-all"
            >
              Close
            </button>
          </div>
        ) : !started ? (
          <div className="text-center">
            <div className="text-7xl font-black text-purple-400 mb-4 tabular-nums animate-pulse">
              {countdown > 0 ? countdown : 'GO!'}
            </div>
            <p className="text-gray-400 text-sm">Race starts in {countdown}…</p>
          </div>
        ) : (
          <div className="w-full max-w-3xl">
            {/* Passage */}
            <div className="bg-gray-800 rounded-2xl p-6 mb-4 text-lg leading-relaxed font-mono tracking-wide select-none">
              {coloredChars}
            </div>

            {/* Input */}
            {isPlayer ? (
              <>
                <input
                  ref={inputRef}
                  type="text"
                  value={typed}
                  onChange={handleChange}
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  disabled={finished}
                  placeholder="Start typing…"
                  className="w-full bg-gray-900 border-2 border-gray-700 focus:border-purple-500 rounded-xl px-4 py-3 text-white font-mono text-base focus:outline-none"
                />
                <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                  <span>{Math.round(myProgress)}% complete</span>
                  <span>Type the passage exactly as shown</span>
                </div>
              </>
            ) : (
              <p className="text-center text-gray-500 text-sm">
                {isHostUser ? "You're hosting — watch the racers!" : "Watching this race — you're not one of the racers."}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
