// WeWatch/frontend/src/components/ChatPanel.jsx
import React, { useEffect, useRef, useState } from 'react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import EmojiPicker from 'emoji-picker-react';

const ChatPanel = ({ 
  roomId, 
  ws, 
  wsConnected, 
  authenticatedUserID, 
  isHost, 
  chatMessages, 
  setChatMessages,
  onDelete, // Receive onDelete from RoomPage
  onEdit // Receive onEdit from RoomPage
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  // Auto-scroll to bottom when messages change (only if already at bottom)
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  // Detect scroll position to show/hide scroll button
  const handleScroll = () => {
    const container = chatContainerRef.current;
    if (!container) return;

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  };

  // Scroll to bottom function
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  

  const sendMessage = async () => {
    if (!newMessage.trim() || !wsConnected || !ws) return;

    const chatMessage = {
      type: "chat_message",
      data: {
        message: newMessage.trim(),
        user_id: authenticatedUserID,
        username: `User${authenticatedUserID}`,
        timestamp: Date.now(),
        message_type: "text"
      }
    };

    try {
      ws.send(JSON.stringify(chatMessage));
      setNewMessage('');
      setShowEmojiPicker(false);
    } catch (err) {
      console.error("Error sending chat message:", err);
    }
  };

  const handleEmojiSelect = (emoji) => {
    setNewMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const handleReact = (messageTimestamp, emoji) => {
    if (!roomId || !authenticatedUserID || !wsConnected) return;
    
    try {
      const reactionMessage = {
        type: "reaction",
        data: {
          emoji: emoji,
          user_id: authenticatedUserID,
          message_timestamp: messageTimestamp,
          timestamp: Date.now(),
        }
      };
      
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(reactionMessage));
      }
    } catch (err) {
      console.error("Error sending reaction:", err);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div 
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 bg-gray-50 scrollbar-hide relative"
      >
        <MessageList 
          messages={chatMessages} 
          currentUserID={authenticatedUserID}
          onReact={handleReact}
          onDelete={onDelete}
          onEdit={onEdit}
        />
        <div ref={messagesEndRef} />
        
        {/* Scroll to bottom button */}
        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="fixed bottom-24 right-8 bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-full shadow-lg transition-all duration-200 z-10"
            aria-label="Scroll to bottom"
          >
            <img 
              src="/icons/bottomIcon.svg" 
              alt="Scroll down" 
              className="w-5 h-5"
            />
          </button>
        )}
      </div>
      
      <div className="p-4 border-t border-gray-200 relative">
        {showEmojiPicker && (
          <div className="absolute bottom-full left-0 mb-2 z-10">
            <EmojiPicker 
              onEmojiClick={(emojiObject) => {
                setNewMessage(prev => prev + emojiObject.emoji);
                setShowEmojiPicker(false);
              }}
              theme="light"
              previewConfig={{ showPreview: false }}
            />
          </div>
        )}
        <ChatInput 
          message={newMessage}
          setMessage={setNewMessage}
          onSend={sendMessage}
          onEmojiSelect={() => setShowEmojiPicker(!showEmojiPicker)}
          showEmojiPicker={showEmojiPicker}
          disabled={!wsConnected}
        />
      </div>
    </div>
  );
};

export default ChatPanel;