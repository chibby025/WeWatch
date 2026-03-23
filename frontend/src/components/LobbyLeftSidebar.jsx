// frontend/src/components/LobbyLeftSidebar.jsx
import React, { useState } from 'react';
import {
  UserIcon,
  CreditCardIcon,
  UserGroupIcon,
  UserPlusIcon,
  PhoneIcon,
  BookmarkIcon,
  Cog6ToothIcon,
  QuestionMarkCircleIcon,
  XMarkIcon,
  ChartBarIcon,
  ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline';
import HelpSupportModal from './HelpSupportModal';
import { useNavigate } from 'react-router-dom';
import { clearAllCaches } from '../utils/cinemaCache';

const LobbyLeftSidebar = ({ 
  isOpen, 
  onClose, 
  currentUser,
  onMyProfileClick,
  onSettingsClick
}) => {
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const navigate = useNavigate();

  if (!isOpen) return null;

  // Check if user is super admin
  const isSuperAdmin = currentUser?.role === 'super_admin';

  // Handle logout
  const handleLogout = () => {
    console.log('🚪 [Logout] Clearing auth data and cache...');
    
    // Clear all auth data
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    
    // Clear all cinema/user caches
    clearAllCaches();
    console.log('✅ [Logout] Cinema cache cleared');
    
    // Clear any remaining localStorage items
    localStorage.clear();
    
    // Close sidebar
    onClose();
    
    // Redirect to login
    navigate('/login');
  };

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
      onClick: () => {
        onClose();
        navigate('/payment');
      },
      enabled: true,
      badge: null
    },
    // Admin Dashboard - Only visible to super_admin
    ...(isSuperAdmin ? [{
      id: 'admin_dashboard',
      label: 'Admin Dashboard',
      icon: ChartBarIcon,
      onClick: () => {
        onClose();
        navigate('/admin/dashboard');
      },
      enabled: true,
      badge: 'ADMIN',
      highlight: true
    }] : []),
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
    },
    {
      id: 'logout',
      label: 'Log Out',
      icon: ArrowRightOnRectangleIcon,
      onClick: handleLogout,
      enabled: true,
      danger: true
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
      <div className="fixed left-0 top-0 h-full w-[280px] sm:w-[320px] md:w-[375px] max-w-[85vw] bg-[#2B2B2B] z-50 shadow-2xl transform transition-transform duration-300 ease-in-out overflow-y-auto custom-sleek-scrollbar">
        {/* Header Section */}
        <div className="relative pt-6 pb-4 px-4 sm:pt-8 sm:pb-6 sm:px-6 border-b border-gray-700">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-400 hover:text-white transition-colors"
            aria-label="Close sidebar"
          >
            <XMarkIcon className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>

          {/* Help & Support Button */}
          <button
            onClick={() => setIsHelpModalOpen(true)}
            className="absolute top-3 right-11 sm:top-4 sm:right-14 text-gray-400 hover:text-white transition-colors"
            aria-label="Help and Support"
          >
            <QuestionMarkCircleIcon className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>

          {/* User Avatar */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <img 
                src={userAvatar}
                alt={username}
                className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded-full object-cover border-2 sm:border-4 border-white/20"
                onError={(e) => {
                  e.target.src = '/icons/user1avatar.svg';
                }}
              />
            </div>
            
            {/* Username */}
            <h2 className="mt-2 sm:mt-4 text-white text-base sm:text-lg md:text-xl font-bold truncate max-w-[90%]">
              {username}
            </h2>
          </div>
        </div>

        {/* Menu Items */}
        <nav className="py-4 px-3 sm:py-6 sm:px-4">
          <ul className="space-y-1 sm:space-y-2">
            {menuItems.map((item) => {
              const IconComponent = item.icon;
              return (
                <li key={item.id}>
                  <button
                    onClick={item.onClick}
                    disabled={!item.enabled}
                    className={`
                      w-full flex items-center gap-2 sm:gap-4 px-3 py-2 sm:px-4 sm:py-3 rounded-lg 
                      transition-all duration-200 text-left
                      ${item.highlight 
                        ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold shadow-lg' 
                        : item.danger
                          ? 'text-red-400 hover:bg-red-500/10 active:bg-red-500/20 cursor-pointer'
                          : item.enabled 
                            ? 'text-white hover:bg-gray-700/50 active:bg-gray-700 cursor-pointer' 
                            : 'text-gray-500 cursor-not-allowed opacity-60'
                      }
                    `}
                  >
                    <IconComponent className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0" />
                    <span className="text-sm sm:text-base font-medium flex-1 truncate">
                      {item.label}
                    </span>
                    {item.badge && (
                      <span className={`text-[10px] sm:text-xs px-1.5 py-0.5 sm:px-2 sm:py-1 rounded font-semibold flex-shrink-0 ${
                        item.highlight 
                          ? 'bg-yellow-400 text-purple-900' 
                          : 'text-gray-400 bg-gray-700'
                      }`}>
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
        <div className="px-3 pb-4 sm:px-4 sm:pb-6 mt-auto">
          <button
            onClick={() => setIsHelpModalOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-3 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700/50 transition-colors"
          >
            <QuestionMarkCircleIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="text-xs sm:text-sm font-medium">Help & Support</span>
          </button>
        </div>
      </div>

      {/* Help Support Modal */}
      <HelpSupportModal 
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        currentUser={currentUser}
      />
    </>
  );
};

export default LobbyLeftSidebar;
