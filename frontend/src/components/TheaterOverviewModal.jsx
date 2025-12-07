// frontend/src/components/TheaterOverviewModal.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

export default function TheaterOverviewModal({ 
  isOpen, 
  onClose, 
  sessionId,
  isHost = false,
}) {
  const [theaters, setTheaters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingTheater, setEditingTheater] = useState(null);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (isOpen && sessionId) {
      fetchTheaters();
    }
  }, [isOpen, sessionId]);

  const fetchTheaters = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}/api/sessions/${sessionId}/theaters`,
        { withCredentials: true }
      );
      setTheaters(response.data || []);
    } catch (error) {
      console.error('Failed to fetch theaters:', error);
      toast.error('Failed to load theaters');
    } finally {
      setLoading(false);
    }
  };

  const handleRenameTheater = async (theaterId) => {
    if (!newName.trim()) {
      toast.error('Theater name cannot be empty');
      return;
    }

    try {
      await axios.put(
        `${import.meta.env.VITE_API_BASE_URL}/api/theaters/${theaterId}/name`,
        { name: newName },
        { withCredentials: true }
      );
      
      // Update local state
      setTheaters(prev => prev.map(t => 
        t.id === theaterId 
          ? { ...t, custom_name: newName }
          : t
      ));
      
      setEditingTheater(null);
      setNewName('');
      toast.success('Theater renamed successfully');
    } catch (error) {
      console.error('Failed to rename theater:', error);
      toast.error('Failed to rename theater');
    }
  };

  const getTheaterBadgeColor = (theaterNumber) => {
    const colors = [
      'bg-blue-500', // T1
      'bg-green-500', // T2
      'bg-purple-500', // T3
      'bg-orange-500', // T4
      'bg-pink-500', // T5
      'bg-teal-500', // T6
    ];
    return colors[(theaterNumber - 1) % colors.length];
  };

  const getTheaterDisplayName = (theater) => {
    return theater.custom_name || `Theater ${theater.theater_number}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <div>
            <h3 className="text-white text-xl font-bold">🎭 Theater Overview</h3>
            <p className="text-gray-400 text-sm mt-1">
              {theaters.length} {theaters.length === 1 ? 'theater' : 'theaters'} active
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center text-gray-400 py-8">Loading theaters...</div>
          ) : theaters.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              No theaters created yet. Theaters are auto-created when seats fill up.
            </div>
          ) : (
            <div className="space-y-4">
              {theaters.map(theater => {
                const occupancyPercentage = (theater.occupied_seats / theater.max_seats) * 100;
                const isEditing = editingTheater === theater.id;
                
                return (
                  <div 
                    key={theater.id}
                    className="bg-gray-700/50 rounded-lg p-4 hover:bg-gray-700 transition-colors"
                  >
                    {/* Theater Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        {/* Theater Badge */}
                        <span 
                          className={`px-3 py-1 rounded-lg text-white font-bold ${getTheaterBadgeColor(theater.theater_number)}`}
                        >
                          T{theater.theater_number}
                        </span>
                        
                        {/* Theater Name */}
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newName}
                              onChange={(e) => setNewName(e.target.value)}
                              className="bg-gray-600 text-white px-3 py-1 rounded border border-gray-500 focus:outline-none focus:border-blue-500"
                              placeholder="Theater name"
                              autoFocus
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  handleRenameTheater(theater.id);
                                }
                              }}
                            />
                            <button
                              onClick={() => handleRenameTheater(theater.id)}
                              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => {
                                setEditingTheater(null);
                                setNewName('');
                              }}
                              className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">
                              {getTheaterDisplayName(theater)}
                            </span>
                            {isHost && (
                              <button
                                onClick={() => {
                                  setEditingTheater(theater.id);
                                  setNewName(theater.custom_name || `Theater ${theater.theater_number}`);
                                }}
                                className="text-gray-400 hover:text-white text-sm"
                                title="Rename theater"
                              >
                                ✏️
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {/* Occupancy Count */}
                      <span className="text-gray-300 text-sm font-medium">
                        {theater.occupied_seats} / {theater.max_seats} seats
                      </span>
                    </div>
                    
                    {/* Occupancy Bar */}
                    <div className="w-full bg-gray-600 rounded-full h-4 overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${
                          occupancyPercentage >= 90 
                            ? 'bg-red-500' 
                            : occupancyPercentage >= 70 
                            ? 'bg-yellow-500' 
                            : 'bg-green-500'
                        }`}
                        style={{ width: `${occupancyPercentage}%` }}
                      >
                        <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white">
                          {occupancyPercentage.toFixed(0)}%
                        </div>
                      </div>
                    </div>
                    
                    {/* Status Text */}
                    <div className="mt-2 text-xs text-gray-400">
                      {theater.occupied_seats === 0 && 'Empty'}
                      {theater.occupied_seats > 0 && theater.occupied_seats < theater.max_seats && 'Active'}
                      {theater.occupied_seats === theater.max_seats && '🔴 Full'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="w-full bg-gray-600 hover:bg-gray-500 text-white py-2 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
