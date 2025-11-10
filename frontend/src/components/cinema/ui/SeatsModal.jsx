// src/components/cinema/ui/SeatsModal.jsx
// 🪑 Interactive 5x5 infinite seat grid modal
// Users can take empty seats or request swaps with occupied seats
// Row-based audio: users in same row can hear each other

import React, { useState, useMemo } from 'react';

export default function SeatsModal({
  userSeats = {},       // Map: userId → "row-col" string
  currentUser = null,   // Current user object with id
  roomMembers = [],     // Array of users in the room
  onClose,              // Function to close modal
  onTakeSeat,           // Function(row, col) - take empty seat
  onSwapRequest         // Function(targetUserId, targetSeat) - request swap
}) {
  const [selectedSeatForSwap, setSelectedSeatForSwap] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // Build a map of seat positions to userIds
  const seatToUser = useMemo(() => {
    const map = {};
    Object.entries(userSeats).forEach(([userId, seatId]) => {
      map[seatId] = userId;
    });
    return map;
  }, [userSeats]);

  // Get current user's seat
  const myCurrentSeat = userSeats[currentUser?.id];

  // Render a single seat cell
  const renderSeat = (row, col) => {
    const seatId = `${row}-${col}`;
    const occupantId = seatToUser[seatId];
    const isMyCurrentSeat = myCurrentSeat === seatId;
    const isEmpty = !occupantId;

    // Find occupant user
    const occupant = occupantId 
      ? roomMembers.find(m => m.id === parseInt(occupantId))
      : null;

    let seatColor = 'gray'; // Default color for empty seats
    let textColor = 'text-gray-400';
    let hoverClass = 'hover:opacity-80 cursor-pointer';

    if (isMyCurrentSeat) {
      // Green for current user's seat
      seatColor = 'green';
      textColor = 'text-green-400';
      hoverClass = 'cursor-default';
    } else if (occupant) {
      // White for other users' seats
      seatColor = 'white';
      textColor = 'text-white';
      hoverClass = 'hover:opacity-80 cursor-pointer';
    }

    return (
      <div
        key={seatId}
        className={`flex flex-col items-center ${hoverClass} transition-opacity`}
        onClick={() => handleSeatClick(row, col, occupantId, isMyCurrentSeat, isEmpty)}
      >
        {/* Seat ID (above icon) */}
        <div className="text-xs text-gray-300 mb-1 text-center font-semibold">
          {String.fromCharCode(65 + row)}{col + 1}
        </div>
        
        {/* Seat Icon - using bg color with mask */}
        <div className="relative w-12 h-12">
          <img
            src="/icons/seat.svg"
            alt="seat"
            className={`w-12 h-12 absolute inset-0 ${
              seatColor === 'green' 
                ? 'opacity-0' 
                : seatColor === 'white'
                ? 'brightness-0 invert-[1]'
                : ''
            }`}
          />
          {seatColor === 'green' && (
            <div className="absolute inset-0 bg-green-400 w-12 h-12" style={{
              maskImage: 'url(/icons/seat.svg)',
              maskSize: 'contain',
              maskRepeat: 'no-repeat',
              WebkitMaskImage: 'url(/icons/seat.svg)',
              WebkitMaskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat'
            }} />
          )}
        </div>
        
        {/* Username (below icon) - only if occupied */}
        {occupant && (
          <div className={`text-xs ${textColor} truncate max-w-[60px] mt-1`}>
            {occupant.username || `User ${occupantId}`}
          </div>
        )}
      </div>
    );
  };

  // Handle seat click logic
  const handleSeatClick = (row, col, occupantId, isMyCurrentSeat, isEmpty) => {
    if (isMyCurrentSeat) {
      // Clicking own seat - do nothing
      return;
    }

    if (isEmpty) {
      // Take empty seat immediately
      onTakeSeat(row, col);
      onClose();
    } else {
      // Request swap with occupant
      setSelectedSeatForSwap({ row, col, occupantId });
      setIsConfirming(true);
    }
  };

  // Confirm swap request
  const confirmSwapRequest = () => {
    if (selectedSeatForSwap && onSwapRequest) {
      onSwapRequest(
        parseInt(selectedSeatForSwap.occupantId),
        {
          row: selectedSeatForSwap.row,
          col: selectedSeatForSwap.col
        }
      );
    }
    setIsConfirming(false);
    setSelectedSeatForSwap(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white">Cinema Seating</h2>
            <p className="text-sm text-gray-400 mt-1">
              Take an empty seat or request a swap
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* 5x5 Grid */}
        <div className="p-6">
          <div className="grid grid-cols-5 gap-3 mb-6">
            {Array.from({ length: 5 }, (_, rowIdx) =>
              Array.from({ length: 5 }, (_, colIdx) => renderSeat(rowIdx, colIdx))
            )}
          </div>

          {/* Legend */}
          <div className="flex gap-6 text-sm text-gray-400 justify-center items-center">
            <div className="flex items-center gap-2">
              <div className="relative w-5 h-5">
                <div className="absolute inset-0 bg-green-400 w-5 h-5" style={{
                  maskImage: 'url(/icons/seat.svg)',
                  maskSize: 'contain',
                  maskRepeat: 'no-repeat',
                  WebkitMaskImage: 'url(/icons/seat.svg)',
                  WebkitMaskSize: 'contain',
                  WebkitMaskRepeat: 'no-repeat'
                }} />
              </div>
              <span>Your Seat</span>
            </div>
            <div className="flex items-center gap-2">
              <img 
                src="/icons/seat.svg" 
                alt="Occupied" 
                className="w-5 h-5 brightness-0 invert-[1]"
              />
              <span>Other Users</span>
            </div>
            <div className="flex items-center gap-2">
              <img 
                src="/icons/seat.svg" 
                alt="Empty" 
                className="w-5 h-5"
              />
              <span>Empty</span>
            </div>
          </div>
        </div>
      </div>

      {/* Swap Confirmation Modal */}
      {isConfirming && selectedSeatForSwap && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[60]">
          <div className="bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-xl font-bold text-white mb-4">Request Seat Swap?</h3>
            <p className="text-gray-300 mb-6">
              Send a swap request to the user in seat ({selectedSeatForSwap.row}, {selectedSeatForSwap.col})?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setIsConfirming(false);
                  setSelectedSeatForSwap(null);
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSwapRequest}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}