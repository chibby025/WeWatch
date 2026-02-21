import React, { useMemo } from 'react';
import { Sphere, Text } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Visual markers showing seat positions from cinemaSeats.json
 * Color-coded by row for easy identification
 */
const SeatPositionMarkers = ({ seats, visible = true }) => {
  // Row colors - vibrant and distinct
  const rowColors = useMemo(() => ({
    1: '#ff6b6b', // Red
    2: '#4ecdc4', // Teal
    3: '#45b7d1', // Blue
    4: '#ffa07a', // Orange
    5: '#98d8c8', // Mint
    6: '#c77dff', // Purple
  }), []);

  if (!visible || !seats || seats.length === 0) return null;

  return (
    <group name="seat-position-markers">
      {seats.map((seat) => {
        const position = seat.position;
        const color = rowColors[seat.row] || '#ffffff';

        // Skip seats with no position data
        if (!position || position.every(v => v === 0)) return null;

        return (
          <group key={seat.id} position={position}>
            {/* Sphere marker */}
            <Sphere args={[0.15, 16, 16]}>
              <meshStandardMaterial
                color={color}
                transparent
                opacity={0.6}
                emissive={color}
                emissiveIntensity={0.3}
              />
            </Sphere>

            {/* Seat ID label */}
            <Text
              position={[0, 0.3, 0]}
              fontSize={0.15}
              color="white"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.02}
              outlineColor="#000000"
            >
              {seat.id}
            </Text>

            {/* Small vertical line to ground */}
            <mesh position={[0, -position[1] / 2, 0]}>
              <cylinderGeometry args={[0.01, 0.01, Math.abs(position[1]), 8]} />
              <meshBasicMaterial color={color} transparent opacity={0.3} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

export default SeatPositionMarkers;
