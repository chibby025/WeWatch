// src/components/cinema/ui/CinemaVideoPlayer.jsx
import { forwardRef, useRef, useImperativeHandle, useEffect } from 'react';

// Wrap your existing function with forwardRef
const CinemaVideoPlayer = forwardRef(function CinemaVideoPlayer({
  track,
  isHost,
  localScreenTrack,
  mediaItem,
  isPlaying,
  onPlay,
  onPause,
  onEnded,
  onError,
}, ref) {
  const videoRef = useRef(null);

  // 🔑 Expose the actual <video> DOM element to parent
  useImperativeHandle(ref, () => videoRef.current, []);

  // ... (rest of your existing logic UNCHANGED)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      console.warn('⚠️ [CinemaVideoPlayer] No video element ref');
      return;
    }

    let stream = null;

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

    else if (mediaItem?.mediaUrl) {
      console.log('📁 [CinemaVideoPlayer] Loading uploaded media:', mediaItem.mediaUrl);
      video.srcObject = null;
      video.src = mediaItem.mediaUrl;
      video.muted = false;
      
      const handleLoadError = (e) => {
        console.error('❌ [CinemaVideoPlayer] Video load error:', {
          error: e.target.error,
          networkState: e.target.networkState,
          readyState: e.target.readyState,
          src: e.target.src
        });
      };
      video.addEventListener('error', handleLoadError, { once: true });
      video.load();
      return () => {
        video.removeEventListener('error', handleLoadError);
        video.pause();
        video.src = '';
      };
    }

    else {
      console.log('⚠️ [CinemaVideoPlayer] No media to display');
      video.srcObject = null;
      video.src = '';
    }
  }, [track, localScreenTrack, isHost, mediaItem]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.src) return;
    
    const handleCanPlay = () => {
      if (isPlaying) {
        video.play().catch((err) => {
          if (!err.message.includes('interrupted by a call to pause')) {
            console.warn('⚠️ [CinemaVideoPlayer] Play failed:', err.message);
            if (onError) onError(err);
          }
        });
      }
    };
    
    if (isPlaying) {
      if (video.readyState >= 3) {
        video.play().catch((err) => {
          if (!err.message.includes('interrupted by a call to pause')) {
            console.warn('⚠️ [CinemaVideoPlayer] Play failed:', err.message);
            if (onError) onError(err);
          }
        });
      } else {
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
});

// ✅ Now export the wrapped version
export default CinemaVideoPlayer;