import axios from "axios";

// Smart API URL detection: automatically choose backend based on how frontend is accessed
const getApiBaseUrl = () => {
  const currentHostname = window.location.hostname;
  
  // If accessed via Cloudflare Tunnel, use Cloudflare backend
  if (currentHostname.includes('trycloudflare.com')) {
    const cloudflareBackendUrl = import.meta.env.VITE_CLOUDFLARE_BACKEND_URL;
    console.log('☁️ [API Config] Detected Cloudflare Tunnel access, using Cloudflare backend:', cloudflareBackendUrl);
    return cloudflareBackendUrl;
  }
  
  // If accessed via localtunnel, use localtunnel backend
  if (currentHostname.includes('loca.lt')) {
    const localtunnelBackendUrl = import.meta.env.VITE_LOCALTUNNEL_BACKEND_URL || window.location.origin;
    console.log('🔗 [API Config] Detected localtunnel access, using localtunnel backend:', localtunnelBackendUrl);
    return localtunnelBackendUrl;
  }
  
  // Otherwise, use localhost backend (or configured URL)
  const localBackendUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
  console.log('🏠 [API Config] Detected localhost access, using local backend:', localBackendUrl);
  return localBackendUrl;
};

const API_BASE_URL = getApiBaseUrl();
const isDevelopment = import.meta.env.DEV;
const currentHostname = window.location.hostname;

// Debug log to check what API_BASE_URL is being used
console.log('🔧 [API Config] VITE_API_BASE_URL from env:', import.meta.env.VITE_API_BASE_URL);
console.log('🔧 [API Config] VITE_CLOUDFLARE_BACKEND_URL from env:', import.meta.env.VITE_CLOUDFLARE_BACKEND_URL);
console.log('🔧 [API Config] Final API_BASE_URL:', API_BASE_URL);
console.log('🔧 [API Config] Current origin:', window.location.origin);

// Helper for conditional logging (only in development)
const devLog = (...args) => {
  if (isDevelopment) {
    console.log(...args);
  }
};

// Smart header configuration - only add Cloudflare header when using Cloudflare Tunnel
const getDefaultHeaders = () => {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  // Only add Cloudflare header when actually using Cloudflare Tunnel
  if (currentHostname.includes('trycloudflare.com')) {
    headers['CF-Access-Client-Id'] = 'wewatch-app';
  }
  
  return headers;
};

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000, // 30 seconds for preview generation (FFmpeg takes 10-15s)
    withCredentials: true,
    headers: getDefaultHeaders(),
});




/**
 * Send a reaction to a room
 * @param {string|number} roomId - The ID of the room
 * @param {string} emoji - The emoji to send
 * @returns {Promise<Object>} Promise that resolves to the reaction data
 */
export const sendReaction = async (roomId, emoji) => {
  try {
    console.log(`sendReaction: Sending reaction ${emoji} to room ${roomId}`);
    
    const response = await apiClient.post(`/api/rooms/${roomId}/reactions`, {
      emoji: emoji
    });
    
    console.log(`sendReaction: Response received for room ${roomId}:`, response.data);
    
    return response.data;
  } catch (error) {
    console.error('API Error (sendReaction):', error);
    if (error.response) {
      // Server responded with error status (4xx, 5xx)
      throw new Error(`Failed to send reaction: ${error.response.data.error || error.response.statusText}`);
    } else if (error.request) {
      // Request was made but no response received (network issue)
      throw new Error('Network error. Please check your connection.');
    } else {
      // Something else happened in setting up the request
      throw new Error('An unexpected error occurred while sending reaction.');
    }
  }
};

// --- NEW: Get Reactions (optional) ---
export const getReactions = async (roomId) => {
  try {
    console.log(`getReactions: Fetching reactions for room ${roomId}`);
    
    const response = await apiClient.get(`/api/rooms/${roomId}/reactions`);
    console.log(`getReactions: Response received for room ${roomId}:`, response.data);
    
    return response.data;
  } catch (error) {
    console.error('API Error (getReactions):', error);
    if (error.response) {
      throw new Error(`Failed to fetch reactions: ${error.response.data.error || error.response.statusText}`);
    } else if (error.request) {
      throw new Error('Network error. Please check your connection.');
    } else {
      throw new Error('An unexpected error occurred while fetching reactions.');
    }
  }
};





// --- Response Interceptor ---
// Runs after each response is recieved success/error
apiClient.interceptors.response.use(
    (response) => {
        // Debug: Log CORS headers in development
        if (isDevelopment && response.config.url?.includes('/auth/')) {
            console.log('🔍 CORS Headers for', response.config.url, {
                origin: response.headers['access-control-allow-origin'],
                credentials: response.headers['access-control-allow-credentials']
            });
        }
        return response;
    },
    (error) => {
        // Only log unexpected errors (not 404 for unimplemented features)
        if (error.response?.status === 401) {
            // Clear the token from storage
            localStorage.removeItem('wewatch_token');
        } else if (error.response?.status !== 404 && error.response?.status !== 400) {
            console.error('API Error:', error.response?.data?.error || error.message);
        }
        return Promise.reject(error)
    }
);

