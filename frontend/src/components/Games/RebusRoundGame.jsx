import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  X, Clock, Trophy, Send, ChevronRight, ImageOff,
  ArrowUp, LogIn, LogOut, Power, Check, RefreshCw, Flag, Undo2, DollarSign, Eye,
} from 'lucide-react';
import GameRulesButton from './GameRulesButton';
import GameWinnerBanner from './GameWinnerBanner';

const PUZZLE_SECONDS = 40;
const REBUS_SET_SIZE = 20; // mirrors rebusSetSize in backend/internal/handlers/games/rebus_round.go
const REBUS_LOGO_URL = '/images/rebus-round-logo-v2.webp';

// ── Token-based pattern renderer ─────────────────────────────────────────────
// Puzzles arrive as a flat array of small style-flag tokens (see
// backend/internal/handlers/games/rebus_round.go's RebusToken) rather than
// raw HTML — no dangerouslySetInnerHTML anywhere. `break` starts a new line;
// everything else is a plain styled inline span.
function tokenStyle(tok) {
  const style = {
    // Base bumped 2.3rem -> 3.4rem: a short single-word/plain-text puzzle
    // (e.g. a simple sub/sup or compound entry) used to render as a small
    // line of text lost inside the much taller puzzle card, reading as a big
    // empty gap around it. This is deliberately independent of the image
    // token's own base size (.rebus-img below) — text and photos are sized
    // for their own legibility, not to match each other pixel-for-pixel.
    fontSize: tok.op ? '1.3rem' : `${(tok.scale || 1) * 3.4}rem`,
    fontWeight: tok.op ? 500 : 700,
    color: tok.op ? '#9ca3af' : (tok.color || '#f8fafc'),
    textDecoration: tok.strike ? 'line-through' : undefined,
    lineHeight: 1.15,
    display: 'inline-block',
    whiteSpace: 'pre',
  };
  const transforms = [];
  if (tok.mirror) transforms.push('scaleX(-1)');
  if (tok.flip) transforms.push('rotate(180deg)');
  if (transforms.length) style.transform = transforms.join(' ');
  // Genuinely align to the top/bottom of the shared line height (set by the
  // tallest sibling token on this line) via flexbox align-self, rather than
  // nudging the text a fraction of its OWN font-size via position:relative —
  // relative positioning never removes an element from layout flow, so it
  // left a "ghost" gap in the token's original, un-shifted position. That
  // reserved empty space is what read as padding around a barely-displaced
  // word (e.g. "UP" in "upgrade" wasn't noticeably higher than "GRADE").
  if (tok.sup) style.alignSelf = 'flex-start';
  if (tok.sub) style.alignSelf = 'flex-end';
  return style;
}

// Base image size (before any per-token scale multiplier) — deliberately
// large: puzzle photos need to be legible at a glance on a phone screen, not
// squinted at after a pinch-zoom. Combined with tok.scale via a CSS custom
// property (--rebus-img-scale) rather than a fixed Tailwind size, since scale
// is a continuous multiplier (0.5–2.2) coming straight from the backend, not
// one of a fixed set of breakpoint sizes.
function imageTokenStyle(tok) {
  const scale = tok.scale || 1;
  const style = {
    '--rebus-img-scale': scale,
  };
  if (tok.sup) style.transform = 'translateY(-38%)';
  if (tok.sub) style.transform = 'translateY(38%)';
  return style;
}

// Local icon set for RebusToken.icon — mirrors backend/internal/handlers/
// games/rebus_round.go's own doc comment on rebusMixedCompoundSpecs exactly.
// These render instantly (no live fetch, unlike RebusImageToken below) for
// directional/symbolic word-halves (OUT/IN/UP/OFF/BACK/CHECK/SPIN/END/PAY/
// LOOK) that aren't honestly a "photo of a noun".
const REBUS_ICON_MAP = {
  'arrow-up': ArrowUp,
  'log-in': LogIn,
  'log-out': LogOut,
  power: Power,
  check: Check,
  refresh: RefreshCw,
  flag: Flag,
  undo: Undo2,
  dollar: DollarSign,
  eye: Eye,
};

