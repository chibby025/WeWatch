import React, { useRef, useEffect, useState, useCallback } from 'react';
import GameRulesButton from './GameRulesButton';

// ── Constants ────────────────────────────────────────────────────────────────
const PW = 28, PH = 12, FIRE_CD = 12, INVINCIBLE = 90, DRONE_R = 42, DRONE_FIRE_CD = 28;

const ETYPES = [
  { w: 18, h: 10, hp: 1, spd: 2.2, score: 10, color: '#66ffff',  shoot: false, name: 'scout'   },
  { w: 22, h: 12, hp: 2, spd: 1.5, score: 20, color: '#ff8844',  shoot: true,  bspd: 2.5, name: 'fighter' },
  { w: 28, h: 16, hp: 4, spd: 1.0, score: 40, color: '#aa44ff',  shoot: true,  bspd: 2.0, name: 'cruiser' },
];

const BOSSES = [
  { name: 'Medusa Jellyfish', hp: 80,  color: '#88ffdd', tentacles: 6,  attack: 'drip',    reward: 500  },
  { name: 'Brain Crawler',    hp: 100, color: '#ff9999', tentacles: 8,  attack: 'aimed',   reward: 600  },
  { name: 'Eye Colossus',     hp: 120, color: '#ffdd44', tentacles: 10, attack: 'burst',   reward: 700  },
  { name: 'Void Squid',       hp: 140, color: '#7766ff', tentacles: 8,  attack: 'ink',     reward: 800  },
  { name: 'Hive Queen',       hp: 160, color: '#ffaa00', tentacles: 4,  attack: 'spawn',   reward: 900  },
  { name: 'Crystal Titan',    hp: 180, color: '#aaddff', tentacles: 0,  attack: 'shard',   reward: 1000 },
  { name: 'Tentacle Hydra',   hp: 200, color: '#44ff88', tentacles: 12, attack: 'hydra',   reward: 1200 },
  { name: 'Shadow Wraith',    hp: 160, color: '#cc88ff', tentacles: 6,  attack: 'spiral',  reward: 1100 },
  { name: 'Leviathan',        hp: 240, color: '#ff6644', tentacles: 0,  attack: 'segment', reward: 1400 },
  { name: 'Omega Overlord',   hp: 300, color: '#ffffff', tentacles: 12, attack: 'omega',   reward: 2000 },
];

const WEAPON_DEF = {
  bolt:      { name: 'Bolt',       color: '#00ffff', ammo: 0   },
  missile:   { name: 'Missile',    color: '#ff8800', ammo: 5   },
  heat:      { name: 'Heat Seek',  color: '#ff4444', ammo: 4   },
  drone:     { name: 'Drone Shld', color: '#44ffaa', ammo: 180 },
  bomb:      { name: 'Bomb',       color: '#ffff00', ammo: 3   },
  laser:     { name: 'Laser',      color: '#ff00ff', ammo: 8   },
  sonic:     { name: 'Sonic',      color: '#88aaff', ammo: 3   },
  emp:       { name: 'EMP',        color: '#ffffff', ammo: 2   },
  blackhole: { name: 'Black Hole', color: '#aa44ff', ammo: 2   },
};

// ── Pure game-logic helpers ──────────────────────────────────────────────────
function mkGame(W, H) {
  return {
    frame: 0, score: 0, over: false, started: false,
    px: 28, py: H / 2,
    lives: 3, invincible: 0,
    boltTier: 1,
    special: 'bolt', specialAmmo: 0,
    drones: [], droneTimer: 0,
    fireTimer: 0,
    bullets: [], eBullets: [], bBullets: [],
    enemies: [], pickups: [], effects: [], sounds: [],
    boss: null, bossTimer: 0,
    blackholes: [], frozenFrames: 0,
    nextBoss: 400, bossIdx: 0,
  };
}

function nearest(g, x, y) {
  let best = null, bd = Infinity;
  const targets = [...g.enemies, ...(g.boss ? [g.boss] : [])];
  targets.forEach(t => { const d = Math.hypot(t.x - x, t.y - y); if (d < bd) { bd = d; best = t; } });
  return best;
}

function explosion(g, x, y, color) {
  g.sounds.push('explode');
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    g.effects.push({ kind: 'px', x, y, vx: Math.cos(a) * (2 + Math.random() * 2.5), vy: Math.sin(a) * (2 + Math.random() * 2.5), life: 20 + Math.floor(Math.random() * 14), color, r: 2 + Math.random() * 2 });
  }
}

function hitPlayer(g) {
  if (g.invincible > 0) return;
  g.invincible = INVINCIBLE;
  // Dramatic player-hit explosion: 24 particles in orange/white/red + screen flash
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + Math.random() * 0.4;
    const spd = 2.5 + Math.random() * 5;
    const palette = ['#ffffff', '#ff8800', '#ff3300', '#ffcc00'];
    g.effects.push({ kind: 'px', x: g.px, y: g.py, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 26 + Math.floor(Math.random() * 20), color: palette[i % palette.length], r: 2.5 + Math.random() * 3 });
  }
  g.effects.push({ kind: 'flash', life: 18, color: '#ff4400' });
  if (typeof navigator.vibrate === 'function') navigator.vibrate([80, 20, 80]);
  g.sounds.push('hit');
  if (g.boltTier > 1) { g.boltTier--; }
  else { g.lives--; if (g.lives <= 0) { g.lives = 0; g.over = true; } }
  g.special = 'bolt'; g.specialAmmo = 0; g.drones = [];
}

function dropPickup(g, x, y, src) {
  const weaps = ['missile', 'heat', 'bomb', 'laser', 'sonic', 'emp', 'blackhole'];
  let type;
  if (src === 'boss') { type = weaps[Math.floor(Math.random() * weaps.length)]; }
  else if (src === 2) { const r = Math.random(); type = r < 0.45 ? weaps[Math.floor(Math.random() * weaps.length)] : r < 0.65 ? 'drone' : 'bolt_up'; }
  else if (src === 1) { if (Math.random() < 0.3) type = weaps[Math.floor(Math.random() * weaps.length)]; }
  else { if (Math.random() < 0.05) type = 'bolt_up'; }
  if (!type) return;
  g.pickups.push({ x, y: y + (Math.random() - 0.5) * 20, type });
}

function collectPickup(g, p) {
  if (p.type === 'bolt_up') { if (g.boltTier < 3) g.boltTier++; return; }
  if (p.type === 'drone') { g.special = 'drone'; g.specialAmmo = WEAPON_DEF.drone.ammo; g.drones = [{ x: g.px, y: g.py }, { x: g.px, y: g.py }]; return; }
  const w = WEAPON_DEF[p.type];
  if (w) { g.special = p.type; g.specialAmmo = w.ammo; g.drones = []; }
}

