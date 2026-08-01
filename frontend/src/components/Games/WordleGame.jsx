import { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

const MAX_GUESSES = 6;
const WORD_LEN    = 5;

const KEYBOARD_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫'],
];

const TILE_BG = { G: '#538d4e', Y: '#b59f3b', X: '#3a3a3c' };
const KEY_BG  = { G: '#538d4e', Y: '#b59f3b', X: '#3a3a3c', H: '#0891b2' }; // H = hint (cyan)

const CSS = `
  @keyframes wdlReveal {
    0%   { transform: scaleY(1); background: #121213; border-color: #555; }
    45%  { transform: scaleY(0); background: #121213; border-color: #555; }
    55%  { transform: scaleY(0); background: var(--tc);  border-color: var(--tc); }
    100% { transform: scaleY(1); background: var(--tc);  border-color: var(--tc); }
  }
  @keyframes wdlPop {
    0%,100% { transform: scale(1);    }
    50%     { transform: scale(1.12); }
  }
  @keyframes wdlShake {
    0%,100% { transform: translateX(0);    }
    20%,60% { transform: translateX(-7px); }
    40%,80% { transform: translateX(7px);  }
  }
  @keyframes wdlBounce {
    0%,100% { transform: translateY(0);    }
    40%     { transform: translateY(-18px);}
  }
`;

// Tile for the main (self) grid
function BigTile({ letter, feedback, isCurrent, isNew, animDelay, isPop, size = 62, fontSize = 24 }) {
  const hasFb = !!feedback;
  const bg     = hasFb ? TILE_BG[feedback] : '#121213';
  const border = hasFb
    ? `2px solid ${TILE_BG[feedback]}`
    : isCurrent && letter ? '2px solid #999' : '2px solid #3a3a3c';

  const anim = isNew && hasFb
    ? `wdlReveal 0.5s ${animDelay}s ease both`
    : isPop && !hasFb
    ? 'wdlPop 0.08s ease'
    : undefined;

  return (
    <div style={{
      width: size, height: size, background: bg, border,
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 'bold', fontSize, borderRadius: 3,
      userSelect: 'none', transition: 'border-color 0.1s',
      animation: anim, '--tc': TILE_BG[feedback] || '#3a3a3c',
      flexShrink: 0,
    }}>
      {letter}
    </div>
  );
}

// Compact tile for opponent grids
function SmallTile({ letter, feedback }) {
  const hasFb = !!feedback;
  return (
    <div style={{
      width: 26, height: 26,
      background: hasFb ? TILE_BG[feedback] : '#1e1e20',
      border: `1.5px solid ${hasFb ? TILE_BG[feedback] : '#3a3a3c'}`,
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 'bold', fontSize: 10, borderRadius: 2, userSelect: 'none',
    }}>
      {letter}
    </div>
  );
}

