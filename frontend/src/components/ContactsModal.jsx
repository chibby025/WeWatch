// frontend/src/components/ContactsModal.jsx
import React, { useState, useEffect } from 'react';
import apiClient from '../services/api';
import Avatar from './Avatar';
import { resolveAvatarUrl } from '../utils/avatar';
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  PhoneIcon,
  ChatBubbleLeftIcon,
  UserMinusIcon,
  UserPlusIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';

const ContactsModal = ({ isOpen, onClose, currentUser, onCallUser, onChatUser }) => {
  const [activeTab, setActiveTab] = useState('friends'); // friends, pending, sent
  const [friends, setFriends] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // ✅ Fullscreen image modal state
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedUserName, setSelectedUserName] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'friends') {
        const response = await apiClient.get('/api/friendships/list');
        setFriends(response.data.friends || []);
      } else if (activeTab === 'pending') {
        const response = await apiClient.get('/api/friendships/requests/pending');
        setPendingRequests(response.data.requests || []);
      } else if (activeTab === 'sent') {
        const response = await apiClient.get('/api/friendships/requests/sent');
        setSentRequests(response.data.requests || []);
      }
    } catch (err) {
      console.error('Error fetching contacts:', err);
      setError('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptRequest = async (userId) => {
    try {
      await apiClient.post(`/api/friendships/accept/${userId}`);
      setSuccessMessage('Friend request accepted!');
      setTimeout(() => setSuccessMessage(''), 3000);
      fetchData();
    } catch (err) {
      console.error('Error accepting request:', err);
      setError('Failed to accept request');
    }
  };

  const handleRejectRequest = async (userId) => {
    try {
      await apiClient.post(`/api/friendships/reject/${userId}`);
      setSuccessMessage('Friend request rejected');
      setTimeout(() => setSuccessMessage(''), 3000);
      fetchData();
    } catch (err) {
      console.error('Error rejecting request:', err);
      setError('Failed to reject request');
    }
  };

  const handleRemoveFriend = async (userId) => {
    if (!confirm('Are you sure you want to remove this friend?')) return;
    
    try {
      await apiClient.delete(`/api/friendships/remove/${userId}`);
      setSuccessMessage('Friend removed');
      setTimeout(() => setSuccessMessage(''), 3000);
      fetchData();
    } catch (err) {
      console.error('Error removing friend:', err);
      setError('Failed to remove friend');
    }
  };

  const handleCancelRequest = async (userId) => {
    try {
      await apiClient.delete(`/api/friendships/remove/${userId}`);
      setSuccessMessage('Request cancelled');
      setTimeout(() => setSuccessMessage(''), 3000);
      fetchData();
    } catch (err) {
      console.error('Error cancelling request:', err);
      setError('Failed to cancel request');
    }
  };

  const filteredFriends = friends.filter(friend =>
    friend.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    friend.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPending = pendingRequests.filter(request =>
    request.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    request.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSent = sentRequests.filter(request =>
    request.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    request.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-gradient-to-br from-gray-900 to-black rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-purple-500/20">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <UserPlusIcon className="h-7 w-7" />
              My Contacts
            </h2>
            <p className="text-purple-100 text-sm mt-1">
              {activeTab === 'friends' && `${friends.length} friends`}
              {activeTab === 'pending' && `${pendingRequests.length} pending requests`}
              {activeTab === 'sent' && `${sentRequests.length} sent requests`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Success/Error Messages */}
        {successMessage && (
          <div className="bg-green-500/20 border-l-4 border-green-500 p-4 m-4 rounded">
            <p className="text-green-400 flex items-center gap-2">
              <CheckCircleIcon className="h-5 w-5" />
              {successMessage}
            </p>
          </div>
        )}
        {error && (
          <div className="bg-red-500/20 border-l-4 border-red-500 p-4 m-4 rounded">
            <p className="text-red-400 flex items-center gap-2">
              <XCircleIcon className="h-5 w-5" />
              {error}
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-700 bg-gray-900/50 px-4">
          <button
            onClick={() => setActiveTab('friends')}
            className={`px-6 py-3 font-semibold transition-all relative ${
              activeTab === 'friends'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Friends
            {friends.length > 0 && (
              <span className="ml-2 bg-purple-500 text-white text-xs px-2 py-0.5 rounded-full">
                {friends.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-6 py-3 font-semibold transition-all relative ${
              activeTab === 'pending'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Pending
            {pendingRequests.length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full animate-pulse">
                {pendingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('sent')}
            className={`px-6 py-3 font-semibold transition-all relative ${
              activeTab === 'sent'
                ? 'text-purple-400 border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Sent
            {sentRequests.length > 0 && (
              <span className="ml-2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
                {sentRequests.length}
              </span>
            )}
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 bg-gray-900/30">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none"
            />
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[50vh] p-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
              <p className="text-gray-400 mt-4">Loading...</p>
            </div>
          ) : (
            <>
              {/* Friends List */}
              {activeTab === 'friends' && (
                <div className="space-y-3">
                  {filteredFriends.length === 0 ? (
                    <div className="text-center py-12">
                      <UserPlusIcon className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400 text-lg">
                        {searchQuery ? 'No friends found' : 'No friends yet'}
                      </p>
                      <p className="text-gray-500 text-sm mt-2">
                        {searchQuery ? 'Try a different search' : 'Add friends to see them here'}
                      </p>
                    </div>
                  ) : (
                    filteredFriends.map((friend) => (
                      <div
                        key={friend.id}
                        className="bg-gradient-to-r from-gray-800/80 to-gray-800/40 p-4 rounded-xl border border-gray-700 hover:border-purple-500/50 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar
                              user={friend}
                              onClick={() => {
                                setSelectedImage(resolveAvatarUrl(friend.profile_picture || friend.avatar_url));
                                setSelectedUserName(friend.display_name || friend.username);
                                setIsImageModalOpen(true);
                              }}
                              className="w-12 h-12 rounded-full object-cover border-2 border-purple-500 cursor-pointer hover:border-purple-300 transition-all"
                            />
                            <div>
                              <h3 className="text-white font-semibold">
                                {friend.display_name || friend.username}
                              </h3>
                              <p className="text-gray-400 text-sm">@{friend.username}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {onCallUser && (
                              <button
                                onClick={() => {
                                  onCallUser(friend);
                                  onClose();
                                }}
                                className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                                title="Call"
                              >
                                <PhoneIcon className="h-5 w-5" />
                              </button>
                            )}
                            {onChatUser && (
                              <button
                                onClick={() => {
                                  onChatUser(friend);
                                  onClose();
                                }}
                                className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                                title="Chat"
                              >
                                <ChatBubbleLeftIcon className="h-5 w-5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleRemoveFriend(friend.id)}
                              className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                              title="Remove Friend"
                            >
                              <UserMinusIcon className="h-5 w-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Pending Requests */}
              {activeTab === 'pending' && (
                <div className="space-y-3">
                  {filteredPending.length === 0 ? (
                    <div className="text-center py-12">
                      <ClockIcon className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400 text-lg">No pending requests</p>
                      <p className="text-gray-500 text-sm mt-2">
                        Friend requests will appear here
                      </p>
                    </div>
                  ) : (
                    filteredPending.map((request) => (
                      <div
                        key={request.id}
                        className="bg-gradient-to-r from-yellow-900/30 to-gray-800/40 p-4 rounded-xl border border-yellow-500/30"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar
                              user={request}
                              className="w-12 h-12 rounded-full object-cover border-2 border-yellow-500"
                            />
                            <div>
                              <h3 className="text-white font-semibold">
                                {request.display_name || request.username}
                              </h3>
                              <p className="text-gray-400 text-sm">@{request.username}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAcceptRequest(request.id)}
                              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                              <CheckCircleIcon className="h-5 w-5" />
                              Accept
                            </button>
                            <button
                              onClick={() => handleRejectRequest(request.id)}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                              <XCircleIcon className="h-5 w-5" />
                              Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Sent Requests */}
              {activeTab === 'sent' && (
                <div className="space-y-3">
                  {filteredSent.length === 0 ? (
                    <div className="text-center py-12">
                      <ClockIcon className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400 text-lg">No sent requests</p>
                      <p className="text-gray-500 text-sm mt-2">
                        Requests you send will appear here
                      </p>
                    </div>
                  ) : (
                    filteredSent.map((request) => (
                      <div
                        key={request.id}
                        className="bg-gradient-to-r from-blue-900/30 to-gray-800/40 p-4 rounded-xl border border-blue-500/30"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar
                              user={request}
                              className="w-12 h-12 rounded-full object-cover border-2 border-blue-500"
                            />
                            <div>
                              <h3 className="text-white font-semibold">
                                {request.display_name || request.username}
                              </h3>
                              <p className="text-gray-400 text-sm">@{request.username}</p>
                              <p className="text-blue-400 text-xs flex items-center gap-1 mt-1">
                                <ClockIcon className="h-3 w-3" />
                                Waiting for response
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleCancelRequest(request.id)}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* ✅ Fullscreen Image Modal */}
      {isImageModalOpen && (
        <div
          className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4"
          onClick={() => setIsImageModalOpen(false)}
        >
          <div className="relative max-w-4xl w-full">
            {/* Close Button */}
            <button
              onClick={() => setIsImageModalOpen(false)}
              className="absolute top-4 right-4 bg-gray-800/80 hover:bg-gray-700 text-white p-3 rounded-full transition-colors z-10"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
            
            {/* User Name */}
            <div className="absolute top-4 left-4 bg-gray-800/80 px-4 py-2 rounded-lg z-10">
              <p className="text-white font-semibold">{selectedUserName}</p>
            </div>
            
            {/* Image */}
            <img
              src={selectedImage}
              alt={selectedUserName}
              className="w-full h-auto max-h-[85vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactsModal;
