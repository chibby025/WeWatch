// WeWatch/frontend/src/components/RoomPageNew.jsx
// Redesigned RoomPage - Hub for room with persistent chat (no video player)
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import EmojiPicker from 'emoji-picker-react';
import {
  ArrowLeftIcon,
  UserIcon,
  ClockIcon,
  FilmIcon,
  EllipsisVerticalIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import apiClient, { editRoomMessage, deleteRoomMessage, getRoomTVContent, createRoomTVContent, deleteRoomTVContent, joinRoom } from '../services/api';
import WatchTypeModal from './WatchTypeModal';
import ScheduleEventModal from './ScheduleEventModal';
import ScheduledEventsNotification from './ScheduledEventsNotification';
import RoomPageEditModal from './RoomPageEditModal';
import RoomMembersModal from './RoomMembersModal';
import ShareModal from './ShareModal';
import RoomTV from './RoomTV';
import CreateTVContentModal from './CreateTVContentModal';
// TODO: Review MediaBanner integration later - currently commented out for future use
// import MediaBanner from './MediaBanner';

const RoomPageNew = () => {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // Room state
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isHost, setIsHost] = useState(false);

  // Active session state
  const [activeSession, setActiveSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  // Members state
  const [members, setMembers] = useState([]);
  const [membersInSession, setMembersInSession] = useState([]);
  const [isMember, setIsMember] = useState(false); // ✅ Track if user is a member
  const [joiningRoom, setJoiningRoom] = useState(false); // ✅ Track join action

  // Chat state
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);
  const [openMenuIndex, setOpenMenuIndex] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef(null);

  // Modal state
  const [isWatchTypeModalOpen, setIsWatchTypeModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [showMediaManager, setShowMediaManager] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isTVContentModalOpen, setIsTVContentModalOpen] = useState(false);
  
  // Scheduled events state
  const [scheduledEventsKey, setScheduledEventsKey] = useState(0);
  const [upcomingEvents, setUpcomingEvents] = useState([]);

  // RoomTV state
  const [hostContent, setHostContent] = useState(null);

  // TODO: Review media state later - currently commented out for future use
  // const [mediaItems, setMediaItems] = useState([]);
  // const [currentMedia, setCurrentMedia] = useState(null);
  // const [isBannerExpanded, setIsBannerExpanded] = useState(false);

  // WebSocket for room-level communication
  const wsRef = useRef(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsConnectedRef = useRef(false);
  const reconnectTimeoutRef = useRef(null);

  // Fetch room data on mount
  useEffect(() => {
    fetchRoomData();
    fetchActiveSession();
    fetchMembers();
    fetchRoomMessages();
    fetchTVContent();
    fetchScheduledEvents();
    connectWebSocket();

    // Poll for updates every 10 seconds
    const interval = setInterval(() => {
      fetchActiveSession();
      fetchMembers();
      fetchTVContent();
    }, 10000);

    return () => {
      clearInterval(interval);
      
      // Clear reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Close WebSocket properly
      wsConnectedRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [roomId]);

  const fetchRoomData = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/api/rooms/${roomId}`);
      const roomData = response.data.room;
      setRoom(roomData);
      const userIsHost = currentUser?.id === roomData.host_id;
      setIsHost(userIsHost);
      // ✅ Host is always considered a member
      if (userIsHost) {
        setIsMember(true);
      }
    } catch (err) {
      console.error('Failed to fetch room:', err);
      setError('Failed to load room data');
      toast.error('Failed to load room');
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveSession = async () => {
    try {
      setSessionLoading(true);
      const response = await apiClient.get(`/api/rooms/${roomId}/active-session`);
      // Backend returns session data at root level
      if (response.data.session_id) {
        // ✅ Validate session age - reject sessions older than 4 hours
        const sessionStartTime = new Date(response.data.started_at);
        const sessionAge = (Date.now() - sessionStartTime.getTime()) / (1000 * 60 * 60); // hours
        
        if (sessionAge > 4) {
          console.warn(`⚠️ Session ${response.data.session_id} is ${sessionAge.toFixed(1)} hours old - clearing stale session`);
          
          // Try to end the stale session on the backend
          try {
            await apiClient.post(`/api/rooms/${roomId}/sessions/${response.data.session_id}/end`);
            toast('Cleared stale session', { icon: '🧹' });
          } catch (endError) {
            console.error('Failed to end stale session:', endError);
          }
          
          setActiveSession(null);
          setMembersInSession([]);
        } else {
          setActiveSession(response.data);
          setMembersInSession(response.data.members || []);
        }
      } else {
        setActiveSession(null);
        setMembersInSession([]);
      }
    } catch (err) {
      // No active session is not an error
      setActiveSession(null);
      setMembersInSession([]);
    } finally {
      setSessionLoading(false);
    }
  };

  const fetchMembers = async () => {
    try {
      const response = await apiClient.get(`/api/rooms/${roomId}/members`);
      const membersList = response.data.members || [];
      setMembers(membersList);
      
      // ✅ Check if current user is a member
      if (currentUser && currentUser.id) {
        const userIsMember = membersList.some(member => member.id === currentUser.id);
        setIsMember(userIsMember);
      }
    } catch (err) {
      console.error('Failed to fetch members:', err);
    }
  };

  const fetchRoomMessages = async () => {
    try {
      const response = await apiClient.get(`/api/rooms/${roomId}/messages`);
      const msgs = response.data.messages || [];
      // console.log('📨 Fetched messages:', msgs);
      // console.log('📨 First message structure:', msgs[0]);
      setMessages(msgs);
      scrollToBottom();
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const fetchTVContent = async () => {
    const token = sessionStorage.getItem('wewatch_token');
    if (!token) {
      // Silent skip - auth not ready yet
      return;
    }

    try {
      // Pass session_id if active session exists to get session-specific content
      const sessionParam = activeSession?.session_id ? `?session_id=${activeSession.session_id}` : '';
      const url = `/api/rooms/${roomId}/tv-content${sessionParam}`;
      
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}${url}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          // Silent - token might be expired, will re-auth
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data) {
        console.log('📺 [RoomTV] Active content:', data.title || data.content_type);
      } else {
        console.log('📺 [RoomTV] No active content in room');
      }
      
      setHostContent(data);
    } catch (err) {
      // Silent - only critical errors logged
      if (err.message && !err.message.includes('404') && !err.message.includes('401')) {
        console.error('❌ [RoomTV] Fetch error:', err.message);
      }
    }
  };

  const fetchScheduledEvents = async () => {
    try {
      const response = await apiClient.get(`/api/rooms/${roomId}/scheduled-events`);
      const events = response.data.events || [];
      // Only keep upcoming events within next hour
      const upcoming = events.filter(event => {
        const eventTime = new Date(event.scheduled_for);
        const now = new Date();
        const hourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
        return eventTime > now && eventTime < hourFromNow;
      });
      setUpcomingEvents(upcoming);
    } catch (err) {
      console.error('Failed to fetch scheduled events:', err);
    }
  };

  const connectWebSocket = () => {
    // Prevent duplicate connections
    if (wsConnectedRef.current || (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING)) {
      console.log('WebSocket already connected or connecting, skipping...');
      return;
    }

    // Connect to room-level WebSocket for presence and chat updates
    const wsToken = sessionStorage.getItem('wewatch_ws_token');
    if (!wsToken) return;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.hostname;
    const backendPort = import.meta.env.VITE_API_PORT || '8080';
    const wsUrl = `${protocol}://${host}:${backendPort}/api/rooms/${roomId}/ws?token=${encodeURIComponent(wsToken)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Room WebSocket connected');
      wsConnectedRef.current = true;
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('Room WebSocket disconnected');
      wsConnectedRef.current = false;
      setWsConnected(false);
      wsRef.current = null;
      
      // Clear any existing reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Attempt reconnect after 5 seconds (increased from 3 for stability)
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('Attempting to reconnect WebSocket...');
        connectWebSocket();
      }, 5000);
    };
  };

  const handleWebSocketMessage = (message) => {
    switch (message.type) {
      case 'room_chat':
        setMessages(prev => [...prev, message.data]);
        scrollToBottom();
        break;
      case 'user_joined':
        toast.success(`${message.data.username} joined the room`);
        fetchMembers();
        break;
      case 'user_left':
        toast(`${message.data.username} left the room`);
        fetchMembers();
        break;
      case 'session_started':
        toast.success('Watch session started!');
        fetchActiveSession();
        break;
      case 'session_ended':
        const reason = message.data?.reason;
        if (reason === 'host_timeout') {
          toast('Watch session ended - Host disconnected', { icon: '⏰' });
        } else {
          toast('Watch session ended');
        }
        // Immediately clear active session state
        setActiveSession(null);
        setMembersInSession([]);
        // Also fetch to sync with backend
        fetchActiveSession();
        break;
      case 'scheduled_event_created':
        toast.success(`📅 New event scheduled: ${message.event?.title}`);
        // Force re-render of ScheduledEventsNotification by updating key
        setScheduledEventsKey(prev => prev + 1);
        fetchScheduledEvents();
        break;
      case 'room_tv_content_created':
        setHostContent(message.content);
        toast.success('📺 Host posted new content');
        break;
      case 'room_tv_content_removed':
        setHostContent(null);
        break;
      default:
        break;
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      await apiClient.post(`/api/rooms/${roomId}/messages`, {
        message: newMessage,
      });
      setNewMessage('');
      setShowEmojiPicker(false); // Close picker after sending
    } catch (err) {
      console.error('Failed to send message:', err);
      toast.error('Failed to send message');
    }
  };

  const handleEmojiClick = (emojiData) => {
    setNewMessage(prev => prev + emojiData.emoji);
  };

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  const handleEditMessage = async (messageId, newText) => {
    try {
      const response = await editRoomMessage(roomId, messageId, newText);
      // Update the message in state
      setMessages(messages.map(msg => 
        msg.id === messageId ? { ...msg, message: response.message } : msg
      ));
      setEditingMessageId(null);
      setEditText('');
      toast.success('Message updated');
    } catch (err) {
      console.error('Failed to edit message:', err);
      toast.error('Failed to edit message');
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      const response = await deleteRoomMessage(roomId, messageId);
      
      // If deleted by host (soft delete), update message in place
      if (response.deleted_by_host) {
        setMessages(messages.map(msg => 
          msg.id === messageId 
            ? { ...msg, message: '[Message deleted by host]', deleted_by_host: true }
            : msg
        ));
      } else {
        // Owner deleted their own message (hard delete) - remove from state
        setMessages(messages.filter(msg => msg.id !== messageId));
      }
      
      toast.success('Message deleted');
    } catch (err) {
      console.error('Failed to delete message:', err);
      toast.error('Failed to delete message');
    }
  };

  const startEditing = (msg) => {
    setEditingMessageId(msg.id);
    setEditText(msg.message);
    setOpenMenuIndex(null);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditText('');
  };

  const saveEdit = (messageId) => {
    if (!editText.trim()) return;
    handleEditMessage(messageId, editText);
  };

  const handleBeginWatch = async () => {
    // If host and there's an existing session, verify it's still valid
    if (activeSession && isHost) {
      // Check if host is actually in the session
      const hostInSession = membersInSession.some(m => m.user_id === currentUser?.id && m.is_active);
      
      if (!hostInSession) {
        // Host is not in session - likely stale. End it before starting new one.
        try {
          await apiClient.post(`/api/rooms/${roomId}/sessions/${activeSession.session_id}/end`);
          toast('Ended inactive session');
          setActiveSession(null);
          setMembersInSession([]);
        } catch (err) {
          console.error('Failed to end stale session:', err);
          // Continue anyway - might already be ended
        }
      }
    }
    setIsWatchTypeModalOpen(true);
  };

  const handleScheduleEvent = () => {
    setIsScheduleModalOpen(true);
  };

  const handleCreateScheduledEvent = async (eventData) => {
    try {
      await apiClient.post(`/api/rooms/${roomId}/scheduled-events`, eventData);
      toast.success('Event scheduled successfully!');
      setScheduledEventsKey(prev => prev + 1); // Refresh events list
    } catch (err) {
      console.error('Failed to create scheduled event:', err);
      toast.error('Failed to schedule event');
    }
  };

  const handleWatchTypeSelected = async (watchType) => {
    try {
      setIsWatchTypeModalOpen(false);
      
      const response = await apiClient.post(`/api/rooms/${roomId}/sessions`, {
        watch_type: watchType,
      });

      const { session_id, watch_type: type } = response.data;

      toast.success(`Starting ${type === '3d_cinema' ? '3D Cinema' : 'Video Watch'}...`);

      // Route to appropriate watch page
      if (type === '3d_cinema') {
        navigate(`/cinema-3d-demo/${roomId}?session_id=${session_id}`, {
          state: { isHost: true, sessionId: session_id }
        });
      } else {
        navigate(`/watch/${roomId}?session_id=${session_id}`);
      }
    } catch (err) {
      console.error('Failed to create session:', err);
      toast.error('Failed to start watch session');
    }
  };

  const handleJoinSession = async () => {
    if (!activeSession) return;

    // Verify session is still active before joining
    try {
      const response = await apiClient.get(`/api/rooms/${roomId}/active-session`);
      if (!response.data.session_id) {
        toast.error('Session has ended');
        setActiveSession(null);
        setMembersInSession([]);
        return;
      }
    } catch (err) {
      console.error('Failed to verify session:', err);
      toast.error('Failed to join session');
      return;
    }

    const { session_id, watch_type } = activeSession;

    // Route to appropriate watch page
    if (watch_type === '3d_cinema') {
      navigate(`/cinema-3d-demo/${roomId}?session_id=${session_id}`, {
        state: { sessionId: session_id }
      });
    } else {
      navigate(`/watch/${roomId}?session_id=${session_id}`);
    }
  };

  // RoomTV handlers
  const handleCreateTVContent = async (contentData) => {
    try {
      const content = await createRoomTVContent(roomId, contentData);
      setHostContent(content);
      toast.success('📺 Content posted to RoomTV!');
    } catch (err) {
      console.error('Failed to create TV content:', err);
      toast.error('Failed to create content');
      throw err; // Re-throw so modal can handle it
    }
  };

  const handleDismissContent = async (contentId) => {
    try {
      await deleteRoomTVContent(roomId, contentId);
      setHostContent(null);
      toast.success('Content dismissed');
    } catch (err) {
      console.error('Failed to dismiss content:', err);
      toast.error('Failed to dismiss content');
    }
  };

  // ✅ Handle joining room
  const handleJoinRoom = async () => {
    if (!currentUser) {
      toast.error('Please log in to join this room');
      return;
    }

    setJoiningRoom(true);
    try {
      await joinRoom(roomId);
      setIsMember(true);
      toast.success('Successfully joined the room! 🎉');
      // Refresh members list
      await fetchMembers();
    } catch (err) {
      console.error('Failed to join room:', err);
      toast.error(err.message || 'Failed to join room');
    } finally {
      setJoiningRoom(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading room...</div>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-red-600">{error || 'Room not found'}</div>
      </div>
    );
  }

  const membersInRoom = members.length;
  const membersInSessionCount = membersInSession.length;

  return (
    <div className="h-screen flex flex-col bg-gray-900 overflow-hidden">
      <Toaster position="top-center" />

      {/* ✅ Sticky Header - No separation */}
      <header className="flex-none bg-gray-800 z-40">
        <div className="px-4 py-3">
          {/* Room Info */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white">
                  {room.name}
                </h1>
                {wsConnected && (
                  <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" title="Connected" />
                )}
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-white">
                {room.show_host !== false && (
                  <span className="flex items-center gap-1">
                    <img src="/icons/hostIcon.svg" alt="" className="h-4 w-4" />
                    Host: {room.host_username || `User ${room.host_id}`}
                  </span>
                )}
                <span 
                  className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setIsMembersModalOpen(true)}
                  title="View members"
                >
                  <img src="/icons/roomMembersIcon.svg" alt="" className="h-4 w-4" />
                  {membersInRoom} in room
                  {membersInSessionCount > 0 && `, ${membersInSessionCount} watching`}
                </span>
              </div>
              {/* Room Description - Show if enabled and exists */}
              {room.show_description && room.description && (
                <div className="mt-2 text-sm text-gray-300">
                  {room.description}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <img 
                src="/icons/backIcon.svg" 
                alt="Back to Lobby" 
                onClick={() => navigate('/lobby')}
                className="h-8 w-8 cursor-pointer hover:opacity-80 transition-opacity"
                title="Back to Lobby"
              />
              <EllipsisVerticalIcon 
                onClick={() => setIsEditModalOpen(true)}
                className="h-8 w-8 text-white cursor-pointer hover:opacity-80 transition-opacity"
                title="Room Settings"
              />
            </div>
          </div>

          {/* ✅ Action Icons - Minimalist standalone icons */}
          <div className="flex items-center gap-6">
            {activeSession ? (
              <div className="relative">
                <img 
                  src="/icons/beginWatchIcon.svg"
                  alt="Join Watch"
                  onClick={handleJoinSession}
                  className="h-20 w-20 cursor-pointer hover:opacity-80 transition-opacity"
                  title="Join Active Watch Session"
                />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" title="Session Active" />
              </div>
            ) : (
              <img 
                src="/icons/beginWatchIcon.svg"
                alt="Begin Watch"
                onClick={handleBeginWatch}
                className="h-20 w-20 cursor-pointer hover:opacity-80 transition-opacity"
                title="Begin Watch"
              />
            )}
            <img 
              src="/icons/scheduleWatchIcon.svg" 
              alt="Schedule Watch" 
              onClick={handleScheduleEvent}
              className="h-20 w-20 cursor-pointer hover:opacity-80 transition-opacity"
              title="Schedule Watch"
            />
            {isHost && (
              <img 
                src="/icons/roomTvIcon.svg" 
                alt="Post to RoomTV" 
                onClick={() => setIsTVContentModalOpen(true)}
                className="h-24 w-24 cursor-pointer hover:opacity-80 transition-opacity -mt-2"
                title="Post to RoomTV"
              />
            )}
          </div>
        </div>
      </header>

      {/* ✅ RoomTV Content Banner - Dynamic content hub */}
      <RoomTV
        roomId={roomId}
        activeSession={activeSession}
        upcomingEvents={upcomingEvents}
        hostContent={hostContent}
        onJoinSession={handleJoinSession}
        isHost={isHost}
        onDismissContent={handleDismissContent}
      />

      {/* TODO: Review MediaBanner integration later - currently commented out for future use */}
      {/* <div 
        className="flex-none transition-all duration-300 ease-in-out bg-gray-800 overflow-hidden"
        style={{ 
          height: currentMedia 
            ? (isBannerExpanded ? '250px' : '60px')
            : '0px'
        }}
      >
        {currentMedia && (
          <MediaBanner
            isExpanded={isBannerExpanded}
            onToggle={() => setIsBannerExpanded(!isBannerExpanded)}
            mediaItems={mediaItems}
            currentMedia={currentMedia}
            onPlayMedia={(mediaId) => console.log('Play media:', mediaId)}
            onDeleteMedia={(mediaId) => console.log('Delete media:', mediaId)}
            onUploadClick={() => console.log('Upload clicked')}
            isHost={isHost}
          />
        )}
      </div> */}

      {/* ✅ Chat Messages - Fills remaining space */}
      <div className="flex-1 overflow-y-auto bg-gray-900 px-4 py-4 space-y-3 scrollbar-hide">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <FilmIcon className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg">No messages yet</p>
            <p className="text-sm mt-1 opacity-75">Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isOwnMessage = msg.user_id === currentUser?.id;
            const isEditing = editingMessageId === msg.id;
            const messageAge = Date.now() - new Date(msg.created_at).getTime();
            const canEdit = isOwnMessage && messageAge < 2 * 60 * 1000; // 2 minutes
            const canDelete = isOwnMessage || isHost;

            return (
              <div
                key={index}
                className={`flex group ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
              >
                <div className="relative">
                  <div
                    className={`max-w-xs px-4 py-2 rounded-lg shadow-sm ${
                      isOwnMessage
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-100'
                    }`}
                  >
                    <div className="text-xs opacity-75 mb-1">
                      {msg.username || 'Anonymous'}
                    </div>
                    
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          rows={2}
                          autoFocus
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={cancelEditing}
                            className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 rounded"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveEdit(msg.id)}
                            className="px-2 py-1 text-xs bg-blue-500 hover:bg-blue-400 rounded"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className={msg.deleted_by_host ? 'italic opacity-75' : ''}>
                          {msg.message}
                        </div>
                        <div className="text-xs opacity-75 mt-1">
                          {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </div>
                      </>
                    )}
                  </div>

                  {/* 3-dot menu - Shows on hover for own messages or host */}
                  {!isEditing && !msg.deleted_by_host && (canEdit || canDelete) && (
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setOpenMenuIndex(openMenuIndex === index ? null : index)}
                        className="p-1 hover:bg-gray-700 rounded-full bg-gray-800 bg-opacity-50"
                      >
                        <EllipsisVerticalIcon className="w-5 h-5 text-gray-300" />
                      </button>

                      {openMenuIndex === index && (
                        <div className="absolute right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg py-1 min-w-[120px] z-10">
                          {canEdit && (
                            <button
                              onClick={() => startEditing(msg)}
                              className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700"
                            >
                              Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => {
                                handleDeleteMessage(msg.id);
                                setOpenMenuIndex(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-700"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ✅ Message Input - Sticky bottom, no separation */}
      <form onSubmit={handleSendMessage} className="flex-none bg-gray-800 px-4 py-3 relative">
        <div className="flex gap-3 items-center">
          {/* Sticker/Emoji Button */}
          <div className="relative" ref={emojiPickerRef}>
            <button
              type="button"
              onClick={() => isMember && setShowEmojiPicker(!showEmojiPicker)}
              disabled={!isMember}
              className="hover:opacity-70 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              title={isMember ? "Emojis & Stickers" : "Join room to use emojis"}
            >
              <img src="/icons/stickerIcon.svg" alt="Emojis & Stickers" className="h-8 w-8" />
            </button>
            
            {/* Emoji Picker Popup */}
            {showEmojiPicker && isMember && (
              <div className="absolute bottom-full left-0 mb-2 z-50">
                <EmojiPicker
                  onEmojiClick={handleEmojiClick}
                  theme="dark"
                  width={350}
                  height={400}
                  searchPlaceholder="Search emoji..."
                  categories={[
                    { name: 'Smileys & People', category: 'smileys_people' },
                    { name: 'Animals & Nature', category: 'animals_nature' },
                    { name: 'Food & Drink', category: 'food_drink' },
                    { name: 'Travel & Places', category: 'travel_places' },
                    { name: 'Activities', category: 'activities' },
                    { name: 'Objects', category: 'objects' },
                    { name: 'Symbols', category: 'symbols' },
                    { name: 'Flags', category: 'flags' },
                  ]}
                />
              </div>
            )}
          </div>
          
          {/* Voice Note Button */}
          <button
            type="button"
            disabled={!isMember}
            className="hover:opacity-70 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            title={isMember ? "Record Voice Note" : "Join room to send voice notes"}
          >
            <img src="/icons/mic.svg" alt="Voice Note" className="h-8 w-8" />
          </button>

          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={isMember ? "Type a message..." : "Join room to chat..."}
            disabled={!isMember}
            className="flex-1 px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <img 
            src="/icons/sendIcon.svg" 
            alt="Send" 
            onClick={isMember ? handleSendMessage : undefined}
            className={`h-20 w-20 transition-opacity ${isMember ? 'cursor-pointer hover:opacity-80' : 'opacity-40 cursor-not-allowed'}`}
            title={isMember ? "Send message" : "Join room to send messages"}
          />
        </div>
      </form>

      {/* ✅ Join Room Button (Fixed at bottom for non-members) */}
      {!isMember && !isHost && currentUser && (
        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-gray-900 via-gray-900 to-transparent pt-8 pb-6 px-4 z-50">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={handleJoinRoom}
              disabled={joiningRoom}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold text-lg rounded-lg shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {joiningRoom ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Joining...</span>
                </>
              ) : (
                <>
                  <UserIcon className="h-6 w-6" />
                  <span>Join Room to Chat & Watch</span>
                </>
              )}
            </button>
            <p className="text-center text-gray-400 text-sm mt-3">
              You need to join this room to participate in chats and watch sessions
            </p>
          </div>
        </div>
      )}

      {/* ✅ Watch Type Modal */}
      <WatchTypeModal
        isOpen={isWatchTypeModalOpen}
        onClose={() => setIsWatchTypeModalOpen(false)}
        onSelectType={handleWatchTypeSelected}
        title="Choose Your Watch Experience"
      />

      {/* ✅ Schedule Event Modal */}
      <ScheduleEventModal
        isOpen={isScheduleModalOpen}
        roomId={roomId}
        onClose={() => setIsScheduleModalOpen(false)}
        onCreate={handleCreateScheduledEvent}
      />

      {/* ✅ Room Edit Modal */}
      <RoomPageEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        room={room}
        onUpdate={(updatedRoom) => {
          setRoom(updatedRoom);
          toast.success('Room updated successfully');
        }}
        onShare={() => setIsShareModalOpen(true)}
      />

      {/* ✅ Room Members Modal */}
      <RoomMembersModal
        isOpen={isMembersModalOpen}
        onClose={() => setIsMembersModalOpen(false)}
        members={members}
        onAddMembers={() => {
          setIsMembersModalOpen(false);
          setIsShareModalOpen(true);
        }}
      />

      {/* ✅ Share Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        roomId={roomId}
        roomName={room?.name || room?.Name}
      />

      {/* ✅ Create TV Content Modal (Host Only) */}
      <CreateTVContentModal
        isOpen={isTVContentModalOpen}
        onClose={() => setIsTVContentModalOpen(false)}
        onSubmit={handleCreateTVContent}
        activeSessionId={activeSession?.session_id || null}
      />
    </div>
  );
};

export default RoomPageNew;
