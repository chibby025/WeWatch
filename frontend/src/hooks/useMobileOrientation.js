// frontend/src/hooks/useMobileOrientation.js
import { useState, useEffect } from 'react';

/**
 * Manages mobile orientation detection and landscape lock for phones.
 * Tablets (width >= 768px) are excluded from the lock.
 * Returns { isPortrait, showTutorial, setShowTutorial }.
 */
export default function useMobileOrientation(isMobile) {
  const [isPortrait, setIsPortrait] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (!isMobile) return;

    const checkOrientation = () => {
      const isPhone = window.innerWidth < 768;
      const isPortraitMode = window.innerHeight > window.innerWidth;
      setIsPortrait(isPhone && isPortraitMode);
    };

    checkOrientation();

    const lockOrientation = async () => {
      if (window.innerWidth >= 768) return; // tablets: skip
      try {
        if (screen.orientation?.lock) {
          await screen.orientation.lock('landscape');
        }
      } catch {
        setShowTutorial(true); // fallback: show rotate prompt
      }
    };

    const timer = setTimeout(lockOrientation, 500);

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
      screen.orientation?.unlock?.();
    };
  }, [isMobile]);

  return { isPortrait, showTutorial, setShowTutorial };
}
