// src/components/cinema/3d-cinema/ui/CinemaSeatGridModal.jsx
import React from 'react';
import SeatsIcon from '/icons/SeatsIcon.svg';

const CinemaSeatGridModal = ({
  isOpen,
  onClose,
  userSeats = {},
  currentUser,
  onTakeSeat,
  roomMembers = []
}) => {
  if (!isOpen) return null;

  const rowLetter = (row) => String.fromCharCode(65 + row); // A-F

  // Build a map: seatId → username
  const usernameBySeat = {};
  roomMembers.forEach(member => {
    const seatId = userSeats[member.id];
    if (seatId) {
      usernameBySeat[seatId] = member.username || `User${member.id}`;
    }
  });

  const allSeats = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++) {
      allSeats.push({ id: `${row}-${col}`, row, col });
    }
  }

  // Get current user's seat
  const currentUserSeatId = currentUser?.id ? userSeats[currentUser.id] : null;

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
          <h3 className="text-white font-bold text-lg">Choose Your Seat</h3>
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
              const isOccupied = Object.keys(userSeats).some(userId => userSeats[userId] === seatId) && !isCurrentUser;
              const username = usernameBySeat[seatId] || '';

              // ✅ Determine color based on state
              let bgColor = 'bg-gray-700'; // empty = gray
              let borderColor = 'border-transparent';
              let textColor = 'text-white';

              if (isCurrentUser) {
                bgColor = 'bg-green-600';       // current user = green
                borderColor = 'border-green-500';
                textColor = 'text-white font-bold';
              } else if (isOccupied) {
                bgColor = 'bg-blue-700';        // others = blue
                borderColor = 'border-blue-500';
                textColor = 'text-gray-200';
              }

              return (
                <div key={seatId} className="flex flex-col items-center">
                  <button
                    onClick={() => {
                      if (!isOccupied || isCurrentUser) {
                        onTakeSeat(seatId);
                      }
                    }}
                    disabled={isOccupied && !isCurrentUser}
                    className={`flex flex-col items-center justify-start p-2 rounded-lg ${bgColor} ${borderColor} border-2 transition-transform hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed w-12`}
                    aria-label={`Seat ${seatLabel} ${isCurrentUser ? '(your seat)' : isOccupied ? `(occupied by ${username})` : '(available)'}`}
                  >
                    {/* Seat Label */}
                    <span className={`text-[10px] font-bold mb-1 ${textColor}`}>
                      {seatLabel}
                    </span>
                    {/* Seat Icon */}
                    <img 
                      src={SeatsIcon} 
                      alt="Seat" 
                      className="w-5 h-5"
                    />
                  </button>

                  {/* Username (below icon) */}
                  {username && (
                    <span className="text-[9px] text-gray-300 mt-1 max-w-12 truncate text-center">
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