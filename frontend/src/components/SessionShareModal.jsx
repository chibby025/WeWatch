import React, { useState } from 'react';
import { XMarkIcon, FlagIcon, NoSymbolIcon, BookmarkIcon } from '@heroicons/react/24/solid';
import { BookmarkIcon as BookmarkOutlineIcon } from '@heroicons/react/24/outline';
import { sendWatchOut, blockUser } from '../services/api';
import toast from 'react-hot-toast';
import ReportModal from './ReportModal';

export default function SessionShareModal({
  session,
  friends = [],
  currentUser,
  isFavourited = false,
  onToggleFavourite,
  onClose,
}) {
  const [sendingTo, setSendingTo] = useState(null);
  const [sentTo, setSentTo] = useState(new Set());
  const [showReport, setShowReport] = useState(false);

  if (!session) return null;

  const shareUrl = `${window.location.origin}/rooms/${session.room_id}`;
  const shareText = `Watch "${session.session_title || session.room_name}" live on LetsWatchOut — watch together, anywhere! 👀 ${shareUrl}`;

  const handleSendToFriend = async (friend) => {
    if (sentTo.has(friend.id) || sendingTo) return;
    setSendingTo(friend.id);
    try {
      await sendWatchOut(friend.id, session.room_id);
      setSentTo(prev => new Set([...prev, friend.id]));
      toast.success(`Sent to ${friend.username}!`);
    } catch {
      toast.error('Could not send');
    } finally {
      setSendingTo(null);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => toast.success('Link copied!'));
  };

  const handleBlock = async () => {
    if (!session.host_id) return;
    try {
      await blockUser(session.host_id);
      toast.success('Blocked');
      onClose();
    } catch {
      toast.error('Could not block');
    }
  };

  if (showReport) {
    return (
      <ReportModal
        targetType="room"
        targetId={session.room_id}
        targetName={session.room_name}
        onClose={() => { setShowReport(false); onClose(); }}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-2xl animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-gray-900 dark:text-white font-bold text-lg">Share</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Session info */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-1">
            {session.session_title || session.room_name}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {session.watching_count ?? 0} watching
          </p>
        </div>

        {/* Friends row */}
        {friends.length > 0 && (
          <div className="px-5 pt-2 pb-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Send to friends
            </p>
            <div className="flex gap-4 overflow-x-auto pb-1">
              {friends.slice(0, 8).map(friend => (
                <button
                  key={friend.id}
                  onClick={() => handleSendToFriend(friend)}
                  disabled={!!sendingTo}
                  className="flex flex-col items-center gap-1.5 flex-shrink-0 group"
                >
                  <div className="relative">
                    <div className={`w-13 h-13 w-12 h-12 rounded-full overflow-hidden ring-2 transition-all ${
                      sentTo.has(friend.id)
                        ? 'ring-green-500'
                        : 'ring-gray-200 dark:ring-gray-700 group-hover:ring-purple-500'
                    }`}>
                      {friend.avatar_url
                        ? <img src={friend.avatar_url} alt={friend.username} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-white font-bold text-lg bg-gradient-to-br from-purple-500 to-blue-500">
                            {friend.username?.[0]?.toUpperCase()}
                          </div>
                      }
                    </div>
                    {sentTo.has(friend.id) && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center shadow">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                    {sendingTo === friend.id && (
                      <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <span className="text-gray-600 dark:text-gray-300 text-xs max-w-[52px] truncate">
                    {friend.username}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Social share */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Share via
          </p>
          <div className="flex gap-4 justify-start overflow-x-auto pb-1">
            {/* Copy link */}
            <button onClick={handleCopyLink} className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center transition-colors">
                <svg className="w-5 h-5 text-gray-700 dark:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <span className="text-gray-500 dark:text-gray-400 text-xs">Copy</span>
            </button>

            {/* WhatsApp */}
            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
              target="_blank" rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 flex-shrink-0"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-full bg-[#25D366] flex items-center justify-center">
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
              </div>
              <span className="text-gray-500 dark:text-gray-400 text-xs">WhatsApp</span>
            </a>

            {/* X / Twitter */}
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`}
              target="_blank" rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 flex-shrink-0"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-full bg-black border border-gray-200 dark:border-gray-700 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.26 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </div>
              <span className="text-gray-500 dark:text-gray-400 text-xs">X</span>
            </a>

            {/* Facebook */}
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`}
              target="_blank" rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 flex-shrink-0"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-full bg-[#1877F2] flex items-center justify-center">
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </div>
              <span className="text-gray-500 dark:text-gray-400 text-xs">Facebook</span>
            </a>

            {/* Telegram */}
            <a
              href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`}
              target="_blank" rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 flex-shrink-0"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-full bg-[#2AABEE] flex items-center justify-center">
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
              </div>
              <span className="text-gray-500 dark:text-gray-400 text-xs">Telegram</span>
            </a>
          </div>
        </div>

        {/* Action row: Favourite, Report, Block */}
        <div className="border-t border-gray-100 dark:border-gray-800 flex items-center">
          {/* Favourite */}
          {onToggleFavourite && (
            <button
              onClick={() => { onToggleFavourite(session.room_id); }}
              className="flex-1 py-4 flex flex-col items-center gap-1 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
            >
              {isFavourited
                ? <BookmarkIcon className="w-5 h-5 text-amber-500" />
                : <BookmarkOutlineIcon className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-white" />
              }
              <span className={`text-xs font-medium ${isFavourited ? 'text-amber-500' : 'text-gray-500 dark:text-gray-400'}`}>
                {isFavourited ? 'Saved' : 'Save'}
              </span>
            </button>
          )}

          {onToggleFavourite && <div className="w-px h-8 bg-gray-100 dark:bg-gray-800" />}

          {/* Report */}
          <button
            onClick={() => setShowReport(true)}
            className="flex-1 py-4 flex flex-col items-center gap-1 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
          >
            <FlagIcon className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-white" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Report</span>
          </button>

          {/* Block — only show if viewer isn't the host */}
          {session.host_id && session.host_id !== currentUser?.id && (
            <>
              <div className="w-px h-8 bg-gray-100 dark:bg-gray-800" />
              <button
                onClick={handleBlock}
                className="flex-1 py-4 flex flex-col items-center gap-1 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
              >
                <NoSymbolIcon className="w-5 h-5 text-red-400 group-hover:text-red-500" />
                <span className="text-xs font-medium text-red-400 group-hover:text-red-500">Block</span>
              </button>
            </>
          )}
        </div>

        <div className="h-safe-area-bottom h-6" />
      </div>
    </div>
  );
}
