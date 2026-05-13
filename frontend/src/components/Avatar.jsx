// Renders a user's avatar with consistent URL resolution and a single
// onError fallback. Use this everywhere instead of building <img> by hand,
// so the "broken avatar" case is handled in exactly one place.

import React from 'react';
import { resolveAvatarUrl, AVATAR_FALLBACK } from '../utils/avatar';

export default function Avatar({ user, alt, className = '', ...rest }) {
  const src = resolveAvatarUrl(user?.avatar_url || user?.profile_picture);

  return (
    <img
      src={src}
      alt={alt || user?.username || 'user'}
      className={className}
      onError={(e) => {
        if (!e.target.dataset.fallback) {
          e.target.dataset.fallback = '1';
          e.target.src = AVATAR_FALLBACK;
        }
      }}
      {...rest}
    />
  );
}
