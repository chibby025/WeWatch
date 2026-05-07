// WeWatch/frontend/src/components/lobby/LobbyMessageBubble.jsx
import React, { useState, useRef, useEffect } from 'react';
import { EllipsisVerticalIcon, PencilIcon, TrashIcon, PlayIcon, PauseIcon, CheckIcon, PhoneIcon, PhoneArrowUpRightIcon, PhoneArrowDownLeftIcon, PhoneXMarkIcon } from '@heroicons/react/24/solid';

const LobbyMessageBubble = ({ 
  message, 
  isOwn, 
  currentUser,
  onEdit,
  onDelete,
  onVotePoll 
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(message.message || '');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);
  const menuRef = useRef(null);
  const mediaMenuRef = useRef(null);

  const messageType = message.message_type || 'text';
  const metadata = message.metadata ? JSON.parse(message.metadata) : {};

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
      if (mediaMenuRef.current && !mediaMenuRef.current.contains(event.target)) {
        setShowMediaMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Audio player controls
  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e) => {
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

  // Handle edit submission
  const handleEditSubmit = () => {
    if (editedText.trim() && editedText !== message.message) {
      onEdit(message.id, editedText);
    }
    setIsEditing(false);
  };

  // Handle delete
  const handleDelete = () => {
    if (window.confirm('Delete this message?')) {
      onDelete(message.id);
    }
    setShowMenu(false);
  };

  // Handle poll voting
  const handleVote = (optionIndex) => {
    onVotePoll(message.id, optionIndex);
  };

  // Check if current user has voted on poll
  const getUserVote = () => {
    if (!metadata.votes) return null;
    for (const [optionIndex, voters] of Object.entries(metadata.votes)) {
      if (voters.includes(currentUser?.id)) {
        return parseInt(optionIndex);
      }
    }
    return null;
  };

  return (
    <div className={`flex ${messageType === 'system_call' ? 'justify-center' : isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] sm:max-w-md rounded-lg shadow-md ${
          messageType === 'system_call'
            ? 'bg-gray-100 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700'
            : isOwn
            ? 'bg-green-600 text-white'
            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
        }`}
      >
        {/* Message Type: SYSTEM CALL (Missed/Declined/Completed Calls) */}
        {messageType === 'system_call' && (
          <div className="px-3 py-2 sm:px-4 sm:py-2.5 flex items-center gap-2 justify-center">
            {/* Call Icon */}
            {message.message.toLowerCase().includes('missed') ? (
              <PhoneXMarkIcon className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
            ) : message.message.toLowerCase().includes('declined') ? (
              <PhoneXMarkIcon className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
            ) : (
              <PhoneIcon className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
            )}
            
            {/* Call Message */}
            <p className="text-xs sm:text-sm font-medium text-center">
              {message.message}
            </p>
            
            {/* Timestamp */}
            <p className="text-[10px] text-gray-500 dark:text-gray-400">
              {new Date(message.created_at).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              })}
            </p>
          </div>
        )}

        {/* Message Type: TEXT */}
        {messageType === 'text' && (
          <div className="px-3 py-1.5 sm:px-4 sm:py-2">
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  className="w-full px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                  rows="3"
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEditSubmit}
                    className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs sm:text-sm break-words whitespace-pre-wrap">{message.message}</p>
                {message.edited && (
                  <p className={`text-[10px] italic mt-1 ${isOwn ? 'text-green-100' : 'text-gray-500 dark:text-gray-400'}`}>
                    (edited)
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Message Type: VOICE NOTE */}
        {messageType === 'voice_note' && (
          <div className="px-3 py-2 sm:px-4 sm:py-3 relative group">
            <div className="flex items-center gap-2">
              {/* Play/Pause Button */}
              <button
                onClick={togglePlayPause}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  isOwn ? 'bg-white/20 hover:bg-white/30' : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {isPlaying ? (
                  <PauseIcon className="w-5 h-5 text-white" />
                ) : (
                  <PlayIcon className="w-5 h-5 text-white ml-0.5" />
                )}
              </button>

              {/* Waveform / Progress Bar */}
              <div className="flex-1">
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-2 bg-white/30 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${isOwn ? '#fff' : '#16a34a'} 0%, ${isOwn ? '#fff' : '#16a34a'} ${(currentTime / duration) * 100}%, ${isOwn ? 'rgba(255,255,255,0.3)' : 'rgba(209,213,219,0.3)'} ${(currentTime / duration) * 100}%, ${isOwn ? 'rgba(255,255,255,0.3)' : 'rgba(209,213,219,0.3)'} 100%)`
                  }}
                />
                <div className="flex justify-between text-[10px] mt-1">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Hidden Audio Element */}
              <audio
                ref={audioRef}
                src={message.attachment_url}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setIsPlaying(false)}
              />
            </div>
            <p className="text-xs mt-2 opacity-75">🎤 Voice message</p>
            {isOwn && (
              <div className="absolute top-2 right-2" ref={mediaMenuRef}>
                <button
                  onClick={() => setShowMediaMenu(!showMediaMenu)}
                  className={`p-1 rounded-full transition-colors opacity-0 group-hover:opacity-100 ${
                    isOwn ? 'hover:bg-white/20' : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <EllipsisVerticalIcon className="w-4 h-4" />
                </button>
                {showMediaMenu && (
                  <div className="absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 shadow-lg rounded-lg w-32 py-1 z-50 border border-gray-200 dark:border-gray-700">
                    <button
                      onClick={handleDelete}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm"
                    >
                      <TrashIcon className="w-4 h-4 text-red-500" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Message Type: IMAGE */}
        {messageType === 'image' && (
          <div className="relative group">
            <img
              src={message.attachment_url}
              alt="Shared image"
              className="w-full max-h-80 object-cover rounded-t-lg cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => window.open(message.attachment_url, '_blank')}
            />
            {isOwn && (
              <div className="absolute top-2 right-2" ref={mediaMenuRef}>
                <button
                  onClick={() => setShowMediaMenu(!showMediaMenu)}
                  className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <EllipsisVerticalIcon className="w-4 h-4 text-white" />
                </button>
                {showMediaMenu && (
                  <div className="absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 shadow-lg rounded-lg w-32 py-1 z-50 border border-gray-200 dark:border-gray-700">
                    <button
                      onClick={handleDelete}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm"
                    >
                      <TrashIcon className="w-4 h-4 text-red-500" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="px-3 py-1.5 sm:px-4 sm:py-2">
              <p className="text-xs sm:text-sm">📷 Photo</p>
            </div>
          </div>
        )}

        {/* Message Type: VIDEO */}
        {messageType === 'video' && (
          <div className="relative group">
            <video
              src={message.attachment_url}
              controls
              className="w-full max-h-80 rounded-t-lg"
            />
            {isOwn && (
              <div className="absolute top-2 right-2" ref={mediaMenuRef}>
                <button
                  onClick={() => setShowMediaMenu(!showMediaMenu)}
                  className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <EllipsisVerticalIcon className="w-4 h-4 text-white" />
                </button>
                {showMediaMenu && (
                  <div className="absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 shadow-lg rounded-lg w-32 py-1 z-50 border border-gray-200 dark:border-gray-700">
                    <button
                      onClick={handleDelete}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm"
                    >
                      <TrashIcon className="w-4 h-4 text-red-500" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="px-3 py-1.5 sm:px-4 sm:py-2">
              <p className="text-xs sm:text-sm">🎥 Video</p>
            </div>
          </div>
        )}

        {/* Message Type: DOCUMENT */}
        {messageType === 'document' && (
          <div className="px-3 py-2 sm:px-4 sm:py-3 relative group">
            <a
              href={message.attachment_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-3 hover:opacity-80 transition-opacity ${
                isOwn ? 'text-white' : 'text-gray-900 dark:text-white'
              }`}
            >
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                isOwn ? 'bg-white/20' : 'bg-blue-100 dark:bg-blue-900'
              }`}>
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
            {isOwn && (
              <div className="absolute top-2 right-2" ref={mediaMenuRef}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMediaMenu(!showMediaMenu);
                  }}
                  className={`p-1 rounded-full transition-colors opacity-0 group-hover:opacity-100 ${
                    isOwn ? 'hover:bg-white/20' : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <EllipsisVerticalIcon className="w-4 h-4" />
                </button>
                {showMediaMenu && (
                  <div className="absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 shadow-lg rounded-lg w-32 py-1 z-50 border border-gray-200 dark:border-gray-700">
                    <button
                      onClick={handleDelete}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm"
                    >
                      <TrashIcon className="w-4 h-4 text-red-500" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Message Type: STICKER */}
        {messageType === 'sticker' && (
          <div className="p-2">
            {metadata.provider === 'custom' ? (
              /* Custom Emoji - Large Display */
              <div className="text-7xl select-none">
                {message.attachment_url}
              </div>
            ) : (
              /* Giphy/Tenor GIF */
              <img
                src={message.attachment_url}
                alt="Sticker"
                className="w-32 h-32 sm:w-40 sm:h-40 object-contain"
              />
            )}
          </div>
        )}

        {/* Message Type: POLL */}
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
                    onClick={() => !hasVoted && handleVote(index)}
                    disabled={hasVoted}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-all relative overflow-hidden ${
                      hasVoted
                        ? isVotedOption
                          ? isOwn ? 'bg-white/30 cursor-default' : 'bg-green-100 dark:bg-green-900 cursor-default'
                          : isOwn ? 'bg-white/10 cursor-default' : 'bg-gray-100 dark:bg-gray-700 cursor-default'
                        : isOwn ? 'bg-white/20 hover:bg-white/30' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    {/* Progress Bar Background */}
                    {hasVoted && (
                      <div
                        className={`absolute inset-0 ${
                          isVotedOption
                            ? isOwn ? 'bg-white/20' : 'bg-green-200 dark:bg-green-800'
                            : isOwn ? 'bg-white/10' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    )}

                    {/* Option Content */}
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{option}</span>
                        {isVotedOption && <CheckIcon className="w-4 h-4 text-green-600" />}
                      </div>
                      {hasVoted && (
                        <span className="text-xs font-medium">
                          {percentage.toFixed(0)}% ({voteCount})
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Message Type: LINK (Future) */}
        {messageType === 'link' && (
          <div className="px-3 py-1.5 sm:px-4 sm:py-2">
            <a
              href={message.message}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs sm:text-sm underline break-all hover:opacity-80 transition-opacity"
            >
              {message.message}
            </a>
          </div>
        )}

        {/* Timestamp & Actions */}
        {!isEditing && (
          <div className="px-3 pb-1.5 sm:px-4 sm:pb-2 flex items-center justify-between gap-2">
            <p className={`text-[10px] sm:text-xs ${
              isOwn ? 'text-green-100' : 'text-gray-500 dark:text-gray-400'
            }`}>
              {new Date(message.created_at).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
              })}
            </p>

            {/* Actions Menu (only for own messages and text type) */}
            {isOwn && messageType === 'text' && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className={`p-1 rounded-full transition-colors ${
                    isOwn ? 'hover:bg-white/20' : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <EllipsisVerticalIcon className="w-4 h-4" />
                </button>

                {showMenu && (
                  <div className="absolute bottom-full right-0 mb-1 bg-white dark:bg-gray-800 shadow-lg rounded-lg w-32 py-1 z-50 border border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => {
                        setIsEditing(true);
                        setShowMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm"
                    >
                      <PencilIcon className="w-4 h-4 text-blue-500" />
                      Edit
                    </button>
                    <button
                      onClick={handleDelete}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm"
                    >
                      <TrashIcon className="w-4 h-4 text-red-500" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LobbyMessageBubble;
