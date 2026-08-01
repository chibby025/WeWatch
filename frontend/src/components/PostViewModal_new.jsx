// WeWatch/frontend/src/components/PostViewModal.jsx
// YouTube-style fullscreen post viewer with auto-hide footer
import React, { useState, useEffect, useRef } from 'react';
import { X, Heart, MessageCircle, Share2, Send, Trash2, Download, Loader2 } from 'lucide-react';
import apiClient, { API_BASE_URL } from '../services/api';
import toast from 'react-hot-toast';
import { formatCount } from '../utils/formatCount';
import { useAuth } from '../contexts/AuthContext';

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
  const [hasAccess, setHasAccess] = useState(false);
  const [canDownload, setCanDownload] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const videoRef = useRef(null);
  const hideTimeoutRef = useRef(null);
  const { currentUser } = useAuth();

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
      setHasAccess(post.has_access || post.is_owner || false);
      setCanDownload(post.can_download || false);
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

  const trackView = async () => {
    try {
      await apiClient.post(`/api/posts/${post.id}/view`);
    } catch (err) {
      console.error('Failed to track view:', err);
    }
  };

  const handleLike = async () => {
    try {
      if (isLiked) {
        await apiClient.delete(`/api/posts/${post.id}/like`);
        setIsLiked(false);
        setLikesCount(prev => Math.max(0, prev - 1));
        if (onLikeToggle) onLikeToggle(post.id, false);
      } else {
        await apiClient.post(`/api/posts/${post.id}/like`);
        setIsLiked(true);
        setLikesCount(prev => prev + 1);
        if (onLikeToggle) onLikeToggle(post.id, true);
      }
    } catch (err) {
      console.error('Failed to toggle like:', err);
      toast.error('Failed to update like');
    }
  };

  const handleDoubleClick = (e) => {
    if (e.target.tagName !== 'VIDEO' && e.target.tagName !== 'IMG') return;
    handleLike();
    
    // Show animated heart
    const heart = document.createElement('div');
    heart.innerHTML = '❤️';
    heart.style.cssText = `
      position: absolute;
      font-size: 5rem;
      left: ${e.clientX}px;
      top: ${e.clientY}px;
      transform: translate(-50%, -50%);
      pointer-events: none;
      animation: heartPop 1s ease-out forwards;
      z-index: 1000;
    `;
    document.body.appendChild(heart);
    setTimeout(() => heart.remove(), 1000);
  };

  const fetchComments = async () => {
    if (!post?.id) return;
    
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
    if (!newComment.trim()) return;

    setSubmittingComment(true);
    try {
      const response = await apiClient.post(`/api/posts/${post.id}/comments`, {
        content: newComment.trim()
      });
      
      const newCommentData = response.data.comment;
      setComments(prev => [newCommentData, ...prev]);
      setCommentsCount(prev => prev + 1);
      setNewComment('');
      toast.success('Comment added!');
      
      if (onCommentAdded) {
        onCommentAdded(post.id);
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
      toast.error('Failed to post comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return;
    
    setDeletingCommentId(commentId);
    try {
      await apiClient.delete(`/api/posts/${post.id}/comments/${commentId}`);
      setComments(prev => prev.filter(c => c.id !== commentId));
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
    const url = `${window.location.origin}/posts/${post.id}`;
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

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      await apiClient.post(`/api/posts/${post.id}/purchase`);
      setHasAccess(true);
      setCanDownload(true);
      toast.success('Purchase successful! You now have full access.');
    } catch (err) {
      if (err.response?.status === 409) {
        setHasAccess(true);
        setCanDownload(true);
      } else {
        toast.error(err.response?.data?.error || 'Purchase failed');
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await apiClient.get(`/api/posts/${post.id}/download`);
      const { video_url, filename } = response.data;
      const a = document.createElement('a');
      a.href = video_url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('Download started!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Download failed');
    } finally {
      setDownloading(false);
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
    if (url.startsWith('http')) return url;
    const cleanUrl = url.startsWith('/') ? url.slice(1) : url;
    return `${API_BASE_URL}/${cleanUrl}`;
  };

  if (!isOpen || !post) {
    console.log('🎬 [PostViewModal] Not rendering:', { isOpen, hasPost: !!post });
    return null;
  }

  console.log('🎬 [PostViewModal] Rendering:', {
    postId: post.id,
    postType: post.post_type,
    title: post.title,
    mediaType: post.media_type,
    hasUser: !!post.User,
    username: post.User?.username,
    hasRoom: !!post.Room,
    roomName: post.Room?.name,
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
          
          @keyframes slide-in-right {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
          
          .animate-slide-in-right {
            animation: slide-in-right 0.3s ease-out;
          }
        `}
      </style>
      
      {/* Fullscreen container with video */}
      <div 
        className="fixed inset-0 bg-black z-50 flex items-center justify-center"
        onMouseMove={handleMouseMove}
        onDoubleClick={handleDoubleClick}
      >
        {/* Video/Image — paywall when paid and not yet purchased */}
        {post.is_paid && !hasAccess ? (
          <div className="relative w-full h-full flex items-center justify-center">
            {post.thumbnail_url ? (
              <img
                src={getMediaUrl(post.thumbnail_url)}
                alt={post.title}
                className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-40"
              />
            ) : (
              <div className="absolute inset-0 bg-gray-900" />
            )}
            <div className="relative z-10 flex flex-col items-center gap-4 text-center p-8 max-w-sm">
              <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <p className="text-white font-bold text-xl mb-1">Paid Content</p>
                <p className="text-gray-300 text-sm">Purchase to unlock full access &amp; download</p>
              </div>
              {post.price && (
                <p className="text-yellow-400 font-bold text-2xl">
                  ₦{Math.round(post.price * 122).toLocaleString()}
                </p>
              )}
              <button
                onClick={handlePurchase}
                disabled={purchasing}
                className="px-8 py-3 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-full transition-all flex items-center gap-2"
              >
                {purchasing ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                ) : (
                  <>🔓 Unlock Now</>
                )}
              </button>
            </div>
          </div>
        ) : post.media_type === 'video' ? (
          <video
            ref={videoRef}
            src={getMediaUrl(post.video_url)}
            controls
            loop
            className="w-full h-full object-contain"
          />
        ) : (
          <img
            src={getMediaUrl(post.video_url)}
            alt={post.title}
            className="w-full h-full object-contain"
          />
        )}

        {/* Close button (always visible) */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-3 bg-black/70 hover:bg-black/90 rounded-full transition-all"
        >
          <X className="w-6 h-6 text-white" />
        </button>

        {/* Footer overlay (auto-hide) */}
        <div
          className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/90 to-transparent transition-all duration-300 ${
            showControls ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
          }`}
        >
          {/* User/Room Info + Engagement */}
          <div className="px-4 md:px-6 pt-12 pb-6">
            {/* Creator Info */}
            <div className="flex items-start gap-4 mb-4">
              {/* Avatar */}
              <div className="flex-shrink-0">
                {post.post_type === 'recording' && post.Room ? (
                  post.Room.image_url ? (
                    <img
                      src={post.Room.image_url.startsWith('http') ? post.Room.image_url : `${API_BASE_URL}/${post.Room.image_url.startsWith('/') ? post.Room.image_url.slice(1) : post.Room.image_url}`}
                      alt={post.Room.name}
                      className="w-12 h-12 rounded-full object-cover border-2 border-purple-500"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center border-2 border-purple-500">
                      <span className="text-white font-bold">
                        {post.Room.name?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )
                ) : (
                  post.User?.avatar_url ? (
                    <img
                      src={post.User.avatar_url}
                      alt={post.User.username}
                      className="w-12 h-12 rounded-full object-cover border-2 border-blue-500"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center border-2 border-blue-500">
                      <span className="text-white font-bold">
                        {post.User?.username?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </div>
                  )
                )}
              </div>

              {/* Title + Username/Room */}
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-xl text-white mb-1 flex items-center gap-2 flex-wrap">
                  {post.title}
                  {post.content_rating && post.content_rating !== 'G' && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      post.content_rating === '18+' || post.content_rating === 'Mature'
                        ? 'bg-red-600 text-white'
                        : post.content_rating === '16+' || post.content_rating === '13+'
                        ? 'bg-orange-500 text-white'
                        : 'bg-teal-600 text-white'
                    }`}>{post.content_rating}</span>
                  )}
                </h2>
                <p className="text-sm text-gray-300">
                  {post.post_type === 'recording' && post.Room ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                      </svg>
                      {post.Room.name}
                    </span>
                  ) : (
                    `@${post.User?.username || 'Unknown'}`
                  )}
                </p>
                {post.description && (
                  <p className="text-sm text-gray-400 mt-2 line-clamp-2">{post.description}</p>
                )}
              </div>
            </div>

            {/* Engagement Buttons */}
            <div className="flex items-center gap-6">
              <button
                onClick={handleLike}
                className="flex items-center gap-2 group transition-all"
              >
                <Heart
                  className={`w-7 h-7 transition-all ${
                    isLiked ? 'fill-red-500 text-red-500' : 'text-white group-hover:text-red-500'
                  }`}
                />
                <span className="text-white font-medium">{formatCount(likesCount)}</span>
              </button>
              
              <button
                onClick={toggleComments}
                className="flex items-center gap-2 group transition-all"
              >
                <MessageCircle className="w-7 h-7 text-white group-hover:text-blue-500 transition-colors" />
                <span className="text-white font-medium">{formatCount(commentsCount)}</span>
              </button>
              
              <button
                onClick={handleShare}
                className="flex items-center gap-2 group transition-all"
              >
                <Share2 className="w-7 h-7 text-white group-hover:text-green-500 transition-colors" />
              </button>

              {canDownload && (
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex items-center gap-2 group transition-all"
                >
                  {downloading
                    ? <Loader2 className="w-7 h-7 text-white animate-spin" />
                    : <Download className="w-7 h-7 text-white group-hover:text-green-500 transition-colors" />
                  }
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Comments Panel (slide from right) */}
        {showComments && (
          <div className="absolute top-0 right-0 bottom-0 w-full sm:w-96 bg-gray-900 shadow-2xl flex flex-col animate-slide-in-right">
            {/* Comments Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-white font-semibold text-lg">Comments ({formatCount(commentsCount)})</h3>
              <button
                onClick={() => setShowComments(false)}
                className="p-2 hover:bg-gray-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Comments List */}
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
                  <div key={comment.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {comment.User?.username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm text-white">{comment.User?.username || 'Unknown'}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(comment.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300">{comment.content}</p>
                    </div>
                    {currentUser && currentUser.id === comment.user_id && (
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        disabled={deletingCommentId === comment.id}
                        className="text-gray-500 hover:text-red-500 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Comment Input */}
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
                  <Send className="w-5 h-5 text-white" />
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
