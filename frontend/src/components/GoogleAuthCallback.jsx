import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '../services/api';
import { cacheUserData } from '../utils/cinemaCache';

const GoogleAuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Extract token from URL hash set by backend redirect
        const hash = window.location.hash.slice(1);
        const params = new URLSearchParams(hash);
        const token = params.get('token');
        if (token) {
          localStorage.setItem('wewatch_token', token);
          // Clean token from URL bar
          window.history.replaceState(null, '', window.location.pathname);
        }

        // Fetch current user (cookie or token header via interceptor)
        const response = await getCurrentUser();

        // Save user to localStorage and cache
        localStorage.setItem('user', JSON.stringify(response.user));
        cacheUserData(response.user);
        
        console.log('✅ Google OAuth login successful');
        
        // Redirect to lobby
        navigate('/lobby');
      } catch (error) {
        console.error('Failed to fetch user after Google OAuth:', error);
        navigate('/login');
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-black flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500 mb-4"></div>
        <p className="text-white text-xl">Completing Google sign in...</p>
      </div>
    </div>
  );
};

export default GoogleAuthCallback;
