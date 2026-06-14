import React, { useEffect, useRef, useState, useCallback } from 'react';
import { XMarkIcon, ArrowRightIcon, FilmIcon, AcademicCapIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { useGLTF } from '@react-three/drei';
import { uploadCustomBackground } from '../services/api';

// ── Canvas compression — max 1280×720, JPEG 0.82 ─────────────────────────────
function compressImage(source, maxW = 1280, maxH = 720, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(source instanceof Blob ? source : new Blob([source]));
    img.onload = () => {
      let { width, height } = img;
      const ratio = Math.min(maxW / width, maxH / height, 1);
      width  = Math.round(width  * ratio);
      height = Math.round(height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('compression failed')),
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('image load failed')); };
    img.src = objectUrl;
  });
}

// ── Suggestion scenes ─────────────────────────────────────────────────────────
const SUGGESTIONS = [
  { name: 'Living Room',        file: 'LivingRoom.webp',                  emoji: '🛋️' },
  { name: 'Family Movie Night', file: 'Family Movie Night.webp',          emoji: '🍿' },
  { name: 'Retro Cinema',       file: 'Retro cinema interior.jpg',        emoji: '🎬' },
  { name: 'Backyard Cinema',    file: 'Backyard projector cinema.webp',   emoji: '🌃' },
  { name: 'Drive-In Theater',   file: 'Drive-in theater.webp',            emoji: '🚗' },
  { name: 'Kid Watching TV',    file: 'Kid watching TV.webp',             emoji: '📺' },
];

// ── Watch type definitions ────────────────────────────────────────────────────
const WATCH_TYPES = [
  { id: 'video',     name: 'Video Watch',  emoji: '🎬', color: '#38bdf8', description: 'Standard 2D video player with synchronized playback for everyone in the room.' },
  { id: '3d_cinema', name: '3D Cinema',    emoji: '🎭', color: '#3b82f6', description: 'Immersive virtual cinema with 3D seats, spatial audio, and avatar presence.' },
  { id: 'classroom', name: 'Lecture Hall', emoji: '🎓', color: '#4f46e5', description: '3D virtual lecture hall with whiteboard, quizzes, and interactive learning tools.' },
  { id: 'custom',    name: 'Custom Scene', emoji: '🖼️', color: '#7c3aed', description: 'Upload any room photo and drag the box to position the screen where you want it.' },
];

// ── Petal icons
// video: custom inline SVG (screen + play + scrubber — approved)
// others: Heroicons outline rendered via foreignObject
const PETAL_VIDEO_ICON = (
  <>
    <rect x="2" y="2" width="20" height="14" rx="1.5" />
    <path d="M9.5 7.5L9.5 12.5L15 10Z" />
    <line x1="2" y1="20" x2="22" y2="20" />
    <circle cx="7" cy="20" r="1.5" fill="white" />
  </>
);
const PETAL_HEROICONS = {
  '3d_cinema': FilmIcon,       // film strip = cinema
  classroom:   AcademicCapIcon, // graduation cap = lecture hall
  custom:      PhotoIcon,       // photo frame = custom scene
};

