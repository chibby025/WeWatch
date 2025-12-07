// WeWatch/frontend/src/components/RoomPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
// Import API service functions
import { getRoom, getMediaItemsForRoom, uploadMediaToRoom, getRoomMembers, getActiveSession, createWatchSessionForRoom, getScheduledEvents, createScheduledEvent, updateScheduledEvent, deleteScheduledEvent, downloadICal, deleteChatMessage, editChatMessage } from '../services/api';
// Import the VideoPlayer component
import VideoPlayer from './VideoPlayer'; // Adjust path if needed
import MemberList from './MemberList';
import Sidebar from './Sidebar';
import ScheduleEventModal from './ScheduleEventModal';
import WatchTypeModal from './WatchTypeModal';
//import UploadSection from './UploadSection';
//import MediaItemList from './MediaItemList'; // Your existing media list component
// Import Heroicons
import {
  ChevronDownIcon,
  ArrowLeftIcon,
  PlusIcon,
  ArrowUpTrayIcon, // <-- REPLACED UploadIcon with ArrowUpTrayIcon
  PlayIcon,
  UserIcon,
  CalendarIcon,
  ServerIcon
} from '@heroicons/react/24/outline';
import { FilmIcon } from '@heroicons/react/24/solid'; // Solid icon for media placeholder
import jwtDecodeUtil from '../utils/jwt';
import ChatPanel from './ChatPanel';
import useAuth from '../hooks/useAuth';
import apiClient from '../services/api';


