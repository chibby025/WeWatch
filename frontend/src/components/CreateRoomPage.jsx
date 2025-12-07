// WeWatch/frontend/src/components/CreateRoomPage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom'; // For navigation after creation
import { createRoom } from '../services/api'; // Assume you'll create this function in api.js

const CreateRoomPage = () => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true); // ✅ Privacy toggle state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate(); // Hook for programmatic navigation

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
        setError('Room name is required.');
        return;
    }

    setLoading(true);
    setError(null);

    try {
      // Prepare data for the API call
      const roomData = { 
        name: name.trim(), 
        description,
        is_public: isPublic // ✅ Include privacy setting
      };

      // Call the createRoom function from the API service
      const data = await createRoom(roomData);
      console.log('Room created successfully:', data);
      console.log("👑 [CreateRoomPage] New Room Host ID:", data.room?.HostID);

      // Handle successful creation
      alert(`Room "${data.room.name}" created successfully!`);
      // Redirect to the newly created room's page (you'll need to implement the RoomPage component)
      // For now, let's redirect to a generic "rooms list" page or back to home
      navigate(`/rooms/${data.room.id}`); // Or '/rooms' if you make a list page first
      // navigate('/'); // Or back to home/dashboard

    } catch (err) {
      console.error('Error creating room:', err);
      // Handle errors from the API call (e.g., network issues, server errors, validation errors)
      if (err.response) {
        // Server responded with an error status (4xx, 5xx)
        setError(`Failed to create room: ${err.response.data.error || err.response.statusText}`);
      } else if (err.request) {
        // Request was made but no response received
        setError('Network error. Please check your connection.');
      } else {
        // Something else happened
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6 text-center">Create a New Room</h1>
      {/* Display error message if there is one */}
      {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">{error}</div>}
      
      <form onSubmit={handleSubmit} className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
        <div className="mb-4">
          <label htmlFor="roomName" className="block text-gray-700 text-sm font-bold mb-2">
            Room Name *
          </label>
          <input
            type="text"
            id="roomName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={loading}
            placeholder="Enter a name for your room"
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline disabled:opacity-50"
          />
          <p className="text-xs italic text-gray-500 mt-1">Required. Give your room a unique and descriptive name.</p>
        </div>
        
        <div className="mb-6">
          <label htmlFor="roomDescription" className="block text-gray-700 text-sm font-bold mb-2">
            Description (Optional)
          </label>
          <textarea
            id="roomDescription"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={loading}
            placeholder="Describe the purpose or content of this room..."
            rows="3"
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline disabled:opacity-50"
          ></textarea>
          <p className="text-xs italic text-gray-500 mt-1">Provide a brief description (max 500 characters).</p>
        </div>

        {/* ✅ Privacy Toggle */}
        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-bold mb-3">Room Privacy</label>
          <div className="flex items-center space-x-4">
            <button
              type="button"
              onClick={() => setIsPublic(true)}
              disabled={loading}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all duration-200 ${
                isPublic
                  ? 'bg-green-500 text-white shadow-md'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              } disabled:opacity-50`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a8 8 0 100 16 8 8 0 000-16zM8 11a1 1 0 100-2 1 1 0 000 2zm4 0a1 1 0 100-2 1 1 0 000 2z"/>
                </svg>
                <span>Public</span>
              </div>
              {isPublic && (
                <p className="text-xs mt-1 opacity-90">Anyone can find and join</p>
              )}
            </button>
            
            <button
              type="button"
              onClick={() => setIsPublic(false)}
              disabled={loading}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all duration-200 ${
                !isPublic
                  ? 'bg-orange-500 text-white shadow-md'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              } disabled:opacity-50`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
                </svg>
                <span>Private</span>
              </div>
              {!isPublic && (
                <p className="text-xs mt-1 opacity-90">Invite-only access</p>
              )}
            </button>
          </div>
          <p className="text-xs italic text-gray-500 mt-2">
            {isPublic 
              ? "Public rooms appear in the lobby for everyone to join."
              : "Private rooms require an invite link to join. You can share invites from the room page."}
          </p>
        </div>
        
        <div className="flex items-center justify-between">
          <button
            type="submit"
            disabled={loading}
            className={`bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? 'Creating...' : 'Create Room'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)} // Go back to the previous page
            disabled={loading}
            className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateRoomPage;