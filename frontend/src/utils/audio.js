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