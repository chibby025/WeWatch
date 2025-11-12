import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * CinemaTheater - Creates a procedural 3D cinema environment
 * This component builds the theater using Three.js primitives
 */
export function CinemaTheater({ screenLight }) {
  const theaterRef = useRef();

  return (
    <group ref={theaterRef}>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 40]} />
        <meshStandardMaterial color="#1a0a0a" roughness={0.8} />
      </mesh>

      {/* Back Wall */}
      <mesh position={[0, 5, 15]} receiveShadow>
        <boxGeometry args={[30, 10, 0.5]} />
        <meshStandardMaterial color="#0a0505" roughness={0.9} />
      </mesh>

      {/* Left Wall */}
      <mesh position={[-15, 5, 0]} receiveShadow>
        <boxGeometry args={[0.5, 10, 40]} />
        <meshStandardMaterial color="#0a0505" roughness={0.9} />
      </mesh>

      {/* Right Wall */}
      <mesh position={[15, 5, 0]} receiveShadow>
        <boxGeometry args={[0.5, 10, 40]} />
        <meshStandardMaterial color="#0a0505" roughness={0.9} />
      </mesh>

      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 10, 0]} receiveShadow>
        <planeGeometry args={[30, 40]} />
        <meshStandardMaterial color="#050505" roughness={0.9} />
      </mesh>

      {/* Cinema Screen Frame */}
      <mesh position={[0, 4, -18]} receiveShadow>
        <boxGeometry args={[18, 10, 0.3]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.5} />
      </mesh>

      {/* Cinema Screen (where video will be displayed) */}
      <mesh position={[0, 4, -17.8]} name="cinema-screen">
        <planeGeometry args={[16, 9]} />
        <meshStandardMaterial 
          color="#000000" 
          emissive="#ffffff"
          emissiveIntensity={0.2}
        />
      </mesh>

      {/* Create rows of seats */}
      <CinemaSeats />
    </group>
  );
}

/**
 * CinemaSeats - Creates rows of cinema seats
 */
function CinemaSeats() {
  const seats = [];
  const rows = 6; // Number of rows
  const seatsPerRow = 8; // Seats per row
  const seatSpacing = 2;
  const rowSpacing = 2.5;
  
  const startZ = 2; // Start position (closer to screen)
  const startX = -(seatsPerRow * seatSpacing) / 2 + seatSpacing / 2;

  for (let row = 0; row < rows; row++) {
    for (let seat = 0; seat < seatsPerRow; seat++) {
      const x = startX + seat * seatSpacing;
      const z = startZ + row * rowSpacing;
      
      seats.push(
        <Seat 
          key={`seat-${row}-${seat}`}
          position={[x, 0.5, z]}
          row={row}
          seatNumber={seat}
        />
      );
    }
  }

  return <group>{seats}</group>;
}

/**
 * Individual Seat component
 */
function Seat({ position, row, seatNumber }) {
  const seatRef = useRef();
  const [hovered, setHovered] = React.useState(false);

  return (
    <group position={position}>
      {/* Seat base */}
      <mesh 
        ref={seatRef}
        position={[0, 0.3, 0]}
        castShadow
        receiveShadow
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[0.8, 0.6, 0.8]} />
        <meshStandardMaterial 
          color={hovered ? "#8B0000" : "#4a0000"} 
          roughness={0.7}
          metalness={0.3}
        />
      </mesh>

      {/* Seat back */}
      <mesh position={[0, 0.8, -0.3]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.8, 0.2]} />
        <meshStandardMaterial 
          color={hovered ? "#8B0000" : "#4a0000"}
          roughness={0.7}
          metalness={0.3}
        />
      </mesh>

      {/* Armrests */}
      <mesh position={[-0.4, 0.5, 0]} castShadow>
        <boxGeometry args={[0.1, 0.4, 0.6]} />
        <meshStandardMaterial color="#2a0000" />
      </mesh>
      <mesh position={[0.4, 0.5, 0]} castShadow>
        <boxGeometry args={[0.1, 0.4, 0.6]} />
        <meshStandardMaterial color="#2a0000" />
      </mesh>
    </group>
  );
}

export default CinemaTheater;
