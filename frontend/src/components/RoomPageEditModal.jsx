// WeWatch/frontend/src/components/RoomPageEditModal.jsx
// Modal for editing room settings and preferences
import React, { useState, useEffect } from 'react';
import { XMarkIcon, FilmIcon, PhotoIcon, TrashIcon, PencilIcon, ShareIcon, PlusIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { InformationCircleIcon, Squares2X2Icon, UsersIcon, UserGroupIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/solid';
import apiClient, { createRoomGroup, getRoomGroups, updateRoomGroup, deleteRoomGroup, searchUsers, inviteUserToRoom } from '../services/api';
import toast from 'react-hot-toast';
import PostsGrid from './PostsGrid';
import PostViewModal from './PostViewModal';
import UserProfileModal from './UserProfileModal';
import EmojiPicker from './EmojiPicker';
import Avatar from './Avatar';
import { resolveAvatarUrl } from '../utils/avatar';
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
    handle: '',
    show_host: true,
    show_description: true,
    host_only_chat: false,
    auto_invite_followers: true,
  });
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingHandle, setIsEditingHandle] = useState(false);
  const [isHostProfileModalOpen, setIsHostProfileModalOpen] = useState(false);
  const [expandedMemberAvatar, setExpandedMemberAvatar] = useState(null);

  // Groups state
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '', icon: '💬', is_public: true });
  const [editingGroup, setEditingGroup] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerType, setEmojiPickerType] = useState(null); // 'icon', 'title', 'edit-icon', or 'edit-title'
  const [selectedGroupForEmoji, setSelectedGroupForEmoji] = useState(null);
  const [groupImageFile, setGroupImageFile] = useState(null); // For new group image upload
  const [groupImagePreview, setGroupImagePreview] = useState(null); // Preview URL for new group
  const [editGroupImageFile, setEditGroupImageFile] = useState(null); // For editing group image
  const [editGroupImagePreview, setEditGroupImagePreview] = useState(null); // Preview for editing

  // Add member state
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberQuery, setAddMemberQuery] = useState('');
  const [addMemberResults, setAddMemberResults] = useState([]);
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [invitedIds, setInvitedIds] = useState(new Set());

  // Initialize form data when room changes
  useEffect(() => {
    if (room) {
      // Handle both lowercase and uppercase field names from backend
      const showHost = room.show_host !== undefined ? room.show_host : (room.ShowHost !== undefined ? room.ShowHost : true);
      const showDescription = room.show_description !== undefined ? room.show_description : (room.ShowDescription !== undefined ? room.ShowDescription : true);
      const hostOnlyChat = room.host_only_chat !== undefined ? room.host_only_chat : (room.HostOnlyChat !== undefined ? room.HostOnlyChat : false);
      
      const autoInviteFollowers = room.auto_invite_followers !== undefined ? room.auto_invite_followers : true;

      setFormData({
        name: room.name || room.Name || '',
        description: room.description || room.Description || '',
        handle: room.handle || '',
        show_host: showHost,
        show_description: showDescription,
        host_only_chat: hostOnlyChat,
        auto_invite_followers: autoInviteFollowers,
      });
      
      // Set existing image preview
      setImagePreview(room.image_url || null);
      setImageFile(null);
    }
  }, [room]);

  // Fetch groups when modal opens and Groups tab is active
  useEffect(() => {
    if (isOpen && room?.id && activeTab === 'groups' && isHost) {
      fetchGroups();
    }
  }, [isOpen, room?.id, activeTab, isHost]);

  const fetchGroups = async () => {
    try {
      setLoadingGroups(true);
      const response = await getRoomGroups(room.id);
      setGroups(response.data.groups || []);
    } catch (error) {
      console.error('Error fetching groups:', error);
      toast.error('Failed to load groups');
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroup.name.trim()) {
      toast.error('Group name is required');
      return;
    }

    try {
      setCreatingGroup(true);
      
      let groupData = { ...newGroup };
      
      // If there's an image file, upload it first and use the URL
      if (groupImageFile) {
        const formData = new FormData();
        formData.append('file', groupImageFile);
        formData.append('type', 'group_icon'); // Distinguish from other uploads
        
        try {
          const uploadRes = await apiClient.post(`/api/rooms/${room.id}/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          
          // Use the uploaded file URL as the icon
          if (uploadRes.data.url) {
            groupData.icon = uploadRes.data.url;
          }
        } catch (uploadErr) {
          console.error('Error uploading group image:', uploadErr);
          toast.error('Failed to upload group image');
          setCreatingGroup(false);
          return;
        }
      }
      
      await createRoomGroup(room.id, groupData);
      toast.success('Group created successfully');
      setNewGroup({ name: '', description: '', icon: '💬', is_public: true });
      setGroupImageFile(null);
      setGroupImagePreview(null);
      fetchGroups();
    } catch (error) {
      console.error('Error creating group:', error);
      toast.error('Failed to create group');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleUpdateGroup = async (groupId, updates) => {
    try {
      let groupData = { ...updates };
      
      // If there's an image file to upload, upload it first
      if (editGroupImageFile) {
        const formData = new FormData();
        formData.append('file', editGroupImageFile);
        formData.append('type', 'group_icon');
        
        try {
          const uploadRes = await apiClient.post(`/api/rooms/${room.id}/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          
          if (uploadRes.data.url) {
            groupData.icon = uploadRes.data.url;
          }
        } catch (uploadErr) {
          console.error('Error uploading group image:', uploadErr);
          toast.error('Failed to upload group image');
          return;
        }
      }
      
      await updateRoomGroup(room.id, groupId, groupData);
      toast.success('Group updated successfully');
      setEditingGroup(null);
      setEditGroupImageFile(null);
      setEditGroupImagePreview(null);
      fetchGroups();
    } catch (error) {
      console.error('Error updating group:', error);
      toast.error('Failed to update group');
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!confirm('Are you sure? Messages will remain but group filter will be removed.')) return;

    try {
      await deleteRoomGroup(room.id, groupId);
      toast.success('Group deleted successfully');
      fetchGroups();
    } catch (error) {
      console.error('Error deleting group:', error);
      toast.error('Failed to delete group');
    }
  };

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
        handle: response.data.handle || response.data.Handle || '',
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

  const handleAddMemberSearch = async (query) => {
    setAddMemberQuery(query);
    if (query.trim().length < 2) { setAddMemberResults([]); return; }
    try {
      setAddMemberLoading(true);
      const data = await searchUsers(query);
      const existingIds = new Set([
        room?.host_id,
        ...(members || []).map(m => m.id),
      ]);
      setAddMemberResults((data.users || []).filter(u => !existingIds.has(u.id)));
    } catch {
      // silently ignore search errors
    } finally {
      setAddMemberLoading(false);
    }
  };

  const handleInviteUser = async (user) => {
    try {
      await inviteUserToRoom(room?.id || room?.ID, user.id);
      setInvitedIds(prev => new Set([...prev, user.id]));
      toast.success(`Invitation sent to @${user.username}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send invitation');
    }
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
                  className="absolute -top-1 left-1/2 -translate-x-1/2 flex items-center justify-center bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-full p-2 shadow-xl transition-all transform hover:scale-110 disabled:opacity-50"
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
                  className={`text-xl sm:text-2xl font-bold text-white truncate mb-0.5 ${isHost ? 'cursor-pointer hover:text-purple-400 transition-colors' : ''}`}
                  onClick={() => isHost && setIsEditingName(true)}
                  title={isHost ? 'Click to edit' : ''}
                >
                  {formData.name || 'Untitled Room'}
                </h2>
              )}
              
              {/* Handle */}
              {isEditingHandle && isHost ? (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-gray-500 text-xs font-semibold">@</span>
                  <input
                    type="text"
                    value={formData.handle}
                    onChange={(e) => setFormData(prev => ({ ...prev, handle: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 50) }))}
                    placeholder="handle"
                    className="w-full px-2 py-0.5 text-xs bg-gray-800/50 border border-gray-600 rounded text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    autoFocus
                    onBlur={() => setIsEditingHandle(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setIsEditingHandle(false);
                      if (e.key === 'Escape') {
                        setFormData(prev => ({ ...prev, handle: room?.handle || '' }));
                        setIsEditingHandle(false);
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-1 mt-0 group">
                  <p className="text-[10px] text-gray-500 font-medium">
                    {formData.handle ? `@${formData.handle}` : (isHost ? '@handle' : '')}
                  </p>
                  {isHost && (
                    <button
                      onClick={() => setIsEditingHandle(true)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-gray-700/50 rounded"
                      title="Edit handle"
                    >
                      <PencilIcon className="w-2.5 h-2.5 text-gray-500" />
                    </button>
                  )}
                </div>
              )}

              {/* Description - Display/Edit */}
              {isEditingDescription ? (
                <div className="flex items-start gap-2 mt-1.5">
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
                <div className="flex items-start gap-2 mt-1.5 group">
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
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-all ${
              activeTab === 'info'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <InformationCircleIcon className="w-4 h-4" />
            <span>Info</span>
          </button>
          <button
            onClick={() => setActiveTab('posts')}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-all ${
              activeTab === 'posts'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Squares2X2Icon className="w-4 h-4" />
            <span>Posts</span>
          </button>
          {isHost && (
            <button
              onClick={() => setActiveTab('groups')}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-all ${
                activeTab === 'groups'
                  ? 'text-purple-400 border-b-2 border-purple-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <ChatBubbleLeftRightIcon className="w-4 h-4" />
              <span>Groups</span>
            </button>
          )}
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
              {/* Host row */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400 flex items-center gap-2">
                  <Avatar
                    user={{ avatar_url: room?.host_avatar_url, username: room?.host_username }}
                    onClick={() => setIsHostProfileModalOpen(true)}
                    title="View host profile"
                    className="w-8 h-8 rounded-full object-cover cursor-pointer hover:ring-2 hover:ring-purple-400 transition-all"
                  />
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

              {/* Avg. Audience */}
              {room?.average_watchers > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 flex items-center gap-2">
                    <UserGroupIcon className="h-5 w-5 text-white" />
                    Avg. Audience
                  </span>
                  <span className="text-white font-medium">
                    {typeof room.average_watchers === 'number' ? room.average_watchers.toFixed(1) : room.average_watchers}
                  </span>
                </div>
              )}

              {/* Members row — chevron toggles list, UserPlus toggles search */}
              <div
                onClick={() => {
                  const next = !showMembersList;
                  setShowMembersList(next);
                  if (!next) { setShowAddMember(false); setAddMemberQuery(''); setAddMemberResults([]); }
                }}
                className="flex items-center justify-between text-sm cursor-pointer hover:bg-white/5 -mx-2 px-2 py-1.5 rounded-lg transition-colors"
              >
                <span className="text-white flex items-center gap-2">
                  <UsersIcon className="h-5 w-5 text-white" />
                  Members
                  <svg
                    className={`w-3 h-3 transition-transform ${showMembersList ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
                <div className="flex items-center gap-2">
                  {isHost && (
                    <button
                      type="button"
                      title="Invite member"
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = !showAddMember;
                        setShowAddMember(next);
                        if (next) { setShowMembersList(true); }
                        else { setAddMemberQuery(''); setAddMemberResults([]); }
                      }}
                      className={`p-1 rounded-md transition-colors ${showAddMember ? 'bg-purple-600/40 text-purple-300' : 'hover:bg-white/10 text-white'}`}
                    >
                      <UserPlusIcon className="w-5 h-5" />
                    </button>
                  )}
                  <span className="text-white font-medium bg-purple-600/30 px-3 py-1 rounded-full">
                    {membersInRoom}
                  </span>
                </div>
              </div>

              {/* Search bar — shown above the card when invite is open */}
              {isHost && showAddMember && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={addMemberQuery}
                    onChange={(e) => handleAddMemberSearch(e.target.value)}
                    placeholder="Search by username…"
                    autoFocus
                    className="flex-1 px-3 py-1.5 text-sm bg-gray-900/60 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => { setShowAddMember(false); setAddMemberQuery(''); setAddMemberResults([]); }}
                    className="text-gray-400 hover:text-white text-xs px-2 shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Unified card — member list when idle, search results when typing */}
              {showMembersList && (
                <div className="relative mt-2">
                  <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-hide rounded-xl bg-white/5 border border-white/10 p-1.5">
                    {addMemberQuery.trim().length >= 2 ? (
                      addMemberLoading ? (
                        <p className="text-xs text-gray-400 px-2 py-3 text-center">Searching…</p>
                      ) : addMemberResults.length === 0 ? (
                        <p className="text-xs text-gray-500 px-2 py-3 text-center">No users found</p>
                      ) : (
                        addMemberResults.map(user => (
                          <div key={user.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/10 transition-colors">
                            <Avatar user={user} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                            <span className="text-sm text-gray-200 flex-1 truncate">@{user.username}</span>
                            {invitedIds.has(user.id) ? (
                              <span className="text-xs text-green-400 font-medium">Invited ✓</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleInviteUser(user)}
                                className="text-xs px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors shrink-0"
                              >
                                Invite
                              </button>
                            )}
                          </div>
                        ))
                      )
                    ) : (
                      members.length > 0 ? (
                        members.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/10 transition-colors"
                          >
                            <Avatar
                              user={member}
                              onClick={() => setExpandedMemberAvatar(resolveAvatarUrl(member.avatar_url))}
                              title="Click to view full size"
                              className="w-7 h-7 rounded-full object-cover flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-purple-400 transition-all"
                            />
                            <span className="text-sm text-gray-200 flex-1 truncate">
                              {member.username || `User ${member.id}`}
                            </span>
                            {member.id === room?.host_id && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-medium">
                                Host
                              </span>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-gray-500 px-2 py-3 text-center">No members yet</p>
                      )
                    )}
                  </div>
                  {/* Scroll hint — member list only, when 5+ rows */}
                  {addMemberQuery.trim().length < 2 && members.length > 4 && (
                    <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 rounded-b-xl bg-gradient-to-t from-gray-900/80 to-transparent" />
                  )}
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
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-base">🔒</span>
                  <label htmlFor="host_only_chat" className="text-sm font-medium text-white">
                    Host-only chat
                  </label>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  Only you can send messages. Members can still read.
                </p>
                <label
                  htmlFor="host_only_chat"
                  className="relative cursor-pointer"
                  style={{ display: 'inline-block', width: '44px', height: '24px', flexShrink: 0 }}
                >
                  <input
                    type="checkbox"
                    id="host_only_chat"
                    className="sr-only"
                    checked={!!formData.host_only_chat}
                    onChange={() => setFormData(prev => ({ ...prev, host_only_chat: !prev.host_only_chat }))}
                  />
                  <span
                    className="absolute inset-0 rounded-full transition-colors duration-200"
                    style={{ backgroundColor: formData.host_only_chat ? '#9333ea' : '#4b5563' }}
                  />
                  <span
                    className="absolute rounded-full bg-white shadow transition-transform duration-200"
                    style={{
                      width: '20px', height: '20px',
                      top: '2px', left: '2px',
                      transform: formData.host_only_chat ? 'translateX(20px)' : 'translateX(0)',
                    }}
                  />
                </label>
                {formData.host_only_chat && (
                  <p className="mt-2 text-xs text-yellow-400">Chat is locked — only you can send messages</p>
                )}
              </div>

              {/* Auto-Invite Followers Toggle */}
              <div className="bg-gradient-to-br from-gray-800/40 to-gray-900/40 rounded-xl p-4 border border-gray-700/30 mt-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-base">🔔</span>
                  <label htmlFor="auto_invite_followers" className="text-sm font-medium text-white cursor-pointer">
                    Auto-invite followers
                  </label>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  New followers get a room invite automatically.
                </p>
                <label
                  htmlFor="auto_invite_followers"
                  className="relative cursor-pointer"
                  style={{ display: 'inline-block', width: '44px', height: '24px', flexShrink: 0 }}
                >
                  <input
                    type="checkbox"
                    id="auto_invite_followers"
                    className="sr-only"
                    checked={!!formData.auto_invite_followers}
                    onChange={() => setFormData(prev => ({ ...prev, auto_invite_followers: !prev.auto_invite_followers }))}
                  />
                  <span
                    className="absolute inset-0 rounded-full transition-colors duration-200"
                    style={{ backgroundColor: formData.auto_invite_followers ? '#9333ea' : '#4b5563' }}
                  />
                  <span
                    className="absolute rounded-full bg-white shadow transition-transform duration-200"
                    style={{
                      width: '20px', height: '20px',
                      top: '2px', left: '2px',
                      transform: formData.auto_invite_followers ? 'translateX(20px)' : 'translateX(0)',
                    }}
                  />
                </label>
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

        {/* 👥 Groups Tab - Discord-style channels */}
        {activeTab === 'groups' && (
          <div className="p-6 overflow-y-auto flex-1">
            {/* Create New Group - Host Only */}
            {isHost && (
            <div className="bg-gray-800/50 rounded-lg p-4 mb-4 border border-gray-700/50">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <PlusIcon className="w-4 h-4" />
                Create New Group
              </h3>
              <div className="space-y-3">
                {/* Group Image (Emoji or Upload) */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Group Image</label>
                  <div className="flex items-center gap-3">
                    {/* Display uploaded image */}
                    <div className="w-16 h-16 bg-gray-700/50 rounded-lg flex items-center justify-center overflow-hidden">
                      {groupImagePreview ? (
                        <img src={groupImagePreview} alt="Group" className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-gray-500 text-xs text-center">No image</div>
                      )}
                    </div>
                    {/* Buttons for file upload */}
                    <div className="flex flex-col gap-2">
                      <label className="px-4 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/50 rounded-lg transition-colors text-xs font-medium cursor-pointer text-center">
                        Upload Image
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              setGroupImageFile(file);
                              setGroupImagePreview(URL.createObjectURL(file));
                              setNewGroup(prev => ({ ...prev, icon: '' }));
                            }
                          }}
                        />
                      </label>
                      {groupImagePreview && (
                        <button
                          type="button"
                          onClick={() => {
                            setGroupImageFile(null);
                            setGroupImagePreview(null);
                            setNewGroup(prev => ({ ...prev, icon: '' }));
                          }}
                          className="px-4 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/50 rounded-lg transition-colors text-xs font-medium"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Group Name with Emoji Support */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Name *</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newGroup.name}
                      onChange={(e) => setNewGroup(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. General, Announcements, Random"
                      maxLength={100}
                      className="flex-1 px-3 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setEmojiPickerType('title');
                        setShowEmojiPicker(!showEmojiPicker);
                      }}
                      className="px-3 py-2 bg-gray-700/50 hover:bg-gray-700 text-gray-300 border border-gray-600 rounded-lg transition-colors text-lg"
                      title="Add emoji to title"
                    >
                      😀
                    </button>
                  </div>
                  
                  {/* Emoji Picker for Title */}
                  {showEmojiPicker && emojiPickerType === 'title' && (
                    <div className="mt-3 bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
                      <EmojiPicker
                        onEmojiSelect={(emoji) => {
                          setNewGroup(prev => ({ ...prev, name: prev.name + emoji }));
                          setShowEmojiPicker(false);
                          setEmojiPickerType(null);
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Group Description */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Description</label>
                  <input
                    type="text"
                    value={newGroup.description}
                    onChange={(e) => setNewGroup(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional description"
                    maxLength={500}
                    className="w-full px-3 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Visibility */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="group-public"
                    checked={newGroup.is_public}
                    onChange={(e) => setNewGroup(prev => ({ ...prev, is_public: e.target.checked }))}
                    className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                  />
                  <label htmlFor="group-public" className="text-sm text-gray-300">
                    Public (visible to all room members)
                  </label>
                </div>

                {/* Create Button */}
                <button
                  onClick={handleCreateGroup}
                  disabled={creatingGroup || !newGroup.name.trim()}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {creatingGroup ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Creating...
                    </>
                  ) : (
                    <>
                      <PlusIcon className="w-4 h-4" />
                      Create Group
                    </>
                  )}
                </button>
              </div>
            </div>
            )}

            {/* Existing Groups List */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-3">
                Existing Groups ({groups.length})
              </h3>
              
              {loadingGroups ? (
                <div className="text-center py-8 text-gray-400">
                  <svg className="animate-spin h-8 w-8 mx-auto mb-2" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading groups...
                </div>
              ) : groups.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <span className="text-4xl mb-2 block">👥</span>
                  <p>No groups yet</p>
                  <p className="text-xs mt-1">Create your first group above</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {groups.map((group) => (
                    <div
                      key={group.ID}
                      className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 hover:border-gray-600 transition-colors"
                    >
                      {editingGroup?.ID === group.ID ? (
                        // Edit Mode
                        <div className="space-y-2">
                          {/* Edit Icon/Image */}
                          <div>
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-12 h-12 bg-gray-700/50 rounded overflow-hidden flex items-center justify-center">
                                {editGroupImagePreview ? (
                                  <img src={editGroupImagePreview} alt="Group" className="w-full h-full object-cover" />
                                ) : editingGroup.icon && editingGroup.icon.startsWith('http') ? (
                                  <img src={editingGroup.icon} alt="Group" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="text-gray-500 text-xs text-center">No image</div>
                                )}
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <label className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/50 rounded text-xs cursor-pointer text-center">
                                  Upload Image
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files[0];
                                      if (file) {
                                        setEditGroupImageFile(file);
                                        setEditGroupImagePreview(URL.createObjectURL(file));
                                        setEditingGroup(prev => ({ ...prev, icon: '' }));
                                      }
                                    }}
                                  />
                                </label>
                                {(editGroupImagePreview || (editingGroup.icon && editingGroup.icon.startsWith('http'))) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditGroupImageFile(null);
                                      setEditGroupImagePreview(null);
                                      setEditingGroup(prev => ({ ...prev, icon: '' }));
                                    }}
                                    className="px-3 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/50 rounded text-xs"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {/* Edit Name */}
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={editingGroup.name}
                              onChange={(e) => setEditingGroup(prev => ({ ...prev, name: e.target.value }))}
                              className="flex-1 px-2 py-1 bg-gray-900/50 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          </div>
                          
                          <input
                            type="text"
                            value={editingGroup.description}
                            onChange={(e) => setEditingGroup(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Description"
                            className="w-full px-2 py-1 bg-gray-900/50 border border-gray-600 rounded text-white text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleUpdateGroup(group.ID, editingGroup)}
                              className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingGroup(null)}
                              className="flex-1 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        // View Mode
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 flex-shrink-0 rounded overflow-hidden flex items-center justify-center bg-gray-700/30">
                            {group.icon && group.icon.startsWith('http') ? (
                              <img src={group.icon} alt={group.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-2xl">{group.icon}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-white truncate">{group.name}</h4>
                              {!group.is_public && (
                                <span className="text-xs px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded">Private</span>
                              )}
                            </div>
                            {group.description && (
                              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{group.description}</p>
                            )}
                            <p className="text-xs text-gray-500 mt-1">{group.member_count || 0} members</p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => {
                                // TODO: Implement add member functionality
                                toast.success('Add member feature coming soon');
                              }}
                              className="p-1.5 hover:bg-purple-600/20 rounded transition-colors"
                              title="Add members"
                            >
                              <UserPlusIcon className="w-4 h-4 text-purple-400" />
                            </button>
                            <button
                              onClick={() => setEditingGroup(group)}
                              className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                              title="Edit group"
                            >
                              <PencilIcon className="w-4 h-4 text-gray-400" />
                            </button>
                            <button
                              onClick={() => handleDeleteGroup(group.ID)}
                              className="p-1.5 hover:bg-red-600/20 rounded transition-colors"
                              title="Delete group"
                            >
                              <TrashIcon className="w-4 h-4 text-red-400" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
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
                  <img src="/icons/saveIcon.svg" alt="Save" className="w-6 h-6 brightness-0 invert" />
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
