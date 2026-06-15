// WeWatch/frontend/src/components/lobby/WatchOutModal.jsx
import React, { useState, useEffect } from 'react';
import { XMarkIcon, ArrowLeftIcon } from '@heroicons/react/24/solid';
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

const RATING_ICON = {
  'G':           '/icons/G Rating Icon.webp',
  'PG':          '/icons/PG Rating Icon.webp',
  'Educational': '/icons/Educational_Rating_Icon.webp',
  'Religious':   '/icons/Religious Rating.webp',
  '13+':         '/icons/13_ Rating Icon.webp',
  '16+':         '/icons/16_ Rating Icon.webp',
  '18+':         '/icons/18_ Rating Icon.webp',
  'Mature':      '/icons/Mature Rating Icon.webp',
};

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
          <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-800">
            <button
              onClick={() => (swapStep === 1 ? setShowSwapper(false) : setSwapStep(1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4 text-gray-500" />
            </button>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900 dark:text-white text-base">
                {swapStep === 1 ? 'Watch Type' : 'Content & Price'}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Private session with {recipientUser?.username} · Step {swapStep}/2
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <XMarkIcon className="w-5 h-5 text-gray-500" />
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
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {allowedRatings.map(rating => (
                      <button
                        key={rating}
                        onClick={() => setSelectedRating(rating)}
                        className={`flex flex-col items-center gap-0.5 p-1.5 rounded-xl border-2 transition-all ${
                          selectedRating === rating
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-indigo-300'
                        }`}
                      >
                        <img
                          src={RATING_ICON[rating]}
                          alt={rating}
                          className="w-10 h-10 object-contain"
                        />
                        <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300">
                          {rating}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
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
