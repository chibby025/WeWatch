// WeWatch/frontend/src/components/CalendarDropdown.jsx
// Smart calendar dropdown with Google Calendar, Apple Calendar, and iCal download options
import React, { useState, useRef, useEffect } from 'react';
import { ArrowDownTrayIcon, ChevronDownIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';
import { generateGoogleCalendarLink, generateAppleCalendarLink, downloadICalFile } from '../utils/calendar';
import toast from 'react-hot-toast';

const CalendarDropdown = ({ event, roomUrl, large = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const buttonRef = useRef(null);

  // Calculate dropdown position when opened
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 8, // 8px gap
        right: window.innerWidth - rect.right + window.scrollX,
      });
    }
  }, [isOpen]);

  const handleGoogleCalendar = () => {
    const link = generateGoogleCalendarLink(event, roomUrl);
    window.open(link, '_blank');
    setIsOpen(false);
    toast.success('Opening Google Calendar...');
  };

  const handleAppleCalendar = async () => {
    setIsDownloading(true);
    try {
      await downloadICalFile(event.ID);
      toast.success('Calendar file downloaded! Open it with Apple Calendar.');
      setIsOpen(false);
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
      setIsOpen(false);
    } catch (error) {
      toast.error('Failed to download calendar file');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="relative inline-block">
      {/* Dropdown Button */}
      {large ? (
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          disabled={isDownloading}
          className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-50"
          title="Add to Calendar"
        >
          {isDownloading ? (
            <svg className="animate-spin h-6 w-6 text-purple-600" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <CalendarDaysIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          )}
          <span className="text-[10px] text-purple-700 dark:text-purple-400">
            {isDownloading ? 'Saving…' : 'Calendar'}
          </span>
        </button>
      ) : (
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          disabled={isDownloading}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white text-sm rounded-lg font-medium transition-colors"
          title="Add to Calendar"
        >
          {isDownloading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Downloading...</span>
            </>
          ) : (
            <>
              <ArrowDownTrayIcon className="h-4 w-4" />
              <span>Add to Calendar</span>
              <ChevronDownIcon className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </>
          )}
        </button>
      )}

      {/* Dropdown Menu - Fixed positioning to break out of parent */}
      {isOpen && !isDownloading && (
        <>
          {/* Backdrop to close dropdown */}
          <div
            className="fixed inset-0 z-[100]"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu - Now using fixed positioning */}
          <div 
            className="fixed w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-[101] border border-gray-200 dark:border-gray-700 overflow-hidden"
            style={{ 
              top: `${dropdownPosition.top}px`, 
              right: `${dropdownPosition.right}px` 
            }}
          >
            {/* Google Calendar */}
            <button
              onClick={handleGoogleCalendar}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 text-gray-700 dark:text-gray-300 transition-colors border-b border-gray-100 dark:border-gray-700"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.5 3.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2v14.5c0 1.38 1.12 2.5 2.5 2.5h7c1.38 0 2.5-1.12 2.5-2.5V2l-1.5 1.5zM15.5 16h-7v-1h7v1zm0-2h-7v-1h7v1zm0-2h-7V9h7v3z"/>
              </svg>
              <div>
                <div className="font-medium">Google Calendar</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Open in browser</div>
              </div>
            </button>

            {/* Apple Calendar */}
            <button
              onClick={handleAppleCalendar}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 text-gray-700 dark:text-gray-300 transition-colors border-b border-gray-100 dark:border-gray-700"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              <div>
                <div className="font-medium">Apple Calendar</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Download .ics file</div>
              </div>
            </button>

            {/* Other Calendars (iCal) */}
            <button
              onClick={handleICalDownload}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 text-gray-700 dark:text-gray-300 transition-colors"
            >
              <ArrowDownTrayIcon className="w-5 h-5" />
              <div>
                <div className="font-medium">Other Calendar</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Download .ics file</div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default CalendarDropdown;
