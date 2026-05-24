// frontend/src/components/liveshare/SermonControl.jsx
import { useState, useRef } from 'react';
import { FileText, X, Upload } from 'lucide-react';

const MAX_CHARS_PER_PAGE = 600;

export function paginateSermon(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= MAX_CHARS_PER_PAGE) return [trimmed];

  const paragraphs = trimmed.split(/\n\s*\n/).filter(p => p.trim());

  // Single block of text with no paragraph breaks — split by character count
  if (paragraphs.length <= 1) {
    const chunks = [];
    for (let i = 0; i < trimmed.length; i += MAX_CHARS_PER_PAGE) {
      chunks.push(trimmed.slice(i, i + MAX_CHARS_PER_PAGE).trim());
    }
    return chunks.filter(Boolean);
  }

  const pages = [];
  let currentPage = '';

  for (const para of paragraphs) {
    const p = para.trim();
    if (!p) continue;
    if (currentPage && currentPage.length + p.length + 2 > MAX_CHARS_PER_PAGE) {
      pages.push(currentPage);
      currentPage = p;
    } else {
      currentPage = currentPage ? `${currentPage}\n\n${p}` : p;
    }
  }
  if (currentPage) pages.push(currentPage);
  return pages;
}

export default function SermonControl({ onShowSermon, onHideSermon }) {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const fileInputRef = useRef(null);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setText(ev.target.result || '');
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const pages = paginateSermon(text);
  const canDisplay = pages.length > 0;

  const handleShow = () => {
    if (!canDisplay) return;
    onShowSermon({ pages, title: title.trim() || null });
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onHideSermon}
    >
      <div
        className="w-full max-w-xl bg-gray-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-amber-400" />
            <h3 className="text-white font-medium text-sm">Sermon</h3>
          </div>
          <button onClick={onHideSermon} className="text-gray-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Optional title */}
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Sermon title (optional)"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />

          {/* File upload */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 text-sm text-amber-400 border border-amber-500/40 rounded-lg hover:bg-amber-500/10 transition-colors w-full justify-center"
            >
              <Upload size={14} />
              Upload .txt file
            </button>
          </div>

          {/* Text area */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Or paste / type sermon text</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Enter sermon text here..."
              rows={12}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>

          {/* Page preview */}
          {text.trim().length > 0 && (
            <p className="text-xs text-gray-400">
              {pages.length === 1
                ? 'Fits on 1 page — no navigation needed'
                : `Will display as ${pages.length} pages (~${MAX_CHARS_PER_PAGE} chars each)`}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-700 flex justify-end gap-2">
          <button
            onClick={onHideSermon}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleShow}
            disabled={!canDisplay}
            className="px-5 py-2 text-sm font-medium rounded-lg bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Display
          </button>
        </div>
      </div>
    </div>
  );
}
