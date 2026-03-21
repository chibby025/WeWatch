import React, { useState, useEffect } from 'react';
import { ClockIcon, TrashIcon, TicketIcon } from '@heroicons/react/24/outline';
import apiClient from '../services/api';
import CalendarDropdown from './CalendarDropdown';
import toast from 'react-hot-toast';
import { convertFiatToTokens, formatTokens, formatCurrency } from '../utils/tokenConverter';
import { createFreeRSVP, cancelRSVP, purchaseEventTicket } from '../services/api';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '../styles/customDatePicker.css';

const ScheduleEventModal = ({
  isOpen,
  roomId,
  onClose,
  onCreate,
  eventToEdit,
  isHost,
  activeTab = 'create', // 'create' or 'upcoming'
}) => {
  // Tab state
  const [currentTab, setCurrentTab] = useState(activeTab);
  
  // State for form fields
  const [watchType, setWatchType] = useState('3d_cinema');
  const [mediaFile, setMediaFile] = useState(null);
  const [startTime, setStartTime] = useState(null); // Changed to Date object for DatePicker
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  // ✅ Trailer state
  const [trailerFile, setTrailerFile] = useState(null);
  const [trailerTitle, setTrailerTitle] = useState('');
  const [trailerPreview, setTrailerPreview] = useState(null);
  
  // ✅ Pricing/ticketing state
  const [isPaid, setIsPaid] = useState(false);
  const [ticketPriceNaira, setTicketPriceNaira] = useState('');
  const [earlyBirdEnabled, setEarlyBirdEnabled] = useState(false);
  const [earlyBirdPriceNaira, setEarlyBirdPriceNaira] = useState('');
  
  // State for upcoming events
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [userTickets, setUserTickets] = useState({}); // Track user's tickets/RSVPs by event ID
  const [actionLoading, setActionLoading] = useState({}); // Track loading state for each event action
  
  // ✅ Gift ticket state
  const [giftingEventId, setGiftingEventId] = useState(null); // Which event is being gifted
  const [giftRecipientUsername, setGiftRecipientUsername] = useState('');
  const [giftLoading, setGiftLoading] = useState(false);

  // Sync active tab prop
  useEffect(() => {
    setCurrentTab(activeTab);
  }, [activeTab]);
  
  // Fetch events when modal opens or tab changes
  useEffect(() => {
    if (isOpen && currentTab === 'upcoming') {
      fetchEvents();
    }
  }, [isOpen, currentTab, roomId]);
  
  // Populate form if editing
  useEffect(() => {
    if (eventToEdit) {
      setWatchType(eventToEdit.watch_type || '3d_cinema');
      setStartTime(eventToEdit.start_time ? new Date(eventToEdit.start_time) : null);
      setTitle(eventToEdit.title || '');
      setDescription(eventToEdit.description || '');
    } else {
      // Reset form for new event
      setWatchType('3d_cinema');
      setMediaFile(null);
      setStartTime(null);
      setTitle('');
      setDescription('');
      setTrailerFile(null);
      setTrailerTitle('');
      setTrailerPreview(null);
      setIsPaid(false);
      setTicketPriceNaira('');
      setEarlyBirdEnabled(false);
      setEarlyBirdPriceNaira('');
    }
  }, [eventToEdit]);
  
  // Fetch scheduled events
  const fetchEvents = async () => {
    setLoadingEvents(true);
    try {
      const response = await apiClient.get(`/api/rooms/${roomId}/scheduled-events`);
      setEvents(response.data.events || []);
    } catch (err) {
      console.error('Failed to fetch scheduled events:', err);
      toast.error('Failed to load events');
    } finally {
      setLoadingEvents(false);
    }
  };

  // Handle form submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!watchType || !startTime || !title) return;

    try {
      // Convert Date object to UTC ISO string
      const utcTime = startTime.toISOString();

      let trailerUploadedUrl = '';
      let trailerUploadedDuration = 0;

      // ✅ Upload trailer file if provided
      if (trailerFile) {
        console.log('🎬 [ScheduleModal] Uploading trailer file...', trailerFile.name);
        
        const formData = new FormData();
        formData.append('trailerFile', trailerFile);

        const uploadResponse = await apiClient.post('/api/scheduled-events/upload-trailer', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        trailerUploadedUrl = uploadResponse.data.file_path;
        trailerUploadedDuration = uploadResponse.data.duration;
        
        console.log('✅ [ScheduleModal] Trailer uploaded:', trailerUploadedUrl);
      }

      const eventData = {
        watch_type: watchType,
        media_file_path: mediaFile?.name || '', // Store filename for reference
        start_time: utcTime,
        title,
        description,
        trailer_url: trailerUploadedUrl,
        trailer_title: trailerTitle || title, // Default to event title
        trailer_duration: trailerUploadedDuration,
        is_paid: isPaid,
        ticket_price_tokens: isPaid ? convertFiatToTokens(parseFloat(ticketPriceNaira), 'NGN') : 0,
        ticket_price_amount: isPaid ? parseFloat(ticketPriceNaira) : 0,
        ticket_price_currency: isPaid ? 'NGN' : '',
        early_bird_enabled: earlyBirdEnabled,
        early_bird_price_tokens: earlyBirdEnabled ? convertFiatToTokens(parseFloat(earlyBirdPriceNaira), 'NGN') : 0,
        early_bird_price_amount: earlyBirdEnabled ? parseFloat(earlyBirdPriceNaira) : 0,
      };

      await onCreate(eventData);
      
      // Reset form
      setWatchType('3d_cinema');
      setMediaFile(null);
      setStartTime(null);
      setTitle('');
      setDescription('');
      setTrailerFile(null);
      setTrailerTitle('');
      setTrailerPreview(null);
      setIsPaid(false);
      setTicketPriceNaira('');
      setEarlyBirdEnabled(false);
      setEarlyBirdPriceNaira('');
      
      // Switch to upcoming events tab and refresh
      setCurrentTab('upcoming');
      await fetchEvents();
    } catch (error) {
      console.error('❌ [ScheduleModal] Error creating event:', error);
      alert(error.message || 'Failed to create event');
    }
  };
  
  // Handle delete event
  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm('Are you sure you want to delete this event?')) return;
    
    try {
      await apiClient.delete(`/api/scheduled-events/${eventId}`);
      toast.success('Event deleted successfully');
      await fetchEvents(); // Refresh list
    } catch (err) {
      console.error('Failed to delete event:', err);
      toast.error('Failed to delete event');
    }
  };

  // Handle RSVP to free event
  const handleRSVP = async (eventId) => {
    setActionLoading(prev => ({ ...prev, [eventId]: true }));
    try {
      await createFreeRSVP(eventId);
      toast.success('✅ RSVP confirmed!');
      setUserTickets(prev => ({ ...prev, [eventId]: { type: 'rsvp' } }));
      await fetchEvents(); // Refresh to get updated counts
    } catch (err) {
      console.error('Failed to RSVP:', err);
      toast.error(err.response?.data?.error || 'Failed to RSVP');
    } finally {
      setActionLoading(prev => ({ ...prev, [eventId]: false }));
    }
  };

  // Handle cancel RSVP
  const handleCancelRSVP = async (eventId) => {
    setActionLoading(prev => ({ ...prev, [eventId]: true }));
    try {
      await cancelRSVP(eventId);
      toast.success('RSVP cancelled');
      setUserTickets(prev => {
        const updated = { ...prev };
        delete updated[eventId];
        return updated;
      });
      await fetchEvents(); // Refresh to get updated counts
    } catch (err) {
      console.error('Failed to cancel RSVP:', err);
      toast.error(err.response?.data?.error || 'Failed to cancel RSVP');
    } finally {
      setActionLoading(prev => ({ ...prev, [eventId]: false }));
    }
  };

  // Handle ticket purchase
  const handlePurchaseTicket = async (eventId, isGift = false) => {
    setActionLoading(prev => ({ ...prev, [eventId]: true }));
    try {
      let recipientUserId = null;
      
      // If gifting, validate and get recipient user ID
      if (isGift) {
        if (!giftRecipientUsername.trim()) {
          toast.error('Please enter a recipient username');
          return;
        }
        
        // Look up user by username
        try {
          const response = await apiClient.get(`/api/users/by-username/${giftRecipientUsername.trim()}`);
          recipientUserId = response.data.user.id;
        } catch (err) {
          toast.error(err.response?.data?.error || 'User not found');
          return;
        }
      }
      
      const result = await purchaseEventTicket(eventId, isGift, recipientUserId);
      
      if (isGift) {
        toast.success(`🎁 Ticket gifted to @${giftRecipientUsername}! (${result.total_cost_tokens} tokens with 5% transfer fee)`);
        setGiftingEventId(null);
        setGiftRecipientUsername('');
      } else {
        toast.success(`🎟️ Ticket purchased! (${result.total_cost_tokens} tokens)`);
      }
      
      setUserTickets(prev => ({ ...prev, [eventId]: { type: 'ticket', ...result.ticket } }));
      await fetchEvents(); // Refresh to get updated counts
    } catch (err) {
      console.error('Failed to purchase ticket:', err);
      toast.error(err.response?.data?.error || 'Failed to purchase ticket');
    } finally {
      setActionLoading(prev => ({ ...prev, [eventId]: false }));
    }
  };
  
  // Format event time
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
  
  // Get time until event
  const getTimeUntilEvent = (startTime) => {
    const now = new Date();
    const eventStart = new Date(startTime);
    const diffMs = eventStart - now;
    const diffMins = Math.floor(diffMs / 1000 / 60);
    
    // More than 1 day past (1440 minutes)
    if (diffMins < -1440) return 'ENDED';
    if (diffMins < 0) return 'Started';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`;
    return `${Math.floor(diffMins / 1440)}d`;
  };
  
  // Calculate 5% transfer fee for gifting
  const calculateTransferFee = (ticketPriceTokens) => {
    const fee = Math.max(1, Math.ceil(ticketPriceTokens * 0.05)); // Minimum 1 token, 5% of price
    return fee;
  };
  
  // Split events into upcoming and past
  const now = new Date();
  const futureEvents = events.filter(event => new Date(event.start_time) > now);
  const pastEvents = events.filter(event => new Date(event.start_time) <= now);

  const roomUrl = `${window.location.origin}/rooms/${roomId}`;

  // Early return after all hooks
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white dark:bg-gray-800 p-3 sm:p-6 rounded-lg w-full max-w-md max-h-[95vh] overflow-y-auto custom-sleek-scrollbar">
        <div className="flex justify-between items-center mb-3 sm:mb-4">
          <h2 className="text-base sm:text-lg md:text-xl font-bold text-gray-900 dark:text-white">
            Scheduled Events
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl sm:text-2xl"
          >
            ×
          </button>
        </div>
        
        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-3 sm:mb-4">
          {isHost && (
            <button
              onClick={() => setCurrentTab('create')}
              className={`px-3 py-2 sm:px-4 text-sm sm:text-base font-medium transition-colors ${
                currentTab === 'create'
                  ? 'border-b-2 border-purple-500 text-purple-600 dark:text-purple-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Create Event
            </button>
          )}
          <button
            onClick={() => setCurrentTab('upcoming')}
            className={`px-3 py-2 sm:px-4 text-sm sm:text-base font-medium transition-colors ${
              currentTab === 'upcoming'
                ? 'border-b-2 border-purple-500 text-purple-600 dark:text-purple-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Upcoming {futureEvents.length > 0 && `(${futureEvents.length})`}
          </button>
          <button
            onClick={() => setCurrentTab('past')}
            className={`px-3 py-2 sm:px-4 text-sm sm:text-base font-medium transition-colors ${
              currentTab === 'past'
                ? 'border-b-2 border-purple-500 text-purple-600 dark:text-purple-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Past Events {pastEvents.length > 0 && `(${pastEvents.length})`}
          </button>
        </div>
        
        {/* Tab Content */}
        {currentTab === 'create' && isHost && (
          <form onSubmit={handleSubmit} className="max-w-md mx-auto">
            <div className="mb-3 sm:mb-4">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 block w-full px-2 py-1.5 sm:px-3 sm:py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
              />
            </div>
            
            <div className="mb-3 sm:mb-4">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Watch Type</label>
              <select
                value={watchType}
                onChange={(e) => setWatchType(e.target.value)}
                className="mt-1 block w-full px-2 py-1.5 sm:px-3 sm:py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
              >
                <option value="3d_cinema">🎬 3D Cinema</option>
                <option value="video_watch">📺 Video Watch</option>
                <option value="classroom">🎓 Lecture Hall</option>
              </select>
            </div>
            
            <div className="mb-3 sm:mb-4">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Description (Optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 block w-full px-2 py-1.5 sm:px-3 sm:py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                rows="3"
              />
            </div>
            
            {/* ✅ Pricing Type Radio Buttons (Simplified) */}
            <div className="mb-3 sm:mb-4">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Pricing Type
              </label>
              <div className="flex gap-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="pricingType"
                    checked={!isPaid}
                    onChange={() => setIsPaid(false)}
                    className="w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Free</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="pricingType"
                    checked={isPaid}
                    onChange={() => setIsPaid(true)}
                    className="w-4 h-4 text-purple-600 border-gray-300 focus:ring-purple-500"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Paid</span>
                </label>
              </div>
            </div>
            
            {/* ✅ Ticket Image (Based on Watch Type) */}
            <div className="mb-4 flex justify-center">
              <img 
                src={
                  watchType === 'classroom' ? '/icons/LectureTicket.png' :
                  watchType === 'video_watch' ? '/icons/TheaterTicket.png' :
                  '/icons/CinemaTicket.png'
                }
                alt="Ticket"
                className="w-72 h-auto drop-shadow-2xl transition-transform hover:scale-105"
              />
            </div>
            
            {/* ✅ Ticket Pricing (shown only if paid) */}
            {isPaid && (
              <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-300 dark:border-purple-600">
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Ticket Price (₦)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-gray-700 dark:text-gray-300">
                      ₦
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={ticketPriceNaira}
                      onChange={(e) => setTicketPriceNaira(e.target.value)}
                      className="block w-full pl-8 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="e.g., 1000"
                      required={isPaid}
                    />
                  </div>
                  {ticketPriceNaira && (
                    <div className="mt-2 p-2 bg-purple-100 dark:bg-purple-800/30 rounded text-xs">
                      <span className="text-gray-700 dark:text-gray-300">
                        ≈ {formatTokens(convertFiatToTokens(parseFloat(ticketPriceNaira), 'NGN'))}
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Early Bird Toggle */}
                <div className="flex items-center mb-2">
                  <input
                    type="checkbox"
                    id="earlyBirdToggle"
                    checked={earlyBirdEnabled}
                    onChange={(e) => setEarlyBirdEnabled(e.target.checked)}
                    className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                  />
                  <label htmlFor="earlyBirdToggle" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enable Early Bird Pricing
                  </label>
                </div>
                
                {earlyBirdEnabled && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Early Bird Price (₦)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-gray-700 dark:text-gray-300">
                        ₦
                      </span>
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        value={earlyBirdPriceNaira}
                        onChange={(e) => setEarlyBirdPriceNaira(e.target.value)}
                        className="block w-full pl-8 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder={ticketPriceNaira ? `Less than ${ticketPriceNaira}` : 'Early bird price'}
                        required={earlyBirdEnabled}
                      />
                    </div>
                    {earlyBirdPriceNaira && (
                      <div className="mt-2 p-2 bg-green-100 dark:bg-green-800/30 rounded text-xs">
                        <span className="text-gray-700 dark:text-gray-300">
                          ≈ {formatTokens(convertFiatToTokens(parseFloat(earlyBirdPriceNaira), 'NGN'))}
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Automatically ends 1 hour before event starts
                    </p>
                  </div>
                )}
              </div>
            )}
            
            <div className="mb-3 sm:mb-4">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Start Time</label>
              <div className="relative mt-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                  <img src="/icons/schedule.svg" alt="" className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                </div>
                <DatePicker
                  selected={startTime}
                  onChange={(date) => setStartTime(date)}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={15}
                  dateFormat="MMMM d, yyyy h:mm aa"
                  minDate={new Date()}
                  placeholderText="Select date and time"
                  className="block w-full pl-14 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white cursor-pointer"
                  calendarClassName="custom-datepicker"
                  wrapperClassName="w-full"
                  required
                />
              </div>
              <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1">
                Selected: {startTime ? startTime.toLocaleString() : 'Not set'}
              </p>
            </div>
            
            {/* ✅ Trailer Upload Section - Positioned at bottom for prominence */}
            <div className="mb-4 p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg border-2 border-dashed border-purple-300 dark:border-purple-600">
              <label className="block text-sm font-semibold text-purple-700 dark:text-purple-300 mb-2">
                🎬 Event Trailer (Optional)
              </label>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                Upload a trailer to promote your event! Max 60 seconds • Auto-deletes when event starts • Appears in lobby "Watching Now"
              </p>
              
              <label className="flex items-center justify-center bg-black hover:bg-gray-900 text-white font-semibold py-3 px-4 rounded-lg cursor-pointer transition-colors">
                <input
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      // Validate file size (max 50MB)
                      if (file.size > 50 * 1024 * 1024) {
                        toast.error('Trailer file must be less than 50MB');
                        return;
                      }
                      setTrailerFile(file);
                      setTrailerPreview(URL.createObjectURL(file));
                    }
                  }}
                  className="hidden"
                  accept="video/mp4,video/webm,video/quicktime"
                />
                <span className="text-sm">📤 Upload Trailer</span>
              </label>
              
              {trailerPreview && (
                <div className="mt-3">
                  <video 
                    src={trailerPreview} 
                    controls 
                    className="w-full max-h-40 rounded border border-gray-300 dark:border-gray-600"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setTrailerFile(null);
                      setTrailerPreview(null);
                      setTrailerTitle('');
                    }}
                    className="mt-2 text-xs text-red-600 dark:text-red-400 hover:underline"
                  >
                    Remove trailer
                  </button>
                </div>
              )}
              
              {trailerFile && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Custom Trailer Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={trailerTitle}
                    onChange={(e) => setTrailerTitle(e.target.value)}
                    placeholder={title || 'Defaults to event title'}
                    className="block w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              )}
            </div>
            
            <div className="flex justify-end space-x-2 sm:space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors duration-150"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors duration-150"
              >
                Create Event
              </button>
            </div>
          </form>
        )}
        
        {currentTab === 'upcoming' && (
          <div>
            {loadingEvents ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                Loading events...
              </div>
            ) : futureEvents.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <ClockIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No upcoming events</p>
                {isHost && (
                  <button
                    onClick={() => setCurrentTab('create')}
                    className="mt-4 text-purple-600 dark:text-purple-400 hover:underline"
                  >
                    Create your first event
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3 max-h-96 overflow-y-auto custom-sleek-scrollbar">
                {futureEvents.map(event => {
                  const now = new Date();
                  const eventStart = new Date(event.start_time);
                  const timeDiff = (eventStart - now) / 1000 / 60;
                  const isStartingSoon = timeDiff <= 15 && timeDiff >= 0;
                  const hasUserTicket = userTickets[event.ID];
                  const isEarlyBird = event.early_bird_enabled && event.early_bird_active;
                  const ticketPrice = isEarlyBird ? event.early_bird_price_tokens : event.ticket_price_tokens;
                  const ticketPriceNaira = isEarlyBird ? event.early_bird_price_amount : event.ticket_price_amount;
                  
                  return (
                    <div
                      key={event.ID}
                      className={`p-3 sm:p-4 border rounded-lg ${
                        isStartingSoon
                          ? 'bg-red-50 dark:bg-red-900/10 border-red-300 dark:border-red-800'
                          : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 sm:gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {isStartingSoon && (
                              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
                            )}
                            <h4 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white truncate">{event.title}</h4>
                            {event.is_paid && (
                              <span className="flex-shrink-0 px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded">
                                Paid
                              </span>
                            )}
                          </div>
                          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                            {event.description || 'No description'}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-3">
                            <span className="flex items-center gap-1">
                              <ClockIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                              <span className="hidden sm:inline">{formatEventTime(event.start_time)}</span>
                              <span className="sm:hidden">{new Date(event.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            </span>
                            <span className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-[10px] sm:text-xs ${
                              getTimeUntilEvent(event.start_time) === 'ENDED'
                                ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 line-through'
                                : isStartingSoon
                                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                            }`}>
                              {getTimeUntilEvent(event.start_time)}
                            </span>
                            <span className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-[10px] sm:text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                              {event.watch_type === '3d_cinema' ? '🎬' : event.watch_type === 'classroom' ? '🎓' : '📺'}
                              <span className="hidden sm:inline ml-1">
                                {event.watch_type === '3d_cinema' ? '3D Cinema' : event.watch_type === 'classroom' ? 'Lecture Hall' : 'Video Watch'}
                              </span>
                            </span>
                            {event.is_paid ? (
                              <span className="flex items-center gap-1 text-xs">
                                <TicketIcon className="h-3 w-3" />
                                {event.tickets_sold || 0} sold
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs">
                                <TicketIcon className="h-3 w-3" />
                                {event.rsvp_count || 0} RSVP'd
                              </span>
                            )}
                          </div>

                          {/* Action Button */}
                          <div className="flex items-center gap-2">
                            {hasUserTicket ? (
                              <div className="flex items-center gap-2">
                                <span className="flex items-center gap-1 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-sm font-medium">
                                  ✅ {event.is_paid ? 'Ticket Purchased' : 'RSVP\'d'}
                                </span>
                                {!event.is_paid && (
                                  <button
                                    onClick={() => handleCancelRSVP(event.ID)}
                                    disabled={actionLoading[event.ID]}
                                    className="px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-sm hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
                                  >
                                    {actionLoading[event.ID] ? 'Cancelling...' : 'Cancel RSVP'}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <>
                                {event.is_paid ? (
                                  <div className="w-full">
                                    {/* Buy Ticket / Gift Ticket Button */}
                                    {giftingEventId === event.ID ? (
                                      /* Gift Mode - Show input */
                                      <div className="space-y-2">
                                        <input
                                          type="text"
                                          value={giftRecipientUsername}
                                          onChange={(e) => setGiftRecipientUsername(e.target.value)}
                                          placeholder="Enter recipient's username"
                                          className="w-full px-3 py-2 border rounded text-sm dark:bg-gray-700 dark:border-gray-600"
                                        />
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => handlePurchaseTicket(event.ID, true)}
                                            disabled={actionLoading[event.ID] || !giftRecipientUsername.trim()}
                                            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded text-sm font-medium disabled:opacity-50"
                                          >
                                            <span>🎁</span>
                                            {actionLoading[event.ID] ? 'Gifting...' : 
                                              `Gift (${formatTokens(ticketPrice + calculateTransferFee(ticketPrice))})`}
                                          </button>
                                          <button
                                            onClick={() => {
                                              setGiftingEventId(null);
                                              setGiftRecipientUsername('');
                                            }}
                                            className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded text-sm"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                          Ticket: {formatTokens(ticketPrice)} + Transfer fee (5%): {formatTokens(calculateTransferFee(ticketPrice))}
                                        </p>
                                      </div>
                                    ) : (
                                      /* Normal Mode - Show buttons */
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => handlePurchaseTicket(event.ID, false)}
                                          disabled={actionLoading[event.ID]}
                                          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium disabled:opacity-50"
                                        >
                                          <TicketIcon className="h-4 w-4" />
                                          {actionLoading[event.ID] ? 'Purchasing...' : 
                                            isEarlyBird ? `Buy Early Bird (${formatTokens(ticketPrice)})` : 
                                            `Buy Ticket (${formatTokens(ticketPrice)})`}
                                        </button>
                                        <button
                                          onClick={() => setGiftingEventId(event.ID)}
                                          disabled={actionLoading[event.ID]}
                                          className="px-3 py-1.5 bg-pink-100 hover:bg-pink-200 dark:bg-pink-900/30 dark:hover:bg-pink-900/50 text-pink-700 dark:text-pink-400 rounded text-sm font-medium disabled:opacity-50"
                                          title="Gift this ticket to someone"
                                        >
                                          🎁
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleRSVP(event.ID)}
                                    disabled={actionLoading[event.ID]}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium disabled:opacity-50"
                                  >
                                    <TicketIcon className="h-4 w-4" />
                                    {actionLoading[event.ID] ? 'Booking...' : 'Book Free Spot'}
                                  </button>
                                )}
                              </>
                            )}
                          </div>

                          {/* Early Bird Notice */}
                          {event.is_paid && isEarlyBird && !hasUserTicket && (
                            <p className="mt-2 text-xs text-green-600 dark:text-green-400">
                              🎉 Early bird pricing! Save {formatTokens(event.ticket_price_tokens - event.early_bird_price_tokens)} 
                              (Regular: {formatTokens(event.ticket_price_tokens)})
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                          <CalendarDropdown event={event} roomUrl={roomUrl} />
                          {isHost && (
                            <button
                              onClick={() => handleDeleteEvent(event.ID)}
                              className="p-1.5 sm:p-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                              title="Delete event"
                            >
                              <TrashIcon className="h-4 w-4 sm:h-5 sm:w-5" />
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
        )}
        
        {currentTab === 'past' && (
          <div>
            {loadingEvents ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                Loading events...
              </div>
            ) : pastEvents.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <ClockIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No past events</p>
                <p className="text-xs mt-2">Events are kept for 7 days after they end</p>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3 max-h-96 overflow-y-auto custom-sleek-scrollbar">
                {pastEvents.map(event => {
                  const now = new Date();
                  const eventStart = new Date(event.start_time);
                  const timeDiff = (now - eventStart) / 1000 / 60; // Minutes since event started
                  
                  return (
                    <div
                      key={event.ID}
                      className="p-3 sm:p-4 border rounded-lg bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 opacity-75"
                    >
                      <div className="flex items-start justify-between gap-2 sm:gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white truncate">{event.title}</h4>
                            <span className="text-xs text-gray-500 dark:text-gray-400">(Ended)</span>
                          </div>
                          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                            {event.description || 'No description'}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                            <span className="flex items-center gap-1">
                              <ClockIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                              <span className="hidden sm:inline">{formatEventTime(event.start_time)}</span>
                              <span className="sm:hidden">{new Date(event.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            </span>
                            <span className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-[10px] sm:text-xs bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                              {timeDiff < 60 ? `${Math.floor(timeDiff)}m ago` : 
                               timeDiff < 1440 ? `${Math.floor(timeDiff / 60)}h ago` : 
                               `${Math.floor(timeDiff / 1440)}d ago`}
                            </span>
                            <span className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-[10px] sm:text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                              {event.watch_type === '3d_cinema' ? '🎬' : '📺'}<span className="hidden sm:inline ml-1">{event.watch_type === '3d_cinema' ? '3D Cinema' : 'Video Watch'}</span>
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                          {isHost && (
                            <button
                              onClick={() => handleDeleteEvent(event.ID)}
                              className="p-1.5 sm:p-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                              title="Delete event"
                            >
                              <TrashIcon className="h-4 w-4 sm:h-5 sm:w-5" />
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
        )}
      </div>
    </div>
  );
};

export default ScheduleEventModal;