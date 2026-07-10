import { useState, useRef, useEffect } from 'react';

const POWER_UP_INFO = {
  stun:        { icon: '😵', label: 'STUN',        desc: "Opponent's next move has 0 power",         color: '#f59e0b' },
  atk_boost:   { icon: '⚡', label: 'ATK BOOST',   desc: '+10% to your next attack power',            color: '#ef4444' },
  health_pack: { icon: '💊', label: 'HEALTH PACK', desc: '+10% HP restored to weakest character',     color: '#22c55e' },
  shield:      { icon: '🛡️', label: 'SHIELD',       desc: 'Auto-blocks the next incoming attack',      color: '#3b82f6' },
  def_boost:   { icon: '🔰', label: 'DEF BOOST',   desc: '+10% to your next defense power',           color: '#8b5cf6' },
  poison:      { icon: '☠️', label: 'POISON',       desc: "One of opponent's moves disabled 1 turn",  color: '#84cc16' },
};
const DICE_POWER_MAP = ['stun', 'atk_boost', 'health_pack', 'shield', 'def_boost', 'poison'];

function Dice3D({ value = 1, rolling = false, glowColor = null }) {
  const S = 80;

  const FACE_ROTATIONS = {
    1: 'rotateX(0deg) rotateY(0deg)',
    2: 'rotateY(-90deg)',
    3: 'rotateX(90deg)',
    4: 'rotateX(-90deg)',
    5: 'rotateY(90deg)',
    6: 'rotateY(180deg)',
  };

  const PIPS = {
    1: [[50,50]],
    2: [[75,25],[25,75]],
    3: [[75,25],[50,50],[25,75]],
    4: [[25,25],[75,25],[25,75],[75,75]],
    5: [[25,25],[75,25],[50,50],[25,75],[75,75]],
    6: [[25,20],[75,20],[25,50],[75,50],[25,80],[75,80]],
  };

  const FACES = [
    [1, `translateZ(${S/2}px)`],
    [6, `rotateY(180deg) translateZ(${S/2}px)`],
    [2, `rotateY(90deg) translateZ(${S/2}px)`],
    [5, `rotateY(-90deg) translateZ(${S/2}px)`],
    [3, `rotateX(-90deg) translateZ(${S/2}px)`],
    [4, `rotateX(90deg) translateZ(${S/2}px)`],
  ];

  const glow = glowColor
    ? `drop-shadow(0 0 20px ${glowColor}cc)`
    : 'drop-shadow(0 0 14px rgba(245,158,11,0.5))';

  return (
    <>
      <style>{`
        @keyframes dice-tumble {
          0%   { transform: rotateX(0deg)   rotateY(0deg)    rotateZ(0deg); }
          100% { transform: rotateX(720deg) rotateY(1080deg) rotateZ(360deg); }
        }
      `}</style>
      <div style={{ perspective: '300px', width: S, height: S, filter: glow }}>
        <div style={{
          width: S, height: S,
          position: 'relative',
          transformStyle: 'preserve-3d',
          animation: rolling ? 'dice-tumble 0.65s linear infinite' : undefined,
          transform: rolling ? undefined : (FACE_ROTATIONS[value] ?? FACE_ROTATIONS[1]),
          transition: rolling ? undefined : 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
        }}>
          {FACES.map(([n, faceTransform]) => (
            <div key={n} style={{
              position: 'absolute',
              width: S, height: S,
              transform: faceTransform,
              background: 'linear-gradient(145deg, #f5f5ea 0%, #e2e2d0 100%)',
              border: '2px solid rgba(180,170,140,0.7)',
              borderRadius: 11,
              boxSizing: 'border-box',
            }}>
              {(PIPS[n] || []).map(([x, y], i) => (
                <div key={i} style={{
                  position: 'absolute',
                  width: 13, height: 13,
                  background: '#181826',
                  borderRadius: '50%',
                  left: `${x}%`,
                  top: `${y}%`,
                  transform: 'translate(-50%, -50%)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
                }}/>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function MockDiceRollOverlay({ onClose }) {
  const [step, setStep] = useState('idle'); // idle | rolling | result
  const [diceVal, setDiceVal] = useState(null);

  const handleRoll = () => {
    setStep('rolling');
    setTimeout(() => {
      const val = Math.floor(Math.random() * 6) + 1;
      setDiceVal(val);
      setStep('result');
    }, 1800);
  };

  const powerUp = diceVal ? POWER_UP_INFO[DICE_POWER_MAP[diceVal - 1]] : null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)' }}>
      <div className="flex flex-col items-center gap-5 px-6 py-8 rounded-2xl border border-gray-700 bg-gray-900/90 max-w-sm w-full mx-4">
        <div className="text-center">
          <div className="text-lg font-bold text-yellow-400 tracking-wide">⚔️ Attack Bonus Roll</div>
          <div className="text-xs text-gray-400 mt-1">3 consecutive wins unlocked a bonus!</div>
        </div>

        <div className="flex flex-col items-center gap-4 py-2">
          <Dice3D
            value={diceVal || 1}
            rolling={step === 'rolling'}
            glowColor={powerUp?.color}
          />
          {step === 'result' && powerUp && (
            <div className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl border" style={{ borderColor: powerUp.color, background: `${powerUp.color}18` }}>
              <div className="text-2xl">{powerUp.icon}</div>
              <div className="font-bold tracking-widest text-sm" style={{ color: powerUp.color }}>{powerUp.label}</div>
              <div className="text-xs text-gray-300 text-center">{powerUp.desc}</div>
            </div>
          )}
        </div>

        {step === 'idle' && (
          <button onClick={handleRoll} className="px-8 py-3 rounded-xl font-bold text-base text-white transition-all active:scale-95" style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>
            🎲 ROLL!
          </button>
        )}
        {step === 'rolling' && <div className="text-sm text-gray-400 animate-pulse">Rolling…</div>}
        {step === 'result' && <div className="text-sm text-green-400 font-medium">Power-up applied!</div>}

        <div className="text-xs text-gray-500 border-t border-gray-700 pt-3 w-full text-center">
          Opponent also has a pending roll
        </div>

        <button onClick={() => { setStep('idle'); setDiceVal(null); onClose(); }} className="text-xs text-gray-600 hover:text-gray-400">
          Close preview
        </button>
      </div>
    </div>
  );
}

function MockCounterOverlay({ onClose }) {
  const [timeLeft, setTimeLeft] = useState(3000);
  const [chosen, setChosen]     = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const intervalRef = useRef(null);

  const mockAttacks = [
    { name: 'Dragon Slash',  power: 85 },
    { name: 'Shadow Fang',   power: 62 },
  ];

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimeLeft(p => {
        if (p <= 100) { clearInterval(intervalRef.current); return 0; }
        return p - 100;
      });
    }, 100);
    return () => clearInterval(intervalRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChoose = (isAttack) => {
    clearInterval(intervalRef.current);
    if (isAttack) {
      setShowVideo(true);
      // Simulate video ending after 2s
      setTimeout(() => { setShowVideo(false); setChosen(true); }, 2000);
    } else {
      setChosen(true);
    }
  };

  const total = 3000;
  const pct   = (timeLeft / total) * 100;
  const barColor = timeLeft > 2000 ? '#22c55e' : timeLeft > 1000 ? '#f97316' : '#ef4444';
  const secsTxt  = (timeLeft / 1000).toFixed(1);

  return (
    <>
      <style>{`
        @keyframes preview-cw-breathe   { 0%,100%{opacity:1} 50%{opacity:.88} }
        @keyframes preview-cw-spotlight { 0%,100%{transform:scale(1);opacity:.5} 50%{transform:scale(1.4);opacity:.9} }
        @keyframes preview-cw-glow      { 0%,100%{box-shadow:0 0 0 0 rgba(234,179,8,.25)} 50%{box-shadow:0 0 0 6px rgba(234,179,8,.1)} }
        @keyframes preview-cw-flicker   { 0%,90%,100%{text-shadow:0 0 8px #facc15,0 0 22px #fbbf24} 92%{text-shadow:0 0 3px #facc15} 95%{text-shadow:0 0 14px #facc15,0 0 36px #fbbf24} }
      `}</style>

      {/* Animated backdrop */}
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background:'rgba(0,0,8,.84)', animation:'preview-cw-breathe 2s ease-in-out infinite' }} />
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.05) 3px,rgba(0,0,0,.05) 4px)' }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background:'radial-gradient(ellipse 55% 55% at center,rgba(234,179,8,.06) 0%,transparent 70%)', animation:'preview-cw-spotlight 2s ease-in-out infinite' }} />

      {/* Modal */}
      <div className="absolute inset-0 flex items-center justify-center z-50">
        <div className="bg-gray-900/95 border border-yellow-500/60 rounded-2xl p-6 w-80 relative overflow-hidden"
          style={{ animation:'preview-cw-glow 1.6s ease-in-out infinite' }}>
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-400/50 to-transparent" />

          {showVideo && (
            <div className="flex flex-col items-center gap-3">
              <div className="text-yellow-400 font-bold text-sm tracking-wide">⚡ Counter Strike!</div>
              <div className="w-full h-40 rounded-xl bg-gradient-to-br from-red-900 to-orange-900 flex items-center justify-center">
                <div className="text-4xl animate-bounce">🐉</div>
              </div>
              <div className="text-xs text-gray-400 animate-pulse">Playing Dragon Slash…</div>
            </div>
          )}

          {!showVideo && !chosen && (
            <>
              <div className="text-center mb-3">
                <div className="text-2xl" style={{ fontFamily:'Bangers, cursive', letterSpacing:'.1em', color:'#facc15', WebkitTextStroke:'1px #000', animation:'preview-cw-flicker 3s ease-in-out infinite' }}>
                  ⚡ COUNTER WINDOW ⚡
                </div>
                <div className="text-xs text-gray-400 mt-1">You can counter!</div>
              </div>
              <div className="text-center text-xs font-semibold mb-1.5 transition-colors duration-300" style={{ color:barColor }}>
                {secsTxt}s remaining
              </div>
              <div className="w-full h-2.5 bg-gray-700/80 rounded-full overflow-hidden mb-4">
                <div className="h-full rounded-full transition-all duration-100" style={{ width:`${pct}%`, background:`linear-gradient(90deg,${barColor}99,${barColor})`, boxShadow:`0 0 8px ${barColor}70` }} />
              </div>
              <div className="space-y-2">
                <button onClick={() => handleChoose(false)} className="w-full py-2.5 rounded-lg border border-blue-500 bg-blue-900/40 text-blue-300 font-medium text-sm hover:bg-blue-900/60 transition-colors">
                  <div className="font-bold">REFLECT</div>
                  <div className="text-xs opacity-70">Mirror 2% of opponent's power back</div>
                </button>
                <div className="text-xs text-gray-500 text-center">— or —</div>
                <div className="space-y-1">
                  <div className="text-xs text-gray-400 mb-1">STRIKE BACK (5% power):</div>
                  {mockAttacks.map((m, i) => (
                    <button key={i} onClick={() => handleChoose(true)}
                      className="w-full py-1.5 rounded-lg border border-red-700 bg-red-900/30 text-red-300 text-xs hover:bg-red-900/50 transition-colors text-left px-3 flex items-center gap-2">
                      <span className="text-gray-500">▶</span>
                      <span className="flex-1">{m.name}</span>
                      <span className="opacity-60">{m.power} pts</span>
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={onClose} className="mt-3 w-full text-xs text-gray-600 hover:text-gray-400 py-1">Close preview</button>
            </>
          )}

          {!showVideo && chosen && (
            <div className="text-center py-4">
              <div className="text-green-400 font-bold text-lg mb-1">✓ Counter Sent!</div>
              <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300 mt-2">Close preview</button>
            </div>
          )}

          {timeLeft === 0 && !chosen && !showVideo && (
            <div className="text-center text-gray-500 text-xs mt-2">Window closed — auto-reflected.</div>
          )}
        </div>
      </div>
    </>
  );
}

export default function VsBattlePreview() {
  const [showing, setShowing] = useState(null);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-black mb-1" style={{ fontFamily: 'Bangers, cursive', letterSpacing: '0.08em', color: '#a78bfa' }}>
          VS Battle — Dev Preview
        </h1>
        <p className="text-gray-500 text-sm mb-8">Overlay component showcase. Click a button to open the modal.</p>

        <div className="flex flex-col gap-4">
          <button onClick={() => setShowing('counter')}
            className="px-6 py-4 rounded-xl bg-yellow-900/40 border border-yellow-700 text-yellow-300 font-semibold text-left hover:bg-yellow-900/60 transition-colors">
            <div className="font-bold">⚡ Counter Window Overlay</div>
            <div className="text-xs text-yellow-500 mt-0.5">Appears after attack_lands — defender has 3s to counter</div>
          </button>

          <button onClick={() => setShowing('dice')}
            className="px-6 py-4 rounded-xl bg-purple-900/40 border border-purple-700 text-purple-300 font-semibold text-left hover:bg-purple-900/60 transition-colors">
            <div className="font-bold">🎲 Dice Roll Overlay</div>
            <div className="text-xs text-purple-400 mt-0.5">Appears after 3 consecutive wins — roll for a random power-up</div>
          </button>
        </div>

        {/* Static dice showcase */}
        <div className="mt-8 border border-gray-800 rounded-xl overflow-hidden">
          <div className="bg-gray-800/60 px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider">All 6 Faces</div>
          <div className="p-4 flex gap-6 flex-wrap justify-center">
            {[1,2,3,4,5,6].map(n => (
              <div key={n} className="flex flex-col items-center gap-2">
                <Dice3D value={n} rolling={false} />
                <span className="text-xs text-gray-500">{n} — {POWER_UP_INFO[DICE_POWER_MAP[n-1]].label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showing && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
            <div className="text-gray-700 text-sm">[ Battle phase backdrop ]</div>
          </div>
          {showing === 'counter' && <MockCounterOverlay onClose={() => setShowing(null)} />}
          {showing === 'dice'    && <MockDiceRollOverlay onClose={() => setShowing(null)} />}
        </div>
      )}
    </div>
  );
}
