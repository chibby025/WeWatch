// frontend/src/hooks/useAuth.js
import { useState, useEffect } from 'react';
import { getCurrentUser } from '../services/api';
import apiClient from '../services/api'; // ✅ Make sure this is imported

export default function useAuth() {
  const [currentUser, setCurrentUser] = useState(null);
  const [wsToken, setWsToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const effectId = Date.now();
    console.log(`🔍🔍🔍 [useAuth] Effect TRIGGERED #${effectId} at ${new Date().toISOString()}`);
    
    const fetchUser = async () => {
      try {
        console.log(`🔍 [useAuth #${effectId}] Calling getCurrentUser API...`);
        const response = await getCurrentUser();
        // console.log(`🔑 [useAuth #${effectId}] User authenticated. Response:`, response);
        console.log(`👤 [useAuth #${effectId}] User ID: ${response.user?.id}, Username: ${response.user?.username}`);
        
        setCurrentUser(response.user);
        const token = response.ws_token;
        if (token) {
          // console.log(`🎫 [useAuth #${effectId}] Setting wsToken:`, token.substring(0, 20) + '...');
          sessionStorage.setItem('wewatch_ws_token', token);
          setWsToken(token);
        } else {
          console.warn(`⚠️ [useAuth #${effectId}] No ws_token in response`);
        }
        localStorage.setItem('user', JSON.stringify(response.user));
      } catch (err) {
        console.warn(`❌ [useAuth #${effectId}] User not authenticated:`, err);
        localStorage.removeItem('user');
        sessionStorage.removeItem('wewatch_ws_token');
        setCurrentUser(null);
        setWsToken(null);
      } finally {
        console.log(`✅ [useAuth #${effectId}] setLoading(false)`);
        setLoading(false);
      }
    };

    fetchUser();
    
    return () => {
      console.log(`🧹 [useAuth] Effect CLEANUP #${effectId} called`);
    };
  }, []); // ⚠️ Should only run ONCE on mount

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

  // ✅ DEFINE refresh function to reload user data
  const refreshUser = async () => {
    try {
      console.log('🔄 [useAuth] Refreshing user data...');
      const response = await getCurrentUser();
      console.log('✅ [useAuth] User data refreshed:', response.user);
      setCurrentUser(response.user);
      localStorage.setItem('user', JSON.stringify(response.user));
      return response.user;
    } catch (err) {
      console.warn('❌ [useAuth] Failed to refresh user:', err);
      throw err;
    }
  };

  return { currentUser, wsToken, loading, logout, refreshUser }; // ✅ expose refreshUser
}