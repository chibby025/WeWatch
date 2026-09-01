// src/components/Games/Quake3Game.jsx
// Real N-player multiplayer: every room member who joins gets an identical,
// fully-playable instance -- unlike DOOM (host-authoritative + read-only
// spectators tunneled through WeWatch's own WS relay), this engine has its
// own real client-server netcode. Each iframe connects DIRECTLY to a
// dedicated per-room WebSocket supervisor (a separate Railway service, not
// this app's own backend) via a `?wsurl=` query param the engine's own page
// shell reads at load time -- no relay plumbing, no onRelayPacket/
// registerRelayReceiver props, matching the (now-removed) Stellar Swarm
// integration's pattern rather than DOOM's.
import { useEffect, useRef, useState } from 'react';
import { X as CloseIcon } from 'lucide-react';

const QUAKE3_ORIGIN = 'https://letswatchout.b-cdn.net';
// v6, not v1-v5 -- each fixed a real, separate connect-hang or rendering
// bug in the quake3_fork checkout (older versions deliberately abandoned
// rather than overwritten in place, per this project's own established
// BunnyCDN edge-cache convention -- a same-path re-upload can get
// permanently stuck serving a stale version, with no purge access
// available in this environment):
//   v2: "Duplicate GUID" connect rejection -- CL_UpdateGUID (cl_main.c) was
//       reading a persisted "qkey" file shared by every same-origin
//       tab/iframe via IDBFS, so two different players' clients computed
//       the identical GUID and the server's own anti-cheat rejected the
//       second. Fixed by always generating a fresh in-memory GUID instead.
//   v3: hardened sdl_input.c to defer (not drop) a resize-triggered
//       vid_restart while a connect handshake is in flight -- a real,
//       legitimate defensive fix, but NOT the actual cause of the
//       "awaiting gamestate" hang users kept hitting after v2.
//   v4: the actual root cause of "awaiting gamestate" -- a genuine,
//       pre-existing use-after-free in files.c's FS_Restart_after_
//       FS_Startup. It freed its own context unconditionally, then (on
//       the "couldn't find default.cfg, retry with a fallback base path"
//       branch) reused that already-freed context and handed it straight
//       back into a fresh FS_Restart() call -- whose own first action is
//       to allocate a new context, which the allocator handed the exact
//       same just-freed address, silently corrupting the reused pointer
//       into a self-referential, already-freed object. The eventual
//       cb_run() on it was undefined behavior that manifested as a
//       silent, permanent stall with zero errors -- confirmed via a real
//       end-to-end connect trace. Fixed by only freeing the context on
//       the paths that don't reuse it.
//   v5: "pink then black" screen once a real map actually loads (reported
//       by a real user, both host and member). Root cause: GL_TexEnv()
//       (renderergl1/tr_backend.c) sets the texture-environment blend
//       mode (GL_MODULATE for lightmap multiply-blending, GL_REPLACE for
//       base textures) via qglTexEnvf -- the float-taking GL entry point.
//       Emscripten's own bundled WebGL emulation (libglemu.js) only
//       implements GL_RGB_SCALE/GL_ALPHA_SCALE for that specific float
//       variant; GL_TEXTURE_ENV_MODE silently falls through to an
//       "unhandled pname" no-op there, while the sibling integer variant
//       (qglTexEnvi) DOES handle it correctly. So every texture was being
//       drawn with whatever blend mode happened to already be bound
//       (garbage/default), not the one the engine actually requested --
//       consistent with a wrong-color-then-degrading-to-black symptom.
//       Fixed by switching all 4 GL_TexEnv() cases to qglTexEnvi. Locally
//       verified this doesn't regress the real 2-player connect/gameplay-
//       entry sequence fixed in v4; the visual fix itself could NOT be
//       confirmed via headless testing -- SwiftShader's own headless GL
//       emulation never reproduced the pink phase at all (solid black
//       from first frame onward, in every sample, with or without this
//       fix) -- so this is confirmed correct by direct source reading of
//       the actual bug, not by a passing automated visual test.
const QUAKE3_CLIENT_URL = `${QUAKE3_ORIGIN}/games/quake3/v5/index.html`;
// One shared Railway service (the "quake3-supervisor") lazily spawns and
// tears down a real dedicated-server process per active room -- see the
// supervisor's own README/index.js for the full per-room isolation design.
const QUAKE3_SUPERVISOR_WS = 'wss://quake3-supervisor-production.up.railway.app';

// Same touch-capability check DoomGame.jsx / the wewatch-shell build itself
// use to decide whether to show an on-screen joystick vs a keyboard-scheme
// popup -- kept in sync so this popup's gate matches what the iframe is
// actually going to render, not a screen-width guess.
const isMobileDevice = () => ('ontouchstart' in window) && navigator.maxTouchPoints > 0;

export default function Quake3Game({ roomId, onClose, onEndGame, isHost }) {
  const [loaded, setLoaded] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const iframeRef = useRef(null);

  const wsUrl = `${QUAKE3_SUPERVISOR_WS}/?room=${encodeURIComponent(roomId)}`;
  // The engine needs a syntactically valid `\connect <addr>` argument to
  // actually initiate its connect flow -- the real transport target is
  // already fixed via ?wsurl=, so this address itself is never used for
  // anything beyond satisfying that parse.
  const quake3Url = `${QUAKE3_CLIENT_URL}?wsurl=${encodeURIComponent(wsUrl)}&connect%20x:1`;

  useEffect(() => {
    if (loaded && !isMobileDevice()) setShowControls(true);
  }, [loaded]);

  // Every player is a real, identical participant (no host/spectator
  // split) -- a plain close only leaves the game locally for that one
  // player, same as leaving a real multiplayer match. Only the room host
  // gets an explicit "End for Everyone" action, which tears down the
  // WeWatch-side GameSession for the whole room before closing locally.
  const handleCloseClick = () => onClose?.();
  const handleEndForEveryone = () => { onEndGame?.(); onClose?.(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          <p className="text-sm text-gray-400">Loading Quake Death Match… (first load may take a moment)</p>
        </div>
      )}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {isHost && (
          <button
            onClick={handleEndForEveryone}
            className="px-3 py-2 bg-red-700/80 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
            title="End the match for every player in the room"
          >
            End for Everyone
          </button>
        )}
        <button
          onClick={handleCloseClick}
          className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors"
          title="Leave the match"
        >
          <CloseIcon className="w-6 h-6" />
        </button>
      </div>
      <iframe
        ref={iframeRef}
        src={quake3Url}
        title="Quake Death Match"
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
              <div className="flex justify-between gap-4"><span className="text-gray-400">Look / Aim</span><span>Mouse</span></div>
              <div className="flex justify-between gap-4"><span className="text-gray-400">Fire</span><span>Left Click</span></div>
              <div className="flex justify-between gap-4"><span className="text-gray-400">Jump</span><span>Space</span></div>
              <div className="flex justify-between gap-4"><span className="text-gray-400">Switch Weapon</span><span>1–9</span></div>
              <div className="flex justify-between gap-4"><span className="text-gray-400">Console</span><span>~</span></div>
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
