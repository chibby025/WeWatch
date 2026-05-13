// frontend/src/components/PrivateChatModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { getPrivateMessages } from '../services/api';
import Avatar from './Avatar';

export default function PrivateChatModal({ 
  otherUser, 
  messages = [], 
  onSendMessage, 
  onBack, 
  onClose,
  currentUser, // ✅ Add this
  onMarkAsRead // ✅ Callback to mark messages as read
}) {
  const [input, setInput] = useState('');
  const [fetchedMessages, setFetchedMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const hasFetchedRef = useRef(false); // ✅ Prevent re-fetching on every render

  // 🔥 Fetch messages from backend when modal opens (ONCE)
  useEffect(() => {
    const fetchMessages = async () => {
      if (!otherUser?.id || !currentUser?.id || hasFetchedRef.current) return;
      
      hasFetchedRef.current = true;
      
      try {
        const response = await getPrivateMessages(otherUser.id);
        setFetchedMessages(response.data.messages || []);
        
        // ✅ Mark all messages from this user as read when modal opens
        if (onMarkAsRead) {
          onMarkAsRead(otherUser.id);
        }
      } catch (error) {
        console.error('💬 [PrivateChatModal] Error fetching messages:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchMessages();
  }, [otherUser?.id, currentUser?.id]);

  // ✅ Mark messages as read when new real-time messages arrive (modal is open)
  useEffect(() => {
    if (messages.length > 0 && onMarkAsRead && otherUser?.id) {
      onMarkAsRead(otherUser.id);
    }
  }, [messages.length, otherUser?.id]); // ✅ Removed onMarkAsRead from dependencies

  // ✅ Deduplicate messages: Filter out optimistic messages that are already in fetchedMessages
  const allMessages = (() => {
    const deduped = [...fetchedMessages];
    const fetchedIds = new Set(fetchedMessages.map(m => m.ID || m.id));
    
    console.log('🔍 [PrivateChatModal] Deduplication:', {
      fetchedCount: fetchedMessages.length,
      realtimeCount: messages.length,
      fetchedIds: Array.from(fetchedIds),
      fetchedMessages: fetchedMessages.map(m => ({ id: m.ID || m.id, message: m.Message || m.message })),
      realtimeMessages: messages.map(m => ({ id: m.ID || m.id, message: m.Message || m.message, isOptimistic: m._optimistic }))
    });
    
    // Only add real-time messages that aren't already in fetched messages
    messages.forEach(msg => {
      const msgId = msg.ID || msg.id;
      const isOptimistic = msg._optimistic;
      
      // Skip if already fetched from backend (unless it's optimistic and not saved yet)
      if (!isOptimistic && msgId && fetchedIds.has(msgId)) {
        console.log('⏭️ [PrivateChatModal] Skipping duplicate message ID:', msgId);
        return;
      }
      
      // Add unique real-time messages
      console.log('✅ [PrivateChatModal] Adding real-time message:', { id: msgId, isOptimistic, message: msg.Message || msg.message });
      deduped.push(msg);
    });
    
    console.log('📊 [PrivateChatModal] Final deduped count:', deduped.length);
    return deduped;
  })();
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages]);

  const handleSubmit = () => {
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl flex flex-col h-[70vh] w-full sm:w-96 md:w-[400px] max-w-[90vw]">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {otherUser && (
              <Avatar
                user={otherUser}
                className="w-10 h-10 rounded-full object-cover"
              />
            )}
            <h3 className="text-white font-medium">Chat with {otherUser?.username}</h3>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-white transition-colors text-xl font-bold"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading ? (
            <div className="text-center text-gray-400 py-4">Loading messages...</div>
          ) : allMessages.length === 0 ? (
            <div className="text-center text-gray-400 py-4">No messages yet. Start a conversation!</div>
          ) : (
            allMessages.map((msg, index) => {
              // Handle both backend formats: capitalized (SenderID) and lowercase (sender_id)
              const senderId = msg.SenderID || msg.sender_id || msg.from_user_id;
              const messageText = msg.Message || msg.message;
              const isFromCurrentUser = senderId === currentUser?.id;
              
              return (
                <div 
                  key={msg.ID || msg.id || msg.timestamp || index} 
                  className={`text-sm ${isFromCurrentUser ? 'text-right' : 'text-left'}`}
                >
                  <span className={`inline-block px-3 py-1 rounded ${
                    isFromCurrentUser ? 'bg-purple-900 text-white' : 'bg-gray-700 text-gray-200'
                  }`}>
                    {messageText}
                  </span>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="p-3 border-t border-gray-700 flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Type a message..."
            className="flex-1 bg-gray-700 text-white px-3 py-2 rounded focus:outline-none"
          />
          <img 
            src="/icons/sendIcon.svg" 
            alt="Send" 
            onClick={handleSubmit}
            className={`w-16 h-16 cursor-pointer transition-opacity ${
              !input.trim() ? 'opacity-30 cursor-not-allowed' : 'hover:opacity-80'
            }`}
            style={{ pointerEvents: !input.trim() ? 'none' : 'auto' }}
          />
        </div>
      </div>
    </div>
  );
}