const RoomPage = () => {
  const { id: roomId } = useParams(); // Get the room ID from the URL (:id)
  const navigate = useNavigate();

  // --- Room State ---
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- Media Items State ---
  const [mediaItems, setMediaItems] = useState([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState(null);
  const [isMediaPanelOpen, setIsMediaPanelOpen] = useState(false); // State for collapsible panel

  // --- Upload State (Moved inside RoomPage) ---
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // --- Playback State ---
  const [selectedMediaItem, setSelectedMediaItem] = useState(null); // State for the currently selected/playing media item

  // --- NEW: Host/Controller State ---
  const [isHost, setIsHost] = useState(false); // State to track if current user is the room host
  // --- --- ---
  const [chatMessages, setChatMessages] = useState([]);
  // --- WebSocket State ---
  const [ws, setWs] = useState(null); // State for the WebSocket connection object
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState(null);
  const { currentUser, wsToken, loading: authLoading } = useAuth();
  // --- Refs ---
  const wsRef = useRef(null); // Ref to hold the WebSocket connection object (alternative to state)

  // Session tracking state
  // Add to your state declarations
const [activeSessionId, setActiveSessionId] = useState(null);

  const [isMembersPanelOpen, setIsMembersPanelOpen] = useState(false);
  const [roomMembers, setRoomMembers] = useState([])
  const [sessionStatus, setSessionStatus] = useState({
    isActive: false,
    hostId: null
  });

  // --- Scheduled Events State ---
  const [scheduledEvents, setScheduledEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [notifiedEvents, setNotifiedEvents] = useState(new Set()); // Track which events we've already notified about
  
  // --- Watch Type Modal State ---
  const [isWatchTypeModalOpen, setIsWatchTypeModalOpen] = useState(false);
  const [activeWatchType, setActiveWatchType] = useState(null); // 'video' or '3d_cinema'
  
  // --- EFFECTS ---

  // Fetch Room Data
  useEffect(() => {
    const fetchRoomData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getRoom(roomId);
        console.log(`Fetched room ${roomId}:`, data);
        setRoom(data.room);
      } catch (err) {
        console.error(`Error fetching room ${roomId}:`, err);
        if (err.response && err.response.status === 404) {
            setError('Room not found.');
        } else {
            setError('Failed to load room details. Please try again later.');
        }
      } finally {
        setLoading(false);
      }
    };

    if (roomId) {
        fetchRoomData();
    } else {
        setError('Invalid room ID.');
        setLoading(false);
    }
  }, [roomId]); // Dependency array includes 'roomId' so it re-fetches if the ID changes

  
  // Fetch Media Items for the Room
  useEffect(() => {
    const fetchMediaItems = async () => {
        setMediaLoading(true);
        setMediaError(null);
        try {
            // Assuming getMediaItemsForRoom returns the array directly
            // Adjust based on your actual API response structure
            const mediaData = await getMediaItemsForRoom(roomId);
            console.log(`Fetched media items for room ${roomId}:`, mediaData);
            setMediaItems(Array.isArray(mediaData) ? mediaData : []);
        } catch (err) {
            console.error(`Error fetching media items for room ${roomId}:`, err);
            setMediaError('Failed to load media items.');
            setMediaItems([]); // Clear items on error
        } finally {
            setMediaLoading(false);
        }
    };

    if (roomId) {
        fetchMediaItems();
    }
  }, [roomId]); // Dependency array includes 'roomId' so it re-fetches if the ID changes

  // --- WebSocket Connection Effect ---
  useEffect(() => {
    // Only proceed if BOTH roomId (string) and wsToken are available
    if (!roomId || !wsToken) {
      // Optional: only log if it's not the initial mount
      if (roomId || wsToken) {
        console.log("WebSocket Effect: Waiting for room ID or auth token...");
      }
      return;
    }

    const wsUrl = `ws://localhost:8080/api/rooms/${roomId}/ws?token=${encodeURIComponent(wsToken)}`;
    console.log("WebSocket Effect: Connecting to:", wsUrl);

    const websocket = new WebSocket(wsUrl);
    setWs(websocket);
    wsRef.current = websocket;

    const handleOpen = () => {
      console.log("WebSocket connected");
      setWsConnected(true);
      setWsError(null);
    };

    const handleMessage = (event) => {
      if (typeof event.data !== 'string') return;
      
      try {
        const msg = JSON.parse(event.data);
        
        // ✅ Handle initial session status
        if (msg.type === 'session_status') {
          setSessionStatus({
            isActive: !!msg.data.session_id,
            hostId: msg.data.host_id
          });
        }
        
        // ✅ Handle real-time session start via screen share
        if (msg.type === 'screen_share_started') {
          setSessionStatus(prev => ({
            ...prev,
            isActive: true,
            hostId: msg.data.user_id // snake_case from backend
          }));
        }
        
        // ✅ Handle room status updates (e.g., host starts playback)
        if (msg.type === 'update_room_status') {
          if (msg.data.is_screen_sharing) {
            setSessionStatus(prev => ({
              ...prev,
              isActive: true,
              hostId: msg.data.screen_sharing_user_id
            }));
          }
        }
        
        // Handle chat
        if (msg.type === 'chat_message') {
          setChatMessages(prev => [...prev, msg.data]);
        }
        
        // ✅ Handle session ended (auto-ended after host disconnect grace period)
        if (msg.type === 'session_ended') {
          console.log('🔚 Session auto-ended:', msg.data);
          setSessionStatus({
            isActive: false,
            hostId: null
          });
          setActiveSessionId(null);
          
          // Show notification to user
          if (msg.data.reason === 'host_timeout') {
            alert('The watch session has ended because the host did not return within 10 minutes.');
          }
        }
        
      } catch (e) {
        console.error("WebSocket message parse error:", e);
      }
    };

    const handleError = (event) => {
      console.error("WebSocket error:", event);
      setWsError("Connection error");
      setWsConnected(false);
    };

    const handleClose = () => {
      console.log("WebSocket closed");
      setWsConnected(false);
      setWsError(null);
    };

    websocket.addEventListener('open', handleOpen);
    websocket.addEventListener('message', handleMessage); // ✅ ADD THIS
    websocket.addEventListener('error', handleError);
    websocket.addEventListener('close', handleClose);

    return () => {
      websocket.removeEventListener('open', handleOpen);
      websocket.removeEventListener('message', handleMessage); // ✅ CLEANUP
      websocket.removeEventListener('error', handleError);
      websocket.removeEventListener('close', handleClose);
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.close();
      }
      setWs(null);
      wsRef.current = null;
      setWsConnected(false);
    };
  }, [roomId, wsToken]);

  
  // Fetch Authenticated User ID
  useEffect(() => {
    if (room && currentUser) {
      setIsHost(room.host_id === currentUser.id);
    }
  }, [room, currentUser]);



// Add this effect after your existing useEffects
useEffect(() => {
  // This effect runs when isMembersPanelOpen changes to true
  if (isMembersPanelOpen && roomId) {
    const fetchRoomMembers = async () => {
      try {
        const membersData = await getRoomMembers(roomId);
        console.log(`Fetched room members for room ${roomId}:`, membersData);
        setRoomMembers(membersData.members || []);
      } catch (err) {
        console.error("Error fetching room members:", err);
        setRoomMembers([]);
      }
    };
    
    fetchRoomMembers();
  }
}, [isMembersPanelOpen, roomId]);

// ✅ Check for active session on mount and update state
useEffect(() => {
  if (!roomId || !currentUser) return;

  const checkActiveSession = async () => {
    try {
      const sessionRes = await getActiveSession(roomId);
      const sessionData = sessionRes.data;
      
      if (sessionData?.session_id) {
        setActiveSessionId(sessionData.session_id);
        setActiveWatchType(sessionData.watch_type || 'video'); // ✅ Store watch type
        setSessionStatus({ 
          isActive: true, 
          hostId: sessionData.host_id || room?.host_id 
        });
        console.log("✅ Found active session:", sessionData);
      } else {
        setActiveSessionId(null);
        setActiveWatchType(null);
        setSessionStatus({ 
          isActive: false, 
          hostId: room?.host_id 
        });
        console.log("ℹ️ No active session for this room");
      }
    } catch (err) {
      console.error("Failed to check active session:", err);
    }
  };

  checkActiveSession();
}, [roomId, currentUser, room?.host_id]);

// ✅ Auto-refresh when returning from VideoWatch
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      console.log('🔄 RoomPage became visible - refreshing session status and media');
      // Refetch session status
      if (roomId && currentUser) {
        getActiveSession(roomId)
          .then(sessionRes => {
            const sessionData = sessionRes.data;
            if (sessionData?.session_id) {
              setActiveSessionId(sessionData.session_id);
              setSessionStatus({ isActive: true, hostId: room?.host_id });
            } else {
              setActiveSessionId(null);
              setSessionStatus({ isActive: false, hostId: room?.host_id });
            }
          })
          .catch(err => console.error("Failed to refresh session:", err));
        
        // Refetch media items
        getMediaItemsForRoom(roomId)
          .then(items => setMediaItems(items))
          .catch(err => console.error("Failed to refresh media:", err));
      }
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, [roomId, currentUser, room?.host_id]);

