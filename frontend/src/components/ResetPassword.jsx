// frontend/src/components/ResetPassword.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Password strength indicator
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, text: '', color: '' });

  useEffect(() => {
    // Get token from URL query params
    const tokenParam = searchParams.get('token');
    if (tokenParam) {
      setToken(tokenParam);
    } else {
      setError('Invalid or missing reset token. Please request a new password reset link.');
    }
  }, [searchParams]);

  // Calculate password strength
  useEffect(() => {
    if (!password) {
      setPasswordStrength({ score: 0, text: '', color: '' });
      return;
    }

    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    const strengths = [
      { score: 0, text: 'Very Weak', color: 'bg-red-500' },
      { score: 1, text: 'Weak', color: 'bg-orange-500' },
      { score: 2, text: 'Fair', color: 'bg-yellow-500' },
      { score: 3, text: 'Good', color: 'bg-blue-500' },
      { score: 4, text: 'Strong', color: 'bg-green-500' },
      { score: 5, text: 'Very Strong', color: 'bg-green-600' },
    ];

    setPasswordStrength(strengths[score]);
  }, [password]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Validation
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please try again.');
      setIsLoading(false);
      return;
    }

    if (!token) {
      setError('Invalid reset token. Please request a new password reset link.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await axios.post(
        `${API_URL}/api/auth/reset-password`,
        { 
          token,
          new_password: password 
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          withCredentials: true,
        }
      );

      console.log("Password reset successful:", response.data);
      setSuccess(true);
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err) {
      console.error("Password reset failed:", err.response?.status || err.message);
      
      let errorMessage = "Unable to reset password. Please try again.";
      
      if (err.response) {
        const status = err.response.status;
        const data = err.response.data;
        
        if (status === 400) {
          if (data?.error?.includes('expired')) {
            errorMessage = "This reset link has expired. Please request a new password reset.";
          } else if (data?.error?.includes('used')) {
            errorMessage = "This reset link has already been used. Please request a new password reset if needed.";
          } else if (data?.error?.includes('Invalid token')) {
            errorMessage = "Invalid reset link. Please request a new password reset.";
          } else {
            errorMessage = data?.error || "Invalid request. Please try again.";
          }
        } else if (status >= 500) {
          errorMessage = "Server error. Please try again in a few moments.";
        } else {
          errorMessage = data?.error || "Unable to reset password. Please try again later.";
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
            <p className="text-gray-300 text-sm md:text-base">Set Your New Password</p>
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
                  <h2 className="text-2xl font-bold text-white mb-2">Password Reset Successful!</h2>
                  <p className="text-gray-300 text-sm md:text-base">
                    Your password has been changed successfully. You can now log in with your new password.
                  </p>
                  <p className="text-gray-400 text-xs md:text-sm mt-3">
                    Redirecting to login page...
                  </p>
                </div>

                {/* Action Button */}
                <div className="pt-4">
                  <Link
                    to="/login"
                    className="block w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold rounded-lg shadow-lg hover:shadow-purple-500/50 transition-all duration-300 transform hover:scale-105 text-center"
                  >
                    Go to Login
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-white mb-2">Reset Password</h2>
                  <p className="text-gray-300 text-sm md:text-base">
                    Enter your new password below. Make sure it's strong and secure.
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
                  {/* New Password Input */}
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                      New Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading || !token}
                        required
                        minLength={8}
                        placeholder="Enter new password"
                        className="w-full pl-10 pr-12 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={isLoading}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white transition-colors"
                      >
                        {showPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* Password Strength Indicator */}
                    {password && (
                      <div className="mt-2">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                              style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-gray-300">
                            {passwordStrength.text}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">
                          Use 8+ characters with uppercase, lowercase, numbers, and symbols
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password Input */}
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        id="confirmPassword"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={isLoading || !token}
                        required
                        minLength={8}
                        placeholder="Confirm new password"
                        className="w-full pl-10 pr-12 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        disabled={isLoading}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white transition-colors"
                      >
                        {showConfirmPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* Password Match Indicator */}
                    {confirmPassword && (
                      <div className="mt-2 flex items-center gap-1.5">
                        {password === confirmPassword ? (
                          <>
                            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-xs text-green-400">Passwords match</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <span className="text-xs text-red-400">Passwords do not match</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isLoading || !token || password !== confirmPassword}
                    className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold text-base md:text-lg rounded-lg shadow-lg hover:shadow-purple-500/50 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Resetting Password...
                      </span>
                    ) : (
                      'Reset Password'
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
              Need help?{' '}
              <Link to="/forgot-password" className="text-purple-400 hover:text-purple-300 transition-colors font-medium">
                Request a new reset link
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
