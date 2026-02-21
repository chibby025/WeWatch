// frontend/src/components/FloatingGiftIcon.jsx
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FaGift } from 'react-icons/fa';
import toast from 'react-hot-toast';

const FloatingGiftIcon = ({
  hostId,
  currentUserId,
  tokenBalance,
  isVisible = true,
  isFullscreen = false,
  isLeftSidebarOpen = false,
  onGiftSent
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const [coinCount, setCoinCount] = useState(0);
  const [lastActive, setLastActive] = useState(Date.now());
  const [isInactive, setIsInactive] = useState(false);
  const giftAudioRef = useRef(null);
  const inactivityTimerRef = useRef(null);

  // Initialize audio
  useEffect(() => {
    giftAudioRef.current = new Audio('/sounds/gift.mp3');
    giftAudioRef.current.volume = 0.3;
  }, []);

  // Track user activity for auto-hide
  useEffect(() => {
    const resetTimer = () => {
      setLastActive(Date.now());
      setIsInactive(false);

      // Clear existing timer
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }

      // Set new timer for 3 seconds of inactivity
      inactivityTimerRef.current = setTimeout(() => {
        setIsInactive(true);
      }, 3000);
    };

    const handleActivity = () => {
      resetTimer();
    };

    // Listen for mouse and keyboard activity
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keypress', handleActivity);
    window.addEventListener('click', handleActivity);

    // Initial timer
    resetTimer();

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keypress', handleActivity);
      window.removeEventListener('click', handleActivity);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, []);

  // Handle gift click
  const handleGiftClick = async () => {
    if (isSending || currentUserId === hostId) {
      return;
    }

    // Check if balance is sufficient for 1 token (100 cents)
    if (tokenBalance < 100) {
      toast.error('💰 Low Balance! Top up your wallet to send gifts to the host.', {
        duration: 4000,
        icon: '🪙',
        style: {
          background: '#1f2937',
          color: '#fff',
          border: '1px solid #fbbf24'
        }
      });
      return;
    }

    setIsSending(true);

    try {
      // Send 1 token gift to host
      const response = await axios.post('/api/donations/gift', {
        recipient_id: hostId,
        amount_tokens: 100 // 1 token = 100 cents
      }, {
        withCredentials: true
      });

      // Play gift sound
      if (giftAudioRef.current) {
        giftAudioRef.current.currentTime = 0;
        giftAudioRef.current.play().catch(e => console.log('Audio play failed:', e));
      }

      // Show coin animation
      setShowAnimation(true);
      setCoinCount(prev => prev + 1);

      // Hide animation after 1 second
      setTimeout(() => {
        setShowAnimation(false);
      }, 1000);

      // Call callback with updated balance
      if (onGiftSent && response.data.donor_balance) {
        onGiftSent(response.data.donor_balance);
      }

    } catch (err) {
      console.error('Error sending gift:', err);
      
      // Show user-friendly error message
      const errorMessage = err.response?.data?.error || 'Failed to send gift. Please try again.';
      toast.error(errorMessage, {
        duration: 4000,
        icon: '❌'
      });
    } finally {
      setIsSending(false);
    }
  };

  // Don't render if conditions are not met
  const shouldHide = 
    !isVisible || 
    isFullscreen || 
    isLeftSidebarOpen || 
    !hostId || // Don't show if hostId is not set
    !currentUserId || // Don't show if currentUserId is not set
    currentUserId === hostId || // Don't show if current user IS the host
    isInactive;

  // Debug logging to help identify issues
  useEffect(() => {
    if (currentUserId && hostId) {
      console.log('🎁 [FloatingGiftIcon] Props:', {
        currentUserId,
        hostId,
        isCurrentUserHost: currentUserId === hostId,
        shouldHide,
        tokenBalance
      });
    }
  }, [currentUserId, hostId, shouldHide, tokenBalance]);

  if (shouldHide) {
    return null;
  }

  return (
    <>
      {/* Floating Gift Icon */}
      <div
        className="fixed left-6 top-1/3 transform -translate-y-1/2 z-40"
        style={{ animation: 'float 3s ease-in-out infinite' }}
      >
        <button
          onClick={handleGiftClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          disabled={isSending}
          className={`
            relative w-16 h-16 rounded-full 
            bg-gradient-to-br from-purple-500 to-pink-500 
            text-white shadow-lg
            flex items-center justify-center
            transition-all duration-300
            hover:scale-110 hover:shadow-2xl
            disabled:opacity-50 disabled:cursor-not-allowed
            ${isSending ? 'animate-pulse' : ''}
          `}
        >
          <FaGift className="text-2xl" />
          
          {/* Badge showing gift count */}
          {coinCount > 0 && (
            <div className="absolute -top-2 -right-2 bg-yellow-400 text-purple-900 rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold shadow-md">
              {coinCount}
            </div>
          )}
        </button>

        {/* Tooltip on hover */}
        {isHovered && !isSending && (
          <div className="absolute left-20 top-1/2 transform -translate-y-1/2 bg-gray-900 text-white px-3 py-2 rounded-lg text-sm whitespace-nowrap shadow-xl">
            <div className="font-semibold">Gift to Host</div>
            <div className="text-xs text-gray-300">Click: 1 token 🪙</div>
            <div className={`text-xs mt-1 ${tokenBalance < 100 ? 'text-yellow-400 font-semibold' : 'text-gray-400'}`}>
              Balance: {(tokenBalance / 100).toFixed(2)} tokens
            </div>
            {tokenBalance < 100 && (
              <div className="text-xs text-red-400 mt-1">⚠️ Low balance - Top up!</div>
            )}
            {/* Arrow pointing left */}
            <div className="absolute right-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-r-8 border-r-gray-900"></div>
          </div>
        )}
      </div>

      {/* Coin Animation Overlay */}
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
                animationDelay: `${i * 0.1}s`
              }}
            >
              <div className="text-4xl">🪙</div>
            </div>
          ))}
          
          {/* +1 Token Text */}
          <div
            className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2"
            style={{
              animation: 'fadeUp 1s ease-out forwards'
            }}
          >
            <div className="text-6xl font-bold text-yellow-400 drop-shadow-lg">
              +1 🪙
            </div>
          </div>
        </div>
      )}

      {/* Inline Styles for Animations */}
      <style jsx>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(-50%) translateX(0);
          }
          50% {
            transform: translateY(-50%) translateX(-10px);
          }
        }

        @keyframes coinFall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }

        @keyframes fadeUp {
          0% {
            transform: translate(-50%, -50%) scale(0.5);
            opacity: 1;
          }
          50% {
            transform: translate(-50%, -70%) scale(1.2);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -100%) scale(1);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
};

export default FloatingGiftIcon;
