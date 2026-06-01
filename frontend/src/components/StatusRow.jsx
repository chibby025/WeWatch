import React from 'react';

// Horizontal strip of story bubbles shown at the top of the Chats tab.
// Props:
//   feed           – array of StatusFeedUser from GET /api/statuses/feed
//   currentUser    – the logged-in user object
//   onView         – fn(feedUser) opens StatusViewer for that user's statuses
//   onAdd          – fn() opens StatusCreator
//   onPrivacy      – fn() opens StatusPrivacySheet
export default function StatusRow({ feed = [], currentUser, onView, onAdd, onPrivacy }) {
  const ownEntry = feed.find(f => f.user_id === currentUser?.id);
  const others   = feed.filter(f => f.user_id !== currentUser?.id);

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</span>
        <button
          onClick={onPrivacy}
          className="p-1 rounded-full hover:bg-white/10 transition-colors"
          title="Status privacy"
        >
          <svg className="w-4 h-4 text-gray-400 hover:text-white transition-colors" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </button>
      </div>

      {/* Bubbles strip */}
      <div
        className="flex items-center gap-3 px-3 pb-2 overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {/* Own bubble */}
        <button
          onClick={() => ownEntry ? onView(ownEntry) : onAdd()}
          className="flex flex-col items-center gap-1 flex-shrink-0 group"
        >
          <div className="relative">
            <div className={`w-14 h-14 rounded-full overflow-hidden border-2 ${
              ownEntry ? 'border-purple-500' : 'border-dashed border-gray-500'
            } flex items-center justify-center bg-gray-800`}>
              {currentUser?.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt="you"
                  className="w-full h-full object-cover"
                  onError={e => { e.target.src = '/icons/user1avatar.svg'; }}
                />
              ) : (
                <span className="text-white text-lg font-bold">
                  {currentUser?.username?.[0]?.toUpperCase() || 'Y'}
                </span>
              )}
            </div>
            {!ownEntry && (
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-purple-600 rounded-full border-2 border-gray-900 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                </svg>
              </div>
            )}
          </div>
          <span className="text-[10px] text-gray-400 truncate max-w-[56px]">
            {ownEntry ? 'Your status' : 'Add status'}
          </span>
        </button>

        {/* Friends' bubbles */}
        {others.map(entry => (
          <button
            key={entry.user_id}
            onClick={() => onView(entry)}
            className="flex flex-col items-center gap-1 flex-shrink-0"
          >
            <div className={`w-14 h-14 rounded-full p-0.5 ${
              entry.has_unseen
                ? 'bg-gradient-to-tr from-purple-500 via-pink-500 to-orange-400'
                : 'bg-gray-600'
            }`}>
              <div className="w-full h-full rounded-full overflow-hidden bg-gray-900 border-2 border-gray-900">
                {entry.avatar_url ? (
                  <img
                    src={entry.avatar_url}
                    alt={entry.username}
                    className="w-full h-full object-cover"
                    onError={e => { e.target.src = '/icons/user1avatar.svg'; }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-600">
                    <span className="text-white text-lg font-bold">
                      {entry.username?.[0]?.toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <span className={`text-[10px] truncate max-w-[56px] ${
              entry.has_unseen ? 'text-white font-semibold' : 'text-gray-400'
            }`}>
              {entry.username}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
