// frontend/src/components/useAudioManager.jsx
import { useEffect, useRef } from 'react';

const useAudioManager = ({
  hasMicPermission,
  setHasMicPermission,
  setIsAudioActive,
  localStream,
  setLocalStream,
  isHost,
  isSeatedMode,
  userSeats,
  authenticatedUserID,
  isHostBroadcasting,
  wsRef,
}) => {
  const localStreamRef = useRef(localStream);
  const isAudioActiveRef = useRef(false);

  // Sync stream ref and initial audio state
  useEffect(() => {
    localStreamRef.current = localStream;
    if (localStream) {
      const track = localStream.getAudioTracks()[0];
      if (track) {
        isAudioActiveRef.current = track.enabled;
        setIsAudioActive(track.enabled);
      }
    }
  }, [localStream, setIsAudioActive]);

  // 🔊 Determine audio recipients based on mode and role
  const getAudioRecipients = () => {
    // Seating mode OFF → everyone hears everyone
    if (!isSeatedMode) {
      return Object.keys(userSeats); // all user IDs
    }

    // Host with global broadcast ON → everyone
    if (isHost && isHostBroadcasting) {
      return Object.keys(userSeats);
    }

    // Default: row-only
    const mySeatId = userSeats[authenticatedUserID];
    if (!mySeatId) return [];

    const [myRow] = mySeatId.split('-');
    return Object.entries(userSeats)
      .filter(([_, seatId]) => seatId?.startsWith(`${myRow}-`))
      .map(([userId]) => userId);
  };

  // 🎤 Broadcast mic state to recipients (via WebSocket or WebRTC)
  const broadcastAudioState = (isEnabled) => {
    const recipients = getAudioRecipients();
    if (!wsRef.current?.send) return;

    // Notify others that this user is speaking (or not)
    wsRef.current.send(
      JSON.stringify({
        type: 'user_speaking',
        userId: authenticatedUserID,
        speaking: isEnabled,
        recipients, // optional: for client-side filtering
      })
    );

    // In a full WebRTC implementation, you’d create peer connections
    // only with `recipients` here. For now, we rely on server/client filtering.
  };

  // 🎙 Request mic permission (starts muted)
  const requestMicPermission = async () => {
    try {
      if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        await ctx.resume();
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      if (track) {
        track.enabled = false; // start muted
        isAudioActiveRef.current = false;
      }
      setLocalStream(stream);
      setHasMicPermission(true);
      console.log('✅ Mic acquired and muted');
    } catch (err) {
      console.error('❌ Mic denied:', err);
      alert('Mic access required.');
    }
  };

  // 🔇 Toggle mic + broadcast
  const toggleAudio = () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const track = stream.getAudioTracks()[0];
    if (!track) return;

    const newEnabled = !track.enabled;
    track.enabled = newEnabled;
    isAudioActiveRef.current = newEnabled;
    setIsAudioActive(newEnabled);

    // Broadcast speaking state
    broadcastAudioState(newEnabled);

    console.log(`[Audio] Toggled to ${newEnabled ? 'UNMUTED' : 'MUTED'}`);
  };

  return {
    requestMicPermission,
    toggleAudio,
  };
};

export default useAudioManager;