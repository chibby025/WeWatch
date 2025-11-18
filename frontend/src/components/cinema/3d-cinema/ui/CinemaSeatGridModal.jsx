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

  // Username lookup
  const usernameBySeat = {};
  roomMembers.forEach(member => {
    const seatId = userSeats[member.id];
    if (seatId) {
      usernameBySeat[seatId] = member.Username || member.username || `User${member.id}`;
    }
  });

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
              const isCurrentUser = userSeats[currentUser?.id] === seatId;
              const isOccupied = Object.values(userSeats).includes(seatId) && !isCurrentUser;
              const username = usernameBySeat[seatId] || '';

              // Border classes (no background)
              let borderClass = 'border-transparent';
              if (isCurrentUser) {
                borderClass = 'border-green-500';
              } else if (isOccupied) {
                borderClass = 'border-blue-500';
              }

              return (
                <div
                  key={seatId}
                  className="flex flex-col items-center"
                >
                  <button
                    onClick={() => {
                      if (!isOccupied || isCurrentUser) {
                        onTakeSeat(seatId);
                      }
                    }}
                    disabled={isOccupied && !isCurrentUser}
                    className={`flex flex-col items-center justify-start p-1 rounded ${borderClass} border-2 transition-transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed`}
                    aria-label={`Seat ${seatLabel} ${isCurrentUser ? '(your seat)' : isOccupied ? `(occupied by ${username})` : '(available)'}`}
                  >
                    {/* Seat Label (ABOVE icon) */}
                    <span className="text-[10px] font-bold text-white mb-1">
                      {seatLabel}
                    </span>
                    {/* Seat Icon */}
                    <img 
                      src={SeatsIcon} 
                      alt="Seat" 
                      className="w-6 h-6"
                    />
                  </button>

                  {/* Username (below icon) */}
                  {username && (
                    <span className="text-[10px] text-gray-300 mt-1 max-w-12 truncate text-center">
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