import { useState, useEffect, useCallback, useRef } from 'react';
import { X as CloseIcon } from 'lucide-react';

const MAX_HP = 100;
const DEFEND_WINDOW_MS = 2000; // how long defender has to respond

// Punch telegraphs shown to the defender
const PUNCH_TELLS = {
  jab:       { emoji: '👊', label: 'Jab',       color: 'text-yellow-400', hint: 'Fast — dodge or counter' },
  hook:      { emoji: '🥊', label: 'Hook',      color: 'text-orange-400', hint: 'Power — block, dodge, or counter' },
  uppercut:  { emoji: '⬆️',  label: 'Uppercut',  color: 'text-red-400',    hint: 'Breaks block! Dodge or counter' },
};

const DEFENSE_OPTIONS = [
  { id: 'block',   emoji: '🛡️', label: 'Block',   desc: 'Reduce damage (fails vs uppercut)' },
  { id: 'dodge',   emoji: '💨', label: 'Dodge',   desc: 'No damage, shorter window' },
  { id: 'counter', emoji: '⚡', label: 'Counter', desc: 'Deal damage back, risky!' },
];

const PUNCH_OPTIONS = [
  { id: 'jab',      emoji: '👊', label: 'Jab',      desc: 'Fast — good opener' },
  { id: 'hook',     emoji: '🥊', label: 'Hook',      desc: 'Heavy — readable but powerful' },
  { id: 'uppercut', emoji: '⬆️',  label: 'Uppercut',  desc: 'Breaks block!' },
];

function HPBar({ hp, maxHp = MAX_HP, label, color = 'bg-red-500', flipped = false }) {
  const pct = Math.max(0, (hp / maxHp) * 100);
  return (
    <div className={`flex flex-col gap-1 ${flipped ? 'items-end' : 'items-start'} w-full`}>
      <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{label}</span>
      <div className="w-full h-4 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${pct}%`, marginLeft: flipped ? 'auto' : 0, float: flipped ? 'right' : 'left' }}
        />
      </div>
      <span className="text-sm font-bold text-white">{Math.ceil(hp)} HP</span>
    </div>
  );
}

function OutcomeFlash({ outcome, dmgToDefender, dmgToAttacker, onDone }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); onDone?.(); }, 1400);
    return () => clearTimeout(t);
  }, [onDone]);

  if (!visible) return null;

  const messages = {
    dodged:       { text: 'DODGED!',       color: 'text-cyan-400' },
    blocked:      { text: `BLOCKED! -${dmgToDefender}`,  color: 'text-blue-400' },
    block_broken: { text: `BLOCK BROKEN! -${dmgToDefender}`, color: 'text-orange-500' },
    countered:    { text: `COUNTER! -${dmgToAttacker}`,  color: 'text-purple-400' },
    hit:          { text: `HIT! -${dmgToDefender}`,      color: 'text-red-400' },
  };

  const m = messages[outcome] || { text: outcome?.toUpperCase(), color: 'text-white' };
  return (
    <div className={`absolute inset-x-0 flex items-center justify-center pointer-events-none`} style={{ top: '38%' }}>
      <span className={`text-4xl font-black animate-bounce ${m.color} drop-shadow-lg`}>{m.text}</span>
    </div>
  );
}

