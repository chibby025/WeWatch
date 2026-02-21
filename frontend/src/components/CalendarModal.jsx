// WeWatch/frontend/src/components/CalendarModal.jsx
// Modal popup for calendar options (used for trailer videos where dropdown won't work)
import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { generateGoogleCalendarLink, downloadICalFile } from '../utils/calendar';
import toast from 'react-hot-toast';

const CalendarModal = ({ isOpen, onClose, event, roomUrl }) => {
  const [isDownloading, setIsDownloading] = useState(false);

  if (!isOpen) return null;

  const handleGoogleCalendar = () => {
    const link = generateGoogleCalendarLink(event, roomUrl);
    window.open(link, '_blank');
    onClose();
    toast.success('Opening Google Calendar...');
  };

  const handleAppleCalendar = async () => {
    setIsDownloading(true);
    try {
      await downloadICalFile(event.ID);
      toast.success('Calendar file downloaded! Open it with Apple Calendar.');
      onClose();
    } catch (error) {
      toast.error('Failed to download calendar file');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleICalDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadICalFile(event.ID);
      toast.success('Calendar file downloaded!');
      onClose();
    } catch (error) {
      toast.error('Failed to download calendar file');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z"/>
              </svg>
              <h3 className="text-xl font-bold">Add to Calendar</h3>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-full"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
          <p className="text-white/90 text-sm mt-2">Choose your calendar app</p>
        </div>

        {/* Options */}
        <div className="p-4 space-y-3">
          {/* Google Calendar */}
          <button
            onClick={handleGoogleCalendar}
            disabled={isDownloading}
            className="w-full text-left p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 transition-all flex items-center gap-4 group"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10z"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="font-bold text-gray-900 dark:text-white text-lg">Google Calendar</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Opens in your browser</div>
            </div>
            <svg className="w-6 h-6 text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Apple Calendar */}
          <button
            onClick={handleAppleCalendar}
            disabled={isDownloading}
            className="w-full text-left p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 transition-all flex items-center gap-4 group"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="font-bold text-gray-900 dark:text-white text-lg">Apple Calendar</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Download .ics file</div>
            </div>
            <svg className="w-6 h-6 text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Other Calendars */}
          <button
            onClick={handleICalDownload}
            disabled={isDownloading}
            className="w-full text-left p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 transition-all flex items-center gap-4 group"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="font-bold text-gray-900 dark:text-white text-lg">Other Calendar</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Outlook, Yahoo, etc.</div>
            </div>
            <svg className="w-6 h-6 text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Loading Indicator */}
        {isDownloading && (
          <div className="absolute inset-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <svg className="animate-spin h-10 w-10 text-purple-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Downloading...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CalendarModal;