// --- Admin API Calls ---
/**
 * Get pending withdrawal requests (admin only)
 * @returns {Promise} Axios promise resolving to pending payouts
 */
export const getAdminPendingPayouts = async () => {
    try {
        const response = await apiClient.get('/api/admin/payouts/pending');
        return response.data;
    } catch (error) {
        console.error('API Error (getAdminPendingPayouts):', error);
        throw error;
    }
};

/**
 * Approve a pending withdrawal (admin only)
 * @param {number} payoutId - The payout ID to approve
 * @returns {Promise} Axios promise resolving to approval result
 */
export const approveAdminPayout = async (payoutId) => {
    try {
        const response = await apiClient.post(`/api/admin/payouts/${payoutId}/process`);
        return response.data;
    } catch (error) {
        console.error('API Error (approveAdminPayout):', error);
        throw error;
    }
};

/**
 * Reject a pending withdrawal (admin only)
 * @param {number} payoutId - The payout ID to reject
 * @param {string} reason - Rejection reason
 * @returns {Promise} Axios promise resolving to rejection result
 */
export const rejectAdminPayout = async (payoutId, reason) => {
    try {
        const response = await apiClient.post(`/api/admin/payouts/${payoutId}/reject`, { reason });
        return response.data;
    } catch (error) {
        console.error('API Error (rejectAdminPayout):', error);
        throw error;
    }
};

/**
 * Get all processing payouts (admin only) - for manual completion workflow
 * @returns {Promise} Axios promise resolving to list of processing payouts
 */
export const getAdminProcessingPayouts = async () => {
    try {
        const response = await apiClient.get('/api/admin/payouts/processing');
        return response.data;
    } catch (error) {
        console.error('API Error (getAdminProcessingPayouts):', error);
        throw error;
    }
};

/**
 * Mark a processing payout as completed (admin only) - after manual transfer via Paystack dashboard
 * @param {number} payoutId - The payout ID to mark as completed
 * @param {string} transferReference - Optional Paystack transfer reference/code
 * @param {string} notes - Optional admin notes
 * @returns {Promise} Axios promise resolving to completion result
 */
export const completeAdminPayout = async (payoutId, transferReference = null, notes = null) => {
    try {
        const response = await apiClient.post(`/api/admin/payouts/${payoutId}/complete`, {
            transfer_reference: transferReference,
            notes: notes
        });
        return response.data;
    } catch (error) {
        console.error('API Error (completeAdminPayout):', error);
        throw error;
    }
};

// --- Authentication API Calls ---
/**
 * Register a new user
 * @param {Object} userData -Object containing username, email, password
 * @returns {Promise} Axios promise reso;ving to the response
 */

export const registerUser = async (userData) => {
    try {
        const response = await apiClient.post('/api/auth/register', userData);
        return response.data;
    } catch (error) {
        console.error('Error registering user:', error);
        throw error;
    }
};

// Delete room
export const deleteRoom = async (roomId) => {
  try {
    console.log(`Deleting room ${roomId}...`);
    const response = await apiClient.delete(`/api/rooms/${roomId}`);
    console.log(`Room ${roomId} deleted successfully`);
    return response.data;
  } catch (error) {
    console.error('API Error (deleteRoom):', error);
    throw error;
  }
};

/**
 * Login a user
 * @param {Object} credentials - Object containing email and password
 * @returns {Promise} Axios promise resolving to the response
 */

export const loginUser = async (credentials) => {
    try {
        const response = await apiClient.post('/api/auth/login', credentials);
        return response.data;
    } catch (error) {
        console.error('Error logging in user:', error);
        throw error;
    }
};

/**
 * Get the current user's profile (requires authentication)
 * @returns {Promise} Axios promise resolving to the response
 */

export const getCurrentUser = async () => {
    try {
        const response = await apiClient.get('/api/auth/me');
        return response.data;
    } catch (error) {
        console.error('Error fetching current user:', error);
        throw error;
    }
};


// --- Room API Calls ---

/**
 * Create a new room
 * @param {Object} roomData - Object containing name and description
 * @returns {Promise} Axios promise resolving to the response
 */

export const createRoom = async (roomData) => {
    try {
        // Ensure the token is included via the apiClient's request interceptor
        const response = await apiClient.post('/api/rooms', roomData);
        return response.data;
    } catch (error) {
        // Handle specific errors or re-throw
        console.error(`Error creating room (api.js):`, error);
        throw error;
    }
};

/**
 * Get a list of rooms
 * @returns {Promise} Axios promise resolving to the response
 */
