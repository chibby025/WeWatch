// WeWatch/frontend/src/components/AccessModal.jsx
// Modal to choose between Public or Private access for instant watch
import React, { useState } from 'react';
import { GlobeAltIcon, LockClosedIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

const AccessModal = ({ isOpen, onClose, onSelectAccess, title = "Choose Room Access" }) => {
  const [isSessionPrivate, setIsSessionPrivate] = useState(false);

  if (!isOpen) return null;

  const accessTypes = [
    {
      id: 'public',
      name: 'Public',
      icon: GlobeAltIcon,
      description: 'Visible to everyone in the lobby',
      color: 'green',
      gradient: 'from-green-500 to-green-700',
      emoji: '🌍'
    },
    {
      id: 'private',
      name: 'Private',
      icon: LockClosedIcon,
      description: 'Only members can see and join',
      color: 'orange',
      gradient: 'from-orange-500 to-orange-700',
      emoji: '🔒'
    }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md sm:max-w-lg max-h-[95vh] overflow-y-auto animate-fade-in custom-sleek-scrollbar">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 sm:p-5">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg sm:text-xl font-bold">{title}</h2>
              <p className="text-purple-100 mt-1 text-xs sm:text-sm">Who can see and join this session?</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors ml-2"
              aria-label="Close modal"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Access Type Options - Compact Grid */}
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3">
            {accessTypes.map((type) => {
              const IconComponent = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => onSelectAccess(type.id === 'public', isSessionPrivate)}
                  className={`relative group bg-gradient-to-br ${type.gradient} hover:shadow-lg transform hover:scale-105 active:scale-95 transition-all duration-200 rounded-xl p-3 sm:p-4 text-center overflow-hidden`}
                >
                  {/* Content */}
                  <div className="relative z-10">
                    {/* Icon & Emoji */}
                    <div className="flex flex-col items-center gap-2 mb-2">
                      <div className="bg-white bg-opacity-20 rounded-full p-2">
                        <IconComponent className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                      </div>
                      <span className="text-xl sm:text-2xl">{type.emoji}</span>
                    </div>

                    {/* Title */}
                    <h3 className="text-white text-base sm:text-lg font-bold mb-1">
                      {type.name}
                    </h3>

                    {/* Description */}
                    <p className="text-white text-opacity-90 text-xs leading-snug">
                      {type.id === 'public' 
                        ? 'Anyone can discover and join' 
                        : 'Share invite link to add members'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Session Privacy Checkbox - More Compact */}
          <div className="mt-4">
            <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-3">
              <label className="flex items-start cursor-pointer group">
                <input
                  type="checkbox"
                  checked={isSessionPrivate}
                  onChange={(e) => setIsSessionPrivate(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-2 focus:ring-purple-500 flex-shrink-0"
                />
                <div className="ml-2.5">
                  <div className="flex items-center gap-1.5">
                    <EyeSlashIcon className="w-4 h-4 text-purple-600 flex-shrink-0" />
                    <span className="font-semibold text-gray-900 text-xs sm:text-sm">
                      Hide from Lobby "Watching Now"
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 leading-snug">
                    Session won't appear in lobby unless you're a member. Only direct links work.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccessModal;
