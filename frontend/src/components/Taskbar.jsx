// frontend/src/components/Taskbar.jsx
import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import EmotePicker from './cinema/ui/EmotePicker';
import EmojiImage from './cinema/ui/EmojiImage';
import AudioSettingsDropdown from './AudioSettingsDropdown';
import { playMicOnSound, playMicOffSound } from '../utils/audio';
import Coachmark from './Coachmark';

// Import SVG icons
const LeaveCallIcon = '/icons/LeaveCallIcon.svg';
const ChatIcon = '/icons/ChatIcon.svg';
const SeatsIcon = '/icons/SeatsIcon.svg';
const AudioIcon = '/icons/AudioIcon.svg';
const SilenceIcon = '/icons/silenceIcon.svg';
const VideoIcon = '/icons/VideoIcon.svg';
const MembersIcon = '/icons/MembersIcon.svg';
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
  localAudioLevel = 0, // ✅ Audio level for waveform animation (0-255)
  isLoading = false, // ✅ Show spinner instead of icon
  small = false, // Leave Call keeps the smaller icon; every other button is a touch bigger
  mobile = false, // larger touch targets on phone/tablet screens
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const iconBoxClass = small ? 'h-6 w-6' : 'h-7 w-7';
  const spinnerClass = small ? 'h-4 w-4' : 'h-5 w-5';
  const emojiSize = small ? 24 : 28;

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
        className={`flex flex-col items-center justify-center text-white text-sm font-medium bg-transparent border-none p-1.5 rounded-md transition-colors duration-200 ${isHovered ? 'bg-white/10' : ''}`}
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
        <div className={`relative ${iconBoxClass} flex items-center justify-center`}>
          {isLoading ? (
            <div className={`${spinnerClass} rounded-full border-2 border-white/25 border-t-white animate-spin`} />
          ) : isEmoji ? (
            <EmojiImage emoji={icon} size={emojiSize} />
          ) : (
            <img src={icon} alt={label} className={iconBoxClass} />
          )}
          {/* Green ring: mic on. Brightens + pulses when actually speaking. */}
          {!isLoading && label === 'Audio' && shouldPulse && (
            <span
              className={`absolute -inset-0.5 rounded-full border-2 pointer-events-none transition-colors duration-150 ${
                localAudioLevel > 10
                  ? 'border-green-400 animate-pulse'
                  : 'border-green-500/30'
              }`}
            />
          )}
          {showCancelIndicator && (
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-[7px] text-white font-bold">×</span>
            </div>
          )}
          {notificationCount > 0 && (
            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-1 shadow-lg">
              {notificationCount > 99 ? '99+' : notificationCount}
            </div>
          )}
        </div>
        <span className="text-[9px] mt-0.5 whitespace-normal text-center w-full px-0.5 leading-tight">
          {label}
        </span>
      </button>
      {subtitle && (
        <span className="text-[8px] text-gray-400 mt-0.5 whitespace-nowrap">
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
  hasOpenModal = false, // ✅ Prevent taskbar from showing when modal is open
  isChatActive = false, // ✅ Suppress taskbar while ChatHomeModal or an open chat thread is showing
  // Raise hand props
  handRaised = false,
  hasHostApproval = false,
  onRaiseHand,
  onLowerHand,
  raisedHands = [],
  onApproveSpeaker,
  onRevokeSpeaker,
  approvedSpeakers = {},
  onToggleRaiseHand, // ✅ NEW: Toggle raise/lower hand
  isHandRaised = false, // ✅ NEW: Current user's hand state
  raisedHandsCount = 0, // ✅ NEW: Total raised hands count for badge
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
  authoritativeMemberCount = null, // Authoritative count from backend events; overrides array length when set
  isMembersLoading = false, // ✅ Show spinner on members button until first fetch resolves
  // Unread Messages
  unreadMessages = {}, // {userId: unreadCount} — DMs / private room messages
  roomChatUnreadCount = 0, // unread count for the shared room/session chat
  // Used only to shorten the auto-hide window while a game is active (see hideDelayMs).
  currentGame,
  // Video element ref — when provided, shows a volume button on the right edge of the pill
  videoRef = null,
  // Compact mode — slightly smaller pill (used in Lecture Hall to avoid crowding the 3D scene)
  compact = false,
}) => {
  // 🎯 Derive feature flags from watch type
  const isClassroom = watchType === 'classroom';
  const isLectureHall = isClassroom && classType === 'lecture_hall';

  // Mobile detection — same 1024px threshold used throughout the app.
  // Rechecked on resize/orientation change so landscape↔portrait flips update correctly.
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  const [isPortrait, setIsPortrait] = useState(() => window.innerWidth < window.innerHeight);
  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 1024);
      setIsPortrait(window.innerWidth < window.innerHeight);
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ✅ Calculate total unread message count (DMs + shared room chat)
  const totalUnreadCount = roomChatUnreadCount + Object.values(unreadMessages).reduce((sum, count) => sum + count, 0);
  
  // 🔍 Debug: Log isAudioActive prop changes
  useEffect(() => {
    // console.log('🔊 [Taskbar] isAudioActive prop changed:', isAudioActive);
  }, [isAudioActive]);

  const [isVisible, setIsVisible] = useState(true);
  const [showMicDropdown, setShowMicDropdown] = useState(false);
  const [showEmotePicker, setShowEmotePicker] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [showRaisedHandsPopup, setShowRaisedHandsPopup] = useState(false);
  const audioButtonRef = useRef(null);
  const membersButtonRef = useRef(null);
  const chatButtonRef = useRef(null);
  const leaveCallButtonRef = useRef(null);
  const [showTaskbarTour, setShowTaskbarTour] = useState(false);
  const showTaskbarTourRef = useRef(false);
  useEffect(() => { showTaskbarTourRef.current = showTaskbarTour; }, [showTaskbarTour]);

  // Volume control — synced to videoRef via native volumechange event
  const [volLevel, setVolLevel] = useState(1.0);
  const [isVolMuted, setIsVolMuted] = useState(false);
  const [showVolPopover, setShowVolPopover] = useState(false);
  const volPopoverRef = useRef(null);
  const volButtonRef = useRef(null);

  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;
    const sync = () => {
      setVolLevel(video.muted ? 0 : video.volume);
      setIsVolMuted(video.muted);
    };
    sync();
    video.addEventListener('volumechange', sync);
    return () => video.removeEventListener('volumechange', sync);
  }, [videoRef]);

  useEffect(() => {
    if (!showVolPopover) return;
    const handler = (e) => {
      if (!volPopoverRef.current?.contains(e.target) && !volButtonRef.current?.contains(e.target)) {
        setShowVolPopover(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showVolPopover]);

  const handleVolChange = (e) => {
    const v = parseFloat(e.target.value);
    const video = videoRef?.current;
    if (!video) return;
    if (v === 0) { video.muted = true; } else { video.muted = false; video.volume = v; }
  };

  const handleVolMuteToggle = () => {
    const video = videoRef?.current;
    if (!video) return;
    video.muted = !video.muted;
  };
  useEffect(() => {
    if (!localStorage.getItem('wewatch_taskbar_tour_seen')) {
      const t = setTimeout(() => {
        setIsVisible(true);
        setShowTaskbarTour(true);
      }, 1200);
      return () => clearTimeout(t);
    }
  }, []);
  // Prefer the backend-supplied authoritative count; fall back to local array length.
  const memberCount = authoritativeMemberCount ?? watchSessionMembers?.length ?? 0;
  const hideTimerRef = useRef(null);
  const lastEventTimeRef = useRef(0);
  const isHoveringRef = useRef(false); // mouse is over the pill — suspend the idle-hide countdown
  const isSuppressed = hasOpenModal || isLeftSidebarOpen || isChatActive;
  // While a game is active, the pill sits bottom-center at the same screen region
  // many games put their own bottom controls (Forfeit, Start, host action row) — and
  // since the pill is z-index 1000 (above every game overlay), it can block taps on
  // whatever's underneath it for as long as it stays visible. Shortening the
  // idle-hide window to 1s while a game is up keeps "tap to reveal, then mute/etc."
  // working without leaving it sitting on top of game buttons for long.
  const hideDelayMs = currentGame ? 1000 : 2000;

  // Minimize-while-gaming: a game's own bottom controls sit in the same
  // screen region as the pill, so while a game is active the user can shrink
  // the pill to a small draggable square that can be parked out of the way.
  // Only relevant during a game — always reset back to the full pill once
  // the game ends, so nobody is left wondering where the taskbar went.
  const [isMinimized, setIsMinimized] = useState(false);
  const [minimizedPos, setMinimizedPos] = useState(null); // {x,y} in viewport px, lazily seeded on first minimize
  const dragStateRef = useRef(null); // { startX, startY, originX, originY, moved }
  // Auto-restore when a game ends so players don't lose the taskbar after a match.
  // Keyed on game_session_id (stable integer) not the whole object — every game_state_update
  // creates a new object reference, which would reset isMinimized on every character submission.
  const gameSessionId = currentGame?.game_session_id ?? null;
  useEffect(() => {
    if (gameSessionId === null) return;
    return () => setIsMinimized(false);
  }, [gameSessionId]);

  // Full pill drag (always available, not just in game mode)
  const [pillPos, setPillPos] = useState(null); // null = centered default; {x, y} = dragged position
  const pillDragRef = useRef(null); // { startX, startY, originX, originY, moved }
  const pillRef = useRef(null);

  const handlePillPointerDown = (e) => {
    // Do NOT call setPointerCapture here — capturing immediately redirects
    // pointerup to this container, so the browser fires the click event on the
    // container rather than the child button, silently swallowing every button's
    // onClick. Capture is set lazily in handlePillPointerMove once we know the
    // gesture is a real drag (> 4 px movement), so taps always let the click
    // event reach its intended button target.
    const current = pillPos || { x: window.innerWidth / 2 - (pillRef.current?.offsetWidth ?? 300) / 2, y: window.innerHeight - 70 };
    pillDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: current.x,
      originY: current.y,
      moved: false,
      pointerId: e.pointerId,
    };
  };
  const handlePillPointerMove = (e) => {
    const drag = pillDragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      if (!drag.moved) {
        // Lazy capture: only lock pointer to the pill once we know it's a drag,
        // not a tap. After this point fast sweeps off the element still track.
        e.currentTarget.setPointerCapture?.(drag.pointerId);
      }
      drag.moved = true;
    }
    if (!drag.moved) return; // no position update until past the dead zone
    const pw = pillRef.current?.offsetWidth ?? 300;
    const ph = pillRef.current?.offsetHeight ?? 52;
    setPillPos({
      x: Math.min(Math.max(drag.originX + dx, 8), window.innerWidth - pw - 8),
      y: Math.min(Math.max(drag.originY + dy, 8), window.innerHeight - ph - 8),
    });
  };
  const handlePillPointerUp = (e) => {
    const drag = pillDragRef.current;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    pillDragRef.current = null;
    if (drag?.moved) {
      // Suppress the click event that fires after pointerup so the button
      // the gesture started on doesn't accidentally activate after a drag.
      const suppress = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', suppress, { capture: true, once: true });
    }
  };

  const MINIMIZED_SIZE = 52;
  const clampToViewport = (x, y) => ({
    x: Math.min(Math.max(x, 8), window.innerWidth - MINIMIZED_SIZE - 8),
    y: Math.min(Math.max(y, 8), window.innerHeight - MINIMIZED_SIZE - 8),
  });

  const handleMinimizeClick = () => {
    if (!minimizedPos) {
      setMinimizedPos(clampToViewport(window.innerWidth / 2 - MINIMIZED_SIZE / 2, window.innerHeight - 90));
    }
    setIsMinimized(true);
  };

  const handleMinimizedPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: minimizedPos?.x ?? 0,
      originY: minimizedPos?.y ?? 0,
      moved: false,
    };
  };
  const handleMinimizedPointerMove = (e) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
    setMinimizedPos(clampToViewport(drag.originX + dx, drag.originY + dy));
  };
  const handleMinimizedPointerUp = (e) => {
    const drag = dragStateRef.current;
    dragStateRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (!drag?.moved) setIsMinimized(false); // a tap (no real drag) restores the full pill
  };

  // Initial 3s grace period when a user first joins — shown once on mount only.
  // Shares hideTimerRef with the tap-activity effect below, so if the user taps
  // during (or right after) this window, that tap's own 1s timer simply replaces
  // this one — i.e. continued tapping keeps it visible indefinitely, it doesn't
  // get force-hidden at the 3s mark regardless of what the user is doing.
  useEffect(() => {
    if (isSuppressed) return; // don't auto-show into an already-suppressed state
    setIsVisible(true);
    hideTimerRef.current = setTimeout(() => {
      if (!showTaskbarTourRef.current && !isHoveringRef.current) setIsVisible(false);
      hideTimerRef.current = null;
    }, 3000);
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tap-anywhere visibility — replaces the old swipe-up gesture. Any deliberate
  // click/tap anywhere on screen reveals the pill; it fades again after 1s of no
  // further taps. Suppressed entirely while a modal, the left sidebar, or chat
  // (ChatHomeModal or an open chat thread) is active — it shouldn't pop up over them.
  useEffect(() => {
    if (isSuppressed) {
      setIsVisible(false);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      return; // Skip tap logic while suppressed
    }

    const handleActivity = () => {
      if (isHoveringRef.current) return; // hover already keeps it visible/pinned
      const now = Date.now();
      if (now - lastEventTimeRef.current < 100) return; // debounce rapid taps
      lastEventTimeRef.current = now;

      setIsVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        if (!showTaskbarTourRef.current && !isHoveringRef.current) setIsVisible(false);
        hideTimerRef.current = null;
      }, hideDelayMs);
    };

    window.addEventListener('click', handleActivity);
    return () => {
      window.removeEventListener('click', handleActivity);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isSuppressed, hideDelayMs]);

  // Hovering (or pressing) the pill itself keeps it visible until the hover ends,
  // then resumes the normal 1s idle countdown from that point.
  const handlePillMouseEnter = () => {
    isHoveringRef.current = true;
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setIsVisible(true);
  };
  const handlePillMouseLeave = () => {
    isHoveringRef.current = false;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!showTaskbarTourRef.current) setIsVisible(false);
      hideTimerRef.current = null;
    }, hideDelayMs);
  };

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


  // Floating pill — fades in/out via opacity + scale instead of height-collapse,
  // since it no longer spans the full width or sits flush against the edge.
  // When pillPos is set (user has dragged it), override centered positioning.
  const taskbarStyle = {
    position: 'fixed',
    ...(pillPos ? {
      left: pillPos.x,
      top: pillPos.y,
      bottom: 'auto',
      transform: isVisible ? 'scale(1)' : 'scale(0.95)',
    } : {
      bottom: isMobile ? (compact ? '10px' : '14px') : (compact ? '14px' : '20px'),
      left: '50%',
      transform: isVisible
        ? `translateX(-50%) translateY(0) scale(${compact ? 0.82 : 1})`
        : 'translateX(-50%) translateY(12px) scale(0.95)',
    }),
    opacity: isVisible ? 1 : 0,
    pointerEvents: isVisible ? 'auto' : 'none',
    background: 'linear-gradient(90deg, #9333ea, #2563eb)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    padding: compact
      ? (isMobile ? '4px 10px 4px 26px' : '3px 14px 3px 28px')
      : (isMobile ? '5px 12px 5px 32px' : '4px 20px 4px 34px'),
    borderRadius: '9999px',
    gap: compact ? (isMobile ? '5px' : '10px') : (isMobile ? '8px' : '14px'),
    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.45)',
    transition: 'opacity 0.25s ease, transform 0.25s ease',
    zIndex: 1000,
    maxWidth: '95vw',
    overflowX: 'auto',
    cursor: pillDragRef.current?.moved ? 'grabbing' : 'grab',
    touchAction: 'none',
  };

  if (isMinimized && minimizedPos) {
    return (
      <div
        onPointerDown={handleMinimizedPointerDown}
        onPointerMove={handleMinimizedPointerMove}
        onPointerUp={handleMinimizedPointerUp}
        title="Tap to expand"
        style={{
          position: 'fixed',
          left: minimizedPos.x,
          top: minimizedPos.y,
          width: MINIMIZED_SIZE,
          height: MINIMIZED_SIZE,
          borderRadius: '14px',
          background: 'linear-gradient(135deg, #9333ea, #2563eb)',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          touchAction: 'none',
          cursor: 'grab',
          color: 'white',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
          <polyline points="7 13 12 18 17 13" />
          <polyline points="7 6 12 11 17 6" />
        </svg>
      </div>
    );
  }

  return (
    <>
      <div
        ref={pillRef}
        style={taskbarStyle}
        className="taskbar-container scrollbar-hide"
        onMouseEnter={handlePillMouseEnter}
        onMouseLeave={handlePillMouseLeave}
        onPointerDown={handlePillPointerDown}
        onPointerMove={handlePillPointerMove}
        onPointerUp={handlePillPointerUp}
      >
        <button
          onClick={handleMinimizeClick}
          title="Minimize taskbar"
          className="absolute top-1/2 left-1 -translate-y-1/2 w-5 h-5 lg:w-6 lg:h-6 rounded-full bg-gray-900 border border-white/30 flex items-center justify-center text-white hover:bg-gray-800 transition-colors !min-w-0 !min-h-0"
          style={{ zIndex: 1001 }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="lg:hidden">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="hidden lg:block">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        <TaskbarButton
          buttonRef={leaveCallButtonRef}
          icon={LeaveCallIcon}
          label="Leave Call"
          small
          mobile={isMobile}
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

        <TaskbarButton
            buttonRef={chatButtonRef}
            icon={ChatIcon}
            label="Chat"
            mobile={isMobile}
            notificationCount={totalUnreadCount}
            onClick={() => {
              if (openChat) {
                openChat();
              } else {
                console.warn('[Taskbar] Chat handler not provided');
              }
            }} 
          />

          {/* Removed (2026-06-24): this button's onGameClose handler was never actually
              passed from VideoWatch.jsx, so it has always been a silent no-op — clicking
              it just logged a console.warn. Each game (Trivia, TicTacToe, RPS) already
              has its own correctly-wired End Game / X control inside its own overlay;
              a second, never-functional entry point here was only confusing. currentGame
              is still passed (below) purely so the taskbar can shorten its own
              auto-hide window while a game is active. */}

          {/* Seats Button - Show for 3D Cinema & Lecture Hall (both have seat coordinates), hide for video/custom */}
          {(watchType === '3d_cinema' || watchType === 'classroom') && (
            <div className="relative">
              {seatSwapRequest && (
                <div className="absolute -top-7 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white text-xs px-2 py-1 rounded shadow z-10 whitespace-nowrap">
                  Swap request from {seatSwapRequest.requesterName}
                </div>
              )}
              <TaskbarButton
                icon={SeatsIcon}
                label="Seats"
                mobile={isMobile}
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
            mobile={isMobile}
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
                : (!isAudioActive ? null : (() => {
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

          {/* Video Button - Hidden for regular VideoWatch and custom scene (no LiveKit) */}
          {showVideoToggle && watchType !== 'video' && watchType !== 'custom' && (
            <TaskbarButton
              icon={VideoIcon}
              label="Video"
              mobile={isMobile}
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
              icon={isHandRaised ? '✋' : EmotesIcon}
              label="Emotes"
              mobile={isMobile}
              onClick={() => setShowEmotePicker(!showEmotePicker)}
              isEmoji={true}
              notificationCount={isHost ? raisedHandsCount : 0}
            />
          )}

          <TaskbarButton
            buttonRef={membersButtonRef}
            icon={MembersIcon}
            label={isMembersLoading ? '' : `${memberCount}`}
            mobile={isMobile}
            isLoading={isMembersLoading}
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
              mobile={isMobile}
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
              mobile={isMobile}
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

          {showProgram && (
            <TaskbarButton
              icon={isClassroom ? BoardIcon : ProgramMenuIcon}
              label={isClassroom ? "Board" : "Menu"}
              mobile={isMobile}
              onClick={() => {
                if (onToggleLeftSidebar) {
                  onToggleLeftSidebar();
                } else {
                  console.warn('[Taskbar] Toggle left sidebar handler not provided');
                }
              }}
            />
          )}

          {/* Volume button — right edge of pill, only when videoRef is provided */}
          {videoRef && (
            <button
              ref={volButtonRef}
              onClick={(e) => { e.stopPropagation(); setShowVolPopover(v => !v); }}
              className="flex flex-col items-center justify-center text-white text-sm font-medium bg-transparent border-none p-1.5 rounded-md transition-colors duration-200 hover:bg-white/10"
              aria-label="Volume"
            >
              <div className="h-7 w-7 flex items-center justify-center text-xl">
                {isVolMuted || volLevel === 0 ? '🔇' : volLevel < 0.4 ? '🔉' : '🔊'}
              </div>
              <span className="text-[9px] mt-0.5 whitespace-normal text-center w-full px-0.5 leading-tight">
                {isVolMuted || volLevel === 0 ? 'Muted' : `${Math.round(volLevel * 100)}%`}
              </span>
            </button>
          )}
      </div>


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
          onToggleRaiseHand={onToggleRaiseHand}
          isHandRaised={isHandRaised}
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
      
      {/* Volume popover — above the right edge of the pill */}
      {showVolPopover && videoRef && (
        <div
          ref={volPopoverRef}
          onPointerDown={e => e.stopPropagation()}
          className="fixed z-[1100] bg-black/85 backdrop-blur-md rounded-xl px-3 pt-3 pb-4 flex flex-col items-center gap-2 shadow-xl border border-white/10"
          style={{ bottom: '90px', right: '20px' }}
        >
          <span className="text-xs font-semibold tabular-nums text-white">
            {isVolMuted || volLevel === 0 ? '0' : Math.round(volLevel * 100)}%
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.02"
            value={isVolMuted ? 0 : volLevel}
            onChange={handleVolChange}
            className="volume-slider-v cursor-pointer"
            style={{ writingMode: 'bt-lr', WebkitAppearance: 'slider-vertical', height: '100px', width: '4px' }}
            aria-label="Volume"
          />
          <button
            onClick={handleVolMuteToggle}
            className="text-white/70 hover:text-white text-base transition-colors !min-h-0 !min-w-0 p-0"
            aria-label={isVolMuted ? 'Unmute' : 'Mute'}
          >
            {isVolMuted || volLevel === 0 ? '🔇' : volLevel < 0.4 ? '🔉' : '🔊'}
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
      
      {/* CSS for scrollbar hiding, portrait mode, and volume slider */}
      <style jsx>{`
        /* Hide scrollbar for Chrome, Safari and Opera */
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }

        .volume-slider-v::-webkit-slider-thumb {
          appearance: none;
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: #a855f7;
          cursor: pointer;
          transition: background 0.15s, transform 0.15s;
        }
        .volume-slider-v::-webkit-slider-thumb:hover {
          background: #c084fc;
          transform: scale(1.25);
        }
        .volume-slider-v::-moz-range-thumb {
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: #a855f7;
          cursor: pointer;
          border: none;
          transition: background 0.15s;
        }
        .volume-slider-v::-moz-range-thumb:hover { background: #c084fc; }
        
        /* Hide scrollbar for IE, Edge and Firefox */
        .scrollbar-hide {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;  /* Firefox */
        }
        
        /* Portrait mode: slightly tighter side padding on the pill, keep vertical padding intact.
           On mobile (handled inline via isMobile), padding is already set smaller. */
        @media (orientation: portrait) and (min-width: 1024px) {
          .taskbar-container {
            padding-left: 14px !important;
            padding-right: 14px !important;
          }
        }

      `}</style>

      {/* One-time coach-mark: Leave Call, Chat, Audio, and Members controls */}
      {showTaskbarTour && (
        <Coachmark
          steps={[
            { ref: leaveCallButtonRef, title: 'Leave Call', description: 'Exit the watch session whenever you\'re done.' },
            { ref: chatButtonRef, title: 'Chat', description: 'Open the chat panel to talk with everyone in the session.' },
            { ref: audioButtonRef, title: 'Audio', description: 'Mute or unmute your mic. Right-click (or long-press) for audio device settings.' },
            { ref: membersButtonRef, title: 'Members', description: 'See who\'s in the session right now.' },
          ]}
          onComplete={() => {
            setShowTaskbarTour(false);
            localStorage.setItem('wewatch_taskbar_tour_seen', '1');
          }}
        />
      )}
    </>
  );
};

export default Taskbar;