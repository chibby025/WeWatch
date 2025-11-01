// WeWatch/frontend/src/components/LobbyPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRooms, deleteRoom } from '../services/api';
import { TrashIcon } from '@heroicons/react/24/solid';
import jwtDecodeUtil from '../utils/jwt';
import apiClient from '../services/api';

const LobbyPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authenticatedUserID, setAuthenticatedUserID] = useState(null); // Add this state
  const [filteredRooms, setFilteredRooms] = useState([]);
  const navigate = useNavigate();
  const [currentDisplay, setCurrentDisplay] = useState('current'); // 'current' or 'next'

  // Fetch authenticated user ID (you need to implement this)
  useEffect(() => {
    const fetchAuthenticatedUser = async () => {
      try {
        const token = localStorage.getItem('wewatch_token');
        if (token) {
          // This should now work properly
          const decodedToken = jwtDecodeUtil(token);
          const userId = decodedToken.user_id;
          console.log("Authenticated user ID:", userId);
          setAuthenticatedUserID(userId);
        }
      } catch (err) {
        console.error("Error decoding JWT token:", err);
      }
    };

    fetchAuthenticatedUser();
  }, []);

  // handle instant watch room creation
  // Add this inside LobbyPage component, alongside other handlers
  const handleInstantWatch = async () => {
    try {
      setLoading(true);
      const response = await apiClient.post('/api/rooms/instant-watch');
      
      // ✅ CORRECT WAY:
      const { room_id, session } = response.data;
      const session_id = session.session_id; // ← extract from session object

      navigate(`/watch/${room_id}?session_id=${session_id}&instant=true`);
    } catch (err) {
      console.error('Failed to start instant watch:', err);
      setError('Could not start instant watch. Please try again.');
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

  // Filter rooms effect
  useEffect(() => {
    if (searchTerm === '') {
      setFilteredRooms(rooms);
    } else {
      const termLower = searchTerm.toLowerCase().trim();
      const filtered = rooms.filter(room =>
        (room.name && room.name.toLowerCase().includes(termLower)) ||
        (room.description && room.description.toLowerCase().includes(termLower))
      );
      setFilteredRooms(filtered);
    }
  }, [rooms, searchTerm]);

  useEffect(() => {
  // Refresh rooms every 30 seconds
  const interval = setInterval(() => {
    fetchRoomsData();
  }, 5000);
  
  return () => clearInterval(interval);
  }, []);

  // Fetch rooms effect
  useEffect(() => {
    const fetchRoomsData = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await getRooms();
        console.log("DEBUG: Raw rooms data from API:", data); // Add this line
        console.log("DEBUG: Rooms array:", data.rooms || []);
        setRooms(data.rooms || []);
      } catch (err) {
        console.error("LobbyPage: Error fetching rooms:", err);
        setError('Failed to load rooms. Please try again later.');
        setRooms([]);
        setFilteredRooms([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRoomsData();
  }, []);

  // Handle search change
  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  // Handle search submit
  const handleSearchSubmit = (event) => {
    event.preventDefault();
  };

  // Handle create room
  const handleCreateRoom = () => {
    console.log("Create Room button clicked");
    navigate('/rooms/create');
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

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6 text-center">WeWatch Lobby</h1>
      <p className="text-center mb-8">Welcome! Find or create a room to start watching together.</p>

      {/* Search Bar Section */}
      <div className="mb-8 flex justify-center">
        <form onSubmit={handleSearchSubmit} className="flex w-full max-w-md">
          <input
            type="text"
            placeholder="Search room name or description..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="px-4 py-2 border border-gray-300 rounded-l-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Search
          </button>
        </form>
      </div>

      {/* Create Room & Instant Watch Buttons */}
      <div className="flex justify-center gap-4 mb-6">
        <button
          type="button"
          onClick={handleCreateRoom}
          className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg shadow transition-colors duration-200"
        >
          + Create New Room
        </button>
        <button
          type="button"
          onClick={handleInstantWatch}
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg shadow transition-colors duration-200 flex items-center gap-2"
        >
          🎬 Instant Watch
        </button>
      </div>

      {/* Room List Section */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">
          Available Rooms {searchTerm && ` (Filtered: ${filteredRooms.length}/${rooms.length})`}
        </h2>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center h-32">
            <p className="text-lg">Loading rooms...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
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
                    className="bg-white shadow-md rounded-lg overflow-hidden hover:shadow-lg transition-shadow duration-300 relative"
                    onClick={() => navigate(`/rooms/${room.id}`)}
                   >
                    {/* Room Card Content */}
                    <div className="p-6">
                      {/* Top Section - Room Name and Host */}
                      <div className="flex justify-between items-start mb-3">
                        <h2 className="text-xl font-semibold mb-0 text-blue-600 hover:underline">{room.name}</h2>
                        <span className="text-sm text-gray-600">Host: User {room.host_id}</span>
                      </div>
      
                      {/* Description */}
                      {room.description && room.description.trim() !== '' && (
                      <p className="text-gray-600 mb-4">{room.description || 'No description provided for this room.'}</p>
                      )}


                      {/* Playing Now and Coming Next */}
                      <div className="mb-4">
                        <div className="text-sm text-gray-800 mb-1">
                          <span className="font-medium">Playing Now:</span> {room.currently_playing || 'No media playing'}
                        </div>
  
                        {room.coming_next && room.coming_next.trim() !== '' && (
                          <div className="text-sm text-gray-600">
                            <span className="font-medium">Coming Next:</span> {room.coming_next}
                          </div>
                        )}
                      </div>
                    
                    
                    
                      {/* Delete Button - Bottom Right */}
                      {authenticatedUserID && authenticatedUserID === room.host_id && (
                      <div className="absolute bottom-4 right-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent triggering card click
                            handleRoomDelete(room.id);
                          }}
                          className="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-3 rounded text-sm flex items-center"
                          title="Delete Room"
                        >
                            <TrashIcon className="h-4 w-4" />
                          </button>
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
                    <p className="text-xl mb-4">No rooms match your search for "{searchTerm}".</p>
                    <button
                      onClick={() => setSearchTerm('')}
                      className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
                    >
                      Clear Search
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xl mb-4">No rooms available yet.</p>
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
    </div>
  );
};

export default LobbyPage;