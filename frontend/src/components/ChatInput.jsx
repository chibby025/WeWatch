// WeWatch/frontend/src/components/ChatInput.jsx
import React from 'react';

const ChatInput = ({ message, setMessage, onSend, onEmojiSelect, showEmojiPicker, disabled }) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim()) {
      onSend();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex space-x-2">
      <div className="flex-1 relative">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          className="w-full px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          disabled={disabled}
        />
        {/* Emoji button with better styling */}
        <button
          type="button"
          onClick={onEmojiSelect}
          className="absolute right-3 top-2 text-xl hover:bg-gray-100 p-1 rounded-full transition-colors duration-150"
          aria-label="Add emoji"
          style={{ 
            fontSize: '1.2em',
            lineHeight: '1'
          }}
        >
          😀
        </button>
      </div>
      
      <button
        type="submit"
        disabled={!message.trim() || disabled}
        className="px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors duration-150"
      >
        Send
      </button>
    </form>
  );
};

export default ChatInput;