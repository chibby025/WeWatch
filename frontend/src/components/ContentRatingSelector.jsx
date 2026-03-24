// frontend/src/components/ContentRatingSelector.jsx
import React, { useState, useRef, useEffect } from 'react';

/**
 * ContentRatingSelector - Visual selector for content age ratings
 * Uses rating icon images from /public/icons/
 * @param {string} value - Current selected rating ('G', 'PG', '13+', '16+', '18+', 'Mature')
 * @param {function} onChange - Callback when rating changes
 * @param {boolean} showLabel - Show "Content Rating" label above selector
 */
const ContentRatingSelector = ({ value = 'G', onChange, showLabel = true }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const ratings = [
    {
      id: 'G',
      name: 'G - General',
      desc: 'Suitable for all ages',
      icon: '/icons/G Rating Icon.png',
      color: 'from-green-500 to-green-600',
    },
    {
      id: 'PG',
      name: 'PG - Parental Guidance',
      desc: 'May not be suitable for children',
      icon: '/icons/PG Rating Icon.png',
      color: 'from-blue-500 to-blue-600',
    },
    {
      id: '13+',
      name: '13+ Teens',
      desc: 'For ages 13 and older',
      icon: '/icons/13_ Rating Icon.png',
      color: 'from-yellow-500 to-yellow-600',
    },
    {
      id: '16+',
      name: '16+ Older Teens',
      desc: 'For ages 16 and older',
      icon: '/icons/16_ Rating Icon.png',
      color: 'from-orange-500 to-orange-600',
    },
    {
      id: '18+',
      name: '18+ Adults',
      desc: 'Adults only',
      icon: '/icons/18_ Rating Icon.png',
      color: 'from-red-500 to-red-600',
    },
    {
      id: 'Mature',
      name: 'Mature - Explicit',
      desc: 'Explicit adult content',
      icon: '/icons/Mature Rating Icon.png',
      color: 'from-purple-600 to-purple-700',
    },
  ];

  const selected = ratings.find((r) => r.id === value) || ratings[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      {showLabel && (
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Content Rating
        </label>
      )}

      {/* Selected Rating Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white border-2 border-gray-300 rounded-lg hover:border-purple-500 hover:shadow-md transition-all duration-200"
      >
        <div className="flex items-center gap-3">
          <img
            src={selected.icon}
            alt={selected.name}
            className="w-12 h-12 object-contain"
          />
          <div className="text-left">
            <div className="font-semibold text-gray-900">{selected.name}</div>
            <div className="text-xs text-gray-500">{selected.desc}</div>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white border-2 border-gray-200 rounded-lg shadow-xl max-h-96 overflow-y-auto custom-sleek-scrollbar">
          {ratings.map((rating) => (
            <button
              key={rating.id}
              type="button"
              onClick={() => {
                onChange(rating.id);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 ${
                value === rating.id ? 'bg-purple-50 border-l-4 border-l-purple-600' : ''
              }`}
            >
              <img
                src={rating.icon}
                alt={rating.name}
                className="w-12 h-12 object-contain flex-shrink-0"
              />
              <div className="text-left flex-1">
                <div className="font-semibold text-gray-900">{rating.name}</div>
                <div className="text-xs text-gray-600">{rating.desc}</div>
              </div>
              {value === rating.id && (
                <svg
                  className="w-5 h-5 text-purple-600 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ContentRatingSelector;
