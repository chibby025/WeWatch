// WWGame — WeWatch's own replacement for vibebasketball's original Game
// class (game.js, deleted from this fork). The original was a full 1v1
// H.O.R.S.E-vs-a-friend simulator: two Player instances, an AI opponent
// brain, checkball/possession flow, steal/block/contact resolution, a shot
// clock. None of that applies here — WeWatch's own backend (basketball.go)
// already owns turn order, H.O.R.S.E letters, and elimination for a real
// 2-6 player game; this file's only job is rendering ONE local player
// (whoever's turn it currently is) freely moving around an empty court and
// taking a shot, with basketball.go as the SOLE authority on make/miss.
//
// The critical integration seam is `consumeShotOutcomeOverride`, which
// player.js's releaseShot() ALREADY calls (it's how the original game's own
// three-point-contest mode overrides CPU shot outcomes) — see the patched
// updateAction() 'shot' case in entities/player.js for the other half of
// this bridge: it pauses right before release and calls
// requestServerShot() instead of deciding locally.
import * as THREE from 'three';
import { clamp, rand } from '../utils.js';
import { COURT, isBeyondArc, buildCourt } from '../world/court.js';
import { Ball } from '../entities/ball.js';
import { Player } from '../entities/player.js';
import { CourtSfx } from './courtSfx.js';
import { FeedbackFx } from './feedbackFx.js';
import { CameraRig } from './cameraRig.js';
import { input } from '../input.js';
import { SHOT_TIMING } from './shotTiming.js';

const VOLT_CONFIG = {
  name: 'YOU', team: 0, skill: 0.85,
  skin: 0x6e4a30, jersey: 0x23262c, shorts: 0x1d5a5e, shoes: 0xd8551f,
  hair: 0x120d08, number: 7, numberColor: '#ff9a3c',
};

// Mirrors backend basketball.go's basketballIdealPower/basketballTolerance
// EXACTLY (same constants, same formula) — deliberately duplicated rather
// than shared across a Go/JS boundary, same convention as DART_SCALE in
// DartsGame.jsx. A release timed exactly at the engine's own "perfect"
// instant maps to power === idealPower(distance) precisely, so a perfect
// release always lands inside the server's own tolerance window regardless
// of distance — preserving vibebasketball's original "green release always
// scores" contract while still letting the server make the real decision.
function basketballIdealPower(distance) { return 0.3 + 0.6 * distance; }
function basketballTolerance(distance) { return Math.max(0.15 - 0.08 * distance, 0.03); }

// A no-op stand-in for the original ui/hud.js HUD class, which expects a
// specific DOM structure (document.getElementById calls in its own
// constructor) from the original standalone index.html that this fork
// doesn't use — WeWatch's own React wrapper renders all visible UI (H.O.R.S.E
// letters, whose turn, the power meter) itself, matching how DartsGame.jsx/
// ArcheryGame.jsx never let their ported 3D scenes own any HTML chrome.
const STUB_HUD = {
  setNames() {}, setScore() {}, scorePop() {}, setPossession() {}, setTarget() {},
  setShotClock() {}, msg() {}, shotFeedback() {}, debug() {}, toggleDebug() {},
  toggleHelp() {}, setClearTask() {}, setControlContext() {}, shotMeter() {},
  hideShotMeter() {}, doneLoading() {}, update() {},
};

