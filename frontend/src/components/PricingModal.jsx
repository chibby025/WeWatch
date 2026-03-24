import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

/**
 * PricingModal - Let host choose between Free or Paid session + Content Rating
 * Shows after watch type selection, before session creation
 */
const PricingModal = ({ isOpen, onClose, onSelectPricing, watchType }) => {
  const [contentRating, setContentRating] = useState('G'); // Default to General
  const [scrollIndex, setScrollIndex] = useState(0);
  const carouselRef = useRef(null);

  const ratings = [
    {
      id: 'G',
      name: 'G',
      desc: 'General Audiences - All ages admitted',
      icon: '/icons/G Rating Icon.png',
      gradient: 'from-green-400 to-green-600',
      minAge: 0
    },
    {
      id: 'PG',
      name: 'PG',
      desc: 'Parental Guidance - Some material may not be suitable for children',
      icon: '/icons/PG Rating Icon.png',
      gradient: 'from-blue-400 to-blue-600',
      minAge: 0
    },
    {
      id: '13+',
      name: '13+',
      desc: 'Teens 13+ - May contain content inappropriate for children under 13',
      icon: '/icons/13_ Rating Icon.png',
      gradient: 'from-yellow-400 to-yellow-600',
      minAge: 13
    },
    {
      id: '18+',
      name: '18+',
      desc: 'Adults Only - Restricted to adults 18 and over',
      icon: '/icons/18_ Rating Icon.png',
      gradient: 'from-red-400 to-red-600',
      minAge: 18
    },
    {
      id: 'Mature',
      name: 'Mature',
      desc: 'Mature Content - Explicit content for adults 18+',
      icon: '/icons/Mature Rating Icon.png',
      gradient: 'from-purple-400 to-purple-600',
      minAge: 18
    }
  ];

  const pricingOptions = [
    {
      id: 'free',
      name: 'Free Session',
      icon: '/icons/freeIcon.svg',
      description: 'Open to everyone',
      subtext: 'No payment required',
      gradient: 'from-green-500 to-emerald-600',
      hoverGradient: 'hover:from-green-600 hover:to-emerald-700',
      svgIcon: (
        <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    {
      id: 'paid',
      name: 'Paid Session',
      icon: '/icons/coinIcon.svg',
      description: 'Earn tokens',
      subtext: 'Set entry price',
      gradient: 'from-yellow-500 to-amber-600',
      hoverGradient: 'hover:from-yellow-600 hover:to-amber-700',
      svgIcon: (
        <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
  ];

  // Auto-select centered card on scroll
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const handleScroll = () => {
      const scrollLeft = carousel.scrollLeft;
      const cards = carousel.children;
      if (cards.length === 0) return;
      
      // Get the actual card width from the first card
      const cardWidth = cards[0].offsetWidth + 8; // +8 for gap-2
      const centerIndex = Math.round(scrollLeft / cardWidth);
      
      if (centerIndex >= 0 && centerIndex < ratings.length) {
        setScrollIndex(centerIndex);
        setContentRating(ratings[centerIndex].id);
      }
    };

    carousel.addEventListener('scroll', handleScroll);
    return () => carousel.removeEventListener('scroll', handleScroll);
  }, [ratings]);

  const scrollToCard = (index) => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const cards = Array.from(carousel.children);
    if (cards.length === 0 || !cards[index]) return;

    // Get the target card element
    const targetCard = cards[index];
    const cardRect = targetCard.getBoundingClientRect();
    const carouselRect = carousel.getBoundingClientRect();
    
    // Calculate scroll position to center the card
    const scrollLeft = carousel.scrollLeft + (cardRect.left - carouselRect.left) - (carouselRect.width / 2) + (cardRect.width / 2);
    
    carousel.scrollTo({
      left: scrollLeft,
      behavior: 'smooth'
    });
    
    // Update state immediately for responsive feel
    setScrollIndex(index);
    setContentRating(ratings[index].id);
  };

  const handlePrevious = () => {
    const newIndex = Math.max(0, scrollIndex - 1);
    scrollToCard(newIndex);
  };

  const handleNext = () => {
    const newIndex = Math.min(ratings.length - 1, scrollIndex + 1);
    scrollToCard(newIndex);
  };

  const handleSelectPricing = (pricingId) => {
    onSelectPricing(pricingId, contentRating);
  };

  if (!isOpen) return null;

  const currentRating = ratings[scrollIndex];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-fade-in max-h-[96vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-3 sm:p-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg sm:text-xl font-bold">Session Setup</h2>
              <p className="text-purple-100 mt-0.5 text-xs">
                Choose pricing and content rating
              </p>
            </div>
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
        </div>

        <div className="p-3 sm:p-4 space-y-3">
          {/* Compact Pricing Section */}
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-1.5 flex items-center gap-2">
              <span>💰</span>
              <span>Pricing</span>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {pricingOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleSelectPricing(option.id)}
                  className="relative group overflow-hidden rounded-xl transition-all duration-300 hover:shadow-2xl hover:scale-[1.03] active:scale-95"
                >
                  {/* Background with gradient */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${option.gradient} transition-all duration-300 group-hover:scale-110`}></div>
                  
                  {/* Animated shine effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                  
                  {/* Glow effect on hover */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className={`absolute inset-0 bg-gradient-to-br ${option.gradient} blur-xl`}></div>
                  </div>
                  
                  {/* Content */}
                  <div className="relative z-10 p-4 sm:p-5 flex flex-col items-center">
                    {/* Icon with animated background */}
                    <div className="relative mb-3">
                      <div className="absolute inset-0 bg-white/20 rounded-full blur-md scale-110"></div>
                      <div className="relative bg-white/25 backdrop-blur-sm rounded-full p-3 group-hover:scale-110 transition-transform duration-300 text-white">
                        {option.svgIcon}
                      </div>
                    </div>
                    
                    {/* Title */}
                    <h4 className="text-lg sm:text-xl font-black text-white mb-1.5 tracking-wide" style={{ fontFamily: '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif', letterSpacing: '0.015em' }}>
                      {option.name}
                    </h4>
                    
                    {/* Description */}
                    <p className="text-white/90 font-medium text-xs sm:text-sm mb-1">
                      {option.description}
                    </p>
                    
                    {/* Subtext */}
                    <p className="text-white/75 text-[11px] sm:text-xs mb-3">
                      {option.subtext}
                    </p>
                    
                    {/* Action button */}
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
              ))}
            </div>
          </div>

          {/* Content Rating Carousel Section */}
          <div className="border-t-2 border-gray-200 pt-2.5">
            <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-1.5 flex items-center gap-2">
              <span>🔞</span>
              <span>Content Rating</span>
            </h3>
            
            {/* Carousel */}
            <div className="relative">
              {/* Left Arrow */}
              <button
                onClick={handlePrevious}
                disabled={scrollIndex === 0}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white shadow-lg rounded-full p-1.5 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 transition-all"
              >
                <ChevronLeftIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700" />
              </button>

              {/* Carousel Container */}
              <div
                ref={carouselRef}
                className="flex gap-2 overflow-x-auto snap-x snap-mandatory scrollbar-hide px-7 sm:px-9 py-2"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {ratings.map((rating, index) => {
                  const isCentered = index === scrollIndex;
                  return (
                    <div
                      key={rating.id}
                      className={`flex-shrink-0 snap-center transition-all duration-300 cursor-pointer ${
                        isCentered 
                          ? 'w-24 sm:w-32' 
                          : 'w-16 sm:w-24 opacity-50 scale-90'
                      }`}
                      onClick={() => scrollToCard(index)}
                    >
                      <div className={`bg-gradient-to-br ${rating.gradient} rounded-lg p-2 sm:p-3 shadow-lg transform transition-all ${
                        isCentered ? 'ring-4 ring-purple-500 ring-offset-2' : 'hover:scale-105'
                      }`}>
                        <img
                          src={rating.icon}
                          alt={rating.name}
                          className="w-full h-auto rounded"
                        />
                        <p className="text-white font-bold text-center mt-1.5 text-xs sm:text-sm">
                          {rating.name}
                        </p>
                        {rating.minAge > 0 && (
                          <p className="text-white text-opacity-90 text-center text-[10px] sm:text-xs">
                            {rating.minAge}+
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Arrow */}
              <button
                onClick={handleNext}
                disabled={scrollIndex === ratings.length - 1}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white shadow-lg rounded-full p-1.5 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 transition-all"
              >
                <ChevronRightIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700" />
              </button>
            </div>

            {/* Current Rating Description */}
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-lg p-2.5 sm:p-3 mt-2">
              <div className="flex items-start gap-2 sm:gap-3">
                <div className="flex-shrink-0">
                  <div className={`bg-gradient-to-br ${currentRating.gradient} rounded-lg p-1.5 sm:p-2`}>
                    <img
                      src={currentRating.icon}
                      alt={currentRating.name}
                      className="w-8 h-8 sm:w-10 sm:h-10"
                    />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-gray-900 text-xs sm:text-sm mb-0.5">
                    {currentRating.name} Rating
                  </h4>
                  <p className="text-[11px] sm:text-xs text-gray-700 leading-snug">
                    {currentRating.desc}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default PricingModal;