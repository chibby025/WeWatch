// Shared petal-fan watch type selector used by WatchTypeModal and WatchOutModal.
import React, { useState, useEffect } from 'react';
import { FilmIcon, AcademicCapIcon, PhotoIcon } from '@heroicons/react/24/outline';

export const WATCH_TYPES = [
  { id: 'video',     name: 'Video Watch',  emoji: '🎬', color: '#38bdf8', description: 'Standard 2D video player with synchronized playback for everyone in the room.' },
  { id: '3d_cinema', name: '3D Cinema',    emoji: '🎭', color: '#3b82f6', description: 'Immersive virtual cinema with 3D seats, spatial audio, and avatar presence.' },
  { id: 'classroom', name: 'Lecture Hall', emoji: '🎓', color: '#4f46e5', description: '3D virtual lecture hall with whiteboard, quizzes, and interactive learning tools.' },
  { id: 'custom',    name: 'Custom Scene', emoji: '🖼️', color: '#7c3aed', description: 'Upload any room photo and drag the box to position the screen where you want it.' },
];

const PETAL_VIDEO_ICON = (
  <>
    <rect x="2" y="2" width="20" height="14" rx="1.5" />
    <path d="M9.5 7.5L9.5 12.5L15 10Z" />
    <line x1="2" y1="20" x2="22" y2="20" />
    <circle cx="7" cy="20" r="1.5" fill="white" />
  </>
);
const PETAL_HEROICONS = {
  '3d_cinema': FilmIcon,
  classroom:   AcademicCapIcon,
  custom:      PhotoIcon,
};

// Circle centre (80,115). Inner r=56. Outer r=100 (edge petals), r=125 (centre petals).
// Gaps: all 12°. P1:-90→-54 P2:-42→-6 P3:+6→+42 P4:+54→+90
const PETAL_PATHS = [
  'M 80,59 A 56,56 0 0,1 113,70 L 139,34 A 100,100 0 0,0 80,15 Z',
  'M 122,78 A 56,56 0 0,1 136,109 L 204,102 A 125,125 0 0,0 173,31 Z',
  'M 136,121 A 56,56 0 0,1 122,153 L 173,199 A 125,125 0 0,0 204,128 Z',
  'M 113,160 A 56,56 0 0,1 80,171 L 80,215 A 100,100 0 0,0 139,196 Z',
];
const PETAL_EMOJI_POS = [
  { x: 102, y: 47  },
  { x: 164, y: 78  },
  { x: 164, y: 152 },
  { x: 102, y: 184 },
];
const CIRCLE_IMAGES = {
  video:     '/icons/Videowatch1.webp',
  '3d_cinema': '/icons/cinema1.webp',
  classroom: '/icons/lecture1.webp',
  custom:    '/images/custom-backgrounds/Family Movie Night.webp',
};

