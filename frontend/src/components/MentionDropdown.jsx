import React, { useEffect, useRef } from 'react';
import { UserCircleIcon } from '@heroicons/react/24/outline';

const MentionDropdown = ({ members, query, onSelect, onClose }) => {
  const listRef = useRef(null);
  const [activeIndex, setActiveIndex] = React.useState(0);

  const filtered = members.filter(m =>
    m.username?.toLowerCase().startsWith(query.toLowerCase())
  ).slice(0, 6);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e) => {
      if (!filtered.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filtered[activeIndex]) onSelect(filtered[activeIndex].username);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [filtered, activeIndex, onSelect, onClose]);

  // Reset active index when query changes
  useEffect(() => { setActiveIndex(0); }, [query]);

  if (!filtered.length) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 mb-1 w-56 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden z-50"
    >
      {filtered.map((member, idx) => (
        <button
          key={member.user_id || member.id || member.username}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onSelect(member.username); }}
          onMouseEnter={() => setActiveIndex(idx)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
            idx === activeIndex ? 'bg-purple-700/40' : 'hover:bg-gray-700/60'
          }`}
        >
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center overflow-hidden flex-shrink-0">
            {member.avatar_url
              ? <img src={member.avatar_url} alt={member.username} className="w-full h-full object-cover" />
              : <UserCircleIcon className="w-4 h-4 text-white" />
            }
          </div>
          <span className="text-sm text-white truncate">@{member.username}</span>
        </button>
      ))}
    </div>
  );
};

export default MentionDropdown;
