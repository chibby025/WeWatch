import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { createCommunityRequest } from '../../services/api';
import toast from 'react-hot-toast';

const CONTENT_RATINGS = ['G', 'PG', 'Educational', 'Religious', '13+', '16+', '18+', 'Mature'];

const MakeRequestSheet = ({ isOpen, onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [contentRating, setContentRating] = useState('G');
  const [description, setDescription] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    setSubmitting(true);
    try {
      const data = await createCommunityRequest({
        title: title.trim(),
        content_rating: contentRating,
        description: description.trim(),
        preferred_date: preferredDate || undefined,
      });
      toast.success('Request submitted!');
      setTitle('');
      setDescription('');
      setPreferredDate('');
      setContentRating('G');
      onCreated?.(data.request);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-gray-950 rounded-t-2xl border-t border-white/10
          transition-transform duration-300 ease-out
          ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '85dvh', overflowY: 'auto' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="px-5 pb-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 mt-2">
            <h2 className="text-white text-xl font-bold">Request something to watch</h2>
            <button onClick={onClose} className="p-1 text-white/50 hover:text-white">
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
            <div>
              <label className="text-white/70 text-sm font-medium block mb-1.5">
                What do you want to watch? *
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder='e.g. "Omo Ghetto (2010)" or "Lecture on fluid dynamics"'
                maxLength={200}
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3
                  text-white placeholder:text-white/40 text-sm
                  focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
            </div>

            {/* Content rating */}
            <div>
              <label className="text-white/70 text-sm font-medium block mb-1.5">
                Content rating *
              </label>
              <div className="flex flex-wrap gap-2">
                {CONTENT_RATINGS.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setContentRating(r)}
                    className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-all
                      ${contentRating === r
                        ? 'bg-purple-600 border-purple-500 text-white'
                        : 'bg-white/5 border-white/20 text-white/60 hover:border-white/40'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-white/70 text-sm font-medium block mb-1.5">
                More context <span className="text-white/40">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Intro-level lecture? Specific episode? Any details that help the community..."
                rows={3}
                maxLength={500}
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3
                  text-white placeholder:text-white/40 text-sm resize-none
                  focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />
            </div>

            {/* Preferred date */}
            <div>
              <label className="text-white/70 text-sm font-medium block mb-1.5">
                Preferred date <span className="text-white/40">(optional)</span>
              </label>
              <input
                type="date"
                value={preferredDate}
                onChange={e => setPreferredDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3
                  text-white text-sm
                  focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500
                  [color-scheme:dark]"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="w-full py-3.5 rounded-xl font-bold text-white text-base
                bg-gradient-to-r from-purple-600 to-indigo-600
                active:scale-95 transition-transform
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default MakeRequestSheet;
