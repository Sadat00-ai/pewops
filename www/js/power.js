// power.js - Power Surge, power cores, shield, dash and the ring effects that go with them.

const BASE_RADIUS = 14;          // the soldier's normal hitbox radius
const HIT_IFRAMES = 0.5;         // seconds of invulnerability after being hit

const SURGE = {
  full: 100,                     // meter needed
  baseTime: 12,                  // seconds a Surge lasts
  maxTime: 16,                   // kills extend it, up to this
  killTime: 0.6,                 // seconds added per kill while surging
  maxScale: 1.4,                 // how big the soldier is drawn
  maxRadius: 1.25,               // the hitbox grows less than the picture, so it stays fair
  growTime: 0.6,
  shrinkTime: 0.5,
  damage: 1.5,
  fireRate: 1.2,
  taken: 0.7,                    // damage taken multiplier
  speed: 1.1
};

const DASH = { time: 0.18, speed: 640, cooldown: 2.0, invuln: 0.3 };

const METER_GAIN = { basic: 8, fast: 8, sniper: 12, heavy: 15, boss: 40, dummy: 0 };
const COIN_VALUE = { basic: 2, fast: 3, sniper: 5, heavy: 6, boss: 60, dummy: 0 };

const CORE_TYPES = {
  damage: { name: "DAMAGE", color: "#ff6a4d", letter: "D" },
  speed:  { name: "SPEED",  color: "#5cc8ff", letter: "S" },
  shield: { name: "SHIELD", color: "#8ff3ff", letter: "+" },
  magnet: { name: "MAGNET", color: "#c58bff", letter: "M" },
  surge:  { name: "SURGE",  color: "#ffd34d", letter: "P" }
};
const CORE_KEYS = Object.keys(CORE_TYPES);


/* ---------- Power Surge ---------- */

function surgeActive() { return !!(G && G.player.surge.active); }

function damageMult() {
  let m = 1 + 0.15 * G.mods.dmg;
  if (G.player.surge.active) m *= SURGE.damage;
  return m;
}
function fireMult() { return G.player.surge.active ? SURGE.fireRate : 1; }
function speedMult() {
  let m = 1 + 0.08 * G.mods.spd;
  if (G.player.surge.active) m *= SURGE.speed;
  return m;
}
function takenMult() { return G.player.surge.active ? SURGE.taken : 1; }

// kills fill the meter; while surging they add time instead
function addMeter(base) {
  const p = G.player;
  const s = p.surge;
  if (s.active) {
    s.t = Math.min(SURGE.maxTime, s.t + SURGE.killTime);
    return;
  }
  let gain = base * (1 + 0.1 * save.upgrades.charge);
  if (p.hp / p.maxHp <= 0.3) gain *= 2;           // low health charges the meter twice as fast
  s.meter = Math.min(SURGE.full, s.meter + gain);
  s.gainFlash = 0.25;
}

function activateSurge() {
  if (!G || state !== "playing") return false;
  const p = G.player;
  const s = p.surge;
  if (p.dead || s.active || s.meter < SURGE.full) return false;

  s.active = true;
  s.meter = 0;
  s.t = SURGE.baseTime;
  s.tickT = 0;
  s.readyShown = false;
  G.runStats.surges++;
  Progress.event("surges", 1);

  addRing(p.x, p.y, "#ffd34d", 170, 0.6);
  addRing(p.x, p.y, "#ffffff", 105, 0.4);
  shockwave(p.x, p.y, 150, 25);
  spark(p.x, p.y, "#ffd34d", 24, 300);
  G.slow = { t: 0.28, scale: 0.35 };              // a quick slow-motion beat
  G.pulse = 0.5;
  addShake(10);
  showBanner("POWER SURGE", 1.4);
  Sound.play("surgeUp");
  Sound.setSurge(true);
  Haptics.buzz([20, 30, 60]);
  return true;
}

function endSurge(silent) {
  const p = G.player;
  const s = p.surge;
  if (!s.active) return;
  s.active = false;
  s.t = 0;
  Sound.setSurge(false);
  if (!silent) {
    addRing(p.x, p.y, "#ffd34d", 90, 0.5);
    Sound.play("surgeDown");
  }
}

