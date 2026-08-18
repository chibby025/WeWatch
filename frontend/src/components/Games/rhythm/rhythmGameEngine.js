// Three.js gameplay: tilted note highway, gem notes with sustain trails,
// strike-line frets, particle bursts, stage spotlights, starfield, bloom.
//
// Vendored + adapted from github.com/petehottelet/claudetarhero (MIT).
// The only real changes from the original: fret/highway colors are now
// constructor-injectable (`options.instrumentColors`/`highwayAccentColor*`)
// instead of hardcoded module constants — this is the entire mechanism for
// per-instrument visual skinning (guitar/drums/bass/vocals all share this
// identical engine; only the colors differ). Everything else — hit-window
// judgment, scoring, rock-meter fail state, Star Power, particle/bloom
// rendering, the pressLane/releaseLane touch-ready input API, and the
// responsive fovForAspect() FOV scaling — is unchanged from the original.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const LANES = 5;
const LANE_W = 2;
const HIGHWAY_W = LANES * LANE_W;
const HIGHWAY_LEN = 70;
const SPEED = 26; // world units per second
const HIT_Z = 0;

const HIT_WINDOW = 0.14;
const PERFECT_WINDOW = 0.055;
const LEAD_IN = 3.0;

// Background-FX intensity curve. The slider is 0..1; we remap it so that even
// at 0 the wave is still faintly visible (FX_FLOOR), the lower half (0..0.5)
// stays subtle/non-distracting (up to FX_MID), and the upper half ramps to
// full strength at 1.0.
const FX_FLOOR = 0.1;   // dimmest the background ever gets (slider at 0)
const FX_MID = 0.32;    // intensity at the slider's midpoint (subtle)
function fxCurve(s) {
  s = Math.max(0, Math.min(1, s));
  return s <= 0.5
    ? FX_FLOOR + (FX_MID - FX_FLOOR) * (s / 0.5)
    : FX_MID + (1 - FX_MID) * ((s - 0.5) / 0.5);
}

// Default fret colors — overridable per instance via options.instrumentColors
// (see the Game constructor below) for per-instrument visual skinning.
const DEFAULT_FRET_COLORS = [0x3fe34a, 0xff3b30, 0xffd60a, 0x2f7cff, 0xff9500];
const DEFAULT_ACCENT = 0x8a2be2;
const DEFAULT_ACCENT_RAIL = 0xb14cff;

// -------------------------------------------------- highway design upgrades
// 1. Combo-reactive camera — FOV tightens as the streak builds, easing back
//    toward baseFov the instant it resets (streak=0 on a miss/overstrum).
const CAMERA_BASE_Z = 9.5;
const COMBO_FOV_STREAK_CAP = 40;   // streak at which the FOV-tighten maxes out
const COMBO_FOV_MAX_DELTA = 4;     // degrees tightened at max combo
// 5. Star Power camera — an extra FOV pull-in + forward dolly + wider sway on
//    top of whatever the combo camera above is already doing, layered
//    additively so the two never fight.
const SP_FOV_KICK = 2.5;
const SP_CAMERA_Z = 9.0;
const CAMERA_SWAY_BASE = 0.35;
const CAMERA_SWAY_SP = 0.55;
// 3. Lane trail streaks — a persistent ambient glow per lane once the streak
//    passes STREAK_TRAIL_MIN, ramping to full intensity by
//    STREAK_TRAIL_MAX_STREAK, plus a brief per-hit flash on top.
const STREAK_TRAIL_MIN = 8;
const STREAK_TRAIL_MAX_STREAK = 38;
// 4. Miss feedback — a one-shot red flash on the missed lane's fret ring,
//    mirroring the existing hit shockwave but for misses/overstrums.
const MISS_FLASH_DECAY = 3.2; // per-second decay rate
// 6. Player-overlay hit flash — same one-shot-decay pattern as MISS_FLASH_DECAY
//    above, but for the DOM instrument player overlay's own per-hit glow
//    burst (see getPlayerVisualState / InstrumentCloseup.jsx's InstrumentTopOverlay).
const PLAYER_HIT_FLASH_DECAY = 3.4; // per-second decay rate — ~0.3s to fade

// 7. Audience count scales with the rock/accuracy meter — a bigger reveal
//    pool (beyond the always-visible core crowd) fades members in/out as
//    `rock` crosses each one's own threshold (see _buildAudience). Uses
//    `rock`, not streak: streak resets to 0 on a single miss, and tying
//    crowd SIZE to that would empty the venue over one bad note — `rock`
//    moves gradually instead, the right signal for a slow "buildup".
const AUDIENCE_REVEAL_FADE = 10; // smoothing window (rock points) around each member's own threshold
// 8. Dance-burst "hype" wave — a decaying scalar, spiked on streak
//    milestones / Star Power activation / occasional PERFECT hits, that
//    drives a brief scale/opacity surge across the crowd panels (see
//    _updateAudience) — a real photo has no second "arms up" pose to swap
//    to, so the burst reads as the crowd surging/jumping instead.
const DANCE_BURST_DECAY = 0.5; // per-second decay rate
// 9. Supernova twinkle pool — ambient background sparkle layered into the
//    starfield, independent of gameplay performance (always ticking, idle
//    menu screen included), with a small bonus chance to fire immediately
//    on a PERFECT hit. See _buildBackground/_updateSupernovas.
const SUPERNOVA_COUNT = 8;
const SUPERNOVA_MIN_COOLDOWN = 3;   // seconds
const SUPERNOVA_MAX_COOLDOWN = 12;  // seconds
const SUPERNOVA_PERFECT_CHANCE = 0.12; // probability a PERFECT hit fires one early

// Rock meter (the "booed off" fail). Tuned so anyone actually playing (>~50%
// accuracy) hears the whole song, while barely-playing still fails. Real
// Clone Hero charts are dense, and the old values (60 / +1.3 / -5) booted
// casual players within seconds.
const ROCK_START = 80;       // starting fill (0-100)
const ROCK_HIT = 2.6;        // gain per hit
const ROCK_MISS = 2.2;       // loss per miss
const ROCK_FAIL_GRACE = 6;   // seconds of intro grace before a fail can trigger
const KEYS = { KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyG: 4, Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4 };

const laneX = (lane) => (lane - (LANES - 1) / 2) * LANE_W;

// Pick a vertical FOV so the highway stays a usable width on tall/narrow
// (portrait phone) screens. We keep the horizontal FOV roughly constant by
// raising the vertical FOV as the aspect ratio drops below the 16:9 baseline.
//
// Uncapped, this formula grows without bound as the screen gets narrower —
// confirmed by direct computation for real mobile portrait aspect ratios
// (~0.46, e.g. 390x844, 414x896, 360x780 phones): it wants ~130° of vertical
// FOV, far beyond any sane 3D camera range (normal games run 60-100°) and a
// real source of fisheye-style distortion. MAX_VFOV caps it — real end-to-end
// testing (see rhythm-hero-mobile-fit investigation, 2026) confirmed the
// existing camera sway (CAMERA_SWAY_BASE below), which is imperceptible at a
// normal FOV, becomes a measurable, asymmetric on-screen distortion once the
// FOV gets this extreme — small off-axis camera positions are disproportion-
// ately amplified near the edges of a very wide frustum.
//
// Capping the FOV alone means the highway no longer shows its full "intended"
// width on very narrow screens (the horizontal FOV this formula is trying to
// preserve, BASE_HFOV, is no longer actually achieved once the vertical FOV
// hits the ceiling) — dollyMultiplierForAspect below computes how much
// further back the camera needs to sit, at the capped FOV, to recover that
// same target width instead — see its own comment for the derivation.
const BASE_VFOV = 58;
const BASE_ASPECT = 16 / 9;
const BASE_HFOV = 2 * Math.atan(Math.tan((BASE_VFOV * Math.PI) / 360) * BASE_ASPECT);
const MAX_VFOV = 92; // sane ceiling — was already an unnamed 92 magic number here
function idealVfovForAspect(aspect) {
  if (aspect >= BASE_ASPECT) return BASE_VFOV;
  return (2 * Math.atan(Math.tan(BASE_HFOV / 2) / aspect) * 180) / Math.PI;
}
function fovForAspect(aspect) {
  return Math.min(idealVfovForAspect(aspect), MAX_VFOV);
}

// How much further back (as a multiplier on CAMERA_BASE_Z/SP_CAMERA_Z) the
// camera needs to dolly once fovForAspect's cap has engaged, to recover the
// same visible highway width the uncapped formula was targeting.
//
// Derivation: at the original distance D0, the intended horizontal FOV is
// always BASE_HFOV (that's the whole point of idealVfovForAspect — see
// above), giving a target visible width W = 2*D0*tan(BASE_HFOV/2). Once
// vfov is clamped to MAX_VFOV, the ACTUAL horizontal FOV achieved (given the
// real aspect ratio) is smaller — actualHFOV = 2*atan(aspect*tan(MAX_VFOV/2))
// (the direct, non-inverted vfov->hfov relationship Three.js itself uses).
// To reproduce the same target width W at this narrower actual FOV, solve
// 2*D1*tan(actualHFOV/2) = W for D1: D1 = D0 * tan(BASE_HFOV/2)/tan(actualHFOV/2).
// That ratio (independent of D0) is the multiplier returned here.
function dollyMultiplierForAspect(aspect) {
  const idealV = idealVfovForAspect(aspect);
  if (idealV <= MAX_VFOV) return 1; // cap never engages at this aspect — no compensation needed
  const cappedRad = (MAX_VFOV * Math.PI) / 180;
  const actualHFOV = 2 * Math.atan(aspect * Math.tan(cappedRad / 2));
  return Math.tan(BASE_HFOV / 2) / Math.tan(actualHFOV / 2);
}

