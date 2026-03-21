/**
 * Ticket Purchase Modal
 * Purchase tickets for watch sessions with early bird pricing
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePayment } from '../../contexts/PaymentContext';
import { setTicketCache } from '../../utils/ticketCache';
import {
  purchaseTicket,
  giftTicket,
  formatTokens,
  formatCurrency
} from '../../services/paymentApi';

const TicketPurchaseModal = ({ isOpen, onClose, session, onSuccess }) => {
  const { wallet, fetchWallet } = usePayment();
  const navigate = useNavigate();
  
  const [paymentMethod, setPaymentMethod] = useState('tokens');
  const [isGift, setIsGift] = useState(false);
  const [recipientUsername, setRecipientUsername] = useState('');
  const [giftMessage, setGiftMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [showBuyTokens, setShowBuyTokens] = useState(false);

  // Determine ticket price
  const ticketPrice = session?.early_bird_active && session?.early_bird_enabled
    ? session.early_bird_price_tokens
    : session?.ticket_price_tokens || 0;
  
  const isEarlyBird = session?.early_bird_active && session?.early_bird_enabled;
  
  // Check if user has enough tokens
  const hasInsufficientBalance = paymentMethod === 'tokens' && ticketPrice > (wallet?.token_balance || 0);

  // Debug logging for wallet state
  useEffect(() => {
    if (isOpen) {
      console.log('🔍 [TicketPurchaseModal] Modal opened with session:', {
        session_id: session?.id,
        watch_type: session?.watch_type,
        class_type: session?.class_type,
        host_username: session?.host_username,
        host_name: session?.host_name,
        full_session: session
      });
      console.log('🔍 [TicketPurchaseModal] Wallet state:', {
        wallet: wallet,
        token_balance: wallet?.token_balance,
        ticketPrice: ticketPrice
      });
    }
  }, [isOpen, wallet, ticketPrice, session]);

  useEffect(() => {
    if (isOpen) {
      // Fetch wallet when modal opens to ensure fresh data
      fetchWallet().catch(err => {
        console.error('❌ [TicketPurchaseModal] Failed to fetch wallet:', err);
      });
    } else {
      // Reset form when modal closes
      setIsGift(false);
      setRecipientUsername('');
      setGiftMessage('');
      setError(null);
      setSuccess(false);
    }
  }, [isOpen, fetchWallet]);

  const handlePurchase = async () => {
    if (!session) return;

    // Validation
    if (paymentMethod === 'tokens' && ticketPrice > (wallet?.token_balance || 0)) {
      setError('Insufficient token balance');
      return;
    }

    if (isGift && !recipientUsername.trim()) {
      setError('Please enter recipient username');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (isGift) {
        // Gift ticket to another user
        await giftTicket({
          session_id: session.id,
          payment_method: paymentMethod,
          recipient_username: recipientUsername,
          gift_message: giftMessage || undefined
        });
      } else {
        // Regular ticket purchase
        await purchaseTicket({
          session_id: session.id,
          payment_method: paymentMethod
        });
      }

      // Cache the ticket for non-gift purchases
      if (!isGift) {
        setTicketCache(session.id);
      }

      setSuccess(true);
      await fetchWallet(); // Refresh balance
      
      // Brief success message, then trigger callback
      setTimeout(() => {
        if (onSuccess && !isGift) {
          onSuccess(session.id);
        }
        onClose();
      }, 500);
    } catch (err) {
      console.error('Purchase failed:', err);
      setError(err.response?.data?.error || 'Failed to purchase ticket');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !session) return null;

  // Get watch type display name
  const getWatchTypeDisplay = () => {
    const type = session.watch_type?.toLowerCase() || 'cinema';
    const classType = session.class_type?.toLowerCase() || '';
    
    if (type.includes('3d') || type.includes('cinema')) return 'CINEMA';
    if (type.includes('video')) return 'VIDEO WATCH';
    if (type === 'classroom' && classType === 'lecture_hall') return 'LECTURE HALL';
    return 'CINEMA';
  };

  // Get ticket PNG based on watch type and class type
  const getTicketImage = () => {
    const type = session.watch_type?.toLowerCase() || 'cinema';
    const classType = session.class_type?.toLowerCase() || '';
    
    // Lecture Hall: watch_type='classroom' + class_type='lecture_hall'
    if (type === 'classroom' && classType === 'lecture_hall') {
      return '/icons/LectureTicket.png';
    }
    
    // Regular Classroom
    if (type === 'classroom') {
      return '/icons/LectureTicket.png';
    }
    
    // Video Watch
    if (type.includes('video')) {
      return '/icons/TheaterTicket.png';
    }
    
    // Cinema (default for 3d_cinema, cinema, or anything else)
    return '/icons/CinemaTicket.png';
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-2 sm:p-4">
      {/* Ticket Modal Container - Two Part Layout */}
      <div 
        className="relative bg-transparent max-w-lg w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto"
        style={{
          animation: isOpen ? 'ticketTear 0.6s ease-out' : 'none'
        }}
      >
        {/* TOP SECTION - Dynamic Ticket PNG based on Watch Type */}
        <div className="relative w-full group">
          <img 
            src={getTicketImage()} 
            alt="Ticket Info"
            className="w-full h-auto scale-110 transition-transform duration-300 hover:scale-[1.15] hover:drop-shadow-2xl"
          />
          
          {/* Close Button - Top Right */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-50 text-gray-700 hover:text-gray-900 bg-white/80 hover:bg-white rounded-full p-1.5 transition-all shadow-md pointer-events-auto"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Text Overlays for Session Info */}
          <div className="absolute inset-0 pointer-events-none font-['Inter'] font-medium z-10">
            {/* RED SECTION - Bottom Left Info */}
            <div className={`absolute ${
              session.watch_type?.toLowerCase().includes('video') 
                ? 'left-[18%] bottom-[40.5%]' 
                : 'left-[18%] bottom-[38%]'
            }`}>
              {/* DATE/TIME Value Only */}
              <div className="flex items-center gap-2">
                {session.started_at && (
                  <span className="text-xs font-medium text-white uppercase transition-transform duration-300 group-hover:scale-110">
                    {new Date(session.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • {new Date(session.started_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false})}
                  </span>
                )}
              </div>
            </div>
            
            {/* RED SECTION - Bottom Right Info */}
            <div className={`absolute ${
              session.watch_type?.toLowerCase().includes('video') 
                ? 'left-[50%] bottom-[40.5%]' 
                : 'left-[49%] bottom-[38%]'
            }`}>
              {/* SCREEN Value Only */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-white uppercase transition-transform duration-300 group-hover:scale-110">
                  {session.watch_type?.toLowerCase() === 'classroom' ? 'CLASS' : session.watch_type?.replace('_', ' ')}
                </span>
              </div>
            </div>
            
            {/* BROWN SECTION - Right Side Host Info - REMOVED */}
          </div>
        </div>

        {/* BOTTOM SECTION - ticket-bottom.svg (Interactive Form) */}
        <div className="relative w-full -mt-32">
          <img 
            src="/icons/ticket-bottom.svg" 
            alt="Ticket Form"
            className="w-full h-auto"
          />
          
          {/* Interactive Form Content Overlay */}
          {/* Interactive Form Content Overlay */}
          <div className="absolute inset-0 px-8 py-6 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            
            {/* Token Balance Display */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-blue-600 font-medium">Your Token Balance</span>
                <span className="text-sm font-bold text-blue-700">{formatTokens(wallet?.token_balance || 0)}</span>
              </div>
            </div>

            {/* Success Message */}
            {success && (
              <div className="bg-green-500/20 border border-green-500 rounded-lg p-3 text-green-700 text-sm mb-3">
                ✅ Ticket purchased! {isGift && 'Gift sent!'}
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 text-red-700 text-sm mb-3">
                ❌ {error}
              </div>
            )}

            {/* Buy Tokens Section - Show when insufficient balance */}
            {hasInsufficientBalance && !showBuyTokens && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-red-700">Insufficient Balance</span>
                  <button
                    onClick={() => setShowBuyTokens(!showBuyTokens)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Buy Tokens
                  </button>
                </div>
                <p className="text-xs text-red-600">
                  You need {formatTokens(ticketPrice - (wallet?.token_balance || 0))} more tokens
                </p>
              </div>
            )}

            {/* Quick Buy Tokens */}
            {hasInsufficientBalance && showBuyTokens && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-blue-700">Quick Buy Tokens</span>
                  <button
                    onClick={() => setShowBuyTokens(false)}
                    className="text-xs text-gray-600 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[1000, 2000, 5000].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => {
                        onClose();
                        navigate('/payment');
                      }}
                      className="p-2 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded-lg text-xs font-semibold text-blue-700 transition"
                    >
                      {formatTokens(amount)}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    onClose();
                    navigate('/payment');
                  }}
                  className="w-full p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
                >
                  Go to Payment Page
                </button>
              </div>
            )}

            {/* Early Bird Notice */}
            {isEarlyBird && (
              <div className="bg-yellow-500/20 border border-yellow-500 rounded-lg p-3 mb-3">
                <div className="flex items-center gap-2 text-yellow-700 font-bold text-sm">
                  🎉 Early Bird Discount Active!
                </div>
                <div className="text-yellow-600 text-xs">
                  Save {((session.ticket_price_tokens - session.early_bird_price_tokens) / session.ticket_price_tokens * 100).toFixed(0)}% 
                  - Original: {formatTokens(session.ticket_price_tokens)}
                </div>
              </div>
            )}

            {/* Payment Method */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-semibold text-gray-800">Payment Method:</label>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg">
                  <img src="/icons/coins.svg" alt="Tokens" className="w-5 h-5" />
                  <span className="text-sm font-medium text-blue-700">Tokens</span>
                </div>
              </div>
            </div>

            {/* Gift Option */}
            <div className="space-y-2 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isGift}
                  onChange={(e) => setIsGift(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-400 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-800 font-medium text-sm">🎁 Gift this ticket</span>
              </label>

              {isGift && (
                <div className="space-y-2 pt-2">
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">Recipient Username *</label>
                    <input
                      type="text"
                      value={recipientUsername}
                      onChange={(e) => setRecipientUsername(e.target.value)}
                      placeholder="Enter username..."
                      className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-700 mb-1">Gift Message (Optional)</label>
                    <textarea
                      value={giftMessage}
                      onChange={(e) => setGiftMessage(e.target.value)}
                      placeholder="Add a message..."
                      rows="2"
                      className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Purchase Summary */}
            <div className="bg-white/50 rounded-lg p-3 border border-gray-300 mb-3">
              <div className="text-gray-800 font-semibold mb-2 text-sm">Purchase Summary</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">Host:</span>
                  <span className="text-gray-900 font-medium">{session.host_username || session.host_name || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Ticket Price:</span>
                  <span className="text-gray-900 font-medium">{formatTokens(ticketPrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Payment:</span>
                  <span className="text-gray-900 font-medium capitalize">{paymentMethod}</span>
                </div>
                {isGift && recipientUsername && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Gift to:</span>
                    <span className="text-blue-600 font-medium">{recipientUsername}</span>
                  </div>
                )}
                <div className="border-t border-gray-300 pt-1 flex justify-between font-bold">
                  <span className="text-gray-800">Total:</span>
                  <span className="text-blue-600 text-sm">{formatTokens(ticketPrice)}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 mb-2">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-lg font-medium transition-colors text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePurchase}
                disabled={loading || (paymentMethod === 'tokens' && hasInsufficientBalance) || (isGift && !recipientUsername.trim())}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {loading ? '⏳ Processing...' : isGift ? '🎁 Send Gift' : '🎟️ Purchase Ticket'}
              </button>
            </div>

            {/* Footer Note */}
            <div className="text-center text-[10px] text-gray-600 leading-tight">
              {paymentMethod === 'tokens' && !hasInsufficientBalance && 'Tokens transferred to host'}
            </div>
          </div>
        </div>

        {/* Insufficient Balance Stamp Overlay */}
        {hasInsufficientBalance && (
          <div 
            className="absolute top-[55%] right-[8%] z-10 pointer-events-none"
            style={{
              transform: 'rotate(-15deg)',
              width: '180px',
              height: '180px'
            }}
          >
            <div className="relative w-full h-full flex items-center justify-center">
              {/* Stamp Background */}
              <div className="absolute inset-0 bg-red-600 opacity-10 rounded-full"></div>
              <div className="absolute inset-2 border-4 border-red-600 rounded-full"></div>
              <div className="absolute inset-4 border-2 border-red-600 rounded-full"></div>
              
              {/* Stamp Text */}
              <div className="relative text-center pointer-events-auto">
                <div className="text-red-600 font-black text-sm leading-tight tracking-tight">
                  INSUFFICIENT<br/>BALANCE
                </div>
                <button
                  onClick={() => {
                    onClose();
                    navigate('/payment');
                  }}
                  className="mt-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold transition-colors"
                >
                  BUY TOKENS
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Gift Ribbon Overlay */}
        {isGift && (
          <div className="absolute top-0 right-0 z-10 overflow-hidden pointer-events-none" style={{ width: '120px', height: '120px' }}>
            <div 
              className="absolute bg-gradient-to-br from-red-600 to-red-700 shadow-lg"
              style={{
                width: '170px',
                height: '40px',
                top: '20px',
                right: '-50px',
                transform: 'rotate(45deg)',
                transformOrigin: 'center'
              }}
            >
              <div className="flex items-center justify-center h-full text-white font-black text-xs tracking-wider">
                🎁 GIFT
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tearing Animation Keyframes */}
      <style>{`
        @keyframes ticketTear {
          0% {
            transform: translateY(100%) scale(0.8);
            opacity: 0;
          }
          50% {
            transform: translateY(0) scale(1.02);
            opacity: 1;
          }
          100% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default TicketPurchaseModal;
