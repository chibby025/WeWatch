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
  const hasReceivedInitSegmentRef = useRef(false); // ✅ Track init segment state at top level
  const [isBuffering, setIsBuffering] = useState(true);
  const [isCenterHovered, setIsCenterHovered] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const binaryMessageBufferRef = useRef([]); // Single buffer for all chunks

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
      
      // Reset init segment flag
      hasReceivedInitSegmentRef.current = false;
      
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
          video.muted = true; // Prevent echo
          try {
            video.play().catch(e => console.warn("Host preview play failed:", e));
          } catch (e) {
            console.warn("Host preview play exception:", e);
          }
        } else {
          video.srcObject = null;
        }
        setIsBuffering(false);
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

        // ✅ Safety timeout: if sourceopen doesn't fire in 1s, force SourceBuffer creation
        const sourceOpenTimeout = setTimeout(() => {
          if (!sourceBufferRef.current && mediaSource.readyState === 'open') {
            console.warn("[CinemaVideoPlayer] ⏱️ sourceopen delayed — forcing SourceBuffer creation");
            try {
              const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
              sourceBufferRef.current = sourceBuffer;
              setIsBuffering(false);
              setIsVideoPlaying(true);
              console.log("[CinemaVideoPlayer] ✅ SourceBuffer created via timeout for MIME type:", mimeType);
              // Do NOT process chunks here — wait for init
            } catch (e) {
              console.error("[CinemaVideoPlayer] ❌ Failed to create SourceBuffer on timeout", e);
              onError(e, 'Failed to initialize screen share player.');
            }
          }
        }, 1000);

        // ✅ Single function to process next media chunk (non-init)
        const processNextChunk = () => {
          const sourceBuffer = sourceBufferRef.current;
          const mediaSource = mediaSourceRef.current;
          const video = videoRef.current;

          if (!sourceBuffer || sourceBuffer.updating || mediaSource?.readyState !== 'open') {
            console.log(`[CinemaVideoPlayer] ⏸️ processNextChunk blocked: updating=${sourceBuffer?.updating}, state=${mediaSource?.readyState}`);
            return;
          }

          // ✅ BUFFER MANAGEMENT: Remove old buffered data if buffer is too large
          const buffered = sourceBuffer.buffered;
          if (buffered.length > 0) {
            const bufferedEnd = buffered.end(buffered.length - 1);
            const bufferedStart = buffered.start(0);
            const bufferSize = bufferedEnd - bufferedStart;
            const currentTime = video?.currentTime || 0;

            console.log(`[CinemaVideoPlayer] 📊 Buffer stats: size=${bufferSize.toFixed(2)}s, ranges=${buffered.length}, currentTime=${currentTime.toFixed(2)}s`);

            if (bufferSize > 20) {
              const removeEnd = Math.max(bufferedStart, currentTime - 10);
              if (bufferedStart < removeEnd) {
                try {
                  console.log(`[CinemaVideoPlayer] 🧹 Removing buffer: ${bufferedStart.toFixed(2)}s to ${removeEnd.toFixed(2)}s`);
                  sourceBuffer.remove(bufferedStart, removeEnd);
                  return; // `updateend` will re-trigger `processNextChunk`
                } catch (err) {
                  console.warn("[CinemaVideoPlayer] ⚠️ Failed to remove buffer:", err);
                }
              }
            }
          }

          // ✅ Append next media chunk (only after init)
          if (binaryMessageBufferRef.current.length === 0) {
            console.log("[CinemaVideoPlayer] 📭 Queue empty, nothing to append");
            return;
          }
          const chunk = binaryMessageBufferRef.current.shift();
          const remainingInQueue = binaryMessageBufferRef.current.length;
          
          console.log(`[CinemaVideoPlayer] 🔄 Attempting to append chunk: ${chunk.byteLength} bytes, ${remainingInQueue} remaining in queue`);
          
          try {
            sourceBuffer.appendBuffer(chunk);
            console.log(`[CinemaVideoPlayer] ✅ Appended MEDIA chunk (${chunk.byteLength} bytes), ${remainingInQueue} remaining`);
          } catch (err) {
            console.error("[CinemaVideoPlayer] ❌ appendBuffer failed:", err);
            binaryMessageBufferRef.current.unshift(chunk); // Re-queue
            if (err.name === 'QuotaExceededError') {
              console.error("[CinemaVideoPlayer] 🚨 QuotaExceededError - buffer full! Retrying in 100ms");
              setTimeout(processNextChunk, 100);
            }
          }
        };

        // ✅ Define handler that buffers all chunks and checks for init
        const handleBinaryChunk = (data) => {
          if (!data || data.byteLength === 0) return;

          // Always normalize to ArrayBuffer
          const normalizeAndHandle = (arrayBuffer) => {
            const uint8 = new Uint8Array(arrayBuffer);
            const isInitSegment = uint8.length >= 4 &&
              uint8[0] === 0x1A &&
              uint8[1] === 0x45 &&
              uint8[2] === 0xDF &&
              uint8[3] === 0xA3;

            // 🔍 DEBUG: Detailed chunk fingerprint
            const fingerprint = Array.from(uint8.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
            const timestamp = Date.now();
            const queueLengthBefore = binaryMessageBufferRef.current.length;
            
            console.log(`[CinemaVideoPlayer] 📥 Binary chunk received:
              - Timestamp: ${timestamp}
              - Size: ${arrayBuffer.byteLength} bytes
              - IsInit: ${isInitSegment}
              - First 8 bytes: ${fingerprint}
              - Queue before: ${queueLengthBefore}
              - SourceBuffer updating: ${sourceBufferRef.current?.updating}
              - MediaSource state: ${mediaSourceRef.current?.readyState}`);

            if (isInitSegment) {
              console.log("[CinemaVideoPlayer] 🎁 Init segment detected!");
              hasReceivedInitSegmentRef.current = true;
              const sourceBuffer = sourceBufferRef.current;
              if (sourceBuffer && !sourceBuffer.updating && mediaSourceRef.current?.readyState === 'open') {
                try {
                  sourceBuffer.appendBuffer(arrayBuffer);
                  console.log("[CinemaVideoPlayer] ✅ Init segment appended");
                  // Now flush buffered media chunks
                  processNextChunk();
                } catch (e) {
                  console.error("[CinemaVideoPlayer] ❌ Failed to append init segment", e);
                }
              } else {
                // Buffer init if SourceBuffer not ready yet
                console.log("[CinemaVideoPlayer] ⏸️ Init segment buffered (SourceBuffer not ready)");
                binaryMessageBufferRef.current.unshift(arrayBuffer);
              }
            } else {
              // Regular media chunk — buffer until init arrives
              if (hasReceivedInitSegmentRef.current) {
                binaryMessageBufferRef.current.push(arrayBuffer);
                console.log(`[CinemaVideoPlayer] Queue length after push: ${binaryMessageBufferRef.current.length}`);
                const queueLengthAfter = binaryMessageBufferRef.current.length;
                console.log(`[CinemaVideoPlayer] 📦 Media chunk queued. Queue: ${queueLengthAfter}`);
                processNextChunk();
              } else {
                console.log("[CinemaVideoPlayer] ⏳ Buffering media chunk (waiting for init segment)");
                binaryMessageBufferRef.current.push(arrayBuffer);
              }
            }
          };

          if (data instanceof Blob) {
            const reader = new FileReader();
            reader.onload = () => normalizeAndHandle(reader.result);
            reader.readAsArrayBuffer(data);
          } else {
            normalizeAndHandle(data);
          }
        };

        // Register handler IMMEDIATELY
        console.log("[CinemaVideoPlayer] 🔗 Registering binary handler for screen share");
        if (onBinaryHandlerReady && typeof onBinaryHandlerReady === 'function') {
          onBinaryHandlerReady(handleBinaryChunk);
          console.log("[CinemaVideoPlayer] ✅ Binary handler registered successfully");
        } else {
          console.warn("[CinemaVideoPlayer] ⚠️ onBinaryHandlerReady not available");
        }

        const sourceOpenHandler = () => {
          clearTimeout(sourceOpenTimeout);
          try {
            const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
            sourceBufferRef.current = sourceBuffer;
            setIsBuffering(false);
            setIsVideoPlaying(true);
            console.log("[CinemaVideoPlayer] ✅ SourceBuffer added for MIME type:", mimeType);

            sourceBuffer.addEventListener('updateend', () => {
              console.log("[CinemaVideoPlayer] 🔔 updateend fired, hasInit:", hasReceivedInitSegmentRef.current);
              if (hasReceivedInitSegmentRef.current) {
                processNextChunk();
              }
            });
            sourceBuffer.addEventListener('error', (e) => {
              console.error("[CinemaVideoPlayer] ❌ SourceBuffer error:", e);
              onError(new Error('SourceBuffer error'), 'Error receiving screen share data.');
            });

            // ✅ NEW: Check if init segment is buffered and process it
            const bufferedChunks = binaryMessageBufferRef.current;
            if (bufferedChunks.length > 0) {
              console.log(`[CinemaVideoPlayer] 🔁 Re-processing ${bufferedChunks.length} buffered chunks after sourceopen`);
              
              // Look for init segment in buffered chunks
              let initIndex = -1;
              for (let i = 0; i < bufferedChunks.length; i++) {
                const chunk = bufferedChunks[i];
                const uint8 = new Uint8Array(chunk.slice(0, 4));
                if (uint8[0] === 0x1A && uint8[1] === 0x45 && uint8[2] === 0xDF && uint8[3] === 0xA3) {
                  initIndex = i;
                  break;
                }
              }

              if (initIndex !== -1) {
                // Move init to front
                const initChunk = bufferedChunks.splice(initIndex, 1)[0];
                bufferedChunks.unshift(initChunk);
                console.log("[CinemaVideoPlayer] 📌 Reordered buffered chunks: init moved to front");
              }

              // Now re-process all buffered chunks
              for (const chunk of bufferedChunks) {
                handleBinaryChunk(chunk);
              }
              // Clear the buffer since handleBinaryChunk manages its own queue
              binaryMessageBufferRef.current = [];
            }

            // Signal readiness AFTER SourceBuffer is created AND buffer is flushed
            if (!isHost && onScreenShareReady) {
              onScreenShareReady();
              console.log("[CinemaVideoPlayer] 🎉 onScreenShareReady called AFTER sourceopen + buffer flush");
            }
          } catch (addError) {
            console.error("[CinemaVideoPlayer] ❌ Error adding SourceBuffer:", addError);
            onError(addError, 'Failed to initialize screen share player.');
          }
        };

        const handleError = (e) => {
          clearTimeout(sourceOpenTimeout);
          console.error("[CinemaVideoPlayer] ❌ MediaSource error:", e);
          onError(new Error('MediaSource error'), 'Error initializing screen share player.');
        };

        mediaSource.addEventListener('sourceopen', sourceOpenHandler);
        mediaSource.addEventListener('error', handleError);

        return () => {
          clearTimeout(sourceOpenTimeout);
          mediaSource.removeEventListener('sourceopen', sourceOpenHandler);
          mediaSource.removeEventListener('error', handleError);
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
  }, [mediaItem?.ID, mediaItem?.file_path, mediaItem?.stream, mediaItem?.type, isHost, localScreenStream]);


  // ✅ Dedicated effect: attach host stream ONLY when videoRef is ready
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isHost || !localScreenStream || mediaItem?.type !== 'screen_share') {
      return;
    }

    if (video.srcObject !== localScreenStream) {
      console.log("[CinemaVideoPlayer] 🎯 Attaching host screen stream to video element");
      video.srcObject = localScreenStream;
      video.muted = true;
      video.play().catch(e => console.warn("Host preview play failed:", e));
    }

    return () => {
      if (video.srcObject === localScreenStream) {
        video.srcObject = null;
      }
    };
  }, [videoRef.current, isHost, localScreenStream, mediaItem?.type]);
  
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
            console.error("🎬 CinemaVideoPlayer Error:", err, "MediaError:", mediaError);
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