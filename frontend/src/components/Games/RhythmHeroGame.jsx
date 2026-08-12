import { useRef, useEffect, useState, useCallback } from 'react';
import { X, Search, Upload, Loader2, Trophy } from 'lucide-react';
import GameRulesButton from './GameRulesButton';
import { Game } from './rhythm/rhythmGameEngine';
import { generateChart } from './rhythm/analysis';

// ── Instrument configs — purely cosmetic per-instance colors passed into the
// engine constructor. Every instrument shares the IDENTICAL underlying
// 5-lane note-highway engine/hit-window/scoring logic — nothing here ever
// branches gameplay, only the visual theme.
const INSTRUMENTS = [
  { id: 'guitar', label: 'Guitar', icon: '🎸', colors: [0x3fe34a, 0xff3b30, 0xffd60a, 0x2f7cff, 0xff9500], accent: 0x8a2be2, accentRail: 0xb14cff },
  { id: 'bass', label: 'Bass', icon: '🎸', colors: [0xff9f45, 0x37e0d1, 0xc77dff, 0x4dd2ff, 0xff4d6d], accent: 0xff6b35, accentRail: 0xffa06b },
  { id: 'drums', label: 'Drums', icon: '🥁', colors: [0xff5555, 0xffaa00, 0x55ff55, 0x5599ff, 0xff55ff], accent: 0xff3355, accentRail: 0xff7799 },
  { id: 'vocals', label: 'Vocals', icon: '🎤', colors: [0xff69b4, 0xffd700, 0x00ced1, 0x9370db, 0xff6347], accent: 0xff1493, accentRail: 0xff85c2 },
];

const ROUND_SECONDS_FLOOR = 5; // divide-by-near-zero guard for score normalization

// ── LRC parsing — small local duplicate of KaraokeGame.jsx's own parseLRC.
// Kept local rather than extracted into a shared util, consistent with how
// KaraokeGame.jsx itself never exported this either.
function parseLRC(lrcText) {
  if (!lrcText) return [];
  const lineRe = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,2}))?\]/g;
  const lines = [];
  lrcText.split('\n').forEach((raw) => {
    const matches = [...raw.matchAll(lineRe)];
    if (matches.length === 0) return;
    const text = raw.replace(lineRe, '').trim();
    matches.forEach((m) => {
      const minutes = parseInt(m[1], 10);
      const seconds = parseInt(m[2], 10);
      const centis = m[3] ? parseInt(m[3].padEnd(2, '0'), 10) : 0;
      lines.push({ time: minutes * 60 + seconds + centis / 100, text });
    });
  });
  return lines.sort((a, b) => a.time - b.time);
}

