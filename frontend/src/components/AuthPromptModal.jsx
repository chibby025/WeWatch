import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function AuthPromptModal({ onClose }) {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className="mb-4">
          <img
            src="/icons/LetsWatchOut Logo.svg"
            alt="LetsWatchOut"
            className="h-12 w-auto mx-auto mb-3"
          />
          <h2 className="text-xl font-bold text-white">Join the watch party</h2>
          <p className="text-sm text-gray-400 mt-1">
            Create a free account to chat, react, and join live sessions.
          </p>
        </div>

        <div className="flex flex-col gap-3 mt-5">
          <button
            onClick={() => navigate('/register')}
            className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 transition-all"
          >
            Create free account
          </button>
          <button
            onClick={() => navigate('/login')}
            className="w-full py-3 rounded-xl font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-all"
          >
            Sign in
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-4 text-xs text-gray-500 hover:text-gray-400 transition-colors"
        >
          Keep browsing
        </button>
      </div>
    </div>
  );
}