export class WWGame {
  constructor(scene, opts = {}) {
    this.hud = STUB_HUD;
    this.court = buildCourt(scene);
    this.ball = new Ball(scene);
    this.sfx = new CourtSfx();
    this.feedback = new FeedbackFx(scene);
    this.userPlayer = new Player(scene, VOLT_CONFIG);
    this.userPlayer.gameRef = this;
    this.userPlayer.forceJumpShotOnly = true; // read via this.gameRef in player.js's patched wantsFinish check
    this.players = [this.userPlayer];
    this.forceJumpShotOnly = true;
    this.userPlayer.setIndicator(true);

    this.state = 'live';
    this.camShake = 0;

    // ---- WeWatch server-shot bridge state ----
    // onShootAttempt(distance, power): caller-supplied, expected to send the
    // move to basketball.go and eventually call resolveServerShot(made).
    this.onShootAttempt = opts.onShootAttempt ?? null;
    // onShotMeterUpdate/onMessage: React-owned UI hooks, replacing hud.js.
    this.onShotMeterUpdate = opts.onShotMeterUpdate ?? null;
    this.onMessage = opts.onMessage ?? null;
    this._pendingShotResult = null; // null = no answer yet; boolean once resolved
    this._awaitingServer = false;
    this._retrieveTimer = 0;

    this._v = new THREE.Vector3();

    // Start the player standing at a reasonable free-throw-ish distance,
    // already holding the ball — there is no checkball/tip-off in a solo
    // shooting game.
    this.userPlayer.pos.set(0, 0, 9.4);
    this.userPlayer.facing = Math.atan2(
      COURT.rimCenter.x - this.userPlayer.pos.x,
      COURT.rimCenter.z - this.userPlayer.pos.z,
    );
    this.userPlayer.rig.group.position.set(this.userPlayer.pos.x, 0, this.userPlayer.pos.z);
    this.userPlayer.rig.group.rotation.y = this.userPlayer.facing;
    this.userPlayer.rig.group.updateMatrixWorld(true);
    this.ball.attach(this.userPlayer, this.userPlayer.holdPoint(this._v));
    this.userPlayer.gainPossession(this.ball);

    window.__wwBasketballGame = this; // debug/automation hook, mirrors the original's window.__game
  }

  // ------------------------------------------------------------ world
  // interface expected by entities/player.js and game/cameraRig.js — see
  // their own `world.*` call sites. Only `offense` is ever real here; every
  // opponent-shaped getter safely returns null (already handled gracefully
  // everywhere it's read — e.g. releaseShot's `if (def) {...}` contest calc).

  get offense() { return this.userPlayer; }
  get defense() { return null; }
  defensePlayer() { return null; }
  otherPlayer() { return null; }

  // ------------------------------------------------------------ WeWatch server-shot bridge

  /**
   * Called from player.js's patched updateAction() 'shot' case the instant
   * the player's own release gesture completes. relT/perfectT are the exact
   * same values the original engine uses for its own local timing-quality
   * bucketing — kept continuous here instead of discarding precision into
   * releaseTiming()'s 4-grade bucket.
   */
  requestServerShot(shooter, relT, perfectT) {
    this._awaitingServer = true;
    this._pendingShotResult = null;
    const distance01 = clamp(shooter.distToRim() / COURT.threeR, 0, 1);
    const idealPower = basketballIdealPower(distance01);
    const tolerance = basketballTolerance(distance01);
    const err = relT - perfectT;
    const STABLE_BAND = SHOT_TIMING.jump.stable; // 0.095 — reuse the engine's own tuned "still good" window as the reference scale
    const deviationFraction = clamp(Math.abs(err) / STABLE_BAND, 0, 3);
    const sign = err < 0 ? -1 : 1;
    const power = clamp(idealPower + sign * deviationFraction * tolerance, 0, 1);
    this.onShootAttempt?.({ distance: distance01, power });
  }

  hasServerShotResult() {
    return this._pendingShotResult !== null;
  }

  /** Called by the React wrapper once the server's game_state_update confirms make/miss. */
  resolveServerShot(made) {
    this._pendingShotResult = !!made;
  }

  consumeShotOutcomeOverride() {
    const made = this._pendingShotResult;
    this._pendingShotResult = null;
    this._awaitingServer = false;
    return { made };
  }

  // ------------------------------------------------------------ callbacks from player.js

  onShotReleased() {
    // Ball has left the hand — a floor bounce a moment later (ball.js) will
    // flip ball.state to 'loose', which our own update() loop watches to
    // auto-retrieve the ball for the next attempt (see below).
  }

  onDunk() {
    // Unreachable — forceJumpShotOnly keeps every shot on the jump-shot path.
  }

  onTakeBackNeeded() {
    // The original's "clear it past halfcourt" rule doesn't apply to a solo
    // shooting game — never triggered since this.state is always 'live' and
    // clearedBall is never meaningfully false here, but implemented as a
    // no-op for safety since startShot() calls it unconditionally when its
    // (inapplicable) condition happens to be true.
  }

  // ------------------------------------------------------------ per-frame

