// src/components/cinema/ui/MiniSeatGrid.jsx
import React from 'react';

const MiniSeatGrid = ({ seats, userSeats, currentUserID }) => {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: 'repeat(5, 1fr)',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gap: '2px',
        width: '80px',
        height: '50px',
        background: 'rgba(0,0,0,0.5)',
        borderRadius: '4px',
        padding: '2px',
      }}
    >
      {seats.slice(0, 40).map((seat, i) => {
        const isOccupied = seat.userId !== null;
        const isCurrentUser = seat.userId === currentUserID;
        return (
          <div
            key={i}
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '2px',
              backgroundColor: isOccupied ? (isCurrentUser ? '#4ecdc4' : '#ff6b6b') : '#333',
              border: isCurrentUser ? '1px solid white' : 'none',
            }}
          />
        );
      })}
    </div>
  );
};

export default MiniSeatGrid;