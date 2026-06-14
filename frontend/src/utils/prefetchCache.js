import apiClient from '../services/api';

// Module-level cache: roomId → { data, ts }
// Used to pre-load room data before navigation so RoomPageNew renders without a loading spinner.
const _roomCache = {};
const _inflight = new Set();
const TTL_MS = 30_000; // 30s — stale after that

export function prefetchRoom(roomId) {
  if (!roomId) return;
  const id = String(roomId);
  if (_inflight.has(id)) return;
  const entry = _roomCache[id];
  if (entry && Date.now() - entry.ts < TTL_MS) return; // already warm
  _inflight.add(id);
  apiClient.get(`/api/rooms/${id}`)
    .then(res => { _roomCache[id] = { data: res.data, ts: Date.now() }; })
    .catch(() => {})
    .finally(() => _inflight.delete(id));
}

// Returns cached response body and removes the entry (consume-once).
// Returns null on miss or if the entry is stale.
export function consumePrefetchedRoom(roomId) {
  const id = String(roomId);
  const entry = _roomCache[id];
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    delete _roomCache[id];
    return null;
  }
  delete _roomCache[id];
  return entry.data;
}
