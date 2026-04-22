// frontend/src/components/liveshare/LiveShareTypeSelector.jsx
import { useState, useEffect, useRef } from 'react';
import { Camera, Monitor, MonitorPlay } from 'lucide-react';

const SHARE_TYPES = [
  {
    id: 'camera',
    name: 'Camera Only',
    icon: Camera,
    description: 'Share your webcam feed',
  },
  {
    id: 'screen',
    name: 'Screen Only',
    icon: Monitor,
    description: 'Share your screen',
  },
  {
    id: 'both',
    name: 'Screen + Camera',
    icon: MonitorPlay,
    description: 'Share screen with camera overlay',
  },
];

export default function LiveShareTypeSelector({ 
  onTypeSelect, 
  onClose, 
  mode, 
  isGuest,
  showModeContext,
  embedded = false,
  hasGuestSelected = false, // ✅ NEW: Whether host has selected a guest
  availableCameras = [], // 📹 NEW: Pre-fetched available cameras from parent
  initialCameraId = null, // 📹 NEW: Initially selected camera from parent
}) {
  const [selectedType, setSelectedType] = useState(null);
  const [cameraDevices, setCameraDevices] = useState(availableCameras); // 📹 Initialize with provided cameras
  const [selectedDeviceId, setSelectedDeviceId] = useState(initialCameraId || ''); // 📹 Use initial camera
  const [previewStream, setPreviewStream] = useState(null);
  const [permissionError, setPermissionError] = useState(null);
  const videoRef = useRef(null);

  // ✅ Filter share types - remove 'both' if guest is selected
  const availableShareTypes = hasGuestSelected 
    ? SHARE_TYPES.filter(type => type.id !== 'both')
    : SHARE_TYPES;

  // Enumerate camera devices (only if not provided)
  useEffect(() => {
    const getDevices = async () => {
      // 📹 Skip enumeration if cameras already provided
      if (availableCameras.length > 0) {
        console.log('📹 [LiveShareTypeSelector] Using provided cameras:', availableCameras.length);
        return;
      }
      
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(device => device.kind === 'videoinput');
        setCameraDevices(cameras);
        if (cameras.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(cameras[0].deviceId);
        }
      } catch (error) {
        console.error('Failed to enumerate devices:', error);
      }
    };

    getDevices();
  }, [availableCameras]);

  // Setup camera preview when camera or both is selected
  useEffect(() => {
    const setupPreview = async () => {
      if ((selectedType === 'camera' || selectedType === 'both') && selectedDeviceId) {
        try {
          setPermissionError(null);
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: selectedDeviceId },
            audio: false,
          });
          setPreviewStream(stream);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (error) {
          console.error('Failed to get camera stream:', error);
          setPermissionError('Camera permission denied. Please allow camera access.');
        }
      } else {
        // Cleanup preview when switching away
        if (previewStream) {
          previewStream.getTracks().forEach(track => track.stop());
          setPreviewStream(null);
        }
      }
    };

    setupPreview();

    return () => {
      if (previewStream) {
        previewStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [selectedType, selectedDeviceId]);

  const handleTypeClick = (type) => {
    setSelectedType(type.id);
    if (embedded) {
      // In wizard mode, immediately proceed when type selected
      if (previewStream) {
        previewStream.getTracks().forEach(track => track.stop());
      }
      onTypeSelect(type.id, selectedDeviceId);
    }
  };

  const handleContinue = () => {
    if (selectedType) {
      // Cleanup preview stream
      if (previewStream) {
        previewStream.getTracks().forEach(track => track.stop());
      }
      onTypeSelect(selectedType, selectedDeviceId);
    }
  };

  // Embedded version (for wizard)
  if (embedded) {
    return (
      <div className="w-full flex flex-col h-full">
        <div className="space-y-2.5 mb-4">
          {availableShareTypes.map((type) => {
            const IconComponent = type.icon;
            return (
              <button
                key={type.id}
                onClick={() => handleTypeClick(type)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                  selectedType === type.id
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 hover:border-gray-600 bg-gray-800'
                }`}
              >
                {/* Icon */}
                <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  selectedType === type.id ? 'bg-blue-500/20' : 'bg-gray-700'
                }`}>
                  <IconComponent size={22} className={selectedType === type.id ? 'text-blue-400' : 'text-gray-400'} />
                </div>
                
                {/* Label */}
                <span className="text-base md:text-lg font-semibold text-white flex-1 text-left">
                  {type.name}
                </span>

                {/* Selection Indicator */}
                {selectedType === type.id && (
                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Compact Camera Preview */}
        {(selectedType === 'camera' || selectedType === 'both') && (
          <div className="bg-gray-800 rounded-xl p-3 space-y-3">
            {/* Device Selection */}
            {cameraDevices.length > 1 && (
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {cameraDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${cameraDevices.indexOf(device) + 1}`}
                  </option>
                ))}
              </select>
            )}

            {/* Compact Video Preview */}
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
              {permissionError ? (
                <div className="absolute inset-0 flex items-center justify-center p-2">
                  <p className="text-red-400 text-xs text-center">{permissionError}</p>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Standalone modal version (backwards compatibility)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-900 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-gray-700 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-6 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">
                {isGuest ? 'Join LiveShare' : 'Start LiveShare'}
              </h2>
              <p className="text-gray-400 text-sm">Choose what to share</p>
              {showModeContext && mode && mode !== 'regular' && (
                <div className="mt-2 px-3 py-1.5 bg-blue-500/20 border border-blue-500/30 rounded-lg inline-block">
                  <span className="text-blue-400 text-xs font-medium">
                    Mode: {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-2"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Share Type Selection */}
          <div className="space-y-2">
            {availableShareTypes.map((type) => {
              const IconComponent = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => handleTypeClick(type)}
                  className={`w-full p-3 rounded-lg border-2 transition-all ${
                    selectedType === type.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-700 hover:border-gray-600 bg-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gray-700">
                      <IconComponent size={20} className={selectedType === type.id ? 'text-blue-400' : 'text-gray-400'} />
                    </div>
                    <h3 className="text-white font-semibold text-sm">{type.name}</h3>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Camera Preview */}
          {(selectedType === 'camera' || selectedType === 'both') && (
            <div className="space-y-4">
              <div className="bg-gray-800 rounded-xl p-4">
                <h3 className="text-white font-medium mb-3">Camera Preview</h3>
                
                {/* Device Selection */}
                {cameraDevices.length > 1 && (
                  <div className="mb-3">
                    <label className="text-gray-400 text-sm mb-2 block">Select Camera</label>
                    <select
                      value={selectedDeviceId}
                      onChange={(e) => setSelectedDeviceId(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {cameraDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Camera ${cameraDevices.indexOf(device) + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Video Preview */}
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                  {permissionError ? (
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                      <div className="text-center">
                        <p className="text-red-400 mb-2">⚠️ {permissionError}</p>
                        <p className="text-gray-400 text-xs">Check your browser permissions</p>
                      </div>
                    </div>
                  ) : (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Screen Share Instructions */}
          {selectedType === 'screen' && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="text-2xl">ℹ️</div>
                <div>
                  <p className="text-blue-400 text-sm mb-1 font-medium">Screen Share Instructions</p>
                  <p className="text-gray-300 text-xs">
                    After clicking continue, your browser will ask which screen or window to share.
                    Select the content you want to broadcast.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-900 border-t border-gray-700 p-6 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-6 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleContinue}
            disabled={!selectedType}
            className={`px-8 py-3 rounded-lg font-medium transition-all ${
              selectedType
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isGuest ? 'Join Live' : 'Start Broadcasting'}
          </button>
        </div>
      </div>
    </div>
  );
}
