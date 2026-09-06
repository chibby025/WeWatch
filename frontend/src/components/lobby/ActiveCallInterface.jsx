// frontend/src/components/lobby/ActiveCallInterface.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Track } from 'livekit-client';
import Avatar from '../Avatar';
import useNetworkQuality from '../../hooks/useNetworkQuality';
import NetworkQualityBanner from '../NetworkQualityBanner';
import MinimizedCallWidget from './MinimizedCallWidget';

const ActiveCallInterface = ({
  isOpen,
  friend,
  currentUser,
  room,
  livekitRoom,
  onEndCall,
  localParticipant,
  remoteParticipant
}) => {
  const networkQuality = useNetworkQuality(livekitRoom ?? null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // Call duration timer
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setCallDuration(0);
      setIsMuted(false);
    }
  }, [isOpen]);

  // Handle audio tracks
  useEffect(() => {
    if (!remoteParticipant) return;

    const handleTrackSubscribed = (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio) {
        const element = track.attach();
        if (remoteAudioRef.current) {
          remoteAudioRef.current.appendChild(element);
        }
      }
    };

    const handleTrackUnsubscribed = (track) => {
      track.detach();
    };

    remoteParticipant.on('trackSubscribed', handleTrackSubscribed);
    remoteParticipant.on('trackUnsubscribed', handleTrackUnsubscribed);

    // Attach existing tracks
    remoteParticipant.audioTracks.forEach((publication) => {
      if (publication.track) {
        handleTrackSubscribed(publication.track, publication, remoteParticipant);
      }
    });

    return () => {
      remoteParticipant.off('trackSubscribed', handleTrackSubscribed);
      remoteParticipant.off('trackUnsubscribed', handleTrackUnsubscribed);
    };
  }, [remoteParticipant]);

  const toggleMute = async () => {
    if (!localParticipant) return;

    try {
      const audioPublication = localParticipant.getTrack(Track.Source.Microphone);
      if (audioPublication) {
        if (isMuted) {
          await audioPublication.unmute();
        } else {
          await audioPublication.mute();
        }
        setIsMuted(!isMuted);
      }
    } catch (error) {
      console.error('Error toggling mute:', error);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  // Minimized view — vertical draggable widget, both avatars stacked
  // (WhatsApp/Snapchat-style), replacing the old single-avatar pill.
  if (isMinimized) {
    return (
      <>
        <MinimizedCallWidget
          selfUser={currentUser}
          otherUser={friend}
          statusText={formatTime(callDuration)}
          isRinging={false}
          onExpand={() => setIsMinimized(false)}
          onEndCall={onEndCall}
        />
        {/* Hidden audio elements — must keep rendering while minimized so the call audio doesn't drop */}
        <div ref={remoteAudioRef} className="hidden" />
      </>
    );
  }

  // Full view
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 z-[9999] flex items-center justify-center p-4">
      <NetworkQualityBanner quality={networkQuality} />
      <div className="flex flex-col items-center justify-center max-w-sm w-full">
        {/* Minimize button */}
        <button
          onClick={() => setIsMinimized(true)}
          className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors p-2"
          title="Minimize"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>

        {/* Avatar */}
        <div className="relative">
          <Avatar
            user={friend}
            className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-green-500 shadow-2xl"
          />
          
          {/* Pulse ring for active call */}
          <div className="absolute inset-0 rounded-full border-4 border-green-400 animate-ping opacity-75"></div>
        </div>

        {/* Name */}
        <h2 className="text-white text-2xl sm:text-3xl font-bold mt-6 text-center">
          {friend?.username || 'User'}
        </h2>

        {/* Status */}
        <p className="text-green-400 text-lg sm:text-xl mt-2 text-center">
          Connected
        </p>

        {/* Timer */}
        <p className="text-gray-400 text-3xl sm:text-4xl font-mono mt-4">
          {formatTime(callDuration)}
        </p>

        {/* Audio indicator */}
        <div className="mt-8 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isMuted ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`}></div>
          <span className="text-gray-400 text-sm">
            {isMuted ? 'Muted' : 'Audio active'}
          </span>
        </div>

        {/* Control buttons */}
        <div className="flex gap-6 mt-12">
          {/* Mute button */}
          <button
            onClick={toggleMute}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
              isMuted 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>

          {/* End call button */}
          <button
            onClick={onEndCall}
            className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-all"
            title="End call"
          >
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Hidden audio elements */}
      <div ref={remoteAudioRef} className="hidden" />
    </div>
  );
};

export default ActiveCallInterface;