  update(dt) {
    const it = input.poll(this.cameraRig?.camera, dt);
    this.mapUserInput(this.userPlayer, it);

    this.userPlayer.update(dt, this.ball, this);
    this.ball.update(dt, this.players);

    // Auto-retrieve: once a resolved shot's ball has bounced on the floor at
    // least once (ball.js flips state to 'loose' there) or after a fixed
    // ceiling, hand it straight back — there's no defender to contest a
    // rebound, so making the player physically chase their own missed shot
    // would just be dead time between turns in a multiplayer party game.
    if (!this.userPlayer.hasBall && this.ball.state === 'loose' && !this.userPlayer.action) {
      this._retrieveTimer += dt;
      if (this._retrieveTimer > 0.5) {
        this._retrieveTimer = 0;
        this.userPlayer.pos.z = clamp(this.userPlayer.pos.z, -8.6, 13.4);
        this.userPlayer.pos.x = clamp(this.userPlayer.pos.x, -7.8, 7.8);
        this.ball.pos.copy(this.userPlayer.holdPoint(this._v));
        this.ball.attach(this.userPlayer, this.ball.pos);
        this.userPlayer.gainPossession(this.ball);
      }
    } else {
      this._retrieveTimer = 0;
    }

    for (const ev of this.ball.consumeEvents()) {
      if (ev.type === 'score') {
        this.sfx.swish(ev.clean);
        this.court?.net.kick?.(this.ball);
        this.feedback.score(COURT.rimCenter, ev.clean, false);
        this.camShake = Math.max(this.camShake, ev.clean ? 0.085 : 0.105);
      } else if (ev.type === 'rim-hit') this.sfx.rim(ev.speed);
      else if (ev.type === 'board-hit') this.sfx.board(ev.speed);
      else if (ev.type === 'floor-bounce') this.sfx.dribble(ev.impact);
      else if (ev.type === 'dribble-bounce') this.sfx.dribble(3.8);
    }

    this.court?.net.update(dt, this.ball);
    this.feedback.update(dt, this.ball);
    this.updateShotMeter();

    if (this.cameraRig) {
      if (this.camShake > 0) { this.cameraRig.addShake(this.camShake); this.camShake = 0; }
      this.cameraRig.update(dt, this);
    }
  }

  updateShotMeter() {
    if (!this.onShotMeterUpdate) return;
    const a = this.userPlayer.action;
    const live = a && (a.name === 'shot' || a.name === 'gather');
    if (!live) { this.onShotMeterUpdate(null); return; }
    const SPAN = SHOT_TIMING.jump.span;
    const perfectT = a.perfectT ?? 0.46;
    const progress = a.name === 'gather' ? 0 : clamp((a.t / a.dur) / SPAN, 0, 1);
    this.onShotMeterUpdate({
      progress,
      green0: (perfectT - SHOT_TIMING.jump.perfect) / SPAN,
      green1: (perfectT + SHOT_TIMING.jump.perfect) / SPAN,
      stable0: (perfectT - SHOT_TIMING.jump.stable) / SPAN,
      stable1: (perfectT + SHOT_TIMING.jump.stable) / SPAN,
      awaitingServer: this._awaitingServer,
    });
  }

  // ------------------------------------------------------------ input
  // Trimmed from the original mapUserInput: only the ball-carrier branch
  // survives (shooting + free movement) — there is never a defensive role
  // to map input into, since there is no opponent.

  mapUserInput(p, it) {
    const mag = it.moveMag ?? Math.hypot(it.move.x, it.move.z);
    const base = { move: { x: it.move.x, z: it.move.z }, mag, sprint: it.sprint, moveSerial: it.moveSerial ?? 0 };

    if (!p.hasBall) {
      // Between release and auto-retrieval: allow free movement only, no
      // shoot/dribble intents (nothing to shoot without the ball).
      p.intentOffense = null;
      p.intentDefense = { ...base };
      return;
    }

    p.intentOffense = {
      ...base,
      shoot: it.shoot,
      shootCommitted: it.shootCommitted,
      shootReleasedCommitted: it.shootReleasedCommitted,
      shootReleased: it.shootReleased,
      physical: it.physical,
    };
    p.intentDefense = null;

    if (it.shootPressed) p._spaceShotActive = p.startShot(true, null, null, true);
    if (it.shootReleased) {
      if (!it.shootReleasedCommitted) {
        if (!p._spaceShotActive || !p.cancelGatherToPumpFake()) p.startPumpFake();
      } else {
        p.releaseGatherShot();
      }
      p._spaceShotActive = false;
    }
  }
}

// isBeyondArc is re-exported for the React wrapper's own distance/points
// preview UI (mirrors the exact 3pt-line test player.js/game.js already use).
export { isBeyondArc };
export { rand };
