// frontend/src/components/ChatHomeModal.jsx
import React from 'react';

export default function ChatHomeModal({
  currentUser,
  privateMessages = {}, // { userId: [messages] }
  roomMembers = [], // optional: for name/username lookup
  onClose,
  onOpenRoomChat,
  onOpenPrivateChat,
}) {
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
    return {
      id: userId,
      username: member?.username || `User ${userId}`,
    };
  });

  // ✅ Sort by most recently messaged? (optional — you could add timestamps later)
  // For now, keep as-is.

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl w-80 max-w-[90vw]">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h3 className="text-white font-medium">Messages</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">×</button>
        </div>

        <div className="p-2 space-y-1 max-h-[60vh] overflow-y-auto">
          {/* Room Chat */}
          <button
            onClick={onOpenRoomChat}
            className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 flex items-center gap-3 text-white"
          >
            <div className="w-8 h-8 rounded bg-blue-500 flex items-center justify-center">📢</div>
            <span>Room Chat</span>
          </button>

          {/* Divider */}
          <div className="border-t border-gray-700 my-2" />

          {/* Recent Private Chats */}
          <div className="text-gray-400 text-xs px-3 py-1">DIRECT MESSAGES</div>
          {recentChats.length === 0 ? (
            <div className="text-center py-2 text-gray-500 text-sm">
              No recent chats
            </div>
          ) : (
            recentChats.map(user => (
              <button
                key={user.id}
                onClick={() => onOpenPrivateChat(user)}
                className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 flex items-center gap-3 text-white"
              >
                <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-sm">
                  {user.username?.[0]?.toUpperCase() || 'U'}
                </div>
                <span className="truncate">{user.username}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}