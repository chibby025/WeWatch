// src/components/VolumeControl.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/solid';

const MAX_GAIN = 3.0; // 300% max via Web Audio API gain node
const DUCK_MULTIPLIER = 0.4; // 40% of current volume when mic is active
const DUCK_RAMP_TIME = 0.5; // seconds to ramp duck in/out

export default function VolumeControl({ videoRef, iconVisible, ducked = false }) {
  // Always start at 100% unmuted — no localStorage persistence
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const gainNodeRef = useRef(null);
  const audioCtxRef = useRef(null);
  const panelRef = useRef(null);
  const baseGainRef = useRef(1.0); // gain before ducking (set by volume/mute effect)
  const duckedRef = useRef(false);  // mirrors ducked prop; read by volume effect to avoid dep

  // Wire up Web Audio API gain node — called on first user interaction so
  // AudioContext creation is gated on a gesture (browser policy).
  const ensureGainNode = useCallback(() => {
    const video = videoRef?.current;
    if (!video || gainNodeRef.current) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaElementSource(video);
      const gain = ctx.createGain();
      src.connect(gain);
      gain.connect(ctx.destination);
      audioCtxRef.current = ctx;
      gainNodeRef.current = gain;
      // Apply current ducking state immediately on creation
      gain.gain.value = baseGainRef.current * (duckedRef.current ? DUCK_MULTIPLIER : 1.0);
    } catch {
      // Already connected, CORS restriction, or unsupported — fall back to
      // native video.volume only (max 100%).
    }
  }, [videoRef]);

  // Apply volume + mute to video element and base gain (instant, no ramp).
  // Reads duckedRef so ducking changes don't re-run this effect.
  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;
    if (isMuted) {
      video.muted = true;
      baseGainRef.current = 0;
      if (gainNodeRef.current) gainNodeRef.current.gain.value = 0;
      return;
    }
    video.muted = false;
    if (volume <= 1.0) {
      video.volume = volume;
      baseGainRef.current = 1.0;
    } else {
      video.volume = 1.0;
      baseGainRef.current = volume;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = baseGainRef.current * (duckedRef.current ? DUCK_MULTIPLIER : 1.0);
    }
  }, [volume, isMuted, videoRef]);

  // Smooth duck/unduck ramp — fires specifically when ducked prop changes.
  useEffect(() => {
    duckedRef.current = ducked;
    const gain = gainNodeRef.current;
    const ctx = audioCtxRef.current;
    if (!gain || !ctx) return;
    const target = baseGainRef.current * (ducked ? DUCK_MULTIPLIER : 1.0);
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(target, ctx.currentTime + DUCK_RAMP_TIME);
  }, [ducked]);

  // Sync hardware volume changes (e.g. media keys, OS volume buttons) to slider state.
  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;
    const handleVolumeChange = () => {
      // Use functional setters to only update when the value actually changed,
      // preventing a loop when our own code sets video.volume.
      setVolume(prev => {
        const newVol = video.muted ? prev : video.volume;
        return Math.abs(newVol - prev) > 0.01 ? newVol : prev;
      });
      setIsMuted(prev => (prev !== video.muted ? video.muted : prev));
    };
    video.addEventListener('volumechange', handleVolumeChange);
    return () => video.removeEventListener('volumechange', handleVolumeChange);
  }, [videoRef]);

  // Close panel on click outside
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e) => {
      if (!panelRef.current?.contains(e.target)) setPanelOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [panelOpen]);

  // Cleanup AudioContext on unmount
  useEffect(() => () => { audioCtxRef.current?.close(); }, []);

  const handleIconClick = () => {
    ensureGainNode();
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
    setPanelOpen(v => !v);
  };

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (v > 0 && isMuted) setIsMuted(false);
    if (v > 1.0) ensureGainNode();
  };

  const effectiveVolume = isMuted ? 0 : volume;
  const displayPct = Math.round(effectiveVolume * 100);
  const normalMarkPct = (1.0 / MAX_GAIN) * 100; // ~33.3% of the 300% range

  const show = iconVisible || panelOpen;

  return (
    <div ref={panelRef} className="absolute top-2 right-2 z-50 flex flex-col items-end gap-1">
      {/* Volume panel — opens on icon click */}
      {panelOpen && (
        <div className="bg-black/85 backdrop-blur-md rounded-xl px-3 pt-3 pb-4 flex flex-col items-center gap-2 shadow-xl border border-white/10 mb-1 min-w-[52px]">
          {/* Percentage */}
          <span className={`text-xs font-semibold tabular-nums ${displayPct > 100 ? 'text-purple-400' : 'text-white'}`}>
            {displayPct}%
          </span>

          {/* Vertical slider — 0 to 300% */}
          <div className="relative flex flex-col items-center">
            <input
              type="range"
              min="0"
              max={MAX_GAIN}
              step="0.05"
              value={effectiveVolume}
              onChange={handleVolumeChange}
              className="volume-slider-v cursor-pointer"
              style={{ writingMode: 'bt-lr', WebkitAppearance: 'slider-vertical', height: '120px', width: '4px' }}
              aria-label="Volume"
            />
            {/* 100% tick mark */}
            <div
              className="absolute right-full mr-1 w-2 h-px bg-white/30"
              style={{ bottom: `${normalMarkPct}%` }}
              title="100%"
            />
          </div>

          {/* Mute toggle */}
          <button
            onClick={() => setIsMuted(m => !m)}
            className="text-white/70 hover:text-white text-base transition-colors"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? '🔇' : effectiveVolume < 0.5 ? '🔉' : '🔊'}
          </button>
        </div>
      )}

      {/* Volume icon — larger on mobile */}
      <button
        onClick={handleIconClick}
        title={`Volume: ${displayPct}%${ducked ? ' (mic active — ducked)' : ''}`}
        aria-label="Volume"
        className={`w-9 h-9 sm:w-8 sm:h-8 rounded-full flex items-center justify-center bg-black/60 hover:bg-black/80 text-white shadow-lg transition-opacity duration-300 ${show ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        {isMuted || volume === 0
          ? <SpeakerXMarkIcon className="w-5 h-5 sm:w-4 sm:h-4" />
          : <SpeakerWaveIcon className="w-5 h-5 sm:w-4 sm:h-4" />
        }
      </button>

      <style>{`
        .volume-slider-v::-webkit-slider-thumb {
          appearance: none;
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: #a855f7;
          cursor: pointer;
          transition: background 0.15s, transform 0.15s;
        }
        .volume-slider-v::-webkit-slider-thumb:hover {
          background: #c084fc;
          transform: scale(1.25);
        }
        .volume-slider-v::-moz-range-thumb {
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: #a855f7;
          cursor: pointer;
          border: none;
          transition: background 0.15s;
        }
        .volume-slider-v::-moz-range-thumb:hover { background: #c084fc; }
      `}</style>
    </div>
  );
}
