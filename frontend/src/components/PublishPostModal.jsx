// frontend/src/components/PublishPostModal.jsx
// Shown when owner taps "Publish" on a draft recording in their PostsGrid.
import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { publishPost } from '../services/api';
import toast from 'react-hot-toast';

const CONTENT_RATINGS = [
  { value: 'G',          label: 'G — General Audiences' },
  { value: 'PG',         label: 'PG — Parental Guidance' },
  { value: 'Educational',label: 'Educational — Learning Content' },
  { value: 'Religious',  label: 'Religious — Faith-Based Content' },
  { value: '13+',        label: '13+ — Teens & Above' },
  { value: '16+',        label: '16+ — Ages 16+' },
  { value: '18+',        label: '18+ — Adults Only' },
  { value: 'Mature',     label: 'Mature — Explicit Content' },
];

export default function PublishPostModal({ post, onClose, onPublished }) {
  const [description, setDescription] = useState(post?.description || '');
  const [allowDownloads, setAllowDownloads] = useState(post?.allow_downloads ?? true);
  const [isPaid, setIsPaid]         = useState(post?.is_paid ?? false);
  const [price, setPrice]           = useState(post?.price ? String(post.price) : '');
  const [contentRating, setContentRating] = useState(post?.content_rating || 'G');
  const [saving, setSaving]         = useState(false);

  const handlePublish = async () => {
    if (isPaid && (!price || parseFloat(price) <= 0)) {
      toast.error('Enter a price greater than 0 for paid posts.');
      return;
    }

    setSaving(true);
    try {
      await publishPost(post.id, {
        description,
        is_public: true,
        allow_downloads: allowDownloads,
        is_paid: isPaid,
        price: isPaid ? parseFloat(price) : null,
        content_rating: contentRating,
      });
      toast.success('Post published!');
      onPublished?.();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to publish post.');
    } finally {
      setSaving(false);
    }
  };

  if (!post) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md border border-white/10 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <h2 className="text-white font-bold text-lg">Publish Recording</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white transition-colors">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Caption</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a caption for your recording…"
              rows={3}
              maxLength={500}
              className="w-full px-3 py-2.5 bg-white/5 border border-white/15 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
            <p className="text-xs text-gray-500 text-right mt-0.5">{description.length}/500</p>
          </div>

          {/* Content rating */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Content Rating</label>
            <select
              value={contentRating}
              onChange={(e) => setContentRating(e.target.value)}
              className="w-full px-3 py-2.5 bg-white/5 border border-white/15 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {CONTENT_RATINGS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Allow downloads toggle */}
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm font-medium text-white">Allow Downloads</p>
              <p className="text-xs text-gray-400">Viewers can download this recording as MP4</p>
            </div>
            <div
              onClick={() => setAllowDownloads(v => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors ${allowDownloads ? 'bg-purple-600' : 'bg-gray-600'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${allowDownloads ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </label>

          {/* Paid toggle */}
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm font-medium text-white">Paid Post</p>
              <p className="text-xs text-gray-400">Charge tokens to view this recording</p>
            </div>
            <div
              onClick={() => setIsPaid(v => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors ${isPaid ? 'bg-yellow-500' : 'bg-gray-600'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isPaid ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </label>

          {/* Price input — only when paid */}
          {isPaid && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Price (tokens)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 50"
                className="w-full px-3 py-2.5 bg-white/5 border border-white/15 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 py-4 border-t border-white/10 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePublish}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-all disabled:opacity-50"
          >
            {saving ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}
