// frontend/src/components/SeatsModal.jsx
import React from 'react';

const SeatsModal = ({
  seats,
  userSeats,
  authenticatedUserID,
  handleSeatClick,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Choose Your Seat</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ×
          </button>
        </div>
        
        <div className="grid grid-cols-5 gap-2 mb-4">
          {seats.map((seat) => (
            <button
              key={seat.id}
              onClick={() => handleSeatClick(seat.id)}
              disabled={seat.occupied && seat.userId !== authenticatedUserID}
              className={`w-12 h-12 rounded-lg flex items-center justify-center text-sm font-bold transition-all duration-200 ${
                seat.occupied
                  ? seat.userId === authenticatedUserID
                    ? 'bg-green-500 text-white' // Your seat
                    : 'bg-red-500 text-white cursor-not-allowed' // Someone else's seat
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              }`}
            >
              {seat.userId ? (
                <img 
                  src="/avatars/default.png" 
                  alt="Avatar" 
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <span>{seat.id}</span>
              )}
            </button>
          ))}
        </div>
        
        <p className="text-xs text-gray-500 text-center">
          Green = Your seat | Red = Taken | Gray = Available
        </p>
      </div>
    </div>
  );
};

export default SeatsModal;