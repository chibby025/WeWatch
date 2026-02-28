// frontend/src/components/Taskbar.jsx
import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import SettingsModal from './cinema/ui/SettingsModal';
import EmotePicker from './cinema/ui/EmotePicker';
import EmojiImage from './cinema/ui/EmojiImage';
import AudioSettingsDropdown from './AudioSettingsDropdown';
import { playMicOnSound, playMicOffSound } from '../utils/audio';
import { TaskbarAudioWaveform } from './AudioWaveform';

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
const BoardIcon = '/icons/board.svg'; // Board icon for lecture hall left sidebar
const QuizIcon = '📝'; // Quiz emoji icon for lecture hall

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
  buttonRef = null,
  notificationCount = 0, // ✅ Notification badge count
  localAudioLevel = 0 // ✅ Audio level for waveform animation (0-255)
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
        <div className="relative h-8 w-8 flex items-center justify-center">
          {isEmoji ? (
            <EmojiImage emoji={icon} size={32} />
          ) : (
            <img src={icon} alt={label} className="h-8 w-8" />
          )}
          {/* ✅ Show animated waveform overlay when speaking (replaces simple pulse) */}
          {label === 'Audio' && shouldPulse && localAudioLevel > 0 && (
            <TaskbarAudioWaveform audioLevel={localAudioLevel} />
          )}
          {showCancelIndicator && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-[8px] text-white font-bold">×</span>
            </div>
          )}
          {notificationCount > 0 && (
            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow-lg">
              {notificationCount > 99 ? '99+' : notificationCount}
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
  watchType = 'video', // 'video', '3d_cinema', 'classroom'
  classType = null, // 'classroom', 'lecture_hall' (only for watchType='classroom')
  authenticatedUserID,
  isAudioActive,
  toggleAudio,
  localAudioLevel = 0, // Audio level for taskbar waveform animation (0-255)
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
  watchSessionMembers, // Active watch session participants (renamed from roomMembers)
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
  // Raise hand props
  handRaised = false,
  hasHostApproval = false,
  onRaiseHand,
  onLowerHand,
  raisedHands = [],
  onApproveSpeaker,
  onRevokeSpeaker,
  approvedSpeakers = {},
  // Lecture Hall Settings
  showDebugPanels,
  onToggleDebugPanels,
  freeRoamMode,
  setFreeRoamMode,
  lockMovement,
  setLockMovement,
  lockOrbit,
  setLockOrbit,
  showPreview,
  setShowPreview,
  showAvatars,
  setShowAvatars,
  showCameraMarkers,
  setShowCameraMarkers,
  showPositionDebugLectureHall,
  onTogglePositionDebugLectureHall,
  showAudioDebugPanel,
  onToggleAudioDebugPanel,
  showViewDirectionModal,
  onToggleViewDirectionModal,
  onExportCameraPositions,
  savedCameraPositionsCount,
  // Keyboard Movement
  freeCameraMovement,
  setFreeCameraMovement,
  // Demo Mode
  demoMode,
  setDemoMode,
  // Quiz System
  onQuizClick,
  activeQuizCount = 0,
  // Chat Bubble Visibility
  showChatBubbles = true,
  onToggleChatBubbles,
  // Unread Messages
  unreadMessages = {}, // {userId: unreadCount}
}) => {
  // 🎯 Derive feature flags from watch type
  const isClassroom = watchType === 'classroom';
  const isLectureHall = isClassroom && classType === 'lecture_hall';
  
  // ✅ Calculate total unread message count
  const totalUnreadCount = Object.values(unreadMessages).reduce((sum, count) => sum + count, 0);
  
  // 🔍 Debug: Log isAudioActive prop changes
  useEffect(() => {
    // console.log('🔊 [Taskbar] isAudioActive prop changed:', isAudioActive);
  }, [isAudioActive]);

  const [isVisible, setIsVisible] = useState(true);
  const [showMicDropdown, setShowMicDropdown] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showEmotePicker, setShowEmotePicker] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [showRaisedHandsPopup, setShowRaisedHandsPopup] = useState(false);
  const audioButtonRef = useRef(null);
  const membersButtonRef = useRef(null);
  // ✅ Use watchSessionMembers directly - API fetch is now stable with hasApiFetchedMembersRef guard
  const memberCount = watchSessionMembers?.length || 0;
  const raisedHandsCount = raisedHands?.length || 0;
  const hideTimerRef = useRef(null);
  const lastEventTimeRef = useRef(0);

  // 🔍 Debug: Log member count changes
  useEffect(() => {
    console.log('👥 [Taskbar] Member count updated:', memberCount, 'members:', watchSessionMembers?.map(m => ({ id: m.id, username: m.username, user_role: m.user_role })));
  }, [memberCount, watchSessionMembers]);

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

  // Touch handling for swipe-up gesture (mobile landscape)
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [touchStartY, setTouchStartY] = useState(null);

  const handleTouchStart = (e) => {
    const touch = e.targetTouches[0];
    setTouchStart(touch.clientY);
    setTouchStartY(touch.clientY);
  };
  
  const handleTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientY);
  };
  
  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    
    // Swipe up (positive distance) shows taskbar
    if (distance > 50) {
      setIsVisible(true);
    }
    // Swipe down (negative distance) hides taskbar
    else if (distance < -50) {
      setIsVisible(false);
    }
    
    setTouchStart(null);
    setTouchEnd(null);
    setTouchStartY(null);
  };

  // Touch zone for swipe-up gesture at bottom of screen
  const handleSwipeZoneTouchStart = (e) => {
    const touch = e.targetTouches[0];
    const windowHeight = window.innerHeight;
    
    // Only detect touches in bottom 20% of screen
    if (touch.clientY > windowHeight * 0.8) {
      setTouchStart(touch.clientY);
      setTouchStartY(touch.clientY);
    }
  };
  
  const handleSwipeZoneTouchMove = (e) => {
    if (touchStart !== null) {
      setTouchEnd(e.targetTouches[0].clientY);
    }
  };
  
  const handleSwipeZoneTouchEnd = () => {
    if (touchStart === null || touchEnd === null) return;
    
    const distance = touchStart - touchEnd;
    
    // Swipe up gesture (distance > 50) shows taskbar
    if (distance > 50) {
      setIsVisible(true);
    }
    
    setTouchStart(null);
    setTouchEnd(null);
    setTouchStartY(null);
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
      {/* Invisible swipe-up zone at bottom of screen (mobile only) */}
      <div
        className="fixed bottom-0 left-0 right-0 h-20 z-[999] pointer-events-auto md:hidden"
        style={{
          touchAction: 'none',
          background: isVisible ? 'transparent' : 'transparent'
        }}
        onTouchStart={handleSwipeZoneTouchStart}
        onTouchMove={handleSwipeZoneTouchMove}
        onTouchEnd={handleSwipeZoneTouchEnd}
      />
      
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
            onClick={async () => {
              if (onLeaveCall) {
                try {
                  console.log('🔌 [Taskbar] Leave Call clicked, awaiting handler...');
                  await onLeaveCall(); // ✅ CRITICAL: Await async cleanup before navigation
                  console.log('✅ [Taskbar] Leave Call handler completed');
                } catch (error) {
                  console.error('❌ [Taskbar] Leave Call handler failed:', error);
                  toast.error('Failed to end session. Please try again.');
                }
              } else {
                console.error('❌ [Taskbar] onLeaveCall handler is undefined!');
              }
            }}
          />
        </div>

        <div className="flex items-center space-x-4">
          <TaskbarButton 
            icon={ChatIcon} 
            label="Chat" 
            notificationCount={totalUnreadCount}
            onClick={() => {
              if (openChat) {
                openChat();
              } else {
                console.warn('[Taskbar] Chat handler not provided');
              }
            }} 
          />

          {/* Seats Button - Only show for 3D Cinema & Lecture Hall (not regular VideoWatch) */}
          {watchType !== 'video' && (
            <div className="relative">
              {seatSwapRequest && (
                <div className="absolute -top-7 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white text-xs px-2 py-1 rounded shadow z-10 whitespace-nowrap">
                  Swap request from {seatSwapRequest.requesterName}
                </div>
              )}
              <TaskbarButton
                icon={SeatsIcon}
                label="Seats"
                onClick={() => {
                  if (onSeatsClick) {
                    onSeatsClick();
                  } else {
                    console.warn('[Taskbar] Seats handler not provided');
                  }
                }}
                onRightClick={() => {
                  if (onTheaterOverviewClick) {
                    onTheaterOverviewClick();
                  } else {
                    console.warn('[Taskbar] Theater overview handler not provided');
                  }
                }}
              />
            </div>
          )}

          <TaskbarButton
            buttonRef={audioButtonRef}
            icon={isSilenceMode ? SilenceIcon : AudioIcon}
            label="Audio"
            localAudioLevel={localAudioLevel}
            onClick={() => {
              if (toggleAudio) {
                // Play sound effect based on current state
                // If currently muted (!isAudioActive), clicking will unmute → play MicOn sound
                // If currently unmuted (isAudioActive), clicking will mute → play MicOff sound
                if (isAudioActive) {
                  playMicOffSound();
                } else {
                  playMicOnSound();
                }
                toggleAudio();
              } else {
                console.warn('[Taskbar] Audio toggle handler not provided');
              }
            }}
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
                    if (!userSeatId) return '?';
                    
                    // Detect seat format: Cinema uses "row-col", Lecture Hall uses integers
                    const seatIdStr = String(userSeatId);
                    
                    // Cinema format: "row-col" (e.g., "3-5")
                    if (seatIdStr.includes('-')) {
                      const rowNumber = seatIdStr.split('-')[0];
                      return `Row ${rowNumber}`;
                    }
                    
                    // Lecture hall format: integers (1-145)
                    const seatNumber = parseInt(userSeatId);
                    if (seatNumber === 145) return 'Host';
                    
                    // Calculate row based on lecture hall layout
                    // Column 1 (seats 1-40): all in row 1
                    // Column 2 (seats 41-104): rows 1-8 (8 seats per row)
                    // Column 3 (seats 105-144): rows 1-5 (8 seats per row)
                    let rowNumber;
                    if (seatNumber <= 40) {
                      rowNumber = 1;
                    } else if (seatNumber <= 104) {
                      rowNumber = Math.ceil((seatNumber - 40) / 8);
                    } else {
                      rowNumber = Math.ceil((seatNumber - 104) / 8) + 7;
                    }
                    
                    return `Row ${rowNumber}`;
                  })())
            }
          />

          {/* Video Button - Hidden for regular VideoWatch to save bandwidth costs */}
          {showVideoToggle && watchType !== 'video' && (
            <TaskbarButton
              icon={VideoIcon}
              label="Video"
              onClick={() => {
                if (toggleCamera) {
                  toggleCamera();
                } else {
                  console.warn('[Taskbar] Camera toggle handler not provided');
                }
              }}
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
            buttonRef={membersButtonRef}
            icon={MembersIcon}
            label={`${memberCount}`}
            onClick={() => {
              // If host has raised hands, show quick popup first
              if (isHost && raisedHandsCount > 0) {
                setShowRaisedHandsPopup(!showRaisedHandsPopup);
              } else if (onMembersClick) {
                onMembersClick();
              }
            }}
            subtitle={isHost && raisedHandsCount > 0 ? `🙋 ${raisedHandsCount}` : null}
            shouldPulse={isHost && raisedHandsCount > 0}
          />
          
          {/* Quiz Button (Lecture Hall Only) */}
          {isLectureHall && onQuizClick && (
            <TaskbarButton
              icon={QuizIcon}
              label="Quiz"
              onClick={onQuizClick}
              isEmoji={true}
              shouldPulse={activeQuizCount > 0}
              subtitle={activeQuizCount > 0 ? `🟢 ${activeQuizCount} active` : null}
            />
          )}
          
          {/* Raise Hand Button (Students Only) */}
          {isLectureHall && !isHost && onRaiseHand && onLowerHand && (
            <TaskbarButton
              icon={handRaised ? '🙋' : '✋'}
              label={handRaised ? 'Lower Hand' : 'Raise Hand'}
              onClick={() => {
                if (handRaised) {
                  onLowerHand();
                } else {
                  onRaiseHand();
                }
              }}
              isEmoji={true}
              shouldPulse={handRaised}
              subtitle={hasHostApproval ? '📢 Approved' : (handRaised ? '⏳ Waiting' : null)}
            />
          )}
        </div>

        <div className="flex items-center space-x-2 settings-menu-container">
          {showProgram && (
            <TaskbarButton
              icon={isClassroom ? BoardIcon : ProgramMenuIcon}
              label={isClassroom ? "Board" : "Menu"}
              onClick={() => {
                if (onToggleLeftSidebar) {
                  onToggleLeftSidebar();
                } else {
                  console.warn('[Taskbar] Toggle left sidebar handler not provided');
                }
              }}
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
        watchType={watchType}
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
        watchSessionMembers={watchSessionMembers}
        handleSeatSelect={handleSeatSelect}
        isViewLocked={isViewLocked}
        setIsViewLocked={setIsViewLocked}
        lightsOn={lightsOn}
        setLightsOn={setLightsOn}
        showDebugPanels={showDebugPanels}
        onToggleDebugPanels={onToggleDebugPanels}
        freeRoamMode={freeRoamMode}
        setFreeRoamMode={setFreeRoamMode}
        lockMovement={lockMovement}
        setLockMovement={setLockMovement}
        lockOrbit={lockOrbit}
        setLockOrbit={setLockOrbit}
        showPreview={showPreview}
        setShowPreview={setShowPreview}
        showAvatars={showAvatars}
        setShowAvatars={setShowAvatars}
        showCameraMarkers={showCameraMarkers}
        setShowCameraMarkers={setShowCameraMarkers}
        showPositionDebugLectureHall={showPositionDebugLectureHall}
        onTogglePositionDebugLectureHall={onTogglePositionDebugLectureHall}
        showAudioDebugPanel={showAudioDebugPanel}
        onToggleAudioDebugPanel={onToggleAudioDebugPanel}
        showViewDirectionModal={showViewDirectionModal}
        onToggleViewDirectionModal={onToggleViewDirectionModal}
        onExportCameraPositions={onExportCameraPositions}
        savedCameraPositionsCount={savedCameraPositionsCount}
        freeCameraMovement={freeCameraMovement}
        setFreeCameraMovement={setFreeCameraMovement}
        demoMode={demoMode}
        setDemoMode={setDemoMode}
        showChatBubbles={showChatBubbles}
        onToggleChatBubbles={onToggleChatBubbles}
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
      {/* ✅ Raised Hands Quick Popup (Host Only) - Responsive */}
      {isHost && showRaisedHandsPopup && raisedHandsCount > 0 && (
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-[1100] bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-3 sm:p-4 w-[90vw] sm:w-auto min-w-[280px] sm:min-w-[320px] max-w-[95vw] sm:max-w-[400px]">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <h3 className="text-white font-semibold text-xs sm:text-sm flex items-center gap-1 sm:gap-2">
              🙋 Raised Hands ({raisedHandsCount})
            </h3>
            <button
              onClick={() => setShowRaisedHandsPopup(false)}
              className="text-gray-400 hover:text-white text-lg sm:text-xl"
            >
              ✕
            </button>
          </div>
          
          <div className="space-y-2 max-h-[250px] sm:max-h-[300px] overflow-y-auto">
            {raisedHands.map(hand => (
              <div key={hand.userId} className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-gray-700/50 p-2 rounded gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-xl sm:text-2xl flex-shrink-0">🙋</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-white text-xs sm:text-sm font-medium truncate">{hand.username}</div>
                    <div className="text-gray-400 text-[10px] sm:text-xs">Seat #{hand.seatId}</div>
                  </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => {
                      onApproveSpeaker(hand.userId);
                      if (raisedHands.length === 1) setShowRaisedHandsPopup(false);
                    }}
                    className="flex-1 sm:flex-none px-2 sm:px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-[10px] sm:text-xs font-semibold transition-colors"
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={() => {
                      onRevokeSpeaker(hand.userId);
                      if (raisedHands.length === 1) setShowRaisedHandsPopup(false);
                    }}
                    className="flex-1 sm:flex-none px-2 sm:px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] sm:text-xs font-semibold transition-colors"
                  >
                    ✗
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          <button
            onClick={() => {
              setShowRaisedHandsPopup(false);
              onMembersClick();
            }}
            className="w-full mt-2 sm:mt-3 px-3 py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs sm:text-sm font-medium transition-colors"
          >
            View All in Members Modal
          </button>
        </div>
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
        // Student raise hand
        isHost={isHost}
        handRaised={handRaised}
        hasHostApproval={hasHostApproval}
        onRaiseHand={onRaiseHand}
        onLowerHand={onLowerHand}
      />
    </>
  );
};

export default Taskbar;