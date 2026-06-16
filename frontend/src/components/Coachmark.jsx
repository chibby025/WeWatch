// WeWatch/frontend/src/components/Coachmark.jsx
// Reusable spotlight tour: dims the screen except a cutout around a target DOM ref,
// shows a caption near it, and steps through a sequence. Used for one-time contextual
// tours (Room Page header, VideoWatch share/invite, cinema Settings) that point at
// real on-screen buttons rather than explaining them in the abstract.
import React, { useEffect, useState, useRef } from 'react';

const TOOLTIP_WIDTH = 260;
const PAD = 8;

function getRect(ref) {
  if (!ref?.current) return null;
  const r = ref.current.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return r;
}

export default function Coachmark({ steps, onComplete }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState(null);

  // Callers pass `steps` as a fresh array literal on every render of often-busy parent
  // components (RoomPageNew, VideoWatch's SettingsModal). Reading through a ref — rather
  // than depending on that array's identity — keeps the effect below from re-running on
  // every unrelated parent re-render, which previously reset the retry counter before it
  // could ever find the target or give up.
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const step = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;

  useEffect(() => {
    let cancelled = false;
    let timeoutId;
    let attempts = 0;

    const check = () => {
      if (cancelled) return;
      const target = stepsRef.current[stepIdx];
      const r = target ? getRect(target.ref) : null;
      if (r) {
        setRect(r);
        return;
      }
      attempts += 1;
      if (attempts >= 5) {
        // Target never mounted (e.g. hidden by a state change) — skip past it.
        if (stepIdx >= stepsRef.current.length - 1) onComplete();
        else setStepIdx(i => i + 1);
        return;
      }
      timeoutId = setTimeout(check, 200);
    };
    check();

    const onLayoutChange = () => {
      const target = stepsRef.current[stepIdx];
      const r = target ? getRect(target.ref) : null;
      if (r) setRect(r);
    };
    window.addEventListener('resize', onLayoutChange);
    window.addEventListener('scroll', onLayoutChange, true);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      window.removeEventListener('resize', onLayoutChange);
      window.removeEventListener('scroll', onLayoutChange, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  if (!step || !rect) return null;

  const next = () => {
    if (isLast) onComplete();
    else { setRect(null); setStepIdx(i => i + 1); }
  };

  const spotlightStyle = {
    position: 'fixed',
    top: rect.top - PAD,
    left: rect.left - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
    borderRadius: 16,
    boxShadow: '0 0 0 9999px rgba(0,0,0,0.78)',
    border: '2px solid white',
    pointerEvents: 'none',
    zIndex: 10000,
    transition: 'top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease',
  };

  const spaceBelow = window.innerHeight - rect.bottom;
  const placeBelow = spaceBelow > 170;
  const idealLeft = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
  const tooltipLeft = Math.min(Math.max(idealLeft, 12), window.innerWidth - TOOLTIP_WIDTH - 12);

  const tooltipStyle = {
    position: 'fixed',
    width: TOOLTIP_WIDTH,
    left: tooltipLeft,
    ...(placeBelow
      ? { top: rect.bottom + 16 }
      : { bottom: window.innerHeight - rect.top + 16 }),
  };

  return (
    <div className="fixed inset-0 z-[10000]">
      <div style={spotlightStyle} />
      <div
        className="bg-gray-950 border border-gray-700 rounded-2xl shadow-2xl p-4 z-[10001] animate-fade-in"
        style={tooltipStyle}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-gray-500 font-medium">{stepIdx + 1} / {steps.length}</span>
          <button onClick={onComplete} className="text-[10px] text-gray-500 hover:text-gray-300 font-medium">
            Skip
          </button>
        </div>
        <h4 className="text-sm font-bold text-white mb-1">{step.title}</h4>
        <p className="text-xs text-gray-400 leading-relaxed mb-3">{step.description}</p>
        <button
          onClick={next}
          className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
        >
          {isLast ? 'Got it' : 'Next →'}
        </button>
      </div>
    </div>
  );
}
