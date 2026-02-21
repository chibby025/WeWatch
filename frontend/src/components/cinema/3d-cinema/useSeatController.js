// useSeatController.js
import { useState, useCallback, useMemo } from 'react';

export function useSeatController({
  currentUser,
  initialSeatId = null,
  onSeatChange = null, // Optional: (seatId, seatData) => void
  cinemaSeats = { seats: [] } // ✅ NEW: cinemaSeats.json data
}) {
  const [currentSeatKey, setCurrentSeatKey] = useState(initialSeatId);

  // Compute actual seat data from key like "2-3" using cinemaSeats.json
  const currentSeat = useMemo(() => {
    if (!currentUser) return null;

    // Create lookup map for fast seat access
    const seatMap = new Map();
    cinemaSeats.seats.forEach(seat => {
      seatMap.set(seat.id, seat);
    });

    if (currentSeatKey?.includes('-')) {
      const [rowStr, colStr] = currentSeatKey.split('-');
      const row = parseInt(rowStr, 10);
      const col = parseInt(colStr, 10);
      
      if (!isNaN(row) && !isNaN(col)) {
        // ✅ Convert "row-col" (0-indexed) to seat ID (1-42)
        const seatId = row * 7 + col + 1;
        const seatData = seatMap.get(seatId);
        
        if (seatData) {
          return {
            id: seatData.id,
            key: currentSeatKey,
            position: seatData.position,
            row: seatData.row,
            seatInRow: seatData.seatInRow,
            // ✅ Use center camera view from JSON
            cameraPosition: seatData.cameraViews?.center?.position || seatData.position,
            cameraLookAt: seatData.cameraViews?.center?.lookAt || [0, 3, 0],
            // Store all camera views for L/C/R switching
            cameraViews: seatData.cameraViews,
            label: `Row ${seatData.row}, Seat ${seatData.seatInRow}`
          };
        }
      }
    }

    // Fallback: use first seat if no seat key
    const firstSeat = seatMap.get(1);
    if (firstSeat) {
      return {
        id: firstSeat.id,
        key: '0-0',
        position: firstSeat.position,
        row: firstSeat.row,
        seatInRow: firstSeat.seatInRow,
        cameraPosition: firstSeat.cameraViews?.center?.position || firstSeat.position,
        cameraLookAt: firstSeat.cameraViews?.center?.lookAt || [0, 3, 0],
        cameraViews: firstSeat.cameraViews,
        label: `Row ${firstSeat.row}, Seat ${firstSeat.seatInRow}`
      };
    }

    return null;
  }, [currentSeatKey, currentUser, cinemaSeats.seats]);

  const jumpToSeat = useCallback((seatKey) => {
    if (!seatKey) return;
    setCurrentSeatKey(seatKey);
    if (onSeatChange && currentSeat) {
      onSeatChange(seatKey, currentSeat);
    }
  }, [onSeatChange, currentSeat]);

  return {
    currentSeat,
    jumpToSeat,
    currentSeatKey
  };
}