function OpponentGrid({ pKey, guesses, results, eliminated, winnerKey, username }) {
  const elim = eliminated.includes(pKey);
  const won  = winnerKey === pKey;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
      <p style={{
        fontSize: 10, fontWeight: 600, marginBottom: 2,
        color: won ? '#538d4e' : elim ? '#f87171' : '#9ca3af',
      }}>
        {username} {won ? '🏆' : elim ? '💀' : ''}
      </p>
      {Array.from({ length: MAX_GUESSES }, (_, row) => (
        <div key={row} style={{ display: 'flex', gap: 2 }}>
          {Array.from({ length: WORD_LEN }, (_, col) => (
            <SmallTile
              key={col}
              letter={guesses[row]?.[col] || ''}
              feedback={results[row]?.[col] || ''}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function WordleGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const [currentInput, setInput]   = useState('');
  const [shake, setShake]          = useState(false);
  const [message, setMessage]      = useState('');
  const [animRow, setAnimRow]      = useState(-1);
  const [bounceRow, setBounceRow]  = useState(-1);
  const [popSet, setPopSet]        = useState(new Set());
  const [hintPending, setHintPending] = useState(false);

  // Read directly from props — no useState copy, avoids the one-render-behind bug
  const gs = gameState?.game_state;

  const myKey     = String(currentUserId);
  const myGuesses = toStringArray(gs?.guesses?.[myKey]);
  const myResults = toStringArray(gs?.results?.[myKey]);
  const eliminated= toStringArray(gs?.eliminated);
  const isElim    = eliminated.includes(myKey);
  const isOver    = ['finished','completed','forfeited'].includes(gameState?.status);
  const phase     = gs?.phase || 'playing';
  const secret    = isOver ? (gs?.secret || '') : '';
  const winnerKey = isOver ? String(gs?.winner_id || gameState?.winner_id || '') : '';
  const winner    = winnerKey ? players.find(p => String(p.user_id) === winnerKey) : null;

  // Hint state — derived from game_state so it persists across reconnects
  const hintRaw  = gs?.hints?.[myKey];
  const hintData = hintRaw
    ? { position: Number(hintRaw.position), letter: String(hintRaw.letter) }
    : null;
  const hintUsed = !!hintData;

  // Keyboard colour hints
  const letterStatus = {};
  myGuesses.forEach((word, g) => {
    const res = myResults[g] || '';
    for (let i = 0; i < WORD_LEN; i++) {
      const ch = word[i], fb = res[i], cur = letterStatus[ch];
      if (cur !== 'G' && (fb === 'G' || (!cur && (fb === 'Y' || fb === 'X')))) {
        letterStatus[ch] = fb;
      }
    }
  });

  // Track previous guess count to detect new submissions
  const prevLenRef = useRef(-1);
  useEffect(() => {
    const len = myGuesses.length;
    if (prevLenRef.current === -1) {
      prevLenRef.current = len; // baseline — don't animate existing rows on mount
      return;
    }
    if (len > prevLenRef.current) {
      const newRow = len - 1;
      setAnimRow(newRow);
      prevLenRef.current = len;
      const t = setTimeout(() => setAnimRow(-1), WORD_LEN * 500 + 300);
      return () => clearTimeout(t);
    }
  }, [myGuesses.length]);

  // Bounce the winning row after its reveal animation finishes
  useEffect(() => {
    if (isOver && winnerKey === myKey && myGuesses.length > 0) {
      const t = setTimeout(() => setBounceRow(myGuesses.length - 1), WORD_LEN * 500 + 250);
      return () => clearTimeout(t);
    }
  }, [isOver]);

  // Keyboard handler via ref to avoid stale closures
  const inputRef    = useRef(currentInput);
  const isOverRef   = useRef(isOver);
  const isElimRef   = useRef(isElim);
  const phaseRef    = useRef(phase);
  const onMoveRef   = useRef(onMove);
  inputRef.current  = currentInput;
  isOverRef.current = isOver;
  isElimRef.current = isElim;
  phaseRef.current  = phase;
  onMoveRef.current = onMove;

  const pressKey = useCallback((key) => {
    if (isOverRef.current || isElimRef.current || phaseRef.current !== 'playing') return;
    if (key === '⌫' || key === 'BACKSPACE') {
      setInput(p => p.slice(0, -1));
    } else if (key === 'ENTER') {
      const word = inputRef.current;
      if (word.length !== WORD_LEN) {
        setMessage('Not enough letters');
        setShake(true);
        setTimeout(() => { setShake(false); setMessage(''); }, 700);
        return;
      }
      onMoveRef.current({ move_type: 'guess', word });
      setInput('');
    } else if (/^[A-Z]$/.test(key)) {
      setInput(p => {
        if (p.length >= WORD_LEN) return p;
        const col = p.length;
        setPopSet(prev => {
          const n = new Set([...prev, col]);
          setTimeout(() => setPopSet(pp => { const x = new Set(pp); x.delete(col); return x; }), 90);
          return n;
        });
        return p + key;
      });
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      pressKey(e.key.toUpperCase() === 'BACKSPACE' ? '⌫' : e.key.toUpperCase());
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pressKey]);

  const myPlayer = players.find(p => p.user_id === currentUserId);
  const others   = players.filter(p => p.user_id !== currentUserId);

  // Responsive sizing — computed once per render from current viewport width.
  // No resize listener needed; game overlays don't reshape after mount.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 500;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const isMobile = vw < 520;
  const isPortrait = vh > vw;
  // Tile: fill ~90% of vw ÷ 5.5 (5 tiles + some breathing room), capped at 62
  const tileSize  = isMobile ? Math.min(62, Math.max(42, Math.floor((vw - 28) / 5.5))) : 62;
  const tileGap   = isMobile ? 4 : 5;
  const tileFontS = Math.round(tileSize * 0.38);
  // Key: tighter gaps and narrower keys on mobile so Q–P all fit in one row.
  // Subtract 16px (the overlay's px-2 padding on both sides) from vw; no upper cap
  // so keys scale up naturally on wider phones instead of being artificially capped.
  const keyGap     = isMobile ? 2 : 4;
  const narrowKeyW = isMobile ? Math.max(22, Math.floor((vw - 16 - 9 * keyGap) / 10)) : 36;
  const wideKeyW   = isMobile ? Math.round(narrowKeyW * 1.45) : 52;
  const keyH       = isMobile ? 44 : 56;

  // Native mobile keyboard: a visually-hidden, fully controlled input whose
  // value mirrors currentInput. Reading the browser's own resolved value via
  // onChange is the standard robust approach for mobile letter-grid games —
  // it sidesteps the well-known unreliability of raw keydown events on many
  // Android software keyboards (autocorrect/predictive keyboards frequently
  // don't fire clean per-letter keydown events for A-Z).
  const nativeInputRef = useRef(null);

  const focusNativeInput = useCallback(() => {
    nativeInputRef.current?.focus();
  }, []);

  // Best-effort auto-open: Android Chrome generally allows a mount-time
  // .focus() to raise the keyboard; iOS Safari blocks .focus() outside a
  // direct user gesture, so this silently no-ops there — iOS users get the
  // keyboard via the tap-to-type affordance on the grid/controls instead.
  useEffect(() => {
    if (isMobile && !isOver && !isElim && phase === 'playing') {
      focusNativeInput();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  const handleNativeInputChange = useCallback((e) => {
    if (isOverRef.current || isElimRef.current || phaseRef.current !== 'playing') return;
    const clean = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, WORD_LEN);
    setInput(prev => {
      if (clean.length > prev.length) {
        const added = [];
        for (let i = prev.length; i < clean.length; i++) added.push(i);
        setPopSet(p => {
          const n = new Set([...p, ...added]);
          setTimeout(() => setPopSet(pp => {
            const x = new Set(pp);
            added.forEach(i => x.delete(i));
            return x;
          }), 90);
          return n;
        });
      }
      return clean;
    });
  }, []);

  const handleNativeSubmit = useCallback((e) => {
    e.preventDefault();
    pressKey('ENTER');
  }, [pressKey]);

  return (
    <>
      <style>{CSS}</style>

      {/* Hidden native-keyboard trigger (mobile). Visually invisible, but a
          real, focusable, controlled <input> — focusing it opens the
          device's own keyboard, and its value is mirrored into currentInput
          via handleNativeInputChange. Kept mounted at all times (not just on
          mobile) so the ref is stable and focus calls never race a mount. */}
      <form onSubmit={handleNativeSubmit} style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        <input
          ref={nativeInputRef}
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          maxLength={WORD_LEN}
          enterKeyHint="done"
          value={currentInput}
          onChange={handleNativeInputChange}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pressKey('ENTER'); } }}
          disabled={isOver || isElim || phase !== 'playing'}
          aria-hidden="true"
          tabIndex={-1}
          style={{ opacity: 0, position: 'absolute', border: 'none', padding: 0 }}
        />
      </form>

      {/* Winner/game-over overlay */}
      {isOver && (
        <GameWinnerBanner
          winner={winner}
          players={players}
          gameType="wordle"
          gameStats={{ lines: [
            { label: 'Guesses used', value: `${myGuesses.length} / ${MAX_GUESSES}` },
            ...(secret ? [{ label: 'The word was', value: secret }] : []),
          ]}}
          onClose={onClose}
          onPostResult={onPostResult}
        />
      )}

      {/* Main game UI — stays mounted so grid colours are visible behind the winner overlay */}
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-start bg-black/90 overflow-y-auto py-3 px-2">

        {/* Header */}
        <div className="w-full flex items-center justify-between mb-2" style={{ maxWidth: isMobile ? '100%' : 384 }}>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🟩</span>
            <span className="text-white font-bold text-lg tracking-wide">Wordle</span>
            {players.length > 1 && (
              <span className="text-gray-500 text-xs">vs</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <GameRulesButton gameType="wordle" />
            {/* Hint button in header on mobile (side panel is hidden) */}
            {isMobile && !isOver && !isElim && (
              <button
                onPointerDown={e => {
                  e.preventDefault();
                  if (!hintUsed && !hintPending) {
                    setHintPending(true);
                    onMoveRef.current({ move_type: 'hint' });
                    setTimeout(() => setHintPending(false), 1500);
                  }
                }}
                disabled={hintUsed || hintPending}
                style={{
                  width: 36, height: 36, borderRadius: 4, border: 'none',
                  background: hintUsed ? '#3a3a3c' : hintPending ? '#0e7490' : '#0891b2',
                  color: '#fff', fontWeight: 700, fontSize: 9,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 1, cursor: hintUsed ? 'not-allowed' : 'pointer',
                  opacity: hintUsed ? 0.55 : 1, userSelect: 'none',
                }}
                title={hintUsed ? 'Hint used' : 'Hint'}
              >
                <span style={{ fontSize: 14 }}>💡</span>
                <span style={{ fontSize: 8 }}>{hintUsed ? 'USED' : 'HINT'}</span>
              </button>
            )}
            <button onClick={isOver ? onClose : onEndGame} className="text-gray-400 hover:text-white p-1">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Toast message (not enough letters etc.) */}
        {message && (
          <div className="bg-white text-gray-900 text-sm font-bold px-4 py-1.5 rounded-full mb-2 shadow-lg">
            {message}
          </div>
        )}

        {/* Grids row — vertical on mobile, horizontal on desktop */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 10 : 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>

          {/* My grid — tappable on mobile to (re)open the native keyboard,
              e.g. if it was dismissed or auto-focus was blocked by the
              browser (iOS Safari requires a direct tap, not a mount effect). */}
          <div
            onClick={isMobile && !isOver && !isElim ? focusNativeInput : undefined}
            style={{
              display: 'flex', flexDirection: 'column', gap: tileGap, alignItems: 'center',
              cursor: isMobile && !isOver && !isElim ? 'text' : 'default',
            }}
          >
            {myPlayer && (
              <p className="text-xs text-gray-400 font-semibold mb-0.5">
                {!isOver
                  ? (isElim ? '💀 Eliminated' : `Guess ${myGuesses.length + 1} / ${MAX_GUESSES}`)
                  : winnerKey === myKey ? '🏆 You won!' : ''}
              </p>
            )}
            {Array.from({ length: MAX_GUESSES }, (_, row) => {
              const guess  = myGuesses[row] || '';
              const result = myResults[row] || '';
              const isCurr = row === myGuesses.length && !isOver && !isElim;
              const isNew  = row === animRow;
              const isBouncing = row === bounceRow;

              return (
                <div
                  key={row}
                  style={{
                    display: 'flex',
                    gap: tileGap,
                    animation:
                      shake && isCurr    ? 'wdlShake 0.55s ease' :
                      isBouncing         ? `wdlBounce 0.8s ease ${0}s` :
                      undefined,
                  }}
                >
                  {Array.from({ length: WORD_LEN }, (_, col) => (
                    <BigTile
                      key={col}
                      letter={isCurr ? (currentInput[col] || '') : (guess[col] || '')}
                      feedback={result[col] || ''}
                      isCurrent={isCurr}
                      isNew={isNew}
                      animDelay={col * 0.3}
                      isPop={isCurr && popSet.has(col)}
                      size={tileSize}
                      fontSize={tileFontS}
                    />
                  ))}
                </div>
              );
            })}
          </div>

          {/* Opponents */}
          {others.length > 0 && (
            <div className="flex flex-col gap-5">
              {others.map(p => {
                const pKey = String(p.user_id);
                return (
                  <OpponentGrid
                    key={pKey}
                    pKey={pKey}
                    guesses={toStringArray(gs?.guesses?.[pKey])}
                    results={toStringArray(gs?.results?.[pKey])}
                    eliminated={eliminated}
                    winnerKey={winnerKey}
                    username={p.username}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Keyboard + controls */}
        {!isOver && !isElim && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>

            {/* Left panel: Hint + End Game — desktop only */}
            {!isMobile && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                <button
                  onPointerDown={e => {
                    e.preventDefault();
                    if (!hintUsed && !hintPending) {
                      setHintPending(true);
                      onMoveRef.current({ move_type: 'hint' });
                      setTimeout(() => setHintPending(false), 1500);
                    }
                  }}
                  disabled={hintUsed || hintPending}
                  style={{
                    width: 46, height: 58, borderRadius: 4, border: 'none',
                    background: hintUsed ? '#3a3a3c' : hintPending ? '#0e7490' : '#0891b2',
                    color: '#fff', fontWeight: 700, fontSize: 10,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 2, cursor: hintUsed ? 'not-allowed' : 'pointer',
                    opacity: hintUsed ? 0.55 : 1, userSelect: 'none',
                  }}
                  title={hintUsed ? 'Hint used' : '1 hint available'}
                >
                  <span style={{ fontSize: 18 }}>💡</span>
                  <span style={{ fontSize: 9 }}>{hintUsed ? 'USED' : 'HINT'}</span>
                </button>
                <button
                  onPointerDown={e => { e.preventDefault(); onEndGame?.(); }}
                  style={{
                    width: 46, height: 58, borderRadius: 4, border: 'none',
                    background: '#7f1d1d', color: '#fff', fontWeight: 700, fontSize: 10,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 2, cursor: 'pointer', userSelect: 'none',
                  }}
                  title="End game for everyone"
                >
                  <X size={15} />
                  <span style={{ fontSize: 9 }}>END</span>
                </button>
              </div>
            )}

            {/* Keyboard — native device keyboard on mobile (letter grid
                removed to reclaim vertical space); always-visible on-screen
                keyboard unchanged on desktop */}
            {isMobile ? (
              /* Mobile: Delete | tap-to-type | Enter — letters come from the
                 device's own keyboard (auto-opened on mount where the browser
                 allows it, or via tapping the grid/this strip otherwise). */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', width: '100%', maxWidth: 340, padding: '0 4px' }}>
                {hintData && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#22d3ee', fontSize: 11, fontWeight: 600 }}>
                    <span>💡 Position {hintData.position + 1} is</span>
                    <span style={{ background: '#0891b2', color: '#fff', borderRadius: 3, padding: '1px 7px', fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>
                      {hintData.letter}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, alignItems: 'stretch', width: '100%' }}>
                  <button
                    onPointerDown={e => { e.preventDefault(); pressKey('⌫'); }}
                    style={{
                      width: 64, height: 48, background: '#818384', borderRadius: 6, border: 'none',
                      color: '#fff', fontWeight: 700, fontSize: 20, cursor: 'pointer', userSelect: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >⌫</button>
                  <button
                    onPointerDown={e => { e.preventDefault(); focusNativeInput(); }}
                    style={{
                      flex: 1, height: 48, background: '#2a2a2c', borderRadius: 6, border: '1px solid #444',
                      color: '#9ca3af', fontWeight: 600, fontSize: 12, cursor: 'pointer', userSelect: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    }}
                  ><span>⌨️</span><span>Tap to type</span></button>
                  <button
                    onPointerDown={e => { e.preventDefault(); pressKey('ENTER'); }}
                    style={{
                      width: 64, height: 48, background: '#538d4e', borderRadius: 6, border: 'none',
                      color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', userSelect: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >↵ ENTER</button>
                </div>
              </div>
            ) : (
              /* Desktop: always full keyboard, no collapse */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                {hintData && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#22d3ee', fontSize: 11, fontWeight: 600 }}>
                    <span>💡 Position {hintData.position + 1} is</span>
                    <span style={{ background: '#0891b2', color: '#fff', borderRadius: 3, padding: '1px 7px', fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>
                      {hintData.letter}
                    </span>
                  </div>
                )}
                {KEYBOARD_ROWS.map((row, ri) => (
                  <div key={ri} style={{ display: 'flex', gap: keyGap }}>
                    {row.map(k => {
                      const st = letterStatus[k];
                      let bg = st ? KEY_BG[st] : '#818384';
                      if (hintData?.letter === k && st !== 'G') bg = KEY_BG.H;
                      const wide = k.length > 1;
                      return (
                        <button
                          key={k}
                          onPointerDown={e => { e.preventDefault(); pressKey(k); }}
                          style={{
                            background: bg, height: keyH, borderRadius: 4, border: 'none',
                            color: '#fff', fontWeight: 700, fontSize: wide ? 11 : 14,
                            width: wide ? wideKeyW : narrowKeyW,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            userSelect: 'none', cursor: 'pointer',
                          }}
                        >{k}</button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* End game only when eliminated (no keyboard) */}
        {!isOver && isElim && (
          <button
            onClick={onEndGame}
            className="mt-3 px-6 py-1.5 bg-red-900 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            End Game
          </button>
        )}
      </div>
    </>
  );
}

// Normalise the various forms the server can return arrays in
function toStringArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(v => (typeof v === 'string' ? v : String(v)));
  }
  return [];
}
