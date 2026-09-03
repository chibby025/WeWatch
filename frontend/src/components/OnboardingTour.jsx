// WeWatch/frontend/src/components/OnboardingTour.jsx
// Full-screen swipeable tour shown once to brand-new signups, before they see the Lobby.
// Explains the 4 main tabs + Community Events, then ends on a content-rating
// preference picker (ContentRatingPreferencePicker, shared with
// UserPreferencesModal's Content Preferences — editable again any time from
// there, not a one-time-only choice). Multi-select: unlike the old
// single-choice version, a user can pick several rating cards at once — each
// card maps to real content_rating value(s) without ever showing a raw code
// like "18+" or "16+" as the visible label.
import React, { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import ContentRatingPreferencePicker from './ContentRatingPreferencePicker';
import { useContentRatingPreferences } from '../hooks/useContentRatingPreferences';

const INFO_SLIDES = [
  {
    key: 'chats',
    emoji: '💬',
    gradient: 'from-pink-500 to-rose-600',
    title: 'Find Your People',
    description: "Chats is where you find friends, build your circle, and WatchOut together right from your DMs.",
  },
  {
    key: 'rooms',
    emoji: '🏠',
    gradient: 'from-purple-500 to-indigo-600',
    title: 'Grow Your Audience',
    description: 'Rooms are your own space to host watch parties, classes, and meetups — like a social media group built for watching together.',
  },
  {
    key: 'watchouts',
    emoji: '📡',
    gradient: 'from-blue-500 to-cyan-600',
    title: 'See What\'s Live',
    description: 'WatchOuts is the public square — discover what everyone is watching together, live, right now.',
  },
  {
    key: 'feed',
    emoji: '📰',
    gradient: 'from-amber-500 to-orange-600',
    title: 'Share Your Take',
    description: 'Feed is where people post, like, comment, and share their opinions.',
  },
  {
    key: 'community',
    emoji: '🎉',
    gradient: 'from-emerald-500 to-teal-600',
    title: 'Community Events',
    description: 'Catch requests, schedules, and events from the community — see what\'s coming and claim what you want to host.',
  },
];

const TOTAL_SLIDES = INFO_SLIDES.length + 1; // + the preference slide

export default function OnboardingTour({ onClose }) {
  const [slide, setSlide] = useState(0);
  const { selectedCardIds, setSelectedCardIds, saving, save } = useContentRatingPreferences();
  const touchRef = useRef(null);

  const isLast = slide === TOTAL_SLIDES - 1;

  const goTo = (idx) => setSlide(Math.max(0, Math.min(TOTAL_SLIDES - 1, idx)));
  const next = () => goTo(slide + 1);
  const prev = () => goTo(slide - 1);

  const finish = async (savePreference) => {
    if (savePreference && selectedCardIds.length > 0) {
      const ok = await save(selectedCardIds);
      if (ok) {
        toast.success('Preferences saved — your feed is personalised!');
      } else {
        toast.error('Could not save preferences');
      }
    }
    onClose();
  };

  const handleTouchStart = (e) => {
    touchRef.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e) => {
    if (touchRef.current === null) return;
    const dx = e.changedTouches[0].clientX - touchRef.current;
    touchRef.current = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) next(); else prev();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4">
      <div
        className="bg-gray-950 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 pt-5 pb-2 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-700 rounded-full sm:hidden" />
          <span className="hidden sm:inline text-xs text-gray-500 font-medium">{slide + 1} / {TOTAL_SLIDES}</span>
          <button onClick={() => finish(false)} className="text-xs text-gray-500 hover:text-gray-300 font-medium">
            Skip
          </button>
        </div>

        {/* Body */}
        <div key={slide} className="flex-1 min-h-0 overflow-y-auto animate-fade-in">
          {!isLast ? (
            <div className="flex flex-col items-center justify-center text-center px-8 py-10 min-h-[320px]">
              <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${INFO_SLIDES[slide].gradient} flex items-center justify-center text-4xl mb-6 shadow-lg`}>
                {INFO_SLIDES[slide].emoji}
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">{INFO_SLIDES[slide].title}</h2>
              <p className="text-gray-400 text-sm leading-relaxed max-w-sm">{INFO_SLIDES[slide].description}</p>
            </div>
          ) : (
            <div className="px-6 py-6">
              <h2 className="text-xl font-bold text-white mb-1">What do you want to see?</h2>
              <p className="text-sm text-gray-400 mb-5">
                Pick as many as you like — we'll show you more of these first. You can change this any time in Settings → Content Preferences.
              </p>
              <ContentRatingPreferencePicker selectedCardIds={selectedCardIds} onChange={setSelectedCardIds} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 flex-shrink-0 border-t border-gray-800">
          <div className="flex items-center justify-center gap-1.5 mb-4">
            {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`!min-h-0 !min-w-0 rounded-full transition-all ${
                  i === slide ? 'w-6 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-gray-700 hover:bg-gray-600'
                }`}
              />
            ))}
          </div>
          <div className="flex gap-3">
            {slide > 0 && (
              <button
                onClick={prev}
                className="px-5 py-3 rounded-xl border border-gray-700 text-gray-400 text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={isLast ? () => finish(true) : next}
              disabled={isLast && (selectedCardIds.length === 0 || saving)}
              className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold transition-colors"
            >
              {isLast ? (saving ? 'Saving…' : 'Get Started') : 'Next →'}
            </button>
          </div>
          {isLast && (
            <button
              onClick={() => finish(false)}
              className="w-full mt-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
