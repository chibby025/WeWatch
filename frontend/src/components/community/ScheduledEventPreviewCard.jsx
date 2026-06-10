import React from 'react';
import { TicketIcon, UserGroupIcon } from '@heroicons/react/24/outline';

/**
 * ScheduledEventPreviewCard — carousel card (poster style).
 * Shows only: background (trailer > room image > gradient) + title + RSVP button.
 * All metadata (rating, host, date, type) lives in the CommunityEventsCard nav bar.
 */
const ScheduledEventPreviewCard = ({ event, onRSVP, apiBaseUrl }) => {
  const hasTrailer = !!event.trailer_url;

  return (
    <div className="relative h-full w-full flex flex-col select-none overflow-hidden">
      {/* Background — trailer > room image > gradient + watermark */}
      {hasTrailer ? (
        <video
          src={`${apiBaseUrl}/${event.trailer_url}`}
          autoPlay loop muted playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : event.room_image_url ? (
        <img
          src={event.room_image_url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-purple-950 via-indigo-950 to-black flex items-center justify-center">
          <img
            src="/icons/lwoIcon.webp"
            alt=""
            className="w-28 h-28 sm:w-36 sm:h-36 object-contain opacity-30 animate-pulse"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
      )}

      {/* Scrim — heavier at bottom for legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/20 to-transparent pointer-events-none" />

      {/* Bottom: title + attendance + RSVP */}
      <div className="relative z-10 mt-auto p-4 sm:p-5 pb-5 sm:pb-6">
        <h2 className="text-white text-xl sm:text-2xl font-bold leading-tight mb-2 line-clamp-2">
          {event.title}
        </h2>

        {/* Attendance indicator */}
        {((event.rsvp_count > 0 && !event.is_paid) || (event.tickets_sold > 0 && event.is_paid)) && (
          <div className="flex items-center gap-1.5 mb-3">
            <UserGroupIcon className="w-3.5 h-3.5 text-white/50 flex-shrink-0" />
            <span className="text-white/60 text-xs">
              {event.is_paid
                ? `${event.tickets_sold} booked`
                : `${event.rsvp_count} going`}
            </span>
            {/* Subtle avatar stack placeholder — visual density */}
            <div className="flex -space-x-1 ml-0.5">
              {Array.from({ length: Math.min(event.is_paid ? event.tickets_sold : event.rsvp_count, 3) }).map((_, i) => (
                <div
                  key={i}
                  className="w-4 h-4 rounded-full border border-black/40 flex-shrink-0"
                  style={{ background: `hsl(${(i * 80 + 200) % 360}, 65%, 55%)` }}
                />
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => onRSVP(event)}
          className="w-full py-2.5 sm:py-3 rounded-xl font-bold text-white text-sm
            bg-gradient-to-r from-purple-600 to-indigo-600
            active:scale-95 transition-transform flex items-center justify-center gap-2"
        >
          {event.is_paid ? (
            <>
              <TicketIcon className="w-4 h-4" />
              Get Ticket · {event.ticket_price_tokens} tokens
            </>
          ) : (
            'RSVP — It\'s Free'
          )}
        </button>
      </div>
    </div>
  );
};

export default ScheduledEventPreviewCard;
