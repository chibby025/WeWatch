/**
 * Centralized logging utility for WeWatch
 * Set DEBUG_MODE to true to enable verbose logging
 */

// Toggle this to enable/disable verbose logging
const DEBUG_MODE = false;

// Always log these regardless of DEBUG_MODE
export const error = (...args) => {
  console.error(...args);
};

export const warn = (...args) => {
  console.warn(...args);
};

// Only log in DEBUG mode
export const log = (...args) => {
  if (DEBUG_MODE) {
    console.log(...args);
  }
};

export const debug = (...args) => {
  if (DEBUG_MODE) {
    console.log(...args);
  }
};

// Critical logs that should always show (like connection state changes)
export const info = (...args) => {
  console.log(...args);
};

export default {
  error,
  warn,
  log,
  debug,
  info
};
