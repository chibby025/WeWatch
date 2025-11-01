import React, { useState, useEffect, useRef } from 'react';

const VideoTiles = ({ participants = [], userSeat, isSeatedMode, localStream, currentUser, speakingUsers }) => {
  const containerRef = useRef(null);
  const [visibleTiles, setVisibleTiles] = useState([]);

  // Filter and limit participants
  useEffect(() => {
    let filtered = participants.filter(p => p.isCameraOn);

    // Seated mode: only same row
    if (isSeatedMode && userSeat?.row !== undefined) {
      filtered = filtered.filter(p => p.row === userSeat.row);
    }

    // Limit to 5
    setVisibleTiles(filtered.slice(0, 5));
  }, [participants, isSeatedMode, userSeat]);

  if (visibleTiles.length === 0) return null;

  return (
    <div 
      ref={containerRef} 
      className="fixed inset-0 pointer-events-none z-50"
    >
      {visibleTiles.map((participant) => (
        <VideoTile
          key={participant.id}
          participant={participant}
          containerRef={containerRef}
          isLocal={participant.id === currentUser?.id}
          localStream={localStream}
          isSpeaking={speakingUsers?.has(participant.id)}
        />
      ))}
    </div>
  );
};

const VideoTile = ({ participant, containerRef, isLocal, localStream }) => {
  const tileRef = useRef(null);
  const videoRef = useRef(null);
  const [position, setPosition] = useState({ x: null, y: null });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Set default position (top-right)
  useEffect(() => {
    if (position.x === null && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      setPosition({
        x: containerRect.width - 120,
        y: 20
      });
    }
  }, [position, containerRef]);

  // Handle video stream
  useEffect(() => {
    if (!videoRef.current) return;
    if (isLocal && localStream) {
      videoRef.current.srcObject = localStream;
    } else if (participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream, localStream, isLocal]);

  const handleMouseDown = (e) => {
    if (!tileRef.current) return;
    const rect = tileRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setIsDragging(true);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    let newX = e.clientX - dragOffset.x - containerRect.left;
    let newY = e.clientY - dragOffset.y - containerRect.top;
    newX = Math.max(0, Math.min(newX, containerRect.width - 100));
    newY = Math.max(0, Math.min(newY, containerRect.height - 100));
    setPosition({ x: newX, y: newY });
  };

  const handleMouseUp = () => setIsDragging(false);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  return (
    <div
      ref={tileRef}
      className="absolute pointer-events-auto w-24 h-24 rounded-lg overflow-hidden border-2 border-gray-700 bg-black"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'grab',
        transition: isDragging ? 'none' : 'box-shadow 0.3s, border-color 0.3s',
        // Speaking Glow
        boxShadow: isSpeaking ? '0 0 8px rgba(74, 222, 128, 0.8)' : 'none',
        borderColor: isSpeaking ? '#4ade80' : '#374151',
      }}
      onMouseDown={handleMouseDown}
    >
      {participant.isCameraOn ? (
        <video
          ref={videoRef}
          autoPlay
          muted={isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-800">
          <span className="text-white text-lg font-bold">
            {participant.username?.charAt(0)?.toUpperCase() || 'U'}
          </span>
        </div>
      )}
      
      {/* Username */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-1 truncate">
        {participant.username || `User${participant.id}`}
      </div>

      {/* Mic status */}
      <div className={`absolute top-0 right-0 w-3 h-3 rounded-full ${
        participant.isMuted ? 'bg-red-500' : 'bg-green-500'
      }`} />
    </div>
  );
};

export default VideoTiles;