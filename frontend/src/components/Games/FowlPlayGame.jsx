// src/components/Games/FowlPlayGame.jsx
// Arcade: single-player duck-hunting mini-game, BunnyCDN-hosted static iframe.
// Built on MattSurabian/DuckHunt-JS (MIT). Renamed "Fowl Play" to avoid
// confusion with Nintendo's Duck Hunt trademark and the separate Steam VR
// game "Duck Season" (Stress Level Zero, 2017).
import { useEffect, useRef, useState } from 'react';
import { X as CloseIcon } from 'lucide-react';

const FOWL_PLAY_ORIGIN = 'https://letswatchout.b-cdn.net';
// v3: adds a throttled `fowlplay:state` postMessage hook (live duck
// positions/score/wave) so non-playing room members get a real spectator
// view instead of a static placeholder — see the relay wiring below.
// v4: adds a "PAUSED" banner (reusing the game's own gameStatus HUD text —
// previously pausing had zero visual indicator) and real touch-friendly DOM
// buttons for pause/mute/fullscreen (the canvas-rendered text links were
// already technically tappable, just cramped/overlapping hit boxes on a
// touchscreen — see addMobileControls in the patched Game.js source).
// v5: fixes the spectator view actually showing ducks/dog/shots — the old
// build made a cross-origin fetch(sprites.json) from the parent page, which
// BunnyCDN's pull zone silently drops (no CORS header on that extension,
// unlike sprites.png), so spriteMeta never populated and every DuckSprite
// rendered null. Sprite metadata + a dog snapshot + a shot-flash counter
// now come through the same postMessage-relay channel `fowlplay:state`
// already uses, wrapped in a typed envelope. Also fixes ending the game
// only closing it for the host — the host's own end (X or the new "End
// Game" button) always broadcast game_ended room-wide already, but this
// component never read `gameState.status` at all, so a member's spectator
// screen had no way to notice.
// v1/v2 abandoned per this project's own BunnyCDN versioning convention (the
// edge cache can get permanently stuck serving stale content after a
// same-path re-upload, with no purge access in this environment).
const FOWL_PLAY_BASE = `${FOWL_PLAY_ORIGIN}/games/fowl-play/v5`;
const FOWL_PLAY_URL = `${FOWL_PLAY_BASE}/index.html`;
const SPRITES_PNG_URL = `${FOWL_PLAY_BASE}/sprites.png`;

// Shared frame lookup for both duck and dog sprites — both are drawn from
// the same TexturePacker atlas, just under different key prefixes
// (`duck/{color}/{state}/0.png` vs `dog/{state}/0.png`, no color segment).
function spriteFrameInfo(spriteMeta, key) {
  if (!spriteMeta) return null;
  const frame = spriteMeta.frames[key]?.frame;
  if (!frame) return null;
  return { frame, size: spriteMeta.meta.size };
}

// Renders one duck from a relayed state snapshot using the game's own real
// sprite art. Not pixel-perfect vs. the live game (always frame 0 of each
// state, no walk-cycle animation) — good enough for "watch what's
// happening," not a full re-render of the engine.
function DuckSprite({ duck, spriteMeta }) {
  const info = spriteFrameInfo(spriteMeta, `duck/${duck.color}/${duck.state}/0.png`);
  if (!info) return null;
  const { frame, size } = info;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${duck.x * 100}%`,
        top: `${duck.y * 100}%`,
        width: frame.w,
        height: frame.h,
        transform: 'translate(-50%, -50%)',
        backgroundImage: `url(${SPRITES_PNG_URL})`,
        backgroundPosition: `-${frame.x}px -${frame.y}px`,
        backgroundSize: `${size.w}px ${size.h}px`,
        imageRendering: 'pixelated',
        pointerEvents: 'none',
      }}
    />
  );
}

// Same idea for the dog — rendered above ducks (dog "jumps" up to retrieve
// a shot duck, briefly overlapping it).
function DogSprite({ dog, spriteMeta }) {
  const info = spriteFrameInfo(spriteMeta, `dog/${dog.state}/0.png`);
  if (!info) return null;
  const { frame, size } = info;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${dog.x * 100}%`,
        top: `${dog.y * 100}%`,
        width: frame.w,
        height: frame.h,
        transform: 'translate(-50%, -50%)',
        backgroundImage: `url(${SPRITES_PNG_URL})`,
        backgroundPosition: `-${frame.x}px -${frame.y}px`,
        backgroundSize: `${size.w}px ${size.h}px`,
        imageRendering: 'pixelated',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    />
  );
}

