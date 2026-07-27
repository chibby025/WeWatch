// frontend/src/hooks/useStreamBufferHealth.js
import { useEffect, useRef, useState } from 'react';

// One buffer-health primitive, reused at three escalating cushion targets. Host-only —
// this exists specifically to cover "the host's own upload throughput can't feed
// ffmpeg fast enough for real-time HLS segmenting," a property of the host's own
// connection that only their own upload-progress state can see. A member's own
// download from BunnyCDN being slow is a different, independent problem, already
// served at a basic level by the browser's native `waiting`/`playing` events — this
// hook does not run its tier logic for members at all; they only react to the host's
// broadcasted pause/resume (handled directly in VideoWatch.jsx's playback_control
// case, not here).

const POLL_INTERVAL_MS = 1000;

// Tier 1 — transient dip, always active during playback.
const TIER1_LOW_CUSHION_S = 3;
const TIER1_RESUME_CUSHION_S = 10;
// Require 2 consecutive low readings (2s) before acting, so a single noisy tick of
// `video.buffered` doesn't trigger an unnecessary pause.
const LOW_CUSHION_STRIKES_REQUIRED = 2;

// Tier 2 — one-shot prediction at the very start of playback, before the first play().
const TIER2_RATIO_THRESHOLD = 1.1; // required/measured above this looks unhealthy
const TIER2_CUSHION_SCALE = 12;
const TIER2_MIN_CUSHION_S = 15;
const TIER2_MAX_CUSHION_S = 90;

// Tier 3 escalation — a trailing rolling window over which repeated Tier-1-style
// pauses are judged as "the network isn't actually recovering," not just jitter.
const TIER3_WINDOW_MS = 50 * 1000; // 50s, per product decision
const TIER3_PAUSED_SECONDS_THRESHOLD = 15; // cumulative paused-time within the window
const TIER3_EVENT_COUNT_THRESHOLD = 3; // OR this many pause events within the window
const TIER3A_RESUME_CUSHION_S = 120;
const TIER3B_RESUME_CUSHION_S = 240;

function getCushionSeconds(video) {
  if (!video) return 0;
  const t = video.currentTime;
  const ranges = video.buffered;
  for (let i = 0; i < ranges.length; i++) {
    // 0.5s slack: the "current" buffered range's start can sit fractionally after
    // currentTime due to normal decode/GC rounding.
    if (ranges.start(i) <= t + 0.5 && ranges.end(i) >= t) {
      return ranges.end(i) - t;
    }
  }
  return 0;
}

/**
 * Watches the host's own video buffer health and proactively pauses/resumes playback
 * (broadcasting a tagged `reason:"buffering"` playback_control to the room, so members
 * hold in sync instead of drifting ahead) rather than reacting to hls.js's own
 * non-fatal error/recovery loop. See CLAUDE.md's device-streaming section for the full
 * diagnosis this exists to fix.
 *
 * Returns `{ bufferState }` — one of null (healthy) | 'tier1' | 'tier2' | 'tier3a' |
 * 'tier3b', for the caller to render a matching indicator/banner.
 */
