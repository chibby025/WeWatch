import React, { useState, useRef, useCallback, useEffect } from 'react';
import ScheduledEventPreviewCard from './ScheduledEventPreviewCard';
import CommunityRequestCard from './CommunityRequestCard';
import MakeRequestSheet from './MakeRequestSheet';
import { PlusCircleIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

/**
 * CommunityEventsCard — flat fan carousel.
 *
 * Visual layout (bottom-up):
 *   [btn area   56px] "Make a Community Request"  ← pinned to container bottom
 *   [context    26px] card-specific info line      ← follows nav bar
 *   [nav bar    44px] ← thumbnail title →          ← floats directly under card
 *   [card fan        ] cards centred in carousel area (full height minus btn area)
 *   [top pill        ] counter + tagline overlay
 */

const BTN_AREA_H   = 56; // "Make a Community Request" bar at very bottom
const NAV_H        = 96; // expanded info panel floating below card
const CARD_NAV_GAP =  8; // gap between card bottom and nav bar

const TAGLINES = [
  "Request what you want to watch and have the community create it...",
  "See a topic you love? Put it out there — someone will host it!",
  "Your request could be the next community event!",
];

const WATCH_LABELS = {
  '3d_cinema': '🎭 3D Cinema',
  video:       '🎬 Video Watch',
  classroom:   '🎓 Classroom',
  podcast:     '🎙️ Podcast',
};

const RATING_COLOR = {
  'G':           'bg-green-600',
  'PG':          'bg-blue-600',
  'Educational': 'bg-indigo-600',
  'Religious':   'bg-purple-700',
  '13+':         'bg-yellow-600',
  '16+':         'bg-orange-600',
  '18+':         'bg-red-600',
  'Mature':      'bg-red-900',
};

function buildInterleavedCards(events, requests) {
  const cards = [];
  const max = Math.max(events.length, requests.length);
  for (let i = 0; i < max; i++) {
    if (i < events.length)   cards.push({ type: 'event',   data: events[i] });
    if (i < requests.length) cards.push({ type: 'request', data: requests[i] });
  }
  return cards;
}

function fmtDate(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return 'Today · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const tom = new Date(now); tom.setDate(tom.getDate() + 1);
  if (d.toDateString() === tom.toDateString())
    return 'Tomorrow · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
    + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─────────────────────────────────────────────────────────────────────────────

const CommunityEventsCard = ({
  scheduledEvents = [],
  requests        = [],
  currentUser,
  apiBaseUrl,
  onRSVP,
  onNewRequest,
}) => {
  const cards = buildInterleavedCards(scheduledEvents, requests);

  const [currentIndex,     setCurrentIndex]     = useState(0);
  const [showRequestSheet, setShowRequestSheet] = useState(false);
  const [localRequests,    setLocalRequests]    = useState(requests);

  // Tagline rotation
  const [taglineIdx,     setTaglineIdx]     = useState(0);
  const [taglineVisible, setTaglineVisible] = useState(true);
  useEffect(() => {
    const t = setInterval(() => {
      setTaglineVisible(false);
      setTimeout(() => {
        setTaglineIdx(i => (i + 1) % TAGLINES.length);
        setTaglineVisible(true);
      }, 500);
    }, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { setLocalRequests(requests); }, [requests]);

  // Container size
  const containerRef = useRef(null);
  const [cW, setCW] = useState(390);
  const [cH, setCH] = useState(650);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const up = () => { setCW(el.offsetWidth); setCH(el.offsetHeight); };
    up();
    const ro = new ResizeObserver(up);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Touch swipe (non-passive to block parent vertical scroll)
  const txRef  = useRef(null);
  const tyRef  = useRef(null);
  const drag   = useRef(false);
  const horiz  = useRef(false);
  const [dragX, setDragX] = useState(0);

  const goTo = useCallback(
    (idx) => setCurrentIndex(Math.max(0, Math.min(idx, cards.length - 1))),
    [cards.length],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onStart = (e) => {
      txRef.current = e.touches[0].clientX;
      tyRef.current = e.touches[0].clientY;
      drag.current  = false;
      horiz.current = false;
    };
    const onMove = (e) => {
      if (txRef.current === null) return;
      const dx = e.touches[0].clientX - txRef.current;
      const dy = e.touches[0].clientY - tyRef.current;
      if (!horiz.current && !drag.current) {
        if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) { horiz.current = true; }
        else if (Math.abs(dy) > 6) { txRef.current = null; return; }
      }
      if (horiz.current) { e.preventDefault(); drag.current = true; setDragX(dx); }
    };
    const onEnd = (e) => {
      if (txRef.current === null) return;
      const dx   = e.changedTouches[0].clientX - txRef.current;
      const was  = drag.current;
      txRef.current = null; drag.current = false; horiz.current = false;
      setDragX(0);
      if (!was) return;
      if (dx < -40) goTo(currentIndex + 1);
      else if (dx > 40) goTo(currentIndex - 1);
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove',  onMove,  { passive: false });
    el.addEventListener('touchend',   onEnd,   { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove',  onMove);
      el.removeEventListener('touchend',   onEnd);
    };
  }, [currentIndex, goTo]);

  // ── Card geometry ──────────────────────────────────────────────────────────
  // Carousel area = full container minus the pinned button at bottom.
  // Cards are vertically centred in carousel area.
  // Nav bar + context line float at calculated position below card bottom edge.
  const carouselH = Math.max(cH - BTN_AREA_H, 300);

  const cardW = Math.round(cW * 0.62);
  // Cap height so it never spills into the nav/context zone
  const maxCardH = Math.max(carouselH - NAV_H - CARD_NAV_GAP - 16, 200);
  const cardH = Math.round(Math.min(maxCardH, cardW * 1.68));
  const step  = Math.round(cardW * 0.68);

  // Vertical midpoint of carousel area → card centre
  // Card bottom = carouselH/2 + cardH/2  (measured from container top)
  const cardBottomPx = Math.round(carouselH / 2 + cardH / 2);
  const navTopPx     = cardBottomPx + CARD_NAV_GAP;

  const handleReqUpdate = (u) => setLocalRequests(p => p.map(r => r.id === u.id ? u : r));
  const handleNewReq    = (r) => { setLocalRequests(p => [r, ...p]); onNewRequest?.(r); };

  const cur = cards.length > 0 ? cards[currentIndex] : null;

  // ── Empty state ────────────────────────────────────────────────────────────
  if (cards.length === 0) {
    return (
      <div ref={containerRef} className="relative h-full w-full flex flex-col overflow-hidden bg-gradient-to-br from-gray-900 via-slate-900 to-black">

        {/* Top pill + calendar widget */}
        <div className="absolute top-0 left-0 right-0 z-10 flex flex-col items-center pt-3 gap-2 pointer-events-none">
          <div className="bg-black/50 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1">
            <span className="text-white/80 text-xs font-semibold tracking-wide">
              📅 Community Events
            </span>
          </div>
          {/* Mini calendar showing today's date */}
          {(() => {
            const d = new Date();
            const month = d.toLocaleString('default', { month: 'short' }).toUpperCase();
            const day   = d.getDate();
            const wday  = d.toLocaleString('default', { weekday: 'short' }).toUpperCase();
            return (
              <div className="rounded-xl overflow-hidden border border-white/15 shadow-lg" style={{ width: 52, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)' }}>
                <div className="py-0.5 text-center" style={{ background: 'rgba(124,58,237,0.75)' }}>
                  <span className="text-white text-[9px] font-black uppercase tracking-widest">{month}</span>
                </div>
                <div className="py-1.5 text-center">
                  <p className="text-white text-2xl font-black leading-none">{day}</p>
                  <p className="text-white/50 text-[9px] font-semibold uppercase tracking-wide mt-0.5">{wday}</p>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Centred empty content — tagline replaces the static subtext */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <img src="/icons/lwoIcon.webp" alt="" className="w-20 h-20 mb-5 opacity-40" />
          <p className="text-white text-xl font-bold mb-3">Nothing scheduled yet</p>
          <p
            className="text-purple-300/80 text-sm font-medium max-w-xs leading-relaxed transition-opacity duration-500"
            style={{ opacity: taglineVisible ? 1 : 0 }}
          >
            {TAGLINES[taglineIdx]}
          </p>
        </div>

        {/* Same pinned bottom button as the carousel view */}
        <div
          className="absolute left-0 right-0 bottom-0 flex items-center justify-center px-4"
          style={{
            height:         BTN_AREA_H,
            zIndex:         10,
            background:     'linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.60))',
            backdropFilter: 'blur(12px)',
            borderTop:      '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <button
            onClick={() => setShowRequestSheet(true)}
            className="flex items-center gap-2.5 px-6 py-3 rounded-full
              bg-purple-600/80 hover:bg-purple-600 active:scale-95
              text-white text-sm font-semibold
              border border-purple-400/30 transition-colors"
          >
            <PlusCircleIcon className="w-5 h-5 flex-shrink-0" />
            Make a Community Request
          </button>
        </div>

        <MakeRequestSheet isOpen={showRequestSheet} onClose={() => setShowRequestSheet(false)} onCreated={handleNewReq} />
      </div>
    );
  }

  // ── Carousel ───────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">

      {/* ── Top pill + tagline (always visible) ── */}
      <div className="absolute top-0 left-0 right-0 z-30 flex flex-col items-center pt-3 gap-1.5 pointer-events-none">
        <div className="bg-black/50 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1">
          <span className="text-white/80 text-xs font-semibold tracking-wide">
            📅 Community Events · {currentIndex + 1}/{cards.length}
          </span>
        </div>
        <p
          className="text-purple-300/80 text-[11px] font-medium text-center max-w-[260px] leading-snug transition-opacity duration-500 px-4"
          style={{ opacity: taglineVisible ? 1 : 0 }}
        >
          {TAGLINES[taglineIdx]}
        </p>
      </div>

      {/* ── Card fan — lives in carousel area (top 0 to carouselH) ── */}
      <div
        className="absolute left-0 right-0 overflow-hidden"
        style={{ top: 0, height: carouselH }}
      >
        {cards.map((card, i) => {
          const offset    = i - currentIndex;
          const absOffset = Math.abs(offset);
          if (absOffset > 2.6) return null;

          const isCenter   = offset === 0;
          const scale      = isCenter ? 1 : Math.max(0.70, 1 - absOffset * 0.15);
          const translateX = offset * step + dragX;
          const opacity    = absOffset > 2 ? 0.25 : absOffset > 1 ? 0.72 : 1;
          const zIndex     = 20 - Math.round(absOffset) * 5;
          const trans      = dragX !== 0
            ? 'opacity 0.1s ease'
            : 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.35s ease';

          return (
            <div
              key={i}
              style={{
                position:  'absolute',
                width:     cardW,
                height:    cardH,
                left:      '50%',
                top:       '50%',
                transform: `translate(calc(-50% + ${translateX}px), -50%) scale(${scale})`,
                zIndex, opacity,
                borderRadius: 16,
                overflow:     'hidden',
                transition:   trans,
                boxShadow: isCenter
                  ? '0 24px 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.08)'
                  : '0 8px 24px rgba(0,0,0,0.55)',
                cursor:    isCenter ? 'default' : 'pointer',
                willChange: 'transform, opacity',
              }}
            >
              {card.type === 'event' ? (
                <ScheduledEventPreviewCard event={card.data} onRSVP={onRSVP} apiBaseUrl={apiBaseUrl} />
              ) : (
                <CommunityRequestCard
                  request={localRequests.find(r => r.id === card.data.id) || card.data}
                  currentUser={currentUser}
                  onRequestUpdate={handleReqUpdate}
                />
              )}
              {!isCenter && (
                <div
                  className="absolute inset-0"
                  style={{ zIndex: 50, cursor: 'pointer' }}
                  onClick={() => goTo(i)}
                />
              )}
            </div>
          );
        })}

        {/* Dot indicators inside carousel area */}
        {cards.length > 1 && (
          <div
            className="absolute left-0 right-0 flex items-center justify-center gap-1.5 pointer-events-none"
            style={{ bottom: 8, zIndex: 25 }}
          >
            {cards.slice(0, Math.min(cards.length, 11)).map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-200"
                style={{
                  width:           i === currentIndex ? 14 : 5,
                  height:          5,
                  backgroundColor: i === currentIndex
                    ? 'rgba(255,255,255,0.95)'
                    : 'rgba(255,255,255,0.32)',
                }}
              />
            ))}
            {cards.length > 11 && (
              <span className="text-white/35 text-[9px] ml-0.5">+{cards.length - 11}</span>
            )}
          </div>
        )}
      </div>

      {/* ── Expanded info panel — floats directly under card ── */}
      {/* Outer row: arrows span full height, info in the middle */}
      <div
        className="absolute left-0 right-0 flex items-center gap-2 px-3"
        style={{
          top:            navTopPx,
          height:         NAV_H,
          zIndex:         28,
          background:     'linear-gradient(to bottom, rgba(0,0,0,0.60), rgba(0,0,0,0.88))',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* ← centred across full panel height */}
        <button
          onClick={() => goTo(currentIndex - 1)}
          disabled={currentIndex === 0}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full
            bg-white/10 hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed
            text-white transition-colors active:scale-90"
        >
          <ChevronLeftIcon className="w-4 h-4" />
        </button>

        {/* Middle: two rows of info */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">

          {/* Row 1: prominent rating badge + title [+ Ticketed] */}
          <div className="flex items-center gap-2">
            {/* Rating badge — tall, stands out */}
            <span
              className={`flex-shrink-0 text-white text-xs font-black px-2.5 py-1 rounded-lg ${
                RATING_COLOR[cur?.data?.content_rating] || 'bg-gray-600'
              }`}
            >
              {cur?.data?.content_rating || '—'}
            </span>
            {cur?.type === 'event' && cur.data.is_paid && (
              <span className="flex-shrink-0 text-white text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/90">
                Ticketed
              </span>
            )}
            <p className="text-white text-sm font-bold truncate">
              {cur?.type === 'event' ? cur.data.title : `"${cur?.data?.title}"`}
            </p>
          </div>

          {/* Row 2: host / metadata */}
          <div className="flex items-center gap-1.5">
            {cur?.type === 'event' ? (
              <>
                {cur.data.host_avatar_url ? (
                  <img
                    src={cur.data.host_avatar_url}
                    alt={cur.data.host_username}
                    className="w-5 h-5 rounded-full object-cover flex-shrink-0 ring-1 ring-white/20"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white/70 text-xs truncate">
                    <span className="text-white/90 font-semibold">@{cur.data.host_username}</span>
                    {' · '}
                    {WATCH_LABELS[cur.data.watch_type] || '🎬 Watch'}
                    {' · '}
                    {fmtDate(cur.data.start_time)}
                    {(cur.data.is_paid ? cur.data.tickets_sold : cur.data.rsvp_count) > 0 && (
                      <span className="text-white/50">
                        {' · '}
                        {cur.data.is_paid ? cur.data.tickets_sold : cur.data.rsvp_count}
                        {' '}{cur.data.is_paid ? 'booked' : 'going'}
                      </span>
                    )}
                  </p>
                  {cur.data.description ? (
                    <p className="text-white/45 text-[10px] truncate mt-0.5 italic">
                      {cur.data.description}
                    </p>
                  ) : null}
                </div>
              </>
            ) : cur?.type === 'request' ? (
              <>
                <p className="text-white/70 text-xs truncate flex-1">
                  <span className="text-purple-300 font-semibold">{cur.data.upvote_count ?? 0}</span>
                  {' want this · @'}
                  <span className="text-white/80">{cur.data.requester_username}</span>
                </p>
                <span className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  cur.data.status === 'claimed'
                    ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                    : 'bg-white/10 text-white/50'
                }`}>
                  {cur.data.status === 'claimed' ? '✓ Host found' : 'Open'}
                </span>
              </>
            ) : null}
          </div>
        </div>

        {/* → centred across full panel height */}
        <button
          onClick={() => goTo(currentIndex + 1)}
          disabled={currentIndex === cards.length - 1}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full
            bg-white/10 hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed
            text-white transition-colors active:scale-90"
        >
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      </div>

      {/* ── "Make a Community Request" — pinned to container bottom ── */}
      <div
        className="absolute left-0 right-0 bottom-0 flex items-center justify-center px-4"
        style={{
          height:         BTN_AREA_H,
          zIndex:         30,
          background:     'linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.60))',
          backdropFilter: 'blur(12px)',
          borderTop:      '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <button
          onClick={() => setShowRequestSheet(true)}
          className="flex items-center gap-2 px-6 py-2.5 rounded-full
            bg-purple-600/80 hover:bg-purple-600 active:scale-95
            text-white text-[12px] font-semibold
            border border-purple-400/30 transition-colors"
        >
          <PlusCircleIcon className="w-4 h-4 flex-shrink-0" />
          Make a Community Request
        </button>
      </div>

      <MakeRequestSheet
        isOpen={showRequestSheet}
        onClose={() => setShowRequestSheet(false)}
        onCreated={handleNewReq}
      />
    </div>
  );
};

export default CommunityEventsCard;
