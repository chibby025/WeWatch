// frontend/src/components/DonationNotification.jsx
import { useState, useEffect, useRef } from 'react';
import Confetti from 'react-confetti';

const DonationNotification = ({ messages, currentUserId, contentRating = '' }) => {
  const isReligious = contentRating === 'Religious';
  const [activeNotifications, setActiveNotifications] = useState([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [windowDimensions, setWindowDimensions] = useState({ 
    width: window.innerWidth, 
    height: window.innerHeight 
  });
  const giftAudioRef = useRef(null);

  // Initialize audio
  useEffect(() => {
    giftAudioRef.current = new Audio('/sounds/gift.mp3');
    giftAudioRef.current.volume = 0.4;
  }, []);

  // Update window dimensions for confetti
  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Listen for donation WebSocket messages
  useEffect(() => {
    if (!messages || messages.length === 0) return;

    const latestMessage = messages[messages.length - 1];

    // Check for donation notification
    if (latestMessage.type === 'donation_notification') {
      const { donor_username, donor_id, amount_tokens, recipient_username, is_host_donation } = latestMessage.data;

      // Create notification
      const notification = {
        id: Date.now(),
        donorUsername: donor_username,
        donorId: donor_id,
        amount: amount_tokens,
        recipientUsername: recipient_username,
        isHostDonation: is_host_donation,
        timestamp: Date.now()
      };

      // Add to active notifications
      setActiveNotifications(prev => [...prev, notification]);

      // Play sound
      if (giftAudioRef.current) {
        giftAudioRef.current.currentTime = 0;
        giftAudioRef.current.play().catch(e => console.log('Audio play failed:', e));
      }

      // Show confetti for donations >= 50 tokens
      if (amount_tokens >= 50) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000);
      }

      // Remove notification after 5 seconds
      setTimeout(() => {
        setActiveNotifications(prev => prev.filter(n => n.id !== notification.id));
      }, 5000);
    }
  }, [messages]);

  const formatTokens = (tokens) => {
    return (tokens / 100).toFixed(2);
  };

  return (
    <>
      {/* Confetti for large donations */}
      {showConfetti && (
        <Confetti
          width={windowDimensions.width}
          height={windowDimensions.height}
          numberOfPieces={300}
          recycle={false}
          gravity={0.25}
          colors={['#FFD700', '#FFA500', '#FF69B4', '#9370DB', '#00CED1']}
        />
      )}

      {/* Notification Stack - Top Center */}
      <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-3 pointer-events-none">
        {activeNotifications.map((notification) => (
          <div
            key={notification.id}
            className="bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 text-white px-6 py-4 rounded-2xl shadow-2xl border-2 border-white/30 backdrop-blur-md animate-slideDown"
            style={{
              animation: 'slideDown 0.5s ease-out, pulse 2s ease-in-out infinite'
            }}
          >
            <div className="flex items-center gap-3">
              {/* Gift / Offering Icon */}
              <div className="text-4xl animate-bounce">{isReligious ? '🙏' : '🎁'}</div>
              
              {/* Content */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-lg">{notification.donorUsername}</span>
                  <span className="text-yellow-300">→</span>
                  <span className="font-semibold">{notification.recipientUsername}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-yellow-300 font-bold text-xl">
                    {formatTokens(notification.amount)} 🪙
                  </span>
                  <span className="text-sm text-white/80">
                    (₦{(notification.amount * 1.65).toFixed(2)})
                  </span>
                </div>
              </div>

              {/* Sparkle Effect */}
              <div className="text-2xl animate-spin-slow">✨</div>
            </div>

            {/* Special badge for large donations */}
            {notification.amount >= 100 && (
              <div className="mt-2 text-center text-xs font-bold text-yellow-300 bg-yellow-900/30 rounded-full px-3 py-1">
                💎 GENEROUS DONOR! 💎
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Inline Styles for Animations */}
      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-100px) scale(0.8);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes pulse {
          0%, 100% {
            box-shadow: 0 0 20px rgba(168, 85, 247, 0.5);
          }
          50% {
            box-shadow: 0 0 40px rgba(236, 72, 153, 0.8);
          }
        }

        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }

        .animate-slideDown {
          animation: slideDown 0.5s ease-out;
        }
      `}</style>
    </>
  );
};

export default DonationNotification;
