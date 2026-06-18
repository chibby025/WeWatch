// SessionPreview.jsx — lobby session card preview: emoji → poster → video
import React, { useState, useEffect, useRef } from 'react';
import VinylPlayer from './VinylPlayer';

const AUDIO_EXTS = /\.(mp3|m4a|wav|ogg|flac|aac)(\?|$)/i;
const isAudioUrl = (url) => AUDIO_EXTS.test(url || '');

// Detect slow network via navigator.connection (not available in all browsers)
function useAutoDataSaver() {
  const [autoSlow, setAutoSlow] = useState(() => {
    if (!('connection' in navigator)) return false;
    return ['slow-2g', '2g'].includes(navigator.connection.effectiveType);
  });

  useEffect(() => {
    if (!('connection' in navigator)) return;
    const conn = navigator.connection;
    const handle = () => setAutoSlow(['slow-2g', '2g'].includes(conn.effectiveType));
    conn.addEventListener('change', handle);
    return () => conn.removeEventListener('change', handle);
  }, []);

  return autoSlow;
}

const SessionPreview = ({ session, previewUrl, posterUrl, isGenerating, isClearing = false, muted = true, previewVersion }) => {
  const [loadState, setLoadState] = useState('emoji'); // 'emoji' | 'loading' | 'poster' | 'video'
  // Separate error flags so a poster 404 never blocks the video state and vice-versa.
  const [posterError, setPosterError] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(null);

  // Intersection observer — only load/play video when card is on screen
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);

  // Data saver: manual setting OR auto-detected slow network
  const autoDataSaver = useAutoDataSaver();
  const isDataSaver = autoDataSaver || localStorage.getItem('dataSaverMode') === 'true';

  // Intersection observer — sets isVisible
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Once visible for the first time, mark it so src is set (lazy load)
  useEffect(() => {
    if (isVisible && !hasBeenVisible) setHasBeenVisible(true);
  }, [isVisible, hasBeenVisible]);

  // Sync the muted prop directly to the DOM property — React's JSX attribute
  // doesn't reliably update the live .muted property on a playing video element.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  // Play/pause based on visibility — avoids simultaneous decode of off-screen videos.
  // previewVersion in deps: when key={previewVersion} remounts the element, we need
  // to re-call play() because the new element has no pending play request.
  useEffect(() => {
    if (!videoRef.current || loadState !== 'video') return;
    if (isVisible) {
      // Always start playing. If browser blocks audio autoplay, mute and retry.
      videoRef.current.muted = muted;
      const p = videoRef.current.play();
      if (p !== undefined) {
        p.catch(() => {
          videoRef.current.muted = true;
          videoRef.current.play().catch(() => {});
        });
      }
    } else {
      videoRef.current.pause();
    }
  }, [isVisible, loadState, previewVersion]);

  // Detect video aspect ratio for TikTok-style rendering
  useEffect(() => {
    if (loadState === 'video' && videoRef.current) {
      const video = videoRef.current;
      const handle = () => setAspectRatio(video.videoWidth / video.videoHeight);
      video.addEventListener('loadedmetadata', handle);
      if (video.videoWidth && video.videoHeight) handle();
      return () => video.removeEventListener('loadedmetadata', handle);
    }
  }, [loadState, previewUrl]);

  // New clip clears only the video error — keeps poster error state independent.
  useEffect(() => {
    if (previewVersion) setVideoError(false);
  }, [previewVersion]);

  // New poster URL clears poster error so the updated image gets a fresh attempt.
  useEffect(() => {
    setPosterError(false);
  }, [posterUrl]);

  // State machine: emoji → loading → poster → video
  // posterError and videoError are tracked independently so one never blocks the other.
  useEffect(() => {
    if (isClearing) { setLoadState('emoji'); return; }
    if (isGenerating) { setLoadState('loading'); return; }

    if (isDataSaver) {
      setLoadState(posterUrl && !posterError ? 'poster' : 'emoji');
      return;
    }

    if (previewUrl && !videoError) {
      setLoadState('video');
    } else if (posterUrl && !posterError) {
      setLoadState('poster');
    } else {
      setLoadState('emoji');
    }
  }, [previewUrl, posterUrl, isGenerating, isClearing, posterError, videoError, isDataSaver]);

  const getVideoFitStyle = () => {
    if (aspectRatio === null) return 'object-cover';
    return aspectRatio <= 1.0 ? 'object-cover' : 'object-contain';
  };

  const getLiveShareModeInfo = () => {
    const mode = session.liveshare_mode;
    if (!mode || mode === 'regular') return null;
    const config = {
      podcast:   { icon: '🎙️', label: 'Podcast',   color: 'from-purple-600 to-purple-800' },
      show:      { icon: '🎬', label: 'Show',       color: 'from-green-600 to-green-800' },
      news:      { icon: '📰', label: 'News',       color: 'from-red-600 to-red-800' },
      church:    { icon: '⛪',  label: 'Church',     color: 'from-amber-600 to-amber-800' },
      interview: { icon: '🎤', label: 'Interview',  color: 'from-blue-600 to-blue-800' },
    };
    return config[mode] || null;
  };

  const getSourceLabel = () => {
    const mode = session.liveshare_mode;
    if (mode && mode !== 'regular') {
      const labels = {
        podcast: 'Podcast Live', show: 'Show Live', news: 'News Live',
        church: 'Church Live', interview: 'Interview Live',
      };
      return labels[mode] || 'LiveShare Active';
    }
    if (session.watch_type === 'classroom' && session.class_type === 'lecture_hall') {
      if (session.current_media_url) return 'Video Playing';
      if (session.is_screen_sharing_active)
        return session.sharing_source === 'watchfrom' ? 'Watch From Active' : 'LiveShare Active';
      return 'Lecture Hall';
    }
    if (session.watch_type === '3d_cinema') return '3D Cinema';
    if (session.watch_type === 'classroom') return 'Classroom';
    return 'Video Watch';
  };

  const modeInfo = getLiveShareModeInfo();

  const isAudio = isAudioUrl(session?.current_media_url);

  return (
    <div ref={containerRef} className="w-full h-full bg-black overflow-hidden relative">

      {/* Audio session: spinning vinyl disc instead of regular preview */}
      {isAudio && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-black z-10">
          <VinylPlayer
            artworkUrl={session?.poster_url || null}
            isPlaying={isVisible}
            size={150}
          />
          <p className="text-white/50 text-xs mt-3">Audio Playing</p>
        </div>
      )}

      {/* Emoji / gradient fallback — W icon with float animation */}
      {!isAudio && loadState === 'emoji' && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-500 to-blue-600">
          <div className="flex items-center justify-center mb-5">
            <img
              src="/icons/lwoIcon.webp"
              alt="LetsWatchOut"
              className="w-14 h-14 object-contain"
              style={{ animation: 'iconFloat 3s ease-in-out infinite' }}
            />
          </div>
          <div className="text-white text-lg font-medium">{getSourceLabel()}</div>
        </div>
      )}

      {/* Generating spinner */}
      {!isAudio && loadState === 'loading' && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white mb-4" />
          <div className="text-white text-base">Generating preview...</div>
        </div>
      )}

      {/* Static poster image */}
      {!isAudio && loadState === 'poster' && posterUrl && (
        <img
          src={posterUrl}
          alt="Session poster"
          className="w-full h-full object-cover"
          onError={() => {
            setPosterError(true);
            // Fall through to video if available, otherwise emoji
            setLoadState(previewUrl && !videoError ? 'video' : 'emoji');
          }}
        />
      )}

      {/* Video preview — only sets src after first becoming visible (lazy load) */}
      {!isAudio && loadState === 'video' && previewUrl && (
        <video
          key={previewVersion}
          ref={videoRef}
          src={hasBeenVisible ? `${previewUrl}${previewVersion ? `?v=${previewVersion}` : ''}` : undefined}
          loop
          muted={muted}
          playsInline
          className={`w-full h-full ${getVideoFitStyle()}`}
          onError={(e) => {
            console.warn('[SessionPreview] Video failed to load:', previewUrl, e.nativeEvent);
            setVideoError(true);
            setLoadState(posterUrl && !posterError ? 'poster' : 'emoji');
          }}
        />
      )}

      {/* LiveShare mode badge */}
      {loadState !== 'loading' && modeInfo && (
        <div className="absolute top-2 left-2 z-10">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${modeInfo.color} shadow-lg backdrop-blur-sm`}>
            <span className="text-lg">{modeInfo.icon}</span>
            <span className="text-white text-sm font-semibold">{modeInfo.label}</span>
          </div>
        </div>
      )}

      {/* Podcast/show/news/church title + logo row — only while liveshare mode is active */}
      {loadState !== 'loading' && session.liveshare_mode && session.liveshare_mode !== 'regular' && (session.podcast_title || session.podcast_logo_url) && (
        <div className="absolute bottom-44 left-3 right-3 z-10 flex items-center gap-2">
          {session.podcast_logo_url && (
            <img
              src={session.podcast_logo_url}
              alt="Logo"
              className="w-14 h-14 rounded-md object-contain bg-black/40 backdrop-blur-sm p-0.5 shadow-md flex-shrink-0"
              onError={e => { e.target.style.display = 'none'; }}
            />
          )}
          {session.podcast_title && (
            <h3 className="text-white text-sm font-bold line-clamp-1 drop-shadow-lg min-w-0">
              {session.podcast_title}
            </h3>
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(SessionPreview, (prev, next) =>
  prev.previewUrl === next.previewUrl &&
  prev.posterUrl === next.posterUrl &&
  prev.isGenerating === next.isGenerating &&
  prev.isClearing === next.isClearing &&
  prev.muted === next.muted &&
  prev.previewVersion === next.previewVersion &&
  prev.session?.session_id === next.session?.session_id
);
