import React from 'react';
import {
  PencilIcon,
  TrashIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline';

const Sidebar = ({
  scheduledEvents,
  isSidebarOpen,
  setIsSidebarOpen,
  isHovering,
  setIsHovering,
  activeTab,
  setActiveTab,
  handleEditEvent,
  handleDeleteEvent,
  handleJoinOnSchedule,
  handleAddToCalendar,
  isHost,
  isMobile,
}) => {
  // Filter events
  const now = new Date();
  const upcomingEvents = scheduledEvents.filter(e => new Date(e.start_time) > now);
  const pastEvents = scheduledEvents.filter(e => new Date(e.start_time) <= now);
  const eventsToShow = activeTab === 'past' ? pastEvents : upcomingEvents;

  return (
    <>
      {/* Sidebar Icon (Left Edge) */}
      {scheduledEvents.length > 0 && (
        <div
          className="fixed left-0 top-1/2 transform -translate-y-1/2 z-50 cursor-pointer animate-float"
          onClick={() => setIsSidebarOpen(true)}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          style={{ display: isMobile ? 'none' : 'block' }}
        >
          <div className="bg-red-600 text-white px-4 py-2 flex items-center space-x-2 shadow-lg hover:bg-red-700 transition-colors duration-200 border-l-0 border-r-2 border-t-2 border-b-2 border-red-700 rounded-r-full">
            <CalendarIcon className="h-5 w-5"/>
            <span className="text-sm font-medium">Event Schedule</span>
          </div>
          {scheduledEvents.length > 1 && (
            <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {scheduledEvents.length}
            </div>
          )}
          <div className="absolute inset-0 rounded-full bg-red-600 animate-ping opacity-75"></div>
        </div>
      )}

      {/* Slide-Out Panel (on Hover) */}
      {isHovering && scheduledEvents.length > 0 && (
        <div className="fixed left-20 bottom-20 bg-white p-4 rounded-lg shadow-xl z-50 w-80 slide-out-panel">
          <h4 className="font-semibold text-gray-800 mb-2">Next Event</h4>
          <p className="text-sm">{scheduledEvents[0].title}</p>
          <p className="text-xs text-gray-600">
            {new Date(scheduledEvents[0].start_time).toLocaleString()}
          </p>
          <div className="mt-3 space-y-2">
            <button
              onClick={() => handleJoinOnSchedule(scheduledEvents[0].ID)}
              className="w-full bg-blue-500 text-white px-3 py-1 rounded text-sm"
            >
              Join on Schedule
            </button>
            <button
              onClick={() => handleAddToCalendar(scheduledEvents[0].ID)}
              className="w-full bg-gray-200 text-gray-800 px-3 py-1 rounded text-sm"
            >
              Add to Calendar
            </button>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsSidebarOpen(true);
              setIsHovering(false);
            }}
            className="mt-2 text-blue-500 text-sm underline"
          >
            Show All Events
          </button>
        </div>
      )}

      {/* Full Sidebar (on Click) */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex">
          <div className="bg-white w-96 p-6 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Scheduled Events</h3>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            {/* Upcoming & Past Tabs */}
            <div className="flex border-b mb-4">
              <button
                onClick={() => setActiveTab('upcoming')}
                className={`px-4 py-2 ${activeTab === 'upcoming' ? 'border-b-2 border-blue-500' : ''}`}
              >
                Upcoming
              </button>
              <button
                onClick={() => setActiveTab('past')}
                className={`px-4 py-2 ${activeTab === 'past' ? 'border-b-2 border-blue-500' : ''}`}
              >
                Past
              </button>
            </div>
            {/* Events List */}
            {eventsToShow.length > 0 ? (
              eventsToShow.map((event) => (
                <div key={event.ID} className="p-4 mb-3 bg-gray-50 rounded-lg border border-gray-200 relative">
                  <div>
                    <h4 className="font-medium text-gray-900">{event.title}</h4>
                    <p className="text-sm text-gray-600 mt-1">
                      {new Date(event.start_time).toLocaleString(undefined, {
                        timeZoneName: 'short',
                      })}
                    </p>
                  </div>
                  <div className="mt-3 flex space-x-2">
                    <button
                      onClick={() => handleJoinOnSchedule(event.ID)}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm transition-colors duration-150"
                    >
                      Join on Schedule
                    </button>
                    <button
                      onClick={() => handleAddToCalendar(event.ID)}
                      className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1 rounded text-sm transition-colors duration-150"
                    >
                      Add to Calendar
                    </button>
                  </div>
                  {isHost && (
                    <div className="absolute top-2 right-2 flex space-x-1">
                      <button
                        onClick={() => handleEditEvent(event.ID)}
                        className="p-1.5 text-gray-500 hover:text-blue-500 rounded-full hover:bg-gray-200 transition-colors duration-150"
                        aria-label="Edit event"
                        title="Edit event"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(event.ID)}
                        className="p-1.5 text-gray-500 hover:text-red-500 rounded-full hover:bg-gray-200 transition-colors duration-150"
                        aria-label="Delete event"
                        title="Delete event"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm">
                No {activeTab === 'past' ? 'past' : 'upcoming'} events.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;