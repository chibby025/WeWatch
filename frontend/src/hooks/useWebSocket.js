// frontend/src/hooks/useWebSocket.js
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import logger from '../utils/logger';
import { verifySessionExists } from '../services/api';

// ✅ GLOBAL CONNECTION POOL: Prevents duplicate connections across component remounts
const activeConnections = new Map(); // Key: "roomId-sessionId", Value: { ws, refCount, subscribers }

export default function useWebSocket(roomId, wsToken = null, sessionId = null) {
  // Hook called with roomId, wsToken, sessionId
  
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]); // For text messages
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  
  const messageQueueRef = useRef([]);
  const onBinaryMessageRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const isConnectingRef = useRef(false); // ✅ Guard against duplicate connections
  const connectionKeyRef = useRef(null); // Track which connection pool entry we're using
  const cleanupTimerRef = useRef(null); // Delay cleanup for StrictMode remounts
  const pendingAcksRef = useRef(new Map()); // Track pending acknowledgment promises
  const componentIdRef = useRef(`component-${Date.now()}-${Math.random()}`); // Stable component identifier
  // Per-component direct message handler. Called synchronously in ws.onmessage BEFORE setMessages.
  // If it returns true the message is NOT added to React state for this subscriber — no re-render.
  const directHandlerRef = useRef(null);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_INTERVAL = 2000; // 2 seconds

  // Add buffer management state
  const [bufferFullness, setBufferFullness] = useState(0);
  const MAX_QUEUE_SIZE = 200; // Maximum number of messages to queue (increased for large screen-share flows)
  const MAX_BINARY_SIZE = 1024 * 1024 * 5; // 5MB maximum binary message size
  //const earlyBinaryBufferRef = useRef([]); // Buffer for binary messages received before handler is set
  // Add message tracking
  const messageStatsRef = useRef({
    lastSentTime: Date.now(),
    messagesSentInLastSecond: 0,
    totalMessagesSent: 0,
    queuedMessages: 0
  });

  // Add session status tracking
  const [sessionStatus, setSessionStatus] = useState({
    id: null,
    isActive: false,
    hostId: null,
    members: [],
    startTime: null,
    error: null,
    content_rating: 'G' // ✅ Default content rating
  });

  // ✅ CRITICAL FIX: Create stable setter references that don't change between renders
  const stableSetSocket = useCallback((value) => {
    setSocket(value);
  }, []);
  
  const stableSetIsConnected = useCallback((value) => {
    setIsConnected(value);
  }, []);
  
  const stableSetMessages = useCallback((value) => {
    setMessages(value);
  }, []);
  
  const stableSetSessionStatus = useCallback((value) => {
    setSessionStatus(value);
  }, []);

  const setBinaryMessageHandler = useCallback((handler) => {
    console.log("useWebSocket: Setting binary message handler:", !!handler);
    onBinaryMessageRef.current = handler;
    console.log("useWebSocket: Binary message handler set");
  }, []);

  const connectWebSocket = useCallback(() => {
    const attemptId = Date.now();
    
    console.log('🔍 [useWebSocket] connectWebSocket called with:', {
      roomId,
      roomIdType: typeof roomId,
      roomIdTruthy: !!roomId,
      sessionId,
      wsToken: wsToken ? 'present' : 'missing'
    });
    
    if (!roomId) {
      console.warn(`❌ [useWebSocket] Missing roomId — aborting connection`);
      return;
    }

    // ✅ Generate connection key for this room/session combination
    // ⚠️ CRITICAL: Include timestamp to prevent connection sharing across different users/tabs
    // Each browser tab should have its own WebSocket connection, even for the same room/session
    const tabId = sessionStorage.getItem('wewatch_tab_id') || `tab-${Date.now()}-${Math.random()}`;
    if (!sessionStorage.getItem('wewatch_tab_id')) {
      sessionStorage.setItem('wewatch_tab_id', tabId);
    }
    // ✅ CRITICAL: Add context (room/session) to prevent RoomPageNew and PositionCalculatorPage from interfering
    const connectionContext = sessionId ? 'session' : 'room';
    const connectionKey = `${roomId}-${sessionId || 'lobby'}-${connectionContext}-${tabId}`;
    connectionKeyRef.current = connectionKey;
    
    // ✅ CHECK CONNECTION POOL: Reuse existing connection if available
    if (activeConnections.has(connectionKey)) {
      const poolEntry = activeConnections.get(connectionKey);
      const existingWs = poolEntry.ws;
      
      // ✅ Reuse OPEN connections, and also CONNECTING ones under the same key (same
      // roomId+sessionId+tabId) — a CONNECTING entry found here is almost always this
      // same component's own in-flight attempt from a React StrictMode dev double-mount,
      // not a cross-tab zombie (tabId already scopes the key to this browser tab).
      // Treating CONNECTING as stale here used to delete the pool entry out from under
      // the in-flight socket's own onmessage closure, orphaning its subscriber list —
      // messages kept "delivering" to a subscriber whose setMessages no longer produced
      // a visible re-render, since the re-mounted effect bailed out via isConnectingRef
      // without ever registering a fresh subscriber.
      if (existingWs.readyState === WebSocket.OPEN || existingWs.readyState === WebSocket.CONNECTING) {
        console.log(`♻️ [useWebSocket] REUSING existing connection for ${connectionKey} (state: ${existingWs.readyState}, refCount: ${poolEntry.refCount} → ${poolEntry.refCount + 1})`);
        poolEntry.refCount++;
        
        // ✅ CRITICAL FIX: Check if this component is already subscribed before adding
        const componentId = componentIdRef.current;
        const existingSubscriber = Array.from(poolEntry.subscribers).find(sub => sub.componentId === componentId);
        
        if (!existingSubscriber) {
          // Subscribe to this connection's state with stable references
          poolEntry.subscribers.add({
            componentId,
            setSocket: stableSetSocket,
            setIsConnected: stableSetIsConnected,
            setMessages: stableSetMessages,
            setSessionStatus: stableSetSessionStatus,
            onBinaryMessageRef,
            directHandlerRef
          });
          console.log(`➕ [useWebSocket] Added subscriber for ${componentId} (total: ${poolEntry.subscribers.size})`);
        } else {
          console.log(`⏭️ [useWebSocket] Component ${componentId} already subscribed, skipping duplicate`);
        }
        
        stableSetSocket(existingWs);
        stableSetIsConnected(existingWs.readyState === WebSocket.OPEN);
        
        // Cancel any pending cleanup
        if (poolEntry.cleanupTimer) {
          clearTimeout(poolEntry.cleanupTimer);
          poolEntry.cleanupTimer = null;
          console.log(`⏸️ [useWebSocket] Cancelled pending cleanup for ${connectionKey}`);
        }
        
        return () => {
          // 🐛 FIX: Use delayed cleanup for reused connections to handle React re-renders
          // Schedule cleanup instead of executing immediately
          console.log(`🧹 [useWebSocket] Cleanup scheduled for subscriber ${componentId}`);
          
          setTimeout(() => {
            // Check if component re-subscribed (meaning it was just a re-render, not unmount)
            const currentEntry = activeConnections.get(connectionKey);
            if (!currentEntry) {
              console.log(`⏭️ [useWebSocket] Connection already removed for ${componentId}`);
              return;
            }
            
            const stillSubscribed = Array.from(currentEntry.subscribers).some(sub => sub.componentId === componentId);
            if (stillSubscribed) {
              console.log(`⏭️ [useWebSocket] Subscriber ${componentId} re-subscribed (was a re-render), keeping active`);
              return;
            }
            
            // Component actually unmounted - do cleanup
            poolEntry.refCount--;
            const subscribersArray = Array.from(poolEntry.subscribers);
            const subscriberToRemove = subscribersArray.find(sub => sub.componentId === componentId);
            if (subscriberToRemove) {
              poolEntry.subscribers.delete(subscriberToRemove);
              console.log(`➖ [useWebSocket] Removed subscriber ${componentId} (remaining: ${poolEntry.subscribers.size})`);
            }
            console.log(`🔻 [useWebSocket] Decreased refCount for ${connectionKey}: ${poolEntry.refCount + 1} → ${poolEntry.refCount}`);
          }, 50); // Small delay to detect re-renders
        };
      } else {
        // Existing connection is closed/closing - remove it and create new one
        console.log(`🗑️ [useWebSocket] Removing stale connection for ${connectionKey} (state: ${existingWs.readyState})`);
        activeConnections.delete(connectionKey);
      }
    }

    // ✅ Prevent duplicate connections
    if (isConnectingRef.current) {
      console.warn(`⚠️ [useWebSocket] Already connecting, skipping duplicate connection attempt`);
      return;
    }

    console.log(`📡 [useWebSocket] Creating NEW connection for ${connectionKey}...`);
    isConnectingRef.current = true;
    setIsReconnecting(true);
    
    const queryParams = [];
    // Read WS token fresh: sessionStorage (set by /api/auth/me response) →
    // prop (from AuthContext) → localStorage JWT (cross-origin Vercel fallback).
    const currentWsToken = sessionStorage.getItem('wewatch_ws_token')
      || wsToken
      || localStorage.getItem('wewatch_token');
    if (currentWsToken) {
      queryParams.push(`token=${encodeURIComponent(currentWsToken)}`);
    }
    if (sessionId) {
      queryParams.push(`session_id=${encodeURIComponent(sessionId)}`);
    }
    const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

    // ✅ Use backend URL from environment variable (Railway production URL)
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
    const apiUrl = new URL(apiBaseUrl);
    const protocol = apiUrl.protocol === 'https:' ? 'wss' : 'ws';
    const host = apiUrl.hostname;
    const port = apiUrl.port ? `:${apiUrl.port}` : '';
    const wsUrl = `${protocol}://${host}${port}/api/rooms/${roomId}/ws${queryString}`;
    
    console.log(`🔗 [useWebSocket] Connecting to: ${wsUrl}`);

    const ws = new WebSocket(wsUrl);
    // Ensure binary messages are delivered as ArrayBuffer so players can append directly to SourceBuffer
    try {
      ws.binaryType = 'arraybuffer';
      console.log('useWebSocket: set ws.binaryType = arraybuffer');
    } catch (e) {
      console.warn('useWebSocket: failed to set binaryType on ws', e);
    }
    
    // ✅ ADD TO CONNECTION POOL immediately
    const poolEntry = {
      ws,
      refCount: 1,
      subscribers: new Set([{
        componentId: componentIdRef.current,
        setSocket: stableSetSocket,
        setIsConnected: stableSetIsConnected,
        setMessages: stableSetMessages,
        setSessionStatus: stableSetSessionStatus,
        onBinaryMessageRef,
        directHandlerRef
      }]),
      cleanupTimer: null,
      connectionKey,
      isDisconnecting: false // ✅ Flag to prevent reconnection during intentional disconnect
    };
    activeConnections.set(connectionKey, poolEntry);
    console.log(`➕ [useWebSocket] Added connection to pool: ${connectionKey} (total: ${activeConnections.size})`);
    
    stableSetSocket(ws);

    ws.onopen = () => {
      console.log("useWebSocket: ✅ WebSocket connected to room:", roomId);
      
      // Update all subscribers
      poolEntry.subscribers.forEach(sub => {
        sub.setIsConnected(true);
      });
      
      stableSetIsConnected(true);
      setIsReconnecting(false);
      reconnectAttemptRef.current = 0;
      isConnectingRef.current = false; // ✅ Connection complete
      
      // Process queued messages with rate limiting
      const processQueue = () => {
        if (messageQueueRef.current.length > 0 && ws.readyState === WebSocket.OPEN) {
          const msg = messageQueueRef.current.shift();
          ws.send(msg instanceof Blob || msg instanceof ArrayBuffer ? msg : JSON.stringify(msg));
          messageStatsRef.current.totalMessagesSent++;
          messageStatsRef.current.messagesSentInLastSecond++;
          setBufferFullness((messageQueueRef.current.length / MAX_QUEUE_SIZE) * 100);
          
          // Schedule next message with delay if sending too fast
          const timeSinceLastSend = Date.now() - messageStatsRef.current.lastSentTime;
          const delay = messageStatsRef.current.messagesSentInLastSecond > 30 ? 50 : 0;
          setTimeout(processQueue, delay);
          
          // Reset messages per second counter every second
          if (timeSinceLastSend >= 1000) {
            messageStatsRef.current.messagesSentInLastSecond = 0;
            messageStatsRef.current.lastSentTime = Date.now();
          }
        }
      };
      
      processQueue();
    };

    ws.onmessage = (event) => {
      const now = new Date().toISOString();
      logger.debug(`[${now}] useWebSocket: 📡 Raw message received`);
      logger.debug(`[${now}] useWebSocket:   - Type:`, typeof event.data);
      logger.debug(`[${now}] useWebSocket:   - Size/Length:`, event.data.byteLength || event.data.size || event.data.length || 'N/A');
      logger.debug(`[${now}] useWebSocket:   - Constructor:`, event.data?.constructor?.name || 'N/A');

      if (typeof event.data === 'string') {
        const preview = event.data.length > 100 ? event.data.substring(0, 100) + '...' : event.data;
        logger.debug(`[${now}] useWebSocket: 📡 Text message received:`, preview);

        try {
          const message = JSON.parse(event.data);
          logger.debug(`[${now}] useWebSocket: ✅ Parsed JSON message:`, message.type, message);
          
          // 🔍 DEBUG: Log RAW JSON for session_status messages
          if (message.type === 'session_status') {
            console.log('🔍 [useWebSocket] RAW session_status JSON:', event.data);
            console.log('🔍 [useWebSocket] Parsed members array:', message.data?.members);
            if (message.data?.members && message.data.members.length > 0) {
              message.data.members.forEach((m, i) => {
                console.log(`🔍 [useWebSocket] Member ${i} RAW:`, JSON.stringify(m));
                console.log(`🔍 [useWebSocket] Member ${i} avatar_url:`, m.avatar_url);
                console.log(`🔍 [useWebSocket] Member ${i} ALL keys:`, Object.keys(m));
              });
            }
          }

          // Only log member-related messages
          const memberTypes = ['participant_join', 'participant_leave', 'session_member_joined', 'session_status'];
          if (memberTypes.includes(message.type)) {
            console.log(`🔍 [useWebSocket] ${message.type} → ${poolEntry.subscribers.size} subscribers`);
          }
          
          // Update all subscribers with the new message (cap at 500 as safety net).
          // If a subscriber's directHandlerRef returns true, the message is handled
          // directly without touching React state — no re-render for that subscriber.
          poolEntry.subscribers.forEach(sub => {
            if (sub.directHandlerRef?.current) {
              const intercepted = sub.directHandlerRef.current(message);
              if (intercepted) return; // skip setMessages for this subscriber
            }
            sub.setMessages(prev => {
              const next = [...prev, message];
              return next.length > 500 ? next.slice(-500) : next;
            });
          });

          // ✅ Handle leave_acknowledged early (before normal message processing)
          if (message.type === 'leave_acknowledged') {
            logger.debug(`[${now}] useWebSocket: ✅ Received leave_acknowledged`);
            const pending = pendingAcksRef.current.get('leave_session');
            if (pending) {
              clearTimeout(pending.timeout);
              pending.resolve();
              pendingAcksRef.current.delete('leave_session');
              console.log(`[${now}] useWebSocket: ✅ Resolved leave_session acknowledgment`);
            }
            return; // Don't process as normal message
          }

          // 🐛 DEBUG: Log ALL message types for diagnosis
          if (message.type === 'session_member_joined') {
            console.log(`🔍 [useWebSocket] session_member_joined received:`, {
              userId: message.data?.user_id,
              username: message.data?.username,
              sessionId: message.data?.session_id,
              timestamp: now
            });
          }

          // Handle session-specific messages
          if (message.type === 'session_status') {
            // 🐛 DEBUG: Log member count
            console.log(`🔍 [useWebSocket] session_status received:`, {
              memberCount: message.data?.member_count,
              membersLength: message.data?.members?.length,
              sessionId: message.data?.session_id,
              timestamp: now
            });
            
            logger.debug(`[${now}] useWebSocket: 🧾 Processing 'session_status'`);
            const data = message.data || {};
            logger.debug(`[${now}] useWebSocket:   - Raw session data:`, data);
            logger.debug(`[${now}] useWebSocket:   - Seating data:`, data.seating, '(type:', typeof data.seating, ')');
            logger.debug(`[${now}] useWebSocket:   - Mapped fields:`, {
              id: data.session_id || data.id || null,
              isActive: !!(data.session_id || data.id),
              hostId: data.host_id || data.hostId || null,
              members: data.members || [],
              seating: data.seating || {},
              startTime: data.started_at || data.start_time || null,
              error: data.error || null,
            });

            const sessionData = {
              id: data.session_id || data.id || null,
              isActive: !!(data.session_id || data.id),
              hostId: data.host_id || data.hostId || null,
              members: data.members || [],
              seating: data.seating || {},
              startTime: data.started_at || data.start_time || null,
              error: data.error || null,
              isPrivate: data.is_private || false,
              hideFromLobby: data.hide_from_lobby || false,
              content_rating: data.content_rating || 'G',
              currentMediaUrl: data.current_media_url || null,
              currentMediaType: data.current_media_type || null,
              sessionTitle: data.session_title || null,
              posterUrl: data.poster_url || null,
              currentPlaybackTime: data.current_playback_time || 0,
              playbackTimeUpdatedAt: data.playback_time_updated_at || null,
              currentDocUrl: data.current_doc_url || null,
              currentDocType: data.current_doc_type || null,
              currentDocPage: data.current_doc_page || 1,
              isDemoSession: data.is_demo_session || false,
            };
            
            // Update all subscribers
            poolEntry.subscribers.forEach(sub => {
              sub.setSessionStatus(sessionData);
            });
            
            // Update this component
            stableSetSessionStatus(sessionData);
          } else if (message.type === 'session_error') {
            console.log(`[${now}] useWebSocket: ❌ Received 'session_error':`, message.data?.message);
            const errorUpdate = prev => ({ ...prev, error: message.data?.message });
            poolEntry.subscribers.forEach(sub => {
              sub.setSessionStatus(errorUpdate);
            });
            stableSetSessionStatus(errorUpdate);
          } else if (message.type === 'session_member_update') {
            console.log(`[${now}] useWebSocket: 👥 Received 'session_member_update':`, message.data?.members);
            const memberUpdate = prev => ({ ...prev, members: message.data?.members || [] });
            poolEntry.subscribers.forEach(sub => {
              sub.setSessionStatus(memberUpdate);
            });
            stableSetSessionStatus(memberUpdate);
          } else if (message.type === 'theater_created') {
            console.log(`[${now}] useWebSocket: 🎭 Theater created:`, message.data);
            // Toast notification will be handled by component
          } else if (message.type === 'theater_assigned') {
            console.log(`[${now}] useWebSocket: 🎭 Theater assigned:`, message.data);
            // Component can display theater info
          } else if (message.type === 'friend_request_received') {
            console.log(`[${now}] useWebSocket: 👥 Friend request received:`, message.data);
            // Will be handled by components
          } else if (message.type === 'friend_request_accepted') {
            console.log(`[${now}] useWebSocket: 👥 Friend request accepted:`, message.data);
            // Will be handled by components
          }

          // Already added to messages above via poolEntry.subscribers.forEach

          if (message.type?.includes('screen_share')) {
            console.log(`[${now}] useWebSocket: 🖥️ Screen share control message:`, {
              type: message.type,
              userId: message.userId || message.user_id,
              timestamp: message.timestamp,
              data: message.data,
            });
          }
        } catch (e) {
          console.error(`[${now}] useWebSocket: 🐞 Failed to parse text message:`, e, event.data);
        }
      } else if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
        const size = event.data.byteLength || event.data.size;
        console.log(`[${now}] useWebSocket: 📡 Binary message received`);
        console.log(`[${now}] useWebSocket:   - Size: ${size} bytes`);
        console.log(`[${now}] useWebSocket:   - Type: ${event.data.constructor.name}`);
        console.log(`[${now}] useWebSocket:   - Is Blob:`, event.data instanceof Blob);
        console.log(`[${now}] useWebSocket:   - Is ArrayBuffer:`, event.data instanceof ArrayBuffer);

        if (size === 0) {
          console.warn(`[${now}] useWebSocket: ⚠️ Ignoring empty binary message`);
          return;
        }

        // Log first 32 bytes for debugging
        if (event.data instanceof ArrayBuffer) {
          const firstBytes = Array.from(new Uint8Array(event.data.slice(0, 32)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join(' ');
          console.log(`[${now}] useWebSocket: 🔍 First 32 bytes (hex): ${firstBytes}`);
          console.log(`[${now}] useWebSocket: 🔍 Looks like WebM?`, firstBytes.startsWith('1a45dfa3'));
        } else if (event.data instanceof Blob) {
          event.data.slice(0, 32).arrayBuffer().then(buf => {
            const firstBytes = Array.from(new Uint8Array(buf))
              .map(b => b.toString(16).padStart(2, '0'))
              .join(' ');
            console.log(`[${now}] useWebSocket: 🔍 First 32 bytes of Blob (hex): ${firstBytes}`);
          }).catch(err => {
            console.warn(`[${now}] useWebSocket: ⚠️ Failed to read Blob header for logging:`, err);
          });
        }

        // If the payload starts with '{' it is JSON accidentally sent as a binary
        // frame (e.g. an older backend using BroadcastToRoomBinary for game state).
        // Route it through the normal text-message pipeline so all subscribers see it.
        if (event.data instanceof ArrayBuffer && event.data.byteLength > 0) {
          const firstByte = new Uint8Array(event.data, 0, 1)[0];
          if (firstByte === 0x7b) { // '{'
            try {
              const message = JSON.parse(new TextDecoder().decode(event.data));
              console.log(`[${now}] useWebSocket: 🔄 Binary frame is JSON — re-routing to text pipeline (type: ${message.type})`);
              poolEntry.subscribers.forEach(sub => {
                if (sub.directHandlerRef?.current) {
                  const intercepted = sub.directHandlerRef.current(message);
                  if (intercepted) return;
                }
                sub.setMessages(prev => {
                  const next = [...prev, message];
                  return next.length > 500 ? next.slice(-500) : next;
                });
              });
              return; // Do not pass to binary handler
            } catch {
              // Not valid JSON — fall through to binary handler
            }
          }
        }

        // Actual binary data (video frames etc.)
        if (onBinaryMessageRef.current) {
          console.log(`[${now}] useWebSocket: ✅ Binary handler is READY — forwarding message`);
          onBinaryMessageRef.current(event.data);
        } else {
          console.warn(`[${now}] useWebSocket: ❌ NO binary handler — DROPPING message (not buffering)`);
          // EARLY BINARY BUFFERING REMOVED
        }
      } else {
        console.warn(`[${now}] useWebSocket: ❓ Unknown message type:`, typeof event.data, event.data);
      }
    };

    ws.onclose = (event) => {
      console.log(`useWebSocket: 🔌 WebSocket closed for ${connectionKey}. Code: ${event.code}, Reason: ${event.reason}, RefCount: ${poolEntry.refCount}, isDisconnecting: ${poolEntry.isDisconnecting}`);
      
      // ✅ CRITICAL: Check if this is an intentional disconnect (Phase 1 fix)
      if (poolEntry.isDisconnecting) {
        console.log('✅ [useWebSocket] Intentional disconnect - NOT reconnecting');
        // Update all subscribers
        poolEntry.subscribers.forEach(sub => {
          sub.setIsConnected(false);
        });
        setIsConnected(false);
        setIsReconnecting(false);
        return; // Exit early, no reconnection
      }
      
      // Update all subscribers
      poolEntry.subscribers.forEach(sub => {
        sub.setIsConnected(false);
      });
      
      stableSetIsConnected(false);
      isConnectingRef.current = false; // ✅ Allow reconnection
      
      // Clear message stats on disconnect
      messageStatsRef.current = {
        lastSentTime: Date.now(),
        messagesSentInLastSecond: 0,
        totalMessagesSent: 0,
        queuedMessages: messageQueueRef.current.length
      };

      // 🔍 DEBUG: Check reconnection conditions
      console.log(`🔍 [useWebSocket] onclose reconnect check: refCount=${poolEntry.refCount}, reconnectAttempts=${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS}`);
      
      // ✅ Only attempt reconnect if this connection still has subscribers
      if (poolEntry.refCount > 0 && reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
        setIsReconnecting(true);
        reconnectAttemptRef.current++;
        console.log(`useWebSocket: 🔄 Attempting reconnect ${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS} for ${connectionKey} in ${RECONNECT_INTERVAL}ms`);
        
        // Remove old connection from pool before reconnecting
        activeConnections.delete(connectionKey);
        
        // Jitter (0–1 s) prevents thundering herd when many clients disconnect simultaneously
        const jitter = Math.floor(Math.random() * 1000);
        setTimeout(connectWebSocket, RECONNECT_INTERVAL * reconnectAttemptRef.current + jitter);
      } else {
        setIsReconnecting(false);
        if (poolEntry.refCount === 0) {
          console.log(`useWebSocket: ℹ️ Connection closed with no subscribers - not reconnecting`);
        } else {
          console.error(`useWebSocket: ❌ Max reconnection attempts reached for ${connectionKey}`);
          
          // ✅ Verify if session still exists after max retries
          if (sessionId) {
            console.log(`🔍 [useWebSocket] Verifying if session ${sessionId} still exists...`);
            verifySessionExists(sessionId).then(({ exists }) => {
              if (!exists) {
                console.error(`❌ [useWebSocket] Session ${sessionId} no longer exists on backend`);
                
                // Notify all subscribers that session is dead
                poolEntry.subscribers.forEach(subscriber => {
                  subscriber.setSessionStatus(prev => ({
                    ...prev,
                    isActive: false,
                    error: 'Session has ended or no longer exists'
                  }));
                });
              } else {
                console.warn(`⚠️ [useWebSocket] Session exists but WebSocket connection failed`);
                
                // Notify subscribers of connection error
                poolEntry.subscribers.forEach(subscriber => {
                  subscriber.setSessionStatus(prev => ({
                    ...prev,
                    error: 'Connection error. Please refresh the page.'
                  }));
                });
              }
            }).catch(err => {
              console.error(`❌ [useWebSocket] Failed to verify session existence:`, err);
              // Assume session is dead on error
              poolEntry.subscribers.forEach(subscriber => {
                subscriber.setSessionStatus(prev => ({
                  ...prev,
                  isActive: false,
                  error: 'Connection lost. Session may have ended.'
                }));
              });
            });
          }
        }
        
        // Remove from pool
        activeConnections.delete(connectionKey);
        console.log(`🗑️ [useWebSocket] Removed connection from pool: ${connectionKey} (total: ${activeConnections.size})`);
      }
    };

    ws.onerror = (error) => {
      console.error("useWebSocket: 🐞 WebSocket error:", error);
      isConnectingRef.current = false; // ✅ Allow reconnection after error
      // Don't set isConnected to false here, let onclose handle the reconnection
    };

    // ✅ Return cleanup function for this specific connection
    return () => {
      if (!connectionKeyRef.current || !activeConnections.has(connectionKeyRef.current)) {
        return; // Already cleaned up
      }
      
      const poolEntry = activeConnections.get(connectionKeyRef.current);
      poolEntry.refCount--;
      
      console.log(`🔻 [useWebSocket] Cleanup called for ${connectionKeyRef.current} (refCount: ${poolEntry.refCount + 1} → ${poolEntry.refCount})`);
      
      // ⚠️ CRITICAL: Don't cleanup if WebSocket is still CONNECTING
      // During page load, rapid re-renders can cleanup while connection is being established
      if (poolEntry.ws.readyState === WebSocket.CONNECTING) {
        console.log(`⏸️ [useWebSocket] Skipping cleanup - WebSocket still CONNECTING`);
        return;
      }
      
      // ✅ DELAYED CLEANUP: Don't close immediately (React StrictMode remounts within ~50ms)
      if (poolEntry.refCount <= 0) {
        poolEntry.cleanupTimer = setTimeout(() => {
          if (activeConnections.has(connectionKeyRef.current)) {
            const entry = activeConnections.get(connectionKeyRef.current);
            if (entry.refCount <= 0) {
              console.log(`🗑️ [useWebSocket] Delayed cleanup executing for ${connectionKeyRef.current} - closing connection`);
              setIsReconnecting(false);
              reconnectAttemptRef.current = MAX_RECONNECT_ATTEMPTS;
              isConnectingRef.current = false;
              if (entry.ws.readyState === WebSocket.OPEN || entry.ws.readyState === WebSocket.CONNECTING) {
                entry.ws.close();
              }
              activeConnections.delete(connectionKeyRef.current);
              console.log(`➖ [useWebSocket] Removed ${connectionKeyRef.current} from pool (total: ${activeConnections.size})`);
            }
          }
        }, 200); // 200ms delay to handle StrictMode remounts
        
        console.log(`⏱️ [useWebSocket] Scheduled delayed cleanup for ${connectionKeyRef.current} (${poolEntry.cleanupTimer})`);
      }
    };
  }, [roomId, sessionId, wsToken, stableSetSocket, stableSetIsConnected, stableSetMessages, stableSetSessionStatus]); // ✅ Dependencies: include stable setters

  // Effect will run when: connectWebSocket, roomId, sessionId, or isConnected changes
  
  // ✅ REMOUNT TRACKING: Track dependency changes
  const prevDepsRef = useRef({ roomId: null, sessionId: null, isConnected: null });
  const wsEffectCountRef = useRef(0);
  
  // Main effect to initiate connection  
  useEffect(() => {
    const effectId = Date.now();
    wsEffectCountRef.current += 1;
    
    // 🔍 DEPENDENCY TRACKING: Log what triggered this effect
    const depsChanged = {
      roomId: roomId !== prevDepsRef.current.roomId,
      sessionId: sessionId !== prevDepsRef.current.sessionId,
      isConnected: isConnected !== prevDepsRef.current.isConnected,
      connectWebSocket: 'function' // Always new reference
    };
    
    const triggeredBy = Object.entries(depsChanged)
      .filter(([_, changed]) => changed === true)
      .map(([dep]) => dep);
    
    console.log('🔍 [useWebSocket] Effect TRIGGERED', {
      effectNumber: wsEffectCountRef.current,
      effectId,
      dependencies: {
        roomId: { prev: prevDepsRef.current.roomId, current: roomId },
        sessionId: { prev: prevDepsRef.current.sessionId, current: sessionId },
        isConnected: { prev: prevDepsRef.current.isConnected, current: isConnected }
      },
      triggeredBy,
      willReconnect: !socket || socket.readyState === WebSocket.CLOSED
    });
    
    // ⚠️ Suspicious: Effect triggered by isConnected change
    if (depsChanged.isConnected && wsEffectCountRef.current > 2) {
      console.warn('⚠️ [useWebSocket] Effect triggered by isConnected state change - potential reconnection loop!', {
        effectNumber: wsEffectCountRef.current,
        isConnected,
        socketState: socket?.readyState
      });
    }
    
    // Store current values for next comparison
    prevDepsRef.current = { roomId, sessionId, isConnected };
    
    // ⚠️ CRITICAL: Don't reconnect if already connected
    // Check both local socket state AND connection pool
    try {
      const tabId = sessionStorage.getItem('wewatch_tab_id');
      const connectionKey = `${roomId}-${sessionId || 'none'}-${tabId}`;
      const poolEntry = activeConnections.get(connectionKey);
      
      // If socket is CLOSED (3), we need to reconnect
      if (socket && socket.readyState === WebSocket.CLOSED) {
        console.log('🔄 [useWebSocket] Socket is CLOSED, will create new connection');
        // Clear the closed socket
        setSocket(null);
        setIsConnected(false);
        // Don't return early - fall through to create new connection
      } else if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
      }
      
      if (poolEntry?.ws) {
        if (poolEntry.ws.readyState === WebSocket.CLOSED) {
          console.log('🔄 [useWebSocket] Pool connection is CLOSED, removing from pool');
          activeConnections.delete(connectionKey);
          // Fall through to create new connection
        } else if (poolEntry.ws.readyState === WebSocket.OPEN || poolEntry.ws.readyState === WebSocket.CONNECTING) {
          // ✅ CRITICAL FIX: Re-subscribe to the pool connection
          // This ensures we receive messages even after effect cleanup/re-run
          const componentId = componentIdRef.current;
          const existingSubscriber = Array.from(poolEntry.subscribers).find(sub => sub.componentId === componentId);
          
          if (!existingSubscriber) {
            poolEntry.subscribers.add({
              componentId,
              setSocket: stableSetSocket,
              setIsConnected: stableSetIsConnected,
              setMessages: stableSetMessages,
              setSessionStatus: stableSetSessionStatus,
              onBinaryMessageRef
            });
            poolEntry.refCount++;
            console.log(`➕ [useWebSocket] Re-subscribed ${componentId} to existing connection (total subscribers: ${poolEntry.subscribers.size})`);
          }
          
          // Set local socket state to the pool connection if not already set
          if (!socket || socket !== poolEntry.ws) {
            stableSetSocket(poolEntry.ws);
            stableSetIsConnected(poolEntry.ws.readyState === WebSocket.OPEN);
          }
          
          // Return cleanup function to properly unsubscribe
          return () => {
            console.log(`🧹 [useWebSocket] Cleanup for re-subscribed connection ${componentId}`);
            poolEntry.refCount--;
            const subscriberToRemove = Array.from(poolEntry.subscribers).find(sub => sub.componentId === componentId);
            if (subscriberToRemove) {
              poolEntry.subscribers.delete(subscriberToRemove);
              console.log(`➖ [useWebSocket] Removed re-subscriber ${componentId} (remaining: ${poolEntry.subscribers.size})`);
            }
          };
        }
      }
      
      console.log('✅ [useWebSocket] No existing connection, creating new one...');
      reconnectAttemptRef.current = 0; // Reset reconnection attempts
      const cleanup = connectWebSocket();
      
      return () => {
        console.log(`🧹 [useWebSocket] Effect CLEANUP #${effectId} called`);
        if (cleanup) cleanup();
      };
    } catch (error) {
      console.error('❌ [useWebSocket] Error in effect:', error);
    }
  }, [connectWebSocket, roomId, sessionId]); // Removed isConnected to prevent reconnection loops

  // Main useEffect registration (verbose log removed)

  // sessionStatus changes are tracked internally

  // ✅ SIMPLIFIED sendMessage — AUTO-DETECTS TEXT vs BINARY
  const sendMessage = useCallback((message) => {
    logger.debug("[useWebSocket] sendMessage called with:", message, "Socket state:", socket ? socket.readyState : "N/A")
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      logger.warn("useWebSocket: Socket not open, queueing message:", message);
      if (messageQueueRef.current.length >= MAX_QUEUE_SIZE) {
        logger.error("useWebSocket: ❌ Message queue full, dropping message");
        return false;
      }
      messageQueueRef.current.push(message);
      logger.debug("[useWebSocket] Message queued. Current queue size:", messageQueueRef.current.length);
      setBufferFullness((messageQueueRef.current.length / MAX_QUEUE_SIZE) * 100);
      return false;
    }

    try {
      if (message instanceof Blob || message instanceof ArrayBuffer) {
        // → BINARY
        const size = message.size || message.byteLength;
        if (size > MAX_BINARY_SIZE) {
          logger.error("useWebSocket: ❌ Binary message too large:", size, "bytes");
          return false;
        }
        socket.send(message);
        logger.debug("useWebSocket: 📤 Sent as BINARY", { size });
        return true;
      } else {
        // → TEXT (JSON)
        const json = typeof message === 'string' ? message : JSON.stringify(message);
        socket.send(json);
        logger.debug("useWebSocket: 📤 Sent as TEXT", { preview: json.substring(0, 100) + (json.length > 100 ? '...' : '') });
        return true;
      }
    } catch (error) {
      logger.error("useWebSocket: 🐞 Error sending message:", error, message);
      messageQueueRef.current.push(message);
      setBufferFullness((messageQueueRef.current.length / MAX_QUEUE_SIZE) * 100);
      return false;
    }
  }, [socket]);

  // ✅ Wait for backend acknowledgment of a specific message type
  // Returns a Promise that resolves when ack is received or times out
  const waitForAcknowledgment = useCallback((messageType, timeoutMs = 2000) => {
    console.log(`⏳ [useWebSocket] Waiting for acknowledgment: ${messageType}`);
    
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        pendingAcksRef.current.delete(messageType);
        console.warn(`⚠️ [useWebSocket] Acknowledgment timeout for ${messageType}`);
        resolve(); // Resolve anyway to prevent blocking (graceful degradation)
      }, timeoutMs);
      
      // Store resolver
      pendingAcksRef.current.set(messageType, { resolve, reject, timeout });
    });
  }, []);
  
  // ✅ Force disconnect the WebSocket (for explicit cleanup before navigation)
  // Returns a Promise that resolves when the WebSocket is fully closed
  const disconnect = useCallback(() => {
    console.log('🚨 [useWebSocket] disconnect() CALLED - START');
    return new Promise((resolve) => {
      const key = connectionKeyRef.current;
      console.log(`🔍 [useWebSocket] disconnect check - key: ${key}, has connection: ${activeConnections.has(key)}`);
      
      if (!key || !activeConnections.has(key)) {
        console.log('⚠️ [useWebSocket] disconnect called but no active connection found');
        resolve();
        return;
      }
      
      const poolEntry = activeConnections.get(key);
      console.log(`🔌 [useWebSocket] Force disconnect called for ${key} (refCount: ${poolEntry.refCount})`);
      
      // ✅ CRITICAL: Set flags BEFORE closing socket to prevent race condition
      // This ensures onclose handler sees these values when it fires
      reconnectAttemptRef.current = MAX_RECONNECT_ATTEMPTS;
      poolEntry.refCount = 0;
      poolEntry.isDisconnecting = true; // ✅ NEW: Prevents onclose from reconnecting
      console.log(`🚫 [useWebSocket] Set disconnect flags: refCount=0, isDisconnecting=true, reconnectAttempts=${MAX_RECONNECT_ATTEMPTS}`);
      
      // Clear any pending cleanup timer
      if (poolEntry.cleanupTimer) {
        clearTimeout(poolEntry.cleanupTimer);
        poolEntry.cleanupTimer = null;
      }
      
      // ✅ CRITICAL: Remove from pool BEFORE closing socket
      // This prevents any race conditions with onclose handler
      activeConnections.delete(key);
      console.log(`🗑️ [useWebSocket] Removed connection from pool BEFORE close: ${key} (total: ${activeConnections.size})`);
      
      // Close the WebSocket immediately
      if (poolEntry.ws && (poolEntry.ws.readyState === WebSocket.OPEN || poolEntry.ws.readyState === WebSocket.CONNECTING)) {
        console.log(`🔌 [useWebSocket] Closing WebSocket for ${key}`);
        
        // Set up one-time close listener to resolve promise
        const handleClose = () => {
          console.log(`✅ [useWebSocket] WebSocket closed for ${key}`);
          poolEntry.ws.removeEventListener('close', handleClose);
          resolve();
        };
        
        poolEntry.ws.addEventListener('close', handleClose);
        poolEntry.ws.close(1000, 'User disconnected'); // Normal closure
        
        // Safety timeout in case close event never fires
        setTimeout(() => {
          poolEntry.ws.removeEventListener('close', handleClose);
          resolve();
        }, 500);
      } else {
        console.log(`⚠️ [useWebSocket] WebSocket already closed for ${key}`);
        resolve();
      }
      
      // Update all subscribers
      poolEntry.subscribers.forEach(sub => {
        sub.setIsConnected(false);
      });
      
      // Note: Already removed from pool before closing socket
      console.log(`✅ [useWebSocket] Disconnect complete for ${key}`);
    });
  }, []);

  // Clears the local messages array after a consumer has processed all pending messages.
  // Call this after the messages useEffect switch-block to keep memory near zero.
  // Functional slice, not a blind setMessages([]) reset: a message that arrived (and was
  // queued via the functional setMessages form) after the caller's snapshot was taken but
  // before this clear commits would otherwise be silently discarded — a direct [] reset
  // wins over an earlier-queued functional update in the same batch, dropping that message
  // before any render ever reflected it. Slicing off only what the caller actually processed
  // (by count) preserves anything appended after the snapshot.
  const clearMessages = useCallback((count) => setMessages(prev => prev.slice(count)), []);

  // ✅ Memoize sessionStatus to prevent unnecessary re-renders when content doesn't actually change
  const memoizedSessionStatus = useMemo(() => sessionStatus, [
    sessionStatus.id,
    sessionStatus.isActive,
    sessionStatus.hostId,
    JSON.stringify(sessionStatus.members), // Deep comparison for members array
    JSON.stringify(sessionStatus.seating), // Deep comparison for seating object
    sessionStatus.startTime,
    sessionStatus.error
  ]);

  const registerDirectMessageHandler = useCallback((handler) => {
    directHandlerRef.current = handler;
  }, []);

  // ✅ Memoize return value to prevent causing re-renders in parent components
  return useMemo(() => ({
    sendMessage,
    messages,
    isConnected,
    isReconnecting,
    setBinaryMessageHandler,
    sessionStatus: memoizedSessionStatus,
    disconnect,
    waitForAcknowledgment,
    clearMessages,
    registerDirectMessageHandler,
  }), [sendMessage, messages, isConnected, isReconnecting, setBinaryMessageHandler, memoizedSessionStatus, disconnect, waitForAcknowledgment, clearMessages, registerDirectMessageHandler]);
}