function getAudioContext() {
  return new (window.AudioContext || window.webkitAudioContext)();
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Song picker — search online (iTunes preview + best-effort LRCLIB lyrics)
// or upload your own file (full-length, original content). Either path ends
// by calling onReady({audioBuffer, trackName, artistName, syncedLyrics}).
function SongPicker({ onReady, onCancel, getAudioCtx }) {
  const [tab, setTab] = useState('search'); // 'search' | 'upload'
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [results, setResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [isLoadingSong, setIsLoadingSong] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');

  const runSearch = async () => {
    if (!title.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    setResults(null);
    try {
      const q = artist.trim() ? `${title.trim()} ${artist.trim()}` : title.trim();
      // iTunes Search API — CORS-open, verified directly, no backend proxy needed.
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&limit=12`);
      if (!res.ok) throw new Error('search failed');
      const data = await res.json();
      setResults((data.results || []).filter((r) => r.previewUrl));
    } catch {
      setSearchError('Could not reach the song search — try again.');
    } finally {
      setIsSearching(false);
    }
  };

  // Best-effort lyrics lookup — never blocks song selection if it fails or
  // finds nothing. Same LRCLIB endpoint KaraokeGame.jsx already uses.
  const fetchLyrics = async (trackName, artistName) => {
    try {
      const params = new URLSearchParams({ track_name: trackName });
      if (artistName) params.set('artist_name', artistName);
      const res = await fetch(`https://lrclib.net/api/search?${params.toString()}`);
      if (!res.ok) return '';
      const data = await res.json();
      const top = Array.isArray(data) ? data[0] : null;
      return top?.syncedLyrics || '';
    } catch {
      return '';
    }
  };

  const pickSearchResult = async (r) => {
    setIsLoadingSong(true);
    try {
      const [audioRes, syncedLyrics] = await Promise.all([
        fetch(r.previewUrl),
        fetchLyrics(r.trackName, r.artistName),
      ]);
      if (!audioRes.ok) throw new Error('preview download failed');
      const arrayBuffer = await audioRes.arrayBuffer();
      const audioBuffer = await getAudioCtx().decodeAudioData(arrayBuffer);
      onReady({ audioBuffer, trackName: r.trackName, artistName: r.artistName || '', syncedLyrics });
    } catch {
      setSearchError('Could not load that preview — try a different result.');
      setIsLoadingSong(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoadingSong(true);
    try {
      // 100% client-side — no backend upload needed, same decode pattern
      // already used by useEmoteSounds.js elsewhere in this codebase.
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await getAudioCtx().decodeAudioData(arrayBuffer);
      const trackName = uploadTitle.trim() || file.name.replace(/\.[^/.]+$/, '');
      const syncedLyrics = uploadTitle.trim() ? await fetchLyrics(uploadTitle.trim(), '') : '';
      onReady({ audioBuffer, trackName, artistName: '', syncedLyrics });
    } catch {
      setSearchError('Could not read that audio file — try a different one.');
      setIsLoadingSong(false);
    }
  };

  if (isLoadingSong) {
    return (
      <div className="flex flex-col items-center gap-3 text-white">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        <p className="text-sm text-gray-400">Loading your song…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-md w-full mx-auto px-4">
      <div className="flex gap-2 bg-gray-900/60 rounded-xl p-1">
        <button
          onClick={() => setTab('search')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'search' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          <Search className="w-3.5 h-3.5" /> Search Online
        </button>
        <button
          onClick={() => setTab('upload')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'upload' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          <Upload className="w-3.5 h-3.5" /> Upload Your Own
        </button>
      </div>

      {tab === 'search' ? (
        <>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
            placeholder="Song title…"
            className="w-full bg-gray-900/70 border border-gray-700 focus:border-purple-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none"
            autoComplete="off"
          />
          <input
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
            placeholder="Artist (optional)…"
            className="w-full bg-gray-900/70 border border-gray-700 focus:border-purple-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none"
            autoComplete="off"
          />
          <button
            onClick={runSearch}
            disabled={!title.trim() || isSearching}
            className="flex items-center justify-center gap-2 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg text-sm transition-all"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {isSearching ? 'Searching…' : 'Search'}
          </button>
          <p className="text-gray-500 text-[11px] text-center -mt-1">Preview clips are ~30 seconds — upload your own file for a full song.</p>

          {results && results.length === 0 && (
            <p className="text-gray-500 text-sm text-center">No matches — try a different spelling.</p>
          )}
          {results && results.length > 0 && (
            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
              {results.map((r) => (
                <button
                  key={r.trackId}
                  onClick={() => pickSearchResult(r)}
                  className="flex items-center gap-2.5 text-left bg-gray-800/60 hover:bg-gray-800 border border-gray-700 hover:border-purple-500 rounded-lg px-3 py-2 transition-colors"
                >
                  {r.artworkUrl100 && (
                    <img src={r.artworkUrl100.replace('100x100', '60x60')} alt="" className="w-10 h-10 rounded flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{r.trackName}</p>
                    <p className="text-gray-400 text-xs truncate">
                      {r.artistName}{r.trackTimeMillis ? ` · ${formatDuration(r.trackTimeMillis / 1000)}` : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <input
            type="text"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
            placeholder="Song name (optional, helps find lyrics)…"
            className="w-full bg-gray-900/70 border border-gray-700 focus:border-purple-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none"
            autoComplete="off"
          />
          <label className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-gray-700 hover:border-purple-500 rounded-xl cursor-pointer transition-colors">
            <Upload className="w-8 h-8 text-gray-500" />
            <span className="text-sm text-gray-400">Tap to choose an audio file</span>
            <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
          </label>
        </>
      )}

      {searchError && <p className="text-red-400 text-xs text-center">{searchError}</p>}
      {onCancel && (
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-300 text-xs text-center mt-1">Cancel</button>
      )}
    </div>
  );
}

// ── Instrument picker ────────────────────────────────────────────────────────
function InstrumentPicker({ onPick }) {
  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-gray-400 text-sm">Choose your instrument</p>
      <div className="grid grid-cols-2 gap-4">
        {INSTRUMENTS.map((ins) => (
          <button
            key={ins.id}
            onClick={() => onPick(ins)}
            className="flex flex-col items-center gap-2 px-6 py-5 bg-gray-800/60 hover:bg-gray-800 border border-gray-700 hover:border-purple-500 rounded-2xl transition-colors w-32"
          >
            <span className="text-4xl">{ins.icon}</span>
            <span className="text-white text-sm font-semibold">{ins.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
// Arcade: solo play, or a hot-seat tournament (players take turns on the room
// host's own device — see ToadBallGame.jsx for the established precedent this
// mirrors exactly). All hooks stay unconditional regardless of isHost/
// isInTournament (Rules of Hooks) — the placeholder branches below just
// return before the canvas/engine ever mounts for a viewer who shouldn't
// be playing.
export default function RhythmHeroGame({
  onClose,
  onEndGame,
  isHost = true,
  hotSeatTournament = null,
  currentUserId = null,
  onTournamentScore = null,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const audioCtxRef = useRef(null);
  const endedHandledRef = useRef(false);
  const lyricsRef = useRef([]);
  const lyricsIntervalRef = useRef(null);

  // One shared AudioContext per turn — reused for both decoding (SongPicker)
  // and playback (startGameplay) rather than creating a fresh context for
  // each, which would leak: browsers hard-cap the number of concurrent
  // AudioContexts a page can have open. Closed and re-created on every new
  // turn/solo-replay (see the turn-reset effect and playAgainSolo below).
  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = getAudioContext();
    return audioCtxRef.current;
  }, []);

  const closeAudioCtx = useCallback(() => {
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch { /* already closed */ }
      audioCtxRef.current = null;
    }
  }, []);

  const [localPhase, setLocalPhase] = useState('instrument'); // instrument -> song -> loading -> playing
  const [instrument, setInstrument] = useState(null);
  const [songMeta, setSongMeta] = useState(null); // {trackName, artistName}
  const [myScore, setMyScore] = useState(null); // normalized score, set once a turn ends
  const [finalStats, setFinalStats] = useState(null); // raw engine stats for the local results screen (solo mode)
  const [currentLyricLine, setCurrentLyricLine] = useState('');

  // Imperative HUD refs — these fields update at up to 60fps during
  // gameplay (every hit/sustain tick), so they're written directly via DOM
  // refs rather than React state to avoid re-render thrashing.
  const scoreElRef = useRef(null);
  const streakElRef = useRef(null);
  const rockBarRef = useRef(null);
  const spBarRef = useRef(null);
  const judgeElRef = useRef(null);
  const countdownElRef = useRef(null);
  const bannerElRef = useRef(null);
  const bannerTimeoutRef = useRef(null);
  const judgeTimeoutRef = useRef(null);

  const isInTournament = !!hotSeatTournament;
  const isMyTurn = isInTournament && hotSeatTournament.current_player_id === currentUserId;

  // Fresh run each time a new hot-seat turn starts (or on first solo mount).
  useEffect(() => {
    if (isInTournament && !isMyTurn) return;
    engineRef.current?.dispose();
    engineRef.current = null;
    closeAudioCtx();
    setLocalPhase('instrument');
    setInstrument(null);
    setSongMeta(null);
    setMyScore(null);
    setFinalStats(null);
    setPendingGameData(null);
    endedHandledRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotSeatTournament?.current_player_id]);

  // Teardown the engine + audio context + lyrics poll on unmount — the
  // vendored engine has no automatic cleanup of its own.
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      closeAudioCtx();
      if (lyricsIntervalRef.current) clearInterval(lyricsIntervalRef.current);
      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
      if (judgeTimeoutRef.current) clearTimeout(judgeTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInstrumentPick = useCallback((ins) => {
    setInstrument(ins);
    setLocalPhase('song');
  }, []);

  // Holds {audioBuffer, chart, meta} from the moment chart generation
  // finishes until the canvas is actually in the DOM and ready to mount the
  // engine into. Needed because the <canvas> element only renders once
  // localPhase === 'playing' — reading canvasRef.current synchronously
  // inside the same callback that sets that phase would read a stale null
  // ref (React hasn't committed the DOM update yet). The effect below
  // watches this state and mounts the engine only once the canvas genuinely
  // exists.
  const [pendingGameData, setPendingGameData] = useState(null);

  const startGameplay = useCallback((audioBuffer, chart, meta) => {
    setPendingGameData({ audioBuffer, chart, meta });
    setLocalPhase('playing');
  }, []);

  // Mounts the engine once the canvas has actually rendered into the DOM
  // (localPhase === 'playing' committed) and there's pending game data
  // waiting for it.
  useEffect(() => {
    if (localPhase !== 'playing' || !pendingGameData) return;
    const canvas = canvasRef.current;
    if (!canvas || !instrument) return;
    const { audioBuffer, chart, meta } = pendingGameData;
    setPendingGameData(null);

    const hud = {
      onScore: (score, multiplier, streak) => {
        if (scoreElRef.current) scoreElRef.current.textContent = score.toLocaleString();
        if (streakElRef.current) streakElRef.current.textContent = streak > 0 ? `${streak}x combo · ${multiplier}×` : '';
      },
      onRock: (rock) => {
        if (rockBarRef.current) rockBarRef.current.style.width = `${Math.max(0, Math.min(100, rock))}%`;
      },
      onSP: (sp) => {
        if (spBarRef.current) spBarRef.current.style.width = `${Math.max(0, Math.min(100, sp))}%`;
      },
      onJudge: (text, kind) => {
        if (!judgeElRef.current) return;
        judgeElRef.current.textContent = text;
        judgeElRef.current.className = `judge-text judge-${kind}`;
        judgeElRef.current.style.opacity = '1';
        clearTimeout(judgeTimeoutRef.current);
        judgeTimeoutRef.current = setTimeout(() => {
          if (judgeElRef.current) judgeElRef.current.style.opacity = '0';
        }, 350);
      },
      onBanner: (text) => {
        if (!bannerElRef.current) return;
        bannerElRef.current.textContent = text;
        bannerElRef.current.style.opacity = '1';
        clearTimeout(bannerTimeoutRef.current);
        bannerTimeoutRef.current = setTimeout(() => {
          if (bannerElRef.current) bannerElRef.current.style.opacity = '0';
        }, 1500);
      },
      onCountdown: (label) => {
        if (countdownElRef.current) countdownElRef.current.textContent = label;
      },
      onEnd: (stats) => {
        if (endedHandledRef.current) return;
        endedHandledRef.current = true;
        const duration = Math.max(engineRef.current?.duration || 0, ROUND_SECONDS_FLOOR);
        const normalized = Math.round(stats.score / duration);
        setFinalStats({ ...stats, normalized, duration: engineRef.current?.duration || 0 });
        if (isInTournament) {
          setMyScore(normalized);
          if (onTournamentScore) onTournamentScore(normalized);
        }
      },
    };

    const engine = new Game(canvas, hud, {
      instrumentColors: instrument.colors,
      highwayAccentColor: instrument.accent,
      highwayAccentColorRail: instrument.accentRail,
    });
    engineRef.current = engine;

    engine.start(getAudioCtx(), audioBuffer, chart, meta);

    // Lyrics-in-sync overlay — same polling-against-playback-position pattern
    // already proven in KaraokeGame.jsx, driven by the engine's own songTime.
    if (lyricsIntervalRef.current) clearInterval(lyricsIntervalRef.current);
    if (lyricsRef.current.length > 0) {
      lyricsIntervalRef.current = setInterval(() => {
        const t = engineRef.current?.songTime ?? 0;
        let idx = -1;
        for (let i = 0; i < lyricsRef.current.length; i++) {
          if (lyricsRef.current[i].time <= t) idx = i; else break;
        }
        setCurrentLyricLine(idx >= 0 ? lyricsRef.current[idx].text : '');
      }, 250);
    }

  }, [localPhase, pendingGameData, instrument, isInTournament, onTournamentScore, getAudioCtx]);

  const handleSongReady = useCallback(async ({ audioBuffer, trackName, artistName, syncedLyrics }) => {
    setSongMeta({ trackName, artistName });
    lyricsRef.current = parseLRC(syncedLyrics);
    setLocalPhase('loading');
    // Yield one frame so React can actually paint the "Generating chart…"
    // spinner before generateChart()'s synchronous DSP work blocks the main
    // thread — it runs on the main thread with no Web Worker (see the
    // implementation plan's flagged risk; not worth the added complexity
    // unless a real playtest shows it's actually slow enough to matter).
    await new Promise(requestAnimationFrame);
    const chart = generateChart(audioBuffer, 'medium');
    startGameplay(audioBuffer, chart, { trackName, artistName });
  }, [startGameplay]);

  const playAgainSolo = useCallback(() => {
    engineRef.current?.dispose();
    engineRef.current = null;
    closeAudioCtx();
    endedHandledRef.current = false;
    setFinalStats(null);
    setPendingGameData(null);
    setLocalPhase('instrument');
    setInstrument(null);
    setSongMeta(null);
  }, [closeAudioCtx]);

  // Responsive canvas sizing.
  useEffect(() => {
    const el = containerRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas || localPhase !== 'playing') return;
    const resize = () => {
      canvas.width = el.clientWidth;
      canvas.height = el.clientHeight;
    };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(el);
    return () => obs.disconnect();
  }, [localPhase]);

  // Touch fret buttons — shown only on real touch devices, driving the exact
  // same public pressLane/releaseLane API the keyboard uses internally.
  const isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window && navigator.maxTouchPoints > 0;
  const handleFretDown = useCallback((lane) => (e) => { e.preventDefault(); engineRef.current?.pressLane(lane); }, []);
  const handleFretUp = useCallback((lane) => (e) => { e.preventDefault(); engineRef.current?.releaseLane(lane); }, []);
  const handleSpTouch = useCallback((e) => { e.preventDefault(); engineRef.current?.activateStarPower(); }, []);

  // 1. Non-host, hot-seat tournament active: spectator card.
  if (!isHost && isInTournament) {
    const currentPlayerName = hotSeatTournament?.current_player_name ?? 'someone';
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">🎸</span>
        <p className="text-lg font-semibold">{currentPlayerName}'s turn at Rhythm Hero!</p>
        <p className="text-sm text-gray-400">Sit back and cheer them on.</p>
        <button onClick={onClose} className="mt-2 px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">Close</button>
      </div>
    );
  }

  // 2. Non-host, no tournament: plain spectator.
  if (!isHost) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">🎸</span>
        <p className="text-lg font-semibold">Someone's playing Rhythm Hero!</p>
        <p className="text-sm text-gray-400">Sit back and cheer them on.</p>
        <button onClick={onClose} className="mt-2 px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">Close</button>
      </div>
    );
  }

  // 3. Host device, tournament active, but it's someone else's turn.
  if (isInTournament && !isMyTurn && myScore === null) {
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
  if (isInTournament && myScore !== null) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <Trophy className="w-14 h-14 text-yellow-400" />
        <p className="text-lg font-semibold">Your score: {myScore.toLocaleString()}</p>
        {finalStats && (
          <p className="text-sm text-gray-400">
            {Math.round(finalStats.accuracy * 100)}% accuracy · {finalStats.hits}/{finalStats.total} notes
          </p>
        )}
        <p className="text-sm text-gray-400">Pass the device to the next player…</p>
      </div>
    );
  }

  // 5. Actual gameplay flow — instrument select -> song select -> loading -> playing.
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black select-none">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-bold tracking-widest text-purple-400">RHYTHM HERO</h2>
          {songMeta?.trackName && <span className="text-xs text-gray-500 truncate">— {songMeta.trackName}</span>}
          <GameRulesButton gameType="rhythm_hero" className="text-gray-500" />
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {onEndGame && <button onClick={() => { onEndGame?.(); onClose?.(); }} className="px-2 py-1 text-xs bg-red-700 hover:bg-red-800 rounded font-medium">End</button>}
          <button onClick={onClose} className="px-2 py-1 text-xs bg-white/20 hover:bg-white/30 rounded"><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center overflow-hidden relative">
        {localPhase === 'instrument' && <InstrumentPicker onPick={handleInstrumentPick} />}
        {localPhase === 'song' && <SongPicker onReady={handleSongReady} onCancel={() => setLocalPhase('instrument')} getAudioCtx={getAudioCtx} />}
        {localPhase === 'loading' && (
          <div className="flex flex-col items-center gap-3 text-white">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
            <p className="text-sm text-gray-400">Generating your chart…</p>
          </div>
        )}
        {localPhase === 'playing' && (
          <>
            <div ref={containerRef} className="absolute inset-0">
              <canvas ref={canvasRef} className="w-full h-full block" />
            </div>

            {isInTournament && (
              <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-purple-700/90 text-white text-sm font-semibold rounded-full shadow pointer-events-none">
                🏆 Your turn — tap in time with the music!
              </div>
            )}

            {/* HUD overlay — imperatively updated via refs, not React state */}
            <div className="absolute top-3 left-3 text-white pointer-events-none">
              <div ref={scoreElRef} className="text-2xl font-bold tabular-nums">0</div>
              <div ref={streakElRef} className="text-xs text-yellow-300 font-semibold" />
            </div>
            <div className="absolute top-3 right-3 w-28 flex flex-col gap-1.5 pointer-events-none">
              <div className="h-1.5 bg-gray-800/70 rounded-full overflow-hidden">
                <div ref={rockBarRef} className="h-full bg-gradient-to-r from-red-500 to-green-400 transition-[width]" style={{ width: '80%' }} />
              </div>
              <div className="h-1.5 bg-gray-800/70 rounded-full overflow-hidden">
                <div ref={spBarRef} className="h-full bg-gradient-to-r from-cyan-500 to-blue-400 transition-[width]" style={{ width: '0%' }} />
              </div>
            </div>
            <div
              ref={judgeElRef}
              className="absolute top-1/3 left-1/2 -translate-x-1/2 text-3xl font-black pointer-events-none transition-opacity duration-200"
              style={{ opacity: 0 }}
            />
            <div ref={countdownElRef} className="absolute inset-0 flex items-center justify-center text-6xl font-black text-white pointer-events-none" />
            <div
              ref={bannerElRef}
              className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2 bg-purple-700/90 text-white text-sm font-bold rounded-full pointer-events-none transition-opacity duration-300"
              style={{ opacity: 0 }}
            />
            {currentLyricLine && (
              <div className="absolute bottom-24 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/60 rounded-lg text-white text-sm font-medium text-center max-w-md pointer-events-none">
                {currentLyricLine}
              </div>
            )}

            {/* Touch fret buttons — real touch devices only */}
            {isTouchDevice && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3">
                {instrument?.colors.map((color, i) => (
                  <button
                    key={i}
                    onTouchStart={handleFretDown(i)}
                    onTouchEnd={handleFretUp(i)}
                    onTouchCancel={handleFretUp(i)}
                    className="w-14 h-14 rounded-full border-2 border-white/40 active:scale-90 transition-transform"
                    style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }}
                  />
                ))}
                <button
                  onTouchStart={handleSpTouch}
                  className="w-14 h-14 rounded-full border-2 border-white/40 bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white text-xl active:scale-90 transition-transform"
                >
                  ★
                </button>
              </div>
            )}

            {!isInTournament && finalStats && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 text-white">
                <Trophy className="w-14 h-14 text-yellow-400" />
                <p className="text-2xl font-bold">Score: {finalStats.score.toLocaleString()}</p>
                <p className="text-sm text-gray-400">
                  {Math.round(finalStats.accuracy * 100)}% accuracy · {finalStats.hits}/{finalStats.total} notes · normalized {finalStats.normalized}
                </p>
                <button
                  onClick={playAgainSolo}
                  className="mt-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold rounded-xl text-sm transition-all"
                >
                  Play Again
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 text-center py-1 bg-gray-900 border-t border-gray-800">
        <p className="text-xs text-gray-600">Keyboard: A S D F G to tap · hold for sustained notes · Space for Star Power</p>
      </div>
    </div>
  );
}
