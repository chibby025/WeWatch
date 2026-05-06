import React, { useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { XMarkIcon, PhotoIcon, UserPlusIcon, LinkIcon, TrashIcon } from '@heroicons/react/24/outline';
import { 
  updateRoomGroup, 
  deleteRoomGroup, 
  getRoomGroupMembers, 
  leaveRoomGroup,
  joinRoomGroup 
} from '../services/api';
import toast from 'react-hot-toast';

export default function RoomGroupEditModal({ 
  isOpen, 
  onClose, 
  group, 
  roomId, 
  isHost, 
  currentUserId,
  onUpdate,
  onDelete,
  isMember,
  onJoin,
  onLeave
}) {
  const [activeTab, setActiveTab] = useState('details');
  const [loading, setLoading] = useState(false);
  
  // Details tab state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  
  // Members tab state
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (isOpen && group) {
      setName(group.name || '');
      setDescription(group.description || '');
      const iconUrl = group.icon?.startsWith('http') ? group.icon : '';
      setImagePreview(iconUrl);
      setImageFile(null);
      setActiveTab('details');
    }
  }, [isOpen, group]);

  useEffect(() => {
    if (activeTab === 'members' && isOpen && group) {
      fetchMembers();
    }
  }, [activeTab, isOpen, group]);

  const fetchMembers = async () => {
    try {
      setLoadingMembers(true);
      const response = await getRoomGroupMembers(roomId, group.id);
      setMembers(response.data.members || []);
    } catch (error) {
      console.error('Error fetching members:', error);
      toast.error('Failed to load members');
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size must be less than 5MB');
        return;
      }
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleUpdateGroup = async () => {
    if (!name.trim()) {
      toast.error('Group name is required');
      return;
    }

    try {
      setLoading(true);
      
      let imageUrl = group.icon;
      
      // Upload new image if selected
      if (imageFile) {
        const formData = new FormData();
        formData.append('image', imageFile);
        
        const uploadResponse = await fetch(`/api/rooms/${roomId}/upload`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });
        
        if (!uploadResponse.ok) throw new Error('Image upload failed');
        const uploadData = await uploadResponse.json();
        imageUrl = uploadData.url;
      }

      const updateData = {
        name: name.trim(),
        description: description.trim(),
        icon: imageUrl,
      };

      await updateRoomGroup(roomId, group.id, updateData);
      toast.success('Group updated successfully');
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error updating group:', error);
      toast.error('Failed to update group');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!confirm('Are you sure you want to delete this group? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      await deleteRoomGroup(roomId, group.id);
      toast.success('Group deleted successfully');
      onDelete();
      onClose();
    } catch (error) {
      console.error('Error deleting group:', error);
      toast.error('Failed to delete group');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    try {
      setLoading(true);
      await joinRoomGroup(roomId, group.id);
      toast.success('Joined group successfully');
      onJoin();
      onClose();
    } catch (error) {
      console.error('Error joining group:', error);
      toast.error('Failed to join group');
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!confirm('Are you sure you want to leave this group?')) {
      return;
    }

    try {
      setLoading(true);
      await leaveRoomGroup(roomId, group.id);
      toast.success('Left group successfully');
      onLeave();
      onClose();
    } catch (error) {
      console.error('Error leaving group:', error);
      toast.error('Failed to leave group');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    // TODO: Implement remove member endpoint on backend
    toast.error('Remove member functionality coming soon');
  };

  const copyInviteLink = () => {
    // TODO: Implement invite link generation
    const inviteLink = `${window.location.origin}/rooms/${roomId}/groups/${group.id}/join`;
    navigator.clipboard.writeText(inviteLink);
    toast.success('Invite link copied to clipboard');
  };

  if (!group) return null;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-75" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <Dialog.Title as="h3" className="text-2xl font-bold text-white">
                    {group.name}
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 mb-6 border-b border-gray-700">
                  <button
                    onClick={() => setActiveTab('details')}
                    className={`pb-2 px-2 font-medium transition-colors ${
                      activeTab === 'details'
                        ? 'text-purple-500 border-b-2 border-purple-500'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Details
                  </button>
                  <button
                    onClick={() => setActiveTab('members')}
                    className={`pb-2 px-2 font-medium transition-colors ${
                      activeTab === 'members'
                        ? 'text-purple-500 border-b-2 border-purple-500'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Members ({group.member_count || 0})
                  </button>
                  {isHost && (
                    <button
                      onClick={() => setActiveTab('settings')}
                      className={`pb-2 px-2 font-medium transition-colors ${
                        activeTab === 'settings'
                          ? 'text-purple-500 border-b-2 border-purple-500'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Settings
                    </button>
                  )}
                </div>

                {/* Tab Content */}
                <div className="space-y-4">
                  {activeTab === 'details' && (
                    <>
                      {/* Group Image */}
                      <div className="flex flex-col items-center gap-3">
                        <div className="relative">
                          <div className="w-24 h-24 rounded-lg overflow-hidden bg-gray-700 flex items-center justify-center">
                            {imagePreview ? (
                              <img src={imagePreview} alt="Group" className="w-full h-full object-cover" />
                            ) : group.icon && !group.icon.startsWith('http') ? (
                              <span className="text-4xl">{group.icon}</span>
                            ) : (
                              <PhotoIcon className="w-12 h-12 text-gray-500" />
                            )}
                          </div>
                          {isHost && (
                            <label className="absolute bottom-0 right-0 bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-full cursor-pointer transition-colors">
                              <PhotoIcon className="w-4 h-4" />
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageChange}
                                className="hidden"
                                disabled={loading}
                              />
                            </label>
                          )}
                        </div>
                      </div>

                      {/* Group Name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Group Name
                        </label>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          disabled={!isHost || loading}
                          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          placeholder="Group name"
                        />
                      </div>

                      {/* Group Description */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Description
                        </label>
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          disabled={!isHost || loading}
                          rows={3}
                          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed resize-none"
                          placeholder="Group description (optional)"
                        />
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-3 mt-6">
                        {isHost ? (
                          <>
                            <button
                              onClick={handleUpdateGroup}
                              disabled={loading}
                              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {loading ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button
                              onClick={onClose}
                              disabled={loading}
                              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </>
                        ) : isMember ? (
                          <>
                            <button
                              onClick={handleLeaveGroup}
                              disabled={loading}
                              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {loading ? 'Leaving...' : 'Leave Group'}
                            </button>
                            <button
                              onClick={onClose}
                              disabled={loading}
                              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                              Close
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={handleJoinGroup}
                              disabled={loading}
                              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {loading ? 'Joining...' : 'Join Group'}
                            </button>
                            <button
                              onClick={onClose}
                              disabled={loading}
                              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                              Close
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}

                  {activeTab === 'members' && (
                    <>
                      {/* Invite Link Section */}
                      <div className="bg-gray-700 rounded-lg p-4 flex items-center justify-between">
                        <div>
                          <h4 className="text-white font-medium mb-1">Invite Link</h4>
                          <p className="text-sm text-gray-400">Share this link to invite others</p>
                        </div>
                        <button
                          onClick={copyInviteLink}
                          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors"
                        >
                          <LinkIcon className="w-5 h-5" />
                          Copy Link
                        </button>
                      </div>

                      {/* Members List */}
                      <div>
                        <h4 className="text-white font-medium mb-3">Members</h4>
                        {loadingMembers ? (
                          <div className="text-center py-8 text-gray-400">Loading members...</div>
                        ) : members.length === 0 ? (
                          <div className="text-center py-8 text-gray-400">No members yet</div>
                        ) : (
                          <div className="space-y-2 max-h-96 overflow-y-auto">
                            {members.map((member) => (
                              <div
                                key={member.user_id}
                                className="flex items-center justify-between bg-gray-700 rounded-lg p-3"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                    <span className="text-white font-medium">
                                      {member.username?.charAt(0).toUpperCase() || 'U'}
                                    </span>
                                  </div>
                                  <div>
                                    <p className="text-white font-medium">{member.username || `User ${member.user_id}`}</p>
                                    <p className="text-xs text-gray-400">
                                      Joined {new Date(member.joined_at).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>
                                {isHost && member.user_id !== currentUserId && (
                                  <button
                                    onClick={() => handleRemoveMember(member.user_id)}
                                    className="text-red-400 hover:text-red-300 transition-colors"
                                    title="Remove member"
                                  >
                                    <TrashIcon className="w-5 h-5" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {activeTab === 'settings' && isHost && (
                    <>
                      {/* Delete Group Section */}
                      <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
                        <h4 className="text-red-400 font-medium mb-2">Danger Zone</h4>
                        <p className="text-sm text-gray-400 mb-4">
                          Once you delete a group, there is no going back. All messages and content will be permanently deleted.
                        </p>
                        <button
                          onClick={handleDeleteGroup}
                          disabled={loading}
                          className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loading ? 'Deleting...' : 'Delete Group'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