function firebolts(g, tier) {
  const v = 8;
  g.bullets.push({ x: g.px + 14, y: g.py, vx: v, vy: 0, kind: 'bolt', r: 4, color: '#00ffff' });
  if (tier >= 2) {
    g.bullets.push({ x: g.px + 12, y: g.py - 6, vx: v, vy: -0.6, kind: 'bolt', r: 4, color: '#00ffcc' });
    g.bullets.push({ x: g.px + 12, y: g.py + 6, vx: v, vy: 0.6,  kind: 'bolt', r: 4, color: '#00ffcc' });
  }
  if (tier >= 3) {
    g.bullets.push({ x: g.px + 8, y: g.py - 12, vx: v * 0.9, vy: -1.6, kind: 'bolt', r: 4, color: '#aaffff' });
    g.bullets.push({ x: g.px + 8, y: g.py + 12, vx: v * 0.9, vy: 1.6,  kind: 'bolt', r: 4, color: '#aaffff' });
  }
}

function fireSpecial(g, W, H) {
  g.sounds.push('shoot');
  const sp = g.special;
  if (sp === 'bolt' || g.specialAmmo <= 0) { firebolts(g, g.boltTier); return; }

  switch (sp) {
    case 'missile':
      g.bullets.push({ x: g.px + 14, y: g.py, vx: 5.5, vy: 0, kind: 'missile', r: 6, color: '#ff8800' });
      break;
    case 'heat': {
      const t = nearest(g, g.px, g.py);
      const a = t ? Math.atan2(t.y - g.py, t.x - g.px) : 0;
      g.bullets.push({ x: g.px + 14, y: g.py, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, kind: 'heat', r: 5, color: '#ff4444', seek: true });
      break;
    }
    case 'drone': firebolts(g, g.boltTier); return; // drones handle own fire
    case 'bomb':
      g.enemies.forEach(e => { explosion(g, e.x, e.y, ETYPES[e.type].color); g.score += ETYPES[e.type].score; if (Math.random() < 0.1) dropPickup(g, e.x, e.y, e.type); });
      g.enemies = [];
      if (g.boss) g.boss.hp -= 25;
      g.effects.push({ kind: 'flash', life: 15, color: '#ffff00' });
      break;
    case 'laser':
      g.bullets.push({ x: g.px + 14, y: g.py, vx: 18, vy: 0, kind: 'laser', r: 6, color: '#ff00ff', pierce: true });
      break;
    case 'sonic': {
      const SR = 130;
      g.effects.push({ kind: 'sonic', x: g.px, y: g.py, life: 40, maxLife: 40 });
      g.enemies = g.enemies.filter(e => { if (Math.hypot(e.x - g.px, e.y - g.py) < SR) { explosion(g, e.x, e.y, ETYPES[e.type].color); g.score += ETYPES[e.type].score; return false; } return true; });
      if (g.boss && Math.hypot(g.boss.x - g.px, g.boss.y - g.py) < SR) g.boss.hp -= 18;
      break;
    }
    case 'emp':
      g.frozenFrames = 200;
      g.effects.push({ kind: 'emp', life: 40 });
      break;
    case 'blackhole':
      g.blackholes.push({ x: W * 0.55 + Math.random() * (W * 0.3), y: H * 0.15 + Math.random() * (H * 0.7), timer: 0 });
      break;
    default: firebolts(g, g.boltTier); return;
  }
  g.specialAmmo--;
  if (g.specialAmmo <= 0) { g.special = 'bolt'; g.drones = []; }
}

function bossFire(g, W, H) {
  const b = g.boss;
  const { x, y } = b;
  const dx = g.px - x, dy = g.py - y;
  const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
  switch (b.attack) {
    case 'drip':
      for (let i = -1; i <= 1; i++) g.bBullets.push({ x, y, vx: -1.5, vy: i * 1.8, r: 5, color: b.color });
      break;
    case 'aimed':
      g.bBullets.push({ x, y, vx: (dx / dist) * 3.2, vy: (dy / dist) * 3.2, r: 5, color: b.color });
      break;
    case 'burst':
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.bBullets.push({ x, y, vx: Math.cos(a) * 2.8, vy: Math.sin(a) * 2.8, r: 5, color: b.color }); }
      break;
    case 'ink':
      g.bBullets.push({ x, y, vx: (dx / dist) * 2, vy: (dy / dist) * 2, r: 9, color: '#6644ff', ink: true });
      break;
    case 'spawn':
      if (g.enemies.length < 8) g.enemies.push({ x: x - 20, y, type: 0, hp: 1, fireTimer: 999, sway: Math.random() * Math.PI * 2 });
      break;
    case 'shard':
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.bBullets.push({ x, y, vx: Math.cos(a) * 3.5, vy: Math.sin(a) * 3.5, r: 4, color: b.color }); }
      break;
    case 'hydra':
      for (let h = 0; h < 3; h++) { const hy = y + (h - 1) * 26; const dx2 = g.px - x, dy2 = g.py - hy; const d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) + 0.001; g.bBullets.push({ x, y: hy, vx: (dx2 / d2) * 3, vy: (dy2 / d2) * 3, r: 5, color: b.color }); }
      break;
    case 'spiral':
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + b.phase * 3; g.bBullets.push({ x, y, vx: Math.cos(a) * 2.8, vy: Math.sin(a) * 2.8, r: 5, color: b.color }); }
      break;
    case 'segment':
      for (let s = 0; s < 3; s++) { const sx = x + s * 22, sy = y + Math.sin(b.phase * 20 + s) * 18; g.bBullets.push({ x: sx, y: sy, vx: -2, vy: (Math.random() - 0.5) * 2.5, r: 5, color: b.color }); }
      break;
    case 'omega':
      if (b.hp > b.maxHp / 2) {
        g.bBullets.push({ x, y, vx: (dx / dist) * 3.5, vy: (dy / dist) * 3.5, r: 6, color: '#ffffff' });
        for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; g.bBullets.push({ x, y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, r: 5, color: '#aaaaff' }); }
      } else {
        for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + b.phase * 5; g.bBullets.push({ x, y, vx: Math.cos(a) * 3.8, vy: Math.sin(a) * 3.8, r: 5, color: '#ff4444' }); }
      }
      break;
    default:
      g.bBullets.push({ x, y, vx: (dx / dist) * 2.5, vy: (dy / dist) * 2.5, r: 5, color: b.color });
  }
}

