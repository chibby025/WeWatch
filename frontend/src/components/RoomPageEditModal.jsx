// WeWatch/frontend/src/components/RoomPageEditModal.jsx
// Modal for editing room settings and preferences
import React, { useState, useEffect } from 'react';
import { XMarkIcon, FilmIcon, PhotoIcon, TrashIcon } from '@heroicons/react/24/outline';
import apiClient from '../services/api';
import toast from 'react-hot-toast';

const RoomPageEditModal = ({ isOpen, onClose, room, onUpdate, onShare, isHost = true, membersInRoom = 0 }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    show_host: true,
    show_description: true,
  });
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

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
      
      // Set existing image preview
      setImagePreview(room.image_url || null);
      setImageFile(null);
    }
  }, [room]);

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    setImageFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = async () => {
    if (!imageFile) {
      toast.error('Please select an image first');
      return;
    }

    const roomId = room?.id || room?.ID;
    if (!roomId) {
      toast.error('Room information is missing');
      return;
    }

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', imageFile);

      const response = await apiClient.put(`/api/rooms/${roomId}/image`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      toast.success('Room image updated successfully');
      onUpdate({ ...room, image_url: response.data.image_url });
      setImageFile(null);
    } catch (error) {
      console.error('Failed to upload image:', error);
      toast.error(error.response?.data?.error || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageDelete = async () => {
    const roomId = room?.id || room?.ID;
    if (!roomId) {
      toast.error('Room information is missing');
      return;
    }

    if (!room.image_url && !imagePreview) {
      toast.error('No image to delete');
      return;
    }

    const confirmed = window.confirm('Are you sure you want to remove the room image?');
    if (!confirmed) return;

    setUploadingImage(true);
    try {
      await apiClient.delete(`/api/rooms/${roomId}/image`);
      toast.success('Room image removed successfully');
      onUpdate({ ...room, image_url: null });
      setImagePreview(null);
      setImageFile(null);
    } catch (error) {
      console.error('Failed to delete image:', error);
      toast.error(error.response?.data?.error || 'Failed to delete image');
    } finally {
      setUploadingImage(false);
    }
  };

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
          {/* Room Info Section */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Room Info</h3>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                <img src="/icons/hostIcon.svg" alt="" className="h-4 w-4" />
                Host
              </span>
              <span className="text-gray-900 dark:text-white font-medium">
                {room?.host_username || `User ${room?.host_id}`}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                <img src="/icons/roomMembersIcon.svg" alt="" className="h-4 w-4" />
                Members
              </span>
              <span className="text-gray-900 dark:text-white font-medium">
                {membersInRoom}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-700"></div>

          {/* Room Image Upload - WhatsApp/Telegram Style Circular Avatar */}
          <div className="flex flex-col items-center space-y-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Room Image
            </label>
            
            {/* Circular Image Preview */}
            <div className="relative">
              <div className="w-32 h-32 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center ring-4 ring-gray-300 dark:ring-gray-600">
                {imagePreview ? (
                  <img 
                    src={imagePreview} 
                    alt="Room preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <FilmIcon className="w-16 h-16 text-white opacity-80" />
                )}
              </div>
              
              {/* Camera/Upload Button Overlay (Host only) */}
              {isHost && (
                <label 
                  htmlFor="room-image-input"
                  className="absolute bottom-0 right-0 bg-blue-600 hover:bg-blue-700 rounded-full p-2 cursor-pointer shadow-lg transition-colors"
                  title="Change image"
                >
                  <PhotoIcon className="w-5 h-5 text-white" />
                </label>
              )}
              
              {/* Delete Button (Host only, only show if image exists) */}
              {isHost && imagePreview && (
                <button
                  type="button"
                  onClick={handleImageDelete}
                  disabled={uploadingImage}
                  className="absolute top-0 right-0 bg-red-500 hover:bg-red-600 rounded-full p-2 shadow-lg transition-colors disabled:opacity-50"
                  title="Remove image"
                >
                  <TrashIcon className="w-5 h-5 text-white" />
                </button>
              )}
            </div>
            
            {/* Hidden File Input */}
            <input
              id="room-image-input"
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            
            {/* Upload Button (Host only, only show if new file selected) */}
            {isHost && imageFile && (
              <button
                type="button"
                onClick={handleImageUpload}
                disabled={uploadingImage}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {uploadingImage ? 'Uploading...' : 'Upload Image'}
              </button>
            )}
            
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              JPG, PNG, GIF or WebP • Max 5MB
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-700"></div>

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
              disabled={!isHost}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
              {/* Display Toggle - Host only */}
              {isHost && (
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
              )}
            </div>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              disabled={!isHost}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Enter room description (optional)"
            />
          </div>

          {/* Toggle Options */}
          <div className="space-y-4">
            {/* Show Host (Host only) */}
            {isHost && (
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
            )}
          </div>

          {/* Action Buttons */}
          {isHost && (
            <div className="flex gap-4 pt-4 justify-center">
              <button
                type="submit"
                disabled={loading}
                title={loading ? 'Saving...' : 'Save Changes'}
                className="hover:opacity-70 disabled:opacity-40 transition-opacity"
              >
                <img src="/icons/saveIcon.svg" alt="Save" className="w-10 h-10" />
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default RoomPageEditModal;
