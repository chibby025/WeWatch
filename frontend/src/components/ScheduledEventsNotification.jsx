import React, { useState, useEffect } from 'react';
import { CalendarIcon, ClockIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import apiClient from '../services/api';

const ScheduledEventsNotification = ({ roomId }) => {
  const [events, setEvents] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [glowingEvents, setGlowingEvents] = useState(new Set());

  useEffect(() => {
    fetchEvents();
    
    // Check every 30 seconds for events that should glow
    const glowInterval = setInterval(checkGlowingEvents, 30000);
    
    return () => clearInterval(glowInterval);
  }, [roomId]);

  const fetchEvents = async () => {
    try {
      const response = await apiClient.get(`/api/rooms/${roomId}/scheduled-events`);
      setEvents(response.data.events || []);
      checkGlowingEvents(response.data.events || []);
    } catch (err) {
      console.error('Failed to fetch scheduled events:', err);
    }
  };

  const checkGlowingEvents = (eventList = events) => {
    const now = new Date();
    const glowing = new Set();

    eventList.forEach(event => {
      const eventStart = new Date(event.start_time);
      const timeDiff = (eventStart - now) / 1000 / 60; // difference in minutes
      const timeSinceStart = (now - eventStart) / 1000 / 60; // minutes since start

      // Glow if:
      // 1. Within 15 minutes before event starts
      // 2. Within 1 minute after event started
      // 3. Within first 5 minutes after event was created
      const recentlyCreated = new Date(event.CreatedAt);
      const minutesSinceCreated = (now - recentlyCreated) / 1000 / 60;

      if (
        (timeDiff <= 15 && timeDiff >= 0) || // 15 min before to start time
        (timeSinceStart <= 1 && timeSinceStart >= 0) || // 1 min after start
        (minutesSinceCreated <= 5) // first 5 min after creation
      ) {
        glowing.add(event.ID);
      }
    });

    setGlowingEvents(glowing);
  };

  const handleDownloadICal = async (eventId) => {
    try {
      const response = await apiClient.get(`/api/scheduled-events/${eventId}/ical`, {
        responseType: 'blob',
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `event-${eventId}.ics`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Failed to download iCal:', err);
    }
  };

  const formatEventTime = (startTime) => {
    const date = new Date(startTime);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getTimeUntilEvent = (startTime) => {
    const now = new Date();
    const eventStart = new Date(startTime);
    const diffMs = eventStart - now;
    const diffMins = Math.floor(diffMs / 1000 / 60);
    
    if (diffMins < 0) return 'Started';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`;
    return `${Math.floor(diffMins / 1440)}d`;
  };

  if (events.length === 0) return null;

  const hasGlowingEvents = glowingEvents.size > 0;

  return (
    <div className="mb-6 relative">
      {/* Notification Badge */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`w-full flex items-center justify-between p-4 rounded-lg border-2 transition-all duration-300 ${
          hasGlowingEvents
            ? 'bg-red-50 dark:bg-red-900/20 border-red-500 animate-pulse'
            : 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`relative ${hasGlowingEvents ? 'animate-bounce' : ''}`}>
            <CalendarIcon className={`h-6 w-6 ${hasGlowingEvents ? 'text-red-600' : 'text-purple-600'}`} />
            {hasGlowingEvents && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping" />
            )}
          </div>
          <div className="text-left">
            <h3 className={`font-bold ${hasGlowingEvents ? 'text-red-700 dark:text-red-400' : 'text-purple-700 dark:text-purple-400'}`}>
              {events.length} Scheduled Event{events.length !== 1 ? 's' : ''}
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {hasGlowingEvents ? '⚡ Events starting soon!' : 'Click to view upcoming events'}
            </p>
          </div>
        </div>
        <svg
          className={`h-5 w-5 text-gray-600 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown List */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          {events.map(event => {
            const isGlowing = glowingEvents.has(event.ID);
            return (
              <div
                key={event.ID}
                className={`p-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0 ${
                  isGlowing ? 'bg-red-50 dark:bg-red-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {isGlowing && (
                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      )}
                      <h4 className="font-bold text-gray-900 dark:text-white">{event.title}</h4>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {event.description || 'No description'}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <ClockIcon className="h-4 w-4" />
                        {formatEventTime(event.start_time)}
                      </span>
                      <span className={`px-2 py-1 rounded ${isGlowing ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                        {getTimeUntilEvent(event.start_time)}
                      </span>
                      <span className="px-2 py-1 rounded bg-purple-100 text-purple-700">
                        {event.watch_type === '3d_cinema' ? '🎬 3D Cinema' : '📺 Video Watch'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownloadICal(event.ID)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded transition-colors"
                    title="Add to Calendar"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    Add to Calendar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ScheduledEventsNotification;
