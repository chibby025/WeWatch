import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPublicLiveSessions, getPublicRooms, getAssetUrl, getCommunityEvents } from '../services/api';
import AuthPromptModal from '../components/AuthPromptModal';
import SessionPreview   from '../components/SessionPreview';
import DiscoverFeed     from '../components/DiscoverFeed';
import { formatCount }  from '../utils/formatCount';
import CommunityEventsCard from '../components/community/CommunityEventsCard';
import {
  HeartIcon, ChatBubbleOvalLeftEllipsisIcon, FilmIcon, XMarkIcon,
} from '@heroicons/react/24/solid';
import { CalendarDaysIcon } from '@heroicons/react/24/outline';
import { Plus, Home, Search } from 'lucide-react';

// ── constants ─────────────────────────────────────────────────────────────────
const ROOM_TYPE_EMOJI = {
  cinema: '🎬', church: '⛪', classroom: '📚', podcast: '🎙️',
  news: '📰', sports: '⚽', music: '🎵', gaming: '🎮',
};

const TABS = [
  { id: 'chats',    label: 'Chats'     },
  { id: 'rooms',    label: 'Rooms'     },
  { id: 'watching', label: 'WatchOuts' },
  { id: 'feed',     label: 'Feed'      },
];

const pulseAnimationStyles = `
  @keyframes floatZzz {
    0%   { opacity: 0;   transform: translateY(0)   scale(0.7); }
    20%  { opacity: 0.9; }
    80%  { opacity: 0.6; }
    100% { opacity: 0;   transform: translateY(-60px) scale(1.2); }
  }
  .explore-zzz-1 { animation: floatZzz 2.4s ease-in-out infinite; animation-delay: 0s; }
  .explore-zzz-2 { animation: floatZzz 2.4s ease-in-out infinite; animation-delay: 0.8s; }
  .explore-zzz-3 { animation: floatZzz 2.4s ease-in-out infinite; animation-delay: 1.6s; }
`;

