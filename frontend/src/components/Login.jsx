// frontend/src/components/Login.jsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
// Import the API service functions
import { loginUser, getCurrentUser } from '../services/api'; // Adjust path if needed

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const credentials = { email, password };
      const loginData = await loginUser(credentials);
      console.log("Login successful:", loginData);

      const { user } = loginData;
      if (user) {
        // ✅ Save user
        localStorage.setItem('user', JSON.stringify(user));

        // ✅ FETCH CURRENT USER TO SYNC AUTH STATE
        try {
          const currentUser = await getCurrentUser();
          localStorage.setItem('user', JSON.stringify(currentUser));
        } catch (err) {
          console.warn("Failed to fetch current user after login:", err);
          // Still proceed — cookie is valid
        }

        console.log("User stored in localStorage");
        alert("Login successful!");
        
        // ✅ NOW NAVIGATE — auth state is ready
        navigate('/lobby');
      } else {
        throw new Error("Login successful, but missing user data.");
      }
    } catch (err) {
      console.error("Login failed:", err);
      // ... error handling
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-md">
      <h2 className="text-2xl font-bold mb-4">Login to WeWatch</h2>
      {/* Display error message if there is one */}
      {error && <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email input group */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email:</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
          />
        </div>
        {/* Password input group */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password:</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
          />
        </div>
        {/* Submit button */}
        <button
          type="submit"
          disabled={isLoading}
          className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
            isLoading ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700'
          } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50`}
        >
          {isLoading ? 'Logging in...' : 'Login'}
        </button>
      </form>
      {/* Paragraph with a link to the Register page */}
      <p className="mt-4 text-sm text-gray-600">
        Don't have an account? <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500">Register here</Link>
      </p>
    </div>
  );
};

export default Login;