// fatal damage with a full meter: the Surge fires on its own and the soldier survives
function tryLastStand() {
  const p = G.player;
  const s = p.surge;
  if (s.active || s.meter < SURGE.full) return false;
  p.hp = Math.ceil(p.maxHp * 0.35);
  p.invuln = 1.2;
  G.runStats.lastStands++;
  save.stats.lastStands++;
  activateSurge();
  showBanner("LAST STAND!", 1.8);
  Progress.check();
  return true;
}

function updateSurge(dt) {
  const p = G.player;
  const s = p.surge;
  if (s.active) {
    s.t -= dt;
    s.grow = Math.min(1, s.grow + dt / SURGE.growTime);
    if (s.t <= 3 && s.t > 0) {
      s.tickT -= dt;
      if (s.tickT <= 0) { s.tickT += 1; Sound.play("tick"); }
    }
    if (s.t <= 0) endSurge(false);
  } else if (s.grow > 0) {
    s.grow = Math.max(0, s.grow - dt / SURGE.shrinkTime);
  }
  s.scaleP = s.active ? Ease.outBack(s.grow) : Ease.inOutQuad(s.grow);
  s.gainFlash = Math.max(0, s.gainFlash - dt);
  s.pulse += dt;
  applyPlayerSize();

  if (!s.active && s.meter >= SURGE.full) {
    if (!s.readyShown) {
      s.readyShown = true;
      Sound.play("ready");
      Haptics.buzz(20);
    }
  } else if (s.meter < SURGE.full) {
    s.readyShown = false;
  }
}

// the picture grows more than the hitbox; growing into a wall slides the soldier clear first
function applyPlayerSize() {
  const p = G.player;
  p.scale = 1 + (SURGE.maxScale - 1) * p.surge.scaleP;
  const f = 1 + (SURGE.maxRadius - 1) * Ease.clamp01(p.surge.scaleP);
  const want = BASE_RADIUS * f;
  if (Math.abs(want - p.r) < 0.01) return;
  if (want <= p.r) { p.r = want; return; }
  if (!hitsWalls(p.x, p.y, want)) { p.r = want; return; }
  for (let d = 2; d <= 24; d += 2) {
    for (let a = 0; a < 8; a++) {
      const nx = p.x + Math.cos(a * Math.PI / 4) * d;
      const ny = p.y + Math.sin(a * Math.PI / 4) * d;
      if (!hitsWalls(nx, ny, want)) { p.x = nx; p.y = ny; p.r = want; return; }
    }
  }
  // no room right now: keep the smaller hitbox and try again next frame
}

// damages and pushes back nearby enemies and wipes enemy bullets
function shockwave(x, y, radius, dmg) {
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < radius + e.r) {
      hurtEnemy(e, dmg);
      if (!e.dead && e.key !== "boss") {
        const push = 50 * (1 - d / (radius + e.r));
        for (let i = 0; i < 3; i++) moveEntity(e, dx / d * push / 3, dy / d * push / 3);
      }
    }
  }
  for (const b of G.bullets) {
    if (!b.friendly && Math.hypot(b.x - x, b.y - y) < radius) {
      spark(b.x, b.y, "#ffd34d", 2, 80);
      b.life = 0;
    }
  }
}


/* ---------- Shield ---------- */

function addShield(n) {
  const p = G.player;
  p.shield = Math.min(p.maxShield, p.shield + n);
}


/* ---------- Dash ---------- */

function tryDash() {
  if (!G || state !== "playing") return false;
  const p = G.player;
  if (p.dead || p.dashCd > 0 || p.dashT > 0) return false;

  const mv = moveInput();
  let dx;
  let dy;
  if (mv.x !== 0 || mv.y !== 0) {
    const len = Math.hypot(mv.x, mv.y);
    dx = mv.x / len;
    dy = mv.y / len;
  } else {
    dx = Math.cos(p.angle);
    dy = Math.sin(p.angle);
  }
  p.dashT = DASH.time;
  p.dashCd = DASH.cooldown;
  p.dashX = dx;
  p.dashY = dy;
  p.invuln = Math.max(p.invuln, DASH.invuln);
  G.runStats.dashes++;
  Progress.event("dashes", 1);
  Sound.play("dash");
  Haptics.buzz(12);
  return true;
}

