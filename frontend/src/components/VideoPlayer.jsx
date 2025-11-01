// WeWatch/frontend/src/components/VideoPlayer.jsx
import React, { useEffect, useRef } from 'react';

const VideoPlayer = ({ 
  mediaItem,
  isPlaying, 
  roomId, 
  ws, 
  wsConnected, 
  wsError, 
  annotations, 
  onAddAnnotation 
}) => {
  // ✅ MOVE ALL HOOKS INSIDE COMPONENT BODY
  const [currentTime, setCurrentTime] = React.useState(0);
  const [isAnnotationMode, setIsAnnotationMode] = React.useState(false);
  const videoRef = useRef(null); // Ref to access the actual DOM video element

  // Handle video time updates
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Handle annotation mode toggle
  const toggleAnnotationMode = () => {
    setIsAnnotationMode(!isAnnotationMode);
  };

  // Add annotation at current time
  const addAnnotationAtCurrentTime = () => {
    if (isAnnotationMode && videoRef.current) {
      const currentTime = videoRef.current.currentTime;
      // Show annotation creation UI or prompt user
      const text = prompt("Enter your annotation:");
      if (text && text.trim()) {
        onAddAnnotation({
          text: text.trim(),
          timestamp: currentTime
        });
      }
    }
  };

  // ✅ NEW: Unified load + play effect
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !mediaItem) {
      console.log("📹 VideoPlayer: No video element or mediaItem. Clearing src.");
      if (video) video.src = "";
      return;
    }

    // ✅ Log full mediaItem object
    console.log("📹 VideoPlayer: Received mediaItem object:", mediaItem);

    // ✅ Log file_path specifically
    console.log("📹 VideoPlayer: mediaItem.file_path:", mediaItem.file_path);

    // ✅ Construct and log full URL
    const videoUrl = `http://localhost:8080/${mediaItem.file_path}`;
    console.log("📹 VideoPlayer: Constructed video URL:", videoUrl);

    // ✅ Set video source
    video.src = videoUrl;
    video.load();
    video.currentTime = 0;

    // ✅ Play only if isPlaying is true
    if (isPlaying) {
      console.log("📹 VideoPlayer: isPlaying is true. Attempting to play...");
      const play = () => {
        video.play().catch(err => {
          console.error("📹 VideoPlayer: Play failed:", err);
        });
      };
      const timer = setTimeout(play, 100);
      return () => clearTimeout(timer);
    } else {
      console.log("📹 VideoPlayer: isPlaying is false. Pausing video.");
      video.pause();
    }
  }, [mediaItem, isPlaying]); // Re-run when mediaItem or isPlaying changes

  useEffect(() => {
    // Listen for playback events from WebSocket
    const handlePlaybackEvent = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "playback_control") {
        // Handle playback commands
        if (message.command === "play") {
          // Update current playing item in parent component
          if (mediaItem) {
            // This would need to communicate back to RoomPage
          }
        }
      }
    };

    // Add to existing WebSocket listener
    if (ws) {
      ws.addEventListener('message', handlePlaybackEvent);
    }

    return () => {
      if (ws) {
        ws.removeEventListener('message', handlePlaybackEvent);
      }
    };
  }, [ws, mediaItem]);

  // Handles when a media played has ended
  useEffect(() => {
    const handleVideoEnd = () => {
      console.log("VideoPlayer: Video finished playing");
      // Send a message back to the server indicating completion
      if (wsConnected && ws && mediaItem) {
        const completionMessage = {
          type: "playback_complete",
          media_item_id: mediaItem.ID,
          timestamp: Date.now()
        };
        ws.send(JSON.stringify(completionMessage));
        console.log("VideoPlayer: Sent playback completion message:", completionMessage);
      }
    };

    const video = videoRef.current;
    if (video) {
      video.addEventListener('ended', handleVideoEnd);
    }

    return () => {
      if (video) {
        video.removeEventListener('ended', handleVideoEnd);
      }
    };
  }, [wsConnected, ws, mediaItem]);

  
  // --- NEW EFFECT: Handle WebSocket messages for playback sync ---
  useEffect(() => {
    // 1. Check if WebSocket is connected and the connection object exists
    if (!wsConnected || !ws) {
      console.log("VideoPlayer: WebSocket not connected or connection object missing.");
      return; // Exit early if not connected
    }

    // 2. Define the message handler function
    const handlePlaybackMessage = (event) => {
      console.log("VideoPlayer: WebSocket message received:", event.data);
      try {
        // 3. Parse the incoming JSON message
        const message = JSON.parse(event.data);
        console.log("VideoPlayer: Parsed WebSocket message:", message);

        // 4. Check if it's a playback control message
        if (message.type === "playback_control") {
          console.log("VideoPlayer: Received playback control command:", message.command);

          // 5. Ensure the videoRef exists and the player is ready
          if (!videoRef.current) {
            console.warn("VideoPlayer: Video element not ready to receive playback command.");
            return;
          }

          // 6. Execute the corresponding playback action on the local player
          switch (message.command) {
            case "play":
              console.log("VideoPlayer: Received 'play' command via WebSocket. Waiting for isPlaying prop to change.");
              // The actual play is now controlled by the isPlaying prop effect.
              // Do any prep work here if needed, but don't call videoRef.current.play() directly.
              break;
            // ... other cases (pause, seek remain the same if needed locally)
            case "pause":
              // If you want immediate local pause on command, keep this.
              // Otherwise, let isPlaying=false control it via the effect.
              if (videoRef.current) videoRef.current.pause();
              break;
            case "seek":
              // Keep seek if you want immediate local seek on command.
              if (videoRef.current && typeof message.seek_time === 'number' && message.seek_time >= 0) {
                 videoRef.current.currentTime = message.seek_time;
              }
              break;
            default:
              console.warn("VideoPlayer: Unknown playback command received:", message.command);
          }
        } else if (message.type === "playback_completed") {
          // ✅ IGNORE THIS MESSAGE — let RoomPage handle it
          console.log("VideoPlayer: Ignoring playback_completed message (handled by RoomPage)");
        } else {
          // Unknown message type
          console.warn("VideoPlayer: Unknown message type received:", message.type);
        }
      } catch (err) {
        console.error("VideoPlayer: Error parsing incoming WebSocket message:", err, event.data);
      }
    };

    // 7. Attach the message event listener to the WebSocket connection
    console.log("VideoPlayer: Adding playback message listener to WebSocket connection.");
    ws.addEventListener('message', handlePlaybackMessage);

    // 8. Cleanup function (runs when effect re-runs or component unmounts)
    return () => {
      console.log("VideoPlayer: Removing playback message listener from WebSocket connection.");
      // Remove the message event listener to prevent memory leaks
      if (ws) {
        ws.removeEventListener('message', handlePlaybackMessage);
      }
    };
  }, [ws, wsConnected, roomId]); // Dependency array includes 'ws', 'wsConnected', and 'roomId'

  return (
    <div className="relative w-full">
      <video
        ref={videoRef}
        controls
        className="w-full h-auto bg-black rounded-lg"
        onTimeUpdate={handleTimeUpdate}
        onClick={isAnnotationMode ? addAnnotationAtCurrentTime : undefined}
      >
        {mediaItem && (
          <source 
            src={`http://localhost:8080/${mediaItem.file_path}`} 
            type="video/mp4" 
          />
        )}
        Your browser does not support the video tag.
      </video>

      {/* Annotation Mode Toggle */}
      {isAnnotationMode && (
        <div className="absolute top-2 right-2">
          <button
            onClick={toggleAnnotationMode}
            className="px-3 py-1 bg-red-500 text-white rounded text-sm"
          >
            Exit Annotation Mode
          </button>
        </div>
      )}

      {/* Annotation Mode Indicator */}
      {isAnnotationMode && (
        <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
          Annotation Mode Active
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;