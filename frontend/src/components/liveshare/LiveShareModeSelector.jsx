// frontend/src/components/liveshare/LiveShareModeSelector.jsx
import { useState } from 'react';

const MODES = [
  {
    id: 'regular',
    name: 'Regular',
    icon: '📺',
    description: 'Classic screen share - perfect for presentations and demos',
    gradient: 'from-blue-500/20 to-blue-600/20',
    maxGuests: 1,
  },
  {
    id: 'podcast',
    name: 'Podcast',
    icon: '🎙️',
    description: 'Side-by-side layout for conversations and interviews',
    gradient: 'from-purple-500/20 to-purple-600/20',
    maxGuests: 1,
  },
  {
    id: 'interview',
    name: 'Interview',
    icon: '🎬',
    description: '60/40 split - ideal for host + guest format',
    gradient: 'from-green-500/20 to-green-600/20',
    maxGuests: 1,
  },
  {
    id: 'news',
    name: 'News Anchor',
    icon: '📰',
    description: 'Solo centered view - broadcasting to audience',
    gradient: 'from-red-500/20 to-red-600/20',
    maxGuests: 0,
  },
  {
    id: 'standup',
    name: 'Stand-up',
    icon: '🎤',
    description: 'Solo spotlight - comedy, presentations, performances',
    gradient: 'from-yellow-500/20 to-yellow-600/20',
    maxGuests: 0,
  },
];

export default function LiveShareModeSelector({ onModeSelect, onClose, watchType }) {
  const [selectedMode, setSelectedMode] = useState(null);

  const handleModeClick = (mode) => {
    setSelectedMode(mode.id);
  };

  const handleContinue = () => {
    if (selectedMode) {
      onModeSelect(selectedMode);
    }
  };

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

        {/* Mode Cards Grid */}
        <div className="p-4 grid grid-cols-2 gap-2">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => handleModeClick(mode)}
              className={`relative p-3 rounded-lg border-2 transition-all ${
                selectedMode === mode.id
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-700 hover:border-gray-600 bg-gradient-to-br ' + mode.gradient
              }`}
            >
              {/* Selection Indicator */}
              {selectedMode === mode.id && (
                <div className="absolute top-2 right-2">
                  <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              )}

              {/* Mode Content */}
              <div className="flex flex-col items-center gap-2">
                <div className="text-2xl">{mode.icon}</div>
                <h3 className="text-sm font-semibold text-white text-center">{mode.name}</h3>
              </div>
            </button>
          ))}
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
