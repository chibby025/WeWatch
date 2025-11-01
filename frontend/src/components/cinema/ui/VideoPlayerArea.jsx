// src/components/cinema/ui/VideoPlayerArea.jsx
// 📺 Fullscreen video player area — with loading spinner + platform placeholders
// Supports: uploads, YouTube embeds, screen share, "Watch From" platforms
// Pure Tailwind — responsive, accessible, cinematic

import { useState, useEffect, useRef } from 'react';
import CinemaVideoPlayer from './CinemaVideoPlayer';
export default function VideoPlayerArea({ currentMedia = null }) {
  // 🎞️ Loading State
  const [isLoading, setIsLoading] = useState(false);
  const videoRef = useRef(null);

  // 🔄 Simulate loading when media changes
  useEffect(() => {
    if (!currentMedia) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Simulate 1.5s load time (replace with real onLoad in production)
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, [currentMedia]);

  // 📺 Render different player types based on media source
  const renderPlayer = () => {
  if (!currentMedia) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <p>Select a video to play</p>
      </div>
    );
  }

  const { type, url, title } = currentMedia;

  switch (type) {
    case 'upload':
      // 📁 Uploaded video file → use CinemaVideoPlayer
      return (
        <CinemaVideoPlayer
          mediaItem={currentMedia}
          isPlaying={isPlaying}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={onEnded}
          onError={(err) => {
            console.error("🎬 VideoPlayerArea: CinemaVideoPlayer error:", err);
            setIsLoading(false);
          }}
        />
      );

    case 'youtube':
      // ▶️ YouTube embed
      const videoId = url.split('v=')[1]?.split('&')[0] || url.split('/').pop();
      return (
        <iframe
          src={`https://www.youtube.com/embed/  ${videoId}?autoplay=1`}
          className="w-full h-full"
          allow="autoplay; encrypted-media"
          allowFullScreen
          title={title || "YouTube Video"}
          onLoad={() => setIsLoading(false)}
        />
      );

    case 'screen':
      // 💻 Screen share placeholder
      return (
        <div className="w-full h-full bg-gray-800 flex flex-col items-center justify-center p-8">
          <div className="text-6xl mb-4">🖥️</div>
          <h3 className="text-xl font-bold mb-2">Screen Sharing Active</h3>
          <p className="text-gray-400 text-center">
            {title || "A participant is sharing their screen"}
          </p>
        </div>
      );

    case 'platform':
      // 🌐 Netflix/Hulu/Prime placeholder
      return (
        <div className="w-full h-full bg-gray-900 flex flex-col items-center justify-center p-8">
          <div className="text-6xl mb-4">🎬</div>
          <h3 className="text-xl font-bold mb-2">Streaming from {title}</h3>
          <p className="text-gray-400 text-center mb-4">
            Start screen sharing to watch {title} together
          </p>
          <button className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-lg font-medium transition-colors">
            Start Screen Share
          </button>
        </div>
      );

    default:
      return (
        <div className="flex items-center justify-center h-full text-gray-500">
          <p>Unsupported media type</p>
        </div>
      );
  }
};

  return (
    <div className="relative w-full h-screen bg-[#111111]">
      {/* 📺 Video Container (16:9 safe zone) */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-7xl aspect-video bg-black rounded-lg overflow-hidden shadow-2xl">
          {renderPlayer()}
        </div>
      </div>

      {/* 🌀 Loading Spinner (Overlay) */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white">Loading video...</p>
          </div>
        </div>
      )}
    </div>
  );
}