export default function BoxingGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const [showOutcome, setShowOutcome] = useState(false);
  const [defenseTimeout, setDefenseTimeout] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);

  const data = gameState?.game_state || {};
  const phase = data.phase || 'attacking';
  const hp0 = data.hp_0 ?? MAX_HP;
  const hp1 = data.hp_1 ?? MAX_HP;
  const attackerIdx = data.attacker_idx ?? 0;
  const pendingPunch = data.pending_punch || '';
  const lastOutcome = data.last_outcome || '';
  const lastDmgToDefender = data.last_dmg_to_defender ?? 0;
  const lastDmgToAttacker = data.last_dmg_to_attacker ?? 0;
  const lastAttackerIdx = data.last_attacker_idx ?? 0;
  const exchange = data.exchange ?? 0;

  const p0 = players?.[0];
  const p1 = players?.[1];
  const myIdx = players?.findIndex(p => p.user_id === currentUserId);
  const isMyTurn = myIdx === attackerIdx;
  const amDefender = myIdx === (1 - attackerIdx);
  const isAttacking = phase === 'attacking';
  const isDefending = phase === 'defending';
  const isKO = phase === 'ko';
  const status = gameState?.status;
  const isOver = status === 'finished' || status === 'completed' || status === 'forfeited' || isKO;
  const winnerId = gameState?.winner_id;

  // Start countdown timer when we enter defending phase and we're the defender
  useEffect(() => {
    if (isDefending && amDefender) {
      setTimeLeft(DEFEND_WINDOW_MS / 1000);
      countdownRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 0.1) {
            clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 0.1;
        });
      }, 100);
    } else {
      clearInterval(countdownRef.current);
      setTimeLeft(0);
    }
    return () => clearInterval(countdownRef.current);
  }, [isDefending, amDefender, exchange]);

  // Show outcome flash when phase goes back to attacking (resolution happened)
  useEffect(() => {
    if (lastOutcome && phase === 'attacking' && exchange > 0) {
      setShowOutcome(true);
    }
  }, [exchange, phase, lastOutcome]);

  const handleThrowPunch = useCallback((punchType) => {
    onMove({ move_type: 'throw_punch', punch_type: punchType });
  }, [onMove]);

  const handleDefend = useCallback((defense) => {
    clearInterval(countdownRef.current);
    onMove({ move_type: 'defend', defense });
  }, [onMove]);

  const handleEndOrLeave = useCallback(() => {
    if (myIdx === 0 || myIdx === (gameState?.host_id === currentUserId ? 0 : -1)) {
      onEndGame?.();
    }
    onClose?.();
  }, [myIdx, onEndGame, onClose, gameState, currentUserId]);

  const myHp  = myIdx === 0 ? hp0 : hp1;
  const oppHp = myIdx === 0 ? hp1 : hp0;
  const myName  = myIdx === 0 ? (p0?.username || 'You') : (p1?.username || 'You');
  const oppName = myIdx === 0 ? (p1?.username || 'Opponent') : (p0?.username || 'Opponent');

  if (isOver) {
    const iWon = winnerId === currentUserId;
    const isDraw = winnerId == null;
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-950 gap-6 text-white">
        <span className="text-7xl">{isDraw ? '🤝' : iWon ? '🏆' : '😵'}</span>
        <h2 className="text-3xl font-black">
          {isDraw ? "It's a Draw!" : iWon ? 'KO! You Win!' : 'You\'ve been KO\'d!'}
        </h2>
        {!isDraw && (
          <p className="text-gray-400">
            {iWon ? `${myName} wins the bout!` : `${oppName} wins by knockout!`}
          </p>
        )}
        <div className="flex gap-4 text-lg font-bold">
          <span>{p0?.username}: {Math.ceil(hp0)} HP</span>
          <span className="text-gray-500">vs</span>
          <span>{p1?.username}: {Math.ceil(hp1)} HP</span>
        </div>
        <button
          onClick={handleEndOrLeave}
          className="mt-2 px-8 py-3 bg-purple-600 hover:bg-purple-700 rounded-xl font-semibold transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  const tell = PUNCH_TELLS[pendingPunch];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
        <span className="text-sm font-semibold text-gray-400">Exchange #{exchange + 1}</span>
        <span className="font-bold text-lg">🥊 Boxing</span>
        <button onClick={handleEndOrLeave} className="p-1 hover:text-gray-300 text-gray-500">
          <CloseIcon className="w-5 h-5" />
        </button>
      </div>

      {/* HP Bars */}
      <div className="flex gap-4 px-6 py-4 bg-gray-900">
        <div className="flex-1">
          <HPBar hp={myHp} label={`${myName} (You)`} color="bg-blue-500" />
        </div>
        <div className="flex items-center text-xl font-black text-gray-600 px-2">VS</div>
        <div className="flex-1">
          <HPBar hp={oppHp} label={oppName} color="bg-red-500" flipped />
        </div>
      </div>

      {/* Arena */}
      <div className="relative flex-1 flex flex-col items-center justify-center gap-8 px-4">

        {/* Outcome flash */}
        {showOutcome && (
          <OutcomeFlash
            outcome={lastOutcome}
            dmgToDefender={lastDmgToDefender}
            dmgToAttacker={lastDmgToAttacker}
            onDone={() => setShowOutcome(false)}
          />
        )}

        {/* Fighter emoji display */}
        <div className="flex items-center gap-8">
          <div className="flex flex-col items-center gap-1">
            <span className="text-5xl">{myIdx === attackerIdx ? '🥊' : '🛡️'}</span>
            <span className="text-xs text-gray-400">{myName}</span>
          </div>
          <span className="text-3xl text-gray-700">⚡</span>
          <div className="flex flex-col items-center gap-1">
            <span className="text-5xl">{myIdx === attackerIdx ? '😰' : '🥊'}</span>
            <span className="text-xs text-gray-400">{oppName}</span>
          </div>
        </div>

        {/* Phase-specific UI */}
        {isAttacking && isMyTurn && (
          <div className="flex flex-col items-center gap-4 w-full max-w-sm">
            <p className="text-gray-300 font-semibold">Choose your attack:</p>
            <div className="grid grid-cols-3 gap-3 w-full">
              {PUNCH_OPTIONS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleThrowPunch(p.id)}
                  className="flex flex-col items-center gap-1 p-3 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 border border-gray-700 hover:border-purple-500 rounded-xl transition-all"
                >
                  <span className="text-2xl">{p.emoji}</span>
                  <span className="font-bold text-sm">{p.label}</span>
                  <span className="text-xs text-gray-400 text-center leading-tight">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isAttacking && !isMyTurn && (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
            <p className="text-gray-400">{oppName} is choosing an attack…</p>
          </div>
        )}

        {isDefending && amDefender && tell && (
          <div className="flex flex-col items-center gap-4 w-full max-w-sm">
            {/* Telegraph */}
            <div className="flex flex-col items-center gap-1 p-4 bg-gray-800 rounded-2xl border-2 border-orange-500/60 w-full">
              <span className="text-5xl">{tell.emoji}</span>
              <span className={`text-xl font-black ${tell.color}`}>{tell.label}!</span>
              <span className="text-xs text-gray-400">{tell.hint}</span>
            </div>
            {/* Countdown bar */}
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full transition-all duration-100"
                style={{ width: `${(timeLeft / (DEFEND_WINDOW_MS / 1000)) * 100}%` }}
              />
            </div>
            <p className="text-sm text-gray-400">{timeLeft.toFixed(1)}s to respond</p>
            {/* Defense buttons */}
            <div className="grid grid-cols-3 gap-3 w-full">
              {DEFENSE_OPTIONS.map(d => (
                <button
                  key={d.id}
                  onClick={() => handleDefend(d.id)}
                  className="flex flex-col items-center gap-1 p-3 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 border border-gray-700 hover:border-cyan-500 rounded-xl transition-all"
                >
                  <span className="text-2xl">{d.emoji}</span>
                  <span className="font-bold text-sm">{d.label}</span>
                  <span className="text-xs text-gray-400 text-center leading-tight">{d.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isDefending && !amDefender && (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-lg font-semibold text-orange-400">
              {tell?.emoji} {tell?.label} incoming!
            </p>
            <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
            <p className="text-gray-400">{oppName} is defending…</p>
          </div>
        )}
      </div>

      {/* Spectator / waiting for game to start */}
      {myIdx === -1 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-3">
          <span className="text-4xl">👀</span>
          <p className="text-white font-semibold">You're watching the bout</p>
        </div>
      )}
    </div>
  );
}
