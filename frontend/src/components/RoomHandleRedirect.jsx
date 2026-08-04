// WeWatch/frontend/src/components/RoomHandleRedirect.jsx
// Renders at /r/:handle — resolves a room's shareable handle to its numeric
// ID via the public by-handle endpoint, then hands off to the real
// (protected) /rooms/:id page. Deliberately NOT wrapped in ProtectedRoute:
// a share link has to work for a visitor who isn't logged in yet — real
// access control still happens at /rooms/:id exactly as it does today.
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getRoomByHandle } from '../services/api';

export default function RoomHandleRedirect() {
  const { handle } = useParams();
  const navigate = useNavigate();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRoomByHandle(handle)
      .then((data) => {
        if (cancelled) return;
        const roomId = data?.room?.id;
        if (!roomId) {
          setNotFound(true);
          return;
        }
        // No location.state.roomData — only thin data was fetched here;
        // RoomPageNew does its own normal full fetch, same as any direct
        // /rooms/:id visit.
        navigate(`/rooms/${roomId}`, { replace: true });
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => { cancelled = true; };
  }, [handle, navigate]);

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-purple-900 via-gray-900 to-black text-white text-center px-8">
        <p className="text-xl font-semibold mb-2">Room not found</p>
        <p className="text-gray-400 text-sm mb-6">This room link is invalid or no longer exists.</p>
        <button
          onClick={() => navigate('/lobby')}
          className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white font-medium transition-colors"
        >
          ← Back to Lobby
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-xl">Loading room...</div>
    </div>
  );
}
