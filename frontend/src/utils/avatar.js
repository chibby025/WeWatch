// Single source of truth for resolving a stored avatar value (from any
// endpoint that returns a user) into a URL the <img> tag can load.
//
// Rules:
//   empty / null      -> frontend-served default silhouette
//   absolute URL      -> returned as-is (CDN, external)
//   backend path      -> prefixed with the API base URL
//   anything else     -> frontend default (catches legacy values like
//                        '/avatars/default.png' that no origin actually serves)

import { API_BASE_URL } from '../services/api';

const API_BASE = API_BASE_URL || '';
const FRONTEND_DEFAULT = '/icons/user1avatar.svg';

export function resolveAvatarUrl(rawAvatarUrl) {
  if (!rawAvatarUrl) return FRONTEND_DEFAULT;
  if (rawAvatarUrl.startsWith('http://') || rawAvatarUrl.startsWith('https://')) {
    return rawAvatarUrl;
  }
  if (rawAvatarUrl.startsWith('/uploads/')) {
    return `${API_BASE}${rawAvatarUrl}`;
  }
  return FRONTEND_DEFAULT;
}

export const AVATAR_FALLBACK = FRONTEND_DEFAULT;