export default function FowlPlayGame({
  gameState,
  onClose,
  onEndGame,
  isHost,
  // Hot-seat tournament props
  hotSeatTournament = null,    // full tournament state object or null
  currentUserId = null,
  onTournamentScore = null,    // callback(score) when this player finishes
  // Spectator relay — same generic one-way-JSON-snapshot plumbing Draw &
  // Guess already uses (see VideoWatch.jsx's registerGameRelayReceiver).
  onRelayPacket = null,        // host: call with a base64 JSON payload to relay it to the room
  registerRelayReceiver = null, // spectator: register a callback to receive relayed payloads
}) {
  const [loaded, setLoaded] = useState(false);
  const [myScore, setMyScore] = useState(null);
  // Live snapshot relayed from the host's game — only ever populated on a
  // spectator's client (registerRelayReceiver is only meaningfully wired for
  // the non-host branch below).
  const [spectatorState, setSpectatorState] = useState(null);
  const [spriteMeta, setSpriteMeta] = useState(null);
  const [shotFlash, setShotFlash] = useState(false);
  const lastShotSeqRef = useRef(null);
  // Guards the auto-close-on-remote-end effect below so it only ever fires
  // once per game, even if gameState.status keeps re-rendering as 'finished'.
  const endedHandledRef = useRef(false);

  // Derived: is it currently this user's turn in a hot-seat tournament?
  const isMyTurn = hotSeatTournament &&
    hotSeatTournament.current_player_id === currentUserId;

  const isInTournament = !!hotSeatTournament;

  useEffect(() => {
    function handleMessage(event) {
      if (event.origin !== FOWL_PLAY_ORIGIN) return;
      const { type, score } = event.data || {};

      if (type === 'fowlplay:exit') {
        onEndGame?.();
        onClose?.();
        return;
      }

      if (type === 'fowlplay:gameover') {
        setMyScore(score ?? 0);
        if (isInTournament && onTournamentScore) {
          onTournamentScore(score ?? 0);
        }
        return;
      }

      if (type === 'fowlplay:sprites') {
        // Fires once, right after the iframe finishes loading its own
        // (same-origin, no CORS issue) sprite atlas. Relayed to the room in
        // the same typed envelope `fowlplay:state` uses below, so a
        // spectator's registerRelayReceiver can tell the two apart.
        onRelayPacket?.(btoa(JSON.stringify({ relayType: 'sprites', payload: event.data.meta })));
        return;
      }

      if (type === 'fowlplay:state') {
        // Host only (this listener is only ever attached to a page that
        // actually has the iframe mounted, i.e. the playing client) —
        // forward the raw snapshot to the room, same JSON-over-base64 shape
        // Draw & Guess's canvas strokes already use over this same channel.
        onRelayPacket?.(btoa(JSON.stringify({ relayType: 'state', payload: event.data })));
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onEndGame, onClose, isInTournament, onTournamentScore, onRelayPacket]);

  // Spectator: register to receive relayed state/sprite snapshots.
  useEffect(() => {
    if (!registerRelayReceiver || isHost) return;
    registerRelayReceiver((payload) => {
      if (!payload) return;
      try {
        const parsed = JSON.parse(atob(payload));
        if (parsed.relayType === 'sprites') {
          setSpriteMeta(parsed.payload);
        } else if (parsed.relayType === 'state') {
          setSpectatorState(parsed.payload);
        }
      } catch {
        // A malformed/partial payload just means this tick is skipped —
        // the next relay a few hundred ms later self-corrects.
      }
    });
    return () => registerRelayReceiver(null);
  }, [registerRelayReceiver, isHost]);

  // Spectator: a brief flash overlay each time the host's shotSeq counter
  // changes — a stylized "someone just fired" indicator, not a
  // frame-accurate reproduction of the real 60ms in-game flash (which
  // wouldn't reliably survive the ~150ms relay poll interval anyway).
  useEffect(() => {
    const seq = spectatorState?.shotSeq;
    if (seq === undefined || seq === null) return;
    if (lastShotSeqRef.current === null) {
      // First snapshot since connecting — just record the baseline so we
      // don't flash for shots that happened before we joined.
      lastShotSeqRef.current = seq;
      return;
    }
    if (seq !== lastShotSeqRef.current) {
      lastShotSeqRef.current = seq;
      setShotFlash(true);
      const t = setTimeout(() => setShotFlash(false), 180);
      return () => clearTimeout(t);
    }
  }, [spectatorState?.shotSeq]);

  // Reliable "end for everyone": the host ending the game (X or "End Game")
  // already broadcasts game_ended room-wide via onEndGame, and
  // VideoWatch.jsx's generic handler already updates gameState.status for
  // every connected client — this is what actually closes a member's
  // spectator screen in response, which nothing here previously did.
  useEffect(() => {
    const status = gameState?.status;
    if (endedHandledRef.current) return;
    if (status === 'finished' || status === 'forfeited') {
      endedHandledRef.current = true;
      onClose?.();
    }
  }, [gameState?.status, onClose]);

  const handleExit = () => {
    onEndGame?.();
    onClose?.();
  };

  // ─── Non-host, hot-seat tournament: waiting for your turn ───────────────────
  // Unchanged — scope for the live spectator view below is deliberately the
  // simple non-tournament case only (tournament turn-passing semantics
  // aren't fully clear from the frontend alone, and weren't part of what was
  // asked).
  if (!isHost && isInTournament) {
    const currentPlayerName = hotSeatTournament?.current_player_name ?? 'someone';
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">🦆</span>
        <p className="text-lg font-semibold">
          {currentPlayerName}'s turn — Fowl Play
        </p>
        <p className="text-sm text-gray-400">
          Stand by for your turn…
        </p>
        <button
          onClick={onClose}
          className="mt-2 px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  // ─── Non-host, simple spectating: live view driven by relayed state ────────
  if (!isHost) {
    const ducks = spectatorState?.ducks ?? [];
    const dog = spectatorState?.dog;
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col text-white"
        style={{ background: 'linear-gradient(180deg, #64b0ff 0%, #a8d4ff 100%)' }}
      >
        <div className="relative flex-1 overflow-hidden">
          {!spectatorState && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40">
              <div className="w-8 h-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              <p className="text-sm text-gray-200">Connecting to the live game…</p>
            </div>
          )}

          {ducks.map((duck, i) => (
            <DuckSprite key={i} duck={duck} spriteMeta={spriteMeta} />
          ))}

          {dog?.visible && <DogSprite dog={dog} spriteMeta={spriteMeta} />}

          <div
            style={{
              position: 'absolute', inset: 0,
              background: 'white',
              opacity: shotFlash ? 0.5 : 0,
              transition: 'opacity 120ms ease-out',
              pointerEvents: 'none',
            }}
          />

          {spectatorState && (
            <div className="absolute top-3 left-3 bg-black/50 rounded-lg px-3 py-1.5 text-xs font-semibold">
              🎯 {spectatorState.score ?? 0} · Wave {spectatorState.wave ?? 0}/{spectatorState.waves ?? 0}
              {typeof spectatorState.bullets === 'number' && ` · 🔫 ${spectatorState.bullets}`}
            </div>
          )}

          {spectatorState?.gameStatus && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-3xl font-black drop-shadow-lg text-center px-4">
              {spectatorState.gameStatus}
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-black/40">
          <p className="text-xs text-gray-200">🦆 Watching Fowl Play — sit back and cheer them on.</p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // ─── Host in tournament: not their turn yet ──────────────────────────────────
  if (isInTournament && !isMyTurn && myScore === null) {
    const currentPlayerName = hotSeatTournament?.current_player_name ?? '…';
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">⏳</span>
        <p className="text-lg font-semibold">
          Waiting for {currentPlayerName} to play…
        </p>
        <p className="text-sm text-gray-400">You'll be up soon!</p>
        <button
          onClick={handleExit}
          className="mt-4 px-5 py-2 bg-red-600/80 hover:bg-red-600 rounded-lg text-sm transition-colors"
        >
          Cancel Tournament
        </button>
      </div>
    );
  }

  // ─── Score recorded — waiting for other players (or eliminated, in bracket mode) ──
  if (isInTournament && myScore !== null) {
    const isEliminated = hotSeatTournament?.participants?.some(
      (p) => p.user_id === currentUserId && p.eliminated
    );
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">🎯</span>
        <p className="text-lg font-semibold">Your score: {myScore.toLocaleString()}</p>
        {isEliminated ? (
          <p className="text-sm text-gray-400">You were eliminated — thanks for playing!</p>
        ) : (
          <p className="text-sm text-gray-400">Waiting for other players to finish…</p>
        )}
        <button
          onClick={onClose}
          className="mt-2 px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  // ─── Active play ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          <p className="text-sm text-gray-400">Loading Fowl Play…</p>
        </div>
      )}

      {/* Tournament turn banner */}
      {isInTournament && loaded && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-purple-700/90 text-white text-sm font-semibold rounded-full shadow">
          🏆 Your turn — shoot as many ducks as you can!
        </div>
      )}

      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <button
          onClick={handleExit}
          className="px-3 py-2 bg-red-700/90 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-colors"
          title="End game for everyone"
        >
          End Game
        </button>
        <button
          onClick={handleExit}
          className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors"
          title="End game for everyone"
        >
          <CloseIcon className="w-6 h-6" />
        </button>
      </div>

      <iframe
        src={FOWL_PLAY_URL}
        title="Fowl Play"
        className="w-full h-full border-0"
        onLoad={() => setLoaded(true)}
        allow="fullscreen"
        // allow-fullscreen was missing here — the `allow="fullscreen"` feature-policy
        // attribute alone isn't sufficient once an iframe has a `sandbox` attribute at
        // all; without this token the in-game fullscreen link's requestFullscreen()
        // call is blocked by the sandbox itself, independent of anything inside the
        // bundle. Confirmed via the spec, not guessed — this affects every platform,
        // not just mobile.
        sandbox="allow-scripts allow-same-origin allow-fullscreen"
      />
    </div>
  );
}
