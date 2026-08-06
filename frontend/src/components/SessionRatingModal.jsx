// ✅ DAY 3: Session Rating Modal
// Appears after paid cinema/video sessions end
// Users rate the content to build creator reputation

import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { resolveAvatarUrl } from '../utils/avatar';

// Fallback labels when a session never got a real title (instant/quick-start
// sessions, mostly) — named after the feature instead of a generic
// "Untitled Session", so the prompt doubles as a light reminder that these
// other watch experiences exist. Mirrors the labels already used elsewhere
// in the app for the same watch_type values (RoomPageNew's own
// sessionTypeLabel, MembersModal's getModalTitle).
const WATCH_TYPE_FALLBACK_TITLES = {
  video_watch: 'Video Watch',
  '3d_cinema': '3D Cinema',
  classroom: 'Lecture Hall',
  lecture_hall: 'Lecture Hall',
  custom: 'Custom Scene',
};

function getDisplayTitle(sessionTitle, watchType) {
  if (sessionTitle && sessionTitle.trim()) return sessionTitle;
  return WATCH_TYPE_FALLBACK_TITLES[watchType] || 'Video Watch';
}

const SessionRatingModal = ({
  isOpen,
  onClose,
  sessionId,
  hostName,
  hostAvatarUrl,
  sessionTitle,
  watchType,
  onSubmit
}) => {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [review, setReview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (rating === 0) {
      toast.error('Please select a rating');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({ rating, review: review.trim() });
      toast.success('Thanks for your feedback! 🌟');
      onClose();
    } catch (error) {
      console.error('Failed to submit rating:', error);
      toast.error('Failed to submit rating. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 sm:p-6">
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-2xl font-bold">Rate This Session</h2>
              <p className="text-purple-100 mt-1 text-xs sm:text-sm line-clamp-2">
                How was "{getDisplayTitle(sessionTitle, watchType)}"?
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors flex-shrink-0"
              aria-label="Skip rating"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Host Info */}
          <div className="flex flex-col items-center gap-2">
            <img
              src={resolveAvatarUrl(hostAvatarUrl)}
              alt={hostName || 'Host'}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-purple-100 shadow-sm"
              onError={(e) => { e.currentTarget.src = resolveAvatarUrl(null); }}
            />
            <p className="text-gray-600 text-xs sm:text-sm">
              Hosted by <span className="font-semibold text-gray-900">{hostName}</span>
            </p>
          </div>

          {/* Star Rating */}
          <div className="flex flex-col items-center space-y-2 sm:space-y-3">
            <label className="text-gray-700 font-medium text-base sm:text-lg">Your Rating</label>
            <div className="flex gap-1 sm:gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="transition-transform hover:scale-110 active:scale-95"
                >
                  <svg
                    className={`w-10 h-10 sm:w-12 sm:h-12 ${
                      star <= (hoveredRating || rating)
                        ? 'text-yellow-400 fill-current'
                        : 'text-gray-300'
                    } transition-colors`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                    />
                  </svg>
                </button>
              ))}
            </div>
            <p className="text-xs sm:text-sm text-gray-500">
              {rating === 0 && 'Click a star to rate'}
              {rating === 1 && '😞 Poor'}
              {rating === 2 && '😐 Below Average'}
              {rating === 3 && '🙂 Average'}
              {rating === 4 && '😊 Good'}
              {rating === 5 && '🤩 Excellent!'}
            </p>
          </div>

          {/* Review (Optional) */}
          <div>
            <label className="block text-gray-700 font-medium mb-2 text-sm sm:text-base">
              Review (Optional)
            </label>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Share your thoughts about this session..."
              className="w-full px-3 py-2 sm:px-4 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-sm sm:text-base"
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-gray-500 mt-1 text-right">
              {review.length}/500 characters
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2.5 sm:px-4 sm:py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition-colors text-sm sm:text-base"
            >
              Skip
            </button>
            <button
              type="submit"
              disabled={rating === 0 || isSubmitting}
              className="flex-1 px-3 py-2.5 sm:px-4 sm:py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Rating'}
            </button>
          </div>

          {/* 📊 FUTURE: Show host's current rating here */}
          {/* <div className="text-center pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              {hostName}'s average rating: ⭐ 4.8 / 5.0 (127 reviews)
            </p>
          </div> */}
        </form>
      </div>
    </div>
  );
};

export default SessionRatingModal;
