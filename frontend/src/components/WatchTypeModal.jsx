import React, { useEffect, useRef, useState, useCallback } from 'react';
import { XMarkIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { useGLTF } from '@react-three/drei';
import { uploadCustomBackground } from '../services/api';
import WatchTypePicker, { WATCH_TYPES } from './WatchTypePicker';

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
      <img src={imageUrl} alt="background" className="absolute inset-0 w-full h-full object-contain" draggable={false} />

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
  const [tourStep, setTourStep]       = useState(() => localStorage.getItem('wewatch_watch_type_tour_seen') ? -1 : 0);
  const dismissTour = () => { setTourStep(-1); localStorage.setItem('wewatch_watch_type_tour_seen', '1'); };
  const [previewUrl, setPreviewUrl]   = useState(null);   // local object URL for RegionPicker
  const [uploadedUrl, setUploadedUrl] = useState(null);   // server URL after upload
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [loadingSuggestion, setLoadingSuggestion] = useState(null); // suggestion filename being loaded
  const [box, setBox] = useState({ x: 0.20, y: 0.20, w: 0.55, h: 0.45 });
  const [selectedTypeId, setSelectedTypeId] = useState('video');
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== 'undefined' ? window.matchMedia('(orientation: landscape)').matches : false
  );

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

  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    const handler = (e) => setIsLandscape(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Preload 3D models while modal is open
  useEffect(() => {
    if (isOpen) { useGLTF.preload('/models/cinema.glb'); useGLTF.preload('/models/lecture_hall.glb'); }
  }, [isOpen]);

  const selectedType = WATCH_TYPES.find(t => t.id === selectedTypeId) ?? WATCH_TYPES[0];

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
  const continueButton = (
    <button
      onClick={() => selectedTypeId === 'custom' ? setStep(2) : onSelectType(selectedTypeId)}
      className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2"
    >
      {selectedTypeId === 'custom' ? 'Set Up Scene' : 'Continue'}
      <ArrowRightIcon className="w-4 h-4" />
    </button>
  );

  if (isLandscape) {
    return (
      <div className="fixed inset-0 bg-black/50 dark:bg-gray-800/70 flex z-50">
        <div className="relative bg-white dark:bg-gray-900 w-full h-full flex flex-col overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <div>
              <h2 className="text-base font-extrabold bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">{title}</h2>
              <p className="text-xs text-gray-400 mt-0.5">Select your watch experience</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Close">
              <XMarkIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* 2-column body */}
          <div className="flex flex-row flex-1 overflow-hidden">
            {/* Left: petals fan */}
            <div className="w-1/2 flex items-center justify-center p-3 overflow-hidden">
              <WatchTypePicker
                selectedTypeId={selectedTypeId}
                onChange={setSelectedTypeId}
                showDescription={false}
                maxWidth={330}
              />
            </div>
            {/* Right: description + button — no dividing line */}
            <div className="w-1/2 flex flex-col justify-center px-6 py-4 gap-4">
              <div>
                <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-1">{selectedType.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {selectedType.description}
                </p>
              </div>
              {continueButton}
            </div>
          </div>

          {/* Tour overlay */}
          {tourStep >= 0 && (
            <div className="absolute inset-0 bg-black/65 z-10 flex flex-col justify-end">
              <div className="bg-gray-950 rounded-t-2xl m-2 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-gray-500 font-medium">{tourStep + 1} / 2</span>
                  <button onClick={dismissTour} className="text-[10px] text-gray-500 hover:text-gray-300 font-medium">Skip</button>
                </div>
                {tourStep === 0 ? (
                  <>
                    <h4 className="text-sm font-bold text-white mb-2.5">Pick your experience</h4>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <div className="flex items-start gap-2 text-xs text-gray-300"><span className="mt-px">🎬</span><span><span className="font-semibold text-sky-400">Video Watch</span> — Simple co-watch</span></div>
                      <div className="flex items-start gap-2 text-xs text-gray-300"><span className="mt-px">🎭</span><span><span className="font-semibold text-blue-400">3D Cinema</span> — Virtual seats</span></div>
                      <div className="flex items-start gap-2 text-xs text-gray-300"><span className="mt-px">🎓</span><span><span className="font-semibold text-indigo-400">Lecture Hall</span> — Whiteboard + quizzes</span></div>
                      <div className="flex items-start gap-2 text-xs text-gray-300"><span className="mt-px">🖼️</span><span><span className="font-semibold text-violet-400">Custom Scene</span> — Upload a photo</span></div>
                    </div>
                    <button onClick={() => setTourStep(1)} className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors">Next →</button>
                  </>
                ) : (
                  <>
                    <h4 className="text-sm font-bold text-white mb-2">Then launch your session</h4>
                    <p className="text-xs text-gray-400 leading-relaxed mb-4">Tap any petal to pick a type. When you're ready, hit <span className="text-indigo-400 font-semibold">Continue</span>.</p>
                    <button onClick={dismissTour} className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors">Got it</button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-gray-800/70 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md sm:max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">{title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Select your watch experience</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Close">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <WatchTypePicker
          selectedTypeId={selectedTypeId}
          onChange={setSelectedTypeId}
          showDescription
          maxWidth={660}
        />

        {/* Continue */}
        <div className="px-5 py-4">
          {continueButton}
        </div>

        {/* One-time inline tour — bottom sheet inside the modal card */}
        {tourStep >= 0 && (
          <div className="absolute inset-0 bg-black/65 rounded-2xl z-10 flex flex-col justify-end">
            <div className="bg-gray-950 rounded-b-2xl rounded-t-2xl m-2 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] text-gray-500 font-medium">{tourStep + 1} / 2</span>
                <button onClick={dismissTour} className="text-[10px] text-gray-500 hover:text-gray-300 font-medium">Skip</button>
              </div>

              {tourStep === 0 ? (
                <>
                  <h4 className="text-sm font-bold text-white mb-2.5">Pick your experience</h4>
                  <div className="space-y-2 mb-4">
                    <div className="flex items-start gap-2 text-xs text-gray-300">
                      <span className="mt-px">🎬</span>
                      <span><span className="font-semibold text-sky-400">Video Watch</span> — Simple co-watch with any video, zero setup</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-gray-300">
                      <span className="mt-px">🎭</span>
                      <span><span className="font-semibold text-blue-400">3D Cinema</span> — Virtual seats, spatial audio, avatar presence</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-gray-300">
                      <span className="mt-px">🎓</span>
                      <span><span className="font-semibold text-indigo-400">Lecture Hall</span> — Whiteboard, quizzes, interactive classroom</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-gray-300">
                      <span className="mt-px">🖼️</span>
                      <span><span className="font-semibold text-violet-400">Custom Scene</span> — Upload a room photo, position the screen</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setTourStep(1)}
                    className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
                  >
                    Next →
                  </button>
                </>
              ) : (
                <>
                  <h4 className="text-sm font-bold text-white mb-2">Then launch your session</h4>
                  <p className="text-xs text-gray-400 leading-relaxed mb-4">
                    Tap any petal to pick a type. When you're ready, hit <span className="text-indigo-400 font-semibold">Continue</span> at the bottom.
                  </p>
                  <button
                    onClick={dismissTour}
                    className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
                  >
                    Got it
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WatchTypeModal;
