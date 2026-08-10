import React, { useEffect, useRef, useState } from 'react';
import Avatar from '../Avatar';

const RINGTONE_URL = 'https://letswatchout.b-cdn.net/sounds/incoming-ring.wav';

const PhoneIcon = () => (
  <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
  </svg>
);

const EndCallIcon = () => (
  <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24" style={{ transform: 'rotate(135deg)' }}>
    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
  </svg>
);

const IncomingCallModal = ({ isOpen, caller, onAccept, onDecline }) => {
  const [elapsed, setElapsed] = useState(0);
  const ringRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setElapsed(0);
    const interval = setInterval(() => setElapsed(prev => prev + 1), 1000);
    const timeout = setTimeout(() => onDecline?.(), 60000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [isOpen, onDecline]);

  // Ringtone loops for as long as the modal stays open (accept/decline/timeout
  // all close it via isOpen going false, which stops the loop here too).
  useEffect(() => {
    if (!isOpen) return;
    const audio = new Audio(RINGTONE_URL);
    audio.loop = true;
    audio.volume = 0.6;
    ringRef.current = audio;
    audio.play().catch(e => console.warn('Ringtone play failed:', e));
    return () => {
      audio.pause();
      ringRef.current = null;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-between py-16 px-6 overflow-hidden">
      {/* Dark purple/indigo gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f0520] via-[#1a0a3d] to-[#0a0f1e]" />

      {/* lwoIcon watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        <img src="/icons/lwoIcon.png" alt="" className="w-96 h-96 opacity-[0.04]" style={{ filter: 'blur(6px)' }} />
      </div>

      {/* Brand icon */}
      <img src="/icons/lwoIcon.png" alt="" className="relative z-10 w-8 h-8 opacity-60" />

      {/* Caller */}
      <div className="relative z-10 flex flex-col items-center">
        <div className="relative w-52 h-52 flex items-center justify-center">
          {/* Concentric pulsing rings */}
          {[{ size: 'w-36 h-36', delay: '0s' }, { size: 'w-44 h-44', delay: '0.7s' }, { size: 'w-52 h-52', delay: '1.4s' }].map(({ size, delay }, i) => (
            <div
              key={i}
              className={`absolute ${size} rounded-full border border-violet-500/25 animate-ping`}
              style={{ animationDuration: '2.1s', animationDelay: delay }}
            />
          ))}
          {/* Avatar */}
          <div className="relative w-28 h-28 rounded-full ring-4 ring-violet-500/80 shadow-2xl shadow-violet-900/60 overflow-hidden flex-shrink-0">
            <Avatar user={caller} className="w-full h-full object-cover" />
          </div>
        </div>

        <h2 className="text-white text-3xl font-bold mt-4 tracking-tight">
          {caller?.username || 'Unknown'}
        </h2>
        <p className="text-violet-300 mt-2 text-sm font-medium">Incoming call</p>
        <p className="text-purple-400/40 text-xs mt-1">{elapsed}s / 60s</p>
      </div>

      {/* Decline / Accept */}
      <div className="relative z-10 flex items-end gap-20">
        <button onClick={onDecline} className="flex flex-col items-center gap-2.5 group" aria-label="Decline">
          <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/40 transition-transform group-active:scale-90 group-hover:bg-red-400">
            <EndCallIcon />
          </div>
          <span className="text-white/40 text-xs">Decline</span>
        </button>

        <button onClick={onAccept} className="flex flex-col items-center gap-2.5 group" aria-label="Accept">
          <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/40 transition-transform group-active:scale-90 group-hover:bg-green-400">
            <PhoneIcon />
          </div>
          <span className="text-white/40 text-xs">Accept</span>
        </button>
      </div>
    </div>
  );
};

export default IncomingCallModal;
