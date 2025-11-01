import React from 'react';

const SeatingGrid = ({
  seats,
  userSeats,
  authenticatedUserID,
  handleSeatClick,
  speakingUsers,
  getAvatarForUser,
}) => {
  return (
    <div className="mb-6 p-4 bg-gray-900 rounded-lg">
      <h3 className="text-lg font-bold text-white mb-4 text-center">Select Your Seat</h3>
      <div 
        className="grid gap-2 justify-items-center"
        style={{ 
          gridTemplateColumns: 'repeat(5, 1fr)' // Always 5 columns
        }}
      >
        {seats.map((seat) => (
          <button
            key={seat.id}
            onClick={() => handleSeatClick(seat.id)}
            disabled={seat.occupied && seat.userId !== authenticatedUserID}
            className={`w-12 h-12 rounded-lg flex items-center justify-center text-sm font-bold transition-all duration-200 ${
              seat.occupied
                ? seat.userId === authenticatedUserID
                  ? 'bg-green-500 text-white shadow-lg' // Your seat
                  : 'bg-red-500 text-white cursor-not-allowed' // Someone else's seat
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
          >
            {seat.userId ? (
              <div className="relative">
                <img 
                  src={getAvatarForUser(seat.userId)} 
                  alt="Avatar" 
                  className="w-8 h-8 rounded-full border-2 border-yellow-400"
                />
                {speakingUsers.has(seat.userId) && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping"></div>
                )}
              </div>
            ) : (
              <span>{seat.id}</span>
            )}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-2 text-center">
        Green = Your seat | Red = Taken | Gray = Available
      </p>
    </div>
  );
};

export default SeatingGrid;