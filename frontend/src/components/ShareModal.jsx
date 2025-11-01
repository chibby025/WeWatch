// frontend/src/components/ShareModal.jsx
import React, { useState } from 'react';

const ShareModal = ({ isOpen, onClose, shareUrl }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-gray-900 text-white rounded-xl p-6 w-80 max-w-[90%] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">Share Watch Room</h3>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-white text-xl"
          >
            &times;
          </button>
        </div>
        <p className="text-sm text-gray-300 mb-3">
          Share this link so others can join your watch session:
        </p>
        <div className="flex">
          <input
            type="text"
            value={shareUrl || ''}
            readOnly
            className="flex-1 bg-gray-800 text-sm px-3 py-2 rounded-l focus:outline-none truncate"
          />
          <button
            onClick={handleCopy}
            className={`px-3 py-2 text-sm font-medium rounded-r ${
              copied 
                ? 'bg-green-600' 
                : 'bg-blue-600 hover:bg-blue-500'
            } transition-colors`}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;