// frontend/src/components/AudioWaveform.jsx
import React from 'react';

/**
 * Simple 3-bar audio waveform animation
 * Bars scale based on audio level (0-255)
 * 
 * @param {number} audioLevel - Audio level from 0-255
 * @param {string} color - Bar color (default: green)
 */
// 5-bar bell-curve profile (short-tall-tallest-tall-short) instead of 3 equal
// bars — reads as a fuller, more natural waveform shape both at rest and at
// full volume, rather than a flat 3-block meter.
const BAR_PROFILE = [0.45, 0.75, 1, 0.75, 0.45];
const BAR_DELAYS = ['0s', '0.1s', '0.2s', '0.1s', '0s'];

export default function AudioWaveform({ audioLevel = 0, color = '#10b981' }) {
  // Normalize audio level to 0-1 range
  const normalizedLevel = Math.min(audioLevel / 255, 1);
  // Use quadratic scaling for more dramatic effect at low volumes
  const scaledLevel = Math.pow(normalizedLevel, 0.7); // Makes lower values more visible

  return (
    <div className="flex items-end gap-[3px] h-9">
      {BAR_PROFILE.map((mult, i) => {
        const height = Math.max(6, mult * (15 + scaledLevel * 85)); // 15-100% range, shaped by the bell curve, floored so a bar is always visible
        return (
          <div
            key={i}
            className="w-[3px] rounded-full transition-all duration-100"
            style={{
              height: `${height}%`,
              background: `linear-gradient(to top, ${color}, ${color}cc)`,
              boxShadow: `0 0 4px ${color}80`,
              animation: 'pulse-bar 0.6s ease-in-out infinite',
              animationDelay: BAR_DELAYS[i],
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Enhanced 3-bar waveform for taskbar audio button
 * Fills the icon with 3 dynamic levels that create a volume meter effect
 */
export function TaskbarAudioWaveform({ audioLevel = 0 }) {
  const normalizedLevel = Math.min(audioLevel / 255, 1);
  const scaledLevel = Math.pow(normalizedLevel, 0.6); // Slightly more aggressive scaling
  
  // 3-level bars with dramatic height differences (creates "filling" effect)
  // Low bar: 20-60% (base level)
  // Mid bar: 30-80% (medium level)  
  // High bar: 40-95% (peak level)
  const lowBarHeight = 20 + (scaledLevel * 40);   // 20-60%
  const midBarHeight = 30 + (scaledLevel * 50);   // 30-80%
  const highBarHeight = 40 + (scaledLevel * 55);  // 40-95%
  
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-0.5 pointer-events-none">
      {/* Low bar (left) */}
      <div 
        className="w-1 bg-green-400 rounded-sm transition-all duration-100"
        style={{ 
          height: `${lowBarHeight}%`,
          animation: 'pulse-bar 0.5s ease-in-out infinite',
          animationDelay: '0s',
          opacity: scaledLevel > 0.1 ? 1 : 0.3
        }}
      />
      
      {/* Mid bar (center) - tallest for visual prominence */}
      <div 
        className="w-1 bg-green-400 rounded-sm transition-all duration-100"
        style={{ 
          height: `${midBarHeight}%`,
          animation: 'pulse-bar 0.5s ease-in-out infinite',
          animationDelay: '0.1s',
          opacity: scaledLevel > 0.05 ? 1 : 0.3
        }}
      />
      
      {/* High bar (right) */}
      <div 
        className="w-1 bg-green-400 rounded-sm transition-all duration-100"
        style={{ 
          height: `${highBarHeight}%`,
          animation: 'pulse-bar 0.5s ease-in-out infinite',
          animationDelay: '0.2s',
          opacity: scaledLevel > 0.15 ? 1 : 0.3
        }}
      />
    </div>
  );
}
