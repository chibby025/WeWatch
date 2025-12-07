// WeWatch/frontend/src/components/ShareModal.jsx
// Modal to share room link with others
import React, { useState } from 'react';
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const ShareModal = ({ isOpen, onClose, roomId, roomName, shareUrl }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const roomUrl = shareUrl || `${window.location.origin}/room/${roomId}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      toast.error('Failed to copy link');
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${roomName || 'this room'} on WeWatch`,
          text: `Join me in watching together!`,
          url: roomUrl,
        });
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error sharing:', error);
          toast.error('Failed to share');
        }
      }
    } else {
      toast.error('Sharing is not supported on this browser');
    }
  };

  const shareOptions = [
    {
      name: 'WhatsApp',
      iconPath: '/icons/whatsappLogo.svg',
      url: `https://wa.me/?text=${encodeURIComponent(`Join me in ${roomName || 'this room'} on WeWatch! ${roomUrl}`)}`,
    },
    {
      name: 'Twitter',
      iconPath: '/icons/twitterLogo.svg',
      url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Join me in ${roomName || 'this room'} on WeWatch!`)}&url=${encodeURIComponent(roomUrl)}`,
    },
    {
      name: 'Facebook',
      iconPath: '/icons/facebookLogo.svg',
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(roomUrl)}`,
    },
    {
      name: 'Telegram',
      iconPath: '/icons/telegramLogo.svg',
      url: `https://t.me/share/url?url=${encodeURIComponent(roomUrl)}&text=${encodeURIComponent(`Join me in ${roomName || 'this room'} on WeWatch!`)}`,
    },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Share Room
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Copy Link Section */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Room Link
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={roomUrl}
                readOnly
                className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm"
              />
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                {copied ? (
                  <>
                    <CheckIcon className="h-5 w-5" />
                    Copied
                  </>
                ) : (
                  <>
                    <img src="/icons/copyLinkIcon.svg" alt="" className="h-5 w-5" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Share Options */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Share via
            </label>
            <div className="flex items-center justify-center gap-6">
              {shareOptions.map((option) => (
                <a
                  key={option.name}
                  href={option.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-70 transition-opacity"
                  title={option.name}
                >
                  <img src={option.iconPath} alt={option.name} className="h-12 w-12" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;