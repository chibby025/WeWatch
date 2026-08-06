import React, { useState } from 'react';

/**
 * ClassTypeModal - Choose between Classroom (25 seats) and Lecture Hall (145 seats)
 * Displays after user selects "Classroom" watch type
 */
export default function ClassTypeModal({ isOpen, onClose, onSelectClassType, currentUser }) {
  const [selectedType, setSelectedType] = useState(null);

  if (!isOpen) return null;

  const handleSelect = (type) => {
    setSelectedType(type);
  };

  const handleConfirm = () => {
    if (selectedType && onSelectClassType) {
      onSelectClassType(selectedType);
      onClose();
    }
  };

  const allClassTypes = [
    {
      id: 'classroom',
      name: 'Classroom',
      capacity: 25,
      icon: '🎓',
      description: 'Interactive classroom setting',
      features: [
        'Up to 25 students',
        'Single audio zone',
        'Intimate learning space',
        'Interactive whiteboard',
        'Real-time quizzes'
      ],
      bestFor: 'Small classes, workshops, tutorials'
    },
    {
      id: 'lecture_hall',
      name: 'Lecture Hall',
      capacity: 145,
      icon: '🏛️',
      description: 'Large lecture hall with tiered seating',
      features: [
        'Up to 145 students',
        '3-section audio zones',
        'Tiered seating layout',
        'Interactive whiteboard',
        'Real-time quizzes',
        'Breakout rooms'
      ],
      bestFor: 'Large lectures, seminars, conferences'
    }
  ];

  // ✅ Filter out regular Classroom for non-super-admins (feature in development)
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const classTypes = isSuperAdmin 
    ? allClassTypes 
    : allClassTypes.filter(type => type.id !== 'classroom');

  const twoUp = classTypes.length === 2;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl sm:rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto border border-green-500/20">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-green-600 to-emerald-600 p-3 sm:p-6 rounded-t-xl sm:rounded-t-2xl z-10">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-lg sm:text-3xl font-bold text-white flex items-center gap-2 sm:gap-3">
                <span className="text-xl sm:text-4xl">🎓</span>
                Choose Class Type
              </h2>
              <p className="text-green-100 mt-0.5 sm:mt-2 text-xs sm:text-base">
                Select the classroom size that fits your needs
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors p-1.5 sm:p-2 hover:bg-white/10 rounded-lg flex-shrink-0"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-6">
          {/* Class Type Options — always side-by-side once there are 2, even on
              mobile, so a super-admin never has to scroll past a full first
              card to see the second option. */}
          <div className={`grid gap-2 sm:gap-6 mb-3 sm:mb-6 ${twoUp ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {classTypes.map((type) => (
              <div
                key={type.id}
                onClick={() => handleSelect(type.id)}
                className={`
                  relative cursor-pointer rounded-lg sm:rounded-xl p-2.5 sm:p-6 border-2 transition-all duration-300
                  ${
                    selectedType === type.id
                      ? 'border-green-500 bg-gradient-to-br from-green-900/40 to-emerald-900/40 shadow-lg shadow-green-500/20 sm:scale-[1.02]'
                      : 'border-gray-700 bg-gradient-to-br from-gray-800 to-gray-900 hover:border-green-600/50 hover:shadow-md'
                  }
                `}
              >
                {/* Selection indicator */}
                {selectedType === type.id && (
                  <div className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-green-500 rounded-full p-0.5 sm:p-1">
                    <svg className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}

                {/* Icon and Title */}
                <div className={`flex items-center gap-1.5 sm:gap-4 mb-1.5 sm:mb-4 ${twoUp ? 'flex-col text-center sm:flex-row sm:text-left' : ''}`}>
                  <div className={twoUp ? 'text-3xl sm:text-6xl' : 'text-4xl sm:text-6xl'}>{type.icon}</div>
                  <div>
                    <h3 className={twoUp ? 'text-sm sm:text-2xl font-bold text-white' : 'text-lg sm:text-2xl font-bold text-white'}>{type.name}</h3>
                    <p className="text-green-400 font-semibold text-[10px] sm:text-base">{type.capacity} Seats</p>
                  </div>
                </div>

                {/* Description — hidden in the cramped 2-up mobile layout, back at sm: and up */}
                <p className={`text-gray-300 mb-1.5 sm:mb-4 text-[11px] sm:text-base ${twoUp ? 'hidden sm:block' : ''}`}>{type.description}</p>

                {/* Features */}
                <div className="space-y-0.5 sm:space-y-2 mb-1.5 sm:mb-4">
                  {type.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-1 sm:gap-2 text-[10px] sm:text-sm">
                      <svg className="w-3 h-3 sm:w-5 sm:h-5 text-green-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-gray-300">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Best For — hidden in the cramped 2-up mobile layout, back at sm: and up */}
                <div className={`pt-1.5 sm:pt-4 border-t border-gray-700 ${twoUp ? 'hidden sm:block' : ''}`}>
                  <p className="text-[9px] sm:text-xs text-gray-400 uppercase font-semibold mb-0.5 sm:mb-1">Best For</p>
                  <p className="text-[10px] sm:text-sm text-gray-300">{type.bestFor}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Info Banner */}
          <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-2.5 sm:p-4 mb-3 sm:mb-6">
            <div className="flex items-start gap-2 sm:gap-3">
              <svg className="w-4 h-4 sm:w-6 sm:h-6 text-blue-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-blue-300 font-semibold mb-0.5 sm:mb-1 text-xs sm:text-base">ClassWatch Features</p>
                <p className="text-blue-200 text-[10px] sm:text-sm">
                  Both classroom types include interactive whiteboard, real-time quizzes, screen sharing,
                  and persistent chat. Choose based on your expected class size.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 sm:gap-4">
            <button
              onClick={onClose}
              className="flex-1 px-3 py-2 sm:px-6 sm:py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors text-xs sm:text-base"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedType}
              className={`
                flex-1 px-3 py-2 sm:px-6 sm:py-3 rounded-lg font-semibold transition-all text-xs sm:text-base
                ${
                  selectedType
                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg shadow-green-500/30'
                    : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              Continue with {selectedType === 'classroom' ? 'Classroom' : selectedType === 'lecture_hall' ? 'Lecture Hall' : 'Selected Type'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
