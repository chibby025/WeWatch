// src/pages/LectureHallPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuth from '../hooks/useAuth';
import apiClient from '../services/api';
import useWebSocket from '../hooks/useWebSocket';
import { hasTicketCache, clearTicketCache } from '../utils/ticketCache';
import LectureHallScene3D from '../components/cinema/3d-cinema/LectureHallScene3D';
import Taskbar from '../components/Taskbar';
import { getLectureHallSeatById, assignUserToLectureHallSeat, getLectureHallHostSeat } from '../components/cinema/3d-cinema/seatCalculator';
import { useSeatSwap } from '../hooks/useSeatSwap';
import SeatSwapNotification from '../components/cinema/ui/SeatSwapNotification';
import LectureHallMembersModal from '../components/LectureHallMembersModal';
import useLectureHallAudio from '../hooks/useLectureHallAudio';
import ChatHomeModal from '../components/ChatHomeModal';
import PrivateChatModal from '../components/PrivateChatModal';
import { getChatHistory } from '../services/api';
import LectureHallSeatsGrid from '../components/cinema/ui/LectureHallSeatsGrid';
import lectureHallCameraPositions from '../data/lectureHallCameraPositions';
import { lectureHallLeftRightViews } from '../data/lectureHallLeftRightViews';
import SessionEarningsModal from '../components/SessionEarningsModal';

