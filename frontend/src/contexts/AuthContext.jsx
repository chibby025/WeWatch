import React, { createContext, useContext, useEffect, useState } from 'react';
import { getCurrentUser } from '../services/api';

const AuthContext = createContext({
  currentUser: null,
  wsToken: null,
  loading: false,
  setCurrentUser: () => {},
  refreshUser: () => {},
});

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [wsToken, setWsToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const response = await getCurrentUser();
      setCurrentUser(response.user);
      
      if (response.ws_token) {
        sessionStorage.setItem('wewatch_ws_token', response.ws_token);
        setWsToken(response.ws_token);
      }
      
      localStorage.setItem('user', JSON.stringify(response.user));
    } catch (err) {
      console.warn('Failed to fetch user:', err);
      localStorage.removeItem('user');
      sessionStorage.removeItem('wewatch_ws_token');
      setCurrentUser(null);
      setWsToken(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      const response = await getCurrentUser();
      setCurrentUser(response.user);
      localStorage.setItem('user', JSON.stringify(response.user));
      return response.user;
    } catch (err) {
      console.warn('Failed to refresh user:', err);
      throw err;
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, wsToken, loading, setCurrentUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

export default AuthContext;
