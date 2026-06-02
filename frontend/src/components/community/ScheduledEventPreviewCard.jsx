import React from 'react';
import { CalendarDaysIcon, UserCircleIcon, TicketIcon } from '@heroicons/react/24/outline';

const WATCH_TYPE_EMOJI = {
  '3d_cinema': '🎭',
  video: '🎬',
  classroom: '🎓',
  podcast: '🎙️',
  livestream: '📡',
};

const RATING_COLOR = {
  'G': 'bg-green-600',
  'PG': 'bg-blue-600',
  'Educational': 'bg-indigo-600',
  'Religious': 'bg-purple-700',
  '13+': 'bg-yellow-600',
  '16+': 'bg-orange-600',
  '18+': 'bg-red-600',
  'Mature': 'bg-red-900',
};

const ScheduledEventPreviewCard = ({ event, onRSVP, apiBaseUrl }) => {
  const emoji = WATCH_TYPE_EMOJI[event.watch_type] || '🎬';
  const ratingColor = RATING_COLOR[event.content_rating] || 'bg-gray-700';
  const startDate = new Date(event.start_time);
  const isToday = new Date().toDateString() === startDate.toDateString();
  const dateLabel = isToday
    ? `Today · ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : startDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) +
      ' · ' + startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const hasTrailer = !!event.trailer_url;
  const attendees = event.is_paid ? event.tickets_sold : event.rsvp_count;

  return (
    <div className="relative h-full w-full flex flex-col select-none overflow-hidden">
      {/* Background — trailer or gradient */}
      {hasTrailer ? (
        <video
          src={`${apiBaseUrl}/${event.trailer_url}`}
          autoPlay loop muted playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900 via-indigo-900 to-black" />
      )}

      {/* Scrim */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/40 pointer-events-none" />

      {/* Top: content rating badge + watch type */}
      <div className="relative z-10 flex items-center gap-2 p-4 pt-6">
        <span className="text-3xl">{emoji}</span>
        <span className={`text-white text-xs font-bold px-2 py-0.5 rounded-full ${ratingColor}`}>
          {event.content_rating}
        </span>
        {event.is_paid && (
          <span className="flex items-center gap-1 bg-amber-500/90 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            <TicketIcon className="w-3 h-3" />
            Ticketed
          </span>
        )}
      </div>

      {/* Bottom info */}
      <div className="relative z-10 mt-auto p-5">
        {/* Room name */}
        <p className="text-white/70 text-sm font-medium mb-1 truncate">{event.room_name}</p>

        {/* Event title */}
        <h2 className="text-white text-2xl font-bold leading-tight mb-2 line-clamp-2">
          {event.title}
        </h2>

        {/* Date */}
        <div className="flex items-center gap-1.5 mb-3">
          <CalendarDaysIcon className="w-4 h-4 text-purple-300 flex-shrink-0" />
          <span className="text-purple-200 text-sm font-medium">{dateLabel}</span>
        </div>

        {/* Host row */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center overflow-hidden flex-shrink-0">
            {event.host_avatar_url
              ? <img src={event.host_avatar_url} alt={event.host_username} className="w-full h-full object-cover" />
              : <UserCircleIcon className="w-5 h-5 text-white" />}
          </div>
          <span className="text-white/80 text-sm">@{event.host_username}</span>
          {attendees > 0 && (
            <span className="ml-auto text-white/60 text-xs">{attendees} {event.is_paid ? 'booked' : 'going'}</span>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={() => onRSVP(event)}
          className="w-full py-3 rounded-xl font-bold text-white text-sm
            bg-gradient-to-r from-purple-600 to-indigo-600
            active:scale-95 transition-transform"
        >
          {event.is_paid ? `Get Ticket · ${event.ticket_price_tokens} tokens` : 'RSVP — It\'s Free'}
        </button>
      </div>
    </div>
  );
};

export default ScheduledEventPreviewCard;
