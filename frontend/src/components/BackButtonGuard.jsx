import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Ensures pressing the browser back button never exits the app to Google.
// Strategy:
//   1. On every navigation, mark the history state as an in-app entry.
//   2. On popstate, if the resulting state has no app marker (i.e. the browser
//      would leave the SPA entirely), navigate to /lobby instead.
export default function BackButtonGuard() {
  const navigate = useNavigate();
  const location = useLocation();

  // Stamp every history entry with { wewatch: true } so we can detect
  // when the user pops back past our oldest stamped entry.
  useEffect(() => {
    if (!window.history.state?.wewatch) {
      window.history.replaceState(
        { ...window.history.state, wewatch: true },
        ''
      );
    }
  }, [location]);

  useEffect(() => {
    const handlePopState = (e) => {
      if (!e.state?.wewatch) {
        // Browser would exit the app — bring them to the lobby instead.
        navigate('/lobby', { replace: true });
        window.history.pushState({ wewatch: true }, '', '/lobby');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [navigate]);

  return null;
}
