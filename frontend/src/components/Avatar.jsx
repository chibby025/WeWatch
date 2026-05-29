// Renders a user's avatar with consistent URL resolution and a single
// onError fallback. Use this everywhere instead of building <img> by hand,
// so the "broken avatar" case is handled in exactly one place.

import React from 'react';
import { resolveAvatarUrl, AVATAR_FALLBACK } from '../utils/avatar';

export default function Avatar({ user, alt, className = '', size, style, ...rest }) {
  const src = resolveAvatarUrl(user?.avatar_url || user?.profile_picture);
  const sizeStyle = size ? { width: size, height: size, objectFit: 'cover', flexShrink: 0 } : {};

  return (
    <img
      src={src}
      alt={alt || user?.username || 'user'}
      className={className}
      style={{ ...sizeStyle, ...style }}
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
