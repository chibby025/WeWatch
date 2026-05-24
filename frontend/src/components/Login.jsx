// frontend/src/components/Login.jsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
// Import the API service functions
import { loginUser, getCurrentUser } from '../services/api'; // Adjust path if needed
import { cacheUserData } from '../utils/cinemaCache';
import GoogleLoginButton from './GoogleLoginButton';
import { useAuth } from '../contexts/AuthContext'; // ✅ Import auth context

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { refreshUser } = useAuth(); // ✅ Get refreshUser from context

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
        console.log('✅ [Login] Login successful, refreshing auth state...');
        
        // ✅ REFRESH AUTH STATE BEFORE NAVIGATING
        // This ensures AuthContext has latest user data + room memberships
        await refreshUser();
        
        // 💾 Cache user data for instant cinema loading
        cacheUserData(user);
        console.log('💾 [Cache] User data cached on login');
        
        // ✅ NOW NAVIGATE — auth state is fully synced
        navigate('/lobby');
      } else {
        throw new Error("Login successful, but missing user data.");
      }
    } catch (err) {
      // ✅ Log error for debugging (not shown to user)
      console.error("Login failed:", err.response?.status || err.message);
      
      // ✅ User-friendly error messages (no internal details exposed)
      let errorMessage = "Unable to log in. Please try again.";
      
      if (err.response) {
        // Server responded with error
        const status = err.response.status;
        
        if (status === 401) {
          errorMessage = "Invalid email or password. Please check your credentials.";
        } else if (status === 403) {
          errorMessage = "Access denied. Please contact support if this continues.";
        } else if (status === 429) {
          errorMessage = "Too many login attempts. Please wait a few minutes and try again.";
        } else if (status === 400) {
          errorMessage = "Invalid login information. Please check your email and password.";
        } else if (status >= 500) {
          errorMessage = "Server is temporarily unavailable. Please try again in a few moments.";
        } else {
          errorMessage = "Unable to log in at this time. Please try again later.";
        }
      } else if (err.request) {
        // Network error - no response received
        errorMessage = "Cannot connect to server. Please check your internet connection and try again.";
      } else {
        // Generic error
        errorMessage = "An unexpected error occurred. Please try again.";
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-black flex relative overflow-x-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-white/5 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      {/* Stacked on mobile, side-by-side on sm+ */}
      <div className="relative z-10 w-full flex flex-col sm:flex-row">
        {/* Branding — compact strip on mobile, full panel on sm+ */}
        <div className="sm:w-[42%] lg:w-1/2 flex items-center justify-center py-8 px-6 sm:p-6 lg:p-12 animate-fade-in bg-black/60 sm:bg-black flex-shrink-0">
          <div className="text-center">
            {/* SVG on mobile (no padding, renders full-size) */}
            <img
              src="/icons/LetsWatchOut Logo.svg"
              alt="LetsWatchOut Logo"
              className="block sm:hidden h-[90px] w-auto mx-auto drop-shadow-2xl"
            />
            {/* PNG on sm+ (looks good at larger panel sizes) */}
            <img
              src="/icons/LetsWatchOutLogo.png"
              alt="LetsWatchOut Logo"
              className="hidden sm:block sm:w-36 sm:h-36 md:w-56 md:h-56 lg:w-80 lg:h-80 mx-auto drop-shadow-2xl hover:scale-105 transition-transform duration-300"
            />
            <p className="text-sm md:text-base lg:text-xl text-gray-300 mt-2 mb-1">Watch together, anywhere</p>
            <p className="hidden md:block text-xs lg:text-sm text-gray-400">You define the space. We bring your people together.</p>
          </div>
        </div>

        {/* Login Form */}
        <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-12 overflow-y-auto animate-slide-right">
          <div className="w-full max-w-md">
            {/* Welcome Header */}
            <div className="mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-1">Welcome Back</h2>
              <p className="text-xs sm:text-sm text-gray-400">Sign in to continue your watch party</p>
            </div>

            {/* Glass Card */}
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 p-4 sm:p-6 md:p-8">
              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-500/20 backdrop-blur-sm border border-red-500/50 text-red-200 rounded-lg animate-shake">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span>{error}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email Input */}
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-white mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 bg-white/5 backdrop-blur-sm border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 disabled:opacity-50"
                  />
                </div>

                {/* Password Input */}
                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-white mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      name="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 pr-12 bg-white/5 backdrop-blur-sm border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      data-testid="password-visibility-toggle"
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
                </div>

                {/* Remember Me & Forgot Password */}
                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      disabled={isLoading}
                      className="w-4 h-4 bg-white/5 border-white/20 rounded text-purple-500 focus:ring-purple-500 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-gray-300 group-hover:text-white transition-colors">Remember me</span>
                  </label>
                  <Link 
                    to="/forgot-password" 
                    className="text-purple-400 hover:text-purple-300 transition-colors font-medium"
                  >
                    Forgot password?
                  </Link>
                </div>

                {/* Login Button */}
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
                      Signing in...
                    </span>
                  ) : (
                    'Sign In'
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/20"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-transparent text-gray-400">Or continue with</span>
                </div>
              </div>

              {/* Social Login Buttons */}
              <div className="space-y-2.5">
                {/* Google */}
                <GoogleLoginButton />

                {/* Apple */}
                <button
                  type="button"
                  disabled
                  title="Coming soon"
                  className="w-full py-2.5 px-4 bg-white/5 backdrop-blur-sm border border-white/20 rounded-lg text-white text-sm font-medium hover:bg-white/10 transition-all duration-300 flex items-center justify-center gap-3 group opacity-50 cursor-not-allowed"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  <span>Continue with Apple</span>
                  <span className="text-xs text-gray-500">(Coming Soon)</span>
                </button>
              </div>

              {/* Register Link */}
              <p className="mt-4 text-center text-sm text-gray-400">
                Don't have an account?{' '}
                <Link 
                  to="/register" 
                  className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 hover:from-purple-300 hover:to-blue-300 transition-all"
                >
                  Create one now
                </Link>
              </p>
            </div>

            {/* Footer */}
            <div className="text-center mt-4 text-gray-500 text-xs">
              <p>© 2026 LetsWatchOut. Watch together, anywhere.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Custom animations */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateX(-40px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes slide-right {
          from {
            opacity: 0;
            transform: translateX(40px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        
        .animate-fade-in {
          animation: fade-in 0.8s ease-out;
        }
        
        .animate-slide-right {
          animation: slide-right 0.8s ease-out;
        }
        
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
        
        .delay-1000 {
          animation-delay: 1s;
        }
        
        .delay-2000 {
          animation-delay: 2s;
        }
      `}</style>
    </div>
  );
};

export default Login;