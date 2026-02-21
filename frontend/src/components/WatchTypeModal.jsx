import React from 'react';
import { FilmIcon, CubeIcon } from '@heroicons/react/24/outline';

const WatchTypeModal = ({ isOpen, onClose, onSelectType, title = "Choose Watch Experience", currentUser }) => {
  if (!isOpen) return null;

  const watchTypes = [
    {
      id: 'video',
      name: 'Video Watch',
      icon: FilmIcon,
      description: 'Standard video player with synchronized playback',
      color: 'purple',
      gradient: 'from-purple-500 to-purple-700',
      emoji: '🎬'
    },
    {
      id: '3d_cinema',
      name: '3D Cinema',
      icon: CubeIcon,
      description: 'Immersive 3D theater experience with spatial audio',
      color: 'blue',
      gradient: 'from-blue-500 to-blue-700',
      emoji: '🎭'
    },
    {
      id: 'classroom',
      name: 'Classroom',
      icon: CubeIcon,
      description: '3D classroom with whiteboard, quizzes, and interactive learning',
      color: 'green',
      gradient: 'from-green-500 to-green-700',
      emoji: '🎓'
    }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto animate-fade-in custom-sleek-scrollbar">
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
                onClick={() => onSelectType(type.id)}
                className={`relative group bg-gradient-to-br ${type.gradient} hover:shadow-xl transform hover:scale-105 active:scale-95 transition-all duration-300 rounded-xl p-4 sm:p-6 text-left overflow-hidden`}
              >
                {/* Animated Background Effect */}
                <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
                
                {/* Content */}
                <div className="relative z-10">
                  {/* Icon & Emoji */}
                  <div className="flex items-center justify-between mb-2 sm:mb-4">
                    <div className="bg-white bg-opacity-20 rounded-full p-2 sm:p-3">
                      <IconComponent className="w-5 h-5 sm:w-8 sm:h-8 text-white" />
                    </div>
                    <span className="text-2xl sm:text-4xl">{type.emoji}</span>
                  </div>

                  {/* Title */}
                  <h3 className="text-base sm:text-xl font-bold text-white mb-1 sm:mb-2">
                    {type.name}
                  </h3>

                  {/* Description */}
                  <p className="text-white text-opacity-90 text-xs sm:text-sm leading-relaxed">
                    {type.description}
                  </p>

                  {/* Hover Indicator */}
                  <div className="mt-2 sm:mt-4 flex items-center text-white text-opacity-80 text-xs sm:text-sm">
                    <span className="group-hover:translate-x-1 transition-transform duration-300">
                      Click to select
                    </span>
                    <svg className="w-3 h-3 sm:w-4 sm:h-4 ml-2 group-hover:translate-x-2 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                {/* Corner Accent */}
                <div className="absolute top-0 right-0 w-20 h-20 bg-white opacity-5 rounded-bl-full"></div>
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
