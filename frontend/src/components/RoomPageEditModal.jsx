// WeWatch/frontend/src/components/RoomPageEditModal.jsx
// Modal for editing room settings and preferences
import React, { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import apiClient from '../services/api';
import toast from 'react-hot-toast';

const RoomPageEditModal = ({ isOpen, onClose, room, onUpdate, onShare }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    show_host: true,
    show_description: true,
  });
  const [loading, setLoading] = useState(false);

  // Initialize form data when room changes
  useEffect(() => {
    if (room) {
      // Handle both lowercase and uppercase field names from backend
      const showHost = room.show_host !== undefined ? room.show_host : (room.ShowHost !== undefined ? room.ShowHost : true);
      const showDescription = room.show_description !== undefined ? room.show_description : (room.ShowDescription !== undefined ? room.ShowDescription : true);
      
      setFormData({
        name: room.name || room.Name || '',
        description: room.description || room.Description || '',
        show_host: showHost,
        show_description: showDescription,
      });
    }
  }, [room]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Handle both lowercase 'id' and uppercase 'ID' from backend
    const roomId = room?.id || room?.ID;
    
    if (!room || !roomId) {
      toast.error('Room information is missing');
      console.error('Room prop is:', room);
      return;
    }
    
    if (!formData.name.trim()) {
      toast.error('Room name is required');
      return;
    }

    setLoading(true);
    try {
      console.log('Updating room:', roomId, 'with data:', formData);
      const response = await apiClient.put(`/api/rooms/${roomId}`, formData);
      onUpdate(response.data);
      onClose();
    } catch (error) {
      console.error('Failed to update room:', error);
      console.error('Error response:', error.response?.data);
      toast.error(error.response?.data?.error || 'Failed to update room');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Room Settings
          </h2>
          <div className="flex items-center gap-3">
            {onShare && (
              <button
                onClick={onShare}
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                title="Share room"
              >
                <img src="/icons/shareIcon.svg" alt="Share" className="h-6 w-6" />
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Room Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Room Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Enter room name"
              required
            />
          </div>

          {/* Room Description with Display Toggle */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Room Description
              </label>
              {/* Display Toggle - Far Right */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">Display</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.show_description}
                  onClick={() => handleChange({ target: { name: 'show_description', type: 'checkbox', checked: !formData.show_description } })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    formData.show_description ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.show_description ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
              placeholder="Enter room description (optional)"
            />
          </div>

          {/* Toggle Options */}
          <div className="space-y-4">
            {/* Show Host */}
            <div className="flex items-center justify-between">
              <label htmlFor="show_host" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Show Host Info
              </label>
              <input
                type="checkbox"
                id="show_host"
                name="show_host"
                checked={formData.show_host}
                onChange={handleChange}
                className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-4 justify-center">
            <button
              type="button"
              onClick={onClose}
              title="Cancel"
              className="hover:opacity-70 transition-opacity"
            >
              <img src="/icons/cancelIcon.svg" alt="Cancel" className="w-10 h-10" />
            </button>
            <button
              type="submit"
              disabled={loading}
              title={loading ? 'Saving...' : 'Save Changes'}
              className="hover:opacity-70 disabled:opacity-40 transition-opacity"
            >
              <img src="/icons/saveIcon.svg" alt="Save" className="w-10 h-10" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RoomPageEditModal;
