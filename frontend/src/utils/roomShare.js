// WeWatch/frontend/src/utils/roomShare.js
// Builds the shareable URL for a room — prefers the short handle-based
// /r/:handle link when the room has one, falls back to /rooms/:id
// otherwise (older rooms, or a handle that was never set).

export function buildRoomShareUrl(room) {
  const origin = window.location.origin;
  if (room?.handle) {
    return `${origin}/r/${room.handle}`;
  }
  return `${origin}/rooms/${room?.id}`;
}
