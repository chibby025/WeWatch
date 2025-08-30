// WeWatch/frontend/src/components/RoomPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
// Import API service functions
import { getRoom, getMediaItemsForRoom, uploadMediaToRoom, getRoomMembers } from '../services/api';
// Import the VideoPlayer component
import VideoPlayer from './VideoPlayer'; // Adjust path if needed
import MemberList from './MemberList';
//import UploadSection from './UploadSection';
//import MediaItemList from './MediaItemList'; // Your existing media list component
// Import Heroicons
import {
  ChevronDownIcon,
  ArrowLeftIcon,
  PlusIcon,
  ArrowUpTrayIcon, // <-- REPLACED UploadIcon with ArrowUpTrayIcon
  PlayIcon,
  UserIcon,
  CalendarIcon,
  ServerIcon
} from '@heroicons/react/24/outline';
import { FilmIcon } from '@heroicons/react/24/solid'; // Solid icon for media placeholder
import jwtDecodeUtil from '../utils/jwt';
import ChatPanel from './ChatPanel';


const RoomPage = () => {
  const { id: roomId } = useParams(); // Get the room ID from the URL (:id)
  const navigate = useNavigate();

  // --- Room State ---
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- Media Items State ---
  const [mediaItems, setMediaItems] = useState([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState(null);
  const [isMediaPanelOpen, setIsMediaPanelOpen] = useState(false); // State for collapsible panel

  // --- Upload State (Moved inside RoomPage) ---
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // --- Playback State ---
  const [selectedMediaItem, setSelectedMediaItem] = useState(null); // State for the currently selected/playing media item

  // --- NEW: Host/Controller State ---
  const [authenticatedUserID, setAuthenticatedUserID] = useState(null); // State for the authenticated user's ID
  const [isHost, setIsHost] = useState(false); // State to track if current user is the room host
  // --- --- ---

  // --- WebSocket State ---
  const [ws, setWs] = useState(null); // State for the WebSocket connection object
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState(null);

  // --- Refs ---
  const wsRef = useRef(null); // Ref to hold the WebSocket connection object (alternative to state)

  const [isMembersPanelOpen, setIsMembersPanelOpen] = useState(false);
  const [roomMembers, setRoomMembers] = useState([])

  // --- EFFECTS ---

  // Fetch Room Data
  useEffect(() => {
    const fetchRoomData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getRoom(roomId);
        console.log(`Fetched room ${roomId}:`, data);
        setRoom(data.room);
      } catch (err) {
        console.error(`Error fetching room ${roomId}:`, err);
        if (err.response && err.response.status === 404) {
            setError('Room not found.');
        } else {
            setError('Failed to load room details. Please try again later.');
        }
      } finally {
        setLoading(false);
      }
    };

    if (roomId) {
        fetchRoomData();
    } else {
        setError('Invalid room ID.');
        setLoading(false);
    }
  }, [roomId]); // Dependency array includes 'roomId' so it re-fetches if the ID changes

  
  // Fetch Media Items for the Room
  useEffect(() => {
    const fetchMediaItems = async () => {
        setMediaLoading(true);
        setMediaError(null);
        try {
            // Assuming getMediaItemsForRoom returns the array directly
            // Adjust based on your actual API response structure
            const mediaData = await getMediaItemsForRoom(roomId);
            console.log(`Fetched media items for room ${roomId}:`, mediaData);
            setMediaItems(Array.isArray(mediaData) ? mediaData : []);
        } catch (err) {
            console.error(`Error fetching media items for room ${roomId}:`, err);
            setMediaError('Failed to load media items.');
            setMediaItems([]); // Clear items on error
        } finally {
            setMediaLoading(false);
        }
    };

    if (roomId) {
        fetchMediaItems();
    }
  }, [roomId]); // Dependency array includes 'roomId' so it re-fetches if the ID changes

  // --- WebSocket Connection Effect ---
useEffect(() => {
  // 1. Check if we have a valid room ID and a user is authenticated
  if (!roomId) {
    console.log("WebSocket Effect: No room ID, skipping WebSocket connection.");
    return;
  }

  // 2. Get the JWT token from localStorage (assuming it's stored there after login)
  const token = localStorage.getItem('wewatch_token');
  if (!token) {
    console.log("WebSocket Effect: No JWT token found, skipping WebSocket connection.");
    setWsError("Authentication required for WebSocket connection.");
    return;
  }

  // 3. Construct the WebSocket URL with the room ID and JWT token
  const wsUrl = `ws://localhost:8080/api/rooms/${roomId}/ws?token=${encodeURIComponent(token)}`;
  console.log("WebSocket Effect: Attempting to connect to:", wsUrl);

  // 4. Create the WebSocket connection
  const websocket = new WebSocket(wsUrl);

  // 5. Set the WebSocket connection object in state and ref
  setWs(websocket);
  wsRef.current = websocket;

  // 6. Define WebSocket event handlers (only connection events, NOT message parsing)
  const handleOpen = () => {
    console.log("WebSocket Effect: Connection opened successfully.")
    setWsConnected(true);
    setWsError(null);
  };

  const handleError = (event) => {
    console.error("WebSocket Effect: Connection error:", event);
    setWsError("WebSocket connection error.");
    setWsConnected(false);
  };

  const handleClose = (event) => {
    console.log("WebSocket Effect: Connection closed:", event.code, event.reason);
    setWsConnected(false);
    setWsError(null);
  };

  // 7. Attach event listeners to the WebSocket connection
  websocket.addEventListener('open', handleOpen);
  websocket.addEventListener('error', handleError);
  websocket.addEventListener('close', handleClose);

  // 8. Cleanup function (runs when effect re-runs or component unmounts)
  return () => {
  console.log("WebSocket Effect: Cleanup function running.")
  // Remove event listeners to prevent memory leaks
  websocket.removeEventListener('open', handleOpen);
  websocket.removeEventListener('error', handleError);
  websocket.removeEventListener('close', handleClose);

  // Close the WebSocket connection if it's open
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    console.log("WebSocket Effect: Closing WebSocket connection.");
    websocket.close();
  }

  // Clear state/ref
  setWs(null);
  wsRef.current = null;
  setWsConnected(false);
  setWsError(null);
};

}, [roomId]); // Dependency array includes 'roomId' so it re-connects if the ID changes

  
  // Fetch Authenticated User ID
  useEffect(() => {
  const fetchAuthenticatedUser = async () => {
    try {
      // Get the JWT token from localStorage
      const token = localStorage.getItem('wewatch_token');
      if (!token) {
        console.log("No JWT token found for authenticated user");
        return;
      }

      // Decode the JWT token to get the user ID
      const decodedToken = jwtDecodeUtil(token);
      const userId = decodedToken.user_id;
      console.log("Authenticated user ID:", userId);
      
      setAuthenticatedUserID(userId);
      
      // If room is already loaded, check if this user is the host
      if (room) {
        setIsHost(room.host_id === userId);
      }
    } catch (err) {
      console.error("Error decoding JWT token:", err);
    }
  };

  fetchAuthenticatedUser();
}, []); // Run once on mount

