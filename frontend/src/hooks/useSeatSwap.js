// frontend/src/hooks/useSeatSwap.js
import { useState, useCallback } from 'react';

/**
 * Manages seat swap request state and WebSocket interactions
 * @param {Object} options
 * @param {Function} options.sendMessage - WebSocket send function
 * @param {Object} options.currentUser - Current user object
 * @param {Function} options.onSwapAccepted - Optional callback when swap is accepted
 */
export function useSeatSwap({ sendMessage, currentUser, onSwapAccepted }) {
  const [seatSwapRequest, setSeatSwapRequest] = useState(null);

  // Handle incoming WebSocket messages
  const handleSeatSwapMessage = useCallback((message) => {
    console.log('🪑 [handleSeatSwapMessage] Received message:', message.type, message);
    
    // ✅ Fields can be at root level OR under data key - check both
    const msg = message.data || message;
    
    switch (message.type) {
      case 'seat_swap_request':
        console.log('🪑 [seat_swap_request] Checking if for me:', { 
          targetUserId: msg.target_user_id, 
          myUserId: currentUser?.id, 
          isForMe: msg.target_user_id === currentUser?.id 
        });
        
        if (msg.target_user_id === currentUser?.id) {
          console.log('✅ [seat_swap_request] This request is for ME! Setting state...');
          setSeatSwapRequest({
            requesterId: msg.requester_id,
            requesterName: msg.requester_name || `User${msg.requester_id}`,
            targetSeat: msg.target_seat,
            requesterSeat: msg.requester_seat,
          });
        } else {
          console.log('⏭️ [seat_swap_request] Not for me, ignoring');
        }
        console.log('🪑 [handleSeatSwapMessage] Handled seat_swap_request, returning true');
        return true;

      case 'seat_swap_accepted':
      case 'seat_swap_declined':
        if (
          (msg.requester_id === currentUser?.id) ||
          (msg.target_id === currentUser?.id)
        ) {
          if (message.type === 'seat_swap_accepted' && onSwapAccepted) {
            onSwapAccepted(msg);
          }
          setSeatSwapRequest(null);
        }
        console.log('🪑 [handleSeatSwapMessage] Handled seat_swap_accepted/declined, returning true');
        return true;

      default:
        // ✅ Silent return for non-swap messages (chat_message is normal, not an error)
        if (message.type !== 'chat_message') {
          console.log('🪑 [handleSeatSwapMessage] Message type not handled, returning false:', message.type);
        }
        return false; // not handled
    }
  }, [currentUser?.id, onSwapAccepted]);

  const sendSwapRequest = useCallback((targetUserId, targetSeat) => {
    console.log('🪑 [sendSwapRequest] Called:', { targetUserId, targetSeat, currentUserId: currentUser?.id });
    
    if (!sendMessage || !currentUser) {
      console.error('❌ [sendSwapRequest] Missing dependencies:', { hasSendMessage: !!sendMessage, hasCurrentUser: !!currentUser });
      return;
    }
    
    // Convert seat ID to integer if it's a string
    const seatId = typeof targetSeat === 'string' ? parseInt(targetSeat, 10) : targetSeat;
    
    const message = {
      type: 'seat_swap_request',
      requester_id: currentUser.id,
      target_user_id: targetUserId,
      target_seat: seatId, // Send as simple number (seat ID)
    };
    
    console.log('📤 [sendSwapRequest] Sending message:', message);
    sendMessage(message);
    console.log('✅ [sendSwapRequest] Message sent successfully');
  }, [sendMessage, currentUser]);

  const acceptSwap = useCallback(() => {
    if (!seatSwapRequest || !sendMessage) return;
    sendMessage({
      type: 'seat_swap_accepted',
      requester_id: seatSwapRequest.requesterId,
      target_id: currentUser?.id,
      requester_seat: seatSwapRequest.requesterSeat,
      target_seat: seatSwapRequest.targetSeat,
    });
    setSeatSwapRequest(null);
  }, [seatSwapRequest, sendMessage, currentUser?.id]);

  const declineSwap = useCallback(() => {
    if (!seatSwapRequest || !sendMessage) return;
    sendMessage({
      type: 'seat_swap_declined',
      requester_id: seatSwapRequest.requesterId,
      target_id: currentUser?.id,
    });
    setSeatSwapRequest(null);
  }, [seatSwapRequest, sendMessage, currentUser?.id]);

  return {
    seatSwapRequest,
    handleSeatSwapMessage,
    sendSwapRequest,
    acceptSwap,
    declineSwap,
  };
}