function addGhost(p) {
  if (G.ghosts.length >= 14) G.ghosts.shift();
  G.ghosts.push({ x: p.x, y: p.y, r: BASE_RADIUS * p.scale, life: 0.24, max: 0.24 });
}


/* ---------- Power cores ---------- */

function randomOpenSpot() {
  const p = G.player;
  for (let tries = 0; tries < 40; tries++) {
    const x = 70 + Math.random() * (W - 140);
    const y = 110 + Math.random() * (H - 200);
    if (!hitsWalls(x, y, 20) && Math.hypot(x - p.x, y - p.y) > 90) return [x, y];
  }
  return null;
}

function randomCoreType() {
  return CORE_KEYS[Math.floor(Math.random() * CORE_KEYS.length)];
}

function spawnCore(x, y, type, life) {
  G.cores.push({ x: x, y: y, type: type, life: life || 14, t: Math.random() * 6 });
}

function applyCore(type) {
  const p = G.player;
  let line = CORE_TYPES[type].name + " CORE";
  if (type === "damage") {
    G.mods.dmg = Math.min(3, G.mods.dmg + 1);
    line += "  LV" + G.mods.dmg;
  } else if (type === "speed") {
    G.mods.spd = Math.min(3, G.mods.spd + 1);
    line += "  LV" + G.mods.spd;
  } else if (type === "shield") {
    addShield(40);
    line += "  +40";
  } else if (type === "magnet") {
    G.mods.magnetT = 10;
    line += "  10s";
  } else if (type === "surge") {
    if (p.surge.active) p.surge.t = Math.min(SURGE.maxTime, p.surge.t + 3);
    else p.surge.meter = Math.min(SURGE.full, p.surge.meter + 35);
    line += "  +35";
  }
  G.runStats.cores++;
  G.coreMsg = { text: line, color: CORE_TYPES[type].color, t: 1.6 };
  addRing(p.x, p.y, CORE_TYPES[type].color, 60, 0.4);
  Sound.play("core");
  Haptics.buzz(14);
  Progress.event("cores", 1);
}

function updateCores(dt) {
  const p = G.player;
  G.coreTimer -= dt;
  if (G.coreTimer <= 0) {
    G.coreTimer = (16 + Math.random() * 8) / (1 + 0.2 * save.upgrades.cores);
    if (G.cores.length < 2 && !G.finishing) {
      const spot = randomOpenSpot();
      if (spot) spawnCore(spot[0], spot[1], randomCoreType(), 14);
    }
  }
  G.mods.magnetT = Math.max(0, G.mods.magnetT - dt);
  if (G.coreMsg) {
    G.coreMsg.t -= dt;
    if (G.coreMsg.t <= 0) G.coreMsg = null;
  }

  let keep = 0;
  for (const c of G.cores) {
    c.life -= dt;
    c.t += dt;
    let taken = false;
    if (!p.dead) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (G.mods.magnetT > 0 && d < 300 && d > 1) {
        const s = Math.min(380 * dt, d);
        c.x += (p.x - c.x) / d * s;
        c.y += (p.y - c.y) / d * s;
      }
      if (Math.hypot(c.x - p.x, c.y - p.y) < p.r + 16) {
        taken = true;
        applyCore(c.type);
      }
    }
    if (!taken && c.life > 0) G.cores[keep++] = c;
  }
  G.cores.length = keep;
}


/* ---------- Rings (shockwaves, pickups, phase changes) ---------- */

function addRing(x, y, color, maxR, life) {
  if (G.rings.length >= 12) G.rings.shift();
  G.rings.push({ x: x, y: y, color: color, maxR: maxR, life: life, t: 0 });
}

function updateRings(dt) {
  let keep = 0;
  for (const r of G.rings) {
    r.t += dt;
    if (r.t < r.life) G.rings[keep++] = r;
  }
  G.rings.length = keep;
}
