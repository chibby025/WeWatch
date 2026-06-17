import React, { useState, useEffect } from 'react';
import { BuildingLibraryIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

const PersistentRoomInfoModal = ({ isOpen, onClose, onContinue }) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [slide, setSlide] = useState(0);

  const handleContinue = () => {
    if (dontShowAgain) {
      localStorage.setItem('hidePersistentRoomInfo', 'true');
    }
    onContinue();
  };

  const images = [
    {
      src: '/icons/premiere.webp',
      title: '🎬 Indie Film Premiere',
      description: 'Host your independent film, sell tickets, build your audience'
    },
    {
      src: '/icons/modal5.webp',
      title: '⛪ Worship & Community Hall',
      description: 'Weekly services, Bible study, spiritual gatherings'
    },
    {
      src: '/icons/modal7.webp',
      title: '📚 Digital Education Space',
      description: 'Teach from home, reach students everywhere'
    },
    {
      src: '/icons/modal10.webp',
      title: '🎮 African Gamehouse Stream',
      description: 'Local gaming, global audience, viewer donations'
    }
  ];

  const total = images.length;
  const goTo = (idx) => setSlide(((idx % total) + total) % total);
  const prev = () => goTo(slide - 1);
  const next = () => goTo(slide + 1);

  useEffect(() => {
    if (isOpen) setSlide(0);
  }, [isOpen]);

  if (!isOpen) return null;

  const active = images[slide];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] md:max-w-4xl lg:max-w-5xl max-h-[95vh] flex flex-col overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-green-700 text-white p-4 sm:p-6 flex-shrink-0">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="bg-white bg-opacity-20 rounded-full p-2 sm:p-3">
                <BuildingLibraryIcon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-3xl font-bold">Persistent Rooms</h2>
                  <span className="text-2xl sm:text-3xl">🏛️</span>
                </div>
                <p className="text-white text-opacity-90 mt-1 text-sm sm:text-lg">
                  Build your community and monetize your content
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-all flex-shrink-0"
              aria-label="Close modal"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable body — carousel + features. Capped so the action button below
            always stays on-screen without scrolling, even on short mobile viewports. */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0 custom-sleek-scrollbar">
          <div className="relative group rounded-xl overflow-hidden bg-gray-100">
            <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden">
              <img
                key={active.src}
                src={active.src}
                alt={active.title}
                className="w-full h-full object-cover animate-fade-in"
                onError={(e) => {
                  e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect width="200" height="200" fill="%23e5e7eb"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%239ca3af" font-family="sans-serif" font-size="14"%3EImage%3C/text%3E%3C/svg%3E';
                }}
              />
            </div>

            {/* Number Badge */}
            <div className="absolute top-2 right-2 sm:top-3 sm:right-3 bg-gradient-to-br from-green-500 to-green-700 text-white w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm shadow-lg">
              {slide + 1}/{total}
            </div>

            {/* Chevron arrows */}
            <button
              onClick={prev}
              aria-label="Previous"
              className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 sm:p-2 transition-colors opacity-0 group-hover:opacity-100 sm:opacity-70"
            >
              <ChevronLeftIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              onClick={next}
              aria-label="Next"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 sm:p-2 transition-colors opacity-0 group-hover:opacity-100 sm:opacity-70"
            >
              <ChevronRightIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          {/* Caption */}
          <div className="mt-3 text-center">
            <h3 className="font-bold text-gray-900 text-base sm:text-lg mb-1">{active.title}</h3>
            <p className="text-gray-600 text-xs sm:text-sm">{active.description}</p>
          </div>

          {/* Pagination dots */}
          <div className="flex items-center justify-center gap-1.5 mt-3 mb-6">
            {images.map((_, idx) => (
              <button
                key={idx}
                onClick={() => goTo(idx)}
                aria-label={`Go to slide ${idx + 1}`}
                className={`!min-h-0 !min-w-0 rounded-full transition-all ${
                  idx === slide ? 'w-5 h-1.5 bg-gradient-to-r from-green-500 to-green-700' : 'w-1.5 h-1.5 bg-gray-300 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>

          {/* Features List */}
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 sm:p-6 mb-6">
            <h3 className="font-bold text-gray-900 text-base sm:text-lg mb-3 sm:mb-4">
              ✨ Perfect For:
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              <div className="flex items-center gap-2 text-gray-700 text-xs sm:text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-green-500 to-green-700"></div>
                <span>📺 Content creators & streamers</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700 text-xs sm:text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-green-500 to-green-700"></div>
                <span>⛪ Churches & spiritual communities</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700 text-xs sm:text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-green-500 to-green-700"></div>
                <span>🎓 Teachers & educational content</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700 text-xs sm:text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-green-500 to-green-700"></div>
                <span>🎮 Gaming communities & esports</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700 text-xs sm:text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-green-500 to-green-700"></div>
                <span>💰 Accept gifts & build recurring income</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700 text-xs sm:text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-green-500 to-green-700"></div>
                <span>📊 Grow your audience with ratings & discovery</span>
              </div>
            </div>
          </div>

          {/* Monetization Highlight */}
          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="text-2xl">💰</div>
              <div>
                <h4 className="font-bold text-gray-900 text-sm sm:text-base mb-1">
                  Creator Economy Built-In
                </h4>
                <p className="text-gray-700 text-xs sm:text-sm">
                  Viewers can gift tokens during your sessions. 95% goes to you, 5% platform fee.
                  No subscriptions - pay-as-you-go model preferred by African audiences.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Fixed footer — checkbox + action button + tip always stay visible, never require scrolling */}
        <div className="flex-shrink-0 border-t border-gray-200">
          <div className="px-4 sm:px-6 pt-4 pb-2">
            {/* Don't Show Again Checkbox */}
            <div className="bg-gray-100 rounded-lg p-4 mb-3">
              <label htmlFor="dontShowPersistentRoom" className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  id="dontShowPersistentRoom"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500 cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-700">
                  Don't show this again
                </span>
              </label>
            </div>

            {/* Action Button */}
            <button
              onClick={handleContinue}
              className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-base sm:text-lg rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              Got it, Let's Create →
            </button>
          </div>

          {/* Footer Tip */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:py-4 border-t border-gray-200">
            <p className="text-xs sm:text-sm text-gray-600 text-center">
              💡 <span className="font-medium">Next:</span> You'll be redirected to create your persistent room
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersistentRoomInfoModal;