// Auto-join room when component mounts (if not already a member)
useEffect(() => {
  if (!roomId || !currentUser) return;

  const autoJoinRoom = async () => {
    try {
      // Optional: Check if already a member (to avoid redundant calls)
      const membersData = await getRoomMembers(roomId);
      const memberList = Array.isArray(membersData) ? membersData : membersData?.members || [];
      const isAlreadyMember = memberList.some(member => 
        member.user_id === currentUser.id || member.id === currentUser.id
      );

      if (!isAlreadyMember) {
        console.log("Auto-joining room:", roomId);
        await apiClient.post(`/api/rooms/${roomId}/join`);
        // Optionally refetch members to update UI
        // setRoomMembers(await getRoomMembers(roomId));
      }
    } catch (err) {
      console.error("Auto-join failed:", err);
      // Optional: handle 404 (room deleted) or auth errors
      if (err.response?.status === 404) {
        setError('Room not found.');
      }
    }
  };

  autoJoinRoom();
}, [roomId, currentUser]);

// ✅ Fetch scheduled events
useEffect(() => {
  const fetchScheduledEvents = async () => {
    if (!roomId) return;
    
    setEventsLoading(true);
    try {
      const response = await getScheduledEvents(roomId);
      setScheduledEvents(response.events || []);
    } catch (err) {
      console.error("Failed to fetch scheduled events:", err);
    } finally {
      setEventsLoading(false);
    }
  };

  fetchScheduledEvents();
}, [roomId]);

// ✅ Request notification permission on mount
useEffect(() => {
  if ('Notification' in window) {
    setNotificationPermission(Notification.permission);
    
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        setNotificationPermission(permission);
      });
    }
  }
}, []);

