// frontend/src/components/LiveKitAudioDebugPanel.jsx
import React, { useState, useEffect } from 'react';

/**
 * 🔍 Phase 1: LiveKit Audio Debug Panel
 * 
 * Purpose: Visualize audio state for lecture hall selective subscription debugging
 * 
 * Shows:
 * 1. Local audio state (published, muted, speaking)
 * 2. Remote participants' audio state (subscribed, muted, speaking)
 * 3. Audio recipient filtering (who should hear whom)
 * 4. LiveKit track publications status
 */
export default function LiveKitAudioDebugPanel({
  // LiveKit room instance
  livekitRoom,
  // Local user info
  currentUser,
  userSeat, // Current user's seat ID
  isHost,
  hasHostApproval,
  // Audio state
  isAudioActive, // Local mic enabled/disabled
  localStream,
  // Seat assignments
  userSeats, // {userId: seatId}
  // Audio recipients logic
  getAudioRecipients, // Function that returns array of user IDs who should hear this user
  // Remote audio states (from WebSocket)
  remoteAudioStates, // {userId: boolean} - who is unmuted
}) {
  const [localAudioLevel, setLocalAudioLevel] = useState(0);
  const [remoteSpeakers, setRemoteSpeakers] = useState({}); // {participantIdentity: {isSpeaking, audioLevel}}
  const [trackPublications, setTrackPublications] = useState([]); // Remote track publication details
  const [showPanel, setShowPanel] = useState(true);

  // Monitor local audio level
  useEffect(() => {
    if (!localStream || !isAudioActive) {
      setLocalAudioLevel(0);
      return;
    }

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(localStream);
    source.connect(analyser);
    analyser.fftSize = 256;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const checkAudioLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setLocalAudioLevel(average);
    };

    const intervalId = setInterval(checkAudioLevel, 100);

    return () => {
      clearInterval(intervalId);
      source.disconnect();
      audioContext.close();
    };
  }, [localStream, isAudioActive]);

  // Monitor LiveKit active speakers
  useEffect(() => {
    if (!livekitRoom) return;

    const handleActiveSpeakersChanged = (speakers) => {
      const speakerMap = {};
      speakers.forEach(speaker => {
        speakerMap[speaker.identity] = {
          isSpeaking: speaker.isSpeaking,
          audioLevel: speaker.audioLevel,
          lastUpdate: Date.now()
        };
      });
      setRemoteSpeakers(speakerMap);
    };

    livekitRoom.on('activeSpeakersChanged', handleActiveSpeakersChanged);

    return () => {
      livekitRoom.off('activeSpeakersChanged', handleActiveSpeakersChanged);
    };
  }, [livekitRoom]);

  // Monitor track publications
  useEffect(() => {
    if (!livekitRoom) return;

    const updateTrackPublications = () => {
      const publications = [];
      
      // Local participant publications
      if (livekitRoom.localParticipant) {
        const localPubs = Array.from(livekitRoom.localParticipant.audioTrackPublications.values());
        localPubs.forEach(pub => {
          publications.push({
            participantIdentity: livekitRoom.localParticipant.identity,
            isLocal: true,
            trackSid: pub.trackSid,
            source: pub.source,
            isMuted: pub.isMuted,
            isEnabled: pub.track?.enabled || false,
            isSubscribed: true, // Local tracks are always "subscribed"
            kind: pub.kind,
          });
        });
      }

      // Remote participants publications
      livekitRoom.remoteParticipants.forEach(participant => {
        const remotePubs = Array.from(participant.audioTrackPublications.values());
        remotePubs.forEach(pub => {
          publications.push({
            participantIdentity: participant.identity,
            isLocal: false,
            trackSid: pub.trackSid,
            source: pub.source,
            isMuted: pub.isMuted,
            isEnabled: pub.track?.enabled || false,
            isSubscribed: pub.isSubscribed,
            kind: pub.kind,
          });
        });
      });

      setTrackPublications(publications);
    };

    updateTrackPublications();

    // Update when tracks change
    const handleTrackPublished = () => updateTrackPublications();
    const handleTrackUnpublished = () => updateTrackPublications();
    const handleTrackSubscribed = () => updateTrackPublications();
    const handleTrackUnsubscribed = () => updateTrackPublications();

    livekitRoom.on('trackPublished', handleTrackPublished);
    livekitRoom.on('trackUnpublished', handleTrackUnpublished);
    livekitRoom.on('trackSubscribed', handleTrackSubscribed);
    livekitRoom.on('trackUnsubscribed', handleTrackUnsubscribed);

    return () => {
      livekitRoom.off('trackPublished', handleTrackPublished);
      livekitRoom.off('trackUnpublished', handleTrackUnpublished);
      livekitRoom.off('trackSubscribed', handleTrackSubscribed);
      livekitRoom.off('trackUnsubscribed', handleTrackUnsubscribed);
    };
  }, [livekitRoom]);

  // Get expected recipients
  const expectedRecipients = getAudioRecipients ? getAudioRecipients() : [];

  // Parse user ID from participant identity (format: "user-123")
  const getUserIdFromIdentity = (identity) => {
    const match = identity.match(/user-(\d+)/);
    return match ? parseInt(match[1]) : null;
  };

  // Get row from seat ID
  const getRowFromSeat = (seatId) => {
    if (!seatId) return null;
    if (seatId === 145) return 'host';
    return Math.ceil(seatId / 18); // 18 seats per row
  };

  if (!showPanel) {
    return (
      <button
        onClick={() => setShowPanel(true)}
        className="fixed top-4 right-4 z-50 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700"
      >
        Show Audio Debug Panel
      </button>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white p-4 rounded-lg shadow-2xl max-w-md max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
        <h2 className="text-lg font-bold">🔍 Audio Debug Panel</h2>
        <button
          onClick={() => setShowPanel(false)}
          className="text-gray-400 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* 1. Local User Info */}
      <div className="mb-4 p-3 bg-gray-800 rounded">
        <h3 className="font-bold text-sm mb-2 text-blue-400">📍 Local User</h3>
        <div className="text-xs space-y-1">
          <div><span className="text-gray-400">User:</span> {currentUser?.username || 'Unknown'} (ID: {currentUser?.id})</div>
          <div><span className="text-gray-400">Seat:</span> #{userSeat} (Row {getRowFromSeat(userSeat)})</div>
          <div><span className="text-gray-400">Role:</span> {isHost ? '👨‍🏫 Host' : hasHostApproval ? '📢 Approved Speaker' : '🎓 Student'}</div>
          <div>
            <span className="text-gray-400">Mic Status:</span>{' '}
            {isAudioActive ? (
              <span className="text-green-400">✅ UNMUTED</span>
            ) : (
              <span className="text-red-400">🔇 MUTED</span>
            )}
          </div>
          <div>
            <span className="text-gray-400">Audio Level:</span>{' '}
            <span className={localAudioLevel > 30 ? 'text-green-400' : 'text-gray-500'}>
              {localAudioLevel.toFixed(0)} / 255
            </span>
            <div className="w-full bg-gray-700 h-2 rounded mt-1">
              <div
                className="bg-green-500 h-2 rounded transition-all"
                style={{ width: `${(localAudioLevel / 255) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Expected Recipients */}
      <div className="mb-4 p-3 bg-gray-800 rounded">
        <h3 className="font-bold text-sm mb-2 text-yellow-400">🎯 Expected Recipients</h3>
        <div className="text-xs">
          <div className="mb-1">
            <span className="text-gray-400">Broadcasting to:</span>{' '}
            {expectedRecipients.length === 0 ? (
              <span className="text-red-400">None (audio inactive or no recipients)</span>
            ) : isHost ? (
              <span className="text-green-400">ALL {expectedRecipients.length} students</span>
            ) : hasHostApproval ? (
              <span className="text-green-400">ALL {expectedRecipients.length} users (approved)</span>
            ) : (
              <span className="text-blue-400">Row only ({expectedRecipients.length} users)</span>
            )}
          </div>
          {expectedRecipients.length > 0 && (
            <div className="mt-2 max-h-20 overflow-y-auto text-[10px] text-gray-400">
              User IDs: {expectedRecipients.join(', ')}
            </div>
          )}
        </div>
      </div>

      {/* 3. Track Publications */}
      <div className="mb-4 p-3 bg-gray-800 rounded">
        <h3 className="font-bold text-sm mb-2 text-purple-400">📡 LiveKit Track Publications</h3>
        {trackPublications.length === 0 ? (
          <div className="text-xs text-gray-500">No audio tracks published yet</div>
        ) : (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {trackPublications.map((pub, idx) => {
              const userId = getUserIdFromIdentity(pub.participantIdentity);
              const seatId = userSeats[userId];
              const row = getRowFromSeat(seatId);
              
              return (
                <div key={idx} className="text-[10px] border-l-2 border-purple-500 pl-2 py-1">
                  <div className="font-semibold">
                    {pub.isLocal ? '🟢 YOU' : `🔵 User ${userId}`} (Seat #{seatId}, Row {row})
                  </div>
                  <div className="text-gray-400 mt-1 space-y-0.5">
                    <div>Track SID: {pub.trackSid?.substring(0, 12)}...</div>
                    <div>
                      Server Muted: <span className={pub.isMuted ? 'text-red-400 font-bold' : 'text-green-400 font-bold'}>
                        {pub.isMuted ? '🔇 YES (MUTED)' : '🔊 NO (UNMUTED)'}
                      </span>
                    </div>
                    <div>
                      Track.enabled: <span className={pub.isEnabled ? 'text-green-400' : 'text-red-400'}>
                        {pub.isEnabled ? 'true ✅' : 'false ❌'}
                      </span>
                    </div>
                    {!pub.isLocal && (
                      <div>
                        Subscribed: <span className={pub.isSubscribed ? 'text-green-400' : 'text-gray-500'}>
                          {pub.isSubscribed ? 'YES ✅' : 'NO ❌'}
                        </span>
                      </div>
                    )}
                    {/* ✅ MUTE FIX: Show sync status */}
                    {pub.isLocal && (
                      <div className="pt-1 border-t border-gray-600 mt-1">
                        <span className={pub.isMuted === !pub.isEnabled ? 'text-green-400' : 'text-yellow-400'}>
                          {pub.isMuted === !pub.isEnabled 
                            ? '✅ Synced (isMuted matches !track.enabled)' 
                            : '⚠️ Out of sync!'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Active Speakers (LiveKit Detection) */}
      <div className="mb-4 p-3 bg-gray-800 rounded">
        <h3 className="font-bold text-sm mb-2 text-green-400">🎤 Active Speakers (LiveKit)</h3>
        {Object.keys(remoteSpeakers).length === 0 ? (
          <div className="text-xs text-gray-500">No active speakers detected</div>
        ) : (
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {Object.entries(remoteSpeakers).map(([identity, data]) => {
              const userId = getUserIdFromIdentity(identity);
              const seatId = userSeats[userId];
              const row = getRowFromSeat(seatId);
              
              return (
                <div key={identity} className="text-[10px] border-l-2 border-green-500 pl-2 py-1">
                  <div className="font-semibold">
                    🗣️ User {userId} (Seat #{seatId}, Row {row})
                  </div>
                  <div className="text-gray-400 mt-1">
                    <div>Audio Level: {(data.audioLevel * 100).toFixed(0)}%</div>
                    <div className="w-full bg-gray-700 h-1 rounded mt-0.5">
                      <div
                        className="bg-green-500 h-1 rounded transition-all"
                        style={{ width: `${data.audioLevel * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Remote Audio States (WebSocket) */}
      <div className="p-3 bg-gray-800 rounded">
        <h3 className="font-bold text-sm mb-2 text-orange-400">📻 Remote Audio States (WebSocket)</h3>
        {Object.keys(remoteAudioStates).length === 0 ? (
          <div className="text-xs text-gray-500">No remote audio states received</div>
        ) : (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {Object.entries(remoteAudioStates).map(([userId, isActive]) => {
              const seatId = userSeats[userId];
              const row = getRowFromSeat(seatId);
              
              return (
                <div key={userId} className="text-[10px] flex items-center justify-between py-1 border-b border-gray-700">
                  <span>
                    User {userId} (Seat #{seatId}, Row {row})
                  </span>
                  <span className={isActive ? 'text-green-400' : 'text-gray-500'}>
                    {isActive ? '🔊 Speaking' : '🔇 Muted'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Refresh Instructions */}
      <div className="mt-4 pt-3 border-t border-gray-700 text-[10px] text-gray-500">
        💡 This panel updates in real-time. Toggle your mic to see changes.
      </div>
    </div>
  );
}
