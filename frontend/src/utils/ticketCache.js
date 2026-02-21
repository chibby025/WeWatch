/**
 * Ticket Cache Utility
 * 
 * Manages localStorage caching of purchased session tickets.
 * Tickets are stored when purchased and cleared when sessions end.
 */

const TICKET_PREFIX = 'ticket_';

/**
 * Store a ticket in cache after purchase
 * @param {string} sessionId - Session UUID
 */
export const setTicketCache = (sessionId) => {
  try {
    localStorage.setItem(`${TICKET_PREFIX}${sessionId}`, 'true');
    console.log(`🎟️ [TicketCache] Cached ticket for session ${sessionId}`);
  } catch (error) {
    console.error('❌ [TicketCache] Failed to cache ticket:', error);
  }
};

/**
 * Check if user has a cached ticket for a session
 * @param {string} sessionId - Session UUID
 * @returns {boolean} True if ticket is cached
 */
export const hasTicketCache = (sessionId) => {
  try {
    const hasCached = localStorage.getItem(`${TICKET_PREFIX}${sessionId}`) === 'true';
    console.log(`🔍 [TicketCache] Check for session ${sessionId}: ${hasCached}`);
    return hasCached;
  } catch (error) {
    console.error('❌ [TicketCache] Failed to check ticket cache:', error);
    return false;
  }
};

/**
 * Clear a ticket from cache (called when session ends)
 * @param {string} sessionId - Session UUID
 */
export const clearTicketCache = (sessionId) => {
  try {
    localStorage.removeItem(`${TICKET_PREFIX}${sessionId}`);
    console.log(`🧹 [TicketCache] Cleared ticket for session ${sessionId}`);
  } catch (error) {
    console.error('❌ [TicketCache] Failed to clear ticket cache:', error);
  }
};

/**
 * Clear all cached tickets (called on logout)
 */
export const clearAllTicketCaches = () => {
  try {
    const keys = Object.keys(localStorage);
    const ticketKeys = keys.filter(key => key.startsWith(TICKET_PREFIX));
    
    ticketKeys.forEach(key => localStorage.removeItem(key));
    
    console.log(`🧹 [TicketCache] Cleared ${ticketKeys.length} cached tickets`);
  } catch (error) {
    console.error('❌ [TicketCache] Failed to clear all ticket caches:', error);
  }
};
