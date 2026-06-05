import React, { useState, useMemo } from 'react';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { createCommunityRequest } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const RATINGS = [
  { id: 'G',           name: 'G',           minAge: 0,  desc: 'General Audiences — All ages admitted',                                                icon: '/icons/G Rating Icon.webp',            gradient: 'from-green-400 to-green-600' },
  { id: 'PG',          name: 'PG',          minAge: 0,  desc: 'Parental Guidance — Some material may not be suitable for children',                   icon: '/icons/PG Rating Icon.webp',           gradient: 'from-blue-400 to-blue-600' },
  { id: 'Educational', name: 'Educational', minAge: 0,  desc: 'Educational Content — Online classes, tutorials, school & university material',        icon: '/icons/Educational_Rating_Icon.webp',  gradient: 'from-teal-400 to-teal-600' },
  { id: 'Religious',   name: 'Religious',   minAge: 0,  desc: 'Religious & Spiritual Content — Church services, Bible studies, worship',              icon: '/icons/Religious Rating.webp',         gradient: 'from-yellow-400 to-amber-600' },
  { id: '13+',         name: '13+',         minAge: 13, desc: 'Teens 13+ — May contain content inappropriate for children under 13',                  icon: '/icons/13_ Rating Icon.webp',          gradient: 'from-yellow-400 to-yellow-600' },
  { id: '16+',         name: '16+',         minAge: 16, desc: 'Older Teens 16+ — May not be suitable for viewers under 16',                           icon: '/icons/16_ Rating Icon.webp',          gradient: 'from-orange-400 to-orange-600' },
  { id: '18+',         name: '18+',         minAge: 18, desc: 'Adults Only — Restricted to adults 18 and over',                                       icon: '/icons/18_ Rating Icon.webp',          gradient: 'from-red-400 to-red-600' },
  { id: 'Mature',      name: 'Mature',      minAge: 18, desc: 'Mature audiences only. May contain strong language, violence, or explicit content.',    icon: '/icons/Mature Rating Icon.webp',       gradient: 'from-purple-400 to-purple-600' },
];

const MakeRequestSheet = ({ isOpen, onClose, onCreated }) => {
  const { currentUser } = useAuth();
  const [title, setTitle] = useState('');
  const [scrollIndex, setScrollIndex] = useState(0);
  const [description, setDescription] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Age-gate ratings the same way PricingModal does
  const userAge = useMemo(() => {
    if (!currentUser?.date_of_birth) return 0;
    const birth = new Date(currentUser.date_of_birth);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }, [currentUser]);

  const availableRatings = useMemo(
    () => userAge === 0 ? RATINGS : RATINGS.filter(r => !r.minAge || userAge >= r.minAge),
    [userAge]
  );

  // Keep scrollIndex in bounds if availableRatings shrinks
  const safeIndex = Math.min(scrollIndex, availableRatings.length - 1);
  const contentRating = availableRatings[safeIndex].id;
  const scrollToCard = (idx) => setScrollIndex(Math.max(0, Math.min(idx, availableRatings.length - 1)));

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
      setScrollIndex(0);
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

            {/* Content rating carousel */}
            <div>
              <label className="text-white/70 text-sm font-medium block mb-2">
                Content rating *
              </label>
              <div className="relative">
                {/* Left arrow */}
                <button
                  type="button"
                  onClick={() => scrollToCard(safeIndex - 1)}
                  disabled={safeIndex === 0}
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full p-1.5 disabled:opacity-20 transition-all"
                >
                  <ChevronLeftIcon className="w-4 h-4 text-white" />
                </button>

                {/* 4-card window */}
                <div className="flex items-center justify-center gap-2 py-2 px-9 min-h-[120px]">
                  {(() => {
                    const total = availableRatings.length;
                    let start;
                    if (total <= 4) start = 0;
                    else if (safeIndex === 0) start = 0;
                    else if (safeIndex === total - 1) start = total - 4;
                    else if (safeIndex === 1) start = 0;
                    else start = safeIndex - 1;

                    return availableRatings.slice(start, start + 4).map((rating, idx) => {
                      const actualIndex = start + idx;
                      const isSelected = actualIndex === safeIndex;
                      return (
                        <div
                          key={rating.id}
                          onClick={() => scrollToCard(actualIndex)}
                          className={`flex-shrink-0 cursor-pointer transition-all duration-300 ${
                            isSelected ? 'w-20 sm:w-24' : 'w-12 sm:w-14 opacity-40 scale-90'
                          }`}
                        >
                          <div className={`bg-gradient-to-br ${rating.gradient} rounded-lg ${
                            isSelected
                              ? 'p-2 shadow-lg ring-4 ring-purple-400 ring-offset-2 ring-offset-gray-950'
                              : 'p-1.5 shadow hover:scale-105'
                          } transition-all`}>
                            <img src={rating.icon} alt={rating.name} className="w-full h-auto rounded" />
                            <p className={`text-white font-bold text-center truncate ${
                              isSelected ? 'mt-1 text-[11px] sm:text-xs' : 'mt-0.5 text-[8px] sm:text-[9px]'
                            }`}>
                              {rating.name}
                            </p>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Right arrow */}
                <button
                  type="button"
                  onClick={() => scrollToCard(safeIndex + 1)}
                  disabled={safeIndex === availableRatings.length - 1}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full p-1.5 disabled:opacity-20 transition-all"
                >
                  <ChevronRightIcon className="w-4 h-4 text-white" />
                </button>

                {/* Dots — !min-h-0 !min-w-0 p-0 prevent browser touch target inflation on mobile */}
                <div className="flex justify-center gap-1 mt-1">
                  {availableRatings.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => scrollToCard(i)}
                      className={`transition-all rounded-full !min-h-0 !min-w-0 p-0 ${
                        i === safeIndex
                          ? 'w-4 h-1 bg-purple-400'
                          : 'w-1 h-1 bg-white/20 hover:bg-white/40'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Selected rating description */}
              <div className="bg-white/10 border border-white/15 rounded-xl p-3 mt-3 flex items-start gap-3">
                <div className={`flex-shrink-0 bg-gradient-to-br ${availableRatings[safeIndex].gradient} rounded-lg p-1.5`}>
                  <img src={availableRatings[safeIndex].icon} alt={availableRatings[safeIndex].name} className="w-8 h-8" />
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold">{availableRatings[safeIndex].name} Rating</p>
                  <p className="text-white/50 text-xs leading-snug mt-0.5">{availableRatings[safeIndex].desc}</p>
                </div>
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
