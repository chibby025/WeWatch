// frontend/src/components/UserProfileModal.jsx
import React, { useState, useRef, useEffect } from 'react';
import { getFriendCount, getUserAverageWatchers } from '../services/api';

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
  // 🐛 DEBUG: Log props on render
  console.log('👤 [UserProfileModal] Rendering with props:', {
    username: user?.username,
    userId: user?.id,
    isOpen,
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
  const [editedUsername, setEditedUsername] = useState(user?.username || '');
  const [editedBio, setEditedBio] = useState(user?.bio || '');
  const [previewImage, setPreviewImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isAvatarExpanded, setIsAvatarExpanded] = useState(false); // ✅ NEW: Expandable avatar
  const [friendCount, setFriendCount] = useState(0); // ✅ NEW: Friend count
  const [loadingFriendCount, setLoadingFriendCount] = useState(true);
  const [averageWatchers, setAverageWatchers] = useState(0); // ✅ NEW: Average watchers
  const [loadingWatchers, setLoadingWatchers] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const fileInputRef = useRef(null);

  // Update state when user prop changes (after profile update)
  useEffect(() => {
    if (user) {
      setEditedUsername(user.username || '');
      setEditedBio(user.bio || '');
    }
  }, [user]);

  // Fetch friend count and average watchers when modal opens
  useEffect(() => {
    if (isOpen && user) {
      const userId = user.id || user.ID; // Handle both lowercase and uppercase
      if (!userId) return;
      
      // Fetch friend count
      setLoadingFriendCount(true);
      console.log('👥 [UserProfileModal] Fetching friend count for user:', userId);
      
      getFriendCount(userId)
        .then(response => {
          console.log('👥 [UserProfileModal] Friend count response:', response.data);
          setFriendCount(response.data.count || 0);
        })
        .catch(error => {
          console.error('❌ [UserProfileModal] Failed to fetch friend count:', error);
          setFriendCount(0);
        })
        .finally(() => {
          setLoadingFriendCount(false);
        });
      
      // Fetch average watchers (host stats)
      setLoadingWatchers(true);
      console.log('📊 [UserProfileModal] Fetching average watchers for user:', userId);
      
      getUserAverageWatchers(userId)
        .then(response => {
          console.log('📊 [UserProfileModal] Average watchers response:', response.data);
          console.log('📊 [UserProfileModal] average_watchers:', response.data.average_watchers);
          console.log('📊 [UserProfileModal] total_sessions:', response.data.total_sessions);
          // Just set the value - backend determines if they've hosted sessions
          setAverageWatchers(response.data.average_watchers || 0);
        })
        .catch(error => {
          console.error('❌ [UserProfileModal] Failed to fetch average watchers:', error);
          setAverageWatchers(0);
        })
        .finally(() => {
          setLoadingWatchers(false);
        });
    }
  }, [isOpen, user]);

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
    setEditedUsername(user?.username || '');
    setEditedBio(user?.bio || '');
    setPreviewImage(null);
    setSelectedFile(null);
  };

  // ✅ Early return AFTER all hooks (React rules of hooks)
  if (!isOpen || !user) return null;

  const currentAvatar = previewImage || user.avatar_url || '/icons/user1avatar.svg';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>
      
      <div className="relative bg-gradient-to-br from-gray-900/95 via-gray-800/95 to-gray-900/95 backdrop-blur-xl rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-white/10 shadow-2xl">
        {/* Close Button - Top Right */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-20 text-gray-400 hover:text-white hover:bg-white/10 rounded-full w-10 h-10 flex items-center justify-center transition-all text-2xl leading-none shadow-lg"
        >
          ✕
        </button>

        {/* Split Layout Container */}
        <div className="flex flex-col md:flex-row h-full min-h-[500px] max-h-[90vh]">
          {/* LEFT SIDE - User Info */}
          <div className="flex-1 p-6 md:p-8 flex flex-col justify-between overflow-y-auto">
            {/* User Info Section */}
            <div className="space-y-4">
              {/* Username */}
              <div>
                {isEditing ? (
                  <div>
                    <label className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-2 block">Username</label>
                    <input
                      type="text"
                      value={editedUsername}
                      onChange={(e) => setEditedUsername(e.target.value)}
                      className="w-full bg-white/5 backdrop-blur-sm border border-white/20 text-white px-4 py-3 rounded-lg focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all text-xl font-bold"
                      maxLength={50}
                    />
                  </div>
                ) : (
                  <h2 className="text-3xl md:text-4xl font-bold text-white mb-1 break-words">
                    {user.username}
                  </h2>
                )}
              </div>

              {/* Bio */}
              {(isEditing || user.bio) && (
                <div>
                  <label className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-2 block">Bio</label>
                  {isEditing ? (
                    <textarea
                      value={editedBio}
                      onChange={(e) => setEditedBio(e.target.value)}
                      className="w-full bg-white/5 backdrop-blur-sm border border-white/20 text-white px-4 py-3 rounded-lg focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none transition-all"
                      rows={4}
                      maxLength={200}
                      placeholder="Tell us about yourself..."
                    />
                  ) : (
                    <p className="text-gray-300 text-base leading-relaxed">
                      {user.bio}
                    </p>
                  )}
                </div>
              )}

              {/* Member Since */}
              {!isEditing && (
                <div>
                  <label className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-1 block">Member Since</label>
                  <p className="text-gray-400 text-sm">
                    {new Date(user.created_at || Date.now()).toLocaleDateString('en-US', { 
                      month: 'long', 
                      day: 'numeric', 
                      year: 'numeric' 
                    })}
                  </p>
                </div>
              )}

              {/* Friend Count */}
              {!isEditing && (
                <div>
                  <label className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-1 block">Friends</label>
                  {loadingFriendCount ? (
                    <p className="text-gray-400 text-sm">Loading...</p>
                  ) : (
                    <p className="text-gray-300 text-lg font-semibold">
                      {friendCount} {friendCount === 1 ? 'Friend' : 'Friends'}
                    </p>
                  )}
                </div>
              )}

              {/* Average Watchers - Show if user has hosted any sessions */}
              {!isEditing && (
                <div>
                  <label className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-1 block">
                    Average Watchers
                  </label>
                  {loadingWatchers ? (
                    <p className="text-gray-400 text-sm">Loading...</p>
                  ) : averageWatchers > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">👥</span>
                      <p className="text-gray-300 text-lg font-semibold">
                        {averageWatchers.toFixed(1)} {averageWatchers === 1 ? 'Watcher' : 'Watchers'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm italic">Not a host yet</p>
                  )}
                  <p className="text-gray-500 text-xs mt-1">
                    Per session average
                  </p>
                </div>
              )}
            </div>

            {/* Action Icons Section */}
            <div className="mt-6 pt-6 border-t border-white/10">
              {isOwnProfile ? (
                isEditing ? (
                  <div className="flex gap-3">
                    <button 
                      onClick={handleCancel}
                      className="flex-1 bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 py-3 rounded-lg text-white font-medium transition-all flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Cancel
                    </button>
                    <button 
                      onClick={handleSave}
                      className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 py-3 rounded-lg text-white font-medium transition-all shadow-lg hover:shadow-purple-500/50 transform hover:scale-105 flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Save
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 py-3 rounded-lg text-white font-medium transition-all shadow-lg hover:shadow-purple-500/50 transform hover:scale-105 flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit Profile
                  </button>
                )
              ) : (
                <div className="flex gap-3">
                  {/* Add Friend Icon Button */}
                  {isInWatchSession && friendshipStatus !== 'accepted' && onAddFriend && (
                    <button 
                      onClick={onAddFriend}
                      className={`flex-1 py-3 rounded-lg text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg transform hover:scale-105 ${
                        friendshipStatus === 'pending' && isRequester
                          ? 'bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20'
                          : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 hover:shadow-green-500/50'
                      }`}
                      title={
                        friendshipStatus === 'pending' && isRequester
                          ? 'Request Sent'
                          : friendshipStatus === 'pending'
                          ? 'Pending'
                          : 'Add Friend'
                      }
                    >
                      {friendshipStatus === 'pending' ? (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {isRequester ? 'Sent' : 'Pending'}
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                          </svg>
                          Add Friend
                        </>
                      )}
                    </button>
                  )}
                  
                  {/* Message Icon Button */}
                  {onMessage && (
                    <button 
                      onClick={onMessage}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 py-3 rounded-lg text-white font-medium transition-all shadow-lg hover:shadow-purple-500/50 transform hover:scale-105 flex items-center justify-center gap-2"
                      title="Message"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      Message
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT SIDE - Avatar Image */}
          <div className="relative w-full md:w-2/5 min-h-[300px] md:min-h-full bg-gradient-to-br from-purple-900/30 to-blue-900/30">
            {/* Avatar Image - Full Height */}
            <img 
              src={currentAvatar} 
              alt={user.username}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/avatars/default.png';
              }}
              onClick={() => setIsAvatarExpanded(true)}
              className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
              title="Click to view full size"
            />
            
            {/* Gradient Overlay for Better Text Contrast */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none"></div>
            
            {/* Edit Avatar Button (Editing Mode) */}
            {isEditing && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-4 right-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-full p-3 text-white shadow-lg transform hover:scale-110 transition-all"
                title="Change avatar"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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