// src/components/lecture-hall/LectureHallVideoPlayer.jsx
import { forwardRef, useRef, useImperativeHandle, useEffect } from 'react';

// ✅ Matching CinemaVideoPlayer exactly - independent loading, no sync loop
const LectureHallVideoPlayer = forwardRef(function LectureHallVideoPlayer({
  track,
  isHost,
  localScreenTrack,
  mediaItem,
  isPlaying,
  onPlay,
  onPause,
  onEnded,
  onError,
  muted = false,
}, ref) {
  const videoRef = useRef(null);

  // 🔑 Expose the actual <video> DOM element to parent
  useImperativeHandle(ref, () => videoRef.current, []);

  // Load media source (screen share or uploaded file)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      console.warn('⚠️ [LectureHallVideoPlayer] No video element ref');
      return;
    }

    let stream = null;

    if ((isHost && localScreenTrack?.mediaStreamTrack) || (!isHost && track?.mediaStreamTrack)) {
      const mediaStreamTrack = isHost ? localScreenTrack.mediaStreamTrack : track.mediaStreamTrack;
      console.log(`🎬 [LectureHallVideoPlayer] ${isHost ? 'HOST' : 'VIEWER'}: Attaching screen share track`);
      stream = new MediaStream([mediaStreamTrack]);
      video.srcObject = stream;
      video.muted = muted !== undefined ? muted : isHost;
      video.play().catch(onError);
      return () => {
        if (video.srcObject) {
          video.srcObject.getTracks().forEach(t => t.stop());
          video.srcObject = null;
        }
      };
    }

    else if (mediaItem?.mediaUrl) {
      console.log('📁 [LectureHallVideoPlayer] Loading uploaded media:', mediaItem.mediaUrl);
      video.srcObject = null;
      video.src = mediaItem.mediaUrl;
      video.muted = muted !== undefined ? muted : false;
      
      const handleLoadError = (e) => {
        console.error('❌ [LectureHallVideoPlayer] Video load error:', {
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
      console.log('⚠️ [LectureHallVideoPlayer] No media to display');
      video.srcObject = null;
      video.src = '';
    }
  }, [track, localScreenTrack, isHost, mediaItem]);

  // Handle play/pause state
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.src) return;
    
    const handleCanPlay = () => {
      if (isPlaying) {
        video.play().catch((err) => {
          if (!err.message.includes('interrupted by a call to pause')) {
            console.warn('⚠️ [LectureHallVideoPlayer] Play failed:', err.message);
            if (onError) onError(err);
          }
        });
      }
    };
    
    if (isPlaying) {
      if (video.readyState >= 3) {
        video.play().catch((err) => {
          if (!err.message.includes('interrupted by a call to pause')) {
            console.warn('⚠️ [LectureHallVideoPlayer] Play failed:', err.message);
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
      muted={muted}
      className="w-full h-full object-contain bg-black"
      onPlay={onPlay}
      onPause={onPause}
      onEnded={onEnded}
      onError={onError}
      style={{ backgroundColor: '#000' }}
    />
  );
});

// ✅ Export matching Cinema
export default LectureHallVideoPlayer;
