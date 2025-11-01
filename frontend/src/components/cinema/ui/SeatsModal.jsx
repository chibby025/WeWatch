// src/components/cinema/ui/SeatsModal.jsx
// 🪑 Interactive seat grid modal — Tailwind only
// 5 rows x 8 cols — current user = green, others = purple
// Click seat → if occupied → show "Request Swap" confirmation
// Emits WebSocket message on request

import { useState } from 'react';

export default function SeatsModal({
  seats = [],           // Array of seat objects: { id, row, col, occupied, userId }
  userSeats = {},       // Map: userId → { row, col }
  currentUser = null,   // Current user object
  onClose,              // Function to close modal
  onSwapRequest         // Function to emit WebSocket request
}) {
  // 🎯 Track which seat user clicked for swap
  const [selectedSeatForSwap, setSelectedSeatForSwap] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // 🪑 Get seat info by position
  const getSeatAt = (row, col) => {
    return seats.find(seat => seat.row === row && seat.col === col);
  };

  // 👤 Get user sitting at seat (if any)
  const getUserAtSeat = (seat) => {
    if (!seat || !seat.userId) return null;
    // In real app, you'd get user from context or API — for now, mock
    return { id: seat.userId, username: `User${seat.userId.slice(0, 4)}` };
  };

  // ✅ Handle seat click
  const handleSeatClick = (seat) => {
    if (!currentUser) return;

    // If seat is empty → sit here (future feature)
    if (!seat.occupied) {
      alert("Sitting here not implemented yet — coming soon!");
      return;
    }

    // If seat is occupied → request swap
    if (seat.userId && seat.userId !== currentUser.id) {
      setSelectedSeatForSwap(seat);
      setIsConfirming(true);
    }

    // If clicking your own seat → do nothing
    if (seat.userId === currentUser.id) {
      return;
    }
  };

  // ✅ Confirm swap request
  const handleConfirmSwap = () => {
    if (selectedSeatForSwap && onSwapRequest) {
      onSwapRequest(selectedSeatForSwap);
    }
    setIsConfirming(false);
    setSelectedSeatForSwap(null);
  };

  // ❌ Cancel swap request
  const handleCancelSwap = () => {
    setIsConfirming(false);
    setSelectedSeatForSwap(null);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      {/* 🎬 Modal Container */}
      <div className="bg-gray-900 rounded-xl p-6 max-w-2xl w-full shadow-2xl border border-gray-700">
        
        {/* 🎥 Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Select Your Seat</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl font-bold"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* 🎞️ Screen Label (Cinema Vibe) */}
        <div className="text-center mb-6">
          <div className="text-gray-500 text-sm">SCREEN</div>
          <div className="w-full h-px bg-gray-600 my-2"></div>
        </div>

        {/* 🪑 Seat Grid — 5 rows x 8 cols */}
        <div className="grid grid-cols-8 gap-3 mb-6">
          {Array.from({ length: 5 }, (_, rowIndex) => (
            <React.Fragment key={rowIndex}>
              {Array.from({ length: 8 }, (_, colIndex) => {
                const seat = getSeatAt(rowIndex, colIndex);
                const user = seat ? getUserAtSeat(seat) : null;
                const isCurrentUser = seat && seat.userId === currentUser?.id;
                const isOccupied = seat?.occupied;

                return (
                  <div
                    key={`${rowIndex}-${colIndex}`}
                    onClick={() => seat && handleSeatClick(seat)}
                    className={`
                      aspect-square flex flex-col items-center justify-center
                      rounded-lg cursor-pointer transition-all duration-200
                      border-2 text-xs font-medium
                      ${
                        isCurrentUser
                          ? 'bg-green-500 border-green-400 text-white shadow-lg shadow-green-500/50'
                          : isOccupied
                          ? 'bg-purple-600 border-purple-500 text-white hover:bg-purple-500'
                          : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                      }
                      ${
                        !seat?.occupied && 'animate-float'
                      }
                    `}
                    title={user ? `Occupied by ${user.username}` : 'Empty seat'}
                  >
                    {/* 👤 Avatar Initial or Emoji */}
                    <div className="text-lg mb-1">
                      {isCurrentUser ? '👤' : isOccupied ? '👥' : '🪑'}
                    </div>
                    
                    {/* 🪑 Seat Label */}
                    <div>
                      {String.fromCharCode(65 + rowIndex)}{colIndex + 1}
                    </div>

                    {/* 👤 Username (if occupied) */}
                    {user && (
                      <div className="text-[10px] mt-1 truncate w-full px-1">
                        {user.username}
                      </div>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        {/* ❗ Legend */}
        <div className="flex justify-center gap-6 text-xs text-gray-400 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span>You</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-purple-600 rounded"></div>
            <span>Occupied</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gray-700 rounded"></div>
            <span>Empty</span>
          </div>
        </div>

        {/* 🚪 Close Button */}
        <div className="text-center">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* ✅ Confirmation Modal (if confirming swap) */}
      {isConfirming && selectedSeatForSwap && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl border border-gray-600">
            <h3 className="text-lg font-bold text-white mb-4">Request Seat Swap</h3>
            <p className="text-gray-300 mb-6">
              Request to swap seats with{' '}
              <strong>User{selectedSeatForSwap.userId.slice(0, 4)}</strong>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmSwap}
                className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg transition-colors"
              >
                ✅ Yes, Request
              </button>
              <button
                onClick={handleCancelSwap}
                className="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-2 rounded-lg transition-colors"
              >
                ❌ Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}