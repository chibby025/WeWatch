// WeWatch/frontend/src/components/EventsPreviewModal.jsx
// Modal to preview scheduled events for a room from LobbyPage
import React, { useState, useEffect } from 'react';
import { XMarkIcon, CalendarIcon, ClockIcon, LockClosedIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/api';
import CalendarDropdown from './CalendarDropdown';
import { formatEventTime, getTimeUntilEvent, requestNotificationPermission } from '../utils/calendar';
import toast from 'react-hot-toast';

const EventsPreviewModal = ({ isOpen, onClose, roomId, roomName, currentUser }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState('default');
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen && roomId) {
      fetchEvents();
      // Check notification permission status
      if ('Notification' in window) {
        setNotificationPermission(Notification.permission);
      }
    }
  }, [isOpen, roomId]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/api/rooms/${roomId}/scheduled-events`);
      const allEvents = response.data.events || [];
      
      // Filter to only upcoming events
      const upcoming = allEvents.filter(event => {
        const eventTime = new Date(event.start_time);
        return eventTime > new Date();
      });
      
      // Sort by start time
      upcoming.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
      
      setEvents(upcoming);
    } catch (err) {
      console.error('Failed to fetch events:', err);
      toast.error('Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const handleRemindMe = async (event) => {
    // Request notification permission
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);
    
    if (permission === 'granted') {
      toast.success('Reminder set! You\'ll be notified when the event starts.');
    } else if (permission === 'denied') {
      toast.error('Notification permission denied. Please enable notifications in your browser settings.');
    } else {
      toast('Please allow notifications to receive reminders.', { icon: '🔔' });
    }
  };

  const handleJoinRoom = () => {
    onClose();
    navigate(`/rooms/${roomId}`);
  };

  if (!isOpen) return null;

  const roomUrl = `${window.location.origin}/rooms/${roomId}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center">
              <CalendarIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Scheduled Events</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{roomName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin h-8 w-8 text-purple-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12">
              <CalendarIcon className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">No upcoming events scheduled</p>
            </div>
          ) : (
            <div className="space-y-4">
              {events.map((event) => {
                const isPrivate = !event.is_public;
                const isSuperAdmin = currentUser?.role === 'super_admin';
                const canView = !isPrivate || isSuperAdmin || (currentUser && event.can_view);

                // Don't show private events to non-authorized users
                if (isPrivate && !canView) {
                  return null;
                }

                return (
                  <div
                    key={event.ID}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        {/* Title and Privacy */}
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-bold text-gray-900 dark:text-white">{event.title}</h3>
                          {isPrivate && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded">
                              <LockClosedIcon className="w-3 h-3" />
                              Private
                            </span>
                          )}
                        </div>

                        {/* Description */}
                        {event.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                            {event.description}
                          </p>
                        )}

                        {/* Event Details */}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                          {/* Time */}
                          <span className="flex items-center gap-1">
                            <ClockIcon className="w-4 h-4" />
                            {formatEventTime(event.start_time)}
                          </span>

                          {/* Countdown */}
                          <span className="px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 font-medium">
                            {getTimeUntilEvent(event.start_time)}
                          </span>

                          {/* Watch Type */}
                          <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                            {event.watch_type === '3d_cinema' ? '🎬 3D Cinema' : '📺 Video Watch'}
                          </span>

                          {/* Paid Event */}
                          {event.is_paid && (
                            <span className="px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                              💰 Paid Event
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2">
                        <CalendarDropdown event={event} roomUrl={roomUrl} />
                        
                        {notificationPermission !== 'granted' && (
                          <button
                            onClick={() => handleRemindMe(event)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors whitespace-nowrap"
                            title="Set up browser notifications"
                          >
                            🔔 Remind Me
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6">
          <button
            onClick={handleJoinRoom}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
          >
            <UserGroupIcon className="w-5 h-5" />
            Join Room to Watch
          </button>
          <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-3">
            Join the room to participate in these events
          </p>
        </div>
      </div>
    </div>
  );
};

export default EventsPreviewModal;