export default function useStreamBufferHealth({
  isHost,
  isPlaying,
  setIsPlaying,
  isConnected,
  videoRef,
  sendMessage,
  currentUser,
  currentMedia,
  mediaUploadManager,
}) {
  const [bufferState, setBufferState] = useState(null);

  // tierRef tracks the escalation LEVEL a future dip will be handled at — persists
  // across successful resumes within the same media session (only a media change
  // resets it), since the whole point of Tier 3 is "this connection keeps failing to
  // recover," not "this one dip was briefly annoying."
  const tierRef = useRef(1); // 1 | '3a' | '3b'
  const pauseLogRef = useRef([]); // [{ start, end }] ms, pruned to TIER3_WINDOW_MS
  const engagedRef = useRef(false); // true while this hook currently owns a pause/resume cycle
  const resumeIntervalRef = useRef(null);
  const lowCushionStrikesRef = useRef(0);
  const mediaIdentityRef = useRef(null);
  const tier2EvaluatedRef = useRef(false);

  const sendBufferingSignal = (command) => {
    if (!currentMedia || !currentUser?.id) return;
    const v = videoRef.current;
    const remaining = v?.duration ? (v.duration - (v.currentTime || 0)) : null;
    console.log(`[BUFFER-HEALTH] sendBufferingSignal cmd=${command} tier=${tierRef.current} file=${currentMedia.file_path?.split('/').pop()} currentTime=${v?.currentTime?.toFixed(1)}s duration=${v?.duration?.toFixed(1)}s remaining=${remaining !== null ? remaining.toFixed(1) + 's' : '?'} ended=${v?.ended}`);
    sendMessage({
      type: 'playback_control',
      command,
      media_item_id: currentMedia.ID || currentMedia.id,
      file_path: currentMedia.file_path,
      file_url: currentMedia.mediaUrl,
      original_name: currentMedia.original_name,
      seek_time: Math.floor(videoRef.current?.currentTime || 0),
      timestamp: Date.now(),
      sender_id: currentUser.id,
      reason: 'buffering',
    });
  };

  // Reset all tier state when the media identity changes — a new stream shouldn't
  // inherit a previous one's connection struggles.
  useEffect(() => {
    const id = currentMedia?.ID || currentMedia?.file_path || null;
    if (id === mediaIdentityRef.current) return;
    const hadPendingResume = !!resumeIntervalRef.current;
    console.log(`[BUFFER-HEALTH] media identity changed ${mediaIdentityRef.current} → ${id} — resetting tier state${hadPendingResume ? ' (had a PENDING resume interval, clearing it)' : ''}`);
    mediaIdentityRef.current = id;
    tierRef.current = 1;
    pauseLogRef.current = [];
    engagedRef.current = false;
    lowCushionStrikesRef.current = 0;
    tier2EvaluatedRef.current = false;
    if (resumeIntervalRef.current) {
      clearInterval(resumeIntervalRef.current);
      resumeIntervalRef.current = null;
    }
    setBufferState(null);
  }, [currentMedia]);

  const targetForCurrentTier = () => {
    if (tierRef.current === '3b') return { cushion: TIER3B_RESUME_CUSHION_S, uiState: 'tier3b' };
    if (tierRef.current === '3a') return { cushion: TIER3A_RESUME_CUSHION_S, uiState: 'tier3a' };
    return { cushion: TIER1_RESUME_CUSHION_S, uiState: 'tier1' };
  };

  // Shared engage function for Tier 1 / 3a / 3b — Tier 2 (below) has its own one-shot
  // variant since it runs before playback ever starts, not in response to a live dip.
  const engagePause = () => {
    if (engagedRef.current) return;
    engagedRef.current = true;
    const { cushion: targetCushion, uiState } = targetForCurrentTier();
    const pauseEntry = { start: Date.now(), end: null };
    pauseLogRef.current.push(pauseEntry);

    const v = videoRef.current;
    const remaining = v?.duration ? (v.duration - (v.currentTime || 0)) : null;
    console.log(`[BUFFER-HEALTH] engagePause tier=${tierRef.current} targetCushion=${targetCushion}s remainingInVideo=${remaining !== null ? remaining.toFixed(1) + 's' : '?'} — ${remaining !== null && remaining < targetCushion ? '⚠️ target cushion EXCEEDS what is left in the video — resume may be unreachable via the cushion path' : 'ok'}`);

    setBufferState(uiState);
    setIsPlaying(false);
    sendBufferingSignal('pause');

    let pollCount = 0;
    resumeIntervalRef.current = setInterval(() => {
      pollCount++;
      const cushion = getCushionSeconds(videoRef.current);
      const uploadDone = tierRef.current === '3b' && mediaUploadManager?.uploading === false;
      if (pollCount % 5 === 0) {
        console.log(`[BUFFER-HEALTH] resume-wait poll#${pollCount} tier=${tierRef.current} cushion=${cushion.toFixed(1)}s target=${targetCushion}s uploadDone=${uploadDone} videoEnded=${videoRef.current?.ended}`);
      }
      if (cushion < targetCushion && !uploadDone) return;

      clearInterval(resumeIntervalRef.current);
      resumeIntervalRef.current = null;
      pauseEntry.end = Date.now();
      console.log(`[BUFFER-HEALTH] resume FIRING after ${pollCount}s wait — reason=${uploadDone && cushion < targetCushion ? 'uploadDone-shortcut' : 'cushion-reached'} cushion=${cushion.toFixed(1)}s videoEnded=${videoRef.current?.ended}`);

      // Escalation check: has this pattern (within the trailing window) kept recurring
      // despite resuming? If so, the *next* dip gets handled one tier up.
      const now = Date.now();
      pauseLogRef.current = pauseLogRef.current.filter(e => (e.end ?? now) > now - TIER3_WINDOW_MS);
      const cumulativePausedS = pauseLogRef.current.reduce((sum, e) => sum + ((e.end ?? now) - e.start), 0) / 1000;
      const eventCount = pauseLogRef.current.length;
      const shouldEscalate = cumulativePausedS >= TIER3_PAUSED_SECONDS_THRESHOLD || eventCount >= TIER3_EVENT_COUNT_THRESHOLD;
      if (shouldEscalate) {
        if (tierRef.current === 1) tierRef.current = '3a';
        else if (tierRef.current === '3a') tierRef.current = '3b';
        // already '3b' — nothing higher to escalate to
      }

      engagedRef.current = false;
      lowCushionStrikesRef.current = 0;
      setBufferState(null);
      setIsPlaying(true);
      sendBufferingSignal('play');
    }, POLL_INTERVAL_MS);
  };

  // Tier 2 — one-shot prediction, evaluated once right as this media becomes current
  // for the host (i.e. right after device_stream_ready). VideoWatch.jsx's
  // device_stream_ready handler deliberately does NOT call setIsPlaying(true) for the
  // host — this effect owns that decision entirely, so there's no "flip on then off"
  // race between the two. Lets hls.js start loading and buffering immediately
  // (currentMedia is already set by the caller before this runs) but delays the *first*
  // play() if the upload looks too slow to keep pace.
  useEffect(() => {
    if (!isHost || !currentMedia || currentMedia.type !== 'upload') return;
    if (tier2EvaluatedRef.current) return;
    tier2EvaluatedRef.current = true;

    const requiredBps = mediaUploadManager?.uploadRequiredBpsRef?.current || 0;
    const measuredBps = (mediaUploadManager?.uploadSpeed || 0) * 1024 * 1024;
    if (requiredBps <= 0 || measuredBps <= 0) {
      setIsPlaying(true); // can't evaluate — assume healthy, matches today's behavior
      return;
    }

    const ratio = requiredBps / measuredBps;
    if (ratio <= TIER2_RATIO_THRESHOLD) {
      setIsPlaying(true); // healthy — no intervention, matches today's behavior
      return;
    }

    const targetCushion = Math.min(TIER2_MAX_CUSHION_S, Math.max(TIER2_MIN_CUSHION_S, TIER2_CUSHION_SCALE * ratio));
    engagedRef.current = true;
    setBufferState('tier2');
    setIsPlaying(false);
    sendBufferingSignal('pause');

    resumeIntervalRef.current = setInterval(() => {
      const cushion = getCushionSeconds(videoRef.current);
      if (cushion < targetCushion) return;
      clearInterval(resumeIntervalRef.current);
      resumeIntervalRef.current = null;
      engagedRef.current = false;
      setBufferState(null);
      setIsPlaying(true);
      sendBufferingSignal('play');
    }, POLL_INTERVAL_MS);

    return () => {
      if (resumeIntervalRef.current) {
        clearInterval(resumeIntervalRef.current);
        resumeIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, currentMedia]);

  // Continuous Tier 1 / 3a / 3b monitoring while actually playing. Gated on `isPlaying`
  // so it naturally stands down for ANY pause it didn't itself cause (a genuine user
  // pause, or one already in progress via engagedRef) — it never auto-resumes or
  // broadcasts anything for a pause it didn't initiate.
  useEffect(() => {
    if (!isHost || !isPlaying || !isConnected) return;
    if (!currentMedia || currentMedia.type !== 'upload') return;

    const interval = setInterval(() => {
      if (engagedRef.current) return; // already mid pause/resume cycle, let it finish
      const video = videoRef.current;
      if (!video || video.paused) return;

      const cushion = getCushionSeconds(video);
      if (cushion < TIER1_LOW_CUSHION_S) {
        lowCushionStrikesRef.current += 1;
        const remaining = video.duration ? (video.duration - video.currentTime) : null;
        console.log(`[BUFFER-HEALTH] low-cushion strike ${lowCushionStrikesRef.current}/${LOW_CUSHION_STRIKES_REQUIRED} cushion=${cushion.toFixed(1)}s remainingInVideo=${remaining !== null ? remaining.toFixed(1) + 's' : '?'}`);
        if (lowCushionStrikesRef.current >= LOW_CUSHION_STRIKES_REQUIRED) {
          engagePause();
        }
      } else {
        lowCushionStrikesRef.current = 0;
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, isPlaying, isConnected, currentMedia]);

  // Belt-and-suspenders cleanup on unmount.
  useEffect(() => {
    return () => {
      if (resumeIntervalRef.current) clearInterval(resumeIntervalRef.current);
    };
  }, []);

  return { bufferState };
}
