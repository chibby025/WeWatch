// frontend/src/components/PrivateChatModal.jsx
import React, { useState } from 'react';

export default function PrivateChatModal({ otherUser, messages = [], onSendMessage, onBack, onClose }) {
  const [input, setInput] = useState('');

  const handleSubmit = () => {
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl flex flex-col h-[70vh] w-80 max-w-[90vw]">
        <div className="p-4 border-b border-gray-700 flex items-center">
          <button onClick={onBack} className="mr-2 text-white">←</button>
          <h3 className="text-white font-medium">Chat with {otherUser?.username}</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {messages.map(msg => (
            <div 
              key={msg.id || msg.timestamp} 
              className={`text-sm ${msg.from_user_id === currentUser?.id ? 'text-right' : 'text-left'}`}
            >
              <span className={`inline-block px-3 py-1 rounded ${
                msg.from_user_id === currentUser?.id ? 'bg-purple-900 text-white' : 'bg-gray-700 text-gray-200'
              }`}>
                {msg.message}
              </span>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-gray-700">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Type a message..."
            className="w-full bg-gray-700 text-white px-3 py-2 rounded focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}