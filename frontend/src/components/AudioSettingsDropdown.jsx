// frontend/src/components/AudioSettingsDropdown.jsx
import React, { useRef, useEffect } from 'react';
import { playSilenceOnSound, playSilenceOffSound, playMicOnSound, playMicOffSound } from '../utils/audio';

export default function AudioSettingsDropdown({
  isOpen,
  onClose,
  isAudioActive,
  onToggleAudio,
  isSilenceMode,
  onToggleSilenceMode,
  audioDevices = [],
  selectedAudioDeviceId,
  onAudioDeviceChange,
  anchorRef,
}) {
  const dropdownRef = useRef(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        anchorRef?.current &&
        !anchorRef.current.contains(e.target)
      ) {
        onClose();
      }
    };

    // Delay to avoid immediate close from same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  // Position the dropdown above the taskbar
  const style = {
    position: 'fixed',
    bottom: '90px', // Above taskbar
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1100,
  };

  return (
    <div
      ref={dropdownRef}
      style={style}
      className="bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-4 min-w-[280px]"
    >
      <h3 className="text-white font-semibold text-sm mb-3">Audio Settings</h3>

      {/* Mute Microphone Checkbox */}
      <label className="flex items-center gap-3 mb-3 cursor-pointer hover:bg-gray-700/50 p-2 rounded">
        <input
          type="checkbox"
          checked={!isAudioActive}
          onChange={(e) => {
            onToggleAudio();
            // Play sound feedback
            if (e.target.checked) {
              playMicOffSound();
            } else {
              playMicOnSound();
            }
          }}
          className="w-4 h-4 accent-blue-500"
        />
        <span className="text-white text-sm">Mute My Microphone</span>
      </label>

      {/* Watch in Silence Checkbox */}
      <label className="flex items-center gap-3 mb-4 cursor-pointer hover:bg-gray-700/50 p-2 rounded">
        <input
          type="checkbox"
          checked={isSilenceMode}
          onChange={(e) => {
            onToggleSilenceMode();
            // Play sound feedback
            if (e.target.checked) {
              playSilenceOnSound();
            } else {
              playSilenceOffSound();
            }
          }}
          className="w-4 h-4 accent-blue-500"
        />
        <span className="text-white text-sm">Watch in Silence</span>
      </label>

      {/* Divider */}
      <div className="border-t border-gray-600 my-3"></div>

      {/* Microphone Device Selector */}
      <div>
        <label className="text-gray-400 text-xs mb-2 block">Microphone Device:</label>
        <select
          value={selectedAudioDeviceId || ''}
          onChange={(e) => onAudioDeviceChange?.(e.target.value)}
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {audioDevices.length === 0 ? (
            <option value="">No devices found</option>
          ) : (
            audioDevices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${index + 1}`}
              </option>
            ))
          )}
        </select>
      </div>

      {/* Info Text */}
      {isSilenceMode && (
        <p className="text-xs text-gray-400 mt-3 italic">
          🔇 Silence mode: You'll only hear media and host screen share audio
        </p>
      )}
    </div>
  );
}
