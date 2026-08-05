// frontend/src/components/SettingsModal.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from './Avatar';
import {
  XMarkIcon,
  SunIcon,
  MoonIcon,
  BellIcon,
  ShieldCheckIcon,
  UserIcon,
  ChevronRightIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline';
import apiClient from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

const TOURS = [
  {
    key: 'wewatch_tour_seen',
    title: 'App Tour',
    description: 'Chats, Rooms, WatchOuts, Feed, Community Events, and your content preferences.',
  },
  {
    key: 'wewatch_room_tour_seen',
    title: 'Room Page Tour',
    description: 'What Begin Watch, Schedule Event, and RoomTV do — shown in your own room.',
  },
  {
    key: 'wewatch_settings_tour_seen',
    title: 'Watch Session Tour',
    description: 'How to share your session and invite friends — shown in a watch session\'s Settings.',
    replayHint: "You'll see this next time you open Settings during a watch session",
  },
  {
    key: 'wewatch_leftsidebar_tour_seen',
    title: 'Sidebar Tour',
    description: 'Upload, LiveShare, Watch From, Playing Now, and Ghost Mode — shown when you open the sidebar in a session.',
    replayHint: "You'll see this next time you open the sidebar during a watch session",
  },
  {
    key: 'wewatch_taskbar_tour_seen',
    title: 'Taskbar Tour',
    description: 'Leave Call, Chat, Audio, and Members — shown when you enter a watch session.',
    replayHint: "You'll see this next time you enter a watch session",
  },
  {
    key: 'wewatch_roomtv_join_tour_seen',
    title: 'RoomTV Join Tour',
    description: 'What the Join button does — shown the first time you see a live session on a room page.',
    replayHint: "You'll see this next time you land on a room page with a live session",
  },
];

const SettingsModal = ({ isOpen, onClose, onReplayAppTour }) => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [theme, setTheme] = useState('dark');
  const [activeTab, setActiveTab] = useState('appearance'); // 'appearance', 'notifications', 'privacy', 'help'
  
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
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-gray-800 rounded-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-700 flex justify-between items-center">
          <h3 className="text-white font-semibold text-base sm:text-lg">Settings</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close settings"
          >
            <XMarkIcon className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </div>

        {/* Tabs — each takes an equal share of the width so all 4 stay evenly
            spaced instead of overflowing on mobile; scrollbar-hide is a safety
            net for very narrow screens where they still can't all fit. */}
        <div className="flex flex-shrink-0 border-b border-gray-700 bg-gray-900/50 px-1 sm:px-4 overflow-x-auto overflow-y-visible scrollbar-hide">
          <button
            onClick={() => setActiveTab('appearance')}
            className={`flex-1 sm:flex-initial min-w-0 px-2 sm:px-6 py-2.5 sm:py-3 font-semibold transition-all relative ${
              activeTab === 'appearance'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 text-[10px] sm:text-base leading-tight text-center">
              <SunIcon className="h-4 w-4 flex-shrink-0" />
              <span>Appearance</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex-1 sm:flex-initial min-w-0 px-2 sm:px-6 py-2.5 sm:py-3 font-semibold transition-all relative ${
              activeTab === 'notifications'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 text-[10px] sm:text-base leading-tight text-center">
              <BellIcon className="h-4 w-4 flex-shrink-0" />
              <span>Notifications</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`flex-1 sm:flex-initial min-w-0 px-2 sm:px-6 py-2.5 sm:py-3 font-semibold transition-all relative ${
              activeTab === 'privacy'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 text-[10px] sm:text-base leading-tight text-center">
              <ShieldCheckIcon className="h-4 w-4 flex-shrink-0" />
              <span>Privacy</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('help')}
            className={`flex-1 sm:flex-initial min-w-0 px-2 sm:px-6 py-2.5 sm:py-3 font-semibold transition-all relative ${
              activeTab === 'help'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 text-[10px] sm:text-base leading-tight text-center">
              <QuestionMarkCircleIcon className="h-4 w-4 flex-shrink-0" />
              <span>Help</span>
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="px-4 pt-6 pb-4 sm:p-6 space-y-6 overflow-y-auto flex-1">
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

          {/* Help Tab */}
          {activeTab === 'help' && (
            <div className="space-y-3">
              <h4 className="text-white font-medium">Tours</h4>
              <p className="text-gray-400 text-sm -mt-2">
                One-time tours you've already seen — replay any of them here.
              </p>
              {TOURS.map((tour) => {
                const replay = () => {
                  localStorage.removeItem(tour.key);
                  if (tour.key === 'wewatch_tour_seen') {
                    onClose();
                    onReplayAppTour?.();
                  } else if (tour.key === 'wewatch_room_tour_seen') {
                    if (!currentUser?.main_room_id) {
                      toast.error('Create a room first to see this tour');
                      return;
                    }
                    onClose();
                    navigate(`/rooms/${currentUser.main_room_id}`);
                  } else {
                    toast.success(tour.replayHint || "You'll see this again next time it's due");
                  }
                };
                return (
                  <div
                    key={tour.key}
                    className="bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex-1">
                      <p className="text-white font-medium text-sm">{tour.title}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{tour.description}</p>
                    </div>
                    <button
                      onClick={replay}
                      className="flex-shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
                    >
                      Replay
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 px-5 sm:px-6 py-2 rounded-lg text-white text-sm sm:text-base font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

// Toggle Item Component
// Uses a <label> + visually-hidden checkbox instead of a <button> for the
// track/thumb — a global mobile rule (`button { min-height/width: 44px }` in
// index.css, meant for touch-target sizing) forces any <button> up to a 44px
// square on screens <=640px, turning a 44x24 pill into a circle. <label>/
// <input> aren't matched by that selector, so the pill shape survives on
// mobile. Same pattern already used for the toggles in RoomPageEditModal.jsx.
const ToggleItem = ({ label, description, enabled, onChange, disabled = false }) => (
  <div className={`flex items-center justify-between py-3 ${disabled ? 'opacity-50' : ''}`}>
    <div className="flex-1">
      <p className="text-white font-medium">{label}</p>
      <p className="text-gray-400 text-sm">{description}</p>
    </div>
    <label
      className={`relative ml-4 flex-shrink-0 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      style={{ display: 'inline-block', width: '44px', height: '24px' }}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={!!enabled}
        disabled={disabled}
        onChange={onChange}
      />
      <span
        className="absolute inset-0 rounded-full transition-colors duration-200"
        style={{ backgroundColor: enabled ? '#2563eb' : '#4b5563' }}
      />
      <span
        className="absolute rounded-full bg-white shadow transition-transform duration-200"
        style={{
          width: '20px', height: '20px',
          top: '2px', left: '2px',
          transform: enabled ? 'translateX(20px)' : 'translateX(0)',
        }}
      />
    </label>
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
