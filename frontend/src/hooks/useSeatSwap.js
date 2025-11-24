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
    switch (message.type) {
      case 'seat_swap_request':
        if (message.data?.target_user_id === currentUser?.id) {
          setSeatSwapRequest({
            requesterId: message.data.requester_id,
            requesterName: message.data.requester_name || `User${message.data.requester_id}`,
            targetSeat: message.data.target_seat,
            requesterSeat: message.data.requester_seat,
          });
        }
        break;

      case 'seat_swap_accepted':
      case 'seat_swap_declined':
        if (
          (message.data?.requester_id === currentUser?.id) ||
          (message.data?.target_id === currentUser?.id)
        ) {
          if (message.type === 'seat_swap_accepted' && onSwapAccepted) {
            onSwapAccepted(message.data);
          }
          setSeatSwapRequest(null);
        }
        break;

      default:
        return false; // not handled
    }
    return true; // handled
  }, [currentUser?.id, onSwapAccepted]);

  const sendSwapRequest = useCallback((targetUserId, targetSeat) => {
    if (!sendMessage || !currentUser) return;
    sendMessage({
      type: 'seat_swap_request',
      requester_id: currentUser.id,
      target_user_id: targetUserId,
      target_seat: targetSeat,
    });
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