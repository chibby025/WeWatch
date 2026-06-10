import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HandThumbUpIcon,
  ChatBubbleLeftIcon,
  PaperAirplaneIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { HandThumbUpIcon as HandThumbUpSolid } from '@heroicons/react/24/solid';
import { toggleCommunityRequestUpvote, claimCommunityRequest } from '../../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const CommunityRequestCard = ({ request: initialRequest, currentUser, onRequestUpdate }) => {
  const navigate = useNavigate();
  const [request, setRequest]         = useState(initialRequest);
  const [upvoting, setUpvoting]       = useState(false);
  const [claiming, setClaiming]       = useState(false);
  const [imgFailed, setImgFailed]     = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments]       = useState([]);

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
      toast.success('Claimed! Opening your schedule…');
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

  const bgImage = !imgFailed && (
    request.image_url ||
    request.claims?.[0]?.room_image_url ||
    request.requester_avatar_url
  ) || null;

  const preferredDate = request.preferred_date
    ? new Date(request.preferred_date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  const isHost      = currentUser && request.claims?.some(cl => cl.host_user_id === currentUser.id);
  const primaryHost = request.claims?.[0] || null;
  const extraHosts  = (request.claims?.length || 0) - 1;
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
          <img src="/icons/lwoIcon.webp" alt="" className="absolute inset-0 m-auto w-24 h-24 object-contain opacity-15" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/40 pointer-events-none" />

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex flex-col justify-end px-4 pt-3 pb-12 min-h-0 overflow-hidden">

        {/* Status badge — sits just above title */}
        <span className={`self-start text-xs font-semibold px-2.5 py-1 rounded-full mb-2 ${
          request.status === 'claimed'
            ? 'bg-green-500/20 text-green-300 border border-green-500/40'
            : 'bg-white/10 text-white/50 border border-white/20'
        }`}>
          {request.status === 'claimed' ? '✓ Hosted' : 'Open'}
        </span>

        <h2 className="text-white text-xl sm:text-2xl font-black leading-tight mb-1.5 line-clamp-3">
          {request.title}
        </h2>

        {request.description && (
          <p className="text-white/60 text-xs leading-relaxed mb-2 line-clamp-2">
            {request.description}
          </p>
        )}

        {preferredDate && (
          <p className="text-purple-300 text-xs mb-2">📅 {preferredDate}</p>
        )}

        {/* Compact meta: requester → host */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-white/40 text-[10px] font-semibold uppercase tracking-wide">by</span>
            <MiniAvatar url={request.requester_avatar_url} variant="purple" />
            <span className="text-white/75 text-xs font-semibold">@{request.requester_username}</span>
          </div>

          {primaryHost && (
            <>
              <span className="text-white/30 text-xs">→</span>
              <div className="flex items-center gap-1">
                <span className="text-white/40 text-[10px] font-semibold uppercase tracking-wide">host</span>
                <MiniAvatar url={primaryHost.host_avatar_url} variant="emerald" />
                <span className="text-white/75 text-xs font-semibold">@{primaryHost.host_username}</span>
                {extraHosts > 0 && <span className="text-white/40 text-[10px]">+{extraHosts}</span>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Bottom actions ────────────────────────────────────────────────────── */}
      <div className="relative z-10 px-4 pb-4 flex flex-col gap-2">

        {/* Bare icon + count row */}
        <div className="flex items-center gap-4">
          {/* Upvote */}
          <button
            onClick={handleUpvote}
            disabled={upvoting}
            className="flex items-center gap-1.5 active:scale-90 transition-transform"
          >
            {request.has_upvoted
              ? <HandThumbUpSolid className="w-5 h-5 text-purple-400 flex-shrink-0" />
              : <HandThumbUpIcon  className="w-5 h-5 text-white/60 flex-shrink-0" />}
            <span className={`font-bold text-sm tabular-nums ${request.has_upvoted ? 'text-purple-300' : 'text-white/70'}`}>
              {request.upvote_count}
            </span>
          </button>

          {/* Comment */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowComments(true); }}
            className="flex items-center gap-1.5 active:scale-90 transition-transform"
          >
            <ChatBubbleLeftIcon className="w-5 h-5 text-white/60 flex-shrink-0" />
            <span className="font-bold text-sm tabular-nums text-white/70">{totalComments}</span>
          </button>

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

      {/* ── Comment modal (portal to body, escapes overflow:hidden) ──────────── */}
      {showComments && (
        <CommentsModal
          request={request}
          currentUser={currentUser}
          comments={comments}
          setComments={setComments}
          onClose={() => setShowComments(false)}
        />
      )}
    </div>
  );
};

// ── CommentsModal ─────────────────────────────────────────────────────────────
// Renders via portal so it escapes the carousel's overflow:hidden container.

function CommentsModal({ request, currentUser, comments, setComments, onClose }) {
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo]         = useState(null); // { id, username }

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const text = commentText.trim();
    if (!text) return;
    const newComment = {
      id: Date.now(),
      username:   currentUser?.username || 'You',
      avatar_url: currentUser?.avatar_url,
      content:    text,
      parent_id:  replyTo?.id || null,
      replies:    [],
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

  const totalComments = comments.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0);

  return createPortal(
    <div className="fixed inset-0 z-[9990] flex items-end pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] pointer-events-auto"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="relative w-full pointer-events-auto flex flex-col
          bg-gray-900 border-t border-white/15 rounded-t-2xl shadow-2xl"
        style={{
          height:    '65vh',
          animation: 'crc-slide-up 0.28s cubic-bezier(0.32,0.72,0,1) forwards',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 pb-3 flex-shrink-0 border-b border-white/10">
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm truncate">{request.title}</p>
            <p className="text-white/45 text-xs mt-0.5">
              {totalComments === 0 ? 'No comments yet' : `${totalComments} comment${totalComments !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
          {comments.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-10">
              <div className="text-center">
                <ChatBubbleLeftIcon className="w-10 h-10 text-white/20 mx-auto mb-2" />
                <p className="text-white/35 text-sm">Be the first to comment</p>
              </div>
            </div>
          ) : (
            comments.map(c => (
              <div key={c.id}>
                <ThreadComment
                  comment={c}
                  onReply={() => setReplyTo({ id: c.id, username: c.username })}
                />
                {c.replies?.map(r => (
                  <ThreadComment key={r.id} comment={r} indent />
                ))}
              </div>
            ))
          )}
        </div>

        {/* Input */}
        <div className="px-4 pb-6 pt-2 flex-shrink-0 border-t border-white/10">
          {replyTo && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-purple-300 text-xs">↩ replying to @{replyTo.username}</span>
              <button
                onClick={() => setReplyTo(null)}
                className="text-white/40 text-[11px] hover:text-white/70"
              >✕</button>
            </div>
          )}
          <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2.5 border border-white/15">
            <input
              type="text"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(e); }}
              placeholder={replyTo ? `Reply to @${replyTo.username}…` : 'Add a comment…'}
              className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/30 min-w-0"
              autoFocus
            />
            <button
              onClick={handleSubmit}
              disabled={!commentText.trim()}
              className="text-purple-400 disabled:opacity-30 flex-shrink-0 active:scale-90 transition-transform"
            >
              <PaperAirplaneIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes crc-slide-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function MiniAvatar({ url, variant = 'purple' }) {
  const grad = variant === 'emerald' ? 'from-emerald-500 to-teal-500' : 'from-purple-500 to-blue-500';
  return (
    <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${grad} flex-shrink-0 overflow-hidden`}>
      {url && (
        <img src={url} alt="" className="w-full h-full object-cover"
          onError={e => { e.currentTarget.style.display = 'none'; }} />
      )}
    </div>
  );
}

function ThreadComment({ comment, onReply, indent = false }) {
  return (
    <div className={`flex items-start gap-2 rounded-xl px-3 py-2 ${indent ? 'ml-6 bg-white/5' : 'bg-white/8'}`}>
      <div className={`rounded-full flex-shrink-0 overflow-hidden mt-0.5 bg-gradient-to-br
        ${indent ? 'w-4 h-4 from-blue-500 to-purple-500' : 'w-5 h-5 from-purple-500 to-pink-500'}`}>
        {comment.avatar_url && (
          <img src={comment.avatar_url} alt="" className="w-full h-full object-cover" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-white/90 text-sm font-semibold">@{comment.username} </span>
        <span className="text-white/70 text-sm">{comment.content}</span>
      </div>
      {!indent && onReply && (
        <button
          onClick={(e) => { e.stopPropagation(); onReply(); }}
          className="text-white/35 text-xs flex-shrink-0 hover:text-white/65 pt-0.5"
        >
          reply
        </button>
      )}
    </div>
  );
}

export default CommunityRequestCard;