export default function LectureHallPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get session info from URL or state
  const { isHost: isHostFromState = false, sessionId: sessionIdFromState, classType } = location.state || {};
  const urlParams = new URLSearchParams(window.location.search);
  const sessionIdFromUrl = urlParams.get('session_id');
  const finalSessionId = sessionIdFromState || sessionIdFromUrl;
  
  const { currentUser, loading: authLoading } = useAuth();
  
  // Get WebSocket token from sessionStorage (JWT, not session_id)
  const wsToken = sessionStorage.getItem('wewatch_ws_token');
  
  // State
  const [roomMembers, setRoomMembers] = useState([]);
  const [userSeats, setUserSeats] = useState({});
  const [isViewLocked, setIsViewLocked] = useState(true);
  const [lightsOn, setLightsOn] = useState(true);
  const [showSeatMarkers, setShowSeatMarkers] = useState(false);
  const [showCameraMarkers, setShowCameraMarkers] = useState(false);
  const [currentSeat, setCurrentSeat] = useState(null);
  const [swapNotification, setSwapNotification] = useState(null);
  
  // Raise hand & broadcasting state
  const [handRaised, setHandRaised] = useState(false);
  const [hasHostApproval, setHasHostApproval] = useState(false);
  const [raisedHands, setRaisedHands] = useState([]); // [{userId, username, seatId}]
  const [approvedSpeakers, setApprovedSpeakers] = useState({}); // {userId: true}
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isSeatsModalOpen, setIsSeatsModalOpen] = useState(false);
  
  // Chat state
  const [showChatHome, setShowChatHome] = useState(false);
  const [sessionChatMessages, setSessionChatMessages] = useState([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [privateMessages, setPrivateMessages] = useState({}); // {userId: [messages]}
  const [privateChatOpen, setPrivateChatOpen] = useState(false);
  const [privateChatUserId, setPrivateChatUserId] = useState(null);
  
  // Earnings modal state
  const [showEarningsModal, setShowEarningsModal] = useState(false);
  const [sessionEarnings, setSessionEarnings] = useState(null);
  
  // View switching state
  const [currentViewDirection, setCurrentViewDirection] = useState('center'); // 'center', 'left', 'right'
  const [selectedSeatId, setSelectedSeatId] = useState(null);
  
  // Remote users' audio states
  const [remoteAudioStates, setRemoteAudioStates] = useState({}); // {userId: boolean}
  
  // Camera position tracking
  const [cameraPosition, setCameraPosition] = useState({ position: ['0', '0', '0'], rotation: ['0', '0', '0'], lookingAt: ['0', '0', '0'] });
  
  // Refs
  const triggerLocalEmoteRef = useRef(null);
  
  // WebSocket connection
  const { sendMessage, messages, isConnected, disconnect } = useWebSocket(
    roomId,
    wsToken,
    finalSessionId
  );
  
  // Compute last message from messages array
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  // 🎫 Ticket enforcement - check on mount for paid sessions
  useEffect(() => {
    const checkTicket = async () => {
      if (!finalSessionId || !currentUser) return;
      
      try {
        // Get session details to check if ticketing is enabled
        const response = await apiClient.get(`/api/rooms/${roomId}/active-session`);
        const sessionDetails = response.data;
        
        if (!sessionDetails || sessionDetails.session_id !== finalSessionId) {
          console.log('❌ [LectureHall] Session not found or mismatch');
          return;
        }
        
        const isUserHost = currentUser.id === sessionDetails.host_id;
        
        if (sessionDetails.ticketing_enabled && !isUserHost) {
          console.log('🎟️ [LectureHall] Paid session detected, checking ticket...');
          
          // Check cache first
          if (!hasTicketCache(sessionDetails.id)) {
            console.log('❌ [LectureHall] No ticket found - redirecting to room page');
            toast.error('This is a paid session. Please purchase a ticket.');
            navigate(`/rooms/${roomId}?openTicketModal=true`);
            return;
          }
          
          console.log('✅ [LectureHall] Ticket verified in cache');
        }
      } catch (err) {
        console.error('❌ [LectureHall] Failed to check ticket:', err);
      }
    };
    
    checkTicket();
  }, [finalSessionId, currentUser, roomId, navigate]);

  // Audio management with raise hand system
  const {
    hasMicPermission,
    isAudioActive,
    localStream,
    audioDevices,
    selectedAudioDeviceId,
    requestMicPermission,
    toggleAudio,
    changeAudioDevice,
    getAudioRecipients,
  } = useLectureHallAudio({
    isHost: isHostFromState,
    hasHostApproval,
    userSeats,
    authenticatedUserID: currentUser?.id,
    roomMembers,
    approvedSpeakers,
    sendMessage,
    sessionId: finalSessionId,
  });

  // Seat swap functionality
  const {
    seatSwapRequest,
    handleSeatSwapMessage,
    sendSwapRequest,
    acceptSwap,
    declineSwap
  } = useSeatSwap({
    sendMessage,
    currentUser,
    onSwapAccepted: (data) => {
      // Update current seat after successful swap
      const newSeat = getLectureHallSeatById(data.target_seat);
      if (newSeat) {
        setCurrentSeat(newSeat);
        setSwapNotification({
          message: `✅ Swapped to Seat #${newSeat.id}`,
          type: 'success'
        });
      }
    }
  });

  // Initialize user seat
  useEffect(() => {
    if (!currentUser) return;
    
    // Assign seat based on host status
    let assignedSeat;
    if (isHostFromState) {
      // Host gets the gold marker position (seat 145)
      assignedSeat = getLectureHallHostSeat();
      console.log('👨‍🏫 [LectureHallPage] Host assigned to teacher position:', assignedSeat);
    } else {
      // Students get regular seats (1-144)
      assignedSeat = assignUserToLectureHallSeat(currentUser.id);
      console.log('🎓 [LectureHallPage] Student assigned to seat:', assignedSeat.id);
    }
    
    setCurrentSeat(assignedSeat);
    
    // Notify server of seat assignment
    if (sendMessage && assignedSeat) {
      sendMessage({
        type: 'take_seat',
        seat_id: String(assignedSeat.id),
        user_id: currentUser.id,
        row: assignedSeat.row,
        column: assignedSeat.column,
        is_host: assignedSeat.isHost || false
      });
    }
  }, [currentUser, sendMessage, isHostFromState]);

  // ✅ CRITICAL: Cleanup on component unmount (handles back button, navigation, etc.)
  useEffect(() => {
    return () => {
      console.log('🧹 [LectureHallPage] Component unmounting, cleaning up...');
      
      // Stop audio tracks
      if (localStream) {
        localStream.getTracks().forEach(track => {
          track.stop();
          console.log('🔇 [LectureHallPage] Stopped audio track');
        });
      }
      
      // Send leave message
      if (sendMessage && currentUser) {
        sendMessage({
          type: 'leave_session',
          user_id: currentUser.id
        });
        console.log('📤 [LectureHallPage] Sent leave_session message');
      }
      
      // Close WebSocket connection
      if (disconnect) {
        console.log('🔌 [LectureHallPage] Closing WebSocket on unmount...');
        disconnect();
      }
    };
  }, [localStream, sendMessage, currentUser, disconnect]);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;
    
    const data = lastMessage;
    
    // Try to handle seat swap messages first
    if (handleSeatSwapMessage(data)) {
      return; // Message was handled by seat swap hook
    }
    
    switch (data.type) {
      case 'raise_hand':
        // Student raised hand (host receives this)
        if (isHostFromState && data.user_id !== currentUser?.id) {
          setRaisedHands(prev => {
            // Avoid duplicates
            if (prev.find(h => h.userId === data.user_id)) return prev;
            return [...prev, {
              userId: data.user_id,
              username: data.username || `User ${data.user_id}`,
              seatId: data.seat_id
            }];
          });
          toast(`🙋 ${data.username || 'Student'} raised their hand`, { duration: 3000 });
        }
        break;
        
      case 'hand_raised_response':
        // Student receives approval/denial
        if (data.user_id === currentUser?.id) {
          if (data.approved) {
            setHasHostApproval(true);
            setHandRaised(false);
            toast.success('✅ Host approved - You can now speak to everyone!');
          } else {
            setHandRaised(false);
            toast('❌ Hand lowered', { duration: 2000 });
          }
        }
        break;
        
      case 'speaker_approved':
        // Broadcast to all: This user is now approved speaker
        setApprovedSpeakers(prev => ({
          ...prev,
          [data.user_id]: true
        }));
        // Remove from raised hands if they were there
        setRaisedHands(prev => prev.filter(h => h.userId !== data.user_id));
        break;
        
      case 'speaker_revoked':
        // Broadcast to all: This user is no longer approved
        if (data.user_id === currentUser?.id) {
          setHasHostApproval(false);
          toast('Host revoked broadcast permission', { duration: 3000 });
        }
        setApprovedSpeakers(prev => {
          const updated = { ...prev };
          delete updated[data.user_id];
          return updated;
        });
        break;
        
      case 'user_speaking':
        // Track remote users' audio states
        if (data.user_id && data.user_id !== currentUser?.id) {
          setRemoteAudioStates(prev => ({
            ...prev,
            [data.user_id]: data.speaking === true
          }));
          
          // Log for debugging
          const scope = data.broadcast_scope || 'unknown';
          console.log(`[Audio] User ${data.user_id} is ${data.speaking ? 'speaking' : 'muted'} (scope: ${scope})`);
        }
        break;
        
      case 'seat_taken':
        setUserSeats(prev => ({
          ...prev,
          [data.user_id]: data.seat_id
        }));
        break;
        
      case 'user_joined':
        if (data.user && !roomMembers.find(m => m.id === data.user.id)) {
          setRoomMembers(prev => [...prev, data.user]);
          toast(`${data.user.username} joined`, { icon: '👋', duration: 2000 });
        }
        break;
        
      case 'user_left':
        setRoomMembers(prev => prev.filter(m => m.id !== data.user_id));
        setUserSeats(prev => {
          const newSeats = { ...prev };
          delete newSeats[data.user_id];
          return newSeats;
        });
        break;
        
      case 'room_chat':
        // Add message to session chat
        setSessionChatMessages(prev => [
          ...prev,
          {
            ID: Date.now(),
            UserId: data.user_id,
            Username: data.username || `User ${data.user_id}`,
            Message: data.message,
            CreatedAt: new Date().toISOString()
          }
        ]);
        break;
        
      case 'private_message':
        // Received private message
        const senderId = data.from_user_id || data.user_id;
        setPrivateMessages(prev => ({
          ...prev,
          [senderId]: [
            ...(prev[senderId] || []),
            {
              ID: Date.now(),
              UserId: senderId,
              Username: data.username || `User ${senderId}`,
              Message: data.message,
              CreatedAt: new Date().toISOString(),
              isSent: false
            }
          ]
        }));
        break;
        
      case 'session_ended':
        // Clear ticket cache for this session
        if (finalSessionId) {
          clearTicketCache(data?.session_id || finalSessionId);
          console.log('🗑️ [LectureHall] Cleared ticket cache for ended session');
        }
        
        // ✅ Store session data for rating modal (if not the host)
        const isCurrentUserHost = currentUser?.id === data?.host_id;
        if (!isCurrentUserHost && data?.session_id) {
          console.log('⭐ [LectureHall] Storing session data for rating modal');
          sessionStorage.setItem(`pending_rating_${roomId}`, JSON.stringify({
            sessionId: data.session_id,
            hostId: data.host_id,
            hostName: data.host_name || 'Unknown Host',
            sessionTitle: data.session_title || 'Untitled Session',
            watchType: data.watch_type,
          }));
        }
        
        toast.error('Session has ended');
        setTimeout(() => navigate(`/room/${roomId}`), 2000);
        break;
        
      case 'ticket_required':
        // Backend rejected connection - no ticket for paid session
        console.log('❌ [LectureHall] Ticket required:', data);
        toast.error('This is a paid session. Please purchase a ticket.');
        setTimeout(() => {
          navigate(`/rooms/${roomId}?openTicketModal=true`);
        }, 1000);
        break;
        
      default:
        break;
    }
  }, [lastMessage, roomMembers, navigate, roomId, handleSeatSwapMessage]);

  // Show seat swap request notification
  useEffect(() => {
    if (seatSwapRequest) {
      setSwapNotification({
        message: `${seatSwapRequest.requesterName} wants to swap seats`,
        type: 'info',
        isRequest: true
      });
    }
  }, [seatSwapRequest]);

  // Handle emote received
  const handleEmoteReceived = (emoteData) => {
    // Handle emote display in avatars
  };

  // Handle chat message received
  const handleChatMessageReceived = (messageData) => {
    // Handle chat messages
  };

  // Handle emote send
  const handleEmoteSend = (emote, seatId, userId) => {
    if (sendMessage) {
      sendMessage({
        type: 'emote',
        emote,
        seat_id: seatId,
        user_id: userId
      });
    }
  };

  // Handle avatar click - request seat swap
  const handleAvatarClick = (userId) => {
    console.log('Avatar clicked:', userId);
    
    // Don't allow swapping with yourself or if you're the host
    if (userId === currentUser?.id || currentSeat?.isHost) {
      return;
    }
    
    // Get target user's seat
    const targetSeatId = userSeats[userId];
    if (targetSeatId) {
      sendSwapRequest(userId, targetSeatId);
      setSwapNotification({
        message: `Seat swap request sent`,
        type: 'info'
      });
    }
  };

  // Handle raise hand (student action)
  const handleRaiseHand = () => {
    if (currentSeat?.isHost || handRaised) return;
    
    setHandRaised(true);
    if (sendMessage) {
      sendMessage({
        type: 'raise_hand',
        user_id: currentUser.id,
        username: currentUser.username,
        seat_id: currentSeat?.id
      });
    }
    toast('🙋 Hand raised - Waiting for host approval', { duration: 3000 });
  };
  
  // Handle lower hand (student cancels request)
  const handleLowerHand = () => {
    setHandRaised(false);
    if (sendMessage) {
      sendMessage({
        type: 'lower_hand',
        user_id: currentUser.id
      });
    }
  };
  
  // Handle approve speaker (host action)
  const handleApproveSpeaker = (userId) => {
    if (!isHostFromState) return;
    
    if (sendMessage) {
      sendMessage({
        type: 'approve_speaker',
        user_id: userId,
        approved_by: currentUser.id
      });
    }
    
    // Remove from raised hands locally
    setRaisedHands(prev => prev.filter(h => h.userId !== userId));
    toast.success('✅ Speaker approved');
  };
  
  // Handle deny/revoke speaker (host action)
  const handleRevokeSpeaker = (userId) => {
    if (!isHostFromState) return;
    
    if (sendMessage) {
      sendMessage({
        type: 'revoke_speaker',
        user_id: userId,
        revoked_by: currentUser.id
      });
    }
    
    // Remove from raised hands
    setRaisedHands(prev => prev.filter(h => h.userId !== userId));
  };

  // Switch camera view direction (left/center/right) for selected seat
  const switchViewDirection = (direction) => {
    if (!currentSeat || !currentSeat.id) {
      console.warn('Cannot switch view: No seat selected');
      return;
    }

    const seatId = currentSeat.id;
    const seatData = lectureHallCameraPositions[seatId];
    
    if (!seatData) {
      console.warn(`No camera data for seat ${seatId}`);
      return;
    }

    // Get lookingAt based on direction
    let lookingAtPos;
    if (direction === 'left') {
      const leftRightData = lectureHallLeftRightViews[seatId];
      if (!leftRightData?.left) {
        console.warn(`No left view data for seat ${seatId}`);
        return;
      }
      lookingAtPos = leftRightData.left;
    } else if (direction === 'right') {
      const leftRightData = lectureHallLeftRightViews[seatId];
      if (!leftRightData?.right) {
        console.warn(`No right view data for seat ${seatId}`);
        return;
      }
      lookingAtPos = leftRightData.right;
    } else {
      // center
      lookingAtPos = seatData.lookingAt;
    }

    // Update camera position to match the seat (in case user moved)
    // This ensures view switching always snaps back to saved seat position
    setCameraPosition({
      position: [seatData.position.x, seatData.position.y, seatData.position.z],
      lookingAt: [lookingAtPos.x, lookingAtPos.y, lookingAtPos.z],
      rotation: ['0', '0', '0']
    });

    setCurrentViewDirection(direction);
    console.log(`👁️ Switched to ${direction.toUpperCase()} view for seat ${seatId}`);
  };

  // Handle chat open
  const handleOpenChat = () => {
    setShowChatHome(true);
  };
  
  // Open room chat
  const handleOpenRoomChat = async () => {
    setShowChatHome(false);
    setIsChatOpen(true);
    setIsChatLoading(true);
    try {
      const response = await getChatHistory(roomId, finalSessionId);
      setSessionChatMessages(response.data || []);
    } catch (error) {
      console.error('[LectureHallPage] Failed to load chat history:', error);
      toast.error('Failed to load chat history');
    } finally {
      setIsChatLoading(false);
    }
  };
  
  // Open private chat with user
  const handleOpenPrivateChat = (userId) => {
    setShowChatHome(false);
    setPrivateChatUserId(userId);
    setPrivateChatOpen(true);
  };
  
  // Send room chat message
  const handleSendRoomMessage = (message) => {
    if (sendMessage && message.trim()) {
      sendMessage({
        type: 'room_chat',
        message: message.trim(),
        username: currentUser?.username,
        user_id: currentUser?.id
      });
    }
  };
  
  // Send private message
  const handleSendPrivateMessage = (message) => {
    if (sendMessage && message.trim() && privateChatUserId) {
      sendMessage({
        type: 'private_message',
        to_user_id: privateChatUserId,
        message: message.trim(),
        username: currentUser?.username,
        user_id: currentUser?.id
      });
      
      // Add to local state
      setPrivateMessages(prev => ({
        ...prev,
        [privateChatUserId]: [
          ...(prev[privateChatUserId] || []),
          {
            ID: Date.now(),
            UserId: currentUser?.id,
            Username: currentUser?.username,
            Message: message.trim(),
            CreatedAt: new Date().toISOString(),
            isSent: true
          }
        ]
      }));
    }
  };
  
  // Handle seats modal
  const handleSeatsClick = () => {
    setIsSeatsModalOpen(true);
  };
  
  // Handle taking a seat
  const handleTakeSeat = (seatId) => {
    if (!currentUser || !sendMessage) return;
    
    const seat = getLectureHallSeatById(seatId);
    if (!seat) return;
    
    setCurrentSeat(seat);
    setSelectedSeatId(seatId);
    setCurrentViewDirection('center'); // Reset to center view
    
    // Notify server
    sendMessage({
      type: 'take_seat',
      seat_id: String(seatId),
      user_id: currentUser.id,
      row: seat.row,
      column: seat.column,
      is_host: seat.isHost || false
    });
    
    toast.success(`Moved to Seat #${seatId}`);
  };
  
  // Handle seat swap request
  const handleSeatSwapRequest = (targetUserId, targetSeatId) => {
    if (!currentUser || currentSeat?.isHost) return;
    
    sendSwapRequest(targetUserId, targetSeatId);
    toast('Seat swap request sent', { duration: 2000 });
  };
  

  
  // Handle share room
  const handleShareRoom = () => {
    const roomUrl = `${window.location.origin}/rooms/${roomId}`;
    navigator.clipboard.writeText(roomUrl).then(() => {
      alert('Room link copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy:', err);
      alert(`Room link: ${roomUrl}`);
    });
  };

  // Handle exit/leave session
  const handleExit = async () => {
    // Check if current user is the host
    const currentIsHost = isHostFromState || currentUser?.id === sessionStatus?.hostId;
    
    if (currentIsHost) {
      // Host: Show confirmation dialog
      const confirmed = window.confirm(
        "End this lecture hall session for everyone? All participants will be returned to the room page."
      );
      
      if (!confirmed) {
        return; // User canceled, stay in session
      }
      
      // Host confirmed: End the session
      try {
        if (finalSessionId) {
          console.log('🛑 [LectureHallPage] Host ending session:', finalSessionId);
          
          // ✅ Fetch session earnings before ending (for paid sessions)
          try {
            const sessionResponse = await apiClient.get(`/api/rooms/${roomId}/active-session`);
            const sessionData = sessionResponse.data;
            
            if (sessionData.ticketing_enabled && sessionData.total_ticket_revenue > 0) {
              console.log('📊 [LectureHallPage] Paid session detected, storing earnings data');
              setSessionEarnings(sessionData);
            }
          } catch (earningsErr) {
            console.error('⚠️ [LectureHallPage] Failed to fetch session earnings:', earningsErr);
            // Continue with session end even if earnings fetch fails
          }
          
          await apiClient.post(`/api/rooms/${roomId}/sessions/${finalSessionId}/end`);
          console.log('✅ [LectureHallPage] Session ended successfully');
          
          // Set flag to prevent showing stale session UI on RoomPage
          sessionStorage.setItem(`session_ended_${roomId}`, 'true');
          
          // Small delay to ensure backend broadcasts before navigation
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (error) {
        console.error('❌ [LectureHallPage] Failed to end session:', error);
        // Continue with cleanup even if API call fails
      }
    } else {
      // Non-host: Just leaving (not ending session)
      console.log('👋 [LectureHallPage] Non-host leaving session (session continues)');
    }
    
    // Cleanup and exit (both host and members)
    try {
      // 1. Stop audio if active
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      
      // 2. Notify backend to clear seat assignment
      if (sendMessage && currentUser) {
        sendMessage({
          type: 'leave_session',
          user_id: currentUser.id
        });
      }
      
      // 3. ✅ IMPORTANT: Close WebSocket connection before navigation
      // This ensures backend receives the disconnect event and marks member as inactive
      if (disconnect) {
        console.log('🔌 [LectureHallPage] Closing WebSocket connection...');
        await disconnect(); // Now returns a Promise that resolves when close completes
        console.log('✅ [LectureHallPage] WebSocket disconnect complete');
      }
      
      console.log('✅ [LectureHallPage] Cleanup complete, navigating away...');
    } catch (error) {
      console.error('❌ [LectureHallPage] Error during cleanup:', error);
    }
    
    // 4. Show earnings modal if host ended paid session with earnings, otherwise navigate immediately
    if (currentIsHost && sessionEarnings && sessionEarnings.total_ticket_revenue > 0) {
      console.log('📊 [LectureHallPage] Showing earnings modal before navigation');
      setShowEarningsModal(true);
    } else {
      // Navigate to room page using React Router (respects lifecycle better than location.href)
      navigate(`/rooms/${roomId}`, { replace: true });
    }
  };

  if (authLoading) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!currentUser) {
    navigate('/login');
    return null;
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* 3D Lecture Hall Scene */}
      <LectureHallScene3D
        authenticatedUserID={currentUser.id}
        currentUserSeat={currentSeat}
        roomMembers={roomMembers}
        userSeats={userSeats}
        remoteParticipants={new Map()}
        isViewLocked={isViewLocked}
        setIsViewLocked={setIsViewLocked}
        lightsOn={lightsOn}
        setLightsOn={setLightsOn}
        showSeatMarkers={showSeatMarkers}
        showCameraMarkers={showCameraMarkers}
        showPositionDebug={false}
        onEmoteReceived={handleEmoteReceived}
        onChatMessageReceived={handleChatMessageReceived}
        onEmoteSend={handleEmoteSend}
        onAvatarClick={handleAvatarClick}
        triggerLocalEmoteRef={triggerLocalEmoteRef}
        onPositionUpdate={setCameraPosition}
      />

      {/* Taskbar */}
      <Taskbar
        watchType="classroom"
        classType={classType || 'lecture_hall'}
        authenticatedUserID={currentUser.id}
        isAudioActive={isAudioActive}
        toggleAudio={toggleAudio}
        isCameraOn={false}
        toggleCamera={() => {}}
        audioDevices={audioDevices}
        selectedAudioDeviceId={selectedAudioDeviceId}
        onAudioDeviceChange={changeAudioDevice}
        hasMicPermission={hasMicPermission}
        onRequestMicPermission={requestMicPermission}
        onLeaveCall={handleExit}
        openChat={handleOpenChat}
        onSeatsClick={handleSeatsClick}
        onShareRoom={handleShareRoom}
        isViewLocked={isViewLocked}
        setIsViewLocked={setIsViewLocked}
        lightsOn={lightsOn}
        setLightsOn={setLightsOn}
        onToggleSeatMarkers={() => setShowSeatMarkers(!showSeatMarkers)}
        showSeatMarkers={showSeatMarkers}
        roomId={roomId}
        sessionId={finalSessionId}
        isHost={isHostFromState}
        userSeats={userSeats}
        // Raise hand props
        handRaised={handRaised}
        hasHostApproval={hasHostApproval}
        onRaiseHand={handleRaiseHand}
        onLowerHand={handleLowerHand}
        raisedHands={raisedHands}
        onApproveSpeaker={handleApproveSpeaker}
        onRevokeSpeaker={handleRevokeSpeaker}
        approvedSpeakers={approvedSpeakers}
        roomMembers={roomMembers}
        onMembersClick={() => setIsMembersModalOpen(true)}
        // Additional props to avoid warnings
        showProgram={true} // Enable Board button for lecture hall
        showEmotes={false}
        showVideoToggle={false}
      />

      {/* Connection Status */}
      {!isConnected && (
        <div className="absolute top-4 right-4 bg-yellow-900 text-yellow-100 px-4 py-2 rounded-lg shadow-lg">
          🔄 Connecting...
        </div>
      )}

      {/* Seat Info */}
      {currentSeat && (
        <div className="absolute top-4 left-4 bg-black bg-opacity-75 text-white px-4 py-3 rounded-lg shadow-lg space-y-3">
          <div className="text-sm font-semibold">
            {currentSeat.isHost ? (
              <>👨‍🏫 Host Position</>
            ) : (
              <>
                🎓 Seat #{currentSeat.id}
                <span className="ml-2 text-gray-400">
                  Row {currentSeat.row} • Column {currentSeat.column}
                </span>
              </>
            )}
          </div>
          
          {/* Host Controls - Only visible to host */}
          {isHostFromState && (
            <div className="pt-2 border-t border-gray-700 space-y-2">
              <div className="text-xs text-gray-400 font-medium">Host Views</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleTakeSeat(145)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    currentSeat.id === 145
                      ? 'bg-purple-600 ring-2 ring-purple-400 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  👀 Look at Class
                </button>
                <button
                  onClick={() => handleTakeSeat(146)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    currentSeat.id === 146
                      ? 'bg-blue-600 ring-2 ring-blue-400 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  📋 Look at Board
                </button>
              </div>
            </div>
          )}
          
          {/* View Direction Controls - All users */}
          {currentSeat.id && (
            <div className="pt-2 border-t border-gray-700">
              <div className="text-xs text-gray-400 font-medium mb-2">
                👁️ View Direction
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => switchViewDirection('left')}
                  disabled={!lectureHallLeftRightViews[currentSeat.id]?.left}
                  className={`px-3 py-2 rounded-lg font-medium text-xs transition-all ${
                    currentViewDirection === 'left'
                      ? 'bg-blue-600 ring-2 ring-blue-400 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  ← Left
                </button>
                <button
                  onClick={() => switchViewDirection('center')}
                  className={`px-3 py-2 rounded-lg font-medium text-xs transition-all ${
                    currentViewDirection === 'center'
                      ? 'bg-purple-600 ring-2 ring-purple-400 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  • Center
                </button>
                <button
                  onClick={() => switchViewDirection('right')}
                  disabled={!lectureHallLeftRightViews[currentSeat.id]?.right}
                  className={`px-3 py-2 rounded-lg font-medium text-xs transition-all ${
                    currentViewDirection === 'right'
                      ? 'bg-green-600 ring-2 ring-green-400 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  Right →
                </button>
              </div>
            </div>
          )}
          
          {/* Movement Lock Toggle - Super Admin Only */}
          {currentUser?.role === 'super_admin' && (
            <div className="pt-2 border-t border-gray-700">
              <button
                onClick={() => setIsViewLocked(!isViewLocked)}
                className={`w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isViewLocked
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-green-600 hover:bg-green-500 text-white'
                }`}
              >
                {isViewLocked ? '🔒 Locked (Click to Unlock)' : '🔓 Unlocked (Click to Lock)'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Seat Swap Request Notification */}
      {seatSwapRequest && (
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-50 bg-blue-600 text-white px-6 py-4 rounded-xl shadow-2xl">
          <div className="flex items-center gap-4">
            <span className="text-2xl">🪑</span>
            <div>
              <div className="font-bold">{seatSwapRequest.requesterName} wants to swap seats</div>
              <div className="text-sm text-blue-100">Seat #{seatSwapRequest.targetSeat} ↔️ Seat #{seatSwapRequest.requesterSeat}</div>
            </div>
            <div className="flex gap-2 ml-4">
              <button
                onClick={acceptSwap}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg font-semibold transition-colors"
              >
                ✓ Accept
              </button>
              <button
                onClick={declineSwap}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg font-semibold transition-colors"
              >
                ✗ Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* General Swap Notifications */}
      {swapNotification && !swapNotification.isRequest && (
        <SeatSwapNotification
          message={swapNotification.message}
          type={swapNotification.type}
          onClose={() => setSwapNotification(null)}
        />
      )}

      {/* Lecture Hall Members Modal */}
      <LectureHallMembersModal
        isOpen={isMembersModalOpen}
        onClose={() => setIsMembersModalOpen(false)}
        members={roomMembers}
        isHost={isHostFromState}
        currentUserId={currentUser?.id}
        audioStates={{
          [currentUser?.id]: isAudioActive,
          ...remoteAudioStates,
        }}
        raisedHands={raisedHands}
        approvedSpeakers={approvedSpeakers}
        onApproveSpeaker={handleApproveSpeaker}
        onRevokeSpeaker={handleRevokeSpeaker}
        onMuteUser={(userId) => {
          toast.success('Mute user feature coming soon');
        }}
        onMuteAll={() => {
          toast.success('Mute all students feature coming soon');
        }}
        userSeats={userSeats}
        onMemberClick={(member) => {
          toast.success(`Private message to ${member.username} coming soon`);
        }}
      />
      
      {/* Seats Modal */}
      {isSeatsModalOpen && (
        <LectureHallSeatsGrid
          userSeats={userSeats}
          currentUser={currentUser}
          roomMembers={roomMembers}
          onClose={() => setIsSeatsModalOpen(false)}
          onTakeSeat={handleTakeSeat}
          onSwapRequest={handleSeatSwapRequest}
        />
      )}
      
      {/* Chat Modals */}
      {showChatHome && (
        <ChatHomeModal
          currentUser={currentUser}
          privateMessages={privateMessages}
          roomMembers={roomMembers}
          watchType="classroom"
          onClose={() => setShowChatHome(false)}
          onOpenRoomChat={handleOpenRoomChat}
          onOpenPrivateChat={handleOpenPrivateChat}
        />
      )}
      
      {privateChatOpen && (
        <PrivateChatModal
          currentUser={currentUser}
          otherUserId={privateChatUserId}
          otherUser={roomMembers.find(m => m.id === privateChatUserId)}
          messages={privateMessages[privateChatUserId] || []}
          onClose={() => {
            setPrivateChatOpen(false);
            setPrivateChatUserId(null);
          }}
          onSendMessage={handleSendPrivateMessage}
        />
      )}
      
      {/* Room Chat Modal */}
      {isChatOpen && (
        <div className="fixed bottom-24 right-4 w-80 bg-black/80 backdrop-blur-md rounded-xl border border-gray-700 shadow-2xl z-50">
          <div className="flex justify-between items-center p-3 border-b border-gray-700">
            <h3 className="text-white font-medium">Lecture Chat</h3>
            <button 
              onClick={() => setIsChatOpen(false)}
              className="text-gray-400 hover:text-white"
            >
              ×
            </button>
          </div>
          <div className="h-64 overflow-y-auto p-3 space-y-2">
            {isChatLoading ? (
              <div className="text-gray-400 text-center py-4">Loading chat...</div>
            ) : sessionChatMessages.length === 0 ? (
              <div className="text-gray-500 text-sm text-center py-4">
                No messages yet. Be the first to chat!
              </div>
            ) : (
              sessionChatMessages.map((msg) => (
                <div key={msg.ID} className="text-white text-sm">
                  <span className="font-medium text-purple-300">{msg.Username}:</span>
                  <span className="ml-2">{msg.Message}</span>
                </div>
              ))
            )}
          </div>
          <div className="p-3 border-t border-gray-700">
            <input
              type="text"
              placeholder="Type a message..."
              className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target.value.trim()) {
                  handleSendRoomMessage(e.target.value);
                  e.target.value = '';
                }
              }}
            />
          </div>
        </div>
      )}
      
      {/* ✅ Session Earnings Modal */}
      <SessionEarningsModal
        isOpen={showEarningsModal}
        onClose={() => {
          setShowEarningsModal(false);
          navigate(`/rooms/${roomId}`, { replace: true });
        }}
        sessionData={sessionEarnings}
      />
    </div>
  );
}