export const getRooms = async () => {
    try {
        const response = await apiClient.get('/api/rooms');
        console.log('API Response (getRooms):', response.data);
        return response.data;
    } catch (error) {
        console.error('Error fetching rooms (api.js):', error);
        console.error('Error details:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            message: error.message
        });
        throw error;
    }
};

/**
 * Get details of a specific room by ID
 * @param {string|number} roomid
 * @returns {Promise} Axios promise resolving to the response
 */
export const getRoom = async(roomId) => {
    try {
        const response = await apiClient.get(`/api/rooms/${roomId}`);
        return response.data;
    } catch (error) {
        console.error(`Error fetching room ${roomId} (api.js):`, error);
        throw error;
    }
};

// For the Room Overrides
export const updateRoomOverrides = async (roomId, overrides) => {
  try {
    console.log(`Updating overrides for room ${roomId}:`, overrides);
    const response = await apiClient.put(`/api/rooms/${roomId}/overrides`, overrides);
    console.log(`Room overrides updated successfully for room ${roomId}`);
    return response.data;
  } catch (error) {
    console.error('API Error (updateRoomOverrides):', error);
    throw error;
  }
};


export const updateMediaOrder = async (roomId, orderUpdates) => {
  try {
    console.log(`Updating media order for room ${roomId}:`, orderUpdates);
    const response = await apiClient.put(`/api/rooms/${roomId}/media/order`, orderUpdates);
    console.log(`Media order updated successfully for room ${roomId}`);
    return response.data;
  } catch (error) {
    console.error('API Error (updateMediaOrder):', error);
    throw error;
  }
};

// Loop Mode
export const updateRoomLoopMode = async (roomId, loopMode) => {
  try {
    console.log(`Updating loop mode for room ${roomId}:`, loopMode);
    const response = await apiClient.put(`/api/rooms/${roomId}/loop-mode`, { loop_mode: loopMode });
    console.log(`Loop mode updated successfully for room ${roomId}`);
    return response.data;
  } catch (error) {
    console.error('API Error (updateRoomLoopMode):', error);
    throw error;
  }
};


/**
 * Fetch media items for a specific room
 * @param {string|number} roomId - The ID of the room
 * @returns {Promise} Axios promise resolving to the response data (array of media items)
 */
export const getMediaItemsForRoom = async (roomId) => {
    try {
        const response = await apiClient.get(`/api/rooms/${roomId}/media`);
        console.log('API Response (getMediaItemsForRoom):', response.data);
        return response.data.media_items || response.data || [];
    } catch (error) {
        console.error('API Error (getMediaItemsForRoom):', error);
        throw error;
    }
};

// Delete a chat message
export const deleteChatMessage = async (roomId, messageId) => {
  console.log(`➡️ DELETE /api/rooms/${roomId}/chat/${messageId}`);
  try {
    const response = await apiClient.delete(`/api/rooms/${roomId}/chat/${messageId}`);
    return response.data;
  } catch (error) {
    console.error("API delete request failed:", error);
    throw error;
  }
};

// Delete a room message (persistent room chat)
export const deleteRoomMessage = async (roomId, messageId) => {
  console.log(`➡️ DELETE /api/rooms/${roomId}/messages/${messageId}`);
  try {
    const response = await apiClient.delete(`/api/rooms/${roomId}/messages/${messageId}`);
    return response.data;
  } catch (error) {
    console.error("API delete request failed:", error);
    throw error;
  }
};

// Edit a chat message
export const editChatMessage = async (roomId, messageId, newMessage) => {
  console.log(`➡️ PUT /api/rooms/${roomId}/chat/${messageId}`);
  try {
    const response = await apiClient.put(`/api/rooms/${roomId}/chat/${messageId}`, {
      message: newMessage
    });
    return response.data;
  } catch (error) {
    console.error("API edit request failed:", error);
    throw error;
  }
};

// Edit a room message (persistent room chat)
export const editRoomMessage = async (roomId, messageId, newMessage) => {
  console.log(`➡️ PUT /api/rooms/${roomId}/messages/${messageId}`);
  try {
    const response = await apiClient.put(`/api/rooms/${roomId}/messages/${messageId}`, {
      message: newMessage
    });
    return response.data;
  } catch (error) {
    console.error("API edit request failed:", error);
    throw error;
  }
};

// Get chat history for a room/session
export const getChatHistory = async (roomId, sessionId = null) => {
  try {
    const url = sessionId 
      ? `/api/rooms/${roomId}/chat/history?session_id=${sessionId}`
      : `/api/rooms/${roomId}/chat/history`;
    console.log(`➡️ GET ${url}`);
    const response = await apiClient.get(url);
    return response.data;
  } catch (error) {
    console.error('API Error (getChatHistory):', error);
    throw error;
  }
};

