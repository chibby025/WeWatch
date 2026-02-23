import React from 'react';
import { FilmIcon, CubeIcon, AcademicCapIcon } from '@heroicons/react/24/outline';

const WatchTypeInfoModal = ({ isOpen, onClose, onContinue, watchType }) => {
  if (!isOpen) return null;

  // Define content for each watch type
  const watchTypeContent = {
    video: {
      title: 'Video Watch',
      subtitle: 'Your Canvas for Connection',
      icon: FilmIcon,
      gradient: 'from-purple-500 to-purple-700',
      emoji: '🎬',
      images: [
        {
          src: '/icons/Videowatch1.png',
          title: 'Turn Any Video Into An Event',
          description: 'Shared experiences made easy'
        },
        {
          src: '/icons/Videowatch2.png',
          title: 'No Setup, Just Show Up',
          description: 'Instant watch parties'
        },
        {
          src: '/icons/Videowatch3.png',
          title: 'Connect Without Limits',
          description: 'From 2 to 200 people'
        },
        {
          src: '/icons/Videowatch4.png',
          title: 'Infinite Possibilities',
          description: 'From telemedicine to TV shows, any video works together'
        }
      ],
      features: [
        '🎥 Simple synchronized playback',
        '🎯 Works with any occasion',
        '💬 Video + Audio + Chat',
        '⚡ Instant setup, zero complexity'
      ]
    },
    '3d_cinema': {
      title: '3D Cinema',
      subtitle: 'Premium Theater Experience',
      icon: CubeIcon,
      gradient: 'from-blue-500 to-blue-700',
      emoji: '🎭',
      images: [
        {
          src: '/icons/cinema1.png',
          title: 'Your Stage for Premieres',
          description: 'Launch indie films, comedy, podcasts & music in virtual luxury'
        },
        {
          src: '/icons/cinema2.png',
          title: 'Spatial Audio Magic',
          description: 'Hear every laugh, every note - spatial audio brings seats to life'
        },
        {
          src: '/icons/cinema3.png',
          title: 'Monetize Your Craft',
          description: 'Sell tickets, host paid premieres, earn from your art'
        },
        {
          src: '/icons/cinema4.png',
          title: 'From Premiere to Big Screen',
          description: 'Build your audience, prove market demand, unlock festival & distribution opportunities'
        }
      ],
      features: [
        '🎭 3D cinema environment',
        '🔊 Spatial audio positioning',
        '💰 Ticketed premieres',
        '🎬 Perfect for indie creators',
        '🏆 Festival submission pipeline',
        '📊 Industry-ready analytics'
      ]
    },
    classroom: {
      title: 'Classroom',
      subtitle: 'Interactive Learning Space',
      icon: AcademicCapIcon,
      gradient: 'from-green-500 to-green-700',
      emoji: '🎓',
      images: [
        {
          src: '/icons/lecture1.png',
          title: 'The Digital Academy',
          description: 'Where questions spark wisdom and knowledge flows freely'
        },
        {
          src: '/icons/lecture2.png',
          title: 'Tools of Discovery',
          description: 'Whiteboard wisdom meets instant assessment technology'
        },
        {
          src: '/icons/lecture3.png',
          title: 'Community of Minds',
          description: 'Every voice heard, every answer counted, learning together'
        },
        {
          src: '/icons/onlineclass.png',
          title: 'Attend Classes Online',
          description: 'Learning without borders, education from anywhere, presence that transcends distance'
        }
      ],
      features: [
        '📚 3D classroom environment',
        '✍️ Interactive whiteboard',
        '📝 Built-in quiz system',
        '🎤 Row-based audio zones'
      ]
    }
  };

  const content = watchTypeContent[watchType] || watchTypeContent.video;
  const IconComponent = content.icon;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-y-auto animate-fade-in custom-sleek-scrollbar">
        {/* Header */}
        <div className={`bg-gradient-to-r ${content.gradient} text-white p-4 sm:p-6`}>
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="bg-white bg-opacity-20 rounded-full p-2 sm:p-3">
                <IconComponent className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-3xl font-bold">{content.title}</h2>
                  <span className="text-2xl sm:text-3xl">{content.emoji}</span>
                </div>
                <p className="text-white text-opacity-90 mt-1 text-sm sm:text-lg">
                  {content.subtitle}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors flex-shrink-0"
              aria-label="Close modal"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Image Grid */}
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6">
            {content.images.map((image, index) => (
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

                {/* Number Badge */}
                <div className={`absolute top-2 right-2 sm:top-3 sm:right-3 bg-gradient-to-br ${content.gradient} text-white w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm shadow-lg`}>
                  {index + 1}
                </div>
              </div>
            ))}
          </div>

          {/* Features List */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 sm:p-6 mb-6">
            <h3 className="font-bold text-gray-900 text-base sm:text-lg mb-3 sm:mb-4">
              ✨ What You Get:
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {content.features.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 text-gray-700 text-xs sm:text-sm"
                >
                  <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${content.gradient}`}></div>
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl transition-colors duration-200"
            >
              Back to Options
            </button>
            <button
              onClick={onContinue}
              className={`flex-1 px-6 py-3 bg-gradient-to-r ${content.gradient} hover:shadow-lg text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-105 active:scale-95`}
            >
              Continue with {content.title} →
            </button>
          </div>
        </div>

        {/* Footer Tip */}
        <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:py-4 border-t border-gray-200">
          <p className="text-xs sm:text-sm text-gray-600 text-center">
            💡 <span className="font-medium">Next:</span> Choose if this session will be free or paid
          </p>
        </div>
      </div>
    </div>
  );
};

export default WatchTypeInfoModal;
