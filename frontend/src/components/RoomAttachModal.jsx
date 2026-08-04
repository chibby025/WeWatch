import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { PhotoIcon, DocumentTextIcon, LinkIcon } from '@heroicons/react/24/solid';

const RoomAttachModal = ({ isOpen, onClose, onSelectType }) => {
  if (!isOpen) return null;

  // Poll intentionally excluded — the chat input already has a dedicated poll
  // button that does the same thing, no need to duplicate it here.
  const attachmentTypes = [
    {
      id: 'image',
      label: 'Images',
      Icon: PhotoIcon,
      description: 'Share photos',
      color: 'from-blue-500 to-blue-600'
    },
    {
      id: 'document',
      label: 'Documents',
      Icon: DocumentTextIcon,
      description: 'PDF, DOCX, TXT',
      color: 'from-purple-500 to-purple-600'
    },
    {
      id: 'link',
      label: 'Links',
      Icon: LinkIcon,
      description: 'Share URLs',
      color: 'from-indigo-500 to-purple-600'
    }
  ];

  const handleSelect = (type) => {
    onSelectType(type);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md overflow-hidden animate-fade-in shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Attach to Message</h2>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Attachment Options Grid */}
        <div className="p-6 grid grid-cols-3 gap-4">
          {attachmentTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => handleSelect(type.id)}
              className="group relative bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-xl p-4 transition-all duration-200 hover:scale-105 active:scale-95"
            >
              {/* Gradient wash on hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${type.color} opacity-0 group-hover:opacity-10 rounded-xl transition-opacity`} />

              <div className="relative flex flex-col items-center gap-3">
                <div className={`w-14 h-14 bg-gradient-to-br ${type.color} rounded-full flex items-center justify-center shadow-lg`}>
                  <type.Icon className="w-7 h-7 text-white" />
                </div>

                <div className="text-center">
                  <h3 className="text-gray-900 dark:text-white font-semibold text-sm">{type.label}</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-[11px] mt-0.5">{type.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-6 pb-4">
          <p className="text-gray-400 dark:text-gray-500 text-xs text-center">
            Select an attachment type to continue
          </p>
        </div>
      </div>
    </div>
  );
};

export default RoomAttachModal;
