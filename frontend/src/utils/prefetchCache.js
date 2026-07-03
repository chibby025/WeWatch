import apiClient from '../services/api';

// Module-level cache: roomId → { data, ts }
// Used to pre-load room data before navigation so RoomPageNew renders without a loading spinner.
const _roomCache = {};
const _membersCache = {};
const _inflight = new Set();
const TTL_MS = 30_000; // 30s — stale after that

export function prefetchRoom(roomId) {
  if (!roomId) return;
  const id = String(roomId);

  // Room data
  if (!_inflight.has(`room_${id}`)) {
    const entry = _roomCache[id];
    if (!entry || Date.now() - entry.ts >= TTL_MS) {
      _inflight.add(`room_${id}`);
      apiClient.get(`/api/rooms/${id}`)
        .then(res => { _roomCache[id] = { data: res.data, ts: Date.now() }; })
        .catch(() => {})
        .finally(() => _inflight.delete(`room_${id}`));
    }
  }

  // Members list — warm in parallel so RoomPageNew's member fetch also hits cache
  if (!_inflight.has(`members_${id}`)) {
    const mEntry = _membersCache[id];
    if (!mEntry || Date.now() - mEntry.ts >= TTL_MS) {
      _inflight.add(`members_${id}`);
      apiClient.get(`/api/rooms/${id}/members`)
        .then(res => { _membersCache[id] = { data: res.data, ts: Date.now() }; })
        .catch(() => {})
        .finally(() => _inflight.delete(`members_${id}`));
    }
  }
}

// Returns cached response body (consume-once, returns null on miss/stale).
export function consumePrefetchedRoom(roomId) {
  const id = String(roomId);
  const entry = _roomCache[id];
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) { delete _roomCache[id]; return null; }
  delete _roomCache[id];
  return entry.data;
}

// Returns cached members response body (consume-once, returns null on miss/stale).
export function consumePrefetchedMembers(roomId) {
  const id = String(roomId);
  const entry = _membersCache[id];
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) { delete _membersCache[id]; return null; }
  delete _membersCache[id];
  return entry.data;
}
