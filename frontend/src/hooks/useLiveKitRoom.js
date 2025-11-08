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
      
      const res = await fetch(`http://localhost:8080/api/rooms/${roomId}/livekit-token`, {
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
        .on(RoomEvent.Disconnected, () => {
          console.log('🔌 LiveKit: Disconnected');
          setIsConnected(false);
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
      await newRoom.connect(url, token);
      console.log('✅ [LiveKit] Connection successful!');
      // ✅ NO getAudioContext() call
      
    } catch (err) {
      console.error('❌ LiveKit connection failed:', err);
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