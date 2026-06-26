// WeWatch/frontend/src/components/CreditsModal.jsx
// Modal displaying credits and attributions for 3D assets and resources
import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

const CreditsModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const sketchfabAssets = [
    {
      name: 'Cinema Theater 3D Model',
      creator: 'Comicaroid',
      license: 'CC BY 4.0',
      usage: '3D Cinema Room',
      link: 'https://sketchfab.com/Comicaroid',
    },
    {
      name: 'Lecture Hall Environment',
      creator: 'Comicaroid',
      license: 'CC BY 4.0',
      usage: 'Classroom & Lecture Hall',
      link: 'https://sketchfab.com/Comicaroid',
    },
  ];

  const openSourceSoftware = [
    {
      name: 'DOOM (Arcade Mode)',
      creator: 'id Software, Chocolate Doom contributors, Cloudflare, VectorPrivacy',
      license: 'GPL-2.0',
      usage: 'Arcade Mode mini-game',
      link: 'https://github.com/letswatchout/doom-arcade',
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
          {/* About LetsWatchOut */}
          <div>
            <h3 className="text-lg font-semibold text-green-300 mb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-green-500 rounded-full"></span>
              About LetsWatchOut
            </h3>
            <div className="bg-gradient-to-br from-gray-800/40 to-gray-900/40 rounded-xl p-5 border border-gray-700/30">
              <p className="text-sm text-gray-300 leading-relaxed mb-3">
                LetsWatchOut started when Chinweokwu Chibuzor, a regular guy who taught himself to 
                code, couldn't accept that his friends were becoming strangers. Some had japa'd abroad. 
                Others stayed home but couldn't afford fuel to meet up. The solution? Bring everyone 
                together online, from their phones.
              </p>
              <p className="text-sm text-gray-300 leading-relaxed mb-3">
                What began as a way to stay connected evolved into something bigger: a platform where 
                every room becomes its own world. Your cinema. Your church. Your lecture hall. Your 
                podcast studio. Your TV station. Your game house. Your boys' hangout from uni. Your 
                get-together with guys far from each other. Whatever your unique expression—business 
                or pleasure—be yourself, attract those who see what you see, and grow your audience 
                organically.
              </p>
              <p className="text-sm text-gray-300 leading-relaxed">
                This is technology solving problems that are uniquely Nigerian, uniquely African, and 
                oddly universal. Because distance, rising costs, and the desire to connect? That's 
                everyone's story.
              </p>
              <p className="text-sm text-purple-300 font-medium mt-4">
                LetsWatchOut and see where your room takes you.
              </p>
              <div className="mt-4 pt-4 border-t border-gray-700/50">
                <p className="text-xs text-gray-400">
                  Built by Chinweokwu Chibuzor • Nigeria 🇳🇬 • © 2026 LetsWatchOut
                </p>
              </div>
            </div>
          </div>

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
                        by{' '}
                        <a
                          href={asset.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300 underline"
                        >
                          {asset.creator}
                        </a>
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

          {/* Open Source Software Section */}
          <div>
            <h3 className="text-lg font-semibold text-purple-300 mb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-purple-500 rounded-full"></span>
              Open Source Software
            </h3>
            <div className="space-y-3">
              {openSourceSoftware.map((software, index) => (
                <div
                  key={index}
                  className="bg-gradient-to-br from-gray-800/40 to-gray-900/40 rounded-xl p-4 border border-gray-700/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h4 className="text-white font-medium">{software.name}</h4>
                      <p className="text-sm text-gray-400 mt-1">{software.creator}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-300">
                          {software.license}
                        </span>
                        <span className="text-xs text-gray-500">
                          Used in: {software.usage}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Source code available at{' '}
                        <a
                          href={software.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300 underline"
                        >
                          {software.link}
                        </a>
                        {' '}per {software.license}.
                      </p>
                    </div>
                  </div>
                </div>
              ))}
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
