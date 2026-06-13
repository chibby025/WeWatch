import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FilmIcon, CubeIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { useGLTF } from '@react-three/drei';
import { uploadCustomBackground } from '../services/api';

// ── Region picker ────────────────────────────────────────────────────────────
// Renders the uploaded image with a resizable screen-region box overlay.
// box = { x, y, w, h } all 0–1 relative to image dimensions.
function RegionPicker({ imageUrl, box, onChange }) {
  const containerRef = useRef(null);
  const dragRef = useRef(null);

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const MIN = 0.08;

  const startDrag = useCallback((e, handle) => {
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragRef.current = {
      handle,
      startX: clientX,
      startY: clientY,
      startBox: { ...box },
      rectW: rect.width,
      rectH: rect.height,
    };
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
      case 'tl': {
        const nx = clamp(x + dx, 0, x + w - MIN);
        const ny = clamp(y + dy, 0, y + h - MIN);
        w = w + (x - nx); h = h + (y - ny); x = nx; y = ny;
        break;
      }
      case 'tr': {
        const ny = clamp(y + dy, 0, y + h - MIN);
        w = clamp(startBox.w + dx, MIN, 1 - x);
        h = h + (y - ny); y = ny;
        break;
      }
      case 'bl': {
        const nx = clamp(x + dx, 0, x + w - MIN);
        w = w + (x - nx); x = nx;
        h = clamp(startBox.h + dy, MIN, 1 - y);
        break;
      }
      case 'br':
        w = clamp(startBox.w + dx, MIN, 1 - x);
        h = clamp(startBox.h + dy, MIN, 1 - y);
        break;
      default: break;
    }
    onChange({ x, y, w, h });
  }, [onChange]);

  const onEnd = useCallback(() => { dragRef.current = null; }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [onMove, onEnd]);

  const HANDLE_SIZE = 18;
  const handles = [
    { id: 'tl', style: { top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nw-resize' } },
    { id: 'tr', style: { top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'ne-resize' } },
    { id: 'bl', style: { bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'sw-resize' } },
    { id: 'br', style: { bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'se-resize' } },
  ];

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none overflow-hidden rounded-lg bg-black"
      style={{ aspectRatio: '16/9' }}
    >
      <img src={imageUrl} alt="background" className="absolute inset-0 w-full h-full object-cover" draggable={false} />

      {/* Dark overlay outside the box */}
      <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
        {/* top strip */}
        <div className="absolute bg-black/60" style={{ top: 0, left: 0, right: 0, height: `${box.y * 100}%` }} />
        {/* bottom strip */}
        <div className="absolute bg-black/60" style={{ bottom: 0, left: 0, right: 0, height: `${(1 - box.y - box.h) * 100}%` }} />
        {/* left strip */}
        <div className="absolute bg-black/60" style={{ top: `${box.y * 100}%`, left: 0, width: `${box.x * 100}%`, height: `${box.h * 100}%` }} />
        {/* right strip */}
        <div className="absolute bg-black/60" style={{ top: `${box.y * 100}%`, right: 0, width: `${(1 - box.x - box.w) * 100}%`, height: `${box.h * 100}%` }} />
      </div>

      {/* The screen box */}
      <div
        className="absolute"
        style={{
          left: `${box.x * 100}%`,
          top: `${box.y * 100}%`,
          width: `${box.w * 100}%`,
          height: `${box.h * 100}%`,
          border: '2px solid rgba(255,255,255,0.9)',
          boxSizing: 'border-box',
        }}
      >
        {/* Center drag zone */}
        <div
          className="absolute inset-0"
          style={{ cursor: 'move' }}
          onMouseDown={e => startDrag(e, 'move')}
          onTouchStart={e => startDrag(e, 'move')}
        />

        {/* Screen label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-white/80 text-xs font-semibold bg-black/40 px-2 py-0.5 rounded">
            📺 Screen
          </span>
        </div>

        {/* Corner handles */}
        {handles.map(h => (
          <div
            key={h.id}
            onMouseDown={e => startDrag(e, h.id)}
            onTouchStart={e => startDrag(e, h.id)}
            className="absolute bg-white rounded-sm border-2 border-purple-500"
            style={{ width: HANDLE_SIZE, height: HANDLE_SIZE, ...h.style, zIndex: 10 }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
const WatchTypeModal = ({ isOpen, onClose, onSelectType, title = "Choose Watch Experience", currentUser }) => {
  const [step, setStep] = useState(1); // 1 = type list, 2 = custom setup
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploadedUrl, setUploadedUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [box, setBox] = useState({ x: 0.20, y: 0.20, w: 0.55, h: 0.45 });
  const fileInputRef = useRef(null);

  // Reset step + state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setPreviewUrl(null);
      setUploadedUrl(null);
      setIsUploading(false);
      setUploadError('');
      setBox({ x: 0.20, y: 0.20, w: 0.55, h: 0.45 });
    }
  }, [isOpen]);

  // Preload 3D models when modal opens
  useEffect(() => {
    if (isOpen) {
      useGLTF.preload('/models/cinema.glb');
      useGLTF.preload('/models/lecture_hall.glb');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const watchTypes = [
    {
      id: 'video',
      name: 'Video Watch',
      icon: FilmIcon,
      description: 'Standard video player with synchronized playback',
      gradient: 'from-purple-500 to-purple-700',
      emoji: '🎬',
    },
    {
      id: '3d_cinema',
      name: '3D Cinema',
      icon: CubeIcon,
      description: 'Immersive 3D theater experience with spatial audio',
      gradient: 'from-blue-500 to-blue-700',
      emoji: '🎭',
    },
    {
      id: 'classroom',
      name: 'Classroom',
      icon: CubeIcon,
      description: '3D classroom with whiteboard, quizzes, and interactive learning',
      gradient: 'from-green-500 to-green-700',
      emoji: '🎓',
    },
    {
      id: 'custom',
      name: 'Custom Scene',
      icon: PhotoIcon,
      description: 'Upload any photo and place the screen exactly where you want it',
      gradient: 'from-amber-500 to-orange-600',
      emoji: '🖼️',
    },
  ];

  const handleTypeClick = (typeId) => {
    if (typeId === 'custom') {
      setStep(2);
    } else {
      onSelectType(typeId);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Local preview immediately
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setUploadedUrl(null);
    setUploadError('');

    // Upload in background while user positions the box
    setIsUploading(true);
    try {
      const data = await uploadCustomBackground(file);
      setUploadedUrl(data.url);
    } catch {
      setUploadError('Upload failed — please try again.');
      setPreviewUrl(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartCustomSession = () => {
    if (!uploadedUrl) return;
    onSelectType('custom', {
      backgroundUrl: uploadedUrl,
      region: box,
    });
  };

  // ── Step 2: Custom setup ──────────────────────────────────────────────────
  if (step === 2) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-2 sm:p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto custom-sleek-scrollbar">
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white p-3 sm:p-5">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStep(1)}
                  className="text-white/80 hover:text-white transition-colors p-1"
                  aria-label="Back"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="text-lg sm:text-xl font-bold">Custom Scene Setup</h2>
              </div>
              <button onClick={onClose} className="text-white hover:text-gray-200 transition-colors">
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-amber-100 mt-1 text-xs sm:text-sm">Upload a photo and drag the box to where the screen should appear</p>
          </div>

          <div className="p-4 sm:p-6 space-y-5">
            {/* Image upload */}
            {!previewUrl ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 hover:border-amber-400 rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors group"
              >
                <div className="w-14 h-14 rounded-full bg-amber-50 group-hover:bg-amber-100 flex items-center justify-center transition-colors">
                  <PhotoIcon className="w-7 h-7 text-amber-500" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-gray-700">Upload your scene photo</p>
                  <p className="text-xs text-gray-400 mt-0.5">JPEG, PNG or WebP · any size</p>
                </div>
                {uploadError && <p className="text-sm text-red-500">{uploadError}</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">Drag the box to position the screen</p>
                  <button
                    onClick={() => { setPreviewUrl(null); setUploadedUrl(null); fileInputRef.current.value = ''; }}
                    className="text-xs text-gray-400 hover:text-gray-600 underline"
                  >
                    Change photo
                  </button>
                </div>

                <RegionPicker imageUrl={previewUrl} box={box} onChange={setBox} />

                <p className="text-xs text-gray-400 text-center">
                  Drag corners to resize · drag center to move
                </p>

                {isUploading && (
                  <div className="flex items-center gap-2 text-xs text-amber-600">
                    <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    Uploading image…
                  </div>
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Start button */}
            <button
              onClick={handleStartCustomSession}
              disabled={!uploadedUrl}
              className={`w-full py-3 rounded-xl font-bold text-white transition-all ${
                uploadedUrl
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 active:scale-95'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isUploading ? 'Uploading…' : uploadedUrl ? '🎬 Start Custom Session' : 'Upload a photo to continue'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 1: Type selection ─────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto custom-sleek-scrollbar">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-3 sm:p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg sm:text-2xl font-bold">{title}</h2>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors"
              aria-label="Close modal"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-purple-100 mt-1 sm:mt-2 text-xs sm:text-base">Select how you want to watch together</p>
        </div>

        {/* Watch Type Options */}
        <div className="p-3 sm:p-6 grid grid-cols-1 gap-3 sm:gap-4">
          {watchTypes.map((type) => {
            const IconComponent = type.icon;
            return (
              <button
                key={type.id}
                onClick={() => handleTypeClick(type.id)}
                className={`relative group bg-gradient-to-br ${type.gradient} hover:shadow-xl transform hover:scale-105 active:scale-95 transition-all duration-300 rounded-xl p-4 sm:p-6 text-left overflow-hidden`}
              >
                <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-2 sm:mb-4">
                    <div className="bg-white bg-opacity-20 rounded-full p-2 sm:p-3">
                      <IconComponent className="w-5 h-5 sm:w-8 sm:h-8 text-white" />
                    </div>
                    <span className="text-2xl sm:text-4xl">{type.emoji}</span>
                  </div>
                  <h3 className="text-base sm:text-xl font-bold text-white mb-1 sm:mb-2">{type.name}</h3>
                  <p className="text-white text-opacity-90 text-xs sm:text-sm leading-relaxed">{type.description}</p>
                  <div className="mt-2 sm:mt-4 flex items-center text-white text-opacity-80 text-xs sm:text-sm">
                    <span className="group-hover:translate-x-1 transition-transform duration-300">
                      {type.id === 'custom' ? 'Set up scene →' : 'Click to select'}
                    </span>
                    <svg className="w-3 h-3 sm:w-4 sm:h-4 ml-2 group-hover:translate-x-2 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-20 h-20 bg-white opacity-5 rounded-bl-full" />
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-3 py-3 sm:px-6 sm:py-4 border-t border-gray-200">
          <p className="text-xs sm:text-sm text-gray-600 text-center">
            💡 <span className="font-medium">Tip:</span> All participants will join the same watch type for synchronized viewing
          </p>
        </div>
      </div>
    </div>
  );
};

export default WatchTypeModal;
