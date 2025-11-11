// src/components/cinema/ui/CameraSidebar.jsx
// 🎥 Right sidebar showing:
// 1. Available camera devices (when camera is ON)
// 2. Remote users' camera feeds

import React from 'react';

export default function CameraSidebar({
  isCameraOn,
  availableCameras = [],
  selectedCameraId,
  onCameraSwitch,
  remoteCameraStreams = {}, // userId → MediaStream
  roomMembers = [],
  currentUserId
}) {
  if (!isCameraOn) return null;

  return (
    <div className="fixed right-0 top-0 bottom-20 w-64 bg-gray-900 border-l border-gray-700 overflow-y-auto z-40">
      {/* Camera Selection Section */}
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
          <span className="text-xl">🎥</span>
          Select Camera
        </h3>
        <div className="space-y-2">
          {availableCameras.map((camera, index) => (
            <button
              key={camera.deviceId}
              onClick={() => onCameraSwitch(camera.deviceId)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedCameraId === camera.deviceId
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate">
                  {camera.label || `Camera ${index + 1}`}
                </span>
                {selectedCameraId === camera.deviceId && (
                  <span className="text-green-400">✓</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Remote Camera Feeds */}
      {Object.keys(remoteCameraStreams).length > 0 && (
        <div className="p-4">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <span className="text-xl">👥</span>
            Other Cameras
          </h3>
          <div className="space-y-3">
            {Object.entries(remoteCameraStreams).map(([userId, stream]) => {
              const user = roomMembers.find(m => m.id === parseInt(userId));
              return (
                <div key={userId} className="bg-gray-800 rounded-lg overflow-hidden">
                  <div className="aspect-video bg-black relative">
                    <video
                      autoPlay
                      playsInline
                      muted={parseInt(userId) === currentUserId} // Mute own camera
                      ref={(videoElement) => {
                        if (videoElement && stream) {
                          videoElement.srcObject = stream;
                        }
                      }}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                      {user?.username || `User ${userId}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {Object.keys(remoteCameraStreams).length === 0 && (
        <div className="p-4">
          <div className="text-gray-500 text-sm text-center py-8">
            <div className="text-4xl mb-2">📹</div>
            <p>No other cameras active</p>
          </div>
        </div>
      )}
    </div>
  );
}
