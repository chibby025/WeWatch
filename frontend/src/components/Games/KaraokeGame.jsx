import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Search, Music, Mic2, Loader2 } from 'lucide-react';
import GameRulesButton from './GameRulesButton';
import YouTubePlayer, { extractYouTubeVideoId } from '../cinema/YouTubePlayer';

// ── LRC parsing ──────────────────────────────────────────────────────────────
// LRCLIB returns lines like "[00:07.13] Caught in a landslide, no escape from
// reality" — parse into a flat, time-sorted array for cheap "which line is
// current" lookups against the YouTube player's own reported playback time.
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

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Song search (host only) ───────────────────────────────────────────────────
function SongSearch({ onPick, onCancel, canCancel }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [results, setResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [selected, setSelected] = useState(null); // chosen LRCLIB result
  const [videoUrl, setVideoUrl] = useState('');
  const videoId = useMemo(() => extractYouTubeVideoId(videoUrl.trim()) || '', [videoUrl]);

  const runSearch = async () => {
    if (!title.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    setResults(null);
    try {
      const params = new URLSearchParams({ track_name: title.trim() });
      if (artist.trim()) params.set('artist_name', artist.trim());
      // LRCLIB is a free, fully CORS-open, no-API-key lyrics database — called
      // directly from the browser, same pattern TriviaGame.jsx already uses
      // for OpenTDB's public trivia API.
      const res = await fetch(`https://lrclib.net/api/search?${params.toString()}`);
      if (!res.ok) throw new Error('search failed');
      const data = await res.json();
      setResults(Array.isArray(data) ? data.slice(0, 12) : []);
    } catch {
      setSearchError('Could not reach the lyrics database — try again.');
    } finally {
      setIsSearching(false);
    }
  };

  if (selected) {
    return (
      <div className="flex flex-col gap-4 max-w-md w-full mx-auto">
        <div className="bg-gray-800/60 rounded-xl p-4">
          <p className="text-white font-semibold">{selected.trackName}</p>
          <p className="text-gray-400 text-sm">{selected.artistName}</p>
          {!selected.syncedLyrics && (
            <p className="text-amber-400 text-xs mt-2">No line-synced lyrics for this track — plain lyrics will show instead (no highlighting).</p>
          )}
        </div>
        <div>
          <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">
            YouTube link (instrumental / karaoke version)
          </label>
          <input
            type="text"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="w-full bg-gray-900/70 border border-gray-700 focus:border-purple-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none"
            autoComplete="off"
          />
          {videoUrl.trim() && !videoId && (
            <p className="text-red-400 text-xs mt-1">That doesn't look like a valid YouTube link.</p>
          )}
        </div>
        {videoId && (
          <img
            src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
            alt="Video preview"
            className="w-full rounded-lg border border-gray-700"
          />
        )}
        <div className="flex gap-2">
          <button
            onClick={() => setSelected(null)}
            className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            Back
          </button>
          <button
            onClick={() => onPick(selected, videoId)}
            disabled={!videoId}
            className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg text-sm transition-all"
          >
            Start Karaoke 🎤
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-md w-full mx-auto">
      <div className="flex gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
          placeholder="Song title…"
          className="flex-1 bg-gray-900/70 border border-gray-700 focus:border-purple-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none"
          autoComplete="off"
        />
      </div>
      <input
        type="text"
        value={artist}
        onChange={(e) => setArtist(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
        placeholder="Artist (optional, helps narrow results)…"
        className="w-full bg-gray-900/70 border border-gray-700 focus:border-purple-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none"
        autoComplete="off"
      />
      <button
        onClick={runSearch}
        disabled={!title.trim() || isSearching}
        className="flex items-center justify-center gap-2 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg text-sm transition-all"
      >
        {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        {isSearching ? 'Searching…' : 'Search Lyrics'}
      </button>

      {searchError && <p className="text-red-400 text-xs text-center">{searchError}</p>}

      {results && results.length === 0 && (
        <p className="text-gray-500 text-sm text-center">No matches — try a different spelling or drop the artist.</p>
      )}

      {results && results.length > 0 && (
        <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className="text-left bg-gray-800/60 hover:bg-gray-800 border border-gray-700 hover:border-purple-500 rounded-lg px-3 py-2 transition-colors"
            >
              <p className="text-white text-sm font-semibold truncate">{r.trackName}</p>
              <p className="text-gray-400 text-xs truncate">
                {r.artistName}{r.albumName ? ` · ${r.albumName}` : ''}{r.duration ? ` · ${formatDuration(r.duration)}` : ''}
              </p>
              {!r.syncedLyrics && <p className="text-amber-500 text-[10px] mt-0.5">No synced lyrics</p>}
            </button>
          ))}
        </div>
      )}

      {canCancel && (
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-300 text-xs text-center mt-1">
          Cancel
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function KaraokeGame({ gameState, currentUserId, onMove, onClose }) {
  const playerRef = useRef(null);
  const lastAppliedSyncTsRef = useRef(null);
  const [currentLineIdx, setCurrentLineIdx] = useState(-1);
  const [pickingNewSong, setPickingNewSong] = useState(false);

  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'waiting';
  const trackName = gs.track_name || '';
  const artistName = gs.artist_name || '';
  const videoId = gs.video_id || '';
  const songNumber = Number(gs.song_number) || 0;

  const players = gameState?.players || [];
  const isHostUser = (gameState?.host_id ?? players[0]?.user_id) === currentUserId;

  const lrcLines = useMemo(() => parseLRC(gs.synced_lyrics), [gs.synced_lyrics]);
  const hasSyncedLyrics = lrcLines.length > 0;

  // Poll the YouTube player's own reported playback position (a normal,
  // sanctioned IFrame API call) and match it against LRCLIB's independent
  // timestamps — no raw audio access needed anywhere, so this works
  // regardless of how the underlying video is licensed/streamed.
  useEffect(() => {
    if (phase !== 'playing' || !hasSyncedLyrics) return;
    const interval = setInterval(() => {
      const t = playerRef.current?.getCurrentTime?.() ?? 0;
      let idx = -1;
      for (let i = 0; i < lrcLines.length; i++) {
        if (lrcLines[i].time <= t) idx = i; else break;
      }
      setCurrentLineIdx(idx);
    }, 250);
    return () => clearInterval(interval);
  }, [phase, hasSyncedLyrics, lrcLines]);

  useEffect(() => {
    setCurrentLineIdx(-1);
    // A fresh video also needs a fresh sync-dedup baseline — otherwise a
    // playback_timestamp value already "seen" against the previous song's
    // player instance would be silently skipped for the new one too.
    lastAppliedSyncTsRef.current = null;
  }, [videoId]);

  // ── Room-wide co-watch sync ──────────────────────────────────────────────
  // The host's own YouTube player is the source of truth; everyone else's
  // player is driven entirely by these relayed WS messages. Same host-
  // authoritative pattern already proven for the main VideoWatch co-watch
  // sync (playback_control) — see karaoke.go's karaoke_sync case for the
  // matching backend half.
  const sendSync = useCallback((command) => {
    if (!isHostUser) return;
    const player = playerRef.current;
    if (!player) return;
    const seekTime = player.getCurrentTime?.() ?? 0;
    onMove({ move_type: 'karaoke_sync', command, seek_time: seekTime, timestamp: Date.now() });
  }, [isHostUser, onMove]);

  const handlePlayerStateChange = useCallback((e) => {
    if (!isHostUser) return;
    // YT.PlayerState: 1 = playing, 2 = paused (stable, documented constants).
    if (e.data === 1) sendSync('play');
    else if (e.data === 2) sendSync('pause');
  }, [isHostUser, sendSync]);

  // Periodic drift-correction heartbeat while the host is actively playing —
  // also the practical way a manual seek-bar scrub reaches members, since the
  // YouTube IFrame API has no dedicated "seek" event to hook directly.
  useEffect(() => {
    if (!isHostUser || phase !== 'playing') return;
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (player?.getPlayerState?.() === 1) sendSync('play');
    }, 5000);
    return () => clearInterval(interval);
  }, [isHostUser, phase, sendSync]);

  // Non-host members: apply whatever the host's latest relayed command was.
  useEffect(() => {
    if (isHostUser) return;
    const ts = gs.playback_timestamp;
    const command = gs.playback_command;
    if (!ts || !command || ts === lastAppliedSyncTsRef.current) return;
    const player = playerRef.current;
    if (!player) return;
    lastAppliedSyncTsRef.current = ts;
    const transitLatency = Math.max(0, Date.now() - ts) / 1000;
    const baseSeek = Number(gs.playback_seek_time) || 0;
    if (command === 'pause') {
      player.pause();
      player.seekTo(baseSeek);
    } else {
      // 'play' or 'seek' — compensate for message transit time so the member
      // lands roughly where the host actually is right now, not where the
      // host was at the moment the message was sent.
      player.seekTo(baseSeek + transitLatency);
      player.play();
    }
  }, [gs.playback_timestamp, gs.playback_command, gs.playback_seek_time, isHostUser]);

  const startSong = useCallback((lrcResult, ytVideoId) => {
    onMove({
      move_type: 'karaoke_start',
      track_name: lrcResult.trackName,
      artist_name: lrcResult.artistName || '',
      video_id: ytVideoId,
      synced_lyrics: lrcResult.syncedLyrics || '',
      plain_lyrics: lrcResult.plainLyrics || '',
    });
    setPickingNewSong(false);
  }, [onMove]);

  const endOrLeave = () => {
    if (isHostUser) onMove({ move_type: 'karaoke_end' });
    else onClose();
  };

  // ── Non-host, nothing playing yet ──────────────────────────────────────────
  if (!isHostUser && phase === 'waiting') {
    return (
      <div className="fixed inset-0 z-[60] bg-gray-950/98 flex flex-col items-center justify-center gap-4 text-white">
        <span className="text-6xl">🎤</span>
        <p className="text-lg font-semibold">Music Warrior</p>
        <p className="text-sm text-gray-400">Waiting for the host to pick a song…</p>
        <button onClick={onClose} className="mt-2 px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">Close</button>
      </div>
    );
  }

  // ── Session over ────────────────────────────────────────────────────────────
  if (phase === 'ended') {
    return (
      <div className="fixed inset-0 z-[60] bg-gray-950/98 flex flex-col items-center justify-center gap-4 text-white">
        <span className="text-6xl">🎉</span>
        <p className="text-2xl font-bold">Thanks for singing!</p>
        <p className="text-sm text-gray-400">{songNumber} song{songNumber === 1 ? '' : 's'} performed</p>
        <button
          onClick={onClose}
          className="mt-2 px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold rounded-xl text-base transition-all"
        >
          Close
        </button>
      </div>
    );
  }

  // ── Host: song search (initial pick, or picking a new one mid-session) ──────
  if (isHostUser && (phase === 'waiting' || pickingNewSong)) {
    return (
      <div className="fixed inset-0 z-[60] bg-gray-950/98 flex flex-col">
        <div className="flex items-center justify-between pl-20 pr-5 py-4 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎤</span>
            <span className="text-white font-bold text-xl">Music Warrior</span>
          </div>
          <button onClick={endOrLeave} className="text-gray-400 hover:text-white hover:bg-gray-800 p-1.5 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-5 py-6 overflow-y-auto">
          <SongSearch
            onPick={startSong}
            onCancel={() => setPickingNewSong(false)}
            canCancel={pickingNewSong}
          />
        </div>
      </div>
    );
  }

  // ── Playing ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[60] bg-gray-950/98 flex flex-col">
      <div className="flex items-center justify-between pl-20 pr-5 py-3 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl flex-shrink-0">🎤</span>
          <div className="min-w-0">
            <p className="text-white font-bold text-base truncate">{trackName}</p>
            {artistName && <p className="text-gray-400 text-xs truncate">{artistName}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <GameRulesButton gameType="karaoke" className="text-gray-500" />
          {isHostUser && (
            <button
              onClick={() => setPickingNewSong(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-lg font-medium transition-colors"
            >
              <Music className="w-3.5 h-3.5" /> New Song
            </button>
          )}
          <button
            onClick={endOrLeave}
            className="text-gray-400 hover:text-white hover:bg-gray-800 p-1.5 rounded-lg transition-colors"
            title={isHostUser ? 'End session for everyone' : 'Leave'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-4 gap-4 overflow-hidden">
        <div className="w-full max-w-3xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl flex-shrink-0">
          <YouTubePlayer ref={playerRef} videoId={videoId} isHost={isHostUser} onStateChange={handlePlayerStateChange} />
        </div>

        <div className="w-full max-w-3xl flex-1 min-h-0 flex flex-col items-center justify-center overflow-hidden text-center px-4">
          {hasSyncedLyrics ? (
            <>
              <p className="text-gray-500 text-sm mb-1.5 min-h-[1.5em] transition-opacity">
                {currentLineIdx >= 0 && lrcLines[currentLineIdx + 1] ? lrcLines[currentLineIdx].text : ''}
              </p>
              <p className="text-white text-2xl sm:text-3xl font-bold leading-snug min-h-[1.4em]">
                {currentLineIdx >= 0 ? lrcLines[currentLineIdx].text : lrcLines[0]?.text || ''}
              </p>
              <p className="text-purple-300/70 text-lg sm:text-xl mt-1.5 min-h-[1.4em]">
                {lrcLines[currentLineIdx + 1]?.text || ''}
              </p>
            </>
          ) : gs.plain_lyrics ? (
            <div className="max-h-40 overflow-y-auto text-gray-300 text-sm whitespace-pre-line px-2">
              {gs.plain_lyrics}
            </div>
          ) : (
            <p className="text-gray-500 text-sm flex items-center gap-2"><Mic2 className="w-4 h-4" /> No lyrics available for this track.</p>
          )}
        </div>
      </div>
    </div>
  );
}
