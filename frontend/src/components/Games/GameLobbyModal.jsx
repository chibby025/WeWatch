// src/components/Games/GameLobbyModal.jsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Gamepad2, Users, ChevronLeft, ChevronRight, Search, Trophy, AlertTriangle } from 'lucide-react';

// Posters live on BunnyCDN, not bundled into the frontend package — same CDN origin
// DoomGame.jsx already hardcodes for its own assets. Keeps the
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
    id: 'vs_battle',
    name: 'VS Battle',
    description: 'Create death battles between your favourite characters.',
    minPlayers: 2,
    maxPlayers: 2,
    image: `${GAME_POSTERS_BASE_URL}/vs_battle.webp`,
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
    id: 'rebus_round',
    name: 'Rebus Round',
    description: 'A picture puzzle appears — type the phrase it\'s hinting at before anyone else!',
    minPlayers: 2,
    maxPlayers: 10,
    image: `${GAME_POSTERS_BASE_URL}/v2/rebus_round.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'four_frames',
    name: 'Four Frames',
    description: 'Four real photos, one hidden word — race to guess what connects them!',
    minPlayers: 2,
    maxPlayers: 10,
    image: `${GAME_POSTERS_BASE_URL}/four_frames.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'karaoke',
    name: 'Music Warrior',
    description: 'Search a song, pick an instrumental, and sing along together with synced lyrics!',
    minPlayers: 1,
    maxPlayers: 10,
    image: `${GAME_POSTERS_BASE_URL}/v2/karaoke.webp`,
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
    id: 'quake3',
    name: 'Quake Death Match',
    description: 'Real arena FPS multiplayer — everyone drops into the same match!',
    minPlayers: 1,
    maxPlayers: 8,
    image: `${GAME_POSTERS_BASE_URL}/quake3.webp`,
    disabled: false,
    type: 'multiplayer',
    heavy: true
  },
  {
    id: 'micro_racing',
    name: 'Micro Racing',
    description: 'Real isometric kart racing multiplayer — pick a car, pick a track, race for the checkered flag!',
    minPlayers: 1,
    maxPlayers: 6,
    image: `${GAME_POSTERS_BASE_URL}/v2/micro_racing.webp`,
    disabled: false,
    type: 'multiplayer',
    heavy: true
  },
  {
    id: 'obby_parkour',
    name: 'Obby Parkour',
    description: 'Real Roblox-style multiplayer parkour — jump, climb, and race everyone else to the top of the course!',
    minPlayers: 1,
    maxPlayers: 8,
    image: `${GAME_POSTERS_BASE_URL}/v2/obby_parkour.webp`,
    disabled: false,
    type: 'multiplayer',
    heavy: true
  },
  {
    id: 'fowl_play',
    name: 'Fowl Play',
    description: 'Shoot the ducks before they fly away!',
    minPlayers: 1,
    maxPlayers: 1,
    image: `${GAME_POSTERS_BASE_URL}/fowl_play_v2.webp`,
    disabled: false,
    type: 'arcade',
    heavy: false
  },
  {
    id: 'othello',
    name: 'Othello',
    description: 'Flank your opponent\'s discs to flip the board',
    minPlayers: 2,
    maxPlayers: 2,
    image: `${GAME_POSTERS_BASE_URL}/v2/othello.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'checkers',
    name: 'Checkers',
    description: 'Jump your way across the board — king me!',
    minPlayers: 2,
    maxPlayers: 2,
    image: `${GAME_POSTERS_BASE_URL}/v2/checkers.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'crazy_eights',
    name: 'Crazy Eights',
    description: 'Match rank or suit — 8s are wild!',
    minPlayers: 2,
    maxPlayers: 6,
    image: `${GAME_POSTERS_BASE_URL}/v2/crazy_eights.webp`,
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
  {
    id: 'connect_four',
    name: 'Connect Four',
    description: 'Drop discs — first to 4 in a row wins!',
    minPlayers: 2,
    maxPlayers: 2,
    image: `${GAME_POSTERS_BASE_URL}/connect_four.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'would_you_rather',
    name: 'Would You Rather',
    description: 'Pick A or B — see how the room voted!',
    minPlayers: 1,
    maxPlayers: 20,
    image: `${GAME_POSTERS_BASE_URL}/would_you_rather.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'wordle',
    name: 'Wordle',
    description: 'Same secret word — race to guess it first!',
    minPlayers: 1,
    maxPlayers: 8,
    image: `${GAME_POSTERS_BASE_URL}/wordle.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'uno',
    name: 'UNO',
    description: 'Match cards, play wilds — shout UNO at 1 card!',
    minPlayers: 2,
    maxPlayers: 8,
    image: `${GAME_POSTERS_BASE_URL}/uno.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'typing_race',
    name: 'Typing Race',
    description: 'Type the passage fastest — WPM battle!',
    minPlayers: 1,
    maxPlayers: 8,
    image: `${GAME_POSTERS_BASE_URL}/typing_race.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'blackjack',
    name: 'Blackjack',
    description: 'Beat the dealer to 21 — hit, stand, or double!',
    minPlayers: 1,
    maxPlayers: 6,
    image: `${GAME_POSTERS_BASE_URL}/blackjack.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'battleship',
    name: 'Battleship',
    description: 'Place your fleet, sink your rival\'s ships!',
    minPlayers: 2,
    maxPlayers: 2,
    image: `${GAME_POSTERS_BASE_URL}/battleship.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'snakes_ladders',
    name: 'Snakes & Ladders',
    description: 'Roll the dice — climb ladders, dodge snakes, race to 100!',
    minPlayers: 2,
    maxPlayers: 4,
    image: `${GAME_POSTERS_BASE_URL}/snakes_ladders.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'mancala',
    name: 'Mancala',
    description: "Sow your seeds, capture your opponent's — fill your store to win!",
    minPlayers: 2,
    maxPlayers: 2,
    image: `${GAME_POSTERS_BASE_URL}/mancala.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'ramp_rush',
    name: 'Ramp Rush',
    description: 'Tap to charge your engine, launch, and clear the course — best driver wins!',
    minPlayers: 2,
    maxPlayers: 2,
    image: `${GAME_POSTERS_BASE_URL}/ramp_rush.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'jigsaw',
    name: 'Jigsaw Puzzle',
    description: 'Fully cooperative — everyone works the same puzzle together in real time!',
    minPlayers: 1,
    maxPlayers: 8,
    image: `${GAME_POSTERS_BASE_URL}/jigsaw_v2.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'wordsmith',
    name: 'Wordsmith',
    description: 'Build words on a shared board — premium squares score big!',
    minPlayers: 2,
    maxPlayers: 4,
    image: `${GAME_POSTERS_BASE_URL}/scrabble_v2.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'backgammon',
    name: 'Backgammon',
    description: 'Race your checkers home — roll, hit, and bear off first!',
    minPlayers: 2,
    maxPlayers: 2,
    image: `${GAME_POSTERS_BASE_URL}/backgammon.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'texas_holdem',
    name: "Texas Hold'em",
    description: 'Symbolic-chip poker tournament — last player standing wins!',
    minPlayers: 2,
    maxPlayers: 8,
    image: `${GAME_POSTERS_BASE_URL}/texas_holdem.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'draw_guess',
    name: 'Draw & Guess',
    description: 'One draws, everyone guesses — race the clock!',
    minPlayers: 2,
    maxPlayers: 8,
    image: `${GAME_POSTERS_BASE_URL}/draw_guess.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  // boxing temporarily removed — being redesigned as Phaser 3 + Colyseus real-time game
  // {
  //   id: 'boxing',
  //   name: 'Boxing',
  //   description: 'Punch-Out style 1v1 — read the tell, pick your defense!',
  //   minPlayers: 2,
  //   maxPlayers: 2,
  //   image: `${GAME_POSTERS_BASE_URL}/boxing.webp`,
  //   disabled: false,
  //   type: 'multiplayer'
  // },
  {
    id: 'pool',
    name: 'Pool',
    description: '8-ball billiards — pot your balls, then sink the black!',
    minPlayers: 2,
    maxPlayers: 2,
    image: `${GAME_POSTERS_BASE_URL}/pool.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  // penalty_shootout temporarily removed
  // {
  //   id: 'penalty_shootout',
  //   name: 'Penalty Shootout',
  //   description: 'Take 5 penalties against an AI keeper — hot-seat tournament mode!',
  //   minPlayers: 1,
  //   maxPlayers: 10,
  //   image: `${GAME_POSTERS_BASE_URL}/penalty_shootout.webp`,
  //   disabled: false,
  //   type: 'arcade'
  // },
  {
    id: 'whot',
    name: 'Whot!',
    description: 'West African classic — match suit or number, play Whot to call the suit!',
    minPlayers: 2,
    maxPlayers: 6,
    image: `${GAME_POSTERS_BASE_URL}/whot.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'hangman',
    name: 'Hangman',
    description: 'Guess the hidden word — one letter at a time!',
    minPlayers: 2,
    maxPlayers: 8,
    image: `${GAME_POSTERS_BASE_URL}/hangman.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'sudoku',
    name: 'Sudoku Race',
    description: 'Same puzzle — first correct grid wins!',
    minPlayers: 1,
    maxPlayers: 8,
    image: `${GAME_POSTERS_BASE_URL}/sudoku.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'ping_pong',
    name: 'Ping Pong',
    description: 'Aim your shot, block the return — first to 7!',
    minPlayers: 2,
    maxPlayers: 2,
    image: `${GAME_POSTERS_BASE_URL}/ping_pong.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'air_hockey',
    name: 'Air Hockey',
    description: '5 aim zones + bank shots — first to 5 goals!',
    minPlayers: 2,
    maxPlayers: 2,
    image: `${GAME_POSTERS_BASE_URL}/air_hockey.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  // red_light_green_light temporarily removed
  // {
  //   id: 'red_light_green_light',
  //   name: 'Red Light Green Light',
  //   description: 'Move on green, freeze on red — reach the finish!',
  //   minPlayers: 2,
  //   maxPlayers: 10,
  //   image: `${GAME_POSTERS_BASE_URL}/red_light_green_light.webp`,
  //   disabled: false,
  //   type: 'multiplayer'
  // },
  {
    id: 'glass_bridge',
    name: 'Glass Bridge',
    description: 'Left or right? One path holds — cross without falling!',
    minPlayers: 2,
    maxPlayers: 6,
    image: `${GAME_POSTERS_BASE_URL}/glass_bridge.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'tug_of_war',
    name: 'Tug of War',
    description: 'Mash to pull the rope — best of 3 rounds!',
    minPlayers: 2,
    maxPlayers: 8,
    image: `${GAME_POSTERS_BASE_URL}/tug_of_war.webp`,
    disabled: false,
    type: 'multiplayer'
  },
  {
    id: 'space_attack',
    name: 'Space Attack',
    description: 'Nokia Space Impact-style side-scroller — dodge and blast enemies flying in from the right!',
    minPlayers: 1,
    maxPlayers: 1,
    image: `${GAME_POSTERS_BASE_URL}/space_attack.webp`,
    disabled: false,
    type: 'arcade',
    heavy: false
  },
  {
    id: 'toad_ball',
    name: 'Toad Ball',
    description: 'Aim, fire, and match 3+ colored orbs before the chain reaches the bog — solo or hot-seat tournament!',
    minPlayers: 1,
    maxPlayers: 1,
    image: `${GAME_POSTERS_BASE_URL}/v2/toad_ball.webp`,
    disabled: false,
    type: 'arcade',
    heavy: false
  },
  {
    id: 'golf',
    name: 'Mini Golf',
    description: 'Putt through a real 3D course — fewest strokes wins! Solo practice or hot-seat tournament.',
    minPlayers: 1,
    maxPlayers: 1,
    image: `${GAME_POSTERS_BASE_URL}/v2/golf.webp`,
    disabled: false,
    type: 'arcade',
    heavy: true
  },
  // roulette temporarily removed
  // {
  //   id: 'roulette',
  //   name: 'Roulette',
  //   description: 'Place your bets, spin the wheel — red, black, or lucky number!',
  //   minPlayers: 1,
  //   maxPlayers: 8,
  //   image: `${GAME_POSTERS_BASE_URL}/roulette.webp`,
  //   disabled: false,
  //   type: 'multiplayer'
  // },
];

// Games eligible for tournament mode: 2-player, head-to-head games where a
// single-elimination "winner advances" bracket makes sense. N-player party games
// (draw_guess, typing_race, trivia, etc.) are excluded.
const TOURNAMENT_GAME_IDS = ['tic_tac_toe', 'chess', 'othello', 'checkers', 'connect_four', 'battleship', 'pool', 'mancala', 'backgammon', 'ramp_rush'];
// Hot-seat tournament: each player takes a solo turn; highest score wins
// (golf is the one exception — lower stroke count wins, handled entirely
// backend-side via lowerScoreWinsGameTypes in websocket_handler.go).
const HOT_SEAT_GAME_IDS = ['fowl_play', 'toad_ball', 'golf'];

const playerColors = ['#FF6B6B','#4ECDC4','#45B7D1','#FFA07A','#C77DFF','#80ED99','#FFD166','#F72585','#4CC9F0','#06D6A0'];

export default function GameLobbyModal({
  isOpen, onClose, roomMembers, currentUserId, onStartGame, onCreateTournament, onCreateHotSeatTournament,
  allowHeavyGames = true, activeGame = null, onEndGame, isHost = false,
  // readOnly: a live mirror of the HOST's own modal, rendered for every other
  // member so the whole room sees what the host is currently browsing before
  // they commit — driven entirely by syncedGameId (from a WS broadcast), no
  // local navigation of its own. onCarouselChange is the host-side counterpart:
  // called whenever the *host's* own carouselIndex settles on a new game, so
  // the parent can broadcast it.
  readOnly = false, syncedGameId = null, hostName = 'The host', onCarouselChange,
}) {
  const [selectedPlayers, setSelectedPlayers] = useState([currentUserId]);
  const [searchQuery, setSearchQuery] = useState('');
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [isTournamentMode, setIsTournamentMode] = useState(false);
  const [noWalls, setNoWalls] = useState(false);
  const [rampRushFormat, setRampRushFormat] = useState('best_of_5');
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== 'undefined' ? window.matchMedia('(orientation: landscape)').matches : false
  );
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 768 : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    const handler = (e) => setIsLandscape(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  // True 2-column layout: landscape on desktop/tablet. Mobile landscape stays fullscreen.
  const isWideLayout = isLandscape && isDesktop;

  // Heavy 3D games (DOOM) are VideoWatch-exclusive -- 3D Cinema
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
  // Skipped entirely in readOnly mode, which has its own sync effect below —
  // there's no search box there to trigger a "filter changed" case anyway.
  const prevSelectedIdRef = useRef(selectedGame);
  useEffect(() => {
    if (readOnly) return;
    const stillPresentIndex = filteredGames.findIndex(g => g.id === prevSelectedIdRef.current);
    if (stillPresentIndex >= 0) {
      setCarouselIndex(stillPresentIndex);
    } else {
      setCarouselIndex(0);
    }
  }, [filteredGames, readOnly]);
  useEffect(() => { prevSelectedIdRef.current = selectedGame; }, [selectedGame]);

  // readOnly: mirror whichever game the host is currently centered on.
  useEffect(() => {
    if (!readOnly) return;
    const idx = filteredGames.findIndex(g => g.id === syncedGameId);
    if (idx >= 0) setCarouselIndex(idx);
  }, [readOnly, syncedGameId, filteredGames]);

  // Host mode: tell the parent every time the centered game changes (including
  // the initial mount) so it can broadcast it to the room over WS.
  useEffect(() => {
    if (readOnly || !onCarouselChange) return;
    onCarouselChange(selectedGame);
  }, [readOnly, onCarouselChange, selectedGame]);

  // A no-op in readOnly mode disables every navigation path at once (chevrons,
  // dots, poster taps, touch swipe) — the carousel there is purely a mirror of
  // syncedGameId, never locally driven.
  const goTo = useCallback(
    (idx) => { if (!readOnly) setCarouselIndex(Math.max(0, Math.min(idx, filteredGames.length - 1))); },
    [filteredGames.length, readOnly],
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
  const cardW = isWideLayout
    ? Math.max(160, Math.min(280, carouselWidth * 0.32))  // desktop/tablet: big posters
    : isLandscape
      ? Math.max(75, Math.min(110, carouselWidth * 0.25))  // mobile landscape: compact
      : Math.max(130, Math.min(190, carouselWidth * 0.38)); // portrait: original

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
    const cap = isTournamentMode ? 8 : selectedGameData.maxPlayers;
    setSelectedPlayers(prev => {
      if (prev.includes(playerId)) return prev.filter(id => id !== playerId);
      if (prev.length >= cap) return prev;
      return [...prev, playerId];
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

    // Map selected players to player data with colors (shared by all paths)
    const buildPlayersData = () => selectedPlayers.map((playerId, index) => {
      const member = roomMembers.find(m => m.id === playerId);
      return {
        user_id: playerId,
        username: member?.username || `Player ${index + 1}`,
        avatar_url: member?.avatar_url || null,
        color: playerColors[index]
      };
    });

    // Arcade hot-seat tournament (fowl_play with tournament mode on)
    if (selectedGameData.type === 'arcade' && isTournamentMode && HOT_SEAT_GAME_IDS.includes(selectedGame)) {
      if (selectedPlayers.length < 2) {
        alert('A hot-seat tournament needs at least 2 players');
        return;
      }
      if (onCreateHotSeatTournament) onCreateHotSeatTournament(selectedGame, buildPlayersData());
      onClose();
      return;
    }

    // Arcade games (solo) — only need host, no player selection
    if (selectedGameData.type === 'arcade') {
      const playersData = [{
        user_id: currentUserId,
        username: roomMembers.find(m => m.id === currentUserId)?.username || 'Player 1',
        color: playerColors[0]
      }];
      onStartGame(selectedGame, playersData);
      onClose();
      return;
    }

    // Bracket tournament mode (multiplayer games)
    if (isTournamentMode) {
      if (selectedPlayers.length < 4 || selectedPlayers.length > 16) {
        alert('A tournament needs 4–16 players');
        return;
      }
      if (onCreateTournament) onCreateTournament(selectedGame, buildPlayersData());
      onClose();
      return;
    }

    // Normal multiplayer
    if (selectedPlayers.length < selectedGameData.minPlayers) {
      alert(`Please select at least ${selectedGameData.minPlayers} players`);
      return;
    }

    const gameOptions = selectedGame === 'ping_pong'
      ? { no_walls: noWalls }
      : selectedGame === 'ramp_rush'
        ? { format: rampRushFormat }
        : {};
    onStartGame(selectedGame, buildPlayersData(), gameOptions);
    onClose();
  };

  // Reset tournament mode when switching to a game that doesn't support it
  useEffect(() => {
    const supportsAnyTournament = TOURNAMENT_GAME_IDS.includes(selectedGame) || HOT_SEAT_GAME_IDS.includes(selectedGame);
    if (!supportsAnyTournament) setIsTournamentMode(false);
  }, [selectedGame]);

  if (!isOpen) return null;

  // ── Active game screen ──────────────────────────────────────────────────────
  // When a game is already running, show an info/end-game card instead of the
  // full picker so the host can end the current game from this modal.
  if (activeGame) {
    const gameData = games.find(g => g.id === activeGame.game_type);
    const activePlayers = Array.isArray(activeGame.players) ? activeGame.players : [];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xs sm:max-w-sm mx-4 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3">
            <div className="flex items-center gap-2">
              <Gamepad2 className="w-5 h-5 text-white" />
              <h2 className="font-bold text-white text-base sm:text-lg">Game in Progress</h2>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Game info */}
          <div className="p-6 flex flex-col items-center text-center">
            {/* Poster with LIVE badge */}
            <div className="relative mb-4">
              {gameData?.image ? (
                <div className="w-28 h-40 sm:w-32 sm:h-48 rounded-xl overflow-hidden shadow-2xl ring-2 ring-purple-500/60">
                  <img src={gameData.image} alt={gameData.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-28 h-40 sm:w-32 sm:h-48 rounded-xl bg-gray-700 flex items-center justify-center shadow-2xl ring-2 ring-purple-500/60">
                  <Gamepad2 className="w-12 h-12 text-gray-400" />
                </div>
              )}
              {/* Pulsing LIVE badge */}
              <div className="absolute -top-2 -right-2 flex items-center gap-1 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping absolute" />
                <span className="w-1.5 h-1.5 bg-white rounded-full relative" />
                <span className="ml-1">LIVE</span>
              </div>
            </div>

            <h3 className="text-white font-bold text-lg sm:text-xl mb-1">
              {gameData?.name || activeGame.game_type?.replace(/_/g, ' ')}
            </h3>
            <p className="text-gray-400 text-xs mb-4">A game is currently active in this room</p>

            {/* Players */}
            {activePlayers.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mb-2">
                {activePlayers.map((p) => (
                  <div key={p.user_id} className="flex items-center gap-1.5 bg-gray-700/80 rounded-full px-2.5 py-1">
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: p.color || '#7c3aed' }}
                    >
                      <span className="text-[8px] font-bold text-white">
                        {(p.username || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <span className="text-xs text-gray-200 font-medium">{p.username}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-700 flex items-center justify-end gap-2 px-4 py-3">
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
            >
              Close
            </button>
            {isHost && (
              <button
                onClick={() => { onEndGame?.(); onClose(); }}
                className="px-4 py-1.5 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <X className="w-4 h-4" />
                End Game
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
  // ── /Active game screen ─────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className={`bg-gray-800 shadow-2xl w-full ${
        isWideLayout
          ? 'rounded-xl mx-4 max-w-5xl max-h-[92vh] flex flex-col overflow-hidden'
          : isLandscape
            ? 'h-screen max-h-screen rounded-none mx-0 flex flex-col overflow-hidden'
            : 'rounded-xl mx-4 max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto'
      }`}>

        {/* Header */}
        <div className={`flex items-center justify-between bg-gradient-to-r from-purple-600 to-blue-600 flex-shrink-0 ${
          isWideLayout ? 'px-6 py-3 rounded-t-xl' : isLandscape ? 'px-4 py-2 rounded-none' : 'px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl'
        }`}>
          <div className="flex items-center gap-2 sm:gap-3">
            <Gamepad2 className={`text-white ${isWideLayout ? 'w-6 h-6' : isLandscape ? 'w-5 h-5' : 'w-6 h-6 sm:w-7 sm:h-7'}`} />
            <h2 className={`font-bold text-white ${isWideLayout ? 'text-xl' : isLandscape ? 'text-base' : 'text-xl sm:text-3xl'}`}>Start a Game</h2>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Content area: stacked portrait, side-by-side landscape/desktop */}
        <div className={(isWideLayout || isLandscape) ? 'flex flex-row flex-1 overflow-hidden' : ''}>

          {/* Game carousel — wide/landscape: right side, portrait: full-width with border-b */}
          <div className={
            isWideLayout
              ? 'flex-1 order-2 overflow-y-auto border-l border-gray-700 px-6 py-4'
              : isLandscape
                ? 'w-[70%] order-2 overflow-y-auto border-l border-gray-700 px-4 py-2'
                : 'px-4 sm:px-6 pt-3 pb-4 sm:pt-4 sm:pb-6 border-b border-gray-700'
          }>
            {/* Search — hidden in landscape/wide, and in readOnly (no independent browsing there) */}
            {!readOnly && !(isLandscape || isWideLayout) && (
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
            )}

            {filteredGames.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                No games match "{searchQuery}"
              </div>
            ) : (
              <>
                {/* Title of the centered game */}
                <h3 className={`text-center text-white font-bold truncate transition-all ${
                  isWideLayout ? 'text-xl mb-2' : isLandscape ? 'text-sm mb-1' : 'text-base sm:text-lg mb-1 sm:mb-2'
                }`}>
                  {selectedGameData?.name}
                </h3>

                {/* Poster fan */}
                <div ref={carouselRef} className="relative overflow-hidden" style={{ height: cardW * 1.46 + (isWideLayout ? 28 : isLandscape ? 10 : 20) }}>
                  {!readOnly && <button
                    onClick={() => goTo(carouselIndex - 1)}
                    disabled={carouselIndex === 0}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-30 !min-h-0 !min-w-0 w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-white/90 shadow-lg rounded-full disabled:opacity-0 hover:bg-white transition-all"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-700" />
                  </button>}

                  {filteredGames.map((game, i) => {
                    const offset = i - carouselIndex;
                    const absOffset = Math.abs(offset);
                    if (absOffset > 2.6) return null;

                    const isCenter = offset === 0;
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

                {!readOnly && <button
                  onClick={() => goTo(carouselIndex + 1)}
                  disabled={carouselIndex === filteredGames.length - 1}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-30 !min-h-0 !min-w-0 w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-white/90 shadow-lg rounded-full disabled:opacity-0 hover:bg-white transition-all"
                >
                  <ChevronRight className="w-4 h-4 text-gray-700" />
                </button>}
              </div>

              {/* Dot indicators */}
              {filteredGames.length > 1 && (
                <div className={`flex justify-center gap-1 sm:gap-1.5 ${isLandscape ? 'mt-1' : 'mt-2 sm:mt-3'}`}>
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

              {/* Description + min/max + optional tournament toggle */}
              {selectedGameData && (
                <div className={`text-center ${isWideLayout ? 'mt-3' : isLandscape ? 'mt-1' : 'mt-2 sm:mt-3'}`}>
                  <p className={`text-gray-400 leading-snug max-w-lg mx-auto ${isWideLayout ? 'text-sm' : 'text-[11px] sm:text-xs'}`}>{selectedGameData.description}</p>
                  <p className="text-gray-500 text-[10px] sm:text-[11px] mt-1">
                    {selectedGameData.type === 'arcade' && !isTournamentMode
                      ? 'Solo arcade'
                      : selectedGameData.type === 'arcade' && isTournamentMode
                        ? 'Hot-seat — each player takes a turn'
                        : `${selectedGameData.minPlayers}–${selectedGameData.maxPlayers} players`}
                  </p>
                  {!readOnly && selectedGame === 'ping_pong' && (
                    <div className="mt-2 flex items-center justify-center gap-2">
                      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={noWalls}
                          onChange={e => setNoWalls(e.target.checked)}
                          className="w-4 h-4 rounded accent-purple-500"
                        />
                        <span className="text-xs text-gray-300 font-medium">No walls (classic table-tennis rules)</span>
                      </label>
                    </div>
                  )}
                  {!readOnly && selectedGame === 'ramp_rush' && (
                    <div className="mt-2 flex items-center justify-center gap-2">
                      <button
                        onClick={() => setRampRushFormat(f => (f === 'best_of_5' ? 'first_to_win' : 'best_of_5'))}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-gray-700/60 border-gray-600 text-gray-300 hover:border-gray-500 transition-all"
                      >
                        {rampRushFormat === 'best_of_5' ? 'Best of 5' : 'First to Win'}
                      </button>
                    </div>
                  )}
                  {!readOnly && (TOURNAMENT_GAME_IDS.includes(selectedGame) || HOT_SEAT_GAME_IDS.includes(selectedGame)) && (
                    <div className="mt-2 flex items-center justify-center gap-2">
                      <button
                        onClick={() => setIsTournamentMode(t => !t)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                          isTournamentMode
                            ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                            : 'bg-gray-700/60 border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-500'
                        }`}
                      >
                        <Trophy className="w-3 h-3" />
                        {HOT_SEAT_GAME_IDS.includes(selectedGame) ? 'Hot-Seat Tournament' : 'Tournament Mode'}
                      </button>
                      <span className={`text-xs font-bold tracking-wide ${isTournamentMode ? 'text-yellow-400' : 'text-gray-500'}`}>
                        {isTournamentMode ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          </div>

          {/* Player selection — wide/landscape: left panel, portrait: full-width below carousel */}
          <div className={
            isWideLayout
              ? 'w-[320px] flex-shrink-0 order-1 overflow-y-auto border-r border-gray-700 px-4 py-4'
              : isLandscape
                ? 'w-[30%] order-1 overflow-y-auto border-r border-gray-700 px-3 py-2'
                : 'px-4 sm:px-6 py-3 sm:py-6'
          }>
            {!selectedGameData ? null : readOnly ? (
              /* Passive viewer — mirrors the host's browsing, no controls of its own */
              <div className={`text-center ${isLandscape ? 'py-2' : 'py-2 sm:py-6'}`}>
                <div className={`mb-2 ${isLandscape ? 'text-2xl' : 'text-4xl sm:text-6xl sm:mb-4'}`}>👀</div>
                <h3 className={`font-bold text-white mb-1 ${isLandscape ? 'text-sm' : 'text-base sm:text-xl sm:mb-2'}`}>{hostName} is picking a game…</h3>
                <p className={`text-gray-400 ${isLandscape ? 'text-[11px]' : 'text-sm'}`}>
                  Everyone sees this live — chat in to say what you'd like to play!
                </p>
              </div>
            ) : selectedGameData.type === 'arcade' && !isTournamentMode ? (
              /* Arcade games - single player info */
              <div className={`text-center ${isLandscape ? 'py-2' : 'py-2 sm:py-6'}`}>
                <div className={`mb-2 ${isLandscape ? 'text-2xl' : 'text-4xl sm:text-6xl sm:mb-4'}`}>🎮</div>
                <h3 className={`font-bold text-white mb-1 ${isLandscape ? 'text-sm' : 'text-base sm:text-xl sm:mb-2'}`}>Arcade Mode</h3>
                <p className={`text-gray-400 ${isLandscape ? 'text-[11px] mb-2' : 'text-sm mb-2 sm:mb-4'}`}>
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
                <div className={`flex items-center justify-between ${isLandscape ? 'mb-2' : 'mb-2 sm:mb-4'}`}>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    Players ({selectedPlayers.length}/{isTournamentMode ? 8 : selectedGameData.maxPlayers})
                    {roomMembers.length < (isTournamentMode ? 4 : selectedGameData.minPlayers) && (
                      <AlertTriangle
                        className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0"
                        title={`Need at least ${isTournamentMode ? 4 : selectedGameData.minPlayers} players in the room`}
                      />
                    )}
                  </h3>
                </div>
                <p className={`text-xs text-gray-400 ${isLandscape ? 'mb-2' : 'mb-2 sm:mb-3'}`}>
                  {isTournamentMode ? 'Min: 4 | Max: 16' : `Min: ${selectedGameData.minPlayers} | Max: ${selectedGameData.maxPlayers}`}
                </p>

                <div className={`grid gap-2 overflow-y-auto ${
                  isLandscape ? 'grid-cols-1 max-h-full' : 'grid-cols-2 sm:grid-cols-1 max-h-32 sm:max-h-48'
                }`}>
                  {roomMembers.filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i).map((member) => {
                    const isSelected = selectedPlayers.includes(member.id);
                    const isHost = member.id === currentUserId;
                    const playerColorIndex = selectedPlayers.indexOf(member.id);
                    const initials = (member.username || '?').slice(0, 2).toUpperCase();

                    return (
                      <label
                        key={member.id}
                        onClick={() => togglePlayerSelection(member.id)}
                        className={`flex items-center gap-2 p-2 rounded-lg border transition-all min-w-0 cursor-pointer ${
                          isSelected ? 'border-purple-500 bg-purple-500/10' : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
                        }`}
                      >
                        <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 bg-gray-600 flex items-center justify-center">
                          {member.avatar_url ? (
                            <img src={member.avatar_url} alt={member.username} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[10px] font-bold text-white">{initials}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-white font-medium text-xs truncate block">{member.username}</span>
                          {isHost && (
                            <span className="text-[10px] text-yellow-400 truncate block">
                              Host{!isSelected && selectedGameData.type !== 'arcade' ? ' · spectating' : ''}
                            </span>
                          )}
                        </div>
                        {isSelected && playerColorIndex >= 0 && (
                          <div
                            className="w-4 h-4 rounded-full border-2 border-white flex-shrink-0"
                            style={{ backgroundColor: playerColors[playerColorIndex] }}
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer — always at bottom */}
        <div className={`border-t border-gray-700 flex justify-end gap-2 sm:gap-3 flex-shrink-0 ${
          isLandscape ? 'px-4 py-2' : 'px-4 sm:px-6 py-3 sm:py-6'
        }`}>
          {readOnly ? (
            // Dismisses this viewer's own mirror only — the host's picker keeps running.
            <button
              onClick={onClose}
              className="px-4 sm:px-6 py-1.5 sm:py-2 text-sm sm:text-base bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Close
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 sm:px-6 py-1.5 sm:py-2 text-sm sm:text-base bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStartGame}
                disabled={
                  !selectedGameData ||
                  (isTournamentMode
                    ? selectedPlayers.length < 4
                    : selectedGameData.type !== 'arcade' && selectedPlayers.length < selectedGameData.minPlayers)
                }
                className={`px-4 sm:px-6 py-1.5 sm:py-2 text-sm sm:text-base bg-gradient-to-r ${
                  isTournamentMode
                    ? 'from-yellow-600 to-amber-600 hover:from-yellow-700 hover:to-amber-700'
                    : 'from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
                } text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
              >
                {isTournamentMode
                  ? <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
                  : <Gamepad2 className="w-4 h-4 sm:w-5 sm:h-5" />}
                {isTournamentMode ? 'Start Tournament' : 'Start Game'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

