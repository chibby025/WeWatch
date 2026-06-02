// frontend/src/components/LobbyLeftSidebar.jsx
import React, { useState } from 'react';
import {
  UserIcon,
  CreditCardIcon,
  UserGroupIcon,
  UserPlusIcon,
  BookmarkIcon,
  Cog6ToothIcon,
  QuestionMarkCircleIcon,
  XMarkIcon,
  ChartBarIcon,
  ArrowRightOnRectangleIcon,
  ShieldCheckIcon,
  SignalIcon,
  MegaphoneIcon,
  InformationCircleIcon,
  AdjustmentsHorizontalIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import HelpSupportModal from './HelpSupportModal';
import SecurityModal from './SecurityModal';
import ContactsModal from './ContactsModal';
import AdsManagementModal from './AdsManagementModal';
import CreditsModal from './CreditsModal';
import UserPreferencesModal from './UserPreferencesModal';
import Avatar from './Avatar';
import { useNavigate } from 'react-router-dom';
import { clearAllCaches } from '../utils/cinemaCache';

const LobbyLeftSidebar = ({
  isOpen,
  onClose,
  currentUser,
  onMyProfileClick,
  onSettingsClick,
  onCallUser,
  onStatusPrivacy,
}) => {
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [isContactsModalOpen, setIsContactsModalOpen] = useState(false);
  const [isAdsManagementModalOpen, setIsAdsManagementModalOpen] = useState(false);
  const [isCreditsModalOpen, setIsCreditsModalOpen] = useState(false);
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false);
  const [dataSaverEnabled, setDataSaverEnabled] = useState(
    localStorage.getItem('dataSaverMode') === 'true'
  );
  const navigate = useNavigate();

  if (!isOpen) return null;

  // Check if user is super admin
  const isSuperAdmin = currentUser?.role === 'super_admin';

  // Handle Data Saver toggle
  const handleDataSaverToggle = () => {
    const newValue = !dataSaverEnabled;
    setDataSaverEnabled(newValue);
    localStorage.setItem('dataSaverMode', newValue ? 'true' : 'false');
    console.log('💾 [Data Saver]', newValue ? 'Enabled' : 'Disabled');
  };

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
    },
    {
      id: 'ads_management',
      label: 'Ads Management',
      icon: MegaphoneIcon,
      onClick: () => {
        setIsAdsManagementModalOpen(true);
      },
      enabled: true,
      badge: 'ADS',
      highlight: true
    }] : []),
    {
      id: 'contacts',
      label: 'My Contacts',
      icon: UserPlusIcon,
      onClick: () => {
        setIsContactsModalOpen(true);
      },
      enabled: true
    },
    {
      id: 'security',
      label: 'Security',
      icon: ShieldCheckIcon,
      onClick: () => {
        setIsSecurityModalOpen(true);
      },
      enabled: true,
      badge: currentUser?.two_factor_enabled ? '2FA ✓' : null,
      highlight: !currentUser?.two_factor_enabled
    },
    {
      id: 'status_privacy',
      label: 'Status Privacy',
      icon: EyeSlashIcon,
      onClick: () => { onClose(); onStatusPrivacy?.(); },
      enabled: true,
      description: 'Choose who sees your status'
    },
    {
      id: 'data_saver',
      label: 'Data Saver Mode',
      icon: SignalIcon,
      onClick: handleDataSaverToggle,
      enabled: true,
      toggle: true,
      toggleValue: dataSaverEnabled,
      badge: dataSaverEnabled ? 'ON' : 'OFF',
      description: 'Reduces bandwidth (480p sessions, no autoplay)'
    },
    {
      id: 'preferences',
      label: 'Content Preferences',
      icon: AdjustmentsHorizontalIcon,
      onClick: () => setIsPreferencesModalOpen(true),
      enabled: true,
      description: 'Categories, default content rating'
    },
    {
      id: 'credits',
      label: 'About & Credits',
      icon: InformationCircleIcon,
      onClick: () => {
        setIsCreditsModalOpen(true);
      },
      enabled: true
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

  const username = currentUser?.username || currentUser?.Username || 'User';

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-[260px] sm:w-[300px] md:w-[350px] lg:w-[375px] max-w-[85vw] bg-[#2B2B2B] z-50 shadow-2xl transform transition-transform duration-300 ease-in-out overflow-y-auto custom-sleek-scrollbar">
        {/* Header Section */}
        <div className="relative pt-4 pb-3 px-3 sm:pt-6 sm:pb-4 sm:px-4 md:pt-8 md:pb-6 md:px-6 border-b border-gray-700">
          {/* User Avatar */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <Avatar
                user={currentUser}
                alt={username}
                className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 lg:w-32 lg:h-32 rounded-full object-cover border-2 sm:border-3 md:border-4 border-white/20"
              />
            </div>
            
            {/* Username */}
            <h2 className="mt-2 sm:mt-3 md:mt-4 text-white text-sm sm:text-base md:text-lg lg:text-xl font-bold truncate max-w-[90%]">
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
                    <div className="flex-1 min-w-0">
                      <span className="text-sm sm:text-base font-medium block truncate">
                        {item.label}
                      </span>
                      {item.description && (
                        <span className="text-[10px] sm:text-xs text-gray-400 block truncate">
                          {item.description}
                        </span>
                      )}
                    </div>
                    {item.badge && (
                      <span className={`text-[10px] sm:text-xs px-1.5 py-0.5 sm:px-2 sm:py-1 rounded font-semibold flex-shrink-0 ${
                        item.highlight 
                          ? 'bg-yellow-400 text-purple-900'
                          : item.toggleValue
                            ? 'bg-green-600 text-white'
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

      {/* Security Modal */}
      <SecurityModal 
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        currentUser={currentUser}
      />

      {/* Contacts Modal */}
      <ContactsModal 
        isOpen={isContactsModalOpen}
        onClose={() => setIsContactsModalOpen(false)}
        currentUser={currentUser}
        onCallUser={onCallUser}
        onChatUser={(user) => {
          // Navigate to lobby chats with this user
          console.log('Open chat with:', user);
        }}
      />

      {/* Ads Management Modal (Super Admin Only) */}
      {isSuperAdmin && (
        <AdsManagementModal 
          isOpen={isAdsManagementModalOpen}
          onClose={() => setIsAdsManagementModalOpen(false)}
        />
      )}

      {/* Credits Modal */}
      <CreditsModal
        isOpen={isCreditsModalOpen}
        onClose={() => setIsCreditsModalOpen(false)}
      />

      {/* Content Preferences Modal */}
      <UserPreferencesModal
        isOpen={isPreferencesModalOpen}
        onClose={() => setIsPreferencesModalOpen(false)}
      />
    </>
  );
};

export default LobbyLeftSidebar;
