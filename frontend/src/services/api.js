import axios from "axios";
console.log("🔧 API_BASE_URL from .env.local:", import.meta.env.VITE_API_BASE_URL);
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
        // Authorization header will be added dynamically based on token
    },
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
        return response;
    },
    (error) => {
        console.error('API Response Error:', error);
        if (error.response && error.response.status === 401) {
            console.warn('Unauthorized access - Token might be invalid/expired');
            // Clear the token from storage
            localStorage.removeItem('wewatch_token');

        }
        return Promise.reject(error)
    }
);

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
 * @returns {Promise<AxiosResponse>}
 */
export const createWatchSessionForRoom = (roomId) => {
  return apiClient.post(`/api/rooms/${roomId}/watch-session`);
};


/**
 * Fetches the active watch session for a room (if any)
 * @param {string|number} roomId 
 * @returns {Promise<AxiosResponse>}
 */
export const getActiveSession = (roomId) => {
  return apiClient.get(`/api/rooms/${roomId}/active-session`);
};

export const uploadMediaToRoom = async (roomId, file, onUploadProgressCallback, isTemporary = false, sessionId = null) => {
  try {
    console.log(`📤 API: Uploading media file to room ${roomId} (Temporary: ${isTemporary}, SessionID: ${sessionId})`, file.name);

    // --- CRUCIAL: Use FormData for file uploads ---
    const formData = new FormData();
    formData.append('mediaFile', file); // Key must match c.FormFile("mediaFile") in Go

    // --- OPTION: Configure the request ---
    const config = {
      headers: {
        'Content-Type': 'multipart/form-data', // Force Axios to auto-set correct Content-Type
      },
      // --- ✅ INCREASE TIMEOUT FOR LARGE FILES ---
      timeout: 60000, // 60 seconds (or more if needed)

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
          // Calculate the percentage completed
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          // Log the progress (for debugging)
          console.log(`uploadMediaToRoom: Upload progress: ${percentCompleted}%`);
          // Call the provided callback function with the progress percentage
          onUploadProgressCallback(percentCompleted); // ← TRIGGER THE CALLBACK
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
      console.log(`uploadMediaToRoom: Uploading as TEMPORARY media`);
      
      // ✅ Add session_id for temporary uploads
      if (sessionId) {
        queryParams.push(`session_id=${encodeURIComponent(sessionId)}`);
        console.log(`uploadMediaToRoom: Linking to session ${sessionId}`);
      }
    } else {
      console.log(`uploadMediaToRoom: Uploading as PERMANENT media`);
    }
    
    if (queryParams.length > 0) {
      uploadUrl += '?' + queryParams.join('&');
    }
    console.log(`uploadMediaToRoom: Upload URL: ${uploadUrl}`);
    // --- --- ---

    console.log(`uploadMediaToRoom: About to send POST request to ${uploadUrl}`);
    const response = await apiClient.post(uploadUrl, formData, config); // ✅ PASS UPDATED CONFIG
    console.log("uploadMediaToRoom: Request sent. Response received:", response.status, response.statusText);

    return response.data;
  } catch (error) {
    console.error('API Error (uploadMediaToRoom):', error);
    throw error;
  }
};

// Export the configured axios instance if needed for direct calls
// or for setting up other interceptors elsewhere.
export default apiClient;