// Create a scheduled event
export const createScheduledEvent = async (roomId, eventData) => {
  try {
    const response = await apiClient.post(`/api/rooms/${roomId}/scheduled-events`, eventData);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Get scheduled events for a room
export const getScheduledEvents = async (roomId) => {
  try {
    const response = await apiClient.get(`/api/rooms/${roomId}/scheduled-events`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// ✅ Get active sessions with pagination (for lobby infinite scroll)
export const getActiveSessions = async (limit = 10, offset = 0) => {
  try {
    const response = await apiClient.get(`/api/sessions/active?limit=${limit}&offset=${offset}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// ✅ Get scheduled events with trailers (for lobby "Watching Now")
export const getScheduledEventsWithTrailers = async (limit = 10, offset = 0) => {
  try {
    const response = await apiClient.get(`/api/scheduled-events/with-trailers?limit=${limit}&offset=${offset}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Delete a scheduled event
export const deleteScheduledEvent = async (eventId) => {
  try {
    const response = await apiClient.delete(`/api/scheduled-events/${eventId}`);
    return response.data
  } catch (error) {
    throw error;
  }
};

// Update a scheduled event
export const updateScheduledEvent = async (eventId, eventData) => {
  try {
    const response = await apiClient.put(`/api/scheduled-events/${eventId}`, eventData);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Download iCal file
export const downloadICal = async (eventId) => {
  try {
    const response = await apiClient.get(`/api/scheduled-events/${eventId}/ical`, {
      responseType: 'blob', // Important for file download
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// ✅ RSVP & Ticketing APIs
export const createFreeRSVP = async (eventId) => {
  try {
    const response = await apiClient.post(`/api/scheduled-events/${eventId}/rsvp`, {
      scheduled_event_id: eventId
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const cancelRSVP = async (eventId) => {
  try {
    const response = await apiClient.delete(`/api/scheduled-events/${eventId}/rsvp`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const purchaseEventTicket = async (eventId, isGift = false, recipientUserId = null) => {
  try {
    const response = await apiClient.post(`/api/scheduled-events/${eventId}/purchase-ticket`, {
      scheduled_event_id: eventId,
      is_gift: isGift,
      recipient_user_id: recipientUserId
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};



// Add this function to your api.js file
export const joinRoom = async (roomId) => {
  try {
    console.log(`joinRoom: Joining room ${roomId}`);
    
    const response = await apiClient.post(`/api/rooms/${roomId}/join`);
    console.log(`joinRoom: Response received for room ${roomId}:`, response.data);
    
    return response.data;
  } catch (error) {
    console.error('API Error (joinRoom):', error);
    if (error.response) {
      // Server responded with error status (4xx, 5xx)
      throw new Error(`Failed to join room: ${error.response.data.error || error.response.statusText}`);
    } else if (error.request) {
      // Request was made but no response received (network issue)
      throw new Error('Network error. Please check your connection.');
    } else {
      // Something else happened in setting up the request
      throw new Error('An unexpected error occurred while joining room.');
    }
  }
};

/**
 * Fetches the list of temporary media items for a specific room
 * @param {string|number} roomId - The ID of the room
 * @returns {Promise} Axios promise resolving to the response data (array of temporary media items)
 */
export const getTemporaryMediaItemsForRoom = async (roomId) => {
    try {
        console.log(`📥 API: Fetching temporary media items for room ${roomId}`);
        const response = await apiClient.get(`/api/rooms/${roomId}/temporary-media`);
        console.log(`📥 API Response (getTemporaryMediaItemsForRoom):`, response.data);
        // Ensure it always returns an array, even if empty
        return response.data.temporary_media_items || response.data || [];
    } catch (error) {
        console.error('API Error (getTemporaryMediaItemsForRoom):', error);
        throw error;
    }
};

/**
 * ✅ NEW: Fetches the list of temporary media items for a specific session (not room)
 * @param {string} sessionId - The session ID (UUID string)
 * @returns {Promise} Axios promise resolving to the response data (array of temporary media items with poster_url)
 */
export const getSessionTemporaryMedia = async (sessionId) => {
    try {
        console.log(`📥 API: Fetching temporary media items for session ${sessionId}`);
        const response = await apiClient.get(`/api/sessions/${sessionId}/temporary-media`);
        console.log(`📥 API Response (getSessionTemporaryMedia):`, response.data);
        // Ensure it always returns an array, even if empty
        return response.data.temporary_media_items || response.data || [];
    } catch (error) {
        console.error('API Error (getSessionTemporaryMedia):', error);
        throw error;
    }
};

/**
 * Deletes all temporary media items for a specific room (Host only)
 * @param {string|number} roomId - The ID of the room
 * @returns {Promise} Axios promise resolving to the response data
 */
export const deleteTemporaryMediaItemsForRoom = async (roomId) => {
    try {
        console.log(`🗑️ API: Deleting temporary media items for room ${roomId}`);
        const response = await apiClient.delete(`/api/rooms/${roomId}/temporary-media`);
        console.log(`🗑️ API Response (deleteTemporaryMediaItemsForRoom):`, response.data);
        return response.data;
    } catch (error) {
        console.error('API Error (deleteTemporaryMediaItemsForRoom):', error);
        throw error;
    }
};



/**
 * Fetches the list of members in a specific room
 * @param {string|number} roomId - The ID of the room
 * @returns {Promise<Object>} Promise that resolves to the members data
 */
export const getRoomMembers = async (roomId) => {
    try {
        console.log(`getRoomMembers: Fetching members for room ${roomId}`);
        const response = await apiClient.get(`/api/rooms/${roomId}/members`);
        console.log(`getRoomMembers: Response received for room ${roomId}:`, response.data);
    
        return response.data;
    } catch (error) {
        console.error('API Error (getRoomMembers):', error);
        if (error.response) {
            throw new Error(`Failed to fetch room members: ${error.response.data.error || error.response.statusText}`);
        } else if (error.request) {
            throw new Error('Network error. Please check your connection.');
        }  else {
            throw new Error('An Unexpected error occurred while fetching room members.');
        }
    }
};


/**
 * Uploads a media file to a specific room
 * @param {string|number} roomId - The ID of the room
 * @param {File} file - The File object to upload
 * @param {Function} [onUploadProgressCallback] - Optional callback for upload progress updates
 * @param {boolean} isTemporary - Whether to upload as temporary (default: false)
 * @returns {Promise} Axios promise resolving to the response data (details of the created media item)
 */

// Delete a single temporary media item
export const deleteSingleTemporaryMediaItem = async (roomId, itemId) => {
  try {
    console.log(`🗑️ Deleting temporary media item ${itemId} in room ${roomId}`);
    const response = await apiClient.delete(`/api/rooms/${roomId}/temporary-media/${itemId}`);
    return response.data;
  } catch (error) {
    console.error('API Error (deleteSingleTemporaryMediaItem):', error);
    throw error;
  }
};


/**
 * Creates a new watch session for a room (host-only)
 * @param {string|number} roomId 
 * @param {string} watchType - "video" or "3d_cinema"
 * @returns {Promise<AxiosResponse>}
 */
export const createWatchSessionForRoom = (roomId, watchType = 'video') => {
  return apiClient.post(`/api/rooms/${roomId}/watch-session`, { watch_type: watchType });
};


/**
 * Fetches the active watch session for a room (if any)
 * @param {string|number} roomId 
 * @returns {Promise<AxiosResponse>}
 */
export const getActiveSession = (roomId) => {
  return apiClient.get(`/api/rooms/${roomId}/active-session`);
};

/**
 * End a watch session (host only)
 * @param {string|number} roomId - The ID of the room
 * @param {string} sessionId - The session ID to end
 * @returns {Promise} Axios promise resolving to the response
 */
export const endWatchSession = async (roomId, sessionId) => {
  try {
    console.log(`Ending watch session ${sessionId} in room ${roomId}...`);
    const response = await apiClient.post(`/api/rooms/${roomId}/sessions/${sessionId}/end`);
    console.log(`Session ${sessionId} ended successfully`);
    return response.data;
  } catch (error) {
    console.error('API Error (endWatchSession):', error);
    throw error;
  }
};

export const uploadMediaToRoom = async (roomId, file, onUploadProgressCallback, isTemporary = false, sessionId = null, abortSignal = null) => {
  const uploadStartTime = Date.now();
  let lastProgressTime = uploadStartTime;
  let lastProgressPercent = 0;
  let lastLoadedBytes = 0;
  
  try {
    // 🔍 DEBUG: File details
    console.log(`📤 [UPLOAD START] Room: ${roomId}, File: ${file.name}`);
    console.log(`📊 [FILE INFO] Size: ${(file.size / 1024 / 1024).toFixed(2)}MB, Type: ${file.type}`);
    console.log(`⚙️ [UPLOAD CONFIG] Temporary: ${isTemporary}, Session: ${sessionId}`);
    console.log(`🌐 [NETWORK] Online: ${navigator.onLine}, Connection: ${navigator.connection?.effectiveType || 'unknown'}`);

    // --- CRUCIAL: Use FormData for file uploads ---
    const formData = new FormData();
    formData.append('mediaFile', file); // Key must match c.FormFile("mediaFile") in Go
    console.log(`📦 [FORMDATA] Created with mediaFile field`);

    // --- OPTION: Configure the request ---
    const config = {
      headers: {
        'Content-Type': 'multipart/form-data', // Force Axios to auto-set correct Content-Type
      },
      // --- ✅ INCREASE TIMEOUT FOR LARGE FILES ---
      timeout: 600000, // 10 minutes (600 seconds) - for 500MB uploads on slow connections
      
      // ✅ Add cancel support
      signal: abortSignal,

      // Add onUploadProgress to THIS EXISTING config object
      // onUploadProgress: (progressEvent) => { ... } // ← WILL BE ADDED BELOW
    };

    // --- ADD onUploadProgress to the EXISTING config object ---
    // Check if a callback function was provided
    if (typeof onUploadProgressCallback === 'function') {
      // Add the onUploadProgress property to the config object
      config.onUploadProgress = (progressEvent) => { // ← ADD PROPERTY TO EXISTING 'config'
        // Check if the progress event is computable
        if (progressEvent && progressEvent.lengthComputable) {
          const now = Date.now();
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          const elapsedSeconds = (now - uploadStartTime) / 1000;
          const timeSinceLastProgress = now - lastProgressTime;
          
          // Calculate instantaneous speed (bytes since last update / time elapsed)
          const bytesSinceLastUpdate = progressEvent.loaded - lastLoadedBytes;
          const instantSpeed = bytesSinceLastUpdate / (timeSinceLastProgress / 1000) / 1024 / 1024; // MB/s
          
          // Calculate average speed
          const avgSpeed = progressEvent.loaded / 1024 / 1024 / (elapsedSeconds || 1); // MB/s
          
          // Calculate ETA based on average speed
          const remainingBytes = progressEvent.total - progressEvent.loaded;
          const etaSeconds = remainingBytes / (avgSpeed * 1024 * 1024);
          
          // 🔍 DEBUG: Enhanced progress logging
          console.log(`📊 [PROGRESS ${percentCompleted}%] Loaded: ${(progressEvent.loaded / 1024 / 1024).toFixed(2)}MB / ${(progressEvent.total / 1024 / 1024).toFixed(2)}MB`);
          console.log(`⏱️ [TIMING] Elapsed: ${elapsedSeconds.toFixed(1)}s, Speed: ${avgSpeed.toFixed(2)}MB/s, ETA: ${etaSeconds.toFixed(0)}s`);
          
          // Detect stalls (no progress for 30+ seconds)
          if (percentCompleted === lastProgressPercent && timeSinceLastProgress > 30000) {
            console.warn(`⚠️ [STALL DETECTED] No progress for ${(timeSinceLastProgress / 1000).toFixed(1)}s at ${percentCompleted}%`);
          }
          
          lastProgressTime = now;
          lastProgressPercent = percentCompleted;
          lastLoadedBytes = progressEvent.loaded;
          
          // Call the provided callback function with enhanced data
          onUploadProgressCallback({
            percent: percentCompleted,
            loaded: progressEvent.loaded,
            total: progressEvent.total,
            speed: avgSpeed,
            eta: etaSeconds
          });
        }
      };
    }
    // --- --- ---

    // --- ADD LOGIC FOR isTemporary FLAG AND session_id ---
    // Construct the URL based on the isTemporary flag
    let uploadUrl = `/api/rooms/${roomId}/upload`;
    const queryParams = [];
    
    if (isTemporary) {
      queryParams.push('temporary=true');
      console.log(`🏷️ [MODE] Uploading as TEMPORARY media`);
      
      // ✅ Add session_id for temporary uploads
      if (sessionId) {
        queryParams.push(`session_id=${encodeURIComponent(sessionId)}`);
        console.log(`🔗 [SESSION] Linking to session ${sessionId}`);
      }
    } else {
      console.log(`🏷️ [MODE] Uploading as PERMANENT media`);
    }
    
    if (queryParams.length > 0) {
      uploadUrl += '?' + queryParams.join('&');
    }
    console.log(`🎯 [URL] ${API_BASE_URL}${uploadUrl}`);
    // --- --- ---

    console.log(`🚀 [REQUEST START] Sending POST request at ${new Date().toISOString()}`);
    const response = await apiClient.post(uploadUrl, formData, config); // ✅ PASS UPDATED CONFIG
    
    const uploadDuration = ((Date.now() - uploadStartTime) / 1000).toFixed(1);
    console.log(`✅ [SUCCESS] Upload completed in ${uploadDuration}s`);
    console.log(`📥 [RESPONSE] Status: ${response.status}, Data:`, response.data);

    return response.data;
  } catch (error) {
    const uploadDuration = ((Date.now() - uploadStartTime) / 1000).toFixed(1);
    
    // 🔍 DEBUG: Detailed error logging
    console.error(`❌ [UPLOAD FAILED] After ${uploadDuration}s at ${lastProgressPercent}%`);
    console.error(`🔍 [ERROR TYPE] ${error.name}: ${error.message}`);
    console.error(`📡 [ERROR CODE] ${error.code}`);
    console.error(`🌐 [NETWORK STATE] Online: ${navigator.onLine}`);
    
    if (error.response) {
      console.error(`📥 [SERVER RESPONSE] Status: ${error.response.status}, Data:`, error.response.data);
    } else if (error.request) {
      console.error(`📤 [NO RESPONSE] Request sent but no response received`);
      console.error(`🔍 [REQUEST STATE] ReadyState: ${error.request.readyState}, Status: ${error.request.status}`);
    } else {
      console.error(`⚙️ [CONFIG ERROR] Failed to setup request:`, error.message);
    }
    
    console.error('📋 [FULL ERROR]', error);
    throw error;
  }
};

// --- RoomTV Content API ---
export const getRoomTVContent = async (roomId) => {
  try {
    const response = await apiClient.get(`/api/rooms/${roomId}/tv-content`);
    return response.data;
  } catch (error) {
    console.error('API Error (getRoomTVContent):', error);
    throw error;
  }
};

export const createRoomTVContent = async (roomId, contentData) => {
  try {
    const response = await apiClient.post(`/api/rooms/${roomId}/tv-content`, contentData);
    return response.data;
  } catch (error) {
    console.error('API Error (createRoomTVContent):', error);
    throw error;
  }
};

export const deleteRoomTVContent = async (roomId, contentId) => {
  try {
    const response = await apiClient.delete(`/api/rooms/${roomId}/tv-content/${contentId}`);
    return response.data;
  } catch (error) {
    console.error('API Error (deleteRoomTVContent):', error);
    throw error;
  }
};

// Upload video file for RoomTV (100MB max, 10min max)
export const uploadTVContentVideo = async (roomId, formData, onProgress) => {
  try {
    const response = await apiClient.post(
      `/api/rooms/${roomId}/tv-content/upload`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            if (onProgress) {
              onProgress(percentCompleted);
            }
          }
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('API Error (uploadTVContentVideo):', error);
    throw error;
  }
};

// Mark video as completed (triggers event-driven deletion)
export const markTVContentCompleted = async (roomId, contentId) => {
  try {
    const response = await apiClient.post(`/api/rooms/${roomId}/tv-content/${contentId}/complete`);
    return response.data;
  } catch (error) {
    console.error('API Error (markTVContentCompleted):', error);
    throw error;
  }
};

// ✅ Verify if a session still exists and is active
export const verifySessionExists = async (sessionId) => {
  try {
    // Try to fetch active sessions and check if this one exists
    const response = await apiClient.get('/api/sessions/active');
    const sessions = response.data.sessions || [];
    
    // Check if the session_id exists in the active sessions list
    const sessionExists = sessions.some(s => s.session_id === sessionId);
    
    return { exists: sessionExists };
  } catch (error) {
    console.error('API Error (verifySessionExists):', error);
    // If API fails, assume session doesn't exist to be safe
    return { exists: false };
  }
};

// ✅ Room invitation APIs
export const createRoomInviteLink = async (roomId, expiresInHours = null) => {
  try {
    const response = await apiClient.post(`/api/rooms/${roomId}/invites/link`, {
      expires_in_hours: expiresInHours
    });
    return response.data;
  } catch (error) {
    console.error('API Error (createRoomInviteLink):', error);
    throw error;
  }
};

export const acceptInviteByToken = async (token) => {
  try {
    const response = await apiClient.post(`/api/invites/${token}/accept`);
    return response.data;
  } catch (error) {
    console.error('API Error (acceptInviteByToken):', error);
    throw error;
  }
};

export const getRoomInvites = async (roomId) => {
  try {
    const response = await apiClient.get(`/api/rooms/${roomId}/invites`);
    return response.data;
  } catch (error) {
    console.error('API Error (getRoomInvites):', error);
    throw error;
  }
};

export const revokeRoomInvite = async (roomId, inviteId) => {
  try {
    const response = await apiClient.delete(`/api/rooms/${roomId}/invites/${inviteId}`);
    return response.data;
  } catch (error) {
    console.error('API Error (revokeRoomInvite):', error);
    throw error;
  }
};

export const checkRoomAccess = async (roomId) => {
  try {
    const response = await apiClient.get(`/api/rooms/${roomId}/check-access`);
    return response.data;
  } catch (error) {
    console.error('API Error (checkRoomAccess):', error);
    throw error;
  }
};

// ==================== FRIENDSHIP API FUNCTIONS ====================

// Send friend request
export const sendFriendRequest = async (userId) => {
  return await apiClient.post(`/api/friendships/request/${userId}`);
};

// Accept friend request
export const acceptFriendRequest = async (userId) => {
  return await apiClient.post(`/api/friendships/accept/${userId}`);
};

// Reject friend request
export const rejectFriendRequest = async (userId) => {
  return await apiClient.post(`/api/friendships/reject/${userId}`);
};

// Get pending friend requests (received)
export const getPendingFriendRequests = async () => {
  return await apiClient.get('/api/friendships/requests/pending');
};

// Get sent friend requests (outgoing)
export const getSentFriendRequests = async () => {
  return await apiClient.get('/api/friendships/requests/sent');
};

// Get friends list
export const getFriendsList = async () => {
  return await apiClient.get('/api/friendships/list');
};

// Remove friend
export const removeFriend = async (userId) => {
  return await apiClient.delete(`/api/friendships/remove/${userId}`);
};

// Check friendship status with another user
export const getFriendshipStatus = async (userId) => {
  return await apiClient.get(`/api/friendships/status/${userId}`);
};

// Batch fetch friendship statuses for multiple users
export const getBatchFriendshipStatuses = async (userIds) => {
  const statuses = {};
  await Promise.all(
    userIds.map(async (userId) => {
      try {
        const response = await getFriendshipStatus(userId);
        statuses[userId] = response.data;
      } catch (error) {
        console.error(`Failed to fetch friendship status for user ${userId}:`, error);
        statuses[userId] = { status: 'none', can_request: true };
      }
    })
  );
  return statuses;
};

// ==================== PRIVATE MESSAGES API FUNCTIONS ====================

// Get private messages with another user
export const getPrivateMessages = async (userId) => {
  return await apiClient.get(`/api/private-messages/${userId}`);
};

// ==================== PAYMENT API FUNCTIONS ====================

// Wallet & Balance
export const getWallet = async () => {
  const response = await apiClient.get('/api/wallets/me');
  return response.data;
};

// Purchase tokens with Paystack
export const purchaseTokens = async (amount, paymentId, currency = 'NGN') => {
  const response = await apiClient.post('/api/wallets/purchase-tokens', {
    amount,
    payment_method: 'paystack',
    payment_id: paymentId,
    currency
  });
  return response.data;
};

// Get token transaction history
export const getTokenTransactions = async (limit = 50) => {
  const response = await apiClient.get(`/api/token-transactions/me?limit=${limit}`);
  return response.data;
};

export const getGatewayEarnings = async () => {
  try {
    const response = await apiClient.get('/api/gateway-earnings/me');
    return response.data;
  } catch (error) {
    // Gateway earnings tracking not implemented yet - fail silently
    throw error;
  }
};

// Payment Accounts
export const getPaymentAccounts = async () => {
  try {
    const response = await apiClient.get('/api/payment-accounts');
    return response.data;
  } catch (error) {
    console.error('API Error (getPaymentAccounts):', error);
    throw error;
  }
};

export const addPaystackAccount = async (accountData) => {
  try {
    const response = await apiClient.post('/api/payment-accounts/paystack', accountData);
    return response.data;
  } catch (error) {
    console.error('API Error (addPaystackAccount):', error);
    throw error;
  }
};

export const createStripeConnectAccount = async (countryCode) => {
  try {
    const response = await apiClient.post('/api/payment-accounts/stripe/connect', { country: countryCode });
    return response.data;
  } catch (error) {
    console.error('API Error (createStripeConnectAccount):', error);
    throw error;
  }
};

export const getStripeAccountStatus = async (accountId) => {
  try {
    const response = await apiClient.get(`/api/payment-accounts/stripe/${accountId}/status`);
    return response.data;
  } catch (error) {
    console.error('API Error (getStripeAccountStatus):', error);
    throw error;
  }
};

export const refreshStripeOnboardingLink = async (accountId) => {
  try {
    const response = await apiClient.post(`/api/payment-accounts/stripe/${accountId}/refresh-link`);
    return response.data;
  } catch (error) {
    console.error('API Error (refreshStripeOnboardingLink):', error);
    throw error;
  }
};

export const setPrimaryAccount = async (accountId) => {
  try {
    const response = await apiClient.post(`/api/payment-accounts/${accountId}/set-primary`);
    return response.data;
  } catch (error) {
    console.error('API Error (setPrimaryAccount):', error);
    throw error;
  }
};

export const deletePaymentAccount = async (accountId) => {
  try {
    const response = await apiClient.delete(`/api/payment-accounts/${accountId}`);
    return response.data;
  } catch (error) {
    console.error('API Error (deletePaymentAccount):', error);
    throw error;
  }
};

export const getPaystackBanks = async (country = 'NG') => {
  try {
    const response = await apiClient.get(`/api/payment-accounts/paystack/banks/${country}`);
    return response.data;
  } catch (error) {
    console.error('API Error (getPaystackBanks):', error);
    throw error;
  }
};

// Withdrawals
export const requestWithdrawal = async (withdrawalData) => {
  try {
    const response = await apiClient.post('/api/withdrawals/request', withdrawalData);
    return response.data;
  } catch (error) {
    console.error('API Error (requestWithdrawal):', error);
    throw error;
  }
};

// Payouts (transaction history)
export const getMyPayouts = async () => {
  try {
    const response = await apiClient.get('/api/payouts/me');
    return response.data;
  } catch (error) {
    // Payouts history not fully implemented yet - fail silently
    throw error;
  }
};

// Export payment history as CSV
export const exportPaymentHistory = async (startDate, endDate) => {
  try {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    
    const response = await apiClient.get(`/api/payments/export?${params.toString()}`, {
      responseType: 'blob',
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `wewatch_transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    
    return { success: true };
  } catch (error) {
    console.error('API Error (exportPaymentHistory):', error);
    throw error;
  }
};

// Export the configured axios instance if needed for direct calls
// or for setting up other interceptors elsewhere.
export default apiClient;