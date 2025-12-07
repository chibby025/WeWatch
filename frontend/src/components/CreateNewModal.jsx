// WeWatch/frontend/src/components/CreateNewModal.jsx
// Modal to choose between Instant Watch or Create Persistent Room
import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

const CreateNewModal = ({ isOpen, onClose, onInstantWatch, onCreateRoom }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl w-full max-w-md">
        {/* Header */}
        <div className="border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Create New</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Options */}
        <div className="p-6 space-y-3">
          {/* Instant Watch Option */}
          <button
            onClick={() => {
              onInstantWatch();
              onClose();
            }}
            className="w-full group"
          >
            <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 rounded-lg transition-all shadow-md hover:shadow-lg">
              <div className="flex-shrink-0">
                <img 
                  src="/icons/instantWatch.svg" 
                  alt="Instant Watch" 
                  className="w-10 h-10"
                />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-white font-semibold">Instant Watch</h3>
                <p className="text-purple-100 text-xs">
                  Quick immediate watch sessions
                </p>
              </div>
            </div>
          </button>

          {/* Create Room Option */}
          <button
            onClick={() => {
              onCreateRoom();
              onClose();
            }}
            className="w-full group"
          >
            <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 rounded-lg transition-all shadow-md hover:shadow-lg">
              <div className="flex-shrink-0">
                <img 
                  src="/icons/regularWatchIcon.svg" 
                  alt="Create Room" 
                  className="w-10 h-10"
                />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-white font-semibold">Create Room</h3>
                <p className="text-green-100 text-xs">
                  Persistent rooms for scheduled watching
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateNewModal;
