// WeWatch/frontend/src/components/CreditsModal.jsx
// Modal displaying credits and attributions for 3D assets and resources
import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

const CreditsModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const sketchfabAssets = [
    {
      name: 'Cinema 3D Environment',
      creator: 'Various Artists',
      license: 'CC BY 4.0',
      usage: '3D Cinema Room',
    },
    {
      name: 'Lecture Hall Environment',
      creator: 'Various Artists',
      license: 'CC BY 4.0',
      usage: 'Classroom & Lecture Hall',
    },
    // Add specific asset credits as needed
  ];

  const otherCredits = [
    {
      name: 'Three.js',
      description: '3D Graphics Library',
      link: 'https://threejs.org',
    },
    {
      name: 'React Three Fiber',
      description: 'React renderer for Three.js',
      link: 'https://docs.pmnd.rs/react-three-fiber',
    },
    {
      name: 'LiveKit',
      description: 'Real-time video infrastructure',
      link: 'https://livekit.io',
    },
    {
      name: 'Flutterwave',
      description: 'Payment processing',
      link: 'https://flutterwave.com',
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-700/50">
        {/* Header */}
        <div className="p-6 border-b border-gray-700/50 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <span className="text-3xl">🙏</span>
              Credits & Attributions
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Special thanks to the creators who made this possible
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 3D Assets Section */}
          <div>
            <h3 className="text-lg font-semibold text-purple-300 mb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-purple-500 rounded-full"></span>
              3D Assets from Sketchfab
            </h3>
            <div className="space-y-3">
              {sketchfabAssets.map((asset, index) => (
                <div
                  key={index}
                  className="bg-gradient-to-br from-gray-800/40 to-gray-900/40 rounded-xl p-4 border border-gray-700/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h4 className="text-white font-medium">{asset.name}</h4>
                      <p className="text-sm text-gray-400 mt-1">
                        by <span className="text-purple-400">{asset.creator}</span>
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-300">
                          {asset.license}
                        </span>
                        <span className="text-xs text-gray-500">
                          Used in: {asset.usage}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
                <p className="text-sm text-purple-200 flex items-start gap-2">
                  <span className="text-lg flex-shrink-0">ℹ️</span>
                  <span>
                    3D models sourced from{' '}
                    <a
                      href="https://sketchfab.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-purple-300 underline"
                    >
                      Sketchfab.com
                    </a>
                    , licensed under Creative Commons. We're grateful to the talented 3D artists who share their work.
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Open Source & Services */}
          <div>
            <h3 className="text-lg font-semibold text-blue-300 mb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-blue-500 rounded-full"></span>
              Open Source & Services
            </h3>
            <div className="space-y-2">
              {otherCredits.map((credit, index) => (
                <a
                  key={index}
                  href={credit.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-gradient-to-br from-gray-800/40 to-gray-900/40 rounded-xl p-4 border border-gray-700/30 hover:border-gray-600/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-white font-medium">{credit.name}</h4>
                      <p className="text-sm text-gray-400 mt-0.5">{credit.description}</p>
                    </div>
                    <svg
                      className="w-5 h-5 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </div>
                </a>
              ))}
            </div>
          </div>

          {/* About WeWatch */}
          <div>
            <h3 className="text-lg font-semibold text-green-300 mb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-green-500 rounded-full"></span>
              About WeWatch
            </h3>
            <div className="bg-gradient-to-br from-gray-800/40 to-gray-900/40 rounded-xl p-4 border border-gray-700/30">
              <p className="text-sm text-gray-300 leading-relaxed">
                WeWatch is a social video streaming platform that brings people together through
                immersive 3D experiences. From virtual cinemas to interactive classrooms and
                church services, we're redefining how communities connect and share content online.
              </p>
              <div className="mt-3 pt-3 border-t border-gray-700/50">
                <p className="text-xs text-gray-400">
                  Built with ❤️ in Africa • © 2026 WeWatch
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700/50 p-4 bg-gray-900/50">
          <button
            onClick={onClose}
            className="w-full py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium rounded-xl transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreditsModal;
