// WeWatch/frontend/src/utils/calendar.js
// Calendar link generation utilities for Google Calendar, Apple Calendar, and iCal downloads

import apiClient from '../services/api';

/**
 * Generate a Google Calendar link for an event
 * @param {Object} event - The scheduled event object
 * @param {string} roomUrl - The URL to join the room
 * @returns {string} Google Calendar link
 */
export const generateGoogleCalendarLink = (event, roomUrl) => {
  const startTime = new Date(event.start_time);
  const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // 2-hour duration
  
  // Format dates as YYYYMMDDTHHMMSSZ (UTC)
  const start = startTime.toISOString().replace(/-|:|\.\d\d\d/g, '');
  const end = endTime.toISOString().replace(/-|:|\.\d\d\d/g, '');
  
  const text = encodeURIComponent(event.title);
  const details = encodeURIComponent(
    `${event.description || 'Join us for this scheduled watch event!'}\n\nJoin the room: ${roomUrl}`
  );
  const location = encodeURIComponent('WeWatch - Virtual Room');
  
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}&location=${location}`;
};

/**
 * Generate an Apple Calendar link (uses webcal protocol)
 * Note: Apple Calendar doesn't support direct URL creation like Google
 * This generates a data URL that triggers a download
 * @param {number} eventId - The event ID
 * @returns {string} API endpoint for iCal download
 */
export const generateAppleCalendarLink = (eventId) => {
  // Apple Calendar uses .ics files, so we redirect to our iCal download endpoint
  return `${window.location.origin}/api/scheduled-events/${eventId}/ical`;
};

/**
 * Download an iCal file for an event
 * @param {number} eventId - The event ID
 * @returns {Promise<void>}
 */
export const downloadICalFile = async (eventId) => {
  try {
    const response = await apiClient.get(`/api/scheduled-events/${eventId}/ical`, {
      responseType: 'blob',
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `wewatch-event-${eventId}.ics`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    
    // Clean up the URL object
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to download iCal file:', error);
    throw error;
  }
};

/**
 * Request browser notification permission
 * @returns {Promise<string>} Permission state ('granted', 'denied', or 'default')
 */
export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return 'denied';
  }
  
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission;
  }
  
  return Notification.permission;
};

/**
 * Show a browser notification (requires permission)
 * @param {string} title - Notification title
 * @param {Object} options - Notification options
 */
export const showBrowserNotification = (title, options = {}) => {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return;
  }
  
  if (Notification.permission === 'granted') {
    new Notification(title, {
      icon: '/icons/seat.svg',
      badge: '/icons/seat.svg',
      ...options,
    });
  }
};

/**
 * Format event time for display
 * @param {string|Date} dateTime - The date/time to format
 * @returns {string} Formatted time string
 */
export const formatEventTime = (dateTime) => {
  const date = new Date(dateTime);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Get time until event in human-readable format
 * @param {string|Date} eventTime - The event start time
 * @returns {string} Time until event (e.g., "5m", "2h", "3d")
 */
export const getTimeUntilEvent = (eventTime) => {
  const now = new Date();
  const event = new Date(eventTime);
  const diffMs = event - now;
  const diffMins = Math.floor(diffMs / 1000 / 60);
  
  if (diffMins < 0) return 'Started';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`;
  return `${Math.floor(diffMins / 1440)}d`;
};

/**
 * Check if an event is starting soon (within specified minutes)
 * @param {string|Date} eventTime - The event start time
 * @param {number} thresholdMinutes - Threshold in minutes
 * @returns {boolean} True if event is starting within threshold
 */
export const isEventStartingSoon = (eventTime, thresholdMinutes = 15) => {
  const now = new Date();
  const event = new Date(eventTime);
  const diffMs = event - now;
  const diffMins = Math.floor(diffMs / 1000 / 60);
  
  return diffMins >= 0 && diffMins <= thresholdMinutes;
};
