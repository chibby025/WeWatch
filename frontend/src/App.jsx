// frontend/src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './index.css';

// All imports restored to synchronous (no lazy loading)
import Home from './pages/Home';
import Login from './components/Login';
import Register from './components/Register';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import GoogleAuthCallback from './components/GoogleAuthCallback';
import ProtectedRoute from './components/ProtectedRoute';
import PostRedirect from './components/PostRedirect';
import LobbyPage from './components/LobbyPage';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './contexts/AuthContext';
import { PaymentProvider } from './contexts/PaymentContext';
import PaymentPage from './pages/PaymentPage';
import AdminDashboard from './pages/AdminDashboard';
import CreateRoomPage from './components/CreateRoomPage';
import RoomsListPage from './components/RoomsListPage';
import RoomPageNew from './components/RoomPageNew';
import RoomHandleRedirect from './components/RoomHandleRedirect';
import VideoWatch from './components/cinema/VideoWatch';
import CinemaScene3DDemo from './components/cinema/3d-cinema/CinemaScene3DDemo';
import LectureHallPage from './pages/LectureHallPage';
import WalletPage from './pages/WalletPage';
import WithdrawalPage from './pages/WithdrawalPage';
import PaymentAccountManagement from './components/payment/PaymentAccountManagement';
import WithdrawalRequestForm from './components/payment/WithdrawalRequestForm';
import KYCSubmissionForm from './components/payment/KYCSubmissionForm';
import SVGComparison from './components/dev/SVGComparison';
import VsBattlePreview from './components/dev/VsBattlePreview';
import RhythmHeroHighwayPreview from './components/dev/RhythmHeroHighwayPreview';
import ExplorePage from './pages/ExplorePage';
import BackButtonGuard from './components/BackButtonGuard';
import GuestViewPage from './pages/GuestViewPage';

// ✅ ALL AVATAR DEMO IMPORTS COMMENTED/REMOVED
/*
import AvatarImageDemo from './components/cinema/3d-cinema/AvatarImageDemo';
import AvatarStyleComparison from './components/cinema/3d-cinema/AvatarStyleComparison';
import ImprovedAvatarDemo from './components/cinema/3d-cinema/ImprovedAvatarDemo';
import GLBAvatarTest from './components/cinema/3d-cinema/GLBAvatarTest';
*/

