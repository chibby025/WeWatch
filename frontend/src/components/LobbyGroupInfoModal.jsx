// WeWatch/frontend/src/components/LobbyGroupInfoModal.jsx
// "Group Info" modal for lobby group chats (LobbyGroup/LobbyGroupMember) —
// view members, edit the group's name/icon. Scoped-down sibling of
// RoomPageEditModal.jsx's Info/Members treatment: no posts, no room-style
// settings, since a lobby DM-group doesn't have those concepts.
import React, { useState, useEffect } from 'react';
import { XMarkIcon, PencilIcon, UserPlusIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { UsersIcon } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import { renameLobbyGroup, addLobbyGroupMembers, uploadLobbyGroupIcon } from '../services/api';
import Avatar from './Avatar';
import UserProfileModal from './UserProfileModal';
import { resolveAvatarUrl } from '../utils/avatar';

const MAX_ICON_SIZE = 5 * 1024 * 1024; // 5MB, matches backend MaxImageSize

export default function LobbyGroupInfoModal({ isOpen, onClose, group, currentUser, friendsList = [], onGroupUpdated }) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [iconFile, setIconFile] = useState(null);
  const [iconPreview, setIconPreview] = useState(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);

  const [showAddMembers, setShowAddMembers] = useState(false);
  const [selectedNewMemberIds, setSelectedNewMemberIds] = useState([]);
  const [addingMembers, setAddingMembers] = useState(false);

  const [expandedMemberAvatar, setExpandedMemberAvatar] = useState(null);
  const [viewProfileUser, setViewProfileUser] = useState(null);

  // Reset per-field edit state whenever a different group is opened, and
  // keep nameInput in sync if the name changes externally (e.g. another
  // member renamed it) while this modal is open but not mid-edit.
  useEffect(() => {
    setNameInput(group?.name || '');
    setIsEditingName(false);
    setIconFile(null);
    setIconPreview(null);
    setShowAddMembers(false);
    setSelectedNewMemberIds([]);
  }, [group?.id, group?.name]);

  if (!isOpen || !group) return null;

  const members = (group.members || []).map(m => m.user).filter(Boolean);
  const existingMemberIds = new Set((group.members || []).map(m => m.user_id));
  const addableFriends = friendsList.filter(f => !existingMemberIds.has(f.id));

  const handleIconSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > MAX_ICON_SIZE) {
      toast.error('Image size must be less than 5MB');
      return;
    }
    setIconFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setIconPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleIconUpload = async () => {
    if (!iconFile) return;
    setUploadingIcon(true);
    try {
      const formData = new FormData();
      formData.append('file', iconFile);
      const res = await uploadLobbyGroupIcon(group.id, formData);
      onGroupUpdated?.({ ...group, icon: res.icon });
      setIconFile(null);
      setIconPreview(null);
      toast.success('Group icon updated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update icon');
    } finally {
      setUploadingIcon(false);
    }
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      toast.error('Group name cannot be empty');
      return;
    }
    if (trimmed === group.name) {
      setIsEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await renameLobbyGroup(group.id, trimmed);
      onGroupUpdated?.({ ...group, name: trimmed });
      setIsEditingName(false);
      toast.success('Group renamed');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to rename group');
      setNameInput(group.name);
    } finally {
      setSavingName(false);
    }
  };

  const toggleNewMember = (userId) => {
    setSelectedNewMemberIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleAddMembers = async () => {
    if (selectedNewMemberIds.length === 0) return;
    setAddingMembers(true);
    try {
      await addLobbyGroupMembers(group.id, selectedNewMemberIds);
      const addedUsers = friendsList.filter(f => selectedNewMemberIds.includes(f.id));
      const newMembers = [
        ...(group.members || []),
        ...addedUsers.map(u => ({ user_id: u.id, user: u })),
      ];
      onGroupUpdated?.({ ...group, members: newMembers });
      setSelectedNewMemberIds([]);
      setShowAddMembers(false);
      toast.success('Members added');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add members');
    } finally {
      setAddingMembers(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-2 sm:p-4">
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col border border-gray-700/50">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-700/50">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-gradient-to-br from-purple-600 to-green-600 p-[3px]">
                <div className="w-full h-full rounded-full overflow-hidden bg-gray-900 flex items-center justify-center">
                  {iconPreview || group.icon ? (
                    <img src={iconPreview || group.icon} alt="Group" className="w-full h-full object-cover" />
                  ) : (
                    <UsersIcon className="w-8 h-8 text-purple-400 opacity-70" />
                  )}
                </div>
              </div>
              <label
                htmlFor="lobby-group-icon-input"
                className="absolute bottom-0 right-0 bg-gradient-to-br from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-full p-1.5 cursor-pointer shadow-xl transition-all transform hover:scale-110"
                title="Change group icon"
              >
                <PhotoIcon className="w-3.5 h-3.5 text-white" />
              </label>
              <input
                id="lobby-group-icon-input"
                type="file"
                accept="image/*"
                onChange={handleIconSelect}
                className="hidden"
              />
              {iconFile && (
                <button
                  type="button"
                  onClick={handleIconUpload}
                  disabled={uploadingIcon}
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white text-[10px] font-medium rounded-full transition-all shadow-lg disabled:opacity-50 whitespace-nowrap"
                >
                  {uploadingIcon ? 'Uploading…' : 'Upload'}
                </button>
              )}
            </div>

            {/* Name + count */}
            <div className="flex-1 min-w-0 pt-1">
              {isEditingName ? (
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  maxLength={100}
                  autoFocus
                  disabled={savingName}
                  onBlur={handleSaveName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') { setNameInput(group.name); setIsEditingName(false); }
                  }}
                  className="w-full text-lg font-bold bg-gray-800/50 border border-gray-600 rounded-lg px-3 py-1 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              ) : (
                <h2
                  className="text-lg font-bold text-white truncate cursor-pointer hover:text-purple-400 transition-colors flex items-center gap-1.5 group"
                  onClick={() => setIsEditingName(true)}
                  title="Click to edit"
                >
                  {group.name}
                  <PencilIcon className="w-3.5 h-3.5 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </h2>
              )}
              <p className="text-xs text-gray-400 mt-1">{members.length} member{members.length === 1 ? '' : 's'}</p>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors flex-shrink-0"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Members */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-purple-300">Members</h3>
            <button
              type="button"
              onClick={() => setShowAddMembers(s => !s)}
              className={`p-1.5 rounded-md transition-colors ${showAddMembers ? 'bg-purple-600/40 text-purple-300' : 'hover:bg-white/10 text-white'}`}
              title="Add members"
            >
              <UserPlusIcon className="w-5 h-5" />
            </button>
          </div>

          {showAddMembers && (
            <div className="mb-4 bg-gray-800/50 rounded-xl border border-gray-700/50 p-3">
              {addableFriends.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-3">All your friends are already in this group</p>
              ) : (
                <>
                  <div className="max-h-40 overflow-y-auto space-y-1 mb-3">
                    {addableFriends.map(friend => {
                      const selected = selectedNewMemberIds.includes(friend.id);
                      return (
                        <label key={friend.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleNewMember(friend.id)}
                            className="accent-purple-600"
                          />
                          <Avatar user={friend} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                          <span className="text-sm text-white flex-1 truncate">{friend.username}</span>
                        </label>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={handleAddMembers}
                    disabled={selectedNewMemberIds.length === 0 || addingMembers}
                    className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {addingMembers ? 'Adding…' : `Add ${selectedNewMemberIds.length || ''}`.trim()}
                  </button>
                </>
              )}
            </div>
          )}

          <div className="space-y-1">
            {members.map(member => (
              <div
                key={member.id}
                onClick={() => setViewProfileUser(member)}
                className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <Avatar
                  user={member}
                  onClick={(e) => { e.stopPropagation(); setExpandedMemberAvatar(resolveAvatarUrl(member.avatar_url)); }}
                  title="Click to view full size"
                  className="w-9 h-9 rounded-full object-cover flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-purple-400 transition-all"
                />
                <span className="text-sm text-white flex-1 truncate">
                  {member.username}{member.id === currentUser?.id ? ' (You)' : ''}
                </span>
                {member.id === group.created_by_id && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-medium flex-shrink-0">
                    Creator
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Expanded member avatar */}
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
              alt="Member"
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

      {/* Member profile */}
      {viewProfileUser && (
        <UserProfileModal
          user={viewProfileUser}
          isOpen={true}
          onClose={() => setViewProfileUser(null)}
          isOwnProfile={currentUser?.id === viewProfileUser.id}
        />
      )}
    </div>
  );
}
