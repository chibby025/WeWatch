// frontend/src/components/VoiceWaveformIcon.jsx
// Small animated equalizer-style waveform (3 bars, staggered bounce) shown in place
// of a pause icon while a voice note is actively playing — shared by RoomPageNew's
// and LobbyMessageBubble's voice-note play buttons so both stay visually consistent.
// Uses the shared `animate-voice-wave` keyframe (tailwind.config.js).
export default function VoiceWaveformIcon({ className = 'w-5 h-5', barColor = 'bg-white' }) {
  const delays = ['0s', '0.15s', '0.3s'];
  return (
    <div className={`flex items-end justify-center gap-[3px] ${className}`}>
      {delays.map((delay, i) => (
        <span
          key={i}
          className={`w-1 h-full rounded-full ${barColor} animate-voice-wave`}
          style={{ transformOrigin: 'bottom', animationDelay: delay }}
        />
      ))}
    </div>
  );
}
