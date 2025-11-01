// src/components/cinema/ui/SeatSwapNotification.jsx
// 🪑 Floating toast notification for seat swap requests
// Auto-dismisses after 3s
// Works independently — just pass the message + type

import { useEffect } from 'react';

export default function SeatSwapNotification({ message, type = 'info', duration = 3000, onClose }) {
  // 🧹 Auto-dismiss after duration
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  // 🎨 Color by type
  const bgColor = {
    info: 'bg-blue-500',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500'
  }[type];

  return (
    <div className={`
      fixed bottom-24 left-1/2 transform -translate-x-1/2 z-50
      px-6 py-3 rounded-xl shadow-lg
      ${bgColor} text-white font-medium
      animate-fade-in animate-float
      flex items-center gap-3
    `}>
      {/* 🪑 Emoji Icon */}
      <span className="text-xl">🪑</span>
      
      {/* 📝 Message */}
      <span>{message}</span>
      
      {/* ❌ Close Button */}
      <button
        onClick={onClose}
        className="ml-4 text-white/80 hover:text-white text-lg font-bold"
        aria-label="Close notification"
      >
        ×
      </button>
    </div>
  );
}