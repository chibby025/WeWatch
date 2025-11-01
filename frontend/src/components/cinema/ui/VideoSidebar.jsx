// src/components/cinema/ui/VideoSidebar.jsx
// 📹 REAL-TIME participant video sidebar — NO MOCK DATA
// Pulls participants from WebSocket state
// Shows real video streams + mic status
// Pure Tailwind — production-ready

import { useState, useEffect } from 'react';

export default function VideoSidebar({ participants = [], localStream = null }) {
  const [hoveredParticipant, setHoveredParticipant] = useState(null);

  // 🎥 Get video stream for participant (from your WebRTC setup)
  const getVideoStream = (participant) => {
    if (participant.id === 'local' && localStream) {
      return localStream;
    }
    // In production: return participant.stream (from your WebRTC peer connections)
    return participant.stream || null;
  };

  return (
    <div className="fixed right-4 top-1/2 transform -translate-y-1/2 w-64 z-40">
      {/* 📺 Video Tiles Container */}
      <div className="space-y-3">
        {participants.slice(0, 4).map((participant, index) => {
          const stream = getVideoStream(participant);
          const isLocal = participant.id === 'local';

          return (
            <div
              key={participant.id}
              className={`
                relative bg-gray-900 rounded-full overflow-hidden
                border-2 transition-all duration-200
                ${hoveredParticipant === participant.id 
                  ? 'scale-110 ring-4 ring-purple-500/50' 
                  : 'scale-100'
                }
                ${participant.isSpeaking 
                  ? 'border-green-500 animate-pulse' 
                  : participant.isMuted 
                    ? 'border-red-500' 
                    : 'border-gray-600'
                }
              `}
              style={{ width: '120px', height: '120px' }}
              onMouseEnter={() => setHoveredParticipant(participant.id)}
              onMouseLeave={() => setHoveredParticipant(null)}
            >
              {/* 📹 REAL VIDEO STREAM */}
              {stream ? (
                <video
                  srcObject={stream}
                  autoPlay
                  muted={isLocal} // Mute local stream to prevent feedback
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-700 flex items-center justify-center">
                  <div className="text-2xl">
                    {isLocal ? '👤' : '👥'}
                  </div>
                </div>
              )}

              {/* 🎤 Mic Status Indicator */}
              <div className={`
                absolute bottom-2 left-2 text-xs font-bold px-2 py-1 rounded-full
                ${participant.isMuted 
                  ? 'bg-red-500 text-white' 
                  : participant.isSpeaking 
                    ? 'bg-green-500 text-white animate-pulse' 
                    : 'bg-gray-600 text-gray-300'
                }
              `}>
                {participant.isMuted ? '🔇' : participant.isSpeaking ? '🔊' : '🎤'}
              </div>

              {/* 👤 Name Tag */}
              <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                {participant.name || `User${participant.id.slice(0, 4)}`}
              </div>
            </div>
          );
        })}
      </div>

      {/* ➕ Show More Button */}
      {participants.length > 4 && (
        <div className="mt-4 text-center">
          <button className="text-purple-400 hover:text-purple-300 text-sm font-medium">
            +{participants.length - 4} more
          </button>
        </div>
      )}
    </div>
  );
}