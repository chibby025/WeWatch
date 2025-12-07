// frontend/src/hooks/useLiveKitRoom.js
import { useState, useEffect, useRef } from 'react';
import { Room, RoomEvent } from 'livekit-client';

export default function useLiveKitRoom(roomId, currentUser) {
  const [room, setRoom] = useState(null);
  const [localParticipant, setLocalParticipant] = useState(null);
  const [remoteParticipants, setRemoteParticipants] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const roomRef = useRef(null);

  const connect = async () => {
    try {
      console.log('🔗 [LiveKit] Fetching token for room:', roomId);
      
      // ✅ Generate unique tab ID for this browser tab (prevents identity collision)
      let tabId = sessionStorage.getItem('livekit_tab_id');
      if (!tabId) {
        tabId = crypto.randomUUID().substring(0, 8);
        sessionStorage.setItem('livekit_tab_id', tabId);
        console.log('🆔 [LiveKit] Generated new tab ID:', tabId);
      } else {
        console.log('🆔 [LiveKit] Using existing tab ID:', tabId);
      }
      
      const res = await fetch(`http://localhost:8080/api/rooms/${roomId}/livekit-token?tab_id=${tabId}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('❌ [LiveKit] Token fetch failed:', res.status, text.substring(0, 200));
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 100)}`);
      }

      const { token, url } = await res.json();
      console.log('🎫 [LiveKit] Token received. URL:', url);

      const newRoom = new Room();
      roomRef.current = newRoom;
      setRoom(newRoom);

      newRoom
        .on(RoomEvent.Connected, () => {
          console.log('✅ LiveKit: Connected to room', roomId);
          setIsConnected(true);
          setLocalParticipant(newRoom.localParticipant);
          
          // Initialize remoteParticipants with already-connected participants
          const existingParticipants = Array.from(newRoom.remoteParticipants.values());
          console.log('👥 [LiveKit] Found existing participants:', existingParticipants.length);
          setRemoteParticipants(existingParticipants);
        })
        .on(RoomEvent.Disconnected, (reason) => {
          console.log('🔌 LiveKit: Disconnected', reason);
          setIsConnected(false);
          
          // Auto-reconnect if disconnected unexpectedly (not by user action)
          if (reason !== 'USER_INITIATED') {
            console.log('🔄 LiveKit: Unexpected disconnection, attempting to reconnect in 2 seconds...');
            setTimeout(() => {
              if (roomRef.current?.state === 'disconnected') {
                console.log('🔄 LiveKit: Reconnecting...');
                connect();
              }
            }, 2000);
          }
        })
        .on(RoomEvent.ParticipantConnected, (participant) => {
          console.log('👤 LiveKit: Participant connected', participant.identity);
          setRemoteParticipants(prev => [...prev, participant]);
        })
        .on(RoomEvent.ParticipantDisconnected, (participant) => {
          console.log('👋 LiveKit: Participant disconnected', participant.identity);
          setRemoteParticipants(prev =>
            prev.filter(p => p.identity !== participant.identity)
          );
        })
        .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          console.log('📥 [useLiveKitRoom] Track subscribed:', publication.source, 'from', participant.identity);
          // Force remoteParticipants update to trigger useMemo recalculation
          setRemoteParticipants(prev => [...prev]);
        })
        .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
          console.log('📤 [useLiveKitRoom] Track unsubscribed:', publication.source, 'from', participant.identity);
          setRemoteParticipants(prev => [...prev]);
        });

      console.log('🔗 [LiveKit] Connecting to:', url);
      console.log('🔗 [LiveKit] Token preview:', token.substring(0, 50) + '...');
      
      await newRoom.connect(url, token, {
        autoSubscribe: true,
        publishDefaults: {
          audioBitrate: 96000,
        },
      });
      
      console.log('✅ [LiveKit] Connection successful!');
      console.log('✅ [LiveKit] Room SID:', newRoom.sid);
      console.log('✅ [LiveKit] Local participant:', newRoom.localParticipant.identity);
      // ✅ NO getAudioContext() call
      
    } catch (err) {
      console.error('❌ LiveKit connection failed:', err);
      console.error('❌ LiveKit error details:', {
        name: err.name,
        message: err.message,
        stack: err.stack?.split('\n').slice(0, 5)
      });
      setError(err.message || 'Connection failed');
    }
  };

  const disconnect = () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return {
    room,
    localParticipant,
    remoteParticipants,
    isConnected,
    error,
    connect,
    disconnect
  };
}