// utils/audio.js

// Seat assignment sound
export const playSeatSound = () => {
  const audio = new Audio('/sounds/seat-assign.mp3');
  audio.volume = 0.3;
  audio.play().catch(e => console.warn("Seat sound failed:", e));
};

// Mic unmute sound
export const playMicOnSound = () => {
  const audio = new Audio('/sounds/mic-on.mp3');
  audio.volume = 0.25;
  audio.play().catch(e => console.warn("Mic on sound failed:", e));
};

// Mic mute sound
export const playMicOffSound = () => {
  const audio = new Audio('/sounds/mic-off.mp3');
  audio.volume = 0.25;
  audio.play().catch(e => console.warn("Mic off sound failed:", e));
};

// Silence mode on sound
export const playSilenceOnSound = () => {
  const audio = new Audio('/sounds/mic-off.mp3'); // Reuse mic-off sound for now
  audio.volume = 0.2;
  audio.play().catch(e => console.warn("Silence on sound failed:", e));
};

// Silence mode off sound
export const playSilenceOffSound = () => {
  const audio = new Audio('/sounds/mic-on.mp3'); // Reuse mic-on sound for now
  audio.volume = 0.2;
  audio.play().catch(e => console.warn("Silence off sound failed:", e));
};

// User joined session sound
export const playJoinSound = () => {
  const audio = new Audio('/sounds/userjoin.mp3');
  audio.volume = 0.5;
  audio.play().catch(e => console.warn("Join sound failed:", e));
};

// User left session sound (Leave Call button) — hosted on BunnyCDN per
// explicit request, unlike every other short effect above which is bundled
// locally in public/sounds/. Plays for everyone ELSE remaining in the
// session (see VideoWatch.jsx's session_member_left handler) — not for the
// person who actually clicked Leave Call themselves, who's already
// navigating away by the time this would fire for them.
export const playLeaveSound = () => {
  const audio = new Audio('https://letswatchout.b-cdn.net/sounds/leave-call.mp3');
  audio.volume = 0.5;
  audio.play().catch(e => console.warn("Leave sound failed:", e));
};

// The LOCAL, immediate click feedback for the person hitting Leave Call
// themselves — a separate sound/trigger from playLeaveSound above (which is
// for everyone else, once the leave has actually propagated). Fired
// synchronously the instant the button is pressed, not awaited alongside the
// leave/cleanup logic, so it's never cut short by navigation away from the
// page. User-supplied asset, bundled locally (not BunnyCDN) since it's tiny
// and this avoids any CDN-cache-propagation delay for a sound that needs to
// feel instant.
export const playLeaveCallClickSound = () => {
  const audio = new Audio('/sounds/leave-call-click.mp3');
  audio.volume = 0.5;
  audio.play().catch(e => console.warn("Leave call click sound failed:", e));
};