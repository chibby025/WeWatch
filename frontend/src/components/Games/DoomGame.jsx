// src/components/Games/DoomGame.jsx
// Arcade mode: real multiplayer over DOOM's own networking protocol, running
// entirely inside a BunnyCDN-hosted iframe (GPL-2.0 engine kept isolated from
// this MIT-licensed app — never statically bundled into the main JS). The
// host's instance runs as the authoritative server (-server); every other
// room member's instance connects as a read-only spectator (-connect 1
// -drone — the engine's own "drone" mode, which never generates input). The
// engine's net_wewatch.c module bridges its native wire protocol through
// postMessage to this component, which relays it over WeWatch's existing
// WebSocket connection (onRelayPacket / registerRelayReceiver props) — this
// component never parses the DOOM protocol itself, just ferries opaque bytes.
import { useEffect, useRef, useState } from 'react';
import { X as CloseIcon } from 'lucide-react';

const DOOM_ORIGIN = 'https://letswatchout.b-cdn.net';
// v1/ is permanently stuck serving a stale BunnyCDN edge-cache copy from an
// early broken upload (no account-level API key available to purge it) — v3/
// added real multiplayer (net_wewatch.c) on top of v2's solo-arcade build.
// v4/ fixed drone late-join (AllNodesReady/HandleLateJoin treating spectators
// as phantom real players). v5/ fixed the R_InitSprites I_Error sprite-data
// quirk. v6/ fixes the actual root cause of a separate, confirmed real-tab-
// crash (not just a silent disconnect): vis->patch could be -1 (an invalid
// "no such frame" sentinel) and reach W_CacheLumpNum unguarded in
// R_DrawVisSprite (r_things.c), resolving to a totally unrelated WAD lump
// reinterpreted as a sprite patch_t -- the resulting nonsense width/columnofs
// data was the source of the out-of-bounds WASM memory access. Also added
// unconditional (no longer #ifdef RANGECHECK-only) bounds checks to all 6
// column-drawing functions in r_draw.c, a missing &127 source-index mask in
// the translated-column functions, and a defensive iteration cap on
// R_DrawMaskedColumn's post-walking loop. Bump the path for future rebuilds
// rather than fighting a stuck edge-cache copy.
const DOOM_BASE_URL = `${DOOM_ORIGIN}/games/doom/v6/index.html`;

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Same touch-capability check the wewatch-shell build itself uses to decide whether to
// show its own on-screen joystick/buttons — kept in sync so this popup's gate matches
// exactly what the iframe is actually going to render, not a screen-width guess (a
// resized desktop browser window still has a keyboard; this is about input capability).
const isMobileDevice = () => ('ontouchstart' in window) && navigator.maxTouchPoints > 0;

export default function DoomGame({ onClose, onEndGame, isHost, onRelayPacket, registerRelayReceiver }) {
  const [loaded, setLoaded] = useState(false);
  // Shown once per load, host only (the spectator never receives input), and only on
  // non-touch devices — the build has real on-screen touch controls for actual touch
  // devices (joystick + FIRE/USE/MAP buttons, auto-detected the same way inside the
  // iframe itself), so a keyboard-scheme popup would be irrelevant/wrong there. The
  // desktop keyboard scheme has no in-game hint at all otherwise, so a player has to
  // guess it the first time.
  const [showControls, setShowControls] = useState(false);
  const iframeRef = useRef(null);
  const doomUrl = `${DOOM_BASE_URL}?role=${isHost ? 'host' : 'spectator'}`;

  useEffect(() => {
    if (loaded && isHost && !isMobileDevice()) setShowControls(true);
  }, [loaded, isHost]);

  // Register our "deliver an incoming relay packet" function so VideoWatch.jsx
  // can call it directly (via a ref, bypassing React state) every time a
  // relay_packet WS message arrives — these can arrive at DOOM's own tic rate,
  // far too frequent to route through setState/re-renders.
  useEffect(() => {
    if (!registerRelayReceiver) return;
    registerRelayReceiver((base64Payload) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage({ type: 'doom:net-in', data: base64ToBytes(base64Payload) }, DOOM_ORIGIN);
    });
    return () => registerRelayReceiver(null);
  }, [registerRelayReceiver]);

  useEffect(() => {
    function handleMessage(event) {
      if (event.origin !== DOOM_ORIGIN) return;
      if (event.data?.type === 'doom:exit') {
        // Host exiting ends the game for everyone (forfeit); a spectator
        // exiting just stops watching — the host's game continues unaffected.
        if (isHost) onEndGame?.();
        onClose?.();
      } else if (event.data?.type === 'doom:net-out') {
        onRelayPacket?.(bytesToBase64(event.data.data));
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onEndGame, onClose, isHost, onRelayPacket]);

  const handleExitClick = () => {
    if (isHost) onEndGame?.();
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          <p className="text-sm text-gray-400">
            {isHost ? 'Loading DOOM… (first load may take a moment)' : 'Connecting to the live game…'}
          </p>
        </div>
      )}
      <button
        onClick={handleExitClick}
        className="absolute top-4 right-4 z-10 p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors"
        title={isHost ? 'End game for everyone' : 'Stop watching'}
      >
        <CloseIcon className="w-6 h-6" />
      </button>
      <iframe
        ref={iframeRef}
        src={doomUrl}
        title="DOOM Arcade"
        className="w-full h-full border-0"
        onLoad={() => setLoaded(true)}
        allow="gamepad; fullscreen"
        sandbox="allow-scripts allow-same-origin allow-pointer-lock"
      />
      {showControls && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/70"
          onClick={() => setShowControls(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl p-5 max-w-sm mx-4 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-3">Controls</h3>
            <div className="space-y-1.5 text-sm text-gray-200">
              <div className="flex justify-between gap-4"><span className="text-gray-400">Move</span><span>WASD or Arrow Keys</span></div>
              <div className="flex justify-between gap-4"><span className="text-gray-400">Fire</span><span>Space</span></div>
              <div className="flex justify-between gap-4"><span className="text-gray-400">Use / Open Door</span><span>E</span></div>
              <div className="flex justify-between gap-4"><span className="text-gray-400">Run</span><span>Shift (hold)</span></div>
              <div className="flex justify-between gap-4"><span className="text-gray-400">Switch Weapon</span><span>1–7</span></div>
              <div className="flex justify-between gap-4"><span className="text-gray-400">Map</span><span>Tab</span></div>
            </div>
            <button
              onClick={() => setShowControls(false)}
              className="mt-4 w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 text-white text-sm font-medium py-2 rounded-lg transition-opacity"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
