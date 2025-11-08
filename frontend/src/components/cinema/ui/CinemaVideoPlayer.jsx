// src/components/cinema/ui/CinemaVideoPlayer.jsx
import { useRef, useEffect } from 'react';

export default function CinemaVideoPlayer({
  track,
  isHost,
  localScreenTrack,
  mediaItem,        // ✅ New prop: for uploaded media
  isPlaying,        // ✅ New prop
  onPlay,
  onPause,
  onEnded,
  onError,
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      console.warn('⚠️ [CinemaVideoPlayer] No video element ref');
      return;
    }

    let stream = null;

    // 🔹 LIVEKIT: Screen Share (Host or Viewer)
    if ((isHost && localScreenTrack?.mediaStreamTrack) || (!isHost && track?.mediaStreamTrack)) {
      const mediaStreamTrack = isHost ? localScreenTrack.mediaStreamTrack : track.mediaStreamTrack;
      console.log(`🎬 [CinemaVideoPlayer] ${isHost ? 'HOST' : 'VIEWER'}: Attaching screen share track`);
      stream = new MediaStream([mediaStreamTrack]);
      video.srcObject = stream;
      video.muted = isHost;
      video.play().catch(onError);
      return () => {
        if (video.srcObject) {
          video.srcObject.getTracks().forEach(t => t.stop());
          video.srcObject = null;
        }
      };
    }

    // 🔹 UPLOADED MEDIA: file-based playback
    else if (mediaItem?.mediaUrl) {
      console.log('📁 [CinemaVideoPlayer] Loading uploaded media:', mediaItem.mediaUrl);
      video.srcObject = null; // Clear any stream
      video.src = mediaItem.mediaUrl;
      video.muted = false;
      
      // Add error listener for better debugging
      const handleLoadError = (e) => {
        console.error('❌ [CinemaVideoPlayer] Video load error:', {
          error: e.target.error,
          networkState: e.target.networkState,
          readyState: e.target.readyState,
          src: e.target.src
        });
      };
      video.addEventListener('error', handleLoadError, { once: true });
      
      video.load(); // Explicitly load the media
      // Don't auto-play here, let the isPlaying effect handle it
      return () => {
        video.removeEventListener('error', handleLoadError);
        video.pause();
        video.src = '';
      };
    }

    // ❌ Nothing to show
    else {
      console.log('⚠️ [CinemaVideoPlayer] No media to display');
      video.srcObject = null;
      video.src = '';
    }
  }, [track, localScreenTrack, isHost, mediaItem]);

  // Sync play/pause from parent state
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.src) return;
    
    // Wait for video to be ready before trying to play
    const handleCanPlay = () => {
      if (isPlaying) {
        video.play().catch((err) => {
          // Ignore "interrupted by pause" errors - they're harmless
          if (!err.message.includes('interrupted by a call to pause')) {
            console.warn('⚠️ [CinemaVideoPlayer] Play failed:', err.message);
            if (onError) onError(err);
          }
        });
      }
    };
    
    if (isPlaying) {
      // If video is already ready, play immediately
      if (video.readyState >= 3) { // HAVE_FUTURE_DATA or higher
        video.play().catch((err) => {
          if (!err.message.includes('interrupted by a call to pause')) {
            console.warn('⚠️ [CinemaVideoPlayer] Play failed:', err.message);
            if (onError) onError(err);
          }
        });
      } else {
        // Otherwise wait for canplay event
        video.addEventListener('canplay', handleCanPlay, { once: true });
      }
    } else {
      video.pause();
    }
    
    return () => {
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, [isPlaying, onError]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      crossOrigin="anonymous"
      className="w-full h-full object-contain bg-black"
      onPlay={onPlay}
      onPause={onPause}
      onEnded={onEnded}
      onError={onError}
      style={{ backgroundColor: '#000' }}
    />
  );
}