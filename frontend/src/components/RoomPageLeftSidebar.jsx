// WeWatch/frontend/src/components/RoomPageLeftSidebar.jsx
// Discord-style vertical sidebar showing room groups for chat segmentation
import React, { useState } from 'react';
import { TrashIcon } from '@heroicons/react/24/outline';

const RoomPageLeftSidebar = ({ 
  room,
  groups = [], 
  selectedGroupId, 
  onGroupSelect, 
  onDeleteGroup,
  onGroupEdit,
  isHost = false 
}) => {
  const [confirmDelete, setConfirmDelete] = useState(null);

  const handleDeleteClick = (groupId, groupName) => {
    if (confirmDelete === groupId) {
      // Second click - confirm deletion
      onDeleteGroup(groupId);
      setConfirmDelete(null);
    } else {
      // First click - show confirmation
      setConfirmDelete(groupId);
      // Auto-cancel after 3 seconds
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  if (groups.length === 0) {
    return null; // Don't show sidebar if no groups
  }

  return (
    <div className="w-20 sm:w-24 bg-gray-900/50 border-r border-gray-700/50 flex flex-col items-center py-4 gap-2 overflow-y-auto">
      {/* Main Chat (No Group) */}
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={() => onGroupSelect(null)}
          className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all group overflow-hidden ${
            selectedGroupId === null 
              ? 'bg-purple-600 shadow-lg shadow-purple-500/50' 
              : 'bg-gray-800 hover:bg-gray-700 hover:rounded-xl'
          }`}
          title="Main Chat"
        >
          {room?.image_url ? (
            <img src={room.image_url.startsWith('http') ? room.image_url : `${import.meta.env.VITE_API_BASE_URL}${room.image_url.startsWith('/') ? room.image_url : '/' + room.image_url}`} alt={room.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl text-white">💬</span>
          )}
          {selectedGroupId === null && (
            <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full" />
          )}
        </button>
          <span className="text-xs text-gray-400 text-center px-1 max-w-[80px] truncate">Main Chat</span>
      </div>

      {/* Divider */}
      <div className="w-8 h-px bg-gray-700/50 my-1" />

      {/* Room Groups */}
      {groups.map((group) => (
        <div key={group.ID} className="relative group/item flex flex-col items-center gap-1">
          <button
            onClick={() => onGroupSelect(group.ID)}
            onContextMenu={(e) => {
              e.preventDefault();
              if (onGroupEdit) onGroupEdit(group);
            }}
            className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all overflow-hidden ${
              selectedGroupId === group.ID 
                ? 'bg-purple-600 shadow-lg shadow-purple-500/50' 
                : 'bg-gray-800 hover:bg-gray-700 hover:rounded-xl'
            }`}
            title={group.name}
          >
            {group.icon && group.icon.startsWith('http') ? (
              <img src={group.icon} alt={group.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl text-white">{group.icon}</span>
            )}
            {selectedGroupId === group.ID && (
              <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full" />
            )}
          </button>
          <span 
            className="text-xs text-gray-400 text-center px-1 max-w-[80px] truncate cursor-pointer hover:text-white"
            onClick={() => { if (onGroupEdit) onGroupEdit(group); }}
          >
            {group.name}
          </span>

          {/* Tooltip */}
          <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none opacity-0 group-hover/item:opacity-100 transition-opacity whitespace-nowrap z-50">
            {group.name}
            {group.member_count !== undefined && (
              <span className="text-gray-400 ml-1">({group.member_count})</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default RoomPageLeftSidebar;
