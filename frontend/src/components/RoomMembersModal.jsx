// WeWatch/frontend/src/components/RoomMembersModal.jsx
// Modal to display room members with option to add more
import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

const RoomMembersModal = ({ isOpen, onClose, members, onAddMembers }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Room Members ({members.length})
            </h2>
            <button
              onClick={onAddMembers}
              className="hover:opacity-70 transition-opacity"
              title="Add Members"
            >
              <img src="/icons/newMemberIcon.svg" alt="Add Members" className="h-6 w-6" />
            </button>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Members List */}
        <div className="flex-1 overflow-y-auto p-4">
          {members.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No members yet
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                    {member.username?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  
                  {/* Member Info */}
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {member.username || `User ${member.user_id}`}
                    </div>
                    {member.user_role === 'host' && (
                      <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                        Host
                      </div>
                    )}
                  </div>

                  {/* Status Indicator */}
                  {member.is_online && (
                    <div className="w-2.5 h-2.5 bg-green-500 rounded-full" title="Online" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoomMembersModal;
