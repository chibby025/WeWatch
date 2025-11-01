// frontend/src/components/MembersModal.jsx
import React from 'react';

const MembersModal = ({ isOpen, onClose, members = [] }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-gray-900 text-white rounded-xl p-6 w-80 max-w-[90%] max-h-[70vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">Room Members ({members.length})</h3>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-white text-xl"
          >
            &times;
          </button>
        </div>

        {members.length === 0 ? (
          <p className="text-gray-400 text-sm">No members in the room yet.</p>
        ) : (
          <div className="overflow-y-auto max-h-60 space-y-2">
            {members.map((member) => (
              <div 
                key={member.user_id || member.id} 
                className="flex items-center gap-3 p-2 bg-gray-800/50 rounded-lg"
              >
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold">
                  {member.username?.[0]?.toUpperCase() || 'U'}
                </div>
                <div>
                  <div className="font-medium">{member.username || 'Anonymous'}</div>
                  {member.is_host && (
                    <span className="text-xs text-yellow-400">Host</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MembersModal;