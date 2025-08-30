
// 1. Import necessary hooks (useState, useEffect should already be there)
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
// 2. Import the API function to fetch rooms (make sure the path is correct)
import { getRooms } from '../services/api'; // Adjust the path if your api.js is elsewhere

// Define the LobbyPage functional component
const LobbyPage = () => {
  // --- STATE MANAGEMENT ---
  const [searchTerm, setSearchTerm] = useState(''); // State for the search input
  const [rooms, setRooms] = useState([]);           // State for the full list of fetched rooms
  const [loading, setLoading] = useState(true);     // State for loading indicator
  const [error, setError] = useState(null);         // State for error messages
  // 3. NEW: State for the filtered list of rooms based on search
  const [filteredRooms, setFilteredRooms] = useState([]); 

  // --- HOOKS ---
  const navigate = useNavigate();

  // --- EFFECTS ---

  // 4. NEW: useEffect for Filtering Logic
  // This effect runs whenever 'rooms' or 'searchTerm' changes.
  useEffect(() => {
    // console.log(`useEffect[rooms, searchTerm]: Filtering ${rooms.length} rooms for term '${searchTerm}'`);
    if (searchTerm === '') {
      // If search term is empty, show all rooms
      setFilteredRooms(rooms);
    } else {
      // Filter the rooms array
      const termLower = searchTerm.toLowerCase().trim();
      const filtered = rooms.filter(room =>
        // Check if room name or description includes the search term (case-insensitive)
        (room.name && room.name.toLowerCase().includes(termLower)) ||
        (room.description && room.description.toLowerCase().includes(termLower))
        // to add more fields to search here if needed (e.g., host username if available)
      );
      setFilteredRooms(filtered);
    }
    // console.log(`useEffect[rooms, searchTerm]: Filtered list has ${filteredRooms.length} items`);
  }, [rooms, searchTerm]); // Dependencies: re-run when rooms or searchTerm changes


  // 5. Existing useEffect for Fetching Rooms (No changes here)
  useEffect(() => {
    const fetchRoomsData = async () => {
      // console.log("LobbyPage: useEffect (fetch) triggered - fetching rooms...");
      setLoading(true);
      setError(null);

      try {
        const data = await getRooms();
        // console.log("LobbyPage: Fetched rooms ", data);
        setRooms(data.rooms || []);
        // Note: filteredRooms will be updated by the filtering useEffect above
        // because it depends on 'rooms'.

      } catch (err) {
        console.error("LobbyPage: Error fetching rooms:", err);
        setError('Failed to load rooms. Please try again later.');
        setRooms([]); // Clear rooms on error
        setFilteredRooms([]); // Clear filtered rooms on error
      } finally {
        setLoading(false);
      }
    };

    fetchRoomsData();
  }, []); // Empty dependency array: run only once on mount

  // --- EVENT HANDLERS ---
  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
    // The filtering useEffect will automatically trigger because searchTerm changed
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    // For client-side filtering, submitting the form isn't strictly necessary
    // because filtering happens on every keystroke/change in the input.
    // However, keeping the onSubmit handler allows triggering search via Enter key.
    // We can use it to blur the input or perform other minor UI tweaks if needed.
    // console.log("Searching for:", searchTerm);
    // alert(`You searched for: ${searchTerm}`); // Remove this alert for better UX
    // Example: Blur the input field after search (optional)
    // event.target.querySelector('input[type="text"]').blur();
  };

  const handleCreateRoom = () => {
    console.log("Create Room button clicked");
    navigate('/rooms/create');
  };

  // --- RENDERING ---
  return (
    <form onSubmit={handleSearchSubmit} className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6 text-center">WeWatch Lobby</h1>
      <p className="text-center mb-8">Welcome! Find or create a room to start watching together.</p>

      {/* Search Bar Section */}
      <div className="mb-8 flex justify-center">
        <input
          type="text"
          placeholder="Search room name or description..."
          value={searchTerm}
          onChange={handleSearchChange}
          // Removed onSubmit handler from input as form handles it
          className="px-4 py-2 border border-gray-300 rounded-l-lg w-full max-w-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit" // Part of the form submission
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Search
        </button>
      </div>

      {/* Create Room Button */}
      <div className="flex justify-center mb-6">
        <button
          type="button" // Prevents it from submitting the search form
          onClick={handleCreateRoom}
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
        >
          + Create New Room
        </button>
      </div>

      {/* Room List Section */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">
          {/* 6. Display total count or filtered count */}
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

        {/* Data Display (Only if not loading and no error) */}
        {!loading && !error && (
          <>
            {/* Check if there are filtered rooms to display */}
            {filteredRooms && filteredRooms.length > 0 ? (
              // 7. Render the grid of FILTERED room cards
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* 8. Map over the 'filteredRooms' array */}
                {filteredRooms.map((room) => (
                  <div
                    key={room.id}
                    className="bg-white shadow-md rounded-lg p-4 hover:shadow-lg transition-shadow duration-300 cursor-pointer"
                    onClick={() => navigate(`/rooms/${room.id}`)}
                  >
                    <h3 className="text-xl font-bold mb-2">{room.name}</h3>
                    <p className="text-gray-600 mb-2">
                      {room.description || 'No description provided.'}
                    </p>
                    <p className="text-sm text-gray-500">Hosted by: User {room.host_id}</p>
                    {/* Display creation date or other relevant info if available */}
                    {room.created_at && (
                      <p className="text-xs text-gray-400 mt-1">
                        Created: {new Date(room.created_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              // 9. Display a message if the filtered list is empty
              <div className="text-center py-10">
                {/* Check if it's because of search or genuinely no rooms */}
                {searchTerm ? (
                  <>
                    <p className="text-xl mb-4">No rooms match your search for "{searchTerm}".</p>
                    <button
                      onClick={() => setSearchTerm('')} // Clear search term
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
    </form>
  );
};

export default LobbyPage;