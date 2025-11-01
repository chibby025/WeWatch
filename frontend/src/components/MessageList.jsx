// WeWatch/frontend/src/components/MessageList.jsx
import React from 'react';
import MessageItem from './MessageItem';

const MessageList = ({ messages, currentUserID, onReact, onDelete }) => {
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
          key={message.ID} 
          message={message} 
          isOwnMessage={message.UserID === currentUserID}
          onReact={onReact}
          onDelete={onDelete}
          authenticatedUserID={currentUserID}
          // Pass formatted time to MessageItem if needed
        />
      ))}
    </div>
  );
};

export default MessageList;