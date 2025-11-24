// frontend/src/components/MembersModal.jsx
import React from 'react';

export default function MembersModal({ 
  isOpen, 
  onClose, 
  members = [],
  fetchMembers = null,
  onMemberClick, // ✅ NEW prop
}) {
  React.useEffect(() => {
    if (isOpen && fetchMembers) {
      fetchMembers();
    }
  }, [isOpen, fetchMembers]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
      <div className="bg-gray-800 p-6 rounded-lg w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white text-lg font-bold">
            Room Members ({members.length})
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">×</button>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {members.map(member => (
            <div 
              key={member.id} 
              className="text-white py-2 px-3 rounded hover:bg-gray-700 cursor-pointer"
              onClick={() => onMemberClick?.(member)} // ✅ CLICK HANDLER
            >
              {member.username || `User ${member.id}`}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}