// frontend/src/components/NetworkQualityBanner.jsx
import { useEffect, useState } from 'react';

// Non-intrusive pill that slides in from top when network is poor.
// Disappears automatically. Shows a brief "improved" confirmation on recovery.
export default function NetworkQualityBanner({ quality }) {
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState('hidden'); // 'poor' | 'recovering' | 'hidden'

  useEffect(() => {
    if (quality === 'poor') {
      setPhase('poor');
      setShow(true);
    } else if (quality === 'recovering') {
      setPhase('recovering');
      setShow(true);
    } else {
      setShow(false);
    }
  }, [quality]);

  return (
    <div
      className={`
        fixed top-4 left-1/2 z-[10000] pointer-events-none
        flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium shadow-xl
        transition-all duration-300 ease-out
        ${show ? 'opacity-100 -translate-x-1/2 translate-y-0' : 'opacity-0 -translate-x-1/2 -translate-y-3'}
        ${phase === 'poor'
          ? 'bg-orange-950/95 border border-orange-500/40 text-orange-200'
          : 'bg-green-950/95 border border-green-500/40 text-green-200'}
      `}
    >
      {phase === 'poor' ? (
        <>
          <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse flex-shrink-0" />
          Poor network connection
        </>
      ) : (
        <>
          <span className="text-green-400 flex-shrink-0">✓</span>
          Network improved
        </>
      )}
    </div>
  );
}
