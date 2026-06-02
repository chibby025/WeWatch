import React, { useState, useRef } from 'react';
import { createStatus } from '../services/api';
import { PencilSquareIcon, PhotoIcon, TvIcon } from '@heroicons/react/24/outline';

const BG_COLORS = [
  '#7c3aed', '#2563eb', '#059669', '#dc2626',
  '#d97706', '#db2777', '#0891b2', '#1d4ed8',
];

// Bottom-sheet status creation.
// Props:
//   onClose      – fn()
//   onCreated    – fn(status)  called after successful creation
//   liveRooms    – optional array of { room_id, room_name, session_id, session_title }
//                  from GET /api/rooms/with-active-sessions (WatchOut data)
export default function StatusCreator({ onClose, onCreated, liveRooms = [] }) {
  const [mode, setMode]           = useState('text'); // 'text' | 'image' | 'session'
  const [text, setText]           = useState('');
  const [bgColor, setBgColor]     = useState(BG_COLORS[0]);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageCaption, setImageCaption] = useState('');
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [sessionText, setSessionText]   = useState('');
  const [loading, setLoading]     = useState(false);
  const fileRef = useRef(null);

  const handleImagePick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === 'image/gif' && file.size > 3 * 1024 * 1024) {
      alert('GIFs must be under 3 MB. Please pick a smaller GIF.');
      e.target.value = '';
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('status_type', mode);
      fd.append('bg_color', bgColor);

      if (mode === 'text') {
        if (!text.trim()) return;
        fd.append('text_content', text.trim());
      } else if (mode === 'image') {
        if (!imageFile) return;
        fd.append('media', imageFile);
        if (imageCaption.trim()) fd.append('text_content', imageCaption.trim());
      } else if (mode === 'session') {
        if (!selectedRoom) return;
        fd.append('room_id', String(selectedRoom.room_id));
        if (selectedRoom.session_id) fd.append('session_id', String(selectedRoom.session_id));
        fd.append('room_name', selectedRoom.room_name || '');
        fd.append('session_title', selectedRoom.session_title || '');
        fd.append('text_content', sessionText.trim() || `Watching in ${selectedRoom.room_name}`);
      }

      const data = await createStatus(fd);
      onCreated?.(data.status);
      onClose();
    } catch (err) {
      console.error('[StatusCreator] create error:', err);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = mode === 'text' ? !!text.trim()
    : mode === 'image' ? !!imageFile
    : !!selectedRoom;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-t-2xl w-full max-w-lg border border-white/10 p-5 pb-8"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold text-base">Add Status</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-2 mb-4">
          {[
            { id: 'text',    Icon: PencilSquareIcon, label: 'Text' },
            { id: 'image',   Icon: PhotoIcon,        label: 'Image' },
            ...(liveRooms.length > 0 ? [{ id: 'session', Icon: TvIcon, label: 'Session' }] : []),
          ].map(({ id, Icon, label }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === id
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Text mode */}
        {mode === 'text' && (
          <div>
            <div
              className="rounded-xl p-4 mb-3 min-h-[120px] flex items-center justify-center"
              style={{ background: bgColor }}
            >
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                maxLength={200}
                placeholder="What's on your mind?"
                className="w-full bg-transparent text-white text-xl font-bold text-center placeholder:text-white/50 outline-none resize-none"
                rows={3}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {BG_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setBgColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${
                    bgColor === c ? 'border-white scale-110' : 'border-transparent'
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Image mode */}
        {mode === 'image' && (
          <div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImagePick} className="hidden" />
            {imagePreview ? (
              <div className="relative mb-3">
                <img src={imagePreview} alt="preview" className="w-full rounded-xl max-h-48 object-cover" />
                <button
                  onClick={() => { setImageFile(null); setImagePreview(null); }}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm"
                >×</button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-white/20 py-10 flex flex-col items-center gap-2 text-gray-400 hover:border-purple-500 hover:text-purple-400 transition-colors mb-3"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm">Tap to pick a photo or GIF</span>
              </button>
            )}
            <input
              type="text"
              value={imageCaption}
              onChange={e => setImageCaption(e.target.value)}
              maxLength={120}
              placeholder="Add a caption (optional)"
              className="w-full bg-white/5 border border-white/10 text-white text-sm px-3 py-2 rounded-lg placeholder:text-gray-500 outline-none"
            />
          </div>
        )}

        {/* Session mode */}
        {mode === 'session' && (
          <div>
            <p className="text-gray-400 text-xs mb-2">Pick a live room to share:</p>
            <div className="space-y-2 max-h-40 overflow-y-auto mb-3">
              {liveRooms.map(r => (
                <button
                  key={r.room_id}
                  onClick={() => setSelectedRoom(r)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    selectedRoom?.room_id === r.room_id
                      ? 'border-purple-500 bg-purple-600/20 text-white'
                      : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  <p className="font-medium text-sm truncate">{r.room_name}</p>
                  {r.session_title && (
                    <p className="text-xs text-gray-400 truncate">{r.session_title}</p>
                  )}
                </button>
              ))}
            </div>
            {selectedRoom && (
              <input
                type="text"
                value={sessionText}
                onChange={e => setSessionText(e.target.value)}
                maxLength={120}
                placeholder={`"Watching in ${selectedRoom.room_name}" — customise message`}
                className="w-full bg-white/5 border border-white/10 text-white text-sm px-3 py-2 rounded-lg placeholder:text-gray-500 outline-none"
              />
            )}
          </div>
        )}

        {/* Post button */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          className="w-full mt-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all"
        >
          {loading ? 'Posting…' : 'Post Status'}
        </button>
      </div>
    </div>
  );
}
