// frontend/src/hooks/useAuth.js
import { useState, useEffect } from 'react';
import { getCurrentUser } from '../services/api';
import apiClient from '../services/api'; // ✅ Make sure this is imported

export default function useAuth() {
  const [currentUser, setCurrentUser] = useState(null);
  const [wsToken, setWsToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await getCurrentUser();
        console.log("🔑 [useAuth] User authenticated. Response:", response);
        // ✅ Add this log to see the user ID
        console.log("👤 [useAuth] Authenticated User ID:", response.user?.id, "Username:", response.user?.username, "Email:", response.user?.email);
        setCurrentUser(response.user);
        const token = response.ws_token;
        if (token) {
          sessionStorage.setItem('wewatch_ws_token', token);
          setWsToken(token);
        }
        localStorage.setItem('user', JSON.stringify(response.user));
      } catch (err) {
        console.warn("User not authenticated:", err);
        localStorage.removeItem('user');
        sessionStorage.removeItem('wewatch_ws_token');
        setCurrentUser(null);
        setWsToken(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  // ✅ DEFINE logout function
  const logout = async () => {
    try {
      await apiClient.post('/api/auth/logout'); // clears HttpOnly cookie
    } catch (err) {
      console.warn("Logout API failed:", err);
    }
    localStorage.removeItem('user');
    sessionStorage.removeItem('wewatch_ws_token');
    setCurrentUser(null);
    setWsToken(null);
  };

  return { currentUser, wsToken, loading, logout }; // ✅ now `logout` exists
}