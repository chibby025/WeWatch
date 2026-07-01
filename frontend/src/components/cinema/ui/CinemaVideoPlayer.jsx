// src/components/cinema/ui/CinemaVideoPlayer.jsx
import { forwardRef, useRef, useImperativeHandle, useEffect, useState } from 'react';
import Hls from 'hls.js';
import VolumeControl from '../../VolumeControl';

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
  onTimeUpdate, // ⏰ Callback to update playback position
  muted = false, // 👈 NEW: default to false (so 2D mode works unchanged)
  playbackPositionRef, // 🎯 Ref containing adjusted seek time from latency compensation
  layout = 'screen-share', // 'solo-view' | 'screen-share' | 'split-view'
}, ref) {
  const videoRef = useRef(null);
  const cameraVideoRef = useRef(null); // 📹 Separate ref for PIP camera
  const previousTrackIdRef = useRef(null); // 🔑 Track previous track ID to avoid stopping same track
  const hlsRef = useRef(null); // 📺 hls.js instance for .m3u8 device-stream playback
  const hoverTimerRef = useRef(null);
  const [isHovering, setIsHovering] = useState(false);
  const [objectFit, setObjectFit] = useState('cover'); // 🎬 Smart aspect-ratio-based display mode
  
  // 📎 Expandable box state for split-view
  const [expandedBox, setExpandedBox] = useState(null); // null | 'screen' | 'camera'
  const [showExpandIcon, setShowExpandIcon] = useState({ screen: false, camera: false });
  const iconTimeoutRef = useRef({ screen: null, camera: null });
  // Shadow ref for onError — VideoWatch.jsx passes a new function reference on every
  // render (not wrapped in useCallback), so listing onError directly in an effect's deps
  // array reloads the player on any unrelated parent re-render. Mirrors the shadow-ref
  // pattern already used in CinemaScene3DDemo.jsx for the same reason.
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // 🔑 Expose the actual <video> DOM element to parent
  useImperativeHandle(ref, () => videoRef.current, []);

  // ⏰ Update playback position for periodic seek time tracking
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !onTimeUpdate) return;

    const handleTimeUpdateEvent = () => {
      onTimeUpdate(video.currentTime);
    };

    video.addEventListener('timeupdate', handleTimeUpdateEvent);
    return () => video.removeEventListener('timeupdate', handleTimeUpdateEvent);
  }, [onTimeUpdate]);

  // 🎬 Smart aspect ratio detection - TikTok-style adaptive display
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateObjectFit = () => {
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      
      if (!videoWidth || !videoHeight) return;

      const videoAspect = videoWidth / videoHeight;
      const viewportAspect = window.innerWidth / window.innerHeight;
      const aspectDiff = Math.abs(videoAspect - viewportAspect);

      // If aspect ratios are similar (within 0.3), fill screen (object-cover)
      // Otherwise, letterbox to preserve full video (object-contain)
      const shouldFill = aspectDiff < 0.3;
      const newObjectFit = shouldFill ? 'cover' : 'contain';
      
      console.log('🎬 [CinemaVideoPlayer] Adaptive display mode:', {
        videoSize: `${videoWidth}x${videoHeight}`,
        videoAspect: videoAspect.toFixed(2),
        viewportSize: `${window.innerWidth}x${window.innerHeight}`,
        viewportAspect: viewportAspect.toFixed(2),
        aspectDiff: aspectDiff.toFixed(2),
        mode: shouldFill ? 'FILL (object-cover)' : 'LETTERBOX (object-contain)',
        reasoning: shouldFill 
          ? 'Aspect ratios match - filling screen like TikTok' 
          : 'Aspect ratios differ - letterboxing to preserve full video'
      });

      setObjectFit(newObjectFit);
    };

    // Update when video metadata loads
    video.addEventListener('loadedmetadata', updateObjectFit);
    
    // Also update on window resize
    window.addEventListener('resize', updateObjectFit);
    
    // Check immediately if metadata already loaded
    if (video.readyState >= 1) {
      updateObjectFit();
    }

    return () => {
      video.removeEventListener('loadedmetadata', updateObjectFit);
      window.removeEventListener('resize', updateObjectFit);
    };
  }, [mediaItem, track, localScreenTrack]);

  // ... (rest of your existing logic UNCHANGED)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      console.warn('⚠️ [CinemaVideoPlayer] No video element ref');
      return;
    }

    // Only log when mediaItem changes type
    if (mediaItem?.type) {
      console.log('📺 [CinemaVideoPlayer] Media type:', {
        type: mediaItem.type,
        hasStream: !!mediaItem.stream,
        hasCameraStream: !!mediaItem.cameraStream,
        hasUrl: !!mediaItem.mediaUrl
      });
    }

    let stream = null;

    if ((isHost && localScreenTrack?.mediaStreamTrack) || (!isHost && track?.mediaStreamTrack)) {
      const mediaStreamTrack = isHost ? localScreenTrack.mediaStreamTrack : track.mediaStreamTrack;
      const currentTrackId = mediaStreamTrack.id;
      
      // ✅ Skip if track is ended (prevents re-attachment with stale tracks)
      if (mediaStreamTrack.readyState === 'ended') {
        console.warn(`⚠️ [CinemaVideoPlayer LIVESHARE] ${isHost ? 'HOST' : 'MEMBER'}: Track already ended, skipping attachment`);
        return;
      }
      
      console.log(`🎬 [CinemaVideoPlayer LIVESHARE] ${isHost ? 'HOST' : 'MEMBER'}: Attaching track`, {
        trackId: mediaStreamTrack.id,
        trackKind: mediaStreamTrack.kind,
        trackEnabled: mediaStreamTrack.enabled,
        trackReadyState: mediaStreamTrack.readyState,
        trackMuted: mediaStreamTrack.muted,
        hasVideo: !!video,
        videoReadyState: video?.readyState,
        previousTrackId: previousTrackIdRef.current,
        isSameTrack: previousTrackIdRef.current === currentTrackId
      });
      stream = new MediaStream([mediaStreamTrack]);
      video.srcObject = stream;
      video.muted = muted !== undefined ? muted : isHost;
      
      // Store current track ID for next cleanup
      previousTrackIdRef.current = currentTrackId;
      
      // ✅ Wait for metadata before playing to avoid 2x2 pixel black screen
      const handleMetadataLoaded = () => {
        console.log(`📊 [CinemaVideoPlayer LIVESHARE] ${isHost ? 'HOST' : 'MEMBER'}: Metadata loaded`, {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight
        });
        
        video.play()
          .then(() => {
            console.log(`✅ [CinemaVideoPlayer LIVESHARE] ${isHost ? 'HOST' : 'MEMBER'}: Video playing`, {
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              currentTime: video.currentTime
            });
          })
          .catch((err) => {
            console.error(`❌ [CinemaVideoPlayer LIVESHARE] ${isHost ? 'HOST' : 'MEMBER'}: Play failed:`, err);
            if (onErrorRef.current) onErrorRef.current(err);
          });
      };
      
      video.addEventListener('loadedmetadata', handleMetadataLoaded, { once: true });
      
      // Fallback: If metadata already loaded, play immediately
      if (video.readyState >= 1) {
        handleMetadataLoaded();
      }
      
      return () => {
        console.log(`🧹 [CinemaVideoPlayer LIVESHARE] ${isHost ? 'HOST' : 'MEMBER'}: Cleanup ENTRY`, {
          currentTrackId,
          hadSrcObject: !!video.srcObject,
          srcObjectTrackCount: video.srcObject?.getTracks().length || 0,
          timestamp: new Date().toISOString()
        });
        
        // ✅ Only stop track if it's changing to a different track or component is unmounting
        // Don't stop if it's the same track (useMemo recalculation)
        const nextTrack = (isHost && localScreenTrack?.mediaStreamTrack) || (!isHost && track?.mediaStreamTrack);
        const nextTrackId = nextTrack ? (isHost ? localScreenTrack.mediaStreamTrack.id : track.mediaStreamTrack.id) : null;
        
        console.log(`🔍 [CinemaVideoPlayer LIVESHARE] ${isHost ? 'HOST' : 'MEMBER'}: Track comparison`, {
          currentTrackId,
          nextTrackId,
          isSameTrack: nextTrackId === currentTrackId,
          willStop: video.srcObject && (!nextTrackId || nextTrackId !== currentTrackId)
        });
        
        if (video.srcObject) {
          if (nextTrackId && nextTrackId === currentTrackId) {
            console.log(`♻️ [CinemaVideoPlayer LIVESHARE] ${isHost ? 'HOST' : 'MEMBER'}: Same track, skipping stop (useMemo recalculation)`);
            // Don't stop the track - it's the same one, just React re-rendering
            video.srcObject = null;
          } else {
            console.log(`🛑 [CinemaVideoPlayer LIVESHARE] ${isHost ? 'HOST' : 'MEMBER'}: Different track or unmount, stopping tracks`, {
              tracksStopped: video.srcObject.getTracks().map(t => ({ id: t.id, kind: t.kind, readyState: t.readyState }))
            });
            video.srcObject.getTracks().forEach(t => t.stop());
            video.srcObject = null;
          }
        }
      };
    }

    // ✅ Handle LiveShare: screen only OR camera only (not both)
    else if ((mediaItem?.stream && !mediaItem?.cameraStream) || (!mediaItem?.stream && mediaItem?.cameraStream)) {
      const streamToUse = mediaItem.stream || mediaItem.cameraStream;
      const streamType = mediaItem.stream ? 'screen' : 'camera';
      console.log(`📹 [CinemaVideoPlayer] Attaching LiveShare ${streamType} stream`, {
        streamId: streamToUse.id,
        streamActive: streamToUse.active,
        trackCount: streamToUse.getTracks().length,
        willMute: streamType === 'camera' ? true : (muted !== undefined ? muted : false),
        currentSrcObject: video.srcObject?.id || 'none'
      });
      video.srcObject = streamToUse;
      video.muted = streamType === 'camera' ? true : (muted !== undefined ? muted : false);
      video.play().then(() => {
        console.log(`✅ [CinemaVideoPlayer] ${streamType} stream playing successfully`);
      }).catch((err) => {
        console.error(`❌ [CinemaVideoPlayer] ${streamType} stream play failed:`, err.message);
        onErrorRef.current?.(err);
      });
      return () => {
        console.log(`🧹 [CinemaVideoPlayer] Cleanup: Removing ${streamType} stream`, {
          hadSrcObject: !!video.srcObject,
          streamId: video.srcObject?.id
        });
        // Don't stop tracks - they're managed by handleEndScreenShare
        video.srcObject = null;
      };
    }

    else if (mediaItem?.mediaUrl?.endsWith('.m3u8')) {
      console.log('📺 [CinemaVideoPlayer] Loading HLS stream:', mediaItem.mediaUrl);
      video.srcObject = null;
      video.muted = muted !== undefined ? muted : false;

      const handleLoadError = (e) => {
        console.error('❌ [CinemaVideoPlayer] HLS video error:', e);
        onErrorRef.current?.(e);
      };
      video.addEventListener('error', handleLoadError, { once: true });

      if (Hls.isSupported()) {
        // startPosition: 0 — without this, hls.js's default (-1/"automatic") treats a
        // manifest with no #EXT-X-ENDLIST yet (still being appended to by a progressive
        // upload) as a live stream and starts near the live edge instead of the
        // beginning, which is wrong for "host just started watching from the top."
        const hls = new Hls({ startPosition: 0 });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_event, data) => {
          console.error('❌ [CinemaVideoPlayer] hls.js error:', data);
          if (data.fatal) onErrorRef.current?.(data);
        });
        hls.loadSource(mediaItem.mediaUrl);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari has native HLS support — no library needed
        video.src = mediaItem.mediaUrl;
        video.load();
      } else {
        console.error('❌ [CinemaVideoPlayer] HLS not supported in this browser');
        onErrorRef.current?.(new Error('HLS not supported'));
      }

      return () => {
        video.removeEventListener('error', handleLoadError);
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        if (!video.srcObject) video.pause();
        video.src = '';
      };
    }

    else if (mediaItem?.mediaUrl) {
      console.log('📁 [DEBUG CinemaVideoPlayer] Setting video.src to:', mediaItem.mediaUrl, {
        previousSrc: video.src || '(empty)',
        isHost,
      });
      video.srcObject = null;
      video.src = mediaItem.mediaUrl;
      video.muted = muted !== undefined ? muted : false; // ✅ Respect the prop

      // 🔍 DEBUG: Log video element properties when metadata loads
      const handleMetadataLoaded = () => {
        console.log('📊 [CinemaVideoPlayer] Video metadata loaded:', {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          duration: video.duration,
          videoCodec: video.videoTracks?.[0]?.label || 'unknown',
          playbackRate: video.playbackRate,
          readyState: video.readyState,
          networkState: video.networkState,
          muted: video.muted,
          volume: video.volume,
          // Check if this is fullscreen player (muted = true) or 3D player (muted = false by default)
          playerType: muted ? 'FULLSCREEN' : '3D_CINEMA_SCREEN',
        });
      };
      video.addEventListener('loadedmetadata', handleMetadataLoaded, { once: true });

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
        console.log('🧹 [CinemaVideoPlayer] Cleanup: URL-based media', {
          hadSrcObject: !!video.srcObject,
          hadSrc: !!video.src,
          willPause: !video.srcObject,
          reasoning: video.srcObject ? 'Has srcObject (stream), skipping pause' : 'No srcObject, will pause'
        });
        video.removeEventListener('error', handleLoadError);
        // Only pause URL-based media, not LiveShare streams
        if (!video.srcObject) {
          console.log('⏸️ [CinemaVideoPlayer] Pausing URL-based media');
          video.pause();
        }
        video.src = '';
      };
    }

    else {
      console.log('⚠️ [CinemaVideoPlayer] No media to display', {
        hadSrcObject: !!video.srcObject,
        hadSrc: !!video.src,
        willClear: true
      });
      video.srcObject = null;
      video.src = '';
    }
  // Depends on mediaItem's specific fields, not the whole object — a metadata-only patch
  // (e.g. Phase 8's poster/duration update via {...prev, poster_url}) produces a new
  // object reference without changing any of these, and previously caused this effect to
  // re-run and reload the player from scratch (a visible, redundant restart) even though
  // nothing about what should actually be playing had changed. onError is deliberately
  // excluded too — VideoWatch.jsx passes a new function reference on every render (it's
  // not wrapped in useCallback), which was independently causing the exact same redundant
  // reload; onErrorRef (kept fresh by its own lightweight effect above) is read instead.
  }, [track, localScreenTrack, isHost, mediaItem?.mediaUrl, mediaItem?.type, mediaItem?.stream, mediaItem?.cameraStream, muted]);

  // 📹 Handle PIP camera when BOTH screen and camera streams are present
  useEffect(() => {
    const cameraVideo = cameraVideoRef.current;
    if (!cameraVideo) return;

    // Only attach camera stream when BOTH streams exist (LiveShare 'both' mode)
    if (mediaItem?.stream && mediaItem?.cameraStream) {
      console.log('📹 [CinemaVideoPlayer] Attaching PIP camera stream for both mode');
      cameraVideo.srcObject = mediaItem.cameraStream;
      cameraVideo.muted = true; // Camera PIP is always muted
      cameraVideo.play().catch(err => console.warn('⚠️ Camera PIP play failed:', err));
      return () => {
        cameraVideo.srcObject = null;
      };
    } else {
      // Clear camera video if not in 'both' mode
      cameraVideo.srcObject = null;
    }
  }, [mediaItem?.stream, mediaItem?.cameraStream]);

  // Handle main video (screen share) when BOTH streams exist
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Only handle screen stream when BOTH exist (LiveShare 'both' mode)
    if (mediaItem?.stream && mediaItem?.cameraStream) {
      console.log('📹 [CinemaVideoPlayer] Attaching screen stream for both mode');
      video.srcObject = mediaItem.stream;
      video.muted = muted !== undefined ? muted : false; // Screen share with audio
      video.play().catch((err) => onErrorRef.current?.(err));
      return () => {
        video.srcObject = null;
      };
    }
  }, [mediaItem?.stream, mediaItem?.cameraStream, muted]);

  useEffect(() => {
    const video = videoRef.current;
    // Guard: only apply to URL-based media (not LiveShare streams)
    if (!video || !mediaItem?.mediaUrl || video.srcObject) return;

    console.log('🎮 [CinemaVideoPlayer isPlaying] Effect triggered', {
      isPlaying,
      hasSrc: !!video.src,
      readyState: video.readyState
    });

    const handleCanPlay = () => {
      if (isPlaying) {
        video.play().catch((err) => {
          if (!err.message.includes('interrupted by a call to pause')) {
            console.warn('⚠️ [CinemaVideoPlayer] Play failed:', err.message);
            onErrorRef.current?.(err);
          }
        });
      }
    };

    if (isPlaying) {
      if (video.readyState >= 3) {
        console.log('✅ [CinemaVideoPlayer isPlaying] Calling play (readyState >= 3)');
        video.play().catch((err) => {
          if (!err.message.includes('interrupted by a call to pause')) {
            console.warn('⚠️ [CinemaVideoPlayer] Play failed:', err.message);
            onErrorRef.current?.(err);
          }
        });
      } else {
        console.log('⏳ [CinemaVideoPlayer isPlaying] Waiting for canplay event');
        video.addEventListener('canplay', handleCanPlay, { once: true });
      }
    } else {
      if (!video.srcObject) {
        console.log('⏸️ [CinemaVideoPlayer isPlaying] Pausing');
        video.pause();
      }
    }

    return () => {
      video.removeEventListener('canplay', handleCanPlay);
    };
  // mediaItem narrowed to mediaUrl (the only field this effect's guard actually reads) —
  // depending on the whole object meant any metadata-only patch (poster/duration) also
  // re-ran this effect, redundantly calling play() again. onError excluded for the same
  // unstable-reference reason as the main media-loading effect above.
  }, [isPlaying, mediaItem?.mediaUrl]);

  // 🎯 Apply latency-compensated seek time when media loads (VideoWatch only)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackPositionRef?.current || !mediaItem?.mediaUrl) return;

    const seekTime = playbackPositionRef.current;
    if (seekTime <= 0) return;

    const applySeek = () => {
      if (Math.abs(video.currentTime - seekTime) > 0.5) { // Only seek if difference > 0.5s
        console.log('⏱️ [CinemaVideoPlayer] Applying latency-compensated seek:', {
          from: video.currentTime,
          to: seekTime
        });
        video.currentTime = seekTime;
        playbackPositionRef.current = 0; // Reset after applying
      }
    };

    if (video.readyState >= 2) {
      applySeek();
    } else {
      video.addEventListener('loadeddata', applySeek, { once: true });
      return () => video.removeEventListener('loadeddata', applySeek);
    }
  }, [mediaItem?.mediaUrl, playbackPositionRef]);

  // Determine if we're showing camera alongside screen
  const hasBothStreams = mediaItem?.stream && mediaItem?.cameraStream;
  
  // 🎨 Log layout for debugging
  useEffect(() => {
    if (hasBothStreams) {
      console.log('🎨 [CinemaVideoPlayer] Rendering with layout:', layout, 'hasBothStreams:', hasBothStreams);
    }
  }, [layout, hasBothStreams]);
  
  // 📎 Handle expand/collapse box
  const handleExpandBox = (boxType) => {
    if (expandedBox === boxType) {
      setExpandedBox(null); // Collapse
    } else {
      setExpandedBox(boxType); // Expand
    }
  };
  
  // 👁️ Show icon on hover/click with auto-hide after 2s
  const handleBoxInteraction = (boxType) => {
    // Clear existing timeout
    if (iconTimeoutRef.current[boxType]) {
      clearTimeout(iconTimeoutRef.current[boxType]);
    }
    
    // Show icon
    setShowExpandIcon(prev => ({ ...prev, [boxType]: true }));
    
    // Hide after 2 seconds
    iconTimeoutRef.current[boxType] = setTimeout(() => {
      setShowExpandIcon(prev => ({ ...prev, [boxType]: false }));
    }, 2000);
  };
  
  // 🧹 Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(iconTimeoutRef.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
    };
  }, []);
  
  // Show volume control only for uploaded media (not LiveShare/screen share)
  const showVolumeControl = mediaItem?.mediaUrl && !muted;

  // Mouse activity shows the volume icon for 1s then auto-hides
  const handleMouseActivity = () => {
    setIsHovering(true);
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setIsHovering(false), 1000);
  };

  // 🎨 ADAPTIVE SPLIT-VIEW: Only log state changes (reduced verbosity)
  // Removed: excessive split-view waiting logs

  // 🖼️ EMBED RENDER: Google Drive, YouTube, Twitch — iframe fills the player area
  if (mediaItem?.type === 'embed' && mediaItem?.mediaUrl) {
    const platformLabel = {
      google_drive: 'Google Drive',
      youtube: 'YouTube',
      twitch: 'Twitch',
    }[mediaItem.embed_platform] || 'Embedded Content';

    return (
      <div className="w-full h-full relative bg-black flex flex-col">
        {/* Thin header strip so users know what's playing */}
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-black/60 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-white/60 text-[10px] flex-shrink-0">{platformLabel}</span>
            <span className="text-white/40 text-[10px] truncate">{mediaItem.original_name || mediaItem.mediaUrl}</span>
          </div>
          {mediaItem.embed_platform === 'google_drive' && (
            <span className="text-yellow-400/70 text-[9px] flex-shrink-0">File must be publicly shared</span>
          )}
        </div>
        <iframe
          src={mediaItem.mediaUrl}
          className="flex-1 w-full border-0"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          title={platformLabel}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
        />
      </div>
    );
  }

  // 🎨 Render different layouts based on selection
  // Split View: 50/50 side-by-side (desktop) or stacked (mobile)
  // ADAPTIVE: Show split-view ONLY when both streams are available
  // If split-view selected but only one stream, fall through to default layout
  if (layout === 'split-view' && hasBothStreams) {
    console.log('[CinemaVideoPlayer] Rendering split-view with both streams');
    return (
      <div
        className="w-full h-full relative bg-black"
        onMouseMove={handleMouseActivity}
        onMouseLeave={() => { clearTimeout(hoverTimerRef.current); setIsHovering(false); }}
      >
        {/* Split-view with expandable boxes */}
        <div className={`flex w-full h-full ${
          expandedBox ? '' : 'flex-col md:flex-row gap-2 p-2'
        }`}>
          {/* Screen share box */}
          <div 
            className={`relative bg-black overflow-hidden transition-all ${
              expandedBox === 'camera' ? 'hidden' : 
              expandedBox === 'screen' ? 'w-full h-full' :
              'flex-1 rounded-lg border border-gray-700'
            }`}
            onMouseEnter={() => handleBoxInteraction('screen')}
            onMouseMove={() => handleBoxInteraction('screen')}
            onClick={() => handleBoxInteraction('screen')}
          >
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
            />
            
            {/* Expand/Collapse Icon */}
            {showExpandIcon.screen && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleExpandBox('screen');
                }}
                className="absolute top-4 right-4 p-2 bg-black/50 backdrop-blur-sm rounded-lg 
                         hover:bg-black/70 transition-all z-10 cursor-pointer"
              >
                {expandedBox === 'screen' ? (
                  // Collapse icon
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" 
                          d="M9 9l-5-5m0 0v4m0-4h4m11 4l-5 5m5 0v-4m0 4h-4M9 15l-5 5m0 0v-4m0 0h4m11-4l-5-5m5 0v4m0 0h-4" />
                  </svg>
                ) : (
                  // Expand icon
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" 
                          d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                )}
              </button>
            )}
          </div>
          
          {/* Camera box */}
          <div 
            className={`relative bg-black overflow-hidden transition-all ${
              expandedBox === 'screen' ? 'hidden' : 
              expandedBox === 'camera' ? 'w-full h-full' :
              'flex-1 rounded-lg border border-gray-700'
            }`}
            onMouseEnter={() => handleBoxInteraction('camera')}
            onMouseMove={() => handleBoxInteraction('camera')}
            onClick={() => handleBoxInteraction('camera')}
          >
            <video
              ref={cameraVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain bg-black"
            />
            
            {/* Expand/Collapse Icon */}
            {showExpandIcon.camera && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleExpandBox('camera');
                }}
                className="absolute top-4 right-4 p-2 bg-black/50 backdrop-blur-sm rounded-lg 
                         hover:bg-black/70 transition-all z-10 cursor-pointer"
              >
                {expandedBox === 'camera' ? (
                  // Collapse icon
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" 
                          d="M9 9l-5-5m0 0v4m0-4h4m11 4l-5 5m5 0v-4m0 4h-4M9 15l-5 5m0 0v-4m0 0h4m11-4l-5-5m5 0v4m0 0h-4" />
                  </svg>
                ) : (
                  // Expand icon
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" 
                          d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>
        
        {/* Volume Control */}
        {showVolumeControl && (
          <VolumeControl videoRef={videoRef} iconVisible={isHovering} />
        )}
      </div>
    );
  }

  // Default: Screen Share with PIP camera (or single video)
  return (
    <div
      className="w-full h-full relative bg-black"
      onMouseMove={handleMouseActivity}
      onMouseLeave={() => { clearTimeout(hoverTimerRef.current); setIsHovering(false); }}
    >
      {/* Main video (screen share or single stream) */}
      <video
        ref={(el) => {
          videoRef.current = el;
          if (el) {
            // 🔍 DEBUG: Log video element CSS properties (reduced frequency)
            if (Math.random() < 0.05) { // Only log 5% of the time
              setTimeout(() => {
                const rect = el.getBoundingClientRect();
                const computed = window.getComputedStyle(el);
                console.log('🎬 [CinemaVideoPlayer] Video element CSS:', {
                  playerType: muted ? 'FULLSCREEN' : '3D_CINEMA_SCREEN',
                  dimensions: `${rect.width}x${rect.height}`,
                  objectFit: computed.objectFit,
                  display: computed.display,
                  transform: computed.transform,
                  willChange: computed.willChange,
                });
              }, 100);
            }
          }
        }}
        autoPlay
        playsInline
        crossOrigin="anonymous"
        muted={muted} // 👈 Apply the prop
        className={`w-full h-full object-${objectFit} bg-black`}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        onError={onError}
        style={{ backgroundColor: '#000' }}
      />
      
      {/* PIP camera overlay (only shown in 'both' mode with default layout) */}
      {hasBothStreams && (
        <div className="absolute top-8 right-8 w-80 h-45 rounded-lg overflow-hidden shadow-2xl border-2 border-white/20 bg-black">
          <video
            ref={cameraVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
          />
        </div>
      )}
      
      {/* Volume Control - shows on hover for uploaded media */}
      {showVolumeControl && (
        <VolumeControl videoRef={videoRef} iconVisible={isHovering} />
      )}
    </div>
  );
});

// ✅ Now export the wrapped version
export default CinemaVideoPlayer;