// Icon/swatch tokens share .rebus-img's sizing (via className) so they sit
// visually consistent alongside a real photo half in the same compound —
// same rounded/bordered card, just an icon or a flat color instead of a
// live-fetched image inside it.
function RebusIconToken({ tok }) {
  const Icon = REBUS_ICON_MAP[tok.icon];
  return (
    <div
      className="rebus-img flex items-center justify-center rounded-2xl border-2 border-gray-700 bg-gray-900 shadow-xl"
      style={imageTokenStyle(tok)}
    >
      {Icon ? <Icon className="w-1/2 h-1/2 text-purple-300" strokeWidth={2} /> : <ImageOff className="w-8 h-8 text-gray-600" />}
    </div>
  );
}

function RebusSwatchToken({ tok }) {
  return (
    <div
      className="rebus-img rounded-2xl border-2 border-gray-700 shadow-xl"
      style={{ ...imageTokenStyle(tok), background: tok.swatch }}
    />
  );
}

const IMAGE_RETRY_MAX = 3;
const IMAGE_RETRY_DELAYS_MS = [500, 1200, 2200]; // increasing backoff per retry

// A real photo fetched live from Pexels (see rebus_round.go's
// rebusPhotoCompoundSpecs/rebusIconSpecs), not readable text — the player
// has to recognize the object. A single load failure used to be permanent
// (no onError handler existed at all) even though most real-world failures
// are a transient network/CDN blip, not a genuinely dead URL — this retries
// with backoff before falling back to a placeholder tile, mirroring Four
// Frames' identical PhotoCell retry logic.
function RebusImageToken({ tok }) {
  const [attempt, setAttempt] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);
  const retryTimerRef = useRef(null);

  useEffect(() => {
    setAttempt(0);
    setGaveUp(false);
    return () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current); };
  }, [tok.image]);

  const handleError = () => {
    if (attempt >= IMAGE_RETRY_MAX) {
      setGaveUp(true);
      return;
    }
    const delay = IMAGE_RETRY_DELAYS_MS[attempt] || IMAGE_RETRY_DELAYS_MS[IMAGE_RETRY_DELAYS_MS.length - 1];
    retryTimerRef.current = setTimeout(() => setAttempt(a => a + 1), delay);
  };

  if (gaveUp) {
    // Same scale/position treatment as a real image, so a failed icon-style
    // puzzle ("big wig") still occupies roughly the right visual space
    // instead of collapsing to nothing.
    return (
      <div
        className="rebus-img flex items-center justify-center rounded-2xl border-2 border-gray-700 bg-gray-900"
        style={imageTokenStyle(tok)}
      >
        <ImageOff className="w-8 h-8 text-gray-600" />
      </div>
    );
  }

  return (
    <img
      key={attempt}
      src={tok.image}
      alt=""
      className="rebus-img object-cover rounded-2xl border-2 border-gray-700 shadow-xl"
      style={imageTokenStyle(tok)}
      onError={handleError}
    />
  );
}

// A sup/sub token's "raised"/"lowered" treatment (tokenStyle's align-self,
// imageTokenStyle's translateY) only has room to act within its own line —
// every sup/sub puzzle in the bank is a lone single-token pattern (confirmed:
// rtGenSup/rtGenSub and every hand-authored rtSup/rtSub/PhotoSup/PhotoSub
// call site produces exactly one token, nothing else sharing that line), so
// that line's own height always exactly equals the token's height — there's
// no spare cross-axis space for align-self to redistribute. The actual
// vertical centering came from one level up (the puzzle card's own
// `items-center` stretching this whole block to its 260-280px min-height and
// centering it) — this decides where THIS component's content sits within
// that full height once the card stops centering it for us (see the
// `items-stretch` card wrapper below).
function patternVerticalJustify(pattern) {
  const hasSup = pattern.some((t) => t.sup);
  const hasSub = pattern.some((t) => t.sub);
  if (hasSup && !hasSub) return 'flex-start';
  if (hasSub && !hasSup) return 'flex-end';
  return 'center';
}

