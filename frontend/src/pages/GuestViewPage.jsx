import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient, { getAssetUrl } from '../services/api';

// ─── Screen coordinates (% of container) ─────────────────────────────────────
const S = {
  center: { top: 16.5, left: 50, width: 33, height: 13 },
  left:   { top: 18, left: 27.5, width: 15, height: 6  },
  right:  { top: 17, left: 88,  width: 12.5, height: 6  },
};


// Keyframe CSS injected once
const ANIM_CSS = `
  @keyframes gvBreathe {
    0%,100% { background-position: 0% 50%; }
    50%      { background-position: 100% 50%; }
  }
  @keyframes gvScan {
    from { background-position: 0 0; }
    to   { background-position: 0 60px; }
  }
  @keyframes gvPulse {
    0%,100% { opacity: 0.55; }
    50%      { opacity: 0.85; }
  }
  .gv-vol-slider {
    -webkit-appearance: none;
    appearance: none;
    outline: none;
    border-radius: 4px;
    cursor: pointer;
  }
  .gv-vol-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px; height: 14px;
    border-radius: 50%;
    background: #a855f7;
    cursor: pointer;
    transition: background 0.2s, transform 0.2s;
  }
  .gv-vol-slider::-webkit-slider-thumb:hover { background: #c084fc; transform: scale(1.2); }
  .gv-vol-slider::-moz-range-thumb {
    width: 14px; height: 14px;
    border-radius: 50%;
    background: #a855f7;
    cursor: pointer;
    border: none;
    transition: background 0.2s, transform 0.2s;
  }
  .gv-vol-slider::-moz-range-thumb:hover { background: #c084fc; transform: scale(1.2); }
  @keyframes gvTicker {
    0%   { transform: translateX(105%); opacity: 0; }
    10%  { transform: translateX(0);    opacity: 1; }
    80%  { transform: translateX(0);    opacity: 1; }
    100% { transform: translateX(-105%); opacity: 0; }
  }
`;

// ─── TvStatic ─────────────────────────────────────────────────────────────────
function TvStatic({ style }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
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
        img.data[i + 3] = 215;
      }
      ctx.putImageData(img, 0, 0);
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', imageRendering: 'pixelated', zIndex: 20, ...style }}
    />
  );
}

// ─── ColorBars (SMPTE-style test card) ───────────────────────────────────────
const BARS = ['#b4b4b4', '#b4b400', '#00b4b4', '#00b400', '#b400b4', '#b40000', '#0000b4', '#141414'];
function ColorBars({ style }) {
  return (
    <div style={{ position: 'absolute', zIndex: 20, display: 'flex', overflow: 'hidden', ...style }}>
      {BARS.map((c, i) => (
        <div key={i} style={{ flex: 1, height: '100%', background: c }} />
      ))}
    </div>
  );
}

// ─── ScanLines (animated blue-purple horizontal scan) ────────────────────────
function ScanLines({ style }) {
  return (
    <div style={{ position: 'absolute', zIndex: 20, overflow: 'hidden', ...style }}>
      {/* Base gradient */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, #1a0a3a 0%, #0d1a3a 50%, #1a0a3a 100%)',
        backgroundSize: '100% 200%',
        animation: 'gvBreathe 3s ease infinite',
      }} />
      {/* Scan lines */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'repeating-linear-gradient(transparent 0px, transparent 3px, rgba(120,80,220,0.25) 3px, rgba(120,80,220,0.25) 4px)',
        animation: 'gvScan 1.2s linear infinite',
      }} />
      {/* Horizontal bright sweep */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, transparent 40%, rgba(180,140,255,0.12) 50%, transparent 60%)',
        animation: 'gvPulse 2s ease-in-out infinite',
      }} />
    </div>
  );
}

