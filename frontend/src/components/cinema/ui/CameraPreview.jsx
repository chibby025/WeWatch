// src/components/cinema/ui/CameraPreview.jsx
import React, { useState, useEffect, useRef } from 'react';

const CameraPreview = ({ stream }) => {
  const [position, setPosition] = useState({ x: null, y: null });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const previewRef = useRef(null);
  const containerRef = useRef(null);
  const videoRef = useRef(null); // ✅ Keep this

  // ✅ IMPERATIVELY SET srcObject WHEN STREAM CHANGES
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Set default top-right on mount
  useEffect(() => {
    if (stream && position.x === null) {
      setPosition({ 
        x: window.innerWidth - 176,
        y: 16 
      });
    }
  }, [stream, position]);

  const handleMouseDown = (e) => {
    if (!previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
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
    newX = Math.max(0, Math.min(newX, containerRect.width - 160));
    newY = Math.max(0, Math.min(newY, containerRect.height - 120));
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

  if (!stream) return null;

  return (
    <div ref={containerRef} className="fixed inset-0 pointer-events-none z-50">
      <div
        ref={previewRef}
        className="pointer-events-auto absolute bg-black rounded-lg overflow-hidden border border-gray-700 shadow-lg"
        style={{
          width: '160px',
          height: '120px',
          left: `${position.x}px`,
          top: `${position.y}px`,
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
        onMouseDown={handleMouseDown}
      >
        {/* ✅ USE ref — DO NOT pass srcObject as prop */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
        />
        <div className="absolute top-1 left-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">
          You
        </div>
      </div>
    </div>
  );
};

export default CameraPreview;