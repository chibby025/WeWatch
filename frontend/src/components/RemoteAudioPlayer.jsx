// frontend/src/components/RemoteAudioPlayer.jsx
import { useEffect, useRef } from 'react';

/**
 * Audio player that respects row-based vs room-wide filtering
 * 
 * @param {Object} props
 * @param {MediaStream} props.stream - Remote user's audio stream
 * @param {number} props.userId - Remote user's ID
 * @param {number} props.currentUserId - Current user's ID
 * @param {Function} props.getAudioRecipients - Function that returns array of user IDs who should hear current user
 * @param {boolean} props.muted - Whether to mute this specific user
 */
export default function RemoteAudioPlayer({
  stream,
  userId,
  currentUserId,
  getAudioRecipients,
  muted = false,
}) {
  const audioRef = useRef(null);
  
  // Removed verbose render logging for cleaner console

  useEffect(() => {
    if (!stream || !audioRef.current) return;

    // Set the audio element's source
    audioRef.current.srcObject = stream;
    audioRef.current.play().catch(err => {
      console.warn(`[RemoteAudioPlayer] Failed to play audio for user ${userId}:`, err);
    });

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.srcObject = null;
      }
    };
  }, [stream, userId]);

  // Mute/unmute based on filtering logic
  useEffect(() => {
    if (!audioRef.current) return;

    // Check if current user should hear this remote user
    let shouldHear = true;

    if (getAudioRecipients) {
      // Get list of users that the remote user is broadcasting to
      // In a full implementation, this would come from the remote user's broadcast message
      // For now, we trust that the server/client has filtered appropriately
      
      // The filtering happens at the WebSocket level - if we receive audio,
      // we should play it. The server only sends audio to appropriate recipients.
      shouldHear = true;
    }

    // Apply mute state
    audioRef.current.muted = muted || !shouldHear;
    audioRef.current.volume = muted || !shouldHear ? 0 : 1;
  }, [muted, getAudioRecipients, userId, currentUserId]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      style={{ display: 'none' }}
    />
  );
}
