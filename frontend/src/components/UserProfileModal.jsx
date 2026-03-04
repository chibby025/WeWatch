// frontend/src/components/UserProfileModal.jsx
import React, { useState, useRef, useEffect } from 'react';

export default function UserProfileModal({ 
  user, 
  isOpen, 
  onClose, 
  onMessage,
  onAddFriend, // ✅ NEW: Callback to add user as friend
  isOwnProfile = false,
  isInWatchSession = false, // ✅ NEW: Flag to show "Add Friend" instead of "Close"
  onSaveProfile,
  friendshipStatus = null, // ✅ NEW: 'none', 'pending', 'accepted'
  isRequester = false, // ✅ NEW: Did current user send the request?
}) {
  if (!isOpen || !user) return null;

  // 🐛 DEBUG: Log props on render
  console.log('👤 [UserProfileModal] Rendering with props:', {
    username: user.username,
    userId: user.id,
    isOwnProfile,
    isInWatchSession,
    friendshipStatus,
    isRequester,
    hasOnAddFriend: !!onAddFriend,
    hasOnMessage: !!onMessage
  });
  
  // 🐛 DEBUG: Log button visibility logic
  const shouldShowAddFriendButton = isInWatchSession && friendshipStatus !== 'accepted';
  console.log('🔍 [UserProfileModal] Button visibility logic:', {
    isInWatchSession,
    friendshipStatus,
    friendshipStatusIsNotAccepted: friendshipStatus !== 'accepted',
    shouldShowAddFriendButton,
    willRenderAddFriendButton: shouldShowAddFriendButton && !!onAddFriend
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editedUsername, setEditedUsername] = useState(user.username || '');
  const [editedBio, setEditedBio] = useState(user.bio || '');
  const [previewImage, setPreviewImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isAvatarExpanded, setIsAvatarExpanded] = useState(false); // ✅ NEW: Expandable avatar
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>
      
      <div className="relative bg-gradient-to-br from-gray-900/95 via-gray-800/95 to-gray-900/95 backdrop-blur-xl rounded-2xl w-full max-w-md md:max-w-lg lg:max-w-xl max-h-[90vh] overflow-y-auto border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/10 flex justify-between items-center sticky top-0 bg-gradient-to-r from-purple-900/50 via-blue-900/50 to-purple-900/50 backdrop-blur-xl z-10">
          <h3 className="text-white font-bold text-base md:text-lg">
            {isOwnProfile ? 'Your Profile' : `${user.username}'s Profile`}
          </h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white hover:bg-white/10 rounded-full w-8 h-8 flex items-center justify-center transition-all text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4 md:p-6">
          {/* Avatar */}
          <div className="relative mx-auto w-20 h-20 md:w-24 md:h-24 mb-3 md:mb-4">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/30 to-blue-500/30 rounded-full blur-xl"></div>
            <img 
              src={currentAvatar} 
              alt={user.username}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/avatars/default.png';
              }}
              onClick={() => setIsAvatarExpanded(true)}
              className="relative w-20 h-20 md:w-24 md:h-24 rounded-full mx-auto object-cover border-4 border-purple-500/50 cursor-pointer hover:border-purple-400 hover:shadow-lg hover:shadow-purple-500/50 transition-all transform hover:scale-105"
              title="Click to view full size"
            />
            {isEditing && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-full p-2 text-white shadow-lg transform hover:scale-110 transition-all"
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
          <div className="mb-3 md:mb-4">
            <label className="text-sm font-bold text-purple-400 block mb-1">Username</label>
            {isEditing ? (
              <input
                type="text"
                value={editedUsername}
                onChange={(e) => setEditedUsername(e.target.value)}
                className="w-full bg-white/5 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all text-sm md:text-base"
                maxLength={50}
              />
            ) : (
              <p className="text-gray-300 text-sm">{user.username}</p>
            )}
          </div>

          {/* Bio - Only show if bio exists or editing */}
          {(isEditing || user.bio) && (
            <div className="mb-4 md:mb-6">
              <label className="text-sm font-bold text-purple-400 block mb-1">Bio</label>
              {isEditing ? (
                <textarea
                  value={editedBio}
                  onChange={(e) => setEditedBio(e.target.value)}
                  className="w-full bg-white/5 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none transition-all text-sm md:text-base"
                  rows={2}
                  maxLength={200}
                  placeholder="Tell us about yourself..."
                />
              ) : (
                <p className="text-gray-300 text-sm">
                  {user.bio}
                </p>
              )}
            </div>
          )}

          {/* User Stats (Optional) */}
          {!isEditing && (
            <div className="mb-4 md:mb-6">
              <label className="text-sm font-bold text-purple-400 block mb-1">Member since</label>
              <p className="text-gray-300 text-sm">
                {new Date(user.created_at || Date.now()).toLocaleDateString()}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            {isOwnProfile ? (
              isEditing ? (
                <>
                  <button 
                    onClick={handleCancel}
                    className="flex-1 bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 py-2 rounded-lg text-white font-medium transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSave}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 py-2 rounded-lg text-white font-medium transition-all shadow-lg hover:shadow-purple-500/50 transform hover:scale-105"
                  >
                    Save Changes
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={onClose}
                    className="flex-1 bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 py-2 rounded-lg text-white font-medium transition-all"
                  >
                    Close
                  </button>
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 py-2 rounded-lg text-white font-medium transition-all shadow-lg hover:shadow-purple-500/50 transform hover:scale-105"
                  >
                    Edit Profile
                  </button>
                </>
              )
            ) : (
              <>
                {/* ✅ Show "Add Friend" button only when in watch session AND not already friends */}
                {isInWatchSession && friendshipStatus !== 'accepted' ? (
                  <>
                    {onAddFriend && (
                      <button 
                        onClick={onAddFriend}
                        className={`flex-1 py-3 rounded-lg text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg transform hover:scale-105 ${
                          friendshipStatus === 'pending' && isRequester
                            ? 'bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20'
                            : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 hover:shadow-green-500/50'
                        }`}
                        title={
                          friendshipStatus === 'pending' && isRequester
                            ? 'Click to cancel request'
                            : friendshipStatus === 'pending'
                            ? 'Friend request pending'
                            : 'Add Friend'
                        }
                      >
                        {friendshipStatus === 'pending' && isRequester ? (
                          <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Request Sent</span>
                          </>
                        ) : friendshipStatus === 'pending' ? (
                          <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Pending...</span>
                          </>
                        ) : (
                          <img 
                            src="/icons/addMemberIcon.svg" 
                            alt="Add Friend"
                            className="w-8 h-8"
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        )}
                      </button>
                    )}
                    {onMessage && (
                      <button 
                        onClick={onMessage}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 py-3 rounded text-white font-medium transition-colors flex items-center justify-center group relative"
                        title="Message"
                      >
                        <img 
                          src="/icons/chat.svg" 
                          alt="Message"
                          className="w-8 h-8"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'block';
                          }}
                        />
                        <span className="hidden">Message</span>
                      </button>
                    )}
                  </>
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
                        className="flex-1 bg-purple-600 hover:bg-purple-700 py-3 rounded text-white font-medium transition-colors flex items-center justify-center group relative"
                        title="Message"
                      >
                        <img 
                          src="/icons/chat.svg" 
                          alt="Message"
                          className="w-8 h-8"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'block';
                          }}
                        />
                        <span className="hidden">Message</span>
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ✅ Expanded Avatar Overlay */}
      {isAvatarExpanded && (
        <div 
          className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4"
          onClick={() => setIsAvatarExpanded(false)}
        >
          <div className="relative">
            <button 
              onClick={() => setIsAvatarExpanded(false)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 text-3xl leading-none"
            >
              ×
            </button>
            <img 
              src={currentAvatar} 
              alt={user.username}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/avatars/default.png';
              }}
              className="max-w-[600px] max-h-[600px] w-auto h-auto object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}