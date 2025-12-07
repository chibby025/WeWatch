// frontend/src/hooks/useEmoteSounds.js
import { useRef, useCallback } from 'react';

/**
 * useEmoteSounds - Hook to play sound effects for emotes
 * Ensures sounds are audible to everyone in the room
 */
export default function useEmoteSounds() {
  const audioContextRef = useRef(null);
  const audioBuffersRef = useRef({});
  const loadingRef = useRef({});

  // Sound mappings for each emote
  const emoteSounds = {
    wave: '/sounds/wave.mp3',
    clap: '/sounds/clap.mp3',
    thumbs_up: '/sounds/thumbs_up.mp3',
    laugh: '/sounds/laugh.mp3',
    heart: '/sounds/heart.mp3',
  };

  // Initialize audio context (Web Audio API for better control)
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // Load and cache audio buffer
  const loadSound = useCallback(async (emote) => {
    const soundUrl = emoteSounds[emote];
    if (!soundUrl) return null;

    // Return cached buffer if available
    if (audioBuffersRef.current[emote]) {
      return audioBuffersRef.current[emote];
    }

    // Prevent duplicate loading
    if (loadingRef.current[emote]) {
      return loadingRef.current[emote];
    }

    // Start loading
    const loadPromise = (async () => {
      try {
        const response = await fetch(soundUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioContext = getAudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        audioBuffersRef.current[emote] = audioBuffer;
        delete loadingRef.current[emote];
        
        console.log(`✅ [useEmoteSounds] Loaded sound for ${emote}`);
        return audioBuffer;
      } catch (error) {
        // Silenced: Firefox has issues with audio format - not critical
        // console.error(`❌ [useEmoteSounds] Failed to load sound for ${emote}:`, error);
        delete loadingRef.current[emote];
        return null;
      }
    })();

    loadingRef.current[emote] = loadPromise;
    return loadPromise;
  }, [emoteSounds, getAudioContext]);

  // Play emote sound
  const playEmoteSound = useCallback(async (emote, volume = 0.5) => {
    try {
      const audioContext = getAudioContext();
      
      // Resume audio context if suspended (required for user interaction)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Load the sound
      const buffer = await loadSound(emote);
      if (!buffer) {
        console.warn(`[useEmoteSounds] No sound buffer for ${emote}`);
        return;
      }

      // Create and configure audio nodes
      const source = audioContext.createBufferSource();
      const gainNode = audioContext.createGain();
      
      source.buffer = buffer;
      gainNode.gain.value = volume;

      // Connect: source → gain → destination (speakers)
      source.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Play
      source.start(0);
      console.log(`🔊 [useEmoteSounds] Playing sound for ${emote} at volume ${volume}`);
    } catch (error) {
      console.error(`❌ [useEmoteSounds] Error playing sound for ${emote}:`, error);
    }
  }, [getAudioContext, loadSound]);

  // Preload all sounds (optional, call on component mount)
  const preloadAllSounds = useCallback(async () => {
    // console.log('[useEmoteSounds] Preloading all emote sounds...');
    const emotes = Object.keys(emoteSounds);
    await Promise.all(emotes.map(emote => loadSound(emote)));
    // console.log('[useEmoteSounds] All sounds preloaded');
  }, [emoteSounds, loadSound]);

  return {
    playEmoteSound,
    preloadAllSounds,
  };
}