// ── SVG semicircle petal geometry ─────────────────────────────────────────────
// Circle centre: (80, 115). Inner r=56. Outer r=100 (edge), r=125 (centre).
//
// Petal widths reduced by 5% (38°→36°). Each gap-facing edge pulls inward ~1°.
// Resulting gaps: all 12° (symmetric).
//   P1: -90° → -54°   P2: -42° → -6°
//   P3: +6°  → +42°   P4: +54° → +90°
//
// Inner pts (r=56):
//   -90°=(80,59)    -54°=(113,70)   -42°=(122,78)   -6°=(136,109)
//   +6°=(136,121)   +42°=(122,153)  +54°=(113,160)  +90°=(80,171)
//
// Outer pts P1/P4 (r=100): -90°=(80,15)   -54°=(139,34)   +54°=(139,196)  +90°=(80,215)
// Outer pts P2/P3 (r=125): -42°=(173,31)  -6°=(204,102)   +6°=(204,128)   +42°=(173,199)
//
// Rounded outer corners: stroke={fill color} strokeWidth=22 strokeLinejoin="round"
const PETAL_PATHS = [
  'M 80,59 A 56,56 0 0,1 113,70 L 139,34 A 100,100 0 0,0 80,15 Z',            // P1 -90°→-54°  r=100
  'M 122,78 A 56,56 0 0,1 136,109 L 204,102 A 125,125 0 0,0 173,31 Z',         // P2 -42°→-6°   r=125
  'M 136,121 A 56,56 0 0,1 122,153 L 173,199 A 125,125 0 0,0 204,128 Z',       // P3 +6°→+42°   r=125
  'M 113,160 A 56,56 0 0,1 80,171 L 80,215 A 100,100 0 0,0 139,196 Z',         // P4 +54°→+90°  r=100
];
// Emoji: r≈72 for edge petals, r≈92 for centre petals (bisectors: -72°, -24°, +24°, +72°)
const PETAL_EMOJI_POS = [
  { x: 102, y: 47  },
  { x: 164, y: 78  },
  { x: 164, y: 152 },
  { x: 102, y: 184 },
];


