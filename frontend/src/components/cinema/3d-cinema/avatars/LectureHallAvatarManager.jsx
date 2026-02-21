import React, { useMemo } from 'react';
import FlatUserIcon from './FlatUserIcon';

/**
 * LectureHallAvatarManager - Manages avatars for lecture hall seats
 * SEAT-BASED ARCHITECTURE:
 * - Iterates through seats (not members) to check occupancy
 * - Removes dependency on roomMembers list
 * - Uses userSeats (userId -> seatId) + userIdToUsername for all data
 * - Each seat has a pre-defined avatar, toggled visible based on occupancy
 * - STATELESS: Does not manage modals. Passes avatar clicks up to the parent.
 */
export default function LectureHallAvatarManager({
  previewSeats, // 🎯 Actual seat positions (145 seats)
  showAvatars = true,
  userSeats = {}, // userId -> seatId mapping (WHO is in WHICH seat)
  userIdToUsername = {}, // userId -> username mapping
  currentUserId, // Current user's ID
  onAvatarClick, // ✅ CRITICAL: Callback to parent to handle avatar clicks
  remoteAudioStates = {}, // userId -> boolean (is speaking)
}) {
  // 🪑 SEAT-BASED APPROACH: For each seat, check if someone is sitting there
  const realUsers = useMemo(() => {
    // ... existing useMemo logic ...
    if (!previewSeats || previewSeats.length === 0) {
      console.warn('⚠️ [Avatar Gen] No previewSeats available');
      return [];
    }

    const users = [];
    
    // 🔄 NEW: Iterate through SEATS (not members)
    for (const seat of previewSeats) {
      const seatId = seat.id;
      
      // Find which user (if any) is sitting in this seat
      const userId = Object.keys(userSeats).find(uid => {
        // ✅ Use == for type-coercing comparison (seatId might be number, userSeats[uid] might be string)
        const match = userSeats[uid] == seatId;
        return match;
      });
      
      if (!userId) {
        // Seat is empty - skip
        continue;
      }
      
      // Get username from mapping
      const username = userIdToUsername[userId] || `User ${userId}`;
      
      if (!seat.position) {
        console.warn(`⚠️ Missing position for seat ${seatId}`);
        continue;
      }
      
      // Calculate row number per column
      let rowNumber;
      if (seatId === 145) {
        // Host seat
        rowNumber = 1;
      } else if (seatId <= 40) {
        // Column 1: 8 rows × 5 seats
        rowNumber = Math.ceil(seatId / 5);
      } else if (seatId <= 104) {
        // Column 2: 8 rows × 8 seats
        const colSeatId = seatId - 40;
        rowNumber = Math.ceil(colSeatId / 8);
      } else if (seatId <= 144) {
        // Column 3: 8 rows × 5 seats
        const colSeatId = seatId - 104;
        rowNumber = Math.ceil(colSeatId / 5);
      } else {
        // Host seat (145)
        rowNumber = 1; // Host is at front
      }

      // Generate avatar color from userId
      const hue = (parseInt(userId) * 137.5) % 360; // Golden angle for good distribution
      const isHost = seatId === 145;
      const avatarColor = isHost ? '#FFFFFF' : `hsl(${hue}, 65%, 50%)`;

      const avatarPosition = seat.position; // Already [x, y, z]

      // Get audio state (now includes audioLevel)
      // ✅ CRITICAL: userId from Object.keys() is a STRING, but remoteAudioStates uses NUMBERS
      const numericUserId = parseInt(userId);
      const audioState = remoteAudioStates[numericUserId] || { isSpeaking: false, audioLevel: 0 };
      
      // 🔍 Debug: Log audio state for this user
      if (audioState.isSpeaking) {
        console.log(`🎵 [Avatar ${userId}] Audio state:`, {
          userId,
          numericUserId,
          userIdType: typeof userId,
          audioState,
          remoteAudioStatesKeys: Object.keys(remoteAudioStates),
          foundInState: !!remoteAudioStates[numericUserId]
        });
      }
      
      users.push({
        userId: parseInt(userId),
        username: username,
        seatId: seatId,
        seatPosition: avatarPosition,
        seatRotation: [0, 0, 0], // Default rotation
        rowNumber: rowNumber,
        isPremium: false, // No longer have member.is_premium
        isHost: isHost,
        avatarColor: avatarColor,
        isSpeaking: audioState.isSpeaking,
        audioLevel: audioState.audioLevel,
      });
    }

    return users;
  }, [previewSeats, userSeats, userIdToUsername, remoteAudioStates]);

  // 🔍 Filter out current user's avatar - user shouldn't see their own avatar
  const visibleUsers = realUsers.filter(user => user.userId !== currentUserId);

  // 🔍 Debug logging - ENABLED FOR DEBUGGING DUPLICATION
  React.useEffect(() => {
    // ... existing useEffect logic ...
    const userIdCounts = {};
    const seatIdCounts = {};
    
    visibleUsers.forEach(user => {
      userIdCounts[user.userId] = (userIdCounts[user.userId] || 0) + 1;
      seatIdCounts[user.seatId] = (seatIdCounts[user.seatId] || 0) + 1;
    });
    
    const duplicateUsers = Object.entries(userIdCounts).filter(([_, count]) => count > 1);
    const duplicateSeats = Object.entries(seatIdCounts).filter(([_, count]) => count > 1);
    
    if (duplicateUsers.length > 0 || duplicateSeats.length > 0) {
      console.error('🚨 [AVATAR DUPLICATION DETECTED]');
      console.error('  Duplicate users:', duplicateUsers);
      console.error('  Duplicate seats:', duplicateSeats);
      console.error('  userSeats map:', userSeats);
      console.error('  visibleUsers:', visibleUsers);
    }
  }, [visibleUsers, userSeats]);

  if (!showAvatars) {
    return null;
  }

  return (
    <group>
      {visibleUsers.map((user) => {
        return (
          <FlatUserIcon
            key={user.userId}
            lectureHallScale={user.isHost ? 62.5 : 15}
            userId={user.userId}
            username={user.username}
            seatPosition={user.seatPosition}
            seatRotation={user.seatRotation}
            rowNumber={user.rowNumber}
            isPremium={user.isPremium}
            isCurrentUser={false}
            currentEmote={null}
            recentMessage={null}
            avatarColor={user.avatarColor}
            hideLabelsForLocalViewer={false}
            isActiveTimed={false}
            isHovered={false}
            onHover={() => {}}
            isSpeaking={user.isSpeaking}
            audioLevel={user.audioLevel}
            isHost={user.isHost}
            // ✅ Directly call the onAvatarClick prop passed from the parent
            onClick={() => onAvatarClick({
              id: user.userId,
              username: user.username,
              avatar_color: user.avatarColor,
              is_host: user.isHost
            })}
          />
        );
      })}
    </group>
  );
}