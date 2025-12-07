// frontend/src/components/UserProfileModal.jsx
import React, { useState, useRef, useEffect } from 'react';

export default function UserProfileModal({ 
  user, 
  isOpen, 
  onClose, 
  onMessage,
  isOwnProfile = false,
  onSaveProfile
}) {
  if (!isOpen || !user) return null;

  const [isEditing, setIsEditing] = useState(false);
  const [editedUsername, setEditedUsername] = useState(user.username || '');
  const [editedBio, setEditedBio] = useState(user.bio || '');
  const [previewImage, setPreviewImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  // Update state when user prop changes (after profile update)
  useEffect(() => {
    if (user) {
      setEditedUsername(user.username || '');
      setEditedBio(user.bio || '');
    }
  }, [user]);

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (onSaveProfile) {
      await onSaveProfile({
        username: editedUsername,
        bio: editedBio,
        avatarFile: selectedFile
      });
    }
    setIsEditing(false);
    setPreviewImage(null);
    setSelectedFile(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedUsername(user.username || '');
    setEditedBio(user.bio || '');
    setPreviewImage(null);
    setSelectedFile(null);
  };

  const currentAvatar = previewImage || user.avatar_url || '/icons/user1avatar.svg';

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl w-96 max-w-[90vw] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
          <h3 className="text-white font-semibold text-lg">
            {isOwnProfile ? 'Your Profile' : `${user.username}'s Profile`}
          </h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Avatar */}
          <div className="relative mx-auto w-24 h-24 mb-4">
            <img 
              src={currentAvatar} 
              alt={user.username} 
              className="w-24 h-24 rounded-full mx-auto object-cover border-4 border-gray-700"
            />
            {isEditing && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 bg-blue-600 hover:bg-blue-700 rounded-full p-2 text-white"
                title="Change avatar"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
          </div>

          {/* Username */}
          <div className="mb-4">
            <label className="text-xs text-gray-400 block mb-1">Username</label>
            {isEditing ? (
              <input
                type="text"
                value={editedUsername}
                onChange={(e) => setEditedUsername(e.target.value)}
                className="w-full bg-gray-900 text-white px-3 py-2 rounded border border-gray-700 focus:border-blue-500 focus:outline-none"
                maxLength={50}
              />
            ) : (
              <p className="text-white text-lg font-semibold">{user.username}</p>
            )}
          </div>

          {/* Bio */}
          <div className="mb-6">
            <label className="text-xs text-gray-400 block mb-1">Bio</label>
            {isEditing ? (
              <textarea
                value={editedBio}
                onChange={(e) => setEditedBio(e.target.value)}
                className="w-full bg-gray-900 text-white px-3 py-2 rounded border border-gray-700 focus:border-blue-500 focus:outline-none resize-none"
                rows={3}
                maxLength={200}
                placeholder="Tell us about yourself..."
              />
            ) : (
              <p className="text-gray-300 text-sm">
                {user.bio || 'No bio yet'}
              </p>
            )}
          </div>

          {/* User Stats (Optional) */}
          {!isEditing && (
            <div className="mb-6 p-3 bg-gray-900 rounded-lg">
              <div className="text-xs text-gray-400">Member since</div>
              <div className="text-white text-sm">
                {new Date(user.created_at || Date.now()).toLocaleDateString()}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            {isOwnProfile ? (
              isEditing ? (
                <>
                  <button 
                    onClick={handleCancel}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded text-white font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSave}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 py-2 rounded text-white font-medium transition-colors"
                  >
                    Save Changes
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={onClose}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded text-white font-medium transition-colors"
                  >
                    Close
                  </button>
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 py-2 rounded text-white font-medium transition-colors"
                  >
                    Edit Profile
                  </button>
                </>
              )
            ) : (
              <>
                <button 
                  onClick={onClose}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded text-white font-medium transition-colors"
                >
                  Close
                </button>
                {onMessage && (
                  <button 
                    onClick={onMessage}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 py-2 rounded text-white font-medium transition-colors"
                  >
                    Message
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}