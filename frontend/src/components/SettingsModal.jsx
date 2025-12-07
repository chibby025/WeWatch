// frontend/src/components/SettingsModal.jsx
import React, { useState, useEffect } from 'react';
import { XMarkIcon, SunIcon, MoonIcon } from '@heroicons/react/24/outline';

const SettingsModal = ({ isOpen, onClose }) => {
  const [theme, setTheme] = useState('dark');

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('wewatch_theme') || 'dark';
    setTheme(savedTheme);
    applyTheme(savedTheme);
  }, []);

  const applyTheme = (selectedTheme) => {
    if (selectedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('wewatch_theme', newTheme);
    applyTheme(newTheme);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
          <h3 className="text-white font-semibold text-lg">Settings</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close settings"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Theme Selector */}
          <div>
            <h4 className="text-white font-medium mb-3">Appearance</h4>
            <div className="space-y-2">
              {/* Light Theme Option */}
              <button
                onClick={() => handleThemeChange('light')}
                className={`
                  w-full flex items-center gap-4 px-4 py-3 rounded-lg 
                  transition-all duration-200 border-2
                  ${theme === 'light' 
                    ? 'bg-blue-600/20 border-blue-500 text-white' 
                    : 'bg-gray-900/50 border-gray-700 text-gray-300 hover:border-gray-600'
                  }
                `}
              >
                <div className={`
                  p-2 rounded-lg
                  ${theme === 'light' ? 'bg-blue-600' : 'bg-gray-700'}
                `}>
                  <SunIcon className="h-5 w-5" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-medium">Light Mode</div>
                  <div className="text-sm text-gray-400">Bright and clear interface</div>
                </div>
                {theme === 'light' && (
                  <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full" />
                  </div>
                )}
              </button>

              {/* Dark Theme Option */}
              <button
                onClick={() => handleThemeChange('dark')}
                className={`
                  w-full flex items-center gap-4 px-4 py-3 rounded-lg 
                  transition-all duration-200 border-2
                  ${theme === 'dark' 
                    ? 'bg-blue-600/20 border-blue-500 text-white' 
                    : 'bg-gray-900/50 border-gray-700 text-gray-300 hover:border-gray-600'
                  }
                `}
              >
                <div className={`
                  p-2 rounded-lg
                  ${theme === 'dark' ? 'bg-blue-600' : 'bg-gray-700'}
                `}>
                  <MoonIcon className="h-5 w-5" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-medium">Dark Mode</div>
                  <div className="text-sm text-gray-400">Easy on the eyes</div>
                </div>
                {theme === 'dark' && (
                  <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full" />
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Other Settings Placeholder */}
          <div>
            <h4 className="text-white font-medium mb-3">Notifications</h4>
            <div className="bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-3">
              <p className="text-gray-400 text-sm">Notification settings coming soon...</p>
            </div>
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Privacy</h4>
            <div className="bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-3">
              <p className="text-gray-400 text-sm">Privacy settings coming soon...</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 flex justify-end">
          <button 
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg text-white font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
