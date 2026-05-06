import React, { createContext, useContext, useEffect, useState } from 'react';
import { getCurrentUser } from '../services/api';

const AuthContext = createContext({
  currentUser: null,
  wsToken: null,
  loading: false,
  roomMemberships: [],
  setCurrentUser: () => {},
  refreshUser: () => {},
  addRoomMembership: () => {},
  removeRoomMembership: () => {},
});

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [wsToken, setWsToken] = useState(null);
  const [roomMemberships, setRoomMemberships] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const response = await getCurrentUser();
      setCurrentUser(response.user);
      
      if (response.ws_token) {
        sessionStorage.setItem('wewatch_ws_token', response.ws_token);
        setWsToken(response.ws_token);
      }
      
      // ✅ Store room memberships for instant checks
      if (response.room_memberships) {
        setRoomMemberships(response.room_memberships);
        console.log('🏠 [AuthContext] Loaded memberships for', response.room_memberships.length, 'rooms');
      }
      
      localStorage.setItem('user', JSON.stringify(response.user));
    } catch (err) {
      console.warn('Failed to fetch user:', err);
      localStorage.removeItem('user');
      sessionStorage.removeItem('wewatch_ws_token');
      setCurrentUser(null);
      setWsToken(null);
      setRoomMemberships([]);
    } finally {
      setLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      const response = await getCurrentUser();
      setCurrentUser(response.user);
      
      // ✅ Refresh room memberships too
      if (response.room_memberships) {
        setRoomMemberships(response.room_memberships);
      }
      
      localStorage.setItem('user', JSON.stringify(response.user));
      return response.user;
    } catch (err) {
      console.warn('Failed to refresh user:', err);
      throw err;
    }
  };

  // ✅ Add/remove room membership helpers
  const addRoomMembership = (roomId) => {
    setRoomMemberships(prev => {
      const numRoomId = Number(roomId);
      if (prev.includes(numRoomId)) return prev;
      console.log('➕ [AuthContext] Added membership for room', numRoomId);
      return [...prev, numRoomId];
    });
  };

  const removeRoomMembership = (roomId) => {
    setRoomMemberships(prev => {
      const numRoomId = Number(roomId);
      console.log('➖ [AuthContext] Removed membership for room', numRoomId);
      return prev.filter(id => id !== numRoomId);
    });
  };

  useEffect(() => {
    fetchUser();
  }, []);

  // 🔄 Sync auth state across tabs
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'user' && e.newValue !== e.oldValue) {
        if (e.newValue) {
          // Another tab logged in
          try {
            const user = JSON.parse(e.newValue);
            setCurrentUser(user);
            console.log('🔄 [AuthContext] Synced login from another tab:', user.username);
          } catch (err) {
            console.error('❌ [AuthContext] Failed to parse user from storage:', err);
          }
        } else {
          // Another tab logged out
          setCurrentUser(null);
          setWsToken(null);
          setRoomMemberships([]);
          sessionStorage.removeItem('wewatch_ws_token');
          console.log('🔄 [AuthContext] Synced logout from another tab');
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <AuthContext.Provider value={{ 
      currentUser, 
      wsToken, 
      loading, 
      roomMemberships,
      setCurrentUser, 
      refreshUser,
      addRoomMembership,
      removeRoomMembership
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

export default AuthContext;
