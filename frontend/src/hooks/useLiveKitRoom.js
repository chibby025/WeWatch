// frontend/src/hooks/useLiveKitRoom.js
import { useState, useEffect, useRef, useCallback } from 'react';
import { Room, RoomEvent } from 'livekit-client';
import logger from '../utils/logger';

export default function useLiveKitRoom(roomId, currentUser, autoSubscribe = true) {
  const [room, setRoom] = useState(null);
  const [localParticipant, setLocalParticipant] = useState(null);
  const [remoteParticipants, setRemoteParticipants] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const roomRef = useRef(null);
  const isConnectingRef = useRef(false); // Prevent duplicate connection attempts
  const retryCountRef = useRef(0); // Track retry attempts for 403 errors
  const retryTimeoutRef = useRef(null); // Cleanup retry timeouts
  const reconnectCountRef = useRef(0); // Track unexpected-disconnect reconnect attempts

  const connect = useCallback(async () => {
    // Guard: Already connected or connecting
    if (roomRef.current?.state === 'connected' || isConnectingRef.current) {
      logger.debug('⏸️ [LiveKit] Connection attempt blocked (already connected or connecting)');
      return;
    }
    
    isConnectingRef.current = true;
    
    try {
      logger.debug('🔗 [LiveKit] Fetching token for room:', roomId);

      // ✅ Generate unique tab ID for this browser tab (prevents identity collision)
      let tabId = sessionStorage.getItem('livekit_tab_id');
      if (!tabId) {
        tabId = crypto.randomUUID().substring(0, 8);
        sessionStorage.setItem('livekit_tab_id', tabId);
      }

      const backendUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
      const tokenUrl = `${backendUrl}/api/rooms/${roomId}/livekit-token?tab_id=${tabId}`;
      
      logger.debug('🌐 [LiveKit DEBUG] About to fetch:', tokenUrl);
      logger.debug('🌐 [LiveKit DEBUG] Fetch config:', {
        method: 'GET',
        credentials: 'include',
        hasHeaders: true
      });

      const fetchStartTime = Date.now();
      logger.debug('⏱️ [LiveKit DEBUG] Starting fetch at:', new Date().toISOString());
      
      const res = await fetch(tokenUrl, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const fetchDuration = Date.now() - fetchStartTime;
      logger.debug(`⏱️ [LiveKit DEBUG] Fetch completed in ${fetchDuration}ms`);

      logger.debug('📊 [LiveKit DEBUG] Response received:', {
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
        headers: {
          contentType: res.headers.get('content-type'),
          contentLength: res.headers.get('content-length')
        }
      });

      if (!res.ok) {
        const text = await res.text();
        logger.error('❌ [LiveKit] Token fetch failed:', res.status, text.substring(0, 200));
        
        // 🔄 RETRY LOGIC: Handle 403 errors (session membership not ready yet)
        if (res.status === 403 && retryCountRef.current < 3) {
          retryCountRef.current += 1;
          const retryDelay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 4000); // 1s, 2s, 4s
          console.log(`🔄 [LiveKit] 403 error - session membership not ready. Retry ${retryCountRef.current}/3 in ${retryDelay}ms...`);
          console.log('   This can happen if LiveKit token is requested before WebSocket completes session handshake');
          
          retryTimeoutRef.current = setTimeout(() => {
            console.log(`🔄 [LiveKit] Retrying connection attempt ${retryCountRef.current}/3...`);
            isConnectingRef.current = false; // Reset flag to allow retry
            connect(); // Recursive retry
          }, retryDelay);
          
          return; // Exit early, retry will happen after delay
        }
        
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 100)}`);
      }

      const responseData = await res.json();
      
      logger.debug('📦 [LiveKit DEBUG] Response data:', {
        hasToken: !!responseData.token,
        tokenLength: responseData.token?.length,
        tokenPreview: responseData.token?.substring(0, 50),
        url: responseData.url,
        urlValid: responseData.url?.startsWith('http'),
        fullResponse: responseData
      });

      const { token, url } = responseData;
      logger.info('🎫 [LiveKit] Token received. URL:', url);

      const newRoom = new Room();
      roomRef.current = newRoom;
      setRoom(newRoom);

      newRoom
        .on(RoomEvent.Connected, () => {
          logger.info('✅ [LiveKit] Connected to room', roomId);
          logger.debug('✅ [LiveKit] Room name:', newRoom.name);
          logger.debug('✅ [LiveKit] Room SID:', newRoom.sid || 'not yet available');
          logger.debug('✅ [LiveKit] Local participant SID:', newRoom.localParticipant.sid);
          logger.debug('✅ [LiveKit] Local participant identity:', newRoom.localParticipant.identity);
          setIsConnected(true);
          setLocalParticipant(newRoom.localParticipant);
          
          // Initialize remoteParticipants with already-connected participants
          const existingParticipants = Array.from(newRoom.remoteParticipants.values());
          logger.debug('👥 [LiveKit] Found existing participants:', existingParticipants.length);
          setRemoteParticipants(existingParticipants);
        })
        .on(RoomEvent.Disconnected, (reason) => {
          logger.info('🔌 LiveKit: Disconnected', reason);
          setIsConnected(false);

          // Auto-reconnect on unexpected disconnection, capped at 5 attempts with exponential backoff
          if (reason !== 'USER_INITIATED') {
            const MAX_RECONNECTS = 5;
            if (reconnectCountRef.current >= MAX_RECONNECTS) {
              console.error(`❌ LiveKit: Max reconnect attempts (${MAX_RECONNECTS}) reached — giving up`);
              setError('Video connection lost. Please refresh the page to rejoin.');
              reconnectCountRef.current = 0;
              return;
            }
            reconnectCountRef.current += 1;
            const delay = Math.min(1000 * Math.pow(2, reconnectCountRef.current - 1), 16000); // 2s, 4s, 8s, 16s, 16s
            console.log(`🔄 LiveKit: Unexpected disconnection — reconnect attempt ${reconnectCountRef.current}/${MAX_RECONNECTS} in ${delay}ms`);
            setTimeout(() => {
              if (roomRef.current?.state === 'disconnected') {
                connect();
              }
            }, delay);
          } else {
            reconnectCountRef.current = 0;
          }
        })
        .on(RoomEvent.ParticipantConnected, (participant) => {
          console.log('👤 LiveKit: Participant connected', participant.identity);
          // Get fresh participant list from room
          setRemoteParticipants(Array.from(newRoom.remoteParticipants.values()));
        })
        .on(RoomEvent.ParticipantDisconnected, (participant) => {
          console.log('👋 LiveKit: Participant disconnected', participant.identity);
          // Get fresh participant list from room
          setRemoteParticipants(Array.from(newRoom.remoteParticipants.values()));
        })
        .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          console.log('\n🟢 [LiveKit EVENT] TrackSubscribed received!');
          console.log('  Track source:', publication.source);
          console.log('  From participant:', participant.identity);
          console.log('  Track SID:', publication.trackSid);
          console.log('  This should trigger audio rendering\n');
          // Get fresh participant list from room to ensure audioTrackPublications Map is updated
          const freshParticipants = Array.from(newRoom.remoteParticipants.values());
          setRemoteParticipants(freshParticipants);
        })
        .on(RoomEvent.TrackPublished, (publication, participant) => {
          logger.debug('\n🟡 [LiveKit EVENT] TrackPublished detected!');
          logger.debug('  Track source:', publication.source);
          logger.debug('  From participant:', participant.identity);
          logger.debug('  Track SID:', publication.trackSid);
          logger.debug('  Subscription logic should run now\n');
        })
        .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
          logger.debug('🔴 [LiveKit EVENT] TrackUnsubscribed:', publication.source, 'from', participant.identity);
          // Get fresh participant list from room
          setRemoteParticipants(Array.from(newRoom.remoteParticipants.values()));
        });

      logger.debug('🔗 [LiveKit] Connecting to:', url);

      const connectStartTime = Date.now();

      // Check if Data Saver mode is active
      const isDataSaver = localStorage.getItem('dataSaverMode') === 'true';
      
      await newRoom.connect(url, token, {
        autoSubscribe: autoSubscribe,  // ✅ Conditional: false for lecture halls (selective subscription), true for others
        dynacast: true, // 🎯 Adaptive streaming - only encode layers being consumed
        publishDefaults: {
          audioBitrate: 96000,
          videoEncoding: isDataSaver ? {
            maxBitrate: 800_000, // 800 Kbps for 480p
            maxFramerate: 24,
          } : undefined,
        },
        // 🚀 Cap incoming video quality when Data Saver is active
        videoCaptureDefaults: isDataSaver ? {
          resolution: {
            width: 854,
            height: 480,
            frameRate: 24,
          },
        } : undefined,
        // 🚀 OPTIMIZE: ICE configuration for faster connection
        rtcConfig: {
          iceTransportPolicy: 'all', // Use all available candidates (STUN + TURN)
          iceCandidatePoolSize: 10, // Pre-gather ICE candidates for faster connection
        },
      });
      const connectDuration = Date.now() - connectStartTime;
      
      logger.debug(`✅ [LiveKit] Connection established in ${connectDuration}ms`);

      // ✅ Reset retry counters on successful connection
      retryCountRef.current = 0;
      reconnectCountRef.current = 0;
      
    } catch (err) {
      console.error('❌ [LiveKit] Connection failed:', err.message, err);
      setError(err.message || 'Connection failed');
    } finally {
      isConnectingRef.current = false;
    }
  }, [roomId]); // Only re-create if roomId changes

  const disconnect = useCallback(() => {
    // Clear any pending retry timeouts
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (roomRef.current) {
      logger.debug('🔌 [LiveKit] Disconnecting from room');
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    isConnectingRef.current = false;
    retryCountRef.current = 0; // Reset retry counter
    setIsConnected(false);
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

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