import React, { useMemo, useState, useEffect } from 'react';
import FlatUserIcon from './FlatUserIcon';

/**
 * 🎬 CinemaAvatarManager - Cinema-specific avatar positioning
 * Manages all user avatars at their seat positions in the cinema scene
 * ✅ NOW USES cinemaSeats.json for accurate positioning
 */
export default function CinemaAvatarManager({
  roomMembers = [],
  userSeats = {},
  currentUserId,
  onEmoteReceived,
  onChatMessageReceived,
  hideLabelsForLocalViewer = false,
  remoteParticipants = new Map(),
  onAvatarClick,
  cinemaSeats = { seats: [] }, // ✅ NEW: cinemaSeats.json data
  showChatBubbles = true, // 🎯 User preference for chat bubble visibility
  activeSpeakers = new Map(), // 🎤 Active speakers with audio levels
}) {
  const [userEmotes, setUserEmotes] = useState({});
  const [userMessages, setUserMessages] = useState({});
  const [activeUserIds, setActiveUserIds] = useState(new Set());
  const [hoveredUserId, setHoveredUserId] = useState(null);

  // 🎭 Calculate position assignments for all users using cinemaSeats.json
  const userSeatAssignments = useMemo(() => {
    const assignments = {};

    // Create lookup map for fast seat access by ID
    const seatMap = new Map();
    cinemaSeats.seats.forEach(seat => {
      seatMap.set(seat.id, seat);
    });

    roomMembers.forEach((member) => {
      let seatKey;

      // Demo user detection (ID format: "demo-row-col")
      if (
        typeof member.id === 'string' &&
        member.id.startsWith('demo-')
      ) {
        const parts = member.id.split('-');
        if (parts.length === 3) {
          const row = parseInt(parts[1], 10);
          const col = parseInt(parts[2], 10);
          if (!isNaN(row) && !isNaN(col)) {
            seatKey = `${row}-${col}`;
          }
        }
      }

      // Real user lookup
      if (!seatKey && userSeats && member.id) {
        seatKey = userSeats[member.id];
      }

      // No seat assigned
      if (!seatKey) {
        return;
      }

      // Parse seat key "row-col" (0-indexed)
      const [rowStr, colStr] = seatKey.split('-').map(Number);
      if (isNaN(rowStr) || isNaN(colStr)) {
        return;
      }

      // ✅ Convert "row-col" (0-indexed) to seat ID (1-42)
      // Backend uses 0-indexed: "0-0" to "5-6"
      // JSON uses 1-indexed: row 1-6, seatInRow 1-7, id 1-42
      const seatId = rowStr * 7 + colStr + 1;
      
      // ✅ Lookup seat data from cinemaSeats.json
      const seatData = seatMap.get(seatId);
      if (!seatData) {
        console.warn(`⚠️ [CinemaAvatarManager] Seat ID ${seatId} not found for key ${seatKey}`);
        return;
      }

      // Store assignment with JSON data
      assignments[member.id] = {
        id: seatData.id,
        position: seatData.position,
        rotation: [0, 0, 0], // TODO: Add rotation to cinemaSeats.json if needed
        row: seatData.row,
        seatInRow: seatData.seatInRow,
        isPremium: false, // TODO: Add premium flag to JSON if needed
      };
    });

    return assignments;
  }, [roomMembers, userSeats, cinemaSeats.seats]);

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
      console.log('💬 [CinemaAvatarManager] Received chat:', { user_id, message, username, avatar_color });
      setUserMessages(prev => ({
        ...prev,
        [user_id]: { text: message, username: username, timestamp: Date.now(), color: avatar_color }, // ✅ Store username
      }));
      resetActivityTimer(user_id);
      setTimeout(() => {
        console.log('💬 [CinemaAvatarManager] Removing chat for user:', user_id);
        setUserMessages(prev => {
          const updated = { ...prev };
          delete updated[user_id];
          return updated;
        });
      }, 1500); // ✅ Match ChatBubble duration (was 5000ms)
    };
    onChatMessageReceived(handleChatMessage);
  }, [onChatMessageReceived]);

  const handleUserHover = (userId) => {
    setHoveredUserId(userId);
  };

  // ✅ Filter: Only render members who have seats assigned
  const membersWithSeats = useMemo(() => {
    return roomMembers.filter(member => userSeats[member.id] !== undefined);
  }, [roomMembers, userSeats]);

  // 🎨 Generate unique colors for all members upfront (outside render loop to avoid hooks issues)
  const memberColors = React.useMemo(() => {
    const colors = {};
    membersWithSeats.forEach(member => {
      if (member.avatar_color) {
        colors[member.id] = member.avatar_color;
      } else {
        // For demo users (ID format: "demo-row-col"), extract numbers
        let numericId = member.id;
        if (typeof member.id === 'string' && member.id.startsWith('demo-')) {
          const parts = member.id.split('-');
          if (parts.length === 3) {
            numericId = parseInt(parts[1]) * 10 + parseInt(parts[2]);
          }
        }
        const hue = (parseInt(numericId) * 137.5) % 360; // Golden angle for good distribution
        colors[member.id] = `hsl(${hue}, 65%, 50%)`;
      }
    });
    return colors;
  }, [membersWithSeats]);

  return (
    <group name="cinema-avatar-manager">
      {membersWithSeats.map((member) => {
        const seatAssignment = userSeatAssignments[member.id];
        if (!seatAssignment) return null;
        const isCurrentUser = member.id === currentUserId;
        if (isCurrentUser) return null;

        const currentEmote = userEmotes[member.id] || null;
        const recentMessage = userMessages[member.id] || null;
        const isActiveTimed = activeUserIds.has(member.id);
        const isHovered = hoveredUserId === member.id;

        // ✅ Match LiveKit participant identity format: "user-{id}" or "user-{id}-{tabId}"
        // We try exact match first, then prefix match for tab-specific identities
        const participantPrefix = `user-${member.id}`;
        let remoteParticipant = null;
        
        // Try exact match first
        remoteParticipant = remoteParticipants.get(participantPrefix);
        
        // If not found, search for tab-specific identity (user-8-abc123)
        if (!remoteParticipant) {
          for (const [identity, participant] of remoteParticipants) {
            if (identity.startsWith(participantPrefix + '-')) {
              remoteParticipant = participant;
              break;
            }
          }
        }
        
        // 🎤 Get audio state from activeSpeakers Map (LiveKit's activeSpeakersChanged event)
        let participantIdentity = participantPrefix;
        if (remoteParticipant) {
          // Use the actual identity (might be tab-specific like user-10-fac895b3)
          participantIdentity = remoteParticipant.identity;
        }
        const audioData = activeSpeakers.get(participantIdentity) || { isSpeaking: false, audioLevel: 0 };
        const isSpeaking = audioData.isSpeaking;
        const audioLevel = audioData.audioLevel; // 🎵 Get audio level for pulsation (0.0 to 1.0)

        // 🎨 Get pre-computed color for this member
        const uniqueColor = memberColors[member.id];

        // ✅ Special adjustment for seat E7 (seat ID 35, row 5 seat 7)
        let avatarPosition = [...seatAssignment.position];
        if (seatAssignment.id === 35) {
          avatarPosition[1] *= 1.10; // Raise by 10%
        }

        return (
          <group
            key={member.id}
            position={avatarPosition}
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
              avatarColor={uniqueColor} // 🎨 Use unique color per user
              hideLabelsForLocalViewer={hideLabelsForLocalViewer}
              isActiveTimed={isActiveTimed}
              isHovered={isHovered}
              onHover={handleUserHover}
              isSpeaking={isSpeaking}
              audioLevel={audioLevel} // 🎵 Pass audio level for pulsation
              lectureHallScale={0.525} // 🎯 Avatar size (5% larger than 0.5)
              showChatBubbles={showChatBubbles} // 🎯 User preference for chat bubble visibility
            />
          </group>
        );
      })}
    </group>
  );
}
