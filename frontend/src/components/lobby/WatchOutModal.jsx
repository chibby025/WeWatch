// WeWatch/frontend/src/components/lobby/WatchOutModal.jsx
import React, { useState, useEffect } from 'react';
import { XMarkIcon, ArrowLeftIcon } from '@heroicons/react/24/solid';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { sendWatchOut, getRoomsWithActiveSessions, startPrivateWatchout, getWatchoutAllowedRatings } from '../../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import WatchTypePicker from '../WatchTypePicker';

const WATCH_TYPE_EMOJI = {
  video: '🎬',
  '3d_cinema': '🎭',
  classroom: '📚',
  podcast: '🎙️',
  livestream: '📡',
  custom: '🎨',
};

const ALL_RATINGS = [
  { id: 'G',           name: 'G',           icon: '/icons/G Rating Icon.webp',              gradient: 'from-green-400 to-green-600',   desc: 'General Audiences — all ages admitted.' },
  { id: 'PG',          name: 'PG',          icon: '/icons/PG Rating Icon.webp',             gradient: 'from-blue-400 to-blue-600',     desc: 'Parental Guidance — some material may not suit children.' },
  { id: 'Educational', name: 'Educational', icon: '/icons/Educational_Rating_Icon.webp',    gradient: 'from-teal-400 to-teal-600',     desc: 'Educational content — classes, tutorials, school & university.' },
  { id: 'Religious',   name: 'Religious',   icon: '/icons/Religious Rating.webp',           gradient: 'from-yellow-400 to-amber-600',  desc: 'Religious & spiritual content — church, Bible study, worship.' },
  { id: '13+',         name: '13+',         icon: '/icons/13_ Rating Icon.webp',            gradient: 'from-yellow-400 to-yellow-600', desc: 'Teens 13+ — may contain content unsuitable for under 13s.' },
  { id: '16+',         name: '16+',         icon: '/icons/16_ Rating Icon.webp',            gradient: 'from-orange-400 to-orange-600', desc: 'Older Teens 16+ — may not suit viewers under 16.' },
  { id: '18+',         name: '18+',         icon: '/icons/18_ Rating Icon.webp',            gradient: 'from-red-400 to-red-600',       desc: 'Adults only — restricted to ages 18 and over.' },
  { id: 'Mature',      name: 'Mature',      icon: '/icons/Mature Rating Icon.webp',         gradient: 'from-purple-400 to-purple-600', desc: 'For mature audiences only. May contain strong language, violence, gore or explicit scenes.' },
];

const NAIRA_PER_TOKEN = 100;