// Props:
//   selectedTypeId  — controlled value
//   onChange(id)    — called when user taps a petal
//   showDescription — show the text description below (default true)
//   maxWidth        — SVG max-width in px (default 340)
const WatchTypePicker = ({ selectedTypeId, onChange, showDescription = true, maxWidth = 340 }) => {
  const [circlePhase, setCirclePhase] = useState('emoji');

  // Cycle: emoji → image (1 s) → emoji (2 s) on every selection change
  useEffect(() => {
    setCirclePhase('emoji');
    const t1 = setTimeout(() => setCirclePhase('image'), 1000);
    const t2 = setTimeout(() => setCirclePhase('emoji'), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [selectedTypeId]);

  const labelOpacity   = (typeId) => selectedTypeId === typeId ? 1 : 0;
  const labelFontSize  = (typeId) => selectedTypeId === typeId ? '10' : '7.5';

  const selectedType = WATCH_TYPES.find(t => t.id === selectedTypeId) ?? WATCH_TYPES[0];

  return (
    <div>
      {/* Slightly off-white so the selected-petal white glow reads correctly */}
      <div className="flex justify-center py-4 px-6 mx-4 rounded-2xl bg-gray-100">
        <svg
          viewBox="10 0 252 232"
          className="w-full"
          overflow="visible"
          style={{ maxWidth }}
          aria-label="Watch type selector"
        >
          <defs>
            <filter id="wtp-circle-shadow" x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow dx="1" dy="3" stdDeviation="5" floodColor="rgba(0,0,0,0.13)" />
            </filter>
            <filter id="wtp-petal-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="rgba(255,255,255,0.75)" />
            </filter>
            <style>{`
              @keyframes wtp-icon-bounce {
                0%, 100% { transform: scale(1) rotate(0deg); }
                30%       { transform: scale(1.35) rotate(-8deg); }
                60%       { transform: scale(1.2)  rotate(6deg); }
              }
            `}</style>
          </defs>

          {WATCH_TYPES.map((type, i) => {
            const isSelected = selectedTypeId === type.id;
            return (
              <g key={type.id} onClick={() => onChange(type.id)} style={{ cursor: 'pointer' }}>
                <path
                  d={PETAL_PATHS[i]}
                  fill={type.color}
                  stroke={type.color}
                  strokeWidth="22"
                  strokeLinejoin="round"
                  filter={isSelected ? 'url(#wtp-petal-glow)' : undefined}
                />
                {type.id === 'video' ? (
                  // Outer g: SVG transform for positioning only (no CSS conflict)
                  // Inner g: CSS animation only (no SVG transform, so keyframe scale doesn't teleport the icon)
                  <g transform={`translate(${PETAL_EMOJI_POS[i].x - 9}, ${PETAL_EMOJI_POS[i].y - 9}) scale(0.85)`}>
                    <g
                      fill="none" stroke="white" strokeWidth="1.4"
                      strokeLinecap="round" strokeLinejoin="round"
                      style={{
                        pointerEvents: 'none', userSelect: 'none',
                        transformBox: 'fill-box', transformOrigin: 'center',
                        animation: isSelected ? 'wtp-icon-bounce 1.6s ease-in-out infinite' : 'none',
                      }}
                    >
                      {PETAL_VIDEO_ICON}
                    </g>
                  </g>
                ) : (() => {
                  const HIcon = PETAL_HEROICONS[type.id];
                  const sz = 20;
                  return (
                    <foreignObject
                      x={PETAL_EMOJI_POS[i].x - sz / 2}
                      y={PETAL_EMOJI_POS[i].y - sz / 2}
                      width={sz} height={sz}
                      style={{ pointerEvents: 'none', userSelect: 'none', overflow: 'visible' }}
                    >
                      <HIcon style={{
                        width: sz, height: sz, color: 'white', display: 'block',
                        transformOrigin: 'center',
                        animation: isSelected ? 'wtp-icon-bounce 1.6s ease-in-out infinite' : 'none',
                      }} />
                    </foreignObject>
                  );
                })()}
              </g>
            );
          })}

          {/* Centre circle — scales up when showing image */}
          <g
            style={{
              transform: circlePhase === 'image' ? 'scale(1.2)' : 'scale(1)',
              transformBox: 'fill-box',
              transformOrigin: 'center',
              transition: 'transform 0.4s cubic-bezier(0.34, 1.2, 0.64, 1)',
              pointerEvents: 'none',
            }}
          >
            <circle cx="80" cy="115" r="56" fill="white" filter="url(#wtp-circle-shadow)" />
            <foreignObject x="24" y="59" width="112" height="112" style={{ overflow: 'hidden' }}>
              <img
                src={CIRCLE_IMAGES[selectedTypeId] || CIRCLE_IMAGES.video}
                alt=""
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'cover',
                  borderRadius: '50%',
                  display: 'block',
                  opacity: circlePhase === 'image' ? 1 : 0,
                  transition: 'opacity 0.35s ease',
                }}
              />
            </foreignObject>
          </g>

          {/* Outer petal labels — show all for 1s on mount, then only selected stays */}
          <text x="142" y="7" textAnchor="middle" dominantBaseline="central" fontSize={labelFontSize('video')} fontWeight="700" fill="#38bdf8"
            style={{ pointerEvents: 'none', userSelect: 'none', opacity: labelOpacity('video'), transition: 'opacity 0.4s ease, font-size 0.3s ease' }}>
            Video Watch
          </text>
          <text x="216" y="70" textAnchor="start" dominantBaseline="central" fontSize={labelFontSize('3d_cinema')} fontWeight="700" fill="#3b82f6"
            style={{ pointerEvents: 'none', userSelect: 'none', opacity: labelOpacity('3d_cinema'), transition: 'opacity 0.4s ease, font-size 0.3s ease' }}>
            3D Cinema
          </text>
          <text x="216" y="158" textAnchor="start" dominantBaseline="central" fontSize={labelFontSize('classroom')} fontWeight="700" fill="#4f46e5"
            style={{ pointerEvents: 'none', userSelect: 'none', opacity: labelOpacity('classroom'), transition: 'opacity 0.4s ease, font-size 0.3s ease' }}>
            Lecture Hall
          </text>
          <text x="140" y="226" textAnchor="middle" dominantBaseline="central" fontSize={labelFontSize('custom')} fontWeight="700" fill="#7c3aed"
            style={{ pointerEvents: 'none', userSelect: 'none', opacity: labelOpacity('custom'), transition: 'opacity 0.4s ease, font-size 0.3s ease' }}>
            Custom Scene
          </text>

          {/* Emoji + label — fade out during image phase */}
          <text x="80" y="111" textAnchor="middle" dominantBaseline="central" fontSize="26"
            style={{ pointerEvents: 'none', userSelect: 'none', opacity: circlePhase === 'emoji' ? 1 : 0, transition: 'opacity 0.3s ease' }}>
            {selectedType.emoji}
          </text>
          <text x="80" y="131" textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight="600" fill="#6b7280"
            style={{ pointerEvents: 'none', userSelect: 'none', opacity: circlePhase === 'emoji' ? 1 : 0, transition: 'opacity 0.3s ease' }}>
            {selectedType.name}
          </text>
        </svg>
      </div>

      {showDescription && (
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed text-center px-5 pt-3 pb-1">
          {selectedType.description}
        </p>
      )}
    </div>
  );
};

export default WatchTypePicker;
