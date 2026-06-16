// WeWatch/frontend/src/components/ShareModal.jsx
// Modal to share room link with others
import React, { useState } from 'react';
import { XMarkIcon, CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const ShareModal = ({ isOpen, onClose, roomId, roomName, shareUrl }) => {
  const [copied, setCopied] = useState(false);
  const [bannerCopied, setBannerCopied] = useState(false);

  if (!isOpen) return null;

  const roomUrl = shareUrl || `${window.location.origin}/rooms/${roomId}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl);
      setCopied(true);
      toast.success('Link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleBannerCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl);
      setBannerCopied(true);
      toast.success('Room link copied — paste it in your WhatsApp group!');
      setTimeout(() => setBannerCopied(false), 3000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${roomName || 'this room'} on LetsWatchOut`,
          text: `Join me in watching together!`,
          url: roomUrl,
        });
      } catch (error) {
        if (error.name !== 'AbortError') {
          toast.error('Failed to share');
        }
      }
    } else {
      toast.error('Sharing is not supported on this browser');
    }
  };

  const inviteText = `Join me in "${roomName || 'this room'}" on LetsWatchOut — watch together, anywhere! ${roomUrl}`;

  const openTweet = () => {
    const tweetText = encodeURIComponent(`Watching together in "${roomName || 'this room'}" on LetsWatchOut 👀`);
    const tweetUrl = encodeURIComponent(roomUrl);
    window.open(
      `https://x.com/intent/tweet?text=${tweetText}&url=${tweetUrl}`,
      'xshare',
      'width=550,height=420,scrollbars=yes,resizable=yes'
    );
  };

  const shareOptions = [
    {
      name: 'WhatsApp',
      iconPath: '/icons/whatsappLogo.svg',
      href: `https://wa.me/?text=${encodeURIComponent(inviteText)}`,
    },
    {
      name: 'Facebook',
      iconPath: '/icons/facebookLogo.svg',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(roomUrl)}&quote=${encodeURIComponent(inviteText)}`,
    },
    {
      name: 'Telegram',
      iconPath: '/icons/telegramLogo.svg',
      href: `https://t.me/share/url?url=${encodeURIComponent(roomUrl)}&text=${encodeURIComponent(inviteText)}`,
    },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Share Room</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Migrate WhatsApp group CTA — copies link, distinct from WhatsApp icon */}
          <button
            type="button"
            onClick={handleBannerCopy}
            className="flex items-center gap-3 w-full px-4 py-3 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 rounded-xl transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0">
              {bannerCopied ? (
                <CheckIcon className="w-5 h-5 text-white" />
              ) : (
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {bannerCopied ? 'Copied! Paste in your WA group' : 'Move your WhatsApp group here'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                Copy link → paste into your group chat
              </p>
            </div>
            <ClipboardDocumentIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </button>

          {/* Copy Link — compact single button */}
          <button
            onClick={handleCopyLink}
            className="w-full flex items-center justify-between gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl font-medium transition-colors"
          >
            <span className="text-sm truncate min-w-0 text-blue-100 font-normal">
              {roomUrl.replace(/^https?:\/\//, '')}
            </span>
            <span className="flex items-center gap-1.5 flex-shrink-0 text-sm font-semibold">
              {copied ? (
                <><CheckIcon className="h-4 w-4" />Copied</>
              ) : (
                <><ClipboardDocumentIcon className="h-4 w-4" />Copy</>
              )}
            </span>
          </button>

          {/* Share via — single row, no wrapping */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Share via</p>
            <div className="flex items-center justify-around">
              {/* Native share */}
              {typeof navigator !== 'undefined' && navigator.share && (
                <button
                  onClick={handleNativeShare}
                  className="flex flex-col items-center gap-1 hover:opacity-70 transition-opacity"
                  title="More"
                >
                  <div className="w-11 h-11 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <svg className="w-5 h-5 text-gray-700 dark:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                  </div>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">More</span>
                </button>
              )}

              {/* WhatsApp */}
              <a
                href={shareOptions[0].href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1 hover:opacity-70 transition-opacity"
                title="WhatsApp"
              >
                <img src="/icons/whatsappLogo.svg" alt="WhatsApp" className="h-11 w-11" />
                <span className="text-[10px] text-gray-500 dark:text-gray-400">WhatsApp</span>
              </a>

              {/* X / Twitter — popup so compose box always opens */}
              <button
                type="button"
                onClick={openTweet}
                className="flex flex-col items-center gap-1 hover:opacity-70 transition-opacity"
                title="X"
              >
                <img src="/icons/twitterLogo.svg" alt="X" className="h-11 w-11" />
                <span className="text-[10px] text-gray-500 dark:text-gray-400">X</span>
              </button>

              {/* Facebook */}
              <a
                href={shareOptions[1].href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1 hover:opacity-70 transition-opacity"
                title="Facebook"
              >
                <img src="/icons/facebookLogo.svg" alt="Facebook" className="h-11 w-11" />
                <span className="text-[10px] text-gray-500 dark:text-gray-400">Facebook</span>
              </a>

              {/* Telegram */}
              <a
                href={shareOptions[2].href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1 hover:opacity-70 transition-opacity"
                title="Telegram"
              >
                <img src="/icons/telegramLogo.svg" alt="Telegram" className="h-11 w-11" />
                <span className="text-[10px] text-gray-500 dark:text-gray-400">Telegram</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
