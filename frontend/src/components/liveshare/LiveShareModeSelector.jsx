// frontend/src/components/liveshare/LiveShareModeSelector.jsx
import { useState } from 'react';
import { Mic, Newspaper, Clapperboard, Video } from 'lucide-react';

const MODES = [
  {
    id: 'regular',
    name: 'Regular',
    icon: Video,
    gradient: 'from-blue-500/20 to-blue-600/20',
    maxGuests: 1,
  },
  {
    id: 'podcast',
    name: 'Podcast',
    icon: Mic,
    gradient: 'from-purple-500/20 to-purple-600/20',
    maxGuests: 1,
  },
  {
    id: 'show',
    name: 'Show',
    icon: Clapperboard,
    gradient: 'from-green-500/20 to-green-600/20',
    maxGuests: 1,
  },
  {
    id: 'news',
    name: 'News',
    icon: Newspaper,
    gradient: 'from-red-500/20 to-red-600/20',
    maxGuests: 0,
  },
];

export default function LiveShareModeSelector({ onModeSelect, onClose, watchType, embedded = false }) {
  const [selectedMode, setSelectedMode] = useState(null);

  // Filter modes based on watch type
  const getAvailableModes = () => {
    switch (watchType) {
      case '3d_cinema':
        // Cinema = Show only (theater context, can be minimal or branded)
        return MODES.filter(m => m.id === 'show');
      
      case 'classroom':
        // Classroom = Regular only (simple teaching mode)
        return MODES.filter(m => m.id === 'regular');
      
      case 'video':
      default:
        // VideoWatch = All modes (Zoom-like versatility)
        return MODES;
    }
  };

  const availableModes = getAvailableModes();

  const handleModeClick = (mode) => {
    setSelectedMode(mode.id);
    if (embedded) {
      // In wizard mode, immediately call onModeSelect
      onModeSelect(mode.id);
    }
  };

  const handleContinue = () => {
    if (selectedMode) {
      onModeSelect(selectedMode);
    }
  };

  // Embedded version (for wizard)
  if (embedded) {
    return (
      <div className="w-full flex flex-col h-full">
        <div className="space-y-2.5">
          {availableModes.map((mode) => {
            const IconComponent = mode.icon;
            return (
              <button
                key={mode.id}
                onClick={() => handleModeClick(mode)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                  selectedMode === mode.id
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 hover:border-gray-600 bg-gradient-to-r ' + mode.gradient
                }`}
              >
                {/* Icon */}
                <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  selectedMode === mode.id ? 'bg-blue-500/20' : 'bg-gray-800/50'
                }`}>
                  <IconComponent size={22} className={selectedMode === mode.id ? 'text-blue-400' : 'text-gray-400'} />
                </div>
                
                {/* Label */}
                <span className="text-base md:text-lg font-semibold text-white flex-1 text-left">
                  {mode.name}
                </span>

                {/* Selection Indicator */}
                {selectedMode === mode.id && (
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
      </div>
    );
  }

  // Standalone modal version (backwards compatibility)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-gray-700 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-6 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Select LiveShare Mode</h2>
              <p className="text-gray-400 text-sm">Choose how you want to broadcast</p>
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

        {/* Mode Cards - Vertical List */}
        <div className="p-6 space-y-2.5">
          {availableModes.map((mode) => {
            const IconComponent = mode.icon;
            return (
              <button
                key={mode.id}
                onClick={() => handleModeClick(mode)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                  selectedMode === mode.id
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 hover:border-gray-600 bg-gradient-to-r ' + mode.gradient
                }`}
              >
                {/* Icon */}
                <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  selectedMode === mode.id ? 'bg-blue-500/20' : 'bg-gray-800/50'
                }`}>
                  <IconComponent size={22} className={selectedMode === mode.id ? 'text-blue-400' : 'text-gray-400'} />
                </div>
                
                {/* Label */}
                <span className="text-base md:text-lg font-semibold text-white flex-1 text-left">
                  {mode.name}
                </span>

                {/* Selection Indicator */}
                {selectedMode === mode.id && (
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
            disabled={!selectedMode}
            className={`px-8 py-3 rounded-lg font-medium transition-all ${
              selectedMode
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
