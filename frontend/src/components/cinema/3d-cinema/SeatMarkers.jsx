import React from 'react';
import { generateAllSeats } from './seatCalculator';
import { Html } from '@react-three/drei';

/**
 * SeatMarkers - Visual markers to verify calculated seat positions
 * Shows small spheres at each seat location with seat number labels
 * 
 * Props:
 * - showLabels: Show seat numbers above markers (default: true)
 * - showPremiumOnly: Only show premium seats (default: false)
 * - markerSize: Size of sphere markers (default: 0.1)
 */
export default function SeatMarkers({ 
  showLabels = true, 
  showPremiumOnly = false,
  markerSize = 0.1 
}) {
  const seats = generateAllSeats();
  const seatsToShow = showPremiumOnly 
    ? seats.filter(s => s.isPremium) 
    : seats;
  
  console.log(`🎯 [SeatMarkers] Rendering ${seatsToShow.length} seat markers`);

  return (
    <group>
      {seatsToShow.map((seat) => (
        <group key={seat.id} position={seat.position}>
          {/* Seat marker sphere */}
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
          
          {/* Seat label */}
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
      ))}
    </group>
  );
}

/**
 * SeatMarkerInfo - Debug panel showing seat information
 */
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
