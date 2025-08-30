// frontend/src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './index.css';

// Import page/component files
import Home from './pages/Home';
import Login from './components/Login';
import Register from './components/Register';
import ProtectedRoute from './components/ProtectedRoute'; // Import ProtectedRoute
import CreateRoomPage  from './components/CreateRoomPage';
import RoomsListPage from './components/RoomsListPage';
import RoomPage from './components/RoomPage';
import LobbyPage from './components/LobbyPage';


function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          {/* Wrap the home route with ProtectedRoute */}
          <Route path="/" element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          } />
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          {/* Add more routes later, wrapping protected ones with ProtectedRoute */}
          {/* Wrap room-related routes with ProtectedRoute if they require auth */}

          {/* --- Protected Routes --- */}
          
          <Route path="/lobby" element={
            <ProtectedRoute>
              <LobbyPage />
            </ProtectedRoute>
          } />          


          <Route path="/rooms" element={
            <ProtectedRoute>
              <RoomsListPage />
            </ProtectedRoute>
          } />
          <Route path="/rooms/create" element={
            <ProtectedRoute>
              <CreateRoomPage />
            </ProtectedRoute>
          } />
          {/* Example route for a specific room page (placeholder) */}
          <Route path="/rooms/:id" element={
            <ProtectedRoute>
              <RoomPage />
            </ProtectedRoute>
          } />
          {/* --- --- --- */}

          {/* Add more routes later, wrapping protected ones with ProtectedRoute */}

        </Routes>
      </div>
    </Router>
  );
}

export default App;