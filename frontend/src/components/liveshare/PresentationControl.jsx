// frontend/src/components/liveshare/PresentationControl.jsx
// Studio control for managing presentation slides during church broadcasts

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, FileText, Eye, EyeOff, Grid, Maximize2 } from 'lucide-react';

export default function PresentationControl({ 
  presentationUrl, 
  totalSlides = 0,
  onSlideChange,
  onTogglePresentation,
  isActive,
  currentSlide = 1,
}) {
  const [localSlide, setLocalSlide] = useState(currentSlide);
  const [showThumbnails, setShowThumbnails] = useState(false);

  useEffect(() => {
    setLocalSlide(currentSlide);
  }, [currentSlide]);

  const handlePrevSlide = () => {
    if (localSlide > 1) {
      const newSlide = localSlide - 1;
      setLocalSlide(newSlide);
      onSlideChange(newSlide);
    }
  };

  const handleNextSlide = () => {
    if (localSlide < totalSlides) {
      const newSlide = localSlide + 1;
      setLocalSlide(newSlide);
      onSlideChange(newSlide);
    }
  };

  const handleGoToSlide = (slideNumber) => {
    setLocalSlide(slideNumber);
    onSlideChange(slideNumber);
    setShowThumbnails(false);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'ArrowLeft' && localSlide > 1) {
        handlePrevSlide();
      } else if (e.key === 'ArrowRight' && localSlide < totalSlides) {
        handleNextSlide();
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleNextSlide();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [localSlide, totalSlides]);

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-yellow-400" />
          <h3 className="text-white font-medium text-sm">Presentation</h3>
        </div>
        <button
          onClick={onTogglePresentation}
          className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all ${
            isActive
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
        >
          {isActive ? (
            <>
              <Eye size={14} className="inline mr-1" />
              Showing
            </>
          ) : (
            <>
              <EyeOff size={14} className="inline mr-1" />
              Hidden
            </>
          )}
        </button>
      </div>

      {/* Slide Counter */}
      <div className="bg-gray-700 rounded-lg p-3 text-center">
        <p className="text-gray-400 text-xs mb-1">Current Slide</p>
        <p className="text-white text-2xl font-bold">
          {localSlide} <span className="text-gray-400 text-lg">/ {totalSlides}</span>
        </p>
      </div>

      {/* Navigation Controls */}
      <div className="flex gap-2">
        <button
          onClick={handlePrevSlide}
          disabled={localSlide === 1}
          className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${
            localSlide === 1
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          <ChevronLeft size={18} className="inline mr-1" />
          Previous
        </button>
        <button
          onClick={handleNextSlide}
          disabled={localSlide === totalSlides}
          className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${
            localSlide === totalSlides
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          Next
          <ChevronRight size={18} className="inline ml-1" />
        </button>
      </div>

      {/* Keyboard Shortcuts Info */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
        <p className="text-blue-400 text-xs font-medium mb-1">⌨️ Keyboard Shortcuts</p>
        <div className="space-y-1">
          <p className="text-gray-300 text-xs">
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-xs">←</kbd> Previous slide
          </p>
          <p className="text-gray-300 text-xs">
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-xs">→</kbd> <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-xs">Space</kbd> Next slide
          </p>
        </div>
      </div>

      {/* Thumbnail Grid Toggle */}
      <button
        onClick={() => setShowThumbnails(!showThumbnails)}
        className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium text-sm transition-colors"
      >
        <Grid size={14} className="inline mr-2" />
        {showThumbnails ? 'Hide' : 'Show'} All Slides
      </button>

      {/* Thumbnail Grid */}
      {showThumbnails && (
        <div className="bg-gray-700 rounded-lg p-3 max-h-64 overflow-y-auto custom-sleek-scrollbar">
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: totalSlides }, (_, i) => i + 1).map((slideNum) => (
              <button
                key={slideNum}
                onClick={() => handleGoToSlide(slideNum)}
                className={`aspect-video bg-gray-800 rounded-lg flex items-center justify-center border-2 transition-all ${
                  slideNum === localSlide
                    ? 'border-blue-500 ring-2 ring-blue-500/50'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <span className={`text-sm font-bold ${
                  slideNum === localSlide ? 'text-blue-400' : 'text-gray-400'
                }`}>
                  {slideNum}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Preview (optional - can show current slide thumbnail) */}
      {presentationUrl && (
        <div className="bg-gray-900 rounded-lg p-2">
          <div className="relative aspect-video bg-black rounded overflow-hidden">
            <img
              src={`${presentationUrl}?slide=${localSlide}`}
              alt={`Slide ${localSlide}`}
              className="w-full h-full object-contain"
            />
            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-white text-xs">
              Slide {localSlide}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
