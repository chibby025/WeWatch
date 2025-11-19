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
  if (seatId === 1) return [-3.15, 2.64, -0.72];
  if (seatId === 2) return [-3.66, 2.61, -0.78];
  if (seatId === 3) return [-4.03, 2.50, -0.76];
  if (seatId === 4) return [-4.63, 2.79, -0.70];
  if (seatId === 5) return [-5.02, 2.09, -0.73];
  if (seatId === 6) return [-5.38, 1.89, -0.79];
  if (seatId === 7) return [x, y * 1.03, z * 0.92];
  return [x, y * 1.07, z * 0.91];
}