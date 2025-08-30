// WeWatch/frontend/src/components/VideoPlayer.jsx
import React, { useEffect, useRef } from 'react';

// --- UPDATE COMPONENT PROPS ---
// Accept mediaItem, roomId, and WebSocket connection/status as props
const VideoPlayer = ({ mediaItem, roomId, ws, wsConnected, wsError }) => {
// --- --- ---
  const videoRef = useRef(null); // Ref to access the actual DOM video element

  // --- EXISTING EFFECT: Handle loading a new media item ---
  useEffect(() => {
    // Check if a video element ref exists and a mediaItem is provided
    if (videoRef.current && mediaItem) {
      // --- Construct the correct URL to the uploaded file ---
      // Assuming your Go backend serves files from /uploads/ relative to its root
      // and the file_path returned by the API is relative (e.g., "uploads/uuid-filename.mp4")
      const videoUrl = `http://localhost:8080/${mediaItem.file_path}`; 
      // Example: If mediaItem.file_path is "uploads/2ecab53a-1053-4ede-8dc7-7c3770ee2f73.mp4"
      // videoUrl becomes "http://localhost:8080/uploads/2ecab53a-1053-4ede-8dc7-7c3770ee2f73.mp4"
      
      console.log("VideoPlayer: Loading video:", videoUrl);
      
      // Set the video element's src attribute to the constructed URL
      videoRef.current.src = videoUrl;
      
      // Optional: Explicitly load the new source (might not be strictly necessary, but good practice)
      videoRef.current.load(); 
      
      // --- Reset playback state for the new video ---
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      
      // --- OPTIONAL: Auto-play the newly selected video ---
      // Uncomment the lines below if you want the video to start playing automatically
      // when a new item is selected. Be cautious with autoplay policies.
      /*
      videoRef.current.play().catch(error => {
        console.log("VideoPlayer: Auto-play prevented or failed:", error);
        // Silently handle autoplay errors (common due to browser policies)
        // User can manually click play.
      });
      */
      // --- --- ---
      
    } else if (videoRef.current && !mediaItem) {
      // If no mediaItem is selected, clear the video source
      console.log("VideoPlayer: No media item selected, clearing video source.");
      videoRef.current.src = "";
      videoRef.current.load(); // Reload to clear the player
    }
  }, [mediaItem]); // Dependency array includes 'mediaItem'
                   // This effect re-runs whenever 'mediaItem' prop changes
  // --- --- ---

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
              console.log("VideoPlayer: Executing play command.");
              videoRef.current.play().catch(error => {
                console.log("VideoPlayer: Auto-play prevented or failed:", error);
                // Silently handle autoplay errors (common due to browser policies)
                // User can manually click play.
              });
              break;
            case "pause":
              console.log("VideoPlayer: Executing pause command.");
              videoRef.current.pause();
              break;
            case "seek":
              console.log("VideoPlayer: Executing seek command to time:", message.seek_time);
              if (typeof message.seek_time === 'number' && message.seek_time >= 0) {
                videoRef.current.currentTime = message.seek_time;
              } else {
                console.warn("VideoPlayer: Invalid seek time received:", message.seek_time);
              }
              break;
            case "load":
              console.log("VideoPlayer: Executing load command for media item ID:", message.media_item_id);
              // Future: Load a specific media item by ID
              // This would involve fetching the media item details from the backend
              // and updating the video player's source.
              break;
            default:
              console.warn("VideoPlayer: Unknown playback command received:", message.command);
          }
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
                                 // This effect re-runs when any of these change
  // --- --- ---

  // --- TODO: Add event handlers for play/pause/seek/timeupdate etc. ---
  // These will be used later for synchronization logic (WebSockets)
  // Example:
  // const handlePlay = () => {
  //   if (videoRef.current) {
  //     videoRef.current.play();
  //     // TODO: Send "play" command via WebSocket
  //   }
  // };

  return (
    <div className="video-player-container w-full">
      {mediaItem ? (
        <>
          {/* Render the HTML5 video element */}
          <video 
            ref={videoRef} // Attach the ref
            controls // Show default browser controls (play, pause, volume, seek bar)
            className="video-player w-full h-96 bg-black" // Adjust height/width as needed
            // Add event listeners for player actions (for future sync)
            // onPlay={handlePlay}
            // onPause={handlePause}
            // onSeeked={handleSeeked}
            // onTimeUpdate={handleTimeUpdate}
          >
            {/* Fallback message if browser doesn't support the video tag */}
            Your browser does not support the video tag.
          </video>
          {/* Display the name of the currently playing file */}
          <p className="mt-2 text-sm text-gray-600">
            Now Playing: <span className="font-medium">{mediaItem.original_name}</span>
          </p>
        </>
      ) : (
        // Render a placeholder if no mediaItem is selected
        <div className="video-placeholder flex items-center justify-center w-full h-96 bg-gray-800 border-2 border-dashed border-gray-400 rounded-lg">
          <p className="text-gray-400 text-xl">Select a media item to play</p>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;