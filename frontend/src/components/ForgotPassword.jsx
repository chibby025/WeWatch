// frontend/src/components/ForgotPassword.jsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await axios.post(
        `${API_URL}/api/auth/forgot-password`,
        { email },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          withCredentials: true,
        }
      );

      console.log("Password reset email sent:", response.data);
      setSuccess(true);
      setEmail(''); // Clear email field
    } catch (err) {
      console.error("Forgot password failed:", err.response?.status || err.message);
      
      let errorMessage = "Unable to process request. Please try again.";
      
      if (err.response) {
        const status = err.response.status;
        const data = err.response.data;
        
        if (status === 429) {
          errorMessage = "Too many reset requests. Please wait an hour before trying again.";
        } else if (status === 400) {
          errorMessage = data?.error || "Invalid email address. Please check and try again.";
        } else if (status >= 500) {
          errorMessage = "Server error. Please try again in a few moments.";
        } else {
          errorMessage = data?.error || "Unable to process request. Please try again later.";
        }
      } else if (err.request) {
        errorMessage = "Cannot connect to server. Please check your internet connection.";
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen max-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-black flex relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-white/5 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 w-full flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-md">
          {/* Logo/Brand */}
          <div className="text-center mb-6 md:mb-8">
            <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-blue-400 to-purple-400 mb-2 animate-gradient">
              WeWatch
            </h1>
            <p className="text-gray-300 text-sm md:text-base">Reset Your Password</p>
          </div>

          {/* Form Card */}
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 p-6 md:p-8">
            {success ? (
              <div className="text-center space-y-4">
                {/* Success Icon */}
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>

                {/* Success Message */}
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">Check Your Email</h2>
                  <p className="text-gray-300 text-sm md:text-base">
                    If an account exists with that email address, you'll receive a password reset link within a few minutes.
                  </p>
                  <p className="text-gray-400 text-xs md:text-sm mt-3">
                    The reset link will expire in 15 minutes for security.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-4">
                  <Link
                    to="/login"
                    className="block w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold rounded-lg shadow-lg hover:shadow-purple-500/50 transition-all duration-300 transform hover:scale-105 text-center"
                  >
                    Back to Login
                  </Link>
                  <button
                    onClick={() => setSuccess(false)}
                    className="block w-full py-3 px-4 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-medium rounded-lg border border-white/20 transition-all duration-300 text-center"
                  >
                    Send Another Email
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-white mb-2">Forgot Password?</h2>
                  <p className="text-gray-300 text-sm md:text-base">
                    No worries! Enter your email address and we'll send you a link to reset your password.
                  </p>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg backdrop-blur-sm">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <p className="text-red-200 text-sm flex-1">{error}</p>
                    </div>
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Email Input */}
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                      Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                        </svg>
                      </div>
                      <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={isLoading}
                        required
                        placeholder="you@example.com"
                        className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold text-base md:text-lg rounded-lg shadow-lg hover:shadow-purple-500/50 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Sending Reset Link...
                      </span>
                    ) : (
                      'Send Reset Link'
                    )}
                  </button>
                </form>

                {/* Back to Login */}
                <div className="mt-6 text-center">
                  <Link 
                    to="/login" 
                    className="text-purple-400 hover:text-purple-300 transition-colors font-medium text-sm inline-flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Login
                  </Link>
                </div>
              </>
            )}
          </div>

          {/* Help Text */}
          <div className="mt-6 text-center">
            <p className="text-gray-400 text-xs md:text-sm">
              Don't have an account?{' '}
              <Link to="/register" className="text-purple-400 hover:text-purple-300 transition-colors font-medium">
                Sign up here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
