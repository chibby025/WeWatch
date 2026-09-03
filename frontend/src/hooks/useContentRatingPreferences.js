// frontend/src/hooks/useContentRatingPreferences.js
// Data + hook for the shared "what do you want to see" multi-select
// content-rating picker (ContentRatingPreferencePicker.jsx renders it; both
// OnboardingTour and UserPreferencesModal use this hook). Kept in its own
// plain (non-component) file — bundling RATING_CARDS/the hook into the
// component file itself broke Vite Fast Refresh (a component file may only
// export components).
import { useState, useEffect, useCallback } from 'react';
import { getContentRatingPreferences, setContentRatingPreferences } from '../services/api';

// One card per REAL content_rating value — a genuine 1:1 mapping, not an
// invented grouping (an earlier version of this file merged G+PG and
// 18+/Mature into umbrella cards; corrected on request — "Religious" is the
// real rating name, there's no separate "Church & Fellowship" rating, and
// 13+/16+/18+ are three distinct tiers, not two). icon/name/desc/gradient
// are a deliberate parallel copy of PricingModal.jsx's own `ratings` array
// (same asset paths, same wording) so both surfaces show the identical
// rating identity — kept as a separate copy rather than a shared import so
// this change doesn't touch that existing, working file; see this
// codebase's own established precedent for this kind of controlled
// duplication (e.g. resolveMediaUrl/parseLRC, documented in CLAUDE.md).
export const RATING_CARDS = [
  {
    id: 'G',
    name: 'G',
    icon: '/icons/G Rating Icon.webp',
    gradient: 'from-green-400 to-green-600',
    minAge: 0,
    desc: 'General Audiences - All ages admitted',
    examples: ['🍿 Family & General', '😊 All Ages', '😂 Comedy', '📖 Books & Stories', '📰 News'],
  },
  {
    id: 'PG',
    name: 'PG',
    icon: '/icons/PG Rating Icon.webp',
    gradient: 'from-blue-400 to-blue-600',
    minAge: 0,
    desc: 'Parental Guidance - Some material may not be suitable for children',
    examples: ['🎬 Indie Films', '📺 Shows', '⚽ Sports', '🎤 Live Events', '👨‍👩‍👧 Family Movie Night'],
  },
  {
    id: 'Educational',
    name: 'Educational',
    icon: '/icons/Educational_Rating_Icon.webp',
    gradient: 'from-teal-400 to-teal-600',
    minAge: 0,
    desc: 'Educational Content - Online classes, tutorials, school & university material',
    examples: ['📚 Classes & Tutorials', '🧪 Science & Tech', '📖 Book Clubs'],
  },
  {
    id: 'Religious',
    name: 'Religious',
    icon: '/icons/Religious Rating.webp',
    gradient: 'from-yellow-400 to-amber-600',
    minAge: 0,
    desc: 'Religious & Spiritual Content - Church services, Bible studies, worship',
    examples: ['✝️ Church & Worship', '🙏 Bible Study'],
  },
  {
    id: '13+',
    name: '13+',
    icon: '/icons/13_ Rating Icon.webp',
    gradient: 'from-yellow-400 to-yellow-600',
    minAge: 13,
    desc: 'Teens 13+ - May contain content inappropriate for children under 13',
    examples: ['🎮 Gaming', '🌸 Anime', '✍️ Fan Fiction', '💫 Teen Drama'],
  },
  {
    id: '16+',
    name: '16+',
    icon: '/icons/16_ Rating Icon.webp',
    gradient: 'from-orange-400 to-orange-600',
    minAge: 16,
    desc: 'Older Teens 16+ - May not be suitable for viewers under 16',
    examples: ['🔥 Action & Thriller', '👻 Horror', '💼 Business & Finance'],
  },
  {
    id: '18+',
    name: '18+',
    icon: '/icons/18_ Rating Icon.webp',
    gradient: 'from-red-400 to-red-600',
    minAge: 18,
    desc: 'Adults Only - Restricted to adults 18 and over',
    examples: ['🔞 Adults Only', '🌙 Late Night'],
  },
  {
    id: 'Mature',
    name: 'Mature',
    icon: '/icons/Mature Rating Icon.webp',
    gradient: 'from-purple-400 to-purple-600',
    minAge: 18,
    desc: 'For mature audiences only. May contain strong language, violence, gore or explicit scenes.',
    examples: ['🎭 Strong Content'],
  },
];

// Given the current user (AuthContext shape, same field PricingModal.jsx
// already reads), returns the ids of cards they're actually age-eligible
// for — mirrors PricingModal.jsx's own userAge/minAge logic exactly, so a
// card that isn't selectable there isn't selectable here either. An unknown
// DOB (userAge === 0) is treated as "allow all", same as that file.
export function eligibleCardIds(currentUser) {
  let userAge = 0;
  if (currentUser?.date_of_birth) {
    const birthDate = new Date(currentUser.date_of_birth);
    const today = new Date();
    userAge = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      userAge--;
    }
  }
  if (userAge === 0) return RATING_CARDS.map((c) => c.id);
  return RATING_CARDS.filter((c) => userAge >= c.minAge).map((c) => c.id);
}

// Flattens an ordered list of selected card ids into the flat rating array
// the backend expects — a near-identity mapping now that each card id IS a
// real rating value, kept as its own function (rather than passing
// selectedCardIds straight through) so callers don't have to assume that
// mapping stays 1:1 forever. Order-preserving and de-duplicated —
// ratings[0] is significant, it becomes UserSettings.PrimaryRating (the
// small secondary ranking nudge — see backend/feed_algorithm.go).
export function cardsToRatings(selectedCardIds) {
  const seen = new Set();
  const ratings = [];
  selectedCardIds.forEach((id) => {
    if (RATING_CARDS.some((c) => c.id === id) && !seen.has(id)) {
      seen.add(id);
      ratings.push(id);
    }
  });
  return ratings;
}

export function ratingsToCardIds(ratings) {
  const set = new Set(ratings || []);
  return RATING_CARDS.filter((c) => set.has(c.id)).map((c) => c.id);
}

// Fetches the user's saved selection once (mapped to card ids) and exposes a
// save() that persists a new card-id selection via the shared backend
// endpoint. Shared by OnboardingTour and UserPreferencesModal so both stay
// byte-identical in how they load/save — whichever surface a user edits
// from last is what the other reflects next time it opens.
export function useContentRatingPreferences({ enabled = true } = {}) {
  const [selectedCardIds, setSelectedCardIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getContentRatingPreferences();
      setSelectedCardIds(ratingsToCardIds(res?.ratings || []));
    } catch {
      // Best-effort — leave selection empty rather than block the UI.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const save = useCallback(async (nextCardIds) => {
    setSaving(true);
    try {
      await setContentRatingPreferences(cardsToRatings(nextCardIds));
      setSelectedCardIds(nextCardIds);
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return { selectedCardIds, setSelectedCardIds, loading, saving, load, save };
}
