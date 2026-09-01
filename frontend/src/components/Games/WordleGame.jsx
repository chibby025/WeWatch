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
  @keyframes wdlCaretBlink {
    0%, 45% { opacity: 1; }
    50%, 95% { opacity: 0; }
    100% { opacity: 1; }
  }
  @keyframes wdlSmallReveal {
    0%   { transform: scaleY(1); background: #1e1e20; border-color: #3a3a3c; }
    45%  { transform: scaleY(0); background: #1e1e20; border-color: #3a3a3c; }
    55%  { transform: scaleY(0); background: var(--tc);  border-color: var(--tc); }
    100% { transform: scaleY(1); background: var(--tc);  border-color: var(--tc); }
  }
  @keyframes wdlOpponentGlow {
    0%   { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0); }
    15%  { box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.65); }
    100% { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0); }
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

// Compact tile for opponent grids. Mirrors BigTile's flip-reveal animation
// (isNew/animDelay) — previously this had NO animation at all, so a fresh
// opponent guess just silently popped into its final colour with nothing
// drawing the eye to it, which is most of why a first guess landing was easy
// to miss entirely.
function SmallTile({ letter, feedback, isNew, animDelay = 0 }) {
  const hasFb = !!feedback;
  const bg     = hasFb ? TILE_BG[feedback] : '#1e1e20';
  const border = `1.5px solid ${hasFb ? TILE_BG[feedback] : '#3a3a3c'}`;
  const anim   = isNew && hasFb ? `wdlSmallReveal 0.42s ${animDelay}s ease both` : undefined;
  return (
    <div style={{
      width: 26, height: 26,
      background: bg, border,
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 'bold', fontSize: 10, borderRadius: 2, userSelect: 'none',
      animation: anim, '--tc': TILE_BG[feedback] || '#3a3a3c',
    }}>
      {letter}
    </div>
  );
}

