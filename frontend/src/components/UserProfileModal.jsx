// frontend/src/components/UserProfileModal.jsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFriendCount, getFollowersCount, getUserAverageWatchers, followUser, unfollowUser, getFollowStatus } from '../services/api';
import PostsGrid from './PostsGrid';
import PostViewModal from './PostViewModal';
import PublishPostModal from './PublishPostModal';
import EmojiPicker from './EmojiPicker';

export default function UserProfileModal({
  user,
  isOpen,
  onClose,
  onMessage,
  onAddFriend,
  isOwnProfile = false,
  isInWatchSession = false,
  onSaveProfile,
  friendshipStatus = null,
  isRequester = false,
}) {
  const shouldShowAddFriendButton = isInWatchSession && friendshipStatus !== 'accepted';

  const [isEditing, setIsEditing] = useState(false);
  const [editedUsername, setEditedUsername] = useState(user?.username || '');
  const [editedBio, setEditedBio] = useState(user?.bio || '');
  const [previewImage, setPreviewImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isAvatarExpanded, setIsAvatarExpanded] = useState(false);
  const [friendCount, setFriendCount] = useState(0);
  const [loadingFriendCount, setLoadingFriendCount] = useState(true);
  const [followersCount, setFollowersCount] = useState(0);
  const [loadingFollowersCount, setLoadingFollowersCount] = useState(true);
  const [averageWatchers, setAverageWatchers] = useState(0);
  const [loadingWatchers, setLoadingWatchers] = useState(true);
  const [selectedPost, setSelectedPost] = useState(null);
  const [isPostViewModalOpen, setIsPostViewModalOpen] = useState(false);
  const [publishingPost, setPublishingPost] = useState(null);
  const [postsRefreshKey, setPostsRefreshKey] = useState(0);
  const fileInputRef = useRef(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      setEditedUsername(user.username || '');
      setEditedBio(user.bio || '');
    }
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  useEffect(() => {
    if (isOpen && user) {
      const userId = user.id || user.ID;
      if (!userId) return;

      setLoadingFriendCount(true);
      getFriendCount(userId)
        .then(r => setFriendCount(r.data.count || 0))
        .catch(() => setFriendCount(0))
        .finally(() => setLoadingFriendCount(false));

      setLoadingFollowersCount(true);
      getFollowersCount(userId)
        .then(r => setFollowersCount(r.data.followers_count || 0))
        .catch(() => setFollowersCount(0))
        .finally(() => setLoadingFollowersCount(false));

      if (!isOwnProfile) {
        getFollowStatus(userId)
          .then(res => setIsFollowing(res.data.following || false))
          .catch(() => setIsFollowing(false));
      }

      setLoadingWatchers(true);
      getUserAverageWatchers(userId)
        .then(r => setAverageWatchers(r.data.average_watchers || 0))
        .catch(() => setAverageWatchers(0))
        .finally(() => setLoadingWatchers(false));
    }
  }, [isOpen, user]);

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPreviewImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (onSaveProfile) {
      await onSaveProfile({ username: editedUsername, bio: editedBio, avatarFile: selectedFile });
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

  const handleFollowToggle = async () => {
    const userId = user?.id || user?.ID;
    if (!userId || followLoading) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await unfollowUser(userId);
        setIsFollowing(false);
        setFollowersCount(prev => Math.max(0, prev - 1));
      } else {
        await followUser(userId);
        setIsFollowing(true);
        setFollowersCount(prev => prev + 1);
      }
    } catch (err) {
      console.error('[Follow] toggle error:', err);
    } finally {
      setFollowLoading(false);
    }
  };

  if (!isOpen || !user) return null;

  const currentAvatar = previewImage || user.avatar_url || '/icons/user1avatar.svg';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-2 sm:p-4">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative bg-gradient-to-br from-gray-900/95 via-gray-800/95 to-gray-900/95 backdrop-blur-xl rounded-lg sm:rounded-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden border border-white/10 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 sm:top-4 sm:right-4 z-20 text-gray-400 hover:text-white hover:bg-white/10 rounded-full w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center transition-all text-xl sm:text-2xl leading-none shadow-lg"
        >
          ✕
        </button>

        {/* Single scrollable pane */}
        <div className="overflow-y-auto max-h-[95vh] sm:max-h-[90vh]">

          {/* Hero avatar */}
          <div className="relative w-full h-44 sm:h-56 bg-gradient-to-br from-purple-900/30 to-blue-900/30 flex-shrink-0">
            <img
              src={currentAvatar}
              alt={user.username}
              onError={(e) => { e.target.onerror = null; e.target.src = '/avatars/default.png'; }}
              onClick={() => setIsAvatarExpanded(true)}
              className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
              title="Click to view full size"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
            {isEditing && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-3 right-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-full p-2 sm:p-3 text-white shadow-lg transform hover:scale-110 transition-all"
                title="Change avatar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
          </div>

          {/* Action buttons — just under avatar */}
          <div className="px-4 py-3 border-b border-white/10">
            {isOwnProfile ? (
              isEditing ? (
                <div className="flex gap-3">
                  <button
                    onClick={handleCancel}
                    className="flex-1 bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 py-2.5 rounded-lg text-white font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 py-2.5 rounded-lg text-white font-medium transition-all shadow-lg hover:shadow-purple-500/50 transform hover:scale-105 flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Save
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 py-2.5 rounded-lg text-white font-medium transition-all shadow-lg hover:shadow-purple-500/50 transform hover:scale-105 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="white" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit Profile
                </button>
              )
            ) : (
              <div className="flex gap-3">
                {/* Follow / Following */}
                <button
                  onClick={handleFollowToggle}
                  disabled={followLoading}
                  className={`flex-1 py-2.5 rounded-lg text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg transform hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed ${
                    isFollowing
                      ? 'bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20'
                      : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 hover:shadow-purple-500/50'
                  }`}
                >
                  {isFollowing ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Following
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Follow
                    </>
                  )}
                </button>

                {/* Add Friend */}
                {isInWatchSession && friendshipStatus !== 'accepted' && onAddFriend && (
                  <button
                    onClick={onAddFriend}
                    className={`flex-1 py-2.5 rounded-lg text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg transform hover:scale-105 ${
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
                        <svg className="w-4 h-4" fill="none" stroke="white" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {isRequester ? 'Sent' : 'Pending'}
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="white" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                        Add Friend
                      </>
                    )}
                  </button>
                )}

                {/* Message */}
                {onMessage && (
                  <button
                    onClick={onMessage}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 py-2.5 rounded-lg text-white font-medium transition-all shadow-lg hover:shadow-purple-500/50 transform hover:scale-105 flex items-center justify-center gap-2"
                    title="Message"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="white" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    Message
                  </button>
                )}
              </div>
            )}
          </div>

          {/* User info */}
          <div className="px-4 py-4 space-y-3 border-b border-white/10">
            {/* Username */}
            {isEditing ? (
              <div>
                <label className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-2 block">Username</label>
                <div className="relative">
                  <input
                    type="text"
                    value={editedUsername}
                    onChange={(e) => setEditedUsername(e.target.value)}
                    className="w-full bg-white/5 backdrop-blur-sm border border-white/20 text-white px-4 py-3 pr-12 rounded-lg focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all text-xl font-bold"
                    maxLength={50}
                  />
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-2xl hover:scale-110 transition-transform"
                    title="Add emoji"
                  >
                    😊
                  </button>
                  {showEmojiPicker && (
                    <div ref={emojiPickerRef} className="absolute left-0 top-full mt-2 z-50">
                      <EmojiPicker
                        onEmojiSelect={(emoji) => {
                          setEditedUsername(prev => prev + emoji);
                          setShowEmojiPicker(false);
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <h2 className="text-2xl sm:text-3xl font-bold text-white break-words">{user.username}</h2>
            )}

            {/* Bio */}
            {(isEditing || user.bio) && (
              <div>
                <label className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-1 block">Bio</label>
                {isEditing ? (
                  <textarea
                    value={editedBio}
                    onChange={(e) => setEditedBio(e.target.value)}
                    className="w-full bg-white/5 backdrop-blur-sm border border-white/20 text-white px-4 py-3 rounded-lg focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none transition-all"
                    rows={3}
                    maxLength={200}
                    placeholder="Tell us about yourself..."
                  />
                ) : (
                  <p className="text-gray-300 text-sm leading-relaxed">{user.bio}</p>
                )}
              </div>
            )}

            {!isEditing && (
              <>
                {/* Member Since */}
                <div>
                  <label className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-0.5 block">Member Since</label>
                  <p className="text-gray-400 text-sm">
                    {new Date(user.created_at || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>

                {/* Friends & Followers */}
                <div>
                  <label className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-0.5 block">Friends & Followers</label>
                  {loadingFriendCount || loadingFollowersCount ? (
                    <p className="text-gray-400 text-sm">Loading...</p>
                  ) : (
                    <p className="text-gray-300 text-base font-semibold">
                      {friendCount} {friendCount === 1 ? 'Friend' : 'Friends'}
                      {' · '}
                      {followersCount} {followersCount === 1 ? 'Follower' : 'Followers'}
                    </p>
                  )}
                </div>

                {/* Audience */}
                <div>
                  <label className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-0.5 block">Audience</label>
                  {loadingWatchers ? (
                    <p className="text-gray-400 text-sm">Loading...</p>
                  ) : averageWatchers > 0 ? (
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="white" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <p className="text-gray-300 text-base font-semibold">{averageWatchers.toFixed(1)} avg per session</p>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm italic">Not a host yet</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Main Room card — only shown when room is public */}
          {!isEditing && user.main_room && (
            <div className="px-4 py-3 border-b border-white/10">
              <label className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-2 block">Room</label>
              <button
                onClick={() => { onClose(); navigate(`/rooms/${user.main_room.id}`); }}
                className="w-full flex items-center justify-between gap-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-500/50 rounded-lg px-4 py-3 transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl flex-shrink-0">
                    {user.main_room.room_type === 'church' ? '⛪' :
                     user.main_room.room_type === 'classroom' ? '🎓' :
                     user.main_room.room_type === 'podcast' ? '🎙️' :
                     user.main_room.room_type === 'cinema' ? '🎬' :
                     '🎥'}
                  </span>
                  <span className="text-white font-medium truncate">{user.main_room.name}</span>
                </div>
                <span className="text-purple-400 group-hover:text-purple-300 text-sm flex-shrink-0 flex items-center gap-1 transition-colors">
                  Visit Room
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
            </div>
          )}

          {/* Posts grid */}
          <div className="p-3 sm:p-4">
            <PostsGrid
              key={postsRefreshKey}
              userId={user?.id || user?.ID}
              isOwnProfile={isOwnProfile}
              onPublish={(post) => setPublishingPost(post)}
              onPostClick={(post) => {
                setSelectedPost(post);
                setIsPostViewModalOpen(true);
              }}
            />
          </div>
        </div>

        {/* Expanded Avatar Overlay */}
        {isAvatarExpanded && (
          <div
            className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-2 sm:p-4"
            onClick={() => setIsAvatarExpanded(false)}
          >
            <div className="relative">
              <button
                onClick={() => setIsAvatarExpanded(false)}
                className="absolute -top-8 sm:-top-12 right-0 text-white hover:text-gray-300 text-2xl sm:text-3xl leading-none"
              >
                ×
              </button>
              <img
                src={currentAvatar}
                alt={user.username}
                onError={(e) => { e.target.onerror = null; e.target.src = '/avatars/default.png'; }}
                className="max-w-[90vw] sm:max-w-[600px] max-h-[80vh] sm:max-h-[600px] w-auto h-auto object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
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

        {/* Publish Draft Modal */}
        {publishingPost && (
          <PublishPostModal
            post={publishingPost}
            onClose={() => setPublishingPost(null)}
            onPublished={() => {
              setPublishingPost(null);
              setPostsRefreshKey(k => k + 1);
            }}
          />
        )}
      </div>
    </div>
  );
}
