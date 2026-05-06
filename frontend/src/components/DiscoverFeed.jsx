// WeWatch/frontend/src/components/DiscoverFeed.jsx
// Instagram/TikTok-style discover feed with infinite scroll grid
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Eye, Heart, MessageCircle, MoreVertical, Trash2, UserPlus, UserCheck, Link, X, Send, Reply, Edit, Trash } from 'lucide-react';
import apiClient, { getFollowersCount, joinRoom, leaveRoom } from '../services/api';
import { formatCount } from '../utils/formatCount';
import AdBanner from './AdBanner';
import UserProfileModal from './UserProfileModal';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const DiscoverFeed = forwardRef(({ onPostClick, searchQuery = '' }, ref) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const observerRef = useRef(null);
  const loadMoreTriggerRef = useRef(null);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(null); // postId with open menu
  const { currentUser, roomMemberships } = useAuth();
  const [followersCount, setFollowersCount] = useState({}); // {userId: count}
  const [followingRooms, setFollowingRooms] = useState({}); // {postId: isFollowing}
  const [postLikes, setPostLikes] = useState({}); // {postId: {isLiked: bool, count: number}}
  const [openComments, setOpenComments] = useState(null); // postId with open comments
  const [comments, setComments] = useState({}); // {postId: [comments]}
  const [commentInput, setCommentInput] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [hoveredComment, setHoveredComment] = useState(null); // commentId being hovered
  const [editingComment, setEditingComment] = useState(null); // commentId being edited
  const [editText, setEditText] = useState('');
  const [adsEnabled, setAdsEnabled] = useState(false); // Track if discover ads are enabled
  const [selectedUser, setSelectedUser] = useState(null); // User profile modal
  const [isUserProfileModalOpen, setIsUserProfileModalOpen] = useState(false);
  const [dataSaverEnabled, setDataSaverEnabled] = useState(
    localStorage.getItem('dataSaverMode') === 'true'
  );

  // Listen for data saver mode changes
  useEffect(() => {
    const checkDataSaver = () => {
      setDataSaverEnabled(localStorage.getItem('dataSaverMode') === 'true');
    };
    window.addEventListener('storage', checkDataSaver);
    const interval = setInterval(checkDataSaver, 500);
    return () => {
      window.removeEventListener('storage', checkDataSaver);
      clearInterval(interval);
    };
  }, []);

  // Fetch posts from API
  const fetchPosts = async (pageNum = 1, append = false, search = '') => {
    try {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);

      const params = new URLSearchParams({
        page: pageNum,
        limit: 12,
        ...(search && { search })
      });

      const response = await apiClient.get(`/api/posts?${params}`);
      const newPosts = response.data.posts || [];
      
      if (append) {
        setPosts(prev => [...prev, ...newPosts]);
      } else {
        setPosts(newPosts);
      }
      
      setHasMore(newPosts.length === 12); // If we got a full page, there might be more
      setError(null);
    } catch (err) {
      console.error('❌ [DiscoverFeed] Failed to fetch posts:', err);
      setError(err.response?.data?.error || 'Failed to load posts');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Expose refresh method to parent component via ref
  useImperativeHandle(ref, () => ({
    refresh: () => {
      console.log('🔄 [DiscoverFeed] Refreshing feed from parent');
      setPage(1);
      setHasMore(true);
      fetchPosts(1, false, searchQuery);
    }
  }));

  // Fetch ad settings on mount
  useEffect(() => {
    const fetchAdSettings = async () => {
      try {
        const response = await apiClient.get('/api/ads/settings');
        const { global_enabled, discover_ads } = response.data;
        setAdsEnabled(global_enabled && discover_ads);
      } catch (error) {
        console.error('Failed to fetch ad settings:', error);
        setAdsEnabled(false);
      }
    };
    fetchAdSettings();
  }, []);

  // 🔍 Debounced search effect
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      console.log('🔍 [DiscoverFeed] Search query changed:', searchQuery);
      setPage(1);
      setHasMore(true);
      fetchPosts(1, false, searchQuery);
    }, 300); // Wait 300ms after user stops typing

    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  // Initial load
  useEffect(() => {
    fetchPosts(1, false, searchQuery);
  }, []);

  // Fetch followers count for all users in posts
  useEffect(() => {
    const fetchFollowersCounts = async () => {
      const uniqueUserIds = [...new Set(posts.map(p => p.user_id).filter(Boolean))];
      
      for (const userId of uniqueUserIds) {
        if (!followersCount[userId]) {
          try {
            const response = await getFollowersCount(userId);
            setFollowersCount(prev => ({ ...prev, [userId]: response.data.followers_count || 0 }));
          } catch (error) {
            console.error(`Failed to fetch followers for user ${userId}:`, error);
            setFollowersCount(prev => ({ ...prev, [userId]: 0 }));
          }
        }
      }
    };
    
    if (posts.length > 0) {
      fetchFollowersCounts();
    }
  }, [posts]);

  // Check if user is following each post's room
  useEffect(() => {
    if (!roomMemberships || posts.length === 0) return;
    
    const newFollowingStatus = {};
    posts.forEach(post => {
      if (post.room_id) {
        newFollowingStatus[post.id] = roomMemberships.some(rm => rm.room_id === post.room_id);
      }
    });
    setFollowingRooms(newFollowingStatus);
  }, [posts, roomMemberships]);

  // Infinite scroll observer
  useEffect(() => {
    if (!hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          setPage(prev => prev + 1);
          fetchPosts(page + 1, true, searchQuery);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreTriggerRef.current) {
      observer.observe(loadMoreTriggerRef.current);
    }

    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loadingMore, page, searchQuery]);

  // Get video URL (for video playback)
  const getMediaUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http')) return url; // CDN URL
    // Remove leading slash to avoid double slash
    const cleanUrl = url.startsWith('/') ? url.slice(1) : url;
    return `${import.meta.env.VITE_API_BASE_URL}/${cleanUrl}`;
  };

  // Get thumbnail URL
  const getThumbnailUrl = (post) => {
    if (post.thumbnail_url) {
      // BunnyCDN or local storage URL
      if (post.thumbnail_url.startsWith('http')) {
        return post.thumbnail_url;
      }
      // Remove leading slash to avoid double slash
      const cleanUrl = post.thumbnail_url.startsWith('/') ? post.thumbnail_url.slice(1) : post.thumbnail_url;
      return `${import.meta.env.VITE_API_BASE_URL}/${cleanUrl}`;
    }
    
    // For videos without explicit thumbnail, use video URL with #t=1 to show first frame
    if (post.media_type === 'video' && post.video_url) {
      const videoUrl = post.video_url.startsWith('http') 
        ? post.video_url
        : `${import.meta.env.VITE_API_BASE_URL}/${post.video_url.startsWith('/') ? post.video_url.slice(1) : post.video_url}`;
      // Add #t=1 fragment to show first frame
      return `${videoUrl}#t=1`;
    }
    
    // For images/text posts without thumbnail, use video_url (which contains the image)
    if (post.video_url) {
      if (post.video_url.startsWith('http')) {
        return post.video_url;
      }
      // Remove leading slash to avoid double slash
      const cleanUrl = post.video_url.startsWith('/') ? post.video_url.slice(1) : post.video_url;
      return `${import.meta.env.VITE_API_BASE_URL}/${cleanUrl}`;
    }
    
    // Fallback placeholder
    return '/icons/video-placeholder.svg';
  };

  // Handle delete post
  const handleDeletePost = async (postId, e) => {
    e.stopPropagation();
    
    console.log('🗑️ [DiscoverFeed] Deleting post:', postId);
    
    if (!confirm('Are you sure you want to delete this post?')) {
      return;
    }

    try {
      await apiClient.delete(`/api/posts/${postId}`);
      setPosts(prev => prev.filter(p => p.id !== postId));
      toast.success('Post deleted successfully');
      setDeleteMenuOpen(null);
    } catch (error) {
      console.error('Failed to delete post:', error);
      toast.error(error.response?.data?.error || 'Failed to delete post');
    }
  };

  // Check if current user can delete post
  const canDeletePost = (post) => {
    if (!currentUser) return false;
    // Can delete if: owner of post OR (recording from user's room)
    return post.user_id === currentUser.id;
  };

  // Handle post click to open fullscreen
  const handlePostClick = (post) => {
    console.log('🎬 [DiscoverFeed] Post clicked:', {
      postId: post.id,
      title: post.title,
      hasOnPostClick: !!onPostClick,
    });
    if (onPostClick) {
      onPostClick(post);
    }
  };

  // Handle like toggle from PostViewModal (sync state)
  const handleModalLikeToggle = (postId, isLiked) => {
    setPostLikes(prev => ({
      ...prev,
      [postId]: {
        isLiked,
        count: (prev[postId]?.count ?? 0) + (isLiked ? 1 : -1)
      }
    }));
    // Update posts array as well
    setPosts(prev => prev.map(p => 
      p.id === postId 
        ? { ...p, likes_count: (prev.find(post => post.id === postId)?.likes_count || 0) + (isLiked ? 1 : -1) }
        : p
    ));
  };

  // Fetch comments for a post
  const fetchComments = async (postId) => {
    if (comments[postId]) return; // Already fetched
    
    setLoadingComments(true);
    try {
      const response = await apiClient.get(`/api/posts/${postId}/comments`);
      setComments(prev => ({ ...prev, [postId]: response.data.comments || [] }));
    } catch (error) {
      console.error('Failed to fetch comments:', error);
      setComments(prev => ({ ...prev, [postId]: [] }));
    } finally {
      setLoadingComments(false);
    }
  };

  // Post a comment
  const handlePostComment = async (postId) => {
    if (!commentInput.trim()) return;
    
    try {
      const response = await apiClient.post(`/api/posts/${postId}/comments`, {
        content: commentInput
      });
      
      // Add new comment to list
      setComments(prev => ({
        ...prev,
        [postId]: [response.data.comment, ...(prev[postId] || [])]
      }));
      
      // Update comment count
      setPosts(prev => prev.map(p => 
        p.id === postId 
          ? { ...p, comments_count: (p.comments_count || 0) + 1 }
          : p
      ));
      
      setCommentInput('');
      toast.success('Comment posted!');
    } catch (error) {
      console.error('Failed to post comment:', error);
      toast.error('Failed to post comment');
    }
  };

  // Handle edit comment
  const handleEditComment = async (postId, commentId) => {
    if (!editText.trim()) return;
    
    try {
      await apiClient.put(`/api/posts/${postId}/comments/${commentId}`, {
        content: editText
      });
      
      // Update comment in list
      setComments(prev => ({
        ...prev,
        [postId]: prev[postId].map(c => 
          c.id === commentId 
            ? { ...c, content: editText }
            : c
        )
      }));
      
      setEditingComment(null);
      setEditText('');
      toast.success('Comment updated!');
    } catch (error) {
      console.error('Failed to edit comment:', error);
      toast.error('Failed to update comment');
    }
  };

  // Handle delete comment
  const handleDeleteComment = async (postId, commentId) => {
    if (!confirm('Delete this comment?')) return;
    
    try {
      await apiClient.delete(`/api/posts/${postId}/comments/${commentId}`);
      
      // Remove comment from list
      setComments(prev => ({
        ...prev,
        [postId]: prev[postId].filter(c => c.id !== commentId)
      }));
      
      // Update comment count
      setPosts(prev => prev.map(p => 
        p.id === postId 
          ? { ...p, comments_count: Math.max((p.comments_count || 1) - 1, 0) }
          : p
      ));
      
      toast.success('Comment deleted!');
    } catch (error) {
      console.error('Failed to delete comment:', error);
      toast.error('Failed to delete comment');
    }
  };

  // Handle reply to comment
  const handleReplyToComment = (comment) => {
    setCommentInput(`@${comment.user?.username} `);
    document.querySelector('input[placeholder="Add a comment..."]')?.focus();
  };

  // Handle like/unlike from card
  const handleLikeToggle = async (post, e) => {
    e.stopPropagation();
    
    if (!currentUser) {
      toast.error('Please log in to like');
      return;
    }
    
    const currentLikeState = postLikes[post.id] || { isLiked: false, count: post.likes_count || 0 };
    const wasLiked = currentLikeState.isLiked;
    
    // Optimistic update
    setPostLikes(prev => ({
      ...prev,
      [post.id]: {
        isLiked: !wasLiked,
        count: currentLikeState.count + (wasLiked ? -1 : 1)
      }
    }));
    
    try {
      if (wasLiked) {
        await apiClient.delete(`/api/posts/${post.id}/unlike`);
      } else {
        await apiClient.post(`/api/posts/${post.id}/like`);
      }
    } catch (error) {
      // Revert on error
      setPostLikes(prev => ({
        ...prev,
        [post.id]: currentLikeState
      }));
      console.error('Like toggle error:', error);
      toast.error('Failed to update like');
    }
  };

  // Handle follow/unfollow
  const handleFollowToggle = async (post, e) => {
    e.stopPropagation();
    
    if (!currentUser) {
      toast.error('Please log in to follow');
      return;
    }
    
    if (!post.room_id) {
      toast.error('No room associated with this post');
      return;
    }
    
    const isFollowing = followingRooms[post.id];
    
    try {
      if (isFollowing) {
        await leaveRoom(post.room_id);
        setFollowingRooms(prev => ({ ...prev, [post.id]: false }));
        // Update followers count
        const response = await getFollowersCount(post.user_id);
        setFollowersCount(prev => ({ ...prev, [post.user_id]: response.data.followers_count || 0 }));
        toast.success(`Unfollowed @${post.user?.username}`);
      } else {
        await joinRoom(post.room_id);
        setFollowingRooms(prev => ({ ...prev, [post.id]: true }));
        // Update followers count
        const response = await getFollowersCount(post.user_id);
        setFollowersCount(prev => ({ ...prev, [post.user_id]: response.data.followers_count || 0 }));
        toast.success(`Following @${post.user?.username}`);
      }
    } catch (error) {
      console.error('Follow toggle error:', error);
      toast.error(error.message || 'Failed to update follow status');
    }
  };

  // Loading skeleton
  if (loading && posts.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 sm:gap-4 px-0 sm:px-4 pb-8">
        {[...Array(12)].map((_, i) => (
          <div key={i} className="aspect-[3/4] bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  // Error state
  if (error && posts.length === 0) {
    return (
      <div className="text-center py-20 px-4">
        <p className="text-xl mb-4 text-red-600 dark:text-red-400">Failed to load posts</p>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
        <button
          onClick={() => fetchPosts(1, false)}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Empty state
  if (!loading && posts.length === 0) {
    return (
      <div className="text-center py-20 px-4">
        <div className="mb-6">
          <svg className="w-24 h-24 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-xl mb-4 text-gray-700 dark:text-gray-300">No posts yet</p>
        <p className="text-gray-600 dark:text-gray-400">Be the first to share a video or photo!</p>
      </div>
    );
  }

  return (
    <div className="w-full sm:max-w-2xl sm:mx-auto px-0 sm:px-4 pb-8">
      {/* Single column vertical feed (Instagram/Facebook style) */}
      <div className="space-y-1 sm:space-y-6">
        {posts.map((post, index) => {
          // Debug log for @Unknown issue
          if (!post.user || !post.user.username) {
            console.log('⚠️ [DiscoverFeed] Post missing user data:', {
              postId: post.id,
              postType: post.post_type,
              userId: post.user_id,
              hasUser: !!post.user,
              username: post.user?.username,
              hasRoom: !!post.room,
              roomName: post.room?.name,
            });
          }
          
          return (
          <React.Fragment key={`post-${post.id}`}>
            {/* Regular Post Card */}
            <div 
              className="bg-white dark:bg-gray-800 rounded-none sm:rounded-xl overflow-hidden shadow-lg relative cursor-pointer"
              onClick={() => handlePostClick(post)}
            >
              {/* Media Section (square on mobile, 16:9 on larger screens) */}
              <div className="relative aspect-square sm:aspect-video bg-gray-200 dark:bg-gray-900 group">
                {/* Media display: video (autoplay muted loop) or image */}
                {post.media_type === 'video' && post.video_url ? (
                  <>
                    {dataSaverEnabled ? (
                      // Data Saver Mode: Show video first frame, no autoplay
                      <>
                        <video
                          src={getThumbnailUrl(post)}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                        />
                        {/* Play button overlay to indicate video */}
                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                          <div className="bg-white/90 rounded-full p-4">
                            <svg className="w-12 h-12 text-gray-800" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                            </svg>
                          </div>
                        </div>
                      </>
                    ) : (
                      // Normal Mode: Autoplay video
                      <video
                        src={getMediaUrl(post.video_url)}
                        poster={getThumbnailUrl(post)}
                        className="w-full h-full object-cover"
                        muted
                        autoPlay
                        loop
                        playsInline
                      />
                    )}
                    {/* Muted indicator (only show when video is playing) */}
                    {!dataSaverEnabled && (
                      <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm p-2 rounded-full">
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                    {/* REC badge overlay for recordings */}
                    {post.post_type === 'recording' && (
                      <img
                        src="/icons/recordIcon.png"
                        alt="Recording"
                        className="absolute top-3 right-3 w-16 h-auto opacity-90"
                      />
                    )}
                  </>
                ) : (
                  <img
                    src={getThumbnailUrl(post)}
                    alt={post.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                )}
                
                {/* Hover overlay with play hint (only for videos) */}
                {post.media_type === 'video' && (
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <div className="bg-white/90 rounded-full p-4">
                      <svg className="w-8 h-8 text-gray-800" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                    </div>
                  </div>
                )}
                
                {/* Duration badge (top-right) */}
                {post.media_type === 'video' && post.duration && (
                  <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm px-2.5 py-1 rounded-md">
                    <span className="text-white text-xs font-medium">
                      {Math.floor(post.duration / 60)}:{String(Math.floor(post.duration % 60)).padStart(2, '0')}
                    </span>
                  </div>
                )}
                
                {/* Paid content badge */}
                {post.is_paid && (
                  <div className="absolute bottom-3 left-3 bg-yellow-500/95 backdrop-blur-sm px-3 py-1.5 rounded-full">
                    <span className="text-sm font-bold text-black">₦{post.price}</span>
                  </div>
                )}
              </div>

              {/* Footer Section (Always Visible) */}
              <div className="p-4" onClick={(e) => e.stopPropagation()}>
                {/* User Info */}
                <div className="flex items-start gap-3 mb-3">
                  {/* User Avatar (Larger size) */}
                  <div className="flex-shrink-0">
                    {post.user?.avatar_url ? (
                      <img
                        src={post.user.avatar_url}
                        alt={post.user.username}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedUser(post.user);
                          setIsUserProfileModalOpen(true);
                        }}
                        className="w-14 h-14 rounded-full object-cover border-2 border-blue-500 cursor-pointer hover:border-purple-500 transition-colors"
                      />
                    ) : (
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedUser(post.user);
                          setIsUserProfileModalOpen(true);
                        }}
                        className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center border-2 border-blue-500 cursor-pointer hover:border-purple-500 transition-colors"
                      >
                        <span className="text-white text-xl font-bold">
                          {post.user?.username?.[0]?.toUpperCase() || 'U'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Title + Username + Followers */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-base line-clamp-2 mb-1">
                      {post.title}
                    </h3>
                    <div className="flex items-center gap-2">
                      <p className="text-lg text-gray-600 dark:text-gray-400 font-medium">
                        @{post.user?.username || 'Unknown'}
                      </p>
                      {/* Followers count */}
                      <p className="text-xs text-gray-500 dark:text-gray-500 ml-2">
                        {formatCount(followersCount[post.user_id] || 0)} followers
                      </p>
                    </div>
                  </div>

                  {/* Follow/Delete Button */}
                  <div className="flex-shrink-0">
                    {post.user_id === currentUser?.id ? (
                      /* Delete menu for own posts */
                      canDeletePost(post) && (
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteMenuOpen(deleteMenuOpen === post.id ? null : post.id);
                            }}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                          >
                            <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                          </button>
                          {deleteMenuOpen === post.id && (
                            <>
                              {/* Backdrop to close menu */}
                              <div
                                className="fixed inset-0 z-10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteMenuOpen(null);
                                }}
                              />
                              {/* Menu */}
                              <div className="absolute right-0 top-8 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[120px]">
                                <button
                                  onClick={(e) => handleDeletePost(post.id, e)}
                                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    ) : (
                      /* Follow button for other users' posts */
                      post.room_id && (
                        <button
                          onClick={(e) => handleFollowToggle(post, e)}
                          className={`px-4 py-2 rounded-full font-medium text-sm transition-colors flex items-center gap-1.5 ${
                            followingRooms[post.id]
                              ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {followingRooms[post.id] ? (
                            <>
                              <UserCheck className="w-4 h-4" />
                              Following
                            </>
                          ) : (
                            <>
                              <UserPlus className="w-4 h-4" />
                              Follow
                            </>
                          )}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Description (filter out auto-generated text) */}
                {post.description && post.description !== 'Recorded live watch party session' && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-3 line-clamp-2">
                    {post.description}
                  </p>
                )}

                {/* Engagement Stats (Solid white icons) */}
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Eye className="w-5 h-5" />
                    <span className="text-base font-medium">{formatCount(post.view_count || 0)}</span>
                  </div>
                  <button
                    className="flex items-center gap-2 transition-colors group"
                    onClick={(e) => handleLikeToggle(post, e)}
                  >
                    <Heart
                      className={`w-7 h-7 transition-all ${
                        (postLikes[post.id]?.isLiked)
                          ? 'fill-red-500 stroke-red-500'
                          : 'stroke-gray-600 dark:stroke-gray-400 group-hover:stroke-red-500'
                      }`}
                      fill="none"
                      strokeWidth={2}
                    />
                    <span className={`text-base font-medium ${
                      (postLikes[post.id]?.isLiked)
                        ? 'text-red-500'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {formatCount(postLikes[post.id]?.count ?? (post.likes_count || 0))}
                    </span>
                  </button>
                  <button
                    className="flex items-center gap-2 transition-colors group"
                    onClick={(e) => {
                      e.stopPropagation();
                      const newOpenState = openComments === post.id ? null : post.id;
                      setOpenComments(newOpenState);
                      if (newOpenState) {
                        fetchComments(newOpenState);
                      }
                    }}
                  >
                    <MessageCircle
                      className={`w-7 h-7 ${
                        openComments === post.id
                          ? 'stroke-blue-500'
                          : 'stroke-gray-600 dark:stroke-gray-400 group-hover:stroke-blue-500'
                      }`}
                      fill="none"
                      strokeWidth={2}
                    />
                    <span className={`text-base font-medium ${
                      openComments === post.id
                        ? 'text-blue-500'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {formatCount(post.comments_count || 0)}
                    </span>
                  </button>
                  <button
                    className="flex items-center gap-2 transition-colors group"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(window.location.origin + '/post/' + post.id);
                      toast.success('Link copied to clipboard!');
                    }}
                    title="Copy link"
                  >
                    <Link 
                      className="w-7 h-7 stroke-gray-600 dark:stroke-gray-400 group-hover:stroke-purple-500" 
                      fill="none"
                      strokeWidth={2}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Ad Banner every 6 posts (only if ads enabled) */}
            {(index + 1) % 6 === 0 && adsEnabled && (
              <div key={`ad-${post.id}`} className="bg-white dark:bg-gray-800 rounded-none sm:rounded-xl overflow-hidden shadow-lg">
                {/* Ad media section with same aspect ratio as posts */}
                <div className="relative aspect-square sm:aspect-video bg-gray-200 dark:bg-gray-900">
                  <AdBanner />
                </div>
                {/* Footer padding to match post card height */}
                <div className="p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Sponsored content
                  </p>
                </div>
              </div>
            )}
          </React.Fragment>
          );
        })}
      </div>

      {/* Fixed Comment Modal (appears above everything) */}
      {openComments !== null && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 z-50 animate-fade-in"
            onClick={() => {
              setOpenComments(null);
              setCommentInput('');
            }}
          />
          
          {/* Comment Panel */}
          <div className="fixed inset-x-0 bottom-0 md:inset-x-auto md:right-0 md:top-0 md:w-96 bg-white dark:bg-gray-900 z-50 flex flex-col shadow-2xl animate-slide-in-right max-h-[80vh] md:max-h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-lg text-gray-900 dark:text-white">
                Comments ({formatCount(posts.find(p => p.id === openComments)?.comments_count || 0)})
              </h3>
              <button
                onClick={() => {
                  setOpenComments(null);
                  setCommentInput('');
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
            
            {/* Comments list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loadingComments ? (
                <div className="text-center py-8">
                  <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto" />
                </div>
              ) : (comments[openComments] || []).length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No comments yet</p>
                  <p className="text-sm">Be the first to comment!</p>
                </div>
              ) : (
                (comments[openComments] || []).map((comment) => {
                  const isCommentPoster = currentUser?.id === comment.user?.id;
                  const isSuperAdmin = currentUser?.is_super_admin || false;
                  const isEditing = editingComment === comment.id;
                  
                  return (
                    <div 
                      key={comment.id} 
                      className="flex gap-3 group relative"
                      onMouseEnter={() => setHoveredComment(comment.id)}
                      onMouseLeave={() => setHoveredComment(null)}
                    >
                      <img
                        src={comment.user?.avatar_url || '/default-avatar.png'}
                        alt={comment.user?.username}
                        className="w-8 h-8 rounded-full flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-gray-900 dark:text-white">
                              @{comment.user?.username}
                            </p>
                            
                            {isEditing ? (
                              <div className="mt-1 space-y-2">
                                <input
                                  type="text"
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  onKeyPress={(e) => e.key === 'Enter' && handleEditComment(openComments, comment.id)}
                                  className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                  autoFocus
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleEditComment(openComments, comment.id)}
                                    className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingComment(null);
                                      setEditText('');
                                    }}
                                    className="px-3 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 break-words">
                                {comment.content}
                              </p>
                            )}
                          </div>
                          
                          {/* Action buttons - visible on hover or always on mobile */}
                          {!isEditing && (hoveredComment === comment.id || window.innerWidth < 768) && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {/* Reply button - visible to all */}
                              <button
                                onClick={() => handleReplyToComment(comment)}
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                                title="Reply"
                              >
                                <Reply className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                              </button>
                              
                              {/* Edit button - visible to comment poster */}
                              {isCommentPoster && (
                                <button
                                  onClick={() => {
                                    setEditingComment(comment.id);
                                    setEditText(comment.content);
                                  }}
                                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                                  title="Edit"
                                >
                                  <Edit className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                </button>
                              )}
                              
                              {/* Delete button - visible to comment poster or super admin */}
                              {(isCommentPoster || isSuperAdmin) && (
                                <button
                                  onClick={() => handleDeleteComment(openComments, comment.id)}
                                  className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-full transition-colors"
                                  title="Delete"
                                >
                                  <Trash className="w-4 h-4 text-red-600 dark:text-red-400" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Date at bottom right */}
                        {!isEditing && (
                          <div className="flex justify-end mt-1">
                            <p className="text-xs text-gray-500">
                              {new Date(comment.created_at).toLocaleString()}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            {/* Comment input */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handlePostComment(openComments)}
                  placeholder="Add a comment..."
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  onClick={() => handlePostComment(openComments)}
                  disabled={!commentInput.trim()}
                  className="px-4 py-2 bg-purple-600 text-white rounded-full hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Post
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Infinite scroll trigger */}
      <div ref={loadMoreTriggerRef} className="h-1 mt-8" />

      {/* Loading more indicator */}
      {loadingMore && (
        <div className="text-center py-8">
          <div className="animate-spin h-10 w-10 border-4 border-purple-500 border-t-transparent rounded-full mx-auto" />
          <p className="text-gray-400 mt-4">Loading more posts...</p>
        </div>
      )}

      {/* End of content */}
      {!hasMore && posts.length > 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="text-lg">🎬 You've seen it all!</p>
          <p className="text-sm mt-2">Check back later for more posts</p>
        </div>
      )}

      {/* User Profile Modal */}
      {selectedUser && (
        <UserProfileModal
          user={selectedUser}
          isOpen={isUserProfileModalOpen}
          onClose={() => {
            setIsUserProfileModalOpen(false);
            setSelectedUser(null);
          }}
          isOwnProfile={selectedUser?.id === currentUser?.id}
        />
      )}
    </div>
  );
});

DiscoverFeed.displayName = 'DiscoverFeed';

export default DiscoverFeed;
