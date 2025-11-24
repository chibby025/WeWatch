// frontend/src/components/cinema/3d-cinema/ui/CinemaSeatGridModal.jsx
import React from 'react';
import SeatsIcon from '/icons/SeatsIcon.svg';

const CinemaSeatGridModal = ({
  isOpen,
  onClose,
  userSeats = {},
  currentUser,
  roomMembers = [],
  // New props for swap mode
  seatSwapRequest = null,
  outgoingSwapRequest = null,
  onSwapAccept,
  onSwapDecline,
  // New: allow parent to override take-seat logic
  onTakeSeat,
}) => {
  if (!isOpen) return null;

  const rowLetter = (row) => String.fromCharCode(65 + row); // A-F

  // Build seat → username map
  const usernameBySeat = {};
  roomMembers.forEach(member => {
    const seatId = userSeats[member.id];
    if (seatId) {
      usernameBySeat[seatId] = member.username || `User${member.id}`;
    }
  });

  // Get current user's seat
  const currentUserSeatId = currentUser?.id ? userSeats[currentUser.id] : null;

  // Modal is in swap mode?
  const isSwapMode = !!seatSwapRequest;
  const isRequestingSwap = !!outgoingSwapRequest;

  if (isSwapMode) {
    // Recipient UI — unchanged
    return (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-gray-800/90 backdrop-blur-md rounded-xl border border-gray-600 w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
          <h3 className="text-white font-bold text-lg text-center mb-4">Seat Swap Request</h3>
          <p className="text-gray-200 text-center mb-6">
            Do you wish to change seats with <span className="text-yellow-300 font-bold">
              {seatSwapRequest.requesterName}
            </span>?
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                onSwapDecline?.();
                onClose();
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded text-white"
            >
              No
            </button>
            <button
              onClick={() => {
                onSwapAccept?.();
                onClose();
              }}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-white"
            >
              Yes
            </button>
          </div>
        </div>
      </div>
    );
  } else if (isRequestingSwap) {
    // ✅ Requester UI
    const targetUser = roomMembers.find(m => m.id === outgoingSwapRequest.targetUserId);
    const [row, col] = outgoingSwapRequest.targetSeatId.split('-').map(Number);
    const seatName = `${String.fromCharCode(65 + row)}${col + 1}`; // A1, B2, etc.

    return (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-gray-800/90 backdrop-blur-md rounded-xl border border-gray-600 w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
          <h3 className="text-white font-bold text-lg text-center mb-4">Seat Swap Request Sent</h3>
          <p className="text-gray-200 text-center mb-4">
            Swap requested with <span className="text-yellow-300 font-bold">
              {targetUser?.username || 'Guest'}
            </span> in seat <span className="font-mono">{seatName}</span>.
          </p>
          <div className="text-center text-sm text-gray-400">
            Waiting for their response...
          </div>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded w-full"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Normal seat picker mode
  const allSeats = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++) {
      allSeats.push({ id: `${row}-${col}`, row, col });
    }
  }

  return (
    <div 
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800/90 backdrop-blur-md rounded-xl border border-gray-600 w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-5 border-b border-gray-700">
          <h3 className="text-white font-bold text-lg">
            {isRequestingSwap ? 'Seat Swap Requested' : 'Choose Your Seat'}
          </h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl font-bold"
            aria-label="Close seat selector"
          >
            &times;
          </button>
        </div>

        <div className="p-5 overflow-y-auto max-h-[65vh]">
          <div className="grid grid-cols-7 gap-4 justify-items-center">
            {allSeats.map(seat => {
              const seatId = seat.id;
              const seatLabel = `${rowLetter(seat.row)}${seat.col + 1}`;
              
              const isCurrentUser = seatId === currentUserSeatId;
              const occupantId = Object.keys(userSeats).find(userId => userSeats[userId] === seatId);
              const isOccupied = !!occupantId && !isCurrentUser;
              const username = usernameBySeat[seatId] || '';

              // ✅ Button background: always gray or green — NEVER white
              const buttonBg = isCurrentUser ? 'bg-green-600' : 'bg-gray-700';
              const buttonBorder = isCurrentUser 
                ? 'border-green-500' 
                : isOccupied 
                  ? 'border-blue-400' 
                  : 'border-transparent';

              // ✅ Text & icon color: change only for occupied seats
              const labelColor = isCurrentUser 
                ? 'text-white font-bold' 
                : isOccupied 
                  ? 'text-blue-600 font-medium' 
                  : 'text-gray-300';
              
              const iconFilter = isOccupied 
                ? 'invert(100%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(105%) contrast(105%)' // white icon
                : '';

              return (
                <div key={seatId} className="flex flex-col items-center">
                  <button
                    onClick={() => {
                      // ✅ ALL seats are clickable — logic handled in parent
                      onTakeSeat?.(seatId);
                    }}
                    // ✅ NEVER disabled — always show pointer cursor
                    className={`flex flex-col items-center justify-start p-2 rounded-lg ${buttonBg} ${buttonBorder} border-2 transition-transform hover:scale-105 w-12 cursor-pointer`}
                    aria-label={`Seat ${seatLabel} ${isCurrentUser ? '(your seat)' : isOccupied ? `(occupied by ${username})` : '(available)'}`}
                  >
                    <span className={`text-[10px] font-bold mb-1 ${labelColor}`}>
                      {seatLabel}
                    </span>
                    <img 
                      src={SeatsIcon} 
                      alt="Seat" 
                      className="w-5 h-5"
                      style={{ filter: iconFilter }}
                    />
                  </button>

                  {username && !isCurrentUser && (
                    <span className="text-[9px] text-blue-300 mt-1 max-w-12 truncate text-center font-medium">
                      {username}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CinemaSeatGridModal;