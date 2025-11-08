// Remote audio player component that automatically plays audio from remote participants
import { useEffect, useRef } from 'react';
import { RoomEvent } from 'livekit-client';

export default function RemoteAudioPlayer({ room }) {
  console.log('🎵🎵🎵 [RemoteAudioPlayer] Component render called, room:', !!room);
  const audioContainerRef = useRef(null);
  
  // Use room.sid (string) instead of room object for dependency
  const roomSid = room?.sid;

  useEffect(() => {
    console.log('🔊🔊🔊 [RemoteAudioPlayer] useEffect triggered, room:', !!room, 'roomSid:', roomSid);
    
    if (!room) {
      console.log('⚠️ [RemoteAudioPlayer] No room provided');
      return;
    }

    console.log('🔊 [RemoteAudioPlayer] Component mounted, setting up audio listeners');
    console.log('   Room state:', room.state);
    console.log('   Remote participants:', room.remoteParticipants.size);

    const handleTrackSubscribed = (track, publication, participant) => {
      if (track.kind === 'audio') {
        console.log('🎵 [RemoteAudioPlayer] Audio track received from', participant.identity);
        console.log('   Track source:', publication.source);
        console.log('   Track enabled:', track.enabled);
        console.log('   Track muted:', track.muted);

        // Attach audio track to an audio element
        const audioElement = track.attach();
        audioElement.autoplay = true;
        audioElement.volume = 1.0;
        
        if (audioContainerRef.current) {
          audioContainerRef.current.appendChild(audioElement);
        } else {
          document.body.appendChild(audioElement); // Fallback
        }
        
        console.log('✅ [RemoteAudioPlayer] Audio element attached and playing');

        // Play it (in case autoplay doesn't work)
        audioElement.play().catch(err => {
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
