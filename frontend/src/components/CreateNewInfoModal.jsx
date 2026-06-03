import React, { useState } from 'react';
import { SparklesIcon } from '@heroicons/react/24/outline';

const CreateNewInfoModal = ({ isOpen, onClose, onContinue }) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!isOpen) return null;

  const handleContinue = () => {
    if (dontShowAgain) {
      localStorage.setItem('hideCreateNewInfo', 'true');
    }
    onContinue();
  };

  const images = [
    {
      src: '/icons/modal2.webp',
      title: 'Instant Watch',
      description: 'Quick meetups, date nights, and spontaneous hangouts'
    },
    {
      src: '/icons/modal10.webp',
      title: 'Persistent Rooms',
      description: 'Build communities, stream content, and grow your audience - monetize content you own'
    }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] md:max-w-3xl lg:max-w-4xl max-h-[95vh] overflow-y-auto animate-fade-in custom-sleek-scrollbar">
        {/* Header */}
        <div className="bg-white p-4 sm:p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="bg-indigo-100 rounded-full p-2 sm:p-3">
                <SparklesIcon className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-3xl font-bold text-gray-900">Create Your Space</h2>
                  <span className="text-2xl sm:text-3xl">✨</span>
                </div>
                <p className="text-gray-600 mt-1 text-sm sm:text-lg">
                  Two ways to connect, watch, and create together
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-600 hover:bg-gray-100 rounded-lg p-2 transition-all flex-shrink-0"
              aria-label="Close modal"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Image Grid */}
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6">
            {images.map((image, index) => (
              <div
                key={index}
                className="group relative bg-gray-50 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300"
              >
                {/* Image Container */}
                <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden">
                  <img
                    src={image.src}
                    alt={image.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect width="200" height="200" fill="%23e5e7eb"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%239ca3af" font-family="sans-serif" font-size="14"%3EImage%3C/text%3E%3C/svg%3E';
                    }}
                  />
                </div>
                
                {/* Caption */}
                <div className="p-3 sm:p-4">
                  <h3 className="font-bold text-gray-900 text-sm sm:text-base mb-1">
                    {image.title}
                  </h3>
                  <p className="text-gray-600 text-xs sm:text-sm">
                    {image.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Info Box */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 sm:p-6 mb-6">
            <h3 className="font-bold text-gray-900 text-base sm:text-lg mb-3">
              🎯 Choose What Fits Your Needs:
            </h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                  ⚡
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm sm:text-base">Instant Watch</p>
                  <p className="text-gray-600 text-xs sm:text-sm">Temporary sessions - Perfect for casual meetups, date nights, and spontaneous watch parties</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-indigo-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                  🏛️
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm sm:text-base">Persistent Rooms</p>
                  <p className="text-gray-600 text-xs sm:text-sm">Long-term spaces - Build your community, stream regularly, and monetize content you own</p>
                </div>
              </div>
            </div>
          </div>

          {/* Don't Show Again Checkbox */}
          <div className="bg-gray-100 rounded-lg p-4 mb-4">
            <label htmlFor="dontShowCreateNew" className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                id="dontShowCreateNew"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="w-5 h-5 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500 cursor-pointer"
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
            💡 <span className="font-medium">Next:</span> Choose between Instant Watch or Persistent Room
          </p>
        </div>
      </div>
    </div>
  );
};

export default CreateNewInfoModal;
