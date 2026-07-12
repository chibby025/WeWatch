// VsBattleGame.jsx — VS Battle (Death Battle) game frontend
// 2-player simultaneous-lock card battle: build 1-3 custom characters, then fight.
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { apiClient } from '../../services/api';

// ── Constants ─────────────────────────────────────────────────────────────────

const TIERS = {
  'Regular':     { budget: 300, hp: 100 },
  'Street':      { budget: 350, hp: 150 },
  'City-Wide':   { budget: 400, hp: 200 },
  'Continental': { budget: 450, hp: 250 },
  'Global':      { budget: 500, hp: 300 },
  'Universal':   { budget: 550, hp: 350 },
};
const TIER_ORDER = ['Regular', 'Street', 'City-Wide', 'Continental', 'Global', 'Universal'];
const TIER_COLORS = {
  'Regular':     'text-gray-300 border-gray-500',
  'Street':      'text-green-300 border-green-600',
  'City-Wide':   'text-blue-300 border-blue-600',
  'Continental': 'text-purple-300 border-purple-600',
  'Global':      'text-yellow-300 border-yellow-600',
  'Universal':   'text-red-300 border-red-500',
};
const TIER_INFO = {
  'Regular':     { desc: 'Street-level fighters with no superhuman abilities.',        examples: 'Batman, Green Arrow, Black Widow' },
  'Street':      { desc: 'Peak-conditioned humans with minor enhancements.',          examples: 'Captain America, Luke Cage, Daredevil' },
  'City-Wide':   { desc: 'Superhumans capable of levelling buildings.',               examples: 'Spider-Man, Iron Man, Black Panther' },
  'Continental': { desc: 'Powerhouses who can reshape entire landscapes.',            examples: 'Thor (limited), Hulk, Wonder Woman' },
  'Global':      { desc: 'Planetary threats with reality-warping capability.',        examples: 'Thor (full power), Doctor Strange, Silver Surfer' },
  'Universal':   { desc: 'Cosmic forces that can reshape existence itself.',          examples: 'Thanos (Infinity Gauntlet), Galactus, Superman (full)' },
};

// Outcome label text + color for the Bangers font display.
// charPrefix: 'attacker' → show attackerChar name as a golden inline prefix before the label text.
// defName: 'defender'   → the label fn receives the defender's name as its second arg (embedded in the text).
const OUTCOME_MAP = {
  stalemate:      { label: () => 'STALEMATE',                                                                     color: '#f59e0b' },
  attack_wins:    { label: r => `ATTACK LANDS (+${r.damage} DMG)`,                                               color: '#ef4444', charPrefix: 'attacker' },
  attack_lands:   { label: r => `ATTACK LANDS (+${r.damage} DMG)`,                                               color: '#ef4444', charPrefix: 'attacker' },
  deflect:        { label: (r, def) => def ? `DEFLECTED BY ${def.toUpperCase()}` : 'DEFLECTED',                  color: '#3b82f6', defName: 'defender' },
  blocked:        { label: (r, def) => def ? `BLOCKED BY ${def.toUpperCase()}` : 'BLOCKED',                      color: '#22c55e', defName: 'defender' },
  undefended:     { label: r => `UNDEFENDED (+${r.damage} DMG)`,                                                  color: '#ef4444', charPrefix: 'attacker' },
  both_defend:    { label: () => 'BOTH DEFEND',                                                                   color: '#9ca3af' },
  both_timeout:   { label: () => 'TIMED OUT',                                                                     color: '#6b7280' },
  counter_chance: { label: () => 'COUNTER!',                                                                      color: '#facc15' },
  counter_result: { label: r => r.damage ? `COUNTER HIT! (${r.damage} DMG)` : 'COUNTER REFLECT!',               color: '#facc15', charPrefix: 'attacker' },
  both_attack:    { label: () => 'CLASH!',                                                                        color: '#f97316' },
  atk_vs_def:     { label: () => 'CLASH!',                                                                        color: '#a78bfa' },
};

// Power-up metadata (dice roll results 1–6)
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const POWER_UP_INFO = {
  stun:        { icon: '😵', label: 'STUN',         desc: "Opponent's next move has 0 power",         color: '#f59e0b' },
  atk_boost:   { icon: '⚡', label: 'ATK BOOST',    desc: '+10% to your next attack power',            color: '#ef4444' },
  health_pack: { icon: '💊', label: 'HEALTH PACK',  desc: '+10% HP restored to weakest character',     color: '#22c55e' },
  shield:      { icon: '🛡️', label: 'SHIELD',        desc: 'Auto-blocks the next incoming attack',      color: '#3b82f6' },
  def_boost:   { icon: '🔰', label: 'DEF BOOST',    desc: '+10% to your next defense power',           color: '#8b5cf6' },
  poison:      { icon: '☠️', label: 'POISON',        desc: "One of opponent's moves disabled 1 turn",  color: '#84cc16' },
};
const DICE_POWER_MAP = ['stun', 'atk_boost', 'health_pack', 'shield', 'def_boost', 'poison'];

// Default move powers per tier (injected server-side, shown read-only in UI)
const DEFAULT_PUNCH_POWER = { Regular: 75, Street: 90, 'City-Wide': 100, Continental: 115, Global: 125, Universal: 140 };
const DEFAULT_BLOCK_POWER  = { Regular: 75, Street: 90, 'City-Wide': 100, Continental: 115, Global: 125, Universal: 140 };

// CDN base for game assets
const CDN = 'https://LetsWatchOut.b-cdn.net';

// Sound file map (hosted on BunnyCDN)
const SOUND_FILES = {
  begin:        `${CDN}/games/sounds/begin%20sound.mp3`,
  yourTurn:     `${CDN}/games/sounds/your%20turn.mp3`,
  attackMove:   `${CDN}/games/sounds/attack%20move.mp3`,
  defenseMove:  `${CDN}/games/sounds/defense%20move.mp3`,
  attackWin:    `${CDN}/games/sounds/attack%20win.mp3`,
  defenseWin:   `${CDN}/games/sounds/defense%20win.mp3`,
  blocked:      `${CDN}/games/sounds/blocked%20sound.mp3`,
  counter:      `${CDN}/games/sounds/counter%20sound.mp3`,
  stalemate:    `${CDN}/games/sounds/stalemate%20sound.mp3`,
  superAttack:  `${CDN}/games/sounds/super%20attack%20sound.mp3`,
  superDefense: `${CDN}/games/sounds/super%20defense.mp3`,
  ko:           `${CDN}/games/sounds/K.O%20Sound.mp3`,
  gameOver:     `${CDN}/games/sounds/game%20over%20sound.mp3`,
  youWin:       `${CDN}/games/sounds/you%20win%20sound.mp3`,
  youLose:      `${CDN}/games/sounds/you%20lose%20sound.mp3`,
  lifeDrain:    `${CDN}/games/sounds/lifedrain.mp3`,
};

// Pre-made video clips (hosted on BunnyCDN)
const VID_PUNCH_WIN       = `${CDN}/games/vids/attack%20punch%20win%20overwhelming.mp4`;
const VID_PUNCH_STALEMATE = `${CDN}/games/vids/attack%20punch%20stale%20mate.mp4`;
const VID_PUNCH           = `${CDN}/games/vids/punch%20video.mp4`;
const VID_BLOCK_STALEMATE = `${CDN}/games/vids/attack-block-stalemate.mp4`;
const VID_BLOCK_LOSE      = `${CDN}/games/vids/attack-block%20lose.mp4`;

// Map outcome → sound key
function outcomeSound(outcome) {
  return ({
    stalemate:      'stalemate',
    attack_wins:    'attackWin',
    attack_lands:   'attackWin',
    undefended:     'superAttack',
    blocked:        'blocked',
    counter_chance:  'counter',
    counter_result:  'counter',
    deflect:         'defenseWin',
    both_defend:     'superDefense',
    both_timeout:    null,
    both_attack:     'attackMove',
    atk_vs_def:      'attackMove',
  })[outcome] || null;
}

// Resolve ordered list of clip URLs for a turn result (uses move names for default-move videos)
function resolveClipQueue(result) {
  const outcome = result?.outcome;
  if (!outcome) return [];
  const aName   = result.move_a_name || '';
  const bName   = result.move_b_name || '';
  const atkName = result.attacker_move_name || '';
  const defName = result.defender_move_name || '';
  const isPunch = n => n === 'Punch';
  const isBlock = n => n === 'Block';

  if (outcome === 'stalemate') {
    if (isPunch(aName) && isPunch(bName)) return [VID_PUNCH_STALEMATE];
    const q = [isPunch(aName) ? VID_PUNCH : result.trigger_a, isPunch(bName) ? VID_PUNCH : result.trigger_b].filter(Boolean);
    return q.length ? q : [];
  }
  if (outcome === 'both_attack') {
    const q = [isPunch(aName) ? VID_PUNCH : result.trigger_a, isPunch(bName) ? VID_PUNCH : result.trigger_b].filter(Boolean);
    return q.length ? q : [];
  }
  if (outcome === 'attack_wins') {
    // Both punched but one overpowered the other — VID_PUNCH_WIN already shows
    // two fighters clashing with one overwhelming, so skip the pre-clip entirely.
    if (isPunch(aName) && isPunch(bName)) return [VID_PUNCH_WIN];
    const loserIsB = result.loser === result.player_b;
    if (loserIsB) {
      // B lost: show B's losing clip first, then A's winning blow
      const loserClip  = isPunch(bName) ? VID_PUNCH     : result.trigger_b;
      const winnerClip = isPunch(aName) ? VID_PUNCH_WIN : result.trigger_a;
      return [loserClip, winnerClip].filter(Boolean);
    } else {
      // A lost: show A's losing clip first, then B's winning blow
      const loserClip  = isPunch(aName) ? VID_PUNCH     : result.trigger_a;
      const winnerClip = isPunch(bName) ? VID_PUNCH_WIN : result.trigger_b;
      return [loserClip, winnerClip].filter(Boolean);
    }
  }
  if (outcome === 'attack_lands') {
    // VID_PUNCH_WIN already shows both fighters so no extra defense clip needed
    if (isPunch(atkName)) return [VID_PUNCH_WIN];
    const defClip = isBlock(defName) ? VID_BLOCK_LOSE : result.def_trigger_url;
    return [result.trigger_url, defClip].filter(Boolean);
  }
  if (outcome === 'undefended') {
    if (isPunch(atkName)) return [VID_PUNCH];
    return result.trigger_url ? [result.trigger_url] : [];
  }
  if (outcome === 'blocked') {
    // Attack clip first, then the defense block clip
    const atkClip = isPunch(atkName) ? VID_PUNCH : result.trigger_url;
    const defClip = isBlock(defName) ? VID_BLOCK_LOSE : result.def_trigger_url;
    return [atkClip, defClip].filter(Boolean);
  }
  if (outcome === 'counter_chance') {
    // Attack clip first, then the block-stalemate clip (defense got a counter window)
    const atkClip = isPunch(atkName) ? VID_PUNCH : result.trigger_url;
    const defClip = isBlock(defName) ? VID_BLOCK_STALEMATE : result.def_trigger_url;
    return [atkClip, defClip].filter(Boolean);
  }
  if (outcome === 'counter_result') return result.trigger_url ? [result.trigger_url] : [];
  if (outcome === 'deflect') {
    // Attack clip first, then defense deflect clip (defense barely held)
    const atkClip = isPunch(atkName) ? VID_PUNCH : result.trigger_url;
    const defClip = isBlock(defName) ? VID_BLOCK_STALEMATE : result.def_trigger_url;
    return [atkClip, defClip].filter(Boolean);
  }
  if (outcome === 'both_defend') {
    // Play each player's defense clip before showing "BOTH DEFEND" result
    const aClip = isBlock(aName) ? VID_BLOCK_STALEMATE : result.trigger_a;
    const bClip = isBlock(bName) ? VID_BLOCK_STALEMATE : result.trigger_b;
    return [aClip, bClip].filter(Boolean);
  }
  return [];
}

const genId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

// Returns the index of the first non-default move, or 0 if all are defaults / list is empty
const firstNonDefaultIdx = (movesList = []) => {
  const idx = movesList.findIndex(m => !m.is_default);
  return idx >= 0 ? idx : 0;
};

const emptyMove = () => ({ name: '', power: 1, triggerUrl: '' });
const emptyDraft = () => ({
  id: genId(),
  name: '',
  tier: 'Regular',
  imageUrl: '',
  imagePrev: '',  // local object URL for preview
  attacks: [],
  defenses: [],
});

