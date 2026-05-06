// WeWatch/frontend/src/components/PostViewModal.jsx
// YouTube-style fullscreen post viewer with auto-hide footer
import React, { useState, useEffect, useRef } from 'react';
import { X, Heart, MessageCircle, Share2, Send, Trash2 } from 'lucide-react';
import apiClient from '../services/api';
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
  const videoRef = useRef(null);
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

  const trackView = async () => {
    try {
      await apiClient.post(`/api/posts/${post.id}/view`);
    } catch (err) {
      console.error('Failed to track view:', err);
    }
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

  const getMediaUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const cleanUrl = url.startsWith('/') ? url.slice(1) : url;
    return `${import.meta.env.VITE_API_BASE_URL}/${cleanUrl}`;
  };

  if (!isOpen || !post) {
    // console.log('🎬 [PostViewModal] Not rendering:', { isOpen, hasPost: !!post });
    return null;
  }

  console.log('🎬 [PostViewModal] Rendering:', {
    postId: post.id,
    postType: post.post_type,
    title: post.title,
    mediaType: post.media_type,
    hasUser: !!post.user,
    username: post.user?.username,
    hasRoom: !!post.room,
    roomName: post.room?.name,
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
      >
        {/* Video/Image fullscreen */}
        {post.media_type === 'video' ? (
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
                      {comment.user?.username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm text-white">{comment.user?.username || 'Unknown'}</span>
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