// ---------------------------------------------------------------- shaders
const highwayVert = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const highwayFrag = /* glsl */ `
  varying vec3 vWorld;
  uniform float uScroll;
  uniform float uBeat;
  uniform vec3 uLineColor;
  uniform float uPulse;

  void main() {
    float x = vWorld.x;
    float z = vWorld.z;

    vec3 col = vec3(0.018, 0.012, 0.045);

    // lane dividers every 2 units, edges brightest
    float fx = fract((x + 5.0) / 2.0);
    float dDiv = min(fx, 1.0 - fx) * 2.0;
    float divider = smoothstep(0.10, 0.0, dDiv);
    float edgeD = min(abs(x + 5.0), abs(x - 5.0));
    float edge = smoothstep(0.22, 0.0, edgeD);

    // beat lines scrolling toward the player
    float wz = z - uScroll;
    float fb = fract(wz / uBeat);
    float dBeat = min(fb, 1.0 - fb) * uBeat;
    float beatLine = smoothstep(0.16, 0.0, dBeat);

    // fade with distance
    float fade = smoothstep(-62.0, -8.0, z) * 0.85 + 0.15;

    col += uLineColor * divider * 0.55 * fade;
    col += uLineColor * 1.6 * edge * fade;
    col += uLineColor * beatLine * (0.22 + uPulse * 0.25) * fade;

    // subtle center sheen
    col += vec3(0.05, 0.02, 0.1) * smoothstep(5.0, 0.0, abs(x)) * 0.25 * fade;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Real crowd photo — supplied directly by the user, not sourced from a
// stock/found asset (a search for a genuinely free, verifiably-licensed
// animated crowd asset came up empty; see the mobile-framing investigation
// history for how that search went). A transparent WebP of a crowd shot
// from behind, dark rim-lit silhouettes holding up glowing phone screens —
// replaces the old procedural circle+trapezoid placeholder blobs below,
// which read as crude geometric shapes rather than an actual crowd.
// Hosted on BunnyCDN alongside every other real asset this game uses
// (instrument sprite sheets, posters) — same convention, not bundled into
// the frontend build.
const AUDIENCE_TEX_URL = 'https://letswatchout.b-cdn.net/games/rhythm/audience-crowd-v1.webp';
// Real pixel dimensions of the source image (1664x928) — used so every
// audience sprite's width/height stays correctly proportioned instead of
// stretching a non-square photo onto an arbitrarily-chosen plane shape.
const AUDIENCE_TEX_ASPECT = 1664 / 928;

function makeCrowdTexture() {
  const tex = new THREE.TextureLoader().load(AUDIENCE_TEX_URL);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ----------------------------------------------------- shared instance cache
// Every geometry/texture below is instance-agnostic — the same vertex data
// and pixels regardless of which song is playing or who's watching — so
// there's no reason to reconstruct them for every new Game() the way the
// original vendored code did. Built once, lazily, the first time any Game
// instance needs them, and never disposed (module-lifetime, same scope as
// the shader source strings above). This is what actually helps a late
// joiner: their spectator mirror's own Game() construction is genuinely
// cheaper (no CPU-side vertex generation, no re-randomizing the starfield)
// regardless of when it mounts, not just when it's pre-warmed ahead of time.
// Materials still get built per-instance below (their per-instrument color
// IS meaningfully different across instances), only their shared geometries
// are cached here.
let _shared = null;
function getShared() {
  if (_shared) return _shared;
  const starGeo = new THREE.BufferGeometry();
  const N = 1400;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 60 + Math.random() * 90;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.9;
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) - 8;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) - 30;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  _shared = {
    glowTex: makeGlowTexture(),
    crowdTex: makeCrowdTexture(),
    highwayPlane: new THREE.PlaneGeometry(HIGHWAY_W, HIGHWAY_LEN),
    rail: new THREE.BoxGeometry(0.18, 0.3, HIGHWAY_LEN),
    fretRing: new THREE.TorusGeometry(0.68, 0.09, 12, 32),
    fretDisc: new THREE.CircleGeometry(0.6, 28),
    streakTrailPlane: new THREE.PlaneGeometry(LANE_W * 0.7, HIGHWAY_LEN * 0.5),
    gemBase: new THREE.CylinderGeometry(0.62, 0.7, 0.26, 24),
    gemCap: new THREE.CylinderGeometry(0.4, 0.46, 0.3, 24),
    tailBox: new THREE.BoxGeometry(0.4, 0.12, 1),
    ringTorus: new THREE.TorusGeometry(0.7, 0.05, 8, 36),
    starGeo,
    sunDisc: new THREE.CircleGeometry(20, 48),
  };
  return _shared;
}

// ================================================================= Game
export class Game {
  constructor(canvas, hud, options = {}) {
    this.canvas = canvas;
    this.hud = hud; // { onScore, onRock, onSP, onJudge, onBanner, onCountdown, onEnd }
    // Per-instrument color skinning — the only structural change from the
    // vendored original, which hardcoded these as module constants.
    this.fretColors = options.instrumentColors || DEFAULT_FRET_COLORS;
    this.accentColor = options.highwayAccentColor ?? DEFAULT_ACCENT;
    this.accentColorRail = options.highwayAccentColorRail ?? DEFAULT_ACCENT_RAIL;
    // Spectator instances (mirroring another player's broadcast performance)
    // must never attach real keyboard listeners of their own — a spectator's
    // own stray keypresses shouldn't drive a highway that's supposed to be a
    // read-only mirror of someone else's relayed input. pressLane/releaseLane/
    // activateStarPower stay fully callable either way — only the internal
    // window listener setup is skipped.
    this.readOnly = !!options.readOnly;
    this.running = false;
    this._raf = 0;
    this._initThree();
  }

  // Recomputes baseCameraZ/spCameraZ for the given aspect ratio — call this
  // any time the aspect ratio changes (construction, resize), before using
  // either value. See dollyMultiplierForAspect's own comment for the math.
  _recomputeCameraDistances(aspect) {
    const mult = dollyMultiplierForAspect(aspect);
    this.baseCameraZ = CAMERA_BASE_Z * mult;
    this.spCameraZ = SP_CAMERA_Z * mult;
    this._lastDollyMultiplier = mult;
  }

  // DEBUG — deliberately left in (not removed after testing) so this can be
  // checked on a real device via remote debugging if the mobile-fit issue
  // this was built to investigate/fix (highway showing only partially on
  // real phones, e.g. 414x896) isn't actually resolved. Filter the console
  // by "[RhythmHero Cam]" to isolate these. Fires only on construct/resize
  // (i.e. rarely — an actual aspect-ratio change), never per-frame, so it's
  // not spammy on its own; see the separate throttled per-frame sample in
  // _loop for observing live sway/combo-zoom behavior over time.
  _logCameraSetupDebug(reason, aspect) {
    console.log('[RhythmHero Cam]', reason, {
      aspect: aspect.toFixed(4),
      idealVfov: idealVfovForAspect(aspect).toFixed(2) + '°',
      cappedVfov: this.baseFov?.toFixed(2) + '°',
      capEngaged: idealVfovForAspect(aspect) > MAX_VFOV,
      dollyMultiplier: this._lastDollyMultiplier?.toFixed(3),
      baseCameraZ: this.baseCameraZ?.toFixed(2),
      spCameraZ: this.spCameraZ?.toFixed(2),
    });
  }

  // ------------------------------------------------------------ three.js
  _initThree() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Size from the canvas's own laid-out box (its parent container's real
    // CSS dimensions), never window.innerWidth/innerHeight — the canvas does
    // NOT always fill the whole viewport (a header bar sits above it in the
    // real game UI), and window.innerHeight is additionally unstable on
    // mobile browsers as the URL bar collapses/expands, which was the root
    // cause of the highway rendering larger than the visible screen on a
    // real device (confirmed on a Samsung S22). The third `false` argument
    // to setSize stops Three.js from writing an inline CSS size onto the
    // canvas element (its default `updateStyle=true` behavior) — that inline
    // style would otherwise override the canvas's own `w-full h-full`
    // Tailwind classes and re-introduce the exact same bug. Leaving the
    // canvas's displayed size purely CSS-driven (already correctly handled
    // by its parent's flex/absolute layout) and only using this measurement
    // to pick a matching WebGL drawing-buffer resolution keeps the two
    // concerns from ever fighting each other again.
    const w0 = this.canvas.clientWidth || window.innerWidth;
    const h0 = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w0, h0, false);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06030f);
    this.scene.fog = new THREE.Fog(0x06030f, 32, 78);

    // baseFov is the "neutral" FOV a resize should always restore — the
    // combo/Star-Power camera below only ever lerps AWAY from this value,
    // never mutates it directly, so the two mechanisms can't fight.
    this.baseFov = fovForAspect(w0 / h0);
    // baseCameraZ/spCameraZ are the aspect-adjusted (dollied-back) versions
    // of CAMERA_BASE_Z/SP_CAMERA_Z — see dollyMultiplierForAspect's own
    // comment. Every "return the camera to its rest position" call site
    // (here, the per-frame combo/SP target below, and _finish()'s reset)
    // uses these instead of the raw constants, so the dolly compensation
    // actually takes effect everywhere the camera can rest, not just here.
    this._recomputeCameraDistances(w0 / h0);
    this.camera = new THREE.PerspectiveCamera(this.baseFov, w0 / h0, 0.1, 200);
    this.camera.position.set(0, 7.8, this.baseCameraZ);
    this.camera.lookAt(0, 0, -16);
    this._lastCamDebugLog = 0; // throttle for the periodic runtime sample in _loop
    this._logCameraSetupDebug('construct', w0 / h0);

    this.scene.add(new THREE.AmbientLight(0x8866ff, 0.5));
    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.dirLight.position.set(4, 12, 6);
    this.scene.add(this.dirLight);

    this.shared = getShared();
    this.glowTex = this.shared.glowTex;

    this._buildHighway();
    this._buildFrets();
    this._buildBackground();
    this._buildPools();
    this._buildStreakTrails();
    this._buildAudience();

    // bloom
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w0, h0), 0.9, 0.55, 0.12);
    this.composer.addPass(this.bloom);

    this._onResize = () => {
      // Re-measure the canvas's real box every time, exactly as at
      // construction — never window.innerWidth/innerHeight (see above). A
      // momentary 0×0 read (canvas hidden/detached mid-transition) is
      // ignored rather than applied, since dividing by zero would set
      // camera.aspect to NaN/Infinity and silently break rendering until
      // the next real resize happened to fire.
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      if (!w || !h) return;
      this.camera.aspect = w / h;
      this.baseFov = fovForAspect(this.camera.aspect);
      this.camera.fov = this.baseFov;
      // Recompute the dolly-adjusted rest distances for the new aspect —
      // without this, a device rotation (or the mobile URL-bar resize this
      // whole ResizeObserver setup exists to handle) would update the FOV
      // cap correctly but leave the camera sitting at whatever distance the
      // PREVIOUS aspect ratio needed, reintroducing the same cropped-width
      // problem this dolly compensation exists to fix.
      this._recomputeCameraDistances(this.camera.aspect);
      // Snap the Z position immediately (not lerped) on a real resize — the
      // per-frame lerp further down exists for smooth combo/SP transitions
      // *during* gameplay, not for catching up to a structural aspect-ratio
      // change, which should apply at once.
      this.camera.position.z = this.spActive ? this.spCameraZ : this.baseCameraZ;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
      this.composer.setSize(w, h);
      if (this.waveFx) {
        const d = this.renderer.getDrawingBufferSize(new THREE.Vector2());
        this.waveFx.setResolution(d.x, d.y);
      }
      this._logCameraSetupDebug('resize', this.camera.aspect);
    };
    // ResizeObserver on the canvas itself is the primary trigger — it fires
    // for ANY change to the canvas's actual laid-out box (a real window
    // resize, an orientation change, or a mobile browser's collapsible URL
    // bar reflowing the page), which is exactly what needs tracking, not
    // window resize events specifically. window resize is kept too as a
    // harmless secondary safety net (the handler re-applies the same
    // already-correct size if the box didn't actually change).
    this._resizeObserver = new ResizeObserver(this._onResize);
    this._resizeObserver.observe(this.canvas);
    window.addEventListener('resize', this._onResize);

    this._onKeyDown = (e) => this._keyDown(e);
    this._onKeyUp = (e) => this._keyUp(e);

    // idle render so the menu has a live background
    this._idleLoop();
  }

  _buildHighway() {
    this.highwayUniforms = {
      uScroll: { value: 0 },
      uBeat: { value: SPEED * 0.5 },
      uLineColor: { value: new THREE.Color(this.accentColor) },
      uPulse: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.highwayUniforms,
      vertexShader: highwayVert,
      fragmentShader: highwayFrag,
    });
    const plane = new THREE.Mesh(this.shared.highwayPlane, mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(0, 0, -HIGHWAY_LEN / 2 + 5);
    this.scene.add(plane);

    // glowing side rails
    const railMat = new THREE.MeshBasicMaterial({ color: this.accentColorRail });
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(this.shared.rail, railMat);
      rail.position.set(s * (HIGHWAY_W / 2 + 0.1), 0.15, -HIGHWAY_LEN / 2 + 5);
      this.scene.add(rail);
    }
    this.railMat = railMat;
  }

  _buildFrets() {
    this.frets = [];
    // Stored per-lane so _updateFrets can lerp a fret's emissive color back to
    // its own true color after a red miss-flash, without re-parsing the hex
    // constant every frame.
    this._laneBaseColors = this.fretColors.map((c) => new THREE.Color(c));
    for (let i = 0; i < LANES; i++) {
      const group = new THREE.Group();
      group.position.set(laneX(i), 0.12, HIT_Z);

      const ringMat = new THREE.MeshStandardMaterial({
        color: this.fretColors[i],
        emissive: this.fretColors[i],
        emissiveIntensity: 0.5,
        roughness: 0.35,
        metalness: 0.6,
      });
      const ring = new THREE.Mesh(this.shared.fretRing, ringMat);
      ring.rotation.x = -Math.PI / 2;
      group.add(ring);

      const discMat = new THREE.MeshBasicMaterial({
        color: this.fretColors[i],
        transparent: true,
        opacity: 0.0,
      });
      const disc = new THREE.Mesh(this.shared.fretDisc, discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.01;
      group.add(disc);

      this.scene.add(group);
      this.frets.push({ group, ringMat, discMat, press: 0, missFlash: 0 });
    }
  }

  // Lane trail streaks — persistent per-lane glow strips, hidden by default,
  // whose opacity is driven purely from live streak state in
  // _updateStreakTrails. One static mesh per lane rather than a pooled
  // per-hit system, since the effect is a continuous ambient glow (with a
  // brief per-hit flash on top) rather than discrete particles.
  _buildStreakTrails() {
    this.streakTrails = [];
    for (let i = 0; i < LANES; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: this.fretColors[i],
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(this.shared.streakTrailPlane, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(laneX(i), 0.05, -HIGHWAY_LEN * 0.22);
      mesh.visible = false;
      this.scene.add(mesh);
      this.streakTrails.push({ mesh, mat, flash: 0 });
    }
  }

  // Audience — a shadowy crowd flanking the highway on both sides (camera-
  // facing sprites, so they read correctly regardless of the camera's own
  // sway/dolly), plus soft "smoke" haze and pulsing colored stage-light
  // glows. All three react to the same streak-driven ambientT the lane
  // trails use (computed once in _loop and passed in) — the crowd visibly
  // brightens/gets louder as a streak builds, easing back once it resets.
  //
  // Two tiers are CORE (always fully visible, unaffected by performance —
  // the baseline crowd this engine has always shown) and two are BONUS
  // (gated on the rock/accuracy meter in _updateAudience, fading in as the
  // player does well — a bigger venue for a better performance).
  _buildAudience() {
    this.audience = [];
    // Each tier is now ONE wide crowd-photo panel, not many individually
    // positioned person-blobs the way the old procedural placeholder built
    // them — the photo already depicts a whole crowd, so stamping it dozens
    // of times per side would just look like an obviously tiled/repeated
    // image. z-depth/relative-size/reveal-threshold shape is carried over
    // from the original 4-row layout (2 always-visible "core" rows nearer
    // the camera + 2 performance-gated "bonus" rows further back) so the
    // "the venue fills in as you play well" mechanic is unchanged in
    // spirit, just built from panels instead of many small sprites.
    const tiers = [
      { z: -HIGHWAY_LEN * 0.30, width: 13, core: true },
      { z: -HIGHWAY_LEN * 0.46, width: 10, core: true },
      // Reveals as accuracy/streak (rock meter) climbs — nearer/bigger.
      { z: -HIGHWAY_LEN * 0.58, width: 11, revealAt: 50 },
      // The back of the venue filling in for a truly excellent run.
      { z: -HIGHWAY_LEN * 0.72, width: 8, revealAt: 78 },
    ];
    for (const side of [-1, 1]) {
      for (const tier of tiers) {
        const mat = new THREE.SpriteMaterial({
          // A light lavender multiply-tint (not black) — the photo's own
          // dark figures + neon rim-light already read as "shadowy crowd"
          // on their own; a heavy dark tint would just crush that detail
          // into mud. This nudges the color toward the scene's own purple
          // ambient/fog palette for cohesion without losing it.
          map: this.shared.crowdTex, color: 0xb4a6ff,
          transparent: true, opacity: 0.5, depthWrite: false,
        });
        const sprite = new THREE.Sprite(mat);
        const h = tier.width / AUDIENCE_TEX_ASPECT;
        const baseY = h * 0.42 - 0.6;
        const jitter = (Math.random() - 0.5) * 1.4;
        sprite.position.set(
          side * (HIGHWAY_W / 2 + 1.2 + tier.width / 2),
          baseY,
          tier.z + jitter
        );
        sprite.scale.set(tier.width, h, 1);
        this.scene.add(sprite);
        this.audience.push({
          sprite, mat, baseY,
          baseScaleX: tier.width, baseScaleY: h,
          baseOpacity: 0.4 + Math.random() * 0.12,
          phase: Math.random() * Math.PI * 2,
          bobJitter: 0.75 + Math.random() * 0.5,
          isCore: !!tier.core,
          revealAt: tier.revealAt ?? 0,
        });
      }
    }

    this.smoke = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const mat = new THREE.SpriteMaterial({
          map: this.shared.glowTex, color: 0x9a86ff,
          transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending,
        });
        const sprite = new THREE.Sprite(mat);
        const baseY = 2 + i * 1.5;
        sprite.position.set(side * (HIGHWAY_W / 2 + 3.5), baseY, -HIGHWAY_LEN * (0.3 + i * 0.15));
        sprite.scale.set(6, 8, 1);
        this.scene.add(sprite);
        this.smoke.push({ sprite, mat, baseY, drift: 0.15 + Math.random() * 0.15, phase: Math.random() * Math.PI * 2 });
      }
    }

    this.stageLights = [];
    for (const side of [-1, 1]) {
      const mat = new THREE.SpriteMaterial({
        map: this.shared.glowTex, color: this.accentColor,
        transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(side * (HIGHWAY_W / 2 + 1.5), 9, -HIGHWAY_LEN * 0.4);
      sprite.scale.set(3, 5, 1);
      this.scene.add(sprite);
      this.stageLights.push({ sprite, mat, phase: side > 0 ? 0 : Math.PI });
    }
  }

  // cheerBoost (0..1, spikes when a spectator taps Cheer — see cheer() below)
  // is additive on top of the streak-driven ambientT, decayed here rather
  // than in cheer() itself so it fades smoothly frame-by-frame instead of
  // as a single step. beatPulse drives the crowd's bob so they're actually
  // moving in time with the music, not a generic idle sine wave.
  // How "revealed" a given audience member currently is (0-1) — core
  // members are always fully visible; bonus members fade in/out smoothly
  // as `rock` crosses their own individual threshold. Shared by
  // _updateAudience (live, every frame) and _finish (freezing the crowd at
  // its true final size for the results screen, rather than snapping every
  // still-hidden bonus member suddenly visible).
  _audienceRevealT(a) {
    if (a.isCore) return 1;
    const rock = this.rock ?? ROCK_START;
    return Math.max(0, Math.min(1,
      (rock - (a.revealAt - AUDIENCE_REVEAL_FADE / 2)) / AUDIENCE_REVEAL_FADE));
  }

  _updateAudience(dt, t, ambientT, beatPulse) {
    this._cheerFlash = Math.max(0, (this._cheerFlash || 0) - dt * 0.6);
    const cheerBoost = this._cheerFlash;
    // Dance-burst hype — spiked on streak milestones / Star Power / lucky
    // PERFECTs (see _hitNote/activateStarPower), decayed here.
    this._danceBurst = Math.max(0, (this._danceBurst || 0) - dt * DANCE_BURST_DECAY);
    const danceBurst = this._danceBurst;
    for (const a of this.audience) {
      const revealT = this._audienceRevealT(a);

      const bobAmount = beatPulse * a.bobJitter * (0.09 + danceBurst * 0.05);
      a.sprite.position.y = a.baseY + Math.sin(t * 1.6 + a.phase) * 0.02 + bobAmount + cheerBoost * 0.15;
      // "Hype" scale pulse in place of the old arms-up texture swap — there's
      // no second pose photo to swap to for a real image, so a dance burst
      // instead reads as the crowd surging/jumping via a subtle, per-panel
      // out-of-phase scale surge (each panel's own `phase` keeps the two
      // sides/four tiers from pulsing in rigid lockstep).
      const hype = 1 + danceBurst * 0.05 * (0.6 + 0.4 * Math.sin(t * 3 + a.phase));
      a.sprite.scale.set(a.baseScaleX * hype, a.baseScaleY * hype, 1);
      a.mat.opacity = revealT * (a.baseOpacity + ambientT * 0.35 + cheerBoost * 0.3 + danceBurst * 0.15);
    }
    for (const s of this.smoke) {
      s.sprite.position.y += s.drift * dt;
      if (s.sprite.position.y > s.baseY + 3) s.sprite.position.y = s.baseY;
      s.mat.opacity = 0.05 + Math.sin(t * 0.3 + s.phase) * 0.03 + ambientT * 0.06 + cheerBoost * 0.05;
    }
    for (const l of this.stageLights) {
      l.mat.opacity = 0.3 + Math.sin(t * 0.8 + l.phase) * 0.15 + ambientT * 0.35 + cheerBoost * 0.4;
    }
  }

  // Public: a spectator (or the player themselves) tapped "Cheer" — gives
  // the crowd/smoke/stage-lights a brief additive boost on top of whatever
  // the streak is already driving, plus a synthesized crowd-noise burst.
  // Safe to call before start() finishes setting up audioCtx (no-ops via
  // the try/catch below) — genuinely possible if a cheer broadcast arrives
  // in the brief window before the receiving engine has audio wired up.
  cheer() {
    this._cheerFlash = 1;
    try {
      this._playCheerBurst();
    } catch { /* audio not ready yet — the visual boost above still applies */ }
  }

  // A short burst of bandpass-filtered noise with a handful of randomly
  // detuned tone "whoops" layered on top — reads as a crowd cheer without
  // needing a real sample (same no-external-asset convention as every other
  // sound in this engine).
  _playCheerBurst() {
    const now = this.audioCtx.currentTime;
    const sr = this.audioCtx.sampleRate;
    const dur = 0.6;
    const buf = this.audioCtx.createBuffer(1, sr * dur, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const env = Math.sin((Math.PI * i) / d.length); // rises then falls
      d[i] = (Math.random() * 2 - 1) * env * 0.4;
    }
    const noise = this.audioCtx.createBufferSource();
    noise.buffer = buf;
    const f = this.audioCtx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.7;
    const g = this.audioCtx.createGain();
    g.gain.value = 0.5;
    noise.connect(f).connect(g).connect(this.audioCtx.destination);
    noise.start(now);

    for (let i = 0; i < 3; i++) {
      const osc = this.audioCtx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 260 + Math.random() * 180;
      const og = this.audioCtx.createGain();
      const start = now + i * 0.04;
      og.gain.setValueAtTime(0.0001, start);
      og.gain.exponentialRampToValueAtTime(0.06, start + 0.05);
      og.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      osc.connect(og).connect(this.audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.42);
    }
  }

  _buildBackground() {
    // deep-space backdrop (set on the scene in _initThree); the starfield and
    // horizon glow below give it depth behind the highway.

    // starfield — same shared point positions reused across every instance;
    // the random scatter is imperceptible to re-randomize per turn anyway, so
    // sharing it costs nothing visually while skipping the 1400-point
    // Math.random() loop on every single Game() construction.
    const starMat = new THREE.PointsMaterial({
      color: 0xbbaaff, size: 0.35, map: this.glowTex,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(this.shared.starGeo, starMat);
    this.scene.add(this.stars);

    // horizon glow disc
    const sun = new THREE.Mesh(
      this.shared.sunDisc,
      new THREE.MeshBasicMaterial({ color: 0x5a2bd4, transparent: true, opacity: 0.35 })
    );
    sun.position.set(0, 6, -85);
    this.scene.add(sun);

    // (rotating spotlight cones removed)
    this.spots = [];

    // Supernova twinkle pool — ambient background sparkle scattered across
    // the same starfield-shaped distribution as the stars themselves. Ticks
    // continuously (idle menu screen included, see _idleLoop) independent
    // of gameplay performance; _hitNote also gets a small bonus chance to
    // fire one early on a PERFECT. Pool-and-reuse, same pattern as
    // gemPool/particles/rings above — each entry starts dormant (life=0,
    // invisible) with a staggered first-fire cooldown so they don't all
    // flash together at song start.
    this.supernovas = [];
    for (let i = 0; i < SUPERNOVA_COUNT; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.glowTex, color: 0xffffff,
        transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      this.scene.add(sprite);
      this.supernovas.push({ sprite, mat, life: 0, maxLife: 1, nextTrigger: Math.random() * 6 });
    }
  }

  _buildPools() {
    // --- note gems
    this.gemPool = [];
    this.activeNotes = [];
    for (let i = 0; i < 72; i++) {
      const group = new THREE.Group();
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x222230, roughness: 0.3, metalness: 0.9 });
      const capMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.2,
      });
      const base = new THREE.Mesh(this.shared.gemBase, baseMat);
      const cap = new THREE.Mesh(this.shared.gemCap, capMat);
      cap.position.y = 0.12;
      group.add(base, cap);
      group.visible = false;
      this.scene.add(group);
      this.gemPool.push({ group, capMat, baseMat, inUse: false });
    }

    // --- sustain tails
    this.tailPool = [];
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 });
      const mesh = new THREE.Mesh(this.shared.tailBox, mat); // scaled in z per-note
      mesh.visible = false;
      this.scene.add(mesh);
      this.tailPool.push({ mesh, mat, inUse: false });
    }

    // --- hit particles (sprites grouped by lane color)
    this.particles = [];
    for (let lane = 0; lane < LANES; lane++) {
      const mat = new THREE.SpriteMaterial({
        map: this.glowTex, color: this.fretColors[lane],
        transparent: true, opacity: 0.95,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      for (let i = 0; i < 40; i++) {
        const sprite = new THREE.Sprite(mat);
        sprite.visible = false;
        this.scene.add(sprite);
        this.particles.push({ sprite, lane, vel: new THREE.Vector3(), life: 0, maxLife: 1 });
      }
    }

    // --- shockwave rings
    this.rings = [];
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(this.shared.ringTorus, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.scene.add(mesh);
      this.rings.push({ mesh, mat, life: 0 });
    }
  }

  // -------------------------------------------------------------- idle bg
  _idleLoop() {
    if (this.running) return;
    this._raf = requestAnimationFrame(() => this._idleLoop());
    const now = performance.now();
    const t = now / 1000;
    // Own lightweight dt tracking — the idle loop never needed this before
    // supernovas (background rotation only reads absolute t), so this
    // resets cleanly if start()/stop() has been running gameplay's own
    // dt-tracked _loop in between idle stretches.
    const dt = this._lastIdleFrame != null ? Math.min(0.05, (now - this._lastIdleFrame) / 1000) : 0.016;
    this._lastIdleFrame = now;
    this._animateBackground(t);
    this._updateSupernovas(dt);
    this.highwayUniforms.uScroll.value = t * SPEED * 0.25;
    this.composer.render();
  }

  _animateBackground(t) {
    this.stars.rotation.y = t * 0.008;
  }

  // Ambient starfield twinkle pool — see the SUPERNOVA_* constants and
  // _buildBackground. Ticks every frame in both gameplay (_loop) and the
  // idle menu background (_idleLoop), so the effect is always alive, not
  // just during a song.
  _updateSupernovas(dt) {
    for (const sn of this.supernovas) {
      if (sn.life > 0) {
        sn.life -= dt;
        if (sn.life <= 0) {
          sn.life = 0;
          sn.sprite.visible = false;
          sn.nextTrigger = SUPERNOVA_MIN_COOLDOWN + Math.random() * (SUPERNOVA_MAX_COOLDOWN - SUPERNOVA_MIN_COOLDOWN);
        } else {
          const k = sn.life / sn.maxLife; // 1 -> 0 over the flash's lifetime
          // Quick bright rise (first 30% of life) then a longer fade —
          // reads as a "flash" rather than a smooth pulse.
          const flash = k > 0.7 ? (1 - k) / 0.3 : k / 0.7;
          sn.mat.opacity = flash * 0.9;
          sn.sprite.scale.setScalar(0.6 + (1 - k) * 1.8);
        }
      } else {
        sn.nextTrigger -= dt;
        if (sn.nextTrigger <= 0) this._triggerSupernova(sn);
      }
    }
  }

  // Fires a single, specific (currently-dormant) supernova — random
  // position within the same distribution the starfield itself uses, a
  // random soft pastel tint, and a random flash duration.
  _triggerSupernova(sn) {
    const r = 60 + Math.random() * 90;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.9;
    sn.sprite.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      Math.abs(r * Math.cos(phi)) - 8,
      r * Math.sin(phi) * Math.sin(theta) - 30
    );
    sn.mat.color.setHSL(Math.random(), 0.55, 0.85);
    sn.life = sn.maxLife = 0.9 + Math.random() * 0.6;
    sn.sprite.visible = true;
  }

  // Public-ish helper used by _hitNote's PERFECT-hit bonus — finds the
  // first currently-dormant slot in the pool and fires it early, on top of
  // (not instead of) each one's own ambient random cycle. A no-op if every
  // slot happens to already be mid-flash.
  _triggerRandomSupernova() {
    const dormant = this.supernovas.find((sn) => sn.life <= 0);
    if (dormant) this._triggerSupernova(dormant);
  }

  // ------------------------------------------------- reactive neon wave fx
  _startWaveFx() {
    if (!this.waveFx) return;
    this.waveFx.randomizeColors();
    this.waveFx.setOpacity(fxCurve(this.fxIntensity ?? 1));
    this.waveFx.mesh.visible = true;
  }

  _stopWaveFx() {
    if (this.waveFx) this.waveFx.mesh.visible = false;
  }

  // value is the raw slider position (0..1). It's remapped through fxCurve so
  // even 0 leaves the wave faintly visible (never fully off) and the lower
  // half stays subtle before ramping to full strength near 1.
  setFxIntensity(value) {
    const v = Math.max(0, Math.min(1, value || 0));
    this.fxIntensity = v;
    if (!this.waveFx) return;
    this.waveFx.setOpacity(fxCurve(v));
    // keep the layer drawn while gameplay runs (floor > 0 means never off);
    // it stays hidden outside gameplay so it doesn't show behind the menu.
    if (this.running) this.waveFx.mesh.visible = true;
  }

  _updateWaveFx(dt) {
    if (!this.waveFx || !this.waveFx.mesh.visible) return;
    this.waveFx.tick(dt);
    if (!this.analyser) return;
    this.analyser.getByteTimeDomainData(this.waveTime);
    this.analyser.getByteFrequencyData(this.waveFreq);

    // overall level from the time-domain signal (RMS-ish)
    let sum = 0;
    for (let i = 0; i < this.waveTime.length; i++) {
      const v = (this.waveTime[i] - 128) / 128;
      sum += v * v;
    }
    const level = Math.min(1, Math.sqrt(sum / this.waveTime.length) * 2.4);

    // frequency bands -> bass / treble
    const bins = this.waveFreq;
    const bassEnd = Math.max(2, (bins.length * 0.08) | 0);
    const trebStart = (bins.length * 0.55) | 0;
    let bass = 0;
    for (let i = 1; i < bassEnd; i++) bass += bins[i];
    bass = Math.min(1, bass / (bassEnd - 1) / 255 * 1.6);
    let treb = 0;
    for (let i = trebStart; i < bins.length; i++) treb += bins[i];
    treb = Math.min(1, treb / (bins.length - trebStart) / 255 * 2.2);

    // star power makes the whole field bluer/brighter. The intensity slider
    // only dims brightness (via setOpacity) — it deliberately does NOT scale
    // the audio response here, so the wave keeps moving in time with the music
    // at every slider position.
    const boost = this.spActive ? 1.35 : 1;
    this.waveFx.updateWaveform(this.waveTime);
    this.waveFx.setAudio(level * boost, bass, treb);
  }

  // ================================================================ start
  start(audioCtx, audioBuffer, chart, meta) {
    cancelAnimationFrame(this._raf);
    this.audioCtx = audioCtx;
    this.buffer = audioBuffer;
    this.chart = chart;
    this.meta = meta;
    this.duration = audioBuffer.duration;

    // audio graph: source -> lowpass (miss muffle) -> gain -> out
    this.lowpass = audioCtx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 20000;
    this.gain = audioCtx.createGain();
    this.gain.gain.value = 1;
    this.lowpass.connect(this.gain).connect(audioCtx.destination);

    this.source = audioCtx.createBufferSource();
    this.source.buffer = audioBuffer;
    this.source.connect(this.lowpass);
    this.startCtxTime = audioCtx.currentTime + LEAD_IN;
    this.source.start(this.startCtxTime);

    // analyser tap for the reactive neon-wave background
    if (!this.analyser) {
      this.analyser = audioCtx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.75;
      this.waveTime = new Uint8Array(this.analyser.fftSize);
      this.waveFreq = new Uint8Array(this.analyser.frequencyBinCount);
    }
    this.gain.connect(this.analyser);
    this._startWaveFx();

    // state
    this.score = 0;
    this.streak = 0;
    this.maxStreak = 0;
    this.hits = 0;
    this.misses = 0;
    this.rock = ROCK_START;
    this.sp = 0;
    this.spActive = false;
    this._cheerFlash = 0;
    // Per-frame decorative state for the DOM guitar/bass player overlay (see
    // getPlayerVisualState below) — beat pulse and streak-ambient are
    // snapshotted here each frame from the same math the highway/audience
    // already use; hitFlash/hitColor are a one-shot-per-hit decay, set in
    // _hitNote and decayed in _loop, mirroring frets' own missFlash pattern.
    this._lastBeatPulse = 0;
    this._lastStreakT = 0;
    this._playerHitFlash = 0;
    this._playerHitColor = this.fretColors[0];
    // A fresh song shouldn't inherit a stale dance-burst from whatever the
    // previous song ended on (this Game instance is reused across multiple
    // songs — see WarmPerformanceMirror/playAgainSolo) — resetting this to
    // 0 also forces _updateAudience's very first tick to flip any member
    // still stuck on the arms-up pose back to idle.
    this._danceBurst = 0;
    this.failed = false;
    this.ended = false;
    this.nextSpawn = 0;
    this.heldLanes = new Array(LANES).fill(false);
    this.activeSustains = [];
    this.lastCountdown = null;
    this.beatDur = 60 / (chart.bpm || 120);
    this.highwayUniforms.uBeat.value = SPEED * this.beatDur;

    for (const n of chart.notes) {
      n.hit = false; n.missed = false; n.spawned = false; n.gem = null; n.tail = null;
    }
    // reset pools
    for (const g of this.gemPool) { g.inUse = false; g.group.visible = false; }
    for (const t of this.tailPool) { t.inUse = false; t.mesh.visible = false; }

    this._missNoise = this._makeMissNoise();

    if (!this.readOnly) {
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
    }

    this.running = true;
    this.hud.onScore(0, 1, 0);
    this.hud.onRock(this.rock);
    this.hud.onSP(0, false);
    this._lastFrame = performance.now();
    this._loop();
  }

  _makeMissNoise() {
    const sr = this.audioCtx.sampleRate;
    const buf = this.audioCtx.createBuffer(1, sr * 0.09, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.015)) * 0.5;
    }
    return buf;
  }

  _playClank() {
    const s = this.audioCtx.createBufferSource();
    s.buffer = this._missNoise;
    const f = this.audioCtx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 300; f.Q.value = 1.5;
    const g = this.audioCtx.createGain();
    g.gain.value = 0.9;
    s.connect(f).connect(g).connect(this.audioCtx.destination);
    s.start();
  }

  // Synthesized hit confirmation — the engine had a miss "clank" and a
  // muffle dip on the song itself, but a successful hit had zero dedicated
  // audio, only visual feedback (burst/shockwave/streak glow). A short
  // triangle-wave blip with a fast exponential decay, pitched higher for a
  // PERFECT than a GOOD, gives that missing "confirm" sound. Deliberately
  // plain oscillator synthesis (no sample/buffer), matching the same
  // no-external-asset convention _makeMissNoise already established.
  _playHitTone(perfect) {
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = perfect ? 880 : 660;
    const g = this.audioCtx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.22, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(g).connect(this.audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  _muffle() {
    const now = this.audioCtx.currentTime;
    this.lowpass.frequency.cancelScheduledValues(now);
    this.lowpass.frequency.setValueAtTime(700, now);
    this.lowpass.frequency.exponentialRampToValueAtTime(20000, now + 0.35);
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(0.45, now);
    this.gain.gain.linearRampToValueAtTime(1, now + 0.3);
  }

  get songTime() {
    return this.audioCtx.currentTime - this.startCtxTime;
  }

  get multiplier() {
    const base = Math.min(4, 1 + Math.floor(this.streak / 10));
    return this.spActive ? base * 2 : base;
  }

  // ================================================================ input
  _keyDown(e) {
    if (e.repeat) return;
    if (e.code === 'Escape') { this._finish(true); return; }
    if (e.code === 'Space') {
      e.preventDefault();
      this.activateStarPower();
      return;
    }
    const lane = KEYS[e.code];
    if (lane === undefined) return;
    this.pressLane(lane);
  }

  _keyUp(e) {
    const lane = KEYS[e.code];
    if (lane === undefined) return;
    this.releaseLane(lane);
  }

  // public input API — drives the same logic as the keyboard, so on-screen
  // touch controls can call these directly.
  pressLane(lane) {
    if (!this.running || lane < 0 || lane >= LANES) return;
    this.heldLanes[lane] = true;
    this.frets[lane].press = 1;
    this._tryHit(lane);
    // Optional, backward-compatible: lets a UI layer react to the raw physical
    // input (e.g. an animated instrument close-up) independent of hit/miss
    // judgment. Safe no-op if the hud object doesn't supply it.
    this.hud?.onLanePress?.(lane);
  }

  releaseLane(lane) {
    if (lane < 0 || lane >= LANES) return;
    this.heldLanes[lane] = false;
    // release any sustain in this lane
    this.activeSustains = this.activeSustains.filter((s) => {
      if (s.lane === lane) { this._endSustain(s); return false; }
      return true;
    });
    this.hud?.onLaneRelease?.(lane);
  }

  activateStarPower() {
    if (!this.running) return;
    if (!this.spActive && this.sp >= 50) {
      this.spActive = true;
      this.hud.onBanner('STAR POWER!');
      this.hud.onSP(this.sp, true);
      this.hud.onScore(this.score, this.multiplier, this.streak);
      // Star Power is the biggest hype moment in the song — the whole crowd
      // should react.
      this._danceBurst = 1;
    }
  }

  // Projects real 3D world points through the LIVE camera to get their
  // current on-screen position, as a {xPercent, yPercent} pair (0-100,
  // relative to the canvas). This is how the top instrument sprite overlay
  // (InstrumentTopOverlay in InstrumentCloseup.jsx) finds the highway's
  // actual far edge — a flat CSS percentage can only ever approximate where
  // that point lands on screen, since the camera's
  // FOV and position both respond to aspect ratio (fovForAspect) AND move
  // slightly during play (combo sway, Star Power dolly) — reading the real
  // projection is exact regardless of screen size or camera state, and the
  // caller re-reads it every frame specifically to track that camera motion
  // live, not just on resize.
  getHighwayAnchors() {
    const project = (x, y, z) => {
      const v = new THREE.Vector3(x, y, z).project(this.camera);
      return { xPercent: ((v.x + 1) / 2) * 100, yPercent: ((1 - v.y) / 2) * 100 };
    };
    const anchors = {
      // Far edge of the highway plane (see _buildHighway: plane spans
      // HIGHWAY_LEN centered at z = -HIGHWAY_LEN/2 + 5, so its far edge is
      // at z = -HIGHWAY_LEN + 5), at ground level (y=0, the road surface) —
      // where a standing performer's feet should land.
      farEdge: project(0, 0, -HIGHWAY_LEN + 5),
      // The fret/hit-line row, at ground level.
      hitLine: project(0, 0, HIT_Z),
    };
    // DEBUG — throttled (called every frame by the caller, so this can't log
    // unconditionally). Directly reports where the performer sprite's own
    // anchor point (farEdge.xPercent) is landing — if it's meaningfully off
    // 50% (centered), that's the same camera asymmetry as the highway-width
    // clipping issue, since both are projected through this identical
    // camera. Deliberately left in — filter by "[RhythmHero Cam]".
    const t = performance.now();
    if (!this._lastAnchorDebugLog || t - this._lastAnchorDebugLog > 1500) {
      this._lastAnchorDebugLog = t;
      console.log('[RhythmHero Cam] anchors', {
        farEdgeXPercent: anchors.farEdge.xPercent.toFixed(2),
        farEdgeYPercent: anchors.farEdge.yPercent.toFixed(2),
        offCenterBy: (anchors.farEdge.xPercent - 50).toFixed(2),
      });
    }
    return anchors;
  }

  // Per-frame decorative state for the DOM instrument player overlay's own
  // stage-light effects (spotlight glow, streak rim light, Star Power
  // flash/color-shift, hit flash — see InstrumentCloseup.jsx's
  // InstrumentTopOverlay). Every value here is derived from math the loop
  // already computes for the highway/fret/audience visuals — this just
  // exposes it rather than duplicating it, same reasoning as
  // getHighwayAnchors above.
  getPlayerVisualState() {
    return {
      beatPulse: this._lastBeatPulse || 0,
      streakT: this._lastStreakT || 0,
      spActive: !!this.spActive,
      hitFlash: this._playerHitFlash || 0,
      hitColor: this._playerHitColor ?? this.fretColors[0],
    };
  }

  _tryHit(lane) {
    const t = this.songTime;
    if (t < -0.5 || this.ended) return;
    let best = null, bestDt = Infinity;
    for (const n of this.chart.notes) {
      if (n.lane !== lane || n.hit || n.missed) continue;
      const dt = n.t - t;
      if (dt > HIT_WINDOW + 0.05) break; // notes sorted by time
      if (Math.abs(dt) <= HIT_WINDOW && Math.abs(dt) < bestDt) {
        best = n; bestDt = Math.abs(dt);
      }
    }
    if (!best) {
      // overstrum: break streak
      if (this.streak > 4) this.hud.onJudge('MISS', 'miss');
      this.streak = 0;
      this._playClank();
      this.hud.onScore(this.score, this.multiplier, this.streak);
      this.frets[lane].missFlash = 1;
      return;
    }
    this._hitNote(best, bestDt);
  }

  _hitNote(note, absDt) {
    note.hit = true;
    this.hits++;
    this.streak++;
    this.maxStreak = Math.max(this.maxStreak, this.streak);
    const perfect = absDt <= PERFECT_WINDOW;
    const base = perfect ? 75 : 50;
    this.score += base * this.multiplier;
    this.rock = Math.min(100, this.rock + ROCK_HIT);
    if (!this.spActive) this.sp = Math.min(100, this.sp + 1.6);

    this.hud.onJudge(perfect ? 'PERFECT' : 'GOOD', perfect ? 'perfect' : 'good');
    this.hud.onScore(this.score, this.multiplier, this.streak);
    this.hud.onRock(this.rock);
    this.hud.onSP(this.sp, this.spActive);
    if (this.streak > 0 && this.streak % 50 === 0) {
      this.hud.onBanner(`${this.streak} NOTE STREAK!`);
      // A streak milestone is a hype moment — send a wave of arms up
      // through the crowd (see _updateAudience's dancing state).
      this._danceBurst = 1;
    }

    this._burst(note.lane, perfect ? 16 : 10);
    this._shockwave(note.lane);
    this._playHitTone(perfect);
    if (this.streak >= STREAK_TRAIL_MIN) this.streakTrails[note.lane].flash = 1;
    // Player-overlay hit flash (see getPlayerVisualState) — decayed per-frame
    // in _loop, same one-shot-per-hit pattern as the streak trail flash above.
    this._playerHitFlash = 1;
    this._playerHitColor = this.fretColors[note.lane];

    if (perfect) {
      // Occasional smaller crowd pop on a PERFECT — not every single one
      // (that would look chaotic), just often enough to feel alive.
      if (Math.random() < 0.15) this._danceBurst = Math.max(this._danceBurst || 0, 0.6);
      // Small bonus chance to fire a supernova early on top of its own
      // ambient random cycle — ties the background sparkle to great play
      // without making it the ONLY trigger (a rough run should still see
      // the occasional ambient twinkle).
      if (Math.random() < SUPERNOVA_PERFECT_CHANCE) this._triggerRandomSupernova();
    }

    if (note.gem) this._recycleGem(note);
    if (note.len > 0) {
      this.activeSustains.push({ note, lane: note.lane, lastTick: this.songTime });
    } else if (note.tail) {
      this._recycleTail(note);
    }
  }

  _endSustain(s) {
    if (s.note.tail) this._recycleTail(s.note);
  }

  // ================================================================ loop
  _loop() {
    if (!this.running) return;
    this._raf = requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastFrame) / 1000);
    this._lastFrame = now;
    const t = this.songTime;

    // countdown
    if (t < 0) {
      const n = Math.ceil(-t);
      const label = n <= 3 ? String(n) : '';
      if (label !== this.lastCountdown) {
        this.lastCountdown = label;
        this.hud.onCountdown(label);
      }
    } else if (this.lastCountdown !== 'ROCK!') {
      this.lastCountdown = 'ROCK!';
      this.hud.onCountdown('ROCK!');
      setTimeout(() => this.hud.onCountdown(''), 700);
    }

    // 2. Beat-synced highway pulse — this uniform already drove the highway
    // floor's own beat-line brightness; computed early here (before frets/
    // lighting below) so both can now breathe with it too, not just the
    // floor texture.
    this.highwayUniforms.uScroll.value = t * SPEED;
    const beatPhase = (t / this.beatDur) % 1;
    const beatPulse = Math.max(0, 1 - beatPhase * 4);
    this.highwayUniforms.uPulse.value = beatPulse;
    if (this.dirLight) this.dirLight.intensity = 1.2 + beatPulse * 0.5;

    // 3. Shared by both the lane trails and the audience/crowd below, so
    // they stay in lockstep off the same streak curve.
    const streakAmbientT = Math.max(0, Math.min(1,
      (this.streak - STREAK_TRAIL_MIN) / (STREAK_TRAIL_MAX_STREAK - STREAK_TRAIL_MIN)));

    // 6. Snapshot for the DOM player overlay (getPlayerVisualState) — same
    // beatPulse/streakAmbientT values the 3D scene itself is already using
    // this frame, plus the per-hit flash's own decay.
    this._lastBeatPulse = beatPulse;
    this._lastStreakT = streakAmbientT;
    this._playerHitFlash = Math.max(0, (this._playerHitFlash || 0) - dt * PLAYER_HIT_FLASH_DECAY);

    this._spawnNotes(t);
    this._updateNotes(t);
    this._updateSustains(t, dt);
    this._updateFrets(dt, beatPulse);
    this._updateStreakTrails(dt, streakAmbientT);
    this._updateAudience(dt, t, streakAmbientT, beatPulse);
    this._updateParticles(dt);
    this._updateRings(dt);
    this._animateBackground(now / 1000);
    this._updateSupernovas(dt);
    this._updateWaveFx(dt);

    // star power drain + visuals
    if (this.spActive) {
      this.sp -= dt * 12.5;
      if (this.sp <= 0) {
        this.sp = 0;
        this.spActive = false;
        this.hud.onScore(this.score, this.multiplier, this.streak);
      }
      this.hud.onSP(this.sp, this.spActive);
    }
    const targetColor = this.spActive ? 0x3ef0ff : this.accentColor;
    this.highwayUniforms.uLineColor.value.lerp(new THREE.Color(targetColor), dt * 5);
    this.railMat.color.lerp(new THREE.Color(this.spActive ? 0x3ef0ff : this.accentColorRail), dt * 5);
    this.bloom.strength += ((this.spActive ? 1.5 : 0.9) - this.bloom.strength) * dt * 5;

    // 1 + 5. Combo-reactive camera, with an extra Star Power kick layered on
    // top additively (both only ever pull AWAY from baseFov/baseCameraZ, so
    // they never fight a resize, which resets those base values directly).
    const comboT = Math.min(1, this.streak / COMBO_FOV_STREAK_CAP);
    const spFovKick = this.spActive ? SP_FOV_KICK : 0;
    const targetFov = this.baseFov - comboT * COMBO_FOV_MAX_DELTA - spFovKick;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 3);
    this.camera.updateProjectionMatrix();

    const swayAmp = this.spActive ? CAMERA_SWAY_SP : CAMERA_SWAY_BASE;
    this.camera.position.x = Math.sin(now / 4200) * swayAmp;
    // baseCameraZ/spCameraZ (not the raw CAMERA_BASE_Z/SP_CAMERA_Z constants)
    // — the aspect-dollied rest distances computed in _recomputeCameraDistances.
    const targetZ = this.spActive ? this.spCameraZ : this.baseCameraZ;
    this.camera.position.z += (targetZ - this.camera.position.z) * Math.min(1, dt * 3);
    this.camera.lookAt(0, 0, -16);

    // DEBUG — throttled runtime sample (not per-frame — would spam the
    // console), deliberately left in for the same reason as
    // _logCameraSetupDebug: lets the live sway/combo-zoom behavior actually
    // be observed on a real device if the mobile-fit fix needs further
    // diagnosis. Filter by "[RhythmHero Cam]".
    if (now - this._lastCamDebugLog > 1500) {
      this._lastCamDebugLog = now;
      console.log('[RhythmHero Cam] live', {
        fov: this.camera.fov.toFixed(2) + '°',
        posX: this.camera.position.x.toFixed(3),
        posZ: this.camera.position.z.toFixed(3),
        swayAmp,
        streak: this.streak,
        spActive: this.spActive,
      });
    }

    this.composer.render();

    if (!this.ended && t > this.duration + 1.2) this._finish(false);
  }

  _spawnNotes(t) {
    const horizon = (HIGHWAY_LEN - 8) / SPEED; // seconds of look-ahead
    const notes = this.chart.notes;
    while (this.nextSpawn < notes.length && notes[this.nextSpawn].t - t < horizon) {
      const n = notes[this.nextSpawn++];
      const gem = this.gemPool.find((g) => !g.inUse);
      if (gem) {
        gem.inUse = true;
        n.gem = gem;
        const color = new THREE.Color(this.fretColors[n.lane]);
        gem.capMat.color.copy(color);
        gem.capMat.emissive.copy(color);
        gem.capMat.emissiveIntensity = 1.6;
        gem.group.visible = true;
        gem.group.position.set(laneX(n.lane), 0.2, -999);
        this.activeNotes.push(n);
      }
      if (n.len > 0) {
        const tail = this.tailPool.find((x) => !x.inUse);
        if (tail) {
          tail.inUse = true;
          n.tail = tail;
          tail.mat.color.set(this.fretColors[n.lane]);
          tail.mesh.visible = true;
        }
      }
    }
  }

  _updateNotes(t) {
    for (let i = this.activeNotes.length - 1; i >= 0; i--) {
      const n = this.activeNotes[i];
      const z = HIT_Z - (n.t - t) * SPEED;

      if (n.gem) {
        n.gem.group.position.z = z;
        n.gem.group.rotation.y += 0.02;
        if (!n.hit && !n.missed && t - n.t > HIT_WINDOW + 0.02) {
          // missed
          n.missed = true;
          this.misses++;
          this.streak = 0;
          this.rock = Math.max(0, this.rock - ROCK_MISS);
          this.hud.onJudge('MISS', 'miss');
          this.hud.onScore(this.score, this.multiplier, this.streak);
          this.hud.onRock(this.rock);
          this._muffle();
          this.frets[n.lane].missFlash = 1;
          n.gem.capMat.color.set(0x555560);
          n.gem.capMat.emissive.set(0x222228);
          n.gem.capMat.emissiveIntensity = 0.3;
          if (n.tail) this._recycleTail(n);
          if (this.rock <= 0 && !this.failed && t > ROCK_FAIL_GRACE) {
            this.failed = true;
            this._finish(false);
            return;
          }
        }
        if (z > 7) {
          this._recycleGem(n);
          this.activeNotes.splice(i, 1);
          continue;
        }
      }

      if (n.tail && !n.hit) {
        // tail from note head to head + len
        const z0 = z;
        const z1 = HIT_Z - (n.t + n.len - t) * SPEED;
        const mid = (z0 + z1) / 2;
        n.tail.mesh.position.set(laneX(n.lane), 0.1, mid);
        n.tail.mesh.scale.set(1, 1, Math.abs(z0 - z1));
      }
    }
  }

  _updateSustains(t, dt) {
    for (let i = this.activeSustains.length - 1; i >= 0; i--) {
      const s = this.activeSustains[i];
      const n = s.note;
      const end = n.t + n.len;
      if (t >= end) {
        this._endSustain(s);
        this.activeSustains.splice(i, 1);
        continue;
      }
      // score trickle while held
      this.score += Math.round(30 * this.multiplier * dt);
      this.hud.onScore(this.score, this.multiplier, this.streak);
      // tail shrinks from strike line outward
      if (n.tail) {
        const z1 = HIT_Z - (end - t) * SPEED;
        const mid = (HIT_Z + z1) / 2;
        n.tail.mesh.position.set(laneX(n.lane), 0.1, mid);
        n.tail.mesh.scale.set(1, 1, Math.max(0.01, Math.abs(HIT_Z - z1)));
      }
      // sparkle at the fret while holding
      if (Math.random() < dt * 22) this._burst(n.lane, 1, 0.5);
    }
  }

  _recycleGem(n) {
    if (!n.gem) return;
    n.gem.inUse = false;
    n.gem.group.visible = false;
    n.gem = null;
  }

  _recycleTail(n) {
    if (!n.tail) return;
    n.tail.inUse = false;
    n.tail.mesh.visible = false;
    n.tail = null;
  }

  // beatPulse (0..1, spikes at each detected beat — see _loop) gives every
  // fret ring a faint ambient brighten in time with the music, on top of its
  // own press-glow; missFlash (also decayed here) blends the ring's emissive
  // color toward red for a one-shot "that didn't land" cue, reverting to the
  // lane's true color as it decays.
  _updateFrets(dt, beatPulse = 0) {
    for (let i = 0; i < LANES; i++) {
      const f = this.frets[i];
      const target = this.heldLanes[i] ? 1 : 0;
      f.press += (target - f.press) * Math.min(1, dt * 18);
      f.missFlash = Math.max(0, f.missFlash - dt * MISS_FLASH_DECAY);
      f.ringMat.emissiveIntensity = 0.5 + f.press * 2.2 + f.missFlash * 1.8 + beatPulse * 0.18;
      f.ringMat.emissive.copy(this._laneBaseColors[i]).lerp(new THREE.Color(0xff2020), f.missFlash);
      f.discMat.opacity = f.press * 0.55;
      f.group.scale.setScalar(1 + f.press * 0.12);
    }
  }

  // 3. Lane trail streaks — ambient glow ramps in as the streak crosses
  // STREAK_TRAIL_MIN, reaching full ambient intensity at
  // STREAK_TRAIL_MAX_STREAK; each hit while above the threshold also adds a
  // brief flash on top (set in _hitNote), decaying independently here.
  // ambientT is computed once in _loop and shared with _updateAudience so
  // the crowd and the lane trails stay in lockstep off the same curve.
  _updateStreakTrails(dt, ambientT) {
    for (const st of this.streakTrails) {
      st.flash = Math.max(0, st.flash - dt * 2.5);
      const opacity = ambientT * 0.22 + st.flash * 0.35;
      st.mat.opacity = opacity;
      st.mesh.visible = opacity > 0.01;
    }
  }

  _burst(lane, count, scale = 1) {
    let spawned = 0;
    for (const p of this.particles) {
      if (spawned >= count) break;
      if (p.lane !== lane || p.life > 0) continue;
      spawned++;
      p.life = p.maxLife = 0.45 + Math.random() * 0.3;
      p.sprite.visible = true;
      p.sprite.position.set(laneX(lane), 0.3, HIT_Z);
      const a = Math.random() * Math.PI * 2;
      const v = (2 + Math.random() * 5) * scale;
      p.vel.set(Math.cos(a) * v, 3 + Math.random() * 5 * scale, Math.sin(a) * v * 0.5);
      p.sprite.scale.setScalar((0.5 + Math.random() * 0.5) * scale);
    }
  }

  _updateParticles(dt) {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sprite.visible = false; continue; }
      p.vel.y -= 16 * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      const k = p.life / p.maxLife;
      p.sprite.scale.setScalar(Math.max(0.01, k * 0.9));
    }
  }

  _shockwave(lane) {
    const r = this.rings.find((x) => x.life <= 0);
    if (!r) return;
    r.life = 0.35;
    r.mesh.visible = true;
    r.mesh.position.set(laneX(lane), 0.15, HIT_Z);
    r.mesh.scale.setScalar(0.4);
    r.mat.color.set(this.fretColors[lane]);
    r.mat.opacity = 0.9;
  }

  _updateRings(dt) {
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.mesh.visible = false; r.mat.opacity = 0; continue; }
      const k = 1 - r.life / 0.35;
      r.mesh.scale.setScalar(0.4 + k * 2.4);
      r.mat.opacity = 0.9 * (1 - k);
    }
  }

  // ================================================================ finish
  // public: quit the current song back to the menu (same as pressing Esc)
  quit() {
    if (this.running) this._finish(true);
  }

  _finish(aborted) {
    if (this.ended) return;
    this.ended = true;
    this.running = false;
    cancelAnimationFrame(this._raf);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    try { this.source.stop(); } catch { /* already stopped */ }
    try { this.gain.disconnect(this.analyser); } catch { /* not connected */ }
    this._stopWaveFx();

    // clear the board
    for (const g of this.gemPool) { g.inUse = false; g.group.visible = false; }
    for (const t of this.tailPool) { t.inUse = false; t.mesh.visible = false; }
    for (const p of this.particles) { p.life = 0; p.sprite.visible = false; }
    this.activeNotes = [];
    this.activeSustains = [];

    // Reset every combo/Star-Power-driven visual back to neutral before
    // handing off to _idleLoop() — that loop never touches the camera, frets,
    // or streak trails, so without this, whatever state gameplay ended on
    // (e.g. a tight FOV mid-streak, a red miss-flash, a lit trail) would
    // otherwise linger visually behind the results screen.
    this.camera.fov = this.baseFov;
    this.camera.position.set(0, 7.8, this.baseCameraZ);
    this.camera.updateProjectionMatrix();
    for (let i = 0; i < this.frets.length; i++) {
      const f = this.frets[i];
      f.press = 0;
      f.missFlash = 0;
      f.ringMat.emissiveIntensity = 0.5;
      f.ringMat.emissive.copy(this._laneBaseColors[i]);
    }
    for (const st of this.streakTrails) { st.flash = 0; st.mat.opacity = 0; st.mesh.visible = false; }
    // Freeze the crowd at its true final size — _audienceRevealT (using the
    // rock value the song actually ended on) rather than a blind reset to
    // baseOpacity, which would snap every still-hidden bonus panel suddenly
    // visible on the results screen even though it never actually appeared
    // during play. Scale also resets in case the song ended mid-hype-pulse,
    // since _updateAudience (the only place that normally corrects this)
    // stops running once ended=true.
    for (const a of this.audience) {
      a.mat.opacity = this._audienceRevealT(a) * a.baseOpacity;
      a.sprite.scale.set(a.baseScaleX, a.baseScaleY, 1);
    }
    this._danceBurst = 0;
    for (const s of this.smoke) { s.mat.opacity = 0.05; }
    for (const l of this.stageLights) { l.mat.opacity = 0.3; }
    // Same reset for the DOM player-overlay state (getPlayerVisualState) —
    // otherwise a song ending mid-streak/mid-SP would leave that overlay's
    // glow/rim-light lingering at gameplay intensity on the results screen.
    this._lastBeatPulse = 0;
    this._lastStreakT = 0;
    this._playerHitFlash = 0;

    const total = this.chart.notes.length;
    const acc = total > 0 ? this.hits / total : 0;
    this._idleLoop();
    this.hud.onEnd({
      aborted,
      failed: this.failed,
      score: this.score,
      maxStreak: this.maxStreak,
      hits: this.hits,
      total,
      accuracy: acc,
    });
  }

  // Full teardown — releases GPU resources and listeners. Call on unmount /
  // when leaving the game entirely (not just between turns/songs, which only
  // needs _finish() via quit()). Not present in the original vendored source
  // — added since this engine now lives inside a React component that can
  // unmount at any time (e.g. the host navigating away mid-song).
  dispose() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    try { this._resizeObserver?.disconnect(); } catch { /* ignore */ }
    try { this.source?.stop(); } catch { /* already stopped or never started */ }
    try { this.renderer.dispose(); } catch { /* ignore */ }
  }
}
