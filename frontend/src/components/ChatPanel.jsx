// WeWatch/frontend/src/components/ChatPanel.jsx
import React, { useState, useEffect, useRef } from 'react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import EmojiPicker from 'emoji-picker-react';

const ChatPanel = ({ roomId, ws, wsConnected, authenticatedUserID, isHost }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!ws || !wsConnected) return;

    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("ChatPanel: Received WebSocket message:", message);
        
        if (message.type === "chat_message") {
          setMessages(prev => [...prev, message.data]);
        } else if (message.type === "playback_control") {
          console.log("Received playback command:", message.command);
        } else {
          console.warn("ChatPanel: Unknown message type received:", message.type);
        }
      } catch (err) {
        console.error("Error parsing chat message:", err);
        console.error("Raw message data:", event.data);
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, wsConnected]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !wsConnected || !ws) return;

    // Properly structured chat message - THIS PART IS CORRECT
    const chatMessage = {
      type: "chat_message",
      data: {
        message: newMessage.trim(),
        user_id: authenticatedUserID,
        username: "User" + authenticatedUserID,
        timestamp: Date.now(),
        message_type: "text"
      }
    };

    try {
      console.log("Sending chat message:", JSON.stringify(chatMessage));
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

  // Handle emoji reactions (for the future)
  const handleReact = (messageTimestamp, emoji) => {
    console.log("Reacting to message at", messageTimestamp, "with emoji", emoji);
    // In a real app, you'd send this to the backend
    // For now, just log it
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        <MessageList 
          messages={messages} 
          currentUserID={authenticatedUserID}
          onReact={handleReact} // This will be used for reactions
        />
        <div ref={messagesEndRef} />
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