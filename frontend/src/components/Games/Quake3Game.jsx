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
import { useAuth } from '../../contexts/AuthContext';

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
//   v12 Real user's v11 retest confirmed the crash and NULL-poly-shader
//       spam are both genuinely fixed, but surfaced 6 real, VISIBLE
//       missing-texture warnings (not gameplay-blocking, just cosmetic):
//       projectionShadow (confirmed via source -- registered
//       unconditionally at renderer init, but only ever drawn with when
//       cg_shadows uses the projection-shadow style, which is unreachable
//       now that shadows are disabled -- zero visual effect, log-only,
//       left alone) + 6 menu-art widgets: 3_cursor2, switch_on/off,
//       sliderbutt_0/1, slider2. Confirmed via direct pak inspection AND
//       a real, official Ubuntu-repo openarena-085-data package download
//       (same content, same gap in both -- not something this project's
//       own curated asset subset dropped) that 5 of these 6 genuinely
//       exist, just under menu/art_blueish/* instead of the generic
//       menu/art/* path OpenArena's own menu-def code references; the
//       6th (slider2, the slider-track background) is completely absent
//       from OpenArena 0.8.5 under any theme name in either source. Fixed
//       with a small new shader script (aliasing the 5 real blueish
//       widgets to their menu/art/* names) + one small synthesized
//       placeholder image for the genuinely-missing slider2, both added
//       to pak8-oa-vm.pk3. Since this touches pak8 again (same pak the
//       v11 fix touched), bumped assets to yet another fresh prefix,
//       games/quake3-v3/assets/, rather than reuse -v2 -- its own
//       manifest.json had already been fetched during v11's own
//       verification moments earlier and could plausibly have started
//       caching on its own, same class of risk this whole v11 fix was
//       about avoiding in the first place.
//   v13 Real user's v12 retest surfaced 4 more real issues in one pass:
//       (1) more weapons render now (a side effect of texture fixes
//       elsewhere), but firing several of them produced errors and the
//       NULL-poly-shader spam continued (1989x) -- root-caused via a full
//       shader-script audit (not guessed) to a SYSTEMIC gap: essentially
//       every weapon's hit/explosion/muzzle-flash shader in this
//       project's curated asset pack referenced a missing image --
//       bulletExplosion (8 missing animated frames), rocketExplosion (8),
//       grenadeExplosion, bfgExplosion, plasmaExplosion, railExplosion,
//       every muzzle flash, plus the weapon models' own body/skin
//       textures -- ~100 missing files total. Fixed by synthesizing real
//       placeholder art (radial burst/spark, streak, flat metal-tile
//       generators, thematically colored per weapon) for every one,
//       added to pak8-oa-vm.pk3.
//       (2) "top roof... missing, showing wireframes" -- root-caused by
//       strings-scanning dm4ish's own compiled BSP for its shader names
//       and cross-checking each: textures/skies/hellsky (this map's own
//       sky/ceiling surface) has NO shader definition and no fallback
//       image anywhere in the curated pack -- sky surfaces render through
//       a dedicated code path (R_AddSkySurface) that shows a hole/
//       wireframe rather than a checkerboard default when totally
//       unresolvable. Fixed with a real skyparms shader definition
//       reusing env/sky1/sky001 -- a complete, real, already-present
//       6-face skybox used correctly elsewhere in this same pack.
//       (3) "unnamed players" -- default.cfg hardcodes every connecting
//       player's name to the literal string "Player", making every real
//       WeWatch user in a match visually indistinguishable. Fixed
//       client-side: sanitizes the real logged-in username (alphanumeric/
//       underscore/hyphen only, capped length -- this reaches a genuine
//       Q3 console-command parser, so unsanitized input would be a real
//       command-injection surface, not just a cosmetic risk) and appends
//       it as a `name%20<value>` query-command segment, verified via a
//       standalone Node simulation of client_index.html's own
//       getQueryCommands() parser to confirm it produces the correct
//       `+name <value>` command with no interference from the existing
//       `?wsurl=`/`&connect%20x:1` segments.
//       (4) "I thought we get to select the stages before a game starts"
//       -- confirmed via the supervisor's own spawn args
//       (`+map dm4ish`, hardcoded): map/arena selection has never been
//       built, every match always loads the same single map. A real,
//       missing feature, not a bug -- flagged for a decision on whether
//       to build it, not fixed here.
//   v14 Real user's v13 retest showed: the sky/wireframe fix confirmed
//       working, but items/collectibles didn't render well and some
//       shooting animations seemed missing, with the NULL-poly-shader
//       spam still continuing at the same sustained rate. Root-caused
//       (not guessed) via three separate investigative steps:
//       1. The v13 weapon-fx fix targeted one-shot muzzle-flash/
//          explosion effects, but the sustained ~230/sec spam rate never
//          matched that (bursty, tied to actual shots) -- it matches
//          PERSISTENT bullet/burn/plasma impact-decal marks instead,
//          which get re-added to the scene every single frame for their
//          ~10s lifetime (cg_marks.c) once created. gfx/damage/
//          bullet_mrk/burn_med_mrk/plasma_mrk had zero shader definition
//          anywhere in the curated pack.
//       2. Checking item pickups (bg_itemlist in bg_misc.c) against the
//          curated pack found a much bigger, systemic gap: 41 item
//          MODELS (.md3 files -- health, armor, ammo, every weapon
//          pickup, every powerup, holdables) were completely absent, not
//          just missing textures.
//       3. Both root-caused to the SAME underlying cause: this project's
//          curated OpenArena asset pack starts at pak1 -- it never
//          included pak0.pk3, the foundational base data every standard
//          OpenArena install ships. Confirmed via a real, official
//          Ubuntu-repo openarena-data package download that pak0 alone
//          resolves 37 of 41 missing item models, all 8 missing item
//          icons, all 3 impact-mark textures, the real (non-blueish)
//          menu-art widgets (making the earlier v10 alias-shader fix
//          fully redundant -- removed), and most of v13's own weapon-fx
//          textures (68 of 100, also removed to let the real pak0
//          assets show instead of shadowing them with cruder
//          placeholders). Added pak0.pk3 (~39MB) to the curated set.
//       Still synthesized (pak0 doesn't cover everything): 32 weapon-fx
//       textures, and the sky-shader fix (kept as-is over switching to
//       pak0's own hellsky definition, which is itself incomplete --
//       missing its cloud overlay texture -- while the existing
//       substitute is already confirmed working). 4 minor secondary
//       decorative item sub-models (spinning rings/orbiting spheres, not
//       the primary item shape) remain unfixed -- low-priority, cosmetic
//       only, not attempted (a binary 3D model format, unlike a flat
//       texture, for a purely decorative accent).
//       Critically, the SUPERVISOR (a separate Railway deploy, not this
//       CDN client) was updated in lockstep -- sv_pure requires the
//       server's own pak list to exactly match the client's, so adding
//       pak0 client-side alone would have broken every new connection
//       with a pure-server pak mismatch, not just left content missing.
//       Also hit and fixed, on the supervisor side specifically, the
//       exact same class of stuck-BunnyCDN-edge-cache issue already
//       documented for the client's own assets/manifest.json (v10->v11)
//       -- except this time on the supervisor's FIXED, unversioned
//       bootstrap.js download path, which can't simply be bumped to a
//       new version number the way the client's checksum-addressed
//       assets can. Moved to a new path (baseoa -> baseoa-v2) instead,
//       confirmed fixed via railway logs scoped to the exact deployment
//       ID (an unscoped `railway logs` call was found to show stale,
//       historical output from a previous deployment -- a real CLI
//       gotcha, not a second cache bug).
//   v15 Real user's v14 retest: guns/items load correctly now, but two
//       remaining reports. (1) A dramatic slowdown near environmental
//       hazards (lava) that clears once you move past it. Root-caused
//       via direct source reading (not guessed): the log's own
//       "compiled vertex arrays: disabled" / "rendering primitives:
//       multiple glArrayElement" lines confirm R_DrawElements
//       (renderergl1/tr_shade.c) is taking its slow, one-vertex-at-a-
//       time fallback path (R_DrawStripElements/R_ArrayElementDiscrete,
//       real JS-bridge calls per vertex) for EVERY triangle strip in the
//       entire game -- its own heuristic picks that path whenever
//       qglLockArraysEXT (GL_EXT_compiled_vertex_array) is unbound.
//       That extension has no real WebGL equivalent and will genuinely
//       never bind on this platform -- but the fast alternative
//       (qglDrawElements, a direct `#define` alias to WebGL's real,
//       always-available glDrawElements, confirmed via qgl.h -- not a
//       runtime pointer that could ever be null the way
//       qglLockArraysEXT is) doesn't actually need that extension at
//       all. The heuristic was tuned for 1999 desktop GL drivers and is
//       simply wrong here. Lava areas hit this hardest because wave-
//       deformed liquid surfaces stack extra per-vertex CPU-side
//       deformVertexes math on top of the already-slow per-vertex-call
//       path, and the cost scales with how much of the surface is
//       currently in view -- exactly matching "slows down near it,
//       smooths out once you pass it". Fixed with an #ifdef EMSCRIPTEN
//       branch forcing the fast, single-batched-call path
//       unconditionally, bypassing the qglLockArraysEXT-based check.
//       Should meaningfully help general smoothness too, not just lava
//       specifically, since it affects every triangle in the game.
//       (2) "an initial pink hue before it normalizes" -- Quake3's
//       classic default-image placeholder, shown briefly whenever a
//       surface's texture hasn't finished uploading to the GPU yet.
//       The log shows a genuine ~1.5s asset-loading/texture-binding
//       burst (CL_InitCGame) right as real gameplay starts -- an
//       inherent one-time warm-up, not really "fixable" at the engine
//       level. What WAS a real, fixable gap: Quake3Game.jsx's own
//       loading overlay was gated purely on the iframe's onLoad DOM
//       event -- which fires the instant the shell HTML parses (near-
//       instant), nowhere close to when the actual engine finishes
//       booting/connecting/loading. Users were seeing raw, still-
//       loading gameplay (including this exact warm-up window) for the
//       whole remaining boot sequence. Fixed by extending the loading
//       screen to also wait for a real "CL_InitCGame:" marker forwarded
//       through the existing engine-log bridge (plus a small buffer for
//       the browser's own WebGL uploads to settle), with a 25s fallback
//       timeout so a genuine connect failure can't leave a user stuck
//       behind the spinner forever.
//   v16 REVERTED v15's R_DrawElements rendering-path change. Real user's
//       v15 retest confirmed it did fix the lava-area slowdown, but
//       caused genuine visual distortion on guns/weapons/ammo/arena
//       geometry -- a real correctness regression, not acceptable. Root
//       cause is almost certainly Emscripten's own client-side-vertex-
//       array emulation for the batched glDrawElements path, which the
//       engine's own boot log has been explicitly flagging as fragile
//       this entire investigation ("using emscripten GL immediate mode
//       emulation. This is very limited in what it supports") -- the
//       slower, individually-called path (glColor4ubv/glTexCoord2fv/
//       glVertex3fv) has been correct throughout, the batched one
//       clearly is not. Reverted tr_shade.c's R_DrawElements back to its
//       original heuristic exactly. The loading-screen extension from
//       v15 (CL_InitCGame-gated, masks the initial pink-hue texture
//       warm-up) is untouched -- pure frontend/React, no connection to
//       engine rendering, no reason to revert.
//       r_primitives stays a live, runtime-settable cvar (no rebuild
//       needed) for testing this specific tradeoff directly from the
//       in-game console if wanted later.
//   v17 Real user's v16 retest confirmed the distortion was gone (revert
//       worked cleanly), but confirmed the lava-area slowdown is
//       unrelated to overall scene complexity -- tried cg_drawGun 0 /
//       r_lodbias 2 / r_picmip 2 (reducing weapon-model/player-model/
//       texture-detail geometry) and the slowdown near lava was
//       identical, isolating it squarely to that one surface's own
//       rendering cost. Investigated its actual shader definition
//       (textures/liquids/lavahell) directly rather than guess further:
//       cull disable (double-sided, 2x triangles) + 3 full additive
//       stages (each re-runs the entire slow per-vertex JS-bridge draw
//       path over the same geometry -- confirmed unavoidable, since the
//       fast batched glDrawElements path is unsafe for correctness on
//       this platform, per v15/v16's own history) + a finely-tessellated
//       (tessSize 128) per-vertex CPU wave deformation + per-stage
//       per-vertex texture turbulence (tcMod turb), 3x over. Genuinely
//       one of the most expensive shader shapes in the whole Q3
//       vocabulary, fully explaining why it's isolated to this one
//       surface and unaffected by general-geometry cvars (none of them
//       touch this surface's own shader script at all -- r_subdivisions
//       in particular doesn't even apply here; tessSize is a completely
//       separate, shader-specific mechanism for deformVertexes surfaces).
//       Fixed with a lighter override for this one shader (pak8-oa-vm.pk3,
//       scripts/lava_perf_fix.shader): cull disable -> cull back (halves
//       triangle count), tessSize 128 -> 256 (roughly halves the wave-
//       deform vertex density), 3 additive stages -> 1 (the biggest
//       single win -- removes 2 full extra per-vertex JS-bridge passes
//       over the whole surface). All gameplay-relevant surfaceparms
//       (lava/fog/water/etc) and the deformVertexes wave itself (the
//       actual "waving lava" visual signature) are unchanged -- a real,
//       honest tradeoff of some of the layered glow/turbulence richness
//       for real speed where it was actually the confirmed bottleneck,
//       not a correctness change like v15's reverted attempt.
//       The Railway-hosted supervisor (separate deploy) was updated in
//       lockstep to the same pak8 -- sv_pure requires an exact server/
//       client pak match. Its own CDN path was also bumped preemptively
//       (baseoa-v2 -> baseoa-v3, the same un-checksummed, fetched-on-
//       every-room-spawn URL shape that already needed one cache-escape
//       bump once before) rather than risk hitting the same stuck-edge-
//       cache issue on a path that's had real traffic since v14.
//   v18 User chose to actually root-cause why the v15 batched-rendering
//       attempt broke correctness, rather than accept the slower path
//       permanently. Found it by directly reading Emscripten's own SDK
//       source (src/lib/libglemu.js glDrawElements), not guessing: two
//       real, compounding bugs in its client-side-vertex-array
//       emulation, both specific to a caller with no bound element
//       array buffer using 32-bit (GL_UNSIGNED_INT) indices -- exactly
//       this engine's own calling pattern (GL_INDEX_TYPE is
//       GL_UNSIGNED_INT, tr_local.h). (1) Every downstream site in that
//       function hardcodes 16-bit index reads/uploads regardless of the
//       real index width -- confirmed by the function's own assertion
//       ("We can only emulate buffers of this kind, for now"), silently
//       compiled out in a release/ASSERTIONS=0 build instead of ever
//       catching the mismatch -- silently corrupting which vertex every
//       triangle actually references. (2) prepareClientAttributes() is
//       called using the INDEX count as if it were the VERTEX count,
//       over-reading client-array memory past the real vertex data for
//       any indexed/vertex-sharing geometry (virtually all of it),
//       pulling in adjacent WASM heap bytes as if they were valid
//       color/texcoord/position data. Both are the confirmed root cause
//       of v15's distortion. Fixed directly in the Emscripten SDK
//       source this build compiles against (not a post-build patch on
//       minified output -- a real source edit, rebuilt through the
//       normal pipeline for correct integration): convert the real
//       index buffer to a genuine 16-bit one and compute the true
//       vertex count, once, at glDrawElements's own entry point, then
//       let every line of existing logic run completely unmodified
//       against these corrected inputs. Re-enabled the same
//       primitives=2 override tr_shade.c had in v15 (this time with the
//       actual bug fixed, not just avoided) -- v16/v17's revert is
//       superseded, not layered on top of.
//   v19 Real user's v18 retest: the major geometric distortion (guns/
//       arena/geometry in the wrong shape/position) is confirmed fixed
//       by v18's index-buffer fix, and the game runs smooth. But a
//       narrower, remaining texture-specific issue on gun and lava
//       surfaces specifically -- described as "stretched/skewed" plus
//       "seams/gaps" (not garbled/wrong-colored, ruling out a data-
//       corruption class of bug and pointing at texture-coordinate
//       offset/binding specifically). Traced the actual GPU-side upload
//       path (renderer.prepare() in libglemu.js, not yet investigated
//       in v18) and found a second, real, plausible bug source: the
//       engine's own boot log has been explicitly warning about this
//       exact flag this entire investigation ("using emscripten GL
//       emulation unsafe opts. If weirdness happens, try
//       -sGL_UNSAFE_OPTS=0") -- GL_UNSAFE_OPTS defaults to true in this
//       SDK and this project never overrode it. It's a "skip re-
//       uploading vertex data if the same renderer/buffer/stride looks
//       active as last draw call" optimization -- and that reuse check
//       never accounts for the CPU-side restride buffer's *content*
//       having changed between two different surfaces that happen to
//       share the same GPU buffer/stride (gun view-models and lava both
//       use distinctive, non-lightmapped iterators/strides, plausibly
//       common enough with each other or adjacent surfaces to trigger
//       this false-positive "skip" and render stale vertex/texcoord
//       data from a previous draw -- matching "stretched/skewed"/
//       "seams" far better than the already-fixed index-count bug
//       would). Disabled via -sGL_UNSAFE_OPTS=0 (ioq3/Makefile,
//       CLIENT_LDFLAGS) -- exactly the engine's own suggested
//       troubleshooting step, not a new theory. A flags-only Makefile
//       change, so forced a genuinely clean rebuild (make's mtime-based
//       tracking doesn't reliably detect flag-only changes) -- verified
//       the resulting compiled output no longer contains the "canSkip"
//       logic that flag used to compile in, and that v18's own index-
//       conversion fix is still present unchanged.
//   v20 Real user's v19 retest: the stretching/seams were still there --
//       GL_UNSAFE_OPTS was a real, plausible theory but confirmed NOT the
//       (or the sole) cause. Got a live screenshot of the actual bug via
//       a headless Playwright session hitting the real deployed client +
//       supervisor (not guessed): a bright white streak stretched from
//       the gun clear across the screen, a similar red streak on the
//       right, pink patches on the ceiling -- classic "triangle
//       referencing a vertex from an unrelated part of the scene"
//       corruption. Also checked the "[TEXTURE MISSING] majorlegs/
//       majortorso" console lines the user separately flagged -- traced
//       through the actual cgame source (CG_RegisterClientSkin) and
//       confirmed these are near-certainly harmless: every Q3 model has
//       placeholder shader names baked in at export time as a load-time
//       fallback, warned about regardless of whether the real .skin file
//       (the thing that actually matters) loaded fine -- no "skin load
//       failure" was printed, which is the message that fires on a
//       genuine failure. Not the cause of the visible corruption.
//       Got a decisive, controlled A/B via URL-injected `+set
//       r_primitives 1/2` (sidesteps the user's separate "can't type
//       underscore in console" bug entirely) against the same map/
//       connection: r_primitives=2 (the batched path, forced on by v18)
//       reproduces the corruption every time; r_primitives=1 (the
//       original safe per-vertex path) is completely clean every time.
//       So v18's SDK fix (32-bit index conversion) was real and
//       necessary but not sufficient -- there's still at least one more
//       bug in the batched-draw emulation path, not yet root-caused.
//       Reverted tr_shade.c's EMSCRIPTEN override (back to the original
//       heuristic, which always resolves to primitives=1 here since
//       qglLockArraysEXT never binds on this platform) rather than keep
//       hunting for the second bug with a known-corrupted path live in
//       production -- same principle as the original v15->v16 revert
//       earlier in this investigation. The lava-area slowdown that
//       originally motivated forcing primitives=2 was already fixed
//       independently in v17 (a lighter shader script, unrelated to
//       r_primitives) and is unaffected by this revert. Kept the
//       libglemu.js SDK-level index-conversion fix in place either way
//       -- it's correct, independent groundwork for whoever picks the
//       batched-path investigation back up.
//   v21 v20's revert fixed the texture corruption (user-confirmed), but
//       brought back the general slowness the batched path had been
//       masking -- asked what's left to reduce processing cost without
//       touching the now-known-buggy batched-draw path again. Two
//       changes, both deliberately zero-risk to correctness (neither
//       touches rendering LOGIC, only compiled-in defaults / codegen):
//        1. -msimd128 added to the js-platform build (ioq3/Makefile,
//           OPTIMIZEVM) -- pure WASM SIMD vectorization of existing
//           per-vertex math, same source, same logic, just faster
//           codegen. Can't reintroduce the v15/v18-class bug since it
//           changes no program behavior.
//        2. Three safe perf cvars flipped in default.cfg (inside
//           pak8-oa-vm.pk3, this project's own override pak): cg_marks 0
//           (stop bullet-mark decals from accumulating), r_fastsky 1
//           (flat-color sky instead of the full skybox pass), r_picmip 2
//           (lower-res textures, less memory bandwidth per frame).
//           Explicitly did NOT set r_vertexlight 1 (would've been the
//           single biggest win but strips lightmap detail game-wide --
//           asked first, user said skip it, so lightmaps stay on).
//       pak8-oa-vm.pk3's content changed again (default.cfg), so per this
//       project's own established BunnyCDN stuck-edge-cache handling: the
//       client-facing checksum-addressed asset base moved games/quake3-v7
//       -> games/quake3-v8 (client_index.html's fs_cdn updated to match;
//       prerender_index.py's own CONTENT var was found stale -- pointing
//       at the unversioned path from before v7 even existed -- and fixed
//       too, with a note not to trust it blindly next time), and the
//       supervisor's own server-side pak mirror moved baseoa-v3 ->
//       baseoa-v4 (bootstrap.js's CDN_BASE updated, Railway redeployed) --
//       the dedicated server has no use for cg_*/r_* cvars itself, this
//       is purely to keep the two copies from silently drifting apart.
//   v22 v21's SIMD + cvar pass made "no major change" -- user still saw a
//       real slowdown near lava on a laptop. Root cause is structural,
//       not a new bug: still forced onto r_primitives=1 (the slow per-
//       vertex path) by the still-unfixed batched-draw bug (v18-v20
//       history), so every surface pays a JS/WASM-boundary-crossing cost
//       per vertex, and lava -- even already halved once in v17 -- is
//       still the densest single surface in the map. Offered a further
//       lava-only tweak (quick, safe) alongside actually root-causing the
//       batched-draw bug (bigger payoff, no timeline guarantee); user
//       chose the quick tweak only. Two more cuts to lava_perf_fix.shader
//       (pak8-oa-vm.pk3), same "keep gameplay surfaceparms + the waving
//       signature, cut per-vertex cost" principle as v17: tessSize
//       256->512 (halves the tessellated vertex count again) and dropped
//       tcMod turb, keeping only tcMod scroll (removes one of two
//       per-vertex texcoord computations on the remaining stage). Real,
//       honest further visual softening in exchange for real cost
//       reduction -- explicitly incremental, not expected to fully
//       resolve the underlying primitives=1 ceiling on its own.
//       Same asset-path-bump discipline as v21: client base
//       games/quake3-v8 -> games/quake3-v9, supervisor mirror
//       baseoa-v4 -> baseoa-v5. Engine binaries unchanged from v21 (no
//       C/WASM changes this round) -- only index.html (new fs_cdn) and
//       the pak content differ.
const QUAKE3_CLIENT_URL = `${QUAKE3_ORIGIN}/games/quake3/v22/index.html`;
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

