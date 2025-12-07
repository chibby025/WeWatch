import React, { useState, useEffect } from 'react';
import { XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';

const DeleteRoomModal = ({ isOpen, onClose, onConfirm, room }) => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (isOpen && room) {
      fetchRoomStats();
    }
  }, [isOpen, room]);

  const fetchRoomStats = async () => {
    try {
      setLoadingStats(true);
      // TODO: Create backend endpoint GET /api/rooms/:id/stats
      // For now, we'll use placeholder data
      setStats({
        mediaCount: 0,
        eventCount: 0,
        messageCount: 0,
        memberCount: 0
      });
    } catch (err) {
      console.error('Failed to fetch room stats:', err);
      setStats({
        mediaCount: 0,
        eventCount: 0,
        messageCount: 0,
        memberCount: 0
      });
    } finally {
      setLoadingStats(false);
    }
  };

  const handleConfirmDelete = async () => {
    setLoading(true);
    await onConfirm(room.id);
    setLoading(false);
    onClose();
  };

  if (!isOpen || !room) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <ExclamationTriangleIcon className="h-6 w-6 text-red-500" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Delete Room</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Are you sure you want to delete <span className="font-semibold text-gray-900 dark:text-white">"{room.name}"</span>?
          </p>

          {/* Stats */}
          {loadingStats ? (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">Loading room data...</p>
            </div>
          ) : (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 mb-4">
              <p className="text-sm font-semibold text-red-800 dark:text-red-300 mb-2">
                This will permanently delete:
              </p>
              <ul className="text-sm text-red-700 dark:text-red-400 space-y-1 ml-4">
                <li>• {stats.mediaCount} media item{stats.mediaCount !== 1 ? 's' : ''}</li>
                <li>• {stats.eventCount} scheduled event{stats.eventCount !== 1 ? 's' : ''}</li>
                <li>• {stats.messageCount} chat message{stats.messageCount !== 1 ? 's' : ''}</li>
                <li>• {stats.memberCount} membership{stats.memberCount !== 1 ? 's' : ''}</li>
                <li>• All watch sessions and activity history</li>
                <li>• All uploaded files and content</li>
              </ul>
            </div>
          )}

          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 mb-4 flex items-start gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              <strong>Warning:</strong> This action cannot be undone. All data will be permanently deleted.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmDelete}
            disabled={loading || loadingStats}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Deleting...
              </>
            ) : (
              'Delete Room'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteRoomModal;
