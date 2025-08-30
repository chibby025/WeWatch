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
      // Prepare credentials for the API call
      const credentials = { email, password };

      // Call the loginUser function from the API service
      const loginData = await loginUser(credentials);
      console.log("Login successful:", loginData);

      // Handle successful login
      // Assume the backend returns an object with a `token` property
      const { token } = loginData;
      if (token) {
        // Store the JWT token securely in localStorage
        localStorage.setItem('wewatch_token', token);
        console.log("Token stored in localStorage:", token);
        alert("Login successful!");

        // Optional: Fetch user details immediately after login
        // This confirms the token works and gets user info
        try {
            const userData = await getCurrentUser();
            console.log("Current user data:", userData);
            // You could store user data in state/context if needed immediately
        } catch (userError) {
            console.warn("Could not fetch user data after login:", userError);
            // Even if fetching user data fails, the login with token was successful
        }

        // Redirect to the main application area (e.g., a dashboard or home page that requires auth)
        // For now, let's redirect to the root '/', which we'll need to protect later.
        // Changing it to be for rooms list navigation
        navigate('/lobby');
      } else {
        // Handle case where token isn't in the expected place in the response
        throw new Error("Login successful, but no token received.");
      }
    } catch (err) {
      console.error("Login failed:", err);
      if (err.response) {
        // Server responded with an error status
        // Common errors: 401 Unauthorized (wrong credentials)
        if (err.response.status === 401) {
            setError('Invalid email or password.');
        } else {
            setError(`Login failed: ${err.response.data.message || err.response.statusText}`);
        }
      } else if (err.request) {
        setError('Network error. Please check your connection.');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
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