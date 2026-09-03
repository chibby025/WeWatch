// Shared constants for Quake Death Match's stage & game-mode selection.
// Split into its own plain (non-component) file rather than living inside
// GameLobbyModal.jsx or Quake3Game.jsx directly — a file mixing a default
// React component export with named non-component exports breaks Vite's
// Fast Refresh (confirmed via a real eslint react-refresh/only-export-
// components error when these were first added directly to
// GameLobbyModal.jsx), and both GameLobbyModal.jsx (the picker UI) and
// VideoWatch.jsx (the join-prompt's stage/mode label, the live "host is
// picking…" mirror's label) need the exact same label lookups.

// A curated subset of the 47 real maps bundled in the supervisor's own
// asset pack (confirmed present via `unzip -l pak1-maps.pk3`, not
// guessed) — OpenArena's own flagship oa_dm1-7 deathmatch set, plus the
// dm4ish/dm6ish pair already used as the (until now, hardcoded) default.
// Deliberately NOT the full 47 — most of the rest are obscure community
// maps never verified to play well, and this list only needs to grow,
// never shrink, without breaking anyone's saved state (map id is just a
// string, sent fresh every game).
// Kept in sync BY HAND with the identical allowlist in two other places
// this can't share code with: backend/internal/handlers/games/
// websocket_handler.go (server-side validation, since a client value is
// never trusted directly for a spawn argument) and ~/dev-tools/
// quake3_fork/supervisor/index.js (a wholly separate repo/deploy).
export const QUAKE3_MAPS = [
  { id: 'dm4ish', label: 'DM4ish' },
  { id: 'dm6ish', label: 'DM6ish' },
  { id: 'oa_dm1', label: 'OA DM1' },
  { id: 'oa_dm2', label: 'OA DM2' },
  { id: 'oa_dm3', label: 'OA DM3' },
  { id: 'oa_dm4', label: 'OA DM4' },
  { id: 'oa_dm5', label: 'OA DM5' },
  { id: 'oa_dm6', label: 'OA DM6' },
  { id: 'oa_dm7', label: 'OA DM7' },
];

// Real g_gametype integers, confirmed against the actual engine source
// (oa_gamelogic/code/game/bg_public.h's gametype_t enum — GT_FFA=0,
// GT_TEAM=3), not guessed. Deliberately only these two for v1: CTF/other
// objective modes need CTF-capable maps (flag spawns etc.), coupling
// map+gametype validity together in a way FFA/TDM never do — a natural
// later extension once these two are proven live, not a blocker now.
export const QUAKE3_GAMETYPES = [
  { id: 0, label: 'Free For All' },
  { id: 3, label: 'Team Deathmatch' },
];