function updateGame(g, W, H, keys, touchY, touchFiring) {
  if (!g.started || g.over) return;
  g.frame++;

  // Player move
  if ((keys.ArrowUp || keys.KeyW) && g.py > PH / 2 + 2) g.py -= 3;
  if ((keys.ArrowDown || keys.KeyS) && g.py < H - PH / 2 - 2) g.py += 3;
  if (touchY !== null) {
    g.py += (touchY - g.py) * 0.12;
    g.py = Math.max(PH / 2 + 2, Math.min(H - PH / 2 - 2, g.py));
  }

  if (g.invincible > 0) g.invincible--;
  if (g.frozenFrames > 0) g.frozenFrames--;

  // Fire
  if (g.fireTimer > 0) g.fireTimer--;
  if ((keys.Space || keys.KeyZ || touchFiring) && g.fireTimer === 0) {
    g.fireTimer = FIRE_CD;
    fireSpecial(g, W, H);
  }

  // Drones
  if (g.drones.length > 0) {
    g.droneTimer = (g.droneTimer || 0) + 1;
    g.drones.forEach((d, i) => {
      const a = g.frame * 0.06 + (i / g.drones.length) * Math.PI * 2;
      d.x = g.px + Math.cos(a) * DRONE_R;
      d.y = g.py + Math.sin(a) * DRONE_R;
    });
    if (g.droneTimer >= DRONE_FIRE_CD) {
      g.droneTimer = 0;
      g.drones.forEach(d => {
        const t = nearest(g, d.x, d.y);
        if (t) { const dx = t.x - d.x, dy = t.y - d.y, dist = Math.sqrt(dx * dx + dy * dy) + 0.001; g.bullets.push({ x: d.x, y: d.y, vx: (dx / dist) * 6, vy: (dy / dist) * 6, kind: 'drone_shot', r: 3, color: '#44ffaa' }); }
      });
    }
    if (g.special === 'drone') { g.specialAmmo--; if (g.specialAmmo <= 0) { g.special = 'bolt'; g.drones = []; } }
  }

  // Heat-seek steer
  g.bullets.forEach(b => {
    if (!b.seek) return;
    const t = nearest(g, b.x, b.y);
    if (!t) return;
    const dx = t.x - b.x, dy = t.y - b.y, d = Math.sqrt(dx * dx + dy * dy) + 0.001;
    b.vx += ((dx / d) * 7 - b.vx) * 0.12;
    b.vy += ((dy / d) * 7 - b.vy) * 0.12;
  });

  // Black holes
  g.blackholes = g.blackholes.filter(bh => {
    bh.timer++;
    if (bh.timer > 30) g.enemies.forEach(e => { const dx = bh.x - e.x, dy = bh.y - e.y, d = Math.sqrt(dx * dx + dy * dy) + 1; const f = 150 / (d * d); e.x += dx * f; e.y += dy * f; });
    return bh.timer < 90;
  });

  // Move bullets
  const OOB = b => b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30;
  g.bullets = g.bullets.filter(b => { b.x += b.vx; b.y += b.vy; return !OOB(b); });
  g.eBullets = g.eBullets.filter(b => { b.x += b.vx; b.y += b.vy; return !OOB(b); });
  g.bBullets = g.bBullets.filter(b => { b.x += b.vx; b.y += b.vy; return !OOB(b); });

  // Spawn enemies (only when no boss)
  if (!g.boss) {
    const rate = Math.max(30, 80 - Math.floor(g.score / 100));
    if (g.frame % rate === 0) {
      const maxType = Math.min(2, Math.floor(g.score / 150));
      const r = Math.random();
      const ti = r < 0.5 ? 0 : r < 0.8 ? Math.min(1, maxType) : Math.min(2, maxType);
      const et = ETYPES[ti];
      g.enemies.push({ x: W + et.w, y: 10 + Math.random() * (H - 20), type: ti, hp: et.hp, fireTimer: Math.floor(Math.random() * 60), sway: Math.random() * Math.PI * 2 });
    }
  }

  // Move enemies
  const frozen = g.frozenFrames > 0;
  g.enemies = g.enemies.filter(e => {
    const et = ETYPES[e.type];
    if (!frozen) {
      e.x -= et.spd;
      e.y += Math.sin(g.frame * 0.025 + e.sway) * 0.6;
      if (et.shoot) { e.fireTimer--; if (e.fireTimer <= 0) { e.fireTimer = 50 + Math.floor(Math.random() * 40); const dx = g.px - e.x, dy = g.py - e.y, d = Math.sqrt(dx * dx + dy * dy) + 0.001; g.eBullets.push({ x: e.x, y: e.y, vx: (dx / d) * et.bspd, vy: (dy / d) * et.bspd, r: 3 }); } }
    }
    if (e.x < -et.w) return false; // silent removal — no life penalty
    return true;
  });

  // Boss movement & fire
  if (g.boss) {
    const b = g.boss;
    b.phase = (b.phase || 0) + 0.04;
    const targetY = H / 2 + Math.sin(b.phase * 0.4) * (H * 0.3);
    const targetX = W - 80 - Math.sin(b.phase * 0.2) * 25;
    b.x += (targetX - b.x) * 0.015;
    b.y += (targetY - b.y) * 0.02;
    if (b.attack === 'spiral' && g.frame % 150 === 0) b.y = H * 0.15 + Math.random() * (H * 0.7);
    if (!frozen) { g.bossTimer--; if (g.bossTimer <= 0) { g.bossTimer = 35 + Math.floor(Math.random() * 20); bossFire(g, W, H); } }
  } else if (g.score >= g.nextBoss) {
    const bi = g.bossIdx % BOSSES.length;
    const bd = BOSSES[bi];
    g.boss = { ...bd, x: W - 60, y: H / 2, maxHp: bd.hp, idx: bi, phase: 0 };
    g.bossIdx++;
    g.nextBoss += 500 + g.bossIdx * 100;
    g.bossTimer = 60;
    g.enemies = [];
  }

  // Move pickups
  g.pickups = g.pickups.filter(p => { p.x -= 1.4; return p.x > -20; });

  // Bullet–enemy collisions
  g.bullets.forEach(b => {
    if (b._hit) return;
    g.enemies.forEach(e => {
      if (e.hp <= 0) return;
      const et = ETYPES[e.type];
      if (Math.abs(b.x - e.x) < et.w / 2 + (b.r || 4) && Math.abs(b.y - e.y) < et.h / 2 + (b.r || 4)) {
        if (!b.pierce) b._hit = true;
        const dmg = b.kind === 'laser' ? 0.5 : 1;
        e.hp -= dmg;
        if (e.hp <= 0) { g.score += et.score; explosion(g, e.x, e.y, et.color); if (Math.random() < 0.18) dropPickup(g, e.x, e.y, e.type); }
      }
    });
  });
  g.enemies = g.enemies.filter(e => e.hp > 0);
  g.bullets = g.bullets.filter(b => !b._hit);

  // Bullet–boss collisions
  if (g.boss) {
    g.bullets.forEach(b => {
      if (b._hit || !g.boss) return;
      if (Math.abs(b.x - g.boss.x) < 52 && Math.abs(b.y - g.boss.y) < 52) {
        if (!b.pierce) b._hit = true;
        const dmg = b.kind === 'laser' ? 2 : b.kind === 'missile' ? 12 : b.kind === 'drone_shot' ? 3 : 5;
        g.boss.hp -= dmg;
        if (g.boss.hp <= 0) { g.score += g.boss.reward; explosion(g, g.boss.x, g.boss.y, g.boss.color); if (g.lives < 3) g.lives++; dropPickup(g, g.boss.x, g.boss.y, 'boss'); g.boss = null; g.bBullets = []; }
      }
    });
    g.bullets = g.bullets.filter(b => !b._hit);
  }

  // Drone bullet intercept
  if (g.drones.length > 0) {
    g.eBullets = g.eBullets.filter(b => !g.drones.some(d => Math.hypot(b.x - d.x, b.y - d.y) < 18));
    g.bBullets = g.bBullets.filter(b => !g.drones.some(d => Math.hypot(b.x - d.x, b.y - d.y) < 18));
  }

  // Enemy bullets → player
  if (g.invincible === 0) {
    g.eBullets = g.eBullets.filter(b => { if (Math.abs(b.x - g.px) < PW / 2 + 4 && Math.abs(b.y - g.py) < PH / 2 + 4) { hitPlayer(g); return false; } return true; });
    g.bBullets = g.bBullets.filter(b => { if (Math.abs(b.x - g.px) < PW / 2 + 5 && Math.abs(b.y - g.py) < PH / 2 + 5) { hitPlayer(g); return false; } return true; });
  }

  // Enemy rams player
  if (g.invincible === 0) {
    g.enemies = g.enemies.filter(e => {
      const et = ETYPES[e.type];
      if (Math.abs(e.x - g.px) < et.w / 2 + PW / 2 - 4 && Math.abs(e.y - g.py) < et.h / 2 + PH / 2 - 4) { hitPlayer(g); explosion(g, e.x, e.y, et.color); return false; }
      return true;
    });
  }

  // Pickups → player
  g.pickups = g.pickups.filter(p => { if (Math.abs(p.x - g.px) < 22 && Math.abs(p.y - g.py) < 22) { collectPickup(g, p); return false; } return true; });

  // Effects tick
  g.effects.forEach(fx => { if (fx.kind === 'px') { fx.x += fx.vx; fx.y += fx.vy; } fx.life--; });
  g.effects = g.effects.filter(fx => fx.life > 0);
}

