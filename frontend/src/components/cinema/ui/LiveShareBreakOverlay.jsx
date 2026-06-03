// Fullscreen break overlay — ZZZ idle animation + countdown, shown for 'static' break source.
// Rendered as a fixed DOM layer (z-500) so CSS animations work and it sits above the video
// canvas but below the taskbar (z-1000) and modals.

const breakCSS = `
  @keyframes lsbFloatZzz {
    0%   { opacity: 0;   transform: translateY(0)   scale(0.7); }
    20%  { opacity: 0.9; }
    80%  { opacity: 0.6; }
    100% { opacity: 0;   transform: translateY(-60px) scale(1.2); }
  }
  .lsb-zzz-1 { animation: lsbFloatZzz 2.4s ease-in-out infinite; animation-delay: 0s; }
  .lsb-zzz-2 { animation: lsbFloatZzz 2.4s ease-in-out infinite; animation-delay: 0.8s; }
  .lsb-zzz-3 { animation: lsbFloatZzz 2.4s ease-in-out infinite; animation-delay: 1.6s; }
`;

export default function LiveShareBreakOverlay({ timeRemaining = 0 }) {
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'linear-gradient(135deg, #1a0533 0%, #111827 55%, #000000 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: 'white',
    }}>
      <style>{breakCSS}</style>

      {/* Sleeping icon + floating Zzz — same layout as LobbyPage WatchOut empty state */}
      <div style={{ position: 'relative', width: 112, height: 112, marginBottom: 32 }}>
        <img
          src="/icons/lwoIcon.webp"
          alt=""
          style={{ width: 80, height: 80, opacity: 0.25, position: 'absolute', top: 16, left: 16 }}
          onError={e => { e.target.style.display = 'none'; }}
        />
        <span className="lsb-zzz-1" style={{ position: 'absolute', fontSize: 12, top: 8,  right: 8,  color: 'rgba(255,255,255,0.7)', fontWeight: 'bold', userSelect: 'none', pointerEvents: 'none' }}>z</span>
        <span className="lsb-zzz-2" style={{ position: 'absolute', fontSize: 16, top: 0,  right: 18, color: 'rgba(255,255,255,0.7)', fontWeight: 'bold', userSelect: 'none', pointerEvents: 'none' }}>z</span>
        <span className="lsb-zzz-3" style={{ position: 'absolute', fontSize: 22, top: -10, right: 28, color: 'rgba(255,255,255,0.7)', fontWeight: 'bold', userSelect: 'none', pointerEvents: 'none' }}>Z</span>
      </div>

      <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>We'll Be Right Back</h2>
      <p style={{ color: 'rgba(156,163,175,1)', marginBottom: 28, fontSize: 14 }}>Taking a short break</p>

      {timeRemaining > 0 && (
        <div style={{
          background: 'rgba(255,165,0,0.12)',
          border: '2px solid rgba(255,165,0,0.35)',
          borderRadius: 12,
          padding: '12px 36px',
        }}>
          <span style={{
            fontSize: 52, fontWeight: 700, color: '#FFA500',
            fontVariantNumeric: 'tabular-nums', letterSpacing: 2,
          }}>
            {minutes}:{String(seconds).padStart(2, '0')}
          </span>
        </div>
      )}
    </div>
  );
}
