import React, { useState } from 'react';
import { HandThumbUpIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { HandThumbUpIcon as HandThumbUpSolid } from '@heroicons/react/24/solid';
import { toggleCommunityRequestUpvote, claimCommunityRequest } from '../../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const RATING_EMOJI = {
  'G': '🟢', 'PG': '🔵', 'Educational': '📚', 'Religious': '✝️',
  '13+': '🔞', '16+': '🔞', '18+': '🔞', 'Mature': '🔥',
};

const CommunityRequestCard = ({ request: initialRequest, currentUser, onRequestUpdate }) => {
  const navigate = useNavigate();
  const [request, setRequest] = useState(initialRequest);
  const [upvoting, setUpvoting] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const handleUpvote = async (e) => {
    e.stopPropagation();
    if (upvoting) return;
    setUpvoting(true);
    try {
      const data = await toggleCommunityRequestUpvote(request.id);
      const updated = { ...request, has_upvoted: data.has_upvoted, upvote_count: data.upvote_count };
      setRequest(updated);
      onRequestUpdate?.(updated);
    } catch {
      toast.error('Could not update vote');
    } finally {
      setUpvoting(false);
    }
  };

  const handleClaim = async (e) => {
    e.stopPropagation();
    if (claiming) return;
    setClaiming(true);
    try {
      const data = await claimCommunityRequest(request.id);
      toast.success('Claimed! Opening your schedule...');
      navigate(`/rooms/${data.prefill.room_id}`, {
        state: {
          openSchedule: true,
          schedulePrefill: {
            title: data.prefill.title,
            description: data.prefill.description,
            content_rating: data.prefill.content_rating,
            preferred_date: data.prefill.preferred_date,
          },
        },
      });
    } catch (err) {
      const msg = err?.response?.data?.error || 'Could not claim request';
      toast.error(msg);
    } finally {
      setClaiming(false);
    }
  };

  const ratingEmoji = RATING_EMOJI[request.content_rating] || '🎬';
  const preferredDate = request.preferred_date
    ? new Date(request.preferred_date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  const isHost = currentUser && request.claims?.some(cl => cl.host_user_id === currentUser.id);

  return (
    <div className="relative h-full w-full flex flex-col select-none overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-slate-900 to-black" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

      {/* Community request label */}
      <div className="relative z-10 p-4 pt-6">
        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1">
          <span className="text-lg">{ratingEmoji}</span>
          <span className="text-white/80 text-xs font-semibold uppercase tracking-wide">Community Request</span>
          <span className="text-white/50 text-xs">· {request.content_rating}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-5 py-4">
        {/* Big title */}
        <h2 className="text-white text-3xl font-black leading-tight mb-3 line-clamp-3">
          "{request.title}"
        </h2>

        {/* Description */}
        {request.description && (
          <p className="text-white/60 text-sm leading-relaxed mb-4 line-clamp-3">
            {request.description}
          </p>
        )}

        {/* Preferred date */}
        {preferredDate && (
          <p className="text-purple-300 text-sm mb-4">📅 Preferred: {preferredDate}</p>
        )}

        {/* Requester */}
        <p className="text-white/50 text-xs mb-6">
          Requested by <span className="text-white/80 font-semibold">@{request.requester_username}</span>
        </p>

        {/* Claims */}
        {request.claims && request.claims.length > 0 && (
          <div className="mb-4">
            <p className="text-white/60 text-xs mb-2 font-semibold uppercase tracking-wide">
              {request.claims.length} host{request.claims.length !== 1 ? 's' : ''} offering this
            </p>
            <div className="flex flex-wrap gap-2">
              {request.claims.map((cl) => (
                <div
                  key={cl.host_user_id}
                  className="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1"
                >
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {cl.host_avatar_url
                      ? <img src={cl.host_avatar_url} alt={cl.host_username} className="w-full h-full object-cover" />
                      : <UserCircleIcon className="w-4 h-4 text-white" />}
                  </div>
                  <span className="text-white/80 text-xs font-medium">@{cl.host_username}</span>
                  {cl.room_rating && (
                    <span className="text-white/40 text-xs">{cl.room_rating}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="relative z-10 p-5 flex flex-col gap-3">
        {/* Upvote row */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleUpvote}
            disabled={upvoting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl
              bg-white/10 backdrop-blur-sm border border-white/20
              active:scale-95 transition-all"
          >
            {request.has_upvoted
              ? <HandThumbUpSolid className="w-5 h-5 text-purple-400" />
              : <HandThumbUpIcon className="w-5 h-5 text-white/70" />}
            <span className={`font-bold text-sm ${request.has_upvoted ? 'text-purple-300' : 'text-white/80'}`}>
              {request.upvote_count} {request.upvote_count === 1 ? 'want this' : 'want this'}
            </span>
          </button>

          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
            request.status === 'claimed'
              ? 'bg-green-500/20 text-green-300 border border-green-500/40'
              : 'bg-white/10 text-white/50 border border-white/20'
          }`}>
            {request.status === 'claimed' ? '✓ Host found' : 'Open request'}
          </span>
        </div>

        {/* Claim button — only for hosts who haven't claimed yet */}
        {currentUser && !isHost && (
          <button
            onClick={handleClaim}
            disabled={claiming}
            className="w-full py-3 rounded-xl font-bold text-white text-sm
              bg-gradient-to-r from-emerald-600 to-teal-600
              active:scale-95 transition-transform
              disabled:opacity-60"
          >
            {claiming ? 'Claiming...' : "I'll host this →"}
          </button>
        )}

        {isHost && (
          <div className="w-full py-3 rounded-xl text-center text-emerald-300 text-sm font-semibold
            bg-emerald-500/10 border border-emerald-500/30">
            ✓ You're hosting this
          </div>
        )}
      </div>
    </div>
  );
};

export default CommunityRequestCard;
