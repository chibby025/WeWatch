// frontend/src/components/ContentRatingPreferencePicker.jsx
// Shared multi-select "what do you want to see" picker — the content-rating
// card grid used by both OnboardingTour (first-run) and UserPreferencesModal
// (Content Preferences, editable any time). One card per REAL content_rating
// value, using the same icon/name/description PricingModal.jsx already uses
// for its own rating carousel — no invented labels or groupings. A short
// description plus a handful of example hashtags sit below each card's
// icon/name; the whole CARD is the selectable unit, hashtags are
// illustrative, not independently tappable.
//
// Every card — including 13+/16+/18+/Mature — is an independent selection;
// picking one never auto-selects the others (an earlier version clustered
// the teen/adult tiers together, removed on request once it was clear the
// DOB-based age gate already does the actual safety-relevant restricting on
// its own, server-side, regardless of what's in this preference set). Only
// age-eligible cards are shown as selectable here at all (mirrors
// PricingModal.jsx's own userAge/minAge filtering exactly, so a rating that
// isn't pickable there isn't pickable here either) — e.g. a 13-year-old
// never even sees 16+/18+/Mature as an option.
//
// Card data + the eligibility helper + the useContentRatingPreferences hook
// all live in ../hooks/useContentRatingPreferences.js — kept out of this
// file since bundling them here broke Vite Fast Refresh (a component file
// may only export components).
import React, { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { RATING_CARDS, eligibleCardIds } from '../hooks/useContentRatingPreferences';

export default function ContentRatingPreferencePicker({ selectedCardIds, onChange }) {
  const { currentUser } = useAuth();
  const eligibleIds = useMemo(() => eligibleCardIds(currentUser), [currentUser]);
  const visibleCards = useMemo(
    () => RATING_CARDS.filter((c) => eligibleIds.includes(c.id)),
    [eligibleIds]
  );

  const toggleCard = (cardId) => {
    const next = selectedCardIds.includes(cardId)
      ? selectedCardIds.filter((id) => id !== cardId)
      : [...selectedCardIds, cardId]; // append — preserves selection order
    onChange(next);
  };

  const selectAll = () => onChange(visibleCards.map((c) => c.id));
  const clearAll = () => onChange([]);

  return (
    <div>
      <div className="flex items-center justify-end gap-3 mb-2">
        <button
          type="button"
          onClick={selectAll}
          className="text-xs font-semibold text-indigo-500 hover:text-indigo-600"
        >
          Select All
        </button>
        <span className="text-gray-300 dark:text-gray-700">|</span>
        <button
          type="button"
          onClick={clearAll}
          className="text-xs font-semibold text-gray-400 hover:text-gray-500"
        >
          Clear
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visibleCards.map((card) => {
          const isSelected = selectedCardIds.includes(card.id);
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => toggleCard(card.id)}
              aria-pressed={isSelected}
              className={`text-left rounded-2xl border-2 p-4 transition-all ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className={`bg-gradient-to-br ${card.gradient} rounded-xl p-1.5 flex-shrink-0`}>
                    <img src={card.icon} alt={card.name} className="w-14 h-14" />
                  </div>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{card.name}</span>
                </div>
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                    isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug mb-2">{card.desc}</p>
              <div className="flex flex-wrap gap-1">
                {card.examples.map((ex) => (
                  <span
                    key={ex}
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-black/30 text-gray-600 dark:text-gray-300"
                  >
                    {ex}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
