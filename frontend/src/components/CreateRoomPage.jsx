// WeWatch/frontend/src/components/CreateRoomPage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom'; // For navigation after creation
import { createRoom } from '../services/api'; // Assume you'll create this function in api.js

const CreateRoomPage = () => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
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
      const roomData = { name: name.trim(), description };

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