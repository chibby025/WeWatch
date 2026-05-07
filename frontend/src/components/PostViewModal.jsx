// WeWatch/frontend/src/components/PostViewModal.jsx
// Fullscreen post viewer with engagement features (like, comment, share)
import React, { useState, useEffect, useRef } from 'react';
import { X, Heart, MessageCircle, Share2, MoreVertical, Send, Trash2, UserPlus, UserCheck, Link, Download } from 'lucide-react';
import apiClient, { getFollowersCount, joinRoom, leaveRoom } from '../services/api';
import toast from 'react-hot-toast';
import { formatCount } from '../utils/formatCount';
import { useAuth } from '../contexts/AuthContext'; // ✅ Use auth context instead of JWT decode

const PostViewModal = ({ isOpen, onClose, post, onLikeToggle, onCommentAdded }) => {
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [comments, setComments] = useState([]);
  const [commentsCount, setCommentsCount] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [viewTracked, setViewTracked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const [showControls, setShowControls] = useState(true); // YouTube-style auto-hide
  const [followersCount, setFollowersCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const videoRef = useRef(null);
  const hideTimeoutRef = useRef(null);
  const { currentUser, roomMemberships } = useAuth(); // ✅ Get currentUser and roomMemberships from auth context

  // Track view on mount
  useEffect(() => {
    if (isOpen && post && !viewTracked) {
      trackView();
      setViewTracked(true);
    }
  }, [isOpen, post, viewTracked]);

  // Reset state when post changes
  useEffect(() => {
    if (post) {
      setIsLiked(post.is_liked || false);
      setLikesCount(post.likes_count || 0);
      setCommentsCount(post.comments_count || 0);
      setViewTracked(false);
      setShowComments(false);
      setComments([]);
      
      // Fetch followers count
      if (post.user_id) {
        getFollowersCount(post.user_id)
          .then(response => {
            setFollowersCount(response.data.followers_count || 0);
          })
          .catch(error => {
            console.error('Failed to fetch followers:', error);
            setFollowersCount(0);
          });
      }
      
      // Check if already following
      if (post.room_id && roomMemberships) {
        setIsFollowing(roomMemberships.some(rm => rm.room_id === post.room_id));
      }
    }
  }, [post?.id, roomMemberships]);

  // Fetch followers count when post changes
  useEffect(() => {
    const fetchFollowers = async () => {
      if (post?.user_id) {
        const count = await getUserFollowersCount(post.user_id);
        setFollowersCount(count);
      }
    };
    
    if (isOpen && post) {
      fetchFollowers();
    }
  }, [isOpen, post]);

  // Check if user is following
  useEffect(() => {
    if (post?.room_id && roomMemberships) {
      const following = roomMemberships.some(rm => rm.room_id === post.room_id);
      setIsFollowing(following);
    }
  }, [post, roomMemberships]);

  // Auto-play video when opened
  useEffect(() => {
    if (isOpen && videoRef.current && post?.media_type === 'video') {
      videoRef.current.play().catch(err => {
        console.log('Auto-play prevented:', err);
      });
    }
  }, [isOpen, post]);

  // Handle mouse movement for auto-hide controls
  const handleMouseMove = () => {
    setShowControls(true);
    
    // Clear existing timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    
    // Hide controls after 2 seconds of inactivity
    hideTimeoutRef.current = setTimeout(() => {
      if (!showComments) { // Don't hide if comments are open
        setShowControls(false);
      }
    }, 2000);
  };

  // Handle touch events for mobile
  const handleTouch = () => {
    setShowControls(true);
    
    // Clear existing timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    
    // On mobile, keep controls visible longer (4 seconds)
    hideTimeoutRef.current = setTimeout(() => {
      if (!showComments) {
        setShowControls(false);
      }
    }, 4000);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // Keep controls visible when comments are open
  useEffect(() => {
    if (showComments) {
      setShowControls(true);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    }
  }, [showComments]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const trackView = async () => {
    try {
      await apiClient.post(`/api/posts/${post.id}/view`);
    } catch (err) {
      console.error('Failed to track view:', err);
    }
  };

  const handleLike = async () => {
    if (!post) return;
    
    const wasLiked = isLiked;
    const prevCount = likesCount;
    
    // Optimistic update
    setIsLiked(!wasLiked);
    setLikesCount(prevCount + (wasLiked ? -1 : 1));
    
    try {
      if (wasLiked) {
        await apiClient.delete(`/api/posts/${post.id}/unlike`);
      } else {
        await apiClient.post(`/api/posts/${post.id}/like`);
      }
      
      // Notify parent if callback provided
      if (onLikeToggle) {
        onLikeToggle(post.id, !wasLiked);
      }
    } catch (err) {
      // Revert on error
      setIsLiked(wasLiked);
      setLikesCount(prevCount);
      toast.error('Failed to update like');
      console.error('Like error:', err);
    }
  };

  const handleDoubleClick = (e) => {
    // Don't trigger like if user is double-clicking on video controls
    if (e.target.tagName === 'VIDEO') return;
    
    if (!isLiked) {
      handleLike();
      // Show heart animation
      const heart = document.createElement('div');
      heart.innerHTML = '❤️';
      heart.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0);
        font-size: 100px;
        pointer-events: none;
        animation: heartPop 0.8s ease-out;
        z-index: 100;
      `;
      document.querySelector('.post-view-content').appendChild(heart);
      setTimeout(() => heart.remove(), 800);
    }
  };

  const handleFollowToggle = async () => {
    if (!currentUser) {
      toast.error('Please log in to follow');
      return;
    }
    
    if (!post?.room_id) {
      toast.error('No room associated with this post');
      return;
    }
    
    try {
      if (isFollowing) {
        await leaveRoom(post.room_id);
        setIsFollowing(false);
        const response = await getFollowersCount(post.user_id);
        setFollowersCount(response.data.followers_count || 0);
        toast.success(`Unfollowed @${post.user?.username}`);
      } else {
        await joinRoom(post.room_id);
        setIsFollowing(true);
        const response = await getFollowersCount(post.user_id);
        setFollowersCount(response.data.followers_count || 0);
        toast.success(`Following @${post.user?.username}`);
      }
    } catch (error) {
      console.error('Follow toggle error:', error);
      toast.error(error.message || 'Failed to update follow status');
    }
  };

  const handleDownload = async () => {
    if (downloading) return;
    
    if (!post.allow_downloads) {
      toast.error('Downloads are disabled for this post');
      return;
    }
    
    setDownloading(true);
    
    try {
      // Call backend download endpoint to track analytics
      const response = await apiClient.get(`/api/posts/${post.id}/download`);
      const { video_url, filename } = response.data;
      
      // Create a temporary anchor element to trigger download
      const link = document.createElement('a');
      link.href = video_url;
      link.download = filename || `WeWatch_${post.title}_${post.id}.mp4`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Download started!');
    } catch (error) {
      console.error('Download error:', error);
      toast.error(error.response?.data?.error || 'Failed to download video');
    } finally {
      setDownloading(false);
    }
  };

  const fetchComments = async () => {
    if (!post) return;
    
    setLoadingComments(true);
    try {
      const response = await apiClient.get(`/api/posts/${post.id}/comments`);
      setComments(response.data.comments || []);
    } catch (err) {
      console.error('Failed to fetch comments:', err);
      toast.error('Failed to load comments');
    } finally {
      setLoadingComments(false);
    }
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || submittingComment || !post) return;
    
    setSubmittingComment(true);
    try {
      const response = await apiClient.post(`/api/posts/${post.ID}/comments`, {
        content: newComment.trim()
      });
      
      const newCommentData = response.data.comment;
      setComments(prev => [newCommentData, ...prev]);
      setCommentsCount(prev => prev + 1);
      setNewComment('');
      toast.success('Comment added!');
      
      if (onCommentAdded) {
        onCommentAdded(post.ID);
      }
    } catch (err) {
      console.error('Failed to add comment:', err);
      toast.error(err.response?.data?.error || 'Failed to add comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return;
    
    setDeletingCommentId(commentId);
    try {
      await apiClient.delete(`/api/posts/comments/${commentId}`);
      setComments(prev => prev.filter(c => c.ID !== commentId));
      setCommentsCount(prev => Math.max(0, prev - 1));
      toast.success('Comment deleted');
    } catch (err) {
      console.error('Failed to delete comment:', err);
      toast.error('Failed to delete comment');
    } finally {
      setDeletingCommentId(null);
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/posts/${post.ID}`;
    if (navigator.share) {
      navigator.share({
        title: post.title,
        text: post.description,
        url: url
      }).catch(err => console.log('Share cancelled'));
    } else {
      navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard!');
    }
  };

  const toggleComments = () => {
    if (!showComments && comments.length === 0) {
      fetchComments();
    }
    setShowComments(!showComments);
  };

  const getMediaUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http')) return url; // CDN URL
    // Remove leading slash to avoid double slash when combining with base URL
    const cleanUrl = url.startsWith('/') ? url.slice(1) : url;
    return `${import.meta.env.VITE_API_BASE_URL}/${cleanUrl}`;
  };

  if (!isOpen || !post) {
    // console.log('🎬 [PostViewModal] Not rendering:', { isOpen, hasPost: !!post });
    return null;
  }

  console.log('🎬 [PostViewModal] Rendering:', {
    postId: post.id,
    title: post.title,
    mediaType: post.media_type,
    videoUrl: post.video_url,
  });

  return (
    <>
      <style>
        {`
          @keyframes heartPop {
            0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
            50% { transform: translate(-50%, -50%) scale(1.2); }
            100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
          }
        `}
      </style>
      
      {/* YouTube-style fullscreen layout */}
      <div 
        className="fixed inset-0 bg-black z-50 flex flex-col"
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
        >
          <X className="w-6 h-6 text-white" />
        </button>

        {/* Download button (only if downloads are allowed and video exists) */}
        {post.allow_downloads && post.media_type === 'video' && post.video_url && (
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="absolute top-4 right-16 z-50 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors disabled:opacity-50"
            title={`Download ${post.title}`}
          >
            {downloading ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-6 h-6 text-white" />
            )}
          </button>
        )}

        {/* Fullscreen media */}
        <div className="flex-1 flex items-center justify-center relative post-view-content" onDoubleClick={handleDoubleClick}>
          {post.media_type === 'video' ? (
            <video
              ref={videoRef}
              src={getMediaUrl(post.video_url)}
              controls
              loop
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <img
              src={getMediaUrl(post.video_url)}
              alt={post.title}
              className="max-h-full max-w-full object-contain"
            />
          )}
        </div>

        {/* Auto-hide footer overlay (YouTube-style) */}
        <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/90 to-transparent pb-6 pt-12 px-6 transition-all duration-300 ${
          showControls ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
        }`}>
          {/* User info with avatar */}
          <div className="flex items-start gap-3 mb-4">
            {/* User avatar (larger size, always show user, not room) */}
            {post.user?.avatar_url ? (
              <img
                src={post.user.avatar_url.startsWith('http') ? post.user.avatar_url : `${import.meta.env.VITE_API_BASE_URL}/${post.user.avatar_url.startsWith('/') ? post.user.avatar_url.slice(1) : post.user.avatar_url}`}
                alt={post.user.username}
                className="w-14 h-14 rounded-full ring-2 ring-blue-500"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-lg ring-2 ring-blue-500">
                {post.user?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}

            <div className="flex-1">
              {/* Primary: username */}
              <h3 className="font-semibold text-white text-lg">@{post.user?.username || 'Unknown'}</h3>
              
              {/* Followers count */}
              <p className="text-sm text-gray-300 mt-0.5">
                {formatCount(followersCount)} followers
              </p>
            </div>

            {/* Follow button (hide on own posts) */}
            {post.user_id !== currentUser?.id && post.room_id && (
              <button
                onClick={handleFollowToggle}
                className={`px-4 py-2 rounded-full font-medium text-sm transition-colors flex items-center gap-1.5 ${
                  isFollowing
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isFollowing ? (
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
            )}
          </div>

          {/* Title and description */}
          <div className="mb-4">
            <h2 className="font-bold text-xl text-white mb-1">{post.title}</h2>
            {post.description && (
              <p className="text-sm text-gray-300 line-clamp-2">{post.description}</p>
            )}
          </div>

          {/* Engagement buttons (Larger icons) */}
          <div className="flex items-center gap-6">
            <button
              onClick={handleLike}
              className="flex items-center gap-2 group transition-all"
            >
              <Heart
                className={`w-7 h-7 transition-all ${
                  isLiked 
                    ? 'fill-red-500 stroke-red-500 scale-110' 
                    : 'text-white group-hover:text-red-500 group-hover:scale-110'
                }`}
                fill="none"
                strokeWidth={2}
              />
              <span className="text-white font-medium">{formatCount(likesCount)}</span>
            </button>
            
            <button
              onClick={toggleComments}
              className="flex items-center gap-2 group transition-all"
            >
              <MessageCircle className={`w-8 h-8 transition-colors ${
                showComments ? 'text-blue-500' : 'text-white group-hover:text-blue-500'
              }`} />
              <span className="text-base font-medium text-white">{formatCount(commentsCount)}</span>
            </button>
            
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.origin + '/post/' + post.id);
                toast.success('Link copied to clipboard!');
              }}
              className="flex items-center gap-2 group transition-all"
              title="Copy link"
            >
              <Link className="w-8 h-8 text-white group-hover:text-purple-500 transition-colors" />
            </button>
          </div>
        </div>

        {/* Comments panel (slides from right) */}
        {showComments && (
          <div className="absolute top-0 right-0 bottom-0 w-full sm:w-96 bg-gray-900 text-white flex flex-col shadow-2xl animate-slide-in-right">
            {/* Comments header */}
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-lg">Comments</h3>
              <button
                onClick={() => setShowComments(false)}
                className="p-1 hover:bg-gray-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Comments list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loadingComments ? (
                <div className="text-center py-8">
                  <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto" />
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No comments yet</p>
                  <p className="text-sm">Be the first to comment!</p>
                </div>
              ) : (
                comments.map((comment) => (
                  <div key={comment.ID} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {comment.User?.username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{comment.User?.username || 'Unknown'}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(comment.CreatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300">{comment.content}</p>
                    </div>
                    {currentUser && currentUser.id === comment.user_id && (
                      <button
                        onClick={() => handleDeleteComment(comment.ID)}
                        disabled={deletingCommentId === comment.ID}
                        className="text-gray-500 hover:text-red-500 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Comment input */}
            <form onSubmit={handleCommentSubmit} className="p-4 border-t border-gray-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-full text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  disabled={submittingComment}
                />
                <button
                  type="submit"
                  disabled={!newComment.trim() || submittingComment}
                  className="p-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-full transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </>
  );
};

export default PostViewModal;
