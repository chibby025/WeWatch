import React from 'react';

const BeginWatchModal = ({
  isImmersiveMode,
  setIsImmersiveMode,
  selectedTheme,
  setSelectedTheme,
  setIs3DMode,
  setSeats,
  setUserSeats,
}) => {
  // Initialize seating when Cinema is selected
  const handleStartExperience = () => {
    // Apply theme to room
    document.querySelector('.room-container')?.classList.remove('cinema', 'stadium', 'rave', 'church');
    document.querySelector('.room-container')?.classList.add(selectedTheme);

    // Initialize seating for Cinema mode
    if (selectedTheme === 'cinema') {
      const newSeats = [];
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 8; col++) {
          newSeats.push({
            id: `${row}-${col}`,
            row,
            col,
            occupied: false,
            userId: null
          });
        }
      }
      setSeats(newSeats);
      setUserSeats({});
      alert('🎬 Cinema mode activated! Click a seat to sit down.');
    }

    // Enter 3D mode (if host + paid — Phase 2)
    // if (selectedTheme === 'cinema' && isHost && room.is_3d_unlocked) {
    //   setIs3DMode(true);
    // }

    setIsImmersiveMode(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Choose Your Experience</h2>
          <button
            onClick={() => setIsImmersiveMode(false)}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ×
          </button>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-6">
          {[
            { id: 'cinema', name: 'Cinema', icon: '🎬' },
            { id: 'stadium', name: 'Stadium', icon: '⚽' },
            { id: 'rave', name: 'Rave', icon: '🎉' },
            { id: 'church', name: 'Church', icon: '⛪' },
            
          ].map((theme) => (
            <button
              key={theme.id}
              onClick={() => setSelectedTheme(theme.id)}
              className={`p-4 border-2 rounded-lg text-center transition-all duration-200 transform hover:scale-105 ${
                selectedTheme === theme.id
                  ? 'border-purple-500 bg-purple-50 shadow-md'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="text-2xl mb-2">{theme.icon}</div>
              <div className="font-medium">{theme.name}</div>
            </button>
          ))}
        </div>

        {/* Cinema Mode Seating Toggle */}
        {selectedTheme === 'cinema' && (
          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded">
            <label className="flex items-center">
              <input
                type="checkbox"
                defaultChecked={true}
                className="mr-2"
              />
              <span className="text-sm font-medium">Enable Seating Arrangement</span>
            </label>
            <p className="text-xs text-gray-500 mt-1">
              Sit with friends — only hear nearby seats.
            </p>
          </div>
        )}

        <div className="flex justify-end space-x-3">
          <button
            onClick={() => setIsImmersiveMode(false)}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={handleStartExperience}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors duration-150"
          >
            Start Experience
          </button>
        </div>
      </div>
    </div>
  );
};

export default BeginWatchModal;