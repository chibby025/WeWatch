// src/components/cinema/ui/HoverTaskbar.jsx
// 🎚️ Tailwind-powered taskbar — no inline styles
// Uses extended animations from tailwind.config.js
// Fully reusable, accessible, Figma-accurate

import { useState, useEffect, useCallback } from 'react';
const MenuIcon = '/icons/MenuIcon.svg';
const ChatIcon = '/icons/ChatIcon.svg';
const SeatsIcon = '/icons/SeatsIcon.svg';
const AudioIcon = '/icons/AudioIcon.svg';
const VideoIcon = '/icons/VideoIcon.svg';
const MembersIcon = '/MembersIcon.svg';
const ShareIcon = '/icons/ShareIcon.svg';
const LeaveCallIcon = '/icons/LeaveCallIcon.svg';

export default function HoverTaskbar({
  onLeave,
  onToggleSeats,
  onToggleVideoSidebar,
  onToggleLeftSidebar,
  isHost = false,
  pendingRequestsCount = 0
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isGlowing, setIsGlowing] = useState(false);

  // Reset glow when taskbar opens
  useEffect(() => {
    if (isVisible && isGlowing) {
      setIsGlowing(false);
    }
  }, [isVisible]);

  // Trigger glow if notification arrives while hidden
  useEffect(() => {
    if (pendingRequestsCount > 0 && !isVisible) {
      setIsGlowing(true);
    }
  }, [pendingRequestsCount, isVisible]);

  // Mouse move handler
  const handleMouseMove = useCallback((e) => {
    const windowHeight = window.innerHeight;
    const mouseY = e.clientY;

    if (mouseY > windowHeight * 0.9) {
      setIsVisible(true);
    } else if (mouseY < windowHeight * 0.8) {
      setIsVisible(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  // 🎛️ Reusable Taskbar Button Component
  const TaskbarButton = ({ icon, label, onClick, showBadge = false, badgeCount = 0 }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
      <div className="relative">
        <button
          className={`
            flex flex-col items-center justify-center
            text-white text-xl bg-transparent border-none
            p-2 rounded-md transition-colors duration-200
            ${isHovered ? 'bg-white/10' : ''}
          `}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={onClick}
          aria-label={label}
        >
          <img src={icon} alt={label} className="h-6 w-6" />
          <span className="text-xs mt-1">{label}</span>
        </button>

        {/* 🔴 Badge */}
        {showBadge && badgeCount > 0 && (
          <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {badgeCount > 9 ? '9+' : badgeCount}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`
        fixed bottom-0 left-0 right-0 h-16
        bg-gray-900/90 backdrop-blur-md
        flex items-center justify-center gap-6 px-4
        z-50
        transition-transform duration-300 ease-out
        ${isVisible ? 'animate-slide-up' : 'animate-slide-down'}
        ${isGlowing ? 'animate-glow-pulse' : 'shadow-lg shadow-black/50'}
      `}
    >
      {/* 🚪 Leave */}
      <TaskbarButton icon={LeaveCallIcon} label="Leave" onClick={onLeave} />

      {/* 💬 Chat */}
      <TaskbarButton
        icon={ChatIcon}
        label="Chat"
        onClick={() => alert("Chat panel coming soon!")}
      />

      {/* 🪑 Seats — with badge */}
      <TaskbarButton
        icon={SeatsIcon}
        label="Seats"
        onClick={onToggleSeats}
        showBadge={true}
        badgeCount={pendingRequestsCount}
      />

      {/* 📹 Video */}
      <TaskbarButton
        icon={VideoIcon}
        label="Video"
        onClick={onToggleVideoSidebar}
      />

      {/* 🍔 Menu */}
      <TaskbarButton
        icon={MenuIcon}
        label="Menu"
        onClick={onToggleLeftSidebar}
      />

      {/* 👑 Host (optional) */}
      {isHost && (
        <TaskbarButton
          icon="👑"
          label="Host"
          onClick={() => alert("Host controls coming soon!")}
        />
      )}
    </div>
  );
}