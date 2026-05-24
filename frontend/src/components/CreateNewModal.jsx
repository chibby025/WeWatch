// WeWatch/frontend/src/components/CreateNewModal.jsx
import React, { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { PencilIcon, PlayIcon, VideoIcon, HomeIcon, PlusCircleIcon } from 'lucide-react';
import CreateNewInfoModal from './CreateNewInfoModal';

const CreateNewModal = ({ isOpen, onClose, onInstantWatch, onCreateRoom, onGoToRoom, onCreatePost, userMainRoomId, userMainRoomName, isSuperAdmin, hidePosts = false }) => {
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [isWatchSessionExpanded, setIsWatchSessionExpanded] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const hideInfo = localStorage.getItem('hideCreateNewInfo');
      if (!hideInfo) setShowInfoModal(true);
      setIsWatchSessionExpanded(false);
    }
  }, [isOpen]);

  const showWatchInRoom  = !!userMainRoomId;
  const showCreateRoom   = !userMainRoomId || isSuperAdmin;
  const roomLabel        = userMainRoomName || 'Your Room';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl w-full max-w-md">
        {/* Header */}
        <div className="border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Create New</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Options */}
        <div className="p-6 space-y-3">
          {/* Post */}
          {!hidePosts && (
            <button
              onClick={() => { onCreatePost?.(); onClose(); }}
              className="w-full group"
            >
              <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-pink-600 to-rose-700 hover:from-pink-700 hover:to-rose-800 rounded-lg transition-all shadow-md hover:shadow-lg">
                <div className="flex-shrink-0 flex items-center justify-center w-10 h-10">
                  <PencilIcon className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1 text-left">
                  <h3 className="text-white font-semibold">Post</h3>
                  <p className="text-pink-100 text-xs">Upload video, image, or GIF to share</p>
                </div>
              </div>
            </button>
          )}

          {/* Watch Session (expandable) */}
          <div className="w-full">
            <button
              onClick={() => setIsWatchSessionExpanded(!isWatchSessionExpanded)}
              className="w-full group"
            >
              <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 rounded-lg transition-all shadow-md hover:shadow-lg">
                <div className="flex-shrink-0 flex items-center justify-center w-10 h-10">
                  <PlayIcon className="w-8 h-8 text-white" fill="white" />
                </div>
                <div className="flex-1 text-left">
                  <h3 className="text-white font-semibold">Watch Session</h3>
                  <p className="text-purple-100 text-xs">Start watching with friends</p>
                </div>
                <div className="flex-shrink-0">
                  <svg
                    className={`w-5 h-5 text-white transition-transform ${isWatchSessionExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </button>

            {/* Sub-options */}
            {isWatchSessionExpanded && (
              <div className="mt-2 ml-4 space-y-2 animate-in slide-in-from-top">
                {/* Watch Now */}
                <button
                  onClick={() => { onInstantWatch(); onClose(); }}
                  className="w-full group"
                >
                  <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 rounded-lg transition-all shadow-sm hover:shadow-md">
                    <div className="flex-shrink-0 flex items-center justify-center w-8 h-8">
                      <VideoIcon className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="text-white font-medium text-sm">Watch Instantly</h3>
                      <p className="text-purple-100 text-xs">Quick one-off watch session, no room needed</p>
                    </div>
                  </div>
                </button>

                {/* Watch In {room name} — only if user has a room */}
                {showWatchInRoom && (
                  <button
                    onClick={() => { onGoToRoom?.(userMainRoomId); onClose(); }}
                    className="w-full group"
                  >
                    <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-lg transition-all shadow-sm hover:shadow-md">
                      <div className="flex-shrink-0 flex items-center justify-center w-8 h-8">
                        <HomeIcon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-white font-medium text-sm truncate">Watch in {roomLabel}</h3>
                        <p className="text-blue-100 text-xs">Go live in your room with your audience</p>
                      </div>
                    </div>
                  </button>
                )}

                {/* Create your room & watch — only if no room OR super_admin */}
                {showCreateRoom && (
                  <button
                    onClick={() => { onCreateRoom(); onClose(); }}
                    className="w-full group"
                  >
                    <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 rounded-lg transition-all shadow-sm hover:shadow-md">
                      <div className="flex-shrink-0 flex items-center justify-center w-8 h-8">
                        <PlusCircleIcon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-white font-medium text-sm">Create your room &amp; watch</h3>
                        <p className="text-green-100 text-xs">Build your following, watch regularly with your audience</p>
                      </div>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <CreateNewInfoModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        onContinue={() => setShowInfoModal(false)}
      />
    </div>
  );
};

export default CreateNewModal;
