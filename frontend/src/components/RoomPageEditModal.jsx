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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[95vh] sm:max-h-[90vh] flex flex-col border border-gray-700/50">
        {/* Header with Host Avatar */}
        <div className="flex items-center gap-4 p-4 sm:p-6 border-b border-gray-700/50">
          {/* Host Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center ring-2 ring-purple-500/30">
              {room?.host_avatar_url ? (
                <img 
                  src={room.host_avatar_url} 
                  alt={room?.host_username || 'Host'}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = '/icons/user1avatar.svg';
                  }}
                />
              ) : (
                <span className="text-2xl text-white font-bold">
                  {(room?.host_username || 'H')[0].toUpperCase()}
                </span>
              )}
            </div>
            {/* Online indicator */}
            <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-gray-900"></div>
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-white truncate">
              Room Settings
            </h2>
            <p className="text-xs sm:text-sm text-gray-400 truncate">
              Host: {room?.host_username || 'Unknown'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {onShare && (
              <button
                onClick={onShare}
                className="p-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 transition-colors"
                title="Share room"
              >
                <img src="/icons/shareIcon.svg" alt="Share" className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            >
              <XMarkIcon className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide">
          <div className="p-4 sm:p-6 space-y-6">
            {/* Room Info Section */}
            <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 rounded-xl p-4 space-y-3 border border-purple-500/10">
              <h3 className="text-sm font-semibold text-purple-300 mb-2 flex items-center gap-2">
                <span className="w-1 h-4 bg-purple-500 rounded-full"></span>
                Room Info
              </h3>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400 flex items-center gap-2">
                  <img src="/icons/hostIcon.svg" alt="" className="h-4 w-4 opacity-70" />
                  Host
                </span>
                <span className="text-white font-medium">
                  {room?.host_username || `User ${room?.host_id}`}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400 flex items-center gap-2">
                  <img src="/icons/roomMembersIcon.svg" alt="" className="h-4 w-4 opacity-70" />
                  Members
                </span>
                <span className="text-white font-medium bg-purple-600/30 px-3 py-1 rounded-full">
                  {membersInRoom}
                </span>
              </div>
              {room?.average_watchers > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 flex items-center gap-2">
                    <span className="text-base">👥</span>
                    Avg. Watchers
                  </span>
                  <span className="text-white font-medium">
                    {typeof room.average_watchers === 'number' ? room.average_watchers.toFixed(1) : room.average_watchers}
                  </span>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-gray-700/50"></div>

            {/* Room Image Upload - Modern Style */}
          <div className="flex flex-col items-center space-y-4">
            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
              Room Image
            </label>
            
            {/* Circular Image Preview with Gradient Border */}
            <div className="relative group">
              <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-full overflow-hidden bg-gradient-to-br from-purple-600 via-blue-600 to-purple-600 p-[3px]">
                <div className="w-full h-full rounded-full overflow-hidden bg-gray-900 flex items-center justify-center">
                  {imagePreview ? (
                    <img 
                      src={imagePreview} 
                      alt="Room preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FilmIcon className="w-16 h-16 text-purple-400 opacity-70" />
                  )}
                </div>
              </div>
              
              {/* Camera/Upload Button Overlay (Host only) */}
              {isHost && (
                <label 
                  htmlFor="room-image-input"
                  className="absolute bottom-1 right-1 bg-gradient-to-br from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-full p-2.5 cursor-pointer shadow-xl transition-all transform hover:scale-110"
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
                  className="absolute top-1 right-1 bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-full p-2.5 shadow-xl transition-all transform hover:scale-110 disabled:opacity-50"
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
                className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white text-sm font-medium rounded-lg transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadingImage ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Uploading...
                  </span>
                ) : 'Upload Image'}
              </button>
            )}
            
            <p className="text-xs text-gray-500 text-center">
              JPG, PNG, GIF or WebP • Max 5MB
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-700/50"></div>

          {/* Room Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
              <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
              Room Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              disabled={!isHost}
              className="w-full px-4 py-3 border border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-gray-800/50 text-white placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              placeholder="Enter room name"
              required
            />
          </div>

          {/* Room Description with Display Toggle */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="description" className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
                Room Description
              </label>
              {/* Display Toggle - Host only */}
              {isHost && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Display</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formData.show_description}
                    onClick={() => handleChange({ target: { name: 'show_description', type: 'checkbox', checked: !formData.show_description } })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                      formData.show_description ? 'bg-gradient-to-r from-purple-600 to-blue-600' : 'bg-gray-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-lg ${
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
              className="w-full px-4 py-3 border border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-gray-800/50 text-white placeholder-gray-500 resize-none disabled:opacity-50 disabled:cursor-not-allowed transition-all scrollbar-hide"
              placeholder="Enter room description (optional)"
            />
          </div>

          {/* Toggle Options */}
          <div className="space-y-3">
            {/* Show Host (Host only) */}
            {isHost && (
              <div className="flex items-center justify-between p-3 bg-gray-800/30 rounded-xl border border-gray-700/50">
                <label htmlFor="show_host" className="text-sm font-medium text-gray-300">
                  Show Host Info
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.show_host}
                  onClick={() => handleChange({ target: { name: 'show_host', type: 'checkbox', checked: !formData.show_host } })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                    formData.show_host ? 'bg-gradient-to-r from-purple-600 to-blue-600' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-lg ${
                      formData.show_host ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>
          </div>
        </form>

        {/* Fixed Footer with Action Buttons */}
        {isHost && (
          <div className="border-t border-gray-700/50 p-4 sm:p-6 bg-gray-900/50">
            <button
              type="submit"
              onClick={(e) => {
                e.preventDefault();
                const form = e.target.closest('.fixed').querySelector('form');
                if (form) form.requestSubmit();
              }}
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <img src="/icons/saveIcon.svg" alt="Save" className="w-5 h-5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomPageEditModal;
