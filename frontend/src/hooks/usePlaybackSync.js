// frontend/src/hooks/usePlaybackSync.js
import { useEffect } from 'react';

/**
 * Broadcasts playback position to session members on a fixed 8-second interval.
 * Includes drift detection for monitoring but does not dynamically restart the interval
 * (avoids the leak-prone self-restart pattern).
 */
export default function usePlaybackSync({ isHost, currentMedia, isPlaying, videoRef, sendMessage, userId }) {
  useEffect(() => {
    if (!isHost || !currentMedia || currentMedia.type !== 'upload' || !isPlaying) return;

    const SYNC_INTERVAL = 8000;
    const DRIFT_THRESHOLD = 3;
    let lastKnownTime = 0;
    let lastSyncTimestamp = Date.now();

    const syncPlayback = () => {
      if (!videoRef.current || !currentMedia) return;

      const currentSeekTime = Math.floor(videoRef.current.currentTime);
      const now = Date.now();
      const timeSinceLastSync = (now - lastSyncTimestamp) / 1000;
      const expectedTime = lastKnownTime + timeSinceLastSync;
      const drift = Math.abs(currentSeekTime - expectedTime);

      if (drift > DRIFT_THRESHOLD) {
        console.warn(`[PlaybackSync] High drift detected: ${drift.toFixed(1)}s`);
      }

      sendMessage({
        type: 'playback_control',
        command: 'seek',
        media_item_id: currentMedia.ID || currentMedia.id,
        file_path: currentMedia.file_path,
        file_url: currentMedia.mediaUrl,
        original_name: currentMedia.original_name,
        seek_time: currentSeekTime,
        timestamp: now,
        sender_id: userId,
      });

      lastKnownTime = currentSeekTime;
      lastSyncTimestamp = now;
    };

    syncPlayback(); // initial sync on play
    const intervalId = setInterval(syncPlayback, SYNC_INTERVAL);
    return () => clearInterval(intervalId);
  }, [isHost, currentMedia, isPlaying, sendMessage, userId]);
}
