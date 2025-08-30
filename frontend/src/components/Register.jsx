// frontend/src/components/Register.jsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
// Import the API service function
import { registerUser } from '../services/api'; // Adjust path if needed

const Register = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false); // State for loading indicator
  const [error, setError] = useState(null); // State for error messages
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
        setError("Passwords do not match!");
        return;
    }

    setIsLoading(true);
    setError(null); // Clear previous errors

    try {
      // Prepare data for the API call
      const userData = { username, email, password };

      // Call the registerUser function from the API service
      const data = await registerUser(userData);
      console.log("Registration successful:", data); // Log the response

      // Handle successful registration
      // The backend should ideally return a success message and potentially a token.
      // For now, let's assume it just returns user data on success.
      alert(`Registration successful! Welcome, ${data.username || data.email}!`);
      // Redirect to login page so they can log in.
      navigate('/login');
    } catch (err) {
      // Handle errors from the API call
      console.error("Registration failed:", err);
      // Axios errors often have a `response` object with status and data
      if (err.response) {
        // Server responded with an error status (4xx, 5xx)
        setError(`Registration failed: ${err.response.data.message || err.response.statusText}`);
      } else if (err.request) {
        // Request was made but no response received
        setError('Network error. Please check your connection.');
      } else {
        // Something else happened
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false); // Stop loading indicator regardless of success/failure
    }
  };


  return (
    <div className="container mx-auto p-4 max-w-md">
      <h2 className="text-2xl font-bold mb-4">Register for WeWatch</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-700">Username:</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email:</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password:</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">Confirm Password:</label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <button
          type="submit"
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          Register
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-600">
        Already have an account? <Link to="/login" className="font-medium text-green-600 hover:text-green-500">Login here</Link>
      </p>
    </div>
  );
};

export default Register;