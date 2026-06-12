import React, { useState } from 'react';
import { TicketIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { createFreeRSVP, purchaseEventTicket } from '../../services/api';
import toast from 'react-hot-toast';

/**
 * ScheduledEventPreviewCard — carousel card (poster style).
 * Shows only: background (trailer > room image > gradient) + title + book/calendar button.
 * All metadata (rating, host, date, type) lives in the CommunityEventsCard nav bar.
 */
const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|$)/i;

const resolveUrl = (base, path) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}/${path.replace(/^\/+/, '')}`;
};

const ScheduledEventPreviewCard = ({ event, onRSVP, apiBaseUrl, currentUser }) => {
  const [booked, setBooked]   = useState(false);
  const [loading, setLoading] = useState(false);

  const eventId    = event.ID   || event.id;
  const hostUserId = event.host_user_id || event.HostUserID;
  const isHost     = currentUser && (currentUser.id === hostUserId || currentUser.ID === hostUserId);

  const trailerSrc    = resolveUrl(apiBaseUrl, event.trailer_url);
  const isTrailerImage = trailerSrc && IMAGE_EXTS.test(trailerSrc);
  const roomImgSrc    = resolveUrl(apiBaseUrl, event.room_image_url);

  const handleBook = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (event.is_paid) {
        await purchaseEventTicket(eventId, false, null);
        toast.success('🎟️ Ticket booked!');
      } else {
        await createFreeRSVP(eventId);
        toast.success('✅ Booked!');
      }
      setBooked(true);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to book');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative h-full w-full flex flex-col select-none overflow-hidden">
      {/* Background — trailer > room image > gradient + watermark */}
      {trailerSrc && isTrailerImage ? (
        <img
          src={trailerSrc}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : trailerSrc ? (
        <video
          src={trailerSrc}
          autoPlay loop muted playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : roomImgSrc ? (
        <img
          src={roomImgSrc}
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

      {/* Scrim */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/20 to-transparent pointer-events-none" />

      {/* Bottom: title + attendance + CTA */}
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

        {/* CTA — hidden for host */}
        {!isHost && (
          booked ? (
            <button
              onClick={() => onRSVP && onRSVP(event)}
              className="w-full py-2.5 sm:py-3 rounded-xl font-bold text-white text-sm
                bg-gradient-to-r from-green-600 to-emerald-600
                active:scale-95 transition-transform flex items-center justify-center gap-2"
            >
              <CheckCircleIcon className="w-4 h-4" />
              Add to Calendar
            </button>
          ) : (
            <button
              onClick={handleBook}
              disabled={loading}
              className={`w-full py-2.5 sm:py-3 rounded-xl font-bold text-white text-sm
                ${event.is_paid
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600'
                  : 'bg-gradient-to-r from-green-600 to-emerald-600'}
                active:scale-95 transition-transform flex items-center justify-center gap-2
                disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <TicketIcon className="w-4 h-4" />
              )}
              {loading
                ? 'Booking…'
                : event.is_paid
                  ? `Get Ticket · ${event.ticket_price_tokens} tokens`
                  : 'Book Free'}
            </button>
          )
        )}
      </div>
    </div>
  );
};

export default ScheduledEventPreviewCard;
