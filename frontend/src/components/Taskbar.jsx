// frontend/src/components/Taskbar.jsx
import React, { useState, useEffect, useRef } from 'react';
import SettingsModal from './cinema/ui/SettingsModal';
import EmotePicker from './cinema/ui/EmotePicker';
import EmojiImage from './cinema/ui/EmojiImage';
import AudioSettingsDropdown from './AudioSettingsDropdown';

// Import SVG icons
const LeaveCallIcon = '/icons/LeaveCallIcon.svg';
const ChatIcon = '/icons/ChatIcon.svg';
const SeatsIcon = '/icons/SeatsIcon.svg';
const AudioIcon = '/icons/AudioIcon.svg';
const SilenceIcon = '/icons/silenceIcon.svg';
const VideoIcon = '/icons/VideoIcon.svg';
const MembersIcon = '/icons/MembersIcon.svg';
const SettingsIcon = '/icons/settingsIcon.svg';
const EmotesIcon = '😊';
const ProgramMenuIcon = '/icons/mediaScheduleIcon.svg';
const SpeakerIcon = '/icons/speaker.svg';

// ✅ Extracted and memoized — won't reset hover on parent re-renders
const TaskbarButton = React.memo(({ 
  icon, 
  label, 
  onClick, 
  onRightClick,
  showCancelIndicator = false, 
  isEmoji = false,
  shouldPulse = false,
  subtitle = null,
  buttonRef = null
}) => {
  const [isHovered, setIsHovered] = useState(false);
  
  // Debug: log pulse state for Audio button
  useEffect(() => {
    if (label === 'Audio') {
      console.log('🔊 [TaskbarButton] Audio button - shouldPulse:', shouldPulse);
    }
  }, [shouldPulse, label]);

  return (
    <div className="relative flex flex-col items-center">
      <button
        ref={buttonRef}
        className={`flex flex-col items-center justify-center text-white text-sm font-medium bg-transparent border-none p-2 rounded-md transition-colors duration-200 ${isHovered ? 'bg-white/10' : ''}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={onClick}
        onContextMenu={(e) => {
          if (onRightClick) {
            e.preventDefault();
            onRightClick(e);
          }
        }}
        aria-label={label}
      >
        <div className={`relative h-8 w-8 flex items-center justify-center ${shouldPulse ? 'animate-pulse-green' : ''}`}>
          {isEmoji ? (
            <EmojiImage emoji={icon} size={32} />
          ) : (
            <img src={icon} alt={label} className="h-8 w-8" />
          )}
          {showCancelIndicator && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-[8px] text-white font-bold">×</span>
            </div>
          )}
        </div>
        <span className="text-xs mt-1 whitespace-normal text-center w-full px-1">
          {label}
        </span>
      </button>
      {subtitle && (
        <span className="text-[10px] text-gray-400 mt-0.5 whitespace-nowrap">
          {subtitle}
        </span>
      )}
    </div>
  );
});

const Taskbar = ({
  authenticatedUserID,
  isAudioActive,
  toggleAudio,
  isHost,
  openChat,
  onMembersClick,
  showPositionDebug,
  onTogglePositionDebug,
  onShareRoom,
  onOpenUserProfile, // ✅ NEW: Handler for opening user's own profile
  onSeatsClick,
  onTheaterOverviewClick, // ✅ Right-click on Seats icon to open theater overview
  userSeats,
  currentUser,
  roomMembers,
  handleSeatSelect,
  isViewLocked,
  setIsViewLocked,
  lightsOn,
  setLightsOn,
  isCameraOn,
  toggleCamera,
  showSeatMarkers,
  onToggleSeatMarkers,
  isHostBroadcasting,
  onHostBroadcastToggle,
  onLeaveCall,
  audioDevices = [],
  selectedAudioDeviceId,
  onAudioDeviceChange,
  availableCameras = [],
  selectedCameraId,
  onCameraSwitch,
  isLeftSidebarOpen,
  onEmoteSend,
  showProgram = true,
  showEmotes = true,
  showVideoToggle = true,
  onToggleLeftSidebar,
  seatSwapRequest,
  isSilenceMode = false,
  onToggleSilenceMode,
  broadcastPermissions = {},
}) => {
  // 🔍 Debug: Log isAudioActive prop changes
  useEffect(() => {
    console.log('🔊 [Taskbar] isAudioActive prop changed:', isAudioActive);
  }, [isAudioActive]);

  const [isVisible, setIsVisible] = useState(true);
  const [showMicDropdown, setShowMicDropdown] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showEmotePicker, setShowEmotePicker] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const audioButtonRef = useRef(null);
  // ✅ Count all members (including demo users) - this is intentional for cinema mode
  const memberCount = roomMembers.length;
  const hideTimerRef = useRef(null);
  const lastEventTimeRef = useRef(0);

  // 🔍 Debug: Log member count changes
  useEffect(() => {
    console.log('👥 [Taskbar] Member count updated:', memberCount, 'members:', roomMembers.map(m => ({ id: m.id, username: m.username, is_demo: m.is_demo })));
  }, [memberCount, roomMembers]);

  // Auto-show for 3 seconds on mount
  useEffect(() => {
    setIsVisible(true);
    const timer = setTimeout(() => setIsVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Mouse visibility logic — stable during media playback
  useEffect(() => {
    const handleMouseMove = (e) => {
      const now = Date.now();
      if (now - lastEventTimeRef.current < 100) return; // debounce
      lastEventTimeRef.current = now;

      const windowHeight = window.innerHeight;
      const mouseY = e.clientY;

      if (mouseY > windowHeight * 0.92) {
        setIsVisible(true);
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
      } else if (mouseY < windowHeight * 0.85) {
        if (!hideTimerRef.current) {
          hideTimerRef.current = setTimeout(() => {
            setIsVisible(false);
            hideTimerRef.current = null;
          }, 600);
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // Auto-unpin when sidebar closes
  useEffect(() => {
    if (!isLeftSidebarOpen) {
      setIsVisible(false);
    }
  }, [isLeftSidebarOpen]);

  // Close mic dropdown
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

  // Close settings menu
  useEffect(() => {
    if (!showSettingsMenu) return;
    const handleClickOutside = (e) => {
      if (
        !e.target.closest('.settings-menu-container') &&
        !e.target.closest('.settings-modal-content')
      ) {
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

  // Touch handling (optional — keep if needed)
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

          {/* Speaker button - only show for host when audio is unmuted */}
          {isHost && isAudioActive && onHostBroadcastToggle && (() => {
            // Get host's row number
            const hostSeatId = userSeats?.[authenticatedUserID];
            const rowNumber = hostSeatId ? hostSeatId.split('-')[0] : '?';
            
            return (
              <TaskbarButton
                icon={SpeakerIcon}
                label={isHostBroadcasting ? "Whole Room" : "Row Audio"}
                onClick={onHostBroadcastToggle}
                shouldPulse={isHostBroadcasting}
              />
            );
          })()}

          <div className="relative">
            {seatSwapRequest && (
              <div className="absolute -top-7 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white text-xs px-2 py-1 rounded shadow z-10 whitespace-nowrap">
                Swap request from {seatSwapRequest.requesterName}
              </div>
            )}
            <TaskbarButton
              icon={SeatsIcon}
              label="Seats"
              onClick={onSeatsClick}
              onRightClick={onTheaterOverviewClick}
            />
          </div>

          <TaskbarButton
            buttonRef={audioButtonRef}
            icon={isSilenceMode ? SilenceIcon : AudioIcon}
            label="Audio"
            onClick={toggleAudio}
            onRightClick={() => setShowAudioSettings(!showAudioSettings)}
            showCancelIndicator={!isAudioActive && !isSilenceMode}
            shouldPulse={isAudioActive && !isSilenceMode}
            subtitle={
              isSilenceMode 
                ? "Silence ON" 
                : (!isAudioActive ? "Mic OFF" : (() => {
                    // ✅ Check if user has broadcast permission or is host broadcasting
                    const hasBroadcastPermission = broadcastPermissions[authenticatedUserID];
                    const isGlobalBroadcast = (isHost && isHostBroadcasting) || hasBroadcastPermission;
                    
                    if (isGlobalBroadcast) {
                      return "Whole Room";
                    }
                    
                    // Show row number for row-based audio
                    const userSeatId = userSeats?.[authenticatedUserID];
                    const rowNumber = userSeatId ? userSeatId.split('-')[0] : '?';
                    return `Row ${rowNumber}`;
                  })())
            }
          />

          {showVideoToggle && (
            <TaskbarButton
              icon={VideoIcon}
              label="Video"
              onClick={toggleCamera}
              showCancelIndicator={!isCameraOn}
            />
          )}

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
          {showProgram && (
            <TaskbarButton
              icon={ProgramMenuIcon}
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

      <SettingsModal
        showPositionDebug={showPositionDebug}
        onTogglePositionDebug={onTogglePositionDebug}
        isOpen={showSettingsMenu}
        onClose={() => setShowSettingsMenu(false)}
        onShareRoom={onShareRoom}
        onOpenUserProfile={onOpenUserProfile} // ✅ NEW: Pass profile handler
        audioDevices={audioDevices}
        selectedAudioDeviceId={selectedAudioDeviceId}
        onAudioDeviceChange={onAudioDeviceChange}
        availableCameras={availableCameras}
        selectedCameraId={selectedCameraId}
        onCameraSwitch={onCameraSwitch}
        showSeatMarkers={showSeatMarkers}
        onToggleSeatMarkers={onToggleSeatMarkers}
        currentUser={currentUser}
        userSeats={userSeats}
        roomMembers={roomMembers}
        handleSeatSelect={handleSeatSelect}
        isViewLocked={isViewLocked}
        setIsViewLocked={setIsViewLocked}
        lightsOn={lightsOn}
        setLightsOn={setLightsOn}
      />

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

      {/* Audio Settings Dropdown */}
      <AudioSettingsDropdown
        isOpen={showAudioSettings}
        onClose={() => setShowAudioSettings(false)}
        isAudioActive={isAudioActive}
        onToggleAudio={toggleAudio}
        isSilenceMode={isSilenceMode}
        onToggleSilenceMode={onToggleSilenceMode}
        audioDevices={audioDevices}
        selectedAudioDeviceId={selectedAudioDeviceId}
        onAudioDeviceChange={onAudioDeviceChange}
        anchorRef={audioButtonRef}
      />
    </>
  );
};

export default Taskbar;