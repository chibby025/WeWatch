// frontend/src/hooks/useViewGuidanceTimer.js
import { useState, useEffect } from 'react';

/**
 * Shows a timed view guidance overlay when the user is assigned a seat.
 * C/R keys reset to 'post-key' mode; L/F keys extend the timer.
 * Auto-hides once the expiry timestamp passes.
 * Returns { viewGuidanceMode, viewGuidanceExpiresAt }.
 */
export default function useViewGuidanceTimer(currentSeat) {
  const [viewGuidanceMode, setViewGuidanceMode] = useState(null);
  const [viewGuidanceExpiresAt, setViewGuidanceExpiresAt] = useState(0);

  // Show initial guidance when seat is assigned
  useEffect(() => {
    if (currentSeat) {
      setViewGuidanceMode('initial');
      setViewGuidanceExpiresAt(Date.now() + 3_000);
    }
  }, [currentSeat]);

  // Extend timer on C/R/L/F keys while guidance is visible
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (Date.now() >= viewGuidanceExpiresAt) return;

      if (key === 'c' || key === 'r') {
        setViewGuidanceMode('post-key');
        setViewGuidanceExpiresAt(Date.now() + 3_000);
      } else if (key === 'l' || key === 'f') {
        setViewGuidanceExpiresAt(Date.now() + 3_000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewGuidanceExpiresAt]);

  // Auto-hide once expired
  useEffect(() => {
    if (viewGuidanceExpiresAt === 0) return;
    const check = () => {
      if (Date.now() >= viewGuidanceExpiresAt) {
        setViewGuidanceMode(null);
        setViewGuidanceExpiresAt(0);
      }
    };
    const interval = setInterval(check, 1000);
    check();
    return () => clearInterval(interval);
  }, [viewGuidanceExpiresAt]);

  return { viewGuidanceMode, viewGuidanceExpiresAt };
}
