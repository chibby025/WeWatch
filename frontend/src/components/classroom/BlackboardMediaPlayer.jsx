import React, { useRef, useEffect, useState } from 'react';

const BlackboardMediaPlayer = ({ 
  media, 
  onClose, 
  isFullscreen, 
  onToggleFullscreen,
  blackboardPosition = { x: -0.933, y: 68.352, z: -238 }
}) => {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [position2D, setPosition2D] = useState({ x: 0, y: 0 });

  // Convert 3D position to 2D screen coordinates
  useEffect(() => {
    if (isFullscreen || !media) return;

    const updatePosition = () => {
      // Mock conversion - in real implementation, would use Three.js camera projection
      // For now, position at a fixed location that approximates blackboard position
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      
      // Approximate position based on typical camera view
      setPosition2D({
        x: screenWidth * 0.4, // Left side of screen
        y: screenHeight * 0.3  // Upper portion
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [isFullscreen, media]);

  // Auto-play video when media changes
  useEffect(() => {
    if (videoRef.current && media?.type?.startsWith('video')) {
      videoRef.current.currentTime = media.timestamp || 0;
      if (media.playing) {
        videoRef.current.play().catch(err => console.error('Video play error:', err));
      } else {
        videoRef.current.pause();
      }
    }
  }, [media]);

  if (!media) return null;

  const isVideo = media.type?.startsWith('video');
  const isImage = media.type?.startsWith('image');

  const fullscreenStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  };

  const overlayStyle = {
    position: 'absolute',
    left: `${position2D.x}px`,
    top: `${position2D.y}px`,
    width: '400px',
    height: '225px',
    backgroundColor: '#000',
    border: '2px solid #4ade80',
    borderRadius: '8px',
    overflow: 'hidden',
    cursor: 'pointer',
    zIndex: 100
  };

  const mediaStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'contain'
  };

  const closeButtonStyle = {
    position: 'absolute',
    top: '10px',
    right: '10px',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    border: 'none',
    color: 'white',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    zIndex: 10000
  };

  const fullscreenHintStyle = {
    position: 'absolute',
    bottom: '10px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: 'white',
    padding: '4px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    pointerEvents: 'none'
  };

  return (
    <div
      ref={containerRef}
      style={isFullscreen ? fullscreenStyle : overlayStyle}
      onClick={isFullscreen ? undefined : onToggleFullscreen}
    >
      {isVideo && (
        <video
          ref={videoRef}
          src={media.url}
          style={mediaStyle}
          controls={isFullscreen}
          onClick={(e) => {
            if (isFullscreen) {
              e.stopPropagation();
            }
          }}
        />
      )}
      
      {isImage && (
        <img
          src={media.url}
          alt={media.title || 'Blackboard Media'}
          style={mediaStyle}
        />
      )}

      {isFullscreen && (
        <button
          style={closeButtonStyle}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFullscreen();
          }}
        >
          Exit Fullscreen (F)
        </button>
      )}

      {!isFullscreen && (
        <div style={fullscreenHintStyle}>
          Click or press F for fullscreen
        </div>
      )}
    </div>
  );
};

export default BlackboardMediaPlayer;
