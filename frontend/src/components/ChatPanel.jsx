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
  onDelete // Receive onDelete from RoomPage
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  /*
  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!ws || !wsConnected) return;

    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("ChatPanel: Received WebSocket message:", message);
        
        if (message.type === "chat_message") {
          // Append to parent state
          setChatMessages(prev => [...prev, message.data]);
        } else if (message.type === "reaction") {
          console.log("Received reaction:", message.data);
        } else {
          console.warn("ChatPanel: Unknown message type received:", message.type);
        }
      } catch (err) {
        console.error("Error parsing chat message:", err);
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, wsConnected, setChatMessages]);
  */


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
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        <MessageList 
          messages={chatMessages} 
          currentUserID={authenticatedUserID}
          onReact={handleReact}
          onDelete={onDelete} // Pass to MessageList
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