// ✅ Check for upcoming events and show reminders
useEffect(() => {
  const checkUpcomingEvents = () => {
    const now = new Date();
    
    scheduledEvents.forEach(event => {
      const eventTime = new Date(event.start_time);
      const timeUntilEvent = eventTime - now;
      const minutesUntilEvent = Math.floor(timeUntilEvent / 60000);
      
      // Create unique key for this notification
      const notificationKey = `${event.ID}-${minutesUntilEvent}`;
      
      // Show notification at 5 minutes and 1 minute before event
      if ((minutesUntilEvent === 5 || minutesUntilEvent === 1) && !notifiedEvents.has(notificationKey)) {
        // Mark as notified
        setNotifiedEvents(prev => new Set([...prev, notificationKey]));
        
        // Show in-app toast notification
        toast(`📅 Event "${event.title}" starts in ${minutesUntilEvent} minute${minutesUntilEvent > 1 ? 's' : ''}!`, {
          duration: 10000,
          icon: '⏰',
        });
        
        // Show browser notification if permission granted
        if (notificationPermission === 'granted') {
          new Notification('WeWatch - Scheduled Event', {
            body: `"${event.title}" starts in ${minutesUntilEvent} minute${minutesUntilEvent > 1 ? 's' : ''}!`,
            icon: '/icons/seat.svg',
            badge: '/icons/seat.svg',
            tag: `event-${event.ID}`,
          });
        }
      }
      
      // Show notification when event starts
      if (minutesUntilEvent === 0 && !notifiedEvents.has(`${event.ID}-start`)) {
        setNotifiedEvents(prev => new Set([...prev, `${event.ID}-start`]));
        
        toast.success(`🎬 Event "${event.title}" is starting now!`, {
          duration: 15000,
        });
        
        if (notificationPermission === 'granted') {
          new Notification('WeWatch - Event Starting!', {
            body: `"${event.title}" is starting now!`,
            icon: '/icons/seat.svg',
            badge: '/icons/seat.svg',
            tag: `event-${event.ID}-start`,
            requireInteraction: true,
          });
        }
      }
    });
  };
  
  // Check every 30 seconds
  const interval = setInterval(checkUpcomingEvents, 30000);
  
  // Check immediately on mount
  checkUpcomingEvents();
  
  return () => clearInterval(interval);
}, [scheduledEvents, notificationPermission, notifiedEvents]);
  
  // --- EVENT HANDLERS ---

  // ✅ Handle Begin Watch / Rejoin Watch button click
  const handleBeginWatch = async () => {
    try {
      // Check for existing active session
      const activeSessionResponse = await getActiveSession(roomId);
      const sessionData = activeSessionResponse.data;
      
      if (sessionData?.session_id) {
        // Active session exists - rejoin it with correct watch type
        console.log("✅ Rejoining existing session:", sessionData.session_id, "Type:", sessionData.watch_type);
        const watchType = sessionData.watch_type || 'video';
        
        toast.success(`Rejoining ${watchType === '3d_cinema' ? '3D Cinema' : 'Video Watch'}...`);
        
        // Route to correct watch type
        if (watchType === '3d_cinema') {
          navigate(`/cinema-3d-demo/${roomId}?session_id=${sessionData.session_id}`, {
            state: { isHost, sessionId: sessionData.session_id }
          });
        } else {
          navigate(`/watch/${roomId}?session_id=${sessionData.session_id}`);
        }
      } else {
        // No active session - only host can create
        if (isHost) {
          // Show modal to choose watch type
          setIsWatchTypeModalOpen(true);
        } else {
          toast.error('No active session. Wait for host to start.');
        }
      }
    } catch (error) {
      console.error('Error starting/joining watch:', error);
      toast.error('Failed to join watch session');
    }
  };

  // ✅ Handle watch type selection from modal
  const handleWatchTypeSelected = async (watchType) => {
    try {
      setIsWatchTypeModalOpen(false);
      
      const newSessionResponse = await createWatchSessionForRoom(roomId, watchType);
      const newSessionId = newSessionResponse.data.session_id;
      
      console.log("✅ Created new session:", newSessionId, "Type:", watchType);
      setActiveSessionId(newSessionId);
      setActiveWatchType(watchType);
      
      toast.success(`Starting ${watchType === '3d_cinema' ? '3D Cinema' : 'Video Watch'}...`);
      
      // Route to correct watch type
      if (watchType === '3d_cinema') {
        navigate(`/cinema-3d-demo/${roomId}?session_id=${newSessionId}`, {
          state: { isHost: true, sessionId: newSessionId }
        });
      } else {
        navigate(`/watch/${roomId}?session_id=${newSessionId}`);
      }
    } catch (error) {
      console.error('Error creating watch session:', error);
      toast.error('Failed to start watch session');
    }
  };

  // Handle file selection for upload (MOVED INSIDE RoomPage)
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      console.log("File selected for upload:", file.name);
      setSelectedFile(file);
      setUploadError(null); // Clear previous upload errors
      setUploadProgress(0); // Reset progress when new file is selected
    } else {
      setSelectedFile(null);
      setUploadProgress(0); // Reset progress if no file selected
    }
  };

  // Handle file upload submission (MOVED INSIDE RoomPage)
  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError("Please select a file to upload.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadProgress(0); //Reset Progress at start

    try {
      console.log(`Uploading ${selectedFile.name} to room ${roomId}...`);
      // --- CALL uploadMediaToRoom with the selectedFile OBJECT and progress callback ---
      console.log("handleUpload: About to call uploadMediaToRoom with:", { roomId, selectedFile });
      console.log("handleUpload: Type of selectedFile:", typeof selectedFile);
      console.log("handleUpload: Is selectedFile a File instance?", selectedFile instanceof File);
      if (selectedFile) {
        console.log("handleUpload: Selected file details - Name:", selectedFile.name, "Size:", selectedFile.size);
      }     
      const uploadData = await uploadMediaToRoom(roomId, selectedFile, (progressEvent) => {
        // --- HANDLE UPLOAD PROGRESS ---
        if (progressEvent.lengthComputable) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          console.log(`Upload progress: ${percentCompleted}%`);
          setUploadProgress(percentCompleted); // Update progress state
        }
        // --- --- ---
      });
      
      console.log("Upload successful:", uploadData);
      alert(`Upload successful!`);

      // Clear the selected file state
      setSelectedFile(null);
      setUploadProgress(0); // Reset progress on success
      // Clear the file input field (optional)
      const fileInput = document.getElementById('fileInput');
      if (fileInput) {
      fileInput.value = ''; // Clear the file input field
      console.log("handleUpload: File input field cleared."); // Optional: Log for confirmation
      } else {
        console.warn("handleUpload: Could not find file input element with ID 'fileInput' to clear."); // Optional: Warn if not found
      }

      // Refresh the media items list to show the newly uploaded item
      const updatedMediaData = await getMediaItemsForRoom(roomId);
      setMediaItems(Array.isArray(updatedMediaData) ? updatedMediaData : []);

    } catch (err) {
      console.error("Upload failed:", err);
      if (err.response) {
        // Server responded with an error status (4xx, 5xx)
        setUploadError(`Upload failed: ${err.response.data.error || err.response.statusText}`);
      } else if (err.request) {
        // Request was made but no response received (network issue)
        setUploadError('Network error. Please check your connection.');
      } else {
        // Something else happened in setting up the request
        setUploadError('An unexpected error occurred during upload.');
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Update your handlePlayMedia function to be simpler and more reliable
const handlePlayMedia = (mediaItemId) => {
  console.log(`handlePlayMedia: Play button clicked for media item ID ${mediaItemId}`);

  if (!mediaItemId) {
    console.error("handlePlayMedia: Invalid media item ID provided:", mediaItemId);
    alert("Error: Invalid media item selected.");
    return;
  }

  // Find the media item object from the list using its ID
  const itemToPlay = mediaItems.find(item => item.ID === mediaItemId);
  if (!itemToPlay) {
    console.error(`handlePlayMedia: Media item with ID ${mediaItemId} not found in the current list.`, mediaItems);
    alert(`Error: Media item (ID: ${mediaItemId}) not found. It might have been deleted or the list hasn't refreshed.`);
    return;
  }

  // Update the selected media item state
  setSelectedMediaItem(itemToPlay);
  console.log(`handlePlayMedia: Selected media item updated:`, itemToPlay);

  // Send Playback Command via WebSocket (if connected and user is host)
  if (!isHost) {
    console.log("handlePlayMedia: Not sending WebSocket command (user is not host).");
    alert("Only the room host can control playback.");
    return;
  }

  if (!wsConnected || !wsRef.current) {
    console.log("handlePlayMedia: Not sending WebSocket command (not connected or no WebSocket reference).");
    setWsError("WebSocket connection required for playback control.");
    return;
  }

  if (wsRef.current.readyState !== WebSocket.OPEN) {
    console.warn("handlePlayMedia: WebSocket connection is not open. Cannot send play command.");
    setWsError("WebSocket connection is not open. Cannot send play command.");
    return;
  }

  // Construct and send the playback command
  const playCommand = {
    type: "playback_control",
    command: "play",
    media_item_id: mediaItemId,
    timestamp: Date.now(),
  };

  wsRef.current.send(JSON.stringify(playCommand));
  console.log("handlePlayMedia: Sent playback command via WebSocket:", playCommand);
};

  



  // Toggle the visibility of the media items panel
  const toggleMediaPanel = () => {
    setIsMediaPanelOpen(!isMediaPanelOpen);
  };

  // ✅ Chat Message Handlers
  const handleDeleteMessage = async (messageId) => {
    try {
      console.log(`🗑️ Deleting message ${messageId} from room ${roomId}`);
      const response = await deleteChatMessage(roomId, messageId);
      
      // If deleted by host (soft delete), update message in place
      if (response.deleted_by_host) {
        setChatMessages(prev => prev.map(msg => 
          msg.ID === messageId 
            ? { ...msg, Message: '[Message deleted by host]', DeletedByHost: true }
            : msg
        ));
      } else {
        // Owner deleted their own message (hard delete) - remove from state
        setChatMessages(prev => prev.filter(msg => msg.ID !== messageId));
      }
      
      toast.success('Message deleted');
    } catch (error) {
      console.error('Failed to delete message:', error);
      toast.error('Failed to delete message');
      throw error;
    }
  };

  const handleEditMessage = async (messageId, newMessage) => {
    try {
      console.log(`✏️ Editing message ${messageId} in room ${roomId}`);
      await editChatMessage(roomId, messageId, newMessage);
      // Update local state
      setChatMessages(prev => prev.map(msg => 
        msg.ID === messageId ? { ...msg, Message: newMessage } : msg
      ));
      toast.success('Message updated');
    } catch (error) {
      console.error('Failed to edit message:', error);
      toast.error('Failed to edit message');
      throw error;
    }
  };

  // ✅ Scheduled Events Handlers
  const handleCreateEvent = async (eventData) => {
    try {
      await createScheduledEvent(roomId, eventData);
      toast.success('Event scheduled successfully!');
      
      // Refresh events list
      const response = await getScheduledEvents(roomId);
      setScheduledEvents(response.events || []);
      
      setIsScheduleModalOpen(false);
      setEventToEdit(null);
    } catch (err) {
      console.error('Failed to create event:', err);
      toast.error('Failed to schedule event');
    }
  };

  const handleEditEvent = (eventId) => {
    const event = scheduledEvents.find(e => e.ID === eventId);
    if (event) {
      setEventToEdit(event);
      setIsScheduleModalOpen(true);
    }
  };

  const handleUpdateEvent = async (eventData) => {
    try {
      await updateScheduledEvent(eventToEdit.ID, eventData);
      toast.success('Event updated successfully!');
      
      // Refresh events list
      const response = await getScheduledEvents(roomId);
      setScheduledEvents(response.events || []);
      
      setIsScheduleModalOpen(false);
      setEventToEdit(null);
    } catch (err) {
      console.error('Failed to update event:', err);
      toast.error('Failed to update event');
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm('Are you sure you want to delete this event?')) return;
    
    try {
      await deleteScheduledEvent(eventId);
      toast.success('Event deleted successfully!');
      
      // Refresh events list
      const response = await getScheduledEvents(roomId);
      setScheduledEvents(response.events || []);
    } catch (err) {
      console.error('Failed to delete event:', err);
      toast.error('Failed to delete event');
    }
  };

  const handleJoinOnSchedule = (eventId) => {
    const event = scheduledEvents.find(e => e.ID === eventId);
    if (!event) return;
    
    const eventTime = new Date(event.start_time);
    const now = new Date();
    const timeUntilEvent = eventTime - now;
    
    if (timeUntilEvent <= 0) {
      toast.success('Event is starting! Redirecting to cinema...');
      handleBeginWatch();
    } else {
      const minutes = Math.floor(timeUntilEvent / 60000);
      toast(`Event starts in ${minutes} minute${minutes !== 1 ? 's' : ''}. You'll be notified when it begins!`, {
        duration: 5000,
        icon: '⏰',
      });
    }
  };

  const handleAddToCalendar = async (eventId) => {
    try {
      // Call the API to download the .ics file
      const blob = await downloadICal(eventId);
      
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `event-${eventId}.ics`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Calendar file downloaded! Add it to your calendar app.');
    } catch (err) {
      console.error('Failed to download calendar file:', err);
      toast.error('Failed to download calendar file');
    }
  };

  // --- RENDERING ---

  if (loading) {
    return (
      <div className="container mx-auto p-4 flex justify-center items-center h-64">
        {/* --- ADD LOADING SPINNER --- */}
        <div className="flex items-center">
          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-xl">Loading room details...</p>
        </div>
        {/* --- --- --- */}
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error! </strong>
          <span className="block sm:inline">{error}</span>
          <button
            onClick={() => navigate('/lobby')} // Go back to lobby list
            className="mt-2 bg-gray-500 hover:bg-gray-700 text-white font-bold py-1 px-2 rounded text-xs"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  if (!room) {
      // Shouldn't happen if loading/error are handled, but good practice
      return <div>Room data is unavailable.</div>;
  }

  return (
  <div className="container mx-auto p-4">
    {/* ✅ Toast Notifications */}
    <Toaster position="top-center" />
    
    {/* --- WebSocket Connection Status Display (NEW) --- */}
    <div className="mb-4 p-2 bg-gray-100 rounded text-sm">
      <p><span className="font-semibold">WebSocket Status:</span> 
        {wsConnected ? (
          <span className="text-green-600"> Connected</span>
        ) : (
          <span className="text-red-600"> Disconnected</span>
        )}
      </p>
      {wsError && <p className="text-red-500">Error: {wsError}</p>}
    </div>

    <div className="bg-white shadow-md rounded-lg p-6 mb-6">
      {/* --- Room Header --- */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">{room.name}</h1>
          <p className="text-gray-600 mt-2">{room.description || 'No description provided for this room.'}</p>
        </div>
        {/* --- replace back button text with icon --- */}
        <button
          onClick={() => navigate('/lobby')} // Navigate back to the lobby list
          className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-1 px-3 rounded text-sm"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-1" /> {/* Heroicon */}
          Back to Lobby
        </button>
        {/* --- --- --- */}
      </div>

      {/* --- Room Info Grid (Enhanced with Icons) --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600 mb-6">
        <div className="flex items-center">
          <UserIcon className="h-4 w-4 mr-2 text-gray-500" /> {/* Heroicon */}
          <span><span className="font-semibold">Host:</span> User {room.host_id}</span>
        </div>
        <div className="flex items-center">
          <CalendarIcon className="h-4 w-4 mr-2 text-gray-500" /> {/* Heroicon */}
          <span><span className="font-semibold">Created:</span> {new Date(room.created_at).toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <ServerIcon className="h-4 w-4 mr-2 text-gray-500" /> {/* Heroicon */}
            <span><span className="font-semibold">Status:</span> {room.media_file_name ? 'Media Loaded' : 'No Media'}</span>
          </div>
          <button
            onClick={() => setIsMembersPanelOpen(!isMembersPanelOpen)}
            className="flex items-center bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-full text-xs transition-colors duration-150"
          >
            <UserIcon className="h-3 w-3 mr-1" />
            <span>{roomMembers.length || 0} {roomMembers.length === 1 ? 'member' : 'members'}</span>
          </button>
        </div>
      </div>

      {/* --- Unified Watch Buttons --- */}
      <div className="mt-4 flex gap-3 items-center">
        {/* Standard Watch */}
        <button
          onClick={handleBeginWatch}
          disabled={!isHost && !activeSessionId}
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {activeSessionId ? 'Standard Watch' : (isHost ? 'Begin Standard Watch' : 'Waiting for host...')}
        </button>
        
        {/* ✅ Schedule Event Button (Host Only) */}
        {isHost && (
          <button
            onClick={() => setIsScheduleModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center"
          >
            <CalendarIcon className="h-5 w-5 mr-2" />
            Schedule Event
          </button>
        )}

        {/* ✅ Watch Type Badge (Show when session is active) */}
        {activeSessionId && activeWatchType && (
          <div className={`${
            activeWatchType === '3d_cinema' ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-purple-100 text-purple-800 border-purple-300'
          } px-4 py-2 rounded-lg flex items-center border-2`}>
            <span className="text-lg mr-2">{activeWatchType === '3d_cinema' ? '🎭' : '🎬'}</span>
            <span className="font-semibold">
              {activeWatchType === '3d_cinema' ? '3D Cinema' : 'Video Watch'} Session Active
            </span>
          </div>
        )}
      </div>

      {isMembersPanelOpen && (
        <div className="mb-4">
          <MemberList 
            members={roomMembers} 
            onClose={() => setIsMembersPanelOpen(false)}
            isHost={isHost}
          />
        </div>
      )}

      {/* --- Main Video Player Area --- */}
      <div className="relative mb-6">
        {wsConnected ? (
          <VideoPlayer 
            mediaItem={selectedMediaItem}
            roomId={roomId}
            isHost={isHost}
            authenticatedUserID={currentUser?.id}
            ws={ws}
            wsConnected={wsConnected}
            wsError={wsError}
          />
        ) : (
          <div className="bg-black h-64 flex items-center justify-center">
            <div className="text-white flex items-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Connecting to room...
            </div>
          </div>
        )}
      </div>

      

      {/* --- Collapsible Media Panel Toggle Button (Enhanced with Icon) --- */}
      <div className="flex justify-between items-center mb-4 mt-6">
        <h2 className="text-2xl font-semibold">Media in this Room</h2>
        <button
          onClick={toggleMediaPanel}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm flex items-center"
        >
          {isMediaPanelOpen ? 'Hide Media' : 'Show Media'}
          {/* --- REPLACE SVG WITH HEROICON --- */}
          <ChevronDownIcon className={`ml-2 w-4 h-4 transition-transform duration-200 ${isMediaPanelOpen ? 'rotate-180' : ''}`} />
          {/* --- --- --- */}
        </button>
      </div>

      {/* --- Collapsible Media Panel Content --- */}
      {isMediaPanelOpen && (
        <div className="border border-gray-200 rounded-lg p-4 mb-6 transition-all duration-300 ease-in-out">
          {/* --- Upload Media Section (Enhanced with Progress Bar) --- */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="text-lg font-medium text-blue-800 mb-2 flex items-center">
              <PlusIcon className="h-5 w-5 mr-2" /> {/* Heroicon */}
              Upload Media to this Room
            </h3>

            {/* File Input */}
            <div className="mb-3">
              <label htmlFor="fileInput" className="block text-sm font-medium text-gray-700 mb-1">
                Choose a video file:
              </label>
              <input
                type="file"
                id="fileInput"
                accept=".mp4,.avi,.mov,.mkv,.webm" // Restrict file types
                onChange={handleFileChange}
                disabled={uploading}
                className="block w-full text-sm text-gray-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-md file:border-0
                          file:text-sm file:font-semibold
                          file:bg-blue-50 file:text-blue-700
                          hover:file:bg-blue-100
                          disabled:opacity-50"
              />
            </div>

            {/* Upload Button & Status */}
            <div className="flex items-center">
              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                  !selectedFile || uploading
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                }`}
              >
                {/* --- ENHANCE BUTTON WITH ICON AND PROGRESS SPINNER --- */}
                {uploading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Uploading...
                  </>
                ) : (
                  <>
                    <ArrowUpTrayIcon className="h-4 w-4 mr-2" /> {/* Heroicon */}
                    Upload
                  </>
                )}
                {/* --- --- --- */}
              </button>

              {/* Optional: Display selected file name */}
              {selectedFile && (
                <span className="ml-3 text-sm text-gray-600 truncate max-w-xs md:max-w-md">
                  Selected: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                </span>
              )}
            </div>


            {/* --- ADD UPLOAD PROGRESS BAR --- */}
            {uploading && (
              <div className="mt-3 w-full">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Progress:</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              </div>
            )}
            {/* --- --- --- */}

            {/* Upload Error Message */}
            {uploadError && (
              <div className="mt-2 text-sm text-red-600">
                {uploadError}
              </div>
            )}
          </div>

          {/* --- Media Items List --- */}
          <div>
            <h3 className="text-lg font-medium text-gray-800 mb-2">Uploaded Files</h3>

            {/* Media Loading State (Enhanced with Spinner) */}
            {mediaLoading && (
              <div className="flex justify-center items-center h-32">
                {/* --- ADD LOADING SPINNER --- */}
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-lg">Loading media items...</p>
                </div>
                {/* --- --- --- */}
              </div>
            )}

            {/* Media Error State */}
            {mediaError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                <strong className="font-bold">Error: </strong>
                <span className="block sm:inline">{mediaError}</span>
              </div>
            )}

            {/* Media Items Display (Only if not loading and no error) */}
            {!mediaLoading && !mediaError && (
              <>
                {/* Check if there are media items */}
                {mediaItems && mediaItems.length > 0 ? (
                  <div className="overflow-y-auto max-h-96"> {/* Add scroll if list is long */}
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size (MB)</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uploader</th>
                          <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {/* Map over media items */}
                        {mediaItems.map((item) => (
                          <tr key={item.ID} className="hover:bg-gray-50"> {/* Use item.ID for key */}
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.original_name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{(item.file_size / (1024 * 1024)).toFixed(2)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">User {item.uploader_id}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <button
                                onClick={() => handlePlayMedia(item.ID)} // Use item.ID for onClick
                                className={`${
                                  selectedMediaItem && selectedMediaItem.ID === item.ID // Use item.ID for comparison
                                    ? 'text-blue-800 font-bold' 
                                    : 'text-indigo-600 hover:text-indigo-900'
                                    }flex items-center justify-end w-full`} // Change button style for selected item
                              >
                                {/* --- REPLACE TEXT WITH ICON --- */}
                                <PlayIcon className="h-4 w-4 mr-1" /> {/* Heroicon */}
                                
                                {/* --- --- --- */}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-10">
                    {/* --- ENHANCE EMPTY STATE WITH ICON --- */}
                    <FilmIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" /> {/* Heroicon */}
                    <p className="text-gray-500">No media items uploaded to this room yet.</p>
                    {/* --- --- --- */}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* --- Chat Panel (At Bottom) --- */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-2">Room Chat</h3>
        <div className="h-64"> {/* fixed height for chat panel */}
          <ChatPanel
            roomId={roomId}
            ws={ws}
            wsConnected={wsConnected}
            authenticatedUserID={currentUser?.id} // ✅ Fixed!
            isHost={isHost}
            chatMessages={chatMessages}
            setChatMessages={setChatMessages}
            onDelete={handleDeleteMessage}
            onEdit={handleEditMessage}
          />
        </div>
      </div>
    </div>

    {/* ✅ Scheduled Events Sidebar */}
    <Sidebar
      scheduledEvents={scheduledEvents}
      isSidebarOpen={isSidebarOpen}
      setIsSidebarOpen={setIsSidebarOpen}
      isHovering={isHovering}
      setIsHovering={setIsHovering}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      handleEditEvent={handleEditEvent}
      handleDeleteEvent={handleDeleteEvent}
      handleJoinOnSchedule={handleJoinOnSchedule}
      handleAddToCalendar={handleAddToCalendar}
      isHost={isHost}
      isMobile={false}
    />

    {/* ✅ Watch Type Selection Modal */}
    <WatchTypeModal
      isOpen={isWatchTypeModalOpen}
      onClose={() => setIsWatchTypeModalOpen(false)}
      onSelectType={handleWatchTypeSelected}
    />

    {/* ✅ Schedule Event Modal */}
    {isScheduleModalOpen && (
      <ScheduleEventModal
        roomId={roomId}
        mediaItems={mediaItems}
        onClose={() => {
          setIsScheduleModalOpen(false);
          setEventToEdit(null);
        }}
        onCreate={eventToEdit ? handleUpdateEvent : handleCreateEvent}
        eventToEdit={eventToEdit}
      />
    )}

    {/* ✅ Members Panel Modal */}
    {isMembersPanelOpen && (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold">Room Members</h3>
            <button
              onClick={() => setIsMembersPanelOpen(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          <MemberList members={roomMembers} />
        </div>
      </div>
    )}
  </div>
);
};

export default RoomPage;