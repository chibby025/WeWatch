// WeWatch/frontend/src/components/MemberList.jsx
import React from 'react';
import { UserIcon } from '@heroicons/react/24/outline';

const MemberList = ({ members, onClose, isHost }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 mt-2">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-gray-800">Room Members ({members.length})</h3>
        <button 
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          Close
        </button>
      </div>
      
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {members.length > 0 ? (
          members.map((member) => (
            <div 
              key={member.id} 
              className="flex items-center justify-between p-2 hover:bg-gray-50 rounded transition-colors duration-150"
            >
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm mr-3">
                  {member.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-gray-800">{member.username}</div>
                  {member.is_host && (
                    <div className="flex items-center text-xs text-gray-500">
                        <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium">
                            Host
                        </span>
                    </div>
                    )}
                </div>
              </div>
              {member.user_role && (
                <div className="text-xs text-gray-500 capitalize">
                    {member.user_role}
                </div>
               )}
              
              {isHost && member.id !== authenticatedUserID && (
                <button className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded transition-colors duration-150">
                  Grant Control
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-4 text-gray-500">
            No members found in this room
          </div>
        )}
      </div>
    </div>
  );
};

export default MemberList;