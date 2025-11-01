// WeWatch/frontend/src/components/MessageItem.jsx
import React, { useState } from 'react';

const MessageItem = ({ message, isOwnMessage, onReact, onDelete, authenticatedUserID }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState(null);
  const [showReactions, setShowReactions] = useState(false);
  const reactionOptions = ['❤️', '😂', '👍', '👎'];

  const handleReaction = (emoji) => {
    if (onReact) {
      const timestamp = new Date(message.CreatedAt).getTime();
      onReact(timestamp, emoji);
    }
    setSelectedEmoji(emoji);
    setShowMenu(false);
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this message?")) return;
    
    console.log("🗑️ User attempting to delete message:", {
      messageId: message.ID,
      senderId: message.UserID,
      currentUserId: authenticatedUserID,
      isOwnMessage: isOwnMessage
    });

    try {
      await onDelete(message.ID);
      console.log("✅ Successfully deleted message ID:", message.ID);
    } catch (err) {
      console.error("❌ Failed to delete message:", err);
      
      if (err.response) {
        console.error("Response data:", err.response.data);
        console.error("Response status:", err.response.status);
        console.error("Response headers:", err.response.headers);
      } else if (err.request) {
        console.error("No response received. Request:", err.request);
      } else {
        console.error("Error message:", err.message);
      }
      
      alert("Failed to delete message. Check console for details.");
    }
  };

  const formattedTime = new Date(message.CreatedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} group relative`}>
      <div
        className={`max-w-xs md:max-w-md px-4 py-2 rounded-lg ${
          isOwnMessage 
            ? 'bg-blue-500 text-white rounded-br-none' 
            : 'bg-gray-200 text-gray-800 rounded-bl-none'
        }`}
      >
        {!isOwnMessage && (
          <div className="font-semibold text-sm mb-1">
            {message.Username || `User ${message.UserID}`}
          </div>
        )}

        <div className="whitespace-pre-wrap">{message.Message}</div>

        {/* Selected Reaction */}
        {selectedEmoji && (
          <div className="mt-2 flex gap-1">
            <span className="text-lg bg-blue-100 dark:bg-blue-700 px-2 py-1 rounded-full">
              {selectedEmoji}
            </span>
          </div>
        )}

        {/* Timestamp */}
        <div className={`text-xs mt-1 opacity-90 ${isOwnMessage ? 'text-blue-100' : 'text-gray-600'}`}>
          {formattedTime}
        </div>

        {/* Options Button (Three Dots) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className={`absolute -top-1 -right-1 w-5 h-5 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full flex items-center justify-center transition-colors duration-150 opacity-0 group-hover:opacity-100`}
          title="Message options"
        >
          ⋯
        </button>

        {/* Dropdown Menu */}
        {showMenu && (
          <div 
            className="absolute bottom-full right-0 mb-1 w-32 bg-white border border-gray-200 rounded shadow-lg z-20 text-sm overflow-hidden"
            onMouseLeave={() => setShowMenu(false)}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowReactions(true); // Open reactions
                setShowMenu(false);     // Close menu
              }} // Just open emoji options
              className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2 text-blue-600 hover:text-blue-800"
            >
              😂 React 
            </button>
            {isOwnMessage && (
              <button
                onClick={handleDelete}
                className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2"
              >
                🗑️ Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* Emoji Picker (only when "React" is clicked) */}
      {showReactions && (
        <div className="absolute bottom-full right-0 mb-16 bg-white border border-gray-200 rounded shadow-lg p-2 z-20">
          <div className="flex gap-1">
            {reactionOptions.map((emoji) => (
              <button
                key={emoji}
                onClick={(e) => {
                  e.stopPropagation();
                  handleReaction(emoji);
                  setShowReactions(false);
                }}
                className="text-xl hover:bg-gray-100 p-1.5 rounded transition-colors duration-150 hover:scale-110"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageItem;