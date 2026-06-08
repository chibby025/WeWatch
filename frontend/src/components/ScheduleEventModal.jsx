import React, { useState, useEffect, useRef } from 'react';
import { ClockIcon, TrashIcon, TicketIcon, XCircleIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import apiClient from '../services/api';
import CalendarDropdown from './CalendarDropdown';
import toast from 'react-hot-toast';
import { convertFiatToTokens, formatTokens, formatCurrency } from '../utils/tokenConverter';
import { createFreeRSVP, cancelRSVP, purchaseEventTicket } from '../services/api';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '../styles/customDatePicker.css';

const CONTENT_RATINGS = ['G', 'PG', 'Educational', 'Religious', '13+', '16+', '18+', 'Mature'];

const getRoomTypeDefaultRating = (roomType) => {
  if (!roomType) return 'G';
  const t = roomType.toLowerCase();
  if (t === 'church') return 'Religious';
  if (t === 'education' || t === 'classroom') return 'Educational';
  return 'G';
};

const getTicketImage = (watchType, contentRating) => {
  if (contentRating === 'Religious') return '/icons/CCTicket.webp';
  if (contentRating === 'Educational' && watchType !== 'classroom') return '/icons/CTicket.webp';
  if (watchType === 'classroom') return '/icons/LectureTicket.webp';
  if (watchType === '3d_cinema') return '/icons/CinemaTicket.webp';
  return '/icons/VWTicket.webp';
};

// Generate all 15-min slots in 24h, return as "HH:MM"
const TIME_SLOTS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

const formatTimeSlot = (val) => {
  if (!val) return null;
  const [h, m] = val.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
};

const TimePicker = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const wrapRef = useRef(null);
  const selectedRef = useRef(null);
  const editInputRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Scroll selected slot into view when dropdown opens
  useEffect(() => {
    if (open && selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  }, [open]);

  // Focus native input when entering edit mode
  useEffect(() => {
    if (editMode) editInputRef.current?.focus();
  }, [editMode]);

  const handleEditClick = (e) => {
    e.stopPropagation();
    setOpen(false);
    setEditMode(true);
  };

  if (editMode) {
    return (
      <div className="relative" ref={wrapRef}>
        <input
          ref={editInputRef}
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditMode(false)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditMode(false); }}
          className="block w-full px-3 py-2 text-sm border border-purple-500 rounded-md
            bg-white dark:bg-gray-700 text-gray-900 dark:text-white
            [color-scheme:light] dark:[color-scheme:dark]
            focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center justify-between w-full px-3 py-2 text-sm rounded-md border transition-colors
          ${value
            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-gray-900 dark:text-white'
            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-400 dark:text-gray-500'
          }`}
      >
        <span className={value ? '' : 'text-gray-400 dark:text-gray-500'}>
          {value ? formatTimeSlot(value) : 'Select time'}
        </span>
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          {/* Edit icon — enters manual input mode */}
          <span
            role="button"
            tabIndex={-1}
            onClick={handleEditClick}
            className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors cursor-pointer"
            title="Enter custom time"
          >
            <PencilSquareIcon className="w-3.5 h-3.5 text-gray-400" />
          </span>
          <ClockIcon className="w-4 h-4 text-gray-400" />
        </div>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-2xl overflow-hidden">
          <div className="max-h-52 overflow-y-auto overscroll-contain">
            {TIME_SLOTS.map(slot => {
              const isSelected = slot === value;
              return (
                <button
                  key={slot}
                  type="button"
                  ref={isSelected ? selectedRef : null}
                  onClick={() => { onChange(slot); setOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                    ${isSelected
                      ? 'bg-purple-600 text-white font-semibold'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                  {formatTimeSlot(slot)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const ScheduleEventModal = ({
  isOpen,
  roomId,
  roomType,
  onClose,
  onCreate,
  eventToEdit,
  isHost,
  activeTab = 'create', // 'create' or 'upcoming'
  prefill = null, // { title, description, content_rating, preferred_date } from community request claim
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

  // Content rating
  const [contentRating, setContentRating] = useState(() => getRoomTypeDefaultRating(roomType));

  // Submitting state — prevents double-submit and shows spinner
  const [submitting, setSubmitting] = useState(false);

  // Stepper for create tab
  const [createStep, setCreateStep] = useState(1);

  // Recurrence state
  const [recurrenceType, setRecurrenceType] = useState('none');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(null);

  // Room calendar state
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(null);

  // Sync active tab prop
  useEffect(() => {
    setCurrentTab(activeTab);
  }, [activeTab]);
  
  // Fetch events when modal opens or tab changes
  useEffect(() => {
    if (isOpen && (currentTab === 'upcoming' || currentTab === 'calendar')) {
      fetchEvents();
    }
  }, [isOpen, currentTab, roomId]);
  
  // Populate form if editing or if prefill data provided (from community request claim)
  useEffect(() => {
    if (eventToEdit) {
      setWatchType(eventToEdit.watch_type || '3d_cinema');
      setStartTime(eventToEdit.start_time ? new Date(eventToEdit.start_time) : null);
      setTitle(eventToEdit.title || '');
      setDescription(eventToEdit.description || '');
      setContentRating(eventToEdit.content_rating || getRoomTypeDefaultRating(roomType));
    } else {
      // Reset form for new event
      setWatchType('3d_cinema');
      setMediaFile(null);
      setStartTime(prefill?.preferred_date ? new Date(prefill.preferred_date) : null);
      setTitle(prefill?.title || '');
      setDescription(prefill?.description || '');
      setTrailerFile(null);
      setTrailerTitle('');
      setTrailerPreview(null);
      setIsPaid(false);
      setTicketPriceNaira('');
      setEarlyBirdEnabled(false);
      setEarlyBirdPriceNaira('');
      setRecurrenceType('none');
      setRecurrenceEndDate(null);
      setContentRating(prefill?.content_rating || getRoomTypeDefaultRating(roomType));
      setCreateStep(1);
    }
  }, [eventToEdit, roomType, prefill]);
  
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

  // Handle form submit — called directly from the Create Event button onClick, never via
  // the form's native submit event (which can fire spuriously during the step 3→4 re-render).
  const handleSubmit = async () => {
    if (!watchType || !startTime || !title || submitting) return;

    setSubmitting(true);
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
        media_file_path: mediaFile?.name || '',
        start_time: utcTime,
        title,
        description,
        content_rating: contentRating || 'G',
        trailer_url: trailerUploadedUrl,
        trailer_title: trailerTitle || title,
        trailer_duration: trailerUploadedDuration,
        is_paid: isPaid,
        ticket_price_tokens: isPaid ? convertFiatToTokens(parseFloat(ticketPriceNaira), 'NGN') : 0,
        ticket_price_amount: isPaid ? parseFloat(ticketPriceNaira) : 0,
        ticket_price_currency: isPaid ? 'NGN' : '',
        early_bird_enabled: earlyBirdEnabled,
        early_bird_price_tokens: earlyBirdEnabled ? convertFiatToTokens(parseFloat(earlyBirdPriceNaira), 'NGN') : 0,
        early_bird_price_amount: earlyBirdEnabled ? parseFloat(earlyBirdPriceNaira) : 0,
        recurrence_type: recurrenceType,
        recurrence_end_date: recurrenceType !== 'none' && recurrenceEndDate ? recurrenceEndDate.toISOString() : null,
      };

      console.log('📊 [ScheduleModal] Event data prepared:', {
        watchType: eventData.watch_type,
        originalWatchType: watchType,
        startTime: eventData.start_time,
        title: eventData.title,
        isPaid: eventData.is_paid,
        ticketPriceTokens: eventData.ticket_price_tokens,
        ticketPriceAmount: eventData.ticket_price_amount,
        ticketPriceCurrency: eventData.ticket_price_currency,
        earlyBirdEnabled: eventData.early_bird_enabled,
      });

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
      setRecurrenceType('none');
      setRecurrenceEndDate(null);
      setContentRating(getRoomTypeDefaultRating(roomType));
      setCreateStep(1);

      // Switch to upcoming events tab and refresh
      setCurrentTab('upcoming');
      await fetchEvents();
    } catch (error) {
      console.error('❌ [ScheduleModal] Error creating event:', error);
      alert(error.message || 'Failed to create event');
    } finally {
      setSubmitting(false);
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
        toast.success(`🎁 Ticket booked for @${giftRecipientUsername}!`);
        setGiftingEventId(null);
        setGiftRecipientUsername('');
      } else {
        toast.success('🎟️ Ticket booked!');
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
    const fee = Math.ceil(ticketPriceTokens * 0.05); // 5% of ticket price
    return fee;
  };
  
  // Split events into upcoming and past
  const now = new Date();
  const futureEvents = events.filter(event => new Date(event.start_time) > now);
  const pastEvents = events.filter(event => new Date(event.start_time) <= now);

  // Trailer lock: only within 7 days of event
  const TRAILER_WINDOW_DAYS = 7;
  const trailerUnlockDate = startTime
    ? new Date(startTime.getTime() - TRAILER_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    : null;
  const trailerLocked = !startTime || now < trailerUnlockDate;
  const trailerUnlockFormatted = trailerUnlockDate
    ? trailerUnlockDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    : null;

  // Split date/time helpers — keep startTime as a single Date object
  const handleDateChange = (date) => {
    if (!date) { setStartTime(null); return; }
    const merged = new Date(date);
    if (startTime) merged.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
    setStartTime(merged);
  };
  const handleTimeChange = (val) => {
    const [h, m] = val.split(':').map(Number);
    const merged = startTime ? new Date(startTime) : new Date();
    merged.setHours(h, m, 0, 0);
    setStartTime(merged);
  };
  const timeValue = startTime
    ? `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}`
    : '';

  // Room calendar helpers
  const calendarMonthLabel = new Date(calendarYear, calendarMonth).toLocaleString('default', { month: 'long', year: 'numeric' });
  const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const eventsByDay = {};
  events.forEach(ev => {
    const d = new Date(ev.start_time);
    if (d.getFullYear() === calendarYear && d.getMonth() === calendarMonth) {
      const key = d.getDate();
      if (!eventsByDay[key]) eventsByDay[key] = [];
      eventsByDay[key].push(ev);
    }
  });
  const navigateCalendarMonth = (dir) => {
    let m = calendarMonth + dir;
    let y = calendarYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setCalendarMonth(m);
    setCalendarYear(y);
    setSelectedCalendarDay(null);
  };

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
          <button
            onClick={() => setCurrentTab('calendar')}
            className={`px-3 py-2 sm:px-4 text-sm sm:text-base font-medium transition-colors ${
              currentTab === 'calendar'
                ? 'border-b-2 border-purple-500 text-purple-600 dark:text-purple-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Calendar
          </button>
        </div>
        
        {/* Tab Content */}
        {currentTab === 'create' && isHost && (
          <form onSubmit={(e) => e.preventDefault()} className="max-w-md mx-auto">
            {/* Stepper header */}
            <div className="flex items-center justify-between mb-5">
              {['Basics', 'Schedule', 'Pricing', 'Trailer'].map((label, idx) => {
                const step = idx + 1;
                const done = createStep > step;
                const active = createStep === step;
                return (
                  <React.Fragment key={step}>
                    <button
                      type="button"
                      onClick={() => done && setCreateStep(step)}
                      className="flex flex-col items-center gap-1 group"
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                        done ? 'bg-purple-500 text-white cursor-pointer' :
                        active ? 'bg-purple-600 text-white ring-2 ring-purple-300' :
                        'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                      }`}>
                        {done ? '✓' : step}
                      </div>
                      <span className={`text-[10px] font-medium ${active ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 dark:text-gray-500'}`}>
                        {label}
                      </span>
                    </button>
                    {step < 4 && (
                      <div className={`flex-1 h-0.5 mx-1 mb-4 transition-colors ${createStep > step ? 'bg-purple-500' : 'bg-gray-200 dark:bg-gray-600'}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Step 1: Basics */}
            {createStep === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g. Friday Movie Night"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Watch Type</label>
                  <select
                    value={watchType}
                    onChange={(e) => setWatchType(e.target.value)}
                    className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                  >
                    <option value="3d_cinema">🎬 3D Cinema</option>
                    <option value="video_watch">📺 Video Watch</option>
                    <option value="classroom">🎓 Lecture Hall</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Content Rating</label>
                  <select
                    value={contentRating}
                    onChange={(e) => setContentRating(e.target.value)}
                    className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {CONTENT_RATINGS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Pre-filled from room type. Change if needed.</p>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description <span className="font-normal text-gray-400">(optional)</span></label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    rows="3"
                    placeholder="Tell people what to expect…"
                  />
                </div>
              </div>
            )}

            {/* Step 2: Schedule */}
            {createStep === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Start Time</label>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Date picker */}
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Date</label>
                      <DatePicker
                        selected={startTime}
                        onChange={handleDateChange}
                        dateFormat="MMM d, yyyy"
                        minDate={new Date()}
                        placeholderText="Pick a date"
                        className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white cursor-pointer"
                        calendarClassName="custom-datepicker"
                        wrapperClassName="w-full"
                        required
                      />
                    </div>
                    {/* Time picker */}
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Time</label>
                      <TimePicker value={timeValue} onChange={handleTimeChange} />
                    </div>
                  </div>
                  {startTime && (
                    <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                      {startTime.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Repeat</label>
                  <select
                    value={recurrenceType}
                    onChange={e => { setRecurrenceType(e.target.value); setRecurrenceEndDate(null); }}
                    className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="none">Does not repeat</option>
                    <option value="weekly">Every week</option>
                    <option value="biweekly">Every 2 weeks</option>
                    <option value="monthly">Every month</option>
                  </select>
                  {recurrenceType !== 'none' && (
                    <div className="mt-2">
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Repeat until <span className="italic">(optional — defaults to 1 year)</span>
                      </label>
                      <DatePicker
                        selected={recurrenceEndDate}
                        onChange={date => setRecurrenceEndDate(date)}
                        minDate={startTime || new Date()}
                        placeholderText="No end date"
                        dateFormat="MMMM d, yyyy"
                        className="block w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white cursor-pointer"
                        calendarClassName="custom-datepicker"
                        wrapperClassName="w-full"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Pricing */}
            {createStep === 3 && (
              <div className="space-y-4">
                {/* Ticket image preview */}
                <div className="flex justify-center">
                  <img
                    src={getTicketImage(watchType, contentRating)}
                    alt="Ticket"
                    className="w-64 h-auto drop-shadow-xl transition-transform hover:scale-105"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pricing</label>
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

                {isPaid && (
                  <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-300 dark:border-purple-600 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ticket Price (₦)</label>
                      <div className="flex gap-1.5 flex-wrap mb-2">
                        {[50, 100, 200, 1000].map(preset => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setTicketPriceNaira(String(preset))}
                            className={`px-2.5 py-1 rounded text-xs font-semibold border transition-all ${
                              parseFloat(ticketPriceNaira) === preset
                                ? 'bg-purple-600 text-white border-purple-600'
                                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20'
                            }`}
                          >
                            ₦{preset.toLocaleString()}
                          </button>
                        ))}
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-gray-700 dark:text-gray-300">₦</span>
                        <input
                          type="number"
                          min="50"
                          step="0.01"
                          value={ticketPriceNaira}
                          onChange={(e) => setTicketPriceNaira(e.target.value)}
                          className="block w-full pl-8 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          placeholder="e.g., 1000"
                          required={isPaid}
                        />
                      </div>
                      {ticketPriceNaira && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          ≈ {formatTokens(convertFiatToTokens(parseFloat(ticketPriceNaira), 'NGN'))}
                        </p>
                      )}
                    </div>

                  </div>
                )}
              </div>
            )}

            {/* Step 4: Trailer */}
            {createStep === 4 && (() => {
              const daysUntilUnlock = trailerUnlockDate
                ? Math.ceil((trailerUnlockDate - now) / (1000 * 60 * 60 * 24))
                : null;

              return (
                <div className="space-y-4">
                  {trailerLocked ? (
                    /* ── Locked state ── */
                    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                      <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-7 flex flex-col items-center gap-4">
                        <div className="relative">
                          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-3xl">
                            🎬
                          </div>
                          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-sm shadow-lg">
                            🔒
                          </div>
                        </div>
                        <div className="text-center">
                          <p className="text-white font-semibold text-sm">Trailer Upload Locked</p>
                          {!startTime ? (
                            <p className="text-gray-400 text-xs mt-1.5">Go back to Step 2 and set your event date to unlock</p>
                          ) : (
                            <>
                              <p className="text-amber-400 text-sm font-medium mt-1.5">
                                Opens in {daysUntilUnlock} day{daysUntilUnlock !== 1 ? 's' : ''}
                              </p>
                              <p className="text-gray-500 text-[11px] mt-1">Available 7 days before your event</p>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-2.5">
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center">
                          Trailers auto-delete at event start time — protecting rights &amp; saving storage
                        </p>
                      </div>
                    </div>
                  ) : !trailerFile ? (
                    /* ── Upload zone ── */
                    <label className="block cursor-pointer group">
                      <input
                        type="file"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            if (file.size > 50 * 1024 * 1024) {
                              toast.error('Trailer must be under 50 MB');
                              return;
                            }
                            setTrailerFile(file);
                            setTrailerPreview(URL.createObjectURL(file));
                          }
                        }}
                        className="hidden"
                        accept="video/mp4,video/webm,video/quicktime,image/*"
                      />
                      <div className="border-2 border-dashed border-purple-300 dark:border-purple-700 rounded-xl p-8 flex flex-col items-center gap-3 transition-all group-hover:border-purple-500 group-hover:bg-purple-50/50 dark:group-hover:bg-purple-900/10">
                        <div className="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-2xl">
                          🎞️
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-semibold text-purple-700 dark:text-purple-300">Upload Trailer or Poster</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Click to browse or drag &amp; drop</p>
                        </div>
                        <div className="flex flex-wrap justify-center gap-2 mt-1">
                          {['MP4 · WebM · MOV · Image', 'Max 60s for video', 'Max 50 MB'].map(tag => (
                            <span key={tag} className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-[11px] text-gray-500 dark:text-gray-400">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </label>
                  ) : (
                    /* ── Preview state ── */
                    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-600 bg-black">
                      {trailerFile.type.startsWith('image/') ? (
                        <img
                          src={trailerPreview}
                          alt="trailer poster"
                          className="w-full max-h-52 object-contain bg-black"
                        />
                      ) : (
                        <video
                          src={trailerPreview}
                          controls
                          className="w-full max-h-52 bg-black"
                        />
                      )}
                      <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-800 dark:text-white truncate">{trailerFile.name}</p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                            {(trailerFile.size / 1024 / 1024).toFixed(1)} MB
                            {trailerFile.type.startsWith('image/') && ' · Poster image'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setTrailerFile(null); setTrailerPreview(null); setTrailerTitle(''); }}
                          className="flex-shrink-0 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Trailer title (only when file selected and unlocked) */}
                  {!trailerLocked && trailerFile && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Custom Trailer Title <span className="font-normal text-gray-400">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={trailerTitle}
                        onChange={(e) => setTrailerTitle(e.target.value)}
                        placeholder={title || 'Defaults to event title'}
                        className="block w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  )}

                  {/* Info chips — always visible when unlocked */}
                  {!trailerLocked && (
                    <div className="flex flex-wrap gap-2">
                      {[
                        { icon: '⏱', label: 'Max 60 seconds' },
                        { icon: '🗑', label: 'Auto-deletes at start' },
                        { icon: '📺', label: 'Shows in Lobby' },
                      ].map(({ icon, label }) => (
                        <span key={label} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-[11px] text-gray-600 dark:text-gray-400">
                          {icon} {label}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Skip hint */}
                  {trailerLocked && (
                    <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                      You can still create the event — add a trailer later when it unlocks.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Navigation */}
            <div className="flex justify-between mt-6 gap-2">
              {createStep > 1 ? (
                <button
                  type="button"
                  onClick={() => setCreateStep(s => s - 1)}
                  className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                >
                  ← Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                >
                  Cancel
                </button>
              )}

              {createStep < 4 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (createStep === 1 && !title.trim()) { toast.error('Please enter a title'); return; }
                    if (createStep === 2 && !startTime) { toast.error('Please select a start time'); return; }
                    if (createStep === 3 && isPaid) {
                      if (!ticketPriceNaira) { toast.error('Please enter a ticket price'); return; }
                      if (parseFloat(ticketPriceNaira) < 50) { toast.error('Minimum ticket price is ₦50'); return; }
                    }
                    setCreateStep(s => s + 1);
                  }}
                  className="px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors font-medium"
                >
                  Next →
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmit}
                  className="px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors font-medium disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting && (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                  )}
                  {submitting ? (trailerFile ? 'Uploading...' : 'Creating...') : 'Create Event'}
                </button>
              )}
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

                  return (
                    <div
                      key={event.ID}
                      className={`border rounded-lg overflow-hidden ${
                        isStartingSoon
                          ? 'bg-red-50 dark:bg-red-900/10 border-red-300 dark:border-red-800'
                          : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                      }`}
                    >
                      {/* Card body */}
                      <div className="p-3 sm:p-4">
                        {/* Title row */}
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
                          {isEarlyBird && !hasUserTicket && (
                            <span className="flex-shrink-0 px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                              🎉 Early Bird
                            </span>
                          )}
                        </div>

                        {/* Description */}
                        {event.description && (
                          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                            {event.description}
                          </p>
                        )}

                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <ClockIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                            <span>{formatEventTime(event.start_time)}</span>
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs sm:text-sm font-medium ${
                            isStartingSoon
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                              : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                          }`}>
                            {getTimeUntilEvent(event.start_time)}
                          </span>
                          <span className="px-2 py-0.5 rounded text-xs sm:text-sm bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                            {event.watch_type === '3d_cinema' ? '🎬' : event.watch_type === 'classroom' ? '🎓' : '📺'}
                            <span className="ml-1">
                              {event.watch_type === '3d_cinema' ? '3D Cinema' : event.watch_type === 'classroom' ? 'Lecture Hall' : 'Video Watch'}
                            </span>
                          </span>
                          {event.is_paid ? (
                            <span className="flex items-center gap-1">
                              <TicketIcon className="h-4 w-4" />
                              {event.tickets_sold || 0} booked
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <TicketIcon className="h-4 w-4" />
                              {event.rsvp_count || 0} RSVP'd
                            </span>
                          )}
                          {event.is_paid && (
                            <span className="font-semibold text-purple-700 dark:text-purple-400">
                              {formatTokens(ticketPrice)}
                              {isEarlyBird && (
                                <span className="ml-1 line-through text-gray-400 text-[10px]">
                                  {formatTokens(event.ticket_price_tokens)}
                                </span>
                              )}
                            </span>
                          )}
                        </div>

                        {/* Gift mode input */}
                        {!isHost && giftingEventId === event.ID && (
                          <div className="mt-3 space-y-2">
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
                                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded text-sm font-medium disabled:opacity-50"
                              >
                                🎁 {actionLoading[event.ID] ? 'Gifting...' : `Gift (${formatTokens(ticketPrice + calculateTransferFee(ticketPrice))})`}
                              </button>
                              <button
                                onClick={() => { setGiftingEventId(null); setGiftRecipientUsername(''); }}
                                className="px-3 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded text-sm"
                              >
                                Cancel
                              </button>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Ticket: {formatTokens(ticketPrice)} + 5% fee: {formatTokens(calculateTransferFee(ticketPrice))}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Action row */}
                      <div className="px-3 pb-3 pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-around gap-1">
                        {isHost ? (
                          <>
                            {event.is_paid ? (
                              <div className="flex flex-col gap-0.5 p-2 flex-1">
                                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Projected Attendance & Revenue</span>
                                <div className="flex items-center gap-3 mt-0.5">
                                  <span className="text-sm font-bold text-green-600 dark:text-green-400">
                                    ₦{((event.tickets_sold || 0) * (event.ticket_price_amount || 0)).toLocaleString()}
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {event.tickets_sold || 0} booked
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-0.5 p-2 flex-1">
                                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Projected Attendance</span>
                                <span className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                                  {event.rsvp_count || 0} RSVP{(event.rsvp_count || 0) !== 1 ? 's' : ''}
                                </span>
                              </div>
                            )}
                            <CalendarDropdown event={event} roomUrl={roomUrl} large />
                            <button
                              onClick={() => handleDeleteEvent(event.ID)}
                              className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <TrashIcon className="h-6 w-6 text-red-500" />
                              <span className="text-[10px] text-red-600">Delete</span>
                            </button>
                          </>
                        ) : hasUserTicket ? (
                          <>
                            <div className="flex flex-col items-center gap-1 p-2">
                              <span className="text-xl leading-none">✅</span>
                              <span className="text-[10px] text-green-700 dark:text-green-400 font-medium text-center">
                                {event.is_paid ? 'Booked' : "RSVP'd"}
                              </span>
                            </div>
                            <CalendarDropdown event={event} roomUrl={roomUrl} large />
                            {!event.is_paid && (
                              <button
                                onClick={() => handleCancelRSVP(event.ID)}
                                disabled={actionLoading[event.ID]}
                                className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                              >
                                <XCircleIcon className="h-6 w-6 text-red-500 dark:text-red-400" />
                                <span className="text-[10px] text-red-600 dark:text-red-400">
                                  {actionLoading[event.ID] ? 'Cancelling…' : 'Cancel'}
                                </span>
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            {event.is_paid ? (
                              <button
                                onClick={() => handlePurchaseTicket(event.ID, false)}
                                disabled={actionLoading[event.ID]}
                                className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-50"
                              >
                                <TicketIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                                <span className="text-[10px] text-purple-700 dark:text-purple-400 font-medium text-center leading-tight">
                                  {actionLoading[event.ID] ? 'Booking…' : isEarlyBird ? 'Early Bird' : 'Book Ticket'}
                                </span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRSVP(event.ID)}
                                disabled={actionLoading[event.ID]}
                                className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50"
                              >
                                <TicketIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
                                <span className="text-[10px] text-green-700 dark:text-green-400 font-medium">
                                  {actionLoading[event.ID] ? 'Booking…' : 'Book Free'}
                                </span>
                              </button>
                            )}
                            <CalendarDropdown event={event} roomUrl={roomUrl} large />
                          </>
                        )}
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
        {currentTab === 'calendar' && (
          <div>
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => navigateCalendarMonth(-1)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
              >
                ‹
              </button>
              <span className="text-sm font-semibold text-gray-800 dark:text-white">{calendarMonthLabel}</span>
              <button
                onClick={() => navigateCalendarMonth(1)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
              >
                ›
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 text-center mb-1">
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                <div key={d} className="text-[10px] font-medium text-gray-400 dark:text-gray-500 py-1">{d}</div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dayEvents = eventsByDay[day] || [];
                const isToday =
                  new Date().getDate() === day &&
                  new Date().getMonth() === calendarMonth &&
                  new Date().getFullYear() === calendarYear;
                const isSelected = selectedCalendarDay === day;
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedCalendarDay(isSelected ? null : day)}
                    className={`flex flex-col items-center justify-start pt-1 pb-0.5 rounded-lg text-xs transition-all min-h-[36px] ${
                      isSelected
                        ? 'bg-purple-600 text-white'
                        : isToday
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 font-bold'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <span>{day}</span>
                    {dayEvents.length > 0 && (
                      <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isSelected ? 'bg-white' : 'bg-purple-500'}`} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected day events */}
            {selectedCalendarDay !== null && (
              <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">
                {(eventsByDay[selectedCalendarDay] || []).length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                    No events on {new Date(calendarYear, calendarMonth, selectedCalendarDay).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(eventsByDay[selectedCalendarDay] || []).map(ev => (
                      <div key={ev.ID} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                        <span className="text-base">{ev.watch_type === '3d_cinema' ? '🎬' : ev.watch_type === 'classroom' ? '🎓' : '📺'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 dark:text-white truncate">{ev.title}</p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400">
                            {new Date(ev.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                            {ev.recurrence_type && ev.recurrence_type !== 'none' && (
                              <span className="ml-1 text-purple-500">↻</span>
                            )}
                          </p>
                        </div>
                        {ev.is_paid && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 flex-shrink-0">Paid</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {loadingEvents && (
              <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-3">Loading events…</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScheduleEventModal;