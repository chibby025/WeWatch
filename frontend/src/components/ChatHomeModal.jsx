// frontend/src/components/ChatHomeModal.jsx
import React from 'react';
import Avatar from './Avatar';

export default function ChatHomeModal({
  currentUser,
  privateMessages = {}, // { userId: [messages] }
  roomMembers = [], // optional: for name/username lookup
  watchType = 'video', // 'video', '3d_cinema', 'classroom'
  unreadMessages = {}, // { userId: unreadCount }
  onClose,
  onOpenRoomChat,
  onOpenPrivateChat,
}) {
  // Determine chat label based on watch type
  const getChatLabel = () => {
    if (watchType === '3d_cinema') return 'Cinema Chat';
    if (watchType === 'classroom') return 'Class Chat';
    return 'Room Chat';
  };
  
  // ✅ Get unique user IDs from privateMessages (keep as strings for demo users)
  const recentChatUserIds = Object.keys(privateMessages)
    .filter(userId => userId !== 'undefined' && userId !== String(currentUser?.id));

  // ✅ Create a lookup map for member details (username, etc.)
  const memberMap = new Map();
  roomMembers.forEach(member => {
    memberMap.set(String(member.id), member); // Convert to string for consistent lookup
  });

  // ✅ Build list of recent chat partners with metadata
  const recentChats = recentChatUserIds.map(userId => {
    const member = memberMap.get(String(userId));
    const messages = privateMessages[userId] || [];
    const lastMessage = messages[messages.length - 1];
    
    return {
      id: userId,
      username: member?.username || `User ${userId}`,
      avatar_url: member?.avatar_url,
      unreadCount: unreadMessages[userId] || 0,
      lastMessage: lastMessage?.message || lastMessage?.Message || 'No messages yet',
      messageCount: messages.length,
    };
  });

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-gradient-to-br from-gray-900 via-black to-purple-900/30 rounded-2xl w-full mx-2 sm:mx-4 max-w-md shadow-2xl border border-purple-500/20">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 p-4 sm:p-5 rounded-t-2xl flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <img src="/icons/chathome.svg" alt="Chats" className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg sm:text-xl">Chats</h2>
              <p className="text-purple-200 text-xs">
                {recentChats.length} conversation{recentChats.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-white/80 hover:text-white hover:bg-white/10 rounded-full w-8 h-8 flex items-center justify-center transition-all text-2xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-2 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Room Chat */}
          <button
            onClick={onOpenRoomChat}
            className="w-full text-left px-3 sm:px-4 py-2 sm:py-3 rounded-xl bg-gradient-to-r from-blue-600/20 to-blue-800/20 hover:from-blue-600/30 hover:to-blue-800/30 border border-blue-500/30 flex items-center gap-3 sm:gap-4 text-white transition-all group"
          >
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg flex-shrink-0">
              <img src="/icons/chathome.svg" alt="Room Chat" className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white text-sm sm:text-base">{getChatLabel()}</div>
              <div className="text-xs sm:text-sm text-blue-300">Everyone in this session</div>
            </div>
            <div className="text-blue-400">→</div>
          </button>

          {/* Divider */}
          <div className="relative py-3">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-purple-500/30"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-black px-3 text-purple-400 text-xs font-semibold uppercase tracking-wider">
                Direct Messages
              </span>
            </div>
          </div>

          {/* Recent Private Chats */}
          {recentChats.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">💬</div>
              <div className="text-gray-400 text-sm">No direct messages yet</div>
              <div className="text-gray-500 text-xs mt-2">
                Click on a member's avatar to start chatting
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {recentChats.map(user => (
                <button
                  key={user.id}
                  onClick={() => onOpenPrivateChat(user)}
                  className="w-full text-left px-3 sm:px-4 py-2 sm:py-3 rounded-xl bg-purple-900/20 hover:bg-purple-900/40 border border-purple-500/20 hover:border-purple-500/40 flex items-center gap-3 sm:gap-4 transition-all group"
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <Avatar
                      user={user}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover ring-2 ring-purple-500/50 group-hover:ring-purple-400 transition-all"
                    />
                    {/* Unread Badge */}
                    {user.unreadCount > 0 && (
                      <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] sm:text-xs font-bold rounded-full min-w-[18px] h-[18px] sm:min-w-[20px] sm:h-[20px] flex items-center justify-center px-1 shadow-lg ring-2 ring-black animate-pulse">
                        {user.unreadCount > 99 ? '99+' : user.unreadCount}
                      </div>
                    )}
                  </div>
                  
                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-semibold text-white truncate text-sm sm:text-base">{user.username}</span>
                      <span className="text-[10px] sm:text-xs text-purple-400 flex-shrink-0">{user.messageCount} msgs</span>
                    </div>
                    <div className="text-xs sm:text-sm text-gray-400 truncate">
                      {user.lastMessage}
                    </div>
                  </div>
                  
                  {/* Arrow */}
                  <div className="text-purple-400 group-hover:translate-x-1 transition-transform">
                    →
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Custom Scrollbar Styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(147, 51, 234, 0.5);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(147, 51, 234, 0.7);
        }
      `}</style>
    </div>
  );
}