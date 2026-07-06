import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../services/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

// ── Tier definitions (mirror Go) ──────────────────────────────────────────────
const TIERS = [
  { name: 'Regular',     budget: 300, hp: 100 },
  { name: 'Street',      budget: 350, hp: 150 },
  { name: 'City-Wide',   budget: 400, hp: 200 },
  { name: 'Continental', budget: 450, hp: 250 },
  { name: 'Global',      budget: 500, hp: 300 },
  { name: 'Universal',   budget: 550, hp: 350 },
];

const TIER_COLORS = {
  'Regular':     'from-gray-500 to-gray-700',
  'Street':      'from-green-500 to-green-700',
  'City-Wide':   'from-blue-500 to-blue-700',
  'Continental': 'from-purple-500 to-purple-700',
  'Global':      'from-orange-500 to-orange-800',
  'Universal':   'from-yellow-400 to-red-600',
};

// ── Subcomponents ─────────────────────────────────────────────────────────────

function HPBar({ current, max, label }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const color = pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-yellow-400' : 'bg-red-500';
  return (
    <div className="w-full">
      {label && <p className="text-xs text-gray-400 mb-0.5">{label}</p>}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-2.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full ${color} rounded-full transition-all duration-500`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-white font-mono w-14 text-right">{current}/{max}</span>
      </div>
    </div>
  );
}

function CharacterCard({ char, selected, onClick, showMoves = false, disabled = false, moveType, onMoveSelect, selectedMoveIdx }) {
  const tier = TIERS.find(t => t.name === char.tier) || TIERS[0];
  const gradient = TIER_COLORS[char.tier] || 'from-gray-600 to-gray-800';
  const moves = moveType === 'attack' ? (char.attacks || []) : (char.defenses || []);

  return (
    <div
      className={`relative rounded-xl overflow-hidden border-2 transition-all duration-200 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.02]'} ${selected ? 'border-purple-400 shadow-[0_0_16px_rgba(168,85,247,0.5)]' : 'border-gray-600'}`}
      onClick={!disabled ? onClick : undefined}
    >
      {/* Header gradient */}
      <div className={`bg-gradient-to-r ${gradient} p-3`}>
        <div className="flex items-center gap-2">
          {char.image_url ? (
            <img src={char.image_url} alt={char.name} className="w-12 h-12 rounded-lg object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-black/30 flex items-center justify-center text-2xl">⚔️</div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm truncate">{char.name}</p>
            <p className="text-xs text-white/70">{char.tier}</p>
          </div>
          {char.defeated && (
            <span className="text-xs bg-red-600 text-white px-1.5 py-0.5 rounded-full">💀 KO</span>
          )}
        </div>
      </div>

      {/* HP */}
      <div className="bg-gray-800 px-3 py-2">
        <HPBar current={char.hp} max={char.max_hp} />
      </div>

      {/* Moves — shown during battle for move selection */}
      {showMoves && !char.defeated && (
        <div className="bg-gray-850 border-t border-gray-700 px-3 py-2 space-y-1">
          {moves.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No {moveType} moves</p>
          ) : moves.map((mv, idx) => (
            <button
              key={idx}
              onClick={e => { e.stopPropagation(); onMoveSelect && onMoveSelect(idx); }}
              className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${selectedMoveIdx === idx ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}
            >
              <span className="font-medium">{mv.name}</span>
              <span className="float-right text-gray-400">{mv.power} pts</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TurnTimer({ seconds }) {
  const danger = seconds <= 3;
  return (
    <div className={`flex items-center justify-center w-12 h-12 rounded-full border-4 font-bold text-lg transition-colors ${danger ? 'border-red-500 text-red-400 animate-pulse' : 'border-purple-500 text-white'}`}>
      {seconds}
    </div>
  );
}

// ── Building phase — character creator ───────────────────────────────────────

function CharacterBuilder({ onSubmit, roomId, sessionId, existingCount }) {
  const [name, setName]         = useState('');
  const [tier, setTier]         = useState(TIERS[0]);
  const [attacks, setAttacks]   = useState([{ name: '', power: '' }]);
  const [defenses, setDefenses] = useState([{ name: '', power: '' }]);
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  const usedBudget = [...attacks, ...defenses].reduce((sum, m) => sum + (parseInt(m.power) || 0), 0);
  const remaining  = tier.budget - usedBudget;
  const canSubmit  = name.trim() && usedBudget > 0 && remaining >= 0;

  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Max 5 MB'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('session_id', String(sessionId));
      fd.append('asset_type', 'character_image');
      const res = await apiClient.post(`/api/rooms/${roomId}/game-assets`, fd, {
        headers: { 'Content-Type': undefined },
      });
      setImageUrl(res.data.url);
    } catch { toast.error('Image upload failed'); } finally { setUploading(false); }
  }

  function addMove(type) {
    if (type === 'attack') setAttacks(a => [...a, { name: '', power: '' }]);
    else setDefenses(d => [...d, { name: '', power: '' }]);
  }

  function updateMove(type, idx, field, val) {
    if (type === 'attack') {
      setAttacks(a => a.map((m, i) => i === idx ? { ...m, [field]: val } : m));
    } else {
      setDefenses(d => d.map((m, i) => i === idx ? { ...m, [field]: val } : m));
    }
  }

  function removeMove(type, idx) {
    if (type === 'attack') setAttacks(a => a.filter((_, i) => i !== idx));
    else setDefenses(d => d.filter((_, i) => i !== idx));
  }

  function handleSubmit() {
    const validAttacks  = attacks.filter(m => m.name.trim() && parseInt(m.power) > 0);
    const validDefenses = defenses.filter(m => m.name.trim() && parseInt(m.power) > 0);
    if (validAttacks.length === 0 && validDefenses.length === 0) {
      toast.error('Add at least one move'); return;
    }
    onSubmit({
      id:        crypto.randomUUID(),
      name:      name.trim(),
      tier:      tier.name,
      image_url: imageUrl,
      attacks:   validAttacks.map(m => ({ name: m.name.trim(), power: parseInt(m.power), move_type: 'attack' })),
      defenses:  validDefenses.map(m => ({ name: m.name.trim(), power: parseInt(m.power), move_type: 'defense' })),
    });
  }

  return (
    <div className="space-y-4 p-4 bg-gray-800 rounded-xl max-h-[70vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-white">Character {existingCount + 1} / 3</h3>
        <span className={`text-sm font-mono px-2 py-0.5 rounded-full ${remaining < 0 ? 'bg-red-600' : remaining < 50 ? 'bg-yellow-600' : 'bg-green-700'} text-white`}>
          {remaining >= 0 ? `${remaining} pts left` : `${Math.abs(remaining)} over budget!`}
        </span>
      </div>

      {/* Name */}
      <input
        className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        placeholder="Character name"
        value={name} onChange={e => setName(e.target.value)}
      />

      {/* Tier */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Tier</label>
        <div className="grid grid-cols-3 gap-1.5">
          {TIERS.map(t => (
            <button
              key={t.name}
              onClick={() => setTier(t)}
              className={`text-xs px-2 py-1.5 rounded-lg border transition-colors ${tier.name === t.name ? 'border-purple-400 bg-purple-900/40 text-white' : 'border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              <div>{t.name}</div>
              <div className="text-gray-400">{t.hp} HP · {t.budget}pts</div>
            </button>
          ))}
        </div>
      </div>

      {/* Image */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Image (optional)</label>
        <div className="flex items-center gap-2">
          {imageUrl && <img src={imageUrl.startsWith('http') ? imageUrl : `${API_BASE_URL}${imageUrl}`} alt="" className="w-12 h-12 rounded-lg object-cover" />}
          <label className={`cursor-pointer px-3 py-1.5 rounded-lg text-sm ${uploading ? 'bg-gray-600 text-gray-400' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}>
            {uploading ? 'Uploading…' : imageUrl ? 'Change' : '+ Add Image'}
            <input type="file" accept="image/*,image/gif" className="hidden" onChange={handleImageUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      {/* Attacks */}
      <MoveListEditor label="⚔️ Attack Moves" moves={attacks} type="attack" onAdd={() => addMove('attack')} onUpdate={updateMove} onRemove={removeMove} />

      {/* Defenses */}
      <MoveListEditor label="🛡️ Defense Moves" moves={defenses} type="defense" onAdd={() => addMove('defense')} onUpdate={updateMove} onRemove={removeMove} />

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full py-2.5 rounded-xl font-bold bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
      >
        Add Character
      </button>
    </div>
  );
}

function MoveListEditor({ label, moves, type, onAdd, onUpdate, onRemove }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-gray-400">{label}</label>
        {moves.length < 5 && (
          <button onClick={onAdd} className="text-xs text-purple-400 hover:text-purple-300">+ Add</button>
        )}
      </div>
      <div className="space-y-1.5">
        {moves.map((m, i) => (
          <div key={i} className="flex gap-1.5 items-center">
            <input
              className="flex-1 bg-gray-700 text-white rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
              placeholder="Move name"
              value={m.name} onChange={e => onUpdate(type, i, 'name', e.target.value)}
            />
            <input
              type="number" min="1"
              className="w-16 bg-gray-700 text-white rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
              placeholder="pts"
              value={m.power} onChange={e => onUpdate(type, i, 'power', e.target.value)}
            />
            {moves.length > 0 && (
              <button onClick={() => onRemove(type, i)} className="text-gray-500 hover:text-red-400 text-xs">✕</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VSBattleGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const [turnTimeLeft, setTurnTimeLeft]     = useState(10);
  const [counterTimeLeft, setCounterTimeLeft] = useState(0);
  const [selectedChar, setSelectedChar]     = useState(null);
  const [selectedMoveType, setSelectedMoveType] = useState('attack');
  const [selectedMoveIdx, setSelectedMoveIdx]   = useState(null);
  const [locked, setLocked]                 = useState(false);
  const [counterOption, setCounterOption]   = useState(null); // 'reflect' | 'attack'
  const [counterMoveIdx, setCounterMoveIdx] = useState(null);
  const [hypeCount, setHypeCount]           = useState(0);
  const [lastResult, setLastResult]         = useState(null);
  const [floatingDamage, setFloatingDamage] = useState([]);

  const timerRef        = useRef(null);
  const counterTimerRef = useRef(null);
  const isPlayerRef     = useRef(false);

  const gs    = gameState?.game_state || gameState || {};
  const phase = gs.phase || 'building';
  const vsPlayers = gs.players || {};
  const hostID = gameState?.host_id;
  const isHost = hostID === currentUserId;

  // Resolve my player state
  const myState   = vsPlayers[String(currentUserId)];
  const isPlayer  = !!myState;
  isPlayerRef.current = isPlayer;

  // Find opponent
  const opponentEntry = Object.entries(vsPlayers).find(([uid]) => Number(uid) !== currentUserId);
  const opponentState = opponentEntry ? opponentEntry[1] : null;
  const opponentUser  = players.find(p => p.user_id === Number(opponentEntry?.[0]));

  const myName = players.find(p => p.user_id === currentUserId)?.username || 'You';
  const oppName = opponentUser?.username || 'Opponent';

  // Turn timer — runs while in battle phase
  useEffect(() => {
    if (phase !== 'battle' || !isPlayer || locked) return;
    setTurnTimeLeft(10);
    timerRef.current = setInterval(() => {
      setTurnTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, gs.turn, isPlayer, locked]);

  // Counter window timer
  useEffect(() => {
    if (phase !== 'counter_window') return;
    const cs = gs.counter_state || {};
    const durationSec = cs.type === 'stalemate' ? 1 : 3;
    setCounterTimeLeft(durationSec);
    counterTimerRef.current = setInterval(() => {
      setCounterTimeLeft(t => {
        if (t <= 1) { clearInterval(counterTimerRef.current); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(counterTimerRef.current);
  }, [phase, gs.counter_state]);

  // Show last turn result
  useEffect(() => {
    const result = gs.last_turn_result;
    if (!result || phase === 'building' || phase === 'confirming') return;
    setLastResult(result);
    // Show floating damage
    if (result.damage > 0) {
      const id = Date.now();
      setFloatingDamage(prev => [...prev, { id, value: result.damage }]);
      setTimeout(() => setFloatingDamage(prev => prev.filter(d => d.id !== id)), 1500);
    }
    // Clear locked state for next turn
    if (phase === 'battle') {
      setLocked(false);
      setSelectedChar(null);
      setSelectedMoveIdx(null);
    }
  }, [gs.last_turn_result, gs.turn]);

  function handleLockMove() {
    if (!selectedChar || selectedMoveIdx === null || locked) return;
    setLocked(true);
    clearInterval(timerRef.current);
    onMove({
      move_type:  'lock_move',
      char_id:    selectedChar.id,
      // note: "move_type" field below is the VS Battle move sub-type (attack/defense),
      // separate from the top-level WS move_type above — backend reads it as data["move_type"]
      vs_move_type: selectedMoveType,
      move_index: selectedMoveIdx,
    });
    toast.success('Move locked!', { duration: 1000 });
  }

  function handleCounterChoice(option) {
    const data = { move_type: 'counter_choice', option };
    if (option === 'attack' && counterMoveIdx !== null) {
      data.move_index = counterMoveIdx;
    }
    setCounterOption(option);
    onMove(data);
    clearInterval(counterTimerRef.current);
  }

  function handleHype(targetUID) {
    setHypeCount(c => c + 1);
    onMove({ move_type: 'hype', target_player_id: targetUID });
  }

  function handleSubmitCharacter(charData) {
    onMove({ move_type: 'submit_character', ...charData });
    toast.success(`${charData.name} added!`);
  }

  function handleConfirmBuilds() {
    onMove({ move_type: 'confirm_builds' });
    toast.success('Build confirmed — waiting for opponent…');
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderBuilding() {
    const myChars = myState?.characters || [];
    const canConfirm = myChars.length > 0 && !myState?.confirmed;
    return (
      <div className="flex flex-col h-full gap-3 p-4 overflow-y-auto">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-1">⚔️ VS Battle — Build Your Team</h2>
          <p className="text-gray-400 text-sm">Create up to 3 characters. Distribute your stat budget across moves.</p>
        </div>

        {/* My roster */}
        {myChars.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Your Roster ({myChars.length}/3)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {myChars.map(c => <CharacterCard key={c.id} char={c} />)}
            </div>
          </div>
        )}

        {/* Opponent status */}
        {opponentState && (
          <div className="flex items-center gap-2 bg-gray-800/60 rounded-xl px-3 py-2 text-sm">
            <span className="text-gray-400">{oppName}:</span>
            <span className="text-white font-medium">{opponentState.characters?.length || 0} character(s) ready</span>
            {opponentState.confirmed && <span className="ml-auto text-green-400 text-xs font-semibold">✓ Confirmed</span>}
          </div>
        )}

        {/* Builder (if still need more chars) */}
        {myChars.length < 3 && !myState?.confirmed && (
          <CharacterBuilder
            onSubmit={handleSubmitCharacter}
            roomId={gameState?.room_id}
            sessionId={gameState?.session_id}
            existingCount={myChars.length}
          />
        )}

        {/* Confirm button */}
        {canConfirm && (
          <button
            onClick={handleConfirmBuilds}
            className="w-full py-3 rounded-xl font-bold bg-green-600 hover:bg-green-500 text-white transition-colors text-lg"
          >
            ✅ Confirm Build
          </button>
        )}

        {myState?.confirmed && (
          <p className="text-center text-green-400 font-semibold">Waiting for {oppName} to confirm…</p>
        )}

        {isHost && (
          <button onClick={onEndGame} className="mt-auto text-xs text-red-400 hover:text-red-300 text-center">
            Cancel Game
          </button>
        )}
      </div>
    );
  }

  function renderConfirming() {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
        <div className="text-5xl animate-bounce">⚔️</div>
        <h2 className="text-2xl font-bold text-white">Both builds confirmed!</h2>
        <p className="text-gray-400">Starting battle…</p>
      </div>
    );
  }

  function renderBattle() {
    const myChars  = myState?.characters  || [];
    const oppChars = opponentState?.characters || [];
    const aliveMyChars  = myChars.filter(c => !c.defeated);
    const aliveOppChars = oppChars.filter(c => !c.defeated);
    const selectedCharObj = selectedChar ? myChars.find(c => c.id === selectedChar.id) || selectedChar : null;
    const canLock = selectedChar && selectedMoveIdx !== null && !locked;
    const cs = gs.counter_state;
    const inCounterWindow = phase === 'counter_window';
    const isCounterActor =
      inCounterWindow &&
      cs &&
      (cs.type === 'stalemate' || Number(cs.defender_user_id) === currentUserId);

    return (
      <div className="flex flex-col h-full select-none">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 bg-gray-900/80">
          <div className="text-sm font-medium text-gray-300">{myName}</div>
          <div className="flex items-center gap-3">
            {!inCounterWindow && isPlayer && (
              <TurnTimer seconds={turnTimeLeft} />
            )}
            {inCounterWindow && (
              <div className="flex items-center gap-1 bg-yellow-600/20 border border-yellow-500 rounded-full px-3 py-1 text-sm text-yellow-300 font-semibold animate-pulse">
                ⚡ Counter {counterTimeLeft}s
              </div>
            )}
          </div>
          <div className="text-sm font-medium text-gray-300">{oppName}</div>
        </div>

        {/* Main arena — Focus mode: my chars left, opponent chars right */}
        <div className="flex-1 flex gap-2 px-3 py-2 overflow-hidden">
          {/* My side */}
          <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto">
            <p className="text-xs text-gray-500 uppercase tracking-wide text-center">Your Team</p>
            {myChars.map(c => (
              <CharacterCard
                key={c.id}
                char={c}
                selected={selectedChar?.id === c.id}
                disabled={c.defeated || locked || inCounterWindow}
                onClick={() => { setSelectedChar(c); setSelectedMoveIdx(null); }}
                showMoves={!locked && !inCounterWindow && isPlayer && selectedChar?.id === c.id}
                moveType={selectedMoveType}
                onMoveSelect={idx => setSelectedMoveIdx(idx)}
                selectedMoveIdx={selectedChar?.id === c.id ? selectedMoveIdx : null}
              />
            ))}
          </div>

          {/* VS divider */}
          <div className="flex flex-col items-center justify-center gap-2 w-12 shrink-0">
            <div className="text-2xl font-black text-gray-600">VS</div>
            {/* Last result */}
            {lastResult && lastResult.damage > 0 && (
              <div className="text-center text-xs text-red-400 font-bold">-{lastResult.damage}</div>
            )}
            {lastResult?.outcome === 'stalemate' && (
              <div className="text-center text-xs text-yellow-400 font-bold">Deflect!</div>
            )}
          </div>

          {/* Opponent side */}
          <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto">
            <p className="text-xs text-gray-500 uppercase tracking-wide text-center">Opponent</p>
            {oppChars.map(c => (
              <CharacterCard key={c.id} char={c} disabled />
            ))}
          </div>
        </div>

        {/* Move type selector + lock */}
        {isPlayer && !locked && !inCounterWindow && (
          <div className="px-4 py-3 bg-gray-900/90 border-t border-gray-700 space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => { setSelectedMoveType('attack'); setSelectedMoveIdx(null); }}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${selectedMoveType === 'attack' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                ⚔️ Attack
              </button>
              <button
                onClick={() => { setSelectedMoveType('defense'); setSelectedMoveIdx(null); }}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${selectedMoveType === 'defense' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                🛡️ Defend
              </button>
            </div>
            {selectedChar && (
              <div className="space-y-1">
                {(selectedMoveType === 'attack' ? selectedChar.attacks : selectedChar.defenses)?.map((mv, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedMoveIdx(idx)}
                    className={`w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${selectedMoveIdx === idx ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}
                  >
                    <span className="font-medium">{mv.name}</span>
                    <span className="float-right text-gray-400 text-xs">{mv.power} pts</span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={handleLockMove}
              disabled={!canLock}
              className="w-full py-2.5 rounded-xl font-bold bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
            >
              {locked ? '✓ Locked' : 'Lock Move'}
            </button>
          </div>
        )}

        {locked && !inCounterWindow && (
          <div className="px-4 py-3 text-center text-green-400 font-semibold text-sm">
            ✓ Move locked — waiting for opponent…
          </div>
        )}

        {/* Counter window overlay */}
        {inCounterWindow && isCounterActor && (
          <div className="px-4 py-3 bg-yellow-900/40 border-t border-yellow-500 space-y-2">
            <p className="text-yellow-300 font-bold text-center text-sm">
              ⚡ Counter Window! ({counterTimeLeft}s)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleCounterChoice('reflect')}
                disabled={!!counterOption}
                className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold"
              >
                🔄 Reflect (2%)
              </button>
              <button
                onClick={() => { if (counterMoveIdx !== null) handleCounterChoice('attack'); else toast('Select a move first', { icon: '⚠️' }); }}
                disabled={!!counterOption}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-sm font-semibold"
              >
                ⚔️ Counter Attack
              </button>
            </div>
            {/* If choosing attack, show move picker */}
            {!counterOption && (
              <div className="space-y-1">
                {(myState?.characters || []).filter(c => !c.defeated).flatMap(c =>
                  (c.attacks || []).map((mv, idx) => ({ charId: c.id, mv, idx }))
                ).slice(0, 5).map(({ charId, mv, idx }) => (
                  <button
                    key={`${charId}-${idx}`}
                    onClick={() => setCounterMoveIdx(idx)}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded-lg ${counterMoveIdx === idx ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-200'}`}
                  >
                    {mv.name} — {mv.power} pts (counter: {Math.max(1, Math.round(mv.power * 0.05))} dmg)
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Hype button (for non-players / spectators) */}
        {!isPlayer && opponentEntry && (
          <div className="px-4 py-3 border-t border-gray-700 flex items-center justify-center gap-3">
            {Object.entries(vsPlayers).map(([uid, ps]) => {
              const u = players.find(p => p.user_id === Number(uid));
              return (
                <button
                  key={uid}
                  onClick={() => handleHype(Number(uid))}
                  className="flex flex-col items-center gap-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm transition-colors"
                >
                  <span>🔥</span>
                  <span className="text-white text-xs">Hype {u?.username || 'Player'}</span>
                  <span className="text-gray-400 text-xs">{ps.hype_meter || 0}/100</span>
                </button>
              );
            })}
          </div>
        )}

        {/* End game (host only) */}
        {isHost && (
          <button onClick={onEndGame} className="text-xs text-red-400 hover:text-red-300 text-center py-1">
            End Game
          </button>
        )}
      </div>
    );
  }

  function renderEnded() {
    const result = gs.last_turn_result || {};
    const winnerID = result.winner_id;
    const isDraw   = !winnerID;
    const iWon     = winnerID === currentUserId;
    const killingBlowURL = gs.killing_blow_url;

    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
        {killingBlowURL && (
          <img
            src={killingBlowURL.startsWith('http') ? killingBlowURL : `${API_BASE_URL}${killingBlowURL}`}
            alt="Killing blow"
            className="w-40 h-40 object-cover rounded-xl shadow-2xl"
          />
        )}
        <div className="text-6xl">
          {isDraw ? '🤝' : iWon ? '🏆' : '💀'}
        </div>
        <div>
          <h2 className="text-3xl font-black text-white">
            {isDraw ? "It's a Draw!" : iWon ? 'Victory!' : 'Defeated!'}
          </h2>
          {!isDraw && (
            <p className="text-gray-400 mt-1">
              {iWon ? 'You won the battle!' : `${oppName} wins!`}
            </p>
          )}
        </div>

        {/* Final rosters */}
        {Object.entries(vsPlayers).map(([uid, ps]) => {
          const u = players.find(p => p.user_id === Number(uid));
          return (
            <div key={uid} className="w-full max-w-sm">
              <p className="text-sm text-gray-400 mb-1 text-left">{u?.username || 'Player'}</p>
              <div className="grid grid-cols-3 gap-2">
                {(ps.characters || []).map(c => (
                  <div key={c.id} className={`rounded-xl p-2 text-center text-xs ${c.defeated ? 'bg-gray-800/50 opacity-50' : 'bg-gray-800'}`}>
                    <div>{c.defeated ? '💀' : '✅'}</div>
                    <div className="text-white font-medium truncate">{c.name}</div>
                    <div className="text-gray-400">{c.hp}/{c.max_hp} HP</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <button onClick={onClose} className="px-8 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition-colors">
          Close
        </button>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="relative flex flex-col h-full bg-gray-900 text-white overflow-hidden">
      {/* Floating damage numbers */}
      {floatingDamage.map(d => (
        <div
          key={d.id}
          className="absolute top-1/3 left-1/2 -translate-x-1/2 text-3xl font-black text-red-400 pointer-events-none animate-bounce z-50"
        >
          -{d.value}
        </div>
      ))}

      {phase === 'building'   && renderBuilding()}
      {phase === 'confirming' && renderConfirming()}
      {(phase === 'battle' || phase === 'counter_window') && renderBattle()}
      {phase === 'ended'      && renderEnded()}

      {/* Fallback for unknown phases */}
      {!['building', 'confirming', 'battle', 'counter_window', 'ended'].includes(phase) && (
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-400">Loading battle…</p>
        </div>
      )}
    </div>
  );
}
