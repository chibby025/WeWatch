// frontend/src/components/liveshare/SermonOverlay.jsx
import { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export default function SermonOverlay({
  pages = [],
  currentPage = 0,
  title,
  isActive,
  sendMessage,
  onDismiss, // only passed to host
}) {
  const [visible, setVisible] = useState(false);
  const isHost = !!onDismiss;
  const totalPages = pages.length;
  const pageText = pages[currentPage] ?? '';

  useEffect(() => {
    if (isActive && pages.length > 0) {
      setTimeout(() => setVisible(true), 50);
    } else {
      setVisible(false);
    }
  }, [isActive, pages]);

  if (!isActive || !pageText) return null;

  const navigate = (newPage) => {
    if (!sendMessage) return;
    sendMessage({
      type: 'sermon_navigate',
      data: { currentPage: newPage },
    });
  };

  const handleDismiss = () => {
    if (sendMessage) {
      sendMessage({ type: 'sermon_update', data: { active: false } });
    }
    onDismiss?.();
  };

  return (
    <div
      className={`
        absolute inset-0 z-30 flex flex-col items-center justify-center
        transition-opacity duration-500
        ${visible ? 'opacity-100' : 'opacity-0'}
      `}
      style={{ background: 'rgba(0,0,0,0.88)' }}
    >
      {/* Title */}
      {title && (
        <p className="text-amber-400 text-sm font-semibold uppercase tracking-widest mb-4 px-6 text-center">
          {title}
        </p>
      )}

      {/* Sermon text */}
      <div className="max-w-2xl w-full px-6 sm:px-10">
        <p
          className="text-white text-lg sm:text-xl leading-relaxed text-center whitespace-pre-wrap"
          style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}
        >
          {pageText}
        </p>
      </div>

      {/* Page navigation (host only) + indicator */}
      {totalPages > 1 && (
        <div className="flex items-center gap-4 mt-8">
          {isHost && (
            <button
              onClick={() => navigate(currentPage - 1)}
              disabled={currentPage === 0}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 transition-all"
            >
              <ChevronLeft size={20} />
            </button>
          )}

          <span className="text-gray-400 text-sm tabular-nums">
            {currentPage + 1} / {totalPages}
          </span>

          {isHost && (
            <button
              onClick={() => navigate(currentPage + 1)}
              disabled={currentPage === totalPages - 1}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 transition-all"
            >
              <ChevronRight size={20} />
            </button>
          )}
        </div>
      )}

      {/* Host dismiss button */}
      {isHost && (
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-all"
          title="Hide sermon"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}