// ── Draw helpers ─────────────────────────────────────────────────────────────
function tentacle(ctx, bx, by, angle, len, segs, phase, color, lw) {
  ctx.strokeStyle = color; ctx.lineWidth = lw || 2.5; ctx.lineCap = 'round';
  let px = bx, py = by;
  ctx.beginPath(); ctx.moveTo(px, py);
  for (let s = 1; s <= segs; s++) {
    const t = s / segs;
    const wave = Math.sin(t * Math.PI * 2.5 + phase) * 13 * t;
    const nx = bx + Math.cos(angle) * len * t + Math.cos(angle + Math.PI / 2) * wave;
    const ny = by + Math.sin(angle) * len * t + Math.sin(angle + Math.PI / 2) * wave;
    const cpx = (px + nx) / 2 + Math.cos(angle + Math.PI / 2) * wave * 0.5;
    const cpy = (py + ny) / 2 + Math.sin(angle + Math.PI / 2) * wave * 0.5;
    ctx.quadraticCurveTo(cpx, cpy, nx, ny);
    px = nx; py = ny;
  }
  ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
}

function drawBossShape(ctx, boss, frame) {
  const { x, y, idx, color, phase, hp, maxHp } = boss;

  ctx.shadowColor = color; ctx.shadowBlur = 22;

  if (idx === 0) { // Medusa Jellyfish
    for (let i = 0; i < 6; i++) tentacle(ctx, x, y + 8, Math.PI * 0.7 + (i / 6) * Math.PI * 0.6, 48, 5, phase + i * 0.9, color);
    const p = 0.85 + Math.sin(phase * 2) * 0.15;
    const g2 = ctx.createRadialGradient(x, y, 0, x, y, 36 * p);
    g2.addColorStop(0, '#fff'); g2.addColorStop(0.45, color); g2.addColorStop(1, 'rgba(136,255,221,0)');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.ellipse(x, y, 36 * p, 26 * p, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(x, y - 4, 18 * p, 12 * p, 0, Math.PI, Math.PI * 2); ctx.fill();
  }
  else if (idx === 1) { // Brain Crawler
    for (let i = 0; i < 8; i++) tentacle(ctx, x, y, (i / 8) * Math.PI * 2, 40, 4, phase + i * 0.6, color);
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, 30, 24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#cc5555'; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) { const wy = y - 16 + i * 8; ctx.beginPath(); ctx.moveTo(x - 23 + (i % 2) * 4, wy); ctx.bezierCurveTo(x - 8, wy + 5, x + 8, wy - 5, x + 23 - (i % 2) * 4, wy); ctx.stroke(); }
    [[x - 10, y - 4], [x + 10, y - 4]].forEach(([ex, ey]) => { ctx.fillStyle = '#f00'; ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ex, ey, 2, 0, Math.PI * 2); ctx.fill(); });
  }
  else if (idx === 2) { // Eye Colossus
    for (let i = 0; i < 10; i++) tentacle(ctx, x, y, (i / 10) * Math.PI * 2 + phase, 52, 5, phase + i * 0.5, color);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 28, 0, Math.PI * 2); ctx.fill();
    const ix = x + Math.cos(phase * 0.5) * 7, iy = y + Math.sin(phase * 0.5) * 7;
    ctx.fillStyle = '#ffcc00'; ctx.beginPath(); ctx.arc(ix, iy, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ix, iy, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,0,0,0.35)'; ctx.lineWidth = 1;
    for (let v = 0; v < 6; v++) { const va = (v / 6) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(x + Math.cos(va) * 18, y + Math.sin(va) * 18); ctx.lineTo(x + Math.cos(va) * 27, y + Math.sin(va) * 27); ctx.stroke(); }
    ctx.fillStyle = '#221100'; ctx.beginPath(); ctx.moveTo(x - 28, y); ctx.bezierCurveTo(x - 12, y - 18 + Math.sin(phase) * 4, x + 12, y - 18 + Math.sin(phase) * 4, x + 28, y); ctx.fill();
  }
  else if (idx === 3) { // Void Squid
    for (let i = 0; i < 8; i++) tentacle(ctx, x, y + 10, Math.PI + (i / 8) * Math.PI * 2, 52, 6, phase + i, color);
    const g2 = ctx.createRadialGradient(x, y - 5, 0, x, y - 5, 26); g2.addColorStop(0, '#9988ff'); g2.addColorStop(1, color);
    ctx.fillStyle = g2; ctx.beginPath(); ctx.ellipse(x, y - 5, 18, 30, 0, 0, Math.PI * 2); ctx.fill();
    [[x - 20, y - 18, x - 32, y - 36, x - 9, y - 26], [x + 20, y - 18, x + 32, y - 36, x + 9, y - 26]].forEach(([ax, ay, bx2, by2, cx2, cy2]) => { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx2, by2); ctx.lineTo(cx2, cy2); ctx.closePath(); ctx.fill(); });
    [[x - 8, y], [x + 8, y]].forEach(([ex, ey]) => { ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ex, ey, 2, 0, Math.PI * 2); ctx.fill(); });
  }
  else if (idx === 4) { // Hive Queen
    ctx.globalAlpha = 0.35 + Math.sin(frame * 0.3) * 0.15;
    ctx.fillStyle = '#ffcc44';
    for (let w = 0; w < 4; w++) { const side = w % 2 === 0 ? -1 : 1; const wy = w < 2 ? y - 10 : y + 5; ctx.beginPath(); ctx.ellipse(x + side * 22, wy, 26, 12, side * (Math.PI * 0.15 + (frame % 4) * 0.06), 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#cc8800'; ctx.beginPath(); ctx.ellipse(x, y - 12, 13, 9, 0, 0, Math.PI * 2); ctx.fill();
    const g2 = ctx.createLinearGradient(x, y, x, y + 26); g2.addColorStop(0, color); g2.addColorStop(1, '#cc6600');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.ellipse(x, y + 12, 17, 24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; for (let s = 0; s < 3; s++) { ctx.beginPath(); ctx.ellipse(x, y + 5 + s * 9, 14, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#cc8800'; ctx.beginPath(); ctx.arc(x, y - 22, 11, 0, Math.PI * 2); ctx.fill();
    for (let a = 0; a < 4; a++) tentacle(ctx, x + (a < 2 ? -5 : 5), y - 30, -Math.PI / 2 + (a % 2 - 0.5) * 0.9, 22, 3, phase + a, '#ffcc44');
  }
  else if (idx === 5) { // Crystal Titan
    for (let s = 0; s < 8; s++) { const a = (s / 8) * Math.PI * 2 + phase; const sx = x + Math.cos(a) * 42, sy = y + Math.sin(a) * 42; ctx.save(); ctx.translate(sx, sy); ctx.rotate(a + phase); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(4, 0); ctx.lineTo(0, 7); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill(); ctx.restore(); }
    ctx.save(); ctx.translate(x, y); ctx.rotate(phase * 0.35);
    ctx.fillStyle = color; ctx.globalAlpha = 0.8; ctx.beginPath();
    for (let p2 = 0; p2 < 6; p2++) { const pa = (p2 / 6) * Math.PI * 2, pr = 28 + Math.sin(phase * 3 + p2) * 5; p2 === 0 ? ctx.moveTo(Math.cos(pa) * pr, Math.sin(pa) * pr) : ctx.lineTo(Math.cos(pa) * pr, Math.sin(pa) * pr); }
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; ctx.restore();
    const cg = ctx.createRadialGradient(x, y, 0, x, y, 16); cg.addColorStop(0, '#fff'); cg.addColorStop(1, color);
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
  }
  else if (idx === 6) { // Tentacle Hydra
    ctx.fillStyle = '#1a5530'; ctx.beginPath(); ctx.ellipse(x, y, 20, 16, 0, 0, Math.PI * 2); ctx.fill();
    [{ dx: 0, dy: -24 }, { dx: -20, dy: 10 }, { dx: 20, dy: 10 }].forEach((hp2, hi) => {
      const hx = x + hp2.dx, hy = y + hp2.dy;
      for (let i = 0; i < 4; i++) tentacle(ctx, hx, hy, (i / 4) * Math.PI * 2, 26, 4, phase + hi * 1.4 + i * 0.7, color);
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(hx, hy, 13, 0, Math.PI * 2); ctx.fill();
      [[hx - 5, hy - 3], [hx + 5, hy - 3]].forEach(([ex, ey]) => { ctx.fillStyle = '#f00'; ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ex, ey, 1.8, 0, Math.PI * 2); ctx.fill(); });
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx - 6, hy + 5); ctx.lineTo(hx + 6, hy + 5); ctx.stroke();
    });
  }
  else if (idx === 7) { // Shadow Wraith
    for (let tr = 0; tr < 4; tr++) { ctx.globalAlpha = (4 - tr) / 9; ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x + tr * 6, y, 24 - tr * 2, 34 - tr * 3, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    const g2 = ctx.createRadialGradient(x, y, 0, x, y, 28); g2.addColorStop(0, 'rgba(200,136,255,0.9)'); g2.addColorStop(0.7, 'rgba(100,50,200,0.4)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.ellipse(x, y, 26, 36, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 6; i++) tentacle(ctx, x, y + 18, Math.PI / 2 + Math.PI / 6 + (i - 2.5) * 0.4 + Math.sin(phase + i) * 0.3, 32, 4, phase + i, 'rgba(200,136,255,0.7)');
    [[x - 8, y - 4], [x + 8, y - 4]].forEach(([ex, ey]) => { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ex + Math.cos(phase) * 1.5, ey, 1.8, 0, Math.PI * 2); ctx.fill(); });
  }
  else if (idx === 8) { // Leviathan
    for (let s = 4; s >= 0; s--) {
      const sx = x + s * 22, sy = y + Math.sin(frame * 0.05 + s * 0.9) * 20;
      const alive = hp > (4 - s) * (maxHp / 5);
      ctx.fillStyle = alive ? color : '#2a2a2a'; ctx.beginPath(); ctx.ellipse(sx, sy, 14 - s * 1.2, 11 - s * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      if (alive && s < 4) { for (let sp = -1; sp <= 1; sp++) { ctx.strokeStyle = '#ff4400'; ctx.lineWidth = 2; const sa = Math.PI / 4 + sp * 0.4; ctx.beginPath(); ctx.moveTo(sx + Math.cos(sa) * 9, sy + Math.sin(sa) * 9); ctx.lineTo(sx + Math.cos(sa) * 18, sy + Math.sin(sa) * 18); ctx.stroke(); } }
    }
    const hy = y + Math.sin(frame * 0.05) * 20;
    ctx.fillStyle = color; ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(x, hy, 17, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 22;
    [[x - 7, hy - 4], [x + 7, hy - 4]].forEach(([ex, ey]) => { ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ex, ey, 2, 0, Math.PI * 2); ctx.fill(); });
  }
  else { // Omega Overlord (idx 9)
    const enraged = hp < maxHp / 2;
    const bc = enraged ? '#ff6666' : color;
    for (let r = 0; r < 3; r++) { const rs = 48 + r * 14 + Math.sin(phase * 2 + r) * 6; ctx.strokeStyle = enraged ? `rgba(255,120,120,${0.28 - r * 0.07})` : `rgba(200,200,255,${0.28 - r * 0.07})`; ctx.lineWidth = 2; ctx.save(); ctx.translate(x, y); ctx.rotate(phase * (r % 2 ? 1 : -1)); ctx.beginPath(); ctx.ellipse(0, 0, rs, rs * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    for (let i = 0; i < 12; i++) tentacle(ctx, x, y, (i / 12) * Math.PI * 2 + phase * 0.5, 55, 6, phase + i * 0.4, enraged ? '#ff9999' : bc, 2);
    const cg = ctx.createRadialGradient(x, y, 0, x, y, 34); if (enraged) { cg.addColorStop(0, '#fff'); cg.addColorStop(0.35, '#ff9999'); cg.addColorStop(1, '#ff0000'); } else { cg.addColorStop(0, '#fff'); cg.addColorStop(0.35, '#ddddff'); cg.addColorStop(1, '#8888ff'); }
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x, y, 34, 0, Math.PI * 2); ctx.fill();
    [[x - 12, y - 5], [x + 12, y - 5]].forEach(([ex, ey]) => { ctx.fillStyle = enraged ? '#f00' : '#000088'; ctx.beginPath(); ctx.arc(ex, ey, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + Math.cos(phase) * 2, ey, 3, 0, Math.PI * 2); ctx.fill(); });
    ctx.strokeStyle = enraged ? '#f00' : '#0000aa'; ctx.lineWidth = 3; ctx.beginPath(); if (enraged) { for (let m = 0; m < 6; m++) { const mx = x - 17 + m * 7; ctx.moveTo(mx, y + 10); ctx.lineTo(mx, y + 16); } } else ctx.arc(x, y + 9, 10, 0, Math.PI); ctx.stroke();
    ctx.fillStyle = enraged ? '#ff6600' : '#ffcc00';
    for (let c = 0; c < 5; c++) { const ca = -Math.PI / 2 + ((c - 2) / 4) * Math.PI * 0.7, cr = 38 + Math.sin(phase + c) * 4; ctx.beginPath(); ctx.moveTo(x + Math.cos(ca) * 33, y + Math.sin(ca) * 33); ctx.lineTo(x + Math.cos(ca) * cr, y + Math.sin(ca) * cr); ctx.lineTo(x + Math.cos(ca + 0.14) * 33, y + Math.sin(ca + 0.14) * 33); ctx.closePath(); ctx.fill(); }
  }

  ctx.shadowBlur = 0;
}

function drawGame(ctx, g, W, H) {
  // Background
  ctx.fillStyle = '#050510'; ctx.fillRect(0, 0, W, H);
  // Stars (deterministic by frame for scrolling)
  for (let i = 0; i < 70; i++) {
    const sx = ((i * 73 + (g.started ? g.frame * 0.7 : 0)) % (W + 20)) - 10;
    const sy = (i * 137) % H;
    ctx.fillStyle = i % 5 === 0 ? 'rgba(200,200,255,0.7)' : 'rgba(255,255,255,0.45)';
    ctx.fillRect(sx, sy, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
  }

  if (!g.started) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, W, H);
    ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 22;
    ctx.fillStyle = '#00ffff'; ctx.font = `bold ${W > 300 ? 24 : 17}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SPACE  ATTACK', W / 2, H / 2 - 26);
    ctx.shadowBlur = 0; ctx.fillStyle = '#aaaaff'; ctx.font = `${W > 300 ? 12 : 9}px monospace`;
    ctx.fillText('↑ ↓  move  ·  SPACE  fire', W / 2, H / 2 + 4);
    ctx.fillStyle = '#ffffff'; ctx.font = `${W > 300 ? 13 : 10}px monospace`;
    ctx.fillText('Tap or press SPACE to start', W / 2, H / 2 + 24); ctx.textBaseline = 'alphabetic'; return;
  }

  // Flash (color-aware: yellow for bomb/EMP, red-orange for player hit)
  const flash = g.effects.find(f => f.kind === 'flash');
  if (flash) {
    const fc = flash.color || '#ffff00';
    const alpha = flash.life / 30 * 0.45;
    ctx.fillStyle = fc.startsWith('#') ? fc + Math.round(alpha * 255).toString(16).padStart(2, '0') : `rgba(255,68,0,${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  // EMP ring
  const emp = g.effects.find(f => f.kind === 'emp');
  if (emp) { ctx.strokeStyle = `rgba(200,220,255,${emp.life / 40})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(g.px, g.py, (1 - emp.life / 40) * W * 0.85, 0, Math.PI * 2); ctx.stroke(); }

  // Frozen overlay
  if (g.frozenFrames > 0) { ctx.fillStyle = 'rgba(100,140,255,0.07)'; ctx.fillRect(0, 0, W, H); }

  // Sonic rings
  g.effects.filter(f => f.kind === 'sonic').forEach(f => { ctx.strokeStyle = `rgba(136,170,255,${f.life / f.maxLife * 0.7})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, (1 - f.life / f.maxLife) * 145, 0, Math.PI * 2); ctx.stroke(); });

  // Black holes
  g.blackholes.forEach(bh => {
    const p = bh.timer / 90, r = 14 + p * 28;
    const g2 = ctx.createRadialGradient(bh.x, bh.y, 0, bh.x, bh.y, r);
    g2.addColorStop(0, '#000'); g2.addColorStop(0.7, 'rgba(100,0,200,0.55)'); g2.addColorStop(1, 'rgba(100,0,200,0)');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(bh.x, bh.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(170,68,255,${0.8 - p * 0.5})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bh.x, bh.y, r + 6, 0, Math.PI * 2); ctx.stroke();
  });

  // Pickups
  const PCOL = { bolt_up: '#fff', missile: '#ff8800', heat: '#ff4444', drone: '#44ffaa', bomb: '#ffff00', laser: '#ff00ff', sonic: '#88aaff', emp: '#ddeeff', blackhole: '#aa44ff' };
  const PLBL = { bolt_up: '▲', missile: 'M', heat: '⬢', drone: 'D', bomb: 'B', laser: 'L', sonic: 'S', emp: 'E', blackhole: '●' };
  g.pickups.forEach(p => {
    const bob = Math.sin(g.frame * 0.1 + p.x * 0.05) * 3;
    const c = PCOL[p.type] || '#fff';
    ctx.shadowColor = c; ctx.shadowBlur = 12; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p.x, p.y + bob, 9, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#000'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(PLBL[p.type] || '?', p.x, p.y + bob); ctx.textBaseline = 'alphabetic';
  });

  // Player bullets
  g.bullets.forEach(b => {
    ctx.shadowColor = b.color; ctx.shadowBlur = 8; ctx.fillStyle = b.color;
    if (b.kind === 'laser') { ctx.fillRect(b.x - 22, b.y - 2.5, 44, 5); }
    else if (b.kind === 'missile') { ctx.beginPath(); ctx.ellipse(b.x, b.y, 8, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ff4400'; ctx.shadowBlur = 6; ctx.beginPath(); ctx.ellipse(b.x - 10, b.y, 5, 2.5, 0, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(b.x, b.y, b.r || 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.shadowBlur = 0;
  });

  // Enemy bullets
  g.eBullets.forEach(b => { ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 6; ctx.fillStyle = '#ff4444'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r || 3, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; });
  // Boss bullets
  g.bBullets.forEach(b => { ctx.shadowColor = b.color; ctx.shadowBlur = 8; ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, b.r || 5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; });

  // Enemies
  g.enemies.forEach(e => {
    const et = ETYPES[e.type];
    const col = g.frozenFrames > 0 ? '#88aaff' : et.color;
    ctx.shadowColor = col; ctx.shadowBlur = 6; ctx.fillStyle = col;
    if (e.type === 0) { ctx.beginPath(); ctx.moveTo(e.x + et.w / 2, e.y); ctx.lineTo(e.x, e.y - et.h / 2); ctx.lineTo(e.x - et.w / 2, e.y); ctx.lineTo(e.x, e.y + et.h / 2); ctx.closePath(); ctx.fill(); }
    else if (e.type === 1) { ctx.beginPath(); ctx.moveTo(e.x - et.w / 2, e.y); ctx.lineTo(e.x + et.w / 2, e.y - et.h / 2); ctx.lineTo(e.x + et.w / 3, e.y); ctx.lineTo(e.x + et.w / 2, e.y + et.h / 2); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(e.x + 2, e.y, 4, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.fillRect(e.x - et.w / 2, e.y - et.h / 2, et.w, et.h); ctx.fillStyle = '#fff'; for (let g2 = 0; g2 < 3; g2++) ctx.fillRect(e.x + et.w / 3, e.y - et.h / 3 + g2 * (et.h / 3) - 2, et.w / 5, 3); }
    ctx.shadowBlur = 0;
  });

  // Boss
  if (g.boss) drawBossShape(ctx, g.boss, g.frame);

  // Particles
  g.effects.forEach(fx => { if (fx.kind !== 'px') return; ctx.globalAlpha = Math.max(0, fx.life / 34); ctx.fillStyle = fx.color; ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; });

  // Drones
  g.drones.forEach(d => { ctx.shadowColor = '#44ffaa'; ctx.shadowBlur = 10; ctx.fillStyle = '#44ffaa'; ctx.beginPath(); ctx.arc(d.x, d.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(d.x, d.y, 9, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0; });

  // Player ship
  const blink = g.invincible > 0 ? (Math.floor(g.frame / 4) % 2 === 0 ? 0.25 : 1) : 1;
  ctx.globalAlpha = blink;
  const tc = ['#00ffff', '#00eeff', '#aaffff'][g.boltTier - 1];
  ctx.shadowColor = tc; ctx.shadowBlur = 14; ctx.fillStyle = tc;
  ctx.beginPath(); ctx.moveTo(g.px + PW / 2, g.py); ctx.lineTo(g.px - PW / 2, g.py - PH / 2); ctx.lineTo(g.px - PW / 4, g.py); ctx.lineTo(g.px - PW / 2, g.py + PH / 2); ctx.closePath(); ctx.fill();
  if (g.boltTier >= 2) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.moveTo(g.px + PW / 4, g.py); ctx.lineTo(g.px - PW / 4, g.py - PH / 3); ctx.lineTo(g.px - PW / 4, g.py + PH / 3); ctx.closePath(); ctx.fill(); }
  if (g.boltTier >= 3) { ctx.fillStyle = '#aaffff'; [[-1], [1]].forEach(([s]) => { ctx.beginPath(); ctx.moveTo(g.px - PW / 2, g.py + s * PH / 2); ctx.lineTo(g.px - PW / 2 - 7, g.py + s * PH); ctx.lineTo(g.px - PW / 4, g.py + s * PH / 2); ctx.closePath(); ctx.fill(); }); }
  ctx.fillStyle = '#ff6600'; ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(g.px - PW / 2 + 2, g.py, 4, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;

  // HUD
  const fs = W > 300 ? 11 : 9;
  for (let i = 0; i < 3; i++) { ctx.globalAlpha = i < g.lives ? 1 : 0.2; ctx.fillStyle = '#00ffff'; ctx.font = `${fs + 1}px sans-serif`; ctx.textAlign = 'left'; ctx.fillText('♦', 5 + i * 14, 14); }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff'; ctx.font = `${fs}px monospace`; ctx.textAlign = 'right'; ctx.fillText(`${g.score}`, W - 5, 14);
  ctx.fillStyle = ['#00ffff', '#00eeff', '#aaffff'][g.boltTier - 1]; ctx.textAlign = 'left'; ctx.fillText(`BOLT ${g.boltTier}`, 5, H - 6);
  if (g.special !== 'bolt' && g.specialAmmo > 0) { const w = WEAPON_DEF[g.special]; ctx.fillStyle = w ? w.color : '#fff'; ctx.textAlign = 'center'; ctx.fillText(`${w ? w.name : g.special} ×${g.specialAmmo}`, W / 2, H - 6); }
  if (g.frozenFrames > 0) { ctx.fillStyle = '#88aaff'; ctx.textAlign = 'center'; ctx.fillText('EMP ACTIVE', W / 2, 14); }
  ctx.textAlign = 'left';

  // Boss HP bar
  if (g.boss) {
    const bw = W - 20, bh2 = 7, bx2 = 10, by = 22;
    const pct = Math.max(0, g.boss.hp / g.boss.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx2 - 2, by - 2, bw + 4, bh2 + 4);
    ctx.fillStyle = '#222'; ctx.fillRect(bx2, by, bw, bh2);
    ctx.fillStyle = pct > 0.5 ? '#ff4444' : pct > 0.25 ? '#ff8800' : '#ffff00'; ctx.fillRect(bx2, by, bw * pct, bh2);
    ctx.fillStyle = '#fff'; ctx.font = `${fs}px monospace`; ctx.textAlign = 'center'; ctx.fillText(g.boss.name, W / 2, by - 3); ctx.textAlign = 'left';
  }

  // Game over
  if (g.over) {
    ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(0, 0, W, H);
    ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 22; ctx.fillStyle = '#ff4444'; ctx.font = `bold ${W > 300 ? 26 : 18}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('GAME OVER', W / 2, H / 2 - 18);
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.font = `${W > 300 ? 12 : 10}px monospace`;
    ctx.fillText(`Score: ${g.score}`, W / 2, H / 2 + 6); ctx.fillText('Tap or SPACE to restart', W / 2, H / 2 + 24); ctx.textBaseline = 'alphabetic';
  }
}

// ── Web Audio synthesised sounds ─────────────────────────────────────────────
// All synthesis is inline — no external audio files needed.
function playGameSound(type, ctxRef) {
  try {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;

    if (type === 'shoot') {
      // Short laser "pew": sawtooth sweep 900→200 Hz
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.055);
      g.gain.setValueAtTime(0.14, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      osc.start(now); osc.stop(now + 0.06);

    } else if (type === 'explode') {
      // Small noise burst: enemy death
      const len = Math.round(ctx.sampleRate * 0.12);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      src.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.2, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      src.start(now); src.stop(now + 0.13);

    } else if (type === 'hit') {
      // Heavy bass rumble + noise burst: player is hit
      const osc = ctx.createOscillator();
      const gOsc = ctx.createGain();
      osc.connect(gOsc); gOsc.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.22);
      gOsc.gain.setValueAtTime(0.45, now);
      gOsc.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now); osc.stop(now + 0.23);

      const len = Math.round(ctx.sampleRate * 0.2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gN = ctx.createGain();
      src.connect(gN); gN.connect(ctx.destination);
      gN.gain.setValueAtTime(0.4, now);
      gN.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      src.start(now); src.stop(now + 0.21);
    }
  } catch (_) {
    // AudioContext not available (e.g. SSR or locked down browser)
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
// Arcade: single-player only (minPlayers/maxPlayers both 1 in GameLobbyModal,
// space_attack is in the backend's arcadeGameTypes — see game_manager.go).
// Non-host room members see a placeholder below (mirrors FowlPlayGame's
// established pattern) instead of independently running their own copy of
// the game — there is no shared game state or netcode here at all, so two
// simultaneously-playable instances would just be two disconnected games
// that happen to share a GameSession id, and ending one would never affect
// the other. All hooks below stay unconditional regardless of isHost (Rules
// of Hooks) — they simply never find their target DOM nodes and stay inert
// when the placeholder branch renders instead of the canvas.
export default function SpaceAttackGame({ onClose, onEndGame, isHost = true }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const rafRef = useRef(null);
  const gsRef = useRef(null);
  const keysRef = useRef({});
  const touchRef = useRef({ y: null, firing: false });
  const dimsRef = useRef({ W: 400, H: 240 });
  const audioCtxRef = useRef(null);
  const [dims, setDims] = useState({ W: 400, H: 240 });

  useEffect(() => { gsRef.current = mkGame(400, 240); }, []);

  // Responsive sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      const portrait = height > width;
      const W = Math.round(width);
      const H = Math.max(180, Math.round(height - 70));
      dimsRef.current = { W, H };
      setDims({ W, H });
      const c = canvasRef.current;
      if (c) { c.width = W; c.height = H; }
      if (gsRef.current) gsRef.current.py = H / 2;
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Keyboard
  useEffect(() => {
    const dn = e => { keysRef.current[e.code] = true; };
    const up = e => { keysRef.current[e.code] = false; };
    const kp = e => {
      if (e.code !== 'Space') return; e.preventDefault();
      const g = gsRef.current; if (!g) return;
      if (!g.started) { g.started = true; return; }
      if (g.over) { gsRef.current = mkGame(dimsRef.current.W, dimsRef.current.H); gsRef.current.started = true; }
    };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    window.addEventListener('keydown', kp);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); window.removeEventListener('keydown', kp); };
  }, []);

  // RAF loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function loop() {
      rafRef.current = requestAnimationFrame(loop);
      const g = gsRef.current; if (!g) return;
      const { W, H } = dimsRef.current;
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      updateGame(g, W, H, keysRef.current, touchRef.current.y, touchRef.current.firing);
      // Drain sound events queued by game logic — deduplicated so rapid multi-kills
      // don't stack dozens of AudioNodes in a single frame.
      if (g.sounds.length) {
        const seen = new Set();
        g.sounds.splice(0).forEach(s => { if (!seen.has(s)) { seen.add(s); playGameSound(s, audioCtxRef); } });
      }
      drawGame(canvas.getContext('2d'), g, W, H);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Touch
  const onTouchStart = useCallback(e => {
    e.preventDefault();
    const touch = e.touches[0], c = canvasRef.current; if (!c) return;
    const rect = c.getBoundingClientRect(), { H } = dimsRef.current;
    touchRef.current.y = (touch.clientY - rect.top) * (H / rect.height);
    touchRef.current.firing = true;
    const g = gsRef.current; if (!g) return;
    if (!g.started) { g.started = true; return; }
    if (g.over) { gsRef.current = mkGame(dimsRef.current.W, dimsRef.current.H); gsRef.current.started = true; }
  }, []);
  const onTouchMove = useCallback(e => {
    e.preventDefault();
    const touch = e.touches[0], c = canvasRef.current; if (!c) return;
    const rect = c.getBoundingClientRect(), { H } = dimsRef.current;
    touchRef.current.y = (touch.clientY - rect.top) * (H / rect.height);
  }, []);
  const onTouchEnd = useCallback(e => { e.preventDefault(); touchRef.current.y = null; touchRef.current.firing = false; }, []);

  const onPointerDown = useCallback(() => {
    const g = gsRef.current; if (!g) return;
    if (!g.started) { g.started = true; return; }
    if (g.over) { gsRef.current = mkGame(dimsRef.current.W, dimsRef.current.H); gsRef.current.started = true; }
  }, []);

  // Non-host: spectator placeholder only — no canvas, no RAF loop, no
  // simulation of any kind runs for this client. Ending the game is a
  // host-only action (the header "End" button below); Close here just
  // leaves this viewer's own overlay, matching FowlPlayGame's precedent.
  if (!isHost) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">🚀</span>
        <p className="text-lg font-semibold">Someone's playing Space Attack!</p>
        <p className="text-sm text-gray-400">Sit back and cheer them on.</p>
        <button
          onClick={onClose}
          className="mt-2 px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black select-none">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold tracking-widest text-cyan-400">SPACE  ATTACK</h2>
          <GameRulesButton gameType="space_attack" className="text-gray-500" />
        </div>
        <div className="flex gap-2">
          {onEndGame && <button onClick={() => { onEndGame?.(); onClose?.(); }} className="px-2 py-1 text-xs bg-red-700 hover:bg-red-800 rounded font-medium">End</button>}
          <button onClick={onClose} className="px-2 py-1 text-xs bg-white/20 hover:bg-white/30 rounded">✕</button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 flex items-center justify-center overflow-hidden bg-black">
        <canvas
          ref={canvasRef}
          width={dims.W}
          height={dims.H}
          style={{ maxWidth: '100%', maxHeight: '100%', touchAction: 'none' }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onPointerDown={onPointerDown}
        />
      </div>

      <div className="shrink-0 text-center py-1 bg-gray-900 border-t border-gray-800">
        <p className="text-xs text-gray-600">↑ ↓ move · SPACE fire · collect glowing pickups for weapons</p>
      </div>
    </div>
  );
}
