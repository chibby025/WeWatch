// src/components/Games/GameLobbyModal.jsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Gamepad2, Users, ChevronLeft, ChevronRight, Search } from 'lucide-react';

// Posters live on BunnyCDN, not bundled into the frontend package — same CDN origin
// DoomGame.jsx/ShooterGame.jsx already hardcode for their own assets. Keeps the
// (growing) game-poster collection out of the deployed frontend bundle entirely.
const GAME_POSTERS_BASE_URL = 'https://letswatchout.b-cdn.net/games/posters';

const games = [
  {
    id: 'tic_tac_toe',
    name: 'Tic Tac Toe',
    description: '3x3 grid - Get 3 in a row to win',
    minPlayers: 2,
    maxPlayers: 2,
    image: `${GAME_POSTERS_BASE_URL}/ttt.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'rock_paper_scissors',
    name: 'Rock Paper Scissors',
    description: '5-second countdown - Make your pick!',
    minPlayers: 2,
    maxPlayers: 2,
    image: `${GAME_POSTERS_BASE_URL}/rps.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'chess',
    name: 'Chess',
    description: 'Classic strategy — checkmate your opponent',
    minPlayers: 2,
    maxPlayers: 2,
    image: `${GAME_POSTERS_BASE_URL}/chess.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'trivia',
    name: 'Trivia',
    description: 'Pick a topic — Film, Anime, Games & more!',
    minPlayers: 2,
    maxPlayers: 10,
    image: `${GAME_POSTERS_BASE_URL}/trivia.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'doom',
    name: 'DOOM',
    description: 'Classic vintage shooter — solo arcade mode',
    minPlayers: 1,
    maxPlayers: 1,
    image: `${GAME_POSTERS_BASE_URL}/doom.webp`,
    disabled: false,
    type: 'arcade',
    heavy: true
  },
  {
    id: 'space_shooter',
    name: 'Stellar Swarm',
    description: 'Real-time 3D dogfights — everyone\'s a real pilot',
    minPlayers: 1,
    maxPlayers: 8,
    image: `${GAME_POSTERS_BASE_URL}/stellarswarm.webp`,
    disabled: false,
    type: 'multiplayer',
    heavy: true
  },
  {
    id: 'othello',
    name: 'Othello',
    description: 'Flank your opponent\'s discs to flip the board',
    minPlayers: 2,
    maxPlayers: 2,
    image: `${GAME_POSTERS_BASE_URL}/othello.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'checkers',
    name: 'Checkers',
    description: 'Jump your way across the board — king me!',
    minPlayers: 2,
    maxPlayers: 2,
    image: `${GAME_POSTERS_BASE_URL}/checkers.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'crazy_eights',
    name: 'Crazy Eights',
    description: 'Match rank or suit — 8s are wild!',
    minPlayers: 2,
    maxPlayers: 6,
    image: `${GAME_POSTERS_BASE_URL}/crazy_eights.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'ludo',
    name: 'Ludo',
    description: 'Roll a 6, race your tokens home!',
    minPlayers: 2,
    maxPlayers: 4,
    image: `${GAME_POSTERS_BASE_URL}/ludo.webp`,
    disabled: false,
    type: 'multiplayer'
  },
];

const playerColors = ['#FF6B6B','#4ECDC4','#45B7D1','#FFA07A','#C77DFF','#80ED99','#FFD166','#F72585','#4CC9F0','#06D6A0'];

export default function GameLobbyModal({ isOpen, onClose, roomMembers, currentUserId, onStartGame, allowHeavyGames = true }) {
  const [selectedPlayers, setSelectedPlayers] = useState([currentUserId]);
  const [searchQuery, setSearchQuery] = useState('');
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Heavy 3D games (DOOM, Space Shooter) are VideoWatch-exclusive -- 3D Cinema
  // and Lecture Hall pass allowHeavyGames={false} to keep them out of the
  // picker entirely, rather than showing them disabled/broken.
  const visibleGames = allowHeavyGames ? games : games.filter(g => !g.heavy);

  // Search narrows the carousel down to matches only -- no dead-end cards you
  // can swipe to but can't actually select.
  const filteredGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return visibleGames;
    return visibleGames.filter(g => g.name.toLowerCase().includes(q));
  }, [visibleGames, searchQuery]);

  const selectedGameData = filteredGames[carouselIndex] || null;
  const selectedGame = selectedGameData?.id ?? null;

  // Keep the centered card stable across a filter change when it's still present
  // (don't jump away from what the user is looking at just because the filtered
  // list got shorter/longer) -- only reset to the top match when it disappears.
  const prevSelectedIdRef = useRef(selectedGame);
  useEffect(() => {
    const stillPresentIndex = filteredGames.findIndex(g => g.id === prevSelectedIdRef.current);
    if (stillPresentIndex >= 0) {
      setCarouselIndex(stillPresentIndex);
    } else {
      setCarouselIndex(0);
    }
  }, [filteredGames]);
  useEffect(() => { prevSelectedIdRef.current = selectedGame; }, [selectedGame]);

  const goTo = useCallback(
    (idx) => setCarouselIndex(Math.max(0, Math.min(idx, filteredGames.length - 1))),
    [filteredGames.length],
  );

  // Touch-drag swipe support, mirroring CommunityEventsCard's carousel.
  const carouselRef = useRef(null);
  const [carouselWidth, setCarouselWidth] = useState(420);
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const update = () => setCarouselWidth(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const txRef = useRef(null);
  const tyRef = useRef(null);
  const dragging = useRef(false);
  const horiz = useRef(false);
  const [dragX, setDragX] = useState(0);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const onStart = (e) => {
      txRef.current = e.touches[0].clientX;
      tyRef.current = e.touches[0].clientY;
      dragging.current = false;
      horiz.current = false;
    };
    const onMove = (e) => {
      if (txRef.current === null) return;
      const dx = e.touches[0].clientX - txRef.current;
      const dy = e.touches[0].clientY - tyRef.current;
      if (!horiz.current && !dragging.current) {
        if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) { horiz.current = true; }
        else if (Math.abs(dy) > 6) { txRef.current = null; return; }
      }
      if (horiz.current) { e.preventDefault(); dragging.current = true; setDragX(dx); }
    };
    const onEnd = (e) => {
      if (txRef.current === null) return;
      const dx = e.changedTouches[0].clientX - txRef.current;
      const was = dragging.current;
      txRef.current = null; dragging.current = false; horiz.current = false;
      setDragX(0);
      if (!was) return;
      if (dx < -40) goTo(carouselIndex + 1);
      else if (dx > 40) goTo(carouselIndex - 1);
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, [carouselIndex, goTo]);

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

  // Host can deselect themselves too — e.g. set up a Trivia match between two other
  // members and just run/spectate it. minPlayers/maxPlayers still gate the count.
  const togglePlayerSelection = (playerId) => {
    if (!selectedGameData) return;
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
    if (!selectedGameData) return;
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
        avatar_url: member?.avatar_url || null,
        color: playerColors[index]
      };
    });

    onStartGame(selectedGame, playersData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        {/* Header — purple banner, visually distinct from the dark modal body */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-gradient-to-r from-purple-600 to-blue-600 rounded-t-xl">
          <div className="flex items-center gap-2 sm:gap-3">
            <Gamepad2 className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
            <h2 className="text-xl sm:text-3xl font-bold text-white">Start a Game</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Game Selection — poster carousel */}
        <div className="px-4 sm:px-6 pt-3 pb-4 sm:pt-4 sm:pb-6 border-b border-gray-700">
          {/* Search */}
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search games…"
              className="w-full bg-gray-900/60 border border-gray-700 rounded-full pl-9 pr-3 py-1.5 sm:py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          {filteredGames.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              No games match "{searchQuery}"
            </div>
          ) : (
            <>
              {/* Title of the centered game */}
              <h3 className="text-center text-white font-bold text-base sm:text-lg mb-1 sm:mb-2 truncate transition-all">
                {selectedGameData?.name}
              </h3>

              {/* Poster fan */}
              <div ref={carouselRef} className="relative overflow-hidden" style={{ height: Math.max(90, Math.min(140, carouselWidth * 0.32)) * 1.46 + 20 }}>
                <button
                  onClick={() => goTo(carouselIndex - 1)}
                  disabled={carouselIndex === 0}
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-30 !min-h-0 !min-w-0 w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-white/90 shadow-lg rounded-full disabled:opacity-0 hover:bg-white transition-all"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-700" />
                </button>

                {filteredGames.map((game, i) => {
                  const offset = i - carouselIndex;
                  const absOffset = Math.abs(offset);
                  if (absOffset > 2.6) return null;

                  const isCenter = offset === 0;
                  const cardW = Math.max(90, Math.min(140, carouselWidth * 0.32));
                  const cardH = cardW * 1.46;
                  const step = cardW * 0.62;
                  const scale = isCenter ? 1 : Math.max(0.7, 1 - absOffset * 0.15);
                  const translateX = offset * step + dragX;
                  const opacity = absOffset > 2 ? 0.25 : absOffset > 1 ? 0.6 : 1;
                  const zIndex = 20 - Math.round(absOffset) * 5;
                  const transition = dragX !== 0
                    ? 'opacity 0.1s ease'
                    : 'transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.3s ease';

                  return (
                    <div
                      key={game.id}
                      onClick={() => goTo(i)}
                      style={{
                        position: 'absolute',
                        width: cardW,
                        height: cardH,
                        left: '50%',
                        top: '50%',
                        transform: `translate(calc(-50% + ${translateX}px), -50%) scale(${scale})`,
                        zIndex,
                        opacity,
                        borderRadius: 12,
                        overflow: 'hidden',
                        transition,
                        cursor: 'pointer',
                        boxShadow: isCenter
                          ? '0 16px 40px rgba(0,0,0,0.7), 0 0 0 2px rgba(168,85,247,0.8)'
                          : '0 6px 18px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.12)',
                        willChange: 'transform, opacity',
                      }}
                    >
                      <img src={game.image} alt={game.name} className="w-full h-full object-cover" />
                      {game.disabled && (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                          <span className="text-white text-[10px] font-semibold">Coming Soon</span>
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  onClick={() => goTo(carouselIndex + 1)}
                  disabled={carouselIndex === filteredGames.length - 1}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-30 !min-h-0 !min-w-0 w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-white/90 shadow-lg rounded-full disabled:opacity-0 hover:bg-white transition-all"
                >
                  <ChevronRight className="w-4 h-4 text-gray-700" />
                </button>
              </div>

              {/* Dot indicators */}
              {filteredGames.length > 1 && (
                <div className="flex justify-center gap-1 sm:gap-1.5 mt-2 sm:mt-3">
                  {filteredGames.map((game, index) => (
                    <button
                      key={game.id}
                      onClick={() => goTo(index)}
                      className={`transition-all rounded-full !min-h-0 !min-w-0 ${
                        index === carouselIndex ? 'w-3 sm:w-5 h-1 sm:h-1.5 bg-purple-500' : 'w-1 sm:w-1.5 h-1 sm:h-1.5 bg-gray-600 hover:bg-gray-500'
                      }`}
                      aria-label={`Go to ${game.name}`}
                    />
                  ))}
                </div>
              )}

              {/* Description + min/max, for the centered game */}
              {selectedGameData && (
                <div className="text-center mt-2 sm:mt-3">
                  <p className="text-gray-400 text-[11px] sm:text-xs leading-snug max-w-md mx-auto">{selectedGameData.description}</p>
                  <p className="text-gray-500 text-[10px] sm:text-[11px] mt-1">
                    {selectedGameData.type === 'arcade'
                      ? 'Solo arcade'
                      : `${selectedGameData.minPlayers}–${selectedGameData.maxPlayers} players`}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Player Selection */}
        <div className="px-4 sm:px-6 py-3 sm:py-6">
          {!selectedGameData ? null : selectedGameData.type === 'arcade' ? (
            /* Arcade games - single player info */
            <div className="text-center py-2 sm:py-6">
              <div className="text-4xl sm:text-6xl mb-2 sm:mb-4">🎮</div>
              <h3 className="text-base sm:text-xl font-bold text-white mb-1 sm:mb-2">Arcade Mode</h3>
              <p className="text-gray-400 text-sm mb-2 sm:mb-4">
                You play, everyone watches on the big screen!
              </p>
              <div className="bg-purple-500/20 border border-purple-500/50 rounded-lg p-3 sm:p-4 max-w-md mx-auto">
                <p className="text-xs sm:text-sm text-purple-300">
                  <span className="font-semibold">Player:</span> {roomMembers.find(m => m.id === currentUserId)?.username || 'You'}
                </p>
                <p className="text-[11px] sm:text-xs text-gray-400 mt-1 sm:mt-2">
                  All room members will see your gameplay on the cinema screen
                </p>
              </div>
            </div>
          ) : (
            /* Multiplayer games - player selection */
            <>
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                <h3 className="text-sm sm:text-lg font-semibold text-white flex items-center gap-1.5 sm:gap-2">
                  <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                  Select Players ({selectedPlayers.length}/{selectedGameData.maxPlayers})
                </h3>
                <span className="text-xs sm:text-sm text-gray-400">
                  Min: {selectedGameData.minPlayers} | Max: {selectedGameData.maxPlayers}
                </span>
              </div>

              {/* 2-column on mobile to use width instead of height; single column from sm up */}
              <div className="grid grid-cols-2 sm:grid-cols-1 gap-2 max-h-32 sm:max-h-48 overflow-y-auto">
                {/* Deduplicate by id before rendering */}
                {roomMembers.filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i).map((member) => {
                  const isSelected = selectedPlayers.includes(member.id);
                  const isHost = member.id === currentUserId;
                  const playerColorIndex = selectedPlayers.indexOf(member.id);
                  const initials = (member.username || '?').slice(0, 2).toUpperCase();

                  return (
                    <label
                      key={member.id}
                      onClick={() => togglePlayerSelection(member.id)}
                      className={`
                        flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border transition-all min-w-0
                        ${isSelected
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
                        }
                        cursor-pointer
                      `}
                    >
                      {/* Avatar */}
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full overflow-hidden flex-shrink-0 bg-gray-600 flex items-center justify-center">
                        {member.avatar_url ? (
                          <img src={member.avatar_url} alt={member.username} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] sm:text-xs font-bold text-white">{initials}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                          <span className="text-white font-medium text-xs sm:text-base truncate">{member.username}</span>
                          {isHost && (
                            <span className="text-[10px] sm:text-xs bg-yellow-500/20 text-yellow-400 px-1.5 sm:px-2 py-0.5 rounded flex-shrink-0 truncate">
                              Host{!isSelected && selectedGameData.type !== 'arcade' ? ' · spectating' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      {isSelected && playerColorIndex >= 0 && (
                        <div
                          className="w-4 h-4 sm:w-6 sm:h-6 rounded-full border-2 border-white flex-shrink-0"
                          style={{ backgroundColor: playerColors[playerColorIndex] }}
                        />
                      )}
                    </label>
                  );
                })}
          </div>

          {roomMembers.length < selectedGameData.minPlayers && selectedGameData.type === 'multiplayer' && (
            <div className="mt-2 sm:mt-4 p-2 sm:p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-yellow-400 text-xs sm:text-sm">
                ⚠️ Not enough players in the room. Need at least {selectedGameData.minPlayers} players.
              </p>
            </div>
          )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-6 border-t border-gray-700 flex justify-end gap-2 sm:gap-3">
          <button
            onClick={onClose}
            className="px-4 sm:px-6 py-1.5 sm:py-2 text-sm sm:text-base bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStartGame}
            disabled={!selectedGameData || selectedPlayers.length < selectedGameData.minPlayers}
            className="px-4 sm:px-6 py-1.5 sm:py-2 text-sm sm:text-base bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Gamepad2 className="w-4 h-4 sm:w-5 sm:h-5" />
            Start Game
          </button>
        </div>
      </div>
    </div>
  );
}
