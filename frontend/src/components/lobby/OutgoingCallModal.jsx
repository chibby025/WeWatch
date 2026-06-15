import React, { useEffect, useState } from 'react';
import Avatar from '../Avatar';

const EndCallIcon = () => (
  <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24" style={{ transform: 'rotate(135deg)' }}>
    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
  </svg>
);

const STATUS = {
  calling:   { color: 'text-violet-300' },
  declined:  { color: 'text-red-400' },
  busy:      { color: 'text-amber-400' },
  no_answer: { color: 'text-purple-400/60' },
};

const OutgoingCallModal = ({ isOpen, friend, onCancel, callStatus = 'calling' }) => {
  const [elapsed, setElapsed] = useState(0);
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!isOpen) { setElapsed(0); setDots(''); return; }
    if (callStatus !== 'calling') return;
    setElapsed(0);
    const elapsedInterval = setInterval(() => setElapsed(prev => prev + 1), 1000);
    const dotsInterval   = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 600);
    return () => { clearInterval(elapsedInterval); clearInterval(dotsInterval); };
  }, [isOpen, callStatus]);

  if (!isOpen) return null;

  const isCalling = callStatus === 'calling';
  const statusText = {
    calling:   `Calling${dots}`,
    declined:  'Call declined',
    busy:      'User is busy',
    no_answer: 'No answer',
  }[callStatus] ?? 'Calling';
  const statusColor = (STATUS[callStatus] ?? STATUS.calling).color;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-between py-16 px-6 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f0520] via-[#1a0a3d] to-[#0a0f1e]" />

      {/* lwoIcon watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        <img src="/icons/lwoIcon.png" alt="" className="w-96 h-96 opacity-[0.04]" style={{ filter: 'blur(6px)' }} />
      </div>

      {/* Brand icon */}
      <img src="/icons/lwoIcon.png" alt="" className="relative z-10 w-8 h-8 opacity-60" />

      {/* Friend info */}
      <div className="relative z-10 flex flex-col items-center">
        <div className="relative w-52 h-52 flex items-center justify-center">
          {isCalling && [{ size: 'w-36 h-36', delay: '0s' }, { size: 'w-44 h-44', delay: '0.7s' }, { size: 'w-52 h-52', delay: '1.4s' }].map(({ size, delay }, i) => (
            <div
              key={i}
              className={`absolute ${size} rounded-full border border-indigo-500/25 animate-ping`}
              style={{ animationDuration: '2.1s', animationDelay: delay }}
            />
          ))}
          <div className={`relative w-28 h-28 rounded-full ring-4 shadow-2xl overflow-hidden flex-shrink-0 transition-all ${isCalling ? 'ring-indigo-500/80 shadow-indigo-900/60' : 'ring-gray-600/50 shadow-gray-900/40'}`}>
            <Avatar user={friend} className="w-full h-full object-cover" />
          </div>
        </div>

        <h2 className="text-white text-3xl font-bold mt-4 tracking-tight">
          {friend?.username || 'Unknown'}
        </h2>
        <p className={`mt-2 text-sm font-medium ${statusColor}`}>{statusText}</p>
        {isCalling && <p className="text-purple-400/40 text-xs mt-1">{elapsed}s</p>}
      </div>

      {/* Cancel / Close */}
      <div className="relative z-10">
        <button onClick={onCancel} className="flex flex-col items-center gap-2.5 group" aria-label={isCalling ? 'Cancel' : 'Close'}>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-transform group-active:scale-90 group-hover:opacity-80 ${isCalling ? 'bg-red-500 shadow-red-500/40' : 'bg-gray-700 shadow-gray-900/40'}`}>
            <EndCallIcon />
          </div>
          <span className="text-white/40 text-xs">{isCalling ? 'Cancel' : 'Close'}</span>
        </button>
      </div>
    </div>
  );
};

export default OutgoingCallModal;
