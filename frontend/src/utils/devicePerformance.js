// src/utils/devicePerformance.js
// Soft, dismissible warning for heavy 3D games (DOOM, Space Shooter, and
// future candidates like the racing game / Quake) -- never a hard block.
// Target floor is "a mid-range phone that can handle PUBG Mobile" per
// product decision; this is a coarse heuristic, not a guarantee.
//
// hardwareConcurrency <=4 threshold matches the existing 3D Cinema mobile
// device-tier heuristic already documented in CLAUDE.md, for consistency
// across the app rather than inventing a second number.

export function checkDevicePerformance() {
  const cores = navigator.hardwareConcurrency || 4;
  const memoryGB = navigator.deviceMemory; // not available in all browsers

  const reasons = [];
  if (cores <= 2) reasons.push('low CPU core count');
  if (typeof memoryGB === 'number' && memoryGB <= 2) reasons.push('low device memory');

  return {
    isLowEnd: reasons.length > 0,
    reasons,
  };
}

const DISMISS_KEY_PREFIX = 'lowEndGameWarningDismissed_';

export function hasDismissedLowEndWarning(gameId) {
  return sessionStorage.getItem(DISMISS_KEY_PREFIX + gameId) === 'true';
}

export function dismissLowEndWarning(gameId) {
  sessionStorage.setItem(DISMISS_KEY_PREFIX + gameId, 'true');
}
