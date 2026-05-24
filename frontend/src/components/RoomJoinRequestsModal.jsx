// frontend/src/components/RoomJoinRequestsModal.jsx
import { useState, useEffect, useCallback } from 'react';
import { XMarkIcon, CheckIcon, XMarkIcon as XIcon } from '@heroicons/react/24/outline';
import { getRoomJoinRequests, approveRoomJoinRequest, rejectRoomJoinRequest } from '../services/api';
import Avatar from './Avatar';

export default function RoomJoinRequestsModal({ isOpen, onClose, roomId, onCountChange }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState({});

  const fetchRequests = useCallback(async () => {
    if (!roomId || !isOpen) return;
    setLoading(true);
    try {
      const res = await getRoomJoinRequests(roomId);
      const list = res.data.requests || [];
      setRequests(list);
      onCountChange?.(list.length);
    } catch (err) {
      console.error('[JoinRequests] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [roomId, isOpen, onCountChange]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (userId) => {
    setActionLoading(prev => ({ ...prev, [userId]: 'approve' }));
    try {
      await approveRoomJoinRequest(roomId, userId);
      const updated = requests.filter(r => r.user_id !== userId);
      setRequests(updated);
      onCountChange?.(updated.length);
    } catch (err) {
      console.error('[JoinRequests] approve error:', err);
    } finally {
      setActionLoading(prev => ({ ...prev, [userId]: null }));
    }
  };

  const handleReject = async (userId) => {
    setActionLoading(prev => ({ ...prev, [userId]: 'reject' }));
    try {
      await rejectRoomJoinRequest(roomId, userId);
      const updated = requests.filter(r => r.user_id !== userId);
      setRequests(updated);
      onCountChange?.(updated.length);
    } catch (err) {
      console.error('[JoinRequests] reject error:', err);
    } finally {
      setActionLoading(prev => ({ ...prev, [userId]: null }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 className="text-base font-bold text-white">Join Requests</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {requests.length} pending {requests.length === 1 ? 'request' : 'requests'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>
          ) : requests.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">No pending join requests</p>
            </div>
          ) : (
            requests.map(req => (
              <div key={req.user_id} className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-3">
                <Avatar
                  user={{ username: req.username, avatar_url: req.avatar_url }}
                  alt={req.username}
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{req.username}</p>
                  <p className="text-xs text-gray-500">Wants to join</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleApprove(req.user_id)}
                    disabled={!!actionLoading[req.user_id]}
                    className="w-8 h-8 rounded-full bg-green-600 hover:bg-green-500 flex items-center justify-center transition-colors disabled:opacity-50"
                    title="Approve"
                  >
                    <CheckIcon className="w-4 h-4 text-white" />
                  </button>
                  <button
                    onClick={() => handleReject(req.user_id)}
                    disabled={!!actionLoading[req.user_id]}
                    className="w-8 h-8 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors disabled:opacity-50"
                    title="Reject"
                  >
                    <XIcon className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
