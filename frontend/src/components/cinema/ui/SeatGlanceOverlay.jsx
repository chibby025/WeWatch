// src/components/cinema/ui/SeatGlanceOverlay.jsx
import React, { useEffect } from 'react';

const SeatGlanceOverlay = ({ seats, userSeats, currentUserID, onClose }) => {
  // Auto-close after 1 second
  useEffect(() => {
    const timer = setTimeout(onClose, 1000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const renderSeat = (seat, index) => {
    const isOccupied = seat.userId !== null;
    const isCurrentUser = seat.userId === currentUserID;
    const occupantName = isOccupied ? `User${seat.userId.slice(0,4)}` : '';

    return (
      <div
        key={index}
        className={`seat ${isOccupied ? 'occupied' : 'empty'} ${isCurrentUser ? 'current-user' : ''}`}
        style={{
          width: '30px',
          height: '30px',
          margin: '5px',
          borderRadius: '4px',
          backgroundColor: isOccupied ? '#ff6b6b' : '#333',
          border: isCurrentUser ? '2px solid #fff' : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '8px',
          color: 'white',
          cursor: 'default'
        }}
      >
        {isOccupied && !isCurrentUser && occupantName.charAt(0)}
        {isCurrentUser && 'YOU'}
      </div>
    );
  };

  return (
    <div
      className="seat-glance-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none', // ← allows clicks to pass through to video
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateRows: 'repeat(5, 1fr)',
          gridTemplateColumns: 'repeat(8, 1fr)',
          gap: '5px',
          padding: '20px',
          maxWidth: '80%',
          maxHeight: '60%',
        }}
      >
        {seats.map((seat, i) => renderSeat(seat, i))}
      </div>
    </div>
  );
};

export default SeatGlanceOverlay;