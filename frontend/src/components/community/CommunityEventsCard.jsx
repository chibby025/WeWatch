import React, { useState, useRef, useCallback } from 'react';
import ScheduledEventPreviewCard from './ScheduledEventPreviewCard';
import CommunityRequestCard from './CommunityRequestCard';
import MakeRequestSheet from './MakeRequestSheet';
import { PlusCircleIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

/**
 * CommunityEventsCard — fullscreen horizontal carousel of scheduled events and community requests.
 * Alternates: scheduled event → community request → scheduled event → community request ...
 * "Make a Request" button is pinned at the bottom.
 *
 * Props:
 *  - scheduledEvents: array from /api/community-events
 *  - requests: array from /api/community-events
 *  - currentUser: from auth context
 *  - apiBaseUrl: VITE_API_BASE_URL
 *  - onRSVP: (event) => void — triggers existing RSVP/ticket modal
 *  - onNewRequest: (request) => void — called when a new request is created
 */
const CommunityEventsCard = ({
  scheduledEvents = [],
  requests = [],
  currentUser,
  apiBaseUrl,
  onRSVP,
  onNewRequest,
}) => {
  // Build interleaved cards array: SE, CR, SE, CR, ...
  const cards = buildInterleavedCards(scheduledEvents, requests);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showRequestSheet, setShowRequestSheet] = useState(false);
  const [localRequests, setLocalRequests] = useState(requests);

  // Touch/drag swipe state
  const touchStartX = useRef(null);
  const isDragging = useRef(false);

  const goTo = useCallback((idx) => {
    setCurrentIndex(Math.max(0, Math.min(idx, cards.length - 1)));
  }, [cards.length]);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    isDragging.current = false;
  };

  const handleTouchMove = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 8) isDragging.current = true;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (!isDragging.current) return;
    if (dx < -40 && currentIndex < cards.length - 1) goTo(currentIndex + 1);
    else if (dx > 40 && currentIndex > 0) goTo(currentIndex - 1);
  };

  const handleRequestUpdate = (updated) => {
    setLocalRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
  };

  const handleNewRequest = (newReq) => {
    setLocalRequests(prev => [newReq, ...prev]);
    onNewRequest?.(newReq);
  };

  if (cards.length === 0) return null;

  const card = cards[currentIndex];

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Current card */}
      {card.type === 'event' ? (
        <ScheduledEventPreviewCard
          event={card.data}
          onRSVP={onRSVP}
          apiBaseUrl={apiBaseUrl}
        />
      ) : (
        <CommunityRequestCard
          request={localRequests.find(r => r.id === card.data.id) || card.data}
          currentUser={currentUser}
          onRequestUpdate={handleRequestUpdate}
        />
      )}

      {/* Top label */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-center pt-3 pointer-events-none">
        <div className="bg-black/50 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1">
          <span className="text-white/80 text-xs font-semibold tracking-wide">
            📅 Community Events · {currentIndex + 1}/{cards.length}
          </span>
        </div>
      </div>

      {/* Left/right nav arrows (desktop) */}
      {currentIndex > 0 && (
        <button
          onClick={() => goTo(currentIndex - 1)}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20
            bg-black/40 backdrop-blur-sm border border-white/20 rounded-full p-2
            text-white/80 hover:text-white transition-colors"
          aria-label="Previous"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
      )}
      {currentIndex < cards.length - 1 && (
        <button
          onClick={() => goTo(currentIndex + 1)}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-20
            bg-black/40 backdrop-blur-sm border border-white/20 rounded-full p-2
            text-white/80 hover:text-white transition-colors"
          aria-label="Next"
        >
          <ChevronRightIcon className="w-5 h-5" />
        </button>
      )}

      {/* Dot indicators */}
      <div className="absolute bottom-20 left-0 right-0 z-20 flex items-center justify-center gap-1.5 pointer-events-none">
        {cards.map((_, i) => (
          <div
            key={i}
            className={`rounded-full transition-all duration-200 ${
              i === currentIndex
                ? 'w-4 h-1.5 bg-white'
                : 'w-1.5 h-1.5 bg-white/40'
            }`}
          />
        ))}
      </div>

      {/* Make a Request button — pinned at bottom */}
      <div className="absolute bottom-4 left-0 right-0 z-20 flex justify-center px-5">
        <button
          onClick={() => setShowRequestSheet(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full
            bg-white/10 backdrop-blur-sm border border-white/25 text-white text-sm font-semibold
            active:scale-95 transition-transform shadow-lg"
        >
          <PlusCircleIcon className="w-5 h-5 text-purple-300" />
          Make a Request
        </button>
      </div>

      {/* Make request sheet */}
      <MakeRequestSheet
        isOpen={showRequestSheet}
        onClose={() => setShowRequestSheet(false)}
        onCreated={handleNewRequest}
      />
    </div>
  );
};

function buildInterleavedCards(events, requests) {
  const cards = [];
  const maxLen = Math.max(events.length, requests.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < events.length) cards.push({ type: 'event', data: events[i] });
    if (i < requests.length) cards.push({ type: 'request', data: requests[i] });
  }
  return cards;
}

export default CommunityEventsCard;
