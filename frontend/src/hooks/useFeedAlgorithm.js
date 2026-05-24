// WeWatch/frontend/src/hooks/useFeedAlgorithm.js
// Brain center for the Discover feed.
// Manages For You feed, pagination state, search,
// and user content-preference signals sent to the backend.
import { useState, useCallback, useRef } from 'react';
import apiClient from '../services/api';

const PAGE_SIZE = 12;

export function useFeedAlgorithm() {
  // For You feed state
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);
  const pageRef = useRef(1);

  // Search query
  const [searchQuery, setSearchQuery] = useState('');

  // ── For You feed ──────────────────────────────────────────────────────────

  const fetchForYou = useCallback(async (pageNum = 1, append = false, search = '') => {
    try {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);

      const offset = (pageNum - 1) * PAGE_SIZE;
      const params = new URLSearchParams({ offset, limit: PAGE_SIZE });
      if (search) params.set('search', search);

      const response = await apiClient.get(`/api/posts?${params}`);
      const newPosts = response.data.posts || [];

      if (append) {
        setPosts(prev => [...prev, ...newPosts]);
      } else {
        setPosts(newPosts);
      }
      setHasMore(newPosts.length > 0);
      setError(null);
      pageRef.current = pageNum;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load posts');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const loadMoreForYou = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    fetchForYou(pageRef.current + 1, true, searchQuery);
  }, [hasMore, loadingMore, loading, fetchForYou, searchQuery]);

  const refreshForYou = useCallback((search = searchQuery) => {
    pageRef.current = 1;
    setHasMore(true);
    fetchForYou(1, false, search);
  }, [fetchForYou, searchQuery]);

  // ── Search ────────────────────────────────────────────────────────────────

  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    refreshForYou(query);
  }, [refreshForYou]);

  // ── Helpers to update a single post in state (like/tip/comment) ───────────

  const updatePost = useCallback((postId, updater) => {
    setPosts(prev => prev.map(p => p.id === postId ? updater(p) : p));
  }, []);

  const removePost = useCallback((postId) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
  }, []);

  return {
    posts,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore: loadMoreForYou,

    searchQuery,
    handleSearch,
    refreshForYou,
    fetchForYou,

    // Post mutation helpers
    updatePost,
    removePost,
  };
}
