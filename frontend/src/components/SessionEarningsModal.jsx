import React, { useState, useEffect } from 'react';

/**
 * SessionEarningsModal - Shows host's earnings from paid session
 * Displays after ending a paid session with earnings > 0
 */
const SessionEarningsModal = ({ isOpen, onClose, sessionData, contentRating = '' }) => {
  const isReligious = contentRating === 'Religious';
  const [animatedTokens, setAnimatedTokens] = useState(0);
  const [animatedNGN, setAnimatedNGN] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [coins, setCoins] = useState([]);

  if (!isOpen || !sessionData) return null;

  // Convert cents to tokens (100 cents = 1 token)
  const totalTokens = sessionData.total_ticket_revenue / 100;
  
  // Convert tokens to NGN using withdrawal rate (₦122/token)
  const withdrawalRate = 122;
  const totalNGN = totalTokens * withdrawalRate;

  // 🎉 Trigger animations when modal opens
  useEffect(() => {
    if (isOpen) {
      // Start confetti burst
      setShowConfetti(true);
      
      // Generate falling coins
      const coinElements = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 2 + Math.random() * 1,
        rotation: Math.random() * 360,
      }));
      setCoins(coinElements);

      // Number counting animation
      const duration = 2000; // 2 seconds
      const steps = 60;
      const tokenIncrement = totalTokens / steps;
      const ngnIncrement = totalNGN / steps;
      let currentStep = 0;

      const timer = setInterval(() => {
        currentStep++;
        setAnimatedTokens(Math.min(tokenIncrement * currentStep, totalTokens));
        setAnimatedNGN(Math.min(ngnIncrement * currentStep, totalNGN));

        if (currentStep >= steps) {
          clearInterval(timer);
          setAnimatedTokens(totalTokens);
          setAnimatedNGN(totalNGN);
        }
      }, duration / steps);

      // Stop confetti after 4 seconds
      const confettiTimer = setTimeout(() => setShowConfetti(false), 4000);
      
      // Clear coins after animation
      const coinsTimer = setTimeout(() => setCoins([]), 3000);

      return () => {
        clearInterval(timer);
        clearTimeout(confettiTimer);
        clearTimeout(coinsTimer);
      };
    }
  }, [isOpen, totalTokens, totalNGN]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      {/* 💰 Falling Coins Animation */}
      {coins.map((coin) => (
        <div
          key={coin.id}
          className="absolute text-4xl pointer-events-none animate-fall"
          style={{
            left: `${coin.left}%`,
            animationDelay: `${coin.delay}s`,
            animationDuration: `${coin.duration}s`,
            transform: `rotate(${coin.rotation}deg)`,
          }}
        >
          🪙
        </div>
      ))}

      {/* 🎊 Confetti Burst */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {Array.from({ length: 50 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 animate-confetti"
              style={{
                left: `${50 + (Math.random() - 0.5) * 30}%`,
                top: '10%',
                backgroundColor: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'][i % 6],
                animationDelay: `${Math.random() * 0.5}s`,
                animationDuration: `${2 + Math.random() * 1}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in relative">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">{isReligious ? 'Offering Received' : 'Session Earnings'}</h2>
              <p className="text-purple-100 mt-1 text-sm">
                {isReligious ? 'Offerings from this service' : 'Your earnings from this session'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors"
              aria-label="Close modal"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Earnings Content */}
        <div className="p-6 space-y-6">
          {/* Ticket Sales Summary */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <span className="text-3xl">{isReligious ? '🙏' : '🎟️'}</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-800">
              {sessionData.total_tickets_sold} {isReligious
                ? (sessionData.total_tickets_sold === 1 ? 'Offering' : 'Offerings')
                : (sessionData.total_tickets_sold === 1 ? 'Ticket' : 'Tickets')} Received
            </h3>
          </div>

          {/* Earnings Breakdown */}
          <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl p-6 space-y-4 relative overflow-hidden">
            {/* ✨ Shimmer Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-shimmer" />
            
            {/* Token Balance */}
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center space-x-2">
                <span className="text-2xl animate-bounce">🪙</span>
                <span className="text-gray-700 font-medium">Token Balance</span>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900 animate-pulse-glow">
                  {animatedTokens.toFixed(2)} tokens
                </div>
                <div className="text-sm text-gray-500">
                  ≈ ₦{animatedNGN.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Info Note */}
            <div className="flex items-start space-x-2 text-sm text-gray-600 bg-white bg-opacity-60 rounded-lg p-3">
              <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span>
                This is your 75% share from ticket sales. The platform fee (25%) has already been deducted. Convert rate shown is the withdrawal rate.
              </span>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={onClose}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg"
          >
            Continue
          </button>
        </div>

        {/* Footer Note */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            Earnings have been added to your wallet. Visit the Payment page to withdraw.
          </p>
        </div>
      </div>

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes fall {
          0% {
            transform: translateY(-100vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }

        @keyframes confetti {
          0% {
            transform: translateY(0) rotateZ(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotateZ(360deg);
            opacity: 0;
          }
        }

        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        @keyframes pulse-glow {
          0%, 100% {
            text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
          }
          50% {
            text-shadow: 0 0 20px rgba(255, 215, 0, 0.8), 0 0 30px rgba(255, 215, 0, 0.6);
          }
        }

        .animate-fall {
          animation: fall 2s ease-in forwards;
        }

        .animate-confetti {
          animation: confetti 3s ease-out forwards;
        }

        .animate-shimmer {
          animation: shimmer 2s infinite;
        }

        .animate-pulse-glow {
          animation: pulse-glow 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default SessionEarningsModal;
