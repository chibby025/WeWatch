import React, { useState } from 'react';
import {
  HandThumbUpIcon,
  ChatBubbleLeftIcon,
  PaperAirplaneIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import { HandThumbUpIcon as HandThumbUpSolid } from '@heroicons/react/24/solid';
import { toggleCommunityRequestUpvote, claimCommunityRequest } from '../../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const CommunityRequestCard = ({ request: initialRequest, currentUser, onRequestUpdate }) => {
  const navigate = useNavigate();
  const [request, setRequest]     = useState(initialRequest);
  const [upvoting, setUpvoting]   = useState(false);
  const [claiming, setClaiming]   = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  // Comments (local state — backend can be wired later)
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments]         = useState([]);
  const [commentText, setCommentText]   = useState('');
  const [replyTo, setReplyTo]           = useState(null); // { id, username }

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
      toast.error(err?.response?.data?.error || 'Could not claim request');
    } finally {
      setClaiming(false);
    }
  };

  const handleSubmitComment = (e) => {
    e.stopPropagation();
    const text = commentText.trim();
    if (!text) return;
    const newComment = {
      id: Date.now(),
      username: currentUser?.username || 'You',
      avatar_url: currentUser?.avatar_url,
      content: text,
      parent_id: replyTo?.id || null,
      replies: [],
    };
    if (replyTo) {
      setComments(prev =>
        prev.map(c => c.id === replyTo.id
          ? { ...c, replies: [...(c.replies || []), newComment] }
          : c
        )
      );
    } else {
      setComments(prev => [...prev, newComment]);
    }
    setCommentText('');
    setReplyTo(null);
  };

  // Background image priority: attached → first claimer's room → requester avatar → gradient
  const bgImage = !imgFailed && (
    request.image_url ||
    request.claims?.[0]?.room_image_url ||
    request.requester_avatar_url
  ) || null;

  const preferredDate = request.preferred_date
    ? new Date(request.preferred_date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  const isHost       = currentUser && request.claims?.some(cl => cl.host_user_id === currentUser.id);
  const primaryHost  = request.claims?.[0] || null;
  const extraHosts   = (request.claims?.length || 0) - 1;
  const totalComments = comments.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0);

  return (
    <div className="relative h-full w-full flex flex-col select-none overflow-hidden">

      {/* Background */}
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
            className="absolute inset-0 m-auto w-24 h-24 object-contain opacity-15"
          />
        </div>
      )}
      {/* Scrim */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/40 pointer-events-none" />

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex flex-col justify-end px-4 py-3 min-h-0 overflow-hidden">

        {/* Title */}
        <h2 className="text-white text-xl sm:text-2xl font-black leading-tight mb-1.5 line-clamp-3">
          {request.title}
        </h2>

        {/* Description */}
        {request.description && (
          <p className="text-white/60 text-xs leading-relaxed mb-2 line-clamp-2">
            {request.description}
          </p>
        )}

        {/* Preferred date */}
        {preferredDate && (
          <p className="text-purple-300 text-xs mb-2">📅 {preferredDate}</p>
        )}

        {/* ── Compact meta row: requester → host ─────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {/* Requester */}
          <div className="flex items-center gap-1">
            <span className="text-white/40 text-[10px] font-semibold uppercase tracking-wide">by</span>
            <Avatar url={request.requester_avatar_url} ring="purple" />
            <span className="text-white/75 text-xs font-semibold">@{request.requester_username}</span>
          </div>

          {/* Host (if claimed) */}
          {primaryHost && (
            <>
              <span className="text-white/30 text-xs">→</span>
              <div className="flex items-center gap-1">
                <span className="text-white/40 text-[10px] font-semibold uppercase tracking-wide">host</span>
                <Avatar url={primaryHost.host_avatar_url} ring="emerald" />
                <span className="text-white/75 text-xs font-semibold">@{primaryHost.host_username}</span>
                {extraHosts > 0 && (
                  <span className="text-white/40 text-[10px]">+{extraHosts}</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Comment thread (inline, opens when comment icon tapped) ─────── */}
        {showComments && (
          <div className="mb-2">
            {/* Thread list */}
            <div className="max-h-36 overflow-y-auto flex flex-col gap-1.5 mb-2 pr-0.5">
              {comments.length === 0 ? (
                <p className="text-white/35 text-xs text-center py-1.5">No comments yet</p>
              ) : (
                comments.map(c => (
                  <div key={c.id}>
                    <CommentRow
                      comment={c}
                      onReply={() => setReplyTo({ id: c.id, username: c.username })}
                    />
                    {c.replies?.map(r => (
                      <CommentRow key={r.id} comment={r} indent />
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Input */}
            <div
              className="flex items-center gap-1.5 bg-white/10 rounded-xl px-3 py-2 border border-white/15"
              onClick={e => e.stopPropagation()}
            >
              {replyTo && (
                <>
                  <span className="text-purple-300 text-[10px] flex-shrink-0">↩ @{replyTo.username}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setReplyTo(null); }}
                    className="text-white/40 text-[10px] flex-shrink-0"
                  >✕</button>
                </>
              )}
              <input
                type="text"
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmitComment(e); } }}
                placeholder={replyTo ? `Reply to @${replyTo.username}…` : 'Add a comment…'}
                className="flex-1 bg-transparent text-white text-xs outline-none placeholder-white/30 min-w-0"
              />
              <button
                onClick={handleSubmitComment}
                disabled={!commentText.trim()}
                className="text-purple-400 disabled:opacity-30 flex-shrink-0"
              >
                <PaperAirplaneIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom actions ────────────────────────────────────────────────── */}
      <div className="relative z-10 px-4 pb-4 flex flex-col gap-2">

        {/* One-line action row */}
        <div className="flex items-center gap-2">
          {/* Upvote */}
          <button
            onClick={handleUpvote}
            disabled={upvoting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
              bg-white/10 backdrop-blur-sm border border-white/20 active:scale-95 transition-all"
          >
            {request.has_upvoted
              ? <HandThumbUpSolid className="w-4 h-4 text-purple-400 flex-shrink-0" />
              : <HandThumbUpIcon  className="w-4 h-4 text-white/70 flex-shrink-0" />}
            <span className={`font-bold text-xs tabular-nums ${request.has_upvoted ? 'text-purple-300' : 'text-white/80'}`}>
              {request.upvote_count}
            </span>
          </button>

          {/* Comment toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowComments(v => !v); }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
              backdrop-blur-sm border active:scale-95 transition-all
              ${showComments
                ? 'bg-purple-600/30 border-purple-400/40'
                : 'bg-white/10 border-white/20'}`}
          >
            <ChatBubbleLeftIcon className={`w-4 h-4 flex-shrink-0 ${showComments ? 'text-purple-300' : 'text-white/70'}`} />
            <span className={`font-bold text-xs tabular-nums ${showComments ? 'text-purple-300' : 'text-white/80'}`}>
              {totalComments}
            </span>
          </button>

          <div className="flex-1" />

          {/* Status badge */}
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${
            request.status === 'claimed'
              ? 'bg-green-500/20 text-green-300 border border-green-500/40'
              : 'bg-white/10 text-white/50 border border-white/20'
          }`}>
            {request.status === 'claimed' ? '✓ Host found' : 'Open'}
          </span>
        </div>

        {/* Claim / hosting */}
        {currentUser && !isHost && (
          <button
            onClick={handleClaim}
            disabled={claiming}
            className="w-full py-2 rounded-xl font-bold text-white text-sm
              bg-gradient-to-r from-emerald-600 to-teal-600
              active:scale-95 transition-transform disabled:opacity-60"
          >
            {claiming ? 'Claiming…' : "I'll host this →"}
          </button>
        )}

        {isHost && (
          <div className="w-full py-2 rounded-xl text-center text-emerald-300 text-sm font-semibold
            bg-emerald-500/10 border border-emerald-500/30">
            ✓ You're hosting this
          </div>
        )}
      </div>
    </div>
  );
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function Avatar({ url, ring = 'purple' }) {
  const ringColor = ring === 'emerald' ? 'from-emerald-500 to-teal-500' : 'from-purple-500 to-blue-500';
  return (
    <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${ringColor} flex-shrink-0 overflow-hidden`}>
      {url && (
        <img
          src={url}
          alt=""
          className="w-full h-full object-cover"
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
      )}
    </div>
  );
}

function CommentRow({ comment, onReply, indent = false }) {
  return (
    <div className={`flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 ${indent ? 'ml-5 bg-white/5' : 'bg-white/10'}`}>
      <div className={`rounded-full flex-shrink-0 overflow-hidden mt-0.5 bg-gradient-to-br ${indent ? 'w-4 h-4 from-blue-500 to-purple-500' : 'w-5 h-5 from-purple-500 to-pink-500'}`}>
        {comment.avatar_url && (
          <img src={comment.avatar_url} alt="" className="w-full h-full object-cover" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-white/90 text-xs font-semibold">@{comment.username} </span>
        <span className="text-white/70 text-xs">{comment.content}</span>
      </div>
      {!indent && onReply && (
        <button
          onClick={(e) => { e.stopPropagation(); onReply(); }}
          className="text-white/35 text-[10px] flex-shrink-0 hover:text-white/65"
        >
          reply
        </button>
      )}
    </div>
  );
}

export default CommunityRequestCard;
