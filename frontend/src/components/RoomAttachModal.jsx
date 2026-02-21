import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

const RoomAttachModal = ({ isOpen, onClose, onSelectType }) => {
  if (!isOpen) return null;

  const attachmentTypes = [
    {
      id: 'image',
      label: 'Images',
      icon: '/icons/imageIcon.svg',
      description: 'Share photos',
      color: 'from-blue-500 to-blue-600'
    },
    {
      id: 'document',
      label: 'Documents',
      icon: '/icons/documentIcon.svg',
      description: 'PDF, DOCX, TXT',
      color: 'from-purple-500 to-purple-600'
    },
    {
      id: 'link',
      label: 'Links',
      icon: '/icons/linkIcon.svg',
      description: 'Share URLs',
      color: 'from-green-500 to-green-600'
    },
    {
      id: 'poll',
      label: 'Poll',
      icon: '/icons/pollIcon.svg',
      description: 'Create a vote',
      color: 'from-orange-500 to-orange-600'
    }
  ];

  const handleSelect = (type) => {
    onSelectType(type);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl w-full max-w-md overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="bg-gray-700 px-6 py-4 flex items-center justify-between border-b border-gray-600">
          <h2 className="text-xl font-bold text-white">Attach to Message</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Attachment Options Grid */}
        <div className="p-6 grid grid-cols-2 gap-4">
          {attachmentTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => handleSelect(type.id)}
              className="group relative bg-gray-700 hover:bg-gray-600 rounded-xl p-6 transition-all duration-200 hover:scale-105 active:scale-95"
            >
              {/* Gradient background on hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${type.color} opacity-0 group-hover:opacity-10 rounded-xl transition-opacity`} />
              
              <div className="relative flex flex-col items-center gap-3">
                {/* Icon */}
                <div className={`w-16 h-16 bg-gradient-to-br ${type.color} rounded-full flex items-center justify-center shadow-lg`}>
                  <img 
                    src={type.icon} 
                    alt={type.label}
                    className="w-8 h-8 filter brightness-0 invert"
                    onError={(e) => {
                      // Fallback to colored square if icon not found
                      e.target.style.display = 'none';
                      e.target.parentElement.innerHTML = `<div class="text-white text-2xl font-bold">${type.label[0]}</div>`;
                    }}
                  />
                </div>
                
                {/* Label */}
                <div className="text-center">
                  <h3 className="text-white font-semibold text-base">{type.label}</h3>
                  <p className="text-gray-400 text-xs mt-1">{type.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-6 pb-4">
          <p className="text-gray-400 text-xs text-center">
            Select an attachment type to continue
          </p>
        </div>
      </div>
    </div>
  );
};

export default RoomAttachModal;
