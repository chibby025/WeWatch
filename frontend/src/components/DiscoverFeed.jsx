// WeWatch/frontend/src/components/DiscoverFeed.jsx
// Instagram/TikTok-style discover feed with infinite scroll grid
import React, { useState, useEffect, useRef } from 'react';
import { Eye, Heart, MessageCircle } from 'lucide-react';
import apiClient from '../services/api';
import { formatCount } from '../utils/formatCount';
import AdBanner from './AdBanner';

const DiscoverFeed = ({ onPostClick }) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const observerRef = useRef(null);
  const loadMoreTriggerRef = useRef(null);

  // Fetch posts from API
  const fetchPosts = async (pageNum = 1, append = false) => {
    try {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);

      const response = await apiClient.get(`/api/posts?page=${pageNum}&limit=12`);
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

  // Initial load
  useEffect(() => {
    fetchPosts(1, false);
  }, []);

  // Infinite scroll observer
  useEffect(() => {
    if (!hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          setPage(prev => prev + 1);
          fetchPosts(page + 1, true);
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
  }, [hasMore, loadingMore, page]);

  // Get thumbnail URL
  const getThumbnailUrl = (post) => {
    if (post.thumbnail_url) {
      // BunnyCDN or local storage URL
      if (post.thumbnail_url.startsWith('http')) {
        return post.thumbnail_url;
      }
      return `${import.meta.env.VITE_API_BASE_URL}/${post.thumbnail_url}`;
    }
    
    // For images without thumbnail, use the image itself
    if (post.media_type === 'image' && post.video_url) {
      if (post.video_url.startsWith('http')) {
        return post.video_url;
      }
      return `${import.meta.env.VITE_API_BASE_URL}/${post.video_url}`;
    }
    
    // Fallback placeholder
    return '/icons/video-placeholder.svg';
  };

  // Get media type icon
  const getMediaTypeIcon = (post) => {
    if (post.media_type === 'video') {
      return (
        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-full flex items-center gap-1">
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
          </svg>
          {post.duration && (
            <span className="text-white text-xs font-medium">
              {Math.floor(post.duration / 60)}:{String(Math.floor(post.duration % 60)).padStart(2, '0')}
            </span>
          )}
        </div>
      );
    }
    return null;
  };

  // Loading skeleton
  if (loading && posts.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-4 pb-8">
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
    <div className="px-4 pb-8">
      {/* Grid of posts with ad insertion */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {posts.map((post, index) => (
          <React.Fragment key={post.ID}>
            {/* Regular Post */}
            <div
              onClick={() => onPostClick && onPostClick(post)}
              className="group relative aspect-[3/4] bg-gray-200 dark:bg-gray-800 rounded-xl overflow-hidden cursor-pointer shadow-md hover:shadow-2xl transition-all duration-300 transform hover:scale-[1.02]"
            >
            {/* Thumbnail */}
            <img
              src={getThumbnailUrl(post)}
              alt={post.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            
            {/* Media type indicator */}
            {getMediaTypeIcon(post)}
            
            {/* Post info overlay (bottom) */}
            <div className="absolute bottom-0 left-0 right-0 p-4 text-white transform translate-y-full group-hover:translate-y-0 transition-transform duration-300">
              {/* Title */}
              <h3 className="font-semibold text-sm mb-2 line-clamp-2" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                {post.title}
              </h3>
              
              {/* Creator */}
              {post.User && (
                <p className="text-xs text-gray-300 mb-3" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                  @{post.User.username}
                </p>
              )}
              
              {/* Engagement stats */}
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  <span>{formatCount(post.view_count || 0)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Heart className="w-4 h-4" />
                  <span>{formatCount(post.likes_count || 0)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <MessageCircle className="w-4 h-4" />
                  <span>{formatCount(post.comments_count || 0)}</span>
                </div>
              </div>
            </div>
            
            {/* Paid content badge */}
            {post.is_paid && (
              <div className="absolute top-2 left-2 bg-yellow-500/90 backdrop-blur-sm px-2 py-1 rounded-full">
                <span className="text-xs font-bold text-black">₦{post.price}</span>
              </div>
            )}
          </div>

          {/* Ad Banner every 6 posts */}
          {(index + 1) % 6 === 0 && (
            <div className="aspect-[3/4] rounded-xl overflow-hidden">
              <AdBanner />
            </div>
          )}
        </React.Fragment>
        ))}
      </div>

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
    </div>
  );
};

export default DiscoverFeed;
