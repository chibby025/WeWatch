// frontend/src/hooks/useCinemaAudio.jsx
import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Cinema Audio Hook - Manages LiveKit audio for 3D cinema with row-based filtering
 * 
 * Audio Modes:
 * - Seat Mode: Row-based audio (users only hear same row)
 * - Party Mode: Everyone hears everyone (auto-subscribe)
 * - Host Broadcasting: Host speaks to all (overrides seat mode)
 * 
 * Note: Silence mode (user-controlled) overrides both modes - handled by RemoteAudioPlayer
 */
const useCinemaAudio = ({
  isHost,
  userSeats,           // { userId: "row-col" } e.g., { 123: "2-3", 456: "4-1" }
  authenticatedUserID,
  audioMode,           // 'seat' or 'party' (host-controlled, synced via WebSocket)
  sendMessage,
  sessionId,
  isHostBroadcasting,  // ✅ Host broadcast mode
}) => {
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState('');
  const [audioDevices, setAudioDevices] = useState([]);
  
  const localStreamRef = useRef(localStream);
  const isAudioActiveRef = useRef(false);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const audioLevelIntervalRef = useRef(null);
  const hasRequestedMicRef = useRef(false);

  // Sync stream ref
  useEffect(() => {
    localStreamRef.current = localStream;
    if (localStream) {
      const track = localStream.getAudioTracks()[0];
      if (track) {
        isAudioActiveRef.current = track.enabled;
        setIsAudioActive(track.enabled);
      }
    }
  }, [localStream]);

  /**
   * Get row number from seat key
   * @param {string} seatKey - Format: "row-col" e.g., "2-3"
   * @returns {number|null} - Row number (0-5) or null
   */
  const getRowFromSeat = useCallback((seatKey) => {
    if (!seatKey) return null;
    const [row] = seatKey.split('-').map(Number);
    return row; // 0-5
  }, []);

  /**
   * Calculate who should hear this user's audio
   * @returns {string[]} Array of user IDs
   */
  const getAudioRecipients = useCallback(() => {
    // ✅ Host broadcasting: speak to everyone
    if (isHost && isHostBroadcasting) {
      console.log('[useCinemaAudio] Host broadcasting - all users will hear');
      return Object.keys(userSeats);
    }

    // Party mode: everyone hears everyone
    if (audioMode === 'party') {
      return Object.keys(userSeats);
    }

    // Seat mode: row-only
    const mySeat = userSeats[authenticatedUserID];
    const myRow = getRowFromSeat(mySeat);
    
    if (myRow === null) return [];

    // Return all users in same row
    return Object.entries(userSeats)
      .filter(([_, seatKey]) => getRowFromSeat(seatKey) === myRow)
      .map(([userId]) => userId);
  }, [audioMode, userSeats, authenticatedUserID, getRowFromSeat, isHost, isHostBroadcasting]);

  /**
   * Broadcast audio state to recipients (via WebSocket)
   */
  const broadcastAudioState = useCallback((isEnabled) => {
    const recipients = getAudioRecipients();
    
    if (!sendMessage || !sessionId) {
      console.warn('[useCinemaAudio] Cannot broadcast: missing sendMessage or sessionId');
      return;
    }

    const mySeat = userSeats[authenticatedUserID];
    const myRow = getRowFromSeat(mySeat);

    console.log(`[useCinemaAudio] Broadcasting audio state:`, {
      isEnabled,
      mode: audioMode,
      row: myRow,
      recipientCount: recipients.length
    });

    // Notify others about speaking state
    sendMessage({
      type: 'user_speaking',
      user_id: authenticatedUserID,
      speaking: isEnabled,
      mode: audioMode,
      row: myRow,
      recipients,
      session_id: sessionId
    });
  }, [getAudioRecipients, sendMessage, authenticatedUserID, sessionId, audioMode, userSeats, getRowFromSeat]);

  /**
   * Enumerate audio devices
   */
  const updateAudioDevices = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      console.warn('[useCinemaAudio] mediaDevices API not available');
      return;
    }
    
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      setAudioDevices(audioInputs);
      
      if (!selectedAudioDeviceId && audioInputs.length > 0) {
        setSelectedAudioDeviceId(audioInputs[0].deviceId);
      }
    } catch (err) {
      console.error('[useCinemaAudio] Failed to enumerate devices:', err);
    }
  }, [selectedAudioDeviceId]);

  useEffect(() => {
    if (!navigator.mediaDevices) return;
    
    updateAudioDevices();
    navigator.mediaDevices.addEventListener('devicechange', updateAudioDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', updateAudioDevices);
    };
  }, [updateAudioDevices]);

  /**
   * Request microphone permission (starts muted)
   */
  const requestMicPermission = useCallback(async () => {
    if (hasRequestedMicRef.current) {
      console.log('[useCinemaAudio] Mic permission already requested');
      return;
    }

    hasRequestedMicRef.current = true;

    try {
      // iOS Audio Context workaround
      if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        await ctx.resume();
      }

      const constraints = {
        audio: selectedAudioDeviceId 
          ? { deviceId: { exact: selectedAudioDeviceId } }
          : true
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getAudioTracks()[0];
      
      if (track) {
        track.enabled = false; // Start muted
        isAudioActiveRef.current = false;
        console.log('✅ [useCinemaAudio] Mic acquired and muted');
      }

      setLocalStream(stream);
      setHasMicPermission(true);
      setupAudioLevelMonitoring(stream);
    } catch (err) {
      console.error('❌ [useCinemaAudio] Mic denied:', err);
      hasRequestedMicRef.current = false;
      alert('Microphone access is required for audio communication.');
    }
  }, [selectedAudioDeviceId]);

  /**
   * Setup audio level monitoring to detect if mic is working
   */
  const setupAudioLevelMonitoring = useCallback((stream) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      
      analyser.fftSize = 256;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastLogTime = 0;
      
      const checkAudioLevel = () => {
        if (!analyserRef.current) return;
        
        analyser.getByteTimeDomainData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128) / 128;
          sum += Math.abs(normalized);
        }
        const avgAmplitude = sum / dataArray.length;
        
        const now = Date.now();
        if (avgAmplitude > 0.01 && now - lastLogTime > 3000) {
          // Reduced verbosity: log every 5 seconds instead of every frame
          if (Date.now() % 5000 < 100) {
            console.log(`🎤 [useCinemaAudio] Mic active - ${(avgAmplitude * 100).toFixed(2)}% amplitude`);
          }
          lastLogTime = now;
        }
      };
      
      audioLevelIntervalRef.current = setInterval(checkAudioLevel, 100);
      console.log('🎙️ [useCinemaAudio] Audio level monitoring started');
    } catch (err) {
      console.warn('[useCinemaAudio] Could not setup audio monitoring:', err);
    }
  }, []);

  /**
   * Auto-request microphone permission on mount (Zoom/Meet style)
   */
  useEffect(() => {
    if (sessionId && !hasMicPermission && !hasRequestedMicRef.current) {
      console.log('[useCinemaAudio] Auto-requesting microphone permission...');
      requestMicPermission();
    }
  }, [sessionId, hasMicPermission]);

  /**
   * Toggle microphone on/off
   */
  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    
    if (!stream) {
      console.log('[useCinemaAudio] No stream, requesting mic permission...');
      requestMicPermission();
      return;
    }

    const track = stream.getAudioTracks()[0];
    if (!track) {
      console.warn('[useCinemaAudio] No audio track found');
      return;
    }

    const newEnabled = !track.enabled;
    track.enabled = newEnabled;
    isAudioActiveRef.current = newEnabled;
    setIsAudioActive(newEnabled);

    // Broadcast speaking state
    broadcastAudioState(newEnabled);

    console.log(`🎤 [useCinemaAudio] Audio toggled: ${newEnabled ? 'UNMUTED' : 'MUTED'}`);
    console.log(`   Mode: ${audioMode}`);
    console.log(`   Recipients: ${getAudioRecipients().length} users`);
  }, [requestMicPermission, broadcastAudioState, audioMode, getAudioRecipients]);

  /**
   * Change audio input device
   */
  const changeAudioDevice = useCallback(async (deviceId) => {
    if (!localStream) return;

    try {
      // Stop current tracks
      localStream.getTracks().forEach(track => track.stop());

      // Get new stream with selected device
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } }
      });

      const newTrack = newStream.getAudioTracks()[0];
      if (newTrack) {
        newTrack.enabled = isAudioActiveRef.current;
      }

      setLocalStream(newStream);
      setSelectedAudioDeviceId(deviceId);
      setupAudioLevelMonitoring(newStream);
      
      console.log('✅ [useCinemaAudio] Audio device changed');
    } catch (err) {
      console.error('[useCinemaAudio] Failed to change device:', err);
    }
  }, [localStream, setupAudioLevelMonitoring]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
      }
    };
  }, []);

  return {
    hasMicPermission,
    isAudioActive,
    localStream,
    audioDevices,
    selectedAudioDeviceId,
    requestMicPermission,
    toggleAudio,
    changeAudioDevice,
    getAudioRecipients,
    getRowFromSeat,
  };
};

export default useCinemaAudio;
