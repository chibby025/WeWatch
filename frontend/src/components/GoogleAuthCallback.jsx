import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '../services/api';
import { cacheUserData } from '../utils/cinemaCache';

const GoogleAuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Backend has set HttpOnly cookie, just fetch current user
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
