// frontend/src/hooks/useLectureHallAudio.jsx
import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Audio hook for lecture hall with raise hand system
 * 
 * Audio Modes:
 * - Host: Always broadcasts to ALL students
 * - Student (default): Row-based audio (unmuted = speak to row only)
 * - Student (approved): Room-wide broadcast (raise hand → host approves)
 */
const useLectureHallAudio = ({
  isHost,
  hasHostApproval,
  userSeats,
  authenticatedUserID,
  watchSessionMembers, // Active watch session participants
  approvedSpeakers,
  sendMessage,
  sessionId,
  lectureHallSeats = [], // For row lookup in lecture hall
}) => {
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState('');
  const [audioDevices, setAudioDevices] = useState([]);
  const [discussionMode, setDiscussionMode] = useState(false);
  
  const localStreamRef = useRef(localStream);
  const isAudioActiveRef = useRef(false);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const audioLevelIntervalRef = useRef(null);
  const hasRequestedMicRef = useRef(false); // Prevent duplicate requests in Strict Mode

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

  // Enumerate audio devices
  const updateAudioDevices = useCallback(async () => {
    // Check if mediaDevices API is available (blocked on HTTP non-localhost)
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      console.warn('⚠️ navigator.mediaDevices not available (likely HTTP non-localhost). Skipping audio device enumeration.');
      return;
    }
    
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      setAudioDevices(audioInputs);
      
      if (audioInputs.length > 0 && !selectedAudioDeviceId) {
        setSelectedAudioDeviceId(audioInputs[0].deviceId);
      }
    } catch (err) {
      console.error('Failed to enumerate audio devices:', err);
    }
  }, [selectedAudioDeviceId]);

  useEffect(() => {
    // Check if mediaDevices API is available before setting up listeners
    if (!navigator.mediaDevices) {
      console.warn('⚠️ navigator.mediaDevices not available. Skipping device change listeners.');
      return;
    }
    
    updateAudioDevices();
    navigator.mediaDevices.addEventListener('devicechange', updateAudioDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', updateAudioDevices);
    };
  }, [updateAudioDevices]);

  /**
   * Get row and column from lecture hall seat ID
   * Returns {row: number, column: number} or 'host' for seat 145
   * 
   * Layout:
   * - Column 1: Seats 1-40   (8 rows × 5 seats)
   * - Column 2: Seats 41-104 (8 rows × 8 seats)
   * - Column 3: Seats 105-144 (8 rows × 5 seats)
   * - Host: Seat 145
   */
  const getRowFromSeatId = useCallback((seatId) => {
    if (!seatId) return null;
    
    // Host seat is 145
    if (seatId === 145 || seatId === '145') return 'host';
    
    const seatNumber = parseInt(seatId);
    
    // Try to get from lectureHallSeats data if available
    const seatData = lectureHallSeats.find(s => s.id === seatNumber);
    if (seatData && seatData.row && seatData.column) {
      return { row: seatData.row, column: seatData.column };
    }
    
    // Fallback: calculate row and column based on seat ranges
    let row, column;
    
    if (seatNumber <= 40) {
      // Column 1: 8 rows × 5 seats (seats 1-40)
      column = 1;
      row = Math.ceil(seatNumber / 5);
    } else if (seatNumber <= 104) {
      // Column 2: 8 rows × 8 seats (seats 41-104)
      column = 2;
      const colSeatId = seatNumber - 40;
      row = Math.ceil(colSeatId / 8);
    } else if (seatNumber <= 144) {
      // Column 3: 8 rows × 5 seats (seats 105-144)
      column = 3;
      const colSeatId = seatNumber - 104;
      row = Math.ceil(colSeatId / 5);
    } else {
      return null;
    }
    
    return { row, column };
  }, [lectureHallSeats]);

  /**
   * Determine who should hear this user's audio
   * 
   * Returns array of user IDs
   */
  const getAudioRecipients = useCallback(() => {
    // ✅ Discussion mode: EVERYONE speaks to EVERYONE (not just host)
    if (discussionMode) {
      return watchSessionMembers.map(m => m.id.toString());
    }

    // Host always broadcasts to everyone in lecture mode
    if (isHost) {
      return watchSessionMembers.map(m => m.id.toString());
    }

    // Student with host approval (LiveShare permission) broadcasts to everyone
    if (hasHostApproval) {
      return watchSessionMembers.map(m => m.id.toString());
    }

    // Default lecture mode: row AND column for students (isolated groups)
    const mySeatId = userSeats[authenticatedUserID];
    if (!mySeatId) return [];

    const myLocation = getRowFromSeatId(mySeatId);
    if (!myLocation || myLocation === 'host') return [];
    
    const { row: myRow, column: myColumn } = myLocation;
    
    // Find all users in the same row AND column (isolated groups)
    return Object.entries(userSeats)
      .filter(([_, seatId]) => {
        if (!seatId) return false;
        const seatLocation = getRowFromSeatId(seatId);
        if (!seatLocation || seatLocation === 'host') return false;
        
        const { row: seatRow, column: seatColumn } = seatLocation;
        return seatRow === myRow && seatColumn === myColumn;
      })
      .map(([userId]) => userId.toString());
  }, [isHost, hasHostApproval, userSeats, authenticatedUserID, watchSessionMembers, discussionMode, getRowFromSeatId]);

  /**
   * Broadcast audio state to recipients
   */
  const broadcastAudioState = useCallback((isEnabled) => {
    const recipients = getAudioRecipients();
    
    if (!sendMessage) return;

    // Determine broadcast scope and location
    let broadcastScope = 'row'; // default
    let broadcastLocation = null;
    
    if (discussionMode) {
      // ✅ Discussion mode: everyone broadcasts to everyone
      broadcastScope = 'discussion';
      broadcastLocation = 'discussion';
    } else if (isHost) {
      broadcastScope = 'room';
    } else if (hasHostApproval) {
      broadcastScope = 'room';
    } else {
      // Get user's location for logging
      const mySeatId = userSeats[authenticatedUserID];
      if (mySeatId) {
        const myLocation = getRowFromSeatId(mySeatId);
        if (myLocation && myLocation !== 'host') {
          broadcastLocation = myLocation; // {row, column}
        }
      }
    }
    
    sendMessage({
      type: 'user_speaking',
      data: {
        user_id: authenticatedUserID,
        speaking: isEnabled,
        recipients,
        broadcast_scope: broadcastScope,
        broadcast_location: broadcastLocation, // {row, column} or null
        discussion_mode: discussionMode,
        session_id: sessionId,
      },
    });

    // Enhanced logging with column info
    const locationStr = broadcastLocation 
      ? `Column ${broadcastLocation.column}, Row ${broadcastLocation.row}` 
      : broadcastScope;
    console.log(`[LectureHallAudio] Broadcasting audio state: enabled=${isEnabled}, scope=${broadcastScope}, location=${locationStr}, discussion=${discussionMode}, recipients=${recipients.length}`);
  }, [getAudioRecipients, sendMessage, authenticatedUserID, sessionId, isHost, hasHostApproval, discussionMode, userSeats, getRowFromSeatId]);

  /**
   * Request microphone permission (starts muted)
   */
  const requestMicPermission = useCallback(async () => {
    // ✅ Guard: Prevent duplicate calls (React Strict Mode double-invokes effects)
    if (hasRequestedMicRef.current) {
      console.log('⏭️ [requestMicPermission] Already requested, skipping duplicate call');
      return;
    }
    hasRequestedMicRef.current = true;
    
    try {
      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('⚠️ [LectureHallAudio] navigator.mediaDevices not available');
        console.warn('📱 This usually means:');
        console.warn('   1. Page served over HTTP from non-localhost IP (browsers block mic on HTTP)');
        console.warn('   2. Use HTTPS or localhost for microphone access');
        console.warn('   3. As a listener-only member, you can still HEAR audio without a mic');
        return;
      }
      
      // iOS audio context workaround
      if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        await ctx.resume();
      }

      const constraints = {
        audio: selectedAudioDeviceId 
          ? { deviceId: { exact: selectedAudioDeviceId } }
          : true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getAudioTracks()[0];
      
      console.log('🎤 [requestMicPermission] Stream acquired:', {
        streamId: stream.id,
        streamActive: stream.active,
        audioTracks: stream.getAudioTracks().length
      });
      
      if (track) {
        console.log('🎤 [requestMicPermission] Audio track details:', {
          trackId: track.id,
          trackLabel: track.label,
          trackKind: track.kind,
          trackReadyState: track.readyState,
          trackMuted: track.muted,
          trackSettings: track.getSettings()
        });
        
        // ✅ Start MUTED by default (Zoom/Meet style) - user clicks Audio button to unmute
        // Prevents accidental broadcasting and gives clear visual feedback
        track.enabled = false;
        isAudioActiveRef.current = false;
        setIsAudioActive(false);
        console.log('🔇 [requestMicPermission] Track MUTED - click Audio button to unmute');
      }
      
      setLocalStream(stream);
      setHasMicPermission(true);
      
      console.log('✅ [LectureHallAudio] Microphone ready - MUTED by default (click to unmute)');
      
      // ✅ Setup audio level monitoring to detect if mic is receiving sound
      setupAudioLevelMonitoring(stream);
    } catch (err) {
      console.error('❌ [LectureHallAudio] Microphone access denied:', err);
      alert('Microphone access is required for audio participation.');
    }
  }, [selectedAudioDeviceId]);

  /**
   * Setup audio level monitoring to detect if mic is receiving audio
   */
  const setupAudioLevelMonitoring = useCallback((stream) => {
    try {
      // Cleanup existing monitoring
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      
      // Create Web Audio API context
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      microphone.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      console.log('🎵 [Audio Monitoring] Started audio level detection');
      
      // Monitor audio levels every 2 seconds (LOGS DISABLED to reduce console noise)
      audioLevelIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
        const percentage = Math.round((average / 255) * 100);
        
        const track = stream.getAudioTracks()[0];
        
        // ✅ LOGS COMMENTED OUT to reduce console spam
        // if (percentage > 5) {
        //   // Check for potential echo suppression (low levels 5-15% when speaking)
        //   if (percentage >= 5 && percentage <= 15) {
        //     console.log(`🎤 [Audio Level] ${percentage}% - Track.enabled: ${track?.enabled}, ReadyState: ${track?.readyState}, Muted: ${track?.muted}`);
        //     console.warn(`⚠️ [Echo Suppression?] Low audio levels (${percentage}%) detected. This may indicate:`);
        //     console.warn('   1. Browser echo cancellation active (mic picking up speakers on same device)');
        //     console.warn('   2. Speaking too quietly');
        //     console.warn('   3. Mic sensitivity too low');
        //     console.warn('   💡 Try testing on separate devices to avoid feedback loop');
        //   } else {
        //     console.log(`🎤 [Audio Level] ${percentage}% - Track.enabled: ${track?.enabled}, ReadyState: ${track?.readyState}, Muted: ${track?.muted}`);
        //   }
        // } else if (track?.enabled) {
        //   // Only log if mic is enabled but no sound detected (every 10 seconds to avoid spam)
        //   if (Date.now() % 10000 < 2000) {
        //     console.log(`🔇 [Audio Level] ${percentage}% (silence) - Track.enabled: ${track?.enabled}, waiting for sound...`);
        //   }
        // }
      }, 2000); // Check every 2 seconds
    } catch (err) {
      console.error('❌ [Audio Monitoring] Failed to setup:', err);
    }
  }, []);

  /**
   * ✅ Auto-request microphone permission on mount (Zoom/Meet style)
   * User will see browser's native permission prompt
   * After allowing, mic starts MUTED by default (prevents feedback loops)
   * User clicks Audio button to unmute when ready to speak
   * 
   * ⚠️ requestMicPermission NOT in deps - we only want this to run ONCE per session
   * Adding it causes effect re-runs that stop/recreate tracks (readyState: ended)
   */
  useEffect(() => {
    if (!hasMicPermission && sessionId) {
      console.log('🎤 [LectureHallAudio] Auto-requesting mic permission (will start muted)...');
      requestMicPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, hasMicPermission]);

  /**
   * Toggle microphone on/off
   */
  const toggleAudio = useCallback(() => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎤 [TOGGLE AUDIO] Button clicked');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const stream = localStreamRef.current;
    if (!stream) {
      console.warn('❌ [toggleAudio] No stream available, requesting permission...');
      requestMicPermission();
      return;
    }

    console.log('📍 [Step 1] Stream exists:', {
      streamId: stream.id,
      audioTracks: stream.getAudioTracks().length
    });

    const track = stream.getAudioTracks()[0];
    if (!track) {
      console.error('❌ No audio track found in stream!');
      return;
    }

    console.log('📍 [Step 2] Audio track BEFORE toggle:', {
      trackId: track.id,
      trackLabel: track.label,
      currentlyEnabled: track.enabled,
      readyState: track.readyState,
      muted: track.muted,
      constraints: track.getConstraints(),
      settings: track.getSettings()
    });

    // ✅ DON'T modify MediaStreamTrack.enabled - LiveKit track handles muting
    // We only toggle React state (isAudioActive) and let handleToggleAudio in PositionCalculatorPage
    // handle the actual LiveKit track.mute()/unmute() calls
    const newEnabled = !isAudioActiveRef.current;
    console.log(`📍 [Step 3] ${newEnabled ? 'UNMUTING ✅' : 'MUTING 🔇'}: isAudioActive ${!newEnabled} → ${newEnabled}`);
    
    // ❌ REMOVED: track.enabled = newEnabled; (this doesn't sync with LiveKit track)
    isAudioActiveRef.current = newEnabled;
    console.log('📍 [Step 4] Setting isAudioActive state to:', newEnabled);
    setIsAudioActive(newEnabled);
    console.log('📍 [Step 5] State change will trigger handleToggleAudio which calls track.mute/unmute');

    console.log('📍 [Step 6] Broadcasting audio state via WebSocket...');
    broadcastAudioState(newEnabled);

    console.log('✅ [Step 7] Toggle complete. New state:', newEnabled ? 'UNMUTED' : 'MUTED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }, [requestMicPermission, broadcastAudioState, isHost, hasHostApproval, userSeats, authenticatedUserID, getRowFromSeatId]);

  /**
   * Toggle discussion mode (host only)
   */
  const toggleDiscussionMode = useCallback(() => {
    if (!isHost) {
      console.warn('[LectureHallAudio] Only host can toggle discussion mode');
      return;
    }

    setDiscussionMode(prev => {
      const newMode = !prev;
      
      // Broadcast the new discussion mode state
      sendMessage?.({
        type: 'toggle_discussion_mode',
        data: {
          discussion_mode: newMode,
          session_id: sessionId,
        },
      });

      console.log(`[LectureHallAudio] Discussion mode toggled: ${newMode}`);
      return newMode;
    });
  }, [isHost, sendMessage, sessionId]);

  /**
   * Change audio input device
   */
  const changeAudioDevice = useCallback(async (deviceId) => {
    try {
      setSelectedAudioDeviceId(deviceId);
      
      // If we have an active stream, replace the track
      if (localStream) {
        const wasEnabled = isAudioActiveRef.current;
        
        // Stop old track
        const oldTrack = localStream.getAudioTracks()[0];
        if (oldTrack) {
          oldTrack.stop();
        }
        
        // Get new stream with selected device
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
        });
        
        const newTrack = newStream.getAudioTracks()[0];
        if (newTrack) {
          newTrack.enabled = wasEnabled;
        }
        
        setLocalStream(newStream);
        console.log('✅ [LectureHallAudio] Switched audio device:', deviceId);
      }
    } catch (err) {
      console.error('❌ [LectureHallAudio] Failed to change audio device:', err);
    }
  }, [localStream]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      // Cleanup audio monitoring
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
        console.log('🧹 [Audio Monitoring] Stopped level detection');
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        console.log('🧹 [Audio Monitoring] Closed audio context');
      }
      
      // Cleanup audio stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        console.log('🧹 [LectureHallAudio] Cleaned up audio stream');
      }
    };
  }, []);

  /**
   * ✅ Re-broadcast audio state when discussion mode changes
   * This ensures already-unmuted users update their recipient list
   */
  useEffect(() => {
    // Only re-broadcast if user is currently unmuted
    if (isAudioActiveRef.current && sendMessage) {
      console.log(`🔄 [Discussion Mode Changed] Re-broadcasting audio state (isAudioActive: ${isAudioActiveRef.current}, discussionMode: ${discussionMode})`);
      broadcastAudioState(true);
    }
  }, [discussionMode, broadcastAudioState, sendMessage]);

  return {
    hasMicPermission,
    isAudioActive,
    localStream,
    audioDevices,
    selectedAudioDeviceId,
    discussionMode,
    setDiscussionMode, // Expose setter for syncing from backend
    requestMicPermission,
    toggleAudio,
    changeAudioDevice,
    getAudioRecipients,
    toggleDiscussionMode,
    getRowFromSeatId, // Export for use in PositionCalculatorPage
  };
};

/**
 * Helper function to check if two seats are in the same row+column group
 * Exported for use in LiveKit selective subscription logic
 * 
 * @param {number} seatId1 - First seat ID
 * @param {number} seatId2 - Second seat ID
 * @param {function} getRowFromSeatIdFn - getRowFromSeatId function from hook
 * @returns {boolean} - True if same row AND column group
 */
export const isInSameRowGroup = (seatId1, seatId2, getRowFromSeatIdFn) => {
  if (!seatId1 || !seatId2) return false;
  
  const seat1Info = getRowFromSeatIdFn(seatId1);
  const seat2Info = getRowFromSeatIdFn(seatId2);
  
  if (!seat1Info || !seat2Info) return false;
  if (seat1Info === 'host' || seat2Info === 'host') return false;
  
  // Must match BOTH row AND column for isolated groups
  return seat1Info.row === seat2Info.row && seat1Info.column === seat2Info.column;
};

export default useLectureHallAudio;
