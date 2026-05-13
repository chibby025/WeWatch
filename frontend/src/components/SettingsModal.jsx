// frontend/src/components/SettingsModal.jsx
import React, { useState, useEffect } from 'react';
import Avatar from './Avatar';
import {
  XMarkIcon,
  SunIcon, 
  MoonIcon,
  BellIcon,
  ShieldCheckIcon,
  UserIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import apiClient from '../services/api';
import toast from 'react-hot-toast';

const SettingsModal = ({ isOpen, onClose }) => {
  const [theme, setTheme] = useState('dark');
  const [activeTab, setActiveTab] = useState('appearance'); // 'appearance', 'notifications', 'privacy'
  
  // Settings state
  const [notificationSettings, setNotificationSettings] = useState({
    push_enabled: true,
    friend_requests_notif: true,
    messages_notif: true,
    calls_notif: true,
    session_invites_notif: true,
    likes_comments_notif: true,
    sound_enabled: true,
    vibration_enabled: true
  });
  
  const [privacySettings, setPrivacySettings] = useState({
    profile_type: 'public',
    who_can_friend_request: 'everyone',
    who_can_see_posts: 'public',
    who_can_call: 'friends'
  });

  const [showMatureContent, setShowMatureContent] = useState(false);
  
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [loadingBlocked, setLoadingBlocked] = useState(false);

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('wewatch_theme') || 'dark';
    setTheme(savedTheme);
    applyTheme(savedTheme);
  }, []);

  // Fetch settings when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchSettings();
      fetchBlockedUsers();
    }
  }, [isOpen]);

  const applyTheme = (selectedTheme) => {
    if (selectedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('wewatch_theme', newTheme);
    applyTheme(newTheme);
  };

  // Fetch user settings from backend
  const fetchSettings = async () => {
    setLoadingSettings(true);
    try {
      const response = await apiClient.get('/api/users/settings');
      const settings = response.data.settings;
      
      // Update notification settings
      setNotificationSettings({
        push_enabled: settings.push_enabled,
        friend_requests_notif: settings.friend_requests_notif,
        messages_notif: settings.messages_notif,
        calls_notif: settings.calls_notif,
        session_invites_notif: settings.session_invites_notif,
        likes_comments_notif: settings.likes_comments_notif,
        sound_enabled: settings.sound_enabled,
        vibration_enabled: settings.vibration_enabled
      });
      
      // Update privacy settings
      setPrivacySettings({
        profile_type: settings.profile_type,
        who_can_friend_request: settings.who_can_friend_request,
        who_can_see_posts: settings.who_can_see_posts,
        who_can_call: settings.who_can_call
      });
      setShowMatureContent(settings.show_mature_content || false);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoadingSettings(false);
    }
  };

  // Fetch blocked users
  const fetchBlockedUsers = async () => {
    setLoadingBlocked(true);
    try {
      const response = await apiClient.get('/api/lobby-chats/blocked');
      setBlockedUsers(response.data.blocked_users || []);
    } catch (error) {
      console.error('Failed to fetch blocked users:', error);
    } finally {
      setLoadingBlocked(false);
    }
  };

  // Update notification setting
  const handleNotificationToggle = async (key) => {
    const newValue = !notificationSettings[key];
    setNotificationSettings(prev => ({ ...prev, [key]: newValue }));
    
    try {
      await apiClient.put('/api/users/settings', { [key]: newValue });
      toast.success('Settings updated');
    } catch (error) {
      console.error('Failed to update setting:', error);
      // Revert on error
      setNotificationSettings(prev => ({ ...prev, [key]: !newValue }));
      toast.error('Failed to update settings');
    }
  };

  // Update privacy setting
  const handlePrivacyChange = async (key, value) => {
    setPrivacySettings(prev => ({ ...prev, [key]: value }));
    
    try {
      await apiClient.put('/api/users/settings', { [key]: value });
      toast.success('Privacy settings updated');
    } catch (error) {
      console.error('Failed to update privacy:', error);
      toast.error('Failed to update privacy settings');
    }
  };

  // Toggle show mature content
  const handleMatureContentToggle = async () => {
    const newValue = !showMatureContent;
    setShowMatureContent(newValue);
    try {
      await apiClient.put('/api/users/settings', { show_mature_content: newValue });
      toast.success('Content preference updated');
    } catch (error) {
      setShowMatureContent(!newValue);
      toast.error('Failed to update preference');
    }
  };

  // Unblock user
  const handleUnblockUser = async (userId) => {
    try {
      await apiClient.delete(`/api/lobby-chats/block/${userId}`);
      setBlockedUsers(prev => prev.filter(user => user.id !== userId));
      toast.success('User unblocked');
    } catch (error) {
      console.error('Failed to unblock user:', error);
      toast.error('Failed to unblock user');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
          <h3 className="text-white font-semibold text-lg">Settings</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close settings"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 bg-gray-900/50 px-4">
          <button
            onClick={() => setActiveTab('appearance')}
            className={`px-6 py-3 font-semibold transition-all relative ${
              activeTab === 'appearance'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <SunIcon className="h-4 w-4" />
              Appearance
            </div>
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-6 py-3 font-semibold transition-all relative ${
              activeTab === 'notifications'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <BellIcon className="h-4 w-4" />
              Notifications
            </div>
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`px-6 py-3 font-semibold transition-all relative ${
              activeTab === 'privacy'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="h-4 w-4" />
              Privacy
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div>
              <h4 className="text-white font-medium mb-3">Theme</h4>
              <div className="space-y-2">
                {/* Light Theme Option */}
                <button
                  onClick={() => handleThemeChange('light')}
                  className={`
                    w-full flex items-center gap-4 px-4 py-3 rounded-lg 
                    transition-all duration-200 border-2
                    ${theme === 'light' 
                      ? 'bg-blue-600/20 border-blue-500 text-white' 
                      : 'bg-gray-900/50 border-gray-700 text-gray-300 hover:border-gray-600'
                    }
                  `}
                >
                  <div className={`
                    p-2 rounded-lg
                    ${theme === 'light' ? 'bg-blue-600' : 'bg-gray-700'}
                  `}>
                    <SunIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium">Light Mode</div>
                    <div className="text-sm text-gray-400">Bright and clear interface</div>
                  </div>
                  {theme === 'light' && (
                    <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                  )}
                </button>

                {/* Dark Theme Option */}
                <button
                  onClick={() => handleThemeChange('dark')}
                  className={`
                    w-full flex items-center gap-4 px-4 py-3 rounded-lg 
                    transition-all duration-200 border-2
                    ${theme === 'dark' 
                      ? 'bg-blue-600/20 border-blue-500 text-white' 
                      : 'bg-gray-900/50 border-gray-700 text-gray-300 hover:border-gray-600'
                    }
                  `}
                >
                  <div className={`
                    p-2 rounded-lg
                    ${theme === 'dark' ? 'bg-blue-600' : 'bg-gray-700'}
                  `}>
                    <MoonIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium">Dark Mode</div>
                    <div className="text-sm text-gray-400">Easy on the eyes</div>
                  </div>
                  {theme === 'dark' && (
                    <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-4">
              {loadingSettings ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="text-gray-400 mt-4">Loading settings...</p>
                </div>
              ) : (
                <>
                  {/* Master Toggle */}
                  <ToggleItem
                    label="Push Notifications"
                    description="Enable all notifications"
                    enabled={notificationSettings.push_enabled}
                    onChange={() => handleNotificationToggle('push_enabled')}
                  />
                  
                  <div className="border-t border-gray-700 pt-4">
                    <p className="text-gray-400 text-sm mb-3">Notify me when:</p>
                    
                    <ToggleItem
                      label="Friend Requests"
                      description="Someone sends you a friend request"
                      enabled={notificationSettings.friend_requests_notif}
                      onChange={() => handleNotificationToggle('friend_requests_notif')}
                      disabled={!notificationSettings.push_enabled}
                    />
                    
                    <ToggleItem
                      label="Messages"
                      description="You receive a new chat message"
                      enabled={notificationSettings.messages_notif}
                      onChange={() => handleNotificationToggle('messages_notif')}
                      disabled={!notificationSettings.push_enabled}
                    />
                    
                    <ToggleItem
                      label="Calls"
                      description="Someone calls you"
                      enabled={notificationSettings.calls_notif}
                      onChange={() => handleNotificationToggle('calls_notif')}
                      disabled={!notificationSettings.push_enabled}
                    />
                    
                    <ToggleItem
                      label="Session Invites"
                      description="Friends invite you to watch sessions"
                      enabled={notificationSettings.session_invites_notif}
                      onChange={() => handleNotificationToggle('session_invites_notif')}
                      disabled={!notificationSettings.push_enabled}
                    />
                    
                    <ToggleItem
                      label="Likes & Comments"
                      description="Activity on your posts"
                      enabled={notificationSettings.likes_comments_notif}
                      onChange={() => handleNotificationToggle('likes_comments_notif')}
                      disabled={!notificationSettings.push_enabled}
                    />
                  </div>
                  
                  <div className="border-t border-gray-700 pt-4">
                    <p className="text-gray-400 text-sm mb-3">Sound & Vibration:</p>
                    
                    <ToggleItem
                      label="Sound"
                      description="Play notification sounds"
                      enabled={notificationSettings.sound_enabled}
                      onChange={() => handleNotificationToggle('sound_enabled')}
                      disabled={!notificationSettings.push_enabled}
                    />
                    
                    <ToggleItem
                      label="Vibration"
                      description="Vibrate on notifications"
                      enabled={notificationSettings.vibration_enabled}
                      onChange={() => handleNotificationToggle('vibration_enabled')}
                      disabled={!notificationSettings.push_enabled}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Privacy Tab */}
          {activeTab === 'privacy' && (
            <div className="space-y-6">
              {loadingSettings ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="text-gray-400 mt-4">Loading settings...</p>
                </div>
              ) : (
                <>
                  {/* Profile Type */}
                  <SelectItem
                    label="Profile Type"
                    description="Control who can see your profile"
                    value={privacySettings.profile_type}
                    options={[
                      { value: 'public', label: 'Public' },
                      { value: 'private', label: 'Private' }
                    ]}
                    onChange={(value) => handlePrivacyChange('profile_type', value)}
                  />
                  
                  {/* Friend Requests */}
                  <SelectItem
                    label="Who Can Send Friend Requests"
                    description="Control who can add you as a friend"
                    value={privacySettings.who_can_friend_request}
                    options={[
                      { value: 'everyone', label: 'Everyone' },
                      { value: 'friends_of_friends', label: 'Friends of Friends' },
                      { value: 'nobody', label: 'Nobody' }
                    ]}
                    onChange={(value) => handlePrivacyChange('who_can_friend_request', value)}
                  />
                  
                  {/* Posts Visibility */}
                  <SelectItem
                    label="Who Can See My Posts"
                    description="Control your post visibility"
                    value={privacySettings.who_can_see_posts}
                    options={[
                      { value: 'public', label: 'Public' },
                      { value: 'friends', label: 'Friends Only' },
                      { value: 'only_me', label: 'Only Me' }
                    ]}
                    onChange={(value) => handlePrivacyChange('who_can_see_posts', value)}
                  />
                  
                  {/* Call Permissions */}
                  <SelectItem
                    label="Who Can Call Me"
                    description="Control who can voice call you"
                    value={privacySettings.who_can_call}
                    options={[
                      { value: 'everyone', label: 'Everyone' },
                      { value: 'friends', label: 'Friends Only' },
                      { value: 'nobody', label: 'Nobody' }
                    ]}
                    onChange={(value) => handlePrivacyChange('who_can_call', value)}
                  />
                  
                  {/* Mature Content */}
                  <div className="border-t border-gray-700 pt-4">
                    <ToggleItem
                      label="Show 18+/Mature content without blur"
                      description="Skip the click-through overlay on adult-rated posts"
                      enabled={showMatureContent}
                      onChange={handleMatureContentToggle}
                    />
                  </div>

                  {/* Blocked Users */}
                  <div className="border-t border-gray-700 pt-6">
                    <h4 className="text-white font-medium mb-3">Blocked Users</h4>
                    {loadingBlocked ? (
                      <div className="bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-8 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                      </div>
                    ) : blockedUsers.length === 0 ? (
                      <div className="bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-6 text-center">
                        <UserIcon className="h-12 w-12 text-gray-600 mx-auto mb-2" />
                        <p className="text-gray-400 text-sm">No blocked users</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {blockedUsers.map((user) => (
                          <div
                            key={user.id}
                            className="bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-3 flex items-center justify-between"
                          >
                            <div className="flex items-center gap-3">
                              <Avatar
                                user={user}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                              <div>
                                <p className="text-white font-medium">{user.username}</p>
                                <p className="text-gray-400 text-sm">@{user.username}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleUnblockUser(user.id)}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                            >
                              Unblock
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 flex justify-end">
          <button 
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg text-white font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

// Toggle Item Component
const ToggleItem = ({ label, description, enabled, onChange, disabled = false }) => (
  <div className={`flex items-center justify-between py-3 ${disabled ? 'opacity-50' : ''}`}>
    <div className="flex-1">
      <p className="text-white font-medium">{label}</p>
      <p className="text-gray-400 text-sm">{description}</p>
    </div>
    <button
      onClick={onChange}
      disabled={disabled}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        ${enabled ? 'bg-blue-600' : 'bg-gray-600'}
        ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
          ${enabled ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  </div>
);

// Select Item Component
const SelectItem = ({ label, description, value, options, onChange }) => (
  <div>
    <label className="block text-white font-medium mb-1">{label}</label>
    <p className="text-gray-400 text-sm mb-2">{description}</p>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
);

export default SettingsModal;
