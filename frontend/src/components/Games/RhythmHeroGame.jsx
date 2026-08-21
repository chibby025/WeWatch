import { useRef, useEffect, useState, useCallback } from 'react';
import { X, Search, Upload, Loader2, Trophy } from 'lucide-react';
import apiClient, { API_BASE_URL } from '../../services/api';
import GameRulesButton from './GameRulesButton';
import { InstrumentTopOverlay, InstrumentLoadingSprite } from './rhythm/InstrumentCloseup';
import { INSTRUMENT_TOP_SHEETS, INSTRUMENT_BOTTOM_SHEETS } from './rhythm/spriteSheets';
import { Game, pickRandomStageId } from './rhythm/rhythmGameEngine';
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

// analysis.js's generateChart already supports all 4 of these (real
// note-density/chord configs per tier) — the call site just never exposed a
// picker for it before, hardcoding 'medium' regardless of skill level.
const DIFFICULTIES = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
  { id: 'expert', label: 'Expert' },
];

const ROUND_SECONDS_FLOOR = 5; // divide-by-near-zero guard for score normalization

// ── Staged loading — 3 named stages, chart generation folds silently into
// the last one per explicit product decision. Shared between the active
// player's own loading screen and every spectator's mirrored one.
const LOADING_STAGE_ORDER = ['fetching_music', 'fetching_lyrics', 'loading_song'];
const LOADING_STAGE_LABELS = {
  fetching_music: 'Fetching music…',
  fetching_lyrics: 'Fetching lyrics…',
  loading_song: 'Loading your song…',
};

// Mobile haptic feedback for hit-judgment moments — same technique already
// proven in PingPongGame.jsx/AirHockeyGame.jsx/SpaceAttackGame.jsx
// (navigator.vibrate, feature-detected since Safari/iOS has no Vibration API
// at all). Deliberately independent of the sound-mute toggle, matching that
// existing convention — a silent room doesn't mean no haptic feedback wanted.
function hapticImpact(pattern) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern);
  }
}

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

// LRCLIB's real per-line timestamps are anchored to the FULL song's own
// timeline — but an iTunes search result's previewUrl is commonly a ~30s
// clip taken from somewhere in the MIDDLE of the track (a curated "hook",
// not necessarily 0:00), and the iTunes Search API returns no metadata at
// all describing where within the song that clip actually starts (confirmed
// live: a real track response has trackTimeMillis for the full song, but
// nothing about the preview's own offset). Comparing local elapsed preview
// time against those full-song timestamps means the highlighted line can be
// confidently wrong — not just imprecise, but referring to a genuinely
// different moment in the song than what's audible. Rather than show that,
// searched songs fall back to this: evenly pace the PLAIN (unsynced) lines
// across the clip's own known duration — an honest approximation, not a
// claim of real sync. Uploaded (full-length) songs don't have this problem
// — local elapsed time IS the real absolute song position there — so they
// keep using genuine LRCLIB timestamps, falling back to this only if no
// synced lyrics exist at all for that track.
function evenlyPacedLyrics(plainText, durationSeconds) {
  if (!plainText || !durationSeconds) return [];
  const lines = plainText.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const step = durationSeconds / lines.length;
  return lines.map((text, i) => ({ time: i * step, text }));
}

function getAudioContext() {
  return new (window.AudioContext || window.webkitAudioContext)();
}

// A relative uploaded-song URL (local dev's UploadLocalFileToBunnyCDN fallback
// — see rhythm_hero_handler.go) resolves against the CURRENT PAGE's own
// origin when fetched directly, not the backend's — the exact same class of
// bug this codebase's own VideoWatch.jsx already has a proven fix for
// (resolveMediaUrl there). Duplicated here rather than imported/shared, same
// convention already used for parseLRC between this file and KaraokeGame.jsx.
// Only WarmPerformanceMirror needs this — the uploading player never
// re-fetches their own upload, they already have the decoded buffer locally.
function resolveMediaUrl(url) {
  if (!url) return url;
  const baseUrl = API_BASE_URL || 'http://localhost:8080';
  return url.startsWith('http') ? url : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Trims iTunes search results to just what a spectator's mirrored view needs
// to render — spectators only ever SEE results during selection, never fetch
// or play them — keeping the rhythm_hero_selecting broadcast payload small.
function trimSearchResultsForBroadcast(results) {
  if (!results) return null;
  return results.map((r) => ({
    trackId: r.trackId,
    trackName: r.trackName,
    artistName: r.artistName || '',
    artworkUrl: r.artworkUrl100 ? r.artworkUrl100.replace('100x100', '60x60') : null,
  }));
}

// Best-effort lyrics lookup — never blocks song selection. A real,
// previously-shipped bug: the original fetch had no timeout at all and was
// awaited inside a Promise.all alongside the audio-preview fetch, so a
// slow/unresponsive LRCLIB response (measured 8.6s from this dev
// environment, worse historically) blocked the ENTIRE loading screen
// indefinitely, contradicting this function's own "best-effort, never
// blocks" intent. Fixed with a hard AbortController timeout — on timeout,
// treat exactly like any other soft-fail (empty lyrics, proceed to the next
// stage) rather than erroring the whole pipeline.
async function fetchLyricsWithTimeout(trackName, artistName, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const params = new URLSearchParams({ track_name: trackName });
    if (artistName) params.set('artist_name', artistName);
    const res = await fetch(`https://lrclib.net/api/search?${params.toString()}`, { signal: controller.signal });
    if (!res.ok) return { synced: '', plain: '' };
    const data = await res.json();
    const top = Array.isArray(data) ? data[0] : null;
    return { synced: top?.syncedLyrics || '', plain: top?.plainLyrics || '' };
  } catch {
    return { synced: '', plain: '' };
  } finally {
    clearTimeout(timer);
  }
}

