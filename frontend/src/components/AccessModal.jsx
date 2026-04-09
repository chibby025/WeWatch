// WeWatch/frontend/src/components/AccessModal.jsx
// Modal to choose between Public or Private access for instant watch + Content Rating
import React, { useState } from 'react';
import { GlobeAltIcon, LockClosedIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import ContentRatingSelector from './ContentRatingSelector';

const AccessModal = ({ isOpen, onClose, onSelectAccess, title = "Choose Room Access" }) => {
  const [isSessionPrivate, setIsSessionPrivate] = useState(false);
  const [contentRating, setContentRating] = useState('G'); // Default to General

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

  const handleSelectAccess = (isPublic) => {
    console.log('🔐 [AccessModal] Calling onSelectAccess with:', { isPublic, isSessionPrivate, contentRating });
    // Pass access type, session privacy, and content rating to parent
    onSelectAccess(isPublic, isSessionPrivate, contentRating);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md sm:max-w-lg max-h-[95vh] overflow-y-auto animate-fade-in custom-sleek-scrollbar">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 sm:p-5">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg sm:text-xl font-bold">{title}</h2>
              <p className="text-purple-100 mt-1 text-xs sm:text-sm">Configure session settings</p>
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

        <div className="p-4 sm:p-5 space-y-5">
          {/* Access Type Options */}
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-3">
              🌐 Access Type
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {accessTypes.map((type) => {
                const IconComponent = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => handleSelectAccess(type.id === 'public')}
                    className="relative group overflow-hidden rounded-xl transition-all duration-300 hover:shadow-2xl hover:scale-[1.03] active:scale-95"
                  >
                    {/* Background with gradient */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${type.gradient} transition-all duration-300 group-hover:scale-110`}></div>
                    
                    {/* Animated shine effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                    
                    {/* Glow effect on hover */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className={`absolute inset-0 bg-gradient-to-br ${type.gradient} blur-xl`}></div>
                    </div>
                    
                    {/* Content */}
                    <div className="relative z-10 p-4 sm:p-5 flex flex-col items-center">
                      {/* Icon with animated background */}
                      <div className="relative mb-3">
                        <div className="absolute inset-0 bg-white/20 rounded-full blur-md scale-110"></div>
                        <div className="relative bg-white/25 backdrop-blur-sm rounded-full p-3 group-hover:scale-110 transition-transform duration-300">
                          <IconComponent className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                        </div>
                      </div>

                      {/* Title */}
                      <h3 className="text-lg sm:text-xl font-black text-white mb-1.5 tracking-wide" style={{ fontFamily: '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif' }}>
                        {type.name}
                      </h3>

                      {/* Description */}
                      <p className="text-white/90 font-medium text-xs sm:text-sm mb-3 text-center leading-snug">
                        {type.id === 'public' 
                          ? 'Anyone can discover and join' 
                          : 'Share invite link to add members'}
                      </p>
                      
                      {/* Action indicator */}
                      <div className="flex items-center gap-1.5 text-white font-semibold text-xs sm:text-sm group-hover:gap-2.5 transition-all duration-300">
                        <span>Select</span>
                        <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                    
                    {/* Decorative elements */}
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-12 translate-x-12 group-hover:scale-150 transition-transform duration-500"></div>
                    <div className="absolute bottom-0 left-0 w-20 h-20 bg-black/10 rounded-full translate-y-10 -translate-x-10 group-hover:scale-150 transition-transform duration-500"></div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Session Privacy Checkbox */}
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-3">
              👁️ Lobby Visibility
            </h3>
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

          {/* Content Rating Section */}
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-3">
              🔞 Content Moderation
            </h3>
            <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-3">
              <p className="text-xs sm:text-sm text-gray-700 mb-3">
                Select appropriate age rating. Users under the minimum age won't see this session.
              </p>
              <ContentRatingSelector
                value={contentRating}
                onChange={setContentRating}
                showLabel={false}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccessModal;
