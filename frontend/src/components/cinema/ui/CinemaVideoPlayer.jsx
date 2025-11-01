
// src/components/cinema/ui/CinemaVideoPlayer.jsx
import React, { useRef, useEffect, useState } from 'react';

const CinemaVideoPlayer = ({
  mediaItem,
  src,
  isPlaying,
  isHost,
  localScreenStream,
  playbackPositionRef,
  onScreenShareReady, // ✅ Correct: just the name
  onPlay = () => {},
  onPause = () => {},
  onEnded = () => {},
  onError = () => {},
  onTimeUpdate = () => {},
  onPauseBroadcast = () => {},
  onBinaryHandlerReady = () => {},
}) => {
  const videoRef = useRef(null);
  const mediaSourceRef = useRef(null); // Ref for MediaSource object
  const sourceBufferRef = useRef(null); // Ref for SourceBuffer object
  const [isBuffering, setIsBuffering] = useState(true);
  const [isCenterHovered, setIsCenterHovered] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false); 
  // NEW: Ref to buffer incoming binary messages for screen share
  const binaryMessageBufferRef = useRef([]);
  const earlyChunkBufferRef = useRef([]); // Buffer
  const videoSrc = src || (mediaItem?.file_path ? `/${mediaItem.file_path}` : '');



  // IMPROVED: Effect for MediaSource/Stream/File handling and cleanup
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
        console.warn("CinemaVideoPlayer: ⚠️ videoRef is null in media setup effect.");
        return;
    }

    // --- CLEANUP LOGIC (Run before setting new media or on unmount) ---
    const cleanupPreviousMedia = () => {
      console.log("[CinemaVideoPlayer] 🔁 Starting cleanup for previous media.");
      // Clean up MediaSource for screen shares
      if (mediaSourceRef.current) {
        console.log("[CinemaVideoPlayer] 📺 Cleaning up MediaSource...");
        const mediaSource = mediaSourceRef.current;

        if (mediaSource.readyState === 'open') {
          console.log("[CinemaVideoPlayer] 📺 MediaSource is open, attempting to end stream.");
          if (sourceBufferRef.current) {
            // Listen for updateend to safely end the stream
            const updateEndHandler = () => {
              console.log("[CinemaVideoPlayer] 📺 SourceBuffer updateend fired, ending MediaSource stream.");
              try {
                mediaSource.endOfStream();
                console.log("[CinemaVideoPlayer] ✅ MediaSource ended.");
              } catch (e) {
                console.warn("[CinemaVideoPlayer] ⚠️ Error ending MediaSource:", e);
              }
            };
            sourceBufferRef.current.addEventListener('updateend', updateEndHandler, { once: true });
            // Abort any pending updates to trigger updateend
            console.log("[CinemaVideoPlayer] 📺 Aborting pending SourceBuffer updates to trigger endOfStream.");
            sourceBufferRef.current.abort();
          } else {
            // No source buffer, just end the stream if possible
            console.log("[CinemaVideoPlayer] 📺 No SourceBuffer found, attempting to end MediaSource directly.");
            try {
              mediaSource.endOfStream();
              console.log("[CinemaVideoPlayer] ✅ MediaSource ended (no buffer).");
            } catch (e) {
              console.warn("[CinemaVideoPlayer] ⚠️ Error ending MediaSource (no buffer):", e);
            }
          }
        } else {
            console.log("[CinemaVideoPlayer] 📺 MediaSource readyState is not 'open', skipping endOfStream. State:", mediaSource.readyState);
        }
        // Revoke the object URL to free resources
        if (video.src) {
          console.log("[CinemaVideoPlayer] 📺 Revoking MediaSource object URL.");
          URL.revokeObjectURL(video.src);
        }
        mediaSourceRef.current = null;
        sourceBufferRef.current = null;
        binaryMessageBufferRef.current = []; // Clear buffer
        console.log("[CinemaVideoPlayer] 📺 MediaSource and SourceBuffer refs cleared.");
      } else {
          console.log("[CinemaVideoPlayer] 📺 No MediaSource to clean up.");
      }

      // Clean up MediaStream (for non-screen-share streams)
      if (video.srcObject) {
        console.log("[CinemaVideoPlayer] 📹 Cleaning up MediaStream...");
        const stream = video.srcObject;
        if (stream && stream.getTracks) {
          stream.getTracks().forEach(track => {
            console.log(`[CinemaVideoPlayer] 📹 Stopping track: ${track.kind} - ${track.id}`);
            track.stop();
          });
        }
        video.srcObject = null;
        console.log("[CinemaVideoPlayer] 📹 MediaStream cleared from video.srcObject.");
      } else {
          console.log("[CinemaVideoPlayer] 📹 No MediaStream to clean up.");
      }

      // Reset video source and state
      console.log("[CinemaVideoPlayer] 📹 Resetting video source and buffering state.");
      video.src = '';
      setIsBuffering(true);
      console.log("[CinemaVideoPlayer] 🧹 Previous media cleaned up.");
    };

    // Run cleanup
    cleanupPreviousMedia();

    // --- SET UP NEW MEDIA LOGIC ---
    console.log("[CinemaVideoPlayer] 🔁 Setting up new media. Type:", mediaItem?.type, "ID:", mediaItem?.ID, "isHost:", isHost);

    if (mediaItem?.type === 'screen_share') {
      if (isHost) {
        // ✅ HOST: Render local stream directly (no MediaSource)
        console.log("[CinemaVideoPlayer] 🖥️ Host rendering local screen stream");
        
        if (localScreenStream) {
          video.srcObject = localScreenStream;
          setIsBuffering(false);
        } else {
          console.warn("[CinemaVideoPlayer] ⚠️ Host has no localScreenStream for screen share");
          video.src = '';
          setIsBuffering(false);
        }
      } else {
        // ✅ MEMBER: Use MediaSource + binary chunks
        console.log("[CinemaVideoPlayer] 📺 Member setting up MediaSource for screen share.");
        setIsBuffering(true);

        // Use MIME type from message if available, fallback to VP8
        const mimeType = mediaItem.mime_type || 'video/webm;codecs=vp8';

        if (!MediaSource.isTypeSupported(mimeType)) {
          console.error(`[CinemaVideoPlayer] ❌ MIME type ${mimeType} is not supported.`);
          onError(new Error(`MIME type ${mimeType} not supported.`));
          return;
        }

        const mediaSource = new MediaSource();
        mediaSourceRef.current = mediaSource;
        video.src = URL.createObjectURL(mediaSource);

        const sourceOpenHandler = () => {
          try {
            const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
            sourceBufferRef.current = sourceBuffer;
            setIsBuffering(false);
            setIsVideoPlaying(true);
            console.log("[CinemaVideoPlayer] ✅ SourceBuffer added for MIME type:", mimeType);

            // ✅ FLUSH EARLY CHUNKS (init segment + frames that arrived before sourceopen)
            if (earlyChunkBufferRef.current.length > 0) {
              console.log("[CinemaVideoPlayer] 🚀 Flushing", earlyChunkBufferRef.current.length, "early buffered chunks");
              earlyChunkBufferRef.current.forEach(chunk => {
                if (chunk && chunk.byteLength > 0 && !sourceBuffer.updating) {
                  try {
                    sourceBuffer.appendBuffer(chunk);
                  } catch (e) {
                    if (e.name === 'QuotaExceededError') {
                      binaryMessageBufferRef.current.push(chunk);
                    } else {
                      console.error("[CinemaVideoPlayer] ❌ Error appending early chunk:", e);
                    }
                  }
                } else {
                  binaryMessageBufferRef.current.push(chunk);
                }
              });
              earlyChunkBufferRef.current = [];
            }


            // ✅ Define the binary chunk handler that appends to SourceBuffer
            const handleBinaryChunk = (data) => {
              if (!data || data.byteLength === 0) return;
              if (sourceBuffer.updating) {
                // Buffer if SourceBuffer is busy
                binaryMessageBufferRef.current.push(data);
                return;
              }
              try {
                if (data instanceof Blob) {
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (!sourceBuffer.updating) {
                      sourceBuffer.appendBuffer(reader.result);
                    } else {
                      binaryMessageBufferRef.current.push(reader.result);
                    }
                  };
                  reader.readAsArrayBuffer(data);
                } else {
                  sourceBuffer.appendBuffer(data);
                }
              } catch (err) {
                console.error("[CinemaVideoPlayer] ❌ Error in handleBinaryChunk:", err);
                onError(err, "Failed to process screen share data.");
              }
            };

            // ✅ Register handler with parent (VideoWatch) ONLY when ready
            if (onBinaryHandlerReady && typeof onBinaryHandlerReady === 'function') {
              onBinaryHandlerReady(handleBinaryChunk);
            }
            // ✅ Signal that viewer is fully ready to receive binary
            // ✅ Only non-host viewers should signal readiness
            if (!isHost && onScreenShareReady) {
              onScreenShareReady();
            }

            // ✅ NEW: Emit "I'm ready" event so parent can send viewer_ready
            if (typeof window !== 'undefined' && window.__emitViewerReady) {
              window.__emitViewerReady(); // temporary bridge — better: pass callback
            }
            sourceBuffer.addEventListener('updateend', () => {
              if (binaryMessageBufferRef.current.length > 0 && !sourceBuffer.updating) {
                const nextChunk = binaryMessageBufferRef.current.shift();
                if (nextChunk && nextChunk.byteLength > 0) {
                  try {
                    sourceBuffer.appendBuffer(nextChunk);
                  } catch (error) {
                    console.error("[CinemaVideoPlayer] ❌ Error appending buffered chunk:", error);
                    binaryMessageBufferRef.current.unshift(nextChunk);
                    onError(error, "Error processing buffered screen share data.");
                  }
                }
              }
            });

            sourceBuffer.addEventListener('error', (e) => {
              console.error("[CinemaVideoPlayer] ❌ SourceBuffer error:", e);
              onError(new Error('SourceBuffer error'), 'Error receiving screen share data.');
            });
          } catch (addError) {
            console.error("[CinemaVideoPlayer] ❌ Error adding SourceBuffer:", addError);
            onError(addError, 'Failed to initialize screen share player.');
          }
        };

        const handleError = (e) => {
          console.error("[CinemaVideoPlayer] ❌ MediaSource error:", e);
          onError(new Error('MediaSource error'), 'Error initializing screen share player.');
        };

        mediaSource.addEventListener('sourceopen', sourceOpenHandler);
        mediaSource.addEventListener('error', handleError);

        // Cleanup
        return () => {
          mediaSource.removeEventListener('sourceopen', sourceOpenHandler);
          mediaSource.removeEventListener('error', handleError);
        };
      }
    } else if (mediaItem?.stream) {
      // Handle camera preview, etc.
      console.log("[CinemaVideoPlayer] 📹 Setting srcObject to stream:", mediaItem.stream);
      video.srcObject = mediaItem.stream;
      video.load();
      setIsBuffering(false);
    } else if (mediaItem?.file_path) {
      // Handle uploaded files
      const videoUrl = mediaItem.file_path.startsWith('/')
        ? mediaItem.file_path
        : `/${mediaItem.file_path}`;
      console.log("[CinemaVideoPlayer] 📼 Setting video.src to file path:", videoUrl);
      video.src = videoUrl;
      video.preload = 'auto';
      video.load();
      setIsBuffering(false);
    } else {
      // No media
      console.log("[CinemaVideoPlayer] 📽️ No media specified, clearing video.src.");
      video.src = '';
      setIsBuffering(false);
    }

  }, [mediaItem?.ID, mediaItem?.file_path, mediaItem?.stream, mediaItem?.type, isHost]); // Add mediaItem?.type to dependency array


  // KEEP playbackPositionRef IN SYNC DURING PLAYBACK
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => {
      if (isPlaying) {
        playbackPositionRef.current = video.currentTime;
      }
      console.log('[CinemaVideoPlayer] ⏱️ timeupdate:', video.currentTime, 'readyState:', video.readyState, 'paused:', video.paused);
    };

    video.addEventListener('timeupdate', updateTime);
    return () => video.removeEventListener('timeupdate', updateTime);
  }, [isPlaying]);

  // PLAY/PAUSE + SEEK LOGIC
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      console.warn("CinemaVideoPlayer: ⚠️ videoRef is null in play/pause effect.");
      return;
    }
    if (isBuffering) {
      console.log("[CinemaVideoPlayer] 📽️ Play/Pause effect: Waiting for buffering to complete before acting.");
      // Don't attempt play/pause if still buffering initial setup (e.g., MediaSource)
      return;
    }

    // Always seek before play/pause
    if (playbackPositionRef.current >= 0) {
      console.log("[CinemaVideoPlayer] 📽️ Seeking to position:", playbackPositionRef.current);
      video.currentTime = playbackPositionRef.current;
    }

    if (isPlaying) {
      console.log("[CinemaVideoPlayer] 📽️ Attempting to play video.");
      video.play().then(() => {
        console.log('[CinemaVideoPlayer] ▶️ play() resolved. video.paused:', video.paused, 'readyState:', video.readyState);
      }).catch((err) => {
        console.error('[CinemaVideoPlayer] ❌ play() error:', err);
      });
    } else {
      console.log("[CinemaVideoPlayer] 📽️ Pausing video.");
      video.pause();
      console.log('[CinemaVideoPlayer] ⏸️ pause() called. video.paused:', video.paused, 'readyState:', video.readyState);
    }
  }, [isPlaying, isBuffering]);

  // ON-ENDED HANDLER
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleVideoEnd = () => {
        console.log("[CinemaVideoPlayer] 📽️ Video ended event fired.");
        onEnded();
    };
    video.addEventListener('ended', handleVideoEnd);
    return () => video.removeEventListener('ended', handleVideoEnd);
  }, [onEnded]);

  // Event handlers for buffering and errors (for file/stream playback)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleCanPlayThrough = () => {
      setIsBuffering(false);
      console.log("[CinemaVideoPlayer] ✅ canplaythrough: fully buffered");
    };

    const handleCanPlay = () => {
      // Fallback: allow partial playback if needed
      console.log("[CinemaVideoPlayer] 🔄 canplay: partial buffer ready");
      // setIsBuffering(false); // Consider if canplay is sufficient
    };

    const handleWaiting = () => {
      if (mediaItem?.type !== 'screen_share') {
        setIsBuffering(true);
        console.log("[CinemaVideoPlayer] ⏳ waiting: buffering started (not screen share)");
      } else {
        console.log("[CinemaVideoPlayer] ⏳ Video element fired 'waiting' event for screen share - ignoring for buffering state.");
        // Do NOT set isVideoPlaying = false — brief stalls are normal in live streams
      }
    };
    const handlePlaying = () => {
      setIsVideoPlaying(true); // ✅ Always set to true when playing starts
      if (mediaItem?.type !== 'screen_share') {
        setIsBuffering(false);
        console.log("[CinemaVideoPlayer] ▶️ playing: buffering finished (not screen share)");
      } else {
        console.log("[CinemaVideoPlayer] ▶️ Video element fired 'playing' event for screen share");
        // No need to set buffering — screen share uses MediaSource, not file buffering
      }
    };
    const handleError = (e) => {
      setIsBuffering(false);
      console.error("[CinemaVideoPlayer] ❌ Video error (via video element):", e, video.error);
      onError(e);
    };

    video.addEventListener('canplaythrough', handleCanPlayThrough);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('error', handleError);

    console.log("[CinemaVideoPlayer] 📽️ Added video element event listeners (canplaythrough, canplay, waiting, playing, error).");

    return () => {
      console.log("[CinemaVideoPlayer] 📽️ Removing video element event listeners.");
      video.removeEventListener('canplaythrough', handleCanPlayThrough);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleError);
    };
  }, [mediaItem?.type]); // Depend on type to potentially adjust event handling

  // Determine if we have valid media to display
  const hasContent = !!(mediaItem?.stream || mediaItem?.file_path || mediaItem?.type === 'screen_share');
  console.log("[CinemaVideoPlayer] 🧭 Render: hasContent =", hasContent, "mediaItem.type =", mediaItem?.type);

  return (
    <div className="relative w-full h-full bg-black"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const inCenter =
          Math.abs(x - centerX) < rect.width * 0.2 &&
          Math.abs(y - centerY) < rect.height * 0.2;
        setIsCenterHovered(inCenter);
      }}
      onMouseLeave={() => setIsCenterHovered(false)}
    >
      {hasContent ? (
        <video
          ref={videoRef}
          srcobject={isHost && mediaItem?.type === 'screen_share' ? localScreenStream : mediaItem?.stream || null}
          controls={false}
          className="w-full h-full object-contain"
          onPlay={onPlay}
          onPause={onPause}
          onEnded={onEnded}
          onError={(err) => {
            const video = videoRef.current;
            const mediaError = video?.error;
            let userMessage = "An unknown error occurred while playing the video.";
            if (mediaError) {
              switch (mediaError.code) {
                case 1: userMessage = "Video playback aborted."; break;
                case 2: userMessage = "Network error loading video."; break;
                case 3: userMessage = "Corrupted or unsupported video file."; break;
                case 4: userMessage = "This video cannot be played in your browser."; break;
                default: userMessage = "Unknown playback error.";
              }
            }
            console.error("🎬 CinemaVideoPlayer: Video error:", err, mediaError);
            onError(err, userMessage);
          }}
          onTimeUpdate={(e) => onTimeUpdate(e.target.currentTime)}
        >
          Your browser does not support the video tag.
        </video>
      ) : (
        <div className="w-full h-full bg-black"></div>
      )}

      {/* Loading Spinner */}
      {isBuffering && hasContent && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 z-10">
          <div className="flex flex-col items-center text-white">
            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-2"></div>
            <span className="text-sm">Loading screen share...</span>
          </div>
        </div>
      )}

      {/* Screen Paused Overlay */}
      {!isPlaying && hasContent && (
        <div
          className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center z-20 cursor-pointer"
          onClick={() => {
            if (videoRef.current) {
              videoRef.current.play().catch((err) => {
                if (err.name !== 'AbortError') console.error("Play failed:", err);
              });
              onPlay();
            }
          }}
        >
          <div className="text-white text-2xl font-bold bg-black/50 px-6 py-3 rounded-lg flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Screen Paused
          </div>
        </div>
      )}

      {/* "Connecting..." Overlay for Screen Share — only for non-host viewers */}
      {mediaItem?.type === 'screen_share' && !isHost && !isVideoPlaying && (
        // Only show if NO chunks have ever been received
        binaryMessageBufferRef.current.length === 0 && !sourceBufferRef.current?.updating && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
            <div className="text-white text-center">
              <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <span className="text-sm">Receiving screen share...</span>
            </div>
          </div>
        )
      )}

      {/* Pause overlay */}
      {isPlaying && !isBuffering && isCenterHovered && isHost && (
        <button
          className="absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 bg-black/40 rounded-full p-6 flex items-center justify-center hover:bg-black/60 transition"
          onClick={() => {
            if (videoRef.current) {
              videoRef.current.pause();
              onPause();
              onPauseBroadcast();
            }
          }}
          style={{ border: 'none', outline: 'none' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="2" fill="currentColor"/>
            <rect x="14" y="5" width="4" height="14" rx="2" fill="currentColor"/>
          </svg>
        </button>
      )}
    </div>
  );
};

export default CinemaVideoPlayer;