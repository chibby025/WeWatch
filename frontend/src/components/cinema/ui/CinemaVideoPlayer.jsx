// src/components/cinema/ui/CinemaVideoPlayer.jsx
import React, { useRef, useEffect, useState } from 'react';

const CinemaVideoPlayer = ({
  mediaItem,
  src,
  isPlaying,
  isHost,
  localScreenStream,
  playbackPositionRef,
  onScreenShareReady,
  onPlay = () => {},
  onPause = () => {},
  onEnded = () => {},
  onError = () => {},
  onTimeUpdate = () => {},
  onPauseBroadcast = () => {},
  onBinaryHandlerReady = () => {},
}) => {
  const videoRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const sourceBufferRef = useRef(null);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isCenterHovered, setIsCenterHovered] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const binaryMessageBufferRef = useRef([]); // For chunks during playback
  const earlyChunkBufferRef = useRef([]); // For chunks before sourceopen

  const videoSrc = src || (mediaItem?.file_path ? `/${mediaItem.file_path}` : '');

  // IMPROVED: Effect for MediaSource/Stream/File handling and cleanup
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      console.warn("CinemaVideoPlayer: ⚠️ videoRef is null in media setup effect.");
      return;
    }

    // --- CLEANUP LOGIC ---
    const cleanupPreviousMedia = () => {
      console.log("[CinemaVideoPlayer] 🔁 Starting cleanup for previous media.");
      // Clean up MediaSource
      if (mediaSourceRef.current) {
        const mediaSource = mediaSourceRef.current;
        if (mediaSource.readyState === 'open') {
          console.log("[CinemaVideoPlayer] 📺 MediaSource is open, attempting to end stream.");
          if (sourceBufferRef.current) {
            const updateEndHandler = () => {
              try {
                mediaSource.endOfStream();
                console.log("[CinemaVideoPlayer] ✅ MediaSource ended.");
              } catch (e) {
                console.warn("[CinemaVideoPlayer] ⚠️ Error ending MediaSource:", e);
              }
            };
            sourceBufferRef.current.addEventListener('updateend', updateEndHandler, { once: true });
            sourceBufferRef.current.abort();
          } else {
            try {
              mediaSource.endOfStream();
              console.log("[CinemaVideoPlayer] ✅ MediaSource ended (no buffer).");
            } catch (e) {
              console.warn("[CinemaVideoPlayer] ⚠️ Error ending MediaSource (no buffer):", e);
            }
          }
        }
        if (video.src) {
          URL.revokeObjectURL(video.src);
        }
        mediaSourceRef.current = null;
        sourceBufferRef.current = null;
        binaryMessageBufferRef.current = [];
        earlyChunkBufferRef.current = []; // ✅ Clear early buffer too
        console.log("[CinemaVideoPlayer] 📺 MediaSource and buffers cleared.");
      }

      // Clean up MediaStream
      if (video.srcObject) {
        const stream = video.srcObject;
        if (stream && stream.getTracks) {
          stream.getTracks().forEach(track => track.stop());
        }
        video.srcObject = null;
        console.log("[CinemaVideoPlayer] 📹 MediaStream cleared.");
      }

      video.src = '';
      setIsBuffering(true);
      console.log("[CinemaVideoPlayer] 🧹 Previous media cleaned up.");
    };

    cleanupPreviousMedia();

    // --- SET UP NEW MEDIA ---
    console.log("[CinemaVideoPlayer] 🔁 Setting up new media. Type:", mediaItem?.type, "isHost:", isHost);

    if (mediaItem?.type === 'screen_share') {
      if (isHost) {
        console.log("[CinemaVideoPlayer] 🖥️ Host rendering local screen stream");
        if (localScreenStream) {
          video.srcObject = localScreenStream;
          setIsBuffering(false);
        } else {
          console.warn("[CinemaVideoPlayer] ⚠️ Host has no localScreenStream");
          video.src = '';
          setIsBuffering(false);
        }
      } else {
        console.log("[CinemaVideoPlayer] 📺 Member setting up MediaSource for screen share.");
        setIsBuffering(true);

        const mimeType = mediaItem.mime_type || 'video/webm;codecs=vp8';
        if (!MediaSource.isTypeSupported(mimeType)) {
          console.error(`[CinemaVideoPlayer] ❌ MIME type ${mimeType} not supported.`);
          onError(new Error(`MIME type ${mimeType} not supported.`));
          return;
        }

        const mediaSource = new MediaSource();
        mediaSourceRef.current = mediaSource;
        video.src = URL.createObjectURL(mediaSource);

        // ✅ Define handler that buffers until sourceopen
        const handleBinaryChunk = (data) => {
          if (!data || data.byteLength === 0) return;
          // If sourceBuffer is not ready, buffer in earlyChunkBufferRef
          if (!sourceBufferRef.current) {
            earlyChunkBufferRef.current.push(data);
            console.log("[CinemaVideoPlayer] 📥 Buffered chunk before sourceopen");
            return;
          }
          // Otherwise, use normal playback buffer
          if (sourceBufferRef.current.updating) {
            binaryMessageBufferRef.current.push(data);
            return;
          }
          try {
            if (data instanceof Blob) {
              const reader = new FileReader();
              reader.onload = () => {
                if (!sourceBufferRef.current?.updating) {
                  sourceBufferRef.current?.appendBuffer(reader.result);
                } else {
                  binaryMessageBufferRef.current.push(reader.result);
                }
              };
              reader.readAsArrayBuffer(data);
            } else {
              sourceBufferRef.current?.appendBuffer(data);
            }
          } catch (err) {
            console.error("[CinemaVideoPlayer] ❌ Error in handleBinaryChunk:", err);
            onError(err, "Failed to process screen share data.");
          }
        };

        // Register handler IMMEDIATELY (before sourceopen)
        if (onBinaryHandlerReady && typeof onBinaryHandlerReady === 'function') {
          onBinaryHandlerReady(handleBinaryChunk);
        }

        const sourceOpenHandler = () => {
          try {
            const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
            sourceBufferRef.current = sourceBuffer;
            setIsBuffering(false);
            setIsVideoPlaying(true);
            console.log("[CinemaVideoPlayer] ✅ SourceBuffer added for MIME type:", mimeType);

            // Set up event listeners
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

            // ✅ FLUSH EARLY CHUNKS (now that SourceBuffer is ready)
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

            // ✅ Signal readiness
            if (!isHost && onScreenShareReady && typeof onScreenShareReady === 'function') {
              onScreenShareReady();
            }

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

        return () => {
          mediaSource.removeEventListener('sourceopen', sourceOpenHandler);
          mediaSource.removeEventListener('error', handleError);
          // Cleanup handler
          if (onBinaryHandlerReady) {
            onBinaryHandlerReady(null);
          }
        };
      }
    } else if (mediaItem?.stream) {
      console.log("[CinemaVideoPlayer] 📹 Setting srcObject to stream:", mediaItem.stream);
      video.srcObject = mediaItem.stream;
      video.load();
      setIsBuffering(false);
    } else if (mediaItem?.file_path) {
      const videoUrl = mediaItem.file_path.startsWith('/')
        ? mediaItem.file_path
        : `/${mediaItem.file_path}`;
      console.log("[CinemaVideoPlayer] 📼 Setting video.src to file path:", videoUrl);
      video.src = videoUrl;
      video.preload = 'auto';
      video.load();
      setIsBuffering(false);
    } else {
      console.log("[CinemaVideoPlayer] 📽️ No media specified, clearing video.src.");
      video.src = '';
      setIsBuffering(false);
    }
  }, [mediaItem?.ID, mediaItem?.file_path, mediaItem?.stream, mediaItem?.type, isHost]);

  // ... rest of your effects (playbackPositionRef, play/pause, etc.) remain unchanged ...

  // KEEP playbackPositionRef IN SYNC DURING PLAYBACK
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const updateTime = () => {
      if (isPlaying) {
        playbackPositionRef.current = video.currentTime;
      }
    };
    video.addEventListener('timeupdate', updateTime);
    return () => video.removeEventListener('timeupdate', updateTime);
  }, [isPlaying]);

  // PLAY/PAUSE + SEEK LOGIC
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isBuffering) return;
    if (playbackPositionRef.current >= 0) {
      video.currentTime = playbackPositionRef.current;
    }
    if (isPlaying) {
      video.play().catch((err) => {
        if (err.name !== 'AbortError') console.error('[CinemaVideoPlayer] ❌ play() error:', err);
      });
    } else {
      video.pause();
    }
  }, [isPlaying, isBuffering]);

  // ON-ENDED HANDLER
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleVideoEnd = () => onEnded();
    video.addEventListener('ended', handleVideoEnd);
    return () => video.removeEventListener('ended', handleVideoEnd);
  }, [onEnded]);

  // Event handlers for buffering and errors
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleCanPlayThrough = () => setIsBuffering(false);
    const handleCanPlay = () => {};
    const handleWaiting = () => {
      if (mediaItem?.type !== 'screen_share') {
        setIsBuffering(true);
      }
    };
    const handlePlaying = () => {
      setIsVideoPlaying(true);
      if (mediaItem?.type !== 'screen_share') {
        setIsBuffering(false);
      }
    };
    const handleError = (e) => {
      setIsBuffering(false);
      onError(e);
    };

    video.addEventListener('canplaythrough', handleCanPlayThrough);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('canplaythrough', handleCanPlayThrough);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleError);
    };
  }, [mediaItem?.type, onError]);

  const hasContent = !!(mediaItem?.stream || mediaItem?.file_path || mediaItem?.type === 'screen_share');

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
          srcObject={isHost && mediaItem?.type === 'screen_share' ? localScreenStream : mediaItem?.stream || null}
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