// frontend/src/components/cinema/ui/LectureHallSeatsGrid.jsx
// 🎓 Lecture Hall Seating Grid
// 3 columns: 5+8+5 seats × 8 rows = 144 student seats + 1 host seat
// Host seat displayed prominently at top/center
// Supports seat swapping, shows occupied/empty status, usernames, current user highlight

import React, { useState, useMemo } from 'react';
import { getLectureHallSeatById, getLectureHallHostSeat } from '../../cinema/3d-cinema/seatCalculator';

// Custom sleek scrollbar styles
const scrollbarStyles = `
  .sleek-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(139, 92, 246, 0.6) rgba(31, 41, 55, 0.4);
  }
  .sleek-scrollbar::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  .sleek-scrollbar::-webkit-scrollbar-track {
    background: rgba(31, 41, 55, 0.4);
    border-radius: 4px;
  }
  .sleek-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(139, 92, 246, 0.6);
    border-radius: 4px;
  }
  .sleek-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(139, 92, 246, 0.8);
  }
`;

export default function LectureHallSeatsGrid({
  userSeats = {},       // Map: userId → seatId (number 1-145)
  currentUser = null,   // Current user object with id (OR just currentUserId)
  currentUserId = null, // Alternative: just the user ID
  watchSessionMembers = [],     // Array of users in the watch session
  onClose,              // Function to close modal
  onTakeSeat,           // Function(seatId) - take empty seat
  onSwapRequest,        // Function(targetUserId, targetSeatId) - request swap
  currentHallNumber = 1,  // Current lecture hall number (1, 2, 3...)
  totalHalls = 1,         // Total number of active halls
  onHallChange,           // Function(hallNumber) - switch hall (host only)
  isHost = false,         // Is current user the host?
}) {
  const [selectedSeatForSwap, setSelectedSeatForSwap] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [selectedHall, setSelectedHall] = useState(currentHallNumber);

  // Support both currentUser object and currentUserId
  const effectiveUserId = currentUser?.id || currentUserId;

  // 🐛 DEBUG: Log all incoming props
  console.log('🎓 [LectureHallSeatsGrid] Props:', {
    userSeats,
    currentUser,
    currentUserId,
    effectiveUserId,
    watchSessionMembers: watchSessionMembers.map(m => ({ id: m.id, username: m.username }))
  });

  // Build a map of seat IDs to userIds
  const seatToUser = useMemo(() => {
    const map = {};
    Object.entries(userSeats).forEach(([userId, seatId]) => {
      map[seatId] = parseInt(userId);
    });
    console.log('🎓 [LectureHallSeatsGrid] seatToUser map:', map);
    return map;
  }, [userSeats]);

  // Get current user's seat ID
  const myCurrentSeatId = userSeats[effectiveUserId];
  const myCurrentSeat = myCurrentSeatId ? getLectureHallSeatById(myCurrentSeatId) : null;

  console.log('🎓 [LectureHallSeatsGrid] Current user seat:', {
    effectiveUserId,
    myCurrentSeatId,
    myCurrentSeat
  });

  // Host seat (seat 145)
  const hostSeat = getLectureHallHostSeat();
  const hostUserId = seatToUser[145];
  const hostUser = hostUserId ? watchSessionMembers.find(m => m.id === hostUserId) : null;

  // Render host seat at top
  const renderHostSeat = () => {
    // Convert to number for comparison (myCurrentSeatId is string)
    const isMyHostSeat = parseInt(myCurrentSeatId) === 145;
    const isEmpty = !hostUserId;

    console.log('🎓 [renderHostSeat]:', {
      myCurrentSeatId,
      hostUserId,
      hostUser: hostUser ? hostUser.username : 'none',
      isMyHostSeat,
      isEmpty
    });

    // ✅ Button background
    const buttonBg = isMyHostSeat 
      ? 'bg-green-600' 
      : isEmpty 
      ? 'bg-gray-700' 
      : 'bg-yellow-600';

    // ✅ Border
    const borderColor = isMyHostSeat 
      ? 'border-green-500' 
      : isEmpty 
      ? 'border-transparent' 
      : 'border-yellow-400';

    // ✅ Icon filter: white for occupied, no filter for empty/current
    const iconFilter = (!isEmpty && !isMyHostSeat)
      ? 'invert(100%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(105%) contrast(105%)'
      : '';

    return (
      <div className="flex justify-center mb-6 pb-6 border-b-2 border-gray-700">
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => handleSeatClick(145, hostUserId, isMyHostSeat, isEmpty)}
            className={`flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl ${buttonBg} border-2 ${borderColor} transition-all hover:scale-105 cursor-pointer w-20 sm:w-24 h-20 sm:h-24 relative`}
          >
            {/* Avatar - Top layer if occupied */}
            {hostUser && hostUser.avatar_url && (
              <img 
                src={hostUser.avatar_url}
                alt={hostUser.username}
                className="absolute inset-1 w-[calc(100%-8px)] h-[calc(100%-8px)] rounded-lg object-cover"
              />
            )}
            
            {/* Host Label - Top */}
            <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded bg-black/60 text-white whitespace-nowrap">👨‍🏫 HOST</span>
            
            {/* Seat Icon - Only show if no avatar or empty */}
            {(!hostUser || !hostUser.avatar_url) && (
              <img 
                src="/icons/seat.svg" 
                alt="Host seat" 
                className="w-8 h-8 sm:w-10 sm:h-10 mt-4"
                style={{ filter: iconFilter }}
              />
            )}
          </button>

          {/* Username - OUTSIDE button, below - Full display */}
          {hostUser && (
            <span className={`text-sm sm:text-base text-center font-medium ${isMyHostSeat ? 'text-green-300 font-bold' : 'text-yellow-300'}`}>
              {hostUser.username || `User ${hostUserId}`}
            </span>
          )}
          {isEmpty && (
            <span className="text-gray-500 text-xs mt-1">Empty</span>
          )}
        </div>
      </div>
    );
  };

  // Render a single student seat
  const renderSeat = (seatId) => {
    const occupantId = seatToUser[seatId];
    // Convert both to numbers for comparison (myCurrentSeatId is string, seatId is number)
    const isMyCurrentSeat = parseInt(myCurrentSeatId) === seatId;
    const isEmpty = !occupantId;

    // Find occupant user
    const occupant = occupantId 
      ? watchSessionMembers.find(m => m.id === occupantId)
      : null;

    const seat = getLectureHallSeatById(seatId);
    if (!seat) return null;

    // 🐛 DEBUG: Log first seat and current user's seat
    if (seatId === 1 || isMyCurrentSeat) {
      console.log(`🎓 [renderSeat] Seat ${seatId}:`, {
        occupantId,
        isMyCurrentSeat,
        isEmpty,
        occupant: occupant ? occupant.username : 'none',
        myCurrentSeatId
      });
    }

    // ✅ Button background: green for current user, blue for occupied, gray for empty
    const buttonBg = isMyCurrentSeat 
      ? 'bg-green-600' 
      : isEmpty 
      ? 'bg-gray-700' 
      : 'bg-blue-600';

    // ✅ Border color
    const borderColor = isMyCurrentSeat 
      ? 'border-green-500' 
      : isEmpty 
      ? 'border-transparent' 
      : 'border-blue-400';

    // ✅ Label color (seat number inside button)
    const labelColor = isMyCurrentSeat 
      ? 'text-white font-bold' 
      : isEmpty 
      ? 'text-gray-300' 
      : 'text-white font-medium';

    // ✅ Icon filter: white for occupied, no filter for empty/current
    const iconFilter = (!isEmpty && !isMyCurrentSeat)
      ? 'invert(100%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(105%) contrast(105%)'
      : '';

    return (
      <div key={seatId} className="flex flex-col items-center gap-2">
        <button
          onClick={() => handleSeatClick(seatId, occupantId, isMyCurrentSeat, isEmpty)}
          className={`flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl ${buttonBg} border-2 ${borderColor} transition-all hover:scale-105 w-16 sm:w-20 h-16 sm:h-20 cursor-pointer touch-manipulation relative`}
        >
          {/* Avatar - Top layer if occupied */}
          {occupant && occupant.avatar_url && (
            <img 
              src={occupant.avatar_url}
              alt={occupant.username}
              className="absolute inset-1 w-[calc(100%-8px)] h-[calc(100%-8px)] rounded-lg object-cover"
            />
          )}
          
          {/* Seat number - Top corner */}
          <span className={`absolute top-1 left-1 text-[8px] sm:text-[9px] font-bold px-1 py-0.5 rounded ${isEmpty ? 'bg-gray-600/80' : 'bg-black/60'} ${labelColor}`}>
            #{seatId}
          </span>
          
          {/* Seat Icon - Only show if no avatar or empty */}
          {(!occupant || !occupant.avatar_url) && (
            <img 
              src="/icons/seat.svg" 
              alt="seat" 
              className="w-6 h-6 sm:w-8 sm:h-8"
              style={{ filter: iconFilter }}
            />
          )}
        </button>

        {/* Username - OUTSIDE button, below - Full display */}
        {occupant && (
          <span className={`text-[10px] sm:text-xs text-center font-medium leading-tight ${isMyCurrentSeat ? 'text-green-300 font-bold' : 'text-blue-300'}`}>
            {occupant.username || `User ${occupantId}`}
          </span>
        )}
      </div>
    );
  };

  // Handle seat click logic
  const handleSeatClick = (seatId, occupantId, isMyCurrentSeat, isEmpty) => {
    if (isMyCurrentSeat) {
      // Clicking own seat - do nothing
      return;
    }

    if (isEmpty) {
      // Take empty seat immediately
      onTakeSeat(seatId);
      onClose();
    } else {
      // Request swap with occupant
      setSelectedSeatForSwap({ seatId, occupantId });
      setIsConfirming(true);
    }
  };

  // Confirm swap request
  const confirmSwapRequest = () => {
    if (selectedSeatForSwap && onSwapRequest) {
      onSwapRequest(selectedSeatForSwap.occupantId, selectedSeatForSwap.seatId);
    }
    setIsConfirming(false);
    setSelectedSeatForSwap(null);
    onClose();
  };

  // Render a column of seats
  const renderColumn = (startId, seatsPerRow, rows, columnLabel, columnNumber) => {
    const columnSeats = [];
    for (let row = 0; row < rows; row++) {
      const rowSeats = [];
      for (let seat = 0; seat < seatsPerRow; seat++) {
        const seatId = startId + (row * seatsPerRow) + seat;
        rowSeats.push(renderSeat(seatId));
      }
      columnSeats.push(
        <div key={`row-${row}`} className="flex gap-2 sm:gap-3 justify-center">
          {rowSeats}
        </div>
      );
    }

    return (
      <div className="flex flex-col">
        {/* Sticky Column Header */}
        <div className="sticky top-[60px] sm:top-[88px] bg-gray-900/95 backdrop-blur-sm z-10 py-3 border-b border-gray-700">
          <div className="text-center text-sm sm:text-base font-bold text-blue-400">{columnLabel}</div>
          <div className="text-center text-xs text-gray-500 mt-1">Seats {startId}-{startId + (seatsPerRow * rows) - 1}</div>
        </div>
        
        {/* Seats Grid */}
        <div className="flex flex-col gap-3 sm:gap-4 py-4">
          {columnSeats}
        </div>
      </div>
    );
  };

  return (
    <>
      <style>{scrollbarStyles}</style>
      <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-gray-900 rounded-xl shadow-2xl w-full mx-2 sm:mx-4 max-w-5xl max-h-[95vh] sm:max-h-[90vh] overflow-auto sleek-scrollbar">
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-3 sm:p-6 flex justify-between items-center z-20">
          <div>
            <h2 className="text-lg sm:text-2xl font-bold text-white">
              {totalHalls > 1 ? `Hall ${selectedHall} Seating` : 'Lecture Hall Seating'}
            </h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-1 hidden sm:block">
              Take an empty seat or request a swap • 144 student seats + 1 host seat
            </p>
            <p className="text-xs text-gray-400 mt-1 block sm:hidden">
              Tap seat to take/swap
            </p>
            {totalHalls > 1 && (
              <p className="text-[10px] sm:text-xs text-purple-400 mt-1">
                📍 {totalHalls} active halls • Viewing Hall {selectedHall}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl sm:text-3xl leading-none flex-shrink-0"
          >
            ×
          </button>
        </div>
        
        {/* Hall Selector Dropdown (Host Only, Multiple Halls) */}
        {isHost && totalHalls > 1 && (
          <div className="sticky top-[60px] sm:top-[88px] bg-gray-800 border-b border-gray-700 p-2 sm:p-4 flex items-center gap-2 sm:gap-4 z-10">
            <span className="text-xs sm:text-sm text-gray-300 font-medium">Switch Hall:</span>
            <select
              value={selectedHall}
              onChange={(e) => {
                const newHall = parseInt(e.target.value);
                setSelectedHall(newHall);
                if (onHallChange) {
                  onHallChange(newHall);
                }
              }}
              className="bg-gray-700 text-white px-2 sm:px-4 py-1 sm:py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
            >
              {Array.from({ length: totalHalls }, (_, i) => i + 1).map(hallNum => (
                <option key={hallNum} value={hallNum}>
                  Hall {hallNum} {hallNum === currentHallNumber ? '(Your Hall)' : ''}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-400 hidden sm:inline">
              Host can view all halls
            </span>
          </div>
        )}

        {/* Seating Grid */}
        <div className="p-2 sm:p-4 md:p-6">
          {/* Host Seat */}
          {renderHostSeat()}

          {/* 3 Column Layout - Vertical stacking */}
          <div className="flex flex-col gap-6">
            {/* Column 1: Left section (5 seats × 8 rows = 40 seats, IDs 1-40) */}
            {renderColumn(1, 5, 8, 'Column 1 (5 seats)', 1)}

            {/* Column 2: Middle section (8 seats × 8 rows = 64 seats, IDs 41-104) */}
            {renderColumn(41, 8, 8, 'Column 2 (8 seats) - Best View', 2)}

            {/* Column 3: Right section (5 seats × 8 rows = 40 seats, IDs 105-144) */}
            {renderColumn(105, 5, 8, 'Column 3 (5 seats)', 3)}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 sm:gap-8 text-sm sm:text-base text-gray-400 justify-center items-center mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-gray-700">
            <div className="flex items-center gap-2">
              <div className="relative w-6 h-6 sm:w-7 sm:h-7">
                <div className="absolute inset-0 bg-green-400 w-6 h-6 sm:w-7 sm:h-7" style={{
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
                className="w-6 h-6 sm:w-7 sm:h-7 brightness-0 invert-[1]"
              />
              <span>Occupied</span>
            </div>
            <div className="flex items-center gap-2">
              <img 
                src="/icons/seat.svg" 
                alt="Empty" 
                className="w-6 h-6 sm:w-7 sm:h-7"
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
              Send a swap request to the user in seat #{selectedSeatForSwap.seatId}?
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
    </>
  );
}
