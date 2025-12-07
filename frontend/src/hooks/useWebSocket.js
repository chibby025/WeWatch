// frontend/src/hooks/useWebSocket.js
import { useState, useEffect, useCallback, useRef } from 'react';

export default function useWebSocket(roomId, wsToken = null, sessionId = null) {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]); // For text messages
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  
  const messageQueueRef = useRef([]);
  const onBinaryMessageRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const isConnectingRef = useRef(false); // ✅ Guard against duplicate connections
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
    error: null
  });

  const setBinaryMessageHandler = useCallback((handler) => {
    console.log("useWebSocket: Setting binary message handler:", !!handler);
    onBinaryMessageRef.current = handler;
    console.log("useWebSocket: Binary message handler set");
  }, []);

  const connectWebSocket = useCallback(() => {
    const attemptId = Date.now();
    console.log(`🔌🔌🔌 [useWebSocket] connectWebSocket CALLED #${attemptId}:`, {
      roomId,
      wsToken: wsToken ? `${wsToken.substring(0, 20)}...` : null,
      isConnectingRef: isConnectingRef.current,
      currentSocket: socket?.readyState,
      timestamp: new Date().toISOString(),
      stack: new Error().stack.split('\n').slice(1, 4).join('\n') // Show call stack
    });
    
    if (!roomId) {
      console.warn(`❌ [useWebSocket #${attemptId}] Missing roomId — aborting connection`);
      return;
    }

    // ✅ Prevent duplicate connections
    if (isConnectingRef.current) {
      console.warn(`⚠️ [useWebSocket #${attemptId}] Already connecting, skipping duplicate connection attempt`);
      return;
    }

    console.log(`📡 [useWebSocket #${attemptId}] Starting connection...`);
    isConnectingRef.current = true;
    setIsReconnecting(true);
    
    const queryParams = [];
    if (wsToken) {
      queryParams.push(`token=${encodeURIComponent(wsToken)}`);
    }
    if (sessionId) {
      queryParams.push(`session_id=${encodeURIComponent(sessionId)}`);
    }
    const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.hostname;
    const backendPort = import.meta.env.VITE_API_PORT || '8080';
    const wsUrl = `${protocol}://${host}:${backendPort}/api/rooms/${roomId}/ws${queryString}`;

    console.log(`🌐 [useWebSocket #${attemptId}] Connecting to:`, wsUrl);

    const ws = new WebSocket(wsUrl);
    // Ensure binary messages are delivered as ArrayBuffer so players can append directly to SourceBuffer
    try {
      ws.binaryType = 'arraybuffer';
      console.log('useWebSocket: set ws.binaryType = arraybuffer');
    } catch (e) {
      console.warn('useWebSocket: failed to set binaryType on ws', e);
    }
    setSocket(ws);

    ws.onopen = () => {
      console.log("useWebSocket: ✅ WebSocket connected to room:", roomId);
      setIsConnected(true);
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
      console.log(`[${now}] useWebSocket: 📡 Raw message received`);
      console.log(`[${now}] useWebSocket:   - Type:`, typeof event.data);
      console.log(`[${now}] useWebSocket:   - Size/Length:`, event.data.byteLength || event.data.size || event.data.length || 'N/A');
      console.log(`[${now}] useWebSocket:   - Constructor:`, event.data?.constructor?.name || 'N/A');

      if (typeof event.data === 'string') {
        const preview = event.data.length > 100 ? event.data.substring(0, 100) + '...' : event.data;
        console.log(`[${now}] useWebSocket: 📡 Text message received:`, preview);

        try {
          const message = JSON.parse(event.data);
          console.log(`[${now}] useWebSocket: ✅ Parsed JSON message:`, message.type, message);

          // Handle session-specific messages
          if (message.type === 'session_status') {
            console.log(`[${now}] useWebSocket: 🧾 Processing 'session_status'`);
            const data = message.data || {};
            console.log(`[${now}] useWebSocket:   - Raw session data:`, data);
            console.log(`[${now}] useWebSocket:   - Mapped fields:`, {
              id: data.session_id || data.id || null,
              isActive: !!(data.session_id || data.id),
              hostId: data.host_id || data.hostId || null,
              members: data.members || [],
              startTime: data.started_at || data.start_time || null,
              error: data.error || null,
            });

            setSessionStatus({
              id: data.session_id || data.id || null,
              isActive: !!(data.session_id || data.id),
              hostId: data.host_id || data.hostId || null,
              members: data.members || [],
              startTime: data.started_at || data.start_time || null,
              error: data.error || null,
            });
          } else if (message.type === 'session_error') {
            console.log(`[${now}] useWebSocket: ❌ Received 'session_error':`, message.data?.message);
            setSessionStatus(prev => ({ ...prev, error: message.data?.message }));
          } else if (message.type === 'session_member_update') {
            console.log(`[${now}] useWebSocket: 👥 Received 'session_member_update':`, message.data?.members);
            setSessionStatus(prev => ({ ...prev, members: message.data?.members || [] }));
          } else if (message.type === 'theater_created') {
            console.log(`[${now}] useWebSocket: 🎭 Theater created:`, message.data);
            // Toast notification will be handled by component
          } else if (message.type === 'theater_assigned') {
            console.log(`[${now}] useWebSocket: 🎭 Theater assigned:`, message.data);
            // Component can display theater info
          }

          setMessages(prev => [...prev, message]);

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

        // 🔥 KEY FIX: DO NOT buffer — drop if no handler is ready
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
      console.log(`useWebSocket: 🔌 WebSocket closed for room ${roomId}. Code: ${event.code}, Reason: ${event.reason}, Attempts: ${reconnectAttemptRef.current}`);
      setIsConnected(false);
      isConnectingRef.current = false; // ✅ Allow reconnection
      
      // Clear message stats on disconnect
      messageStatsRef.current = {
        lastSentTime: Date.now(),
        messagesSentInLastSecond: 0,
        totalMessagesSent: 0,
        queuedMessages: messageQueueRef.current.length
      };

      // Check for session ended (close code 1008 = policy violation or 1011 = internal error)
      // Backend returns 410 Gone which causes immediate close
      if (event.code === 1006 && sessionId && reconnectAttemptRef.current === 0) {
        // Code 1006 = abnormal closure (no close frame from server)
        // This happens when backend rejects connection before WebSocket upgrade
        console.error("useWebSocket: ❌ Connection rejected - possibly ended session");
        setSessionStatus(prev => ({ 
          ...prev, 
          error: "This watch session has ended. Please start a new session.",
          isActive: false 
        }));
        setIsReconnecting(false);
        return; // Don't attempt reconnection
      }

      // Attempt to reconnect unless we've hit the limit
      if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
        setIsReconnecting(true);
        reconnectAttemptRef.current++;
        console.log(`useWebSocket: 🔄 Attempting reconnect ${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS} in ${RECONNECT_INTERVAL}ms`);
        setTimeout(connectWebSocket, RECONNECT_INTERVAL * reconnectAttemptRef.current); // Exponential backoff
      } else {
        setIsReconnecting(false);
        console.error("useWebSocket: ❌ Max reconnection attempts reached");
      }
    };

    ws.onerror = (error) => {
      console.error("useWebSocket: 🐞 WebSocket error:", error);
      isConnectingRef.current = false; // ✅ Allow reconnection after error
      // Don't set isConnected to false here, let onclose handle the reconnection
    };

    return () => {
      console.log("useWebSocket: Cleaning up WebSocket connection for room:", roomId);
      setIsReconnecting(false); // Stop reconnection attempts on cleanup
      reconnectAttemptRef.current = MAX_RECONNECT_ATTEMPTS; // Prevent new reconnection attempts
      isConnectingRef.current = false; // ✅ Reset guard on cleanup
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [roomId]);

  // Main effect to initiate connection
  useEffect(() => {
    const effectId = Date.now();
    console.log(`🔍 [useWebSocket] Effect TRIGGERED #${effectId}:`, {
      roomId,
      wsToken: wsToken ? `${wsToken.substring(0, 20)}...` : null,
      isConnectingRef: isConnectingRef.current,
      socketState: socket?.readyState,
      timestamp: new Date().toISOString()
    });
    
    reconnectAttemptRef.current = 0; // Reset reconnection attempts
    const cleanup = connectWebSocket();
    
    return () => {
      console.log(`🧹 [useWebSocket] Effect CLEANUP #${effectId} called`);
      if (cleanup) cleanup();
    };
  }, [roomId]); // ✅ FIX: Only reconnect when room changes (wsToken removed)

  // Debug: Log sessionStatus changes
  useEffect(() => {
    console.log('[useWebSocket] sessionStatus state changed:', sessionStatus);
  }, [sessionStatus]);

  // ✅ SIMPLIFIED sendMessage — AUTO-DETECTS TEXT vs BINARY
  const sendMessage = useCallback((message) => {
    console.log("[useWebSocket] sendMessage called with:", message, "Socket state:", socket ? socket.readyState : "N/A")
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.warn("useWebSocket: Socket not open, queueing message:", message);
      if (messageQueueRef.current.length >= MAX_QUEUE_SIZE) {
        console.error("useWebSocket: ❌ Message queue full, dropping message");
        return false;
      }
      messageQueueRef.current.push(message);
      console.log("[useWebSocket] Message queued. Current queue size:", messageQueueRef.current.length);
      setBufferFullness((messageQueueRef.current.length / MAX_QUEUE_SIZE) * 100);
      return false;
    }

    try {
      if (message instanceof Blob || message instanceof ArrayBuffer) {
        // → BINARY
        const size = message.size || message.byteLength;
        if (size > MAX_BINARY_SIZE) {
          console.error("useWebSocket: ❌ Binary message too large:", size, "bytes");
          return false;
        }
        socket.send(message);
        console.log("useWebSocket: 📤 Sent as BINARY", { size });
        return true;
      } else {
        // → TEXT (JSON)
        const json = typeof message === 'string' ? message : JSON.stringify(message);
        socket.send(json);
        console.log("useWebSocket: 📤 Sent as TEXT", { preview: json.substring(0, 100) + (json.length > 100 ? '...' : '') });
        return true;
      }
    } catch (error) {
      console.error("useWebSocket: 🐞 Error sending message:", error, message);
      messageQueueRef.current.push(message);
      setBufferFullness((messageQueueRef.current.length / MAX_QUEUE_SIZE) * 100);
      return false;
    }
  }, [socket]);

  return { 
    sendMessage, 
    messages, 
    isConnected, 
    isReconnecting,
    setBinaryMessageHandler,
    sessionStatus,
  };
}