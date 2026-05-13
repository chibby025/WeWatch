// WeWatch/frontend/src/components/RecordingOptionsModal.jsx
// Modal for selecting recording source (Full Canvas, Video Only, LiveShare)
import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Video, Monitor, Camera, Tv } from 'lucide-react';

const RecordingOptionsModal = ({ isOpen, onClose, onStartRecording, roomId }) => {
  const [selectedSource, setSelectedSource] = useState('full_canvas');
  const [recordingTitle, setRecordingTitle] = useState('');
  const [allowDownloads, setAllowDownloads] = useState(true);
  const [contentRating, setContentRating] = useState('G');

  if (!isOpen) return null;

  const recordingSources = [
    {
      id: 'full_canvas',
      name: 'Full Canvas',
      description: 'Record everything - video, chat, reactions, and all UI elements',
      icon: Monitor,
      color: 'from-purple-600 to-blue-600',
      recommended: true,
    },
    {
      id: 'video_only',
      name: 'Video Player Only',
      description: 'Record just the video content without chat or UI',
      icon: Video,
      color: 'from-pink-600 to-red-600',
    },
    {
      id: 'liveshare',
      name: 'LiveShare Camera/Screen',
      description: 'Record your camera feed or screen share',
      icon: Camera,
      color: 'from-green-600 to-teal-600',
    },
  ];

  const handleStart = () => {
    const title = recordingTitle.trim() || `Watch Party Recording - ${new Date().toLocaleDateString()}`;
    onStartRecording(selectedSource, roomId, title, { allowDownloads, contentRating });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-lg border border-purple-500/20 overflow-hidden max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-700/50 flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-red-600 to-pink-600 flex items-center justify-center flex-shrink-0">
              <div className="w-2 h-2 sm:w-3 sm:h-3 bg-white rounded-full animate-pulse"></div>
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white">Start Recording</h2>
              <p className="text-[10px] sm:text-xs text-gray-400 truncate">30min max • 720p • Auto-posts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors flex-shrink-0"
          >
            <XMarkIcon className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </div>

        {/* Recording Sources & Settings - Scrollable */}
        <div className="p-3 sm:p-4 space-y-3 overflow-y-auto flex-1">
          {/* Recording Sources */}
          {recordingSources.map((source) => {
            const Icon = source.icon;
            const isSelected = selectedSource === source.id;

            return (
              <button
                key={source.id}
                onClick={() => setSelectedSource(source.id)}
                className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                  isSelected
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-gray-700/50 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Icon */}
                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br ${source.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <h3 className="text-sm sm:text-base font-semibold text-white truncate">{source.name}</h3>
                      {source.recommended && (
                        <span className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium bg-green-600 text-white rounded-full flex-shrink-0">
                          ✓
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] sm:text-xs text-gray-400 line-clamp-1">{source.description}</p>
                  </div>

                  {/* Radio indicator */}
                  <div className="flex-shrink-0">
                    <div
                      className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected ? 'border-purple-500 bg-purple-500' : 'border-gray-600'
                      }`}
                    >
                      {isSelected && <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></div>}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}

          {/* Download Permission */}
          <div className="pt-2 border-t border-gray-700/50">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={allowDownloads}
                onChange={(e) => setAllowDownloads(e.target.checked)}
                className="mt-0.5 h-4 w-4 sm:h-5 sm:w-5 rounded border-gray-600 bg-gray-700 text-purple-600 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 cursor-pointer"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-white group-hover:text-purple-400 transition-colors">Allow Downloads</span>
                <p className="text-xs text-gray-400 mt-0.5">Let viewers download this recording</p>
              </div>
            </label>
          </div>

          {/* Content Rating */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-white flex items-center gap-2">
              <span>🔞</span>
              <span>Content Rating</span>
            </label>
            <select
              value={contentRating}
              onChange={(e) => setContentRating(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="G">G - General Audiences</option>
              <option value="PG">PG - Parental Guidance</option>
              <option value="Educational">Educational - Learning Content</option>
              <option value="Religious">Religious - Faith-Based Content</option>
              <option value="13+">13+ - Teens & Above</option>
              <option value="16+">16+ - Ages 16+</option>
              <option value="18+">18+ - Adults Only</option>
              <option value="Mature">Mature - Explicit Content</option>
            </select>
            <p className="text-xs text-gray-400">Users must meet age requirements to view this content</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 border-t border-gray-700/50 bg-gray-800/30 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2 sm:py-2.5 px-3 sm:px-4 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            className="flex-1 py-2 sm:py-2.5 px-3 sm:px-4 rounded-lg bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white text-sm font-medium transition-all flex items-center justify-center gap-1.5 sm:gap-2"
          >
            <div className="w-2 h-2 sm:w-3 sm:h-3 bg-white rounded-full"></div>
            <span>Record</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecordingOptionsModal;
