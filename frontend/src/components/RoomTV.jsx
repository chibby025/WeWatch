// WeWatch/frontend/src/components/RoomTV.jsx
// Dynamic content banner - shows sessions, events, announcements, and (future) ads
import React, { useState, useEffect, useRef } from 'react';
import { PlayIcon, ClockIcon, XMarkIcon, UsersIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Coachmark from './Coachmark';

// CSS Animations for RoomTV text
const animations = `
  @keyframes scrollLeft {
    0% { transform: translateX(100%); }
    100% { transform: translateX(-100%); }
  }
  @keyframes scrollLeftSlow {
    0% { transform: translateX(100%); }
    100% { transform: translateX(-100%); }
  }
  @keyframes scrollLeftFast {
    0% { transform: translateX(100%); }
    100% { transform: translateX(-100%); }
  }
  @keyframes fadePulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.05); }
  }
  @keyframes fadePulseSlow {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.05); }
  }
  @keyframes fadePulseFast {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.05); }
  }
  @keyframes slideUp {
    0% { transform: translateY(100%); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
  }
  @keyframes slideUpSlow {
    0% { transform: translateY(100%); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
  }
  @keyframes slideUpFast {
    0% { transform: translateY(100%); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
  }
  @keyframes bounceIn {
    0% { transform: scale(0.3); opacity: 0; }
    50% { transform: scale(1.1); }
    70% { transform: scale(0.9); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes bounceInSlow {
    0% { transform: scale(0.3); opacity: 0; }
    50% { transform: scale(1.1); }
    70% { transform: scale(0.9); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes bounceInFast {
    0% { transform: scale(0.3); opacity: 0; }
    50% { transform: scale(1.1); }
    70% { transform: scale(0.9); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes zoomFlash {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.2); filter: brightness(1.3); }
  }
  @keyframes zoomFlashSlow {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.2); filter: brightness(1.3); }
  }
  @keyframes zoomFlashFast {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.2); filter: brightness(1.3); }
  }
  @keyframes typewriter {
    from { width: 0; }
    to { width: 100%; }
  }
  @keyframes marquee {
    0% { transform: translateX(0); }
    100% { transform: translateX(-100%); }
  }
  @keyframes typewriterSlow {
    from { width: 0; }
    to { width: 100%; }
  }
  @keyframes typewriterFast {
    from { width: 0; }
    to { width: 100%; }
  }

  /* Animation classes with speed variants */
  .animate-scroll-left { animation: scrollLeft 10s linear infinite; }
  .animate-scroll-left-slow { animation: scrollLeftSlow 15s linear infinite; }
  .animate-scroll-left-medium { animation: scrollLeft 10s linear infinite; }
  .animate-scroll-left-fast { animation: scrollLeftFast 5s linear infinite; }

  .animate-fade-pulse { animation: fadePulse 1.4s ease-in-out infinite; }
  .animate-fade-pulse-slow { animation: fadePulseSlow 2s ease-in-out infinite; }
  .animate-fade-pulse-medium { animation: fadePulse 1.4s ease-in-out infinite; }
  .animate-fade-pulse-fast { animation: fadePulseFast 0.7s ease-in-out infinite; }

  .animate-slide-up { animation: slideUp 0.5s ease-out forwards; }
  .animate-slide-up-slow { animation: slideUpSlow 0.8s ease-out forwards; }
  .animate-slide-up-medium { animation: slideUp 0.5s ease-out forwards; }
  .animate-slide-up-fast { animation: slideUpFast 0.25s ease-out forwards; }

  .animate-bounce-in { animation: bounceIn 0.7s ease-out forwards; }
  .animate-bounce-in-slow { animation: bounceInSlow 1s ease-out forwards; }
  .animate-bounce-in-medium { animation: bounceIn 0.7s ease-out forwards; }
  .animate-bounce-in-fast { animation: bounceInFast 0.35s ease-out forwards; }

  .animate-zoom-flash { animation: zoomFlash 1s ease-in-out infinite; }
  .animate-zoom-flash-slow { animation: zoomFlashSlow 1.5s ease-in-out infinite; }
  .animate-zoom-flash-medium { animation: zoomFlash 1s ease-in-out infinite; }
  .animate-zoom-flash-fast { animation: zoomFlashFast 0.5s ease-in-out infinite; }
  
  .animate-typewriter { 
    overflow: hidden;
    white-space: nowrap;
    animation: typewriter 4s steps(40, end) forwards;
  }
  .animate-typewriter-slow { 
    overflow: hidden;
    white-space: nowrap;
    animation: typewriterSlow 8s steps(40, end) forwards;
  }
  .animate-typewriter-medium { 
    overflow: hidden;
    white-space: nowrap;
    animation: typewriter 4s steps(40, end) forwards;
  }
  .animate-typewriter-fast { 
    overflow: hidden;
    white-space: nowrap;
    animation: typewriterFast 2s steps(40, end) forwards;
  }
`;

const RoomTV = ({
  roomId,
  activeSession,
  upcomingEvents = [],
  hostContent = null,
  onJoinSession,
  onEndSession,
  isHost = false,
  isSuperAdmin = false,
  onCreateContent,
  onDismissContent,
  refetchTrigger = 0 // Add this to allow parent to trigger refetch
}) => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [content, setContent] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedVideoUrl, setExpandedVideoUrl] = useState(null);
  const [expandedImageUrl, setExpandedImageUrl] = useState(null);
  const [roomPosts, setRoomPosts] = useState([]);
  const [currentPostIndex, setCurrentPostIndex] = useState(0);
  const [adContent, setAdContent] = useState(null);
  const [adDismissed, setAdDismissed] = useState(false);
  const adTimeoutRef = useRef(null);
  const postRotationRef = useRef(null);
  const postDismissRef = useRef(null);

  // One-time "Join" coach-mark — fires the first time a user lands on a room
  // page (or is already there when a session starts) and sees a live session
  // in the RoomTV strip. Ref-guarded so it only ever arms once per mount even
  // if `content` churns through other types (ads, host content) and back;
  // localStorage makes it a true one-time-ever tour across visits.
  const [showJoinTour, setShowJoinTour] = useState(false);
  const joinTourTriggeredRef = useRef(false);
  const joinButtonRef = useRef(null);

  // Helper: Get random gradient for jumbotron
  const getRandomGradient = () => {
    const gradients = [
      'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
      'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
      'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
      'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
      'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)',
    ];
    return gradients[Math.floor(Math.random() * gradients.length)];
  };

  // Helper: Get animation class based on type and speed
  const getAnimationClass = (animationType, speed = 'medium') => {
    if (!animationType) return '';
    const baseClass = `animate-${animationType}`;
    return speed === 'medium' ? baseClass : `${baseClass}-${speed}`;
  };

  // Fetch room posts (host posts to this room)
  useEffect(() => {
    if (roomId) {
      console.log('🔄 [RoomTV] Refetch triggered - fetching room posts (trigger:', refetchTrigger, ')');
      fetchRoomPosts();
    }
  }, [roomId, refetchTrigger]);

  const fetchRoomPosts = async () => {
    try {
      console.log('📡 [RoomTV] Fetching room posts for room', roomId);
      const response = await apiClient.get(`/api/rooms/${roomId}/posts?limit=5`);
      console.log('📬 [RoomTV] Received posts response:', {
        count: response.data.posts?.length || 0,
        posts: response.data.posts?.map(p => ({ id: p.id, title: p.title, created_at: p.created_at }))
      });
      
      if (response.data.posts && response.data.posts.length > 0) {
        // Filter posts: only show posts created within last 5 minutes
        const now = new Date();
        const recentPosts = response.data.posts.filter(post => {
          const postCreatedAt = new Date(post.created_at);
          const ageInMinutes = (now - postCreatedAt) / (1000 * 60);
          return ageInMinutes <= 5; // Only show posts less than 5 minutes old
        });
        
        console.log('⏱️ [RoomTV] After age filter (< 5 min):', recentPosts.length, 'posts remain');
        
        if (recentPosts.length > 0) {
          console.log('✅ [RoomTV] Setting room posts:', recentPosts.map(p => p.title));
          setRoomPosts(recentPosts);
          setCurrentPostIndex(0);
        } else {
          console.log('⚠️ [RoomTV] No recent posts found (all older than 5 minutes)');
          setRoomPosts([]);
        }
      } else {
        console.log('ℹ️ [RoomTV] No posts found for room');
        setRoomPosts([]);
      }
    } catch (error) {
      console.error('Failed to fetch room posts:', error);
      setRoomPosts([]);
    }
  };

  // Track ad impression or click
  const trackAdEvent = async (campaignId, clicked = false) => {
    try {
      await apiClient.post(`/api/ads/campaigns/${campaignId}/track`, {
        clicked,
        user_id: currentUser?.id
      });
      console.log(`✅ [RoomTV Ad] Tracked ${clicked ? 'click' : 'impression'} for campaign ${campaignId}`);
    } catch (error) {
      console.error('❌ [RoomTV Ad] Failed to track:', error);
    }
  };

  // Fetch RoomTV ad (when idle)
  const fetchRoomTVAd = async () => {
    if (!roomId || !currentUser) {
      console.log('🚫 [RoomTV Ad] Cannot fetch: missing roomId or currentUser');
      return null;
    }
    
    try {
      console.log('🎯 [RoomTV Ad] Fetching ad for room', roomId, 'user', currentUser.id);
      const response = await apiClient.get('/api/ads/roomtv', {
        params: { room_id: roomId, user_id: currentUser.id }
      });
      console.log('📥 [RoomTV Ad] Response:', response.data);
      
      // Backend returns { ad: {...}, message: "..." }
      if (response.data && response.data.ad) {
        console.log('✅ [RoomTV Ad] Ad found:', response.data.ad);
        const ad = response.data.ad;
        
        // Track impression immediately
        if (ad.id) {
          trackAdEvent(ad.id, false);
        }
        
        return ad;
      } else {
        console.log('⚠️ [RoomTV Ad] No ad in response:', response.data);
        return null;
      }
    } catch (error) {
      // Silently fail - ads are optional
      console.log('❌ [RoomTV Ad] Error fetching:', error.response?.data?.message || error.message);
      return null;
    }
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
      if (postRotationRef.current) clearInterval(postRotationRef.current);
      if (postDismissRef.current) clearTimeout(postDismissRef.current);
    };
  }, []);

  // Priority logic: Session > Host Content > Upcoming Event > Room Posts > Ad
  useEffect(() => {
    console.log('🔍 [RoomTV] useEffect triggered, activeSession:', activeSession);
    
    const determineContent = async () => {
      // Priority 1: Active Watch Session
      if (activeSession) {
        console.log('✅ [RoomTV] Active session detected:', {
          sessionId: activeSession.session_id,
          watchType: activeSession.watch_type,
          members: activeSession.members,
          startedAt: activeSession.started_at
        });
        
        // Clear post rotation and ad timers
        if (postRotationRef.current) clearInterval(postRotationRef.current);
        if (postDismissRef.current) clearTimeout(postDismissRef.current);
        if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
        
        return {
          type: 'session',
          data: activeSession,
          duration: null // Stays until session ends
        };
      } else {
        console.log('ℹ️ [RoomTV] No active session (activeSession is null/undefined)');
      }

      // Priority 2: Host Content (announcement/media)
      if (hostContent && hostContent.ends_at && new Date(hostContent.ends_at) > new Date()) {
        // Clear post rotation and ad timers
        if (postRotationRef.current) clearInterval(postRotationRef.current);
        if (postDismissRef.current) clearTimeout(postDismissRef.current);
        if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
        
        return {
          type: 'host_content',
          data: hostContent,
          duration: Math.floor((new Date(hostContent.ends_at) - new Date()) / 1000)
        };
      }

      // Priority 3: Upcoming Event (within 1 hour)
      const upcomingEvent = upcomingEvents.find(event => {
        const eventTime = new Date(event.scheduled_for);
        const now = new Date();
        const hourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
        return eventTime > now && eventTime < hourFromNow;
      });

      if (upcomingEvent) {
        // Clear post rotation and ad timers
        if (postRotationRef.current) clearInterval(postRotationRef.current);
        if (postDismissRef.current) clearTimeout(postDismissRef.current);
        if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
        
        return {
          type: 'event',
          data: upcomingEvent,
          duration: 300 // Show for 5 minutes, then auto-hide
        };
      }

      // Priority 4: Room Posts (host posts to this room)
      if (roomPosts.length > 0) {
        // Only set up timers if they don't already exist (prevents resetting on rotation)
        if (!postRotationRef.current) {
          // Rotate posts every 10 seconds
          postRotationRef.current = setInterval(() => {
            setCurrentPostIndex(prev => (prev + 1) % roomPosts.length);
          }, 10000);
        }
        
        if (!postDismissRef.current) {
          // Auto-dismiss all posts after 2 minutes
          postDismissRef.current = setTimeout(() => {
            if (postRotationRef.current) {
              clearInterval(postRotationRef.current);
              postRotationRef.current = null;
            }
            setRoomPosts([]); // Clear posts array
            setIsExpanded(false);
            setTimeout(() => setContent(null), 300);
          }, 120000); // 2 minutes
        }
        
        // Clear ad timeout if it exists
        if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
        
        return {
          type: 'room_posts',
          data: roomPosts[currentPostIndex],
          duration: 120 // 2 minutes total
        };
      }

      // Priority 5: Ads (when idle and not dismissed)
      if (!adDismissed) {
        const ad = await fetchRoomTVAd();
        
        // Only display ads with valid titles
        if (ad && ad.title && ad.title.trim() !== '') {
          // Clear any existing ad timeout
          if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
          
          // Auto-dismiss after ad duration
          const adDuration = ad.duration || 15; // Default 15s
          adTimeoutRef.current = setTimeout(() => {
            setAdDismissed(true);
            setIsExpanded(false);
            setTimeout(() => setContent(null), 300);
          }, adDuration * 1000);
          
          return {
            type: 'ad',
            data: ad,
            duration: adDuration
          };
        }
      }

      return null;
    };

    determineContent().then(newContent => {
      console.log('📺 [RoomTV] Content determined:', newContent ? `type: ${newContent.type}` : 'null');
      setContent(newContent);
      setIsExpanded(!!newContent);
    });

  }, [activeSession, hostContent, upcomingEvents, roomPosts, adDismissed]); // Removed currentPostIndex to prevent timer resets

  // Arm the one-time Join tour the moment a live session actually shows up here.
  useEffect(() => {
    if (content?.type !== 'session') return;
    if (joinTourTriggeredRef.current) return;
    if (localStorage.getItem('wewatch_roomtv_join_tour_seen')) return;
    joinTourTriggeredRef.current = true;
    const t = setTimeout(() => setShowJoinTour(true), 700);
    return () => clearTimeout(t);
  }, [content]);

  // Render nothing if no content
  if (!content) return null;

  return (
    <>
      <style>{animations}</style>

      {/* ── Single-line inline strip ── */}
      <div
        className={`flex items-center gap-2 px-2 sm:px-3 h-10 border-t overflow-hidden ${
          content?.type === 'session' ? 'border-blue-800/60' : 'border-gray-700/60'
        }`}
        style={
          content?.type === 'session'
            ? { background: 'linear-gradient(to right, #0f172a, #3b1d6e, #0f172a)' }
            : content?.type === 'host_content' && content.data?.bg_gradient
              ? { background: content.data.bg_gradient }
              : { background: 'rgba(31,41,55,0.85)' }
        }
      >
      <div className="flex items-center gap-2 w-full min-w-0">
        {/* Session */}
        {content.type === 'session' && (
          <>
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
            <span className="text-white text-xs font-semibold whitespace-nowrap">Live</span>
            <span className="text-gray-400 text-xs whitespace-nowrap hidden sm:inline">
              {content.data.watch_type === '3d_cinema' ? '3D Cinema' :
               content.data.watch_type === 'classroom' ? 'Lecture Hall' : 'Video Watch'}
            </span>
            <span className="text-gray-400 text-xs flex items-center gap-0.5 whitespace-nowrap">
              <UsersIcon className="w-3 h-3 flex-shrink-0" />{content.data.members?.length || 0}
            </span>
            <div className="flex-1" />
            <button ref={joinButtonRef} onClick={onJoinSession}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-md font-medium flex-shrink-0 transition-colors">
              Join{content.data.ticketing_enabled ? ' 🪙' : ''}
            </button>
            {(isHost || isSuperAdmin) && onEndSession && (
              <button
                onClick={() => window.confirm('End this watch session for everyone?') && onEndSession()}
                className="px-2.5 py-1 bg-red-700 hover:bg-red-600 text-white text-xs rounded-md font-medium flex-shrink-0 transition-colors">
                End
              </button>
            )}
          </>
        )}

        {/* Host content */}
        {content.type === 'host_content' && (
          <>
            {content.data.is_uploaded && content.data.content_url ? (
              <button onClick={() => setExpandedVideoUrl(content.data.content_url)}
                className="w-8 h-8 flex-shrink-0 relative rounded overflow-hidden">
                <video src={content.data.content_url} className="w-full h-full object-cover" muted />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <PlayIcon className="w-3 h-3 text-white" />
                </div>
              </button>
            ) : content.data.thumbnail_url ? (
              <button onClick={() => setExpandedImageUrl(content.data.thumbnail_url)}
                className="w-8 h-8 flex-shrink-0 rounded overflow-hidden">
                <img src={content.data.thumbnail_url} className="w-full h-full object-cover" alt="" />
              </button>
            ) : (
              <span className="text-sm flex-shrink-0">📢</span>
            )}
            <span className={`text-white text-xs font-semibold truncate flex-shrink min-w-0 ${getAnimationClass(content.data.animation_type, content.data.animation_speed)}`}
              style={{ color: content.data.text_color || undefined }}>
              {content.data.title || 'Announcement'}
            </span>
            {content.data.description && (
              <span className="text-gray-400 text-xs truncate flex-shrink min-w-0 hidden sm:block"
                style={{ color: content.data.text_color ? `${content.data.text_color}99` : undefined }}>
                · {content.data.description}
              </span>
            )}
            <div className="flex-1" />
            {content.data.content_url && !content.data.is_uploaded && (
              <a href={content.data.content_url} target="_blank" rel="noopener noreferrer"
                className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-md flex-shrink-0 transition-colors">
                View →
              </a>
            )}
            {isHost && (
              <button onClick={() => onDismissContent?.(content.data.id)}
                className="p-1 mr-1 text-gray-400 hover:text-white flex-shrink-0 transition-colors">
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </>
        )}

        {/* Upcoming event */}
        {content.type === 'event' && (
          <>
            <span className="text-sm flex-shrink-0">🔔</span>
            <span className="text-white text-xs font-semibold truncate min-w-0 flex-shrink">
              {content.data.title || 'Upcoming Event'}
            </span>
            <span className="text-gray-400 text-xs whitespace-nowrap flex-shrink-0">
              · {getCountdown(content.data.scheduled_for)}
            </span>
          </>
        )}

        {/* Room posts */}
        {content.type === 'room_posts' && content.data && (
          <button className="flex items-center gap-2 min-w-0 flex-1 text-left"
            onClick={() => navigate('/lobby', { state: { openPost: content.data.id, autoPlay: true } })}>
            <span className="text-sm flex-shrink-0">🎬</span>
            <span className="text-white text-xs font-semibold truncate animate-fade-pulse">
              New post: {content.data.title || content.data.description}
            </span>
          </button>
        )}

        {/* Ad */}
        {content.type === 'ad' && content.data && (
          <>
            <span className="text-[9px] bg-gray-600 text-gray-300 px-1.5 py-0.5 rounded flex-shrink-0 font-medium">AD</span>
            <a href={content.data.click_url} target="_blank" rel="noopener noreferrer"
              className="text-white text-xs font-semibold truncate hover:underline animate-fade-pulse"
              onClick={() => content.data.id && trackAdEvent(content.data.id, true)}>
              {content.data.title}
            </a>
          </>
        )}
      </div>
    </div>

    {/* Fullscreen image lightbox */}
    {expandedImageUrl && (
      <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center"
        onClick={() => setExpandedImageUrl(null)}>
        <button onClick={() => setExpandedImageUrl(null)}
          className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10">
          <XMarkIcon className="w-8 h-8" />
        </button>
        <img src={expandedImageUrl} alt="" className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl"
          onClick={e => e.stopPropagation()} />
      </div>
    )}

    {/* Fullscreen video modal */}
    {expandedVideoUrl && (
      <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center"
        onClick={() => setExpandedVideoUrl(null)}>
        <button onClick={() => setExpandedVideoUrl(null)}
          className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10">
          <XMarkIcon className="w-8 h-8" />
        </button>
        <video src={expandedVideoUrl} controls autoPlay className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl"
          onClick={e => e.stopPropagation()} />
      </div>
    )}

    {/* One-time coach-mark pointing at the Join button — only when a live session is showing */}
    {showJoinTour && (
      <Coachmark
        steps={[{
          ref: joinButtonRef,
          title: 'Live Session',
          description: 'This room has a session playing right now — tap Join to hop in and watch together.',
        }]}
        onComplete={() => {
          setShowJoinTour(false);
          localStorage.setItem('wewatch_roomtv_join_tour_seen', '1');
        }}
      />
    )}
    </>
  );
};

// Helper: Calculate countdown
const getCountdown = (targetTime) => {
  const now = new Date();
  const target = new Date(targetTime);
  const diff = Math.max(0, target - now);
  
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

export default RoomTV;
