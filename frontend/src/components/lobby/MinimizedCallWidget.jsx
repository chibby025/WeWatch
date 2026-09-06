// frontend/src/components/lobby/MinimizedCallWidget.jsx
// Shared minimized-call widget for 1-on-1 lobby calls — a small, draggable,
// vertical rectangle showing both participants' avatars stacked, matching
// the WhatsApp/Snapchat minimized-call pattern. Used by both
// OutgoingCallModal (ringing) and ActiveCallInterface (connected) — same
// component, different status text/pulse styling driven by `isRinging`.
//
// Drag mechanics (Pointer Events, tap-vs-drag threshold, viewport clamping)
// deliberately mirror Taskbar.jsx's own already-proven "minimize to
// draggable square" implementation rather than reinventing it — same shape,
// different visual.
import React, { useRef, useState, useEffect } from 'react';
import Avatar from '../Avatar';

const WIDGET_WIDTH = 88;
const WIDGET_HEIGHT = 176;
const DRAG_THRESHOLD = 4;

const EndCallIcon = () => (
  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24" style={{ transform: 'rotate(135deg)' }}>
    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
  </svg>
);

export default function MinimizedCallWidget({
  selfUser,
  otherUser,
  statusText,     // e.g. "Calling…" or a formatted "1:23" duration
  isRinging = false,
  onExpand,       // tap (not drag) restores the fullscreen view
  onEndCall,
}) {
  const [pos, setPos] = useState(null); // null until first render sizes the viewport
  const dragRef = useRef(null);

  const clampToViewport = (x, y) => ({
    x: Math.min(Math.max(x, 8), window.innerWidth - WIDGET_WIDTH - 8),
    y: Math.min(Math.max(y, 8), window.innerHeight - WIDGET_HEIGHT - 8),
  });

  // Default spot: bottom-right, same corner convention Taskbar's own
  // minimized square already uses, so a user finds both in the same place.
  useEffect(() => {
    if (pos) return;
    setPos(clampToViewport(window.innerWidth - WIDGET_WIDTH - 16, window.innerHeight - WIDGET_HEIGHT - 90));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos?.x ?? 0,
      originY: pos?.y ?? 0,
      moved: false,
    };
  };
  const handlePointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) drag.moved = true;
    setPos(clampToViewport(drag.originX + dx, drag.originY + dy));
  };
  const handlePointerUp = (e) => {
    const drag = dragRef.current;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (!drag?.moved) onExpand?.(); // a tap (no real drag) restores the full screen
  };

  if (!pos) return null;

  return (
    <div
      className="fixed z-[9999] rounded-2xl shadow-2xl border border-white/10 bg-gradient-to-b from-[#1a0a3d] to-[#0a0f1e] flex flex-col items-center py-3 px-2 cursor-grab active:cursor-grabbing select-none touch-none"
      style={{ left: pos.x, top: pos.y, width: WIDGET_WIDTH, height: WIDGET_HEIGHT }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Self avatar — smaller, dimmed: "you" */}
      <div className="relative w-9 h-9 rounded-full ring-2 ring-white/20 overflow-hidden flex-shrink-0 opacity-70">
        <Avatar user={selfUser} className="w-full h-full object-cover" />
      </div>

      {/* Connecting line between the two avatars */}
      <div className="w-px flex-1 min-h-[10px] bg-white/15 my-1" />

      {/* Other person's avatar — larger, the focus of the call */}
      <div className={`relative w-14 h-14 rounded-full ring-2 shadow-lg overflow-hidden flex-shrink-0 ${
        isRinging ? 'ring-violet-500/80 shadow-violet-900/50' : 'ring-green-500/80 shadow-green-900/50'
      }`}>
        <Avatar user={otherUser} className="w-full h-full object-cover" />
        {isRinging && (
          <div className="absolute inset-0 rounded-full border-2 border-violet-400 animate-ping opacity-60" />
        )}
      </div>

      <p className="text-white text-[10px] font-semibold mt-1.5 text-center truncate w-full leading-tight">
        {otherUser?.username || 'Unknown'}
      </p>
      <p className={`text-[9px] mt-0.5 ${isRinging ? 'text-violet-300' : 'text-green-400'}`}>
        {statusText}
      </p>

      <button
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onEndCall?.(); }}
        className="mt-1.5 w-7 h-7 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-md shadow-red-500/40 transition-colors flex-shrink-0"
        aria-label="End call"
      >
        <EndCallIcon />
      </button>
    </div>
  );
}
