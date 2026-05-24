// WeWatch/frontend/src/components/ContentPreferenceOnboarding.jsx
// First-time onboarding modal: user picks their primary content interest.
// Shown once — dismissed state stored in localStorage so it never re-appears.
// primary_rating is saved to user settings and used by the feed algorithm for ranking boosts.
import React, { useState } from 'react';
import { updateUserSettings } from '../services/api';
import toast from 'react-hot-toast';

const RATINGS = [
  {
    value: 'G',
    label: 'General',
    emoji: '🌟',
    desc: 'Family-friendly content for all ages',
    bg: 'from-green-500 to-emerald-600',
    border: 'border-green-400',
  },
  {
    value: 'PG',
    label: 'Parental Guidance',
    emoji: '👨‍👩‍👧',
    desc: 'Some material may not suit young children',
    bg: 'from-teal-500 to-cyan-600',
    border: 'border-teal-400',
  },
  {
    value: 'Educational',
    label: 'Educational',
    emoji: '📚',
    desc: 'Tutorials, classes, lectures, university',
    bg: 'from-blue-500 to-indigo-600',
    border: 'border-blue-400',
  },
  {
    value: 'Religious',
    label: 'Faith & Worship',
    emoji: '✝️',
    desc: 'Church services, Bible study, worship sessions',
    bg: 'from-purple-500 to-violet-600',
    border: 'border-purple-400',
  },
  {
    value: '13+',
    label: 'Teens 13+',
    emoji: '🎮',
    desc: 'Entertainment suited for ages 13 and up',
    bg: 'from-amber-500 to-yellow-600',
    border: 'border-amber-400',
  },
  {
    value: '16+',
    label: 'Older Teens 16+',
    emoji: '🎬',
    desc: 'Mature themes for ages 16 and above',
    bg: 'from-orange-500 to-red-500',
    border: 'border-orange-400',
  },
  {
    value: '18+',
    label: 'Adults 18+',
    emoji: '🔞',
    desc: 'Adult content — restricted to viewers 18+',
    bg: 'from-red-600 to-rose-700',
    border: 'border-red-500',
  },
  {
    value: 'Mature',
    label: 'Mature',
    emoji: '🔒',
    desc: 'Explicit content for verified adults only',
    bg: 'from-rose-700 to-pink-800',
    border: 'border-rose-600',
  },
];

const STORAGE_KEY = 'wewatch_pref_dismissed';

export function shouldShowOnboarding(settings) {
  if (localStorage.getItem(STORAGE_KEY)) return false;
  return !settings?.primary_rating;
}

export default function ContentPreferenceOnboarding({ onClose }) {
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    onClose();
  };

  const handleSave = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await updateUserSettings({ primary_rating: selected });
      localStorage.setItem(STORAGE_KEY, '1');
      toast.success('Preferences saved — your feed is personalised!');
      onClose();
    } catch {
      toast.error('Could not save preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="bg-gray-950 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-4 sm:hidden" />
          <h2 className="text-xl font-bold text-white">What do you love watching?</h2>
          <p className="text-sm text-gray-400 mt-1">
            Pick your primary interest — we'll show you more of what you like first.
            You can change this any time in Settings.
          </p>
        </div>

        {/* Rating grid */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <div className="grid grid-cols-2 gap-3">
            {RATINGS.map(r => (
              <button
                key={r.value}
                onClick={() => setSelected(r.value)}
                className={`relative flex flex-col items-start p-4 rounded-2xl border-2 transition-all text-left ${
                  selected === r.value
                    ? `border-white bg-gradient-to-br ${r.bg} shadow-lg scale-[1.02]`
                    : `border-gray-700 bg-gray-900 hover:border-gray-500`
                }`}
              >
                <span className="text-2xl mb-2">{r.emoji}</span>
                <p className={`text-sm font-semibold ${selected === r.value ? 'text-white' : 'text-gray-200'}`}>
                  {r.label}
                </p>
                <p className={`text-xs mt-0.5 leading-snug ${selected === r.value ? 'text-white/80' : 'text-gray-500'}`}>
                  {r.desc}
                </p>
                {selected === r.value && (
                  <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-white flex items-center justify-center">
                    <svg className="w-3 h-3 text-gray-900" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 border-t border-gray-800 flex gap-3 flex-shrink-0">
          <button
            onClick={dismiss}
            className="flex-1 py-3 rounded-xl border border-gray-700 text-gray-400 text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Skip for now
          </button>
          <button
            onClick={handleSave}
            disabled={!selected || saving}
            className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold transition-colors"
          >
            {saving ? 'Saving…' : 'Save preference'}
          </button>
        </div>
      </div>
    </div>
  );
}