// ─── SideScreen ───────────────────────────────────────────────────────────────
// animType: 'static' | 'bars' | 'scanlines'
// mirrorSrc: if truthy, show mirrored video instead of animation
function SideScreen({ screenStyle, animType, mirrorSrc }) {
  const videoRef = useRef(null);

  // Sync mirror video when src changes
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !mirrorSrc) return;
    el.src = mirrorSrc;
    el.load();
    el.play().catch(() => {});
  }, [mirrorSrc]);

  if (mirrorSrc) {
    return (
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        loop
        style={{
          position:   'absolute',
          objectFit:  'cover',
          zIndex:     20,
          filter:     'brightness(0.5) saturate(0.35) blur(0.5px)',
          ...screenStyle,
        }}
      />
    );
  }

  if (animType === 'bars')      return <ColorBars style={screenStyle} />;
  if (animType === 'scanlines') return <ScanLines style={screenStyle} />;
  return <TvStatic style={screenStyle} />;
}

// ─── CenterScreen ─────────────────────────────────────────────────────────────
// Sits at z:20. videoRef is forwarded from parent for volume/fullscreen control.
// Videos are rendered muted for autoplay; parent unmutes via ref after play starts.
function CenterScreen({ mediaUrl, previewUrl, posterUrl, videoRef, onClick }) {
  const pos = {
    position:  'absolute',
    top:       `${S.center.top}%`,
    left:      `${S.center.left}%`,
    width:     `${S.center.width}%`,
    height:    `${S.center.height}%`,
    objectFit: 'cover',
    zIndex:    20,
    cursor:    'pointer',
  };

  if (mediaUrl) {
    return <video ref={videoRef} src={mediaUrl} autoPlay muted playsInline onClick={onClick} style={{ ...pos, background: '#000' }} />;
  }

  if (previewUrl) {
    return <video ref={videoRef} src={previewUrl} autoPlay loop muted playsInline onClick={onClick} style={{ ...pos, background: '#000' }} />;
  }

  if (posterUrl) {
    return (
      <>
        <img src={posterUrl} alt="" style={{ ...pos, cursor: 'default' }} />
        <div style={{
          ...pos,
          background:     'linear-gradient(135deg, #2d1b69, #1e3a5f, #1e1b4b, #2d1b69)',
          backgroundSize: '300% 300%',
          animation:      'gvBreathe 4s ease infinite',
          opacity:        0.55,
        }} />
      </>
    );
  }

  // Fallback: TV static
  return <TvStatic style={{ top: `${S.center.top}%`, left: `${S.center.left}%`, width: `${S.center.width}%`, height: `${S.center.height}%` }} />;
}

// ─── ChatTicker ───────────────────────────────────────────────────────────────
// Rendered inside the gradient overlay — no absolute positioning.
// Each message gets a full 4.5s animation cycle: slide in → hold → slide out.
// key={idx} remounts the inner div, restarting the animation for each new message.
function ChatTicker({ messages }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!messages?.length) return;
    const t = setTimeout(() => setIdx(i => (i + 1) % messages.length), 4500);
    return () => clearTimeout(t);
  }, [idx, messages?.length]);

  const msg = messages?.[idx];
  if (!msg) return null;

  const username = msg.Username || msg.username || '';
  const message  = msg.Message  || msg.message  || '';

  return (
    <div style={{ overflow: 'hidden', height: 20, marginBottom: 10, pointerEvents: 'none' }}>
      <div
        key={idx}
        style={{
          animation:  'gvTicker 4.5s ease-in-out forwards',
          display:    'flex',
          alignItems: 'center',
          gap:        6,
          whiteSpace: 'nowrap',
          height:     '100%',
        }}
      >
        <span style={{ color: '#a78bfa', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          {username}:
        </span>
        <span style={{ color: 'rgba(255,255,255,0.88)', fontSize: 11 }}>
          {message}
        </span>
      </div>
    </div>
  );
}

// ─── Crowd ambience (Web Audio synthesis — no audio files needed) ─────────────
// Starts on first user interaction (browser autoplay policy).
// Continuous low murmur + random applause bursts every 15–50s.
// Independent of video mute — it's atmospheric, not media audio.
function useCrowdAmbience() {
  useEffect(() => {
    let audioCtx = null;
    let murmurSrc = null;
    let burstTimeout = null;
    let started = false;

    const buildNoiseBuffer = (ctx) => {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    };

    const start = () => {
      if (started) return;
      started = true;

      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      // Firefox sometimes starts AudioContext suspended even inside a gesture handler
      audioCtx.resume();
      const buf = buildNoiseBuffer(audioCtx);

      // ── Continuous crowd murmur ──
      murmurSrc = audioCtx.createBufferSource();
      murmurSrc.buffer = buf;
      murmurSrc.loop = true;
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 480; lp.Q.value = 0.8;
      const mg = audioCtx.createGain(); mg.gain.value = 0.07;
      murmurSrc.connect(lp); lp.connect(mg); mg.connect(audioCtx.destination);
      murmurSrc.start();

      // ── Random applause burst — 3 layered bandpass noise sources ──
      const burst = () => {
        if (!audioCtx) return;
        [1100, 1700, 2400].forEach((freq, i) => {
          const s = audioCtx.createBufferSource(); s.buffer = buf;
          const f = audioCtx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.55;
          const g = audioCtx.createGain();
          const t = audioCtx.currentTime + i * 0.13;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.18, t + 0.09);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
          s.connect(f); f.connect(g); g.connect(audioCtx.destination);
          s.start(t); s.stop(t + 2.2);
        });
      };

      const schedule = () => {
        burstTimeout = setTimeout(() => { burst(); schedule(); }, 15000 + Math.random() * 35000);
      };
      // First burst after 8–20s so it feels natural
      burstTimeout = setTimeout(() => { burst(); schedule(); }, 8000 + Math.random() * 12000);
    };

    document.addEventListener('pointerdown', start, { once: true });
    return () => {
      document.removeEventListener('pointerdown', start);
      clearTimeout(burstTimeout);
      try { murmurSrc?.stop(); } catch {}
      audioCtx?.close();
    };
  }, []);
}

