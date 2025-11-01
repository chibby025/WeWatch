// src/components/cinema/ui/ScrollableSeatGrid.jsx
import React from 'react';
import AudioIcon from '/icons/AudioIcon.svg'; // ✅ Mic icon

const ScrollableSeatGrid = ({ 
  seats, 
  userSeats, 
  currentUserID, 
  onClose, 
  onSeatClick, 
  speakingUsers 
}) => {
  const seatToUserId = {};
  Object.entries(userSeats).forEach(([userId, seatId]) => {
    seatToUserId[seatId] = userId;
  });

  const renderSeat = (seat, index) => {
    const seatId = `${seat.row}-${seat.col}`;
    const userId = seatToUserId[seatId];
    const isOccupied = !!userId;
    const isCurrentUser = userId === currentUserID;
    const isSpeaking = isOccupied && speakingUsers?.has(userId);

    // ✅ Color logic
    const isYou = isCurrentUser;
    const isEmpty = !isOccupied;
    const textColor = isYou ? '#4ade80' : (isEmpty ? '#94a3b8' : '#f1f5f9');
    const bgColor = isYou ? '#4ade80' : 'transparent';

    const displayName = isYou 
      ? 'YOU' 
      : isOccupied 
        ? `User${userId?.slice(0, 4)}`
        : '';

    return (
      <div
        key={index}
        onClick={() => isOccupied && !isCurrentUser && onSeatClick({ id: seatId, userId })}
        style={{
          width: '50px',
          height: '60px',
          margin: '4px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bgColor,
          color: textColor,
          fontSize: '10px',
          fontWeight: isYou ? 'bold' : 'normal',
          cursor: isOccupied && !isCurrentUser ? 'pointer' : 'default',
          userSelect: 'none',
          position: 'relative',
        }}
      >
        {/* Seat icon */}
        <img
          src="/icons/SeatsIcon.svg"
          alt="Seat"
          style={{
            width: '20px',
            height: '20px',
            filter: isEmpty 
              ? 'grayscale(100%) opacity(0.3)' 
              : 'brightness(1)',
          }}
        />
        
        {/* Name */}
        <div style={{ marginTop: '4px', textAlign: 'center' }}>
          {displayName}
        </div>

        {/* ✅ Mic icon for occupied seats */}
        {isOccupied && (
          <img
            src={AudioIcon}
            alt="Mic"
            style={{
              position: 'absolute',
              bottom: '-2px',
              right: '-2px',
              width: '12px',
              height: '12px',
              filter: isSpeaking 
                ? 'drop-shadow(0 0 4px #4ade80)' // green glow
                : 'grayscale(100%) brightness(0.5)', // red/muted look
            }}
          />
        )}

        {/* Speaking dot (optional, but keep if you like) */}
        {isSpeaking && (
          <div style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            width: '8px',
            height: '8px',
            backgroundColor: '#4ade80',
            borderRadius: '50%',
            border: '1px solid white',
            zIndex: 10
          }} />
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '80px',
        backgroundColor: '#1e293b',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        zIndex: 1001,
        boxShadow: '0 -4px 12px rgba(0,0,0,0.3)',
      }}
    >
      <button
        onClick={onClose}
        aria-label="Close seat grid"
        style={{
          background: 'none',
          border: 'none',
          color: 'white',
          fontSize: '20px',
          fontWeight: 'bold',
          cursor: 'pointer',
          marginRight: '12px',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ×
      </button>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gridTemplateRows: 'repeat(5, 1fr)',
          gap: '4px',
          width: '260px',
          height: '60px',
        }}
      >
        {seats.slice(0, 25).map(renderSeat)}
      </div>
    </div>
  );
};

export default ScrollableSeatGrid;