function RebusPatternDisplay({ pattern }) {
  if (!pattern || pattern.length === 0) {
    return <div className="text-gray-600 text-sm">Loading puzzle…</div>;
  }
  const lines = [[]];
  pattern.forEach((tok) => {
    if (tok.break && lines[lines.length - 1].length > 0) lines.push([]);
    lines[lines.length - 1].push(tok);
  });
  return (
    <div
      className="flex flex-col items-center gap-4 py-2 w-full"
      style={{ justifyContent: patternVerticalJustify(pattern) }}
    >
      {lines.map((line, li) => (
        <div key={li} className="flex items-center justify-center gap-3 flex-wrap px-2">
          {line.map((tok, ti) => (
            tok.image ? (
              // For a scaled/positioned icon replacing what would otherwise
              // be styled text (rebusIconSpecs — "big wig", "downtown"), the
              // same size/position trick applies to the image itself via
              // --rebus-img-scale + the translateY set in imageTokenStyle.
              <RebusImageToken key={ti} tok={tok} />
            ) : tok.icon ? (
              <RebusIconToken key={ti} tok={tok} />
            ) : tok.swatch ? (
              <RebusSwatchToken key={ti} tok={tok} />
            ) : (
              <span key={ti} style={tokenStyle(tok)}>{tok.text}</span>
            )
          ))}
        </div>
      ))}
    </div>
  );
}

const GUESS_STUCK_TIMEOUT_MS = 6000;

