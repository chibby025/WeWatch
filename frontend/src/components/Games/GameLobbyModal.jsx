// src/components/Games/GameLobbyModal.jsx
import { useState, useEffect } from 'react';
import { X, Gamepad2, Users } from 'lucide-react';

const games = [
  {
    id: 'tic_tac_toe',
    name: 'Tic Tac Toe',
    description: '3x3 grid - Get 3 in a row to win',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '⭕❌',
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'rock_paper_scissors',
    name: 'Rock Paper Scissors',
    description: '5-second countdown - Make your pick!',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '🪨📄✂️',
    disabled: false,
    type: 'multiplayer'
  }
];

const playerColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A'];

export default function GameLobbyModal({ isOpen, onClose, roomMembers, currentUserId, onStartGame }) {
  const [selectedGame, setSelectedGame] = useState('tic_tac_toe');
  const [selectedPlayers, setSelectedPlayers] = useState([currentUserId]);

  useEffect(() => {
    // Auto-select current user (host)
    if (currentUserId && !selectedPlayers.includes(currentUserId)) {
      setSelectedPlayers([currentUserId]);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (isOpen) {
      console.log('🎮 [GameLobbyModal] Modal opened!', {
        roomMembers: roomMembers?.length,
        currentUserId,
        selectedGame,
        selectedPlayers
      });
    }
  }, [isOpen, roomMembers, currentUserId, selectedGame, selectedPlayers]);

  const selectedGameData = games.find(g => g.id === selectedGame);

  const togglePlayerSelection = (playerId) => {
    if (playerId === currentUserId) {
      // Host cannot deselect themselves
      return;
    }

    setSelectedPlayers(prev => {
      if (prev.includes(playerId)) {
        return prev.filter(id => id !== playerId);
      } else {
        if (prev.length >= selectedGameData.maxPlayers) {
          return prev; // Max players reached
        }
        return [...prev, playerId];
      }
    });
  };

  const handleStartGame = () => {
    console.log('🎮 [GameLobbyModal] Start Game button clicked!', {
      selectedGame,
      selectedGameData: selectedGameData?.name,
      type: selectedGameData?.type,
      selectedPlayers,
      currentUserId
    });

    // Arcade games only need host
    if (selectedGameData.type === 'arcade') {
      const playersData = [{
        user_id: currentUserId,
        username: roomMembers.find(m => m.id === currentUserId)?.username || 'Player 1',
        color: playerColors[0]
      }];
      console.log('🎮 [GameLobbyModal] Arcade game - calling onStartGame with:', {
        game: selectedGame,
        players: playersData
      });
      onStartGame(selectedGame, playersData);
      onClose();
      return;
    }

    // Multiplayer games need player selection
    if (selectedPlayers.length < selectedGameData.minPlayers) {
      alert(`Please select at least ${selectedGameData.minPlayers} players`);
      return;
    }

    // Map selected players to player data with colors
    const playersData = selectedPlayers.map((playerId, index) => {
      const member = roomMembers.find(m => m.id === playerId);
      return {
        user_id: playerId,
        username: member?.username || `Player ${index + 1}`,
        color: playerColors[index]
      };
    });

    onStartGame(selectedGame, playersData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Gamepad2 className="w-6 h-6 text-purple-500" />
            <h2 className="text-2xl font-bold text-white">Start a Game</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Game Selection */}
        <div className="p-6 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Select Game</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {games.map(game => (
              <button
                key={game.id}
                onClick={() => {
                  console.log('🎮 [GameLobbyModal] Game card clicked:', game.id, 'disabled:', game.disabled);
                  if (!game.disabled) {
                    setSelectedGame(game.id);
                    console.log('🎮 [GameLobbyModal] Game selected:', game.id);
                  }
                }}
                disabled={game.disabled}
                className={`
                  p-4 rounded-lg border-2 transition-all
                  ${selectedGame === game.id
                    ? 'border-purple-500 bg-purple-500/20'
                    : 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                  }
                  ${game.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <div className="text-3xl mb-2">{game.icon}</div>
                <div className="text-white font-semibold text-sm mb-1">{game.name}</div>
                <div className="text-gray-400 text-xs">{game.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Player Selection */}
        <div className="p-6">
          {selectedGameData.type === 'arcade' ? (
            /* Arcade games - single player info */
            <div className="text-center py-6">
              <div className="text-6xl mb-4">🎮</div>
              <h3 className="text-xl font-bold text-white mb-2">Arcade Mode</h3>
              <p className="text-gray-400 mb-4">
                You play, everyone watches on the big screen!
              </p>
              <div className="bg-purple-500/20 border border-purple-500/50 rounded-lg p-4 max-w-md mx-auto">
                <p className="text-sm text-purple-300">
                  <span className="font-semibold">Player:</span> {roomMembers.find(m => m.id === currentUserId)?.username || 'You'}
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  All room members will see your gameplay on the cinema screen
                </p>
              </div>
            </div>
          ) : (
            /* Multiplayer games - player selection */
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Select Players ({selectedPlayers.length}/{selectedGameData.maxPlayers})
                </h3>
                <span className="text-sm text-gray-400">
                  Min: {selectedGameData.minPlayers} | Max: {selectedGameData.maxPlayers}
                </span>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {roomMembers.map((member, index) => {
                  const isSelected = selectedPlayers.includes(member.id);
              const isHost = member.id === currentUserId;
              const playerColorIndex = selectedPlayers.indexOf(member.id);

              return (
                <label
                  key={member.id}
                  className={`
                    flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
                    ${isSelected
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
                    }
                    ${isHost ? 'cursor-not-allowed opacity-80' : ''}
                  `}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => togglePlayerSelection(member.id)}
                    disabled={isHost}
                    className="w-5 h-5 rounded accent-purple-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{member.username}</span>
                      {isHost && (
                        <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">
                          Host
                        </span>
                      )}
                    </div>
                  </div>
                  {isSelected && playerColorIndex >= 0 && (
                    <div
                      className="w-6 h-6 rounded-full border-2 border-white"
                      style={{ backgroundColor: playerColors[playerColorIndex] }}
                    />
                  )}
                </label>
              );
            })}
          </div>

          {roomMembers.length < selectedGameData.minPlayers && selectedGameData.type === 'multiplayer' && (
            <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-yellow-400 text-sm">
                ⚠️ Not enough players in the room. Need at least {selectedGameData.minPlayers} players.
              </p>
            </div>
          )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStartGame}
            disabled={selectedPlayers.length < selectedGameData.minPlayers}
            className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Gamepad2 className="w-5 h-5" />
            Start Game
          </button>
        </div>
      </div>
    </div>
  );
}