// Tracks a per-opponent guess count to detect a fresh guess landing, and
// drives a short "flash" window used to (a) pick which row gets the tile
// reveal animation and (b) pulse a highlight glow + scroll the opponent's
// whole card into view so a new move never gets lost — even the very first
// guess, which previously rendered with zero animation and (on a short
// mobile viewport, stacked below other opponents) could land entirely off
// screen with nothing to draw attention to it.
function useNewGuessFlash(guessesLength) {
  const [newRow, setNewRow] = useState(-1);
  const [flash, setFlash]   = useState(false);
  const prevLenRef = useRef(-1);

  useEffect(() => {
    if (prevLenRef.current === -1) {
      prevLenRef.current = guessesLength; // baseline — don't animate on mount
      return;
    }
    if (guessesLength > prevLenRef.current) {
      const row = guessesLength - 1;
      setNewRow(row);
      setFlash(true);
      prevLenRef.current = guessesLength;
      const t1 = setTimeout(() => setNewRow(-1), WORD_LEN * 84 + 400);
      const t2 = setTimeout(() => setFlash(false), 1600);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    prevLenRef.current = guessesLength;
  }, [guessesLength]);

  return { newRow, flash };
}

function OpponentGrid({ pKey, guesses, results, eliminated, winnerKey, username }) {
  const elim = eliminated.includes(pKey);
  const won  = winnerKey === pKey;
  const { newRow, flash } = useNewGuessFlash(guesses.length);
  const cardRef = useRef(null);

  useEffect(() => {
    if (flash) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [flash]);

  return (
    <div
      ref={cardRef}
      style={{
        display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center',
        borderRadius: 6, padding: 4,
        animation: flash ? 'wdlOpponentGlow 1.6s ease-out' : undefined,
      }}
    >
      <p style={{
        fontSize: 10, fontWeight: 600, marginBottom: 2,
        color: won ? '#538d4e' : elim ? '#f87171' : flash ? '#22d3ee' : '#9ca3af',
        transition: 'color 0.3s',
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
              isNew={row === newRow}
              animDelay={col * 0.08}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Mobile-only opponent display: each of the up-to-MAX_GUESSES rows (normally
// stacked vertically, 6 rows tall) is "unrolled" into one continuous
// horizontally-scrollable strip instead — reclaims the vertical space the
// original OpponentGrid used, which on mobile stacked below the player's own
// grid and pushed everything (keyboard/controls) further down the screen.
// Auto-scrolls to reveal the newest completed guess the moment this opponent
// submits one, so you don't have to manually swipe to see what just happened.
function OpponentStripMobile({ pKey, guesses, results, eliminated, winnerKey, username }) {
  const elim = eliminated.includes(pKey);
  const won  = winnerKey === pKey;
  const scrollRef = useRef(null);
  const cardRef = useRef(null);
  const { newRow, flash } = useNewGuessFlash(guesses.length);

  useEffect(() => {
    if (newRow < 0) return;
    // Bring the whole card into view vertically first (it may be stacked
    // below other opponents, off the bottom of a short mobile screen).
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const t = setTimeout(() => {
      if (newRow === 0) {
        // The very first guess should just sit at its natural, fully-visible
        // position (scrollLeft 0) — nothing to scroll INTO view yet, since
        // it's the leftmost content. Explicit here rather than relying on
        // scrollIntoView's default alignment, so "1st box fully visible" is
        // guaranteed rather than merely likely.
        scrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        const newestGroup = scrollRef.current?.children?.[newRow];
        newestGroup?.scrollIntoView({ behavior: 'smooth', inline: 'end', block: 'nearest' });
      }
    }, 220);
    return () => clearTimeout(t);
  }, [newRow]);

  return (
    <div
      ref={cardRef}
      style={{
        display: 'flex', flexDirection: 'column', gap: 2, width: '100%', minWidth: 0,
        borderRadius: 6, padding: 4,
        animation: flash ? 'wdlOpponentGlow 1.6s ease-out' : undefined,
      }}
    >
      <p style={{
        fontSize: 10, fontWeight: 600,
        color: won ? '#538d4e' : elim ? '#f87171' : flash ? '#22d3ee' : '#9ca3af',
        transition: 'color 0.3s',
      }}>
        {username} {won ? '🏆' : elim ? '💀' : ''}
      </p>
      <div
        ref={scrollRef}
        style={{
          display: 'flex', gap: 10, width: '100%', minWidth: 0, overflowX: 'auto',
          scrollSnapType: 'x proximity', paddingBottom: 2, WebkitOverflowScrolling: 'touch',
          // Explicit touch-action so a horizontal drag is unambiguously
          // claimed by this strip instead of being arbitrated against the
          // page's own vertical overflow-y-auto scroller. overscrollBehaviorX
          // stops the drag from chaining into the outer scroller once this
          // strip hits its own scroll boundary.
          //
          // minWidth: 0 on this div AND its parent (and the "others" wrapper
          // one level further up, in the main render) is the actual fix for
          // both "swipe doesn't work" and "1st box hidden": a flex item's
          // default min-width is `auto`, meaning it refuses to shrink below
          // its content's natural width. Without minWidth:0 at every level,
          // this div's true rendered width was being pushed out to match its
          // own unwrapped content (~878px for 6 guess rows) instead of
          // clamping to the actual viewport — which the ancestor row's
          // alignItems:'center' (the cross-axis on mobile's
          // flexDirection:'column') then centered, pushing roughly half of
          // that width off BOTH edges of the real viewport. The overflow
          // never landed inside THIS div's own overflowX:'auto' — from this
          // div's own perspective it was already exactly as wide as its
          // content, so there was nothing to scroll, and no swipe gesture
          // had anything to act on. With minWidth:0 restored, this div
          // actually clamps to its real available width, the excess content
          // becomes genuine internal overflow, and both the swipe and the
          // "1st box fully visible at rest" behavior work as intended.
          touchAction: 'pan-x',
          overscrollBehaviorX: 'contain',
        }}
      >
        {Array.from({ length: MAX_GUESSES }, (_, row) => (
          <div key={row} style={{ display: 'flex', gap: 2, flexShrink: 0, scrollSnapAlign: 'end' }}>
            {Array.from({ length: WORD_LEN }, (_, col) => (
              <SmallTile
                key={col}
                letter={guesses[row]?.[col] || ''}
                feedback={results[row]?.[col] || ''}
                isNew={row === newRow}
                animDelay={col * 0.08}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WordleGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult, onPlayAgain }) {
  const [currentInput, setInput]   = useState('');
  const [shake, setShake]          = useState(false);
  const [message, setMessage]      = useState('');
  const [animRow, setAnimRow]      = useState(-1);
  const [bounceRow, setBounceRow]  = useState(-1);
  const [popSet, setPopSet]        = useState(new Set());
  const [hintPending, setHintPending] = useState(false);
  // Tracks whether the hidden native-keyboard input currently has focus —
  // drives the mobile "tap to type" control's cursor/box preview so tapping
  // it shows an active input state immediately, before any letter is typed.
  const [isInputFocused, setIsInputFocused] = useState(false);

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
      // The hidden native input (see nativeInputRef below) has its own
      // onChange/onKeyDown handling every keystroke while it's focused — a
      // real keydown bubbles up to window regardless of which element
      // received it, so without this guard every letter/backspace/enter got
      // processed TWICE whenever that input had focus (typing "D" produced
      // "DD", backspace deleted two characters, Enter could double-submit).
      // Checking document.activeElement directly (not React state) avoids
      // any risk of a stale/lagging focus flag at the exact moment a
      // keystroke fires.
      if (document.activeElement === nativeInputRef.current) return;
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
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => setIsInputFocused(false)}
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
          secondaryAction={(gameState?.host_id ?? players?.[0]?.user_id) === currentUserId && onPlayAgain ? { label: 'Play Again 🔄', onClick: onPlayAgain } : undefined}
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
            {!isOver && (
              <button onClick={onEndGame} className="px-2.5 py-1 bg-red-900 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-colors">
                End Game
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

        {/* Grids row — vertical on mobile, horizontal on desktop.
            width/minWidth: 0 here too (same reasoning as the "others"
            wrapper and OpponentStripMobile's own strip below) — this row is
            itself a flex item of the top-level overlay, which also uses
            alignItems:'center' on its cross axis. Without an explicit width
            bound + minWidth:0 here, this row's own shrink-to-fit sizing
            could defer to its widest descendant's natural content width
            (the opponent strip's ~878px) rather than the real viewport,
            reintroducing the exact same off-screen/unswipeable bug one
            level higher up the tree. */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 10 : 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8, width: '100%', minWidth: 0 }}>

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

          {/* Opponents — a horizontally-swipeable strip per opponent on
              mobile (see OpponentStripMobile), the original vertical 6-row
              grid unchanged on desktop. alignSelf: 'stretch' overrides the
              row's own alignItems: 'center' so this container actually gets
              the full width it needs to scroll within, instead of shrinking
              to its content like a centered child normally would. */}
          {others.length > 0 && (
            <div
              className={isMobile ? 'flex flex-col gap-4' : 'flex flex-col gap-5'}
              // minWidth: 0 is the actual fix for "1st guess box hidden /
              // can't swipe" — a flex item's default min-width is `auto`,
              // meaning it refuses to shrink below its CONTENT's natural
              // width. Without this, this wrapper's true width was being
              // forced up to the strip's full unscrolled content width
              // (~878px, 6 guess rows), which the parent row's
              // alignItems:'center' (the cross-axis on mobile's
              // flexDirection:'column') then centered — pushing roughly half
              // of that width off BOTH edges of the actual viewport, with
              // nothing declaring itself the horizontal-scroll owner at that
              // point, so guess #1 (leftmost) ended up off-screen with no
              // swipe able to reach it. minWidth: 0 lets this wrapper
              // actually shrink to 100% of its real parent width, so the
              // overflow is forced down into OpponentStripMobile's own
              // overflowX:'auto' div instead, where it becomes real,
              // touch-scrollable content.
              style={isMobile ? { width: '100%', minWidth: 0, alignSelf: 'stretch' } : undefined}
            >
              {others.map(p => {
                const pKey = String(p.user_id);
                const commonProps = {
                  pKey,
                  guesses: toStringArray(gs?.guesses?.[pKey]),
                  results: toStringArray(gs?.results?.[pKey]),
                  eliminated,
                  winnerKey,
                  username: p.username,
                };
                return isMobile
                  ? <OpponentStripMobile key={pKey} {...commonProps} />
                  : <OpponentGrid key={pKey} {...commonProps} />;
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
              </div>
            )}

            {/* Keyboard — native device keyboard on mobile (letter grid
                removed to reclaim vertical space); always-visible on-screen
                keyboard unchanged on desktop */}
            {isMobile ? (
              /* Mobile: Delete | tap-to-type | Enter — letters come from the
                 device's own keyboard (auto-opened on mount where the browser
                 allows it, or via tapping the grid/this strip otherwise).
                 Stretched to use most of the viewport width (was capped at a
                 narrow 340px) with larger icons, so the whole strip is a
                 comfortable, easy-to-hit target on a real phone. */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', width: '100%', maxWidth: Math.min(460, vw - 16), padding: '0 4px' }}>
                {hintData && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#22d3ee', fontSize: 11, fontWeight: 600 }}>
                    <span>💡 Position {hintData.position + 1} is</span>
                    <span style={{ background: '#0891b2', color: '#fff', borderRadius: 3, padding: '1px 7px', fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>
                      {hintData.letter}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', width: '100%' }}>
                  <button
                    onPointerDown={e => { e.preventDefault(); pressKey('⌫'); }}
                    style={{
                      width: 58, height: 68, background: '#818384', borderRadius: 8, border: 'none',
                      color: '#fff', fontWeight: 700, fontSize: 26, cursor: 'pointer', userSelect: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}
                  >⌫</button>
                  {/* Live preview of what's being typed on the native keyboard — the
                      Wordle grid up top can end up hidden behind the on-screen keyboard
                      once it opens, so this stays visible right next to the controls.
                      Tapping focuses the hidden input immediately (isInputFocused=true)
                      and switches straight to a boxed preview with a blinking caret at
                      the next-to-type position — shows an active "you're typing now"
                      state even before the first letter lands, not just once
                      currentInput has content. Each typed letter appears in its own
                      corresponding box, mirroring the same currentInput state the main
                      grid's current row already reads from. */}
                  <button
                    onPointerDown={e => { e.preventDefault(); focusNativeInput(); }}
                    style={{
                      flex: 1, height: 68, background: '#2a2a2c',
                      borderRadius: 8, border: `1px solid ${isInputFocused ? '#888' : '#444'}`,
                      cursor: 'pointer', userSelect: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: 0, padding: '0 6px',
                    }}
                  >
                    {(isInputFocused || currentInput) ? (
                      <div style={{ display: 'flex', gap: 4, width: '100%', justifyContent: 'center' }}>
                        {Array.from({ length: WORD_LEN }, (_, i) => currentInput[i] || '').map((ch, i) => {
                          const isCaretPos = isInputFocused && i === currentInput.length;
                          return (
                            <div key={i} style={{
                              width: 30, height: 40, borderRadius: 4,
                              background: '#121213',
                              border: `2px solid ${ch ? '#888' : isCaretPos ? '#22d3ee' : '#3a3a3c'}`,
                              color: '#fff', fontWeight: 700, fontSize: 20,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              {ch || (isCaretPos ? (
                                <span style={{ width: 2, height: 20, background: '#22d3ee', animation: 'wdlCaretBlink 1s step-end infinite' }} />
                              ) : '')}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: '#9ca3af' }}>
                        <span style={{ fontSize: 16 }}>⌨️</span><span>Tap to type</span>
                      </div>
                    )}
                  </button>
                  <button
                    onPointerDown={e => { e.preventDefault(); pressKey('ENTER'); }}
                    style={{
                      width: 58, height: 68, background: '#538d4e', borderRadius: 8, border: 'none',
                      color: '#fff', fontWeight: 700, fontSize: 32, cursor: 'pointer', userSelect: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}
                  >↵</button>
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