export default function RebusRoundGame({ gameState, currentUserId, onMove, onClose, onPostResult, gameErrorMsg, gameErrorKey, onPlayAgain }) {
  const [guess, setGuess] = useState('');
  const [timeLeft, setTimeLeft] = useState(PUZZLE_SECONDS);
  const [isSendingNext, setIsSendingNext] = useState(false);
  const [shakeError, setShakeError] = useState(null);
  // True from the moment a guess is sent until either a server response
  // arrives (correct or rejected) or the stuck-detection timeout below fires.
  // Real gap this closes: neither sendGuess nor the input/button had any
  // "in flight" concept before — a player could double-submit before the
  // first response arrived, and on a slow/reconnecting connection (see
  // useWebSocket's own message queueing, which can silently delay a send for
  // as long as a reconnect takes) the button just sat there looking dead
  // with zero indication anything was happening, indistinguishable from the
  // guess never having been sent at all.
  const [isSubmittingGuess, setIsSubmittingGuess] = useState(false);
  const revealSentRef = useRef(false);
  const nextRoundTimeoutRef = useRef(null);
  const lastHandledErrorKeyRef = useRef(gameErrorKey);
  const inputRef = useRef(null);
  const guessStuckTimeoutRef = useRef(null);
  const localShakeTimeoutRef = useRef(null);

  const clearGuessStuckTimeout = () => {
    if (guessStuckTimeoutRef.current) {
      clearTimeout(guessStuckTimeoutRef.current);
      guessStuckTimeoutRef.current = null;
    }
  };

  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'waiting';
  const pattern = gs.current_pattern || [];
  const scores = gs.scores || {};
  const correctOrder = gs.correct_order || [];
  const round = Number(gs.round) || 0;
  const totalPuzzles = Number(gs.total_puzzles) || 0;
  const revealedAnswer = gs.revealed_answer || '';
  const revealedAlternates = gs.revealed_alternates || [];
  const setCompleteNoWinner = !!gs.set_complete_no_winner;

  const players = gameState?.players || [];
  const isHostUser = (gameState?.host_id ?? players[0]?.user_id) === currentUserId;
  const isPlayer = players.some(p => p.user_id === currentUserId);
  const isLastRound = totalPuzzles > 0 && round >= totalPuzzles;

  // Puzzles are gated into sets of REBUS_SET_SIZE (see rebusSetSize in
  // backend/internal/handlers/games/rebus_round.go) — purely a display
  // concern here; the backend is the sole authority on when a set boundary
  // actually triggers a win check. The header shows progress WITHIN the
  // current set (e.g. "Puzzle 7/20"), not against the full 300-puzzle bank —
  // "127/300" is a meaningless number to a player when the game only ever
  // plays in 20-question batches before checking for a winner.
  const currentSetNumber = round > 0 ? Math.ceil(round / REBUS_SET_SIZE) : 1;
  const totalSets = totalPuzzles > 0 ? Math.ceil(totalPuzzles / REBUS_SET_SIZE) : 0;
  const positionInSet = round > 0 ? ((round - 1) % REBUS_SET_SIZE) + 1 : 0;

  const myCorrectEntry = correctOrder.find(e => Number(e.user_id) === currentUserId);
  const alreadySolvedThisRound = !!myCorrectEntry;

  const roundRef = useRef(round);
  useEffect(() => { roundRef.current = round; }, [round]);

  // A fresh server-rejected-guess error → show a quick shake/message near the
  // input, matching WordsmithGame's established gameErrorMsg/gameErrorKey
  // pattern for surfacing per-move rejections without a generic toast.
  useEffect(() => {
    if (gameErrorKey === lastHandledErrorKeyRef.current) return;
    lastHandledErrorKeyRef.current = gameErrorKey;
    // A real response arrived (even one unrelated to this specific guess) —
    // whatever "submitting" state we were in is no longer meaningful, so
    // release the input regardless of whether gameErrorMsg is set below.
    clearGuessStuckTimeout();
    setIsSubmittingGuess(false);
    if (!gameErrorMsg) return;
    // A real server error takes precedence over any pending LOCAL shake
    // (e.g. the "too slow"/"connection may be slow" messages below) — cancel
    // that timer so it can't clear THIS message out from under it later.
    if (localShakeTimeoutRef.current) { clearTimeout(localShakeTimeoutRef.current); localShakeTimeoutRef.current = null; }
    // Strip the backend's generic "move failed: " wrapper (see sendError's
    // call site in websocket_handler.go) — it's meant to give a bare toast
    // context, but reads redundantly right next to the input where the
    // rejection reason is already obviously about this guess.
    setShakeError(gameErrorMsg.replace(/^move failed:\s*/i, ''));
    const t = setTimeout(() => setShakeError(null), 1800);
    return () => clearTimeout(t);
  }, [gameErrorKey, gameErrorMsg]);

  // The guess was accepted (correct_order now includes me) — release the
  // "submitting" state the same way a rejection would, just via the success
  // path instead of gameErrorKey.
  useEffect(() => {
    if (alreadySolvedThisRound) {
      clearGuessStuckTimeout();
      setIsSubmittingGuess(false);
    }
  }, [alreadySolvedThisRound]);

  // Clear the input + stuck-detection guard whenever a new puzzle starts.
  useEffect(() => {
    if (phase === 'puzzle') {
      setGuess('');
      revealSentRef.current = false;
      setTimeLeft(PUZZLE_SECONDS);
      clearGuessStuckTimeout();
      setIsSubmittingGuess(false);
    }
  }, [round, phase]);

  useEffect(() => () => {
    clearGuessStuckTimeout();
    if (localShakeTimeoutRef.current) clearTimeout(localShakeTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (nextRoundTimeoutRef.current) {
      clearTimeout(nextRoundTimeoutRef.current);
      nextRoundTimeoutRef.current = null;
    }
    setIsSendingNext(false);
  }, [round]);

  useEffect(() => () => {
    if (nextRoundTimeoutRef.current) clearTimeout(nextRoundTimeoutRef.current);
  }, []);

  // Countdown + host-side auto-reveal, same shape as TriviaGame's timer.
  useEffect(() => {
    if (phase !== 'puzzle' || !gs.started_at) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - Number(gs.started_at)) / 1000;
      const remaining = Math.max(0, PUZZLE_SECONDS - elapsed);
      setTimeLeft(Math.ceil(remaining));
      if (remaining <= 0 && isHostUser && !revealSentRef.current) {
        revealSentRef.current = true;
        onMove({ move_type: 'reveal' });
      }
    }, 500);
    return () => clearInterval(interval);
  }, [phase, gs.started_at, isHostUser, onMove]);

  const sendStart = () => {
    if (isLastRound && round > 0) return;
    const sentAtRound = round;
    onMove({ move_type: 'rebus_start' });
    setIsSendingNext(true);
    if (nextRoundTimeoutRef.current) clearTimeout(nextRoundTimeoutRef.current);
    // Some puzzles ("photo compounds") fetch a real photo from Pexels live on
    // the backend when this move is processed — a slower, network-dependent
    // step compared to the purely local puzzle picks the rest of the bank
    // uses, so this window matches Four Frames' own identical reasoning.
    nextRoundTimeoutRef.current = setTimeout(() => {
      nextRoundTimeoutRef.current = null;
      setIsSendingNext(false);
      if (roundRef.current === sentAtRound) {
        toast.error('Failed to start the next puzzle — tap the button to retry.');
      }
    }, 8000);
  };

  const localShake = (msg) => {
    setShakeError(msg);
    if (localShakeTimeoutRef.current) clearTimeout(localShakeTimeoutRef.current);
    localShakeTimeoutRef.current = setTimeout(() => setShakeError(null), 1800);
  };

  const sendGuess = () => {
    const trimmed = guess.trim();
    if (!trimmed || !isPlayer || alreadySolvedThisRound || isSubmittingGuess) return;
    if (phase !== 'puzzle') {
      // The round ended (timer ran out, or the host revealed) in the moment
      // between the player typing and hitting send — this is a real,
      // client-side-only case with no server round-trip involved, so there's
      // nothing for the normal gameErrorKey pipeline to report. Without this,
      // the click/Enter silently no-ops here with zero feedback — reading
      // exactly like "the game ignored my wrong answer," even though nothing
      // was ever sent.
      localShake('Too slow — this puzzle already ended!');
      return;
    }
    setIsSubmittingGuess(true);
    onMove({ move_type: 'answer', guess: trimmed });
    // Stuck-detection: if neither a correct-answer state change nor a
    // rejection error arrives within a few seconds, release the input and
    // say so plainly instead of leaving the button looking dead with no
    // explanation — the real gap on a slow/reconnecting connection, where
    // useWebSocket's own message queueing can silently delay a send for as
    // long as the reconnect takes with zero UI feedback otherwise.
    clearGuessStuckTimeout();
    guessStuckTimeoutRef.current = setTimeout(() => {
      guessStuckTimeoutRef.current = null;
      setIsSubmittingGuess(false);
      localShake('Still waiting on your last guess — connection may be slow. Try again.');
    }, GUESS_STUCK_TIMEOUT_MS);
  };

  const sendReveal = () => {
    if (revealSentRef.current) return;
    revealSentRef.current = true;
    onMove({ move_type: 'reveal' });
  };

  const endOrLeave = () => {
    if (isHostUser) onMove({ move_type: 'rebus_end' });
    else onClose();
  };

  const sortedPlayers = [...players].sort(
    (a, b) => (Number(scores[String(b.user_id)]) || 0) - (Number(scores[String(a.user_id)]) || 0)
  );
  const scoreOf = (p) => Number(scores[String(p.user_id)]) || 0;
  const topScore = sortedPlayers.length ? scoreOf(sortedPlayers[0]) : 0;
  const hasSoleLeader = topScore > 0 && sortedPlayers.filter(p => scoreOf(p) === topScore).length === 1;
  const finalWinner = gameState?.winner_id != null ? players.find(p => p.user_id === gameState.winner_id) : null;

  return (
    <div className="fixed inset-0 z-[60] bg-gray-950/98 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pl-20 pr-5 py-4 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* 150% of the original h-11/h-14 base (44px/56px) — scaled back
              down from an earlier 300% pass that was too large. */}
          <img src={REBUS_LOGO_URL} alt="Rebus Round" className="h-[66px] sm:h-[84px] w-auto object-contain" />
          {round > 0 && totalPuzzles > 0 && (
            <span className="text-gray-400 text-sm ml-1">
              Puzzle {positionInSet}/{REBUS_SET_SIZE}
              {totalSets > 1 && <> · Set {currentSetNumber}/{totalSets}</>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <GameRulesButton gameType="rebus_round" />
          <button
            onClick={endOrLeave}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
          >
            {isHostUser ? 'End Game' : 'Leave'}
          </button>
          <button
            onClick={endOrLeave}
            className="text-gray-400 hover:text-white hover:bg-gray-800 p-1.5 rounded-lg transition-colors"
            title={isHostUser ? 'End game for everyone' : 'Leave game'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Score strip */}
      {round > 0 && (
        <div className="flex items-center gap-4 px-5 py-2 bg-gray-900 overflow-x-auto flex-shrink-0">
          {sortedPlayers.map((p, i) => (
            <div key={p.user_id} className="flex items-center gap-1.5 flex-shrink-0">
              {i === 0 && hasSoleLeader && <Trophy className="w-3.5 h-3.5 text-yellow-400" />}
              <div className="w-5 h-5 rounded-full border border-white/30" style={{ backgroundColor: p.color }} />
              <span className="text-white text-sm">{p.username}</span>
              <span className="text-yellow-400 text-xs font-bold">{scoreOf(p)}pts</span>
            </div>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-6 overflow-y-auto">

        {/* Waiting */}
        {phase === 'waiting' && (
          <div className="text-center">
            <div className="text-6xl mb-5">{isHostUser ? '🖼️' : '⏳'}</div>
            <h2 className="text-2xl font-bold text-white mb-2">{isHostUser ? 'Ready!' : 'Get Ready!'}</h2>
            <p className="text-gray-400 mb-8 text-sm max-w-sm">
              {isHostUser
                ? 'A picture puzzle appears — type the phrase it’s hinting at. First correct guess scores the most!'
                : 'Waiting for the host to start the first puzzle…'}
            </p>
            {isHostUser && (
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={sendStart}
                  disabled={isSendingNext}
                  className="px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl text-base transition-all"
                >
                  {isSendingNext ? 'Starting…' : 'Start Round 1'}
                </button>
                <button
                  onClick={endOrLeave}
                  className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 hover:text-red-300 rounded-xl text-xs font-semibold transition-colors"
                >
                  End Game
                </button>
              </div>
            )}
          </div>
        )}

        {/* Puzzle / Reveal */}
        {(phase === 'puzzle' || phase === 'reveal') && (
          <div className="w-full max-w-xl sm:max-w-2xl lg:max-w-3xl">
            {phase === 'puzzle' && (
              <div className="flex items-center gap-3 mb-4">
                <Clock className={`w-4 h-4 flex-shrink-0 ${timeLeft <= 8 ? 'text-red-400 animate-pulse' : 'text-gray-400'}`} />
                <div className="flex-1 bg-gray-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${timeLeft <= 8 ? 'bg-red-500' : 'bg-purple-500'}`}
                    style={{ width: `${(timeLeft / PUZZLE_SECONDS) * 100}%` }}
                  />
                </div>
                <span className={`text-xs font-bold w-6 text-right tabular-nums ${timeLeft <= 8 ? 'text-red-400' : 'text-gray-300'}`}>
                  {timeLeft}s
                </span>
              </div>
            )}

            {/* Puzzle card — sized generously so a puzzle carrying 1-2 real
                photos (plus a scaled/positioned image icon puzzle) is legible
                at a glance on a phone, not something that needs pinch-zoom.
                Mobile: padding trimmed (p-5 -> p-3) and min-height raised
                (170px -> 260px) so the card reads as tall/portrait rather
                than a wide rectangle, with less padding "wasted" around the
                now-bigger .rebus-img photos (see the style block above) —
                a short plain-text puzzle still benefits from the taller
                minimum too, paired with the bigger base text size in
                tokenStyle above.
                items-stretch (not items-center): a sup/sub puzzle (e.g.
                "UPLINK" -> a lone raised "LINK" token) needs to be pinned at
                the actual top/bottom of this card, not just at the top/bottom
                of its own single-line height — items-center used to
                vertically center the WHOLE pattern block within this box
                regardless of what any individual token did internally,
                which is what read as "always centered, ignoring up/down."
                items-stretch instead lets RebusPatternDisplay's own root
                fill this card's full height, so its own justify-content
                (see patternVerticalJustify) can genuinely place content at
                the top/bottom rather than fighting a parent that already
                centered everything one level up. */}
            <div className="bg-gray-800 rounded-2xl p-3 sm:p-8 mb-4 shadow-lg min-h-[260px] sm:min-h-[280px] flex items-stretch justify-center">
              <RebusPatternDisplay pattern={pattern} />
            </div>

            {/* Who's solved it so far */}
            {phase === 'puzzle' && (
              <div className="flex items-center justify-center gap-1.5 flex-wrap mb-4 min-h-[24px]">
                {correctOrder.length === 0 ? (
                  <p className="text-gray-500 text-xs">Nobody's solved it yet…</p>
                ) : (
                  correctOrder.map((entry) => {
                    const p = players.find(pl => pl.user_id === Number(entry.user_id));
                    if (!p) return null;
                    return (
                      <span key={entry.user_id} className="flex items-center gap-1 bg-green-600/20 border border-green-500/40 text-green-300 text-xs font-semibold px-2 py-0.5 rounded-full">
                        ✓ {p.username}
                      </span>
                    );
                  })
                )}
              </div>
            )}

            {/* Reveal */}
            {phase === 'reveal' && (
              <div className="text-center mb-5">
                <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">The answer was</p>
                <p className="text-white text-2xl font-black capitalize">{revealedAnswer}</p>
                {revealedAlternates.length > 0 && (
                  <p className="text-gray-500 text-xs mt-1">Also accepted: {revealedAlternates.join(', ')}</p>
                )}
                {setCompleteNoWinner && !isLastRound && (
                  <p className="text-purple-300 text-xs font-semibold mt-3 bg-purple-900/30 border border-purple-700/40 rounded-lg px-3 py-2 inline-block">
                    Set {currentSetNumber} complete — no clear leader yet. Moving to set {currentSetNumber + 1} of {totalSets}…
                  </p>
                )}
              </div>
            )}

            {/* Player input */}
            {phase === 'puzzle' && isPlayer && (
              <div className="flex flex-col items-center gap-2">
                {alreadySolvedThisRound ? (
                  <p className="text-green-400 text-sm font-semibold">🎉 You got it! Waiting for the round to end…</p>
                ) : (
                  <>
                    <div className={`flex w-full gap-2 ${shakeError ? 'animate-shake' : ''}`}>
                      <input
                        ref={inputRef}
                        type="text"
                        value={guess}
                        onChange={(e) => setGuess(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') sendGuess(); }}
                        placeholder="Type your guess…"
                        disabled={isSubmittingGuess}
                        className="flex-1 bg-gray-900/70 border border-gray-700 focus:border-purple-500 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-base focus:outline-none disabled:opacity-60"
                        autoComplete="off"
                      />
                      <button
                        onClick={sendGuess}
                        disabled={!guess.trim() || isSubmittingGuess}
                        className="px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex-shrink-0 min-w-[52px] flex items-center justify-center"
                      >
                        {isSubmittingGuess ? <span className="text-xs font-medium">Sending…</span> : <Send className="w-5 h-5" />}
                      </button>
                    </div>
                    {shakeError && <p className="text-red-400 text-xs font-medium">{shakeError}</p>}
                  </>
                )}
              </div>
            )}
            {phase === 'puzzle' && !isPlayer && (
              <p className="text-center text-gray-500 text-sm">You're hosting — sit back and watch!</p>
            )}

            {/* Host controls */}
            {isHostUser && (
              <div className="flex justify-between items-center mt-5">
                <button
                  onClick={endOrLeave}
                  className="px-4 py-2.5 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 hover:text-red-300 rounded-xl text-sm font-semibold transition-colors"
                >
                  End Game
                </button>
                <div className="flex justify-center">
                  {phase === 'puzzle' && (
                    <button
                      onClick={sendReveal}
                      className="px-6 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold rounded-xl text-sm transition-colors"
                    >
                      Reveal Answer
                    </button>
                  )}
                  {phase === 'reveal' && (
                    <button
                      onClick={isLastRound ? endOrLeave : sendStart}
                      disabled={isSendingNext}
                      className="flex items-center gap-1.5 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-all"
                    >
                      {isSendingNext ? 'Loading…' : isLastRound ? 'Show Results' : 'Next Puzzle'}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
            {!isHostUser && phase === 'reveal' && (
              <p className="text-center text-gray-500 text-xs mt-4">Waiting for the host to start the next puzzle…</p>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes rebusShake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
        .animate-shake { animation: rebusShake 0.4s ease-in-out; }
        /* Base image size before the per-token scale multiplier — generous
           on purpose (see the puzzle-card sizing comment above) so photo
           puzzles read clearly on a phone with no zoom needed. Mobile base
           bumped 112px -> 160px so a 2-photo compound genuinely fills the
           card instead of looking small/rectangular inside it. */
        .rebus-img {
          width: calc(160px * var(--rebus-img-scale, 1));
          height: calc(160px * var(--rebus-img-scale, 1));
        }
        @media (min-width: 640px) {
          .rebus-img {
            width: calc(150px * var(--rebus-img-scale, 1));
            height: calc(150px * var(--rebus-img-scale, 1));
          }
        }
      `}</style>

      {phase === 'ended' && (
        <GameWinnerBanner
          winner={finalWinner}
          gameType="rebus_round"
          gameStats={{ lines: sortedPlayers.map(p => ({ label: p.username, value: `${scoreOf(p)}pts` })) }}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
          secondaryAction={(gameState?.host_id ?? players?.[0]?.user_id) === currentUserId && onPlayAgain ? { label: 'Play Again 🔄', onClick: onPlayAgain } : undefined}
        />
      )}
    </div>
  );
}
