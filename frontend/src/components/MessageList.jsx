// WeWatch/frontend/src/components/MessageList.jsx
import React from 'react';
import MessageItem from './MessageItem';

const MessageList = ({ messages, currentUserID, onReact }) => {
  if (messages.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No messages yet. Be the first to start the conversation!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <MessageItem 
          key={message.timestamp} 
          message={message} 
          isOwnMessage={message.user_id === currentUserID}
          onReact={onReact}
        />
      ))}
    </div>
  );
};

export default MessageList;