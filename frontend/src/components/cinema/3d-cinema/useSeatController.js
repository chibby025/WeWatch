// useSeatController.js
import { useState, useCallback, useMemo } from 'react';
import { getSeatByPosition, assignUserToSeat } from './seatCalculator';

export function useSeatController({
  currentUser,
  initialSeatId = null,
  onSeatChange = null // Optional: (seatId, seatData) => void
}) {
  const [currentSeatKey, setCurrentSeatKey] = useState(initialSeatId);

  // Compute actual seat data from key like "2-3"
  const currentSeat = useMemo(() => {
    if (!currentUser) return null;

    let seatData = null;
    if (currentSeatKey?.includes('-')) {
      const [rowStr, colStr] = currentSeatKey.split('-');
      const row = parseInt(rowStr, 10);
      const col = parseInt(colStr, 10);
      if (!isNaN(row) && !isNaN(col)) {
        const seatInRow = col + 1;
        seatData = getSeatByPosition(row + 1, seatInRow);
        if (seatData) {
          return {
            ...seatData,
            id: seatData.id,
            key: currentSeatKey,
            avatarPosition: seatData.position,
            cameraPosition: getCameraPositionFromAvatar(seatData.position, seatData.id),
            label: `Row ${row + 1}, Seat ${seatInRow}`
          };
        }
      }
    }

    // Fallback: assign by user ID
    if (!seatData) {
      seatData = assignUserToSeat(currentUser.id || 1);
      return {
        ...seatData,
        key: `${seatData.row - 1}-${seatData.seatInRow - 1}`, // convert to 0-based key
        cameraPosition: getCameraPositionFromAvatar(seatData.position, seatData.id)
      };
    }

    return seatData;
  }, [currentSeatKey, currentUser]);

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

// Helper: extract camera position (reuse from seatCalculator)
function getCameraPositionFromAvatar(avatarPosition, seatId = null) {
  const [x, y, z] = avatarPosition;
  // ✅ Row 1 seats (A1-A7, seats 1-7) - Raised slightly to look more downward
  if (seatId >= 1 && seatId <= 7) return [x, 2.35, -0.86];
  // ✅ Row 2 seats (B1-B7, seats 8-14) - All use same Y & Z from B1, keep individual X
  if (seatId >= 8 && seatId <= 14) return [x, 2.65, -2.38];
  // ✅ Apply same camera adjustment to all Row 5 seats (E1-E7, seats 29-35)
  if (seatId >= 29 && seatId <= 35) return [x, y * 1.22, z - 0.3];
  return [x, y * 1.07, z * 0.91];
}