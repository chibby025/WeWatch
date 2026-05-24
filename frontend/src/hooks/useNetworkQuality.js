// frontend/src/hooks/useNetworkQuality.js
import { useState, useEffect, useRef, useCallback } from 'react';
import { RoomEvent, ConnectionQuality } from 'livekit-client';

// Returns 'good' | 'poor' | 'recovering'
// 'recovering' auto-transitions to 'good' after 3 s (drives "Network improved" message)
export default function useNetworkQuality(livekitRoom = null) {
  const [quality, setQuality] = useState('good');
  const wasPoorRef = useRef(false);
  const recoveryTimerRef = useRef(null);

  const markPoor = useCallback(() => {
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
    wasPoorRef.current = true;
    setQuality('poor');
  }, []);

  const markGood = useCallback(() => {
    if (!wasPoorRef.current) return;
    wasPoorRef.current = false;
    setQuality('recovering');
    recoveryTimerRef.current = setTimeout(() => {
      setQuality('good');
      recoveryTimerRef.current = null;
    }, 3000);
  }, []);

  // LiveKit quality events (used when inside an active call / watch session)
  useEffect(() => {
    if (!livekitRoom) return;

    const handleQualityChanged = (changedQuality, participant) => {
      if (participant !== livekitRoom.localParticipant) return;
      if (changedQuality === ConnectionQuality.Poor) {
        markPoor();
      } else {
        markGood();
      }
    };

    livekitRoom.on(RoomEvent.ConnectionQualityChanged, handleQualityChanged);

    return () => {
      livekitRoom.off(RoomEvent.ConnectionQualityChanged, handleQualityChanged);
      if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
    };
  }, [livekitRoom, markPoor, markGood]);

  // Network Information API (fallback for pre-call modals / no LiveKit)
  useEffect(() => {
    if (livekitRoom) return;

    const connection =
      navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return;

    const check = () => {
      const isPoor =
        connection.effectiveType === 'slow-2g' ||
        connection.effectiveType === '2g' ||
        (connection.downlink != null && connection.downlink < 0.5) ||
        (connection.rtt != null && connection.rtt > 500);
      isPoor ? markPoor() : markGood();
    };

    check();
    connection.addEventListener('change', check);
    return () => connection.removeEventListener('change', check);
  }, [livekitRoom, markPoor, markGood]);

  return quality;
}
