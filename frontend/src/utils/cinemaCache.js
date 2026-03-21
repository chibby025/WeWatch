// src/utils/cinemaCache.js
// LocalStorage cache manager for Cinema 3D components
// Caches static/semi-static data to reduce spinner time on page refresh

const CACHE_KEYS = {
  USER: 'wewatch_user_cache',
  CINEMA_SEATS: 'wewatch_cinema_seats',
  LECTURE_HALL_SEATS: 'wewatch_lecture_hall_seats',
  LAST_SESSION: 'wewatch_last_session',
};

const CACHE_DURATION = {
  USER: 3600000, // 1 hour
  SEATS: 86400000, // 24 hours (seats never change)
  SESSION: 300000, // 5 minutes (session data expires quickly)
};

/**
 * Cache user profile data
 */
export const cacheUserData = (user) => {
  if (!user || !user.id) {
    console.warn('⚠️ [Cache] Cannot cache invalid user data');
    return;
  }

  const cache = {
    id: user.id,
    username: user.username,
    avatar_url: user.avatar_url,
    email: user.email,
    role: user.role,
    cached_at: Date.now(),
  };

  try {
    localStorage.setItem(CACHE_KEYS.USER, JSON.stringify(cache));
    console.log('✅ [Cache] User data cached:', user.username);
  } catch (error) {
    console.error('❌ [Cache] Failed to cache user data:', error);
  }
};

/**
 * Get cached user data (if fresh)
 */
export const getCachedUser = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEYS.USER);
    if (!cached) return null;

    const userData = JSON.parse(cached);
    const cacheAge = Date.now() - userData.cached_at;

    // Return null if cache is stale
    if (cacheAge > CACHE_DURATION.USER) {
      console.log('⏰ [Cache] User cache expired (age: ${Math.round(cacheAge / 1000)}s)');
      clearUserCache();
      return null;
    }

    console.log(`✅ [Cache] Loaded user from cache: ${userData.username} (age: ${Math.round(cacheAge / 1000)}s)`);
    return userData;
  } catch (error) {
    console.error('❌ [Cache] Failed to load user cache:', error);
    return null;
  }
};

/**
 * Clear user cache (on logout)
 */
export const clearUserCache = () => {
  try {
    localStorage.removeItem(CACHE_KEYS.USER);
    console.log('🗑️ [Cache] User cache cleared');
  } catch (error) {
    console.error('❌ [Cache] Failed to clear user cache:', error);
  }
};

/**
 * Cache cinema seat layout (static geometry)
 */
export const cacheCinemaSeats = (seats) => {
  if (!seats || !Array.isArray(seats)) {
    console.warn('⚠️ [Cache] Cannot cache invalid seat data');
    return;
  }

  const cache = {
    seats: seats,
    cached_at: Date.now(),
  };

  try {
    localStorage.setItem(CACHE_KEYS.CINEMA_SEATS, JSON.stringify(cache));
    console.log(`✅ [Cache] Cinema seats cached: ${seats.length} seats`);
  } catch (error) {
    console.error('❌ [Cache] Failed to cache cinema seats:', error);
  }
};

/**
 * Get cached cinema seats
 */
export const getCachedCinemaSeats = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEYS.CINEMA_SEATS);
    if (!cached) return null;

    const seatData = JSON.parse(cached);
    const cacheAge = Date.now() - seatData.cached_at;

    // Seats never change, but refresh daily just in case
    if (cacheAge > CACHE_DURATION.SEATS) {
      console.log('⏰ [Cache] Cinema seats cache expired');
      clearCinemaSeatsCache();
      return null;
    }

    console.log(`✅ [Cache] Loaded ${seatData.seats.length} cinema seats from cache`);
    return seatData.seats;
  } catch (error) {
    console.error('❌ [Cache] Failed to load cinema seats cache:', error);
    return null;
  }
};

/**
 * Clear cinema seats cache
 */
export const clearCinemaSeatsCache = () => {
  try {
    localStorage.removeItem(CACHE_KEYS.CINEMA_SEATS);
    console.log('🗑️ [Cache] Cinema seats cache cleared');
  } catch (error) {
    console.error('❌ [Cache] Failed to clear cinema seats cache:', error);
  }
};

/**
 * Cache lecture hall seat layout
 */
export const cacheLectureHallSeats = (seats) => {
  if (!seats || !Array.isArray(seats)) {
    console.warn('⚠️ [Cache] Cannot cache invalid lecture hall seat data');
    return;
  }

  const cache = {
    seats: seats,
    cached_at: Date.now(),
  };

  try {
    localStorage.setItem(CACHE_KEYS.LECTURE_HALL_SEATS, JSON.stringify(cache));
    console.log(`✅ [Cache] Lecture hall seats cached: ${seats.length} seats`);
  } catch (error) {
    console.error('❌ [Cache] Failed to cache lecture hall seats:', error);
  }
};

/**
 * Get cached lecture hall seats
 */
