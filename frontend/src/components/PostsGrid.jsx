// WeWatch/frontend/src/components/PostsGrid.jsx
// Instagram-style grid for displaying user/room posts
import React, { useState, useEffect, useRef } from 'react';
import { Play, Eye, Heart } from 'lucide-react';
import apiClient from '../services/api';
import { formatCount } from '../utils/formatCount';

const PostsGrid = ({ userId, roomId, onPostClick }) => {
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

      let endpoint = '';
      if (userId) {
        endpoint = `/api/users/${userId}/posts?page=${pageNum}&limit=12`;
      } else if (roomId) {
        endpoint = `/api/rooms/${roomId}/posts?page=${pageNum}&limit=12`;
      } else {
        throw new Error('Either userId or roomId must be provided');
      }

      const response = await apiClient.get(endpoint);
      const newPosts = response.data.posts || [];
      
      if (append) {
        setPosts(prev => [...prev, ...newPosts]);
      } else {
        setPosts(newPosts);
      }
      
      setHasMore(newPosts.length === 12); // If we got a full page, there might be more
      setError(null);
    } catch (err) {
      console.error('❌ [PostsGrid] Failed to fetch posts:', err);
      setError(err.response?.data?.error || 'Failed to load posts');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Initial load
  useEffect(() => {
    setPage(1);
    fetchPosts(1, false);
  }, [userId, roomId]);

  // Infinite scroll observer
  useEffect(() => {
    if (!hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchPosts(nextPage, filter, true);
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
      if (post.thumbnail_url.startsWith('http')) {
        return post.thumbnail_url;
      }
      return `${import.meta.env.VITE_API_BASE_URL}/${post.thumbnail_url}`;
    }
    
    if (post.media_type === 'image' && post.video_url) {
      if (post.video_url.startsWith('http')) {
        return post.video_url;
      }
      return `${import.meta.env.VITE_API_BASE_URL}/${post.video_url}`;
    }
    
    return '/icons/video-placeholder.svg';
  };

  // Filter buttons removed - showing all posts

  // Loading skeleton
  if (loading && posts.length === 0) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-1 sm:gap-2">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="aspect-square bg-gray-200 dark:bg-gray-700 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error && posts.length === 0) {
    return (
      <div className="space-y-4">
        <div className="text-center py-12">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <button
            onClick={() => fetchPosts(1, false)}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (!loading && posts.length === 0) {
    return (
      <div className="space-y-4">
        <div className="text-center py-12">
          <div className="mb-4">
            <svg className="w-20 h-20 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-xl text-gray-700 dark:text-gray-300 mb-2">No posts yet</p>
          <p className="text-gray-600 dark:text-gray-400">
            Posts will appear here once created.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Posts grid (Instagram style - 3 columns, square tiles) */}
      <div className="grid grid-cols-3 gap-1 sm:gap-2">
        {posts.map((post) => (
          <div
            key={post.ID}
            onClick={() => onPostClick && onPostClick(post)}
            className="relative aspect-square bg-gray-200 dark:bg-gray-800 cursor-pointer group overflow-hidden"
          >
            {/* Thumbnail */}
            <img
              src={getThumbnailUrl(post)}
              alt={post.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
              loading="lazy"
            />
            
            {/* Video indicator (top-left) */}
            {post.media_type === 'video' && (
              <div className="absolute top-2 right-2">
                <Play className="w-5 h-5 text-white drop-shadow-lg" fill="white" />
              </div>
            )}
            
            {/* Hover overlay with stats */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
              <div className="flex gap-4 text-white">
                <div className="flex items-center gap-1">
                  <Heart className="w-5 h-5" fill="white" />
                  <span className="text-sm font-semibold">{formatCount(post.likes_count || 0)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Eye className="w-5 h-5" />
                  <span className="text-sm font-semibold">{formatCount(post.view_count || 0)}</span>
                </div>
              </div>
            </div>
            
            {/* Paid badge (bottom-left) */}
            {post.is_paid && (
              <div className="absolute bottom-2 left-2 bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded">
                PAID
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Infinite scroll trigger */}
      <div ref={loadMoreTriggerRef} className="h-1 mt-4" />

      {/* Loading more indicator */}
      {loadingMore && (
        <div className="text-center py-4">
          <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto" />
        </div>
      )}

      {/* End of content */}
      {!hasMore && posts.length > 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p className="text-sm">All posts loaded</p>
        </div>
      )}
    </div>
  );
};

export default PostsGrid;