// ── RoomCard ──────────────────────────────────────────────────────────────────
function RoomCard({ room, onInteract }) {
  const emoji  = ROOM_TYPE_EMOJI[room.room_type?.toLowerCase()] || '🏠';
  const imgSrc = getAssetUrl(room.image_url);

  return (
    <div
      onClick={onInteract}
      className="group bg-white dark:bg-gray-800 shadow-md rounded-lg
        hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200
        border border-gray-200 dark:border-gray-700 cursor-pointer relative"
    >
      <div className="flex items-center p-3 sm:p-4 gap-3 sm:gap-5">
        <div className="flex-shrink-0 relative">
          <div className="relative w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden
            bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            {imgSrc ? (
              <img src={imgSrc} alt={room.name} className="w-full h-full object-cover" />
            ) : (
              <FilmIcon className="w-8 h-8 text-white opacity-60" />
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base sm:text-xl font-semibold text-blue-600 dark:text-blue-400
            hover:underline truncate">
            {room.name}
          </h2>
          {room.handle && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500">@{room.handle}</p>
          )}
          <div className="flex items-center gap-2 mt-1 mb-1">
            {room.average_rating > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-yellow-600
                bg-yellow-50 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded-full">
                ⭐ {room.average_rating.toFixed(1)}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              👥 {room.member_count || 0}
            </span>
          </div>
          {room.description && (
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400
              line-clamp-2 mb-1.5 pr-10">
              {room.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SessionCard ───────────────────────────────────────────────────────────────
function SessionCard({ session, onNavigate, onAuthPrompt, videoMuted }) {
  const previewUrl = getAssetUrl(session.preview_url) || '';
  const posterUrl  = getAssetUrl(session.poster_url)  || '';

  return (
    <div
      className="relative w-full snap-start snap-always overflow-hidden"
      style={{ height: '100%' }}
    >
      <div className="absolute inset-0">
        <SessionPreview
          session={session}
          previewUrl={previewUrl}
          posterUrl={posterUrl}
          isGenerating={false}
          isClearing={false}
          muted={videoMuted}
          previewVersion={1}
        />
      </div>

      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/90 pointer-events-none" />

      <div
        className="absolute inset-0"
        style={{ right: '80px' }}
        onClick={() => onNavigate(session)}
      />

      <div className="absolute top-3 left-3 flex items-center gap-2 z-20 pointer-events-none">
        <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-semibold text-white">LIVE</span>
        </div>
      </div>

      <div className="absolute bottom-4 left-4 right-20 text-white pointer-events-none z-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="relative flex-shrink-0">
            <div className="absolute -inset-1 rounded-full bg-red-500/30 animate-ping" />
            <div className="absolute inset-0 w-10 h-10 rounded-full ring-[3px] ring-red-500 animate-pulse" />
            <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500
              flex items-center justify-center text-white font-bold text-sm overflow-hidden">
              {session.room_avatar_url ? (
                <img src={getAssetUrl(session.room_avatar_url)} alt="" className="w-full h-full object-cover" />
              ) : (
                (session.room_name?.[0] || '?')
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-bold text-white text-base truncate">{session.room_name}</span>
            {session.average_rating > 0 && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <svg className="w-3.5 h-3.5 fill-yellow-400" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-white font-bold text-sm">{session.average_rating.toFixed(1)}</span>
              </div>
            )}
          </div>
        </div>
        <h3 className="text-lg font-bold leading-tight line-clamp-2">
          {session.session_title || session.room_name || 'Live Session'}
        </h3>
        {session.host_username && (
          <p className="text-sm text-gray-300 mt-0.5">@{session.host_username}</p>
        )}
      </div>

      <div className="absolute bottom-4 right-4 flex flex-col items-center gap-4 pointer-events-auto z-20">
        <button
          onClick={onAuthPrompt}
          className="flex flex-col items-center gap-1 group transition-transform hover:scale-110"
        >
          <HeartIcon className="w-9 h-9 text-white" />
          <span className="text-white text-xs font-bold">0</span>
        </button>
        <button
          onClick={onAuthPrompt}
          className="flex flex-col items-center gap-1 group transition-transform hover:scale-110"
        >
          <ChatBubbleOvalLeftEllipsisIcon className="w-9 h-9 text-white" />
          <span className="text-white text-xs font-bold">0</span>
        </button>
        <div className="flex flex-col items-center gap-1">
          <img src="/icons/view.png" className="w-9 h-9 object-contain"
            onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span className="text-white text-xs font-bold">{formatCount(session.member_count || 0)}</span>
        </div>
        {!session.is_temporary && (
          <button
            onClick={onAuthPrompt}
            className="flex flex-col items-center gap-1 transition-transform active:scale-90"
          >
            <svg viewBox="0 0 24 24" fill="white" className="w-9 h-9">
              <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ExplorePage() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('watching');

  // Data
  const [sessions, setSessions]             = useState([]);
  const [rooms, setRooms]                   = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingRooms, setLoadingRooms]     = useState(false);
  const [roomsFetched, setRoomsFetched]     = useState(false);
  const [isRefreshing, setIsRefreshing]     = useState(false);

  // Community events
  const [communityEventsData, setCommunityEventsData] = useState({ scheduledEvents: [], requests: [] });

  // Calendar drawer
  const [showCalendarDrawer, setShowCalendarDrawer] = useState(false);
  const [showCommunityEventsView, setShowCommunityEventsView] = useState(false);

  // Search state (per-tab)
  const [showWatchingSearch, setShowWatchingSearch] = useState(false);
  const [showRoomsSearch, setShowRoomsSearch]       = useState(false);
  const [showFeedSearch, setShowFeedSearch]         = useState(false);
  const [sessionSearch, setSessionSearch]           = useState('');
  const [roomSearch, setRoomSearch]                 = useState('');
  const [feedSearch, setFeedSearch]                 = useState('');

  // UI
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [videoMuted, setVideoMuted]       = useState(true);

  // Refs for height calculation
  const headerRef  = useRef(null);
  const tabBarRef  = useRef(null);
  const communityEventsTuneRef = useRef(null);
  const [topOffset, setTopOffset] = useState(98);

  useEffect(() => {
    const measure = () => {
      const h = (headerRef.current?.offsetHeight  || 57)
              + (tabBarRef.current?.offsetHeight   || 41);
      setTopOffset(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (headerRef.current)  ro.observe(headerRef.current);
    if (tabBarRef.current)  ro.observe(tabBarRef.current);
    return () => ro.disconnect();
  }, []);

  // Fetch live sessions on mount
  useEffect(() => {
    getPublicLiveSessions()
      .then(data => setSessions(data.sessions || []))
      .catch(() => setSessions([]))
      .finally(() => setLoadingSessions(false));
  }, []);

  // Fetch community events on mount
  useEffect(() => {
    getCommunityEvents()
      .then(data => setCommunityEventsData({
        scheduledEvents: data.scheduled_events || [],
        requests: data.requests || [],
      }))
      .catch(() => {});
  }, []);

  // Play/stop community music when overlay is open
  useEffect(() => {
    if (!showCommunityEventsView) {
      if (communityEventsTuneRef.current) {
        communityEventsTuneRef.current.pause();
        communityEventsTuneRef.current.currentTime = 0;
      }
      return;
    }
    const audio = new Audio('/sounds/communitymusic.mp3');
    audio.loop = true;
    audio.volume = 0.35;
    communityEventsTuneRef.current = audio;
    audio.play().catch(() => {});
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, [showCommunityEventsView]);

  // Lazy-load rooms on first visit to rooms tab
  useEffect(() => {
    if (activeTab === 'rooms' && !roomsFetched) {
      setRoomsFetched(true);
      setLoadingRooms(true);
      getPublicRooms(30, 0)
        .then(data => setRooms(data.rooms || []))
        .catch(() => setRooms([]))
        .finally(() => setLoadingRooms(false));
    }
  }, [activeTab, roomsFetched]);

  const promptAuth   = useCallback(() => setShowAuthModal(true), []);
  const goToGuest    = useCallback((session) => {
    navigate(`/guest/${session.session_id}`);
  }, [navigate]);

  const handleSearchToggle = () => {
    if (activeTab === 'watching') {
      if (showWatchingSearch) setSessionSearch('');
      setShowWatchingSearch(s => !s);
    } else if (activeTab === 'rooms') {
      if (showRoomsSearch) setRoomSearch('');
      setShowRoomsSearch(s => !s);
    } else if (activeTab === 'feed') {
      if (showFeedSearch) setFeedSearch('');
      setShowFeedSearch(s => !s);
    }
  };

  const handleHomeButton = () => {
    if (activeTab === 'watching') {
      setIsRefreshing(true);
      getPublicLiveSessions()
        .then(data => setSessions(data.sessions || []))
        .catch(() => {})
        .finally(() => setIsRefreshing(false));
    } else if (activeTab === 'rooms') {
      setLoadingRooms(true);
      getPublicRooms(30, 0)
        .then(data => setRooms(data.rooms || []))
        .catch(() => setRooms([]))
        .finally(() => setLoadingRooms(false));
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const isSearchActive =
    (activeTab === 'watching' && showWatchingSearch) ||
    (activeTab === 'rooms'    && showRoomsSearch)    ||
    (activeTab === 'feed'     && showFeedSearch);

  // Filtered sessions for search
  const filteredSessions = useMemo(() => {
    if (!sessionSearch.trim()) return sessions;
    const q = sessionSearch.toLowerCase();
    return sessions.filter(s =>
      (s.session_title || '').toLowerCase().includes(q) ||
      (s.room_name     || '').toLowerCase().includes(q) ||
      (s.host_username || '').toLowerCase().includes(q)
    );
  }, [sessions, sessionSearch]);

  // Filtered rooms for search
  const filteredRooms = useMemo(() => {
    if (!roomSearch.trim()) return rooms;
    const q = roomSearch.toLowerCase();
    return rooms.filter(r =>
      (r.name        || '').toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q)
    );
  }, [rooms, roomSearch]);

  const hasCommunityContent =
    communityEventsData.scheduledEvents.length > 0 ||
    communityEventsData.requests.length > 0;

  const searchBarHeight = (activeTab === 'watching' && showWatchingSearch) ? 52 : 0;
  const snapH = `calc(100dvh - ${topOffset + searchBarHeight}px - 64px)`;

  const getEventEmoji = (ev) => {
    const t = ev.watch_type || '';
    if (t === '3d_cinema' || t === 'cinema') return '🎬';
    if (t === 'classroom') return '🎓';
    if (t === 'church') return '⛪';
    if (t === 'podcast') return '🎙️';
    return '📺';
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white flex flex-col">

      {/* ── Header — centered logo, Sign in left, Join free right ── */}
      <header
        ref={headerRef}
        className="sticky top-0 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-200/60 dark:border-gray-800/60 px-4 py-2"
      >
        <div className="grid grid-cols-3 items-center">
          {/* Left: Sign in */}
          <div className="flex items-center">
            <button
              onClick={() => navigate('/login')}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Sign in
            </button>
          </div>

          {/* Center: Logo */}
          <div className="flex items-center justify-center">
            <img
              src="/icons/LetsWatchOut Logo.svg"
              alt="LetsWatchOut"
              className="h-[52px] sm:h-[68px] w-auto"
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          </div>

          {/* Right: Join free */}
          <div className="flex items-center justify-end">
            <button
              onClick={() => navigate('/register')}
              className="px-4 py-1.5 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-full transition-all"
            >
              Join free
            </button>
          </div>
        </div>
      </header>

      {/* ── Search bar — unified, appears between header and tab bar ── */}
      {isSearchActive && (
        <div className="sticky z-30 px-4 pb-2 pt-2 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md"
          style={{ top: headerRef.current?.offsetHeight || 57 }}
        >
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              key={activeTab}
              type="text"
              autoFocus
              placeholder={
                activeTab === 'watching' ? 'Search sessions...' :
                activeTab === 'rooms'    ? 'Search rooms...'    :
                                          'Search posts...'
              }
              value={
                activeTab === 'watching' ? sessionSearch :
                activeTab === 'rooms'    ? roomSearch    :
                                          feedSearch
              }
              onChange={e => {
                const v = e.target.value;
                if      (activeTab === 'watching') setSessionSearch(v);
                else if (activeTab === 'rooms')    setRoomSearch(v);
                else                               setFeedSearch(v);
              }}
              className="w-full pl-10 pr-10 py-2 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500 dark:text-white placeholder-gray-400"
            />
            {(activeTab === 'watching' ? sessionSearch : activeTab === 'rooms' ? roomSearch : feedSearch) && (
              <button
                onClick={() => {
                  if      (activeTab === 'watching') setSessionSearch('');
                  else if (activeTab === 'rooms')    setRoomSearch('');
                  else                               setFeedSearch('');
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Tab bar — matches LobbyPage exactly ── */}
      <div
        ref={tabBarRef}
        className="sticky z-30 mb-1 sm:mb-2 bg-gray-900 dark:bg-gray-700 rounded-xl"
        style={{ top: (headerRef.current?.offsetHeight || 57) + (isSearchActive ? 52 : 0) }}
      >
        <div className="flex border-b border-white/10">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex-1 py-2 transition-colors ${
                  isActive
                    ? 'font-bold text-white'
                    : 'font-semibold text-white/40 hover:text-white/70'
                }`}
              >
                <span className="relative inline-flex items-center">
                  <span className="text-sm sm:text-base">{tab.label}</span>
                  {tab.id === 'watching' && sessions.length > 0 && (
                    <span className="absolute -top-2 -right-4 min-w-[16px] h-4 px-0.5 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full">
                      {sessions.length}
                    </span>
                  )}
                </span>
                {isActive && (
                  <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full bg-white" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ── */}

      {/* WATCHOUTS */}
      <div
        style={{
          display:         activeTab === 'watching' ? 'block' : 'none',
          height:          snapH,
          overflowY:       'scroll',
          scrollbarWidth:  'none',
          msOverflowStyle: 'none',
          scrollSnapType:  'y mandatory',
          background:      'black',
        }}
      >
        <style>{`
          .explore-scroll::-webkit-scrollbar { display: none; }
          ${pulseAnimationStyles}
        `}</style>

        {loadingSessions ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredSessions.length === 0 && !sessionSearch ? (
          /* Empty state with ZZZ animation */
          <div className="relative h-full w-full snap-start flex flex-col items-center justify-center
            bg-gradient-to-br from-purple-900 via-gray-900 to-black text-white text-center px-8 overflow-hidden">
            <div className="relative mb-8 flex items-center justify-center w-28 h-28">
              <img src="/icons/lwoIcon.webp" alt="" className="w-20 h-20 opacity-25"
                onError={e => { e.currentTarget.style.display = 'none'; }} />
              <span className="explore-zzz-1 absolute text-white/70 font-bold select-none pointer-events-none"
                style={{ fontSize: '12px', top: '8px', right: '8px' }}>z</span>
              <span className="explore-zzz-2 absolute text-white/70 font-bold select-none pointer-events-none"
                style={{ fontSize: '16px', top: '0px', right: '18px' }}>z</span>
              <span className="explore-zzz-3 absolute text-white/70 font-bold select-none pointer-events-none"
                style={{ fontSize: '22px', top: '-10px', right: '28px' }}>Z</span>
            </div>
            <p className="text-xl font-semibold mb-2">No WatchOuts right now</p>
            <p className="text-gray-400 text-sm">Live sessions appear here when people go live.</p>
          </div>
        ) : filteredSessions.length === 0 && sessionSearch ? (
          <div className="h-full flex flex-col items-center justify-center text-white/60 text-center px-8">
            <p className="text-lg font-semibold mb-1">No results</p>
            <p className="text-sm">No sessions matching "{sessionSearch}"</p>
          </div>
        ) : (
          (() => {
            const sessionCards = filteredSessions.map(session => (
              <div
                key={session.session_id}
                style={{ height: snapH, scrollSnapAlign: 'start', scrollSnapStop: 'always', position: 'relative' }}
              >
                <SessionCard
                  session={session}
                  onNavigate={goToGuest}
                  onAuthPrompt={promptAuth}
                  videoMuted={videoMuted}
                />
              </div>
            ));

            if (!hasCommunityContent) return sessionCards;

            const communitySlot = (key) => (
              <div key={key} style={{ height: snapH, scrollSnapAlign: 'start', scrollSnapStop: 'always', position: 'relative' }} className="bg-black">
                <CommunityEventsCard
                  scheduledEvents={communityEventsData.scheduledEvents}
                  requests={communityEventsData.requests}
                  leaderboard={[]}
                  currentUser={null}
                  apiBaseUrl=""
                  onRSVP={promptAuth}
                  onNewRequest={promptAuth}
                />
              </div>
            );

            if (sessionCards.length === 0) return [communitySlot('community-events-empty')];

            const result = [];
            sessionCards.forEach((card, idx) => {
              result.push(card);
              if ((idx + 1) % 5 === 0) {
                result.push(communitySlot(`community-events-${idx}`));
              }
            });
            return result;
          })()
        )}
      </div>

      {/* CHATS — Sign in prompt */}
      {activeTab === 'chats' && (
        <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full">
          <div className="bg-gradient-to-r from-green-600 to-green-700 p-4">
            <h3 className="text-white font-bold text-xl flex items-center gap-2">Chats</h3>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center bg-white dark:bg-gray-900">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-5">
              <svg className="w-10 h-10 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="font-semibold text-lg text-gray-900 dark:text-white mb-2">Sign in to chat</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-xs">
              Message friends, join group chats, and share live sessions — all in one place.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/login')}
                className="px-5 py-2.5 text-sm font-semibold border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Sign in
              </button>
              <button
                onClick={() => navigate('/register')}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors"
              >
                Join free
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ROOMS */}
      {activeTab === 'rooms' && (
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          <div className="max-w-2xl mx-auto px-4 py-4">
            {loadingRooms ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex items-center gap-3 animate-pulse">
                    <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredRooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
                <p className="text-4xl mb-3">🏠</p>
                <p className="font-medium">{roomSearch ? `No rooms matching "${roomSearch}"` : 'No public rooms yet'}</p>
                {!roomSearch && (
                  <button
                    onClick={() => navigate('/register')}
                    className="mt-4 px-5 py-2 text-sm font-semibold text-white bg-purple-700 hover:bg-purple-600 rounded-full transition-all"
                  >
                    Create a room
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredRooms.map(r => (
                  <RoomCard
                    key={r.id}
                    room={r}
                    onInteract={promptAuth}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FEED */}
      {activeTab === 'feed' && (
        <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 pt-2">
          <DiscoverFeed onPostClick={promptAuth} />
        </div>
      )}

      {/* ── Bottom taskbar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/80 dark:bg-gray-900/80
        backdrop-blur-md border-t border-gray-200/60 dark:border-gray-800/60">
        <div className="flex items-center justify-around px-2 h-16">

          {/* Calendar — guests can browse public events */}
          <button
            onClick={() => setShowCalendarDrawer(true)}
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-all active:scale-90"
          >
            <CalendarDaysIcon className="h-7 w-7" />
          </button>

          {/* Bell */}
          <button
            onClick={promptAuth}
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-all active:scale-90"
          >
            {activeTab === 'chats' ? (
              <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
              </svg>
            ) : (
              <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
              </svg>
            )}
          </button>

          {/* Center FAB */}
          <div className="relative -mt-5">
            <button
              onClick={promptAuth}
              className="w-14 h-14 flex items-center justify-center transition-all active:scale-95"
            >
              <img src="/icons/lwoIcon.webp" className="w-14 h-14 object-contain"
                onError={e => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling.style.display = 'flex';
                }} />
              <div className="hidden w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 shadow-lg items-center justify-center">
                <Plus className="w-7 h-7 text-white" strokeWidth={3} />
              </div>
            </button>
          </div>

          {/* Search */}
          <button
            onClick={handleSearchToggle}
            className={`p-2 transition-all active:scale-90 ${
              isSearchActive
                ? 'text-purple-600 dark:text-purple-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-purple-600'
            }`}
          >
            <Search className="w-7 h-7" />
          </button>

          {/* Home */}
          <button
            onClick={handleHomeButton}
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-all active:scale-90"
          >
            {isRefreshing ? (
              <svg className="w-7 h-7 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <Home className="w-7 h-7" />
            )}
          </button>
        </div>
      </div>

      {/* ── Calendar Drawer — public upcoming events ── */}
      {showCalendarDrawer && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowCalendarDrawer(false)}
          />
          <div className="fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-gray-900 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <CalendarDaysIcon className="h-5 w-5 text-amber-400" />
                <span className="font-semibold text-white text-base">Upcoming Events</span>
              </div>
              <button
                onClick={() => setShowCalendarDrawer(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Community Events shortcut */}
            <button
              onClick={() => { setShowCalendarDrawer(false); setShowCommunityEventsView(true); }}
              className="mx-4 mt-4 mb-1 flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-900/60 to-blue-900/60 border border-purple-700/40 hover:border-purple-500/60 text-white transition-all active:scale-95"
            >
              <span className="text-xl">📅</span>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold">Community Events</p>
                <p className="text-xs text-gray-400">Requests &amp; scheduled sessions</p>
              </div>
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
              {communityEventsData.scheduledEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <CalendarDaysIcon className="h-12 w-12 text-gray-600 mb-3" />
                  <p className="text-sm font-medium text-gray-400">No upcoming public events</p>
                  <p className="text-xs text-gray-600 mt-1">Join rooms to see their scheduled events</p>
                  <button
                    onClick={() => { setShowCalendarDrawer(false); navigate('/register'); }}
                    className="mt-4 px-4 py-2 text-sm font-semibold text-white bg-purple-700 hover:bg-purple-600 rounded-full transition-all"
                  >
                    Join free
                  </button>
                </div>
              ) : (() => {
                const now = new Date();
                const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
                const weekEnd  = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);

                const todayEvs = communityEventsData.scheduledEvents.filter(ev => new Date(ev.start_time) <= todayEnd);
                const weekEvs  = communityEventsData.scheduledEvents.filter(ev => {
                  const d = new Date(ev.start_time);
                  return d > todayEnd && d <= weekEnd;
                });
                const laterEvs = communityEventsData.scheduledEvents.filter(ev => new Date(ev.start_time) > weekEnd);

                const EventCard = ({ ev }) => (
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-800 border border-gray-700/50 hover:border-amber-500/40 transition-colors">
                    <span className="text-xl flex-shrink-0 mt-0.5">{getEventEmoji(ev)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{ev.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(ev.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' · '}
                        {new Date(ev.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </p>
                      {ev.Room?.name && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{ev.Room.name}</p>
                      )}
                      {ev.is_paid && (
                        <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-900/50 text-purple-300 border border-purple-700/50">Paid</span>
                      )}
                    </div>
                    <button
                      onClick={() => { setShowCalendarDrawer(false); promptAuth(); }}
                      className="flex-shrink-0 text-xs px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold transition-colors"
                    >
                      RSVP
                    </button>
                  </div>
                );

                const Section = ({ label, evs }) => evs.length === 0 ? null : (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{label}</p>
                    <div className="space-y-2">
                      {evs.map(ev => <EventCard key={ev.ID || ev.id} ev={ev} />)}
                    </div>
                  </div>
                );

                return (
                  <>
                    <Section label="Today" evs={todayEvs} />
                    <Section label="This Week" evs={weekEvs} />
                    <Section label="Later" evs={laterEvs} />
                  </>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {/* ── Community Events fullscreen overlay ── */}
      {showCommunityEventsView && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowCommunityEventsView(false)}
          />
          <div className="fixed inset-0 z-50 flex flex-col" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowCommunityEventsView(false)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
            <CommunityEventsCard
              scheduledEvents={communityEventsData.scheduledEvents}
              requests={communityEventsData.requests}
              leaderboard={[]}
              currentUser={null}
              apiBaseUrl=""
              onRSVP={() => { setShowCommunityEventsView(false); promptAuth(); }}
              onNewRequest={() => { setShowCommunityEventsView(false); promptAuth(); }}
            />
          </div>
        </>
      )}

      {showAuthModal && <AuthPromptModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
}
