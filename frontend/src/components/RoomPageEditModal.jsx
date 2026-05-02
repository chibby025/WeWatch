// WeWatch/frontend/src/components/RoomPageEditModal.jsx
// Modal for editing room settings and preferences
import React, { useState, useEffect } from 'react';
import { XMarkIcon, FilmIcon, PhotoIcon, TrashIcon, PencilIcon, ShareIcon } from '@heroicons/react/24/outline';
import apiClient from '../services/api';
import toast from 'react-hot-toast';
import PostsGrid from './PostsGrid';
import PostViewModal from './PostViewModal';
import UserProfileModal from './UserProfileModal';
import { useAuth } from '../contexts/AuthContext';

const RoomPageEditModal = ({ isOpen, onClose, room, onUpdate, onShare, isHost = true, membersInRoom = 0, members = [] }) => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('info');
  const [selectedPost, setSelectedPost] = useState(null);
  const [isPostViewModalOpen, setIsPostViewModalOpen] = useState(false);
  const [showMembersList, setShowMembersList] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    show_host: true,
    show_description: true,
    host_only_chat: false,
  });
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isHostProfileModalOpen, setIsHostProfileModalOpen] = useState(false);
  const [expandedMemberAvatar, setExpandedMemberAvatar] = useState(null);

  // Initialize form data when room changes
  useEffect(() => {
    if (room) {
      // Handle both lowercase and uppercase field names from backend
      const showHost = room.show_host !== undefined ? room.show_host : (room.ShowHost !== undefined ? room.ShowHost : true);
      const showDescription = room.show_description !== undefined ? room.show_description : (room.ShowDescription !== undefined ? room.ShowDescription : true);
      const hostOnlyChat = room.host_only_chat !== undefined ? room.host_only_chat : (room.HostOnlyChat !== undefined ? room.HostOnlyChat : false);
      
      setFormData({
        name: room.name || room.Name || '',
        description: room.description || room.Description || '',
        show_host: showHost,
        show_description: showDescription,
        host_only_chat: hostOnlyChat,
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
      // Always set show_host and show_description to true
      const updateData = {
        ...formData,
        show_host: true,
        show_description: true
      };
      const response = await apiClient.put(`/api/rooms/${roomId}`, updateData);
      
      // Update local state to reflect saved changes
      setFormData({
        name: response.data.name || response.data.Name || '',
        description: response.data.description || response.data.Description || '',
        show_host: true,
        show_description: true,
      });
      
      onUpdate(response.data);
      toast.success('Room updated successfully');
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
        {/* Header with Room Image */}
        <div className="p-4 sm:p-6 border-b border-gray-700/50">
          <div className="flex items-start gap-4">
            {/* Room Image */}
            <div className="relative flex-shrink-0 group">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-gradient-to-br from-purple-600 via-blue-600 to-purple-600 p-[3px] cursor-pointer"
                onClick={() => setIsImageExpanded(true)}
                title="Click to view full size"
              >
                <div className="w-full h-full rounded-full overflow-hidden bg-gray-900 flex items-center justify-center">
                  {imagePreview || room?.image_url ? (
                    <img 
                      src={imagePreview || room?.image_url} 
                      alt="Room preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FilmIcon className="w-10 h-10 text-purple-400 opacity-70" />
                  )}
                </div>
              </div>
              
              {/* Edit/Upload Button (Host only) */}
              {isHost && (
                <label 
                  htmlFor="room-image-input"
                  className="absolute bottom-0 right-0 bg-gradient-to-br from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-full p-2 cursor-pointer shadow-xl transition-all transform hover:scale-110"
                  title="Change image"
                  onClick={(e) => e.stopPropagation()}
                >
                  <PhotoIcon className="w-4 h-4 text-white" />
                </label>
              )}
              
              {/* Delete Button (Host only, only show if image exists) */}
              {isHost && (imagePreview || room?.image_url) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleImageDelete();
                  }}
                  disabled={uploadingImage}
                  className="absolute top-0 right-0 bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-full p-2 shadow-xl transition-all transform hover:scale-110 disabled:opacity-50"
                  title="Remove image"
                >
                  <TrashIcon className="w-4 h-4 text-white" />
                </button>
              )}

              {/* Hidden File Input */}
              <input
                id="room-image-input"
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              
              {/* Upload Button (only show if new file selected) */}
              {isHost && imageFile && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleImageUpload();
                  }}
                  disabled={uploadingImage}
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white text-xs font-medium rounded-full transition-all shadow-lg disabled:opacity-50 whitespace-nowrap"
                >
                  {uploadingImage ? 'Uploading...' : 'Upload'}
                </button>
              )}
            </div>

            {/* Room Name and Description */}
            <div className="flex-1 min-w-0">
              {/* Room Name - Editable for Host */}
              {isEditingName && isHost ? (
                <input
                  type="text"
                  value={formData.name}
                  onChange={handleChange}
                  name="name"
                  placeholder="Room name..."
                  className="w-full text-lg sm:text-xl font-bold bg-gray-800/50 border border-gray-600 rounded-lg px-3 py-1 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  autoFocus
                  onBlur={() => setIsEditingName(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setIsEditingName(false);
                    if (e.key === 'Escape') {
                      setFormData(prev => ({ ...prev, name: room?.name || room?.Name || '' }));
                      setIsEditingName(false);
                    }
                  }}
                />
              ) : (
                <h2 
                  className={`text-lg sm:text-xl font-bold text-white truncate mb-2 ${isHost ? 'cursor-pointer hover:text-purple-400 transition-colors' : ''}`}
                  onClick={() => isHost && setIsEditingName(true)}
                  title={isHost ? 'Click to edit' : ''}
                >
                  {formData.name || 'Untitled Room'}
                </h2>
              )}
              
              {/* Description - Display/Edit */}
              {isEditingDescription ? (
                <div className="flex items-start gap-2">
                  <input
                    type="text"
                    value={formData.description}
                    onChange={handleChange}
                    name="description"
                    placeholder="Add a description..."
                    className="flex-1 px-3 py-1.5 text-sm bg-gray-800/50 border border-gray-600 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    autoFocus
                    onBlur={() => setIsEditingDescription(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setIsEditingDescription(false);
                      if (e.key === 'Escape') {
                        setFormData(prev => ({ ...prev, description: room?.description || room?.Description || '' }));
                        setIsEditingDescription(false);
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="flex items-start gap-2 group">
                  <p className="text-xs sm:text-sm text-gray-400 line-clamp-2 flex-1">
                    {formData.description || 'No description'}
                  </p>
                  {isHost && (
                    <button
                      onClick={() => setIsEditingDescription(true)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-700/50 rounded"
                      title="Edit description"
                    >
                      <PencilIcon className="w-3 h-3 text-gray-400" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {onShare && (
                <button
                  onClick={onShare}
                  className="p-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 transition-colors"
                  title="Share room"
                >
                  <ShareIcon className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-700/50 px-4 sm:px-6">
          <button
            onClick={() => setActiveTab('info')}
            className={`flex items-center gap-2 px-4 py-3 font-medium transition-all ${
              activeTab === 'info' 
                ? 'text-purple-400 border-b-2 border-purple-400' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span>ℹ️</span>
            <span>Info</span>
          </button>
          <button
            onClick={() => setActiveTab('posts')}
            className={`flex items-center gap-2 px-4 py-3 font-medium transition-all ${
              activeTab === 'posts' 
                ? 'text-purple-400 border-b-2 border-purple-400' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
            <span>Posts</span>
          </button>
        </div>

        {/* ℹ️ Info Tab - Room Settings & Stats */}
        {activeTab === 'info' && (
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
                  <div 
                    className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-purple-400 transition-all"
                    onClick={() => setIsHostProfileModalOpen(true)}
                    title="View host profile"
                  >
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
                      <span className="text-sm text-white font-bold">
                        {(room?.host_username || 'H')[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                  Host
                </span>
                <span 
                  className="text-white font-medium cursor-pointer hover:text-purple-400 transition-colors"
                  onClick={() => setIsHostProfileModalOpen(true)}
                  title="View host profile"
                >
                  {room?.host_username || `User ${room?.host_id || 'Unknown'}`}
                </span>
              </div>
              <div 
                onClick={() => setShowMembersList(!showMembersList)}
                className="flex items-center justify-between text-sm cursor-pointer hover:bg-white/5 -mx-2 px-2 py-1.5 rounded-lg transition-colors"
              >
                <span className="text-gray-400 flex items-center gap-2">
                  <img src="/icons/roomMembersIcon.svg" alt="" className="h-4 w-4 opacity-70" />
                  Members
                  <svg 
                    className={`w-3 h-3 transition-transform ${showMembersList ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
                <span className="text-white font-medium bg-purple-600/30 px-3 py-1 rounded-full">
                  {membersInRoom}
                </span>
              </div>
              
              {/* Inline Members List */}
              {showMembersList && members.length > 0 && (
                <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto scrollbar-hide">
                  {members.map((member) => (
                    <div 
                      key={member.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/30 hover:bg-gray-800/50 transition-colors"
                    >
                      <div 
                        className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-purple-400 transition-all"
                        onClick={() => setExpandedMemberAvatar(member.avatar_url || '/icons/user1avatar.svg')}
                        title="Click to view full size"
                      >
                        {member.avatar_url ? (
                          <img 
                            src={member.avatar_url} 
                            alt={member.username}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = '/icons/user1avatar.svg';
                            }}
                          />
                        ) : (
                          <span className="text-xs text-white font-bold">
                            {(member.username || 'U')[0].toUpperCase()}
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-white flex-1 truncate">
                        {member.username || `User ${member.id}`}
                      </span>
                      {member.id === room?.host_id && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-medium">
                          Host
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
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

            {/* Chat Settings */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-purple-300 mb-3 flex items-center gap-2">
                <span className="w-1 h-4 bg-purple-500 rounded-full"></span>
                Chat Settings
              </h3>
              
              {/* Host-Only Chat Toggle */}
              <div className="bg-gradient-to-br from-gray-800/40 to-gray-900/40 rounded-xl p-4 border border-gray-700/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">🔒</span>
                      <label htmlFor="host_only_chat" className="text-sm font-medium text-white">
                        Host-Only Chat
                      </label>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      When enabled, only you (the host) can send messages in the room chat. Members can still view messages but cannot reply.
                    </p>
                  </div>
                  <button
                    type="button"
                    id="host_only_chat"
                    onClick={() => setFormData(prev => ({ ...prev, host_only_chat: !prev.host_only_chat }))}
                    className={`relative inline-flex h-6 !w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
                      formData.host_only_chat ? 'bg-purple-600' : 'bg-gray-600'
                    }`}
                    style={{ minWidth: '2.75rem', width: '2.75rem' }}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        formData.host_only_chat ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                
                {/* Active State Indicator */}
                {formData.host_only_chat && (
                  <div className="mt-3 pt-3 border-t border-gray-700/50">
                    <div className="flex items-center gap-2 text-xs text-yellow-400">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <span>Chat is locked - only you can send messages</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>
        )}

        {/* 📹 Posts Tab - Instagram-style Grid */}
        {activeTab === 'posts' && (
          <div className="p-6 overflow-y-auto max-h-[90vh]">
            <PostsGrid 
              roomId={room?.id || room?.ID} 
              onPostClick={(post) => {
                setSelectedPost(post);
                setIsPostViewModalOpen(true);
              }}
            />
          </div>
        )}

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

        {/* Post View Modal */}
        {selectedPost && (
          <PostViewModal 
            isOpen={isPostViewModalOpen}
            onClose={() => {
              setIsPostViewModalOpen(false);
              setSelectedPost(null);
            }}
            post={selectedPost}
          />
        )}

        {/* Expanded Room Image Modal */}
        {isImageExpanded && (imagePreview || room?.image_url) && (
          <div 
            className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-4"
            onClick={() => setIsImageExpanded(false)}
          >
            <div className="relative">
              <button 
                onClick={() => setIsImageExpanded(false)}
                className="absolute -top-12 right-0 text-white hover:text-gray-300 text-3xl leading-none"
              >
                ×
              </button>
              <img 
                src={imagePreview || room?.image_url} 
                alt="Room"
                className="max-w-[600px] max-h-[600px] w-auto h-auto object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}
        
        {/* Expanded Member Avatar Modal */}
        {expandedMemberAvatar && (
          <div 
            className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-4"
            onClick={() => setExpandedMemberAvatar(null)}
          >
            <div className="relative">
              <button 
                onClick={() => setExpandedMemberAvatar(null)}
                className="absolute -top-12 right-0 text-white hover:text-gray-300 text-3xl leading-none"
              >
                ×
              </button>
              <img 
                src={expandedMemberAvatar} 
                alt="Member Avatar"
                className="max-w-[600px] max-h-[600px] w-auto h-auto object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = '/icons/user1avatar.svg';
                }}
              />
            </div>
          </div>
        )}
        
        {/* Host Profile Modal */}
        {isHostProfileModalOpen && room && (
          <UserProfileModal
            user={{
              id: room.host_id,
              username: room.host_username,
              avatar_url: room.host_avatar_url,
            }}
            isOpen={isHostProfileModalOpen}
            onClose={() => setIsHostProfileModalOpen(false)}
            isOwnProfile={currentUser?.id === room.host_id}
          />
        )}
      </div>
    </div>
  );
};

export default RoomPageEditModal;
