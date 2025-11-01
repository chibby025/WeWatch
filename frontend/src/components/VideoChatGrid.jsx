// frontend/src/components/VideoChatGrid.jsx
import React, { useEffect, useRef, useState } from 'react';
import VideoPlayer from './VideoPlayer';
/**
 * VideoChatGrid Component
 * Renders a grid of video feeds for all participants in the room.
 * This is the "Google Meet" baseline experience.
 * 
 * Props:
 * - participants: Array of user objects { id, username }
 * - localStream: MediaStream object for the local user's camera/mic
 * - peerConnections: Object mapping userId → RTCPeerConnection
 * - speakingUsers: Set of user IDs who are currently speaking
 * - authenticatedUserID: ID of the current user
 * - onLeaveVideoChat: Function to call when user clicks "Leave Video Chat"
 */
const VideoChatGrid = ({
  participants,
  localStream,
  toggleAudio,
  peerConnections,
  speakingUsers,
  authenticatedUserID,
  onLeaveVideoChat,
  selectedMediaItem,
  handlePlayMedia,
  ws,
  wsConnected,
}) => {
  // Ref to store video elements for each participant
  const videoRefs = useRef({});

  /**
   * EFFECT 1: Attach localStream to local video element
   * Runs when localStream changes.
   * This is YOUR video feed.
   */
  useEffect(() => {
    if (!localStream || !videoRefs.current[authenticatedUserID]) return;

    // Attach the local stream to your own video element
    const localVideo = videoRefs.current[authenticatedUserID];
    localVideo.srcObject = localStream;

    // Cleanup function to revoke object URL if needed (not usually needed for MediaStream)
    return () => {
      localVideo.srcObject = null;
    };
  }, [localStream, authenticatedUserID]);

  /**
   * EFFECT 2: Attach remote streams to video elements
   * Runs when peerConnections change.
   * This is OTHER USERS' video feeds.
   */
  useEffect(() => {
    // Iterate over all peer connections
    Object.entries(peerConnections).forEach(([userId, pc]) => {
      // Skip if no video ref for this user
      if (!videoRefs.current[userId]) return;

      // Set up event listener for when remote stream is received
      const handleTrack = (event) => {
        if (event.track.kind === 'video') {
          const remoteVideo = videoRefs.current[userId];
          // Attach the remote video track to the video element
          remoteVideo.srcObject = event.streams[0];
        }
      };

      // Add the event listener
      pc.addEventListener('track', handleTrack);

      // Cleanup: Remove event listener on unmount or when peerConnections change
      return () => {
        pc.removeEventListener('track', handleTrack);
      };
    });
  }, [peerConnections]);

  /**
   * EFFECT 3: Handle peer connection state changes (optional, for debugging)
   * Logs when a peer connection state changes (e.g., "connected", "disconnected").
   */
  useEffect(() => {
    Object.entries(peerConnections).forEach(([userId, pc]) => {
      const handleConnectionStateChange = () => {
        console.log(`Peer connection with user ${userId} is ${pc.connectionState}`);
      };

      pc.addEventListener('connectionstatechange', handleConnectionStateChange);

      return () => {
        pc.removeEventListener('connectionstatechange', handleConnectionStateChange);
      };
    });
  }, [peerConnections]);

  return (
    <div className="bg-black bg-opacity-50 rounded-lg p-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-white">Video Chat</h2>
        <button
            onClick={onLeaveVideoChat}
            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
        >
            ✕
        </button>
        </div>

        {/* Video Grid */}
        <div className="grid grid-cols-2 gap-2">
        {participants.map((user) => (
            <div key={user.id} className="relative">
            <video
                ref={(el) => (videoRefs.current[user.id] = el)}
                autoPlay
                playsInline
                muted={user.id === authenticatedUserID}
                className="w-20 h-20 rounded bg-black"
            />
            {speakingUsers.has(user.id) && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping"></div>
            )}
            <div className="text-xs text-white mt-1 truncate">{user.username}</div>
            </div>
        ))}
        </div>
    </div>
    );
};

export default VideoChatGrid;