// client_index.html's getQueryCommands() turns each query-string KEY
// (not a real key=value pair -- a deliberately custom scheme) into a raw
// console command: it decodes the key, splits on spaces, and prepends
// '+' to the first token -- e.g. `?name%20Alice` becomes the startup arg
// `+name Alice`, which Q3's own console dispatcher (Cmd_ExecuteString ->
// Cvar_Command fallback) treats exactly like typing `name Alice` at the
// console, correctly setting the `name` cvar. Since that splitter has no
// concept of quoting, a raw username containing a space would silently
// turn into extra, wrong tokens -- and since this reaches a real
// console-command parser, an unsanitized name is also a genuine command-
// injection surface (Q3 console syntax uses `;` to chain commands). Strip
// down to a single safe alphanumeric/underscore/hyphen token, matching Q3's
// own MAX_NAME_LENGTH-ish sanity bound, with a generic fallback if that
// leaves nothing usable.
function sanitizeQuake3Name(raw) {
  const cleaned = (raw || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  return cleaned || 'Player';
}

export default function Quake3Game({ roomId, onClose, onEndGame, isHost }) {
  const { currentUser } = useAuth();
  const [loaded, setLoaded] = useState(false);
  // `loaded` only means the iframe's own HTML finished parsing -- near-
  // instant, since it's just a small shell page with inline scripts. The
  // real engine boot (WASM init, asset download, connect, map load, and a
  // real ~1-1.5s texture-upload burst right as gameplay starts --
  // CL_InitCGame in the engine's own log) takes far longer and happens
  // entirely inside the iframe's own JS runtime, invisible to a plain DOM
  // onLoad event. Without this, users saw raw, still-loading gameplay for
  // that whole window -- surfaces whose textures hadn't finished
  // uploading yet render with Quake3's classic pink/black default-image
  // placeholder, reported as "an initial pink hue before it normalizes".
  // `engineReady` is set from the CL_InitCGame log line itself (via the
  // same engine-log bridge below), plus a small buffer so the browser's
  // own WebGL texture uploads have a moment to actually settle after the
  // engine's own bookkeeping says they're done.
  const [engineReady, setEngineReady] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const iframeRef = useRef(null);

  const wsUrl = `${QUAKE3_SUPERVISOR_WS}/?room=${encodeURIComponent(roomId)}`;
  const playerName = sanitizeQuake3Name(currentUser?.username);
  // The engine needs a syntactically valid `\connect <addr>` argument to
  // actually initiate its connect flow -- the real transport target is
  // already fixed via ?wsurl=, so this address itself is never used for
  // anything beyond satisfying that parse. `name%20<player>` sets each
  // real WeWatch user's actual name in-game (default.cfg previously
  // hardcoded every connecting player to the literal name "Player",
  // making every participant in a match visually indistinguishable --
  // a real, confirmed gap, not a hypothetical one).
  const quake3Url = `${QUAKE3_CLIENT_URL}?wsurl=${encodeURIComponent(wsUrl)}&connect%20x:1&name%20${encodeURIComponent(playerName)}`;

  useEffect(() => {
    if (engineReady && !isMobileDevice()) setShowControls(true);
  }, [engineReady]);

  // Safety net: if CL_InitCGame never fires (a failed connect, a dropped
  // relay, anything else going wrong before the engine reaches that
  // point), engineReady must not stay false forever -- that would leave
  // the user stuck behind the loading spinner indefinitely, strictly
  // worse than today's behavior. 25s is comfortably past every real
  // boot-to-CL_InitCGame time seen in testing (a few seconds at most).
  useEffect(() => {
    if (engineReady) return undefined;
    const t = setTimeout(() => setEngineReady(true), 25000);
    return () => clearTimeout(t);
  }, [engineReady]);

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
      // CL_InitCGame fires exactly once per real match/level-load,
      // regardless of player identity -- a robust, fixed-string marker
      // (unlike matching on "<username> entered the game", which would
      // work but is needlessly fragile to name/color-code formatting).
      // By this point cgame is loaded, map geometry is loaded, and every
      // registered image has been touched/pre-uploaded -- the small
      // extra delay lets the browser's own WebGL uploads actually settle
      // before the loading screen lifts.
      if (typeof data.text === 'string' && data.text.includes('CL_InitCGame:')) {
        setTimeout(() => setEngineReady(true), 600);
      }
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
      {(!loaded || !engineReady) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-white/25 border-t-white animate-spin" />
          <p className="text-sm text-gray-400">
            {!loaded
              ? 'Loading Quake Death Match… (first load may take a moment)'
              : 'Connecting to the match…'}
          </p>
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
