import { useEffect, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/24/solid';

// Renders a PDF, image, or plain-text document shared by the room host.
// Host sees page controls; members just follow.
export default function DocumentViewer({ url, docType, page, isHost, onPageChange, onClose }) {
  const [textContent, setTextContent] = useState('');
  const [textError, setTextError] = useState(false);

  // Fetch text content when a TXT doc is opened
  useEffect(() => {
    if (docType !== 'text' || !url) return;
    setTextContent('');
    setTextError(false);
    fetch(url)
      .then(r => r.text())
      .then(t => setTextContent(t))
      .catch(() => setTextError(true));
  }, [url, docType]);

  if (!url) return null;

  return (
    <div className="relative w-full h-full flex flex-col bg-gray-950 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">
            {docType === 'pdf' ? '📄' : docType === 'image' ? '🖼️' : '📝'}
          </span>
          <span className="text-white/70 text-sm truncate">
            {docType === 'pdf' ? 'Document' : docType === 'image' ? 'Image' : 'Text'}
          </span>
          {docType === 'pdf' && (
            <span className="text-white/40 text-xs ml-1">— Page {page}</span>
          )}
        </div>
        {isHost && (
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors shrink-0"
            title="Close document"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {docType === 'pdf' && (
          // key forces re-mount when page changes so the browser navigates to the new page
          <iframe
            key={`${url}#page=${page}`}
            src={`${url}#page=${page}`}
            title="PDF document"
            className="w-full h-full border-0"
          />
        )}

        {docType === 'image' && (
          <div className="w-full h-full flex items-center justify-center p-4">
            <img
              src={url}
              alt="Shared image"
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </div>
        )}

        {docType === 'text' && (
          <div className="w-full h-full overflow-auto p-6">
            {textError ? (
              <p className="text-red-400 text-sm">Failed to load document.</p>
            ) : (
              <pre className="text-white/80 text-sm font-mono whitespace-pre-wrap break-words leading-relaxed">
                {textContent || 'Loading…'}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Page controls — PDF only, host only */}
      {docType === 'pdf' && isHost && (
        <div className="flex items-center justify-center gap-4 py-3 bg-gray-900 border-t border-white/10 shrink-0">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Previous page"
          >
            <ChevronLeftIcon className="w-5 h-5 text-white" />
          </button>
          <span className="text-white/60 text-sm tabular-nums min-w-[4rem] text-center">
            Page {page}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            title="Next page"
          >
            <ChevronRightIcon className="w-5 h-5 text-white" />
          </button>
        </div>
      )}

      {/* Member page indicator — PDF only, non-host */}
      {docType === 'pdf' && !isHost && (
        <div className="flex items-center justify-center py-2 bg-gray-900 border-t border-white/10 shrink-0">
          <span className="text-white/40 text-xs">Page {page} · host controls pages</span>
        </div>
      )}
    </div>
  );
}
