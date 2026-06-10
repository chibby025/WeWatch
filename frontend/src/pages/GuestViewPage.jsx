import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../services/api';

// ─── Screen coordinates (% of image dimensions) ──────────────────────────────
// These map to where the screens sit in /public/icons/guestview.webp.
// Adjust after seeing the first render — small tweaks, not a rebuild.
const S = {
  center: { top: 3,  left: 24, width: 50, height: 28 },
  left:   { top: 7,  left: 1,  width: 21, height: 19 },
  right:  { top: 14, left: 76, width: 15, height: 14 },
};

// SVG mask: white = keep image visible, black = transparent (video shows through)
const MASK = (() => {
  const { top, left, width, height } = S.center;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">` +
    `<rect x="0" y="0" width="100" height="100" fill="white"/>` +
    `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="black"/>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();

// ─── TV Static ────────────────────────────────────────────────────────────────
// Canvas-based random noise drawn at 12fps. Scales up with image-rendering: pixelated.
function TvStatic({ style }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx   = canvas.getContext('2d');
    canvas.width  = 64;
    canvas.height = 48;

    let rafId, lastT = 0;
    const draw = (t) => {
      rafId = requestAnimationFrame(draw);
      if (t - lastT < 83) return; // ~12 fps
      lastT = t;
      const img = ctx.createImageData(64, 48);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = (Math.random() * 180 + 40) | 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 210;
      }
      ctx.putImageData(img, 0, 0);
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', imageRendering: 'pixelated', zIndex: 2, ...style }}
    />
  );
}

// ─── Chat ticker ──────────────────────────────────────────────────────────────
// Cycles through messages one at a time with a slide-fade transition.
function ChatTicker({ messages }) {
  const [idx, setIdx]       = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!messages?.length) return;
    const iv = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % messages.length);
        setVisible(true);
      }, 350);
    }, 4500);
    return () => clearInterval(iv);
  }, [messages?.length]);

  const msg = messages?.[idx];
  if (!msg) return null;

  const username = msg.Username || msg.username || '';
  const message  = msg.Message  || msg.message  || '';

  return (
    <div
      style={{
        position:      'absolute',
        top:           `${S.center.top + S.center.height - 7}%`,
        left:          `${S.center.left}%`,
        width:         `${S.center.width}%`,
        zIndex:        20,
        pointerEvents: 'none',
        overflow:      'hidden',
      }}
    >
      <div
        style={{
          background:     'linear-gradient(to right, rgba(0,0,0,0.78), rgba(0,0,0,0.55))',
          backdropFilter: 'blur(3px)',
          padding:        '3px 8px',
          display:        'flex',
          alignItems:     'center',
          gap:            6,
          opacity:        visible ? 1 : 0,
          transform:      visible ? 'translateY(0)' : 'translateY(4px)',
          transition:     'opacity 0.3s ease, transform 0.3s ease',
        }}
      >
        <span style={{ color: '#f87171', fontSize: 9, fontWeight: 700, flexShrink: 0, letterSpacing: 1 }}>
          LIVE
        </span>
        <span style={{ color: '#c4b5fd', fontSize: 10, fontWeight: 600, flexShrink: 0, maxWidth: '35%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {username}:
        </span>
        <span style={{ color: '#e5e7eb', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {message}
        </span>
      </div>
    </div>
  );
}

// ─── Guest View Page ──────────────────────────────────────────────────────────
export default function GuestViewPage() {
  const { sessionId } = useParams();
  const navigate      = useNavigate();

  const [session,  setSession]  = useState(null);
  const [messages, setMessages] = useState([]);
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(true);

  // Fetch session metadata once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get(`/api/guest/sessions/${sessionId}`);
        if (!cancelled) setSession(res.data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || 'Session not available');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Poll chat every 5s once session is confirmed
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await apiClient.get(`/api/guest/sessions/${sessionId}/chat`);
        if (!cancelled) setMessages(res.data.messages || []);
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [session, sessionId]);

  // ── Loading screen ──
  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // ── Error / private / ended screen ──
  if (error) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-5 p-6 text-center">
        <div className="text-5xl select-none">📺</div>
        <div>
          <p className="text-white font-semibold text-base">Session unavailable</p>
          <p className="text-white/40 text-sm mt-1 max-w-xs">{error}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/register')}
            className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-sm font-semibold transition-all"
          >
            Join free
          </button>
          <button
            onClick={() => navigate('/login')}
            className="px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-sm font-medium transition-colors"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  // ── Paid session — don't show the guest view, go straight to sign-in prompt ──
  if (session?.is_paid) {
    const title = session.session_title || session.room_name || 'Live Session';
    const count = session.member_count || 0;
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-5 p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-700 to-indigo-700 flex items-center justify-center text-3xl select-none shadow-xl">
          🎟️
        </div>
        <div>
          <p className="text-white font-bold text-lg leading-snug">{title}</p>
          {count > 0 && (
            <p className="text-white/40 text-xs mt-1">{count} {count === 1 ? 'person' : 'people'} watching</p>
          )}
          <p className="text-white/50 text-sm mt-3 max-w-xs leading-relaxed">
            This is a ticketed session. Sign in to purchase access and join the watch.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/register')}
            className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-sm font-semibold transition-all"
          >
            Join free
          </button>
          <button
            onClick={() => navigate('/login')}
            className="px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-sm font-medium transition-colors"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  const canPlayVideo = session?.media_url && session?.media_type !== 'liveshare';
  const title        = session?.session_title || session?.room_name || 'Live Session';
  const count        = session?.member_count  || 0;

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center overflow-hidden select-none">

      {/* ─── Viewing center composite ─────────────────────────────────────── */}
      <div
        className="relative w-full flex-shrink-0"
        style={{ maxWidth: 430, aspectRatio: '3 / 4' }}
      >
        {/* Live video — sits behind image, aligned to center screen */}
        {canPlayVideo ? (
          <video
            src={session.media_url}
            autoPlay
            muted
            playsInline
            style={{
              position:   'absolute',
              top:        `${S.center.top}%`,
              left:       `${S.center.left}%`,
              width:      `${S.center.width}%`,
              height:     `${S.center.height}%`,
              objectFit:  'cover',
              zIndex:     1,
              background: '#000',
            }}
          />
        ) : (
          <div
            style={{
              position:        'absolute',
              top:             `${S.center.top}%`,
              left:            `${S.center.left}%`,
              width:           `${S.center.width}%`,
              height:          `${S.center.height}%`,
              zIndex:          1,
              background:      'linear-gradient(135deg, #1e1b4b, #312e81)',
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              fontSize:        24,
            }}
          >
            📺
          </div>
        )}

        {/* TV static — left screen */}
        <TvStatic
          style={{
            top:    `${S.left.top}%`,
            left:   `${S.left.left}%`,
            width:  `${S.left.width}%`,
            height: `${S.left.height}%`,
          }}
        />

        {/* TV static — right screen */}
        <TvStatic
          style={{
            top:    `${S.right.top}%`,
            left:   `${S.right.left}%`,
            width:  `${S.right.width}%`,
            height: `${S.right.height}%`,
          }}
        />

        {/* Viewing center image — overlaid on top, center screen punched out via SVG mask */}
        <img
          src="/icons/guestview.webp"
          alt=""
          draggable={false}
          style={{
            position:        'absolute',
            inset:           0,
            width:           '100%',
            height:          '100%',
            objectFit:       'fill',
            zIndex:          10,
            pointerEvents:   'none',
            maskImage:       MASK,
            WebkitMaskImage: MASK,
            maskSize:        '100% 100%',
            WebkitMaskSize:  '100% 100%',
          }}
        />

        {/* Live viewer count badge — top-left of center screen */}
        {count > 0 && (
          <div
            style={{
              position:     'absolute',
              top:          `${S.center.top + 1}%`,
              left:         `${S.center.left + 1.5}%`,
              zIndex:       20,
              background:   'rgba(0,0,0,0.6)',
              borderRadius: 4,
              padding:      '2px 6px',
              display:      'flex',
              alignItems:   'center',
              gap:          4,
              pointerEvents:'none',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block flex-shrink-0" />
            <span style={{ color: '#fff', fontSize: 9, fontWeight: 600 }}>{count}</span>
          </div>
        )}

        {/* Chat ticker — bottom edge of center screen */}
        <ChatTicker messages={messages} />

        {/* Bottom vignette — softens the "look inside" transition */}
        <div
          style={{
            position:      'absolute',
            bottom:        0,
            left:          0,
            right:         0,
            height:        '20%',
            background:    'linear-gradient(to top, rgba(0,0,0,0.75), transparent)',
            zIndex:        15,
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* ─── CTA panel — below the image ──────────────────────────────────── */}
      <div
        className="w-full flex-1 flex flex-col justify-between px-5 pt-4 pb-7"
        style={{ maxWidth: 430 }}
      >
        {/* Session info */}
        <div>
          <p className="text-white font-bold text-base leading-snug line-clamp-1">{title}</p>
          <p className="text-white/40 text-xs mt-0.5">
            {count > 0
              ? `${count} ${count === 1 ? 'person' : 'people'} watching`
              : 'Live now'}
            {session?.room_name && session?.session_title
              ? ` · ${session.room_name}`
              : ''}
          </p>
          {messages.length > 0 && (
            <p className="text-white/25 text-xs mt-1.5">
              💬 {messages.length} messages — sign up to join the conversation
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={() => navigate('/register')}
            className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-purple-900/40 active:scale-95"
          >
            Watch inside — Join free →
          </button>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-3 bg-white/10 hover:bg-white/15 text-white rounded-xl text-sm font-medium transition-colors active:scale-95"
          >
            Sign in
          </button>
        </div>
      </div>

    </div>
  );
}
