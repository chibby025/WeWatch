import { useRef, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api';

// Cross-device "resume where you left off" read-position tracking, shared
// by room chat, lobby DMs, and lobby groups (backend: ChatReadPosition
// model, POST /api/chat/read-position — see that model's own doc comment).
//
// Two independent signals both advance the SAME forward-only "furthest
// read" marker, since neither alone covers every real case:
//   1. Continuous mid-scroll tracking (observeContainer) — an
//      IntersectionObserver watching every [data-message-id] element,
//      counting a message as "read" once it's scrolled up past roughly the
//      top fifth of the chat area. Catches "read partway through, stopped"
//      without requiring the user to ever reach the bottom.
//   2. At-bottom detection (markAtBottom) — sitting at the newest message
//      without actively scrolling (e.g. a short conversation that fits on
//      screen) never puts anything into the IntersectionObserver's active
//      zone, so callers separately report "user is at the bottom" on their
//      own scroll listener, marking the newest message read directly.
//
// The marker only ever moves forward — scrolling back up to reread
// something never regresses it, matching every mainstream chat app's
// "unread" semantics.
//
// Persistence is debounced (800ms after the marker last moved) so
// continuous scrolling doesn't spam the network, plus force-saved on
// unmount, on the tab going hidden, and every 5s as a safety net against a
// debounce timer never getting the chance to fire.
//
// Message bubbles MUST carry a `data-message-id="<id>"` attribute for
// observeContainer to find them.
export function useChatReadPosition({ conversationType, conversationKey, enabled = true }) {
  const furthestReadIdRef = useRef(null); // highest message id confirmed "read" so far, this mount
  const savedIdRef = useRef(null); // highest id actually persisted to the backend so far
  const saveTimerRef = useRef(null);
  const observerRef = useRef(null);
  const keyRef = useRef(conversationKey);
  const typeRef = useRef(conversationType);
  keyRef.current = conversationKey;
  typeRef.current = conversationType;

  const persistNow = useCallback(() => {
    const id = furthestReadIdRef.current;
    const type = typeRef.current;
    const key = keyRef.current;
    if (id == null || id === savedIdRef.current || !type || key == null) return;
    savedIdRef.current = id;
    apiClient.post('/api/chat/read-position', {
      conversation_type: type,
      conversation_key: String(key),
      last_read_message_id: id,
    }).catch(() => {
      // Best-effort — un-claim the save so the next debounce/force-save
      // retries this same value instead of silently giving up on it.
      if (savedIdRef.current === id) savedIdRef.current = null;
    });
  }, []);

  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(persistNow, 800);
  }, [persistNow]);

  const markRead = useCallback((messageId) => {
    const numId = Number(messageId);
    if (!Number.isFinite(numId)) return;
    if (furthestReadIdRef.current == null || numId > furthestReadIdRef.current) {
      furthestReadIdRef.current = numId;
      scheduleSave();
    }
  }, [scheduleSave]);

  const markAtBottom = useCallback((newestMessageId) => {
    if (newestMessageId != null) markRead(newestMessageId);
  }, [markRead]);

  // Re-run whenever the message list changes (new messages render new
  // [data-message-id] elements that need observing too) — the caller is
  // expected to invoke this from its own effect keyed on its messages
  // array, since that array lives in the calling component, not here.
  const observeContainer = useCallback((container) => {
    if (!container || !enabled) return;
    if (observerRef.current) observerRef.current.disconnect();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-message-id');
            if (id) markRead(id);
          }
        }
      },
      { root: container, rootMargin: '0px 0px -80% 0px', threshold: 0 }
    );
    observerRef.current = obs;
    container.querySelectorAll('[data-message-id]').forEach((el) => obs.observe(el));
  }, [enabled, markRead]);

  // Reset local tracking when switching to a genuinely different
  // conversation — the previous conversation's in-flight/local marker must
  // never leak into a freshly-opened one.
  useEffect(() => {
    furthestReadIdRef.current = null;
    savedIdRef.current = null;
  }, [conversationType, conversationKey]);

  // Force-save triggers that a pure debounce can't be trusted to always
  // reach in time.
  useEffect(() => {
    if (!enabled) return undefined;
    const onVisibility = () => { if (document.visibilityState === 'hidden') persistNow(); };
    document.addEventListener('visibilitychange', onVisibility);
    const interval = setInterval(persistNow, 5000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
      clearTimeout(saveTimerRef.current);
      observerRef.current?.disconnect();
      persistNow();
    };
  }, [enabled, persistNow]);

  return { markRead, markAtBottom, observeContainer, forceSaveNow: persistNow };
}
