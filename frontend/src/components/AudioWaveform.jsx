// frontend/src/components/AudioWaveform.jsx
import React from 'react';

/**
 * Simple 3-bar audio waveform animation
 * Bars scale based on audio level (0-255)
 * 
 * @param {number} audioLevel - Audio level from 0-255
 * @param {string} color - Bar color (default: green)
 */
export default function AudioWaveform({ audioLevel = 0, color = '#10b981' }) {
  // Normalize audio level to 0-1 range
  const normalizedLevel = Math.min(audioLevel / 255, 1);
  
  // 🔍 Debug: Log audioLevel changes
  React.useEffect(() => {
    if (audioLevel > 0) {
      console.log('🎨 [AudioWaveform] audioLevel changed:', audioLevel, 'normalized:', normalizedLevel);
    }
  }, [audioLevel, normalizedLevel]);
  
  // Calculate bar heights with better scaling (minimum 10%, maximum 100%)
  // Use quadratic scaling for more dramatic effect at low volumes
  const scaledLevel = Math.pow(normalizedLevel, 0.7); // Makes lower values more visible
  const lowHeight = 10 + (scaledLevel * 90);  // 10-100%
  const midHeight = 15 + (scaledLevel * 85);  // 15-100%
  const highHeight = 10 + (scaledLevel * 90); // 10-100%
  
  return (
    <div className="flex items-center gap-0.5 h-6">
      {/* Low bar */}
      <div 
        className="w-1 bg-green-500 rounded-full transition-all duration-100"
        style={{ 
          height: `${lowHeight}%`,
          backgroundColor: color,
          animation: 'pulse-bar 0.5s ease-in-out infinite',
          animationDelay: '0s'
        }}
      />
      
      {/* Mid bar */}
      <div 
        className="w-1 bg-green-500 rounded-full transition-all duration-100"
        style={{ 
          height: `${midHeight}%`,
          backgroundColor: color,
          animation: 'pulse-bar 0.5s ease-in-out infinite',
          animationDelay: '0.15s'
        }}
      />
      
      {/* High bar */}
      <div 
        className="w-1 bg-green-500 rounded-full transition-all duration-100"
        style={{ 
          height: `${highHeight}%`,
          backgroundColor: color,
          animation: 'pulse-bar 0.5s ease-in-out infinite',
          animationDelay: '0.3s'
        }}
      />
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
