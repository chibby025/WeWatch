import React, { useState, useEffect } from 'react';
import {
  detectUserCurrency,
  convertFiatToTokens,
  formatTokens,
  formatCurrency,
  getCurrencySymbol,
  validatePrice,
  calculateEarlyBirdPrice,
  SUPPORTED_CURRENCIES,
} from '../utils/tokenConverter';

/**
 * SetTicketPriceModal - Configure ticket pricing for paid sessions
 * Ticket paper-themed design with price configuration
 */
const SetTicketPriceModal = ({ isOpen, onClose, onSetPrice, watchType }) => {
  const [currency, setCurrency] = useState('NGN'); // Locked to NGN (Paystack only)
  const [priceAmount, setPriceAmount] = useState('');
  const [earlyBirdEnabled, setEarlyBirdEnabled] = useState(false);
  const [earlyBirdDiscount, setEarlyBirdDiscount] = useState(20);
  const [earlyBirdEndTime, setEarlyBirdEndTime] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // ✅ DAY 2: Content Declaration for video/cinema
  const [hasAcceptedDeclaration, setHasAcceptedDeclaration] = useState(false);
  const requiresDeclaration = watchType === 'video' || watchType === '3d_cinema';

  // Get ticket image based on watch type (live sessions have no content_rating)
  const getTicketImage = () => {
    const type = watchType?.toLowerCase() || '';
    if (type === 'classroom' || type === 'lecture_hall') return '/icons/LectureTicket.webp';
    if (type === '3d_cinema') return '/icons/CinemaTicket.webp';
    return '/icons/VWTicket.webp';
  };

  // Currency locked to NGN (Paystack Nigeria only)
  // Multi-currency support coming with Stripe integration
  useEffect(() => {
    if (isOpen) {
      setCurrency('NGN'); // Always NGN for MVP
    }
  }, [isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setPriceAmount('');
      setEarlyBirdEnabled(false);
      setEarlyBirdDiscount(20);
      setEarlyBirdEndTime('');
      setError(null);
      setLoading(false);
      setHasAcceptedDeclaration(false); // Reset declaration
    }
  }, [isOpen]);

  // Calculate token equivalent in real-time
  const tokenEquivalent = priceAmount ? convertFiatToTokens(parseFloat(priceAmount), currency) : 0;
  
  // Calculate early bird prices
  const earlyBirdPriceAmount = earlyBirdEnabled 
    ? calculateEarlyBirdPrice(parseFloat(priceAmount) || 0, earlyBirdDiscount)
    : 0;
  const earlyBirdTokens = earlyBirdEnabled
    ? convertFiatToTokens(earlyBirdPriceAmount, currency)
    : 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    // ✅ DAY 2: Validate content declaration for video/cinema
    if (requiresDeclaration && !hasAcceptedDeclaration) {
      setError('You must certify that this is your original content to enable paid ticketing');
      return;
    }

    const amount = parseFloat(priceAmount);
    
    const minPriceNaira = 50;
    if (amount < minPriceNaira) {
      setError(`Minimum ticket price is ₦${minPriceNaira}`);
      return;
    }
    
    // Validate price
    const validation = validatePrice(amount, currency);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    // Validate early bird
    if (earlyBirdEnabled) {
      if (!earlyBirdEndTime) {
        setError('Please set early bird end time');
        return;
      }

      const endTime = new Date(earlyBirdEndTime);
      if (endTime <= new Date()) {
        setError('Early bird end time must be in the future');
        return;
      }

      if (earlyBirdDiscount < 5 || earlyBirdDiscount > 50) {
        setError('Early bird discount must be between 5% and 50%');
        return;
      }
    }

    // Prepare ticketing config
    const config = {
      ticketing_enabled: true,
      ticket_price_tokens: tokenEquivalent,
      ticket_price_currency: currency,
      ticket_price_amount: amount,
      early_bird_enabled: earlyBirdEnabled,
      early_bird_price_tokens: earlyBirdEnabled ? earlyBirdTokens : 0,
      early_bird_end_time: earlyBirdEnabled ? new Date(earlyBirdEndTime).toISOString() : null,
    };

    setLoading(true);
    onSetPrice(config);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-4xl my-4 sm:my-8 overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-yellow-500 to-amber-600 text-white p-4 sm:p-6">
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold truncate">Set Ticket Price</h2>
              <p className="text-yellow-100 mt-1 text-xs sm:text-sm">
                Configure pricing for your {watchType === '3d_cinema' ? '3D Cinema' : 'Video'} session
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

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-3 sm:p-4 m-3 sm:m-6 mb-0">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
              <div className="ml-auto pl-3">
                <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                  <span className="sr-only">Dismiss</span>
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content - Ticket Layout */}
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col md:flex-row">
            {/* Left Side - Ticket Image (40%) */}
            <div className="w-full md:w-2/5 bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center p-4 sm:p-8 md:border-r-2 border-b-2 md:border-b-0 border-dashed border-amber-600">
              <img 
                src={getTicketImage()} 
                alt="Ticket"
                className="w-full h-auto max-w-xs transition-transform duration-300 hover:scale-105 drop-shadow-2xl"
              />
            </div>

            {/* Right Side - Form (60%) */}
            <div className="w-full md:w-3/5 p-4 sm:p-6 md:p-8 bg-gradient-to-br from-yellow-50 to-white">
              <div className="space-y-6">
                {/* ✅ DAY 2: Content Declaration (for video/cinema only) */}
                {requiresDeclaration && (
                  <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <div className="text-2xl">🎬</div>
                      <div className="flex-1">
                        <h3 className="font-bold text-amber-900 text-sm mb-2">
                          Content Declaration Required
                        </h3>
                        <p className="text-xs text-amber-800 mb-3">
                          By enabling paid ticketing, you certify this content is yours:
                        </p>
                        
                        {/* Allowed Examples */}
                        <div className="bg-green-50 border border-green-200 rounded p-2 mb-2">
                          <p className="text-xs font-semibold text-green-800 mb-1">✅ Allowed:</p>
                          <ul className="text-xs text-green-700 space-y-0.5 ml-4">
                            <li>• Your comedy skits, stand-up, podcasts</li>
                            <li>• Your indie films, music videos, vlogs</li>
                            <li>• Educational content you created</li>
                            <li>• Gaming content you recorded</li>
                          </ul>
                        </div>
                        
                        {/* Not Allowed Examples */}
                        <div className="bg-red-50 border border-red-200 rounded p-2 mb-3">
                          <p className="text-xs font-semibold text-red-800 mb-1">❌ Not Allowed:</p>
                          <ul className="text-xs text-red-700 space-y-0.5 ml-4">
                            <li>• Movies/TV shows you don't own</li>
                            <li>• Pirated or copyrighted content</li>
                            <li>• Content without proper licenses</li>
                          </ul>
                        </div>
                        
                        {/* Certification Checkbox */}
                        <label className="flex items-start gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={hasAcceptedDeclaration}
                            onChange={(e) => setHasAcceptedDeclaration(e.target.checked)}
                            className="mt-0.5 w-4 h-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500"
                          />
                          <span className="text-xs text-gray-700 group-hover:text-gray-900 transition-colors">
                            <strong>I certify</strong> this content is my original work or I have proper licenses to monetize it. 
                            I agree to indemnify LetsWatchOut for any copyright claims related to this content.
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* 🚀 FUTURE: AI Trailer Generation (Day 4+)
                     When user schedules a paid session with uploaded media:
                     1. Extract first 60 seconds of video
                     2. Use OpenAI Vision API to identify highlights
                     3. Generate 15-second trailer with:
                        - Key moments montage
                        - Text overlays (title, host, price, date)
                        - Upbeat background music
                     4. Email trailer to room members as preview
                     5. Show trailer in room feed before event
                     
                     Cost: ~$0.06 per trailer (OpenAI + video processing)
                     Impact: 30-50% increase in ticket sales
                     
                     Implementation: Add generateTrailer() function in backend
                     API endpoints: POST /api/sessions/:id/generate-trailer
                */}
                {/* Currency Display (NGN Only) */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide" style={{fontFamily: "'Courier New', monospace"}}>
                    Currency
                  </label>
                  <div className="w-full px-4 py-3 border-2 border-amber-300 rounded-lg bg-amber-50 text-gray-800 font-semibold flex items-center justify-between"
                    style={{fontFamily: "'Courier New', monospace"}}>
                    <span>₦ NGN - Nigerian Naira</span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Active</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    💡 More currencies (USD, EUR, etc.) coming soon with Stripe integration
                  </p>
                </div>

                {/* Price Suggestions */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide" style={{fontFamily: "'Courier New', monospace"}}>
                    Quick Select
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {[50, 100, 200, 1000].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setPriceAmount(String(preset))}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                          parseFloat(priceAmount) === preset
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white text-gray-700 border-amber-300 hover:border-amber-500 hover:bg-amber-50'
                        }`}
                        style={{fontFamily: "'Courier New', monospace"}}
                      >
                        ₦{preset.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Price Amount */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide" style={{fontFamily: "'Courier New', monospace"}}>
                    Ticket Price
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-3xl font-bold text-gray-700" style={{fontFamily: "'Courier New', monospace"}}>
                      {getCurrencySymbol(currency)}
                    </span>
                    <input
                      type="number"
                      value={priceAmount}
                      onChange={(e) => setPriceAmount(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      className="w-full pl-12 pr-4 py-4 border-2 border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-3xl font-bold text-gray-900 text-right"
                      style={{fontFamily: "'Courier New', monospace"}}
                      required
                    />
                  </div>
                  
                  {/* Token Equivalent Display */}
                  {priceAmount && tokenEquivalent > 0 && (
                    <div className="mt-3 p-3 bg-amber-100 border-l-4 border-amber-500 rounded">
                      <p className="text-lg font-semibold text-gray-700" style={{fontFamily: "'Courier New', monospace"}}>
                        ≈ {formatTokens(tokenEquivalent)}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        Your withdrawal value: 1 token = ₦122 (~$0.07 USD)
                      </p>
                    </div>
                  )}
                  
                  {/* Minimum Price Warning */}
                  {priceAmount && parseFloat(priceAmount) < 50 && (
                    <div className="mt-3 p-3 bg-red-50 border-l-4 border-red-500 rounded animate-pulse">
                      <div className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <div>
                          <p className="text-sm font-semibold text-red-800">
                            Below Minimum Price
                          </p>
                          <p className="text-xs text-red-700 mt-1">
                            Minimum ticket price is ₦50. Please increase the price to continue.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="bg-gray-50 px-4 sm:px-8 py-3 sm:py-4 border-t border-gray-200 flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="w-full sm:w-auto px-6 py-2.5 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !priceAmount}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-600 text-white font-semibold rounded-lg hover:from-amber-600 hover:to-yellow-700 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating...
                </>
              ) : (
                <>
                  Create Session →
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SetTicketPriceModal;
