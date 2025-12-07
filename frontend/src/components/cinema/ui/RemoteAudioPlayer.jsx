// Remote audio player component that automatically plays audio from remote participants
import { useEffect, useRef } from 'react';
import { RoomEvent } from 'livekit-client';

export default function RemoteAudioPlayer({ room, silenceMode = false }) {
  console.log('🎵🎵🎵 [RemoteAudioPlayer] Component render called, room:', !!room, 'silenceMode:', silenceMode);
  const audioContainerRef = useRef(null);
  
  // Use room.sid (string) instead of room object for dependency
  const roomSid = room?.sid;

  // ✅ Re-attach/detach audio when silence mode changes
  useEffect(() => {
    if (!room) return;
    
    console.log('🔇 [RemoteAudioPlayer] Silence mode changed:', silenceMode);
    
    // Detach all existing audio if entering silence mode
    if (silenceMode) {
      room.remoteParticipants.forEach(participant => {
        participant.audioTrackPublications.forEach(publication => {
          if (publication.track && publication.source !== 'screen_share_audio') {
            console.log('🔇 [RemoteAudioPlayer] Detaching mic audio from', participant.identity);
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
              console.log('🔊 [RemoteAudioPlayer] Reattaching audio from', participant.identity);
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
    console.log('🔊🔊🔊 [RemoteAudioPlayer] useEffect triggered, room:', !!room, 'roomSid:', roomSid);
    
    if (!room) {
      console.log('⚠️ [RemoteAudioPlayer] No room provided');
      return;
    }

    console.log('🔊 [RemoteAudioPlayer] Component mounted, setting up audio listeners');
    console.log('   Room state:', room.state);
    console.log('   Remote participants:', room.remoteParticipants.size);

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
        console.log('🎵 [RemoteAudioPlayer] Audio track received from', participant.identity);
        console.log('   Track source:', publication.source);
        console.log('   Track enabled:', track.enabled);
        console.log('   Track muted:', track.muted);
        console.log('   MediaStreamTrack:', track.mediaStreamTrack);
        console.log('   MediaStreamTrack enabled:', track.mediaStreamTrack?.enabled);
        console.log('   MediaStreamTrack muted:', track.mediaStreamTrack?.muted);
        console.log('   MediaStreamTrack readyState:', track.mediaStreamTrack?.readyState);
        
        // ✅ SILENCE MODE: Only allow screen share audio, block participant mics
        if (silenceMode && publication.source !== 'screen_share_audio') {
          console.log('🔇 [RemoteAudioPlayer] Silence mode active - blocking mic audio from', participant.identity);
          return; // Don't attach participant microphone audio
        }

        // ✅ Listen for track unmute event
        if (track.mediaStreamTrack) {
          track.mediaStreamTrack.onunmute = () => {
            console.log('🔊 [RemoteAudioPlayer] Track UNMUTED! Audio should now play');
          };
          track.mediaStreamTrack.onmute = () => {
            console.log('🔇 [RemoteAudioPlayer] Track MUTED');
          };
        }

        // Attach audio track to an audio element
        const audioElement = track.attach();
        audioElement.autoplay = true;
        audioElement.volume = 1.0; // ✅ Max volume (0.0 to 1.0 range)
        audioElement.muted = false; // ✅ Explicitly unmute audio element
        
        // ✅ Boost audio using Web Audio API (allows > 1.0 gain)
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const source = audioContext.createMediaElementSource(audioElement);
          const gainNode = audioContext.createGain();
          gainNode.gain.value = 1.5; // ✅ Boost by 50% (adjust this value: 1.0 = normal, 2.0 = double)
          source.connect(gainNode);
          gainNode.connect(audioContext.destination);
          console.log('🔊 [RemoteAudioPlayer] Audio gain boost applied:', gainNode.gain.value);
        } catch (err) {
          console.warn('⚠️ [RemoteAudioPlayer] Could not apply audio gain:', err);
        }
        
        if (audioContainerRef.current) {
          audioContainerRef.current.appendChild(audioElement);
        } else {
          document.body.appendChild(audioElement); // Fallback
        }
        
        console.log('✅ [RemoteAudioPlayer] Audio element attached and playing');
        console.log('🔊 [RemoteAudioPlayer] Audio element muted:', audioElement.muted);
        console.log('🔊 [RemoteAudioPlayer] Audio element volume:', audioElement.volume);

        // Play it (in case autoplay doesn't work)
        audioElement.play().then(() => {
          console.log('✅ [RemoteAudioPlayer] Audio play() succeeded');
          
          // ✅ DEBUG: Create AudioContext analyzer to see if there's actual audio data
          try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioCtx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
            const analyser = audioCtx.createAnalyser();
            source.connect(analyser);
            
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const checkAudio = () => {
              analyser.getByteFrequencyData(dataArray);
              const volume = dataArray.reduce((a, b) => a + b) / dataArray.length;
              if (volume > 0) {
                console.log('🔊 [RemoteAudioPlayer] AUDIO DATA DETECTED! Volume:', volume);
              }
            };
            setInterval(checkAudio, 1000); // Check every second
          } catch (err) {
            console.warn('⚠️ [RemoteAudioPlayer] Could not create audio analyzer:', err);
          }
        }).catch(err => {
          console.error('❌ [RemoteAudioPlayer] Audio play failed:', err);
        });
      }
    };

    const handleTrackUnsubscribed = (track, publication, participant) => {
      if (track.kind === 'audio') {
        console.log('🔇 [RemoteAudioPlayer] Audio track removed from', participant.identity);
        track.detach().forEach(el => el.remove());
      }
    };

    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);

    // Check for existing audio tracks
    room.remoteParticipants.forEach(participant => {
      console.log('👤 [RemoteAudioPlayer] Checking existing participant:', participant.identity);
      console.log('   Audio track publications:', participant.audioTrackPublications.size);
      
      participant.audioTrackPublications.forEach(publication => {
        console.log('   📻 Audio publication:', {
          trackSid: publication.trackSid,
          source: publication.source,
          isSubscribed: publication.isSubscribed,
          hasTrack: !!publication.track
        });
        
        if (publication.track && publication.isSubscribed) {
          console.log('🎵 [RemoteAudioPlayer] Found existing audio track from', participant.identity);
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
      console.log('🧹 [RemoteAudioPlayer] Cleaning up');
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
      
      // Clean up all audio elements
      if (audioContainerRef.current) {
        audioContainerRef.current.innerHTML = '';
      }
    };
  }, [roomSid, room]); // Depend on roomSid string instead of just room object

  return <div ref={audioContainerRef} style={{ display: 'none' }} />;
}
