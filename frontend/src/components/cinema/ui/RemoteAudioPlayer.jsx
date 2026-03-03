// Remote audio player component that automatically plays audio from remote participants
import { useEffect, useRef } from 'react';
import { RoomEvent } from 'livekit-client';

export default function RemoteAudioPlayer({ room, silenceMode = false }) {
  // Removed verbose render logging for cleaner console
  const audioContainerRef = useRef(null);
  
  // Use room.sid (string) instead of room object for dependency
  const roomSid = room?.sid;

  // ✅ Re-attach/detach audio when silence mode changes
  useEffect(() => {
    if (!room) return;
    
    // Silence mode changed
    
    // Detach all existing audio if entering silence mode
    if (silenceMode) {
      room.remoteParticipants.forEach(participant => {
        participant.audioTrackPublications.forEach(publication => {
          if (publication.track && publication.source !== 'screen_share_audio') {
            publication.track.detach().forEach(el => el.remove());
          }
        });
      });
    } else {
      // Reattach audio when exiting silence mode
      room.remoteParticipants.forEach(participant => {
        participant.audioTrackPublications.forEach(publication => {
          if (publication.track && publication.isSubscribed) {
            // Check if already attached
            const existingElements = publication.track.attachedElements;
            if (existingElements.length === 0) {
              const audioElement = publication.track.attach();
              audioElement.autoplay = true;
              audioElement.volume = 1.0;
              audioElement.muted = false;
              
              if (audioContainerRef.current) {
                audioContainerRef.current.appendChild(audioElement);
              } else {
                document.body.appendChild(audioElement);
              }
              
              audioElement.play().catch(err => console.error('❌ [RemoteAudioPlayer] Audio play error:', err));
            }
          }
        });
      });
    }
  }, [silenceMode, room]);

  useEffect(() => {
    // Setup audio listeners
    if (!room) {
      return;
    }

    // ✅ Resume AudioContext if suspended (browser autoplay policy)
    const resumeAudio = async () => {
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
          console.log('🔊 [RemoteAudioPlayer] AudioContext resumed');
        }
        
        // ✅ Firefox workaround: Request mic permission to unlock audio playback
        // This doesn't actually use the mic, just requests permission
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          tempStream.getTracks().forEach(track => track.stop()); // Immediately stop
          console.log('🔊 [RemoteAudioPlayer] Mic permission granted (for audio playback)');
        } catch (micErr) {
          console.warn('⚠️ [RemoteAudioPlayer] Mic permission denied, but audio playback should still work:', micErr);
        }
      } catch (err) {
        console.warn('⚠️ [RemoteAudioPlayer] Could not resume AudioContext:', err);
      }
    };
    resumeAudio();

    const handleTrackSubscribed = (track, publication, participant) => {
      if (track.kind === 'audio') {
        // ✅ SILENCE MODE: Only allow screen share audio, block participant mics
        if (silenceMode && publication.source !== 'screen_share_audio') {
          return; // Don't attach participant microphone audio
        }

        // Attach audio track to an audio element
        const audioElement = track.attach();
        audioElement.autoplay = true;
        audioElement.volume = 1.0;
        audioElement.muted = false;
        
        // ✅ Audio gain control using Web Audio API
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const source = audioContext.createMediaElementSource(audioElement);
          const gainNode = audioContext.createGain();
          gainNode.gain.value = 1.0; // Natural volume (balanced with media playback)
          source.connect(gainNode);
          gainNode.connect(audioContext.destination);
        } catch (err) {
          console.warn('⚠️ [RemoteAudioPlayer] Could not apply audio gain:', err);
        }
        
        if (audioContainerRef.current) {
          audioContainerRef.current.appendChild(audioElement);
        } else {
          document.body.appendChild(audioElement);
        }

        // Play it (in case autoplay doesn't work)
        audioElement.play().then(() => {
          // Audio playing successfully
        }).catch(err => {
          console.error('❌ [RemoteAudioPlayer] Audio play failed:', err);
        });
      }
    };

    const handleTrackUnsubscribed = (track, publication, participant) => {
      if (track.kind === 'audio') {
        track.detach().forEach(el => el.remove());
      }
    };

    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);

    // Check for existing audio tracks
    room.remoteParticipants.forEach(participant => {
      participant.audioTrackPublications.forEach(publication => {
        if (publication.track && publication.isSubscribed) {
          const audioElement = publication.track.attach();
          audioElement.autoplay = true;
          audioElement.volume = 1.0;
          
          if (audioContainerRef.current) {
            audioContainerRef.current.appendChild(audioElement);
          } else {
            document.body.appendChild(audioElement);
          }
          
          audioElement.play().catch(err => console.error('❌ [RemoteAudioPlayer] Audio play error:', err));
        }
      });
    });

    return () => {
      // Cleanup
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
      
      // Clean up all audio elements
      if (audioContainerRef.current) {
        audioContainerRef.current.innerHTML = '';
      }
    };
  }, [roomSid, room, silenceMode]); // Depend on roomSid string instead of just room object

  return <div ref={audioContainerRef} style={{ display: 'none' }} />;
}
