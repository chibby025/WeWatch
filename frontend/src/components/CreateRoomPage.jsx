// WeWatch/frontend/src/components/CreateRoomPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom'; // For navigation after creation
import { createRoom } from '../services/api'; // Assume you'll create this function in api.js
import PersistentRoomInfoModal from './PersistentRoomInfoModal';
import EmojiPicker from 'emoji-picker-react';

const CreateRoomPage = () => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true); // ✅ Privacy toggle state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef(null);
  const navigate = useNavigate(); // Hook for programmatic navigation

  useEffect(() => {
    // Check if user has dismissed the info modal
    const hideInfo = localStorage.getItem('hidePersistentRoomInfo');
    if (!hideInfo) {
      setShowInfoModal(true);
    }
  }, []);

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
        setError('Room name is required.');
        return;
    }

    setLoading(true);
    setError(null);

    try {
      // Prepare data for the API call
      const roomData = { 
        name: name.trim(), 
        description,
        is_public: isPublic // ✅ Include privacy setting
      };

      // Call the createRoom function from the API service
      const data = await createRoom(roomData);
      console.log('Room created successfully:', data);
      console.log("👑 [CreateRoomPage] New Room Host ID:", data.room?.HostID);

      // Handle successful creation
      alert(`Room "${data.room.name}" created successfully!`);
      // Redirect to the newly created room's page (you'll need to implement the RoomPage component)
      // For now, let's redirect to a generic "rooms list" page or back to home
      navigate(`/rooms/${data.room.id}`); // Or '/rooms' if you make a list page first
      // navigate('/'); // Or back to home/dashboard

    } catch (err) {
      console.error('Error creating room:', err);
      // Handle errors from the API call (e.g., network issues, server errors, validation errors)
      if (err.response) {
        // Server responded with an error status (4xx, 5xx)
        setError(`Failed to create room: ${err.response.data.error || err.response.statusText}`);
      } else if (err.request) {
        // Request was made but no response received
        setError('Network error. Please check your connection.');
      } else {
        // Something else happened
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-2xl">
        {/* Card Container */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="bg-gradient-to-r from-green-500 to-green-700 text-white p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="bg-white bg-opacity-20 rounded-full p-2 sm:p-3">
                <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl sm:text-3xl font-bold">Create Persistent Room</h1>
                <p className="text-white text-opacity-90 mt-1 text-sm sm:text-base">
                  Build your community and monetize your content
                </p>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mx-4 sm:mx-6 mt-4 sm:mt-6 p-3 sm:p-4 bg-red-50 border-2 border-red-200 text-red-700 rounded-xl text-sm">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            </div>
          )}
          
          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 sm:space-y-6">
            {/* Room Name */}
            <div>
              <label htmlFor="roomName" className="block text-gray-900 text-sm font-bold mb-2">
                Room Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="roomName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="e.g., Comedy Night Live, Bible Study Hall, Gaming Arena"
                  className="w-full px-4 py-3 pr-12 text-gray-900 bg-gray-50 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50 transition-all text-sm sm:text-base"
                />
                {/* Emoji Picker Button */}
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  disabled={loading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-2xl hover:scale-110 transition-transform disabled:opacity-50"
                  title="Add emoji"
                >
                  😊
                </button>
                {/* Emoji Picker */}
                {showEmojiPicker && (
                  <div ref={emojiPickerRef} className="absolute left-0 top-full mt-2 z-50">
                    <EmojiPicker
                      onEmojiClick={(emojiData) => {
                        setName(prev => prev + emojiData.emoji);
                        setShowEmojiPicker(false);
                      }}
                      theme="light"
                      width={300}
                      height={400}
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1.5">Give your room a unique and memorable name</p>
            </div>
            
            {/* Description */}
            <div>
              <label htmlFor="roomDescription" className="block text-gray-900 text-sm font-bold mb-2">
                Description <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <textarea
                id="roomDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
                placeholder="Tell people what your room is about..."
                rows="3"
                maxLength="500"
                className="w-full px-4 py-3 text-gray-900 bg-gray-50 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50 resize-none transition-all text-sm sm:text-base"
              ></textarea>
              <div className="flex justify-between items-center mt-1.5">
                <p className="text-xs text-gray-500">Describe your content and community</p>
                <p className="text-xs text-gray-400">{description.length}/500</p>
              </div>
            </div>

            {/* Privacy Toggle */}
            <div>
              <label className="block text-gray-900 text-sm font-bold mb-3">Room Privacy</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  disabled={loading}
                  className={`relative p-4 rounded-xl border-2 transition-all duration-200 ${
                    isPublic
                      ? 'bg-green-50 border-green-500 shadow-md'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  } disabled:opacity-50`}
                >
                  <div className="flex flex-col items-center gap-2 text-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isPublic ? 'bg-green-500' : 'bg-gray-200'
                    }`}>
                      <svg className={`w-5 h-5 ${isPublic ? 'text-white' : 'text-gray-500'}`} fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 2a8 8 0 100 16 8 8 0 000-16zM8 11a1 1 0 100-2 1 1 0 000 2zm4 0a1 1 0 100-2 1 1 0 000 2z"/>
                      </svg>
                    </div>
                    <div>
                      <p className={`font-semibold text-sm ${isPublic ? 'text-green-700' : 'text-gray-700'}`}>
                        Public
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Anyone can join
                      </p>
                    </div>
                  </div>
                  {isPublic && (
                    <div className="absolute top-2 right-2">
                      <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </button>
                
                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  disabled={loading}
                  className={`relative p-4 rounded-xl border-2 transition-all duration-200 ${
                    !isPublic
                      ? 'bg-orange-50 border-orange-500 shadow-md'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  } disabled:opacity-50`}
                >
                  <div className="flex flex-col items-center gap-2 text-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      !isPublic ? 'bg-orange-500' : 'bg-gray-200'
                    }`}>
                      <svg className={`w-5 h-5 ${!isPublic ? 'text-white' : 'text-gray-500'}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
                      </svg>
                    </div>
                    <div>
                      <p className={`font-semibold text-sm ${!isPublic ? 'text-orange-700' : 'text-gray-700'}`}>
                        Private
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Invite-only
                      </p>
                    </div>
                  </div>
                  {!isPublic && (
                    <div className="absolute top-2 right-2">
                      <svg className="w-5 h-5 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {isPublic 
                  ? "🌍 Your room will appear in the lobby for everyone to discover"
                  : "🔒 Share the invite link to add members to your private room"}
              </p>
            </div>
            
            {/* Action Buttons */}
            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate(-1)}
                disabled={loading}
                className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl transition-colors duration-200 disabled:opacity-50 text-sm sm:text-base"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-green-700 hover:shadow-lg text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:transform-none text-sm sm:text-base"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating...
                  </span>
                ) : '✨ Create Room'}
              </button>
            </div>
          </form>

          {/* Footer Tip */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:py-4 border-t border-gray-200">
            <p className="text-xs sm:text-sm text-gray-600 text-center">
              💡 <span className="font-medium">Tip:</span> You can add media, set pricing, and invite members after creating your room
            </p>
          </div>
        </div>
      </div>

      {/* Info Modal */}
      <PersistentRoomInfoModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        onContinue={() => setShowInfoModal(false)}
      />
    </div>
  );
};

export default CreateRoomPage;