// Jamendo — a free, Creative-Commons-licensed music catalog offering genuine
// full-length streamable audio (confirmed via its own real API docs: no
// preview cap, unlike iTunes/Deezer/Spotify, all of which cap at ~30s "due
// to legal reasons" per Deezer's own docs — a licensing constraint on
// mainstream commercial music, not something any API can route around).
// The tradeoff, made explicit in the UI rather than silently swapped in:
// this is an independent/indie catalog, not the mainstream hits an iTunes
// search returns. client_id is a free, self-service signup at
// devportal.jamendo.com — VITE_JAMENDO_CLIENT_ID needs a real value before
// this actually returns results (same "documented, not yet configured"
// pattern already used for PEXELS_API_KEY elsewhere in this project).
const JAMENDO_CLIENT_ID = import.meta.env.VITE_JAMENDO_CLIENT_ID || '';
async function searchJamendo(query) {
  if (!JAMENDO_CLIENT_ID) throw new Error('Jamendo not configured');
  const params = new URLSearchParams({
    client_id: JAMENDO_CLIENT_ID,
    format: 'json',
    limit: '12',
    search: query,
  });
  const res = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params.toString()}`);
  if (!res.ok) throw new Error('jamendo search failed');
  const data = await res.json();
  if (data?.headers?.status === 'failed') throw new Error(data.headers.error_message || 'jamendo search failed');
  // Normalized into the exact same shape iTunes results already use
  // (trackId/trackName/artistName/artworkUrl100/trackTimeMillis/previewUrl)
  // so the existing results-list JSX and downstream pipeline (handleSongSelect,
  // loadSelectedSong) need zero branching for rendering/selecting — only the
  // isFullLength flag distinguishes it, for the lyrics-sync decision.
  return (data.results || [])
    .filter((r) => r.audio)
    .map((r) => ({
      trackId: `jamendo-${r.id}`,
      trackName: r.name,
      artistName: r.artist_name || '',
      artworkUrl100: r.image || null,
      trackTimeMillis: r.duration ? r.duration * 1000 : null,
      previewUrl: r.audio,
      isFullLength: true,
    }));
}

// Rolling accuracy over the last ROLLING_JUDGE_WINDOW judged notes — drives
// the guitar/bass sprite players' playback speed (SpriteFramePlayer.setSpeed)
// via the refs passed in. PERFECT/GOOD both count as a hit, MISS as a miss —
// the same 3 onJudge kinds the engine already reports for HUD/haptics, no new
// engine-side tracking needed. High accuracy plays at a normal, energetic
// pace; a string of misses visibly slows the character down — never fully
// freezes (that would look broken, not "struggling"). Used identically by
// both the active player's own view and the spectator mirror, since the
// mirror runs its own real (readOnly) engine against the same relayed
// inputs and genuinely computes its own judgments — this isn't approximated
// or guessed for spectators, it's the same calculation either way.
const ROLLING_JUDGE_WINDOW = 12;
function useRollingSpriteSpeed(spriteRefs) {
  const windowRef = useRef([]);
  // Snapshotted once on first call, not re-read from the (likely fresh-each-
  // render) spriteRefs argument on every call — the individual refs inside it
  // (just topSpriteRef now — the fretting-hand close-up moved to the loading
  // screen, see InstrumentLoadingSprite) are themselves already stable across
  // renders, so this doesn't need to track a changing array, and doing it
  // this way keeps recordJudge/resetSpriteSpeed's own identities genuinely
  // stable (empty dep arrays) — required so the engine-construction effect
  // that references recordJudge doesn't re-run (and tear down/rebuild the
  // whole Three.js scene) on every render.
  const stableRefsRef = useRef(spriteRefs);
  const recordJudge = useCallback((kind) => {
    const w = windowRef.current;
    w.push(kind !== 'miss');
    if (w.length > ROLLING_JUDGE_WINDOW) w.shift();
    const acc = w.length ? w.filter(Boolean).length / w.length : 1;
    const speed = 0.4 + acc * 0.9; // acc=0 -> 0.4x (sluggish, not frozen), acc=1 -> 1.3x (energetic)
    stableRefsRef.current.forEach((r) => r.current?.setSpeed(speed));
  }, []);
  const resetSpriteSpeed = useCallback(() => {
    windowRef.current = [];
    stableRefsRef.current.forEach((r) => r.current?.setSpeed(1));
  }, []);
  return { recordJudge, resetSpriteSpeed };
}

// ── Staged progress indicator — a 3-step indicator rather than a continuous
// percentage bar, since there's no fine-grained byte-level progress to
// report honestly with only 3 discrete named stages. Shared between the
// active player's own loading screen and the spectator mirror.
//
// `sheet` is optional — the fretting-hand close-up GIF (guitar/bass only,
// via spriteSheets.js's INSTRUMENT_BOTTOM_SHEETS), rendered just below the
// bar via InstrumentLoadingSprite while the room waits. It used to be a
// highway overlay during actual gameplay; there's no live performance to
// sync it to during loading, so it's just a plain idle loop here instead.
function StagedProgress({ stage, sheet }) {
  const stageIndex = LOADING_STAGE_ORDER.indexOf(stage);
  return (
    <div className="flex flex-col items-center gap-6 text-white w-full max-w-xs">
      <div className="w-full flex items-center gap-2">
        {LOADING_STAGE_ORDER.map((s, i) => (
          <div
            key={s}
            className={`flex-1 h-1.5 rounded-full transition-colors ${
              i < stageIndex ? 'bg-purple-500' : i === stageIndex ? 'bg-purple-500 animate-pulse' : 'bg-gray-700'
            }`}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
        <p className="text-sm text-gray-300 font-medium">{LOADING_STAGE_LABELS[stage] || 'Loading…'}</p>
      </div>
      {sheet && <InstrumentLoadingSprite sheet={sheet} />}
    </div>
  );
}

// ── Song picker — search online (iTunes preview + best-effort LRCLIB lyrics)
// or upload your own file (full-length, original content). A PURE selection
// UI — owns no fetch/decode/upload logic of its own (that all lives in the
// parent's loadSelectedSong now, so the loading screen it triggers is one
// continuous experience rather than two disconnected spinners). Picking a
// result or a file hands off to the parent immediately via onSelect, before
// any network/decode work starts. Every meaningful local-state change is
// also reported upward via onStateChange (title/artist/uploadTitle
// keystrokes debounced by the parent, everything else immediate) so the
// room can mirror this screen live. initialX props restore exactly where
// the user left off after a parent-driven pipeline failure.
function SongPicker({ onSelect, onStateChange, onCancel, initialTab, initialTitle, initialArtist, initialUploadTitle, initialResults, initialError, initialSearchSource }) {
  const [tab, setTab] = useState(initialTab || 'search');
  const [title, setTitle] = useState(initialTitle || '');
  const [artist, setArtist] = useState(initialArtist || '');
  const [results, setResults] = useState(initialResults ?? null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(initialError || null);
  const [uploadTitle, setUploadTitle] = useState(initialUploadTitle || '');
  // 'itunes' (mainstream, ~30s clips, approximate lyric sync) or 'jamendo'
  // (independent/CC catalog, genuine full-length, real synced lyrics).
  const [searchSource, setSearchSource] = useState(initialSearchSource || 'itunes');

  const runSearch = async () => {
    if (!title.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    setResults(null);
    onStateChange?.({ is_searching: true, search_error: null, results: null }, { immediate: true });
    try {
      const q = artist.trim() ? `${title.trim()} ${artist.trim()}` : title.trim();
      let filtered;
      if (searchSource === 'jamendo') {
        filtered = await searchJamendo(q);
      } else {
        // iTunes Search API — CORS-open, verified directly, no backend proxy needed.
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&limit=12`);
        if (!res.ok) throw new Error('search failed');
        const data = await res.json();
        filtered = (data.results || []).filter((r) => r.previewUrl);
      }
      setResults(filtered);
      setIsSearching(false);
      onStateChange?.({ is_searching: false, results: trimSearchResultsForBroadcast(filtered) }, { immediate: true });
    } catch (err) {
      const message = searchSource === 'jamendo' && err?.message === 'Jamendo not configured'
        ? 'Jamendo search isn\'t set up yet — try iTunes instead.'
        : 'Could not reach the song search — try again.';
      setSearchError(message);
      setIsSearching(false);
      onStateChange?.({ is_searching: false, search_error: message }, { immediate: true });
    }
  };

  const handleTitleChange = (e) => {
    const v = e.target.value;
    setTitle(v);
    onStateChange?.({ title: v }, { immediate: false });
  };
  const handleArtistChange = (e) => {
    const v = e.target.value;
    setArtist(v);
    onStateChange?.({ artist: v }, { immediate: false });
  };
  const handleUploadTitleChange = (e) => {
    const v = e.target.value;
    setUploadTitle(v);
    onStateChange?.({ uploadTitle: v }, { immediate: false });
  };
  const handleTabChange = (t) => {
    setTab(t);
    onStateChange?.({ tab: t }, { immediate: true });
  };
  const handleSourceChange = (s) => {
    setSearchSource(s);
    setResults(null);
    onStateChange?.({ search_source: s, results: null }, { immediate: true });
  };

  return (
    <div className="flex flex-col gap-4 max-w-md w-full mx-auto px-4">
      <div className="flex gap-2 bg-gray-900/60 rounded-xl p-1">
        <button
          onClick={() => handleTabChange('search')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'search' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          <Search className="w-3.5 h-3.5" /> Search Online
        </button>
        <button
          onClick={() => handleTabChange('upload')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'upload' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          <Upload className="w-3.5 h-3.5" /> Upload Your Own
        </button>
      </div>

      {tab === 'search' ? (
        <>
          <div className="flex gap-2 -mb-1">
            <button
              onClick={() => handleSourceChange('itunes')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${searchSource === 'itunes' ? 'bg-purple-700/60 text-white border border-purple-500' : 'bg-gray-900/50 text-gray-500 border border-gray-800 hover:text-gray-300'}`}
            >
              🎵 iTunes
            </button>
            <button
              onClick={() => handleSourceChange('jamendo')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${searchSource === 'jamendo' ? 'bg-purple-700/60 text-white border border-purple-500' : 'bg-gray-900/50 text-gray-500 border border-gray-800 hover:text-gray-300'}`}
            >
              🌱 Jamendo (Full Length)
            </button>
          </div>
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
            placeholder="Song title…"
            className="w-full bg-gray-900/70 border border-gray-700 focus:border-purple-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none"
            autoComplete="off"
          />
          <input
            type="text"
            value={artist}
            onChange={handleArtistChange}
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
          <p className="text-gray-500 text-[11px] text-center -mt-1">
            {searchSource === 'jamendo'
              ? 'Full-length, real synced lyrics — independent/Creative-Commons artists, not mainstream hits.'
              : 'Preview clips are ~30 seconds — try Jamendo or upload your own file for a full song.'}
          </p>

          {results && results.length === 0 && (
            <p className="text-gray-500 text-sm text-center">No matches — try a different spelling.</p>
          )}
          {results && results.length > 0 && (
            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
              {results.map((r) => (
                <button
                  key={r.trackId}
                  onClick={() => onSelect?.({ type: 'search', result: r })}
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
            onChange={handleUploadTitleChange}
            placeholder="Song name (optional, helps find lyrics)…"
            className="w-full bg-gray-900/70 border border-gray-700 focus:border-purple-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none"
            autoComplete="off"
          />
          <label className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-gray-700 hover:border-purple-500 rounded-xl cursor-pointer transition-colors">
            <Upload className="w-8 h-8 text-gray-500" />
            <span className="text-sm text-gray-400">Tap to choose an audio file</span>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onSelect?.({ type: 'upload', file, uploadTitle });
              }}
              className="hidden"
            />
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
function InstrumentPicker({ onPick, difficulty, onDifficultyChange }) {
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
      <div className="flex flex-col items-center gap-2">
        <p className="text-gray-500 text-xs uppercase tracking-wide">Difficulty</p>
        <div className="flex gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              onClick={() => onDifficultyChange(d.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                difficulty === d.id
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800/60 text-gray-400 hover:bg-gray-800'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Warm performance mirror ──────────────────────────────────────────────────
// Supersedes what used to be two separate mounts (SelectionMirror's own
// 'loading' sub-case, and a fresh SpectatorMirror only once rhythm_hero_start
// arrived) with ONE persistent canvas/engine spanning both. Real WebGL scene
// construction — shader compilation, GPU resource allocation for the
// renderer/composer/bloom — is the single most expensive part of mounting a
// spectator's mirror, and it used to only start AFTER rhythm_hero_start
// landed, stacking that full cost on top of network latency, strictly after
// the active player had already begun (their own construction happens at the
// same relative moment on their own local pipeline, which is also when the
// broadcast fires). Constructing the engine the moment a performance is
// imminent (loading phase) instead hides that cost behind the loading
// screen — an idle-rendering highway (audience, stars, the works, care of
// the shared engine's own idle loop) is genuinely visible while waiting, and
// by the time rhythm_hero_start actually lands, only the much cheaper
// engine.start() (reset state + begin the real loop) is left to do, not a
// fresh scene build. Also directly covers a late joiner connecting straight
// into an already-active liveInfo with no loading phase of their own to
// warm during — the two effects below don't need to distinguish that case
// from a genuine warm-then-start sequence; React just runs both in the same
// commit.
// Re-keyed by the parent on turn_key (generated once per turn, included in
// every broadcast for it) rather than liveInfo's own start_timestamp — that
// doesn't exist yet during the loading phase this component now also covers.
function WarmPerformanceMirror({
  selectingInfo, liveInfo, registerInputReceiver, playerLabel, onClose,
  prefetchedAudio, matchFramingText, isSuddenDeath,
  registerCheerReceiver, onCheerSend, leaderboard,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const audioCtxRef = useRef(null);
  const startedRef = useRef(false);
  const scoreElRef = useRef(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const streakElRef = useRef(null);
  const rockBarRef = useRef(null);
  const spBarRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const topSpriteRef = useRef(null);
  // bottomSpriteRef removed — the fretting-hand close-up no longer renders
  // as a highway overlay (see InstrumentLoadingSprite/StagedProgress), so
  // there's nothing left to speed-modulate here.
  const spriteRefsArr = [topSpriteRef];
  const { recordJudge } = useRollingSpriteSpeed(spriteRefsArr);

  const instrumentId = liveInfo?.instrument_id ?? selectingInfo?.instrument_id;
  const instrument = INSTRUMENTS.find((i) => i.id === instrumentId) || INSTRUMENTS[0];
  // Same early-availability fallback chain as instrumentId above — stage is
  // picked and broadcast at the exact same moment (handleInstrumentPick), so
  // it's available via selectingInfo just as early, well before liveInfo
  // (rhythm_hero_start) actually fires.
  const stageId = liveInfo?.stage_id ?? selectingInfo?.stage_id;

  // Constructs the engine exactly once, as soon as the canvas exists —
  // regardless of whether liveInfo is active yet. Never re-runs; a genuinely
  // new turn gets a fresh mount (and hence a fresh engine) via the parent's
  // own turn_key-based React key instead.
  useEffect(() => {
    if (!canvasRef.current || engineRef.current) return;
    const audioCtx = getAudioContext();
    audioCtxRef.current = audioCtx;
    const hud = {
      onScore: (score, mult, streak) => {
        if (scoreElRef.current) scoreElRef.current.textContent = score.toLocaleString();
        if (streakElRef.current) streakElRef.current.textContent = streak > 0 ? `${streak}x combo · ${mult}×` : '';
      },
      onRock: (rock) => { if (rockBarRef.current) rockBarRef.current.style.width = `${Math.max(0, Math.min(100, rock))}%`; },
      onSP: (sp) => { if (spBarRef.current) spBarRef.current.style.width = `${Math.max(0, Math.min(100, sp))}%`; },
      // A genuine judgment, not approximated — this readOnly engine processes
      // the same relayed inputs against the same chart, so it independently
      // computes real hit/miss results, same as the active player's own
      // engine. Feeds the same rolling-accuracy sprite speed calc.
      onJudge: (text, kind) => recordJudge(kind),
      onBanner: () => {},
      onCountdown: () => {},
      onEnd: () => {},
    };
    engineRef.current = new Game(canvasRef.current, hud, {
      instrumentColors: instrument.colors,
      highwayAccentColor: instrument.accent,
      highwayAccentColorRail: instrument.accentRail,
      stageId,
      readOnly: true,
    });

    return () => {
      registerInputReceiver?.(null);
      engineRef.current?.dispose();
      engineRef.current = null;
      try { audioCtxRef.current?.close(); } catch { /* already closed */ }
    };
    // Deliberately empty — this effect owns construction only, once, for the
    // whole lifetime of this mount. instrument is read at construction time
    // only (fixed for the whole turn, doesn't change between loading/live).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Starts real playback on the already-constructed engine once liveInfo is
  // genuinely active — never constructs a second engine. Runs in the SAME
  // commit as the construct effect above when liveInfo is already active at
  // mount time (a late joiner), since React always attaches refs/runs
  // declaration-ordered effects before this one on that first render.
  // Everything except active/audio_url read via this ref, snapshotted fresh
  // every render, rather than listed as effect dependencies — chart is an
  // object (a whole generated note chart), and registerInputReceiver/
  // prefetchedAudio are callback/object props from further up the tree.
  // Listing any of those directly would restart this fetch (cancelling and
  // discarding whatever was already in flight) on ANY render that happens
  // to hand this component a new reference for one of them, even though
  // none of them logically mean "a different performance started" the way
  // active/audio_url genuinely do. Found via a real dev-tool test where an
  // unstable prop reference caused the fetch to be cancelled and restarted
  // before it could ever complete — the spectator's screen stayed on
  // "Loading your song…" forever, with no error, because `cancelled` was
  // already true by the time the (perfectly valid) fetch response arrived.
  const startArgsRef = useRef(null);
  startArgsRef.current = {
    chart: liveInfo?.chart,
    trackName: liveInfo?.track_name,
    artistName: liveInfo?.artist_name,
    prefetchedAudio,
    registerInputReceiver,
  };

  useEffect(() => {
    if (!liveInfo?.active || startedRef.current || !engineRef.current) return;
    let cancelled = false;
    startedRef.current = true;
    (async () => {
      try {
        const { chart, trackName, artistName, prefetchedAudio: pf, registerInputReceiver: register } = startArgsRef.current;
        let audioBuffer = null;
        if (pf?.url === liveInfo.audio_url) {
          audioBuffer = pf.buffer || (await pf.promise);
        }
        if (!audioBuffer) {
          const res = await fetch(resolveMediaUrl(liveInfo.audio_url));
          if (!res.ok) throw new Error('fetch failed');
          const arrayBuffer = await res.arrayBuffer();
          audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
        }
        if (cancelled || !engineRef.current) return;
        engineRef.current.start(audioCtxRef.current, audioBuffer, chart, { trackName, artistName });
        setReady(true);
        register?.((data) => {
          if (!engineRef.current) return;
          if (data.action === 'press') engineRef.current.pressLane(data.lane);
          else if (data.action === 'release') engineRef.current.releaseLane(data.lane);
          else if (data.action === 'star_power') engineRef.current.activateStarPower();
        });
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
      // Critical: without this, a cancelled-mid-flight attempt (React
      // StrictMode's deliberate dev-mode mount→cleanup→mount, or a genuine
      // re-run from a real dependency change) leaves startedRef.current
      // permanently true — the discarded attempt "used up" the one chance
      // this ref ever allows, and no future run (including the very next
      // one, right after this cleanup) can ever pass the startedRef.current
      // guard again. This is what actually caused a spectator's mirror to
      // hang forever on "Loading your song…" with no error at all — found
      // via direct instrumentation showing exactly two effect invocations,
      // the first cancelled mid-fetch, the second bailing out immediately
      // because startedRef.current was already (and permanently) true.
      startedRef.current = false;
    };
  }, [liveInfo?.active, liveInfo?.audio_url]);

  // Responsive canvas sizing — runs for this component's whole lifetime, not
  // gated on `ready`: the canvas (and the engine's own idle loop) is already
  // live during the warming phase too.
  useEffect(() => {
    const el = containerRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const resize = () => { canvas.width = el.clientWidth; canvas.height = el.clientHeight; };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Receives cheers from OTHER spectators (or, harmlessly, an echo path if
  // this same person ever taps their own Cheer button twice) — this
  // spectator's own crowd/lights react too, not just the performer's.
  useEffect(() => {
    registerCheerReceiver?.(() => engineRef.current?.cheer());
    return () => registerCheerReceiver?.(null);
  }, [registerCheerReceiver]);

  // Cheer applies locally/optimistically first (immediate feedback, no
  // network round-trip needed to see your own tap land), then broadcasts —
  // the backend excludes the sender, so this never double-applies.
  const handleCheerTap = () => {
    engineRef.current?.cheer();
    onCheerSend?.();
  };

  if (loadError) {
    return (
      /* height:100dvh overrides inset-0's implied 100vh-based height (CSS
         correctly prioritizes an explicit height over the top+bottom
         combination) — 100vh sizes against the mobile browser's LAYOUT
         viewport (assumes the address bar is hidden), which is why this
         container could render taller than the actually-visible screen on
         a real phone; 100dvh tracks the real, currently-visible viewport.
         Same fix already established elsewhere in this codebase for this
         exact class of bug (index.css, VideoWatch.jsx, LobbyPage.jsx). */
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white" style={{ height: '100dvh' }}>
        <span className="text-6xl">🎸</span>
        <p className="text-lg font-semibold">Couldn't load {playerLabel}'s song</p>
        <button onClick={onClose} className="mt-2 px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">Close</button>
      </div>
    );
  }

  const trackName = liveInfo?.track_name;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black select-none" style={{ height: '100dvh' }}>
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <img src="https://LetsWatchOut.b-cdn.net/games/logos/rhythm_hero.png" alt="Rhythm Hero" className="h-6 sm:h-7 w-auto shrink-0" />
          <span className="text-xs text-gray-500 truncate">— {playerLabel}{trackName ? ` · ${trackName}` : ''}</span>
          {ready && liveInfo?.difficulty && (
            <span className="text-[10px] uppercase tracking-wide text-purple-300 bg-purple-900/50 px-1.5 py-0.5 rounded shrink-0">
              {DIFFICULTIES.find((d) => d.id === liveInfo.difficulty)?.label ?? liveInfo.difficulty}
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setShowLeaderboard(true)} className="px-2 py-1 text-xs bg-white/20 hover:bg-white/30 rounded"><Trophy className="w-3.5 h-3.5" /></button>
          <button onClick={onClose} className="px-2 py-1 text-xs bg-white/20 hover:bg-white/30 rounded"><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {showLeaderboard && <LeaderboardPanel entries={leaderboard} onClose={() => setShowLeaderboard(false)} />}

      {!ready && (matchFramingText || isSuddenDeath) && (
        <div className="flex flex-col items-center gap-0.5 py-1.5 bg-gray-900/60 border-b border-gray-800 shrink-0">
          {matchFramingText && <p className="text-[11px] uppercase tracking-wide text-purple-400 font-semibold">{matchFramingText}</p>}
          {isSuddenDeath && <p className="text-[11px] uppercase tracking-wide text-red-400 font-bold animate-pulse">⚔️ Sudden Death — replay!</p>}
        </div>
      )}

      <div className="flex-1 flex items-center justify-center overflow-hidden relative">
        {/* Canvas renders unconditionally, from the very first commit — the
            construct effect needs a real canvasRef.current to attach the
            engine to. Gating it behind `ready` would mean the ref is always
            null when checked, silently stalling forever (the exact
            canvas-ref-before-render bug already found and fixed once
            elsewhere in this file). The staged-progress overlay below sits
            ON TOP of this canvas rather than hiding it, so the highway is
            genuinely visible (idle background, audience, stars) the moment a
            performance is imminent, not just once it actually starts. */}
        <div ref={containerRef} className="absolute inset-0">
          <canvas ref={canvasRef} className="w-full h-full block" />
        </div>
        {/* Every instrument gets a top (full-performer) overlay on the
            highway itself. The fretting-hand close-up (guitar/bass only)
            renders on the loading screen instead, below — see
            InstrumentLoadingSprite/StagedProgress. */}
        <InstrumentTopOverlay ref={topSpriteRef} engineRef={engineRef} accentColor={instrument.accent} sheet={INSTRUMENT_TOP_SHEETS[instrument.id]} />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55">
            <StagedProgress stage={selectingInfo?.loading_stage ?? 'loading_song'} sheet={INSTRUMENT_BOTTOM_SHEETS[instrument.id]} />
          </div>
        )}
        {ready && (
          <>
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
            <button
              onClick={handleCheerTap}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-5 py-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 active:scale-95 text-white text-sm font-bold rounded-full shadow-lg transition-all flex items-center gap-1.5"
            >
              🎉 Cheer
            </button>
          </>
        )}
      </div>

      <div className="shrink-0 text-center py-1 bg-gray-900 border-t border-gray-800">
        <p className="text-xs text-gray-600">
          {ready ? `Watching ${playerLabel} live — sit back and cheer them on 🎉` : `Getting ready for ${playerLabel}'s performance…`}
        </p>
      </div>
    </div>
  );
}

// ── Read-only mirror of SongPicker's search screen — same visual structure,
// fed entirely from the rhythm_hero_selecting broadcast snapshot, no local
// state or interactivity of its own.
function SongPickerMirror({ info }) {
  return (
    <div className="flex flex-col gap-4 max-w-md w-full mx-auto px-4">
      <div className="flex gap-2 bg-gray-900/60 rounded-xl p-1">
        <div className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold ${info.tab !== 'upload' ? 'bg-purple-600 text-white' : 'text-gray-500'}`}>
          <Search className="w-3.5 h-3.5" /> Search Online
        </div>
        <div className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold ${info.tab === 'upload' ? 'bg-purple-600 text-white' : 'text-gray-500'}`}>
          <Upload className="w-3.5 h-3.5" /> Upload Your Own
        </div>
      </div>

      {info.tab !== 'upload' ? (
        <>
          <div className="flex gap-2 -mb-1">
            <div className={`flex-1 py-1.5 rounded-lg text-xs font-semibold text-center ${info.search_source !== 'jamendo' ? 'bg-purple-700/60 text-white border border-purple-500' : 'bg-gray-900/50 text-gray-500 border border-gray-800'}`}>
              🎵 iTunes
            </div>
            <div className={`flex-1 py-1.5 rounded-lg text-xs font-semibold text-center ${info.search_source === 'jamendo' ? 'bg-purple-700/60 text-white border border-purple-500' : 'bg-gray-900/50 text-gray-500 border border-gray-800'}`}>
              🌱 Jamendo (Full Length)
            </div>
          </div>
          <div className="w-full bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white min-h-[2.75rem]">
            {info.title || <span className="text-gray-500">Song title…</span>}
          </div>
          <div className="w-full bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white min-h-[2.75rem]">
            {info.artist || <span className="text-gray-500">Artist (optional)…</span>}
          </div>
          {info.is_searching && (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Searching…
            </div>
          )}
          {info.results && info.results.length === 0 && (
            <p className="text-gray-500 text-sm text-center">No matches found.</p>
          )}
          {info.results && info.results.length > 0 && (
            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pointer-events-none">
              {info.results.map((r) => (
                <div key={r.trackId} className="flex items-center gap-2.5 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2">
                  {r.artworkUrl && <img src={r.artworkUrl} alt="" className="w-10 h-10 rounded flex-shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{r.trackName}</p>
                    <p className="text-gray-400 text-xs truncate">{r.artistName}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="w-full bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white min-h-[2.75rem]">
          {info.uploadTitle || <span className="text-gray-500">Song name…</span>}
        </div>
      )}
      {info.search_error && <p className="text-red-400 text-xs text-center">{info.search_error}</p>}
    </div>
  );
}

// ── Selection mirror ─────────────────────────────────────────────────────────
// Read-only mirror of the active player's instrument-pick / song-search
// screens, driven entirely by the rhythm_hero_selecting broadcast — same
// "genuine live UI, not a video stream" philosophy as WarmPerformanceMirror,
// just for the two pre-gameplay phases that don't need a warmed engine.
// Only ever renders for 'instrument'/'song' phases now — 'loading' is
// handled by WarmPerformanceMirror instead (see its own comment for why:
// that phase is exactly where the spectator's engine gets pre-warmed, which
// needs a persistent canvas this component doesn't have).
function SelectionMirror({ info, playerLabel, onClose, matchFramingText, isSuddenDeath }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black select-none" style={{ height: '100dvh' }}>
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <img src="https://LetsWatchOut.b-cdn.net/games/logos/rhythm_hero.png" alt="Rhythm Hero" className="h-6 sm:h-7 w-auto shrink-0" />
          <span className="text-xs text-gray-500 truncate">— {playerLabel} is choosing…</span>
        </div>
        <button onClick={onClose} className="px-2 py-1 text-xs bg-white/20 hover:bg-white/30 rounded"><X className="w-3.5 h-3.5" /></button>
      </div>

      {(matchFramingText || isSuddenDeath) && (
        <div className="flex flex-col items-center gap-0.5 py-1.5 bg-gray-900/60 border-b border-gray-800 shrink-0">
          {matchFramingText && <p className="text-[11px] uppercase tracking-wide text-purple-400 font-semibold">{matchFramingText}</p>}
          {isSuddenDeath && <p className="text-[11px] uppercase tracking-wide text-red-400 font-bold animate-pulse">⚔️ Sudden Death — replay!</p>}
        </div>
      )}

      <div className="flex-1 flex items-center justify-center overflow-hidden relative px-4">
        {info.phase === 'instrument' && (
          <div className="flex flex-col items-center gap-3 text-white">
            <span className="text-5xl">🎸</span>
            <p className="text-lg font-semibold">{playerLabel} is choosing an instrument…</p>
          </div>
        )}
        {info.phase === 'song' && <SongPickerMirror info={info} />}
      </div>

      <div className="shrink-0 text-center py-1 bg-gray-900 border-t border-gray-800">
        <p className="text-xs text-gray-600">Watching {playerLabel} pick a song…</p>
      </div>
    </div>
  );
}

// ── Score mirror ─────────────────────────────────────────────────────────────
// Read-only room-wide mirror of a just-finished turn's results screen, driven
// by the rhythm_hero_score broadcast — everyone sees the same score at the
// same time, not just the player who just played. Only that player's own
// device has real, clickable action buttons (Proceed for a tournament turn —
// see handleProceedTournament, or Play Again/Challenge Friends for a solo
// run — see playAgainSolo/handleChallengeFriends); every other client sees
// the identical layout with those buttons visibly present but disabled, so
// the room sees exactly what the active player is looking at, not just a
// bare score line.
function ScoreMirror({ info, matchFramingText, isSuddenDeath }) {
  const label = info.player_name || 'They';
  const accuracyLine = typeof info.accuracy === 'number' && (
    <p className="text-sm text-gray-400">
      {Math.round(info.accuracy * 100)}% accuracy · {info.hits}/{info.total} notes
    </p>
  );

  if (info.solo) {
    return (
      // See the height:100dvh comment on the sibling loadError branch above.
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-3 text-white" style={{ height: '100dvh' }}>
        <Trophy className="w-14 h-14 text-yellow-400" />
        <p className="text-2xl font-bold">Score: {Number(info.score || 0).toLocaleString()}</p>
        {accuracyLine}
        <div className="flex gap-2 mt-2">
          <button
            disabled
            className="px-6 py-2.5 bg-purple-600/30 text-white/50 font-bold rounded-xl text-sm cursor-not-allowed"
          >
            Play Again
          </button>
          <button
            disabled
            className="px-6 py-2.5 bg-white/10 text-white/50 font-bold rounded-xl text-sm cursor-not-allowed border border-white/10"
          >
            Challenge Friends
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">Waiting for {label} to choose what's next…</p>
      </div>
    );
  }

  return (
    // See the height:100dvh comment on the sibling loadError branch above.
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white" style={{ height: '100dvh' }}>
      <Trophy className="w-14 h-14 text-yellow-400" />
      {matchFramingText && <p className="text-xs uppercase tracking-wide text-purple-400 font-semibold">{matchFramingText}</p>}
      {isSuddenDeath && <p className="text-xs uppercase tracking-wide text-red-400 font-bold animate-pulse">⚔️ Sudden Death — replay!</p>}
      <p className="text-lg font-semibold">{label}'s score: {Number(info.score || 0).toLocaleString()}</p>
      {accuracyLine}
      <button
        disabled
        className="mt-2 px-6 py-2.5 bg-purple-600/30 rounded-lg text-sm font-semibold text-white/60 cursor-not-allowed"
      >
        Proceed →
      </button>
      <p className="text-sm text-gray-400">Waiting for {label} to proceed…</p>
    </div>
  );
}

// ── Leaderboard panel ────────────────────────────────────────────────────────
// A dismissible overlay showing every completed performance THIS watch
// session, solo and tournament alike, sorted desc by score — entries come
// straight from the backend's own in-memory, room-scoped, session-lifetime
// leaderboard (see rhythm_hero_leaderboard_update). Toggled by a small
// header button on both the active player's own view and every spectator's
// WarmPerformanceMirror.
function LeaderboardPanel({ entries, onClose }) {
  return (
    <div className="absolute inset-0 z-20 bg-black/85 flex items-center justify-center p-4">
      <div className="w-full max-w-xs bg-gray-900 border border-gray-700 rounded-2xl p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-white font-bold text-sm flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-yellow-400" /> Session Leaderboard
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
        </div>
        {!entries || entries.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-4">No scores yet this session — be the first!</p>
        ) : (
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {entries.map((e, i) => (
              <div key={`${e.user_id}-${e.timestamp}-${i}`} className="flex items-center gap-2 bg-gray-800/60 rounded-lg px-3 py-1.5">
                <span className="text-gray-400 text-xs w-6 shrink-0">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
                <span className="text-white text-sm font-semibold truncate flex-1">{e.username}</span>
                <span className="text-purple-300 text-sm font-bold tabular-nums shrink-0">{Number(e.score || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
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
  onRhythmHeroBroadcast = null,
  rhythmHeroLiveInfo = null,
  rhythmHeroSelectingInfo = null,
  rhythmHeroScoreInfo = null,
  registerRhythmHeroInputReceiver = null,
  registerRhythmHeroCheerReceiver = null,
  roomId = null,
  sessionId = null,
  onPostResult = null,
  rhythmHeroLeaderboard = [],
  currentUsername = null,
}) {
  const isInTournament = !!hotSeatTournament;
  const isMyTurn = isInTournament && hotSeatTournament.current_player_id === currentUserId;
  // Whose performance should broadcast to the room right now — the sole host
  // in solo/arcade mode, or whoever the hot-seat rotation says is up.
  const isActivePlayer = isInTournament ? isMyTurn : isHost;

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const audioCtxRef = useRef(null);
  const endedHandledRef = useRef(false);
  const lyricsRef = useRef([]);
  const lyricsIntervalRef = useRef(null);
  const topSpriteRef = useRef(null);
  // bottomSpriteRef removed — the fretting-hand close-up no longer renders
  // as a highway overlay (see InstrumentLoadingSprite/StagedProgress), so
  // there's nothing left to speed-modulate here.
  const { recordJudge, resetSpriteSpeed } = useRollingSpriteSpeed([topSpriteRef]);

  // isActivePlayer read at broadcast fire-time (not schedule-time) — a
  // debounced rhythm_hero_selecting send scheduled while active could
  // otherwise fire after the turn has already moved on.
  const isActivePlayerRef = useRef(isActivePlayer);
  isActivePlayerRef.current = isActivePlayer;
  // Read inside onEnd (below) at the moment the song actually finishes,
  // rather than adding the whole hotSeatTournament object to that heavy
  // engine-construction effect's own deps — which would otherwise re-run
  // (tearing down and rebuilding the entire Three.js scene) on every
  // incoming tournament broadcast during gameplay, not just a real turn
  // change.
  const currentPlayerNameRef = useRef(hotSeatTournament?.current_player_name ?? null);
  currentPlayerNameRef.current = hotSeatTournament?.current_player_name ?? null;
  const selectingTimerRef = useRef(null);
  // Accumulated (not React state) from every SongPicker onStateChange patch
  // plus the instrument/phase transitions below — the single source of truth
  // for both the live broadcast payload and re-seeding SongPicker's initialX
  // props after a pipeline failure. Never causes a re-render on its own.
  const selectionSnapshotRef = useRef({});
  // Regenerated once per turn (turn-reset effect below + playAgainSolo) —
  // included in every rhythm_hero_selecting/_start broadcast for that turn so
  // a spectator's warmed-but-not-yet-started engine (see WarmPerformanceMirror)
  // can be identified as belonging to THIS turn across the loading->live
  // transition, without needing rhythm_hero_start's own start_timestamp (which
  // doesn't exist yet during loading).
  const turnKeyRef = useRef(Math.random().toString(36).slice(2));

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
  const [difficulty, setDifficulty] = useState('medium'); // 'easy' | 'medium' | 'hard' | 'expert'
  // Picked once per turn, at the same moment as instrument (handleInstrumentPick
  // below) — a second, independent visual-skinning axis (see STAGES in
  // rhythmGameEngine.js). Broadcast alongside instrument_id via sendSelecting
  // so every connected spectator (including WarmPerformanceMirror's own early,
  // pre-warmed construction) renders the SAME stage for this performance,
  // not an independently re-randomized one.
  const [stageId, setStageId] = useState(null);
  const [songMeta, setSongMeta] = useState(null); // {trackName, artistName}
  const [songAudioUrl, setSongAudioUrl] = useState(null); // null for an uploaded file — see the broadcast section below
  const [songSource, setSongSource] = useState('search'); // 'search' | 'upload'
  const [myScore, setMyScore] = useState(null); // normalized score, set once a turn ends
  const [finalStats, setFinalStats] = useState(null); // raw engine stats for the local results screen (solo mode)
  // Tournament score submission is deliberately held back from onEnd until the
  // player taps "Proceed" on the results screen below — submitting immediately
  // reassigns activeGame.host_id to the next player within a moment (see the
  // hot_seat_turn broadcast in VideoWatch.jsx), which used to flip isHost false
  // on this device and skip straight past the results screen before anyone
  // could read it.
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [currentLyricLine, setCurrentLyricLine] = useState('');
  const [loadingStage, setLoadingStage] = useState(null); // 'fetching_music' | 'fetching_lyrics' | 'loading_song'
  const [selectionError, setSelectionError] = useState(null); // re-seeds SongPicker's inline error after a pipeline failure
  const [showLeaderboard, setShowLeaderboard] = useState(false);

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

  // Broadcasts the room's current view of instrument/song-selection/loading
  // state. Imperative callback + refs rather than a reactive useEffect: the
  // "keystrokes debounced ~100ms, everything else immediate" requirement
  // can't be cleanly expressed by one effect uniformly reacting to a merged
  // dependency, and this avoids a re-render on the active player's own
  // device per keystroke (same reasoning already used for the imperative
  // score/rock/SP HUD refs above). Always sends the FULL accumulated
  // snapshot, never a bare delta — spectators just render whatever they
  // last received, no client-side merge/reconciliation needed.
  const sendSelecting = useCallback((patch, { immediate = false } = {}) => {
    Object.assign(selectionSnapshotRef.current, patch);
    if (!isActivePlayerRef.current) return;
    clearTimeout(selectingTimerRef.current);
    const fire = () => onRhythmHeroBroadcast?.('rhythm_hero_selecting', { ...selectionSnapshotRef.current });
    if (immediate) fire(); else selectingTimerRef.current = setTimeout(fire, 100);
  }, [onRhythmHeroBroadcast]);

  // Spectator-side audio prefetch — the active player never has to re-fetch
  // their own audio (they already have the decoded buffer from picking it),
  // but WarmPerformanceMirror does, and it can only start that fetch once
  // audio_url is actually known. That's now broadcast as part of
  // rhythm_hero_selecting as soon as it's known (immediately on pick for a
  // searched song; once the CDN push resolves for an upload — see
  // handleSongSelect/loadSelectedSong below), so this runs the fetch+decode
  // in parallel with the active player's own remaining loading pipeline
  // instead of strictly after it — feeding straight into the same engine
  // WarmPerformanceMirror has already been busy constructing in the
  // meantime. Best-effort: on any failure this resolves to null and
  // WarmPerformanceMirror transparently falls back to its own fetch.
  const prefetchedAudioRef = useRef({ url: null, buffer: null, promise: null });
  const prefetchAudioUrl = !isActivePlayer ? (rhythmHeroSelectingInfo?.audio_url || null) : null;
  useEffect(() => {
    if (!prefetchAudioUrl || prefetchedAudioRef.current.url === prefetchAudioUrl) return;
    let cancelled = false;
    const entry = { url: prefetchAudioUrl, buffer: null, promise: null };
    entry.promise = (async () => {
      const res = await fetch(resolveMediaUrl(prefetchAudioUrl));
      if (!res.ok) throw new Error('prefetch fetch failed');
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await getAudioCtx().decodeAudioData(arrayBuffer);
      if (!cancelled) entry.buffer = audioBuffer;
      return audioBuffer;
    })().catch(() => null);
    prefetchedAudioRef.current = entry;
    return () => { cancelled = true; };
  }, [prefetchAudioUrl, getAudioCtx]);

  // Fresh run each time a new hot-seat turn starts (or on first solo mount).
  useEffect(() => {
    if (isInTournament && !isMyTurn) return;
    engineRef.current?.dispose();
    engineRef.current = null;
    closeAudioCtx();
    clearTimeout(selectingTimerRef.current);
    selectionSnapshotRef.current = {};
    prefetchedAudioRef.current = { url: null, buffer: null, promise: null };
    setLocalPhase('instrument');
    setInstrument(null);
    setStageId(null);
    setDifficulty('medium');
    setSongMeta(null);
    setSongAudioUrl(null);
    setSongSource('search');
    setMyScore(null);
    setFinalStats(null);
    setScoreSubmitted(false);
    setPendingGameData(null);
    setLoadingStage(null);
    setSelectionError(null);
    endedHandledRef.current = false;
    resetSpriteSpeed();
    turnKeyRef.current = Math.random().toString(36).slice(2);
    sendSelecting(
      { phase: 'instrument', instrument_id: null, stage_id: null, difficulty: 'medium', tab: 'search', title: '', artist: '', uploadTitle: '', results: null, is_searching: false, search_error: null, loading_stage: null, audio_url: null, turn_key: turnKeyRef.current },
      { immediate: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotSeatTournament?.current_player_id]);

  // Receives cheers from any connected spectator, regardless of whether this
  // client is the one actually performing — the cheer visual/sound should
  // land on the performer's own screen too, not just other spectators'.
  useEffect(() => {
    registerRhythmHeroCheerReceiver?.(() => engineRef.current?.cheer());
    return () => registerRhythmHeroCheerReceiver?.(null);
  }, [registerRhythmHeroCheerReceiver]);

  // Teardown the engine + audio context + lyrics poll on unmount — the
  // vendored engine has no automatic cleanup of its own.
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      closeAudioCtx();
      clearTimeout(selectingTimerRef.current);
      if (lyricsIntervalRef.current) clearInterval(lyricsIntervalRef.current);
      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
      if (judgeTimeoutRef.current) clearTimeout(judgeTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInstrumentPick = useCallback((ins) => {
    const picked = pickRandomStageId();
    setInstrument(ins);
    setStageId(picked);
    setLocalPhase('song');
    sendSelecting({ phase: 'song', instrument_id: ins.id, stage_id: picked }, { immediate: true });
  }, [sendSelecting]);

  const handleDifficultyChange = useCallback((d) => {
    setDifficulty(d);
    sendSelecting({ difficulty: d }, { immediate: true });
  }, [sendSelecting]);

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
        recordJudge(kind);
        if (kind === 'perfect') hapticImpact(15);
        else if (kind === 'good') hapticImpact(20);
        else if (kind === 'miss') hapticImpact([10, 30, 10]);
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
        if (text === 'STAR POWER!') {
          hapticImpact([20, 40, 20]);
          if (isActivePlayer) onRhythmHeroBroadcast?.('rhythm_hero_input', { action: 'star_power' });
        } else if (text.endsWith('NOTE STREAK!')) {
          // Star Power and hit/miss already had haptics — streak milestones
          // (engine fires this every 50 notes) were the one banner type that
          // didn't.
          hapticImpact([12, 20, 12, 20, 12]);
        }
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
      // Relays the active player's raw press/release events to every
      // connected spectator (WarmPerformanceMirror's own registerInputReceiver
      // consumes these) — no longer also drives local InstrumentCloseup UI
      // state (removed; the sprite overlays animate from their own GIF
      // frame loop, not press/release events).
      onLanePress: (lane) => {
        if (isActivePlayer) onRhythmHeroBroadcast?.('rhythm_hero_input', { action: 'press', lane });
      },
      onLaneRelease: (lane) => {
        if (isActivePlayer) onRhythmHeroBroadcast?.('rhythm_hero_input', { action: 'release', lane });
      },
      onEnd: (stats) => {
        if (endedHandledRef.current) return;
        endedHandledRef.current = true;
        const duration = Math.max(engineRef.current?.duration || 0, ROUND_SECONDS_FLOOR);
        const normalized = Math.round(stats.score / duration);
        setFinalStats({ ...stats, normalized, duration: engineRef.current?.duration || 0 });
        // Tournament submission itself is deferred to the "Proceed" button on
        // the results screen (see scoreSubmitted above) — only the local
        // score display is set here.
        if (isInTournament) setMyScore(normalized);
        // Session leaderboard — solo AND tournament both submit here (unlike
        // rhythm_hero_score, which is tournament-only), skipping a
        // deliberately-quit-early run (aborted) since that's not a genuine
        // completed attempt worth ranking.
        if (isActivePlayer && !stats.aborted) {
          onRhythmHeroBroadcast?.('rhythm_hero_leaderboard_submit', {
            score: normalized,
            player_name: isInTournament ? currentPlayerNameRef.current : (currentUsername || 'Someone'),
          });
        }
        if (isActivePlayer) {
          if (isInTournament) {
            // Broadcast the result to the whole room immediately — everyone
            // should see the same score screen, not just the player who just
            // finished (see ScoreMirror). rhythm_hero_end itself is deferred
            // to handleProceedTournament below, once the room has actually
            // seen this and the player has proceeded — it also implicitly
            // clears rhythmHeroLiveInfo on receipt (VideoWatch.jsx), so no
            // separate rhythm_hero_end is needed here for that.
            onRhythmHeroBroadcast?.('rhythm_hero_score', {
              // The real/full engine score, not the duration-normalized one —
              // normalized is a fair cross-song comparison metric (used
              // internally for onTournamentScore/leaderboard ranking, and for
              // the "who forfeits to whom" backend calc), but it's a much
              // less satisfying number to actually show a human who just
              // played. This is display-only; nothing here changes what
              // wins the tournament.
              score: stats.score,
              accuracy: stats.accuracy,
              hits: stats.hits,
              total: stats.total,
              player_id: currentUserId,
              player_name: currentPlayerNameRef.current,
            });
          } else {
            // Solo/arcade mode: broadcast the same result the host is about
            // to see (score/accuracy) so the room's mirror shows the exact
            // same Game Over screen — Play Again / Challenge Friends visible
            // but disabled (see ScoreMirror's solo branch). rhythm_hero_end
            // itself is deliberately NOT sent here anymore (it used to fire
            // immediately, which cleared rhythmHeroScoreInfo before the
            // spectator could ever see it) — it's now deferred to whenever
            // the host actually leaves this screen: playAgainSolo, or
            // handleRhythmHeroClose/EndGame's now-broadened guard.
            onRhythmHeroBroadcast?.('rhythm_hero_score', {
              // Same reasoning as the tournament branch above — the real/full
              // engine score, not the duration-normalized one.
              score: stats.score,
              accuracy: stats.accuracy,
              hits: stats.hits,
              total: stats.total,
              player_id: currentUserId,
              player_name: currentUsername || 'Someone',
              solo: true,
            });
          }
        }
      },
    };

    const engine = new Game(canvas, hud, {
      instrumentColors: instrument.colors,
      highwayAccentColor: instrument.accent,
      highwayAccentColorRail: instrument.accentRail,
      stageId,
    });
    engineRef.current = engine;

    engine.start(getAudioCtx(), audioBuffer, chart, meta);

    // Broadcast to the room whenever a real, fetchable URL exists — searched
    // songs always have one (the iTunes preview URL); uploaded songs now do
    // too once loadSelectedSong successfully pushes them to BunnyCDN.
    // songAudioUrl stays null if that push failed/was skipped (offline, no
    // roomId/sessionId, etc.) — the song still plays locally for the active
    // player either way, it just silently can't broadcast.
    if (isActivePlayer && songAudioUrl) {
      onRhythmHeroBroadcast?.('rhythm_hero_start', {
        instrument_id: instrument.id,
        stage_id: stageId,
        song_source: songSource,
        track_name: meta.trackName,
        artist_name: meta.artistName,
        audio_url: songAudioUrl,
        chart,
        start_timestamp: Date.now(),
        player_id: currentUserId,
        turn_key: turnKeyRef.current,
        difficulty,
      });
    }

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

  }, [localPhase, pendingGameData, instrument, stageId, isInTournament, onTournamentScore, getAudioCtx, isActivePlayer, songAudioUrl, songSource, onRhythmHeroBroadcast, currentUserId, difficulty, currentUsername, recordJudge]);

  // Owns the whole fetch/decode/lyrics/upload/chart-generation pipeline —
  // relocated here from SongPicker so the loading screen it drives is one
  // continuous, correctly-staged experience instead of two disconnected
  // spinners (SongPicker's old internal one + this component's old separate
  // "Generating your chart…" one). Sequential now, not the original
  // Promise.all-raced audio+lyrics fetch — trades a small amount of total
  // load time for genuinely accurate, honest stage labels; the lyrics fetch
  // is timeout-capped regardless (see fetchLyricsWithTimeout).
  const loadSelectedSong = useCallback(async (selection) => {
    try {
      let arrayBuffer, trackName, artistName, previewUrl, source;
      if (selection.type === 'search') {
        const r = selection.result;
        const audioRes = await fetch(r.previewUrl);
        if (!audioRes.ok) throw new Error('preview download failed');
        arrayBuffer = await audioRes.arrayBuffer();
        trackName = r.trackName;
        artistName = r.artistName || '';
        previewUrl = r.previewUrl;
        // Jamendo results carry the FULL track (not a 30s preview) — flagged
        // via isFullLength at normalization time (see searchJamendo) — so
        // they're eligible for real lyric sync below, same as an upload.
        source = r.isFullLength ? 'jamendo' : 'search';
      } else {
        const file = selection.file;
        arrayBuffer = await file.arrayBuffer();
        trackName = (selection.uploadTitle || '').trim() || file.name.replace(/\.[^/.]+$/, '');
        artistName = '';
        previewUrl = null;
        source = 'upload';
      }

      setLoadingStage('fetching_lyrics');
      sendSelecting({ loading_stage: 'fetching_lyrics' }, { immediate: true });
      const lyricsResult = await fetchLyricsWithTimeout(trackName, artistName);

      setLoadingStage('loading_song');
      sendSelecting({ loading_stage: 'loading_song' }, { immediate: true });
      const audioBuffer = await getAudioCtx().decodeAudioData(arrayBuffer);

      // Best-effort push to BunnyCDN so uploaded songs get the same room-wide
      // live-broadcast feature searched songs already have. Never blocks the
      // active player's own playback: a failed/skipped upload just means
      // audioUrl stays null, silently falling back to the broadcast-skipped
      // behavior for this one song.
      let audioUrl = previewUrl;
      if (source === 'upload' && roomId && sessionId) {
        try {
          const formData = new FormData();
          formData.append('audio', selection.file);
          formData.append('session_id', sessionId);
          const res = await apiClient.post(`/api/rooms/${roomId}/rhythm-hero-audio`, formData, {
            headers: { 'Content-Type': undefined },
          });
          audioUrl = res.data?.audio_url || null;
          // Unlike a searched song's URL (known upfront and already
          // broadcast in handleSongSelect), an upload's URL only exists once
          // this push succeeds — broadcast it now so spectators can start
          // prefetching it, still well before rhythm_hero_start fires.
          if (audioUrl) sendSelecting({ audio_url: audioUrl }, { immediate: true });
        } catch {
          // Silently degrade — see the comment above.
        }
      }

      setSongMeta({ trackName, artistName });
      setSongAudioUrl(audioUrl);
      setSongSource(source);
      // Real per-line sync for uploads AND Jamendo (both are the true,
      // complete track — local elapsed time genuinely maps to absolute song
      // position) — see evenlyPacedLyrics's own comment for why a searched
      // iTunes preview specifically can't be trusted for this. Falls back to
      // the same evenly-paced approximation if this particular track has no
      // synced lyrics on LRCLIB at all.
      const attemptRealSync = source === 'upload' || source === 'jamendo';
      const syncedParsed = attemptRealSync ? parseLRC(lyricsResult.synced) : [];
      lyricsRef.current = syncedParsed.length > 0
        ? syncedParsed
        : evenlyPacedLyrics(lyricsResult.plain, audioBuffer.duration);

      // Yield one frame so React can actually paint the loading screen's
      // last stage before generateChart()'s synchronous DSP work blocks the
      // main thread — it runs on the main thread with no Web Worker (flagged
      // risk, not worth the added complexity unless a real playtest shows
      // it's actually slow enough to matter).
      await new Promise(requestAnimationFrame);
      const chart = generateChart(audioBuffer, difficulty);
      startGameplay(audioBuffer, chart, { trackName, artistName });
    } catch {
      // Restore the picker exactly where the user left off (SongPicker's
      // initialX props are re-seeded from selectionSnapshotRef, already kept
      // current throughout), with an inline error — matches the original
      // component's own pre-existing "let the user immediately retry a
      // different result" behavior rather than forcing a re-search.
      const message = selection.type === 'upload'
        ? 'Could not read that audio file — try a different one.'
        : 'Could not load that preview — try a different result.';
      setSelectionError(message);
      setLoadingStage(null);
      setLocalPhase('song');
      sendSelecting({ phase: 'song', search_error: message }, { immediate: true });
    }
  }, [getAudioCtx, roomId, sessionId, sendSelecting, startGameplay, difficulty]);

  const handleSongSelect = useCallback((selection) => {
    // Cancel any pending debounced 'selecting' keystroke send — otherwise it
    // could fire after this phase-transition broadcast and overwrite the
    // backend's cache with stale "still picking" data for the rest of the
    // performance (rhythm_hero_input never touches that cache to naturally
    // supersede it).
    clearTimeout(selectingTimerRef.current);
    setSelectionError(null);
    setLocalPhase('loading');
    setLoadingStage('fetching_music');
    // A searched song's audio_url is already known upfront (the iTunes
    // preview URL) — broadcasting it immediately here, rather than waiting
    // for the pipeline to finish, is what lets spectators start prefetching
    // it in the background right away. An upload's URL isn't known until
    // the CDN push resolves partway through loadSelectedSong (see there).
    sendSelecting(
      { phase: 'loading', loading_stage: 'fetching_music', audio_url: selection.type === 'search' ? selection.result.previewUrl : null },
      { immediate: true }
    );
    loadSelectedSong(selection);
  }, [sendSelecting, loadSelectedSong]);

  // Challenge Friends — solo mode only, matching this game package's own
  // existing convention: GameWinnerBanner's onPostResult(text) is used by
  // real head-to-head match results, and hot-seat arcade games (Toad Ball,
  // Fowl Play) don't wire it in for their own multi-turn flows either. A
  // solo song completion is the one genuinely clean "I just got a score,
  // share it" moment here, so it's scoped to that screen only. Rhythm Hero
  // doesn't use the shared GameWinnerBanner component (its own bespoke
  // results UI predates this and stays as-is) — onPostResult's real contract
  // is just a plain summary string, confirmed via GameWinnerBanner.jsx's own
  // handleClose, so calling it directly here needs no new UI adoption.
  const handleChallengeFriends = useCallback(() => {
    if (!onPostResult || !finalStats) return;
    const diffLabel = DIFFICULTIES.find((d) => d.id === difficulty)?.label ?? difficulty;
    const songBit = songMeta?.trackName ? ` on "${songMeta.trackName}"` : '';
    onPostResult(`🎸 Scored ${finalStats.score.toLocaleString()} pts${songBit} (${diffLabel}) in Rhythm Hero — think you can beat it?`);
  }, [onPostResult, finalStats, difficulty, songMeta]);

  const playAgainSolo = useCallback(() => {
    // Clears the room's mirrored Game Over screen (rhythmHeroScoreInfo) —
    // deferred here from onEnd, see that comment for why.
    onRhythmHeroBroadcast?.('rhythm_hero_end', {});
    engineRef.current?.dispose();
    engineRef.current = null;
    closeAudioCtx();
    endedHandledRef.current = false;
    setFinalStats(null);
    setPendingGameData(null);
    setLoadingStage(null);
    setSelectionError(null);
    resetSpriteSpeed();
    selectionSnapshotRef.current = {};
    prefetchedAudioRef.current = { url: null, buffer: null, promise: null };
    setLocalPhase('instrument');
    setInstrument(null);
    setStageId(null);
    setDifficulty('medium');
    setSongMeta(null);
    setSongAudioUrl(null);
    setSongSource('search');
    turnKeyRef.current = Math.random().toString(36).slice(2);
    sendSelecting(
      { phase: 'instrument', instrument_id: null, stage_id: null, difficulty: 'medium', tab: 'search', title: '', artist: '', uploadTitle: '', results: null, is_searching: false, search_error: null, loading_stage: null, audio_url: null, turn_key: turnKeyRef.current },
      { immediate: true }
    );
  }, [closeAudioCtx, sendSelecting, onRhythmHeroBroadcast, resetSpriteSpeed]);

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

  // Keep each fret button positioned directly under the highway ring it
  // actually controls — driven live from the engine's own camera projection
  // (getLaneScreenXFractions), not a fixed evenly-spaced guess. Writes
  // straight to each button's style.left via a ref, bypassing React state,
  // so this can run every animation frame without triggering a re-render.
  const fretButtonRefs = useRef([]);
  useEffect(() => {
    if (!isTouchDevice || localPhase !== 'playing') return;
    let raf;
    const tick = () => {
      const fractions = engineRef.current?.getLaneScreenXFractions?.();
      const containerWidth = containerRef.current?.offsetWidth;
      if (fractions && containerWidth) {
        fractions.forEach((frac, i) => {
          const btn = fretButtonRefs.current[i];
          if (!btn) return;
          const clamped = Math.max(0.03, Math.min(0.97, frac));
          btn.style.left = `${clamped * containerWidth}px`;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isTouchDevice, localPhase]);

  const handleProceedTournament = useCallback(() => {
    if (scoreSubmitted || myScore === null) return;
    setScoreSubmitted(true);
    // Clears rhythmHeroScoreInfo for the whole room (ScoreMirror) now that
    // the room has actually seen it and this player is proceeding — see the
    // comment on the rhythm_hero_score broadcast in onEnd above.
    onRhythmHeroBroadcast?.('rhythm_hero_end', {});
    onTournamentScore?.(myScore);
  }, [scoreSubmitted, myScore, onTournamentScore, onRhythmHeroBroadcast]);

  // A finished-but-not-yet-dismissed result screen — solo's Game Over
  // overlay or a tournament turn awaiting Proceed — both keep localPhase at
  // 'playing' (the result renders on top, it's not a phase transition), so
  // the close/end-game handlers below need this in addition to their
  // localPhase check or they'd leave rhythmHeroScoreInfo stuck on
  // spectators' screens if the host closes out without ever pressing
  // Play Again / Proceed.
  const hasPendingResult = (!isInTournament && !!finalStats) || (isInTournament && myScore !== null);

  const handleRhythmHeroClose = useCallback(() => {
    clearTimeout(selectingTimerRef.current);
    if (isActivePlayer && (localPhase !== 'playing' || hasPendingResult)) {
      // rhythm_hero_end reused for the abandon-selection clear too, not just
      // genuine performance completion — confirmed safe: the only consumer
      // of a *received* rhythm_hero_end is a state clear (VideoWatch.jsx),
      // and all real scoring is computed locally, before this is ever sent.
      onRhythmHeroBroadcast?.('rhythm_hero_end', {});
    }
    onClose?.();
  }, [isActivePlayer, localPhase, hasPendingResult, onRhythmHeroBroadcast, onClose]);

  const handleRhythmHeroEndGame = useCallback(() => {
    clearTimeout(selectingTimerRef.current);
    if (isActivePlayer && (localPhase !== 'playing' || hasPendingResult)) {
      onRhythmHeroBroadcast?.('rhythm_hero_end', {});
    }
    onEndGame?.();
    onClose?.();
  }, [isActivePlayer, localPhase, hasPendingResult, onRhythmHeroBroadcast, onEndGame, onClose]);

  // Bracket-mode framing shared by several of the branches below.
  const isBracketMode = hotSeatTournament?.mode === 'bracket';
  const currentMatch = hotSeatTournament?.current_match ?? null;
  const isSuddenDeath = isBracketMode && (currentMatch?.replays ?? 0) > 0;
  const matchFramingText = isBracketMode && currentMatch
    ? `Round ${(hotSeatTournament?.current_round ?? 0) + 1}, Match ${(currentMatch.index ?? 0) + 1}: ${currentMatch.player1?.username || '?'} vs ${currentMatch.player2?.username || '?'}`
    : null;
  // Set once this player has lost a bracket match — they stay in the tournament's
  // participant list (for the framing above) but never take another turn.
  const isEliminated = isInTournament && hotSeatTournament?.participants?.some(
    (p) => p.user_id === currentUserId && p.eliminated
  );

  // 1. Non-host, hot-seat tournament active: mirror the live performance if
  // one's broadcasting, else mirror the selection/loading screen if that's
  // broadcasting, else the same static placeholder as before.
  if (!isHost && isInTournament) {
    const currentPlayerName = hotSeatTournament?.current_player_name ?? 'someone';
    // Warm the moment a performance is imminent (loading phase) OR mirror one
    // already in progress (including a late joiner connecting straight into
    // an active liveInfo, which never sees a loading phase of its own) — see
    // WarmPerformanceMirror's own comment for why this is one persistent
    // mount rather than two separate ones.
    if (rhythmHeroLiveInfo?.active || rhythmHeroSelectingInfo?.phase === 'loading') {
      return (
        <WarmPerformanceMirror
          key={rhythmHeroLiveInfo?.turn_key ?? rhythmHeroSelectingInfo?.turn_key ?? 'warm'}
          selectingInfo={rhythmHeroSelectingInfo}
          liveInfo={rhythmHeroLiveInfo}
          registerInputReceiver={registerRhythmHeroInputReceiver}
          playerLabel={currentPlayerName}
          onClose={onClose}
          prefetchedAudio={prefetchedAudioRef.current}
          matchFramingText={matchFramingText}
          isSuddenDeath={isSuddenDeath}
          registerCheerReceiver={registerRhythmHeroCheerReceiver}
          onCheerSend={() => onRhythmHeroBroadcast?.('rhythm_hero_cheer', {})}
          leaderboard={rhythmHeroLeaderboard}
        />
      );
    }
    if (rhythmHeroScoreInfo?.active) {
      return (
        <ScoreMirror
          info={rhythmHeroScoreInfo}
          matchFramingText={matchFramingText}
          isSuddenDeath={isSuddenDeath}
        />
      );
    }
    // No broadcast received yet (still connecting, or the active player's
    // turn just started and they haven't touched anything). Render the exact
    // same SelectionMirror a real 'instrument' broadcast would show, with a
    // synthesized default, instead of an empty "nothing to see" placeholder —
    // spectators always see real, live game content, never filler copy.
    return (
      <SelectionMirror
        info={rhythmHeroSelectingInfo || { phase: 'instrument', instrument_id: null }}
        playerLabel={currentPlayerName}
        onClose={onClose}
        matchFramingText={matchFramingText}
        isSuddenDeath={isSuddenDeath}
      />
    );
  }

  // 2. Non-host, no tournament: same mirror-if-broadcasting logic.
  if (!isHost) {
    if (rhythmHeroLiveInfo?.active || rhythmHeroSelectingInfo?.phase === 'loading') {
      return (
        <WarmPerformanceMirror
          key={rhythmHeroLiveInfo?.turn_key ?? rhythmHeroSelectingInfo?.turn_key ?? 'warm'}
          selectingInfo={rhythmHeroSelectingInfo}
          liveInfo={rhythmHeroLiveInfo}
          registerInputReceiver={registerRhythmHeroInputReceiver}
          playerLabel="the host"
          onClose={onClose}
          prefetchedAudio={prefetchedAudioRef.current}
          registerCheerReceiver={registerRhythmHeroCheerReceiver}
          onCheerSend={() => onRhythmHeroBroadcast?.('rhythm_hero_cheer', {})}
          leaderboard={rhythmHeroLeaderboard}
        />
      );
    }
    if (rhythmHeroScoreInfo?.active) {
      return <ScoreMirror info={rhythmHeroScoreInfo} />;
    }
    // Same reasoning as the tournament branch above — always show real,
    // live game content instead of a generic filler placeholder.
    return (
      <SelectionMirror
        info={rhythmHeroSelectingInfo || { phase: 'instrument', instrument_id: null }}
        playerLabel="the host"
        onClose={onClose}
      />
    );
  }

  // 3. Host device, tournament active, but it's someone else's turn.
  if (isInTournament && !isMyTurn && myScore === null) {
    const currentPlayerName = hotSeatTournament?.current_player_name ?? '…';
    return (
      /* height:100dvh overrides inset-0's implied 100vh-based height (CSS
         correctly prioritizes an explicit height over the top+bottom
         combination) — 100vh sizes against the mobile browser's LAYOUT
         viewport (assumes the address bar is hidden), which is why this
         container could render taller than the actually-visible screen on
         a real phone; 100dvh tracks the real, currently-visible viewport.
         Same fix already established elsewhere in this codebase for this
         exact class of bug (index.css, VideoWatch.jsx, LobbyPage.jsx). */
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white" style={{ height: '100dvh' }}>
        <span className="text-6xl">⏳</span>
        {matchFramingText && <p className="text-xs uppercase tracking-wide text-purple-400 font-semibold">{matchFramingText}</p>}
        {isSuddenDeath && <p className="text-xs uppercase tracking-wide text-red-400 font-bold animate-pulse">⚔️ Sudden Death — replay!</p>}
        <p className="text-lg font-semibold">Pass the device to {currentPlayerName}</p>
        <p className="text-sm text-gray-400">Waiting for their turn to start…</p>
        {onEndGame && <button onClick={() => { onEndGame?.(); onClose?.(); }} className="mt-2 px-5 py-2 bg-red-700 hover:bg-red-800 rounded-lg text-sm transition-colors">End Tournament</button>}
      </div>
    );
  }

  // 4. Host device, my hot-seat turn just ended — waiting for the rotation
  // (or, in bracket mode, eliminated from further play).
  if (isInTournament && myScore !== null) {
    return (
      /* height:100dvh overrides inset-0's implied 100vh-based height (CSS
         correctly prioritizes an explicit height over the top+bottom
         combination) — 100vh sizes against the mobile browser's LAYOUT
         viewport (assumes the address bar is hidden), which is why this
         container could render taller than the actually-visible screen on
         a real phone; 100dvh tracks the real, currently-visible viewport.
         Same fix already established elsewhere in this codebase for this
         exact class of bug (index.css, VideoWatch.jsx, LobbyPage.jsx). */
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white" style={{ height: '100dvh' }}>
        <Trophy className="w-14 h-14 text-yellow-400" />
        {matchFramingText && <p className="text-xs uppercase tracking-wide text-purple-400 font-semibold">{matchFramingText}</p>}
        {isSuddenDeath && !isEliminated && <p className="text-xs uppercase tracking-wide text-red-400 font-bold animate-pulse">⚔️ Sudden Death — replay!</p>}
        {/* Real/full engine score, matching what ScoreMirror now shows everyone
            else — myScore (normalized by song duration) is still used
            internally for onTournamentScore/leaderboard ranking, just not
            for display. */}
        <p className="text-lg font-semibold">Your score: {(finalStats?.score ?? myScore).toLocaleString()}</p>
        {finalStats && (
          <p className="text-sm text-gray-400">
            {Math.round(finalStats.accuracy * 100)}% accuracy · {finalStats.hits}/{finalStats.total} notes
          </p>
        )}
        {!scoreSubmitted ? (
          <button
            onClick={handleProceedTournament}
            className="mt-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-semibold transition-colors"
          >
            Proceed →
          </button>
        ) : isMyTurn ? (
          // Submitted, but hotSeatTournament still reflects this device's own
          // (now-stale) turn — the backend hasn't broadcast the advance yet.
          <p className="text-sm text-gray-400">Submitting…</p>
        ) : isEliminated ? (
          <p className="text-sm text-gray-400">You were eliminated — thanks for playing!</p>
        ) : (
          <p className="text-sm text-gray-400">Pass the device to the next player…</p>
        )}
      </div>
    );
  }

  // 5. Actual gameplay flow — instrument select -> song select -> loading -> playing.
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black select-none" style={{ height: '100dvh' }}>
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <img src="https://LetsWatchOut.b-cdn.net/games/logos/rhythm_hero.png" alt="Rhythm Hero" className="h-6 sm:h-7 w-auto shrink-0" />
          {songMeta?.trackName && <span className="text-xs text-gray-500 truncate">— {songMeta.trackName}</span>}
          {localPhase === 'playing' && (
            <span className="text-[10px] uppercase tracking-wide text-purple-300 bg-purple-900/50 px-1.5 py-0.5 rounded shrink-0">
              {DIFFICULTIES.find((d) => d.id === difficulty)?.label ?? difficulty}
            </span>
          )}
          <GameRulesButton gameType="rhythm_hero" className="text-gray-500" />
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setShowLeaderboard(true)} className="px-2 py-1 text-xs bg-white/20 hover:bg-white/30 rounded"><Trophy className="w-3.5 h-3.5" /></button>
          {onEndGame && <button onClick={handleRhythmHeroEndGame} className="px-2 py-1 text-xs bg-red-700 hover:bg-red-800 rounded font-medium">End</button>}
          <button onClick={handleRhythmHeroClose} className="px-2 py-1 text-xs bg-white/20 hover:bg-white/30 rounded"><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {showLeaderboard && <LeaderboardPanel entries={rhythmHeroLeaderboard} onClose={() => setShowLeaderboard(false)} />}

      <div className="flex-1 flex items-center justify-center overflow-hidden relative">
        {localPhase === 'instrument' && (
          <InstrumentPicker onPick={handleInstrumentPick} difficulty={difficulty} onDifficultyChange={handleDifficultyChange} />
        )}
        {localPhase === 'song' && (
          <SongPicker
            onSelect={handleSongSelect}
            onStateChange={sendSelecting}
            onCancel={() => { setLocalPhase('instrument'); sendSelecting({ phase: 'instrument', instrument_id: instrument?.id ?? null }, { immediate: true }); }}
            initialTab={selectionSnapshotRef.current.tab}
            initialTitle={selectionSnapshotRef.current.title}
            initialArtist={selectionSnapshotRef.current.artist}
            initialUploadTitle={selectionSnapshotRef.current.uploadTitle}
            initialResults={selectionSnapshotRef.current.results}
            initialSearchSource={selectionSnapshotRef.current.search_source}
            initialError={selectionError}
          />
        )}
        {localPhase === 'loading' && <StagedProgress stage={loadingStage} sheet={INSTRUMENT_BOTTOM_SHEETS[instrument?.id]} />}
        {localPhase === 'playing' && (
          <>
            <div ref={containerRef} className="absolute inset-0">
              <canvas ref={canvasRef} className="w-full h-full block" />
            </div>

            {/* Every instrument gets a top (full-performer) overlay on the
                highway itself. The fretting-hand close-up (guitar/bass only)
                renders on the loading screen instead, above — see
                InstrumentLoadingSprite/StagedProgress. */}
            <InstrumentTopOverlay ref={topSpriteRef} engineRef={engineRef} accentColor={instrument.accent} sheet={INSTRUMENT_TOP_SHEETS[instrument.id]} />

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
            {/* Lives in the empty band below the highway's own footprint
                (the highway only ever occupies roughly the middle third of
                the screen — see the mobile-framing investigation), not
                overlaid ON the highway/notes like the previous ambient
                version — so it no longer needs to be near-invisible (14%
                opacity) to stay out of the gameplay's way; full readable
                opacity works now that it has its own dedicated space.
                Bottom offset is touch-device-conditional so it clears the
                fret-button row below it rather than sitting on top of it —
                non-touch devices have no buttons to avoid, so they get a
                smaller, closer-to-the-edge offset instead. */}
            {currentLyricLine && (
              <div
                key={currentLyricLine}
                className={`absolute left-1/2 -translate-x-1/2 w-[92%] px-4 text-center text-lg sm:text-2xl font-bold text-white/80 truncate pointer-events-none animate-fade-in ${isTouchDevice ? 'bottom-20 sm:bottom-24' : 'bottom-8 sm:bottom-10'}`}
              >
                {currentLyricLine}
              </div>
            )}

            {/* Touch fret buttons — real touch devices only, exactly 5 (one
                per lane). Each button's `left` is written directly by the
                fretButtonRefs effect above, driven by the engine's live
                camera projection — so they sit under the real rings rather
                than an arbitrary evenly-spaced guess, and the row's actual
                width/spacing is whatever the highway itself renders at
                (typically most of the screen at the near hit-line), not a
                cramped fixed budget. Buttons are `absolute` inside a full-
                width `relative` band rather than a flex row, since each one
                now needs an independent computed position, not a shared gap.
                Sized up from the old 44px mobile default now that spacing is
                no longer squeezed to fit a fixed row width. */}
            {isTouchDevice && (
              <div className="absolute inset-x-0 bottom-4 h-14 sm:h-16 pointer-events-none">
                {instrument?.colors.map((color, i) => (
                  <button
                    key={i}
                    ref={(el) => { fretButtonRefs.current[i] = el; }}
                    onTouchStart={handleFretDown(i)}
                    onTouchEnd={handleFretUp(i)}
                    onTouchCancel={handleFretUp(i)}
                    className="absolute bottom-0 -translate-x-1/2 w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-white/40 active:scale-90 transition-transform pointer-events-auto"
                    style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}`, left: `${(i / 4) * 100}%` }}
                  />
                ))}
              </div>
            )}

            {/* Star Power activation — deliberately NOT part of the fret row
                (it was previously a visually-identical 6th circle sitting
                right next to lane 5, an easy mis-tap during fast play).
                Placed next to its own SP meter instead, both spatially
                separated from the lane-tapping zone and directly tied to the
                indicator that tells you when it's actually worth pressing. */}
            {isTouchDevice && (
              <button
                onTouchStart={handleSpTouch}
                className="absolute top-11 right-3 w-11 h-11 rounded-xl border-2 border-white/40 bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white text-base active:scale-90 transition-transform pointer-events-auto"
                aria-label="Activate Star Power"
              >
                ★
              </button>
            )}

            {!isInTournament && finalStats && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 text-white">
                <Trophy className="w-14 h-14 text-yellow-400" />
                <p className="text-2xl font-bold">Score: {finalStats.score.toLocaleString()}</p>
                <p className="text-sm text-gray-400">
                  {Math.round(finalStats.accuracy * 100)}% accuracy · {finalStats.hits}/{finalStats.total} notes · normalized {finalStats.normalized}
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={playAgainSolo}
                    className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold rounded-xl text-sm transition-all"
                  >
                    Play Again
                  </button>
                  {onPostResult && (
                    <button
                      onClick={handleChallengeFriends}
                      className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-sm transition-all border border-white/20"
                    >
                      Challenge Friends
                    </button>
                  )}
                </div>
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
