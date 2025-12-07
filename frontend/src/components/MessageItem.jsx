// WeWatch/frontend/src/components/MessageItem.jsx
import React, { useState, useEffect } from 'react';
import { EllipsisVerticalIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';

const MessageItem = ({ message, isOwnMessage, onReact, onDelete, onEdit, authenticatedUserID }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState(null);
  const [showReactions, setShowReactions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(message.Message);
  const [canEdit, setCanEdit] = useState(false);
  const reactionOptions = ['❤️', '😂', '👍', '👎'];

  // Check if message can be edited (within 2 minutes)
  useEffect(() => {
    const checkEditTime = () => {
      const messageTime = new Date(message.CreatedAt).getTime();
      const now = Date.now();
      const twoMinutes = 2 * 60 * 1000;
      setCanEdit(now - messageTime < twoMinutes);
    };

    checkEditTime();
    const interval = setInterval(checkEditTime, 1000); // Check every second

    return () => clearInterval(interval);
  }, [message.CreatedAt]);

  const handleReaction = (emoji) => {
    if (onReact) {
      const timestamp = new Date(message.CreatedAt).getTime();
      onReact(timestamp, emoji);
    }
    setSelectedEmoji(emoji);
    setShowMenu(false);
  };

  const handleEdit = async () => {
    if (editedText.trim() === message.Message) {
      setIsEditing(false);
      return;
    }

    if (onEdit) {
      try {
        await onEdit(message.ID, editedText.trim());
        setIsEditing(false);
        setShowOptionsMenu(false);
      } catch (err) {
        console.error("❌ Failed to edit message:", err);
        alert("Failed to edit message");
      }
    }
  };

  const handleDelete = async () => {
    setShowOptionsMenu(false);
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

  // 🎭 Theater badge colors
  const getTheaterBadgeColor = (theaterNumber) => {
    const colors = [
      'bg-blue-500 text-white',    // Theater 1
      'bg-green-500 text-white',   // Theater 2
      'bg-purple-500 text-white',  // Theater 3
      'bg-orange-500 text-white',  // Theater 4
      'bg-pink-500 text-white',    // Theater 5
      'bg-teal-500 text-white',    // Theater 6
    ];
    return colors[(theaterNumber - 1) % colors.length];
  };

  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} group relative`}>
      <div
        className={`max-w-xs md:max-w-md px-4 py-2 rounded-lg shadow-sm ${
          isOwnMessage 
            ? 'bg-blue-600 text-white rounded-br-none' 
            : 'bg-gray-200 text-gray-800 rounded-bl-none'
        }`}
      >
        {!isOwnMessage && (
          <div className="font-semibold text-sm mb-1 flex items-center gap-2">
            {/* 🎭 Theater Badge - only shown when theater_number exists (2+ theaters) */}
            {message.theater_number && (
              <span 
                className={`px-1.5 py-0.5 rounded text-xs font-bold ${getTheaterBadgeColor(message.theater_number)}`}
                title={message.theater_name || `Theater ${message.theater_number}`}
              >
                T{message.theater_number}
              </span>
            )}
            <span>{message.Username || `User ${message.UserID}`}</span>
          </div>
        )}

        {/* Message Content or Edit Input */}
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows="2"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleEdit}
                className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditedText(message.Message);
                }}
                className="px-3 py-1 text-xs bg-gray-300 hover:bg-gray-400 text-gray-800 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className={`whitespace-pre-wrap ${message.DeletedByHost ? 'italic opacity-75' : ''}`}>
            {message.Message}
          </div>
        )}

        {/* Selected Reaction */}
        {selectedEmoji && !isEditing && (
          <div className="mt-2 flex gap-1">
            <span className="text-lg bg-blue-100 dark:bg-blue-700 px-2 py-1 rounded-full">
              {selectedEmoji}
            </span>
          </div>
        )}

        {/* Timestamp */}
        {!isEditing && (
          <div className={`text-xs mt-1 opacity-90 ${isOwnMessage ? 'text-blue-100' : 'text-gray-600'}`}>
            {formattedTime}
          </div>
        )}

        {/* Three Dots Menu Button (Only for own messages) */}
        {isOwnMessage && !isEditing && !message.DeletedByHost && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowOptionsMenu(!showOptionsMenu);
            }}
            className="absolute -top-2 -right-2 w-6 h-6 bg-white hover:bg-gray-100 text-gray-600 rounded-full flex items-center justify-center shadow-md transition-all duration-150 opacity-0 group-hover:opacity-100"
            title="Message options"
          >
            <EllipsisVerticalIcon className="w-4 h-4" />
          </button>
        )}

        {/* Options Dropdown Menu */}
        {showOptionsMenu && (
          <div 
            className="absolute top-6 right-0 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-20 text-sm overflow-hidden"
            onMouseLeave={() => setShowOptionsMenu(false)}
          >
            {canEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                  setShowOptionsMenu(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-700"
              >
                <PencilIcon className="w-4 h-4" />
                Edit
              </button>
            )}
            <button
              onClick={handleDelete}
              className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2"
            >
              <TrashIcon className="w-4 h-4" />
              Delete
            </button>
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