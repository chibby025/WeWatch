// frontend/src/components/Login.jsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
// Import the API service functions
import { loginUser, getCurrentUser } from '../services/api'; // Adjust path if needed

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
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
        
        // ✅ NOW NAVIGATE — auth state is ready
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
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-black flex relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-white/5 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      {/* Split Screen Layout */}
      <div className="relative z-10 w-full flex flex-col lg:flex-row">
        {/* Left Side - Logo & Branding */}
        <div className="lg:w-1/2 flex items-center justify-center p-8 md:p-12 lg:p-16 animate-fade-in bg-black">
          <div className="text-center max-w-2xl">
            <img 
              src="/icons/LetsWatchOutLogo.png" 
              alt="WeWatch Logo" 
              className="w-80 h-80 md:w-[420px] md:h-[420px] lg:w-[512px] lg:h-[512px] mx-auto mb-0 drop-shadow-2xl hover:scale-105 transition-transform duration-300"
            />
            <p className="text-xl md:text-2xl lg:text-2xl text-gray-300 mb-2">Watch together, anywhere</p>
            <p className="text-sm md:text-base lg:text-base text-gray-400">Join millions creating unforgettable watch party experiences</p>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="lg:w-1/2 flex items-center justify-center p-8 md:p-12 lg:p-16 animate-slide-right">
          <div className="w-full max-w-md">
            {/* Welcome Header */}
            <div className="mb-8">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">Welcome Back</h2>
              <p className="text-gray-400 md:text-base">Sign in to continue your watch party</p>
            </div>

            {/* Glass Card */}
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 p-8 md:p-10">
              {/* Error Message */}
              {error && (
                <div className="mb-6 p-4 bg-red-500/20 backdrop-blur-sm border border-red-500/50 text-red-200 rounded-lg animate-shake">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span>{error}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email Input */}
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-white mb-2">
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
                  <label htmlFor="password" className="block text-sm font-semibold text-white mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-white/5 backdrop-blur-sm border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 disabled:opacity-50"
                  />
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
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/20"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-transparent text-gray-400">Or continue with</span>
                </div>
              </div>

              {/* Social Login Buttons */}
              <div className="space-y-3">
                {/* Google */}
                <button
                  type="button"
                  disabled
                  className="w-full py-3 px-4 bg-white/5 backdrop-blur-sm border border-white/20 rounded-lg text-white font-medium hover:bg-white/10 transition-all duration-300 flex items-center justify-center gap-3 group opacity-50 cursor-not-allowed"
                  title="Coming soon"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>Continue with Google</span>
                  <span className="text-xs text-gray-500">(Coming Soon)</span>
                </button>

                {/* Apple */}
                <button
                  type="button"
                  disabled
                  className="w-full py-3 px-4 bg-white/5 backdrop-blur-sm border border-white/20 rounded-lg text-white font-medium hover:bg-white/10 transition-all duration-300 flex items-center justify-center gap-3 group opacity-50 cursor-not-allowed"
                  title="Coming soon"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  <span>Continue with Apple</span>
                  <span className="text-xs text-gray-500">(Coming Soon)</span>
                </button>
              </div>

              {/* Register Link */}
              <p className="mt-6 text-center text-sm text-gray-400">
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
            <div className="text-center mt-6 text-gray-500 text-xs">
              <p>© 2026 WeWatch. Watch together, anywhere.</p>
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