const WatchOutModal = ({ recipientUser, onClose, onSent, groupMode = false, onSelectRoom, liveRooms: propLiveRooms }) => {
  const navigate = useNavigate();

  // Live rooms (Layer 1)
  const [liveRooms, setLiveRooms] = useState(propLiveRooms || []);
  const [loading, setLoading] = useState(!propLiveRooms);
  const [sending, setSending] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);

  // Private session swapper (Layer 2)
  const [showSwapper, setShowSwapper] = useState(false);
  const [swapStep, setSwapStep] = useState(1);
  const [selectedWatchType, setSelectedWatchType] = useState('video');
  const [selectedRating, setSelectedRating] = useState('G');
  const [isPaid, setIsPaid] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [allowedRatings, setAllowedRatings] = useState([]);
  const [ratingScrollIndex, setRatingScrollIndex] = useState(0);
  const [loadingRatings, setLoadingRatings] = useState(false);
  const [sendingPrivate, setSendingPrivate] = useState(false);

  useEffect(() => {
    if (propLiveRooms) return;
    getRoomsWithActiveSessions()
      .then(data => setLiveRooms(data.rooms || []))
      .catch(() => toast.error('Failed to load live rooms'))
      .finally(() => setLoading(false));
  }, [propLiveRooms]);

  const openSwapper = async () => {
    setShowSwapper(true);
    setSwapStep(1);
    setSelectedWatchType('video');
    setSelectedRating('G');
    setIsPaid(false);
    setPriceInput('');
    setLoadingRatings(true);
    try {
      const data = await getWatchoutAllowedRatings(recipientUser.id);
      const ratings = data.allowed_ratings || ['G', 'PG', 'Educational', 'Religious'];
      setAllowedRatings(ratings);
      setSelectedRating(ratings[0] || 'G');
      setRatingScrollIndex(0);
    } catch {
      setAllowedRatings(['G', 'PG', 'Educational', 'Religious']);
      setSelectedRating('G');
    } finally {
      setLoadingRatings(false);
    }
  };

  const handleSendLive = async () => {
    if (!selectedRoom || sending) return;
    if (groupMode) {
      onSelectRoom?.(selectedRoom.room_id);
      onClose();
      return;
    }
    setSending(true);
    try {
      await sendWatchOut(recipientUser.id, selectedRoom.room_id);
      toast.success(`Watch Out sent to ${recipientUser.username}!`);
      onSent?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send Watch Out');
    } finally {
      setSending(false);
    }
  };

  const handleConfirmPrivate = async () => {
    if (sendingPrivate) return;
    setSendingPrivate(true);
    const priceNaira = isPaid ? (parseFloat(priceInput) || 0) : 0;
    try {
      const data = await startPrivateWatchout(recipientUser.id, selectedWatchType, selectedRating, priceNaira);
      toast.success(`Private WatchOut started with ${recipientUser.username}!`);
      onSent?.();
      onClose();
      navigate(`/rooms/${data.room_id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start private WatchOut');
    } finally {
      setSendingPrivate(false);
    }
  };

  const tokenValue = isPaid && priceInput ? Math.round(parseFloat(priceInput) / NAIRA_PER_TOKEN) : 0;

  // ---- Swapper view ----
  if (showSwapper) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className={`flex items-center gap-3 p-4 rounded-t-2xl ${
            swapStep === 2
              ? 'bg-gradient-to-r from-purple-600 to-blue-600'
              : 'border-b border-gray-200 dark:border-gray-800'
          }`}>
            <button
              onClick={() => (swapStep === 1 ? setShowSwapper(false) : setSwapStep(1))}
              className={`p-1.5 rounded-lg transition-colors ${swapStep === 2 ? 'hover:bg-white/20 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              <ArrowLeftIcon className={`w-4 h-4 ${swapStep === 2 ? 'text-white' : 'text-gray-500'}`} />
            </button>
            <div className="flex-1">
              <h2 className={`font-bold text-base ${swapStep === 2 ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                {swapStep === 1 ? 'Watch Type' : 'Content & Price'}
              </h2>
              <p className={`text-xs mt-0.5 ${swapStep === 2 ? 'text-purple-100' : 'text-gray-500'}`}>
                Private session with {recipientUser?.username} · Step {swapStep}/2
              </p>
            </div>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors ${swapStep === 2 ? 'hover:bg-white/20' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              <XMarkIcon className={`w-5 h-5 ${swapStep === 2 ? 'text-white' : 'text-gray-500'}`} />
            </button>
          </div>

          {/* Step 1: Watch Type */}
          {swapStep === 1 && (
            <WatchTypePicker
              selectedTypeId={selectedWatchType}
              onChange={setSelectedWatchType}
              showDescription
              maxWidth={320}
            />
          )}

          {/* Step 2: Content Rating + Price */}
          {swapStep === 2 && (
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Content Rating
                </p>
                {loadingRatings ? (
                  <p className="text-xs text-gray-400 py-2">Loading…</p>
                ) : (() => {
                  const visibleRatings = ALL_RATINGS.filter(r => allowedRatings.includes(r.id));
                  const total = visibleRatings.length;
                  const scrollToRating = (idx) => {
                    setRatingScrollIndex(idx);
                    setSelectedRating(visibleRatings[idx].id);
                  };
                  const currentRating = visibleRatings[ratingScrollIndex] || visibleRatings[0];

                  let startIndex;
                  if (total <= 4) startIndex = 0;
                  else if (ratingScrollIndex === 0) startIndex = 0;
                  else if (ratingScrollIndex === total - 1) startIndex = total - 4;
                  else if (ratingScrollIndex === 1) startIndex = 0;
                  else startIndex = ratingScrollIndex - 1;

                  const visibleCards = visibleRatings.slice(startIndex, startIndex + 4);

                  return (
                    <>
                      <div className="relative">
                        <button
                          onClick={() => scrollToRating(Math.max(0, ratingScrollIndex - 1))}
                          disabled={ratingScrollIndex === 0}
                          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white dark:bg-gray-700 shadow-lg rounded-full p-1 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-600 transition-all"
                        >
                          <ChevronLeftIcon className="w-4 h-4 text-gray-700 dark:text-gray-200" />
                        </button>

                        <div className="flex items-center justify-center gap-2 py-2 px-7 min-h-[120px]">
                          {visibleCards.map((rating, idx) => {
                            const actualIndex = startIndex + idx;
                            const isSelected = actualIndex === ratingScrollIndex;
                            return (
                              <div
                                key={actualIndex}
                                onClick={() => scrollToRating(actualIndex)}
                                className={`flex-shrink-0 cursor-pointer transition-all duration-300 ${isSelected ? 'w-20' : 'w-12 opacity-50 scale-90'}`}
                              >
                                <div className={`bg-gradient-to-br ${rating.gradient} rounded-lg ${isSelected ? 'p-2 shadow-lg ring-4 ring-purple-500 ring-offset-2' : 'p-1.5 shadow hover:scale-105'} transition-all`}>
                                  <img src={rating.icon} alt={rating.name} className="w-full h-auto rounded" />
                                  <p className={`text-white font-bold text-center mt-1 ${isSelected ? 'text-[10px]' : 'text-[8px]'}`}>{rating.name}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <button
                          onClick={() => scrollToRating(Math.min(total - 1, ratingScrollIndex + 1))}
                          disabled={ratingScrollIndex === total - 1}
                          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white dark:bg-gray-700 shadow-lg rounded-full p-1 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-600 transition-all"
                        >
                          <ChevronRightIcon className="w-4 h-4 text-gray-700 dark:text-gray-200" />
                        </button>

                        <div className="flex justify-center gap-1 mt-1">
                          {visibleRatings.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => scrollToRating(i)}
                              className={`transition-all !min-h-0 !min-w-0 rounded-full ${i === ratingScrollIndex ? 'w-5 h-1.5 bg-purple-500' : 'w-1.5 h-1.5 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400'}`}
                              aria-label={`Go to rating ${i + 1}`}
                            />
                          ))}
                        </div>
                      </div>

                      {currentRating && (
                        <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-700 rounded-lg p-2.5 mt-2 flex items-start gap-2">
                          <div className={`flex-shrink-0 bg-gradient-to-br ${currentRating.gradient} rounded-lg p-1.5`}>
                            <img src={currentRating.icon} alt={currentRating.name} className="w-7 h-7" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-gray-900 dark:text-white text-xs mb-0.5">{currentRating.name} Rating</p>
                            <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-snug">{currentRating.desc}</p>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Price
                </p>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => setIsPaid(false)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${
                      !isPaid
                        ? 'border-green-500 bg-green-600 text-white'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-green-300'
                    }`}
                  >
                    Free
                  </button>
                  <button
                    onClick={() => setIsPaid(true)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${
                      isPaid
                        ? 'border-amber-500 bg-amber-500 text-white'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-amber-300'
                    }`}
                  >
                    Paid
                  </button>
                </div>
                {isPaid && (
                  <div className="flex gap-1.5 mb-2">
                    {[50, 100, 200, 1000].map(amount => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => setPriceInput(String(amount))}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          priceInput === String(amount)
                            ? 'border-amber-500 bg-amber-500 text-white'
                            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-amber-300'
                        }`}
                      >
                        ₦{amount}
                      </button>
                    ))}
                  </div>
                )}
                {isPaid && (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-medium pointer-events-none">
                      ₦
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={priceInput}
                      onChange={e => setPriceInput(e.target.value)}
                      placeholder="0"
                      className="w-full pl-7 pr-24 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {tokenValue > 0 && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-amber-600 dark:text-amber-400 font-medium pointer-events-none">
                        ≈ {tokenValue} token{tokenValue !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex gap-2">
            <button
              onClick={() => (swapStep === 1 ? setShowSwapper(false) : setSwapStep(1))}
              className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {swapStep === 1 ? 'Cancel' : 'Back'}
            </button>
            {swapStep === 1 ? (
              <button
                onClick={() => setSwapStep(2)}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleConfirmPrivate}
                disabled={sendingPrivate || (isPaid && !priceInput)}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white text-sm font-medium transition-colors disabled:cursor-not-allowed"
              >
                {sendingPrivate ? 'Starting…' : 'Start Watch Out'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- Main modal ----
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white text-base">Watch Out</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {groupMode ? 'Invite group to a live session' : `Invite ${recipientUser?.username} to watch`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Watch Privately section — DM only */}
        {!groupMode && (
          <div className="px-4 pt-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Watch Privately Together
            </p>
            <button
              onClick={openSwapper}
              className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-transparent bg-indigo-50 dark:bg-indigo-900/20 hover:border-indigo-400 transition-all"
            >
              <span className="text-2xl flex-shrink-0">👀</span>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                  Start private session
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Just you and {recipientUser?.username} — browse & watch together
                </p>
              </div>
            </button>
          </div>
        )}

        {/* Live rooms divider */}
        <div className="px-4 pt-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Invite to Live Session
          </p>
        </div>

        {/* Room list */}
        <div className="px-4 pb-2 space-y-2 max-h-56 overflow-y-auto">
          {loading ? (
            <div className="text-center py-6 text-gray-400 text-sm">Loading live rooms…</div>
          ) : liveRooms.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-2xl mb-2">📺</p>
              <p className="text-gray-500 text-sm">No live sessions right now</p>
            </div>
          ) : (
            liveRooms.map(room => (
              <button
                key={room.room_id}
                onClick={() => setSelectedRoom(room)}
                className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                  selectedRoom?.room_id === room.room_id
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : 'border-transparent bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0 leading-none pt-0.5">
                    {WATCH_TYPE_EMOJI[room.watch_type] || '📺'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {room.room_name}
                    </p>
                    {room.session_title && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {room.session_title}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-xs text-green-600 dark:text-green-400">
                        {room.watching_count} watching
                      </span>
                    </div>
                  </div>
                  {room.is_private && (
                    <span className="text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-500 px-1.5 py-0.5 rounded flex-shrink-0">
                      Private
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSendLive}
            disabled={!selectedRoom || sending}
            className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white text-sm font-medium transition-colors disabled:cursor-not-allowed"
          >
            {sending ? 'Sending…' : 'Send Watch Out'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WatchOutModal;
