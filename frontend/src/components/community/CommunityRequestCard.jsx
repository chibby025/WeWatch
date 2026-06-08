import React, { useState } from 'react';
import { HandThumbUpIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { HandThumbUpIcon as HandThumbUpSolid } from '@heroicons/react/24/solid';
import { toggleCommunityRequestUpvote, claimCommunityRequest } from '../../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const CommunityRequestCard = ({ request: initialRequest, currentUser, onRequestUpdate }) => {
  const navigate = useNavigate();
  const [request, setRequest] = useState(initialRequest);
  const [upvoting, setUpvoting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  // Track whether the background image failed so we can fall through to next option
  const [imgFailed, setImgFailed] = useState(false);

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

  // Background image priority: attached image → first claimer's room image →
  // requester avatar → lwoIcon (always resolves, never blank)
  const bgImage = !imgFailed && request.image_url
    ? request.image_url
    : !imgFailed && request.claims?.[0]?.room_image_url
    ? request.claims[0].room_image_url
    : !imgFailed && request.requester_avatar_url
    ? request.requester_avatar_url
    : null;

  const preferredDate = request.preferred_date
    ? new Date(request.preferred_date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  const isHost = currentUser && request.claims?.some(cl => cl.host_user_id === currentUser.id);

  return (
    <div className="relative h-full w-full flex flex-col select-none overflow-hidden">
      {/* Background: image fallback chain */}
      {bgImage ? (
        <img
          src={bgImage}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-purple-950 to-black">
          <img
            src="/icons/lwoIcon.webp"
            alt=""
            className="absolute inset-0 m-auto w-24 h-24 sm:w-28 sm:h-28 object-contain opacity-15"
          />
        </div>
      )}
      {/* Scrim — legibility over any background */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/40 pointer-events-none" />

      {/* Community request label */}
      <div className="relative z-10 p-4 pt-5 sm:pt-6">
        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600/40 to-blue-600/40 backdrop-blur-sm border border-purple-400/40 rounded-full px-3 py-1">
          <span className="text-sm">💬</span>
          <span className="bg-gradient-to-r from-purple-300 to-blue-300 bg-clip-text text-transparent text-xs font-bold uppercase tracking-wide">
            Community Request
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-4 sm:px-5 py-3 sm:py-4">
        {/* Big title — no quotes */}
        <h2 className="text-white text-2xl sm:text-3xl font-black leading-tight mb-2 sm:mb-3 line-clamp-3">
          {request.title}
        </h2>

        {/* Description */}
        {request.description && (
          <p className="text-white/60 text-xs sm:text-sm leading-relaxed mb-3 sm:mb-4 line-clamp-2 sm:line-clamp-3">
            {request.description}
          </p>
        )}

        {/* Preferred date */}
        {preferredDate && (
          <p className="text-purple-300 text-xs sm:text-sm mb-3 sm:mb-4">📅 Preferred: {preferredDate}</p>
        )}

        {/* Requester */}
        <p className="text-white/50 text-xs mb-4 sm:mb-6">
          Requested by <span className="text-white/80 font-semibold">@{request.requester_username}</span>
        </p>

        {/* Claims */}
        {request.claims && request.claims.length > 0 && (
          <div className="mb-3 sm:mb-4">
            <p className="text-white/60 text-xs mb-2 font-semibold uppercase tracking-wide">
              {request.claims.length} host{request.claims.length !== 1 ? 's' : ''} offering this
            </p>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {request.claims.map((cl) => (
                <div
                  key={cl.host_user_id}
                  className="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1"
                >
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {cl.host_avatar_url
                      ? <img
                          src={cl.host_avatar_url}
                          alt={cl.host_username}
                          className="w-full h-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      : <UserCircleIcon className="w-4 h-4 text-white" />}
                  </div>
                  <span className="text-white/80 text-xs font-medium">@{cl.host_username}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="relative z-10 p-4 sm:p-5 flex flex-col gap-2.5 sm:gap-3">
        {/* Upvote row */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleUpvote}
            disabled={upvoting}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl
              bg-white/10 backdrop-blur-sm border border-white/20
              active:scale-95 transition-all"
          >
            {request.has_upvoted
              ? <HandThumbUpSolid className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
              : <HandThumbUpIcon className="w-4 h-4 sm:w-5 sm:h-5 text-white/70" />}
            <span className={`font-bold text-xs sm:text-sm ${request.has_upvoted ? 'text-purple-300' : 'text-white/80'}`}>
              {request.upvote_count} want this
            </span>
          </button>

          <span className={`text-xs font-semibold px-2.5 sm:px-3 py-1 rounded-full ${
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
            className="w-full py-2.5 sm:py-3 rounded-xl font-bold text-white text-sm
              bg-gradient-to-r from-emerald-600 to-teal-600
              active:scale-95 transition-transform
              disabled:opacity-60"
          >
            {claiming ? 'Claiming...' : "I'll host this →"}
          </button>
        )}

        {isHost && (
          <div className="w-full py-2.5 sm:py-3 rounded-xl text-center text-emerald-300 text-sm font-semibold
            bg-emerald-500/10 border border-emerald-500/30">
            ✓ You're hosting this
          </div>
        )}
      </div>
    </div>
  );
};

export default CommunityRequestCard;
