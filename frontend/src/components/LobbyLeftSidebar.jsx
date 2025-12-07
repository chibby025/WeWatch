// frontend/src/components/LobbyLeftSidebar.jsx
import React from 'react';
import {
  UserIcon,
  CreditCardIcon,
  UserGroupIcon,
  UserPlusIcon,
  PhoneIcon,
  BookmarkIcon,
  Cog6ToothIcon,
  QuestionMarkCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

const LobbyLeftSidebar = ({ 
  isOpen, 
  onClose, 
  currentUser,
  onMyProfileClick,
  onSettingsClick
}) => {
  if (!isOpen) return null;

  const menuItems = [
    {
      id: 'profile',
      label: 'My Profile',
      icon: UserIcon,
      onClick: onMyProfileClick,
      enabled: true
    },
    {
      id: 'payment',
      label: 'Payment',
      icon: CreditCardIcon,
      onClick: () => alert('Payment - Coming Soon!'),
      enabled: false,
      badge: 'Coming Soon'
    },
    {
      id: 'groups',
      label: 'My Groups',
      icon: UserGroupIcon,
      onClick: () => alert('My Groups - Coming Soon!'),
      enabled: false,
      badge: 'Coming Soon'
    },
    {
      id: 'contacts',
      label: 'My Contacts',
      icon: UserPlusIcon,
      onClick: () => alert('My Contacts - Coming Soon!'),
      enabled: false,
      badge: 'Coming Soon'
    },
    {
      id: 'calls',
      label: 'Calls',
      icon: PhoneIcon,
      onClick: () => alert('Calls - Coming Soon!'),
      enabled: false,
      badge: 'Coming Soon'
    },
    {
      id: 'saved',
      label: 'Saved Messages',
      icon: BookmarkIcon,
      onClick: () => alert('Saved Messages - Coming Soon!'),
      enabled: false,
      badge: 'Coming Soon'
    },
    {
      id: 'invite',
      label: 'Invite Friends',
      icon: UserPlusIcon,
      onClick: () => alert('Invite Friends - Coming Soon!'),
      enabled: false,
      badge: 'Coming Soon'
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Cog6ToothIcon,
      onClick: onSettingsClick,
      enabled: true
    }
  ];

  const userAvatar = currentUser?.avatar_url || '/icons/user1avatar.svg';
  const username = currentUser?.username || currentUser?.Username || 'User';

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-[375px] max-w-[90vw] bg-[#2B2B2B] z-50 shadow-2xl transform transition-transform duration-300 ease-in-out overflow-y-auto">
        {/* Header Section */}
        <div className="relative pt-8 pb-6 px-6 border-b border-gray-700">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            aria-label="Close sidebar"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>

          {/* Help & Support Button */}
          <button
            onClick={() => alert('Help & Support - Coming Soon!')}
            className="absolute top-4 right-14 text-gray-400 hover:text-white transition-colors"
            aria-label="Help and Support"
          >
            <QuestionMarkCircleIcon className="h-6 w-6" />
          </button>

          {/* User Avatar */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <img 
                src={userAvatar}
                alt={username}
                className="w-32 h-32 rounded-full object-cover border-4 border-white/20"
                onError={(e) => {
                  e.target.src = '/icons/user1avatar.svg';
                }}
              />
            </div>
            
            {/* Username */}
            <h2 className="mt-4 text-white text-xl font-bold">
              {username}
            </h2>
          </div>
        </div>

        {/* Menu Items */}
        <nav className="py-6 px-4">
          <ul className="space-y-2">
            {menuItems.map((item) => {
              const IconComponent = item.icon;
              return (
                <li key={item.id}>
                  <button
                    onClick={item.onClick}
                    disabled={!item.enabled}
                    className={`
                      w-full flex items-center gap-4 px-4 py-3 rounded-lg 
                      transition-all duration-200 text-left
                      ${item.enabled 
                        ? 'text-white hover:bg-gray-700/50 active:bg-gray-700 cursor-pointer' 
                        : 'text-gray-500 cursor-not-allowed opacity-60'
                      }
                    `}
                  >
                    <IconComponent className="h-6 w-6 flex-shrink-0" />
                    <span className="text-base font-medium flex-1">
                      {item.label}
                    </span>
                    {item.badge && (
                      <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
                        {item.badge}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer - Help & Support (Mobile visible version) */}
        <div className="px-4 pb-6 mt-auto">
          <button
            onClick={() => alert('Help & Support - Coming Soon!')}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700/50 transition-colors"
          >
            <QuestionMarkCircleIcon className="h-5 w-5" />
            <span className="text-sm font-medium">Help & Support</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default LobbyLeftSidebar;
