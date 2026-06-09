import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FaGift } from 'react-icons/fa';
import toast from 'react-hot-toast';

const POS_KEY = 'wewatch_gift_pos';
const DRAG_THRESHOLD = 5; // px of movement before it counts as a drag

const FloatingGiftIcon = ({
  hostId,
  currentUserId,
  tokenBalance,
  isVisible = true,
  isFullscreen = false,
  isLeftSidebarOpen = false,
  onGiftSent,
  contentRating = '',
}) => {
  const isReligious = contentRating === 'Religious';
  const [isHovered, setIsHovered] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const [coinCount, setCoinCount] = useState(0);
  const [isInactive, setIsInactive] = useState(false);
  const giftAudioRef = useRef(null);
  const inactivityTimerRef = useRef(null);

  // Draggable position — null = use default CSS position
  const [pos, setPos] = useState(() => {
    try { return JSON.parse(localStorage.getItem(POS_KEY) || 'null'); }
    catch { return null; }
  });
  const posRef = useRef(pos);
  const containerRef = useRef(null);
  // drag state lives in a ref so event handlers never go stale
  const drag = useRef({ active: false, moved: false, startPx: 0, startPy: 0, startElX: 0, startElY: 0 });

  useEffect(() => { posRef.current = pos; }, [pos]);

  // Initialize audio
  useEffect(() => {
    giftAudioRef.current = new Audio('/sounds/gift.mp3');
    giftAudioRef.current.volume = 0.3;
  }, []);

  // Auto-hide after 30 s of inactivity
  useEffect(() => {
    const resetTimer = () => {
      setIsInactive(false);
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => setIsInactive(true), 30000);
    };
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keypress', resetTimer);
    window.addEventListener('click', resetTimer);
    resetTimer();
    return () => {
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keypress', resetTimer);
      window.removeEventListener('click', resetTimer);
      clearTimeout(inactivityTimerRef.current);
    };
  }, []);

  const handleGiftClick = async () => {
    if (isSending || currentUserId === hostId) return;

    if (tokenBalance < 100) {
      toast.error('💰 Low Balance! Top up your wallet to send gifts to the host.', {
        duration: 4000,
        icon: '🪙',
        style: { background: '#1f2937', color: '#fff', border: '1px solid #fbbf24' },
      });
      return;
    }

    setIsSending(true);
    try {
      const response = await axios.post('/api/donations/gift', {
        recipient_id: hostId,
        amount_tokens: 100,
      }, { withCredentials: true });

      if (giftAudioRef.current) {
        giftAudioRef.current.currentTime = 0;
        giftAudioRef.current.play().catch(() => {});
      }

      setShowAnimation(true);
      setCoinCount(prev => prev + 1);
      setTimeout(() => setShowAnimation(false), 1000);

      if (onGiftSent && response.data.donor_balance) {
        onGiftSent(response.data.donor_balance);
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Failed to send gift. Please try again.';
      toast.error(errorMessage, { duration: 4000, icon: '❌' });
    } finally {
      setIsSending(false);
    }
  };

  // ── Drag handlers ─────────────────────────────────────────────────────────────
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current.active = true;
    drag.current.moved = false;
    const rect = containerRef.current.getBoundingClientRect();
    drag.current.startPx = e.clientX;
    drag.current.startPy = e.clientY;
    drag.current.startElX = rect.left;
    drag.current.startElY = rect.top;
    containerRef.current.setPointerCapture(e.pointerId);
    e.preventDefault(); // prevents text selection and touch-scroll interference
  };

  const onPointerMove = (e) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.startPx;
    const dy = e.clientY - drag.current.startPy;
    if (!drag.current.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      drag.current.moved = true;
    }
    if (!drag.current.moved) return;
    const btnSize = window.innerWidth < 640 ? 48 : 64; // matches w-12 / sm:w-16
    const newPos = {
      x: Math.max(0, Math.min(window.innerWidth - btnSize, drag.current.startElX + dx)),
      y: Math.max(0, Math.min(window.innerHeight - btnSize, drag.current.startElY + dy)),
    };
    posRef.current = newPos;
    setPos(newPos);
  };

  const onPointerUp = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (drag.current.moved) {
      localStorage.setItem(POS_KEY, JSON.stringify(posRef.current));
    } else {
      handleGiftClick();
    }
  };

  // ── Visibility guard ──────────────────────────────────────────────────────────
  if (!isVisible || isFullscreen || isLeftSidebarOpen || !hostId || !currentUserId || currentUserId === hostId || isInactive) {
    return null;
  }

  // When the user has dragged to a custom position, use exact px coords (no float animation).
  // At the default position, keep the floating animation.
  const containerStyle = pos
    ? { left: pos.x, top: pos.y }
    : { left: '1.5rem', top: '33.333%', transform: 'translateY(-50%)', animation: 'float 3s ease-in-out infinite' };

  return (
    <>
      <div
        ref={containerRef}
        className="fixed z-40 touch-none select-none cursor-grab active:cursor-grabbing"
        style={containerStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <button
          type="button"
          disabled={isSending}
          className={`
            relative w-12 h-12 sm:w-16 sm:h-16 rounded-full
            bg-gradient-to-br from-purple-500 to-pink-500
            text-white shadow-lg
            flex items-center justify-center
            transition-all duration-300
            hover:scale-110 hover:shadow-2xl
            disabled:opacity-50 disabled:cursor-not-allowed
            ${isSending ? 'animate-pulse' : ''}
          `}
        >
          <FaGift className="text-lg sm:text-2xl" />

          {coinCount > 0 && (
            <div className="absolute -top-2 -right-2 bg-yellow-400 text-purple-900 rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold shadow-md">
              {coinCount}
            </div>
          )}
        </button>

        {/* Tooltip */}
        {isHovered && !isSending && (
          <div className="absolute left-14 sm:left-20 top-1/2 -translate-y-1/2 bg-gray-900 text-white px-3 py-2 rounded-lg text-sm whitespace-nowrap shadow-xl pointer-events-none">
            <div className="font-semibold">{isReligious ? 'Give Offering' : 'Gift to Host'}</div>
            <div className="text-xs text-gray-300">Tap: 1 token {isReligious ? '🙏' : '🪙'}</div>
            <div className={`text-xs mt-1 ${tokenBalance < 100 ? 'text-yellow-400 font-semibold' : 'text-gray-400'}`}>
              Balance: {(tokenBalance / 100).toFixed(2)} tokens
            </div>
            {tokenBalance < 100 && (
              <div className="text-xs text-red-400 mt-1">⚠️ Low balance — Top up!</div>
            )}
            <div className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-r-8 border-r-gray-900" />
          </div>
        )}
      </div>

      {/* Coin animation overlay */}
      {showAnimation && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-50px',
                animation: `coinFall ${1 + Math.random()}s ease-in forwards`,
                animationDelay: `${i * 0.1}s`,
              }}
            >
              <div className="text-4xl">🪙</div>
            </div>
          ))}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ animation: 'fadeUp 1s ease-out forwards' }}
          >
            <div className="text-6xl font-bold text-yellow-400 drop-shadow-lg">+1 🪙</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(-50%) translateX(0); }
          50%       { transform: translateY(-50%) translateX(-10px); }
        }
        @keyframes coinFall {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes fadeUp {
          0%   { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
          50%  { transform: translate(-50%, -70%) scale(1.2); opacity: 1; }
          100% { transform: translate(-50%, -100%) scale(1); opacity: 0; }
        }
      `}</style>
    </>
  );
};

export default FloatingGiftIcon;
