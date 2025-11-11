// frontend/src/components/cinema/ui/SettingsModal.jsx
import React from 'react';

const ShareIcon = '/icons/ShareIcon.svg';

const SettingsModal = ({
  isOpen,
  onClose,
  onShareRoom,
  audioDevices = [],
  selectedAudioDeviceId,
  onAudioDeviceChange,
  availableCameras = [],
  selectedCameraId,
  onCameraSwitch
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center pb-24">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="max-h-[70vh] overflow-y-auto">
          {/* Share Room Section */}
          <div className="px-6 py-4 border-b border-gray-700">
            <button
              onClick={() => {
                onShareRoom();
                onClose();
              }}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-gray-800 text-gray-200 transition-colors"
            >
              <img src={ShareIcon} alt="Share" className="w-6 h-6" />
              <span className="text-base font-medium">Share Room</span>
            </button>
          </div>

          {/* Audio Device Selection Section */}
          {audioDevices.length > 0 && (
            <div className="px-6 py-4 border-b border-gray-700">
              <h3 className="text-sm font-semibold text-gray-400 mb-3">Microphone</h3>
              <div className="space-y-1">
                {audioDevices.map((device) => (
                  <button
                    key={device.deviceId}
                    onClick={() => {
                      onAudioDeviceChange(device.deviceId);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-lg hover:bg-gray-800 flex items-center justify-between transition-colors ${
                      selectedAudioDeviceId === device.deviceId ? 'bg-gray-800 text-green-400' : 'text-gray-300'
                    }`}
                  >
                    <span className="truncate pr-2 text-sm">{device.label || `Microphone ${device.deviceId.slice(0, 8)}...`}</span>
                    {selectedAudioDeviceId === device.deviceId && <span className="text-green-400 text-lg">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Camera Device Selection Section */}
          {availableCameras.length > 0 && (
            <div className="px-6 py-4">
              <h3 className="text-sm font-semibold text-gray-400 mb-3">Camera</h3>
              <div className="space-y-1">
                {availableCameras.map((camera, index) => (
                  <button
                    key={camera.deviceId}
                    onClick={() => {
                      onCameraSwitch(camera.deviceId);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-lg hover:bg-gray-800 flex items-center justify-between transition-colors ${
                      selectedCameraId === camera.deviceId ? 'bg-gray-800 text-green-400' : 'text-gray-300'
                    }`}
                  >
                    <span className="truncate pr-2 text-sm">{camera.label || `Camera ${index + 1}`}</span>
                    {selectedCameraId === camera.deviceId && <span className="text-green-400 text-lg">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
