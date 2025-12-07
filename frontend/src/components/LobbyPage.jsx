// WeWatch/frontend/src/components/LobbyPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRooms, deleteRoom, getActiveSessions, verifySessionExists } from '../services/api';
import { TrashIcon, Bars3Icon, EllipsisVerticalIcon, ShareIcon, Cog6ToothIcon, ChartBarIcon } from '@heroicons/react/24/solid';
import jwtDecodeUtil from '../utils/jwt';
import apiClient from '../services/api';
import WatchTypeModal from './WatchTypeModal';
import toast, { Toaster } from 'react-hot-toast';
import LobbyLeftSidebar from './LobbyLeftSidebar';
import UserProfileModal from './UserProfileModal';
import SettingsModal from './SettingsModal';
import CreateNewModal from './CreateNewModal';
import DeleteRoomModal from './DeleteRoomModal';
import { useAuth } from '../contexts/AuthContext';

const LobbyPage = () => {
  // ✅ Tab State
  const [activeTab, setActiveTab] = useState('rooms'); // 'rooms' or 'watching'
  
  const [searchTerm, setSearchTerm] = useState('');
  const [rooms, setRooms] = useState([]);
  const [sessions, setSessions] = useState([]); // ✅ Active watch sessions
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true); // ✅ Separate loading for sessions
  const [error, setError] = useState(null);
  const [filteredRooms, setFilteredRooms] = useState([]);
  const [filteredSessions, setFilteredSessions] = useState([]); // ✅ Filtered sessions
  const navigate = useNavigate();
  const [currentDisplay, setCurrentDisplay] = useState('current'); // 'current' or 'next'
  const [isWatchTypeModalOpen, setIsWatchTypeModalOpen] = useState(false);
  
  // ✅ Left Sidebar & Modals State
  const [isLobbyLeftSidebarOpen, setIsLobbyLeftSidebarOpen] = useState(false);
  const [isUserProfileModalOpen, setIsUserProfileModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCreateNewModalOpen, setIsCreateNewModalOpen] = useState(false);
  const [openMenuRoomId, setOpenMenuRoomId] = useState(null);
  const [roomToDelete, setRoomToDelete] = useState(null);
  
  // ✅ Get current user from Auth Context
  const { currentUser, refreshUser } = useAuth();
  
  // Use currentUser.id for authenticated user ID
  const authenticatedUserID = currentUser?.id || null;

  // Close ellipsis menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openMenuRoomId && !event.target.closest('.room-menu')) {
        setOpenMenuRoomId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuRoomId]);

  // handle instant watch room creation
  // Add this inside LobbyPage component, alongside other handlers
  const handleInstantWatch = () => {
    // Show watch type modal
    setIsWatchTypeModalOpen(true);
  };

  // ✅ Handle watch type selection for instant watch
  const handleWatchTypeSelected = async (watchType) => {
    try {
      setIsWatchTypeModalOpen(false);
      setLoading(true);
      
      const response = await apiClient.post('/api/rooms/instant-watch', {
        watch_type: watchType
      });
      
      const { room_id, session } = response.data;
      const session_id = session.session_id;
      const watch_type = session.watch_type;

      toast.success(`Starting ${watch_type === '3d_cinema' ? '3D Cinema' : 'Video Watch'}...`);

      // Route to correct watch type
      if (watch_type === '3d_cinema') {
        navigate(`/cinema-3d-demo/${room_id}?session_id=${session_id}&instant=true`, {
          state: { isHost: true, sessionId: session_id }
        });
      } else {
        navigate(`/watch/${room_id}?session_id=${session_id}&instant=true`);
      }
    } catch (err) {
      console.error('Failed to start instant watch:', err);
      setError('Could not start instant watch. Please try again.');
      toast.error('Failed to start instant watch');
    } finally {
      setLoading(false);
    }
  };

  // Add effect for auto-rotation
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentDisplay(prev => prev === 'current' ? 'next' : 'current');
    }, 3000);
  
    return () => clearInterval(interval);
  }, []);

  // Filter rooms and sessions effect
  useEffect(() => {
    if (searchTerm === '') {
      setFilteredRooms(rooms);
      setFilteredSessions(sessions);
    } else {
      const termLower = searchTerm.toLowerCase().trim();
      const filtered = rooms.filter(room =>
        (room.name && room.name.toLowerCase().includes(termLower)) ||
        (room.description && room.description.toLowerCase().includes(termLower))
      );
      setFilteredRooms(filtered);
      
      // ✅ Filter sessions by room name or host username
      const filteredSess = sessions.filter(session =>
        (session.room_name && session.room_name.toLowerCase().includes(termLower)) ||
        (session.host_username && session.host_username.toLowerCase().includes(termLower))
      );
      setFilteredSessions(filteredSess);
    }
  }, [rooms, sessions, searchTerm]);

  // Fetch rooms function (moved outside useEffect so it can be reused)
  const fetchRoomsData = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('🔍 [LobbyPage] Fetching rooms...');
      const data = await getRooms();
      console.log('📦 [LobbyPage] Raw rooms from backend:', data);
      
      const roomsList = data.rooms || [];
      console.log(`📊 [LobbyPage] Total rooms: ${roomsList.length}`);
      
      // Filter out temporary rooms (instant watch) - they should only appear in sessions
      const filteredForRooms = roomsList.filter(r => {
        if (r.is_temporary) {
          console.log(`🗑️ [LobbyPage] Filtering out temporary room from rooms list: ${r.name} (id: ${r.id})`);
          return false;
        }
        return true;
      });
      
      console.log(`✅ [LobbyPage] Rooms after filter (non-temporary): ${filteredForRooms.length}`);
      setRooms(filteredForRooms);
    } catch (err) {
      console.error("❌ [LobbyPage] Error fetching rooms:", err);
      setError('Failed to load rooms. Please try again later.');
      setRooms([]);
      setFilteredRooms([]);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Fetch active watch sessions
  const fetchSessionsData = async () => {
    setSessionsLoading(true);
    try {
      console.log('🔍 [LobbyPage] Fetching active sessions...');
      const data = await getActiveSessions();
      console.log('📦 [LobbyPage] Raw sessions from backend:', data);
      
      // Filter out orphaned temporary sessions (no active members)
      const rawSessions = data.sessions || [];
      console.log(`📊 [LobbyPage] Total sessions before filter: ${rawSessions.length}`);
      
      const filtered = rawSessions.filter(s => {
        // If temporary (instant watch) and zero members, skip it
        if (s.is_temporary && (s.member_count === 0 || s.member_count === undefined)) {
          console.log(`🗑️ [LobbyPage] Filtering out orphaned instant-watch: ${s.room_name} (session: ${s.session_id}, members: ${s.member_count})`);
          return false;
        }
        return true;
      });
      
      console.log(`✅ [LobbyPage] Sessions after filter: ${filtered.length}`);
      console.log('📋 [LobbyPage] Filtered sessions:', filtered);
      setSessions(filtered);
    } catch (err) {
      console.error('❌ [LobbyPage] Error fetching active sessions:', err);
      // Don't set error state here, sessions are optional
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  };

  // Initial fetch on mount
  useEffect(() => {
    fetchRoomsData();
    fetchSessionsData();
  }, []);

  // Auto-refresh rooms and sessions every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchRoomsData();
      fetchSessionsData();
    }, 5000);
  
    return () => clearInterval(interval);
  }, []);

  // Handle search change
  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  // Handle search submit
  const handleSearchSubmit = (event) => {
    event.preventDefault();
  };

  // ✅ Handle session card click with verification
  const handleSessionCardClick = async (session) => {
    // For regular rooms, just navigate to room page
    if (!session.is_temporary) {
      navigate(`/rooms/${session.room_id}`);
      return;
    }

    // For instant watch (temporary rooms), verify session still exists
    const { exists } = await verifySessionExists(session.session_id);
    
    if (!exists) {
      // Session has ended or been deleted
      toast.error('This watch session has ended', {
        duration: 3000,
        icon: '⏹️',
      });
      
      // Refresh sessions list to remove stale session
      await fetchSessionsData();
      return;
    }

    // Session exists, navigate to it
    if (session.watch_type === '3d_cinema') {
      navigate(`/cinema/${session.session_id}`);
    } else {
      navigate(`/watch/${session.session_id}`);
    }
  };

  // Handle create room
  const handleCreateRoom = () => {
    console.log("Create Room button clicked");
    navigate('/rooms/create');
  };

  // Handle share room link
  const handleShareRoom = async (roomId, roomName) => {
    const url = `${window.location.origin}/rooms/${roomId}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success(`Link for "${roomName}" copied to clipboard!`, { duration: 3000 });
      } else {
        // Fallback for browsers without clipboard API
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        toast.success(`Link for "${roomName}" copied to clipboard!`, { duration: 3000 });
      }
      setOpenMenuRoomId(null);
    } catch (err) {
      console.error('Failed to copy link:', err);
      toast.error('Failed to copy link. Please try again.');
    }
  };

  // Open delete confirmation modal
  const handleOpenDeleteModal = (room) => {
    setRoomToDelete(room);
    setOpenMenuRoomId(null);
  };

  // Handle room deletion
  const handleRoomDelete = async (roomId) => {
    if (!window.confirm('Are you sure you want to delete this room? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      await deleteRoom(roomId);
      setRooms(prevRooms => prevRooms.filter(room => room.id !== roomId));
      console.log(`Room ${roomId} deleted successfully`);
    } catch (err) {
      console.error('Error deleting room:', err);
      setError('Failed to delete room. Please try again.');
      const data = await getRooms();
      setRooms(data.rooms || []);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Handle profile save
  const handleSaveProfile = async (profileData) => {
    try {
      const formData = new FormData();
      formData.append('username', profileData.username);
      formData.append('bio', profileData.bio || '');
      
      if (profileData.avatarFile) {
        formData.append('avatar', profileData.avatarFile);
      }

      const response = await apiClient.put('/api/users/profile', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      toast.success('Profile updated successfully!');
      
      // ✅ Refresh user data to show updated profile
      if (refreshUser) {
        await refreshUser();
      }
    } catch (err) {
      console.error('Failed to update profile:', err);
      toast.error('Failed to update profile. Please try again.');
    }
  };

  return (
    <div className="relative min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-200">
      {/* ✅ Hamburger Menu Button - Fixed Top Left */}
      <button
        onClick={() => setIsLobbyLeftSidebarOpen(true)}
        className="fixed top-4 left-4 z-30 bg-gray-800 hover:bg-gray-700 text-white p-3 rounded-lg shadow-lg transition-colors duration-200"
        aria-label="Open menu"
      >
        <Bars3Icon className="h-6 w-6" />
      </button>

      {/* ✅ Left Sidebar */}
      <LobbyLeftSidebar
        isOpen={isLobbyLeftSidebarOpen}
        onClose={() => setIsLobbyLeftSidebarOpen(false)}
        currentUser={currentUser}
        onMyProfileClick={() => {
          setIsLobbyLeftSidebarOpen(false);
          setIsUserProfileModalOpen(true);
        }}
        onSettingsClick={() => {
          setIsLobbyLeftSidebarOpen(false);
          setIsSettingsModalOpen(true);
        }}
      />

      {/* ✅ User Profile Modal */}
      <UserProfileModal
        user={currentUser}
        isOpen={isUserProfileModalOpen}
        onClose={() => setIsUserProfileModalOpen(false)}
        isOwnProfile={true}
        onSaveProfile={handleSaveProfile}
      />

      {/* ✅ Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />

      <div className="container mx-auto p-4">
        {/* ✅ Toast Notifications */}
        <Toaster position="top-center" />

        {/* ✅ Watch Type Selection Modal */}
        <WatchTypeModal
          isOpen={isWatchTypeModalOpen}
          onClose={() => setIsWatchTypeModalOpen(false)}
          onSelectType={handleWatchTypeSelected}
          title="Choose Your Instant Watch Experience"
        />

        {/* ✅ Create New Modal */}
        <CreateNewModal
          isOpen={isCreateNewModalOpen}
          onClose={() => setIsCreateNewModalOpen(false)}
          onInstantWatch={handleInstantWatch}
          onCreateRoom={handleCreateRoom}
        />

        {/* Delete Room Modal */}
        <DeleteRoomModal
          isOpen={!!roomToDelete}
          onClose={() => setRoomToDelete(null)}
          onConfirm={handleRoomDelete}
          room={roomToDelete}
        />

        <h1 className="text-3xl font-bold mb-6 text-center text-gray-900 dark:text-white">WeWatch Lobby</h1>
      <p className="text-center mb-8 text-gray-700 dark:text-gray-300">Welcome! Find or create a room to start watching together.</p>

      {/* Search Bar Section with Create New Button */}
      <div className="mb-8 flex justify-center">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-3xl">
          {/* Create New Button - Left side */}
          <button
            type="button"
            onClick={() => setIsCreateNewModalOpen(true)}
            className="flex-shrink-0 hover:opacity-80 transition-opacity"
            title="Create New Room or Start Instant Watch"
          >
            <img 
              src="/icons/newRoom.svg" 
              alt="Create New" 
              className="h-12 w-12 sm:h-14 sm:w-14"
            />
          </button>

          {/* Search Form - Right side */}
          <form onSubmit={handleSearchSubmit} className="flex w-full">
            <input
              type="text"
              placeholder="Search room name or description..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-l-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            />
            <button
              type="submit"
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      {/* ✅ Tab Navigation */}
      <div className="mb-6">
        <div className="flex border-b border-gray-300 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('rooms')}
            className={`px-6 py-3 text-lg font-semibold transition-colors relative ${
              activeTab === 'rooms'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Rooms
            {activeTab === 'rooms' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('watching')}
            className={`px-6 py-3 text-lg font-semibold transition-colors relative ${
              activeTab === 'watching'
                ? 'text-purple-600 dark:text-purple-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Watching Now
            {sessions.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-purple-600 text-white rounded-full">
                {sessions.length}
              </span>
            )}
            {activeTab === 'watching' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600 dark:bg-purple-400"></div>
            )}
          </button>
        </div>
      </div>

      {/* ✅ ROOMS TAB CONTENT */}
      {activeTab === 'rooms' && (
        <div>
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            Available Rooms {searchTerm && ` (Filtered: ${filteredRooms.length}/${rooms.length})`}
          </h2>

          {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center h-32">
            <p className="text-lg text-gray-700 dark:text-gray-300">Loading rooms...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-100 dark:bg-red-900/50 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded relative mb-4" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        {/* Data Display */}
        {!loading && !error && (
          <>
            {filteredRooms && filteredRooms.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredRooms.map((room) => (
                  <div 
                    key={room.id} 
                    className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden hover:shadow-lg transition-shadow duration-300 relative cursor-pointer border border-gray-200 dark:border-gray-700"
                    onClick={() => navigate(`/rooms/${room.id}`)}
                   >
                    {/* Room Card Content */}
                    <div className="p-6">
                      {/* Top Section - Room Name and Host */}
                      <div className="flex justify-between items-start mb-3">
                        <h2 className="text-xl font-semibold mb-0 text-blue-600 dark:text-blue-400 hover:underline">{room.name}</h2>
                        <span className="text-sm text-gray-600 dark:text-gray-400">Host: {room.host_username || `User ${room.host_id}`}</span>
                      </div>
      
                      {/* Description */}
                      {room.description && room.description.trim() !== '' && (
                      <p className="text-gray-600 dark:text-gray-300 mb-4">{room.description || 'No description provided for this room.'}</p>
                      )}


                      {/* Playing Now and Coming Next */}
                      <div className="mb-4">
                        <div className="text-sm text-gray-800 dark:text-gray-200 mb-1">
                          <span className="font-medium">Playing Now:</span> {room.currently_playing || 'No media playing'}
                        </div>
  
                        {room.coming_next && room.coming_next.trim() !== '' && (
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            <span className="font-medium">Coming Next:</span> {room.coming_next}
                          </div>
                        )}
                      </div>
                    
                    
                    
                      {/* Ellipsis Menu - Top Right */}
                      {authenticatedUserID && authenticatedUserID === room.host_id && (
                        <div className="absolute top-4 right-4 room-menu">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuRoomId(openMenuRoomId === room.id ? null : room.id);
                            }}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                            title="Room Options"
                          >
                            <EllipsisVerticalIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                          </button>

                          {/* Dropdown Menu */}
                          {openMenuRoomId === room.id && (
                            <div className="absolute top-10 right-0 bg-white dark:bg-gray-800 shadow-lg rounded-lg w-48 py-2 z-50 border border-gray-200 dark:border-gray-700">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenDeleteModal(room);
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-gray-700 dark:text-gray-300"
                              >
                                <TrashIcon className="h-5 w-5 text-red-500" />
                                <span>Delete Room</span>
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleShareRoom(room.id, room.name);
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-gray-700 dark:text-gray-300"
                              >
                                <ShareIcon className="h-5 w-5 text-blue-500" />
                                <span>Share Link</span>
                              </button>

                              <button
                                disabled
                                className="w-full text-left px-4 py-2 flex items-center gap-3 text-gray-400 dark:text-gray-600 cursor-not-allowed"
                                title="Coming Soon"
                              >
                                <Cog6ToothIcon className="h-5 w-5" />
                                <span>Edit Settings</span>
                              </button>

                              <button
                                disabled
                                className="w-full text-left px-4 py-2 flex items-center gap-3 text-gray-400 dark:text-gray-600 cursor-not-allowed"
                                title="Coming Soon"
                              >
                                <ChartBarIcon className="h-5 w-5" />
                                <span>Analytics</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10">
                {searchTerm ? (
                  <>
                    <p className="text-xl mb-4 text-gray-700 dark:text-gray-300">No rooms match your search for "{searchTerm}".</p>
                    <button
                      onClick={() => setSearchTerm('')}
                      className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
                    >
                      Clear Search
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xl mb-4 text-gray-700 dark:text-gray-300">No rooms available yet.</p>
                    <button
                      onClick={handleCreateRoom}
                      className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                    >
                      Be the first to create one!
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
        </div>
      )}

      {/* ✅ WATCHING NOW TAB CONTENT */}
      {activeTab === 'watching' && (
        <div>
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            Active Watch Sessions {searchTerm && ` (Filtered: ${filteredSessions.length}/${sessions.length})`}
          </h2>

          {/* Loading State */}
          {sessionsLoading && (
            <div className="flex justify-center items-center h-32">
              <p className="text-lg text-gray-700 dark:text-gray-300">Loading sessions...</p>
            </div>
          )}

          {/* Data Display */}
          {!sessionsLoading && (
            <>
              {filteredSessions && filteredSessions.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredSessions.map((session) => (
                    <div 
                      key={session.session_id} 
                      className={`shadow-md rounded-lg overflow-hidden hover:shadow-lg transition-shadow duration-300 relative cursor-pointer border ${
                        session.is_temporary 
                          ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700' 
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                      }`}
                      onClick={() => handleSessionCardClick(session)}
                    >
                      {/* Session Card Content */}
                      <div className="p-6">
                        {/* Badge for session type */}
                        <div className="mb-3">
                          {session.is_temporary ? (
                            <span className="inline-block px-3 py-1 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-200 dark:bg-purple-800 rounded-full">
                              Instant Watch
                            </span>
                          ) : (
                            <span className="inline-block px-3 py-1 text-xs font-semibold text-green-700 dark:text-green-300 bg-green-200 dark:bg-green-800 rounded-full">
                              Regular Room
                            </span>
                          )}
                          {session.watch_type === '3d_cinema' && (
                            <span className="ml-2 inline-block px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-200 dark:bg-blue-800 rounded-full">
                              3D Cinema
                            </span>
                          )}
                        </div>

                        {/* Room Name and Host */}
                        <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
                          {session.room_name}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                          Host: {session.host_username}
                        </p>

                        {/* Currently Playing */}
                        {session.currently_playing && (
                          <div className="mb-3">
                            <p className="text-sm text-gray-800 dark:text-gray-200">
                              <span className="font-medium">Now Playing:</span> {session.currently_playing}
                            </p>
                          </div>
                        )}

                        {/* Member Count */}
                        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
                          </svg>
                          <span>{session.member_count} {session.member_count === 1 ? 'viewer' : 'viewers'}</span>
                        </div>

                        {/* Privacy Badge */}
                        {!session.is_public && (
                          <div className="mt-3">
                            <span className="inline-block px-2 py-1 text-xs text-gray-600 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 rounded">
                              🔒 Private
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10">
                  {searchTerm ? (
                    <>
                      <p className="text-xl mb-4 text-gray-700 dark:text-gray-300">No active sessions match your search for "{searchTerm}".</p>
                      <button
                        onClick={() => setSearchTerm('')}
                        className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
                      >
                        Clear Search
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-xl mb-4 text-gray-700 dark:text-gray-300">No active watch sessions right now.</p>
                      <p className="text-gray-600 dark:text-gray-400">Start an instant watch or create a room to begin!</p>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      </div>
    </div>
  );
};

export default LobbyPage;