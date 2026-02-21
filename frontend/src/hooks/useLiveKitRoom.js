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

  const connect = useCallback(async () => {
    // Guard: Already connected or connecting
    if (roomRef.current?.state === 'connected' || isConnectingRef.current) {
      logger.debug('⏸️ [LiveKit] Connection attempt blocked (already connected or connecting)');
      return;
    }
    
    isConnectingRef.current = true;
    
    try {
      console.log('📱 [LiveKit MOBILE DEBUG] ========== CONNECTION START ==========');
      console.log('📱 [LiveKit MOBILE DEBUG] Current URL:', window.location.href);
      console.log('📱 [LiveKit MOBILE DEBUG] Current origin:', window.location.origin);
      console.log('📱 [LiveKit MOBILE DEBUG] User agent:', navigator.userAgent);
      console.log('📱 [LiveKit MOBILE DEBUG] Network info:', navigator.connection?.effectiveType || 'unknown');
      
      logger.debug('🔗 [LiveKit] Fetching token for room:', roomId);
      
      // ✅ Generate unique tab ID for this browser tab (prevents identity collision)
      let tabId = sessionStorage.getItem('livekit_tab_id');
      if (!tabId) {
        tabId = crypto.randomUUID().substring(0, 8);
        sessionStorage.setItem('livekit_tab_id', tabId);
        logger.debug('🆔 [LiveKit] Generated new tab ID:', tabId);
      } else {
        logger.debug('🆔 [LiveKit] Using existing tab ID:', tabId);
      }
      
      // ✅ Dynamic backend URL detection
      // - Localhost: Use :8080 (backend port, not :5173 frontend)
      // - Tunnel/External: Use window.location.origin (already correct domain)
      let backendUrl;
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        backendUrl = 'http://localhost:8080';
        console.log('🏠 [LiveKit MOBILE DEBUG] Localhost detected - using backend port 8080');
      } else {
        backendUrl = window.location.origin;
        console.log('🌍 [LiveKit MOBILE DEBUG] External request - using origin:', backendUrl);
      }
      
      const tokenUrl = `${backendUrl}/api/rooms/${roomId}/livekit-token?tab_id=${tabId}`;
      
      console.log('📱 [LiveKit MOBILE DEBUG] Backend URL:', backendUrl);
      console.log('📱 [LiveKit MOBILE DEBUG] Token URL (DYNAMIC):', tokenUrl);
      
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
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 100)}`);
      }

      const responseData = await res.json();
      console.log('📱 [LiveKit MOBILE DEBUG] Token response received:', {
        hasToken: !!responseData.token,
        tokenLength: responseData.token?.length,
        livekitUrl: responseData.url,
        urlIsLocalhost: responseData.url?.includes('localhost'),
        urlIsAccessible: responseData.url?.startsWith('http'),
      });
      console.log('🚨 [LiveKit MOBILE DEBUG] LiveKit URL:', responseData.url);
      console.log('🚨 [LiveKit MOBILE DEBUG] ⚠️ If URL is localhost, mobile CANNOT connect!');
      
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

      // 📱 Add ICE connection state monitoring for mobile debugging
      newRoom.engine.on('connectionstatechange', (state) => {
        console.log('📱 [LiveKit ICE] Connection state changed:', state);
      });
      
      newRoom.engine.on('iceconnectionstatechange', (state) => {
        console.log('📱 [LiveKit ICE] ICE connection state:', state);
        if (state === 'failed' || state === 'disconnected') {
          console.error('🚨 [LiveKit ICE] Connection failed! Check if LiveKit server is reachable from mobile.');
        }
      });
      
      newRoom.engine.on('icegatheringstatechange', (state) => {
        console.log('📱 [LiveKit ICE] ICE gathering state:', state);
      });
      
      newRoom.engine.on('icecandidate', (candidate) => {
        if (candidate && candidate.candidate) {
          const parsedCandidate = {
            type: candidate.type,
            protocol: candidate.protocol,
            address: candidate.address,
            port: candidate.port,
            isLocalhost: candidate.address?.includes('127.0.0.1') || candidate.address?.includes('localhost'),
            isPrivateIP: candidate.address?.match(/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/),
            rawCandidate: candidate.candidate
          };
          console.log('📱 [LiveKit ICE] Candidate:', parsedCandidate);
          
          if (parsedCandidate.isLocalhost) {
            console.warn('⚠️ [LiveKit ICE] Localhost candidate detected - WebRTC will fail from mobile/remote!');
            console.warn('⚠️ [LiveKit ICE] Solution: Use tunnel (Cloudflare/localtunnel) or deploy LiveKit to cloud');
          }
        }
      });
      
      // Add signaling state monitoring
      newRoom.engine.on('signalingstatechange', (state) => {
        console.log('📱 [LiveKit SIGNAL] Signaling state:', state);
        if (state === 'closed') {
          console.error('🚨 [LiveKit SIGNAL] Signaling closed - connection failed!');
        }
      });
      
      // Monitor peer connection errors
      newRoom.engine.on('error', (error) => {
        console.error('🚨 [LiveKit ENGINE] Engine error:', {
          name: error.name,
          message: error.message,
          code: error.code,
          stack: error.stack?.split('\n').slice(0, 3)
        });
      });

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
      logger.debug('🔗 [LiveKit] Token preview:', token.substring(0, 50) + '...');
      console.log('📱 [LiveKit MOBILE DEBUG] About to connect...');
      console.log('📱 [LiveKit MOBILE DEBUG] LiveKit server URL:', url);
      console.log('📱 [LiveKit MOBILE DEBUG] Expected WebSocket:', url.replace('http', 'ws'));
      console.log('📱 [LiveKit MOBILE DEBUG] Expected WebRTC ports: 50000-50100 (UDP)');
      logger.debug('🔗 [LiveKit DEBUG] About to call room.connect()...');
      logger.debug('🔗 [LiveKit DEBUG] Connect options:', {
        autoSubscribe: autoSubscribe,  // ✅ Conditional: false for lecture halls (selective subscription), true for others
        publishDefaults: { audioBitrate: 96000 }
      });
      
      const connectStartTime = Date.now();
      console.log('🔗 [LiveKit DEBUG] Calling newRoom.connect() with:', { url, autoSubscribe });
      console.log('🚨 [LiveKit CRITICAL] URL check:', {
        url,
        isLocalhost: url.includes('localhost') || url.includes('127.0.0.1'),
        isMobileEmulator: /Mobile|Android/i.test(navigator.userAgent),
        willLikelyFail: (url.includes('localhost') || url.includes('127.0.0.1')) && /Mobile|Android/i.test(navigator.userAgent),
        reason: 'WebRTC cannot establish peer connection to localhost from mobile devices'
      });
      
      if ((url.includes('localhost') || url.includes('127.0.0.1')) && /Mobile|Android/i.test(navigator.userAgent)) {
        console.error('❌ [LiveKit] CONFIGURATION ERROR: Cannot connect to localhost LiveKit from mobile device!');
        console.error('❌ [LiveKit] Current URL:', url);
        console.error('❌ [LiveKit] User Agent:', navigator.userAgent);
        console.error('❌ [LiveKit] SOLUTIONS:');
        console.error('   1. Use Cloudflare Tunnel for both frontend AND LiveKit');
        console.error('   2. Deploy LiveKit to cloud (LiveKit Cloud, AWS, etc.)');
        console.error('   3. Test on desktop browser (not mobile emulator)');
      }
      
      await newRoom.connect(url, token, {
        autoSubscribe: autoSubscribe,  // ✅ Conditional: false for lecture halls (selective subscription), true for others
        dynacast: true, // 🎯 Adaptive streaming - only encode layers being consumed
        publishDefaults: {
          audioBitrate: 96000,
        },
      });
      const connectDuration = Date.now() - connectStartTime;
      
      console.log(`✅ [LiveKit] Connection established (took ${connectDuration}ms, waiting for Connected event)`);
      console.log('📱 [LiveKit MOBILE DEBUG] ========== CONNECTION SUCCESS ==========');
      console.log('📱 [LiveKit MOBILE DEBUG] Peer connection state:', newRoom.engine?.pcManager?.publisher?.pc?.connectionState || 'unknown');
      console.log('📱 [LiveKit MOBILE DEBUG] ICE connection state:', newRoom.engine?.pcManager?.publisher?.pc?.iceConnectionState || 'unknown');
      
    } catch (err) {
      console.error('❌ [LiveKit] Connection failed:', err);
      console.error('📱 [LiveKit MOBILE DEBUG] ========== CONNECTION FAILED ==========');
      console.error('📱 [LiveKit MOBILE DEBUG] Error type:', err.name);
      console.error('📱 [LiveKit MOBILE DEBUG] Error message:', err.message);
      console.error('📱 [LiveKit MOBILE DEBUG] Error code:', err.code);
      console.error('📱 [LiveKit MOBILE DEBUG] Full error:', err);
      
      // Check for common mobile connection issues
      if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        console.error('🚨 [LiveKit MOBILE DEBUG] NETWORK ERROR - Cannot reach backend or LiveKit server!');
        console.error('🚨 [LiveKit MOBILE DEBUG] Check:');
        console.error('   1. Is backend accessible from mobile? (should use tunnel URL, not localhost)');
        console.error('   2. Is LiveKit server accessible from mobile network?');
        console.error('   3. Are WebRTC ports (50000-50100) open?');
      }
      
      if (err.message?.includes('timeout') || err.message?.includes('Timeout')) {
        console.error('🚨 [LiveKit MOBILE DEBUG] TIMEOUT - LiveKit WebRTC connection timed out!');
        console.error('🚨 [LiveKit MOBILE DEBUG] This usually means:');
        console.error('   1. LiveKit server is not reachable from mobile network');
        console.error('   2. ICE candidates are using private IPs (localhost/192.168.x.x)');
        console.error('   3. No TURN server configured for mobile networks');
      }
      
      console.error('❌ [LiveKit] Error details:', {
        name: err.name,
        message: err.message,
        code: err.code,
        cause: err.cause,
        stack: err.stack?.split('\n').slice(0, 5)
      });
      console.error('❌ [LiveKit] Full error object:', err);
      setError(err.message || 'Connection failed');
    } finally {
      isConnectingRef.current = false;
      console.log('🏁 [LiveKit DEBUG] Connect function finished. isConnectingRef now:', false);
    }
  }, [roomId]); // Only re-create if roomId changes

  const disconnect = useCallback(() => {
    console.log('🔌 [LiveKit] Disconnect called');
    if (roomRef.current) {
      console.log('🔌 [LiveKit] Disconnecting from room...');
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    isConnectingRef.current = false;
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