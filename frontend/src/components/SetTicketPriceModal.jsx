import React, { useState, useEffect } from 'react';
import {
  convertFiatToTokens,
  formatTokens,
  getCurrencySymbol,
  validatePrice,
  calculateEarlyBirdPrice,
} from '../utils/tokenConverter';

const getTicketImage = (watchType) => {
  const t = watchType?.toLowerCase() || '';
  if (t === 'classroom' || t === 'lecture_hall') return '/icons/LectureTicket.webp';
  if (t === '3d_cinema') return '/icons/CinemaTicket.webp';
  return '/icons/VWTicket.webp';
};

const getWatchTypeLabel = (watchType) => {
  const t = watchType?.toLowerCase() || '';
  if (t === '3d_cinema') return '3D Cinema';
  if (t === 'classroom' || t === 'lecture_hall') return 'Lecture Hall';
  return 'Video Watch';
};

const PRICE_PRESETS = [50, 100, 200, 1000];

const SetTicketPriceModal = ({ isOpen, onClose, onSetPrice, watchType }) => {
  const [currency]                          = useState('NGN');
  const [priceAmount, setPriceAmount]       = useState('');
  const [earlyBirdEnabled]                  = useState(false);
  const [earlyBirdDiscount]                 = useState(20);
  const [earlyBirdEndTime]                  = useState('');
  const [error, setError]                   = useState(null);
  const [loading, setLoading]               = useState(false);
  const [hasAcceptedDeclaration, setHasAcceptedDeclaration] = useState(false);
  const [declarationExpanded, setDeclarationExpanded]       = useState(false);

  const requiresDeclaration = watchType === 'video' || watchType === '3d_cinema';

  useEffect(() => {
    if (!isOpen) {
      setPriceAmount('');
      setError(null);
      setLoading(false);
      setHasAcceptedDeclaration(false);
      setDeclarationExpanded(false);
    }
  }, [isOpen]);

  const tokenEquivalent = priceAmount ? convertFiatToTokens(parseFloat(priceAmount), currency) : 0;
  const earlyBirdPrice  = earlyBirdEnabled ? calculateEarlyBirdPrice(parseFloat(priceAmount) || 0, earlyBirdDiscount) : 0;
  const earlyBirdTokens = earlyBirdEnabled ? convertFiatToTokens(earlyBirdPrice, currency) : 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    if (requiresDeclaration && !hasAcceptedDeclaration) {
      setError('You must certify that this is your original content to enable paid ticketing');
      return;
    }

    const amount = parseFloat(priceAmount);
    if (amount < 50) {
      setError('Minimum ticket price is ₦50');
      return;
    }

    const validation = validatePrice(amount, currency);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    if (earlyBirdEnabled) {
      if (!earlyBirdEndTime) { setError('Please set early bird end time'); return; }
      if (new Date(earlyBirdEndTime) <= new Date()) { setError('Early bird end time must be in the future'); return; }
      if (earlyBirdDiscount < 5 || earlyBirdDiscount > 50) { setError('Early bird discount must be between 5% and 50%'); return; }
    }

    setLoading(true);
    onSetPrice({
      ticketing_enabled:       true,
      ticket_price_tokens:     tokenEquivalent,
      ticket_price_currency:   currency,
      ticket_price_amount:     amount,
      early_bird_enabled:      earlyBirdEnabled,
      early_bird_price_tokens: earlyBirdEnabled ? earlyBirdTokens : 0,
      early_bird_end_time:     earlyBirdEnabled ? new Date(earlyBirdEndTime).toISOString() : null,
    });
  };

  if (!isOpen) return null;

  const parsedPrice  = parseFloat(priceAmount) || 0;
  const belowMinimum = priceAmount !== '' && parsedPrice > 0 && parsedPrice < 50;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white px-5 py-4 sm:px-7 sm:py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg sm:text-2xl font-bold">Set Ticket Price</h2>
              <p className="text-purple-200 mt-0.5 text-xs sm:text-sm">
                {getWatchTypeLabel(watchType)} session
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white transition-colors flex-shrink-0 p-1"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div className="mx-4 mt-4 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-xl p-3 flex items-start gap-2">
            <svg className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-red-700 dark:text-red-400 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 flex-shrink-0">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* ── Two-column body ── */}
          <div className="flex flex-col sm:flex-row">

            {/* Left — ticket image */}
            <div className="sm:w-5/12 bg-gradient-to-br from-purple-700 via-indigo-700 to-indigo-800 flex items-center justify-center p-6 sm:p-8 border-b-2 sm:border-b-0 sm:border-r-2 border-dashed border-indigo-400/30">
              <img
                src={getTicketImage(watchType)}
                alt="Ticket"
                className="w-full h-auto max-w-[160px] sm:max-w-[210px] transition-transform duration-300 hover:scale-105 drop-shadow-2xl"
              />
            </div>

            {/* Right — form fields */}
            <div className="sm:w-7/12 p-5 sm:p-6 space-y-5">

              {/* Content declaration — video/cinema only */}
              {requiresDeclaration && (
                <div className="border border-purple-200 dark:border-purple-800 rounded-xl overflow-hidden">
                  {/* Compact always-visible row */}
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-purple-50 dark:bg-purple-900/20">
                    <input
                      id="declaration-check"
                      type="checkbox"
                      checked={hasAcceptedDeclaration}
                      onChange={(e) => setHasAcceptedDeclaration(e.target.checked)}
                      className="w-4 h-4 rounded text-purple-600 border-purple-300 focus:ring-purple-500 flex-shrink-0"
                    />
                    <label
                      htmlFor="declaration-check"
                      className="text-xs text-gray-700 dark:text-gray-300 flex-1 cursor-pointer leading-snug"
                    >
                      <span className="font-semibold">I certify</span> this is my original content or I hold proper licenses to monetize it.
                    </label>
                    <button
                      type="button"
                      onClick={() => setDeclarationExpanded(v => !v)}
                      className="flex items-center gap-0.5 text-xs text-purple-600 dark:text-purple-400 hover:underline flex-shrink-0"
                    >
                      Guidelines
                      <svg
                        className={`w-3 h-3 transition-transform duration-200 ${declarationExpanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  {/* Expanded guidelines */}
                  {declarationExpanded && (
                    <div className="px-3 pb-3 pt-2 border-t border-purple-100 dark:border-purple-800 bg-white dark:bg-gray-900 space-y-2">
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-2">
                        <p className="text-[11px] font-semibold text-green-800 dark:text-green-400 mb-1">✅ Allowed</p>
                        <ul className="text-[11px] text-green-700 dark:text-green-500 space-y-0.5 ml-3">
                          <li>• Your comedy skits, stand-up, podcasts</li>
                          <li>• Your indie films, music videos, vlogs</li>
                          <li>• Educational content you created</li>
                          <li>• Gaming content you recorded</li>
                        </ul>
                      </div>
                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2">
                        <p className="text-[11px] font-semibold text-red-800 dark:text-red-400 mb-1">❌ Not Allowed</p>
                        <ul className="text-[11px] text-red-700 dark:text-red-500 space-y-0.5 ml-3">
                          <li>• Movies/TV shows you don't own</li>
                          <li>• Pirated or copyrighted content</li>
                          <li>• Content without proper licenses</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Currency — compact inline */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Currency</span>
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                  ₦ NGN
                  <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
                    Active
                  </span>
                </div>
              </div>

              {/* Quick select — prominent cards */}
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
                  Quick Select
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {PRICE_PRESETS.map(preset => {
                    const tokens     = convertFiatToTokens(preset, 'NGN');
                    const isSelected = parsedPrice === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setPriceAmount(String(preset))}
                        className={`flex flex-col items-center py-3 px-1 rounded-xl border-2 transition-all duration-150 ${
                          isSelected
                            ? 'border-purple-500 bg-gradient-to-b from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/25'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-purple-400 dark:hover:border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20'
                        }`}
                      >
                        <span className="text-sm font-bold leading-none">
                          ₦{preset >= 1000 ? `${preset / 1000}k` : preset}
                        </span>
                        <span className={`text-[10px] mt-1 leading-none ${isSelected ? 'text-purple-200' : 'text-gray-400 dark:text-gray-500'}`}>
                          {formatTokens(tokens)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Price input */}
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
                  Ticket Price
                </p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-gray-300 dark:text-gray-600 pointer-events-none select-none">
                    ₦
                  </span>
                  <input
                    type="number"
                    value={priceAmount}
                    onChange={(e) => setPriceAmount(e.target.value)}
                    placeholder="0"
                    step="1"
                    min="0"
                    className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-2xl font-bold text-gray-900 dark:text-white dark:bg-gray-800 text-right transition-colors"
                    required
                  />
                </div>

                {/* Token equivalent */}
                {priceAmount && tokenEquivalent > 0 && (
                  <div className="mt-2 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Token equivalent</span>
                    <span className="text-sm font-bold text-purple-700 dark:text-purple-400">
                      {formatTokens(tokenEquivalent)}
                    </span>
                  </div>
                )}

                {/* Below minimum warning */}
                {belowMinimum && (
                  <div className="mt-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg flex items-center gap-2">
                    <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <p className="text-xs text-red-700 dark:text-red-400">Minimum ticket price is ₦50</p>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* ── Footer ── */}
          <div className="px-5 py-4 sm:px-7 border-t border-gray-100 dark:border-gray-800 flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="w-full sm:w-auto px-6 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !priceAmount || belowMinimum}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating…
                </>
              ) : (
                'Create Session →'
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

export default SetTicketPriceModal;
