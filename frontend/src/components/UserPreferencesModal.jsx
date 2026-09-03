// frontend/src/components/UserPreferencesModal.jsx
import { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import ContentRatingPreferencePicker from './ContentRatingPreferencePicker';
import { useContentRatingPreferences } from '../hooks/useContentRatingPreferences';

const CATEGORIES = [
  { id: 'entertainment', label: 'Entertainment', emoji: '🎬', desc: 'Movies, series, anime, comedy' },
  { id: 'religious', label: 'Religious / Faith', emoji: '✝️', desc: 'Church, Bible study, worship' },
  { id: 'educational', label: 'Educational', emoji: '🎓', desc: 'Classes, tutorials, lectures' },
  { id: 'sports', label: 'Sports', emoji: '⚽', desc: 'Games, highlights, analysis' },
  { id: 'gaming', label: 'Gaming', emoji: '🎮', desc: 'Streams, tournaments, reviews' },
  { id: 'news', label: 'News & Talk', emoji: '📰', desc: 'Current events, discussions' },
];

const CONTENT_RATINGS = [
  { id: 'G', label: 'G — All ages' },
  { id: 'PG', label: 'PG — Parental guidance' },
  { id: 'Educational', label: 'Educational' },
  { id: 'Religious', label: 'Religious' },
  { id: '13+', label: '13+ — Teens' },
  { id: '16+', label: '16+ — Older teens' },
  { id: '18+', label: '18+ — Adults' },
  { id: 'Mature', label: 'Mature — Explicit' },
];

const STORAGE_KEYS = {
  categories: 'pref_content_categories',
  rating: 'pref_default_content_rating',
};

export default function UserPreferencesModal({ isOpen, onClose }) {
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [defaultRating, setDefaultRating] = useState('G');
  // "What do you want to see" — the real backend-connected signal that
  // drives Feed/WatchOuts filtering+ranking (see feed_algorithm.go,
  // content_rating_preference_handler.go). Shared component/hook with
  // OnboardingTour — whichever surface you edit from last is what the other
  // reflects. Deliberately separate from defaultRating above, which stays
  // its own client-only "pre-fill a new session" convenience and is
  // untouched by this section.
  // enabled: isOpen — the hook's own internal effect re-loads automatically
  // every time the modal opens (same "re-read on open" behavior the
  // localStorage fields below already have), no extra call needed here.
  const { selectedCardIds, setSelectedCardIds, save: saveRatingPrefs, saving: savingRatingPrefs } =
    useContentRatingPreferences({ enabled: isOpen });

  useEffect(() => {
    if (isOpen) {
      const savedCategories = JSON.parse(localStorage.getItem(STORAGE_KEYS.categories) || '[]');
      const savedRating = localStorage.getItem(STORAGE_KEYS.rating) || 'G';
      setSelectedCategories(savedCategories);
      setDefaultRating(savedRating);
    }
  }, [isOpen]);

  const toggleCategory = (id) => {
    setSelectedCategories(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(selectedCategories));
    localStorage.setItem(STORAGE_KEYS.rating, defaultRating);
    await saveRatingPrefs(selectedCardIds);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Content Preferences</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Personalise your feed and session defaults</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6">
          {/* What do you want to see — the real signal driving Feed/WatchOuts */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">What do you want to see?</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Pick as many as you like — this is what actually shapes your Feed and WatchOuts.
            </p>
            <ContentRatingPreferencePicker selectedCardIds={selectedCardIds} onChange={setSelectedCardIds} />
            {selectedCardIds.length === 0 && (
              <p className="text-xs text-gray-400 mt-2 text-center">Nothing selected yet — you'll see everything, unfiltered</p>
            )}
          </div>

          {/* Content Categories */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Preferred Categories</h3>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map(cat => {
                const isActive = selectedCategories.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    className={`flex items-start gap-2 p-3 rounded-xl border-2 text-left transition-all ${
                      isActive
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <span className="text-xl mt-0.5">{cat.emoji}</span>
                    <div>
                      <p className={`text-xs font-semibold ${isActive ? 'text-purple-700 dark:text-purple-300' : 'text-gray-700 dark:text-gray-300'}`}>
                        {cat.label}
                      </p>
                      <p className="text-xs text-gray-400 leading-tight">{cat.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedCategories.length === 0 && (
              <p className="text-xs text-gray-400 mt-2 text-center">Select at least one category to personalise your feed</p>
            )}
          </div>

          {/* Default Content Rating */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Default Content Rating</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Pre-selected when you start a watch session</p>
            <select
              value={defaultRating}
              onChange={e => setDefaultRating(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {CONTENT_RATINGS.map(r => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={savingRatingPrefs}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl hover:from-purple-700 hover:to-blue-700 disabled:opacity-60 transition-all shadow-md"
          >
            {savingRatingPrefs ? 'Saving…' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  );
}
