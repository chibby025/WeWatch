// frontend/src/components/UserProfileModal.jsx
import React from 'react';

export default function UserProfileModal({ user, isOpen, onClose, onMessage }) {
  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl p-6 w-80 max-w-[90vw]">
        <img 
          src={user.avatar_url || '/icons/default.png'} 
          alt={user.username} 
          className="w-20 h-20 rounded-full mx-auto"
        />
        <h3 className="text-white text-xl font-bold text-center mt-3">{user.username}</h3>
        {user.bio && <p className="text-gray-400 text-center mt-2">{user.bio}</p>}
        <div className="flex gap-2 mt-6">
          <button 
            onClick={onClose}
            className="flex-1 bg-gray-700 py-2 rounded text-white"
          >
            Cancel
          </button>
          <button 
            onClick={onMessage}
            className="flex-1 bg-purple-600 py-2 rounded text-white"
          >
            Message
          </button>
        </div>
      </div>
    </div>
  );
}