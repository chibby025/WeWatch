// WeWatch/frontend/src/components/RoomPageLeftSidebar.jsx
// Discord-style vertical sidebar showing room groups for chat segmentation
import React, { useState } from 'react';
import { TrashIcon } from '@heroicons/react/24/outline';
import { getAssetUrl } from '../services/api';

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
  const sidebarRef = React.useRef(null);

  // Set initial scroll position to show Main Chat below header
  React.useEffect(() => {
    if (sidebarRef.current) {
      sidebarRef.current.scrollTop = 0; // Start at top, Main Chat visible
    }
  }, []);

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
    <div
      ref={sidebarRef}
      className="w-16 sm:w-20 md:w-24 lg:w-28 bg-gray-900/50 border-r border-gray-700/50 flex flex-col items-center pt-20 pb-20 gap-2 overflow-y-scroll overflow-x-hidden flex-shrink-0 min-h-0 h-full"
      style={{
        scrollbarWidth: 'none', /* Firefox */
        msOverflowStyle: 'none', /* IE/Edge */
        touchAction: 'pan-y', /* Enable vertical touch scrolling */
        WebkitOverflowScrolling: 'touch', /* iOS smooth scrolling */
      }}
    >
      {/* Hide scrollbar for Chrome/Safari/Opera */}
      <style>{`
        .w-16.overflow-y-scroll::-webkit-scrollbar,
        .sm\\:w-20.overflow-y-scroll::-webkit-scrollbar,
        .md\\:w-24.overflow-y-scroll::-webkit-scrollbar,
        .lg\\:w-28.overflow-y-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      
      {/* Main Chat (No Group) */}
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={() => onGroupSelect(null)}
          className={`relative w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center transition-all group overflow-hidden ${
            selectedGroupId === null 
              ? 'bg-purple-600 shadow-lg shadow-purple-500/50' 
              : 'bg-gray-800 hover:bg-gray-700 hover:rounded-xl active:scale-95'
          }`}
          title="Main Chat"
        >
          {room?.image_url ? (
            <img src={getAssetUrl(room.image_url)} alt={room.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl text-white">💬</span>
          )}
          {selectedGroupId === null && (
            <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full" />
          )}
        </button>
          <span className="text-[10px] sm:text-xs text-gray-400 text-center px-1 max-w-[70px] sm:max-w-[80px] md:max-w-[90px] truncate">Main Chat</span>
      </div>

      {/* Divider */}
      <div className="w-6 sm:w-8 h-px bg-gray-700/50 my-1" />

      {/* Room Groups */}
      {groups.map((group) => (
        <div key={group.ID} className="relative group/item flex flex-col items-center gap-1">
          <button
            onClick={() => onGroupSelect(group.ID)}
            onContextMenu={(e) => {
              e.preventDefault();
              if (onGroupEdit) onGroupEdit(group);
            }}
            className={`relative w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center transition-all overflow-hidden ${
              selectedGroupId === group.ID 
                ? 'bg-purple-600 shadow-lg shadow-purple-500/50' 
                : 'bg-gray-800 hover:bg-gray-700 hover:rounded-xl active:scale-95'
            }`}
            title={group.name}
          >
            {group.icon && group.icon.startsWith('http') ? (
              <img src={group.icon} alt={group.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xl sm:text-2xl text-white">{group.icon}</span>
            )}
            {selectedGroupId === group.ID && (
              <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-6 sm:h-8 bg-white rounded-r-full" />
            )}
          </button>
          <span 
            className="text-[10px] sm:text-xs text-gray-400 text-center px-1 max-w-[60px] sm:max-w-[80px] md:max-w-[100px] truncate cursor-pointer hover:text-white transition-colors"
            onClick={() => { if (onGroupEdit) onGroupEdit(group); }}
          >
            {group.name}
          </span>

          {/* Tooltip - Hide on mobile, show on hover for desktop */}
          <div className="hidden md:block absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none opacity-0 group-hover/item:opacity-100 transition-opacity whitespace-nowrap z-50">
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
