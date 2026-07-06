import axios from "axios";

// Smart API URL detection: automatically choose backend based on how frontend is accessed.
// Rule: localhost:8080 is ONLY used when window.location.hostname is literally localhost/127.0.0.1.
// On any other hostname (Vercel, staging) we use VITE_API_BASE_URL — which MUST be set
// to the Railway backend URL in the Vercel environment variables.
const getApiBaseUrl = () => {
  const currentHostname = window.location.hostname;

  // Cloudflare Tunnel
  if (currentHostname.includes('trycloudflare.com')) {
    const url = import.meta.env.VITE_CLOUDFLARE_BACKEND_URL;
    console.log('☁️ [API Config] Cloudflare Tunnel → backend:', url);
    return url;
  }

  // localtunnel
  if (currentHostname.includes('loca.lt')) {
    const url = import.meta.env.VITE_LOCALTUNNEL_BACKEND_URL || window.location.origin;
    console.log('🔗 [API Config] localtunnel → backend:', url);
    return url;
  }

  // True local development — only place localhost:8080 fallback is safe
  if (currentHostname === 'localhost' || currentHostname === '127.0.0.1') {
    const url = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
    console.log('🏠 [API Config] localhost → backend:', url);
    return url;
  }

  // Production / any deployed hostname (Vercel, staging, etc.)
  // VITE_API_BASE_URL must be set to the Railway backend URL.
  // We keep the same VITE_API_BASE_URL || localhost fallback here so that if the
  // env var is missing the behaviour degrades identically to before rather than
  // returning '' which turns every upload into a slow Vercel 404+retry loop.
  const url = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
  if (!import.meta.env.VITE_API_BASE_URL) {
    console.warn('⚠️ [API Config] VITE_API_BASE_URL is not set. Set it to your Railway backend URL in Vercel project settings → Environment Variables.');
  }
  console.log('🌐 [API Config] production → backend:', url);
  return url;
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

// Export API_BASE_URL for components to use when constructing image URLs
export { API_BASE_URL };

/**
 * Helper function to get full URL for uploaded assets
 * Handles both relative paths (/uploads/...) and absolute URLs (http/https)
 * @param {string} url - The URL or path to resolve
 * @returns {string} - The fully qualified URL
 */
export const getAssetUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const cleanPath = url.startsWith('/') ? url : '/' + url;
  return `${API_BASE_URL}${cleanPath}`;
};

