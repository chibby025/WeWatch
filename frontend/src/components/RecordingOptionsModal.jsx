// WeWatch/frontend/src/components/RecordingOptionsModal.jsx
// Modal for selecting recording source (Full Canvas, Video Only, LiveShare)
import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Video, Monitor, Camera, Tv } from 'lucide-react';

const RecordingOptionsModal = ({ isOpen, onClose, onStartRecording, roomId }) => {
  const [selectedSource, setSelectedSource] = useState('full_canvas');
  const [recordingTitle, setRecordingTitle] = useState('');

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
    onStartRecording(selectedSource, roomId, title);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-purple-500/20 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-600 to-pink-600 flex items-center justify-center">
              <div className="w-4 h-4 bg-white rounded-full animate-pulse"></div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Start Recording</h2>
              <p className="text-sm text-gray-400">Choose what to record (30 min max @ 720p)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Recording Sources */}
        <div className="p-6 space-y-4">
          {/* Title Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Recording Title (optional)
            </label>
            <input
              type="text"
              value={recordingTitle}
              onChange={(e) => setRecordingTitle(e.target.value)}
              placeholder="e.g., Epic Watch Party with Friends"
              className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              maxLength={100}
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave empty to use default: "Watch Party Recording - {new Date().toLocaleDateString()}"
            </p>
          </div>

          {/* Source Selection */}
          {recordingSources.map((source) => {
            const Icon = source.icon;
            const isSelected = selectedSource === source.id;

            return (
              <button
                key={source.id}
                onClick={() => setSelectedSource(source.id)}
                className={`w-full text-left p-5 rounded-xl border-2 transition-all ${
                  isSelected
                    ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/20'
                    : 'border-gray-700/50 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${source.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold text-white">{source.name}</h3>
                      {source.recommended && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-green-600 text-white rounded-full">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400">{source.description}</p>
                  </div>

                  {/* Radio indicator */}
                  <div className="flex-shrink-0 mt-1">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected ? 'border-purple-500 bg-purple-500' : 'border-gray-600'
                      }`}
                    >
                      {isSelected && <div className="w-2 h-2 bg-white rounded-full"></div>}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Info Box */}
        <div className="mx-6 mb-6 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-start gap-3">
            <Tv className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-200">
              <p className="font-medium mb-1">Recording Tips:</p>
              <ul className="space-y-1 text-blue-300/80">
                <li>• Max duration: 30 minutes (warning at 28min)</li>
                <li>• Resolution: 1280x720 (720p)</li>
                <li>• Format: WebM video</li>
                <li>• Video will auto-post to your profile after upload</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 p-6 border-t border-gray-700/50 bg-gray-800/30">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white font-medium transition-all shadow-lg shadow-red-500/30 flex items-center justify-center gap-2"
          >
            <div className="w-3 h-3 bg-white rounded-full"></div>
            <span>Start Recording</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecordingOptionsModal;