function App() {
  // 📱 Mobile debugging console - shows on-screen console for mobile testing
  React.useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile && import.meta.env.DEV) {
      // Capture all console logs
      const logs = [];
      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;
      
      // Safe stringify that handles circular references
      const safeStringify = (obj) => {
        try {
          return JSON.stringify(obj, (key, value) => {
            // Skip circular references and DOM nodes
            if (value instanceof HTMLElement || value instanceof Node) {
              return '[DOM Element]';
            }
            if (typeof value === 'object' && value !== null) {
              // Check for circular reference markers
              if (value.__reactFiber$ || value._reactInternals) {
                return '[React Element]';
              }
            }
            return value;
          }, 2);
        } catch (e) {
          return '[Unable to stringify: ' + e.message + ']';
        }
      };
      
      console.log = (...args) => {
        logs.push({ type: 'log', time: new Date().toISOString(), args: args.map(a => 
          typeof a === 'object' ? safeStringify(a) : String(a)
        ).join(' ') });
        originalLog.apply(console, args);
      };
      
      console.error = (...args) => {
        logs.push({ type: 'error', time: new Date().toISOString(), args: args.map(a => 
          typeof a === 'object' ? safeStringify(a) : String(a)
        ).join(' ') });
        originalError.apply(console, args);
      };
      
      console.warn = (...args) => {
        logs.push({ type: 'warn', time: new Date().toISOString(), args: args.map(a => 
          typeof a === 'object' ? safeStringify(a) : String(a)
        ).join(' ') });
        originalWarn.apply(console, args);
      };
    }
  }, []);

  // 🧹 GLOBAL CLEANUP: Remove only OLD WebSocket tokens on app startup
  // This prevents zombie WebSocket reconnection attempts with expired tokens
  // ⚠️ NEVER delete 'wewatch_token' - that's the active auth token!
  React.useEffect(() => {
    const legacyKeys = ['old_wewatch_ws_token']; // Only cleanup old WS tokens
    legacyKeys.forEach(key => {
      if (sessionStorage.getItem(key) || localStorage.getItem(key)) {
        console.log(`[App] 🧹 Cleaning up legacy token: ${key}`);
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
      }
    });
  }, []);

  return (
    <AuthProvider>
      <PaymentProvider>
        <Router>
          <BackButtonGuard />
          <div className="min-h-screen bg-gray-900">
          <Routes>
          {/* Public routes */}
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/google/success" element={<GoogleAuthCallback />} />
          
          {/* Lobby — public browse mode for guests, full mode for authenticated users */}
          <Route path="/" element={<LobbyPage />} />
          <Route path="/lobby" element={<LobbyPage />} />

          {/* Guest view — unauthenticated preview of a live session */}
          <Route path="/guest/:sessionId" element={<GuestViewPage />} />
          
          {/* Post sharing route - redirects to lobby with post modal */}
          <Route path="/post/:id" element={
            <ProtectedRoute><PostRedirect /></ProtectedRoute>
          } />
          
          <Route path="/payment" element={
            <ProtectedRoute><PaymentPage /></ProtectedRoute>
          } />

          <Route path="/admin/dashboard" element={
            <ProtectedRoute><AdminDashboard /></ProtectedRoute>
          } />

          <Route path="/wallet" element={
            <ProtectedRoute><WalletPage /></ProtectedRoute>
          } />

          <Route path="/withdraw" element={
            <ProtectedRoute><WithdrawalPage /></ProtectedRoute>
          } />

          <Route path="/wallet/accounts" element={
            <ProtectedRoute><PaymentAccountManagement /></ProtectedRoute>
          } />

          <Route path="/wallet/withdraw" element={
            <ProtectedRoute><WithdrawalRequestForm /></ProtectedRoute>
          } />

          <Route path="/wallet/kyc" element={
            <ProtectedRoute><KYCSubmissionForm /></ProtectedRoute>
          } />

          <Route path="/rooms" element={
            <ProtectedRoute><RoomsListPage /></ProtectedRoute>
          } />

          <Route path="/rooms/create" element={
            <ProtectedRoute><CreateRoomPage /></ProtectedRoute>
          } />

          <Route path="/rooms/:id" element={
            <ErrorBoundary>
              <ProtectedRoute><RoomPageNew /></ProtectedRoute>
            </ErrorBoundary>
          } />

          {/* Short shareable room link — resolves the handle then hands off to
              /rooms/:id above. Deliberately NOT behind ProtectedRoute, since a
              share link must work for a visitor who isn't logged in yet. */}
          <Route path="/r/:handle" element={
            <ErrorBoundary>
              <RoomHandleRedirect />
            </ErrorBoundary>
          } />

          {/* 🚀 HEAVY ROUTES: Lazy-loaded chunks for Video/3D/Classroom */}
          <Route path="/watch/:roomId" element={
            <ProtectedRoute><VideoWatch /></ProtectedRoute>
          } />

          <Route path="/cinema-3d-demo/:roomId" element={
            <ProtectedRoute><CinemaScene3DDemo /></ProtectedRoute>
          } />

          <Route path="/classroom/classroom/:roomId" element={
            <ProtectedRoute><LectureHallPage /></ProtectedRoute>
          } />

          <Route path="/classroom/lecture-hall/:roomId" element={
            <ProtectedRoute><LectureHallPage /></ProtectedRoute>
          } />

          {/* 🎨 DEV TOOLS */}
          <Route path="/dev/svg-comparison" element={
            <SVGComparison />
          } />
          <Route path="/dev/vs-battle-preview" element={
            <VsBattlePreview />
          } />
          <Route path="/dev/rhythm-hero-highway" element={
            <RhythmHeroHighwayPreview />
          } />

          {/* ✅ ALL DEMO ROUTES COMMENTED OUT */}
          {/*
          <Route path="/avatar-image-demo" element={
            <ProtectedRoute><AvatarImageDemo /></ProtectedRoute>
          } />
          <Route path="/avatar-style-comparison" element={
            <ProtectedRoute><AvatarStyleComparison /></ProtectedRoute>
          } />
          <Route path="/improved-avatar-demo" element={
            <ProtectedRoute><ImprovedAvatarDemo /></ProtectedRoute>
          } />
          <Route path="/glb-avatar-test" element={
            <ProtectedRoute><GLBAvatarTest /></ProtectedRoute>
          } />
          */}

        </Routes>
        </div>
      </Router>
      </PaymentProvider>
    </AuthProvider>
  );
}

export default App;