// Append BunnyCDN resize params to CDN URLs so thumbnails download at display size.
// Non-CDN URLs are returned as-is.
export const cdnThumb = (url, width = 320) => {
  if (!url || !url.includes('b-cdn.net')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}width=${width}&quality=80`;
};

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





// Shared refresh mutex — serialises concurrent 401s so only one refresh call fires.
// Other in-flight requests queue up and retry with the new token when it arrives.
let _isRefreshing = false;
let _refreshQueue = [];
const _drainQueue = (token) => { _refreshQueue.forEach(cb => cb(token)); _refreshQueue = []; };

// --- Request Interceptor ---
// Attach JWT token from localStorage to every request — unless the caller already set
// one explicitly (e.g. uploadChunk preferring a sessionStorage WS token when present).
// The 401-refresh retry below also relies on this: it sets Authorization on the retried
// request directly, and re-running it through apiClient must not have this interceptor
// clobber that freshly-refreshed token back to the (still-stale) localStorage one.
apiClient.interceptors.request.use((config) => {
    if (!config.headers.Authorization) {
        const token = localStorage.getItem('wewatch_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    }
    return config;
});

// --- Response Interceptor ---
// On 401: serialise through the refresh mutex so only one refresh call fires.
// Queued requests retry automatically once the new token arrives.
// IMPORTANT: only clears token and redirects on an explicit server rejection (401/403).
// Network errors (mobile tab switch, brief offline) must NOT trigger logout.
apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.code === 'ERR_CANCELED' || error.name === 'CanceledError' || error.name === 'AbortError') {
            return Promise.reject(error);
        }

        const originalRequest = error.config;
        const isRefreshEndpoint = originalRequest?.url?.includes('/api/auth/refresh');
        const storedToken = localStorage.getItem('wewatch_token');

        if (error.response?.status === 401 && !isRefreshEndpoint && storedToken) {
            // Another refresh already in flight — queue this request until it completes
            if (_isRefreshing) {
                return new Promise((resolve, reject) => {
                    _refreshQueue.push((newToken) => {
                        if (!newToken) { reject(error); return; }
                        originalRequest.headers = originalRequest.headers || {};
                        originalRequest.headers.Authorization = `Bearer ${newToken}`;
                        resolve(apiClient(originalRequest));
                    });
                });
            }

            _isRefreshing = true;
            try {
                // Use plain axios (not apiClient) to avoid re-triggering this interceptor.
                // Include the stored refresh token in the body — iOS Safari blocks cross-origin
                // cookies, so the cookie path alone would always fail on mobile.
                const { data } = await axios.post(
                    `${API_BASE_URL}/api/auth/refresh`,
                    { refresh_token: localStorage.getItem('wewatch_refresh') || '' },
                    { withCredentials: true }
                );
                localStorage.setItem('wewatch_token', data.token);
                if (data.refresh_token) {
                    localStorage.setItem('wewatch_refresh', data.refresh_token);
                }
                _drainQueue(data.token);
                originalRequest.headers = originalRequest.headers || {};
                originalRequest.headers.Authorization = `Bearer ${data.token}`;
                return apiClient(originalRequest);
            } catch (_refreshError) {
                _drainQueue(null);
                // Only force logout when server explicitly rejects the refresh token.
                // A network error here (no response) means the device is briefly offline —
                // clearing the token would incorrectly log the user out on tab switch.
                const serverRejected = _refreshError.response?.status === 401 || _refreshError.response?.status === 403;
                if (serverRejected) {
                    localStorage.removeItem('wewatch_token');
                    if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
                        window.location.href = '/login';
                    }
                }
                return Promise.reject(_refreshError);
            } finally {
                _isRefreshing = false;
            }
        }

        if (error.response?.status !== 401 && error.response?.status !== 404 && error.response?.status !== 400) {
            console.error('API Error:', error.response?.data?.error || error.message);
        }
        return Promise.reject(error);
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

/**
 * Get all KYC submissions (admin only)
 * @param {string} status - Optional status filter: 'pending', 'approved', 'rejected', or 'all'
 * @returns {Promise} Axios promise resolving to KYC submissions list
 */
export const getAdminKYCs = async (status = 'all') => {
    try {
        const endpoint = status === 'pending' ? '/api/admin/kyc/pending' : `/api/admin/kyc?status=${status}`;
        const response = await apiClient.get(endpoint);
        return response.data;
    } catch (error) {
        console.error('API Error (getAdminKYCs):', error);
        throw error;
    }
};

/**
 * Approve a KYC submission (admin only)
 * @param {number} kycId - The KYC submission ID to approve
 * @returns {Promise} Axios promise resolving to approval result
 */
export const approveKYC = async (kycId) => {
    try {
        const response = await apiClient.post(`/api/admin/kyc/${kycId}/approve`);
        return response.data;
    } catch (error) {
        console.error('API Error (approveKYC):', error);
        throw error;
    }
};

/**
 * Reject a KYC submission (admin only)
 * @param {number} kycId - The KYC submission ID to reject
 * @param {string} reason - Rejection reason
 * @returns {Promise} Axios promise resolving to rejection result
 */
export const rejectKYC = async (kycId, reason) => {
    try {
        const response = await apiClient.post(`/api/admin/kyc/${kycId}/reject`, { reason });
        return response.data;
    } catch (error) {
        console.error('API Error (rejectKYC):', error);
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

// Check if user has provided date of birth
export const checkDateOfBirth = async () => {
    try {
        const response = await apiClient.get('/api/auth/check-dob');
        return response.data;
    } catch (error) {
        console.error('Error checking date of birth:', error);
        throw error;
    }
};

// Update user's date of birth (can only be set once)
export const updateDateOfBirth = async (dateOfBirth) => {
    try {
        const response = await apiClient.post('/api/auth/update-dob', {
            date_of_birth: dateOfBirth
        });
        return response.data;
    } catch (error) {
        console.error('Error updating date of birth:', error);
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
export const getRooms = async (limit = 20, offset = 0, { signal } = {}) => {
    try {
        const response = await apiClient.get('/api/rooms', {
            params: { limit, offset },
            signal,
        });
        return response.data;
    } catch (error) {
        throw error;
    }
};

export const getPublicRooms = async (limit = 20, offset = 0, { signal } = {}) => {
    try {
        const response = await apiClient.get('/api/public/rooms', {
            params: { limit, offset },
            signal,
        });
        return response.data;
    } catch (error) {
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
export const getActiveSessions = async (limit = 50, offset = 0, { signal } = {}) => {
  try {
    const response = await apiClient.get(`/api/sessions/active?limit=${limit}&offset=${offset}`, { signal });
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

// Toggle room favourite — returns { is_favourite: bool }
export const toggleRoomFavourite = async (roomId) => {
  const response = await apiClient.post(`/api/rooms/${roomId}/favourite`);
  return response.data;
};

// Join a room as member — returns { status: 'active'|'pending' }
export const joinRoom = async (roomId) => {
  const response = await apiClient.post(`/api/rooms/${roomId}/join`);
  return response.data;
};

// Get user's favourite rooms
export const getFavouriteRooms = async () => {
  const response = await apiClient.get('/api/rooms/favourites');
  return response.data;
};

// Get top 10 rooms by Bayesian average rating
export const getRoomsLeaderboard = async () => {
  const response = await apiClient.get('/api/rooms/leaderboard');
  return response.data;
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

// --- Room Groups API (Discord-style channels for chat segmentation) ---

// Create a new room group (host only)
export const createRoomGroup = async (roomId, groupData) => {
  return await apiClient.post(`/api/rooms/${roomId}/groups`, groupData);
};

// Get all groups in a room
export const getRoomGroups = async (roomId) => {
  return await apiClient.get(`/api/rooms/${roomId}/groups`);
};

// Update a room group (host only)
export const updateRoomGroup = async (roomId, groupId, groupData) => {
  return await apiClient.put(`/api/rooms/${roomId}/groups/${groupId}`, groupData);
};

// Delete a room group (host only)
export const deleteRoomGroup = async (roomId, groupId) => {
  return await apiClient.delete(`/api/rooms/${roomId}/groups/${groupId}`);
};

// Join a room group
export const joinRoomGroup = async (roomId, groupId) => {
  return await apiClient.post(`/api/rooms/${roomId}/groups/${groupId}/join`);
};

// Leave a room group
export const leaveRoomGroup = async (roomId, groupId) => {
  return await apiClient.post(`/api/rooms/${roomId}/groups/${groupId}/leave`);
};

// Get members of a room group
export const getRoomGroupMembers = async (roomId, groupId) => {
  return await apiClient.get(`/api/rooms/${roomId}/groups/${groupId}/members`);
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


// Leave a room
export const leaveRoom = async (roomId) => {
  try {
    const response = await apiClient.post(`/api/rooms/${roomId}/leave`);
    devLog('✅ [API] Left room:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ [API] Leave room error:', error.response || error.message);
    throw error;
  }
};

// Fetch upcoming events (next 30 days) across all rooms the user belongs to
export const getUpcomingEvents = () => apiClient.get('/api/user/upcoming-events');

// Kick a member from a room (host only)
export const kickRoomMember = async (roomId, userId) => {
  const response = await apiClient.delete(`/api/rooms/${roomId}/members/${userId}`);
  return response.data;
};

// Ban a member from a room (host only)
export const banRoomMember = async (roomId, userId) => {
  const response = await apiClient.post(`/api/rooms/${roomId}/members/${userId}/ban`);
  return response.data;
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
 * ⚠️ DEPRECATED (April 2026): Legacy session creation - DO NOT USE
 * This endpoint has been replaced by POST /api/rooms/:id/sessions
 * Only used by old RoomPage.jsx which is no longer in routing table
 * Use the direct apiClient.post() call in RoomPageNew.jsx instead
 * 
 * @param {string|number} roomId 
 * @param {string} watchType - "video" or "3d_cinema"
 * @returns {Promise<AxiosResponse>}
 * @deprecated Use POST /api/rooms/:id/sessions instead
 */
export const createWatchSessionForRoom = (roomId, watchTypeOrConfig = 'video') => {
  console.warn('[DEPRECATED] createWatchSessionForRoom is deprecated. Use POST /api/rooms/:id/sessions instead.');
  
  // Support both old signature (watchType string) and new signature (config object)
  const requestBody = typeof watchTypeOrConfig === 'string'
    ? { watch_type: watchTypeOrConfig } 
    : watchTypeOrConfig;
  
  return apiClient.post(`/api/rooms/${roomId}/watch-session`, requestBody);
};


/**
 * Fetches the active watch session for a room (if any)
 * @param {string|number} roomId 
 * @returns {Promise<AxiosResponse>}
 */
export const getActiveSession = (roomId) => {
  return apiClient.get(`/api/rooms/${roomId}/active-session`);
};

export const postSessionHeartbeat = (roomId) =>
  apiClient.post(`/api/rooms/${roomId}/session/heartbeat`);

// Logged before the WS/LiveKit connection is attempted — lets us compare attempted
// vs confirmed joins to spot members whose connection silently never completed.
export const logSessionJoinAttempt = (roomId, sessionId) =>
  apiClient.post(`/api/rooms/${roomId}/sessions/${sessionId}/join-attempt`).catch(() => {});

export const getSessionJoinStats = (roomId, sessionId) =>
  apiClient.get(`/api/rooms/${roomId}/sessions/${sessionId}/join-stats`);

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

/**
 * Upload single chunk to backend
 * @param {Object} params - Chunk upload parameters
 * @returns {Promise} Upload response
 */
export const uploadChunk = async ({ chunk, chunkIndex, totalChunks, uploadId, fileName, fileSize, roomId, sessionId, abortSignal, clientDuration, clientPosterBlob }) => {
  const formData = new FormData();
  formData.append('chunk', chunk);
  formData.append('chunk_index', chunkIndex);
  formData.append('total_chunks', totalChunks);
  formData.append('upload_id', uploadId);
  formData.append('file_name', fileName);
  formData.append('file_size', fileSize);
  // Client-captured duration/poster (chunk 0 only) — lets the backend skip its own
  // ffmpeg-based extraction when the browser already supplied an equivalent value.
  if (chunkIndex === 0 && clientDuration) {
    formData.append('client_duration', clientDuration);
  }
  if (chunkIndex === 0 && clientPosterBlob) {
    formData.append('client_poster', clientPosterBlob, 'poster.jpg');
  }

  // Always go directly to Railway — Vercel's rewrite proxy does not reliably forward
  // multipart/form-data POST bodies to external URLs and returns 502. Railway's CORS
  // config already allows *.vercel.app origins, so no proxy is needed.
  let uploadUrl = `${API_BASE_URL}/api/rooms/${roomId}/upload?chunked=true`;
  if (sessionId) {
    uploadUrl += `&session_id=${encodeURIComponent(sessionId)}`;
  }

  // Auth: send the session token in the Authorization header (CORS is set up on Railway).
  // Fall back to auth_token query param for CookieToAuthHeaderMiddleware if header is stripped.
  const token = sessionStorage.getItem('wewatch_ws_token') || localStorage.getItem('wewatch_token');
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  if (token) {
    uploadUrl += `&auth_token=${encodeURIComponent(token)}`;
  }

  // apiClient (not raw axios) so an expired token gets the same auto-refresh-and-retry
  // treatment as every other API call — previously this bypassed that interceptor
  // entirely, so a token expiring mid-upload just failed outright instead of silently
  // refreshing and resuming.
  const response = await apiClient.post(uploadUrl, formData, {
    headers: { 'Content-Type': undefined, ...authHeaders }, // let browser set multipart boundary
    withCredentials: true,
    timeout: 120000,
    signal: abortSignal,
  });
  return response.data;
};

/**
 * Tell the backend to stop an in-flight progressive/chunked upload — the host switched
 * media away from it, or explicitly cancelled. Without this, the browser-side abort only
 * stops new chunks from being *sent*; the backend's drainer keeps waiting on chunks that
 * will never arrive, and an eventual stray completion could still broadcast
 * device_stream_ready for media nobody asked for anymore. Fire-and-forget is fine for
 * callers — failures are logged but never block the local cancel/switch UX, and the
 * call is naturally idempotent (aborting an already-finished or already-aborted
 * upload_id is a no-op on the backend).
 */
export const abortChunkedUpload = async (roomId, uploadId) => {
  try {
    await apiClient.delete(`/api/rooms/${roomId}/upload/${uploadId}`);
  } catch (error) {
    console.warn('⚠️ [abortChunkedUpload] Backend abort failed (non-fatal):', error.message);
  }
};

/**
 * Upload file to BunnyCDN in 3MB chunks via Vercel Edge Function.
 * BunnyCDN Storage API requires header auth which CORS strips — the Edge Function
 * acts as a server-side proxy for each chunk (each under the 4MB Edge Function limit).
 * Returns { uploadId, totalChunks } so Railway can assemble the final file.
 */
const _uploadChunkToProxy = (proxyUrl, chunk, chunkIndex, abortSignal) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        const err = new Error(`Chunk ${chunkIndex} upload failed: ${xhr.status} ${xhr.responseText}`);
        err.status = xhr.status;
        reject(err);
      }
    };
    xhr.onerror = () => reject(new Error(`Network error on chunk ${chunkIndex}`));
    xhr.onabort = () => reject(Object.assign(new Error('Upload cancelled'), { name: 'CanceledError' }));
    if (abortSignal) abortSignal.addEventListener('abort', () => xhr.abort());
    xhr.open('PUT', proxyUrl);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.send(chunk);
  });

// Option C: pick chunk size before the upload based on connection type so every chunk —
// including the probe — uses the correct size. Must stay fixed for the whole upload because
// totalChunks is computed from it and Railway assembles by chunk index.
const _getBunnyCDNChunkSize = (savedChunkSize) => {
  if (savedChunkSize) return savedChunkSize; // resume: honour original size
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return 1 * 1024 * 1024;          // unknown / iOS Safari → 1 MB (safe)
  const t = conn.effectiveType;
  if (t === 'slow-2g' || t === '2g') return 256 * 1024;  // 256 KB
  if (t === '3g')                    return 1 * 1024 * 1024; // 1 MB
  if (t === '4g')                    return 2 * 1024 * 1024; // 2 MB
  return 3 * 1024 * 1024;                                     // WiFi / 5G
};

// Option B: wait until the browser is back online before retrying.
const _waitForOnline = () =>
  new Promise(resolve => {
    if (navigator.onLine !== false) { resolve(); return; }
    const h = () => { window.removeEventListener('online', h); resolve(); };
    window.addEventListener('online', h);
  });

export const uploadFileToBunnyCDN = async (
  file,
  _cdnPath,
  onProgress,
  abortSignal,
  savedState = null,       // Option A: { uploadId, chunkSize, completedChunks: number[] }
  onChunkComplete = null,  // Option A: (completedIndices: number[], uploadId, chunkSize) => void
) => {
  const CHUNK_SIZE = _getBunnyCDNChunkSize(savedState?.chunkSize); // Option C
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const uploadId = savedState?.uploadId ?? `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Option A: seed completedSet from saved state so skipped chunks aren't re-uploaded.
  const completedSet = new Set(savedState?.completedChunks ?? []);
  let completedChunks = completedSet.size; // start counter at already-done count

  let concurrency = 1; // conservative until probe result is known

  const getConcurrencyFromSpeed = (speedMBps) => {
    if (speedMBps < 1) return 1;
    if (speedMBps < 3) return 2;
    if (speedMBps < 6) return 4;
    return 6;
  };

  const uploadSingleChunk = async (i, measureSpeed = false) => {
    if (abortSignal?.aborted) throw Object.assign(new Error('Upload cancelled'), { name: 'CanceledError' });

    // Option A: skip chunks that already succeeded (resume path).
    if (completedSet.has(i)) {
      completedChunks++;
      if (onProgress) {
        const loaded = Math.min(completedChunks * CHUNK_SIZE, file.size);
        onProgress(Math.round(loaded * 100 / file.size), loaded, file.size);
      }
      return;
    }

    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    const chunkPath = `temp-media/${uploadId}/chunk_${i}`;
    const proxyUrl = `/api/upload-proxy?path=${encodeURIComponent(chunkPath)}`;

    const MAX_RETRIES = 6; // Option B: was 3
    let lastErr;
    const t0 = measureSpeed ? performance.now() : 0;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Option B: if offline, wait until the device reconnects before attempting.
      await _waitForOnline();
      if (abortSignal?.aborted) throw Object.assign(new Error('Upload cancelled'), { name: 'CanceledError' });

      try {
        await _uploadChunkToProxy(proxyUrl, chunk, i, abortSignal);
        lastErr = null;
        break;
      } catch (err) {
        if (err.name === 'CanceledError') throw err;
        if (err.status >= 400 && err.status < 500) throw err; // 4xx = client error, don't retry
        lastErr = err;
        if (attempt < MAX_RETRIES) {
          // Option B: longer backoff (1s → 2s → 4s → 8s → 16s → 30s cap) instead of 500 ms
          const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
          console.warn(`⚠️ [BunnyCDN] Chunk ${i} attempt ${attempt + 1} failed (${err.message}), retrying in ${delay}ms…`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    if (lastErr) throw lastErr;

    if (measureSpeed) {
      const elapsed = (performance.now() - t0) / 1000;
      const speedMBps = ((end - start) / 1024 / 1024) / Math.max(elapsed, 0.001);
      concurrency = getConcurrencyFromSpeed(speedMBps);
      console.log(`[BunnyCDN] Probe chunk: ${speedMBps.toFixed(2)} MB/s → concurrency set to ${concurrency}`);
    }

    completedChunks++;
    completedSet.add(i); // Option A: mark done
    // Option A: persist completion so a page-reload can resume.
    if (onChunkComplete) onChunkComplete(Array.from(completedSet), uploadId, CHUNK_SIZE);

    if (onProgress) {
      const loaded = Math.min(completedChunks * CHUNK_SIZE, file.size);
      onProgress(Math.round(loaded * 100 / file.size), loaded, file.size);
    }
    console.log(`[BunnyCDN Chunked] chunk ${i + 1}/${totalChunks} done (${completedChunks} complete)`);
  };

  // Find the first chunk that still needs uploading (skip already-done on resume).
  let probeChunk = 0;
  while (probeChunk < totalChunks && completedSet.has(probeChunk)) probeChunk++;

  if (probeChunk < totalChunks) {
    const isResume = savedState != null;
    console.log(
      `[BunnyCDN Chunked] ${totalChunks} chunks × ${(CHUNK_SIZE / 1024 / 1024).toFixed(2)} MB` +
      ` for uploadId=${uploadId}` +
      (isResume ? ` (resuming from chunk ${probeChunk})` : ' — probing speed…')
    );
    // Probe speed only on fresh uploads; resuming uses concurrency=1 (safe default).
    await uploadSingleChunk(probeChunk, !isResume);
  }

  if (completedSet.size >= totalChunks) return { uploadId, totalChunks, chunkSize: CHUNK_SIZE };

  // Rolling semaphore pool for the remaining chunks.
  let nextChunk = probeChunk + 1;
  let inFlight = 0;

  // Option B: on mobile, cap concurrency down immediately when connection degrades.
  const handleConnectionChange = () => {
    const newType = navigator.connection?.effectiveType;
    const cap = { '2g': 1, '3g': 1, '4g': 3 }[newType];
    if (cap && cap < concurrency) {
      console.log(`[BunnyCDN] Network changed to ${newType} — concurrency ${concurrency} → ${cap}`);
      concurrency = cap;
    }
  };
  navigator.connection?.addEventListener('change', handleConnectionChange);

  try {
    await new Promise((resolve, reject) => {
      const schedule = () => {
        while (inFlight < concurrency && nextChunk < totalChunks) {
          const i = nextChunk++;
          inFlight++;
          uploadSingleChunk(i)
            .then(() => {
              inFlight--;
              if (nextChunk < totalChunks) {
                schedule();
              } else if (inFlight === 0) {
                resolve();
              }
            })
            .catch(reject);
        }
        if (nextChunk >= totalChunks && inFlight === 0) resolve();
      };
      schedule();
    });
  } finally {
    navigator.connection?.removeEventListener('change', handleConnectionChange);
  }

  return { uploadId, totalChunks, chunkSize: CHUNK_SIZE };
};

/**
 * Confirm a completed BunnyCDN upload with Railway to create the DB record.
 */
export const confirmUpload = (roomId, data) =>
  apiClient.post(`/api/rooms/${roomId}/upload/confirm`, data);

/**
 * Tell Railway to assemble BunnyCDN chunks into the final file and create the DB record.
 */
export const assembleUpload = (roomId, data) =>
  apiClient.post(`/api/rooms/${roomId}/upload/assemble`, data, { timeout: 300000 }); // 5min for large files

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

// --- Public (no-auth) endpoints for the /explore browse page ---
export const getPublicLiveSessions = () =>
  fetch(`${API_BASE_URL}/api/public/live-sessions`).then(r => r.json());

export const getPublicFeedPosts = (page = 1, limit = 20) =>
  fetch(`${API_BASE_URL}/api/posts?page=${page}&limit=${limit}`).then(r => r.json());

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

// Get friend count for a user
export const getFriendCount = async (userId) => {
  return await apiClient.get(`/api/friendships/count/${userId}`);
};

// Get followers count for a user (room members + explicit follows, deduped)
export const getFollowersCount = async (userId) => {
  return await apiClient.get(`/api/friendships/followers/${userId}`);
};

// Get following count for a user (rooms joined + explicit follows, deduped)
export const getFollowingCount = async (userId) => {
  return await apiClient.get(`/api/users/${userId}/following-count`);
};

// Get the list of users someone is following (privacy-gated)
export const getFollowingList = async (userId) => {
  return await apiClient.get(`/api/users/${userId}/following`);
};

// Toggle whether the current user's following list is publicly visible
export const updateFollowingPrivacy = async (showPublic) => {
  return await apiClient.patch('/api/users/privacy', { show_following_public: showPublic });
};

// Get average watchers for a user (host stats)
export const getUserAverageWatchers = async (userId) => {
  return await apiClient.get(`/api/users/${userId}/average-watchers`);
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

// ==================== FOLLOW API FUNCTIONS ====================

export const followUser = async (userId) => {
  return await apiClient.post(`/api/follow/${userId}`);
};

export const unfollowUser = async (userId) => {
  return await apiClient.delete(`/api/follow/${userId}`);
};

export const getFollowStatus = async (userId) => {
  return await apiClient.get(`/api/follow/status/${userId}`);
};

// Room join requests (host-only)
export const getRoomJoinRequests = async (roomId) => {
  return await apiClient.get(`/api/rooms/${roomId}/join-requests`);
};

export const approveRoomJoinRequest = async (roomId, userId) => {
  return await apiClient.post(`/api/rooms/${roomId}/join-requests/${userId}/approve`);
};

export const rejectRoomJoinRequest = async (roomId, userId) => {
  return await apiClient.post(`/api/rooms/${roomId}/join-requests/${userId}/reject`);
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
    link.setAttribute('download', `letswatchout_transactions_${new Date().toISOString().split('T')[0]}.csv`);
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

export const getRoomsWithActiveSessions = async () => {
  try {
    const response = await apiClient.get('/api/rooms/with-active-sessions');
    return response.data;
  } catch (error) {
    console.error('API Error (getRoomsWithActiveSessions):', error);
    throw error;
  }
};

export const sendWatchOut = async (recipientId, roomId) => {
  try {
    const response = await apiClient.post('/api/lobby-chats/watch-out', {
      recipient_id: recipientId,
      room_id: roomId,
    });
    return response.data;
  } catch (error) {
    console.error('API Error (sendWatchOut):', error);
    throw error;
  }
};

export const sendGameChallenge = async (recipientId, roomId, gameType, result, score) => {
  try {
    const body = { recipient_id: recipientId, room_id: roomId, game_type: gameType };
    if (result) body.result = result;
    if (score != null) body.score = score;
    const response = await apiClient.post('/api/lobby-chats/game-challenge', body);
    return response.data;
  } catch (error) {
    console.error('API Error (sendGameChallenge):', error);
    throw error;
  }
};

export const blockUser = async (userId) => {
  const response = await apiClient.post(`/api/lobby-chats/block/${userId}`);
  return response.data;
};

export const startPrivateWatchout = async (recipientId, watchType = 'video', contentRating = 'G', price = 0) => {
  try {
    const response = await apiClient.post('/api/lobby-chats/private-watchout', {
      recipient_id: recipientId,
      watch_type: watchType,
      content_rating: contentRating,
      price,
    });
    return response.data;
  } catch (error) {
    console.error('API Error (startPrivateWatchout):', error);
    throw error;
  }
};

export const inviteToSession = async (sessionId, userId) => {
  try {
    const response = await apiClient.post(`/api/sessions/${sessionId}/invite`, { user_id: userId });
    return response.data;
  } catch (error) {
    console.error('API Error (inviteToSession):', error);
    throw error;
  }
};

export const startCircleWatchout = async (recipientIds, watchType = 'video', contentRating = 'G') => {
  try {
    const response = await apiClient.post('/api/lobby-chats/circle-watchout', {
      recipient_ids: recipientIds,
      watch_type: watchType,
      content_rating: contentRating,
    });
    return response.data;
  } catch (error) {
    console.error('API Error (startCircleWatchout):', error);
    throw error;
  }
};

export const getWatchoutAllowedRatings = async (recipientId) => {
  try {
    const response = await apiClient.get('/api/lobby-chats/watchout-ratings', { params: { recipient_id: recipientId } });
    return response.data;
  } catch (error) {
    console.error('API Error (getWatchoutAllowedRatings):', error);
    throw error;
  }
};

export const searchUsers = async (query) => {
  try {
    const response = await apiClient.get('/api/users/search', { params: { q: query } });
    return response.data;
  } catch (error) {
    console.error('API Error (searchUsers):', error);
    throw error;
  }
};

export const tipPost = async (postId) => {
  const response = await apiClient.post(`/api/posts/${postId}/tip`);
  return response.data;
};

export const publishPost = async (postId, data) => {
  const response = await apiClient.put(`/api/posts/${postId}`, data);
  return response.data;
};

export const submitReport = async ({ targetType, targetId, reason, description }) => {
  const response = await apiClient.post('/api/reports', {
    target_type: targetType,
    target_id: targetId,
    reason,
    description,
  });
  return response.data;
};

export const checkReported = async (targetType, targetId) => {
  const response = await apiClient.get('/api/reports/check', { params: { target_type: targetType, target_id: targetId } });
  return response.data;
};

export const getUserSettings = async () => {
  const response = await apiClient.get('/api/users/settings');
  return response.data;
};

export const updateUserSettings = async (settings) => {
  const response = await apiClient.put('/api/users/settings', settings);
  return response.data;
};

// ── Lobby Groups ──────────────────────────────────────────────────────────────

export const createLobbyGroup = (name, memberIds) =>
  apiClient.post('/api/lobby-groups', { name, member_ids: memberIds }).then(r => r.data);

export const getLobbyGroups = () =>
  apiClient.get('/api/lobby-groups').then(r => r.data);

export const getLobbyGroupMessages = (groupId) =>
  apiClient.get(`/api/lobby-groups/${groupId}/messages`).then(r => r.data);

export const sendLobbyGroupMessage = (groupId, message) =>
  apiClient.post(`/api/lobby-groups/${groupId}/messages`, { message }).then(r => r.data);

export const uploadLobbyGroupImage = (groupId, formData) =>
  apiClient.post(`/api/lobby-groups/${groupId}/image`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);

export const uploadLobbyGroupVideo = (groupId, formData) =>
  apiClient.post(`/api/lobby-groups/${groupId}/video`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);

export const uploadLobbyGroupDocument = (groupId, formData) =>
  apiClient.post(`/api/lobby-groups/${groupId}/document`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);

export const uploadLobbyGroupVoiceNote = (groupId, formData) =>
  apiClient.post(`/api/lobby-groups/${groupId}/voice-note`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);

export const sendLobbyGroupWatchOut = (groupId, roomId) =>
  apiClient.post(`/api/lobby-groups/${groupId}/watch-out`, { room_id: roomId }).then(r => r.data);

export const startLobbyGroupCall = (groupId) =>
  apiClient.post(`/api/lobby-groups/${groupId}/call`).then(r => r.data);

export const endLobbyGroupCall = (groupId) =>
  apiClient.post(`/api/lobby-groups/${groupId}/call/end`).then(r => r.data);

export const addLobbyGroupMembers = (groupId, userIds) =>
  apiClient.post(`/api/lobby-groups/${groupId}/members`, { user_ids: userIds }).then(r => r.data);

export const leaveLobbyGroup = (groupId) =>
  apiClient.delete(`/api/lobby-groups/${groupId}/leave`).then(r => r.data);

export const deleteLobbyGroup = (groupId) =>
  apiClient.delete(`/api/lobby-groups/${groupId}`).then(r => r.data);

export const renameLobbyGroup = (groupId, name) =>
  apiClient.patch(`/api/lobby-groups/${groupId}`, { name }).then(r => r.data);

// Notifications
export const clearAllNotifications = () =>
  apiClient.delete('/api/notifications').then(r => r.data);

// Room member invite
export const inviteUserToRoom = (roomId, userId) =>
  apiClient.post(`/api/rooms/${roomId}/invite-user`, { user_id: userId }).then(r => r.data);

// Export the configured axios instance if needed for direct calls
// or for setting up other interceptors elsewhere.
export default apiClient;

// ==================== USER STATUSES / STORIES ====================

export const getStatusFeed = async () => {
  const response = await apiClient.get('/api/statuses/feed');
  return response.data;
};

export const createStatus = async (formData) => {
  const response = await apiClient.post('/api/statuses', formData, {
    headers: { 'Content-Type': undefined },
  });
  return response.data;
};

export const deleteStatus = async (id) => {
  const response = await apiClient.delete(`/api/statuses/${id}`);
  return response.data;
};

export const markStatusViewed = async (id) => {
  const response = await apiClient.post(`/api/statuses/${id}/view`);
  return response.data;
};

export const toggleStatusLike = async (id) => {
  const response = await apiClient.post(`/api/statuses/${id}/like`);
  return response.data;
};

export const sendLobbyChatMessage = async (recipientId, content) => {
  const response = await apiClient.post('/api/lobby-chats/send', { recipient_id: recipientId, content });
  return response.data;
};

export const getStatusPrivacy = async () => {
  const response = await apiClient.get('/api/statuses/privacy');
  return response.data;
};

export const updateStatusPrivacy = async (excludedIds) => {
  const response = await apiClient.put('/api/statuses/privacy', { excluded_ids: excludedIds });
  return response.data;
};

// --- Room chat attachments ---
export const sendRoomChatSticker = async (roomId, stickerUrl, provider, stickerId) => {
  const response = await apiClient.post(`/api/rooms/${roomId}/messages/sticker`, {
    sticker_url: stickerUrl,
    provider,
    sticker_id: stickerId || '',
  });
  return response.data;
};

export const uploadCustomSticker = async (file) => {
  const fd = new FormData();
  fd.append('image', file);
  const response = await apiClient.post('/api/stickers/upload', fd, {
    headers: { 'Content-Type': undefined },
  });
  return response.data;
};

// --- Sticker packs ---
export const getStickerPacks = () => apiClient.get('/api/stickers/packs');
export const createStickerPack = (name) => apiClient.post('/api/stickers/packs', { name });
export const uploadStickerToPack = (packId, file) => {
  const fd = new FormData();
  fd.append('image', file);
  return apiClient.post(`/api/stickers/packs/${packId}/stickers`, fd, {
    headers: { 'Content-Type': undefined },
  });
};
export const removeStickerFromPack = (packId, stickerId) =>
  apiClient.delete(`/api/stickers/packs/${packId}/stickers/${stickerId}`);
export const publishStickerPack = (packId) =>
  apiClient.post(`/api/stickers/packs/${packId}/publish`);
export const addCommunityPack = (packId) =>
  apiClient.post(`/api/stickers/packs/${packId}/add`);
export const getCommunityPacks = () => apiClient.get('/api/stickers/community');
export const importTelegramPack = (url) =>
  apiClient.post('/api/stickers/import/telegram', { url });

export const uploadRoomChatAttachment = async (roomId, file, type, roomGroupId) => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('type', type);
  if (roomGroupId) fd.append('room_group_id', String(roomGroupId));
  const response = await apiClient.post(`/api/rooms/${roomId}/messages/attachment`, fd, {
    headers: { 'Content-Type': undefined },
  });
  return response.data;
};

// --- Custom Watch Background ---
export const uploadCustomBackground = async (file) => {
  const formData = new FormData();
  formData.append('image', file);
  const response = await apiClient.post('/api/upload/custom-background', formData, {
    headers: { 'Content-Type': undefined },
  });
  return response.data; // { url: '/uploads/custom_backgrounds/bg_xxx.jpg' }
};

// --- Community Events ---
export const getCommunityEvents = async (since) => {
  const params = since ? { since } : {};
  const response = await apiClient.get('/api/community-events', { params });
  return response.data;
};

export const uploadCommunityRequestImage = async (file) => {
  const formData = new FormData();
  formData.append('image', file);
  const response = await apiClient.post('/api/community-requests/upload-image', formData, {
    headers: { 'Content-Type': undefined },
  });
  return response.data;
};

export const createCommunityRequest = async (data) => {
  const response = await apiClient.post('/api/community-requests', data);
  return response.data;
};

export const toggleCommunityRequestUpvote = async (id) => {
  const response = await apiClient.post(`/api/community-requests/${id}/upvote`);
  return response.data;
};

export const claimCommunityRequest = async (id) => {
  const response = await apiClient.post(`/api/community-requests/${id}/claim`);
  return response.data;
};
