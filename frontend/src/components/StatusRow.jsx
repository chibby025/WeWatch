import React from 'react';

export default function StatusRow({ feed = [], currentUser, onView, onAdd }) {
  const ownEntry = feed.find(f => f.user_id === currentUser?.id);
  const others   = feed.filter(f => f.user_id !== currentUser?.id);

  return (
    <div className="flex items-center py-1">
      {/* Scrollable bubbles */}
      <div
        className="flex items-center gap-2.5 px-3 overflow-x-auto flex-1"
        style={{ scrollbarWidth: 'none' }}
      >
        {/* Own bubble */}
        <button
          onClick={() => ownEntry ? onView(ownEntry) : onAdd()}
          className="flex flex-col items-center gap-0.5 flex-shrink-0"
        >
          <div className="relative">
            <div className={`w-16 h-16 rounded-full overflow-hidden border-2 ${
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
                <span className="text-white text-sm font-bold">
                  {currentUser?.username?.[0]?.toUpperCase() || 'Y'}
                </span>
              )}
            </div>
            {!ownEntry && (
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-purple-600 rounded-full border-2 border-gray-900 flex items-center justify-center">
                <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                </svg>
              </div>
            )}
          </div>
          <span className="text-[10px] text-gray-400 whitespace-nowrap">
            {ownEntry ? 'Your status' : 'Add status'}
          </span>
        </button>

        {/* Friends' bubbles */}
        {others.map(entry => (
          <button
            key={entry.user_id}
            onClick={() => onView(entry)}
            className="flex flex-col items-center gap-0.5 flex-shrink-0"
          >
            <div className={`w-16 h-16 rounded-full p-0.5 ${
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
                    <span className="text-white text-sm font-bold">
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
