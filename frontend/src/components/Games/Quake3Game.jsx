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
//   v6: quieted 5 always-fires-identically boot-noise Com_Printf calls
//       (cvar.c's "will be changed upon restarting", net_ip.c's IPv6-
//       unsupported-in-this-sandbox sequence, snd_codec.c/snd_openal.c's
//       expected sound-fallback warnings, SDL_QuitSubSystem's duplicate
//       "(and ignored)" print) -- real per-call JS-bridge cost, not just
//       console noise. Also upgraded one real logging gap: the raw-name
//       (no explicit .shader script) missing-texture path in tr_shader.c
//       used PRINT_DEVELOPER (silent unless "developer 1"), the one path
//       where a genuinely missing map texture could fail completely
//       silently -- upgraded to PRINT_WARNING and tagged
//       "[TEXTURE MISSING]" consistently across all 4 texture-load-
//       failure call sites in the shader system.
//   v7: client_index.html (the shell page, not the compiled engine --
//       ioquake3.js/.wasm are byte-identical to v6) now bridges the
//       engine's own console.log/warn/error output to this component via
//       postMessage, which feeds it into WeWatch's own window.capturedLogs
//       ("green logs" export button). Previously invisible there entirely
//       -- a cross-origin sandboxed iframe's console is fully isolated
//       from the parent page's own console-patching by browser design, so
//       no engine-side fix could ever have made those lines appear in the
//       app's own log capture without this bridge.
//   v8: found and fixed a real, previously-invisible bug -- a "display
//       goes to white partial wireframes with zero console output" report
//       (real user, both host and member) is a strong match for a WebGL
//       context loss, which this 2014-era engine has zero handling for.
//       Root cause confirmed by reading the compiled build directly:
//       MainLoop.runIter's own per-frame call chain has NO exception
//       recovery -- Emscripten's callUserCallback catches an error but
//       its handler (handleException) RE-THROWS it, so a single
//       exception during a single frame (a WASM trap, a bad GPU call,
//       anything) permanently kills the entire requestAnimationFrame
//       loop -- no more frames ever get scheduled, the canvas freezes
//       showing whatever was mid-drawn at the moment of the crash
//       (consistent with a "partial wireframe" look), and since an
//       uncaught exception is a completely different browser reporting
//       channel than console.log/warn/error, v7's own bridge (which only
//       patches those three) never saw it -- exact match for "nothing in
//       the logs, even right after it broke". This exact class of bug was
//       already found and fixed once before for the DEDICATED SERVER
//       build; that fix was never applied to the CLIENT until now. Fixed
//       (post-build patch, mirroring the server's own): MainLoop.runIter
//       now catches any exception, logs it via console.error (already
//       forwarded to WeWatch's log capture, tagged "[MainLoop] frame
//       threw, recovering: ..." with a real stack trace when available),
//       and recovers instead of propagating -- one bad frame can no
//       longer take down the whole render loop. Also added a genuine
//       webglcontextlost/webglcontextrestored listener (client_index.html)
//       as a second, independent diagnostic for the same failure class,
//       reported the same way.
//   v8 CONFIRMED the recovery patch works exactly as designed: a real user
//       capture showed the loop surviving (no freeze) but the SAME
//       `RuntimeError: null function` (a WASM call_indirect trap through
//       an empty function-table slot) recurring on literally every single
//       frame, right after a "RE_AddPolyToScene: NULL poly shader"
//       warning -- 100% deterministic/reproducible (confirmed via a
//       second capture mid-session showing the identical trace repeat).
//       This fully explains "pink then black": the runtime never dies,
//       but since nothing new is ever successfully drawn, it's visually
//       indistinguishable from a freeze. The wasm-function[N] indices in
//       that trace are opaque (stripped -O2 release build, no debug
//       symbols) -- can't identify the real failing C function from them
//       alone.
//   v9 ROOT CAUSE FOUND AND FIXED, confirmed via a debug-symbol rebuild
//       (`debug1/`, temporary diagnostic only, never shipped as a real
//       version) + direct wasm-dis disassembly of the exact crashing
//       function -- not guessed. The call_indirect trap is
//       `qglMultiTexCoord2fARB` (a legacy immediate-mode multitexture GL
//       function pointer) being called while genuinely NULL, gated on
//       `glState.currenttmu != 0`, inside R_ArrayElementDiscrete
//       (tr_shade.c -- gets inlined into R_DrawStripElements at -O1,
//       explaining why the debug trace showed R_DrawStripElements as the
//       crashing frame directly). This is a rare per-vertex fallback path
//       (R_DrawElements only reaches it when qglLockArraysEXT is unbound)
//       -- the engine's *normal*, everyday multitexture rendering
//       (DrawMultitextured / RB_StageIteratorLightmappedMultitexture,
//       used for all regular lightmapped world geometry) never calls this
//       per-vertex form at all; it sets up client-side texcoord arrays
//       and draws in one batched call. So qglMultiTexCoord2fARB's actual
//       binding is never exercised anywhere except this one edge case --
//       explaining why regular gameplay/menu rendering has always worked
//       fine right up until a poly/mark (RE_AddPolyToScene) happened to
//       hit this exact fallback while currenttmu was left nonzero.
//       Fixed the same way every other platform-quirk GL gap in this
//       port has been handled (tr_shade.c): guard the call with
//       `&& qglMultiTexCoord2fARB`, falling back to the safe
//       single-texcoord branch instead of crashing -- zero risk to
//       anything currently working, since nothing that renders correctly
//       today uses this null path (if it did, it would already be
//       crashing constantly). Clean -O2 production rebuild, no debug
//       flags, all 4 post-build patches re-applied.
//   v10 CONFIRMED v9's crash fix works -- real user report: "moves past
//       [the pink hue]... loads for both members". Two follow-up issues
//       from that same test, both root-caused via source reading (not
//       guessed) and both fixed here, shell-page-only (no C/WASM rebuild
//       needed -- client_index.html is a plain static file):
//       1. "wireframing at the top" + the RE_AddPolyToScene warning still
//          spamming (1995x in ~9s, no longer crashing, just noisy) --
//          traced to CG_PlayerShadow (cg_players.c) calling
//          trap_R_RegisterShader("markShadow") for the blob-shadow
//          graphic, which is genuinely absent from this project's entire
//          curated OpenArena asset pack (confirmed: grepped every pak,
//          zero matches) -- so it always registers as handle 0/null, and
//          CG_PlayerShadow re-adds this null-shader poly for every
//          visible player, every single frame (matches the sustained,
//          non-accumulating spam rate exactly). Fixed by disabling
//          mark-based blob shadows (cg_shadows 1 -> 0 in default.cfg,
//          repacked into pak8-oa-vm.pk3, re-uploaded both the unprefixed
//          bootstrap.js-facing copy and the checksum-addressed
//          static-hosting copy + regenerated manifest.json) rather than
//          sourcing/adding the missing graphic -- avoids the missing
//          asset entirely at the cost of a minor, purely cosmetic loss
//          (no shadow blob under players).
//       2. "WASD and mouse controls don't work" -- two compounding, both
//          confirmed via direct source reads of the actual Emscripten SDK
//          this was built against (not assumed from Quake3 lore):
//          a) Mouselook: IN_ActivateMouse's only real pointer-lock trigger
//             is SDL_ShowCursor(0) (SDL_WM_GrabInput itself is a total
//             no-op in this Emscripten SDK, confirmed via libsdl.js
//             source) -- and SDL_ShowCursor(0) is unconditionally gated
//             on `Browser.isFullscreen`. Nothing in this WeWatch-authored
//             shell ever requested real browser Fullscreen, so pointer
//             lock could never engage no matter what the C engine did.
//          b) Keyboard: touch-controls.js's own comment already documents
//             the mechanism precisely -- SDL_GetAppState() derives
//             SDL_APPINPUTFOCUS from a live document.hasFocus() check
//             every frame, and IN_Frame forces input handling off the
//             instant that's false. An embedded <iframe>'s document does
//             NOT auto-register as focused just because its content was
//             clicked. touch-controls.js already has the fix
//             (window.focus()) but gates its whole file behind
//             `if (!isTouchDevice()) return` -- desktop players never
//             got it.
//          Fixed with one new desktop-only (touch devices already have a
//          working dedicated control scheme, untouched) "Click to Play"
//          overlay in client_index.html: on click, calls window.focus()
//          and Browser.requestFullscreen(true, true) -- Emscripten's own
//          canonical API (libbrowser.js), which requests real Fullscreen
//          AND calls canvas.requestPointerLock() itself once fullscreen
//          genuinely engages, handling both root causes with one call.
//          Re-shows itself if the user later exits fullscreen (Esc, etc.)
//          so there's an obvious way back in.
//   v11 The v10 cg_shadows fix never actually reached the client -- real
//       user retest still showed the identical spam. Root cause:
//       games/quake3/assets/manifest.json (the one, single URL every
//       client fetches to learn each pak's current checksum -- see
//       sys_common.js's UpdateManifest) hit a genuinely stuck BunnyCDN
//       edge cache -- confirmed directly via headers (cache-control:
//       public, max-age=2592000, cdn-cache: HIT, last-modified from
//       WEEKS before this fix) that kept serving a stale checksum even
//       immediately after a fresh re-upload, and even with a cache-
//       busting query string appended (confirmed empirically this pull
//       zone ignores query strings for its cache key -- doesn't help
//       here). Same class of stuck-cache issue this project has hit
//       with BunnyCDN before; same proven fix -- move to a genuinely new
//       path. Since manifest.json and every pak fetch are BOTH always
//       relative to the single `fs_cdn` prefix (no way to freshen just
//       the manifest on its own), re-uploaded the FULL assets tree (all
//       8 paks + a correct manifest, ~340MB) to a new prefix,
//       games/quake3-v2/assets/, and updated client_index.html's fs_cdn
//       to point there -- confirmed fresh via a direct fetch showing the
//       correct checksum and today's real last-modified timestamp.
const QUAKE3_CLIENT_URL = `${QUAKE3_ORIGIN}/games/quake3/v11/index.html`;
// Only messages carrying this exact source tag, from exactly this CDN
// origin, are ever trusted -- same split already established for DOOM's
// relay bridge (validate on the receiving end, since the shell page posts
// with targetOrigin '*' to work across both local dev and production
// embeds).
const ENGINE_LOG_SOURCE = 'wewatch-quake3';
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

  // Bridges the engine's own console output (Com_Printf, including
  // [TEXTURE MISSING] etc.) into window.capturedLogs -- the same array
  // VideoWatch.jsx's own console.log/warn/error interception feeds, and
  // the "green logs" export button reads from. Pushed directly here
  // rather than threaded through VideoWatch -- window.capturedLogs is a
  // plain global array, not React state, so there's nothing to lift.
  useEffect(() => {
    const handler = (event) => {
      if (event.origin !== QUAKE3_ORIGIN) return;
      const data = event.data;
      if (!data || data.source !== ENGINE_LOG_SOURCE || data.type !== 'engine-log') return;
      if (!window.capturedLogs) window.capturedLogs = [];
      window.capturedLogs.push({
        type: data.level === 'error' ? 'error' : data.level === 'warn' ? 'warn' : 'log',
        time: Date.now(),
        args: [`[Quake3 Engine] ${data.text}`],
      });
      if (window.capturedLogs.length > 5000) window.capturedLogs.splice(0, 1000);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

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
