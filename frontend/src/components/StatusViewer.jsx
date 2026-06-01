import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { markStatusViewed, deleteStatus } from '../services/api';

const DURATION_MS = 5000;

// Full-screen story viewer.
// Props:
//   feedUser   – StatusFeedUser object { user_id, username, avatar_url, statuses[] }
//   isOwnProfile – bool
//   onClose    – fn()
//   onDeleted  – fn(statusId)  called after own status deleted
export default function StatusViewer({ feedUser, isOwnProfile, onClose, onDeleted }) {
  const navigate = useNavigate();
  const [idx, setIdx]           = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused]     = useState(false);
  const intervalRef             = useRef(null);
  const startTimeRef            = useRef(null);
  const elapsedRef              = useRef(0);

  const statuses = feedUser?.statuses || [];
  const current  = statuses[idx];

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

  // Reset + start timer on slide change
  useEffect(() => {
    elapsedRef.current = 0;
    setProgress(0);
    if (!paused) startTimer();
    return () => clearInterval(intervalRef.current);
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark viewed
  useEffect(() => {
    if (!current) return;
    if (!current.has_viewed) {
      markStatusViewed(current.id).catch(() => {});
    }
  }, [current]);

  const handlePause = () => { setPaused(true); stopTimer(); };
  const handleResume = () => { setPaused(false); startTimer(); };

  const goBack = (e) => {
    e.stopPropagation();
    if (idx > 0) { elapsedRef.current = 0; setIdx(idx - 1); }
  };
  const goForward = (e) => {
    e.stopPropagation();
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
          <button onClick={handleDelete}
            className="text-white/70 hover:text-red-400 transition-colors p-1 mr-8">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
        {isOwnProfile && (
          <p className="text-white/50 text-xs absolute top-8 right-3">
            {current.view_count} {current.view_count === 1 ? 'view' : 'views'}
          </p>
        )}
        <button onClick={onClose}
          className="absolute top-0 right-2 text-white/70 hover:text-white text-2xl leading-none p-1">
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

      {/* Tap zones */}
      <button onClick={goBack} className="absolute left-0 top-0 bottom-0 w-1/3 z-10" aria-label="previous" />
      <button onClick={goForward} className="absolute right-0 top-0 bottom-0 w-1/3 z-10" aria-label="next" />
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