// ── Default Characters — pre-built roster picks ───────────────────────────────
// Budgets: Regular=300, Street=350, City-Wide=400, Continental=450, Global=500, Universal=550
// Each attack pool and defense pool is independent; sum must stay ≤ tier budget.
const DEFAULT_CHARACTERS = [
  {
    name: 'Cyclops',
    tier: 'Continental',
    imageUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Cyclops/Cyclops%20image.jfif',
    attacks: [
      { name: 'Optic Blast', power: 140, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Cyclops/Optic%20Blast.gif' },
      { name: 'Optic Rage',  power: 310, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Cyclops/Optic%20Rage.gif' },
    ],
    defenses: [
      { name: 'Optic Sweep',     power: 300, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Cyclops/Optic%20Sweep.gif' },
      { name: 'Spot Light Shot', power: 150, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Cyclops/Spot%20Light%20Shot.jfif' },
    ],
  },
  {
    name: 'Storm',
    tier: 'Global',
    imageUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Storm/Storm%20Image.jfif',
    attacks: [
      { name: 'Lightning Discharge', power: 340, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Storm/Lightning%20Discharge.gif' },
      { name: 'Tornado Blast',       power: 160, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Storm/Tornado%20Blast.gif' },
    ],
    defenses: [
      { name: 'Whirlwind Shield', power: 300, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Storm/Whirlwind%20Shield.gif' },
      { name: 'Electric Barrier', power: 200, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Storm/Electric%20Barrier.gif' },
    ],
  },
  {
    name: 'Thor',
    tier: 'Universal',
    imageUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Thor/Thor%20Image.jfif',
    attacks: [
      { name: "Mjolnir Throw",    power: 240, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Thor/Mjolnir%20Throw.gif' },
      { name: "Thunderer's Storm", power: 310, triggerUrl: "https://LetsWatchOut.b-cdn.net/games/VersusBattle/Thor/Thunderer's%20Storm.gif" },
    ],
    defenses: [
      { name: 'Lightning Armor',      power: 300, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Thor/Lightning%20Armor.gif' },
      { name: "Thunder God's Summon", power: 250, triggerUrl: "https://LetsWatchOut.b-cdn.net/games/VersusBattle/Thor/Thunder%20God's%20Summon.mp4" },
    ],
  },
  {
    name: 'Iron Man',
    tier: 'Continental',
    imageUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Iron%20Man/IRONMAN.jfif',
    attacks: [
      { name: 'Repulsor Blasts', power: 200, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Iron%20Man/Repulsor%20Blasts.gif' },
      { name: 'UniBeam',         power: 250, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Iron%20Man/UniBeam.gif' },
    ],
    defenses: [
      // Note: original Stark Combo Sweep was 450 — capped to 300 so total stays within Continental budget of 450.
      { name: 'Nanoshield Block',   power: 150, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Iron%20Man/Nanoshield%20Block.gif' },
      { name: 'Stark Combo Sweep',  power: 300, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Iron%20Man/Stark%20Combo%20Sweep.gif' },
    ],
  },
  {
    name: 'Wolverine',
    tier: 'City-Wide',
    imageUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Wolverine/WOLVERINE.png',
    attacks: [
      { name: 'Spinning Claws', power: 200, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Wolverine/Spinning%20Claws.webp' },
      { name: 'Beserker Rush',  power: 200, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Wolverine/Beserker%20Rush.webp' },
    ],
    defenses: [
      { name: 'Claw Block', power: 200, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Wolverine/Claw%20Block.gif' },
      { name: 'Feral Rage', power: 200, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Wolverine/Feral%20Rage.gif' },
    ],
  },
  {
    name: 'Captain America',
    tier: 'City-Wide',
    imageUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Captain%20America/Captain%20America%20image.jfif',
    attacks: [
      { name: 'Shield Throw', power: 200, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Captain%20America/Shield%20Throw.gif' },
      { name: 'Shield Bash',  power: 200, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Captain%20America/Shield%20Bash.gif' },
    ],
    defenses: [
      { name: 'Shield Charge', power: 300, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Captain%20America/Shield%20Charge.gif' },
      { name: 'Shield Block',  power: 100, triggerUrl: 'https://LetsWatchOut.b-cdn.net/games/VersusBattle/Captain%20America/Shield%20Block.gif' },
    ],
  },
];

// ── Tiny shared components ─────────────────────────────────────────────────────

function HPBar({ hp, maxHp }) {
  const pct = maxHp > 0 ? Math.max(0, (hp / maxHp) * 100) : 0;
  const color = pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// CSS injected once for DamageHPDisplay hearts (avoids repeated <style> blocks in each heart)
const DMG_HEART_CSS = `
@keyframes dmg-heart-rise {
  0%   { transform: translateY(0) translateX(0) scale(var(--hs,1)); opacity: 1; }
  60%  { opacity: 0.8; }
  100% { transform: translateY(-60px) translateX(var(--drift,0px)) scale(calc(var(--hs,1)*0.3)); opacity: 0; }
}
.dmg-heart {
  position: absolute;
  bottom: 0;
  animation: dmg-heart-rise var(--dur,1s) ease-out forwards;
  pointer-events: none;
  font-size: 15px;
  line-height: 1;
  user-select: none;
}
`;

// Big animated HP bar that slides from oldHp → newHp with floating hearts.
// Shown in the turn-result center panel after all clips have played.
function DamageHPDisplay({ char, oldHp, newHp, maxHp, playSound }) {
  const [targetPct, setTargetPct] = useState(() =>
    maxHp > 0 ? Math.min(100, (oldHp / maxHp) * 100) : 0
  );
  const [hearts, setHearts] = useState([]);

  useEffect(() => {
    // Trigger bar slide after a frame so the transition is visible
    const tBar = setTimeout(() => {
      setTargetPct(maxHp > 0 ? Math.max(0, (newHp / maxHp) * 100) : 0);
    }, 80);
    if (playSound) playSound('lifeDrain');

    // Spawn floating hearts proportional to damage
    const dmg = oldHp - newHp;
    const count = Math.max(3, Math.min(14, Math.ceil(dmg / 10)));
    setHearts(Array.from({ length: count }, (_, i) => ({
      id: i,
      left: 4 + Math.random() * 92,
      delay: i * 55,
      drift: (Math.random() - 0.5) * 48,
      scale: 0.65 + Math.random() * 0.7,
      dur: 0.85 + Math.random() * 0.55,
    })));

    return () => clearTimeout(tBar);
  }, []); // run once on mount (per-result render)

  const newPct = maxHp > 0 ? Math.max(0, (newHp / maxHp) * 100) : 0;
  const barColor = newPct > 50 ? '#22c55e' : newPct > 25 ? '#eab308' : '#ef4444';

  return (
    <div className="w-full mt-1 px-1 flex flex-col items-center gap-1.5">
      <style>{DMG_HEART_CSS}</style>

      {/* Character identity row */}
      <div className="flex items-center gap-1.5">
        {char.image_url
          ? <img src={char.image_url} alt={char.name} className="w-7 h-7 rounded object-cover border border-gray-600 flex-shrink-0" />
          : <div className="w-7 h-7 rounded bg-gray-700 flex items-center justify-center text-sm flex-shrink-0">🦸</div>
        }
        <span className="text-white text-sm font-bold leading-none">{char.name}</span>
        <span className="text-gray-400 text-xs tabular-nums leading-none">{newHp}/{maxHp} HP</span>
      </div>

      {/* HP bar + hearts container */}
      <div className="relative w-full" style={{ height: '22px' }}>
        {/* Track */}
        <div className="absolute inset-0 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${targetPct}%`, backgroundColor: barColor }}
          />
        </div>
        {/* Floating hearts — positioned relative to the bar */}
        {hearts.map(h => (
          <span
            key={h.id}
            className="dmg-heart"
            style={{
              left: `${h.left}%`,
              '--drift': `${h.drift}px`,
              '--hs': h.scale,
              '--dur': `${h.dur}s`,
              animationDelay: `${h.delay}ms`,
            }}
          >
            ❤️
          </span>
        ))}
      </div>
    </div>
  );
}

function CharMini({ char, dim = false, globalMaxHp, large = false, xl = false }) {
  const tier = TIERS[char.tier] || TIERS['Regular'];
  const charMaxHp = char.max_hp ?? tier.hp;
  const pct = Math.max(0, (char.hp / (globalMaxHp ?? charMaxHp)) * 100);
  const hpColor = pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-yellow-400' : 'bg-red-500';
  const sizeClass = xl
    ? 'w-36 h-36 sm:w-48 sm:h-48 md:w-56 md:h-56 lg:w-64 lg:h-64'
    : large
      ? 'w-28 h-28 sm:w-36 sm:h-36'
      : 'w-16 h-16 sm:w-20 sm:h-20';
  const koSize = xl ? '3rem' : large ? '2.2rem' : '1.5rem';
  return (
    <div className={`relative flex flex-col items-center ${dim || char.defeated ? 'opacity-40 grayscale' : ''}`}>
      <div className={`relative ${sizeClass} rounded-xl overflow-hidden border border-gray-600 bg-gray-800 flex-shrink-0`}>
        {char.image_url
          ? <img src={char.image_url} alt={char.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-2xl">🦸</div>
        }
        {char.defeated && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <span className="text-white font-black" style={{ fontFamily: 'Bangers, cursive', fontSize: koSize, letterSpacing: '0.12em' }}>KO</span>
          </div>
        )}
      </div>
      <div className={`w-full flex items-baseline justify-between gap-1 mt-0.5 ${xl || large ? 'mt-1' : 'mt-0.5'}`}>
        <span className={`${xl ? 'text-base' : large ? 'text-sm' : 'text-[10px]'} text-white font-medium leading-tight truncate`}>{char.name}</span>
        <span className={`${xl ? 'text-sm' : large ? 'text-xs' : 'text-[9px]'} text-gray-400 leading-none tabular-nums flex-shrink-0`}>{char.hp}/{char.max_hp ?? tier.hp}</span>
      </div>
      <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mt-0.5">
        <div className={`h-full ${hpColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function OutcomeLabel({ outcome, turnResult, attackerChar, defenderChar }) {
  if (!outcome || !OUTCOME_MAP[outcome]) return null;
  const cfg = OUTCOME_MAP[outcome];

  // For defender-embedded outcomes (blocked/deflect), pass defender name into the label fn
  const defName = cfg.defName === 'defender' && defenderChar ? defenderChar.name : null;
  const baseText = cfg.label(turnResult || {}, defName);

  // For attacker-prefix outcomes, show char name as a golden prefix before the label
  const charPrefix = cfg.charPrefix === 'attacker' && attackerChar
    ? attackerChar.name.toUpperCase()
    : null;

  return (
    <div className="text-center px-2">
      <div
        style={{
          fontFamily: 'Bangers, cursive',
          letterSpacing: '0.08em',
          lineHeight: 1.15,
        }}
      >
        {charPrefix && (
          <span
            style={{
              fontSize: '1.15rem',
              color: '#facc15',
              WebkitTextStroke: '1px #000',
              textShadow: '1px 1px 0 #000',
              marginRight: '0.3em',
            }}
          >
            {charPrefix}
          </span>
        )}
        <span
          style={{
            fontSize: '1.5rem',
            color: cfg.color,
            WebkitTextStroke: '1.5px #000',
            textShadow: `2px 2px 0 #000, 0 0 12px ${cfg.color}`,
          }}
        >
          {baseText}
        </span>
      </div>
    </div>
  );
}

// Small portrait chip used inside CombatLabel
function CharChip({ char, highlight }) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${highlight ? 'bg-red-900/50 ring-1 ring-red-500' : 'bg-gray-800/70'}`}>
      {char.image_url
        ? <img src={char.image_url} alt={char.name} className="w-8 h-8 rounded object-cover flex-shrink-0" />
        : <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center text-base flex-shrink-0">🦸</div>
      }
      <div className="flex flex-col min-w-0">
        <span className="text-white text-xs font-bold leading-tight truncate max-w-[80px]">{char.name}</span>
        <span className={`text-[10px] leading-none ${TIER_COLORS[char.tier]?.split(' ')[0] || 'text-gray-400'}`}>{char.tier}</span>
      </div>
    </div>
  );
}

// Shows "AttackerChar ⚔ DefenderChar" or "CharA vs CharB" depending on outcome.
// attackerChar / defenderChar may be null if only one side is known.
function CombatLabel({ attackerChar, defenderChar, outcome }) {
  if (!attackerChar && !defenderChar) return null;

  // Stalemate / both defend: show "A vs B" with no highlight
  const isMutual = ['stalemate', 'both_attack', 'both_defend', 'both_timeout'].includes(outcome);

  if (isMutual && attackerChar && defenderChar) {
    return (
      <div className="flex items-center gap-2 justify-center flex-wrap">
        <CharChip char={attackerChar} />
        <span className="text-gray-400 font-bold text-sm">VS</span>
        <CharChip char={defenderChar} />
      </div>
    );
  }

  if (attackerChar && defenderChar) {
    return (
      <div className="flex items-center gap-2 justify-center flex-wrap">
        <CharChip char={attackerChar} />
        <span className="text-yellow-400 text-lg">⚔</span>
        <CharChip char={defenderChar} highlight />
      </div>
    );
  }

  // Only one char known (e.g. stalemate with only a damaged char)
  const char = attackerChar || defenderChar;
  return (
    <div className="flex justify-center">
      <CharChip char={char} highlight={!!defenderChar} />
    </div>
  );
}

// ── Building Phase — 4-step wizard ───────────────────────────────────────────

const BUILD_STEPS = [
  { label: 'Design',     title: 'Character Design', icon: '🎨' },
  { label: 'Power Tier', title: 'Power Tier',       icon: '⭐' },
  { label: 'Attacks',    title: 'Moves: Attacks',   icon: '⚔' },
  { label: 'Defence',    title: 'Moves: Defence',   icon: '🛡' },
];

// Single move card used inside MoveEditor
// ── Audio hook ────────────────────────────────────────────────────────────────

function useVsBattleAudio() {
  const audios = useRef({});
  // Lazy: create each Audio object on first play rather than upfront on mount.
  // This means new entries added to SOUND_FILES work immediately without a
  // page refresh, and HMR updates are picked up transparently.
  return useCallback((key) => {
    if (!key) return;
    const src = SOUND_FILES[key];
    if (!src) return;
    if (!audios.current[key]) {
      audios.current[key] = new Audio(src);
    }
    const a = audios.current[key];
    a.currentTime = 0;
    a.play().catch(() => {});
  }, []);
}

// ── Default move display pill ─────────────────────────────────────────────────

function DefaultMovePill({ name, power, isAttack }) {
  const accent = isAttack ? 'border-red-800/60 text-red-300 bg-red-950/30' : 'border-blue-800/60 text-blue-300 bg-blue-950/30';
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-xl border ${accent} text-xs`}>
      <div className="flex items-center gap-2">
        <span className="text-base">{isAttack ? '👊' : '🛡'}</span>
        <span className="font-bold tracking-wide">{name}</span>
        <span className="text-gray-500 text-[10px]">DEFAULT · free</span>
      </div>
      <span className={`font-mono font-bold ${isAttack ? 'text-red-400' : 'text-blue-400'}`}>{power} PWR</span>
    </div>
  );
}

function MoveCard({ move, index, remaining, isAttack, onUpdate, onDelete }) {
  const maxPow = remaining + (move.power || 0);
  const accentClass = isAttack ? 'accent-red-500' : 'accent-blue-500';
  const ringClass = isAttack ? 'focus:ring-red-500' : 'focus:ring-blue-500';
  const powerColor = isAttack ? 'text-red-300' : 'text-blue-300';
  const borderColor = isAttack ? 'border-red-900/40' : 'border-blue-900/40';
  const accentText = isAttack ? 'text-red-400' : 'text-blue-400';
  const typeLabel = isAttack ? 'Attack' : 'Defence';
  const hasMedia = !!(move.triggerUrl || move._triggerFile);

  return (
    <div className={`bg-gray-800 rounded-xl p-3 border ${borderColor} space-y-3`}>

      {/* Card header: move number + delete */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold ${accentText} uppercase tracking-wider`}>
          {typeLabel} {index + 1}
        </span>
        <button
          onClick={() => onDelete(index)}
          className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-red-400 rounded-lg hover:bg-gray-700 transition-colors text-lg leading-none !min-h-0 !min-w-0"
        >
          ×
        </button>
      </div>

      {/* Row 1: Move name */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 font-semibold whitespace-nowrap flex-shrink-0 w-[5.5rem]">
          {typeLabel} Move
        </span>
        <input
          className={`flex-1 bg-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 ${ringClass} min-w-0`}
          placeholder="Move name…"
          value={move.name}
          onChange={e => onUpdate(index, { ...move, name: e.target.value })}
          maxLength={40}
        />
      </div>

      {/* Row 2: Power slider */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 font-semibold flex-shrink-0 w-[5.5rem]">
          {typeLabel} Power
        </span>
        <input
          type="range" min={1} max={Math.max(1, maxPow)} value={move.power || 1}
          onChange={e => onUpdate(index, { ...move, power: Math.max(1, Math.min(maxPow, Number(e.target.value))) })}
          className={`flex-1 h-2 ${accentClass}`}
          style={{ accentColor: isAttack ? '#ef4444' : '#3b82f6' }}
        />
        <span className={`text-sm font-mono font-bold w-9 text-right flex-shrink-0 ${powerColor}`}>
          {move.power || 1}
        </span>
      </div>

      {/* Row 3: Animation — always visible */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 font-semibold flex-shrink-0 w-[5.5rem]">
          Animation
        </span>
        <label className="flex items-center justify-center gap-1 cursor-pointer bg-gray-700 hover:bg-gray-600 border border-gray-600 text-xs text-gray-300 px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0 !min-h-0">
          📁 Upload
          <input
            type="file" accept="video/*,image/*,image/gif" className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) onUpdate(index, { ...move, triggerUrl: URL.createObjectURL(f), _triggerFile: f });
              e.target.value = '';
            }}
          />
        </label>
        <input
          className="flex-1 bg-gray-700 text-white text-xs rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-purple-500 placeholder:text-gray-500 min-w-0"
          placeholder="🔗 URL"
          value={move._triggerFile ? '' : (move.triggerUrl || '')}
          onChange={e => onUpdate(index, { ...move, triggerUrl: e.target.value, _triggerFile: null })}
        />
        {hasMedia && (
          <button
            onClick={() => onUpdate(index, { ...move, triggerUrl: '', _triggerFile: null })}
            className="text-gray-600 hover:text-red-400 transition-colors text-lg leading-none !min-h-0 !min-w-0 flex-shrink-0"
          >
            ×
          </button>
        )}
      </div>

      {/* Animation preview — shown when media is set */}
      {hasMedia && move.triggerUrl && (
        <div className="rounded-lg overflow-hidden bg-gray-900 max-h-20 flex items-center justify-center">
          {/\.(mp4|webm|mov)(\?|$)/i.test(move.triggerUrl) ? (
            <video src={move.triggerUrl} className="max-h-20 max-w-full object-contain" muted loop autoPlay playsInline />
          ) : (
            <img src={move.triggerUrl} alt="move animation" className="max-h-20 max-w-full object-contain" />
          )}
        </div>
      )}

    </div>
  );
}

function MoveEditor({ moves, remaining, isAttack, onAdd, onUpdate, onDelete, defaultMoveName, defaultMovePower }) {
  const label = isAttack ? 'Attack' : 'Defence';
  const addClass = isAttack
    ? 'border-red-800 text-red-500 hover:bg-red-900/20'
    : 'border-blue-800 text-blue-500 hover:bg-blue-900/20';

  return (
    <div className="space-y-2">
      {/* Always-present default move — shown read-only, outside the budget */}
      {defaultMoveName && (
        <DefaultMovePill name={defaultMoveName} power={defaultMovePower || 0} isAttack={isAttack} />
      )}
      {moves.map((m, i) => (
        <MoveCard
          key={i} move={m} index={i}
          remaining={remaining} isAttack={isAttack}
          onUpdate={onUpdate} onDelete={onDelete}
        />
      ))}
      {moves.length === 0 && (
        <p className="text-center text-xs text-gray-600 italic py-2">
          Optional — add a custom {label.toLowerCase()}
        </p>
      )}
      {moves.length < 5 && (
        <button
          onClick={onAdd}
          className={`w-full py-3 rounded-xl border border-dashed text-sm font-medium transition-colors flex items-center justify-center gap-2 ${addClass}`}
        >
          <span className="text-lg leading-none">＋</span> Add {label}
        </button>
      )}
    </div>
  );
}

// Compact roster avatar — replaces the tall RosterCharCard for mobile fit
function RosterMiniAvatar({ char }) {
  return (
    <div className="flex-shrink-0 flex flex-col items-center gap-1 w-20">
      <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-purple-600 bg-gray-800 flex items-center justify-center">
        {char.image_url
          ? <img src={char.image_url} alt={char.name} className="w-full h-full object-cover" />
          : <span className="text-2xl">🦸</span>
        }
      </div>
      <span className="text-[10px] text-gray-400 text-center leading-tight truncate w-full">{char.name}</span>
    </div>
  );
}

// Inline SVG silhouettes — one per tier, increasing visual complexity.
// compact=true renders the larger-card row sizes.
function TierSilhouette({ tier, compact = false }) {
  const colors = {
    'Regular':     'text-gray-400',
    'Street':      'text-green-400',
    'City-Wide':   'text-blue-400',
    'Continental': 'text-purple-400',
    'Global':      'text-yellow-400',
    'Universal':   'text-red-400',
  };
  const cls = `mx-auto ${colors[tier] || 'text-gray-400'}`;
  // compact sizes tuned for the ~100px-wide card with a 72px silhouette zone
  const s = compact
    ? { Regular: [52,62], Street: [56,62], CityWide: [60,66], Continental: [64,64], Global: [68,68], Universal: [76,72] }
    : { Regular: [72,86], Street: [80,87], CityWide: [84,91], Continental: [90,90], Global: [96,96], Universal: [110,103] };

  if (tier === 'Regular') return (
    <svg viewBox="0 0 100 120" fill="currentColor" className={cls} width={s.Regular[0]} height={s.Regular[1]}>
      <ellipse cx="50" cy="17" rx="13" ry="14" />
      <path d="M37 31 L33 70 L67 70 L63 31 Q56 38 50 38 Q44 38 37 31Z" />
      <path d="M35 36 L20 62 L26 65 L40 46Z" />
      <path d="M65 36 L80 62 L74 65 L60 46Z" />
      <path d="M37 70 L30 112 L44 112 L50 89 L56 112 L70 112 L63 70Z" />
    </svg>
  );
  if (tier === 'Street') return (
    <svg viewBox="0 0 110 120" fill="currentColor" className={cls} width={s.Street[0]} height={s.Street[1]}>
      <ellipse cx="52" cy="16" rx="13" ry="13" />
      <path d="M39 29 L35 68 L69 68 L65 29 Q58 37 52 37 Q46 37 39 29Z" />
      <path d="M40 33 L18 17 L15 24 L37 44Z" />
      <path d="M64 33 L89 20 L87 13 L62 31Z" />
      <path d="M37 68 L26 112 L42 112 L52 86 L62 112 L78 112 L69 68Z" />
    </svg>
  );
  if (tier === 'City-Wide') return (
    <svg viewBox="0 0 120 130" fill="currentColor" className={cls} width={s.CityWide[0]} height={s.CityWide[1]}>
      <path d="M40 28 L20 100 L44 82 L60 102 L76 82 L100 100 L80 28Z" opacity="0.5" />
      <ellipse cx="60" cy="17" rx="14" ry="14" />
      <path d="M44 31 L39 70 L81 70 L76 31 Q68 40 60 40 Q52 40 44 31Z" />
      <path d="M42 36 L16 46 L17 54 L43 48Z" />
      <path d="M78 36 L104 46 L103 54 L77 48Z" />
      <path d="M42 70 L33 115 L50 115 L60 90 L70 115 L87 115 L78 70Z" />
    </svg>
  );
  if (tier === 'Continental') return (
    <svg viewBox="0 0 130 130" fill="currentColor" className={cls} width={s.Continental[0]} height={s.Continental[1]}>
      <path d="M43 2 Q65 -2 87 2 L90 22 Q80 30 65 32 Q50 30 40 22Z" />
      <ellipse cx="36" cy="38" rx="16" ry="8" />
      <ellipse cx="94" cy="38" rx="16" ry="8" />
      <path d="M38 34 L30 72 L100 72 L92 34 Q80 44 65 44 Q50 44 38 34Z" />
      <path d="M32 40 L12 68 L20 73 L38 54Z" />
      <path d="M98 40 L118 68 L110 73 L92 54Z" />
      <rect x="112" y="28" width="8" height="62" rx="4" />
      <path d="M108 28 L120 28 L116 14 L112 14Z" />
      <path d="M36 72 L26 118 L50 118 L65 92 L80 118 L104 118 L94 72Z" />
    </svg>
  );
  if (tier === 'Global') return (
    <svg viewBox="0 0 140 140" fill="currentColor" className={cls} width={s.Global[0]} height={s.Global[1]}>
      <path d="M70 5 L74 28 L90 12 L80 32 L100 26 L85 42 L108 40 L90 52 L110 58 L90 62 L106 74 L87 72 L96 90 L78 82 L82 102 L70 90 L58 102 L62 82 L44 90 L53 72 L34 74 L50 62 L30 58 L50 52 L32 40 L55 42 L60 26 L70 38Z" opacity="0.4" />
      <ellipse cx="70" cy="26" rx="15" ry="16" />
      <path d="M52 42 L45 82 L95 82 L88 42 Q80 52 70 52 Q60 52 52 42Z" />
      <path d="M50 46 L26 28 L22 36 L46 58Z" />
      <path d="M90 46 L114 28 L118 36 L94 58Z" />
      <path d="M49 82 L38 125 L58 125 L70 100 L82 125 L102 125 L91 82Z" />
    </svg>
  );
  // Universal
  return (
    <svg viewBox="0 0 160 150" fill="currentColor" className={cls} width={s.Universal[0]} height={s.Universal[1]}>
      <ellipse cx="80" cy="100" rx="75" ry="22" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.35" />
      <ellipse cx="80" cy="100" rx="55" ry="14" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.45" transform="rotate(-25 80 100)" />
      <circle cx="80" cy="70" r="55" opacity="0.08" />
      <ellipse cx="26" cy="48" rx="22" ry="11" />
      <ellipse cx="134" cy="48" rx="22" ry="11" />
      <ellipse cx="80" cy="22" rx="18" ry="20" />
      <path d="M38 40 L28 80 L132 80 L122 40 Q104 54 80 54 Q56 54 38 40Z" />
      <path d="M30 48 L6 72 L16 80 L38 62Z" />
      <path d="M130 48 L154 72 L144 80 L122 62Z" />
      <path d="M34 80 L22 128 L54 128 L80 98 L106 128 L138 128 L126 80Z" />
    </svg>
  );
}

// Multi-card tier selector: scrollable row (~3-4 visible on portrait phone),
// overlay nav arrows track scroll state, selected card's silhouette animates.
function TierCarousel({ selected, onChange }) {
  const scrollRef = useRef(null);
  const [canLeft,  setCanLeft]  = useState(false);
  const [canRight, setCanRight] = useState(true);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 6);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 6);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkScroll); ro.disconnect(); };
  }, [checkScroll]);

  // Scroll the selected card into view whenever it changes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.querySelector(`[data-tier="${selected}"]`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selected]);

  const nudge = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 120, behavior: 'smooth' });
  };

  return (
    <div className="space-y-3 select-none">
      {/* Keyframe for the selected silhouette — float + colour glow */}
      <style>{`
        @keyframes tierFloat {
          0%,100% { transform: translateY(0px);   filter: drop-shadow(0 0 3px currentColor); }
          50%      { transform: translateY(-7px);  filter: drop-shadow(0 0 10px currentColor); }
        }
        .tier-float { animation: tierFloat 2s ease-in-out infinite; }
      `}</style>

      {/* Scroll row + overlay nav arrows */}
      <div className="relative">

        {/* ── Left arrow ── full-height overlay, gradient-blended so it never clips a card */}
        <button
          onClick={() => nudge(-1)}
          aria-label="Scroll left"
          className={`
            absolute left-0 top-0 bottom-0 z-10
            flex items-center justify-center
            w-8 sm:w-10
            bg-gradient-to-r from-gray-950 via-gray-950/70 to-transparent
            text-gray-300 hover:text-white
            transition-all duration-200 !min-h-0 !min-w-0
            ${canLeft ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
          `}
        >
          {/* Chevron sized relative to container — larger on wider screens */}
          <span className="text-xl sm:text-2xl leading-none font-light select-none">‹</span>
        </button>

        {/* Scrollable card strip */}
        <div
          ref={scrollRef}
          className="flex gap-2.5 overflow-x-auto py-1 px-1"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {TIER_ORDER.map((tier) => {
            const isSelected = tier === selected;
            const [textColor, borderColor] = (TIER_COLORS[tier] || 'text-gray-300 border-gray-500').split(' ');
            return (
              <button
                key={tier}
                data-tier={tier}
                onClick={() => onChange(tier)}
                className={`
                  flex-shrink-0 flex flex-col items-center gap-1.5
                  w-[27vw] max-w-[108px] min-w-[84px]
                  px-1.5 pt-3 pb-2.5 rounded-2xl border-2
                  transition-all duration-200 !min-h-0 !min-w-0
                  ${isSelected
                    ? `${borderColor} bg-gray-800 shadow-xl shadow-black/50 scale-[1.04]`
                    : 'border-gray-800 bg-gray-900/50 opacity-50 hover:opacity-80 hover:border-gray-700 hover:scale-[1.02]'}
                `}
              >
                {/* Silhouette zone — 72px tall; selected version floats */}
                <div className={`h-[72px] flex items-center justify-center ${textColor} ${isSelected ? 'tier-float' : ''}`}>
                  <TierSilhouette tier={tier} compact />
                </div>

                <span
                  className={`text-xs sm:text-sm font-black leading-tight text-center ${textColor}`}
                  style={{ fontFamily: 'Bangers, cursive', letterSpacing: '0.05em' }}
                >
                  {tier}
                </span>

                <span className="text-[10px] text-gray-600 leading-none">
                  {TIERS[tier].budget} pts
                </span>

                {/* Active indicator pip */}
                <div className={`mt-0.5 h-0.5 rounded-full transition-all duration-200 ${isSelected ? 'w-5 bg-purple-500' : 'w-0 bg-transparent'}`} />
              </button>
            );
          })}
        </div>

        {/* ── Right arrow ── mirrors left arrow exactly */}
        <button
          onClick={() => nudge(1)}
          aria-label="Scroll right"
          className={`
            absolute right-0 top-0 bottom-0 z-10
            flex items-center justify-center
            w-8 sm:w-10
            bg-gradient-to-l from-gray-950 via-gray-950/70 to-transparent
            text-gray-300 hover:text-white
            transition-all duration-200 !min-h-0 !min-w-0
            ${canRight ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
          `}
        >
          <span className="text-xl sm:text-2xl leading-none font-light select-none">›</span>
        </button>

      </div>

      {/* Detail panel — expands below the row for the selected tier */}
      {selected && (() => {
        const [textColor, borderColor] = (TIER_COLORS[selected] || 'text-gray-300 border-gray-500').split(' ');
        const td   = TIERS[selected];
        const info = TIER_INFO[selected] || {};
        return (
          <div className={`rounded-xl border ${borderColor} bg-gray-900 px-4 py-3 space-y-2`}>
            <div className="flex items-center gap-4 flex-wrap">
              <span
                className={`font-black text-lg leading-none ${textColor}`}
                style={{ fontFamily: 'Bangers, cursive', letterSpacing: '0.08em' }}
              >
                {selected.toUpperCase()}
              </span>
              <div className="flex gap-3 text-xs flex-wrap">
                <span className="text-gray-400">⚔ <span className="text-red-300 font-semibold">{td.budget}</span> ATK</span>
                <span className="text-gray-400">🛡 <span className="text-blue-300 font-semibold">{td.budget}</span> DEF</span>
                <span className="text-gray-400">❤️ <span className="text-white font-semibold">{td.hp}</span> HP</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">{info.desc}</p>
            <p className="text-[11px] text-gray-600 italic">eg. {info.examples}</p>
          </div>
        );
      })()}
    </div>
  );
}

function BuildingPhase({ myRoster, draft, setDraft, onSubmitChar, onReady, isReady, onLoadSaved, savedRosterKey }) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showDefaults, setShowDefaults] = useState(false);

  const [savedRoster, setSavedRoster] = useState(() => {
    try { return JSON.parse(localStorage.getItem(savedRosterKey) || '[]'); } catch { return []; }
  });
  // Refresh saved roster when key changes (different user)
  useEffect(() => {
    try { setSavedRoster(JSON.parse(localStorage.getItem(savedRosterKey) || '[]')); } catch { setSavedRoster([]); }
  }, [savedRosterKey]);

  const canLoadSaved = savedRoster.length > 0 && myRoster.length === 0;
  const canSave = myRoster.length > 0;

  const handleSaveLoadout = () => {
    try {
      const toSave = myRoster.map(c => ({
        name: c.name, tier: c.tier, image_url: c.image_url || '',
        attacks: c.attacks || [], defenses: c.defenses || [],
      }));
      localStorage.setItem(savedRosterKey, JSON.stringify(toSave));
      setSavedRoster(toSave);
    } catch {}
  };

  const tier = TIERS[draft.tier] || TIERS['Regular'];
  // Attack and defence budgets are independent — each pool gets the full tier budget.
  const usedAtkBudget = draft.attacks.reduce((s, m) => s + (m.power || 0), 0);
  const usedDefBudget = draft.defenses.reduce((s, m) => s + (m.power || 0), 0);
  const atkRemaining = tier.budget - usedAtkBudget;
  const defRemaining = tier.budget - usedDefBudget;
  const isOverBudget = atkRemaining < 0 || defRemaining < 0;
  const rosterFull = myRoster.length >= 3;

  // Punch & Block are always provided by the server — user can have 0 custom moves
  const stepValid = [
    draft.name.trim().length > 0,
    true,
    draft.attacks.every(m => m.name.trim()),          // 0 custom attacks is fine
    !isOverBudget && [...draft.attacks, ...draft.defenses].every(m => m.name.trim()),
  ];
  const isLastStep = step === 3;

  const handleAddAttack  = () => { if (draft.attacks.length  < 5) setDraft(d => ({ ...d, attacks:  [...d.attacks,  emptyMove()] })); };
  const handleAddDefense = () => { if (draft.defenses.length < 5) setDraft(d => ({ ...d, defenses: [...d.defenses, emptyMove()] })); };

  const handleSubmit = async () => {
    if (!stepValid[3] || submitting) return;
    setSubmitting(true);
    await onSubmitChar(draft);
    setStep(0);
    setSubmitting(false);
  };

  const handleImageFile = (file) => {
    if (!file) return;
    setDraft(d => ({ ...d, imagePrev: URL.createObjectURL(file), _imageFile: file }));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-950">

      {/* ── Compact roster strip ── */}
      <div className="flex-shrink-0 bg-gray-900 border-b border-gray-800 py-4">
        <div className="flex items-center justify-between px-4 pb-1">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Roster {myRoster.length}/3
          </span>
          <div className="flex items-center gap-2">
            {!rosterFull && (
              <button
                onClick={() => setShowDefaults(v => !v)}
                className={`text-xs px-2 py-1 rounded-full font-semibold transition-all !min-h-0 !min-w-0 ${showDefaults ? 'bg-purple-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
                title="Pick a pre-built character"
              >
                🎭 Defaults
              </button>
            )}
            {canLoadSaved && (
              <button
                onClick={onLoadSaved}
                className="text-xs px-2 py-1 rounded-full font-semibold transition-all !min-h-0 !min-w-0 bg-yellow-600 hover:bg-yellow-500 text-white"
                title={`Load: ${savedRoster.map(c => c.name).join(', ')}`}
              >
                ⚡ Load
              </button>
            )}
            {myRoster.length > 0 && (
              <button
                onClick={onReady}
                disabled={isReady}
                className={`text-xs px-3 py-1 rounded-full font-semibold transition-all !min-h-0 !min-w-0 ${
                  isReady
                    ? 'bg-green-900/50 text-green-400 border border-green-700'
                    : 'bg-purple-600 hover:bg-purple-500 text-white'
                }`}
              >
                {isReady ? '✓ Ready' : "I'm Ready →"}
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-3 px-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {myRoster.map(char => (
            <RosterMiniAvatar key={char.id} char={char} />
          ))}
          {!rosterFull && Array.from({ length: 3 - myRoster.length }).map((_, i) => (
            <div
              key={i}
              className="flex-shrink-0 w-16 h-16 rounded-full border-2 border-dashed border-gray-800 flex items-center justify-center text-gray-700 text-[10px]"
            >
              {i === 0 ? '…' : ''}
            </div>
          ))}
        </div>
      </div>

      {/* ── Default characters picker ── */}
      {showDefaults && !rosterFull && (
        <div className="flex-shrink-0 bg-gray-900/95 border-b border-purple-800 px-3 py-3">
          <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-2">Pick a pre-built fighter</p>
          <div className="grid grid-cols-2 gap-2">
            {DEFAULT_CHARACTERS.map((dc, i) => {
              const tc = TIER_COLORS[dc.tier] || 'text-gray-300 border-gray-500';
              const alreadyIn = myRoster.some(c => c.name === dc.name);
              return (
                <button
                  key={i}
                  disabled={alreadyIn || submitting}
                  onClick={async () => {
                    if (alreadyIn) return;
                    setSubmitting(true);
                    await onSubmitChar({ ...emptyDraft(), ...dc });
                    setSubmitting(false);
                    if (myRoster.length + 1 >= 3) setShowDefaults(false);
                  }}
                  className={`text-left p-2 rounded-xl border transition-all !min-h-0 !min-w-0 ${
                    alreadyIn
                      ? 'opacity-40 cursor-not-allowed border-gray-700 bg-gray-800'
                      : 'border-gray-700 bg-gray-800 hover:border-purple-500 hover:bg-gray-750 active:scale-95'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-white font-bold text-xs">{dc.name}</span>
                    <span className={`text-[9px] font-semibold border rounded px-1 ${tc}`}>{dc.tier}</span>
                  </div>
                  <div className="text-[9px] text-gray-400 leading-tight">
                    ⚔ {dc.attacks.map(a => a.name).join(' · ')}
                  </div>
                  <div className="text-[9px] text-gray-400 leading-tight">
                    🛡 {dc.defenses.map(d => d.name).join(' · ')}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {rosterFull ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="text-5xl">✅</div>
          <div className="text-white font-bold text-lg">Roster complete!</div>
          <p className="text-gray-400 text-sm max-w-xs">
            All 3 characters built. Hit "I'm Ready" above whenever you're set.
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Step indicator */}
          <div className="flex-shrink-0 flex items-center px-4 py-2.5 border-b border-gray-800 gap-1">
            {BUILD_STEPS.map((s, i) => (
              <React.Fragment key={i}>
                <button
                  onClick={() => i < step && setStep(i)}
                  className={`flex flex-col items-center gap-0.5 !min-h-0 !min-w-0 transition-opacity ${i <= step ? 'opacity-100' : 'opacity-35'} ${i < step ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm border-2 transition-all ${
                    i === step ? 'border-purple-500 bg-purple-900/50 text-purple-300'
                    : i < step  ? 'border-green-600 bg-green-900/40 text-green-400'
                    : 'border-gray-700 bg-gray-900 text-gray-600'
                  }`}>
                    {i < step ? '✓' : s.icon}
                  </div>
                  <span className={`text-[8px] font-medium leading-tight ${
                    i === step ? 'text-purple-400' : i < step ? 'text-green-500' : 'text-gray-600'
                  }`}>
                    {s.label}
                  </span>
                </button>
                {i < 3 && (
                  <div
                    className="flex-1 mx-0.5 rounded-full transition-colors"
                    style={{ height: 2, background: i < step ? '#16a34a' : '#1f2937' }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Budget bars — attack pool on step 2, defence pool on step 3 */}
          {step === 2 && (
            <div className="flex-shrink-0 px-4 py-1.5 bg-gray-900/80 border-b border-gray-800">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">⚔ {draft.tier} · Attack · {usedAtkBudget}/{tier.budget} pts</span>
                <span className={atkRemaining < 0 ? 'text-red-400 font-semibold' : 'text-gray-500'}>
                  {atkRemaining < 0 ? `⚠ ${-atkRemaining} over` : `${atkRemaining} left`}
                </span>
              </div>
              <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${atkRemaining < 0 ? 'bg-red-500' : 'bg-red-400'}`}
                  style={{ width: `${Math.min(100, (usedAtkBudget / tier.budget) * 100)}%` }}
                />
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="flex-shrink-0 px-4 py-1.5 bg-gray-900/80 border-b border-gray-800">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">🛡 {draft.tier} · Defence · {usedDefBudget}/{tier.budget} pts</span>
                <span className={defRemaining < 0 ? 'text-red-400 font-semibold' : 'text-gray-500'}>
                  {defRemaining < 0 ? `⚠ ${-defRemaining} over` : `${defRemaining} left`}
                </span>
              </div>
              <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${defRemaining < 0 ? 'bg-red-500' : 'bg-blue-400'}`}
                  style={{ width: `${Math.min(100, (usedDefBudget / tier.budget) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Step content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Gradient step header banner */}
            <div className="flex-shrink-0 bg-gradient-to-r from-purple-700 to-blue-700 px-4 py-4">
              <div className="text-white font-black text-xl tracking-wide">{BUILD_STEPS[step].title}</div>
              {step === 0 && <div className="text-purple-200 text-xs mt-0.5">Give your fighter #{myRoster.length + 1} a face and a name</div>}
              {step === 1 && <div className="text-purple-200 text-xs mt-0.5">Swipe or tap to pick your power level</div>}
              {step === 2 && <div className="text-purple-200 text-xs mt-0.5">At least one attack required · {tier.budget} ATK pts to spend</div>}
              {step === 3 && <div className="text-purple-200 text-xs mt-0.5">Optional but recommended · {tier.budget} DEF pts to spend</div>}
            </div>

            {/* Step 0 — fills remaining height, no scroll */}
            {step === 0 && (
              <div className="flex-1 flex flex-col overflow-hidden px-4 pt-3 pb-2 gap-3">

                {/* Name: label + input on one line */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <label className="text-xs text-gray-400 font-semibold flex-shrink-0 w-12">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="flex-1 bg-gray-800 border border-gray-700 focus:border-purple-500 text-white text-sm rounded-xl px-3 py-2 outline-none transition-colors min-w-0"
                    placeholder="Character name…"
                    value={draft.name}
                    onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                    maxLength={50}
                  />
                </div>

                {/* Image: label + compact Upload + URL on one line */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-gray-400 font-semibold flex-shrink-0 w-12">Image</span>
                  <label className="flex items-center justify-center gap-1 cursor-pointer bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-gray-300 px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0">
                    📁 Upload
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleImageFile(e.target.files?.[0])} />
                  </label>
                  <input
                    className="flex-1 bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-purple-500 placeholder:text-gray-500 min-w-0"
                    placeholder="🔗 URL"
                    value={draft._imageFile ? '' : (draft.imageUrl || '')}
                    onChange={e => setDraft(d => ({ ...d, imageUrl: e.target.value, imagePrev: '', _imageFile: null }))}
                  />
                </div>

                {/* Image card — fills all remaining vertical space */}
                <div className="flex-1 min-h-0 rounded-xl bg-gray-800 border-2 border-dashed border-gray-700 overflow-hidden flex items-center justify-center">
                  {(draft.imagePrev || draft.imageUrl)
                    ? <img src={draft.imagePrev || draft.imageUrl} alt="" className="w-full h-full object-cover" />
                    : <span className="text-7xl">🦸</span>
                  }
                </div>

              </div>
            )}

            {/* Steps 1-3 — scrollable */}
            {step > 0 && (
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-sm mx-auto px-4 py-3 space-y-4">

                  {/* ── Step 1: Power Tier ── */}
                  {step === 1 && (
                    <TierCarousel
                      selected={draft.tier}
                      onChange={t => setDraft(d => ({ ...d, tier: t }))}
                    />
                  )}

                  {/* ── Step 2: Attacks ── */}
                  {step === 2 && (
                    <MoveEditor
                      moves={draft.attacks}
                      remaining={atkRemaining}
                      isAttack={true}
                      onAdd={handleAddAttack}
                      onUpdate={(i, upd) => setDraft(d => { const attacks = [...d.attacks]; attacks[i] = upd; return { ...d, attacks }; })}
                      onDelete={(i) => setDraft(d => ({ ...d, attacks: d.attacks.filter((_, ii) => ii !== i) }))}
                      defaultMoveName="Punch"
                      defaultMovePower={DEFAULT_PUNCH_POWER[draft.tier] || 75}
                    />
                  )}

                  {/* ── Step 3: Defence ── */}
                  {step === 3 && (
                    <MoveEditor
                      moves={draft.defenses}
                      remaining={defRemaining}
                      isAttack={false}
                      onAdd={handleAddDefense}
                      onUpdate={(i, upd) => setDraft(d => { const defenses = [...d.defenses]; defenses[i] = upd; return { ...d, defenses }; })}
                      onDelete={(i) => setDraft(d => ({ ...d, defenses: d.defenses.filter((_, ii) => ii !== i) }))}
                      defaultMoveName="Block"
                      defaultMovePower={DEFAULT_BLOCK_POWER[draft.tier] || 75}
                    />
                  )}

                </div>
              </div>
            )}
          </div>

          {/* ── Step nav bar ── */}
          <div className="flex-shrink-0 border-t border-gray-800 bg-gray-900 px-4 py-2.5 flex flex-col gap-2">
            <div className="flex gap-3">
              {step > 0 && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="px-4 py-2 rounded-xl border border-gray-700 text-gray-400 text-sm hover:border-gray-600 hover:text-gray-200 hover:bg-gray-800 transition-all !min-h-0"
                >
                  ← Back
                </button>
              )}
              <button
                onClick={isLastStep ? handleSubmit : () => setStep(s => s + 1)}
                disabled={!stepValid[step] || submitting}
                className={`flex-1 py-2 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed !min-h-0 ${
                  isLastStep
                    ? 'bg-gradient-to-r from-red-700 to-orange-600 hover:from-red-600 hover:to-orange-500 text-white'
                    : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white'
                }`}
              >
                {submitting
                  ? 'Adding…'
                  : isLastStep
                    ? `Add to Roster (${myRoster.length}/3)`
                    : `Next: ${BUILD_STEPS[step + 1].label} →`}
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// ── Confirming Phase ──────────────────────────────────────────────────────────

function ConfirmingPhase({ myRoster, opponentRoster, myConfirmed, opponentConfirmed, opponentName, onConfirm }) {
  function RosterCard({ chars, label, confirmed, isMe }) {
    return (
      <div className={`bg-gray-800/60 rounded-xl border ${confirmed ? 'border-green-600' : 'border-gray-600'} p-4`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">{label}</h3>
          {confirmed
            ? <span className="text-xs text-green-400 font-medium">✓ Ready</span>
            : <span className="text-xs text-gray-400">Building…</span>
          }
        </div>
        <div className="grid grid-cols-3 gap-3">
          {chars.map(c => (
            <div key={c.id} className="flex flex-col items-center gap-1">
              <div className="w-14 h-14 rounded-lg bg-gray-700 overflow-hidden flex items-center justify-center">
                {c.image_url ? <img src={c.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl">🦸</span>}
              </div>
              <span className="text-xs text-white font-medium text-center leading-tight">{c.name}</span>
              <span className={`text-[10px] ${(TIER_COLORS[c.tier] || '').split(' ')[0]}`}>{c.tier}</span>
              <span className="text-[10px] text-gray-400">{c.hp} HP</span>
            </div>
          ))}
          {chars.length === 0 && (
            <div className="col-span-3 text-center text-gray-500 text-sm py-4">
              {isMe ? 'No characters — go back to build phase.' : 'Waiting…'}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 text-center border-b border-gray-700">
        <h2 className="text-white font-semibold text-lg">Review the Rosters</h2>
        <p className="text-gray-400 text-sm mt-1">Check both teams, then confirm you're ready to fight.</p>
      </div>

      <div className="flex-1 p-4 space-y-4 max-w-lg mx-auto w-full">
        <RosterCard chars={myRoster} label="Your Team" confirmed={myConfirmed} isMe />
        <RosterCard chars={opponentRoster} label={`${opponentName}'s Team`} confirmed={opponentConfirmed} />

        {!myConfirmed
          ? (
            <button
              onClick={onConfirm}
              disabled={myRoster.length === 0}
              className="w-full py-3 rounded-xl font-bold text-base transition-all disabled:opacity-40
                bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white"
            >
              Confirm — Let's Fight!
            </button>
          )
          : (
            <div className="text-center py-4">
              <div className="animate-pulse text-gray-400 text-sm">Waiting for {opponentName} to confirm…</div>
            </div>
          )
        }
      </div>
    </div>
  );
}

// ── Battle Phase ──────────────────────────────────────────────────────────────

function TeamPanel({ chars, label, isMe, selectedCharId, onSelectChar }) {
  const firstAliveId = chars.find(c => !c.defeated)?.id ?? null;
  const effectiveSelected = selectedCharId ?? firstAliveId;
  const globalMaxHp = Math.max(...chars.map(c => {
    const t = TIERS[c.tier] || TIERS['Regular'];
    return c.max_hp ?? t.hp;
  }), 1);
  return (
    <div className="flex items-start gap-2">
      <div
        className="text-[11px] text-gray-300 font-semibold uppercase tracking-wider flex-shrink-0 self-center"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
      >
        {label}
      </div>
      <div className="flex gap-5 flex-wrap">
        {chars.map(c => {
          if (isMe && onSelectChar) {
            return (
              <button
                key={c.id}
                onClick={() => onSelectChar(c.id)}
                className={`!min-h-0 !min-w-0 p-0 rounded-lg transition-all outline-none focus:outline-none ${
                  effectiveSelected === c.id
                    ? 'ring-2 ring-purple-400 ring-offset-1 ring-offset-gray-900'
                    : 'opacity-60 hover:opacity-90'
                }`}
              >
                <CharMini char={c} globalMaxHp={globalMaxHp} large />
              </button>
            );
          }
          return <CharMini key={c.id} char={c} globalMaxHp={globalMaxHp} large />;
        })}
        {chars.length === 0 && <div className="text-gray-500 text-sm">—</div>}
      </div>
    </div>
  );
}

function MovePicker({ myChars, onLock, myLock, opponentName, opponentLocked, selectedCharId, setSelectedCharId }) {
  const [moveType, setMoveType] = useState('attack');
  const [moveIndex, setMoveIndex] = useState(0);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!myLock) {
      setLocked(false);
      setSelectedCharId(null);
      setMoveType('attack');
      setMoveIndex(0);
    }
  }, [myLock, setSelectedCharId]);

  // When character changes, default to their first custom (non-default) move
  useEffect(() => {
    setMoveType('attack');
    setMoveIndex(firstNonDefaultIdx(selectedChar?.attacks));
  }, [selectedCharId]); // eslint-disable-line react-hooks/exhaustive-deps

  const aliveChars = myChars.filter(c => !c.defeated);
  const selectedChar = aliveChars.find(c => c.id === selectedCharId) || aliveChars[0] || null;
  const moves = selectedChar
    ? (moveType === 'attack' ? selectedChar.attacks : selectedChar.defenses)
    : [];

  const canLock = selectedChar && moves.length > 0;

  const handleLock = () => {
    if (!canLock || locked) return;
    const cid = selectedChar.id;
    const mi = Math.min(moveIndex, moves.length - 1);
    setLocked(true);
    onLock({ char_id: cid, vs_move_type: moveType, move_index: mi });
  };

  const [justSelected, setJustSelected] = useState(null);
  const handleSelectMove = (i) => {
    setMoveIndex(i);
    setJustSelected(i);
    setTimeout(() => setJustSelected(null), 350);
  };

  return (
    <div className="space-y-3">
      {selectedChar && (
        <div className="flex rounded-lg overflow-hidden border border-gray-600">
          <button
            onClick={() => { setMoveType('attack'); setMoveIndex(firstNonDefaultIdx(selectedChar?.attacks)); }}
            disabled={!selectedChar.attacks?.length}
            className={`flex-1 leading-none py-px transition-colors disabled:opacity-30 ${
              moveType === 'attack' ? 'bg-red-900 text-red-300' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <span className="text-lg">⚔</span><span className="text-base font-semibold ml-1">Attack</span>
          </button>
          <button
            onClick={() => { setMoveType('defense'); setMoveIndex(firstNonDefaultIdx(selectedChar?.defenses)); }}
            disabled={!selectedChar.defenses?.length}
            className={`flex-1 leading-none py-px transition-colors disabled:opacity-30 ${
              moveType === 'defense' ? 'bg-blue-900 text-blue-300' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <span className="text-lg">🛡</span><span className="text-base font-semibold ml-1">Defend</span>
          </button>
        </div>
      )}

      {moves.length > 0 && (
        <div className="space-y-1">
          {moves.map((m, i) => {
            const isSelected = moveIndex === i;
            const isJust = justSelected === i;
            const accent = moveType === 'attack'
              ? 'border-red-500 bg-red-900/40'
              : 'border-blue-500 bg-blue-900/40';
            const accentText = moveType === 'attack' ? 'text-red-200' : 'text-blue-200';
            return (
              <div
                key={i}
                className={`flex items-stretch rounded-lg border overflow-hidden ${
                  isSelected ? accent : 'border-gray-700 bg-gray-800 hover:border-gray-500'
                }`}
                style={{
                  transform: isJust ? 'scale(1.04)' : 'scale(1)',
                  boxShadow: isJust ? `0 0 0 2px ${moveType === 'attack' ? '#f87171' : '#60a5fa'}` : 'none',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease, border-color 0.2s ease',
                }}
              >
                <button
                  onClick={() => handleSelectMove(i)}
                  className={`!min-h-0 !min-w-0 flex-1 text-left px-2 py-1 flex items-center gap-2 ${isSelected ? accentText : 'text-gray-300'}`}
                >
                  <span className={`text-xs flex-shrink-0 ${isSelected ? 'opacity-100' : 'opacity-20'}`}>●</span>
                  <span className="font-medium text-base">{m.name || '(unnamed)'}</span>
                  <span className="ml-auto text-xs opacity-60 flex-shrink-0">{m.power} pts</span>
                </button>
                {isSelected && (
                  <button
                    onClick={handleLock}
                    disabled={!canLock}
                    className="!min-h-0 !min-w-0 flex-shrink-0 px-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-l border-indigo-500"
                  >
                    »
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {opponentLocked && !locked && (
        <div className="text-center text-yellow-400 text-xs animate-pulse">{opponentName} is locked in — choose fast!</div>
      )}
    </div>
  );
}

function TriggerClipDisplay({ url, onDone }) {
  if (!url) return null;
  const isVideo = /\.(mp4|webm|mov|gif)(\?|$)/i.test(url);

  if (isVideo && !/\.gif(\?|$)/i.test(url)) {
    return (
      <div className="w-full max-h-48 relative">
        {/* key={url} forces a fresh element per clip so src is always loaded clean */}
        <video
          key={url}
          src={url}
          className="w-full max-h-48 object-contain rounded-lg"
          playsInline muted autoPlay onEnded={onDone}
        />
      </div>
    );
  }
  return (
    <img src={url} alt="trigger" className="w-full max-h-48 object-contain rounded-lg" onLoad={() => setTimeout(onDone, 2000)} />
  );
}

function PowerUpBadge({ ps, label }) {
  const badges = [];
  if (ps?.pending_stun)     badges.push({ key: 'stun',     ...POWER_UP_INFO.stun });
  if (ps?.pending_atk_boost) badges.push({ key: 'atk',    ...POWER_UP_INFO.atk_boost });
  if (ps?.pending_shield)   badges.push({ key: 'shield',   ...POWER_UP_INFO.shield });
  if (ps?.pending_def_boost) badges.push({ key: 'def',    ...POWER_UP_INFO.def_boost });
  if (ps?.pending_poison)   badges.push({ key: 'poison',   ...POWER_UP_INFO.poison });
  if (!badges.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1 justify-center">
      {badges.map(b => (
        <span key={b.key} className="text-xs px-1.5 py-0.5 rounded-full border font-semibold" style={{ borderColor: b.color, color: b.color, background: `${b.color}15` }}>
          {b.icon} {b.label}
        </span>
      ))}
    </div>
  );
}

function StreakBar({ attackStreak = 0, defenseStreak = 0 }) {
  const pip = (n, total, color) => Array.from({ length: total }, (_, i) => (
    <span key={i} className={`inline-block w-2 h-2 rounded-full mr-0.5 ${i < n ? '' : 'opacity-20'}`} style={{ background: i < n ? color : '#6b7280' }} />
  ));
  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="flex items-center gap-1">
        <span className="text-red-400">⚔️</span>
        {pip(attackStreak, 3, '#ef4444')}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-blue-400">🛡️</span>
        {pip(defenseStreak, 3, '#3b82f6')}
      </div>
    </div>
  );
}

function BattlePhase({ myChars, oppChars, myName, oppName, turn, lastTurnResult, onLock, myLock, opponentLocked, playSound, myPs, oppPs }) {
  const [showResult, setShowResult] = useState(false);
  const [displayedResult, setDisplayedResult] = useState(null);
  const [clipQueue, setClipQueue] = useState([]);
  const [clipIndex, setClipIndex] = useState(0);
  const [selectedCharId, setSelectedCharId] = useState(null);
  const prevTurnRef = useRef(turn);

  useEffect(() => {
    if (lastTurnResult && turn !== prevTurnRef.current) {
      prevTurnRef.current = turn;
      setDisplayedResult(lastTurnResult);
      setShowResult(true);
      const snd = outcomeSound(lastTurnResult.outcome);
      if (playSound) playSound(snd);
      const queue = resolveClipQueue(lastTurnResult);
      setClipQueue(queue);
      setClipIndex(0);
      // No clips → show result panel for 3s, then clear
      if (!queue.length) setTimeout(() => setShowResult(false), 3000);
    }
  }, [turn, lastTurnResult, playSound]);

  const handleClipDone = () => {
    setClipIndex(prev => {
      const next = prev + 1;
      if (next < clipQueue.length) return next;
      setClipQueue([]);
      // Keep result panel visible long enough for HP animation + hearts (~2.5s)
      setTimeout(() => setShowResult(false), 2500);
      return prev;
    });
  };

  const outcome = displayedResult?.outcome;

  // Resolve which character was damaged for HP animation.
  // Backend now sends loser_char_id / defender_char_id on damaging outcomes.
  // oldHp is inferred as char.hp + damage because myChars/oppChars already carry post-damage HP.
  const damageInfo = useMemo(() => {
    if (!displayedResult?.damage || !displayedResult.damage) return null;
    const charId = displayedResult.loser_char_id || displayedResult.defender_char_id;
    if (!charId) return null;
    const allChars = [...myChars, ...oppChars];
    const char = allChars.find(c => String(c.id) === String(charId));
    if (!char) return null;
    const tier = TIERS[char.tier] || TIERS['Regular'];
    const maxHp = char.max_hp ?? tier.hp;
    const newHp = char.hp;
    const oldHp = Math.min(newHp + displayedResult.damage, maxHp);
    return { char, oldHp, newHp, maxHp };
  }, [displayedResult, myChars, oppChars]);

  // Resolve attacker + defender chars for the CombatLabel ("who hit who") display.
  const combatInfo = useMemo(() => {
    if (!displayedResult) return null;
    const allChars = [...myChars, ...oppChars];
    const find = (id) => id ? allChars.find(c => String(c.id) === String(id)) : null;
    const outcome = displayedResult.outcome;

    if (outcome === 'attack_wins') {
      return {
        attackerChar: find(displayedResult.winner_char_id),
        defenderChar: find(displayedResult.loser_char_id),
      };
    }
    if (outcome === 'attack_lands' || outcome === 'undefended') {
      return {
        attackerChar: find(displayedResult.attacker_char_id),
        defenderChar: find(displayedResult.defender_char_id),
      };
    }
    if (outcome === 'both_attack') {
      return {
        attackerChar: find(displayedResult.winner_char_id),
        defenderChar: find(displayedResult.loser_char_id),
      };
    }
    if (outcome === 'blocked' || outcome === 'deflect') {
      // defenderChar is who blocked/deflected; attackerChar is the attacker
      return {
        attackerChar: find(displayedResult.attacker_char_id),
        defenderChar: find(displayedResult.defender_char_id),
      };
    }
    if (outcome === 'counter_result') {
      // actor_char_id = who countered (attacker prefix); target_char_id = who was hit
      return {
        attackerChar: find(displayedResult.actor_char_id),
        defenderChar: find(displayedResult.target_char_id),
      };
    }
    // Stalemate and other mutual outcomes — try to show both if IDs exist
    const aId = displayedResult.attacker_char_id || displayedResult.winner_char_id;
    const bId = displayedResult.defender_char_id || displayedResult.loser_char_id;
    if (aId || bId) {
      return { attackerChar: find(aId), defenderChar: find(bId) };
    }
    return null;
  }, [displayedResult, myChars, oppChars]);

  const clipsPlaying = clipQueue.length > 0 && clipIndex < clipQueue.length;

  return (
    <div className="flex flex-col lg:flex-row h-full overflow-hidden">
      {/* Opponent side */}
      <div className="flex-shrink-0 p-2 lg:p-3 lg:w-52 border-b lg:border-b-0 lg:border-r border-gray-700 bg-gray-900/40 flex flex-col">
        <TeamPanel chars={oppChars} label={oppName} />
        <div className="mt-1 flex justify-center">
          <StreakBar attackStreak={oppPs?.attack_streak ?? 0} defenseStreak={oppPs?.defense_streak ?? 0} />
        </div>
        <PowerUpBadge ps={oppPs} />
        {opponentLocked && (
          <div className="mt-1 text-center text-yellow-400 text-xs font-medium animate-pulse">🔒 Locked in</div>
        )}
      </div>

      {/* Center panel */}
      <div className="flex-1 min-h-[80px] lg:flex-1 flex flex-col items-center justify-center p-2 lg:p-4 gap-2 lg:gap-3">
        <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Turn {turn + 1}</div>

        {showResult && outcome && (
          <div className="flex flex-col items-center gap-2 w-full">
            {clipsPlaying
              ? <TriggerClipDisplay url={clipQueue[clipIndex]} onDone={handleClipDone} />
              : (
                <>
                  <OutcomeLabel outcome={outcome} turnResult={displayedResult} attackerChar={combatInfo?.attackerChar} defenderChar={combatInfo?.defenderChar} />
                  {combatInfo && (combatInfo.attackerChar || combatInfo.defenderChar) && (
                    <CombatLabel
                      attackerChar={combatInfo.attackerChar}
                      defenderChar={combatInfo.defenderChar}
                      outcome={outcome}
                    />
                  )}
                  {damageInfo && (
                    <DamageHPDisplay
                      key={`${displayedResult?.outcome}-${turn}`}
                      char={damageInfo.char}
                      oldHp={damageInfo.oldHp}
                      newHp={damageInfo.newHp}
                      maxHp={damageInfo.maxHp}
                      playSound={playSound}
                    />
                  )}
                </>
              )
            }
          </div>
        )}

        {!showResult && (
          <div className="text-gray-700 text-sm text-center hidden lg:block">Lock in your move</div>
        )}
      </div>

      {/* Player side */}
      <div className="flex-shrink-0 lg:flex-none lg:w-72 p-3 border-t lg:border-t-0 lg:border-l border-gray-700 bg-gray-900/40 flex flex-col gap-2 overflow-y-auto">
        <TeamPanel chars={myChars} label={myName} isMe selectedCharId={selectedCharId} onSelectChar={setSelectedCharId} />
        <div className="mt-1 flex justify-center">
          <StreakBar attackStreak={myPs?.attack_streak ?? 0} defenseStreak={myPs?.defense_streak ?? 0} />
        </div>
        <PowerUpBadge ps={myPs} />
        {myLock && (
          <div className="text-center py-1 space-y-0.5">
            <div className="text-green-400 font-semibold text-sm">✓ Move locked!</div>
            {opponentLocked
              ? <div className="text-yellow-400 text-xs animate-pulse">Resolving…</div>
              : <div className="text-gray-400 text-xs">Waiting for {oppName}…</div>
            }
          </div>
        )}
        <div
          style={{
            maxHeight: (myLock || showResult) ? '0px' : '480px',
            overflow: 'hidden',
            transition: 'max-height 0.38s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div className="border-t border-gray-700 pt-3">
            <MovePicker
              myChars={myChars}
              selectedCharId={selectedCharId}
              setSelectedCharId={setSelectedCharId}
              onLock={onLock}
              myLock={myLock}
              opponentName={oppName}
              opponentLocked={opponentLocked}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Reflect Flash ──────────────────────────────────────────────────────────────

function ReflectFlashOverlay({ charName }) {
  return (
    <>
      <style>{`
        @keyframes rf-white { 0%{opacity:1} 22%{opacity:.88} 65%{opacity:.1} 100%{opacity:0} }
        @keyframes rf-text  { 0%,20%{opacity:0;transform:translateY(10px) scale(.94)} 40%{opacity:1;transform:translateY(0) scale(1.04)} 80%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0} }
        @keyframes rf-shield { 0%,15%{transform:scale(.5);opacity:0} 35%{transform:scale(1.25);opacity:1} 60%{transform:scale(1);opacity:1} 100%{opacity:0} }
      `}</style>
      {/* Blinding white-blue flash */}
      <div className="absolute inset-0 z-50 pointer-events-none"
        style={{ background:'radial-gradient(ellipse at center,#fff 0%,rgba(225,225,255,.97) 50%,rgba(180,180,255,.65) 100%)', animation:'rf-white 2.6s ease-in-out forwards' }} />
      {/* Text + icon */}
      <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
        style={{ animation:'rf-text 2.6s ease-in-out forwards' }}>
        <div className="text-center">
          <div style={{ fontSize:'3.5rem', animation:'rf-shield 2.6s ease-in-out forwards', display:'inline-block' }}>🛡️</div>
          <div style={{ fontFamily:'Bangers,cursive', letterSpacing:'.06em', fontSize:'2.2rem', color:'#3730a3', WebkitTextStroke:'1.5px rgba(255,255,255,.7)', textShadow:'0 0 30px rgba(200,200,255,.9),0 2px 6px rgba(0,0,50,.3)', marginTop:'.1rem' }}>
            COUNTER!
          </div>
          <div style={{ color:'#1e1b4b', fontWeight:700, fontSize:'1rem', marginTop:'.3rem', textShadow:'0 0 14px rgba(255,255,255,1),0 1px 3px rgba(0,0,0,.25)' }}>
            {charName} reflects the attack!
          </div>
        </div>
      </div>
    </>
  );
}

// ── Counter Window ─────────────────────────────────────────────────────────────

function CounterOverlay({ counterState, myChars, myId, myName, onCounter, durationMs }) {
  const [timeLeft, setTimeLeft] = useState(durationMs || 3000);
  const [chosen, setChosen]     = useState(false);
  const [counterVideo, setCounterVideo] = useState(null); // { url, option, moveIndex }
  const intervalRef    = useRef(null);
  const chosenRef      = useRef(false);

  const isMyCounter  = counterState?.type === 'stalemate' || counterState?.defender_user_id === myId;
  const aliveAttacks = myChars.filter(c => !c.defeated).flatMap(c => c.attacks || []);

  // Play slow-down sound when the counter window opens
  useEffect(() => {
    const snd = new Audio('https://LetsWatchOut.b-cdn.net/games/sounds/slowdown.mp3');
    snd.volume = 0.65;
    snd.play().catch(() => {});
    return () => { snd.pause(); snd.src = ''; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chosenRef.current = false;
    setTimeLeft(durationMs || 3000);
    setChosen(false);
    setCounterVideo(null);
    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 100) {
          clearInterval(intervalRef.current);
          if (isMyCounter && !chosenRef.current) {
            chosenRef.current = true;
            setChosen(true);
            onCounter({ option: 'reflect', move_index: 0 });
          }
          return 0;
        }
        return prev - 100;
      });
    }, 100);
    return () => clearInterval(intervalRef.current);
  }, [counterState, durationMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitCounter = (option, moveIndex) => {
    chosenRef.current = true;
    setChosen(true);
    clearInterval(intervalRef.current);
    onCounter({ option, move_index: moveIndex });
  };

  const handleChoice = (option, moveIndex = 0, triggerUrl = '') => {
    if (chosenRef.current || !isMyCounter) return;
    if (option === 'attack' && triggerUrl) {
      // Freeze the timer and play the move video first, then submit
      clearInterval(intervalRef.current);
      setCounterVideo({ url: triggerUrl, option, moveIndex });
    } else {
      submitCounter(option, moveIndex);
    }
  };

  const handleVideoEnd = () => {
    if (!counterVideo) return;
    const { option, moveIndex } = counterVideo;
    setCounterVideo(null);
    submitCounter(option, moveIndex);
  };

  const total = durationMs || 3000;
  const pct   = (timeLeft / total) * 100;
  const barColor = timeLeft > 2000 ? '#22c55e' : timeLeft > 1000 ? '#f97316' : '#ef4444';
  const secsTxt  = (timeLeft / 1000).toFixed(1);

  return (
    <>
      <style>{`
        @keyframes cw-bg-breathe {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.88; }
        }
        @keyframes cw-spotlight {
          0%, 100% { transform: scale(1);   opacity: 0.5; }
          50%       { transform: scale(1.4); opacity: 0.9; }
        }
        @keyframes cw-border-glow {
          0%, 100% { box-shadow: 0 0 0 0   rgba(234,179,8,0.25), 0 25px 50px -12px rgba(120,53,15,0.5); }
          50%       { box-shadow: 0 0 0 6px rgba(234,179,8,0.10), 0 25px 50px -12px rgba(120,53,15,0.5); }
        }
        @keyframes cw-title-flicker {
          0%, 90%, 100% { text-shadow: 0 0 8px #facc15, 0 0 22px #fbbf24; }
          92%            { text-shadow: 0 0 3px #facc15; }
          95%            { text-shadow: 0 0 14px #facc15, 0 0 36px #fbbf24; }
        }
      `}</style>

      {/* ── Dark backdrop with radial breathe ── */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{
          background: 'rgba(0,0,8,0.84)',
          animation: 'cw-bg-breathe 2s ease-in-out infinite',
        }}
      />

      {/* Scan-line texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.05) 3px, rgba(0,0,0,0.05) 4px)',
        }}
      />

      {/* Radial spotlight that slowly expands */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 55% 55% at center, rgba(234,179,8,0.06) 0%, transparent 70%)',
          animation: 'cw-spotlight 2s ease-in-out infinite',
        }}
      />

      {/* ── Modal ── */}
      <div className="absolute inset-0 flex items-center justify-center z-50">
        <div
          className="bg-gray-900/95 border border-yellow-500/60 rounded-2xl p-6 w-80 relative overflow-hidden"
          style={{ animation: 'cw-border-glow 1.6s ease-in-out infinite' }}
        >
          {/* Top edge shine */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-400/50 to-transparent" />

          {/* ── Counter move video ── */}
          {counterVideo && (
            <div className="flex flex-col items-center gap-3">
              <div className="text-yellow-400 font-bold text-sm tracking-wide">⚡ Counter Strike!</div>
              <video
                src={counterVideo.url}
                autoPlay
                playsInline
                className="w-full rounded-xl max-h-52 object-cover"
                onEnded={handleVideoEnd}
                onError={handleVideoEnd}
              />
              <div className="text-xs text-gray-400 animate-pulse">Resolving…</div>
            </div>
          )}

          {/* ── Main content (hidden while video plays) ── */}
          {!counterVideo && (
            <>
              {/* Title */}
              <div className="text-center mb-3">
                <div
                  className="text-2xl"
                  style={{
                    fontFamily: 'Bangers, cursive',
                    letterSpacing: '0.1em',
                    color: '#facc15',
                    WebkitTextStroke: '1px #000',
                    animation: 'cw-title-flicker 3s ease-in-out infinite',
                  }}
                >
                  ⚡ COUNTER WINDOW ⚡
                </div>
                {counterState?.type === 'stalemate'
                  ? <div className="text-xs text-gray-400 mt-1">Stalemate — <span className="text-yellow-400 font-semibold">either fighter</span> can react!</div>
                  : isMyCounter
                    ? <div className="text-xs text-gray-400 mt-1">You can <span className="text-yellow-400 font-semibold">counter</span> their attack!</div>
                    : <div className="text-xs text-gray-400 mt-1"><span className="text-yellow-400 font-semibold">Your opponent</span> has a window to counter — stay sharp!</div>
                }
              </div>

              {/* Timer text */}
              <div className="text-center text-xs font-semibold mb-1.5 transition-colors duration-300" style={{ color: barColor }}>
                {secsTxt}s remaining
              </div>

              {/* Color bar */}
              <div className="w-full h-2.5 bg-gray-700/80 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full rounded-full transition-all duration-100"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${barColor}99, ${barColor})`,
                    boxShadow: `0 0 8px ${barColor}70`,
                  }}
                />
              </div>

              {/* Choices */}
              {isMyCounter && !chosen && (
                <div className="space-y-2">
                  <button
                    onClick={() => handleChoice('reflect')}
                    className="w-full py-2.5 rounded-lg border border-blue-500 bg-blue-900/40 text-blue-300 font-medium text-sm hover:bg-blue-900/60 transition-colors"
                  >
                    <div className="font-bold">REFLECT</div>
                    <div className="text-xs opacity-70">Mirror 2% of opponent's power back</div>
                  </button>
                  <div className="text-xs text-gray-500 text-center">— or —</div>
                  <div className="space-y-1">
                    <div className="text-xs text-gray-400 mb-1">STRIKE BACK (5% power):</div>
                    {aliveAttacks.map((m, i) => (
                      <button
                        key={i}
                        onClick={() => handleChoice('attack', i, m.trigger_url || '')}
                        className="w-full py-1.5 rounded-lg border border-red-700 bg-red-900/30 text-red-300 text-xs hover:bg-red-900/50 transition-colors text-left px-3 flex items-center gap-2"
                      >
                        {m.trigger_url && <span className="text-gray-500">▶</span>}
                        <span className="flex-1">{m.name || '(unnamed)'}</span>
                        <span className="opacity-60">{m.power} pts</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {chosen && <div className="text-center text-green-400 font-medium py-2">Move sent!</div>}
              {!isMyCounter && (
                <div className="text-center py-3">
                  <div className="text-gray-300 text-sm font-medium animate-pulse">
                    {counterState?.type === 'stalemate' ? '⚔️ Either fighter can react…' : '⚡ Opponent is deciding…'}
                  </div>
                  <div className="text-gray-500 text-xs mt-1">
                    {counterState?.type === 'stalemate'
                      ? 'Watch the bar — they may counter or reflect at any moment'
                      : 'They can reflect your attack or strike back with 5% power'
                    }
                  </div>
                </div>
              )}
              {timeLeft === 0 && <div className="text-center text-gray-500 text-xs mt-2">Window closed.</div>}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── 3D Dice ───────────────────────────────────────────────────────────────────

function Dice3D({ value = 1, rolling = false, glowColor = null }) {
  const S = 80; // cube side length in px

  // Cube rotation that brings each face number toward the camera
  const FACE_ROTATIONS = {
    1: 'rotateX(0deg) rotateY(0deg)',
    2: 'rotateY(-90deg)',
    3: 'rotateX(90deg)',
    4: 'rotateX(-90deg)',
    5: 'rotateY(90deg)',
    6: 'rotateY(180deg)',
  };

  // Pip positions [x%, y%] for each face value
  const PIPS = {
    1: [[50,50]],
    2: [[75,25],[25,75]],
    3: [[75,25],[50,50],[25,75]],
    4: [[25,25],[75,25],[25,75],[75,75]],
    5: [[25,25],[75,25],[50,50],[25,75],[75,75]],
    6: [[25,20],[75,20],[25,50],[75,50],[25,80],[75,80]],
  };

  // [faceNumber, CSS transform that positions this face on the cube]
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
          0%   { transform: rotateX(0deg)    rotateY(0deg)    rotateZ(0deg); }
          100% { transform: rotateX(720deg)  rotateY(1080deg) rotateZ(360deg); }
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

// ── Dice Roll Overlay ──────────────────────────────────────────────────────────

function DiceRollOverlay({ rollType, opponentAlsoRolling, myRollResult, onRoll, hasRolled }) {
  const powerUp = myRollResult != null ? POWER_UP_INFO[DICE_POWER_MAP[myRollResult - 1]] : null;
  const rollLabel = rollType === 'attack' ? '⚔️ Attack Bonus Roll' : '🛡️ Defense Bonus Roll';

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)' }}
    >
      <div className="flex flex-col items-center gap-5 px-6 py-8 rounded-2xl border border-gray-700 bg-gray-900/90 max-w-sm w-full mx-4">
        {/* Title */}
        <div className="text-center">
          <div className="text-lg font-bold text-yellow-400 tracking-wide">{rollLabel}</div>
          <div className="text-xs text-gray-400 mt-1">3 consecutive wins unlocked a bonus!</div>
        </div>

        {/* 3D Dice */}
        <div className="flex flex-col items-center gap-4 py-2">
          <Dice3D
            value={myRollResult || 1}
            rolling={hasRolled && myRollResult == null}
            glowColor={powerUp?.color}
          />
          {myRollResult != null && powerUp && (
            <div
              className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl border"
              style={{ borderColor: powerUp.color, background: `${powerUp.color}18` }}
            >
              <div className="text-2xl">{powerUp.icon}</div>
              <div className="font-bold tracking-widest text-sm" style={{ color: powerUp.color }}>{powerUp.label}</div>
              <div className="text-xs text-gray-300 text-center">{powerUp.desc}</div>
            </div>
          )}
        </div>

        {/* Roll button */}
        {!hasRolled ? (
          <button
            onClick={onRoll}
            className="px-8 py-3 rounded-xl font-bold text-base text-white transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}
          >
            🎲 ROLL!
          </button>
        ) : myRollResult == null ? (
          <div className="text-sm text-gray-400 animate-pulse">Rolling…</div>
        ) : (
          <div className="text-sm text-green-400 font-medium">Power-up applied!</div>
        )}

        {/* Opponent status */}
        {opponentAlsoRolling && (
          <div className="text-xs text-gray-500 border-t border-gray-700 pt-3 w-full text-center">
            {myRollResult != null
              ? 'Waiting for opponent to roll…'
              : 'Opponent also has a pending roll'}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Game Over ─────────────────────────────────────────────────────────────────

function GameOverScreen({ players, currentUserId, winnerPlayerId, myChars, oppChars, opponentName, onClose, myStats, oppStats }) {
  const iWon = winnerPlayerId === currentUserId;
  const isDraw = winnerPlayerId == null;
  // Use xl sizing when each side has only 1 character, large for 2, large for 3
  const maxChars = Math.max(myChars.length, oppChars.length);
  const useXL = maxChars <= 1;

  return (
    <div className="absolute inset-0 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-4 sm:p-6">
      <div
        className="text-5xl sm:text-6xl mb-3"
        style={{
          fontFamily: 'Bangers, cursive',
          letterSpacing: '0.1em',
          color: isDraw ? '#9ca3af' : iWon ? '#facc15' : '#ef4444',
          WebkitTextStroke: '2px #000',
          textShadow: `4px 4px 0 #000`,
        }}
      >
        {isDraw ? "🤝 DRAW!" : iWon ? "🏆 VICTORY!" : "💀 DEFEATED!"}
      </div>

      <div className="text-gray-300 text-sm mb-4 sm:mb-6">
        {isDraw ? "Both teams fought to a standstill!" : iWon ? "You won the VS Battle!" : `${opponentName} won the battle.`}
      </div>

      {/* Character showcase — takes up most of the screen on desktop */}
      <div className="flex gap-6 sm:gap-10 mb-6 sm:mb-8 flex-wrap justify-center items-center min-h-[40vh] sm:min-h-[50vh] lg:min-h-[60vh]">
        <div className="flex flex-col items-center gap-2 sm:gap-3">
          <div className="text-sm sm:text-base text-gray-400 mb-1 font-medium">You</div>
          <div className={`flex ${maxChars === 1 ? 'justify-center' : 'gap-3 sm:gap-5 flex-wrap justify-center'}`}>
            {myChars.map(c => <CharMini key={c.id} char={c} xl={useXL} large={!useXL} />)}
          </div>
        </div>
        <div className="text-gray-600 text-3xl sm:text-4xl self-center font-black">VS</div>
        <div className="flex flex-col items-center gap-2 sm:gap-3">
          <div className="text-sm sm:text-base text-gray-400 mb-1 font-medium">{opponentName}</div>
          <div className={`flex ${maxChars === 1 ? 'justify-center' : 'gap-3 sm:gap-5 flex-wrap justify-center'}`}>
            {oppChars.map(c => <CharMini key={c.id} char={c} xl={useXL} large={!useXL} />)}
          </div>
        </div>
      </div>

      {/* Battle Stats */}
      {(myStats || oppStats) && (
        <div className="mb-4 w-full max-w-sm border border-gray-700 rounded-xl overflow-hidden">
          <div className="bg-gray-800/60 px-3 py-1.5 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">Battle Stats</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="py-1.5 px-2 text-left text-gray-500 font-normal">Stat</th>
                <th className="py-1.5 px-2 text-right text-blue-400 font-semibold">You</th>
                <th className="py-1.5 px-2 text-right text-red-400 font-semibold">{opponentName}</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Damage Dealt',    myKey: 'damage_dealt',   oppKey: 'damage_dealt' },
                { label: 'Attacks Landed',  myKey: 'attacks_landed', oppKey: 'attacks_landed' },
                { label: 'Blocks',          myKey: 'blocks',         oppKey: 'blocks' },
                { label: 'Counters',        myKey: 'counters',       oppKey: 'counters' },
                { label: 'Biggest Hit',     myKey: 'biggest_hit',    oppKey: 'biggest_hit' },
              ].map(({ label, myKey, oppKey }) => (
                <tr key={myKey} className="border-b border-gray-800 last:border-0">
                  <td className="py-1 px-2 text-gray-400">{label}</td>
                  <td className="py-1 px-2 text-right text-white font-medium">{myStats?.[myKey] ?? '—'}</td>
                  <td className="py-1 px-2 text-right text-white font-medium">{oppStats?.[oppKey] ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={onClose}
        className="px-8 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-medium transition-colors"
      >
        Close
      </button>
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export default function VsBattleGame({ gameState, players, currentUserId, roomId, onMove, onClose, onEndGame }) {
  const playSound = useVsBattleAudio();

  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'building';
  const gsPlayers = gs.players || {};
  const opponentLocked = gs.opponent_locked || {};
  const lastTurnResult = gs.last_turn_result || null;
  const counterState = gs.counter_state || null;
  const turn = Number(gs.turn) || 0;
  const pendingDiceRolls = gs.pending_dice_rolls || {};
  const playerStats = gameState?.player_stats || {};

  const myIdStr = String(currentUserId);
  const opponentPlayerInfo = players.find(p => String(p.user_id) !== myIdStr);
  const opponentIdStr = opponentPlayerInfo ? String(opponentPlayerInfo.user_id) : null;
  const myPlayerInfo = players.find(p => String(p.user_id) === myIdStr);

  const extractState = (idStr) => {
    const raw = gsPlayers[idStr];
    if (!raw) return { characters: [], confirmed: false, hype_meter: 0 };
    return {
      characters: raw.characters || [],
      confirmed: raw.confirmed || false,
      hype_meter: raw.hype_meter || 0,
      attack_streak: raw.attack_streak || 0,
      defense_streak: raw.defense_streak || 0,
      pending_stun: raw.pending_stun || false,
      pending_atk_boost: raw.pending_atk_boost || false,
      pending_shield: raw.pending_shield || false,
      pending_def_boost: raw.pending_def_boost || false,
      pending_poison: raw.pending_poison || '',
    };
  };
  const myState = extractState(myIdStr);
  const oppState = opponentIdStr ? extractState(opponentIdStr) : { characters: [], confirmed: false, hype_meter: 0 };

  const myRoster = myState.characters;
  const oppRoster = oppState.characters;
  const myName = myPlayerInfo?.username || 'You';
  const oppName = opponentPlayerInfo?.username || 'Opponent';

  // Optimistic pending characters — shown immediately after submit, before WS echo
  const [pendingChars, setPendingChars] = useState([]);

  // Merged roster: server truth + unconfirmed pending (deduplicated by id)
  const displayRoster = useMemo(() => {
    const serverIds = new Set(myRoster.map(c => c.id));
    return [...myRoster, ...pendingChars.filter(c => !serverIds.has(c.id))];
  }, [myRoster, pendingChars]);

  // Drop pending entries once the server has confirmed them.
  // Guard: only call setPendingChars when something actually changed —
  // without this, every WS message (which creates a new myRoster reference
  // even for unrelated events) triggers setPendingChars, which creates a new
  // array, which triggers another render, causing an infinite loop.
  useEffect(() => {
    if (pendingChars.length === 0) return;
    const serverIds = new Set(myRoster.map(c => c.id));
    const hasConfirmed = pendingChars.some(c => serverIds.has(c.id));
    if (hasConfirmed) {
      setPendingChars(prev => prev.filter(c => !serverIds.has(c.id)));
    }
  }, [myRoster, pendingChars]); // eslint-disable-line react-hooks/exhaustive-deps

  const [myLock, setMyLock] = useState(null);
  useEffect(() => { setMyLock(null); }, [turn]);

  const [draft, setDraft] = useState(emptyDraft);

  const myConfirmed = myState.confirmed;
  const oppConfirmed = oppState.confirmed;

  const isPlayer = players.some(p => String(p.user_id) === myIdStr);

  // game_over via normal gameplay sets lastTurnResult.game_over;
  // end_game / forfeit sets gameState.status to 'finished'/'forfeited' with no new turn result.
  const gameOver = !!(lastTurnResult?.game_over) ||
    gameState?.status === 'finished' ||
    gameState?.status === 'forfeited';
  const winnerIdRaw = lastTurnResult?.winner_id ?? gameState?.winner_id;
  const winnerPlayerId = winnerIdRaw != null ? Number(winnerIdRaw) : null;

  // ── Sound effects: phase transitions + game over ──────────────────────────
  const prevPhaseRef = useRef(phase);
  const prevGameOverRef = useRef(gameOver);
  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    // Battle start → 'begin'
    if (phase === 'battle' && prevPhase !== 'battle') playSound('begin');
    // New turn starts (no result showing) → 'yourTurn'
    if (phase === 'battle' && prevPhase === 'battle') playSound('yourTurn');
  }, [phase, playSound]);

  useEffect(() => {
    if (!gameOver || prevGameOverRef.current) return;
    prevGameOverRef.current = true;
    playSound('ko');
    setTimeout(() => {
      if (winnerPlayerId == null) return; // draw — no win/lose sound
      playSound(winnerPlayerId === Number(currentUserId) ? 'youWin' : 'youLose');
    }, 1200);
  }, [gameOver, winnerPlayerId, currentUserId, playSound]);

  const uploadAsset = useCallback(async (file, assetType = 'character_image') => {
    const sessionId = gameState?.game_session_id || '';
    if (!sessionId || !roomId) return null;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('session_id', String(sessionId));
    fd.append('asset_type', assetType);
    try {
      const res = await apiClient.post(`/api/rooms/${roomId}/game-assets`, fd, { headers: { 'Content-Type': undefined } });
      return res.data?.url || null;
    } catch {
      return null;
    }
  }, [gameState?.game_session_id, roomId]);

  // Persist roster to localStorage so "Load Saved" works next game
  const vsRosterKey = `vs_saved_roster_${currentUserId}`;
  const saveRosterToStorage = useCallback((updatedRoster) => {
    try { localStorage.setItem(vsRosterKey, JSON.stringify(updatedRoster)); } catch {}
  }, [vsRosterKey]);

  const handleSubmitChar = useCallback(async (charDraft) => {
    let imageUrl = charDraft.imageUrl || '';
    if (charDraft._imageFile) {
      const uploaded = await uploadAsset(charDraft._imageFile, 'character_image');
      if (uploaded) imageUrl = uploaded;
    }
    const processMoves = async (moves) =>
      Promise.all(moves.map(async (m) => {
        let triggerUrl = m.triggerUrl || '';
        if (m._triggerFile) {
          const up = await uploadAsset(m._triggerFile, 'move_gif');
          if (up) triggerUrl = up;
        }
        return { name: m.name, power: m.power, trigger_url: triggerUrl, move_type: m.move_type };
      }));

    const attacks  = await processMoves(charDraft.attacks.map(m => ({ ...m, move_type: 'attack' })));
    const defenses = await processMoves(charDraft.defenses.map(m => ({ ...m, move_type: 'defense' })));

    const charData = {
      id: charDraft.id,
      name: charDraft.name.trim(),
      tier: charDraft.tier,
      image_url: imageUrl,
      attacks,
      defenses,
    };

    // Optimistic update — characters are sent atomically with confirm_builds
    const tierDef = TIERS[charDraft.tier] || TIERS['Regular'];
    setPendingChars(prev => {
      const next = [...prev, {
        id: charDraft.id,
        name: charDraft.name.trim(),
        tier: charDraft.tier,
        image_url: imageUrl,
        hp: tierDef.hp,
        max_hp: tierDef.hp,
        attacks,
        defenses,
      }];
      return next;
    });

    // Save a serialisable snapshot (no File/Blob references) for "Load Saved Roster"
    const savedEntry = { name: charData.name, tier: charData.tier, image_url: imageUrl, attacks, defenses };
    try {
      const existing = JSON.parse(localStorage.getItem(vsRosterKey) || '[]');
      const updated = [...existing.filter(c => c.name !== savedEntry.name), savedEntry].slice(-3);
      saveRosterToStorage(updated);
    } catch {}

    setDraft(emptyDraft());
  }, [uploadAsset, setPendingChars, vsRosterKey, saveRosterToStorage]);

  const handleLoadSavedRoster = useCallback(() => {
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(vsRosterKey) || '[]'); } catch { return; }
    for (const c of saved) {
      const id = genId();
      const tierDef = TIERS[c.tier] || TIERS['Regular'];
      setPendingChars(prev => [...prev, {
        id, name: c.name, tier: c.tier, image_url: c.image_url || '',
        hp: tierDef.hp, max_hp: tierDef.hp, attacks: c.attacks || [], defenses: c.defenses || [],
      }]);
    }
  }, [vsRosterKey, setPendingChars]);

  const handleReady = useCallback(() => {
    const charPayload = displayRoster.map(c => ({
      id: c.id,
      name: c.name,
      tier: c.tier,
      image_url: c.image_url || '',
      attacks: c.attacks || [],
      defenses: c.defenses || [],
    }));
    onMove({ move_type: 'confirm_builds', move_data: { characters: charPayload } });
  }, [onMove, displayRoster]);
  const handleLock    = useCallback((lockData) => {
    setMyLock(lockData);
    onMove({ move_type: 'lock_move', move_data: lockData });
    // Determine if the locked move is a default (Punch/Block) or a custom one,
    // then play the matching sound.
    const char = myRoster.find(c => c.id === lockData.char_id);
    const moveList = lockData.vs_move_type === 'attack' ? char?.attacks : char?.defenses;
    const lockedMove = moveList?.[lockData.move_index];
    const isDefault = lockedMove?.is_default === true;
    if (lockData.vs_move_type === 'attack') {
      playSound(isDefault ? 'attackMove' : 'superAttack');
    } else {
      playSound(isDefault ? 'defenseMove' : 'superDefense');
    }
  }, [onMove, playSound, myRoster]);
  const handleCounter = useCallback((counterData) => { onMove({ move_type: 'counter_choice', move_data: counterData }); }, [onMove]);
  const handleEndGame = () => {
    if (gameOver) return;
    if (onEndGame) onEndGame(); else onClose();
  };

  // Dice roll state — reset when phase leaves dice_roll
  const [hasRolled, setHasRolled] = useState(false);
  const [myRollResult, setMyRollResult] = useState(null);
  const prevPhaseForDiceRef = useRef(phase);
  useEffect(() => {
    if (prevPhaseForDiceRef.current === 'dice_roll' && phase !== 'dice_roll') {
      setHasRolled(false);
      setMyRollResult(null);
    }
    prevPhaseForDiceRef.current = phase;
  }, [phase]);

  // When server echoes the dice_roll_result (dice value appears in game_state)
  useEffect(() => {
    if (phase !== 'dice_roll') return;
    const myResult = gs.dice_roll_result?.[myIdStr];
    if (myResult != null) setMyRollResult(Number(myResult));
  }, [phase, gs.dice_roll_result, myIdStr]);

  const handleDiceRoll = useCallback(() => {
    if (hasRolled) return;
    setHasRolled(true);
    onMove({ move_type: 'dice_roll_result', move_data: {} });
  }, [hasRolled, onMove]);

  const myRollType = pendingDiceRolls[myIdStr] || null;
  const oppRollType = opponentIdStr ? (pendingDiceRolls[opponentIdStr] || null) : null;

  // Reflect flash — shown to all players when a counter_result with reflect fires
  const [reflectFlash, setReflectFlash] = useState(null);
  useEffect(() => {
    if (lastTurnResult?.outcome !== 'counter_result' || lastTurnResult?.option !== 'reflect') return;
    const actorUID = Number(lastTurnResult.actor) || 0;
    const charId   = lastTurnResult.actor_char_id;
    const roster   = actorUID === currentUserId ? myRoster : oppRoster;
    const char     = roster?.find(c => c.id === charId);
    setReflectFlash(char?.name || 'Fighter');
    const t = setTimeout(() => setReflectFlash(null), 2700);
    return () => clearTimeout(t);
  }, [lastTurnResult?.outcome, lastTurnResult?.option, lastTurnResult?.actor_char_id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col overflow-hidden z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-purple-700 to-blue-700 border-b border-purple-900 flex-shrink-0">
        <div className="flex items-center gap-8">
          <img src="/icons/versusIcon.webp" alt="VS" className="h-9 w-auto flex-shrink-0" style={{ transform: 'scale(2.2)', transformOrigin: 'left center' }} />
          <span
            className="text-white font-black text-3xl leading-none"
            style={{ fontFamily: 'Bangers, cursive', letterSpacing: '0.06em' }}
          >
            BATTLE
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isPlayer && (phase === 'battle' || phase === 'counter_window' || phase === 'dice_roll') && !gameOver && (
            <button
              onClick={handleEndGame}
              className="text-sm font-semibold text-white bg-red-600 hover:bg-red-500 active:bg-red-700 px-4 py-0.5 rounded-2xl transition-colors"
            >
              End Game
            </button>
          )}
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white text-xl leading-none transition-colors"
            title="Leave game"
          >
            ×
          </button>
        </div>
      </div>

      {/* Phase content */}
      <div className="flex-1 overflow-hidden relative">
        {phase === 'building' && (
          <BuildingPhase
            myRoster={displayRoster}
            draft={draft}
            setDraft={setDraft}
            onSubmitChar={handleSubmitChar}
            onReady={handleReady}
            isReady={myConfirmed}
            onLoadSaved={handleLoadSavedRoster}
            savedRosterKey={`vs_saved_roster_${currentUserId}`}
          />
        )}

        {phase === 'confirming' && (
          <ConfirmingPhase
            myRoster={displayRoster}
            opponentRoster={oppRoster}
            myConfirmed={myConfirmed}
            opponentConfirmed={oppConfirmed}
            opponentName={oppName}
            onConfirm={handleReady}
          />
        )}

        {(phase === 'battle' || phase === 'counter_window' || phase === 'dice_roll') && (
          <BattlePhase
            myChars={myRoster}
            oppChars={oppRoster}
            myName={myName}
            oppName={oppName}
            turn={turn}
            lastTurnResult={lastTurnResult}
            onLock={handleLock}
            myLock={myLock}
            opponentLocked={opponentLocked[opponentIdStr] || false}
            playSound={playSound}
            myPs={myState}
            oppPs={oppState}
          />
        )}

        {phase === 'counter_window' && counterState && (
          <CounterOverlay
            counterState={counterState}
            myChars={myRoster}
            myId={currentUserId}
            myName={myName}
            onCounter={handleCounter}
            durationMs={lastTurnResult?.counter_duration_ms || 3000}
          />
        )}

        {reflectFlash && <ReflectFlashOverlay charName={reflectFlash} />}

        {phase === 'dice_roll' && myRollType && isPlayer && (
          <DiceRollOverlay
            rollType={myRollType}
            opponentAlsoRolling={!!oppRollType}
            myRollResult={myRollResult}
            onRoll={handleDiceRoll}
            hasRolled={hasRolled}
          />
        )}

        {gameOver && (
          <GameOverScreen
            players={players}
            currentUserId={currentUserId}
            winnerPlayerId={winnerPlayerId}
            myChars={myRoster}
            oppChars={oppRoster}
            opponentName={oppName}
            onClose={onClose}
            myStats={playerStats[myIdStr]}
            oppStats={opponentIdStr ? playerStats[opponentIdStr] : null}
          />
        )}

        {!isPlayer && (phase === 'battle' || phase === 'counter_window') && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4 z-40">
            {players.map(p => (
              <button
                key={p.user_id}
                onClick={() => onMove({ move_type: 'hype', move_data: { target_player_id: p.user_id } })}
                className="px-4 py-2 rounded-full bg-purple-900/80 border border-purple-600 text-purple-200 text-sm hover:bg-purple-800 transition-colors"
              >
                🔥 Hype {p.username}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
