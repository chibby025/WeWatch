import React from 'react';

/**
 * PricingModal - Let host choose between Free or Paid session
 * Shows after watch type selection, before session creation
 */
const PricingModal = ({ isOpen, onClose, onSelectPricing, watchType }) => {
  if (!isOpen) return null;

  const pricingOptions = [
    {
      id: 'free',
      name: 'Free',
      icon: '/icons/freeIcon.svg',
      description: 'Free to join',
      gradient: 'from-green-500 to-emerald-600',
      hoverGradient: 'hover:from-green-600 hover:to-emerald-700',
    },
    {
      id: 'paid',
      name: 'Paid',
      icon: '/icons/coinIcon.svg',
      description: 'Members pay you to join watch session',
      gradient: 'from-yellow-500 to-amber-600',
      hoverGradient: 'hover:from-yellow-600 hover:to-amber-700',
    },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Price</h2>
              <p className="text-purple-100 mt-1 text-sm">
                Choose how members will access this session
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors"
              aria-label="Close modal"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Pricing Options */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {pricingOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => onSelectPricing(option.id)}
              className={`relative group bg-gradient-to-br ${option.gradient} ${option.hoverGradient} hover:shadow-xl transform hover:scale-105 transition-all duration-300 rounded-xl p-6 text-left overflow-hidden`}
            >
              {/* Animated Background Effect */}
              <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
              
              {/* Content */}
              <div className="relative z-10">
                {/* Icon */}
                <div className="flex items-center justify-center mb-4">
                  <div className="bg-white bg-opacity-20 rounded-full p-4">
                    <img 
                      src={option.icon} 
                      alt={option.name}
                      className="w-12 h-12"
                    />
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-2xl font-bold text-white mb-3 text-center">
                  {option.name}
                </h3>

                {/* Description */}
                <p className="text-white text-opacity-90 text-sm leading-relaxed text-center min-h-[3rem]">
                  {option.description}
                </p>

                {/* Hover Indicator */}
                <div className="mt-4 flex items-center justify-center text-white text-opacity-80 text-sm">
                  <span className="group-hover:translate-x-1 transition-transform duration-300">
                    Click to select
                  </span>
                  <svg className="w-4 h-4 ml-2 group-hover:translate-x-2 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>

              {/* Corner Accent */}
              <div className="absolute top-0 right-0 w-20 h-20 bg-white opacity-5 rounded-bl-full"></div>
            </button>
          ))}
        </div>

        {/* Footer Info */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
          <p className="text-sm text-gray-600 text-center">
            💡 You can change pricing settings for scheduled events separately
          </p>
        </div>
      </div>
    </div>
  );
};

export default PricingModal;
