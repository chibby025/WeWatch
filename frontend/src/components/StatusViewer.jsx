import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { markStatusViewed, deleteStatus, toggleStatusLike, sendLobbyChatMessage } from '../services/api';

const DURATION_MS = 5000;

// Full-screen story viewer.
// Props:
//   feedUser     – StatusFeedUser object { user_id, username, avatar_url, statuses[] }
//   isOwnProfile – bool
//   onClose      – fn()
//   onDeleted    – fn(statusId)  called after own status deleted
export default function StatusViewer({ feedUser, isOwnProfile, onClose, onDeleted }) {
  const navigate = useNavigate();
  const [idx, setIdx]           = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused]     = useState(false);
  const intervalRef             = useRef(null);
  const startTimeRef            = useRef(null);
  const elapsedRef              = useRef(0);

  // Per-status like state: { [statusId]: { liked: bool, count: int } }
  const [likeState, setLikeState] = useState({});

  // Reply state
  const [showReply, setShowReply]   = useState(false);
  const [replyText, setReplyText]   = useState('');
  const [replySending, setReplySending] = useState(false);
  const replyInputRef = useRef(null);

  const statuses = feedUser?.statuses || [];
  const current  = statuses[idx];

  // Seed like state from feed data when idx changes
  useEffect(() => {
    if (!current) return;
    setLikeState(prev => ({
      ...prev,
      [current.id]: prev[current.id] ?? { liked: current.has_liked, count: current.like_count ?? 0 },
    }));
    // Close reply input between slides
    setShowReply(false);
    setReplyText('');
  }, [current?.id]);

  const currentLike = likeState[current?.id] ?? { liked: current?.has_liked ?? false, count: current?.like_count ?? 0 };

  const advance = useCallback(() => {
    setIdx(i => {
      if (i + 1 < statuses.length) return i + 1;
      onClose();
      return i;
    });
  }, [statuses.length, onClose]);

  const startTimer = useCallback(() => {
    clearInterval(intervalRef.current);
    startTimeRef.current = Date.now() - elapsedRef.current;
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min((elapsed / DURATION_MS) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        elapsedRef.current = 0;
        advance();
      }
    }, 50);
  }, [advance]);

  const stopTimer = useCallback(() => {
    clearInterval(intervalRef.current);
    elapsedRef.current = Date.now() - (startTimeRef.current || Date.now());
  }, []);

  // Reset + start timer on slide change (but not when reply is open)
  useEffect(() => {
    elapsedRef.current = 0;
    setProgress(0);
    if (!paused && !showReply) startTimer();
    return () => clearInterval(intervalRef.current);
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pause/resume timer when reply sheet opens/closes
  useEffect(() => {
    if (showReply) {
      stopTimer();
      setTimeout(() => replyInputRef.current?.focus(), 100);
    } else if (!paused) {
      startTimer();
    }
  }, [showReply]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark viewed
  useEffect(() => {
    if (!current) return;
    if (!current.has_viewed) {
      markStatusViewed(current.id).catch(() => {});
    }
  }, [current]);

  const handlePause = () => { if (!showReply) { setPaused(true); stopTimer(); } };
  const handleResume = () => { if (!showReply) { setPaused(false); startTimer(); } };

  const goBack = (e) => {
    e.stopPropagation();
    if (showReply) return;
    if (idx > 0) { elapsedRef.current = 0; setIdx(idx - 1); }
  };
  const goForward = (e) => {
    e.stopPropagation();
    if (showReply) return;
    if (idx + 1 < statuses.length) { elapsedRef.current = 0; setIdx(idx + 1); }
    else onClose();
  };

  const handleDelete = async () => {
    if (!current) return;
    try {
      await deleteStatus(current.id);
      onDeleted?.(current.id);
      if (statuses.length <= 1) onClose();
      else advance();
    } catch {}
  };

  const handleLike = async (e) => {
    e.stopPropagation();
    if (!current || isOwnProfile) return;
    const prev = likeState[current.id] ?? { liked: current.has_liked, count: current.like_count ?? 0 };
    // Optimistic update
    setLikeState(s => ({
      ...s,
      [current.id]: { liked: !prev.liked, count: prev.liked ? prev.count - 1 : prev.count + 1 },
    }));
    try {
      const data = await toggleStatusLike(current.id);
      setLikeState(s => ({ ...s, [current.id]: { liked: data.has_liked, count: data.like_count } }));
    } catch {
      setLikeState(s => ({ ...s, [current.id]: prev })); // revert
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || replySending || !current) return;
    setReplySending(true);
    try {
      await sendLobbyChatMessage(feedUser.user_id, replyText.trim());
      setShowReply(false);
      setReplyText('');
    } catch {
      // fail silently — DM send errors are toast'd by the api interceptor
    } finally {
      setReplySending(false);
    }
  };

  if (!current) return null;

  const bgStyle = current.status_type === 'text'
    ? { background: current.bg_color || '#7c3aed' }
    : {};

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
      onMouseDown={handlePause}
      onMouseUp={handleResume}
      onTouchStart={handlePause}
      onTouchEnd={handleResume}
    >
      {/* Progress bars */}
      <div className="absolute top-0 left-0 right-0 flex gap-1 px-2 pt-2 z-10">
        {statuses.map((_, i) => (
          <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-none"
              style={{ width: i < idx ? '100%' : i === idx ? `${progress}%` : '0%' }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-5 left-0 right-0 px-3 flex items-center gap-2 z-10 pt-2">
        <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white flex-shrink-0">
          {feedUser.avatar_url ? (
            <img src={feedUser.avatar_url} alt={feedUser.username} className="w-full h-full object-cover"
              onError={e => { e.target.src = '/icons/user1avatar.svg'; }} />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">{feedUser.username?.[0]?.toUpperCase()}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm leading-none">@{feedUser.username}</p>
          <p className="text-white/60 text-xs mt-0.5">{timeAgo(current.created_at)}</p>
        </div>
        {isOwnProfile && (
          <p className="text-white/50 text-xs">
            {current.view_count} {current.view_count === 1 ? 'view' : 'views'}
          </p>
        )}
        <button onClick={e => { e.stopPropagation(); onClose(); }}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/60 transition-colors text-xl leading-none flex-shrink-0">
          ×
        </button>
      </div>

      {/* Content */}
      <div className="w-full h-full flex items-center justify-center" style={bgStyle}>
        {current.status_type === 'image' && current.media_url && (
          <img src={current.media_url} alt="status" className="max-w-full max-h-full object-contain" />
        )}
        {(current.status_type === 'text' || current.status_type === 'session') && (
          <div className="px-8 text-center">
            {current.status_type === 'session' && (
              <div className="mb-4 flex flex-col items-center gap-2">
                <span className="text-4xl">📺</span>
                <span className="text-white/80 text-sm font-medium">{current.room_name}</span>
              </div>
            )}
            <p className="text-white text-2xl font-bold leading-tight break-words drop-shadow-lg">
              {current.text_content}
            </p>
            {current.status_type === 'session' && current.room_id && (
              <button
                onClick={() => { onClose(); navigate(`/rooms/${current.room_id}`); }}
                className="mt-6 bg-white/20 backdrop-blur-sm border border-white/30 hover:bg-white/30 text-white font-semibold px-6 py-2.5 rounded-full transition-all"
              >
                Watch Together →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom action bar — like + reply (others) OR delete (own) */}
      <div className="absolute bottom-8 left-0 right-0 px-6 flex items-center justify-center gap-4 z-20">
        {isOwnProfile ? (
          <button
            onClick={e => { e.stopPropagation(); handleDelete(); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-black/50 backdrop-blur-sm border border-red-500/40 text-red-400 hover:text-red-300 hover:bg-red-900/40 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        ) : (
          <>
            {/* Like */}
            <button
              onClick={handleLike}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full backdrop-blur-sm border transition-colors text-sm font-medium ${
                currentLike.liked
                  ? 'bg-pink-600/50 border-pink-500/60 text-pink-200'
                  : 'bg-black/50 border-white/20 text-white/80 hover:bg-white/10'
              }`}
            >
              <svg className="w-5 h-5" fill={currentLike.liked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={currentLike.liked ? 0 : 2}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              {currentLike.count > 0 && <span>{currentLike.count}</span>}
            </button>

            {/* Reply — opens DM input */}
            <button
              onClick={e => { e.stopPropagation(); setShowReply(true); }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 text-white/80 hover:bg-white/10 transition-colors text-sm font-medium"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Reply
            </button>
          </>
        )}
      </div>

      {/* Reply slide-up sheet */}
      {showReply && (
        <div
          className="absolute inset-0 z-30 flex items-end"
          onClick={e => { if (e.target === e.currentTarget) setShowReply(false); }}
        >
          <div className="w-full bg-gray-900/95 backdrop-blur-md border-t border-gray-700 rounded-t-2xl px-4 pt-4 pb-6"
            onClick={e => e.stopPropagation()}>
            <p className="text-white/60 text-xs mb-3">
              Replying to <span className="text-white font-medium">@{feedUser.username}</span> via DM
            </p>
            <div className="flex items-end gap-2">
              <textarea
                ref={replyInputRef}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                placeholder="Send a message..."
                rows={2}
                className="flex-1 bg-gray-800 text-white placeholder-gray-500 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                onClick={handleSendReply}
                disabled={!replyText.trim() || replySending}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <button onClick={() => setShowReply(false)}
              className="mt-3 w-full text-center text-gray-500 text-xs py-1">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tap zones (hidden when reply sheet is open) */}
      {!showReply && (
        <>
          <button onClick={goBack} className="absolute left-0 top-0 bottom-0 w-1/3 z-10" aria-label="previous" />
          <button onClick={goForward} className="absolute right-0 top-0 bottom-0 w-1/3 z-10" aria-label="next" />
        </>
      )}
    </div>
  );
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
