// frontend/src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth'; // ✅ Use your existing hook

const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();

  // Show loader while checking auth
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  // If no user, redirect to login
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Otherwise, render protected content
  return children;
};

export default ProtectedRoute;