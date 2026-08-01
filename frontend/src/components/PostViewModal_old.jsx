// WeWatch/frontend/src/components/PostViewModal.jsx
// Fullscreen post viewer with engagement features (like, comment, share)
import React, { useState, useEffect, useRef } from 'react';
import { X, Heart, MessageCircle, Share2, MoreVertical, Send, Trash2 } from 'lucide-react';
import apiClient, { API_BASE_URL } from '../services/api';
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
  const videoRef = useRef(null);
  const hideTimeoutRef = useRef(null);
  const { currentUser } = useAuth(); // ✅ Get currentUser from auth context

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
    }
  }, [post?.id]);

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
        await apiClient.delete(`/api/posts/${post.id}/like`);
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

  const handleDoubleClick = () => {
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
    return `${API_BASE_URL}/${cleanUrl}`;
  };

  if (!isOpen || !post) {
    console.log('🎬 [PostViewModal] Not rendering:', { isOpen, hasPost: !!post });
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
      
      <div className="fixed inset-0 bg-black z-50 flex">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
        >
          <X className="w-6 h-6 text-white" />
        </button>

        {/* Main content area */}
        <div className="flex-1 flex items-center justify-center relative post-view-content" onDoubleClick={handleDoubleClick}>
          {/* Media display */}
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

        {/* Right sidebar with info and engagement */}
        <div className="w-full sm:w-96 bg-gray-900 text-white flex flex-col max-h-screen overflow-hidden">
          {/* Header with creator info */}
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-lg">
                {post.User?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{post.User?.username || 'Unknown'}</h3>
                <p className="text-xs text-gray-400">{new Date(post.CreatedAt).toLocaleDateString()}</p>
              </div>
            </div>
            
            {/* Title and description */}
            <div className="mt-4">
              <h2 className="font-bold text-lg mb-2">{post.title}</h2>
              {post.description && (
                <p className="text-sm text-gray-300">{post.description}</p>
              )}
            </div>
          </div>

          {/* Engagement buttons */}
          <div className="p-4 border-b border-gray-800 flex items-center gap-6">
            <button
              onClick={handleLike}
              className="flex items-center gap-2 group transition-all"
            >
              <Heart
                className={`w-6 h-6 transition-all ${
                  isLiked ? 'fill-red-500 text-red-500' : 'text-gray-300 group-hover:text-red-500'
                }`}
              />
              <span className="text-sm font-medium">{formatCount(likesCount)}</span>
            </button>
            
            <button
              onClick={toggleComments}
              className="flex items-center gap-2 group transition-all"
            >
              <MessageCircle className="w-6 h-6 text-gray-300 group-hover:text-blue-500 transition-colors" />
              <span className="text-sm font-medium">{formatCount(commentsCount)}</span>
            </button>
            
            <button
              onClick={handleShare}
              className="flex items-center gap-2 group transition-all"
            >
              <Share2 className="w-6 h-6 text-gray-300 group-hover:text-green-500 transition-colors" />
            </button>
          </div>

          {/* Comments section */}
          {showComments && (
            <>
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
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default PostViewModal;
