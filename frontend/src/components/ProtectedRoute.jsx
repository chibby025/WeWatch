// frontend/src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { getCurrentUser } from '../services/api'; // We'll use this to check token validity

// Simple helper function to check if user is authenticated
// This checks for the token and optionally tries to fetch user data
const isAuthenticated = async () => {
  const token = localStorage.getItem('wewatch_token');
  if (!token) {
    return false; // No token, definitely not authenticated
  }

  // Optional: Try fetching user data to verify token validity
  // This makes an API call, so it's asynchronous
  try {
    await getCurrentUser(); // This will use the token via the interceptor
    return true; // Token was valid and user data fetched
  } catch (error) {
    // If the call fails (especially with 401), token is likely invalid
    console.warn("Token invalid or expired:", error);
    localStorage.removeItem('wewatch_token'); // Clean up invalid token
    return false;
  }
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  // For a basic check on initial render, we can just check for the token's presence.
  // A more robust solution would involve global state (Context/Zustand)
  // and re-checking on app load, or using a more complex auth flow.
  const token = localStorage.getItem('wewatch_token');

  // If no token, redirect to login
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // If token exists, render the protected children components
  // Note: This is a basic check. The `isAuthenticated` function above
  // shows how you could verify the token with the backend.
  return children;
};

export default ProtectedRoute;