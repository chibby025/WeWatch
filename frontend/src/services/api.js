import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
        // Authorization header will be added dynamically based on token
    },
});

apiClient.interceptors.request.use(
    (config) => {
        // Get the token from localStorage (or wherever it is stored)
        const token = localStorage.getItem('wewatch_token');
        // If a token exists, add it to the Authorization header
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        console.error('API Request Error:', error);
        return Promise.reject(error);
    }
);

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
 * Upload a media file to a specific room
 * @param {string|number} roomId - The ID of the room
 * @param {File} file - The File object to upload
 * @param {Function} [onUploadProgressCallback] - Optional callback for upload progress updates
 * @returns {Promise} Axios promise resolving to the response data (details of the created media item)
 */
export const uploadMediaToRoom = async (roomId, file, onUploadProgressCallback) => { // <-- Accept optional callback
  try {
    // --- ADD DEBUGGING ---
    console.log("uploadMediaToRoom: Function called with:", { roomId, file });
    console.log("uploadMediaToRoom: File type:", typeof file);
    console.log("uploadMediaToRoom: File details (if File object):", file instanceof File ? file.name + " (" + file.size + " bytes)" : "Not a File object");

    // --- CRUCIAL: Use FormData for file uploads ---
    const formData = new FormData();
    formData.append('mediaFile', file); // Key must match c.FormFile("mediaFile") in Go
    console.log("uploadMediaToRoom: FormData object created:", formData);

    // --- ADD DEBUGGING: Inspect FormData contents (limited in browsers) ---
    console.log("uploadMediaToRoom: Inspecting FormData contents:");
    for (let [key, value] of formData.entries()) {
        console.log("uploadMediaToRoom: FormData entry -", key, value);
    }
    // --- --- ---

    // --- OPTION 2: Explicitly configure the request to force correct Content-Type ---
    const config = { // <-- KEEP THIS EXISTING DECLARATION
      headers: {
        'Content-Type': undefined, // Force Axios to auto-set multipart/form-data
        // Other headers like 'Authorization' will still be added by the request interceptor.
      }
      // Add onUploadProgress to THIS EXISTING config object
      // onUploadProgress: (progressEvent) => { ... } // <-- WILL BE ADDED BELOW
    };

    // --- ADD onUploadProgress to the EXISTING config object ---
    // Check if a callback function was provided
    if (typeof onUploadProgressCallback === 'function') {
      // Add the onUploadProgress property to the config object
      config.onUploadProgress = (progressEvent) => { // <-- ADD PROPERTY TO EXISTING 'config'
        // Check if the progress event is computable
        if (progressEvent && progressEvent.lengthComputable) {
          // Calculate the percentage completed
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          // Log the progress (for debugging)
          console.log(`uploadMediaToRoom: Upload progress: ${percentCompleted}%`);
          // Call the provided callback function with the progress percentage
          onUploadProgressCallback(percentCompleted); // <-- TRIGGER THE CALLBACK
        }
      };
    }
    // --- --- ---

    console.log(`uploadMediaToRoom: About to send POST request to /api/rooms/${roomId}/upload`);
    const response = await apiClient.post(`/api/rooms/${roomId}/upload`, formData, config); // <-- PASS THE (UPDATED) CONFIG
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