// --- NEW: Update host status when room or authenticated user changes ---
useEffect(() => {
  if (room && authenticatedUserID !== null) {
    setIsHost(room.host_id === authenticatedUserID);
  }
}, [room, authenticatedUserID]);

// Add this effect after your existing useEffects
useEffect(() => {
  // This effect runs when isMembersPanelOpen changes to true
  if (isMembersPanelOpen && roomId) {
    const fetchRoomMembers = async () => {
      try {
        const membersData = await getRoomMembers(roomId);
        console.log(`Fetched room members for room ${roomId}:`, membersData);
        setRoomMembers(membersData.members || []);
      } catch (err) {
        console.error("Error fetching room members:", err);
        setRoomMembers([]);
      }
    };
    
    fetchRoomMembers();
  }
}, [isMembersPanelOpen, roomId]);


// Add this useEffect to automatically join the room when component mounts
useEffect(() => {
  if (roomId && authenticatedUserID && !isMembersPanelOpen) {
    // Auto-join the room if not already joined
    const autoJoinRoom = async () => {
      try {
        // await joinRoom(roomId);
        console.log("Auto-joining room:", roomId);
        // The join logic should be handled by your backend
      } catch (err) {
        console.error("Auto-join failed:", err);
      }
    };
    
    autoJoinRoom();
  }
}, [roomId, authenticatedUserID]);
  
  // --- EVENT HANDLERS ---

  // Handle file selection for upload (MOVED INSIDE RoomPage)
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      console.log("File selected for upload:", file.name);
      setSelectedFile(file);
      setUploadError(null); // Clear previous upload errors
      setUploadProgress(0); // Reset progress when new file is selected
    } else {
      setSelectedFile(null);
      setUploadProgress(0); // Reset progress if no file selected
    }
  };

  // Handle file upload submission (MOVED INSIDE RoomPage)
  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError("Please select a file to upload.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadProgress(0); //Reset Progress at start

    try {
      console.log(`Uploading ${selectedFile.name} to room ${roomId}...`);
      // --- CALL uploadMediaToRoom with the selectedFile OBJECT and progress callback ---
      console.log("handleUpload: About to call uploadMediaToRoom with:", { roomId, selectedFile });
      console.log("handleUpload: Type of selectedFile:", typeof selectedFile);
      console.log("handleUpload: Is selectedFile a File instance?", selectedFile instanceof File);
      if (selectedFile) {
        console.log("handleUpload: Selected file details - Name:", selectedFile.name, "Size:", selectedFile.size);
      }     
      const uploadData = await uploadMediaToRoom(roomId, selectedFile, (progressEvent) => {
        // --- HANDLE UPLOAD PROGRESS ---
        if (progressEvent.lengthComputable) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          console.log(`Upload progress: ${percentCompleted}%`);
          setUploadProgress(percentCompleted); // Update progress state
        }
        // --- --- ---
      });
      
      console.log("Upload successful:", uploadData);
      alert(`Upload successful!`);

      // Clear the selected file state
      setSelectedFile(null);
      setUploadProgress(0); // Reset progress on success
      // Clear the file input field (optional)
      const fileInput = document.getElementById('fileInput');
      if (fileInput) {
      fileInput.value = ''; // Clear the file input field
      console.log("handleUpload: File input field cleared."); // Optional: Log for confirmation
      } else {
        console.warn("handleUpload: Could not find file input element with ID 'fileInput' to clear."); // Optional: Warn if not found
      }

      // Refresh the media items list to show the newly uploaded item
      const updatedMediaData = await getMediaItemsForRoom(roomId);
      setMediaItems(Array.isArray(updatedMediaData) ? updatedMediaData : []);

    } catch (err) {
      console.error("Upload failed:", err);
      if (err.response) {
        // Server responded with an error status (4xx, 5xx)
        setUploadError(`Upload failed: ${err.response.data.error || err.response.statusText}`);
      } else if (err.request) {
        // Request was made but no response received (network issue)
        setUploadError('Network error. Please check your connection.');
      } else {
        // Something else happened in setting up the request
        setUploadError('An unexpected error occurred during upload.');
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Update your handlePlayMedia function to be simpler and more reliable
const handlePlayMedia = (mediaItemId) => {
  console.log(`handlePlayMedia: Play button clicked for media item ID ${mediaItemId}`);

  if (!mediaItemId) {
    console.error("handlePlayMedia: Invalid media item ID provided:", mediaItemId);
    alert("Error: Invalid media item selected.");
    return;
  }

  // Find the media item object from the list using its ID
  const itemToPlay = mediaItems.find(item => item.ID === mediaItemId);
  if (!itemToPlay) {
    console.error(`handlePlayMedia: Media item with ID ${mediaItemId} not found in the current list.`, mediaItems);
    alert(`Error: Media item (ID: ${mediaItemId}) not found. It might have been deleted or the list hasn't refreshed.`);
    return;
  }

  // Update the selected media item state
  setSelectedMediaItem(itemToPlay);
  console.log(`handlePlayMedia: Selected media item updated:`, itemToPlay);

  // Send Playback Command via WebSocket (if connected and user is host)
  if (!isHost) {
    console.log("handlePlayMedia: Not sending WebSocket command (user is not host).");
    alert("Only the room host can control playback.");
    return;
  }

  if (!wsConnected || !wsRef.current) {
    console.log("handlePlayMedia: Not sending WebSocket command (not connected or no WebSocket reference).");
    setWsError("WebSocket connection required for playback control.");
    return;
  }

  if (wsRef.current.readyState !== WebSocket.OPEN) {
    console.warn("handlePlayMedia: WebSocket connection is not open. Cannot send play command.");
    setWsError("WebSocket connection is not open. Cannot send play command.");
    return;
  }

  // Construct and send the playback command
  const playCommand = {
    type: "playback_control",
    command: "play",
    media_item_id: mediaItemId,
    timestamp: Date.now(),
  };

  wsRef.current.send(JSON.stringify(playCommand));
  console.log("handlePlayMedia: Sent playback command via WebSocket:", playCommand);
};

  



  // Toggle the visibility of the media items panel
  const toggleMediaPanel = () => {
    setIsMediaPanelOpen(!isMediaPanelOpen);
  };

  // --- RENDERING ---

  if (loading) {
    return (
      <div className="container mx-auto p-4 flex justify-center items-center h-64">
        {/* --- ADD LOADING SPINNER --- */}
        <div className="flex items-center">
          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-xl">Loading room details...</p>
        </div>
        {/* --- --- --- */}
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error! </strong>
          <span className="block sm:inline">{error}</span>
          <button
            onClick={() => navigate('/lobby')} // Go back to lobby list
            className="mt-2 bg-gray-500 hover:bg-gray-700 text-white font-bold py-1 px-2 rounded text-xs"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  if (!room) {
      // Shouldn't happen if loading/error are handled, but good practice
      return <div>Room data is unavailable.</div>;
  }

  return (
  <div className="container mx-auto p-4">
    {/* --- WebSocket Connection Status Display (NEW) --- */}
    <div className="mb-4 p-2 bg-gray-100 rounded text-sm">
      <p><span className="font-semibold">WebSocket Status:</span> 
        {wsConnected ? (
          <span className="text-green-600"> Connected</span>
        ) : (
          <span className="text-red-600"> Disconnected</span>
        )}
      </p>
      {wsError && <p className="text-red-500">Error: {wsError}</p>}
    </div>

    <div className="bg-white shadow-md rounded-lg p-6 mb-6">
      {/* --- Room Header --- */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">{room.name}</h1>
          <p className="text-gray-600 mt-2">{room.description || 'No description provided for this room.'}</p>
        </div>
        {/* --- replace back button text with icon --- */}
        <button
          onClick={() => navigate('/lobby')} // Navigate back to the lobby list
          className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-1 px-3 rounded text-sm"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-1" /> {/* Heroicon */}
          Back to Lobby
        </button>
        {/* --- --- --- */}
      </div>

      {/* --- Room Info Grid (Enhanced with Icons) --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600 mb-6">
        <div className="flex items-center">
          <UserIcon className="h-4 w-4 mr-2 text-gray-500" /> {/* Heroicon */}
          <span><span className="font-semibold">Host:</span> User {room.host_id}</span>
        </div>
        <div className="flex items-center">
          <CalendarIcon className="h-4 w-4 mr-2 text-gray-500" /> {/* Heroicon */}
          <span><span className="font-semibold">Created:</span> {new Date(room.created_at).toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <ServerIcon className="h-4 w-4 mr-2 text-gray-500" /> {/* Heroicon */}
            <span><span className="font-semibold">Status:</span> {room.media_file_name ? 'Media Loaded' : 'No Media'}</span>
          </div>
          <button
            onClick={() => setIsMembersPanelOpen(!isMembersPanelOpen)}
            className="flex items-center bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-full text-xs transition-colors duration-150"
          >
            <UserIcon className="h-3 w-3 mr-1" />
            <span>{roomMembers.length || 0} {roomMembers.length === 1 ? 'member' : 'members'}</span>
          </button>
        </div>
      </div>

      {isMembersPanelOpen && (
        <div className="mb-4">
          <MemberList 
            members={roomMembers} 
            onClose={() => setIsMembersPanelOpen(false)}
            isHost={isHost}
          />
        </div>
      )}

      {/* --- Main Video Player Area --- */}
      <div className="relative mb-6">
        {/* Pass the selectedMediaItem and WebSocket connection/status to VideoPlayer */}
        <VideoPlayer 
          mediaItem={selectedMediaItem}
          roomId={roomId}
          isHost = {isHost}  // Pass host status
          authenticatedUserID = {authenticatedUserID} // Pass authenticated User ID
          // --- NEW: Pass WebSocket connection and status to VideoPlayer ---
          ws={ws} // Pass the WebSocket connection object
          wsConnected={wsConnected} // Pass the connection status
          wsError={wsError} // Pass any WebSocket errors
          // --- --- ---
        />
      </div>

      

      {/* --- Collapsible Media Panel Toggle Button (Enhanced with Icon) --- */}
      <div className="flex justify-between items-center mb-4 mt-6">
        <h2 className="text-2xl font-semibold">Media in this Room</h2>
        <button
          onClick={toggleMediaPanel}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm flex items-center"
        >
          {isMediaPanelOpen ? 'Hide Media' : 'Show Media'}
          {/* --- REPLACE SVG WITH HEROICON --- */}
          <ChevronDownIcon className={`ml-2 w-4 h-4 transition-transform duration-200 ${isMediaPanelOpen ? 'rotate-180' : ''}`} />
          {/* --- --- --- */}
        </button>
      </div>

      {/* --- Collapsible Media Panel Content --- */}
      {isMediaPanelOpen && (
        <div className="border border-gray-200 rounded-lg p-4 mb-6 transition-all duration-300 ease-in-out">
          {/* --- Upload Media Section (Enhanced with Progress Bar) --- */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="text-lg font-medium text-blue-800 mb-2 flex items-center">
              <PlusIcon className="h-5 w-5 mr-2" /> {/* Heroicon */}
              Upload Media to this Room
            </h3>

            {/* File Input */}
            <div className="mb-3">
              <label htmlFor="fileInput" className="block text-sm font-medium text-gray-700 mb-1">
                Choose a video file:
              </label>
              <input
                type="file"
                id="fileInput"
                accept=".mp4,.avi,.mov,.mkv,.webm" // Restrict file types
                onChange={handleFileChange}
                disabled={uploading}
                className="block w-full text-sm text-gray-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-md file:border-0
                          file:text-sm file:font-semibold
                          file:bg-blue-50 file:text-blue-700
                          hover:file:bg-blue-100
                          disabled:opacity-50"
              />
            </div>

            {/* Upload Button & Status */}
            <div className="flex items-center">
              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                  !selectedFile || uploading
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                }`}
              >
                {/* --- ENHANCE BUTTON WITH ICON AND PROGRESS SPINNER --- */}
                {uploading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Uploading...
                  </>
                ) : (
                  <>
                    <ArrowUpTrayIcon className="h-4 w-4 mr-2" /> {/* Heroicon */}
                    Upload
                  </>
                )}
                {/* --- --- --- */}
              </button>

              {/* Optional: Display selected file name */}
              {selectedFile && (
                <span className="ml-3 text-sm text-gray-600 truncate max-w-xs md:max-w-md">
                  Selected: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                </span>
              )}
            </div>


            {/* --- ADD UPLOAD PROGRESS BAR --- */}
            {uploading && (
              <div className="mt-3 w-full">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Progress:</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              </div>
            )}
            {/* --- --- --- */}

            {/* Upload Error Message */}
            {uploadError && (
              <div className="mt-2 text-sm text-red-600">
                {uploadError}
              </div>
            )}
          </div>

          {/* --- Media Items List --- */}
          <div>
            <h3 className="text-lg font-medium text-gray-800 mb-2">Uploaded Files</h3>

            {/* Media Loading State (Enhanced with Spinner) */}
            {mediaLoading && (
              <div className="flex justify-center items-center h-32">
                {/* --- ADD LOADING SPINNER --- */}
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-lg">Loading media items...</p>
                </div>
                {/* --- --- --- */}
              </div>
            )}

            {/* Media Error State */}
            {mediaError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                <strong className="font-bold">Error: </strong>
                <span className="block sm:inline">{mediaError}</span>
              </div>
            )}

            {/* Media Items Display (Only if not loading and no error) */}
            {!mediaLoading && !mediaError && (
              <>
                {/* Check if there are media items */}
                {mediaItems && mediaItems.length > 0 ? (
                  <div className="overflow-y-auto max-h-96"> {/* Add scroll if list is long */}
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size (MB)</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uploader</th>
                          <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {/* Map over media items */}
                        {mediaItems.map((item) => (
                          <tr key={item.ID} className="hover:bg-gray-50"> {/* Use item.ID for key */}
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.original_name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{(item.file_size / (1024 * 1024)).toFixed(2)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">User {item.uploader_id}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <button
                                onClick={() => handlePlayMedia(item.ID)} // Use item.ID for onClick
                                className={`${
                                  selectedMediaItem && selectedMediaItem.ID === item.ID // Use item.ID for comparison
                                    ? 'text-blue-800 font-bold' 
                                    : 'text-indigo-600 hover:text-indigo-900'
                                    }flex items-center justify-end w-full`} // Change button style for selected item
                              >
                                {/* --- REPLACE TEXT WITH ICON --- */}
                                <PlayIcon className="h-4 w-4 mr-1" /> {/* Heroicon */}
                                
                                {/* --- --- --- */}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-10">
                    {/* --- ENHANCE EMPTY STATE WITH ICON --- */}
                    <FilmIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" /> {/* Heroicon */}
                    <p className="text-gray-500">No media items uploaded to this room yet.</p>
                    {/* --- --- --- */}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* --- Chat Panel (At Bottom) --- */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-2">Room Chat</h3>
        <div className="h-64"> {/* fixed height for chat panel */}
          <ChatPanel
            roomId={roomId}
            ws={ws}
            wsConnected={wsConnected}
            authenticatedUserID={authenticatedUserID}
            isHost={isHost}
          />
        </div>
      </div>
    </div>
  </div>
);
};

export default RoomPage;