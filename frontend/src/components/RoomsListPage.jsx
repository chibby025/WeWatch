// WeWatch/frontend/src/components/RoomsListPage.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getRooms, deleteRoom } from '../services/api';
import { TrashIcon } from '@heroicons/react/24/solid';

const RoomsListPage = ({ currentUserID }) => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchRoomsData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getRooms();
        console.log('Fetched rooms:', data);
        setRooms(data.rooms || []);
      } catch (err) {
        console.error('Error fetching rooms:', err);
        setError('Failed to load rooms. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchRoomsData();
  }, []); // Empty dependency array means this runs once on mount

  const handleCreateRoom = () => {
    navigate('/rooms/create');
  };

  const handleDeleteRoom = async (roomId) => {
    if (!window.confirm('Are you sure you want to delete this room? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      await deleteRoom(roomId);
      setRooms(rooms.filter(room => room.id !== roomId));
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

  if (loading) {
    return (
      <div className="container mx-auto p-4 flex justify-center items-center h-64">
        <p className="text-xl">Loading rooms...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error! </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Available Rooms</h1>
        <button
          onClick={handleCreateRoom}
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
        >
         + Create New Room
        </button>
      </div>

      {rooms.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-xl mb-4">No rooms available yet.</p>
          <button
            onClick={handleCreateRoom}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Be the first to create one!
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => (
            <div key={room.id} className="bg-white shadow-md rounded-lg overflow-hidden hover:shadow-lg transition-shadow duration-300">
              <div className="p-6">
                <Link to={`/rooms/${room.id}`} className="block">
                  <h2 className="text-xl font-semibold mb-2 text-blue-600 hover:underline">{room.name}</h2>
                </Link>
                <p className="text-gray-600 mb-4">{room.description || 'No description provided.'}</p>
                <div className="flex justify-between text-sm text-gray-500 mb-4">
                  <span>Host: User {room.host_id}</span>
                  <span>Created: {new Date(room.created_at).toLocaleDateString()}</span>
                </div>
                
                {/* Delete button - only show for host */}
                {currentUserID && currentUserID === room.host_id && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleDeleteRoom(room.id)}
                      className="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-3 rounded text-sm flex items-center"
                      title="Delete Room"
                    >
                      <TrashIcon className="h-4 w-4 mr-1" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RoomsListPage;