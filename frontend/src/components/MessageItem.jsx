// WeWatch/frontend/src/components/MessageItem.jsx
import React, { useState } from 'react';

const MessageItem = ({ message, isOwnMessage, onReact }) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const formattedTime = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const handleReact = (emoji) => {
    if (onReact) {
      onReact(message.timestamp, emoji);
    }
    setShowEmojiPicker(false);
  };

  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-xs md:max-w-md px-4 py-2 rounded-lg ${
        isOwnMessage 
          ? 'bg-blue-500 text-white rounded-br-none' 
          : 'bg-gray-200 text-gray-800 rounded-bl-none'
      }`}>
        {!isOwnMessage && (
          <div className="font-semibold text-sm mb-1">
            User {message.user_id}
          </div>
        )}
        <div className="whitespace-pre-wrap">{message.message}</div>
        
        {/* Timestamp */}
        <div className={`text-xs mt-1 ${isOwnMessage ? 'text-blue-100' : 'text-gray-500'}`}>
          {formattedTime}
        </div>
      </div>
    </div>
  );
};

export default MessageItem;