// frontend/src/components/cinema/3d-cinema/avatars/AvatarManager.jsx
import React, { useState, useEffect, useMemo } from 'react';
import FlatUserIcon from './FlatUserIcon';
import { assignUserToSeat, generateAllSeats } from '../seatCalculator';

/**
 * AvatarManager - Manages and renders all user avatars in the cinema
 * Now uses FlatUserIcon for all users (real + demo)
 */
export default function AvatarManager({
  roomMembers = [],
  currentUserId,
  onEmoteReceived,
  onChatMessageReceived,
  hideLabelsForLocalViewer = false,
  remoteParticipants = new Map(),
  onAvatarClick, // ✅ NEW prop
}) {
  const [userEmotes, setUserEmotes] = useState({});
  const [userMessages, setUserMessages] = useState({});
  const [activeUserIds, setActiveUserIds] = useState(new Set());
  const [hoveredUserId, setHoveredUserId] = useState(null);

  const allSeats = useMemo(() => generateAllSeats(), []);

  const userSeatAssignments = useMemo(() => {
    const assignments = {};
    roomMembers.forEach((member) => {
      if (member.is_demo) {
        const [, rowStr, colStr] = member.id.split('-');
        const row = parseInt(rowStr, 10);
        const col = parseInt(colStr, 10);
        const seatId = row * 7 + col + 1;
        const seat = allSeats.find(s => s.id === seatId);
        if (seat) {
          assignments[member.id] = {
            ...seat,
            avatarPosition: seat.position,
          };
        }
      } else {
        const assignedSeat = assignUserToSeat(member.id);
        assignments[member.id] = assignedSeat;
      }
    });
    return assignments;
  }, [roomMembers, allSeats]);

  const resetActivityTimer = (userId) => {
    setActiveUserIds(prev => new Set([...prev, userId]));
    setTimeout(() => {
      setActiveUserIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }, 30000);
  };

  useEffect(() => {
    if (!onEmoteReceived) return;
    const handleEmote = (emoteData) => {
      const { user_id } = emoteData;
      setUserEmotes(prev => ({ ...prev, [user_id]: emoteData.emote }));
      resetActivityTimer(user_id);
      setTimeout(() => {
        setUserEmotes(prev => {
          const updated = { ...prev };
          delete updated[user_id];
          return updated;
        });
      }, 2000);
    };
    onEmoteReceived(handleEmote);
  }, [onEmoteReceived]);

  useEffect(() => {
    if (!onChatMessageReceived) return;
    const handleChatMessage = (messageData) => {
      const { user_id, message, username, avatar_color } = messageData;
      setUserMessages(prev => ({
        ...prev,
        [user_id]: { text: message, timestamp: Date.now(), color: avatar_color },
      }));
      resetActivityTimer(user_id);
      setTimeout(() => {
        setUserMessages(prev => {
          const updated = { ...prev };
          delete updated[user_id];
          return updated;
        });
      }, 5000);
    };
    onChatMessageReceived(handleChatMessage);
  }, [onChatMessageReceived]);

  const handleUserHover = (userId) => {
    setHoveredUserId(userId);
  };

  return (
    <group name="avatar-manager">
      {roomMembers.map((member) => {
        const seatAssignment = userSeatAssignments[member.id];
        if (!seatAssignment) return null;
        const isCurrentUser = member.id === currentUserId;
        if (isCurrentUser) return null;

        const currentEmote = userEmotes[member.id] || null;
        const recentMessage = userMessages[member.id] || null;
        const isActiveTimed = activeUserIds.has(member.id);
        const isHovered = hoveredUserId === member.id;

        const participantId = String(member.id);
        const remoteParticipant = remoteParticipants.get(participantId);
        const isSpeaking = !!remoteParticipant?.isSpeaking;

        return (
          <group
            key={member.id}
            position={seatAssignment.avatarPosition}
            onClick={(e) => {
              e.stopPropagation(); // Prevent orbit controls from interfering
              onAvatarClick?.(member); // ✅ TRIGGER PROFILE MODAL
            }}
          >
            <FlatUserIcon
              userId={member.id}
              username={member.username || `User ${member.id}`}
              seatPosition={[0, 0, 0]} // relative to group
              seatRotation={seatAssignment.rotation}
              rowNumber={seatAssignment.row}
              isPremium={seatAssignment.isPremium}
              isCurrentUser={isCurrentUser}
              currentEmote={currentEmote}
              recentMessage={recentMessage}
              avatarColor={member.avatar_color}
              userPhotoUrl={member.avatar_url || '/icons/user1.jpg'}
              hideLabelsForLocalViewer={hideLabelsForLocalViewer}
              isActiveTimed={isActiveTimed}
              isHovered={isHovered}
              onHover={handleUserHover}
              isSpeaking={isSpeaking}
            />
          </group>
        );
      })}
    </group>
  );
}