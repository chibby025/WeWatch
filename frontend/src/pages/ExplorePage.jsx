import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPublicLiveSessions, getPublicFeedPosts, API_BASE_URL } from '../services/api';
import AuthPromptModal from '../components/AuthPromptModal';

const ROOM_TYPE_EMOJI = {
  cinema: '🎬',
  church: '⛪',
  classroom: '📚',
  podcast: '🎙️',
  news: '📰',
  sports: '⚽',
  music: '🎵',
  gaming: '🎮',
};

function SessionCard({ session, onInteract }) {
  const emoji = ROOM_TYPE_EMOJI[session.room_type?.toLowerCase()] || '🎥';
  return (
    <button
      onClick={onInteract}
      className="w-full text-left bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-4 transition-all group"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-purple-900/60 flex items-center justify-center text-xl flex-shrink-0">
          {emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              LIVE
            </span>
            <span className="text-xs text-gray-500 capitalize">{session.room_type}</span>
          </div>
          <p className="font-semibold text-white text-sm truncate group-hover:text-purple-300 transition-colors">
            {session.room_name}
          </p>
          {session.session_title && (
            <p className="text-xs text-gray-400 truncate mt-0.5">{session.session_title}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            {session.host_username && <span>@{session.host_username}</span>}
            <span>{session.watching_count} watching</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function PostCard({ post, onInteract }) {
  const getAsset = (url) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const isVideo = post.media_type === 'video';
  const isText = post.post_type === 'text';

  return (
    <div
      className="bg-white/5 border border-white/10 rounded-xl overflow-hidden"
    >
      {/* Media */}
      {!isText && post.media_url && (
        <div className="relative aspect-video bg-black cursor-pointer" onClick={onInteract}>
          {isVideo ? (
            <div className="w-full h-full flex items-center justify-center bg-gray-900">
              {post.thumbnail_url ? (
                <img
                  src={getAsset(post.thumbnail_url)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                  <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                  <svg className="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            </div>
          ) : (
            <img
              src={getAsset(post.media_url)}
              alt=""
              className="w-full h-full object-cover"
            />
          )}
        </div>
      )}

      {/* Text post */}
      {isText && (
        <div
          className="min-h-[100px] bg-gradient-to-br from-purple-900/40 to-blue-900/40 p-4 flex items-center cursor-pointer"
          onClick={onInteract}
        >
          <p className="text-white/90 text-sm leading-relaxed line-clamp-4">
            {post.text_content || post.description}
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-full bg-purple-700 flex items-center justify-center text-xs font-bold text-white">
            {post.username?.[0]?.toUpperCase() || '?'}
          </div>
          <span className="text-xs text-gray-400">@{post.username}</span>
        </div>
        {post.description && !isText && (
          <p className="text-sm text-white/80 line-clamp-2">{post.description}</p>
        )}
        <div className="flex items-center gap-4 mt-2">
          <button onClick={onInteract} className="flex items-center gap-1 text-xs text-gray-500 hover:text-purple-400 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            {post.likes_count ?? 0}
          </button>
          <button onClick={onInteract} className="flex items-center gap-1 text-xs text-gray-500 hover:text-purple-400 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {post.comments_count ?? 0}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ExplorePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('live');
  const [sessions, setSessions] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    getPublicLiveSessions()
      .then(data => setSessions(data.sessions || []))
      .catch(() => setSessions([]))
      .finally(() => setLoadingSessions(false));
  }, []);

  useEffect(() => {
    getPublicFeedPosts(1, 20)
      .then(data => setPosts(data.posts || []))
      .catch(() => setPosts([]))
      .finally(() => setLoadingPosts(false));
  }, []);

  const promptAuth = useCallback(() => setShowAuthModal(true), []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-950/90 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/icons/LetsWatchOut Logo.svg" alt="LetsWatchOut" className="h-7 w-auto" />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/login')}
            className="px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            Sign in
          </button>
          <button
            onClick={() => navigate('/register')}
            className="px-4 py-1.5 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-full transition-all"
          >
            Join free
          </button>
        </div>
      </header>

      {/* Hero */}
      <div className="px-4 pt-8 pb-4 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
          Watch together, anywhere
        </h1>
        <p className="text-sm text-gray-400 max-w-xs mx-auto">
          Join live sessions, share posts, and connect with people watching right now.
        </p>
        <button
          onClick={() => navigate('/register')}
          className="mt-4 px-6 py-2.5 font-semibold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-full transition-all shadow-lg shadow-purple-900/40"
        >
          Get started — it's free
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 px-4 mt-2">
        <button
          onClick={() => setActiveTab('live')}
          className={`flex-1 py-2.5 text-base font-semibold transition-colors border-b-2 ${
            activeTab === 'live'
              ? 'border-purple-500 text-white'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          Watching Live
        </button>
        <button
          onClick={() => setActiveTab('feed')}
          className={`flex-1 py-2.5 text-base font-semibold transition-colors border-b-2 ${
            activeTab === 'feed'
              ? 'border-purple-500 text-white'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          Feed
        </button>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-4">
        {activeTab === 'live' && (
          <div>
            {loadingSessions ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-4xl mb-3">📡</p>
                <p className="font-medium">No live sessions right now</p>
                <p className="text-sm mt-1">Check back soon or create your own.</p>
                <button
                  onClick={() => navigate('/register')}
                  className="mt-4 px-5 py-2 text-sm font-semibold text-white bg-purple-700 hover:bg-purple-600 rounded-full transition-all"
                >
                  Start a session
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {sessions.map(s => (
                  <SessionCard key={s.room_id} session={s} onInteract={promptAuth} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'feed' && (
          <div>
            {loadingPosts ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : posts.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-4xl mb-3">🎬</p>
                <p className="font-medium">Nothing in the feed yet</p>
                <button
                  onClick={() => navigate('/register')}
                  className="mt-4 px-5 py-2 text-sm font-semibold text-white bg-purple-700 hover:bg-purple-600 rounded-full transition-all"
                >
                  Be the first to post
                </button>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-gray-800">
                {posts.map(p => (
                  <div key={p.id} className="py-3 first:pt-0">
                    <PostCard post={p} onInteract={promptAuth} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showAuthModal && <AuthPromptModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
}