export const getCachedLectureHallSeats = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEYS.LECTURE_HALL_SEATS);
    if (!cached) return null;

    const seatData = JSON.parse(cached);
    const cacheAge = Date.now() - seatData.cached_at;

    if (cacheAge > CACHE_DURATION.SEATS) {
      console.log('⏰ [Cache] Lecture hall seats cache expired');
      clearLectureHallSeatsCache();
      return null;
    }

    console.log(`✅ [Cache] Loaded ${seatData.seats.length} lecture hall seats from cache`);
    return seatData.seats;
  } catch (error) {
    console.error('❌ [Cache] Failed to load lecture hall seats cache:', error);
    return null;
  }
};

/**
 * Clear lecture hall seats cache
 */
export const clearLectureHallSeatsCache = () => {
  try {
    localStorage.removeItem(CACHE_KEYS.LECTURE_HALL_SEATS);
    console.log('🗑️ [Cache] Lecture hall seats cache cleared');
  } catch (error) {
    console.error('❌ [Cache] Failed to clear lecture hall seats cache:', error);
  }
};

/**
 * Cache last session info (for "Resume Session" feature)
 * NOTE: This is display-only, not used for auto-assignment
 */
export const cacheLastSession = (sessionId, roomId, assignedSeat) => {
  const cache = {
    sessionId,
    roomId,
    assignedSeat, // Display only - backend assigns new seat
    timestamp: Date.now(),
  };

  try {
    localStorage.setItem(`${CACHE_KEYS.LAST_SESSION}_${roomId}`, JSON.stringify(cache));
    console.log(`✅ [Cache] Last session cached for room ${roomId}`);
  } catch (error) {
    console.error('❌ [Cache] Failed to cache last session:', error);
  }
};

/**
 * Get cached last session info
 */
export const getCachedLastSession = (roomId) => {
  try {
    const cached = localStorage.getItem(`${CACHE_KEYS.LAST_SESSION}_${roomId}`);
    if (!cached) return null;

    const sessionData = JSON.parse(cached);
    const cacheAge = Date.now() - sessionData.timestamp;

    // Session cache expires after 5 minutes
    if (cacheAge > CACHE_DURATION.SESSION) {
      console.log('⏰ [Cache] Last session cache expired');
      return null;
    }

    return sessionData;
  } catch (error) {
    console.error('❌ [Cache] Failed to load last session cache:', error);
    return null;
  }
};

/**
 * Clear all caches (on logout or manual clear)
 */
export const clearAllCaches = () => {
  console.log('🗑️ [Cache] Clearing all cinema caches...');
  clearUserCache();
  clearCinemaSeatsCache();
  clearLectureHallSeatsCache();
  
  // Clear all session caches
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith(CACHE_KEYS.LAST_SESSION)) {
      localStorage.removeItem(key);
    }
  });
  
  console.log('✅ [Cache] All caches cleared');
};

/**
 * Get cache statistics (for debugging)
 */
export const getCacheStats = () => {
  const stats = {
    user: null,
    cinemaSeats: null,
    lectureHallSeats: null,
    sessions: [],
  };

  try {
    // User cache
    const userCache = localStorage.getItem(CACHE_KEYS.USER);
    if (userCache) {
      const data = JSON.parse(userCache);
      stats.user = {
        username: data.username,
        age: Math.round((Date.now() - data.cached_at) / 1000),
        size: new Blob([userCache]).size,
      };
    }

    // Cinema seats cache
    const cinemaCache = localStorage.getItem(CACHE_KEYS.CINEMA_SEATS);
    if (cinemaCache) {
      const data = JSON.parse(cinemaCache);
      stats.cinemaSeats = {
        count: data.seats?.length || 0,
        age: Math.round((Date.now() - data.cached_at) / 1000),
        size: new Blob([cinemaCache]).size,
      };
    }

    // Lecture hall seats cache
    const lectureCache = localStorage.getItem(CACHE_KEYS.LECTURE_HALL_SEATS);
    if (lectureCache) {
      const data = JSON.parse(lectureCache);
      stats.lectureHallSeats = {
        count: data.seats?.length || 0,
        age: Math.round((Date.now() - data.cached_at) / 1000),
        size: new Blob([lectureCache]).size,
      };
    }

    // Session caches
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(CACHE_KEYS.LAST_SESSION)) {
        const data = JSON.parse(localStorage.getItem(key));
        stats.sessions.push({
          roomId: data.roomId,
          age: Math.round((Date.now() - data.timestamp) / 1000),
        });
      }
    });

    return stats;
  } catch (error) {
    console.error('❌ [Cache] Failed to get cache stats:', error);
    return stats;
  }
};

export default {
  cacheUserData,
  getCachedUser,
  clearUserCache,
  cacheCinemaSeats,
  getCachedCinemaSeats,
  clearCinemaSeatsCache,
  cacheLectureHallSeats,
  getCachedLectureHallSeats,
  clearLectureHallSeatsCache,
  cacheLastSession,
  getCachedLastSession,
  clearAllCaches,
  getCacheStats,
};