// ── Region picker ─────────────────────────────────────────────────────────────
function RegionPicker({ imageUrl, box, onChange }) {
  const containerRef = useRef(null);
  const dragRef      = useRef(null);
  const MIN = 0.08;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const startDrag = useCallback((e, handle) => {
    e.preventDefault();
    const rect    = containerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragRef.current = { handle, startX: clientX, startY: clientY, startBox: { ...box }, rectW: rect.width, rectH: rect.height };
  }, [box]);

  const onMove = useCallback((e) => {
    if (!dragRef.current) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const { handle, startX, startY, startBox, rectW, rectH } = dragRef.current;
    const dx = (clientX - startX) / rectW;
    const dy = (clientY - startY) / rectH;
    let { x, y, w, h } = startBox;

    switch (handle) {
      case 'move':
        x = clamp(x + dx, 0, 1 - w);
        y = clamp(y + dy, 0, 1 - h);
        break;
      case 'tl': { const nx = clamp(x + dx, 0, x + w - MIN); const ny = clamp(y + dy, 0, y + h - MIN); w = w + (x - nx); h = h + (y - ny); x = nx; y = ny; break; }
      case 'tr': { const ny = clamp(y + dy, 0, y + h - MIN); w = clamp(startBox.w + dx, MIN, 1 - x); h = h + (y - ny); y = ny; break; }
      case 'bl': { const nx = clamp(x + dx, 0, x + w - MIN); w = w + (x - nx); x = nx; h = clamp(startBox.h + dy, MIN, 1 - y); break; }
      case 'br': w = clamp(startBox.w + dx, MIN, 1 - x); h = clamp(startBox.h + dy, MIN, 1 - y); break;
      default: break;
    }
    onChange({ x, y, w, h });
  }, [onChange]);

  const onEnd = useCallback(() => { dragRef.current = null; }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend',  onEnd);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend',  onEnd);
    };
  }, [onMove, onEnd]);

  const HS = 18; // handle size px
  const handles = [
    { id: 'tl', s: { top: -HS/2, left:  -HS/2, cursor: 'nw-resize' } },
    { id: 'tr', s: { top: -HS/2, right: -HS/2, cursor: 'ne-resize' } },
    { id: 'bl', s: { bottom: -HS/2, left:  -HS/2, cursor: 'sw-resize' } },
    { id: 'br', s: { bottom: -HS/2, right: -HS/2, cursor: 'se-resize' } },
  ];

  return (
    <div ref={containerRef} className="relative w-full select-none overflow-hidden rounded-lg bg-black" style={{ aspectRatio: '16/9' }}>
      <img src={imageUrl} alt="background" className="absolute inset-0 w-full h-full object-cover" draggable={false} />

      {/* Dimmed strips outside the box */}
      {[
        { top: 0, left: 0, right: 0, height: `${box.y * 100}%` },
        { bottom: 0, left: 0, right: 0, height: `${(1 - box.y - box.h) * 100}%` },
        { top: `${box.y * 100}%`, left: 0, width: `${box.x * 100}%`, height: `${box.h * 100}%` },
        { top: `${box.y * 100}%`, right: 0, width: `${(1 - box.x - box.w) * 100}%`, height: `${box.h * 100}%` },
      ].map((s, i) => (
        <div key={i} className="absolute bg-black/60 pointer-events-none" style={s} />
      ))}

      {/* Screen box */}
      <div
        className="absolute"
        style={{ left: `${box.x*100}%`, top: `${box.y*100}%`, width: `${box.w*100}%`, height: `${box.h*100}%`, border: '2px solid rgba(255,255,255,0.9)', boxSizing: 'border-box' }}
      >
        {/* Move zone */}
        <div className="absolute inset-0" style={{ cursor: 'move' }} onMouseDown={e => startDrag(e, 'move')} onTouchStart={e => startDrag(e, 'move')} />
        {/* Label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-white/80 text-xs font-semibold bg-black/40 px-2 py-0.5 rounded select-none">📺 Screen</span>
        </div>
        {/* Corner handles */}
        {handles.map(h => (
          <div key={h.id} onMouseDown={e => startDrag(e, h.id)} onTouchStart={e => startDrag(e, h.id)}
            className="absolute bg-white rounded-sm border-2 border-purple-500"
            style={{ width: HS, height: HS, ...h.s, zIndex: 10 }} />
        ))}
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
const WatchTypeModal = ({ isOpen, onClose, onSelectType, title = "Choose Watch Experience" }) => {
  const [step, setStep]               = useState(1);
  const [previewUrl, setPreviewUrl]   = useState(null);   // local object URL for RegionPicker
  const [uploadedUrl, setUploadedUrl] = useState(null);   // server URL after upload
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [loadingSuggestion, setLoadingSuggestion] = useState(null); // suggestion filename being loaded
  const [box, setBox] = useState({ x: 0.20, y: 0.20, w: 0.55, h: 0.45 });
  const [selectedTypeId, setSelectedTypeId] = useState('video');
  const [circlePhase, setCirclePhase]       = useState('emoji'); // 'emoji' | 'image'

  const uploadInputRef  = useRef(null); // regular file picker
  const cameraInputRef  = useRef(null); // camera capture

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep(1); setPreviewUrl(null); setUploadedUrl(null);
      setIsUploading(false); setUploadError(''); setLoadingSuggestion(null);
      setBox({ x: 0.20, y: 0.20, w: 0.55, h: 0.45 });
      setSelectedTypeId('video');
    }
  }, [isOpen]);

  // Preload 3D models while modal is open
  useEffect(() => {
    if (isOpen) { useGLTF.preload('/models/cinema.glb'); useGLTF.preload('/models/lecture_hall.glb'); }
  }, [isOpen]);

  // Cycle: emoji → image (1 s) → emoji (2 s) on every petal change
  useEffect(() => {
    if (!isOpen) return;
    setCirclePhase('emoji');
    const t1 = setTimeout(() => setCirclePhase('image'), 1000);
    const t2 = setTimeout(() => setCirclePhase('emoji'), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [selectedTypeId, isOpen]);

  if (!isOpen) return null;

  // Shared pipeline: compress → upload → set preview + uploadedUrl
  const processBlob = async (blob, localObjectUrl) => {
    setUploadError('');
    setPreviewUrl(localObjectUrl);
    setUploadedUrl(null);
    setIsUploading(true);
    try {
      const compressed = await compressImage(blob);
      const data = await uploadCustomBackground(compressed);
      setUploadedUrl(data.url);
    } catch {
      setUploadError('Upload failed — please try again.');
      setPreviewUrl(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processBlob(file, URL.createObjectURL(file));
    e.target.value = ''; // reset so same file can be re-selected
  };

  const handleSuggestionClick = async (suggestion) => {
    if (loadingSuggestion) return;
    setLoadingSuggestion(suggestion.file);
    setUploadError('');
    try {
      const url = `/images/custom-backgrounds/${encodeURIComponent(suggestion.file)}`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      // Show local preview immediately, then compress + upload in background
      const localUrl = URL.createObjectURL(blob);
      await processBlob(blob, localUrl);
    } catch {
      setUploadError('Could not load suggestion — try uploading your own photo.');
    } finally {
      setLoadingSuggestion(null);
    }
  };

  const handleStartCustomSession = () => {
    if (!uploadedUrl) return;
    onSelectType('custom', { backgroundUrl: uploadedUrl, region: box });
  };

  const selectedType = WATCH_TYPES.find(t => t.id === selectedTypeId) ?? WATCH_TYPES[0];

  // ── Step 2: Custom scene setup ─────────────────────────────────────────────
  if (step === 2) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 sm:p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto custom-sleek-scrollbar">
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white p-3 sm:p-5">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <button onClick={() => setStep(1)} className="text-white/80 hover:text-white p-1" aria-label="Back">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="text-lg sm:text-xl font-bold">Custom Scene Setup</h2>
              </div>
              <button onClick={onClose} className="text-white hover:text-gray-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-amber-100 mt-1 text-xs sm:text-sm">Pick a scene, then drag the box to where the screen should appear</p>
          </div>

          <div className="p-4 sm:p-6 space-y-5">

            {!previewUrl ? (
              <>
                {/* Camera + Upload buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-amber-400 hover:bg-amber-50 transition-colors group"
                  >
                    <span className="text-2xl">📷</span>
                    <span className="text-sm font-semibold text-gray-600 group-hover:text-amber-600">Take Photo</span>
                    <span className="text-xs text-gray-400">Use your camera</span>
                  </button>
                  <button
                    onClick={() => uploadInputRef.current?.click()}
                    className="flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-amber-400 hover:bg-amber-50 transition-colors group"
                  >
                    <span className="text-2xl">🖼️</span>
                    <span className="text-sm font-semibold text-gray-600 group-hover:text-amber-600">Upload Photo</span>
                    <span className="text-xs text-gray-400">From your device</span>
                  </button>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400 font-medium">or choose a scene</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                {/* Suggestion thumbnails */}
                <div className="grid grid-cols-3 gap-2">
                  {SUGGESTIONS.map((s) => {
                    const isLoading = loadingSuggestion === s.file;
                    return (
                      <button
                        key={s.file}
                        onClick={() => handleSuggestionClick(s)}
                        disabled={!!loadingSuggestion}
                        className="relative rounded-lg overflow-hidden aspect-video group focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-60"
                      >
                        <img
                          src={`/images/custom-backgrounds/${encodeURIComponent(s.file)}`}
                          alt={s.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          loading="lazy"
                        />
                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-white text-xs font-semibold px-1 text-center">{s.name}</span>
                        </div>
                        {/* Loading spinner */}
                        {isLoading && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                        {/* Emoji badge */}
                        <div className="absolute top-1 left-1 text-sm leading-none">{s.emoji}</div>
                      </button>
                    );
                  })}
                </div>

                {uploadError && <p className="text-sm text-red-500 text-center">{uploadError}</p>}
              </>
            ) : (
              <>
                {/* Region picker */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700">Drag the box to position the screen</p>
                    <button
                      onClick={() => { setPreviewUrl(null); setUploadedUrl(null); }}
                      className="text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                      Change photo
                    </button>
                  </div>

                  <RegionPicker imageUrl={previewUrl} box={box} onChange={setBox} />

                  <p className="text-xs text-gray-400 text-center">Drag corners to resize · drag center to move</p>

                  {isUploading && (
                    <div className="flex items-center gap-2 text-xs text-amber-600">
                      <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                      Compressing and uploading…
                    </div>
                  )}
                  {uploadError && <p className="text-sm text-red-500">{uploadError}</p>}
                </div>
              </>
            )}

            {/* Hidden inputs */}
            <input ref={cameraInputRef}  type="file" accept="image/*" capture   className="hidden" onChange={handleFileSelected} />
            <input ref={uploadInputRef}  type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileSelected} />

            {/* Start button — only shown once image is ready */}
            {previewUrl && (
              <button
                onClick={handleStartCustomSession}
                disabled={!uploadedUrl}
                className={`w-full py-3 rounded-xl font-bold text-white transition-all ${
                  uploadedUrl
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 active:scale-95'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {isUploading ? 'Uploading…' : uploadedUrl ? '🎬 Start Custom Session' : 'Uploading image…'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 1: Semicircle fan selector ───────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-gray-800/70 flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base font-extrabold bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">{title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Select your watch experience</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Close">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Fan SVG — centred, scales to modal width */}
        <div className="flex justify-center pt-5 px-4">
          <svg
            viewBox="2 2 218 226"
            className="w-full"
            style={{ maxWidth: 300 }}
            aria-label="Watch type selector"
          >
            <defs>
              <filter id="wt-circle-shadow" x="-25%" y="-25%" width="150%" height="150%">
                <feDropShadow dx="1" dy="3" stdDeviation="5" floodColor="rgba(0,0,0,0.13)" />
              </filter>
              <filter id="wt-petal-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="rgba(255,255,255,0.75)" />
              </filter>

            </defs>

            {/* 4 arc-sector petals fanning right */}
            {WATCH_TYPES.map((type, i) => {
              const isSelected = selectedTypeId === type.id;
              return (
                <g key={type.id} onClick={() => setSelectedTypeId(type.id)} style={{ cursor: 'pointer' }}>
                  <path
                    d={PETAL_PATHS[i]}
                    fill={type.color}
                    stroke={type.color}
                    strokeWidth="22"
                    strokeLinejoin="round"
                    filter={isSelected ? 'url(#wt-petal-glow)' : undefined}
                  />
                  {/* Petal icon */}
                  {type.id === 'video' ? (
                    <g
                      transform={`translate(${PETAL_EMOJI_POS[i].x - 9}, ${PETAL_EMOJI_POS[i].y - 9}) scale(0.75)`}
                      fill="none" stroke="white" strokeWidth="1.5"
                      strokeLinecap="round" strokeLinejoin="round"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {PETAL_VIDEO_ICON}
                    </g>
                  ) : (() => {
                    const HIcon = PETAL_HEROICONS[type.id];
                    return (
                      <foreignObject
                        x={PETAL_EMOJI_POS[i].x - 9}
                        y={PETAL_EMOJI_POS[i].y - 9}
                        width="18" height="18"
                        style={{ pointerEvents: 'none', userSelect: 'none', overflow: 'visible' }}
                      >
                        <HIcon style={{ width: 18, height: 18, color: 'white', display: 'block' }} />
                      </foreignObject>
                    );
                  })()}
                </g>
              );
            })}

            {/* Large white circle + image — scales 10% when showing image */}
            <g
              style={{
                transform: circlePhase === 'image' ? 'scale(1.2)' : 'scale(1)',
                transformBox: 'fill-box',
                transformOrigin: 'center',
                transition: 'transform 0.4s cubic-bezier(0.34, 1.2, 0.64, 1)',
                pointerEvents: 'none',
              }}
            >
              <circle cx="80" cy="115" r="56" fill="white" filter="url(#wt-circle-shadow)" />
              {/* Type image — fades in during image phase, clipped to circle */}
              <foreignObject x="24" y="59" width="112" height="112" style={{ overflow: 'hidden' }}>
                <img
                  src={
                    selectedTypeId === 'video'      ? '/icons/Videowatch1.webp' :
                    selectedTypeId === '3d_cinema'  ? '/icons/cinema1.webp' :
                    selectedTypeId === 'classroom'  ? '/icons/lecture1.webp' :
                    '/images/custom-backgrounds/Family Movie Night.webp'
                  }
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
            {/* Emoji + label — fade out when image phase is active */}
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

        {/* Description for the active selection */}
        <div className="px-5 pt-3 pb-2 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            {selectedType.description}
          </p>
        </div>

        {/* Continue */}
        <div className="px-5 py-4">
          <button
            onClick={() => selectedTypeId === 'custom' ? setStep(2) : onSelectType(selectedTypeId)}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2"
          >
            {selectedTypeId === 'custom' ? 'Set Up Scene' : 'Continue'}
            <ArrowRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default WatchTypeModal;
