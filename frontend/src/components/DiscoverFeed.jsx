// WeWatch/frontend/src/components/DiscoverFeed.jsx
// Instagram/TikTok-style discover feed with infinite scroll grid
import React, { useState, useEffect, useRef, useReducer, forwardRef, useImperativeHandle } from 'react';
import { Eye, Heart, MessageCircle, MoreVertical, Trash2, X, Reply, Edit, Trash, Lock, Flag, Gift } from 'lucide-react';
import apiClient, { getFollowersCount, joinRoom, leaveRoom, tipPost } from '../services/api';
import { formatCount } from '../utils/formatCount';
import AdBanner from './AdBanner';
import Avatar from './Avatar';
import UserProfileModal from './UserProfileModal';
import PostPurchaseModal from './payment/PostPurchaseModal';
import ReportModal from './ReportModal';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const formatTimeAgo = (dateStr) => {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const DiscoverFeed = forwardRef(({ onPostClick, searchQuery = '' }, ref) => {
  // Tick every 60s so timestamps re-render without re-fetching data
  const [, tickTime] = useReducer(x => x + 1, 0);
  useEffect(() => {
    const t = setInterval(tickTime, 60_000);
    return () => clearInterval(t);
  }, []);

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
  const [unmutedVideoId, setUnmutedVideoId] = useState(null); // Track which video is unmuted
  const [purchaseModalPost, setPurchaseModalPost] = useState(null); // Paid post pending purchase
  const [dismissedOverlays, setDismissedOverlays] = useState(new Set()); // Post IDs where user clicked through the 18+/Mature overlay (session-only)
  const [reportTarget, setReportTarget] = useState(null); // { targetType, targetId, targetName }
  const [postTips, setPostTips] = useState({}); // {postId: count}
  const [sharePost, setSharePost] = useState(null); // post object for share modal
  const [shareFriends, setShareFriends] = useState([]);
  const [shareFriendsLoading, setShareFriendsLoading] = useState(false);
  const [shareSentTo, setShareSentTo] = useState(new Set()); // user IDs already sent this session

  // Locked = paid post that the viewer hasn't bought (and isn't the owner of)
  const isPostLocked = (post) => post.is_paid && !post.has_access && !post.is_owner;

  // Toggle video mute for a specific post
  const toggleVideoMute = (e, postId) => {
    e.stopPropagation();
    
    if (unmutedVideoId === postId) {
      // If this video is unmuted, mute it
      setUnmutedVideoId(null);
    } else {
      // Unmute this video (automatically mutes all others)
      setUnmutedVideoId(postId);
    }
  };

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

      const PAGE_SIZE = 12;
      const offset = (pageNum - 1) * PAGE_SIZE;
      const params = new URLSearchParams({
        offset,
        limit: PAGE_SIZE,
        ...(search && { search })
      });

      const response = await apiClient.get(`/api/posts?${params}`);
      const newPosts = response.data.posts || [];

      if (append) {
        setPosts(prev => [...prev, ...newPosts]);
      } else {
        setPosts(newPosts);
      }

      // Prefer the backend's explicit has_more flag (present when global-pool pagination
      // is active). Fall back to the old heuristic for older server versions.
      const hasMore = response.data.has_more !== undefined
        ? response.data.has_more
        : newPosts.length > 0;
      setHasMore(hasMore);
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
      setPage(1);
      setHasMore(true);
      return fetchPosts(1, false, searchQuery); // return the promise so caller can scroll after
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
      const effectiveRoomId = post.room_id ?? post.user?.main_room_id;
      const isFollowing = effectiveRoomId
        ? roomMemberships.some(rm => rm.room_id === effectiveRoomId)
        : false;

      if (effectiveRoomId) {
        newFollowingStatus[post.id] = isFollowing;
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
          const nextPage = page + 1;
          setPage(nextPage);
          fetchPosts(nextPage, true, searchQuery);
        }
      },
      // Prefetch: fire ~600px before the sentinel scrolls into the viewport so the
      // next page is already loading by the time the user reaches the bottom.
      { threshold: 0, rootMargin: '600px' }
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
  }, [hasMore, loadingMore, page, searchQuery, loading]);

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
    // 🎯 Priority 1: For IMAGE posts, ALWAYS use video_url directly
    // The video_url field contains the actual Bunny CDN image URL
    // The thumbnail_url field often has legacy Railway local paths that don't work
    if (post.media_type === 'image' && post.video_url) {
      if (post.video_url.startsWith('http')) {
        return post.video_url; // Bunny CDN URL
      }
      const cleanUrl = post.video_url.startsWith('/') ? post.video_url.slice(1) : post.video_url;
      return `${import.meta.env.VITE_API_BASE_URL}/${cleanUrl}`;
    }
    
    // 🎥 Priority 2: For VIDEO posts, use thumbnail_url ONLY if it's a valid CDN URL
    if (post.media_type === 'video' && post.thumbnail_url && post.thumbnail_url.startsWith('http')) {
      return post.thumbnail_url; // Valid CDN thumbnail
    }
    
    // 🎥 Priority 3: For videos without CDN thumbnail, use video URL with #t=1 to show first frame
    if (post.media_type === 'video' && post.video_url) {
      const videoUrl = post.video_url.startsWith('http') 
        ? post.video_url
        : `${import.meta.env.VITE_API_BASE_URL}/${post.video_url.startsWith('/') ? post.video_url.slice(1) : post.video_url}`;
      return `${videoUrl}#t=1`;
    }
    
    // 🔄 Fallback: Use video_url for any other media type
    if (post.video_url) {
      if (post.video_url.startsWith('http')) {
        return post.video_url;
      }
      const cleanUrl = post.video_url.startsWith('/') ? post.video_url.slice(1) : post.video_url;
      return `${import.meta.env.VITE_API_BASE_URL}/${cleanUrl}`;
    }
    
    // ❌ Fallback placeholder
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

  // Handle post click to open fullscreen — but route locked paid posts to the purchase modal first.
  const handlePostClick = (post) => {
    console.log('🎬 [DiscoverFeed] Post clicked:', {
      postId: post.id,
      isLocked: isPostLocked(post),
      hasOnPostClick: !!onPostClick,
    });

    if (isPostLocked(post)) {
      if (!currentUser) {
        toast.error('Please log in to purchase this post');
        return;
      }
      setPurchaseModalPost(post);
      return;
    }

    if (onPostClick) {
      onPostClick(post);
    }
  };

  // After a successful purchase, mark the post unlocked locally so the lock overlay
  // disappears immediately. The next feed refresh will repopulate video_url from the backend.
  const handlePurchaseSuccess = (result) => {
    if (!purchaseModalPost) return;
    const purchasedId = purchaseModalPost.id;
    setPosts((prev) =>
      prev.map((p) =>
        p.id === purchasedId ? { ...p, has_access: true, can_download: true } : p
      )
    );
    if (!result?.already_owned) {
      toast.success('Post purchased — enjoy!');
    }
    // Refetch the post detail to pull the now-available video_url
    apiClient
      .get(`/api/posts/${purchasedId}`)
      .then((resp) => {
        const updated = resp.data?.post;
        if (updated) {
          setPosts((prev) =>
            prev.map((p) => (p.id === purchasedId ? { ...p, ...updated, has_access: true, can_download: true } : p))
          );
        }
      })
      .catch((err) => console.warn('Failed to refresh post after purchase:', err));
    setPurchaseModalPost(null);
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

  // Handle tip post (1 token, silently fails on 0 balance)
  const handleTip = async (post, e) => {
    e.stopPropagation();
    if (!currentUser) { toast.error('Please log in to tip'); return; }
    const prevCount = postTips[post.id] ?? (post.tip_count || 0);
    setPostTips(prev => ({ ...prev, [post.id]: prevCount + 1 }));
    try {
      await tipPost(post.id);
    } catch {
      setPostTips(prev => ({ ...prev, [post.id]: prevCount }));
    }
  };

  // Handle follow/unfollow
  const handleFollowToggle = async (post, e) => {
    e.stopPropagation();

    if (!currentUser) {
      toast.error('Please log in to follow');
      return;
    }

    const effectiveRoomId = post.room_id ?? post.user?.main_room_id;
    if (!effectiveRoomId) {
      toast.error('No room associated with this post');
      return;
    }

    const isFollowing = followingRooms[post.id];

    try {
      if (isFollowing) {
        await leaveRoom(effectiveRoomId);
        setFollowingRooms(prev => ({ ...prev, [post.id]: false }));
        const response = await getFollowersCount(post.user_id);
        setFollowersCount(prev => ({ ...prev, [post.user_id]: response.data.followers_count || 0 }));
        toast.success(`Unfollowed @${post.user?.username}`);
      } else {
        await joinRoom(effectiveRoomId);
        setFollowingRooms(prev => ({ ...prev, [post.id]: true }));
        const response = await getFollowersCount(post.user_id);
        setFollowersCount(prev => ({ ...prev, [post.user_id]: response.data.followers_count || 0 }));
        toast.success(`Following @${post.user?.username}`);
      }
    } catch (error) {
      console.error('❌ [DiscoverFeed] Follow toggle error:', error);
      toast.error(error.message || 'Failed to update follow status');
    }
  };

  const openShareModal = async (post) => {
    setSharePost(post);
    setShareFriendsLoading(true);
    try {
      const res = await apiClient.get('/api/friends');
      setShareFriends(res.data?.friends || res.data || []);
    } catch { setShareFriends([]); }
    finally { setShareFriendsLoading(false); }
  };

  const handleShareToFriend = async (friend) => {
    if (!sharePost) return;
    const url = `${window.location.origin}/post/${sharePost.id}`;
    try {
      await apiClient.post('/api/lobby-chats/send', {
        recipient_id: friend.id,
        message: `Check out this post: ${sharePost.description?.slice(0, 80) || ''}\n${url}`,
      });
      setShareSentTo(prev => new Set([...prev, friend.id]));
      toast.success(`Shared with @${friend.username}`);
    } catch { toast.error('Failed to send'); }
  };

  // Loading skeleton
  if (loading && posts.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1 sm:gap-3 md:gap-4 px-0 sm:px-2 md:px-4 pb-8">
        {[...Array(12)].map((_, i) => (
          <div key={i} className="aspect-[3/4] bg-gray-200 dark:bg-gray-700 rounded-none sm:rounded-xl animate-pulse" />
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

  // When searching, use compact 2-column grid instead of single column
  const isSearching = searchQuery && searchQuery.trim().length > 0;

  return (
    <div className="w-full px-0 sm:px-4 pb-8">
      <div className={isSearching ? "grid grid-cols-2 gap-2" : "md:grid md:grid-cols-2 md:gap-4"}>
        {posts.map((post, index) => {
          return (
          <React.Fragment key={`post-${post.id}`}>
            {/* Post Card */}
            <div
              className="bg-white dark:bg-gray-950 cursor-pointer rounded-xl border border-white/25 mb-3 sm:mb-4 md:mb-0 overflow-hidden"
              onClick={() => handlePostClick(post)}
            >
              {/* ── Card Header: Avatar · Username · Follow · ··· ── */}
              <div className="flex items-center gap-3 px-4 py-2 bg-gray-100 dark:bg-gray-800" onClick={e => e.stopPropagation()}>
                <Avatar
                  user={post.user}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedUser(post.user);
                    setIsUserProfileModalOpen(true);
                  }}
                  className="w-12 h-12 rounded-full object-cover flex-shrink-0 cursor-pointer"
                />
                <p
                  className="flex-1 min-w-0 text-base font-bold text-gray-900 dark:text-white truncate cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedUser(post.user);
                    setIsUserProfileModalOpen(true);
                  }}
                >
                  {post.user?.username || 'Unknown'}
                </p>
                {/* Follow — hidden when already a room member */}
                {post.user_id !== currentUser?.id && (post.room_id ?? post.user?.main_room_id) && !followingRooms[post.id] && (
                  <button
                    onClick={(e) => handleFollowToggle(post, e)}
                    className="text-sm font-bold flex-shrink-0 text-blue-500 dark:text-blue-400 transition-colors"
                  >
                    Follow
                  </button>
                )}
                {/* 3-dot menu */}
                <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteMenuOpen(deleteMenuOpen === post.id ? null : post.id);
                    }}
                    className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                  >
                    <MoreVertical className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                  </button>
                  {deleteMenuOpen === post.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setDeleteMenuOpen(null); }} />
                      <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[140px]">
                        {post.user_id === currentUser?.id ? (
                          canDeletePost(post) && (
                            <button
                              onClick={(e) => handleDeletePost(post.id, e)}
                              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          )
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteMenuOpen(null);
                              setReportTarget({ targetType: 'post', targetId: post.id, targetName: post.description?.slice(0, 60) || '' });
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
                          >
                            <Flag className="w-4 h-4" />
                            Report
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Description — below header, above media, skipped for text posts */}
              {post.post_type !== 'text' && post.description && (
                <div className="px-4 py-1.5 bg-white dark:bg-gray-950">
                  <p className="text-sm text-gray-900 dark:text-white leading-snug line-clamp-2">
                    {post.description}
                  </p>
                </div>
              )}

              {/* ── Text post body — no fixed aspect ratio, grows with content ── */}
              {post.post_type === 'text' && (
                <div className="px-6 py-5 bg-white dark:bg-gray-900">
                  <p className="text-gray-900 dark:text-white text-lg font-medium text-left leading-relaxed line-clamp-6">
                    {post.text_content}
                  </p>
                </div>
              )}

              {/* ── Media — fixed aspect ratio for image/video only ── */}
              {post.post_type !== 'text' && (
              <div className="relative aspect-[4/3] sm:aspect-video bg-gray-100 dark:bg-gray-900 group overflow-hidden">
                {post.media_type === 'video' && post.video_url ? (
                  <>
                    {dataSaverEnabled ? (
                      <>
                        <video
                          src={getThumbnailUrl(post)}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                        />
                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                          <div className="bg-white/90 rounded-full p-4">
                            <svg className="w-12 h-12 text-gray-800" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                            </svg>
                          </div>
                        </div>
                      </>
                    ) : (
                      <video
                        src={getMediaUrl(post.video_url)}
                        poster={getThumbnailUrl(post)}
                        className="w-full h-full object-cover"
                        muted={unmutedVideoId !== post.id}
                        autoPlay
                        loop
                        playsInline
                      />
                    )}
                    {!dataSaverEnabled && (
                      <button
                        onClick={(e) => toggleVideoMute(e, post.id)}
                        className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm p-2 rounded-full hover:bg-black/80 transition-colors z-20"
                        title={unmutedVideoId === post.id ? 'Mute' : 'Unmute'}
                      >
                        {unmutedVideoId === post.id ? (
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    )}
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
                    alt={post.description?.slice(0, 60) || 'Post'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                )}

                {/* Hover play hint for videos */}
                {post.media_type === 'video' && (
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <div className="bg-white/90 rounded-full p-4">
                      <svg className="w-8 h-8 text-gray-800" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                    </div>
                  </div>
                )}

                {/* Duration badge */}
                {post.media_type === 'video' && post.duration && (
                  <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm px-2.5 py-1 rounded-md">
                    <span className="text-white text-xs font-medium">
                      {Math.floor(post.duration / 60)}:{String(Math.floor(post.duration % 60)).padStart(2, '0')}
                    </span>
                  </div>
                )}

                {/* Paid badge */}
                {post.is_paid && (
                  <div className="absolute bottom-3 left-3 bg-yellow-500/95 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-md">
                    <span className="text-sm font-bold text-black">
                      🔒 {parseFloat(post.price || 0).toLocaleString()} tokens
                      <span className="ml-1.5 text-xs opacity-80">
                        (≈ ₦{(parseFloat(post.price || 0) * 165).toLocaleString(undefined, { maximumFractionDigits: 0 })})
                      </span>
                    </span>
                  </div>
                )}

                {/* Mature content overlay */}
                {post.show_overlay && !dismissedOverlays.has(post.id) && (
                  <div
                    className="absolute inset-0 backdrop-blur-md bg-black/60 flex flex-col items-center justify-center text-center p-4 z-20"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDismissedOverlays(prev => new Set([...prev, post.id]));
                    }}
                  >
                    <div className="bg-red-600 text-white rounded-full p-3 mb-3 shadow-lg">
                      <span className="text-xl font-black">18+</span>
                    </div>
                    <p className="text-white font-bold text-sm mb-1">Sensitive Content</p>
                    <p className="text-white/70 text-xs mb-3">Tap to view</p>
                    <button className="px-4 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-full text-xs font-medium transition-colors">
                      Show anyway
                    </button>
                  </div>
                )}

                {/* Locked-content overlay */}
                {isPostLocked(post) && (
                  <div className="absolute inset-0 bg-black/55 backdrop-blur-sm flex flex-col items-center justify-center text-center p-4 z-10">
                    <div className="bg-yellow-500 text-black rounded-full p-3 mb-3 shadow-lg">
                      <Lock className="w-6 h-6" strokeWidth={2.5} />
                    </div>
                    <p className="text-white font-bold text-base mb-1">Locked Post</p>
                    <p className="text-white/80 text-xs mb-3">Purchase to watch &amp; download</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!currentUser) { toast.error('Please log in to purchase this post'); return; }
                        setPurchaseModalPost(post);
                      }}
                      className="px-5 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-full text-sm font-bold shadow-lg transition-colors"
                    >
                      Buy for {parseFloat(post.price || 0).toLocaleString()} tokens
                    </button>
                  </div>
                )}
              </div>
              )}

              {/* ── Footer ── */}
              <div className="bg-gray-100 dark:bg-gray-800" onClick={e => e.stopPropagation()}>
                {/* Action Row: left icons | share + timestamp pushed right */}
                <div className="flex items-center px-4 py-2">
                  {/* Left group */}
                  <div className="flex items-center gap-4">
                    {/* Views */}
                    <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
                      <Eye className="w-5 h-5" />
                      <span className="text-sm">{formatCount(post.view_count || 0)}</span>
                    </div>
                    {/* Like */}
                    <button
                      className="flex items-center gap-1.5 transition-colors group"
                      onClick={(e) => handleLikeToggle(post, e)}
                    >
                      <Heart
                        className={`w-6 h-6 transition-all ${
                          postLikes[post.id]?.isLiked
                            ? 'fill-red-500 stroke-red-500'
                            : 'stroke-gray-800 dark:stroke-gray-100 group-hover:stroke-red-500'
                        }`}
                        fill="none"
                        strokeWidth={2}
                      />
                      <span className={`text-sm font-semibold ${postLikes[post.id]?.isLiked ? 'text-red-500' : 'text-gray-800 dark:text-gray-100'}`}>
                        {formatCount(postLikes[post.id]?.count ?? (post.likes_count || 0))}
                      </span>
                    </button>
                    {/* Comment */}
                    <button
                      className="flex items-center gap-1.5 transition-colors group"
                      onClick={(e) => {
                        e.stopPropagation();
                        const newOpenState = openComments === post.id ? null : post.id;
                        setOpenComments(newOpenState);
                        if (newOpenState) fetchComments(newOpenState);
                      }}
                    >
                      <MessageCircle
                        className={`w-6 h-6 ${openComments === post.id ? 'stroke-blue-500' : 'stroke-gray-800 dark:stroke-gray-100 group-hover:stroke-blue-500'}`}
                        fill="none"
                        strokeWidth={2}
                      />
                      <span className={`text-sm font-semibold ${openComments === post.id ? 'text-blue-500' : 'text-gray-800 dark:text-gray-100'}`}>
                        {formatCount(post.comments_count || 0)}
                      </span>
                    </button>
                    {/* Gift / Tip — not shown on own posts */}
                    {post.user_id !== currentUser?.id && (
                      <button
                        className="flex items-center gap-1.5 transition-colors group"
                        onClick={(e) => handleTip(post, e)}
                        title="Send 1 token tip"
                      >
                        <Gift
                          className="w-6 h-6 stroke-gray-800 dark:stroke-gray-100 group-hover:stroke-yellow-500 transition-colors"
                          strokeWidth={2}
                        />
                        <span className="text-sm text-gray-800 dark:text-gray-100 group-hover:text-yellow-500">
                          {formatCount(postTips[post.id] ?? (post.tip_count || 0))}
                        </span>
                      </button>
                    )}
                  </div>
                  {/* Right group — share + timestamp */}
                  <div className="ml-auto flex items-center gap-2.5">
                    <button
                      className="flex items-center transition-colors group"
                      onClick={(e) => { e.stopPropagation(); openShareModal(post); }}
                      title="Share"
                    >
                      <svg className="w-6 h-6 stroke-gray-800 dark:stroke-gray-100 group-hover:stroke-purple-500" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                      </svg>
                    </button>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                      {formatTimeAgo(post.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Ad Banner every 6 posts */}
            {(index + 1) % 6 === 0 && adsEnabled && (
              <div className="bg-white dark:bg-gray-950 sm:mb-4 md:col-span-2">
                <div className="relative aspect-square sm:aspect-video bg-gray-200 dark:bg-gray-900 overflow-hidden">
                  <AdBanner />
                </div>
                <div className="px-4 py-2">
                  <p className="text-xs text-gray-400 dark:text-gray-500">Sponsored content</p>
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
                      <Avatar
                        user={comment.user}
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

      {/* Post Purchase Modal — opens when a logged-in user clicks a locked paid post */}
      <PostPurchaseModal
        isOpen={purchaseModalPost !== null}
        onClose={() => setPurchaseModalPost(null)}
        post={purchaseModalPost}
        onSuccess={handlePurchaseSuccess}
      />

      {/* Report Modal */}
      {reportTarget && (
        <ReportModal
          targetType={reportTarget.targetType}
          targetId={reportTarget.targetId}
          targetName={reportTarget.targetName}
          onClose={() => setReportTarget(null)}
        />
      )}

      {/* Share Post Modal */}
      {sharePost && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => { setSharePost(null); setShareSentTo(new Set()); }}>
          <div className="bg-white dark:bg-gray-900 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Share Post</h3>
              <button onClick={() => { setSharePost(null); setShareSentTo(new Set()); }} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            {/* Quick actions */}
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex gap-3">
                <button
                  onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/post/${sharePost.id}`); toast.success('Link copied!'); }}
                  className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-6 h-6 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">Copy link</span>
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`${sharePost.description?.slice(0, 80) || ''} ${window.location.origin}/post/${sharePost.id}`)}`}
                  target="_blank" rel="noreferrer"
                  className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  <svg className="w-6 h-6 text-green-600" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  <span className="text-xs text-green-600 font-medium">WhatsApp</span>
                </a>
                <a
                  href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(`${window.location.origin}/post/${sharePost.id}`)}&text=${encodeURIComponent(sharePost.description?.slice(0, 120) || '')}`}
                  target="_blank" rel="noreferrer"
                  className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  <svg className="w-6 h-6 text-sky-500" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  <span className="text-xs text-sky-500 font-medium">X / Twitter</span>
                </a>
              </div>
            </div>
            {/* Friends list */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Send to a friend</p>
              {shareFriendsLoading ? (
                <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600" /></div>
              ) : shareFriends.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No friends yet</p>
              ) : (
                <div className="space-y-2">
                  {shareFriends.map(friend => (
                    <div key={friend.id} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img src={friend.avatar_url || friend.profile_picture} alt={friend.username} className="w-9 h-9 rounded-full object-cover flex-shrink-0 bg-gray-200" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate">@{friend.username}</span>
                      </div>
                      <button
                        onClick={() => handleShareToFriend(friend)}
                        disabled={shareSentTo.has(friend.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 transition-colors ${
                          shareSentTo.has(friend.id)
                            ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 cursor-default'
                            : 'bg-purple-600 hover:bg-purple-700 text-white'
                        }`}
                      >
                        {shareSentTo.has(friend.id) ? 'Sent ✓' : 'Send'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

DiscoverFeed.displayName = 'DiscoverFeed';

export default DiscoverFeed;
