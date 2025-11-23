// frontend/src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './index.css';

// Import page/component files
import Home from './pages/Home';
import Login from './components/Login';
import Register from './components/Register';
import ProtectedRoute from './components/ProtectedRoute';
import CreateRoomPage  from './components/CreateRoomPage';
import RoomsListPage from './components/RoomsListPage';
import RoomPage from './components/RoomPage';
import LobbyPage from './components/LobbyPage';
import VideoWatch from './components/cinema/VideoWatch';
import CinemaScene3DDemo from './components/cinema/3d-cinema/CinemaScene3DDemo';
import ErrorBoundary from './components/ErrorBoundary';
// ✅ ALL AVATAR DEMO IMPORTS COMMENTED/REMOVED
/*
import AvatarImageDemo from './components/cinema/3d-cinema/AvatarImageDemo';
import AvatarStyleComparison from './components/cinema/3d-cinema/AvatarStyleComparison';
import ImprovedAvatarDemo from './components/cinema/3d-cinema/ImprovedAvatarDemo';
import GLBAvatarTest from './components/cinema/3d-cinema/GLBAvatarTest';
*/

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* Protected routes */}
          <Route path="/" element={
            <ProtectedRoute><Home /></ProtectedRoute>
          } />
          
          <Route path="/lobby" element={
            <ProtectedRoute><LobbyPage /></ProtectedRoute>
          } />          

          <Route path="/rooms" element={
            <ProtectedRoute><RoomsListPage /></ProtectedRoute>
          } />

          <Route path="/rooms/create" element={
            <ProtectedRoute><CreateRoomPage /></ProtectedRoute>
          } />

          <Route path="/rooms/:id" element={
            <ErrorBoundary>
              <ProtectedRoute><RoomPage /></ProtectedRoute>
            </ErrorBoundary>
          } />

          <Route path="/watch/:roomId" element={
            <ProtectedRoute><VideoWatch /></ProtectedRoute>
          } />

          <Route path="/cinema-3d-demo/:roomId" element={
            <ProtectedRoute><CinemaScene3DDemo /></ProtectedRoute>
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
  );
}

export default App;