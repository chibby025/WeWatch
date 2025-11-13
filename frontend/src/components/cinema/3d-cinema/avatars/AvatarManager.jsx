import React, { useState, useEffect, useMemo } from 'react';
import UserAvatar from './UserAvatar';
import GLBAvatar from './GLBAvatar';
import CustomAvatar from './CustomAvatar';
import ModernAvatar from './ModernAvatar';
import ImprovedAvatar from './ImprovedAvatar';
import FlatAvatar from './FlatAvatar';
import { assignUserToSeat, generateAllSeats } from '../seatCalculator';

/**
 * AvatarManager - Manages and renders all user avatars in the cinema
 * Features:
 * - Renders multiple avatar types based on useGLB prop
 * - Assigns seats to users
 * - Handles emote state per user
 * - Handles chat message bubbles per user
 * - Syncs with WebSocket events
 */
export default function AvatarManager({
  roomMembers = [],
  currentUserId,
  onEmoteReceived, // WebSocket emote handler
  onChatMessageReceived, // WebSocket chat message handler
  useGLB = false, // Options: false = CustomAvatar, true = GLBAvatar, 'procedural' = UserAvatar, 'modern' = ModernAvatar, 'improved' = ImprovedAvatar, 'flat' = FlatAvatar
}) {
  // State for each user's current emote
  const [userEmotes, setUserEmotes] = useState({}); // { userId: 'wave' }
  
  // State for each user's recent chat message
  const [userMessages, setUserMessages] = useState({}); // { userId: { text, timestamp } }

  // Generate all 42 seats
  const allSeats = useMemo(() => generateAllSeats(), []);

  // Assign seats to all room members
  const userSeatAssignments = useMemo(() => {
    const assignments = {};
    
    roomMembers.forEach((member, index) => {
      // Assign seat based on user ID (round-robin for now)
      const assignedSeat = assignUserToSeat(member.id || index + 1);
      assignments[member.id] = assignedSeat;
    });
    
    return assignments;
  }, [roomMembers]);

  // Listen for emote events from WebSocket
  useEffect(() => {
    if (!onEmoteReceived) return;

    const handleEmote = (emoteData) => {
      const { user_id, emote } = emoteData;
      
      console.log('👋 [AvatarManager] Emote received:', user_id, emote);
      
      // Set emote for user
      setUserEmotes((prev) => ({
        ...prev,
        [user_id]: emote,
      }));

      // Clear emote after 2 seconds
      setTimeout(() => {
        setUserEmotes((prev) => {
          const updated = { ...prev };
          delete updated[user_id];
          return updated;
        });
      }, 2000);
    };

    // Register handler (implementation depends on your WebSocket setup)
    onEmoteReceived(handleEmote);
  }, [onEmoteReceived]);

  // Listen for chat messages from WebSocket
  useEffect(() => {
    if (!onChatMessageReceived) return;

    const handleChatMessage = (messageData) => {
      const { user_id, message, username, avatar_color } = messageData;
      
      console.log('💬 [AvatarManager] Chat message received:', user_id, message);
      
      // Set message for user
      setUserMessages((prev) => ({
        ...prev,
        [user_id]: {
          text: message,
          timestamp: Date.now(),
          color: avatar_color,
        },
      }));

      // Clear message after 5 seconds
      setTimeout(() => {
        setUserMessages((prev) => {
          const updated = { ...prev };
          delete updated[user_id];
          return updated;
        });
      }, 5000);
    };

    // Register handler
    onChatMessageReceived(handleChatMessage);
  }, [onChatMessageReceived]);

  console.log('🎭 [AvatarManager] Rendering avatars for', roomMembers.length, 'users');
  console.log('🎨 [AvatarManager] Using', 
    typeof useGLB === 'string' ? useGLB : useGLB === true ? 'GLB' : 'Custom', 
    'avatars'
  );

  // Choose avatar component based on useGLB prop
  const AvatarComponent = 
    useGLB === 'modern' ? ModernAvatar :
    useGLB === 'improved' ? ImprovedAvatar :
    useGLB === 'flat' ? FlatAvatar :
    useGLB === true ? GLBAvatar : 
    useGLB === 'procedural' ? UserAvatar : 
    CustomAvatar;

  return (
    <group name="avatar-manager">
      {roomMembers.map((member) => {
        const seatAssignment = userSeatAssignments[member.id];
        
        if (!seatAssignment) {
          console.warn('⚠️ [AvatarManager] No seat for user:', member.id);
          return null;
        }

        const isCurrentUser = member.id === currentUserId;
        const currentEmote = userEmotes[member.id] || null;
        const recentMessage = userMessages[member.id] || null;

        // Hide current user's avatar (they see from their camera position)
        if (isCurrentUser) {
          return null;
        }

        return (
          <AvatarComponent
            key={member.id}
            userId={member.id}
            username={member.username || `User ${member.id}`}
            seatPosition={seatAssignment.avatarPosition}
            seatRotation={seatAssignment.rotation}
            rowNumber={seatAssignment.row}
            isPremium={seatAssignment.isPremium}
            isCurrentUser={isCurrentUser}
            currentEmote={currentEmote}
            recentMessage={recentMessage}
            userPhotoUrl={member.avatar_url || '/avatars/default.png'}
          />
        );
      })}
    </group>
  );
}
