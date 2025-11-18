import React from 'react';
import { generateAllSeats } from './seatCalculator';
import { Html } from '@react-three/drei';

export default function SeatMarkers({ 
  showLabels = true, 
  showPremiumOnly = false,
  markerSize = 0.1 
}) {
  const seats = generateAllSeats();
  const seatsToShow = showPremiumOnly 
    ? seats.filter(s => s.isPremium) 
    : seats;
  
  const getAdjustedPosition = (seat) => {
    let [x, y, z] = seat.position;

    // 🔸 Raise Rows 1, 2, and 5 vertically (+10%)
    if (seat.row === 1 || seat.row === 2 || seat.row === 5) {
      y *= 1.1;
    }

    // 🔸 Move seats 32–36 backward by 10%
    if (seat.id >= 32 && seat.id <= 36) {
      z *= 1.1;
    }

    // 🔸 Raise seats 39–42 by 3%
    if (seat.id >= 39 && seat.id <= 42) {
      y *= 1.03;
    }

    // 🔸 Extra height for 41–42 (+2%)
    if (seat.id === 41 || seat.id === 42) {
      y *= 1.02;
    }

    // 🔸 Move seat 38 forward
    if (seat.id === 38) {
      z += 0.25;
    }

    // 🔸 Special: Override Seat 36 to exact coordinates
    if (seat.id === 36) {
      x = -3.17;
      y = 3.66;
      z = -4.89;
    }

    // 🔸 Existing Z adjustments (Seat 1, Row 6 base shift, etc.)
    if (seat.id === 1) {
      z -= 0.3;
    }
    if (seat.row === 6) {
      z -= 0.25;
    }
    if (seat.id === 41 || seat.id === 42) {
      z -= 0.4;
    }
    
    // 🔸 Shift seats 18–21 RIGHT and UP by 2%
    if (seat.id >= 18 && seat.id <= 21) {
      x *= 0.98; // move right (less negative)
      y *= 1.02; // move up
    }

    return [x, y, z];
  };

  return (
    <group>
      {seatsToShow.map((seat) => {
        const markerPosition = getAdjustedPosition(seat);
        return (
          <group key={seat.id} position={markerPosition}>
            <mesh>
              <sphereGeometry args={[markerSize, 16, 16]} />
              <meshStandardMaterial 
                color={seat.isPremium ? '#ffd700' : '#00ff00'} 
                emissive={seat.isPremium ? '#ff8800' : '#00aa00'}
                emissiveIntensity={0.5}
                transparent
                opacity={0.7}
              />
            </mesh>
            
            {showLabels && (
              <Html
                position={[0, 0.3, 0]}
                center
                distanceFactor={2}
                style={{
                  background: seat.isPremium ? 'rgba(255, 215, 0, 0.8)' : 'rgba(0, 255, 0, 0.8)',
                  color: 'black',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                {seat.isPremium ? '⭐' : ''} #{seat.id}
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

export function SeatMarkerInfo() {
  const seats = generateAllSeats();
  const premiumSeats = seats.filter(s => s.isPremium);
  
  return (
    <div className="absolute top-4 right-4 bg-black bg-opacity-75 text-white p-3 rounded text-xs font-mono max-w-xs">
      <div className="font-bold text-yellow-400 mb-2">🪑 SEAT MARKERS</div>
      <div className="space-y-1 text-[10px]">
        <div>Total Seats: {seats.length}</div>
        <div>Premium Seats: {premiumSeats.length}</div>
        <div className="text-green-400">🟢 Green = Regular Seat</div>
        <div className="text-yellow-400">🟡 Gold = Premium Seat</div>
        <div className="mt-2 text-gray-400">
          Premium: Row 3-4, Seat 4 (middle seats)
        </div>
      </div>
    </div>
  );
}