import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

// Loads the YouTube iframe API script once, resolves when YT is ready.
function loadYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return new Promise((resolve) => {
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve(window.YT);
    };
  });
}

/**
 * YouTubePlayer — legal co-watch YouTube player using the official iframe API.
 *
 * The host sees native controls (can play/pause/seek). Members have controls
 * disabled; their playback is driven entirely by WebSocket sync messages from
 * the host relayed through VideoWatch.
 *
 * Exposed via ref:
 *   play()            — playerRef.current.playVideo()
 *   pause()           — playerRef.current.pauseVideo()
 *   seekTo(seconds)   — playerRef.current.seekTo(seconds, true)
 *   getCurrentTime()  — playerRef.current.getCurrentTime()
 *   getPlayerState()  — playerRef.current.getPlayerState()
 */
const YouTubePlayer = forwardRef(function YouTubePlayer(
  { videoId, isHost, onReady, onStateChange, className = '' },
  ref,
) {
  const containerRef = useRef(null);
  const playerRef    = useRef(null);

  useImperativeHandle(ref, () => ({
    play:           () => playerRef.current?.playVideo(),
    pause:          () => playerRef.current?.pauseVideo(),
    seekTo:         (t) => playerRef.current?.seekTo(t, true),
    getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
    getPlayerState: () => playerRef.current?.getPlayerState() ?? -1,
  }), []);

  useEffect(() => {
    if (!videoId || !containerRef.current) return;
    let cancelled = false;
    let instance  = null;

    // Replace the div content with a fresh div each time videoId changes,
    // so the YT.Player constructor always targets an empty element.
    const target = document.createElement('div');
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(target);

    loadYouTubeAPI().then((YT) => {
      if (cancelled) return;
      instance = new YT.Player(target, {
        videoId,
        width:  '100%',
        height: '100%',
        playerVars: {
          autoplay:       0,
          controls:       isHost ? 1 : 0,   // members cannot control playback
          rel:            0,
          modestbranding: 1,
          iv_load_policy: 3,                // hide annotations
          origin:         window.location.origin,
        },
        events: {
          onReady: (e) => {
            if (cancelled) return;
            playerRef.current = e.target;
            onReady?.(e.target);
          },
          onStateChange: (e) => {
            if (cancelled) return;
            onStateChange?.(e);
          },
          onError: (e) => {
            console.warn('[YouTubePlayer] error code:', e.data);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      try { instance?.destroy(); } catch {}
      playerRef.current = null;
    };
  }, [videoId]); // recreate player only when video changes; isHost/callbacks are stable

  return (
    <div
      ref={containerRef}
      className={`w-full h-full bg-black ${className}`}
      style={{ minHeight: 0 }}
    />
  );
});

export default YouTubePlayer;

// ── Utility exported for use in LeftSidebar / VideoWatch ─────────────────────
export function extractYouTubeVideoId(url) {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}
