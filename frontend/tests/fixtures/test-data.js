/**
 * Test Data Fixtures for WeWatch E2E Tests
 * 
 * Contains reusable test data for:
 * - User credentials
 * - Session data
 * - Payment test cards
 * - Media files
 */

export const testUsers = {
  host: {
    email: 'testhost1@example.com',
    username: 'testhost1',
    password: 'Test1234!',
    dateOfBirth: '1990-01-01',
  },
  
  viewer: {
    email: 'testviewer1@example.com',
    username: 'testviewer1',
    password: 'Test1234!',
    dateOfBirth: '1995-05-15',
  },
  
  underage: {
    email: 'kiduser@example.com',
    username: 'kiduser',
    password: 'Test1234!',
    dateOfBirth: '2015-01-01', // Under 13
  },
};

export const sessionData = {
  freeMovieNight: {
    sessionType: 'Instant Watch',
    classType: 'Movie Night',
    pricing: 'Free',
    contentRating: 'PG',
  },
  
  paidWatchParty: {
    sessionType: 'Instant Watch',
    classType: 'Watch Party',
    pricing: 'Paid',
    ticketPrice: 500,
    capacity: 50,
    contentRating: '13+',
  },
  
  lectureHall: {
    sessionType: 'Instant Watch',
    classType: 'Classroom',
    lectureType: 'Lecture Hall',
    capacity: 100,
    contentRating: 'G',
  },
  
  scheduledEvent: {
    sessionType: 'Scheduled Event',
    classType: 'Watch Party',
    pricing: 'Paid',
    ticketPrice: 1000,
    capacity: 200,
    contentRating: '18+',
    eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
  },
};

export const liveShareModes = {
  podcast: {
    mode: 'Podcast',
    type: 'Camera Only',
    layout: 'Interview 50/50',
  },
  
  news: {
    mode: 'News',
    type: 'Camera Only',
    layout: 'News Anchor',
  },
  
  show: {
    mode: 'Show',
    type: 'Both (Screen + Camera)',
    layout: 'Panel + Screen',
  },
  
  regular: {
    mode: 'Regular',
    type: 'Screen Only',
    layout: 'Screen + PiP',
  },
};

export const paystackTestCards = {
  success: {
    cardNumber: '4084084084084081',
    cvv: '408',
    expiryMonth: '12',
    expiryYear: '2030',
    pin: '0000',
  },
  
  declined: {
    cardNumber: '4084084084084084',
    cvv: '408',
    expiryMonth: '12',
    expiryYear: '2030',
    pin: '0000',
  },
  
  insufficientFunds: {
    cardNumber: '5060666666666666666',
    cvv: '123',
    expiryMonth: '12',
    expiryYear: '2030',
    pin: '0000',
  },
};

export const mediaFiles = {
  // Small test video (10MB)
  smallVideo: {
    path: 'fixtures/sample-video-10mb.mp4',
    size: 10 * 1024 * 1024,
    duration: 30, // seconds
  },
  
  // Medium test video (100MB)
  mediumVideo: {
    path: 'fixtures/sample-video-100mb.mp4',
    size: 100 * 1024 * 1024,
    duration: 300, // 5 minutes
  },
  
  // Large test video (500MB)
  largeVideo: {
    path: 'fixtures/sample-video-500mb.mp4',
    size: 500 * 1024 * 1024,
    duration: 1800, // 30 minutes
  },
  
  // Invalid file (text file)
  invalidFile: {
    path: 'fixtures/sample.txt',
    content: 'This is not a video file',
  },
};

export const contentRatings = ['G', 'PG', '13+', '16+', '18+', 'Mature'];

export const apiEndpoints = {
  auth: {
    register: '/api/auth/register',
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    googleLogin: '/api/auth/google/login',
    googleCallback: '/api/auth/google/callback',
  },
  
  sessions: {
    create: '/api/rooms',
    join: '/api/rooms/:id/join',
    end: '/api/rooms/:id/end',
    list: '/api/rooms',
  },
  
  payments: {
    initialize: '/api/payments/initialize',
    verify: '/api/payments/verify/:reference',
    webhook: '/api/payments/webhook',
  },
  
  upload: {
    chunked: '/api/upload/chunk',
    complete: '/api/upload/complete',
  },
  
  websocket: '/ws',
};

export const websocketEvents = {
  // Lobby events
  LOBBY_CONNECTED: 'lobby_connected',
  SESSION_STARTED: 'session_started',
  SESSION_ENDED: 'session_ended',
  
  // Session events
  ROOM_JOINED: 'room_joined',
  ROOM_LEFT: 'room_left',
  MESSAGE_RECEIVED: 'message_received',
  LIKE_BROADCAST: 'like_broadcast',
  
  // LiveShare events
  LIVESHARE_STARTED: 'liveshare_started',
  LIVESHARE_ENDED: 'liveshare_ended',
  LIVESHARE_GRAPHICS_UPDATE: 'liveshare_graphics_update',
  GUEST_PERMISSION_GRANTED: 'guest_permission_granted',
};

export const waitTimes = {
  short: 1000,      // 1 second
  medium: 3000,     // 3 seconds
  long: 5000,       // 5 seconds
  upload: 30000,    // 30 seconds
  payment: 60000,   // 1 minute
};
