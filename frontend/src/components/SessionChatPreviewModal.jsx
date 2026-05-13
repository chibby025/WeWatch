// Session Chat Preview Modal
// Shows read-only chat messages from a session with infinite scroll
import React, { useState, useEffect, useRef } from 'react';
import { XMarkIcon, ChatBubbleLeftIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import Avatar from './Avatar';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

const SessionChatPreviewModal = ({ isOpen, onClose, sessionId, sessionTitle }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  
  const LIMIT = 20; // Load 20 messages at a time

  // Fetch initial messages
  useEffect(() => {
    if (isOpen && sessionId) {
      fetchMessages(true);
    }
  }, [isOpen, sessionId]);

  const fetchMessages = async (isInitial = false) => {
    if (loading) return;
    
    setLoading(true);
    
    try {
      const currentOffset = isInitial ? 0 : offset;
      const response = await axios.get(
        `${API_BASE_URL}/api/sessions/${sessionId}/chat-preview`,
        {
          params: {
            limit: LIMIT,
            offset: currentOffset
          }
        }
      );
      
      const newMessages = response.data.messages || [];
      const total = response.data.total_count || 0;
      
      if (isInitial) {
        setMessages(newMessages);
        setOffset(newMessages.length);
        setTotalCount(total);
        // Scroll to bottom on initial load
        setTimeout(() => scrollToBottom(), 100);
      } else {
        // Prepend older messages (infinite scroll up)
        setMessages(prev => [...newMessages, ...prev]);
        setOffset(prev => prev + newMessages.length);
      }
      
      // Check if there are more messages
      setHasMore(currentOffset + newMessages.length < total);
      
    } catch (error) {
      console.error('❌ [ChatPreview] Failed to fetch messages:', error);
      if (error.response?.status === 403) {
        // Chat preview disabled
        setMessages([]);
        setHasMore(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Handle scroll for infinite loading (load more when scrolling up)
  const handleScroll = (e) => {
    const { scrollTop } = e.target;
    
    // If user scrolls to top and there are more messages
    if (scrollTop === 0 && hasMore && !loading) {
      fetchMessages(false);
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-fade-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ChatBubbleLeftIcon className="w-6 h-6" />
            <div>
              <h3 className="font-bold text-lg">Session Chat</h3>
              {sessionTitle && (
                <p className="text-sm text-purple-100">{sessionTitle}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Messages Container */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 dark:bg-gray-900"
        >
          {/* Loading indicator at top */}
          {loading && offset > 0 && (
            <div className="flex justify-center py-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
            </div>
          )}

          {/* Messages */}
          {messages.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
              <ChatBubbleLeftIcon className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">No messages yet</p>
              <p className="text-sm">Be the first to chat in this session!</p>
            </div>
          ) : (
            <>
              {messages.map((msg, index) => (
                <div key={msg.id || index} className="flex gap-3 items-start">
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    <Avatar
                      user={msg.user || { username: msg.username }}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  </div>
                  
                  {/* Message Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {msg.username}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatTimestamp(msg.created_at)}
                      </span>
                    </div>
                    <p className="text-gray-700 dark:text-gray-300 break-words mt-1">
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-b-2xl border-t border-gray-200 dark:border-gray-700">
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            {totalCount > 0 && (
              <p>
                Showing {messages.length} of {totalCount} messages
                {hasMore && ' • Scroll up to load more'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionChatPreviewModal;
