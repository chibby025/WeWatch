// WeWatch/frontend/src/components/PostViewModal.jsx
// Fullscreen post viewer with engagement features (like, comment, share)
import React, { useState, useEffect, useRef } from 'react';
import { X, Heart, MessageCircle, Share2, MoreVertical, Send, Trash2, UserPlus, UserCheck, Link, Download, CornerDownLeft, ChevronDown, ChevronUp, Paperclip, Reply as ReplyIcon } from 'lucide-react';

const formatCommentTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};
import apiClient, { API_BASE_URL, getFollowersCount, joinRoom, leaveRoom, tipPost } from '../services/api';
import toast from 'react-hot-toast';
import { formatCount } from '../utils/formatCount';
import { useAuth } from '../contexts/AuthContext'; // ✅ Use auth context instead of JWT decode
import Avatar from './Avatar';

const PostViewModal = ({ isOpen, onClose, post, onLikeToggle, onCommentAdded }) => {
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [tipCount, setTipCount] = useState(0);
  const [tipping, setTipping] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsCount, setCommentsCount] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [commentAttachment, setCommentAttachment] = useState(null);
  const [commentAttachPreview, setCommentAttachPreview] = useState(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const commentAttachRef = useRef(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [viewTracked, setViewTracked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const [showControls, setShowControls] = useState(true); // YouTube-style auto-hide
  const [replyingToId, setReplyingToId] = useState(null);
  const [replyingToUsername, setReplyingToUsername] = useState('');
  const [openCommentMenu, setOpenCommentMenu] = useState(null);
  const [expandedReplies, setExpandedReplies] = useState(new Set());
  const commentInputRef = useRef(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const videoRef = useRef(null);
  const hideTimeoutRef = useRef(null);
  const { currentUser, roomMemberships } = useAuth(); // ✅ Get currentUser and roomMemberships from auth context

  // Track view on mount
  useEffect(() => {
    if (isOpen && post && !viewTracked) {
      console.log('🎬 [PostViewModal] Post opened:', {
        postId: post.id,
        userId: post.user_id,
        postRoomId: post.room_id,
        userMainRoomId: post.user?.main_room_id,
        effectiveRoomId: post.room_id || post.user?.main_room_id,
        hasUser: !!post.user,
        username: post.user?.username,
      });
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
      setTipCount(post.tip_count || 0);
      setTipping(false);
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
      
      // Check if already following - use post.room_id or fall back to poster's main_room_id
      const effectiveRoomId = post.room_id || post.user?.main_room_id;
      if (effectiveRoomId && roomMemberships) {
        setIsFollowing(roomMemberships.some(rm => rm.room_id === effectiveRoomId));
      }
    }
  }, [post?.id, roomMemberships]);

  // Check if user is following - use post.room_id or fall back to poster's main_room_id
  useEffect(() => {
    const effectiveRoomId = post?.room_id || post?.user?.main_room_id;
    if (effectiveRoomId && roomMemberships) {
      const following = roomMemberships.some(rm => rm.room_id === effectiveRoomId);
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

  const handleTip = async () => {
    if (!post || tipping || post.user_id === currentUser?.id) return;
    setTipping(true);
    setTipCount(c => c + 1);
    try {
      await tipPost(post.id);
    } catch {
      setTipCount(c => c - 1);
    } finally {
      setTipping(false);
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
    
    // Use post.room_id or fall back to poster's main_room_id
    const effectiveRoomId = post?.room_id || post?.user?.main_room_id;
    if (!effectiveRoomId) {
      toast.error('No room associated with this post');
      return;
    }
    
    try {
      if (isFollowing) {
        await leaveRoom(effectiveRoomId);
        setIsFollowing(false);
        const response = await getFollowersCount(post.user_id);
        setFollowersCount(response.data.followers_count || 0);
        toast.success(`Unfollowed @${post.user?.username}`);
      } else {
        await joinRoom(effectiveRoomId);
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

    if (post.is_paid && !post.has_access && !post.is_owner) {
      toast.error('Purchase this post to download it');
      return;
    }
    if (!post.is_paid && !post.allow_downloads) {
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
      link.download = filename || `LetsWatchOut_${post.description?.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_') || post.id}.mp4`;
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

  const handleCommentAttachmentSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isDoc = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (!isImage && !isDoc) { toast.error('Only images and DOCX files allowed'); return; }
    const maxMB = isDoc ? 10 : 5;
    if (file.size > maxMB * 1024 * 1024) { toast.error(`Max ${maxMB}MB`); return; }
    setCommentAttachment(file);
    if (isImage) {
      const reader = new FileReader();
      reader.onloadend = () => setCommentAttachPreview(reader.result);
      reader.readAsDataURL(file);
    } else {
      setCommentAttachPreview(null);
    }
    e.target.value = '';
  };

  const clearCommentAttachment = () => { setCommentAttachment(null); setCommentAttachPreview(null); };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if ((!newComment.trim() && !commentAttachment) || submittingComment || !post) return;

    setSubmittingComment(true);
    const postId = post.id || post.ID;
    try {
      let attachmentUrl = null;
      if (commentAttachment) {
        setUploadingAttachment(true);
        const fd = new FormData();
        fd.append('file', commentAttachment, commentAttachment.name);
        const res = await apiClient.post('/api/posts/comment-attachment', fd, {
          headers: { 'Content-Type': undefined },
        });
        attachmentUrl = res.data.url;
        setUploadingAttachment(false);
      }

      const body = { content: newComment.trim() || '📎' };
      if (replyingToId) body.parent_comment_id = replyingToId;
      if (attachmentUrl) body.attachment_url = attachmentUrl;

      const response = await apiClient.post(`/api/posts/${postId}/comments`, body);
      const newCommentData = response.data.comment;

      if (replyingToId) {
        setComments(prev => prev.map(c => {
          const cId = c.id || c.ID;
          if (cId === replyingToId) {
            return { ...c, replies: [...(c.replies || []), newCommentData] };
          }
          return c;
        }));
        setExpandedReplies(prev => new Set([...prev, replyingToId]));
        setReplyingToId(null);
        setReplyingToUsername('');
      } else {
        setComments(prev => [newCommentData, ...prev]);
        setCommentsCount(prev => prev + 1);
        if (onCommentAdded) onCommentAdded(postId);
      }
      setNewComment('');
      clearCommentAttachment();
    } catch (err) {
      setUploadingAttachment(false);
      console.error('Failed to add comment:', err);
      toast.error(err.response?.data?.error || 'Failed to add comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleReply = (comment) => {
    const id = comment.id || comment.ID;
    const username = comment.user?.username || comment.User?.username || 'user';
    setReplyingToId(id);
    setReplyingToUsername(username);
    setNewComment(`@${username} `);
    setTimeout(() => commentInputRef.current?.focus(), 50);
  };

  const cancelReply = () => {
    setReplyingToId(null);
    setReplyingToUsername('');
    setNewComment('');
  };

  const toggleReplies = (commentId) => {
    setExpandedReplies(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
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
        title: post.description?.slice(0, 80) || '',
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
    // console.log('🎬 [PostViewModal] Not rendering:', { isOpen, hasPost: !!post });
    return null;
  }

  console.log('🎬 [PostViewModal] Rendering:', {
    postId: post.id,
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

        {/* Download button — paid posts require purchase/ownership; free posts respect allow_downloads */}
        {post.media_type === 'video' && post.video_url && post.can_download && (
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="absolute top-4 right-16 z-50 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors disabled:opacity-50"
            title="Download"
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
          {post.post_type === 'text' ? (
            <div className="max-w-lg w-full mx-auto px-8 py-12">
              <p className="text-white text-xl font-medium text-left leading-relaxed whitespace-pre-wrap">
                {post.text_content}
              </p>
            </div>
          ) : post.media_type === 'video' ? (
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
              alt={post.description?.slice(0, 80) || 'Post'}
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
            <Avatar
              user={post.user}
              className="w-14 h-14 rounded-full ring-2 ring-blue-500 object-cover"
            />

            <div className="flex-1">
              {/* Primary: username */}
              <h3 className="font-semibold text-white text-lg">@{post.user?.username || 'Unknown'}</h3>
              
              {/* Followers count */}
              <p className="text-sm text-gray-300 mt-0.5">
                {formatCount(followersCount)} followers
              </p>
            </div>

            {/* Follow button - show if viewing another user's post and they have a room (explicit or main) */}
            {post.user_id !== currentUser?.id && (post.room_id || post.user?.main_room_id) ? (
              <>
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
              </>
            ) : null}
          </div>

          {/* Description */}
          {(post.description || (post.content_rating && post.content_rating !== 'G')) && (
            <div className="mb-4 flex items-start gap-2 flex-wrap">
              {post.content_rating && post.content_rating !== 'G' && (
                <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded text-xs font-bold ${
                  post.content_rating === '18+' || post.content_rating === 'Mature'
                    ? 'bg-red-600 text-white'
                    : post.content_rating === '16+' || post.content_rating === '13+'
                    ? 'bg-orange-500 text-white'
                    : post.content_rating === 'Educational' || post.content_rating === 'Religious'
                    ? 'bg-teal-600 text-white'
                    : 'bg-blue-600 text-white'
                }`}>
                  {post.content_rating}
                </span>
              )}
              {post.description && (
                <p className="text-sm text-gray-300 line-clamp-2">{post.description}</p>
              )}
            </div>
          )}

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
            
            {post.user_id !== currentUser?.id && (
              <button
                onClick={handleTip}
                disabled={tipping}
                className="flex items-center gap-2 group transition-all"
                title="Tip 1 token"
              >
                <span className={`text-2xl transition-transform ${tipping ? 'scale-75 opacity-50' : 'group-hover:scale-110'}`}>
                  🪙
                </span>
                <span className="text-white font-medium">{formatCount(tipCount)}</span>
              </button>
            )}

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
                comments.map((comment) => {
                  const commentId = comment.id || comment.ID;
                  const username = comment.user?.username || comment.User?.username || 'Unknown';
                  const avatar = username.charAt(0).toUpperCase();
                  const createdAt = comment.created_at || comment.CreatedAt;
                  const replies = comment.replies || [];
                  const replyCount = replies.length;
                  const isExpanded = expandedReplies.has(commentId);
                  const COLLAPSE_AT = 3;
                  const visibleReplies = isExpanded || replyCount <= COLLAPSE_AT ? replies : replies.slice(0, 2);
                  const hiddenCount = replyCount - 2;

                  return (
                    <div key={commentId} className="space-y-2">
                      {/* Top-level comment */}
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          {comment.content && comment.content !== '📎' && (
                            <p className="text-sm text-gray-300 break-words">{comment.content}</p>
                          )}
                          {comment.attachment_url && (
                            comment.attachment_url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i) ? (
                              <img src={comment.attachment_url} alt="attachment" className="mt-1.5 max-w-[200px] rounded-lg cursor-pointer" onClick={() => window.open(comment.attachment_url, '_blank')} />
                            ) : (
                              <a href={comment.attachment_url} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 text-blue-400 text-xs hover:underline"><Paperclip className="w-3 h-3" /> Document</a>
                            )
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[11px] text-gray-500">{formatCommentTime(createdAt)}</span>
                            <button onClick={() => handleReply(comment)} className="text-[11px] text-gray-500 hover:text-blue-400 transition-colors flex items-center gap-0.5">
                              <ReplyIcon className="w-3 h-3" /> Reply
                            </button>
                          </div>
                        </div>
                        {/* 3-dot menu */}
                        {currentUser && (currentUser.id === (comment.user?.id || comment.User?.id) || currentUser.role === 'super_admin') && (
                          <div className="relative flex-shrink-0">
                            <button
                              onClick={() => setOpenCommentMenu(openCommentMenu === commentId ? null : commentId)}
                              className="p-1 rounded-full hover:bg-gray-700 text-gray-500 hover:text-white transition-colors"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {openCommentMenu === commentId && (
                              <div className="absolute right-0 top-6 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-20 py-1 min-w-[100px]">
                                <button
                                  onClick={() => { handleDeleteComment(commentId); setOpenCommentMenu(null); }}
                                  disabled={deletingCommentId === commentId}
                                  className="w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Replies */}
                      {replyCount > 0 && (
                        <div className="ml-11 space-y-2 border-l-2 border-gray-700 pl-3">
                          {visibleReplies.map(reply => {
                            const replyUsername = reply.user?.username || reply.User?.username || 'Unknown';
                            const replyCreatedAt = reply.created_at || reply.CreatedAt;
                            return (
                              <div key={reply.id || reply.ID} className="flex gap-2">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                  {replyUsername.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="font-semibold text-xs">{replyUsername}</span>
                                    <span className="text-[10px] text-gray-500">{formatCommentTime(replyCreatedAt)}</span>
                                  </div>
                                  {reply.content && reply.content !== '📎' && (
                                    <p className="text-xs text-gray-300 break-words">{reply.content}</p>
                                  )}
                                  {reply.attachment_url && (
                                    reply.attachment_url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i) ? (
                                      <img src={reply.attachment_url} alt="attachment" className="mt-1 max-w-[160px] rounded-lg cursor-pointer" onClick={() => window.open(reply.attachment_url, '_blank')} />
                                    ) : (
                                      <a href={reply.attachment_url} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 text-blue-400 text-xs hover:underline"><Paperclip className="w-3 h-3" /> Document</a>
                                    )
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {replyCount > COLLAPSE_AT && (
                            <button
                              onClick={() => toggleReplies(commentId)}
                              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                            >
                              {isExpanded ? (
                                <><ChevronUp className="w-3 h-3" /> Hide replies</>
                              ) : (
                                <><ChevronDown className="w-3 h-3" /> View {hiddenCount} more {hiddenCount === 1 ? 'reply' : 'replies'}</>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Comment input */}
            <form onSubmit={handleCommentSubmit} className="p-4 border-t border-gray-800">
              {replyingToId && (
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs text-blue-400 flex items-center gap-1">
                    <CornerDownLeft className="w-3 h-3" />
                    Replying to <span className="font-semibold">@{replyingToUsername}</span>
                  </span>
                  <button type="button" onClick={cancelReply} className="text-xs text-gray-500 hover:text-white transition-colors">
                    Cancel
                  </button>
                </div>
              )}
              {/* Attachment preview */}
              {(commentAttachment || commentAttachPreview) && (
                <div className="relative mb-2 inline-flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
                  {commentAttachPreview
                    ? <img src={commentAttachPreview} alt="attach" className="h-12 rounded" />
                    : <Paperclip className="w-4 h-4 text-gray-400" />
                  }
                  {!commentAttachPreview && commentAttachment && (
                    <span className="text-xs text-gray-400 max-w-[120px] truncate">{commentAttachment.name}</span>
                  )}
                  <button type="button" onClick={clearCommentAttachment} className="ml-1 text-gray-500 hover:text-red-400">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className="flex gap-2 items-center">
                <input
                  type="file"
                  ref={commentAttachRef}
                  className="hidden"
                  accept="image/*,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleCommentAttachmentSelect}
                />
                <button
                  type="button"
                  onClick={() => commentAttachRef.current?.click()}
                  className="p-1.5 rounded-full hover:bg-gray-700 text-gray-400 hover:text-white transition-colors flex-shrink-0"
                  title="Attach image or document"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <input
                  ref={commentInputRef}
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={replyingToId ? `Reply to @${replyingToUsername}…` : 'Add a comment…'}
                  className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-full text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  disabled={submittingComment || uploadingAttachment}
                />
                <button
                  type="submit"
                  disabled={(!newComment.trim() && !commentAttachment) || submittingComment || uploadingAttachment}
                  className="p-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-full transition-colors flex-shrink-0"
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
