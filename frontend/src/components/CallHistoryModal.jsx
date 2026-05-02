// frontend/src/components/CallHistoryModal.jsx
import React, { useState, useEffect } from 'react';
import {
  XMarkIcon,
  PhoneIcon,
  PhoneArrowUpRightIcon,
  PhoneArrowDownLeftIcon,
  PhoneXMarkIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';
import axios from 'axios';

const CallHistoryModal = ({ isOpen, onClose, currentUser, onCallUser }) => {
  const [callHistory, setCallHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all', 'incoming', 'outgoing', 'missed', 'declined'
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchCallHistory();
    }
  }, [isOpen]);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';

  const fetchCallHistory = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${apiUrl}/api/lobby/call-history`, {
        withCredentials: true
      });
      setCallHistory(response.data.calls || []);
    } catch (err) {
      console.error('Error fetching call history:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Group calls by date
  const groupCallsByDate = (calls) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const groups = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: []
    };

    calls.forEach(call => {
      const callDate = new Date(call.created_at);
      callDate.setHours(0, 0, 0, 0);

      if (callDate.getTime() === today.getTime()) {
        groups.today.push(call);
      } else if (callDate.getTime() === yesterday.getTime()) {
        groups.yesterday.push(call);
      } else if (callDate >= new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)) {
        groups.thisWeek.push(call);
      } else {
        groups.older.push(call);
      }
    });

    return groups;
  };

  // Filter calls
  const filteredCalls = callHistory.filter(call => {
    // Search filter
    const searchMatch = call.other_user?.username?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Type filter
    let typeMatch = true;
    if (filterType !== 'all') {
      typeMatch = call.call_type === filterType;
    }

    return searchMatch && typeMatch;
  });

  const groupedCalls = groupCallsByDate(filteredCalls);

  const getCallIcon = (callType) => {
    switch (callType) {
      case 'outgoing':
        return <PhoneArrowUpRightIcon className="h-5 w-5 text-green-500" />;
      case 'incoming':
        return <PhoneArrowDownLeftIcon className="h-5 w-5 text-blue-500" />;
      case 'missed':
        return <PhoneXMarkIcon className="h-5 w-5 text-red-500" />;
      case 'declined':
        return <PhoneXMarkIcon className="h-5 w-5 text-orange-500" />;
      default:
        return <PhoneIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const getCallTypeLabel = (callType) => {
    switch (callType) {
      case 'outgoing':
        return 'Outgoing';
      case 'incoming':
        return 'Incoming';
      case 'missed':
        return 'Missed';
      case 'declined':
        return 'Declined';
      default:
        return 'Call';
    }
  };

  const getCallTypeColor = (callType) => {
    switch (callType) {
      case 'outgoing':
        return 'text-green-400';
      case 'incoming':
        return 'text-blue-400';
      case 'missed':
        return 'text-red-400';
      case 'declined':
        return 'text-orange-400';
      default:
        return 'text-gray-400';
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return null;
    
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const renderCallGroup = (title, calls) => {
    if (calls.length === 0) return null;

    return (
      <div className="mb-6">
        <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3 px-4">
          {title}
        </h3>
        <div className="space-y-2">
          {calls.map((call) => (
            <div
              key={call.id}
              className="px-4 py-3 hover:bg-gray-700/30 transition-colors cursor-pointer"
              onClick={() => {
                if (call.other_user && onCallUser) {
                  onCallUser(call.other_user);
                  onClose();
                }
              }}
            >
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  {call.other_user?.avatar_url ? (
                    <img
                      src={call.other_user.avatar_url.startsWith('http') 
                        ? call.other_user.avatar_url 
                        : `${apiUrl}${call.other_user.avatar_url}`}
                      alt={call.other_user.username}
                      className="w-12 h-12 rounded-full object-cover"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = '/icons/user1avatar.svg';
                      }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white font-bold text-lg">
                      {call.other_user?.username?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                  
                  {/* Call type icon badge */}
                  <div className="absolute -bottom-1 -right-1 bg-gray-800 rounded-full p-1">
                    {getCallIcon(call.call_type)}
                  </div>
                </div>

                {/* Call info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-white font-medium truncate">
                      {call.other_user?.username || 'Unknown User'}
                    </h4>
                    <span className="text-gray-500 text-xs flex-shrink-0 ml-2">
                      {formatTime(call.created_at)}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-sm ${getCallTypeColor(call.call_type)}`}>
                      {getCallTypeLabel(call.call_type)}
                    </span>
                    
                    {call.duration && (
                      <>
                        <span className="text-gray-600">•</span>
                        <span className="text-gray-400 text-sm flex items-center gap-1">
                          <ClockIcon className="h-4 w-4" />
                          {formatDuration(call.duration)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Call back button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (call.other_user && onCallUser) {
                      onCallUser(call.other_user);
                      onClose();
                    }
                  }}
                  className="flex-shrink-0 w-10 h-10 rounded-full bg-green-600 hover:bg-green-700 flex items-center justify-center transition-colors"
                >
                  <PhoneIcon className="h-5 w-5 text-white" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Modal */}
        <div 
          className="bg-[#2B2B2B] rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-[#2B2B2B] border-b border-gray-700 px-6 py-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <PhoneIcon className="h-6 w-6 text-purple-500" />
              <h2 className="text-xl font-bold text-white">Call History</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Search & Filter */}
          <div className="px-6 py-4 border-b border-gray-700 space-y-3">
            {/* Search bar */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search calls..."
                className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Filter buttons */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex-shrink-0 ${
                  filterType === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType('incoming')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 flex-shrink-0 ${
                  filterType === 'incoming'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <PhoneArrowDownLeftIcon className="h-4 w-4" />
                Incoming
              </button>
              <button
                onClick={() => setFilterType('outgoing')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 flex-shrink-0 ${
                  filterType === 'outgoing'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <PhoneArrowUpRightIcon className="h-4 w-4" />
                Outgoing
              </button>
              <button
                onClick={() => setFilterType('missed')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 flex-shrink-0 ${
                  filterType === 'missed'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <PhoneXMarkIcon className="h-4 w-4" />
                Missed
              </button>
              <button
                onClick={() => setFilterType('declined')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 flex-shrink-0 ${
                  filterType === 'declined'
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <PhoneXMarkIcon className="h-4 w-4" />
                Declined
              </button>
            </div>
          </div>

          {/* Call list */}
          <div className="flex-1 overflow-y-auto custom-sleek-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-gray-400">Loading call history...</div>
              </div>
            ) : filteredCalls.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center px-4">
                <PhoneIcon className="h-16 w-16 text-gray-600 mb-4" />
                <p className="text-gray-400 text-lg font-medium">No calls yet</p>
                <p className="text-gray-500 text-sm mt-2">
                  {searchTerm || filterType !== 'all' 
                    ? 'Try adjusting your filters'
                    : 'Start calling your friends from the chat!'}
                </p>
              </div>
            ) : (
              <div className="py-4">
                {renderCallGroup('Today', groupedCalls.today)}
                {renderCallGroup('Yesterday', groupedCalls.yesterday)}
                {renderCallGroup('This Week', groupedCalls.thisWeek)}
                {renderCallGroup('Older', groupedCalls.older)}
              </div>
            )}
          </div>

          {/* Footer stats */}
          <div className="border-t border-gray-700 px-6 py-3 bg-gray-800/50">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">
                Total calls: <span className="text-white font-medium">{filteredCalls.length}</span>
              </span>
              <span className="text-gray-400">
                Missed: <span className="text-red-400 font-medium">
                  {filteredCalls.filter(c => c.call_type === 'missed').length}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default CallHistoryModal;
