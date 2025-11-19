// frontend/src/components/Taskbar.jsx
import React, { useState, useEffect } from 'react';
import MiniSeatGrid from './cinema/ui/MiniSeatGrid';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import SettingsModal from './cinema/ui/SettingsModal';
import EmotePicker from './cinema/ui/EmotePicker';

// Import SVG icons
const LeaveCallIcon = '/icons/LeaveCallIcon.svg';
const ChatIcon = '/icons/ChatIcon.svg';
const SeatsIcon = '/icons/SeatsIcon.svg';
const AudioIcon = '/icons/AudioIcon.svg';
const VideoIcon = '/icons/VideoIcon.svg';
const MembersIcon = '/icons/MembersIcon.svg';
const ShareIcon = '/icons/ShareIcon.svg';
const SeatToggleIcon = '/icons/SeatToggleIcon.svg';
const SettingsIcon = '/icons/settingsIcon.svg';
const EmotesIcon = '😊'; // Emoji as icon for emotes
const ProgramMenuIcon = '/icons/mediaScheduleIcon.svg'; // 🗂️ NEW: Menu icon

const Taskbar = ({
  authenticatedUserID,
  isAudioActive,
  toggleAudio,
  isHost,
  isSeatedMode,
  toggleSeatedMode,
  openChat,
  onMembersClick,
  onShareRoom,
  onSeatsClick,
  seats,
  userSeats,
  currentUser,
  isCameraOn,       
  toggleCamera,
  isHostBroadcasting,
  onHostBroadcastToggle,
  onLeaveCall,
  audioDevices = [],
  selectedAudioDeviceId,
  onAudioDeviceChange,
  availableCameras = [],
  selectedCameraId,
  onCameraSwitch,
  roomMembers = [],
  onEmoteSend,
  showProgram = true, // control visibility of menu icon
  showEmotes = true, // 👈 NEW: controls visibility of Emotes button
  showSeatModeToggle = true,   // 👈 NEW
  showVideoToggle = true,   // 👈 NEW
  onToggleLeftSidebar,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const [showMicDropdown, setShowMicDropdown] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showEmotePicker, setShowEmotePicker] = useState(false);
  const memberCount = roomMembers.length;

  // Auto-show for 3 seconds on mount
  useEffect(() => {
    setIsVisible(true);
    const timer = setTimeout(() => setIsVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Mouse move for auto-show
  useEffect(() => {
    const handleMouseMove = (e) => {
      const windowHeight = window.innerHeight;
      const mouseY = e.clientY;
      if (mouseY > windowHeight * 0.9) {
        setIsVisible(true);
        setIsHovering(true);
      } else if (mouseY < windowHeight * 0.8) {
        setIsHovering(false);
        setIsVisible(false);
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Close mic dropdown when clicking outside
  useEffect(() => {
    if (!showMicDropdown) return;
    const handleClickOutside = (e) => {
      if (!e.target.closest('.mic-dropdown-container')) {
        setShowMicDropdown(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showMicDropdown]);

  // Close settings menu when clicking outside
  useEffect(() => {
    if (!showSettingsMenu) return;
    const handleClickOutside = (e) => {
      if (!e.target.closest('.settings-menu-container')) {
        setShowSettingsMenu(false);
      }
    };
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 10);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showSettingsMenu]);

  // Touch handling (mobile)
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const handleTouchStart = (e) => setTouchStart(e.targetTouches[0].clientY);
  const handleTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientY);
  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > 50) setIsVisible(true);
    else if (distance < -50) setIsVisible(false);
    setTouchStart(null);
    setTouchEnd(null);
  };

  const taskbarStyle = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: isVisible ? '80px' : '0px',
    backgroundColor: '#3b82f6',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    transition: 'height 0.3s ease-in-out',
    zIndex: 1000,
    overflow: 'hidden',
  };

  const TaskbarButton = ({ icon, label, onClick, showCancelIndicator = false, isEmoji = false }) => {
    const [isHovered, setIsHovered] = useState(false);
    return (
      <div className="relative">
        <button
          className={`flex flex-col items-center justify-center text-white text-sm font-medium bg-transparent border-none p-2 rounded-md transition-colors duration-200 ${isHovered ? 'bg-white/10' : ''} hover:bg-white/10`}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={onClick}
          aria-label={label}
        >
          <div className="relative h-6 w-6 flex items-center justify-center">
            {isEmoji ? (
              <span className="text-2xl">{icon}</span>
            ) : (
              <img src={icon} alt={label} className="h-6 w-6" />
            )}
            {showCancelIndicator && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-[8px] text-white font-bold">×</span>
              </div>
            )}
          </div>
          <span className="text-xs mt-1 whitespace-normal text-center w-full px-1">
            {label === "Toggle Seat Mode" ? (
              <>
                Toggle
                <br />
                Seat Mode
              </>
            ) : label}
          </span>
        </button>
      </div>
    );
  };

  console.log('🔍 Taskbar received roomMembers:', roomMembers);

  return (
    <>
      <div
        style={taskbarStyle}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-center space-x-2">
          <TaskbarButton
            icon={LeaveCallIcon}
            label="Leave Call"
            onClick={onLeaveCall}
          />
        </div>

        <div className="flex items-center space-x-4">
          <TaskbarButton icon={ChatIcon} label="Chat" onClick={openChat} />

          {isHost && showSeatModeToggle && (
            <TaskbarButton
              icon={SeatToggleIcon}
              label="Seat Mode"
              onClick={toggleSeatedMode}
              showCancelIndicator={!isSeatedMode}
            />
          )}

          <TaskbarButton
            icon={SeatsIcon}
            label="Seats"
            onClick={onSeatsClick}
          />

          {/* Mic Button */}
          <div className="flex flex-col items-center relative">
            <div className={isHost && isHostBroadcasting && isSeatedMode ? "mic-pulse" : ""}>
              <TaskbarButton
                icon={AudioIcon}
                label="Audio"
                onClick={toggleAudio}
                showCancelIndicator={!isAudioActive}
              />
            </div>

            {isHost && isSeatedMode && (
              <button
                onClick={onHostBroadcastToggle}
                className={`mt-1 px-2 py-0.5 rounded text-[9px] font-medium whitespace-nowrap ${
                  isHostBroadcasting ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-300'
                }`}
                title="Speak to everyone"
              >
                🌍 Global
              </button>
            )}
          </div>

          {showVideoToggle && (
            <TaskbarButton
              icon={VideoIcon}
              label="Video"
              onClick={toggleCamera}
              showCancelIndicator={!isCameraOn}
            />
          )}

          {/* ✅ Emotes button conditionally rendered */}
          {showEmotes && (
            <TaskbarButton
              icon={EmotesIcon}
              label="Emotes"
              onClick={() => setShowEmotePicker(!showEmotePicker)}
              isEmoji={true}
            />
          )}

          <TaskbarButton
            icon={MembersIcon}
            label={`${memberCount}`}
            onClick={onMembersClick}
          />
        </div>

        <div className="flex items-center space-x-2 settings-menu-container">

          {/* 🗂️ NEW: Menu / Program Button */}
          {showProgram && (
            <TaskbarButton
              icon={ProgramMenuIcon} // Make sure this is imported
              label="Menu"
              onClick={onToggleLeftSidebar}
            />
          )}
          <TaskbarButton
            icon={SettingsIcon}
            label="Settings"
            onClick={() => setShowSettingsMenu(!showSettingsMenu)}
          />
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsMenu}
        onClose={() => setShowSettingsMenu(false)}
        onShareRoom={onShareRoom}
        audioDevices={audioDevices}
        selectedAudioDeviceId={selectedAudioDeviceId}
        onAudioDeviceChange={onAudioDeviceChange}
        availableCameras={availableCameras}
        selectedCameraId={selectedCameraId}
        onCameraSwitch={onCameraSwitch}
      />

      {/* Emote Picker Modal */}
      {showEmotes && (
        <EmotePicker
          isOpen={showEmotePicker}
          onClose={() => setShowEmotePicker(false)}
          onEmoteSelect={(emoteId) => {
            if (onEmoteSend) {
              onEmoteSend({
                user_id: authenticatedUserID,
                emote: emoteId,
                timestamp: Date.now(),
              });
            }
          }}
        />
      )}
    </>
  );
};

export default Taskbar;