// ─── GuestViewPage ────────────────────────────────────────────────────────────
export default function GuestViewPage() {
  const { sessionId } = useParams();
  const navigate      = useNavigate();

  useCrowdAmbience();

  const [session,     setSession]     = useState(null);
  const [messages,    setMessages]    = useState([]);
  const [error,       setError]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [volume,      setVolume]      = useState(0.8);
  const [muted,       setMuted]       = useState(false);
  const [showVolume,  setShowVolume]  = useState(false);
  const centerVideoRef = useRef(null);
  const volTimeoutRef  = useRef(null);

  const openVolume = () => {
    setShowVolume(true);
    clearTimeout(volTimeoutRef.current);
    volTimeoutRef.current = setTimeout(() => setShowVolume(false), 3000);
  };
  const keepVolOpen = () => {
    clearTimeout(volTimeoutRef.current);
    volTimeoutRef.current = setTimeout(() => setShowVolume(false), 3000);
  };

  // After autoplay starts (browser requires muted), unmute and set volume via ref
  useEffect(() => {
    const el = centerVideoRef.current;
    if (!el) return;
    const onPlay = () => {
      el.muted  = false;
      el.volume = volume;
    };
    el.addEventListener('play', onPlay, { once: true });
    return () => el.removeEventListener('play', onPlay);
  });

  // Keep volume/muted in sync whenever they change
  useEffect(() => {
    const el = centerVideoRef.current;
    if (!el) return;
    el.muted  = muted;
    el.volume = muted ? 0 : volume;
  }, [volume, muted]);

  const handleCenterClick = (e) => {
    e.stopPropagation();
    const el = centerVideoRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen?.();
    }
  };

  // Randomly assign animation types once on mount.
  // Guarantee: at least one side always shows TV static.
  const [leftAnim, rightAnim] = useMemo(() => {
    const alts = ['static', 'bars', 'scanlines'];
    const alt  = alts[Math.floor(Math.random() * alts.length)];
    // Randomly decide which side gets forced-static vs random
    return Math.random() < 0.5 ? ['static', alt] : [alt, 'static'];
  }, []);

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

  // Poll session liveness every 15s — redirect to explore when host ends it
  useEffect(() => {
    if (!session) return;
    const iv = setInterval(async () => {
      try {
        await apiClient.get(`/api/guest/sessions/${sessionId}`);
      } catch (err) {
        if (err.response?.status === 404) {
          setError('__ended__');
        }
      }
    }, 15000);
    return () => clearInterval(iv);
  }, [session, sessionId]);

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

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (error === '__ended__') {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-5 p-6 text-center">
        <div className="text-5xl select-none">🎬</div>
        <div>
          <p className="text-white font-bold text-base">That's a wrap!</p>
          <p className="text-white/40 text-sm mt-1 max-w-xs">Sign up and LetsWatchOut — never miss a live watch again.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/explore')} className="px-5 py-2.5 bg-white/10 text-white rounded-xl text-sm font-medium">
            Browse more
          </button>
          <button onClick={() => navigate('/register')} className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-sm font-semibold">
            Join free →
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-5 p-6 text-center">
        <div className="text-5xl select-none">📺</div>
        <div>
          <p className="text-white font-semibold text-base">Session unavailable</p>
          <p className="text-white/40 text-sm mt-1 max-w-xs">{error}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/register')} className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-sm font-semibold">
            Join free
          </button>
          <button onClick={() => navigate('/login')} className="px-5 py-2.5 bg-white/10 text-white rounded-xl text-sm font-medium">
            Sign in
          </button>
        </div>
      </div>
    );
  }

  // Paid sessions go straight to sign-in prompt
  if (session?.is_paid) {
    const title = session.session_title || session.room_name || 'Live Session';
    const count = session.member_count || 0;
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-5 p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-700 to-indigo-700 flex items-center justify-center text-3xl select-none shadow-xl">🎟️</div>
        <div>
          <p className="text-white font-bold text-lg leading-snug">{title}</p>
          {count > 0 && <p className="text-white/40 text-xs mt-1">{count} {count === 1 ? 'person' : 'people'} watching</p>}
          <p className="text-white/50 text-sm mt-3 max-w-xs leading-relaxed">This is a ticketed session. Sign in to purchase access and join the watch.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/register')} className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-sm font-semibold">Join free</button>
          <button onClick={() => navigate('/login')} className="px-5 py-2.5 bg-white/10 text-white rounded-xl text-sm font-medium">Sign in</button>
        </div>
      </div>
    );
  }

  const canPlayVideo = !!(
    session?.media_url &&
    session?.media_type !== 'liveshare' &&
    session?.media_type !== 'watchfrom'
  );

  const mediaUrl   = canPlayVideo ? getAssetUrl(session.media_url)   : '';
  const previewUrl = !canPlayVideo ? getAssetUrl(session.preview_url) : '';
  const posterUrl  = getAssetUrl(session.poster_url);

  // Side screens mirror the main screen only when direct video is playing
  const mirrorSrc = canPlayVideo ? mediaUrl : '';

  const title = session?.session_title || session?.room_name || 'Live Session';
  const count = session?.member_count  || 0;

  const leftStyle  = { top: `${S.left.top}%`,  left: `${S.left.left}%`,  width: `${S.left.width}%`,  height: `${S.left.height}%`  };
  const rightStyle = { top: `${S.right.top}%`, left: `${S.right.left}%`, width: `${S.right.width}%`, height: `${S.right.height}%` };

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center overflow-hidden select-none">

      {/* Inject keyframe animations */}
      <style>{ANIM_CSS}</style>

      {/* ─── Composite viewing area ──────────────────────────────────────────── */}
      <div className="relative w-full" style={{ maxWidth: 430, flex: '1 1 0', minHeight: 0 }}>

        {/* Center screen content */}
        <CenterScreen
          mediaUrl={mediaUrl}
          previewUrl={previewUrl}
          posterUrl={posterUrl}
          videoRef={centerVideoRef}
          onClick={handleCenterClick}
        />

        {/* Side screens */}
        <SideScreen screenStyle={leftStyle}  animType={leftAnim}  mirrorSrc={mirrorSrc} />
        <SideScreen screenStyle={rightStyle} animType={rightAnim} mirrorSrc={mirrorSrc} />

        {/* Room image overlay — all screen content sits above this at z:20 */}
        <img
          src="/icons/guestview.webp"
          alt=""
          draggable={false}
          style={{
            position:      'absolute',
            inset:         0,
            width:         '100%',
            height:        '100%',
            objectFit:     'fill',
            zIndex:        10,
            pointerEvents: 'none',
          }}
        />


        {/* Volume control — right edge, icon only until clicked */}
        {(mediaUrl || previewUrl) && (
          <div
            style={{
              position:  'absolute',
              right:     8,
              top:       '50%',
              transform: 'translateY(-50%)',
              zIndex:    50,
              display:   'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
            onMouseEnter={showVolume ? keepVolOpen : undefined}
          >
            {showVolume ? (
              <div
                style={{
                  background:     'rgba(0,0,0,0.82)',
                  backdropFilter: 'blur(12px)',
                  borderRadius:   12,
                  padding:        '12px 10px',
                  display:        'flex',
                  flexDirection:  'column',
                  alignItems:     'center',
                  gap:            10,
                  boxShadow:      '0 4px 24px rgba(0,0,0,0.5)',
                  border:         '1px solid rgba(255,255,255,0.1)',
                }}
                onPointerMove={keepVolOpen}
              >
                <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>
                  {muted ? '0%' : `${Math.round(volume * 100)}%`}
                </span>

                {/* Rotated horizontal slider — works in all browsers including Firefox */}
                <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <input
                    type="range"
                    min="0" max="1" step="0.01"
                    value={muted ? 0 : volume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setVolume(v);
                      setMuted(v === 0);
                      keepVolOpen();
                    }}
                    className="gv-vol-slider"
                    style={{
                      width:      120,
                      height:     4,
                      transform:  'rotate(-90deg)',
                      background: `linear-gradient(to right, #a855f7 ${Math.round((muted ? 0 : volume) * 100)}%, #4b5563 ${Math.round((muted ? 0 : volume) * 100)}%)`,
                    }}
                    aria-label="Volume"
                  />
                </div>

                <button
                  onClick={() => { setMuted(m => !m); keepVolOpen(); }}
                  style={{ fontSize: 20, background: 'none', border: 'none', cursor: 'pointer' }}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                >
                  {muted || volume === 0 ? '🔇' : volume < 0.4 ? '🔉' : '🔊'}
                </button>

                <button
                  onClick={() => setShowVolume(false)}
                  style={{
                    color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 16, width: 22, height: 22,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4,
                  }}
                  aria-label="Close"
                >×</button>
              </div>
            ) : (
              <button
                onClick={openVolume}
                style={{
                  background:   'rgba(124,58,237,0.75)',
                  border:       '1px solid rgba(167,139,250,0.5)',
                  borderRadius: 8,
                  padding:      '6px 7px',
                  cursor:       'pointer',
                  fontSize:     16,
                  lineHeight:   1,
                  color:        '#fff',
                  boxShadow:    '0 2px 8px rgba(124,58,237,0.4)',
                }}
                aria-label="Volume"
              >
                {muted || volume === 0 ? '🔇' : volume < 0.4 ? '🔉' : '🔊'}
              </button>
            )}
          </div>
        )}

        {/* Bottom overlay — gradient + ticker + title + CTA buttons */}
        <div style={{
          position:      'absolute',
          bottom:        0,
          left:          0,
          right:         0,
          zIndex:        30,
          background:    'linear-gradient(to top, rgba(0,0,0,0.93) 0%, rgba(0,0,0,0.65) 55%, transparent 100%)',
          padding:       '40px 18px 28px',
          pointerEvents: 'none',
        }}>
          <div style={{ pointerEvents: 'auto' }}>
            {/* Chat ticker — slides right to left just above room details */}
            {messages.length > 0 && <ChatTicker messages={messages} />}
            <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, lineHeight: 1.3, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginBottom: 14 }}>
              {count > 0 ? `${count} ${count === 1 ? 'person' : 'people'} watching` : 'Live now'}
              {session?.room_name && session?.session_title ? ` · ${session.room_name}` : ''}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => navigate('/register')}
                style={{
                  flex: 1, padding: '11px 0',
                  background: 'linear-gradient(to right, #7c3aed, #4f46e5)',
                  color: '#fff', fontWeight: 700, fontSize: 13,
                  border: 'none', borderRadius: 12, cursor: 'pointer',
                }}
              >
                Watch inside — Join free →
              </button>
              <button
                onClick={() => navigate('/login')}
                style={{
                  padding: '11px 16px',
                  background: 'rgba(255,255,255,0.12)',
                  color: '#fff', fontSize: 13, fontWeight: 500,
                  border: 'none', borderRadius: 12, cursor: 'pointer',
                }}
              >
                Sign in
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
