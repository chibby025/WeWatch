// WeWatch/frontend/src/components/lobby/LobbyMessageBubble.jsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PencilIcon, TrashIcon, PlayIcon, PauseIcon, CheckIcon,
  PhoneXMarkIcon, PhoneIcon,
  DocumentDuplicateIcon, BookmarkIcon,
} from '@heroicons/react/24/solid';
import { ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import { toggleRoomFavourite, joinRoom } from '../../services/api';
import TwemojiText from '../TwemojiText';

const LobbyMessageBubble = ({
  message,
  isOwn,
  currentUser,
  onEdit,
  onDelete,
  onVotePoll,
  onViewUser,
  onReply,
  liveRooms = [],
  endedSessionIds = new Set(),
}) => {
  const navigate = useNavigate();
  const [isSelected, setIsSelected] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(message.message || '');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [copied, setCopied] = useState(false);
  // WatchOut card action state
  const [isFav, setIsFav] = useState(false);
  const [favLoading, setFavLoading] = useState(false);
  const [joinStatus, setJoinStatus] = useState(null); // null | 'active' | 'pending'
  const [joinLoading, setJoinLoading] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartXRef = useRef(null);
  const touchStartYRef = useRef(null);
  const isSwipingRef = useRef(false);
  const swipeLockedRef = useRef(false);
  const audioRef = useRef(null);
  const bubbleRef = useRef(null);
  const longPressTimerRef = useRef(null);

  const messageType = message.message_type || 'text';
  const metadata = message.metadata ? JSON.parse(message.metadata) : {};

  // Close selection on outside click
  useEffect(() => {
    const handler = (e) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target)) {
        setIsSelected(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Long-press + swipe-to-reply detection
  const handleTouchStart = (e) => {
    if (messageType === 'poll' || messageType === 'watch_out') return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    isSwipingRef.current = false;
    swipeLockedRef.current = false;
    longPressTimerRef.current = setTimeout(() => setIsSelected(true), 500);
  };
  const handleTouchMove = (e) => {
    if (touchStartXRef.current === null) return;
    const deltaX = e.touches[0].clientX - touchStartXRef.current;
    const deltaY = e.touches[0].clientY - touchStartYRef.current;
    const isHorizontalDominant = Math.abs(deltaX) > Math.abs(deltaY) * 1.5;
    if (Math.abs(deltaX) > 10) {
      clearTimeout(longPressTimerRef.current);
      isSwipingRef.current = true;
    }
    // Only track as swipe-to-reply if the gesture is clearly horizontal
    if (deltaX > 0 && isHorizontalDominant) {
      swipeLockedRef.current = true;
      setSwipeOffset(Math.min(deltaX, 70));
    } else if (!swipeLockedRef.current) {
      setSwipeOffset(0);
    }
  };
  const handleTouchEnd = () => {
    clearTimeout(longPressTimerRef.current);
    if (isSwipingRef.current && swipeLockedRef.current && swipeOffset >= 52 && onReply) {
      onReply(message);
    }
    setSwipeOffset(0);
    isSwipingRef.current = false;
    touchStartXRef.current = null;
  };

  const handleBubbleClick = (e) => {
    if (messageType === 'poll' || messageType === 'watch_out' || messageType === 'system_call') return;
    e.stopPropagation();
    setIsSelected(s => !s);
  };

  // Audio player controls
  const togglePlayPause = (e) => {
    e.stopPropagation();
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };

  const handleSeek = (e) => {
    e.stopPropagation();
    const seekTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = seekTime;
      setCurrentTime(seekTime);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleEditSubmit = () => {
    if (editedText.trim() && editedText !== message.message) onEdit(message.id, editedText);
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (window.confirm('Delete this message?')) onDelete(message.id);
    setIsSelected(false);
  };

  const handleCopy = async () => {
    if (message.message) {
      await navigator.clipboard.writeText(message.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
    setIsSelected(false);
  };

  const handleVote = (optionIndex) => onVotePoll(message.id, optionIndex);

  const getUserVote = () => {
    if (!metadata.votes) return null;
    for (const [optionIndex, voters] of Object.entries(metadata.votes)) {
      if (voters.includes(currentUser?.id)) return parseInt(optionIndex);
    }
    return null;
  };

  const formatMessageTime = (ts) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const canEditMsg = isOwn && messageType === 'text' &&
    (Date.now() - new Date(message.created_at).getTime()) < 5 * 60 * 1000;

  // Context menu — floating pill above or below the bubble
  const ContextMenu = () => (
    <div
      className={`absolute z-50 flex items-center gap-0.5 bg-gray-900 dark:bg-gray-700 rounded-full px-1.5 py-1 shadow-2xl
        ${isOwn ? 'right-0' : 'left-0'}
        bottom-full mb-1.5
        animate-[fadeScaleIn_0.15s_ease-out]`}
      onClick={e => e.stopPropagation()}
    >
      {/* Copy */}
      {(messageType === 'text' || messageType === 'link') && (
        <button
          onClick={handleCopy}
          title={copied ? 'Copied!' : 'Copy'}
          className="p-1.5 text-white hover:text-green-300 active:scale-90 transition-all"
        >
          {copied
            ? <CheckIcon className="w-4 h-4 text-green-400" />
            : <DocumentDuplicateIcon className="w-4 h-4" />}
        </button>
      )}
      {/* Edit — own text only, within 5 minutes */}
      {canEditMsg && (
        <button
          onClick={() => { setIsEditing(true); setIsSelected(false); }}
          title="Edit"
          className="p-1.5 text-white hover:text-blue-300 active:scale-90 transition-all"
        >
          <PencilIcon className="w-4 h-4" />
        </button>
      )}
      {/* Delete — own messages */}
      {isOwn && (
        <button
          onClick={handleDelete}
          title="Delete"
          className="p-1.5 text-white hover:text-red-400 active:scale-90 transition-all"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      )}
      {/* Reply */}
      {onReply && (
        <button
          onClick={() => { onReply(message); setIsSelected(false); }}
          title="Reply"
          className="p-1.5 text-white hover:text-purple-300 active:scale-90 transition-all"
        >
          <ArrowUturnLeftIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  return (
    <div
      className={`flex items-center ${messageType === 'system_call' ? 'justify-center' : isOwn ? 'justify-end' : 'justify-start'}`}
      style={{
        transform: `translateX(${swipeOffset}px)`,
        transition: swipeOffset === 0 ? 'transform 0.2s ease-out' : 'none',
      }}
    >
      {/* Reply arrow — visible while swiping (left side for received, fades in) */}
      {!isOwn && swipeOffset > 15 && (
        <div className="mr-1 flex-shrink-0" style={{ opacity: Math.min(swipeOffset / 52, 1) }}>
          <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6M3 10l6-6" />
          </svg>
        </div>
      )}
      <div
        ref={bubbleRef}
        onClick={handleBubbleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onContextMenu={e => { e.preventDefault(); if (messageType !== 'poll' && messageType !== 'watch_out') setIsSelected(s => !s); }}
        className={`relative max-w-[75%] sm:max-w-md rounded-lg shadow-md select-none
          transition-all duration-150 ${isSelected ? 'scale-[0.97] opacity-90' : ''}
          ${messageType === 'watch_out'
            ? 'bg-transparent shadow-none'
            : messageType === 'system_call'
            ? 'bg-gray-100 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700'
            : isOwn
            ? 'bg-green-600 text-white'
            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
          }`}
      >
        {/* Reply quote block */}
        {message.reply_to_snap && (
          <div className={`mx-2 mt-2 px-2 py-1 rounded border-l-2 border-purple-400 text-xs line-clamp-2 ${isOwn ? 'bg-green-700/50 text-green-100' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
            {message.reply_to_snap}
          </div>
        )}

        {/* Floating context menu */}
        {isSelected && <ContextMenu />}

        {/* ── SYSTEM CALL ── */}
        {messageType === 'system_call' && (
          <div className="px-3 py-2 sm:px-4 sm:py-2.5 flex items-center gap-2 justify-center">
            {message.message.toLowerCase().includes('missed') ? (
              <PhoneXMarkIcon className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 flex-shrink-0" />
            ) : message.message.toLowerCase().includes('declined') ? (
              <PhoneXMarkIcon className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 flex-shrink-0" />
            ) : (
              <PhoneIcon className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 flex-shrink-0" />
            )}
            <p className="text-xs sm:text-sm font-medium text-center">
              {message.message.replace(/^\s*📞\s*/g, '')}
            </p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 flex-shrink-0">
              {formatMessageTime(message.created_at)}
            </p>
          </div>
        )}

        {/* ── TEXT ── */}
        {messageType === 'text' && (
          <div className="px-3 pt-2 pb-1.5 sm:px-4 sm:pt-2.5 sm:pb-2">
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  className="w-full px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                  rows="3"
                  autoFocus
                  onClick={e => e.stopPropagation()}
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsEditing(false); }}
                    className="px-3 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors active:scale-90"
                  >Cancel</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEditSubmit(); }}
                    className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors active:scale-90"
                  >Save</button>
                </div>
              </div>
            ) : (
              <>
                <TwemojiText as="p" className="text-xs sm:text-sm break-words whitespace-pre-wrap text-left">{message.message}</TwemojiText>
                {message.edited && (
                  <p className={`text-[10px] italic mt-0.5 ${isOwn ? 'text-green-100' : 'text-gray-500 dark:text-gray-400'}`}>(edited)</p>
                )}
                <p className={`text-[10px] mt-1 text-right ${isOwn ? 'text-green-100' : 'text-gray-400 dark:text-gray-500'}`}>
                  {formatMessageTime(message.created_at)}
                </p>
              </>
            )}
          </div>
        )}

        {/* ── VOICE NOTE ── */}
        {messageType === 'voice_note' && (
          <div className="px-3 py-2 sm:px-4 sm:py-3">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlayPause}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                  isOwn ? 'bg-white/20 hover:bg-white/30' : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {isPlaying
                  ? <PauseIcon className="w-5 h-5 text-white" />
                  : <PlayIcon className="w-5 h-5 text-white ml-0.5" />}
              </button>
              <div className="flex-1">
                <input
                  type="range" min="0" max={duration || 0} value={currentTime}
                  onChange={handleSeek} onClick={e => e.stopPropagation()}
                  className="w-full h-2 bg-white/30 rounded-lg appearance-none cursor-pointer"
                  style={{ background: `linear-gradient(to right, ${isOwn ? '#fff' : '#16a34a'} 0%, ${isOwn ? '#fff' : '#16a34a'} ${(currentTime / duration) * 100}%, ${isOwn ? 'rgba(255,255,255,0.3)' : 'rgba(209,213,219,0.3)'} ${(currentTime / duration) * 100}%, ${isOwn ? 'rgba(255,255,255,0.3)' : 'rgba(209,213,219,0.3)'} 100%)` }}
                />
                <div className="flex justify-between text-[10px] mt-1">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
              <audio ref={audioRef} src={message.attachment_url} onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata} onEnded={() => setIsPlaying(false)} />
            </div>
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs opacity-75">🎤 Voice message</p>
              <p className={`text-[10px] ${isOwn ? 'text-green-100' : 'text-gray-400 dark:text-gray-500'}`}>{formatMessageTime(message.created_at)}</p>
            </div>
          </div>
        )}

        {/* ── IMAGE ── */}
        {messageType === 'image' && (
          <div>
            <img
              src={message.attachment_url}
              alt="Shared image"
              className="w-full max-h-80 object-cover rounded-t-lg cursor-pointer hover:opacity-90 transition-opacity"
              onClick={(e) => { e.stopPropagation(); window.open(message.attachment_url, '_blank'); }}
            />
            <div className="flex items-center justify-between px-3 py-1.5 sm:px-4 sm:py-2">
              <p className="text-xs">📷 Photo</p>
              <p className={`text-[10px] ${isOwn ? 'text-green-100' : 'text-gray-400 dark:text-gray-500'}`}>{formatMessageTime(message.created_at)}</p>
            </div>
          </div>
        )}

        {/* ── VIDEO ── */}
        {messageType === 'video' && (
          <div>
            <video src={message.attachment_url} controls className="w-full max-h-80 rounded-t-lg" onClick={e => e.stopPropagation()} />
            <div className="flex items-center justify-between px-3 py-1.5 sm:px-4 sm:py-2">
              <p className="text-xs">🎥 Video</p>
              <p className={`text-[10px] ${isOwn ? 'text-green-100' : 'text-gray-400 dark:text-gray-500'}`}>{formatMessageTime(message.created_at)}</p>
            </div>
          </div>
        )}

        {/* ── DOCUMENT ── */}
        {messageType === 'document' && (
          <div className="px-3 py-2 sm:px-4 sm:py-3">
            <a
              href={message.attachment_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-3 hover:opacity-80 transition-opacity ${isOwn ? 'text-white' : 'text-gray-900 dark:text-white'}`}
              onClick={e => e.stopPropagation()}
            >
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${isOwn ? 'bg-white/20' : 'bg-blue-100 dark:bg-blue-900'}`}>
                <span className="text-2xl">📄</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{message.attachment_name}</p>
                <p className={`text-xs ${isOwn ? 'text-green-100' : 'text-gray-500 dark:text-gray-400'}`}>
                  {message.attachment_size ? `${(message.attachment_size / 1024 / 1024).toFixed(2)} MB` : 'Document'}
                </p>
              </div>
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </a>
            <p className={`text-[10px] mt-1 text-right ${isOwn ? 'text-green-100' : 'text-gray-400 dark:text-gray-500'}`}>{formatMessageTime(message.created_at)}</p>
          </div>
        )}

        {/* ── STICKER ── */}
        {messageType === 'sticker' && (
          <div className="p-2">
            {metadata.provider === 'emoji' ? (
              <div className="text-7xl select-none">{message.attachment_url}</div>
            ) : (
              <img src={message.attachment_url} alt="Sticker" className="w-32 h-32 sm:w-40 sm:h-40 object-contain" />
            )}
            <p className={`text-[10px] text-right mt-1 px-1 ${isOwn ? 'text-green-100' : 'text-gray-400 dark:text-gray-500'}`}>{formatMessageTime(message.created_at)}</p>
          </div>
        )}

        {/* ── POLL ── */}
        {messageType === 'poll' && (
          <div className="px-3 py-2 sm:px-4 sm:py-3">
            <div className="mb-3">
              <p className="text-sm font-semibold mb-1">📊 {metadata.question}</p>
              <p className={`text-xs ${isOwn ? 'text-green-100' : 'text-gray-500 dark:text-gray-400'}`}>
                {metadata.total_votes || 0} vote{metadata.total_votes !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="space-y-2">
              {metadata.options?.map((option, index) => {
                const voteCount = metadata.votes?.[index]?.length || 0;
                const percentage = metadata.total_votes > 0 ? (voteCount / metadata.total_votes) * 100 : 0;
                const userVote = getUserVote();
                const hasVoted = userVote !== null;
                const isVotedOption = userVote === index;
                return (
                  <button
                    key={index}
                    onClick={(e) => { e.stopPropagation(); !hasVoted && handleVote(index); }}
                    disabled={hasVoted}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-all relative overflow-hidden ${
                      hasVoted
                        ? isVotedOption ? isOwn ? 'bg-white/30 cursor-default' : 'bg-green-100 dark:bg-green-900 cursor-default' : isOwn ? 'bg-white/10 cursor-default' : 'bg-gray-100 dark:bg-gray-700 cursor-default'
                        : isOwn ? 'bg-white/20 hover:bg-white/30' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    {hasVoted && (
                      <div
                        className={`absolute inset-0 ${isVotedOption ? isOwn ? 'bg-white/20' : 'bg-green-200 dark:bg-green-800' : isOwn ? 'bg-white/10' : 'bg-gray-300 dark:bg-gray-600'}`}
                        style={{ width: `${percentage}%` }}
                      />
                    )}
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{option}</span>
                        {isVotedOption && <CheckIcon className="w-4 h-4 text-green-600" />}
                      </div>
                      {hasVoted && <span className="text-xs font-medium">{percentage.toFixed(0)}% ({voteCount})</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className={`text-[10px] text-right mt-2 ${isOwn ? 'text-green-100' : 'text-gray-400 dark:text-gray-500'}`}>{formatMessageTime(message.created_at)}</p>
          </div>
        )}

        {/* ── WATCH OUT ── */}
        {messageType === 'watch_out' && (() => {
          const RATING_ICONS = {
            'G': '/icons/G Rating Icon.webp',
            'PG': '/icons/PG Rating Icon.webp',
            'Educational': '/icons/Educational_Rating_Icon.webp',
            'Religious': '/icons/Religious Rating.webp',
            '13+': '/icons/13_ Rating Icon.webp',
            '16+': '/icons/16_ Rating Icon.webp',
            '18+': '/icons/18_ Rating Icon.webp',
            'Mature': '/icons/Mature Rating Icon.webp',
          };
          const WATCH_EMOJI = { video: '🎬', '3d_cinema': '🎭', classroom: '📚', podcast: '🎙️', livestream: '📡' };

          const isPrivate = metadata.is_private_watchout === true;
          const isEnded = isPrivate
            ? endedSessionIds.has(metadata.session_id)
            : !liveRooms.some(r => r.room_id === metadata.room_id);
          const ratingIcon = RATING_ICONS[metadata.content_rating] || null;
          const watchEmoji = WATCH_EMOJI[metadata.watch_type] || '📺';

          // Extract host name: "WatchOut – chibi" or "Circle – chibi" → "WatchOut with chibi"
          const hostName = (metadata.room_name || '').replace(/^(WatchOut|Circle)\s*[–\-]\s*/, '');
          const displayTitle = `WatchOut with ${hostName}`;

          return (
            <div className="py-1 px-0.5">
              <div
                className={`rounded-2xl overflow-hidden border transition-all ${isEnded ? 'border-white/5 opacity-55 grayscale' : 'border-purple-500/25'}`}
                style={{ background: 'linear-gradient(145deg, #1e1040 0%, #0f172a 55%, #1e1b4b 100%)' }}
              >
                {/* Single flat row — W icon · title · rating img · live dot */}
                <div className="px-3 py-3 flex items-center gap-2">
                  <img src="/icons/lwoIcon.webp" alt="W" className="w-10 h-10 object-contain flex-shrink-0" />

                  <p className="text-sm font-bold text-white flex-1 min-w-0 truncate">{displayTitle}</p>

                  {ratingIcon && (
                    <img src={ratingIcon} alt={metadata.content_rating}
                      className="w-10 h-10 object-contain flex-shrink-0 rounded" />
                  )}

                  {isEnded ? (
                    <span className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold text-gray-400 uppercase tracking-wider"
                      style={{ background: 'rgba(75,85,99,0.4)', borderColor: 'rgba(107,114,128,0.3)' }}>
                      Ended
                    </span>
                  ) : !isPrivate && (
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse flex-shrink-0" />
                  )}
                </div>

                {/* CTA or ended */}
                {isEnded ? (
                  <div className="py-3 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <span className="text-xs text-gray-500">⭕ Session has ended</span>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/rooms/${metadata.room_id}`); }}
                    className="w-full py-2.5 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90 active:opacity-75"
                    style={{ background: 'linear-gradient(90deg, #7c3aed 0%, #4f46e5 100%)' }}
                  >
                    <span className="text-sm leading-none">{watchEmoji}</span>
                    {isPrivate ? 'Join Watch Session →' : 'Watch Now →'}
                  </button>
                )}
              </div>

              <p className={`text-[10px] mt-1 text-gray-500 ${isOwn ? 'text-right' : 'text-left'}`}>
                {formatMessageTime(message.created_at)}
              </p>
            </div>
          );
        })()}

        {/* ── LINK ── */}
        {messageType === 'link' && (
          <div className="px-3 py-2 sm:px-4 sm:py-2.5">
            <a href={message.message} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs sm:text-sm underline break-all hover:opacity-80 transition-opacity">{message.message}</a>
            <p className={`text-[10px] text-right mt-1 ${isOwn ? 'text-green-100' : 'text-gray-400 dark:text-gray-500'}`}>{formatMessageTime(message.created_at)}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LobbyMessageBubble;
