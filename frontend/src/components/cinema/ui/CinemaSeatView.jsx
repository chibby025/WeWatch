// src/components/cinema/ui/CinemaSeatView.jsx
import React, { useEffect, useState } from 'react';

const CinemaSeatView = ({ onClose }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger slide-up
    setIsVisible(true);

    // After 1.3s: slide down + close
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for animation to finish
    }, 1300);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className="cinema-seat-view"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '35vh',
        backgroundImage: 'url(/icons/seats-image.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center bottom',
        backgroundRepeat: 'no-repeat',
        zIndex: 9999,
        pointerEvents: 'none',
        opacity: isVisible ? 0.9 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.4s ease-out, opacity 0.4s ease-out',
      }}
    />
  );
};

export default CinemaSeatView;