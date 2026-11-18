// game.js - the playing part: state, update loop, collisions, enemies, drawing.

const W = 960;
const H = 600;
const MAX_ALIVE = 10;        // enemies on screen at once
const PLAYER_SPEED = 220;

// Older Android WebViews have no CanvasRenderingContext2D.roundRect, so add a small fallback.
if (window.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(typeof r === "number" ? r : 0, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}

const ENEMY_TYPES = {
  basic:  { hp: 60,   speed: 85,  r: 13, color: "#b86b54", range: 320, stop: 200, rate: 1.4, dmg: 8,  bulletSpeed: 380, spread: 0.14, score: 100 },
  fast:   { hp: 40,   speed: 170, r: 11, color: "#d7a24f", range: 190, stop: 110, rate: 0.7, dmg: 6,  bulletSpeed: 420, spread: 0.2,  score: 150, strafe: true },
  heavy:  { hp: 240,  speed: 55,  r: 18, color: "#78534e", range: 280, stop: 180, rate: 1.1, dmg: 14, bulletSpeed: 340, spread: 0.1,  score: 300 },
  sniper: { hp: 50,   speed: 60,  r: 12, color: "#6686a0", range: 620, keep: 420, rate: 2.4, dmg: 26, bulletSpeed: 900, spread: 0.02, score: 250 },
  boss:   { hp: 1500, speed: 65,  r: 28, color: "#984438", range: 800, stop: 260, rate: 1.6, dmg: 12, bulletSpeed: 360, spread: 0.05, score: 2000 },
  dummy:  { hp: 100,  speed: 0,   r: 14, color: "#a9aa79", range: 0,   stop: 0,   rate: 99,  dmg: 0,  bulletSpeed: 0,   spread: 0,    score: 0 }
};

const PLAYER_UNIFORMS = {
  scout:   { body: "#718f4d", helmet: "#536a38" },
  desert:  { body: "#ad8855", helmet: "#7a623e" },
  navy:    { body: "#55788c", helmet: "#345566" },
  crimson: { body: "#996153", helmet: "#684238" }
};

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
canvas.width = W;
canvas.height = H;

// Render at the canvas' real display resolution so HUD text and edges stay sharp.
// The game world remains 960 x 600; only the backing bitmap scales with the screen.
function resizeGameCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.round(rect.width * pixelRatio));
  const pixelHeight = Math.max(1, Math.round(rect.height * pixelRatio));

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
}

window.addEventListener("resize", resizeGameCanvas);
if (window.ResizeObserver) {
  const canvasSizeObserver = new ResizeObserver(resizeGameCanvas);
  canvasSizeObserver.observe(canvas);
}
resizeGameCanvas();

const keys = {};
const mouse = { x: W / 2, y: H / 2, down: false };

let G = null;            // the current run (null while on the menus)
let state = "menu";      // menu | playing | paused | levelcomplete | victory | gameover
let lastTime = 0;


/* ---------- Starting and ending a run ---------- */

function startGame(mode, levelIndex) {
  const mapIndex = mode === "campaign" ? levelIndex
    : mode === "training" ? 0
    : Math.floor(Math.random() * LEVELS.length);
  const map = LEVELS[mapIndex];

  G = {
    mode: mode, level: mapIndex, map: map, bg: buildBackground(map),
    player: { x: 480, y: 540, r: 14, hp: 100, maxHp: 100, angle: -Math.PI / 2, weapon: 0,
              cooldown: 0, reload: 0, grenades: 3, invuln: 0, walk: 0, dead: false, respawn: 0 },
    ammo: WEAPONS.map(function (w) { return { mag: w.mag, reserve: w.reserve }; }),
    enemies: [], bullets: [], particles: [], pickups: [], grenades: [], dying: [],
    score: 0, kills: 0, lives: 3, time: 0, timeLeft: 90,
    wave: 0, queue: [], spawnTimer: 0, breakTimer: 1.5, dummyTimer: 0,
    combo: 0, comboTimer: 0,
    shake: 0, shakeX: 0, shakeY: 0, flash: 0, hurt: 0, banner: null,
    finishing: false, endKind: "", endTimer: 0
  };

  const start = weaponIndex(save.startWeapon);
  G.player.weapon = start >= 0 && weaponAvailable(start) ? start : 0;

  state = "playing";
  canvas.classList.add("playing");
  UI.show(null);
  Sound.init();
  Sound.startMusic();
  if (mode === "training") showBanner("TRAINING RANGE", 2);
}

function weaponAvailable(i) {
  return G.mode === "training" || save.unlockedWeapons.indexOf(WEAPONS[i].id) !== -1;
}

function setState(next) {
  state = next;
  mouse.down = false;
  canvas.classList.toggle("playing", next === "playing");
}

function pauseGame() {
  if (state !== "playing") return;
  setState("paused");
  Sound.stopMusic();
  UI.show("pause");
}

function resumeGame() {
  if (state !== "paused") return;
  setState("playing");
  Sound.init();            // wakes the audio engine if Android suspended it in the background
  Sound.startMusic();
  UI.show(null);
}

function quitToMenu() {
  setState("menu");
  Sound.stopMusic();
  G = null;
  UI.show("menu");
}

// begin the short delay before the result screen appears
function finish(kind) {
  if (G.finishing) return;
  G.finishing = true;
  G.endKind = kind;
  G.endTimer = 1.3;
}

function showResult() {
  Sound.stopMusic();
  const kind = G.endKind;
  const stats = ["Score: " + Math.floor(G.score), "Kills: " + G.kills];
  const retry = { label: "Retry", run: function () { startGame(G.mode, G.level); } };
  const menu = { label: "Main menu", run: quitToMenu };

  if (kind === "levelcomplete") {
    const n = G.level + 1;                       // missions finished so far
    G.score += 500 + G.lives * 250;
    stats[0] = "Score: " + Math.floor(G.score) + " (includes mission bonus)";
    const firstClear = n + 1 > save.unlockedLevel || (n === LEVELS.length && !save.finalCleared);
    if (n + 1 > save.unlockedLevel) save.unlockedLevel = Math.min(LEVELS.length, n + 1);
    if (n === LEVELS.length) save.finalCleared = true;
    for (const id in WEAPON_UNLOCKS) {
      if (n >= WEAPON_UNLOCKS[id] && save.unlockedWeapons.indexOf(id) === -1) {
        save.unlockedWeapons.push(id);
        stats.push("New weapon unlocked: " + WEAPONS[weaponIndex(id)].name);
      }
    }
    addScore("Campaign", Math.floor(G.score), G.kills, firstClear);
    const last = G.level >= LEVELS.length - 1;
    setState(last ? "victory" : "levelcomplete");
    const actions = last ? [menu] : [{ label: "Next mission", run: function () { startGame("campaign", G.level + 1); } }, menu];
    UI.showEnd(last ? "Campaign complete" : "Mission complete", stats, actions);
    return;
  }

  const labels = { campaign: "Campaign", survival: "Survival", timeattack: "Time Attack" };
  if (G.mode === "survival") stats.push("Waves reached: " + G.wave, "Time survived: " + formatTime(G.time));
  addScore(labels[G.mode] || "Run", Math.floor(G.score), G.kills);
  setState("gameover");
  UI.showEnd(kind === "timeup" ? "Time up" : "Game over", stats, [retry, menu]);
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

function showBanner(text, seconds) {
  G.banner = { text: text, t: seconds, max: seconds };
}


/* ---------- Collision helpers ---------- */

function circleHitsRect(x, y, r, rect) {
  const nx = Math.max(rect[0], Math.min(x, rect[0] + rect[2]));
  const ny = Math.max(rect[1], Math.min(y, rect[1] + rect[3]));
  const dx = x - nx;
  const dy = y - ny;
  return dx * dx + dy * dy < r * r;
}

function hitsWalls(x, y, r) {
  if (x < r || y < r || x > W - r || y > H - r) return true;
  for (const wall of G.map.walls) {
    if (circleHitsRect(x, y, r, wall)) return true;
  }
  return false;
}

function pointInWall(x, y) {
  for (const w of G.map.walls) {
    if (x > w[0] && x < w[0] + w[2] && y > w[1] && y < w[1] + w[3]) return true;
  }
  return false;
}

// moves one axis at a time so things slide along walls. Returns true if it moved at all.
function moveEntity(e, dx, dy) {
  let moved = false;
  if (!hitsWalls(e.x + dx, e.y, e.r)) { e.x += dx; moved = true; }
  if (!hitsWalls(e.x, e.y + dy, e.r)) { e.y += dy; moved = true; }
  return moved;
}

// true if nothing solid is between the two points
function lineClear(x1, y1, x2, y2) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 10);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (pointInWall(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
  }
  return true;
}


/* ---------- Effects ---------- */

function spark(x, y, color, count, speed) {
  for (let i = 0; i < count && G.particles.length < 500; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.3 + Math.random() * 0.7);
    const life = 0.2 + Math.random() * 0.3;
    G.particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life, max: life, size: 1.5 + Math.random() * 2, color: color });
  }
}

function addShake(amount) {
  G.shake = Math.max(G.shake, amount);
}

function addBullet(x, y, angle, speed, dmg, friendly, life, color) {
  G.bullets.push({ x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, dmg: dmg, friendly: friendly, life: life, color: color });
}


/* ---------- Player ---------- */

function updatePlayer(dt) {
  const p = G.player;

  if (p.dead) {
    p.respawn -= dt;
    if (p.respawn <= 0 && G.lives > 0) respawnPlayer();
    return;
  }

  const ax = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const ay = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (ax || ay) {
    const len = Math.hypot(ax, ay);
    moveEntity(p, ax / len * PLAYER_SPEED * dt, ay / len * PLAYER_SPEED * dt);
    p.walk += dt * 10;
  } else if (Touch.moveMag > 0) {
    // analog movement from the on-screen stick
    moveEntity(p, Touch.moveX * Touch.moveMag * PLAYER_SPEED * dt, Touch.moveY * Touch.moveMag * PLAYER_SPEED * dt);
    p.walk += dt * 10;
  }

  if (Touch.enabled) {
    // the aim stick sets the facing direction; the aim point sits ahead of the soldier
    p.angle = Touch.aimAngle;
    mouse.x = Math.max(0, Math.min(W, p.x + Math.cos(p.angle) * 170));
    mouse.y = Math.max(0, Math.min(H, p.y + Math.sin(p.angle) * 170));
  } else {
    p.angle = Math.atan2(mouse.y - p.y, mouse.x - p.x);
  }
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.invuln = Math.max(0, p.invuln - dt);

  if (p.reload > 0) {
    p.reload -= dt;
    if (p.reload <= 0) finishReload();
  }
  if (mouse.down || Touch.firing) shoot();
}

function shoot() {
  const p = G.player;
  const w = WEAPONS[p.weapon];
  const a = G.ammo[p.weapon];
  if (p.cooldown > 0 || p.reload > 0) return;

  if (a.mag <= 0) {
    p.cooldown = 0.3;
    startReload();
    return;
  }

  a.mag--;
  p.cooldown = w.rate;
  const mx = p.x + Math.cos(p.angle) * (p.r + w.len);
  const my = p.y + Math.sin(p.angle) * (p.r + w.len);
  for (let i = 0; i < w.pellets; i++) {
    const angle = p.angle + (Math.random() - 0.5) * w.spread * 2;
    addBullet(mx, my, angle, w.speed, w.damage, true, 1.4, "#ffe9a0");
  }
  G.flash = 0.06;
  spark(mx, my, "#ffd27a", 5, 160);
  addShake(w.shake);
  Sound.play(w.id);
  if (a.mag === 0) startReload();
}

function startReload() {
  const p = G.player;
  const w = WEAPONS[p.weapon];
  const a = G.ammo[p.weapon];
  if (p.reload > 0 || a.mag === w.mag) return;
  if (G.mode !== "training" && a.reserve <= 0) {
    Sound.play("empty");
    return;
  }
  p.reload = w.reload;
  Sound.play("reload");
}

function finishReload() {
  const w = WEAPONS[G.player.weapon];
  const a = G.ammo[G.player.weapon];
  const need = w.mag - a.mag;
  const take = G.mode === "training" ? need : Math.min(need, a.reserve);
  a.mag += take;
  if (G.mode !== "training") a.reserve -= take;
}

function switchWeapon(i) {
  const p = G.player;
  if (p.dead || i === p.weapon || !weaponAvailable(i)) return;
  p.weapon = i;
  p.reload = 0;
  p.cooldown = 0.15;
  Sound.play("switch");
}

// touch button: jump to the next weapon that is unlocked
function cycleWeapon() {
  if (!G || G.player.dead) return;
  for (let step = 1; step <= WEAPONS.length; step++) {
    const i = (G.player.weapon + step) % WEAPONS.length;
    if (weaponAvailable(i)) { switchWeapon(i); return; }
  }
}

function throwGrenade() {
  const p = G.player;
  if (p.dead || p.grenades <= 0) return;
  p.grenades--;
  const dist = Math.min(320, Math.hypot(mouse.x - p.x, mouse.y - p.y));
  G.grenades.push({ x: p.x, y: p.y, r: 4, vx: Math.cos(p.angle) * dist * 1.6, vy: Math.sin(p.angle) * dist * 1.6, fuse: 1.1 });
  Sound.play("throw");
}

function hurtPlayer(dmg) {
  const p = G.player;
  if (p.dead || p.invuln > 0 || G.mode === "training" || G.finishing) return;
  p.hp -= dmg;
  G.hurt = 0.35;
  addShake(6);
  Sound.play("hurt");
  if (p.hp <= 0) killPlayer();
}

function killPlayer() {
  const p = G.player;
  p.dead = true;
  p.hp = 0;
  G.lives--;
  spark(p.x, p.y, "#7aa05a", 25, 220);
  Sound.play("die");
  if (G.lives <= 0) finish("gameover");
  else p.respawn = 1.5;
}

function respawnPlayer() {
  const p = G.player;
  p.dead = false;
  p.hp = p.maxHp;
  p.x = 480;
  p.y = 540;
  p.invuln = 2.5;
  showBanner("RESPAWNED", 1.2);
}


/* ---------- Enemies and waves ---------- */

function spawnEnemy(key) {
  const type = ENEMY_TYPES[key];
  const p = G.player;
  let pos = null;

  if (key === "dummy") {
    for (let tries = 0; tries < 30 && !pos; tries++) {
      const x = 60 + Math.random() * (W - 120);
      const y = 60 + Math.random() * (H - 200);
      if (!hitsWalls(x, y, type.r + 6) && Math.hypot(x - p.x, y - p.y) > 150) pos = [x, y];
    }
    if (!pos) return;
  } else {
    const far = CORNERS.filter(function (c) { return Math.hypot(c[0] - p.x, c[1] - p.y) > 250; });
    const list = far.length ? far : CORNERS;
    pos = list[Math.floor(Math.random() * list.length)];
  }

  // enemies get tougher as levels or waves go up
  const scale = G.mode === "campaign" ? 1 + 0.1 * G.level : 1 + 0.07 * Math.max(0, G.wave - 1);
  const hp = key === "dummy" ? type.hp : type.hp * scale;
  G.enemies.push({
    key: key, type: type, x: pos[0], y: pos[1], r: type.r,
    hp: hp, maxHp: hp, dmgScale: 1 + (scale - 1) * 0.5,
    cool: 0.6 + Math.random() * type.rate, angle: 0, flash: 0,
    side: Math.random() < 0.5 ? 1 : -1, pattern: 0, dead: false
  });
}

function expandWave(spec) {
  const list = [];
  for (const key in spec) {
    for (let i = 0; i < spec[key]; i++) list.push(key);
  }
  for (let i = list.length - 1; i > 0; i--) {     // shuffle
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
  }
  return list;
}

function startWave() {
  const spec = G.mode === "campaign" ? G.map.waves[G.wave] : survivalWave(G.wave + 1);
  G.wave++;
  G.queue = expandWave(spec);
  showBanner("WAVE " + G.wave, 1.6);
}

function updateSpawns(dt) {
  if (G.finishing) return;

  if (G.mode === "training") {
    G.dummyTimer -= dt;
    if (G.enemies.length < 4 && G.dummyTimer <= 0) {
      spawnEnemy("dummy");
      G.dummyTimer = 0.8;
    }
    return;
  }

  if (G.mode === "timeattack") {
    G.spawnTimer -= dt;
    if (G.enemies.length < 7 && G.spawnTimer <= 0) {
      const r = Math.random();
      const hard = G.time > 25;
      spawnEnemy(hard && r > 0.8 ? "heavy" : hard && r > 0.6 ? "sniper" : r > 0.5 ? "fast" : "basic");
      G.spawnTimer = 0.8;
    }
    return;
  }

  if (G.breakTimer > 0) {
    G.breakTimer -= dt;
    if (G.breakTimer <= 0) startWave();
    return;
  }

  G.spawnTimer -= dt;
  if (G.queue.length && G.enemies.length < MAX_ALIVE && G.spawnTimer <= 0) {
    spawnEnemy(G.queue.pop());
    G.spawnTimer = 0.7;
  }

  if (!G.queue.length && G.enemies.length === 0) {
    if (G.mode === "campaign" && G.wave >= G.map.waves.length) {
      finish("levelcomplete");
    } else {
      G.breakTimer = 2.5;
      showBanner("WAVE CLEARED", 2);
    }
  }
}

function updateEnemy(e, dt) {
  if (e.key === "dummy") return;
  const t = e.type;
  const p = G.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  e.angle = Math.atan2(dy, dx);
  e.flash = Math.max(0, e.flash - dt);

  const seen = !p.dead && lineClear(e.x, e.y, p.x, p.y);
  let dir = 0;                                   // 1 = toward the player, -1 = away
  if (t.keep) {
    if (dist < t.keep * 0.7) dir = -1;
    else if (dist > t.keep || !seen) dir = 1;
  } else if (dist > t.stop || !seen) {
    dir = 1;
  }
  if (p.dead) dir = 0;

  const px = -dy / dist;                         // sideways direction
  const py = dx / dist;
  if (dir !== 0) {
    const step = t.speed * dt;
    const moved = moveEntity(e, dx / dist * step * dir, dy / dist * step * dir);
    if (!seen) moveEntity(e, px * step * 0.6 * e.side, py * step * 0.6 * e.side);   // walk around cover
    if (!moved) e.side = -e.side;
  } else if (t.strafe && seen) {
    moveEntity(e, px * t.speed * 0.6 * dt * e.side, py * t.speed * 0.6 * dt * e.side);
  }

  e.cool -= dt;
  if (seen && dist <= t.range && e.cool <= 0) {
    enemyFire(e);
    e.cool = t.rate * (0.8 + Math.random() * 0.4);
  }
}

function enemyFire(e) {
  const t = e.type;
  const dmg = t.dmg * e.dmgScale;
  const mx = e.x + Math.cos(e.angle) * e.r;
  const my = e.y + Math.sin(e.angle) * e.r;

  if (e.key === "boss") {
    e.pattern = 1 - e.pattern;                   // alternate between two attacks
    if (e.pattern) {
      for (let i = 0; i < 14; i++) addBullet(e.x, e.y, (i / 14) * Math.PI * 2, t.bulletSpeed, dmg, false, 3, "#ff5a3c");
    } else {
      for (let i = -2; i <= 2; i++) addBullet(mx, my, e.angle + i * 0.18, t.bulletSpeed * 1.2, dmg, false, 3, "#ff5a3c");
    }
  } else {
    const angle = e.angle + (Math.random() - 0.5) * t.spread * 2;
    addBullet(mx, my, angle, t.bulletSpeed, dmg, false, 2, e.key === "sniper" ? "#9fd2ff" : "#ff7a4d");
  }
  spark(mx, my, "#ff9a5a", 3, 100);
  Sound.play("enemyShot");
}

function hurtEnemy(e, dmg) {
  if (e.dead) return;
  e.hp -= dmg;
  e.flash = 0.08;
  spark(e.x, e.y, "#d04a3a", 4, 130);
  Sound.play("hit");
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  G.kills++;
  G.score += e.type.score;

  if (G.mode === "timeattack") {                 // quick kills in a row give a bonus
    G.combo = G.comboTimer > 0 ? G.combo + 1 : 1;
    G.comboTimer = 3;
    G.score += G.combo * 10;
  }

  G.dying.push({ x: e.x, y: e.y, r: e.r, color: e.type.color, t: 0.45 });
  spark(e.x, e.y, e.type.color, 14, 200);
  addShake(e.key === "boss" ? 14 : 3);
  Sound.play("die");

  if (e.key !== "dummy" && Math.random() < 0.22) {
    G.pickups.push({ x: e.x, y: e.y, kind: Math.random() < 0.55 ? "health" : "ammo", life: 12 });
  }
}


/* ---------- Bullets, grenades, pickups ---------- */

function updateBullets(dt) {
  const p = G.player;
  let keep = 0;

  for (const b of G.bullets) {
    b.life -= dt;
    let alive = b.life > 0;
    const steps = Math.ceil(Math.hypot(b.vx, b.vy) * dt / 8);   // small steps so fast bullets can't skip over things

    for (let s = 0; s < steps && alive; s++) {
      b.x += b.vx * dt / steps;
      b.y += b.vy * dt / steps;

      if (b.x < 0 || b.y < 0 || b.x > W || b.y > H || pointInWall(b.x, b.y)) {
        spark(b.x, b.y, "#d8d8d8", 3, 120);
        alive = false;
      } else if (b.friendly) {
        for (const e of G.enemies) {
          if (!e.dead && Math.hypot(b.x - e.x, b.y - e.y) < e.r + 3) {
            hurtEnemy(e, b.dmg);
            alive = false;
            break;
          }
        }
      } else if (!p.dead && Math.hypot(b.x - p.x, b.y - p.y) < p.r + 3) {
        hurtPlayer(b.dmg);
        alive = false;
      }
    }
    if (alive) G.bullets[keep++] = b;
  }
  G.bullets.length = keep;
}

function updateGrenades(dt) {
  let keep = 0;
  for (const g of G.grenades) {
    g.fuse -= dt;
    const drag = Math.pow(0.96, dt * 60);       // same slow-down at 60, 90 or 120 FPS
    g.vx *= drag;
    g.vy *= drag;
    if (!moveEntity(g, g.vx * dt, g.vy * dt)) { g.vx = 0; g.vy = 0; }

    if (g.fuse <= 0) {
      explode(g.x, g.y);
    } else {
      G.grenades[keep++] = g;
    }
  }
  G.grenades.length = keep;
}

function explode(x, y) {
  const radius = 95;
  for (const e of G.enemies) {
    const d = Math.hypot(e.x - x, e.y - y);
    if (!e.dead && d < radius + e.r) hurtEnemy(e, 30 + 130 * (1 - d / (radius + e.r)));
  }
  spark(x, y, "#ff9a2a", 30, 320);
  spark(x, y, "#ffe08a", 15, 220);
  addShake(14);
  Sound.play("explosion");
}

function updatePickups(dt) {
  const p = G.player;
  let keep = 0;
  for (const item of G.pickups) {
    item.life -= dt;
    let taken = false;
    if (!p.dead && Math.hypot(item.x - p.x, item.y - p.y) < p.r + 12) {
      taken = true;
      if (item.kind === "health") {
        p.hp = Math.min(p.maxHp, p.hp + 30);
      } else {
        G.ammo.forEach(function (a, i) { a.reserve += Math.ceil(WEAPONS[i].mag * 0.8); });
        p.grenades = Math.min(5, p.grenades + 1);
      }
      Sound.play("pickup");
    }
    if (!taken && item.life > 0) G.pickups[keep++] = item;
  }
  G.pickups.length = keep;
}


/* ---------- Main update ---------- */

function update(dt) {
  G.time += dt;

  if (G.mode === "timeattack" && !G.finishing) {
    G.timeLeft -= dt;
    if (G.timeLeft <= 0) finish("timeup");
  }
  if (G.mode === "training" && G.player.hp < G.player.maxHp) G.player.hp = G.player.maxHp;

  updatePlayer(dt);
  updateSpawns(dt);

  let keep = 0;
  for (const e of G.enemies) {
    if (!e.dead) updateEnemy(e, dt);
    if (!e.dead) G.enemies[keep++] = e;
  }
  G.enemies.length = keep;

  updateBullets(dt);
  updateGrenades(dt);
  updatePickups(dt);

  keep = 0;
  for (const part of G.particles) {
    part.life -= dt;
    part.x += part.vx * dt;
    part.y += part.vy * dt;
    const drag = Math.pow(0.94, dt * 60);
    part.vx *= drag;
    part.vy *= drag;
    if (part.life > 0) G.particles[keep++] = part;
  }
  G.particles.length = keep;

  keep = 0;
  for (const d of G.dying) {
    d.t -= dt;
    if (d.t > 0) G.dying[keep++] = d;
  }
  G.dying.length = keep;

  G.comboTimer = Math.max(0, G.comboTimer - dt);
  G.flash = Math.max(0, G.flash - dt);
  G.hurt = Math.max(0, G.hurt - dt);
  G.shake = Math.max(0, G.shake - 30 * dt);
  G.shakeX = (Math.random() - 0.5) * G.shake;
  G.shakeY = (Math.random() - 0.5) * G.shake;
  if (G.banner) {
    G.banner.t -= dt;
    if (G.banner.t <= 0) G.banner = null;
  }

  if (G.finishing) {
    G.endTimer -= dt;
    if (G.endTimer <= 0) showResult();
  }
}


/* ---------- Drawing ---------- */

// the ground is drawn once per level into a hidden canvas, then copied every frame
function buildBackground(map) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  const shade = g.createLinearGradient(0, 0, W, H);
  shade.addColorStop(0, map.ground);
  shade.addColorStop(1, "#151d18");
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);

  // Soft light pools break up the flat colour without hiding targets or cover.
  const light = g.createRadialGradient(W * 0.52, H * 0.46, 35, W * 0.52, H * 0.46, W * 0.72);
  light.addColorStop(0, "rgba(218, 229, 186, 0.085)");
  light.addColorStop(0.62, "rgba(130, 154, 105, 0.025)");
  light.addColorStop(1, "rgba(0, 0, 0, 0.22)");
  g.fillStyle = light;
  g.fillRect(0, 0, W, H);

  // Floor plates and a restrained tactical grid give the arena depth.
  g.fillStyle = "rgba(5, 10, 7, 0.075)";
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 0) g.fillRect(col * 120 + 2, row * 120 + 2, 116, 116);
    }
  }
  g.strokeStyle = "rgba(224, 232, 208, 0.045)";
  g.lineWidth = 1;
  for (let x = 0; x <= W; x += 48) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
  }
  for (let y = 0; y <= H; y += 48) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }

  // Small, deterministic ground wear keeps every mission visually consistent.
  for (let i = 0; i < 170; i++) {
    const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * W;
    const y = (Math.sin(i * 37.3 + 2) * 0.5 + 0.5) * H;
    const size = 2 + (i % 4);
    g.fillStyle = i % 3 === 0 ? "rgba(230, 220, 177, 0.055)" : "rgba(4, 9, 6, 0.12)";
    g.fillRect(x, y, size * 1.8, Math.max(1, size * 0.6));
  }

  // Theater-specific surface markings make the five campaign regions easier to read.
  if (map.region === "DESERT") {
    g.strokeStyle = "rgba(245, 214, 150, 0.11)";
    g.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(-25, 95 + i * 104);
      g.bezierCurveTo(210, 42 + i * 104, 340, 150 + i * 104, 560, 90 + i * 104);
      g.bezierCurveTo(700, 52 + i * 104, 835, 116 + i * 104, 985, 70 + i * 104);
      g.stroke();
    }
  } else if (map.region === "WAREHOUSE") {
    g.strokeStyle = "rgba(211, 224, 218, 0.075)";
    g.lineWidth = 2;
    for (let y = 55; y < H; y += 110) {
      g.beginPath(); g.moveTo(34, y); g.lineTo(W - 34, y); g.stroke();
      g.fillStyle = "rgba(220, 230, 218, 0.12)";
      g.fillRect(28, y - 3, 14, 6);
      g.fillRect(W - 42, y - 3, 14, 6);
    }
  } else if (map.region === "WOODLAND") {
    for (let i = 0; i < 26; i++) {
      const x = (i * 173 + 53) % W;
      const y = (i * 97 + 31) % H;
      g.fillStyle = "rgba(21, 57, 28, 0.12)";
      g.beginPath(); g.ellipse(x, y, 18 + (i % 5) * 4, 8 + (i % 4) * 3, i * 0.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(147, 177, 101, 0.08)";
      g.beginPath(); g.arc(x + 5, y - 2, 4, 0, Math.PI * 2); g.fill();
    }
  } else if (map.region === "INDUSTRIAL") {
    g.fillStyle = "rgba(225, 157, 65, 0.12)";
    for (let i = 0; i < 8; i++) {
      const x = 34 + i * 128;
      g.fillRect(x, 24, 56, 5);
      g.fillRect(x, H - 29, 56, 5);
    }
    g.strokeStyle = "rgba(237, 177, 88, 0.1)";
    g.lineWidth = 2;
    g.setLineDash([10, 12]);
    g.beginPath(); g.moveTo(55, H - 62); g.lineTo(W - 55, H - 62); g.stroke();
    g.setLineDash([]);
  } else {
    g.strokeStyle = "rgba(218, 231, 199, 0.07)";
    g.lineWidth = 3;
    g.setLineDash([22, 20]);
    g.beginPath(); g.moveTo(70, H * 0.5); g.lineTo(W - 70, H * 0.5); g.stroke();
    g.setLineDash([]);
  }

  // Central deployment markings and a clean arena perimeter.
  g.strokeStyle = "rgba(213, 222, 186, 0.095)";
  g.lineWidth = 2;
  g.beginPath(); g.arc(W / 2, H / 2, 72, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(W / 2, H / 2, 84, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = "rgba(0, 0, 0, 0.38)";
  g.lineWidth = 9;
  g.strokeRect(5, 5, W - 10, H - 10);
  g.strokeStyle = "rgba(202, 218, 165, 0.17)";
  g.lineWidth = 1;
  g.strokeRect(13, 13, W - 26, H - 26);
  return c;
}

function drawCover(wall) {
  const x = wall[0];
  const y = wall[1];
  const width = wall[2];
  const height = wall[3];

  ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
  ctx.fillRect(x + 7, y + 9, width, height);

  ctx.fillStyle = G.map.wall;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = G.map.top;
  ctx.fillRect(x + 2, y + 2, width - 4, Math.min(7, height - 2));
  ctx.fillStyle = "rgba(236, 240, 207, 0.07)";
  ctx.fillRect(x + 4, y + 9, width - 8, Math.max(2, height * 0.12));
  ctx.strokeStyle = "rgba(5, 9, 7, 0.82)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);

  // Panel seams and dark braces make cover read as field crates or concrete blocks.
  ctx.strokeStyle = "rgba(14, 20, 15, 0.34)";
  ctx.lineWidth = 2;
  if (width > 70) {
    for (let mark = x + 22; mark < x + width - 8; mark += 24) {
      ctx.beginPath(); ctx.moveTo(mark, y + 9); ctx.lineTo(mark, y + height - 6); ctx.stroke();
    }
    ctx.fillStyle = "rgba(8, 14, 10, 0.18)";
    ctx.fillRect(x + 8, y + height * 0.55, width - 16, Math.max(3, height * 0.12));
  } else if (height > 55) {
    for (let mark = y + 22; mark < y + height - 8; mark += 22) {
      ctx.beginPath(); ctx.moveTo(x + 5, mark); ctx.lineTo(x + width - 5, mark); ctx.stroke();
    }
  } else {
    ctx.beginPath(); ctx.moveTo(x + 6, y + height - 7); ctx.lineTo(x + width - 6, y + height - 7); ctx.stroke();
  }

  ctx.fillStyle = "rgba(230, 238, 208, 0.42)";
  const bolt = 4;
  ctx.fillRect(x + 4, y + 4, bolt, bolt);
  ctx.fillRect(x + width - 8, y + 4, bolt, bolt);
  ctx.fillRect(x + 4, y + height - 8, bolt, bolt);
  ctx.fillRect(x + width - 8, y + height - 8, bolt, bolt);
}

function drawSoldier(x, y, r, angle, color, helmet, gunLength, unitType, isPlayer) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  const scale = r / 13;
  const skin = "#c9ad83";
  const vest = color;
  const darkVest = isPlayer ? "#33462e" : "#3c3430";
  const headSize = r * 0.62;

  // Feet and pack sit behind the body so the unit reads clearly at a glance.
  ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
  ctx.beginPath(); ctx.ellipse(-r * 0.08, r * 0.48, r * 1.05, r * 0.76, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#242b25";
  ctx.fillRect(-r * 0.86, r * 0.22, r * 0.63, r * 0.52);
  ctx.fillRect(r * 0.18, r * 0.22, r * 0.63, r * 0.52);

  ctx.fillStyle = darkVest;
  ctx.fillRect(-r * 0.62, -r * 0.52, r * 0.68, r * 1.04);
  ctx.strokeStyle = "rgba(9, 14, 10, 0.65)";
  ctx.lineWidth = Math.max(1, scale * 1.5);
  ctx.strokeRect(-r * 0.62, -r * 0.52, r * 0.68, r * 1.04);

  // Rifle, stock and front grip are drawn as a compact silhouette.
  ctx.fillStyle = "#1d2420";
  ctx.fillRect(r * 0.18, -r * 0.17, gunLength + 5, r * 0.28);
  ctx.fillStyle = "#657065";
  ctx.fillRect(r * 0.38, -r * 0.11, Math.max(7, gunLength * 0.58), r * 0.08);
  ctx.fillStyle = "#111713";
  ctx.fillRect(r * 0.18 + gunLength + 3, -r * 0.12, 5, r * 0.17);
  ctx.fillStyle = "#3d453c";
  ctx.fillRect(r * 0.52, r * 0.08, r * 0.24, r * 0.36);

  // Arms, torso and segmented field vest.
  ctx.fillStyle = darkVest;
  ctx.beginPath(); ctx.ellipse(r * 0.1, -r * 0.48, r * 0.72, r * 0.29, -0.18, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(r * 0.1, r * 0.43, r * 0.72, r * 0.29, 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = vest;
  ctx.beginPath(); ctx.ellipse(-r * 0.05, 0, r * 0.86, r * 0.82, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(5, 10, 7, 0.65)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = darkVest;
  ctx.fillRect(-r * 0.35, -r * 0.43, r * 0.24, r * 0.86);
  ctx.fillRect(r * 0.02, -r * 0.49, r * 0.22, r * 0.98);
  ctx.fillStyle = "rgba(221, 220, 174, 0.45)";
  ctx.fillRect(-r * 0.38, -r * 0.18, r * 0.22, r * 0.13);
  ctx.fillRect(-r * 0.38, r * 0.08, r * 0.22, r * 0.13);
  ctx.fillStyle = isPlayer ? "#e5bd62" : (unitType === "boss" ? "#e1a14b" : "#c87d65");
  ctx.fillRect(-r * 0.12, -r * 0.1, r * 0.23, r * 0.2);

  // Oversized head, helmet rim and dark eye strip give the soldiers an arcade look.
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(r * 0.32, 0, headSize * 0.82, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = helmet;
  ctx.beginPath(); ctx.ellipse(r * 0.3, -r * 0.13, headSize * 1.05, headSize * 0.76, 0, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillRect(r * 0.02, -r * 0.15, r * 0.6, r * 0.16);
  ctx.fillStyle = "#2b342e";
  ctx.fillRect(r * 0.47, -r * 0.15, r * 0.2, r * 0.25);
  ctx.fillStyle = "rgba(214, 230, 207, 0.72)";
  ctx.fillRect(r * 0.49, -r * 0.11, r * 0.1, r * 0.055);

  if (unitType === "heavy" || unitType === "boss") {
    ctx.strokeStyle = unitType === "boss" ? "#e6a24d" : "#b78d6e";
    ctx.lineWidth = Math.max(1, scale * 1.8);
    ctx.beginPath(); ctx.arc(-r * 0.05, 0, r * 0.94, 0, Math.PI * 2); ctx.stroke();
  }
  if (unitType === "sniper") {
    ctx.fillStyle = "#17232b";
    ctx.fillRect(r * 0.22, -r * 0.78, r * 0.75, r * 0.18);
  }

  ctx.restore();
}

function drawBar(x, y, w, h, fraction, color) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, fraction)), h);
}

function label(text, x, y, size, color, align) {
  ctx.font = "700 " + size + "px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = color;
  ctx.textAlign = align || "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y);
}

function fitLabel(text, x, y, maxWidth, size, color, align) {
  ctx.font = "700 " + size + "px 'Segoe UI', Arial, sans-serif";
  let output = String(text);
  while (output.length > 3 && ctx.measureText(output).width > maxWidth) {
    output = output.slice(0, -2).trimEnd() + "…";
  }
  label(output, x, y, size, color, align);
}

function hudPanel(x, y, width, height, accent) {
  ctx.save();
  ctx.fillStyle = "rgba(8, 15, 11, 0.88)";
  ctx.strokeStyle = "rgba(207, 228, 176, 0.34)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = accent || "#c5eb78";
  ctx.fillRect(x + 12, y + 11, 25, 3);
  ctx.restore();
}

function render() {
  if (!G) {
    ctx.fillStyle = "#121510";
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const p = G.player;
  const w = WEAPONS[p.weapon];

  ctx.save();
  ctx.translate(G.shakeX, G.shakeY);
  ctx.drawImage(G.bg, 0, 0);

  for (const wall of G.map.walls) drawCover(wall);

  for (const item of G.pickups) {
    const blink = item.life < 3 && Math.floor(item.life * 6) % 2 === 0;
    if (blink) continue;
    const supplyColor = item.kind === "health" ? "#7fbd6a" : "#e6a14d";
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(item.x - 11, item.y - 7, 24, 21);
    ctx.fillStyle = supplyColor;
    ctx.fillRect(item.x - 10, item.y - 10, 20, 20);
    ctx.strokeStyle = "rgba(17, 24, 17, 0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(item.x - 10, item.y - 10, 20, 20);
    ctx.fillStyle = "#f4f1dc";
    if (item.kind === "health") {
      ctx.fillRect(item.x - 6, item.y - 2, 12, 4);
      ctx.fillRect(item.x - 2, item.y - 6, 4, 12);
    } else {
      ctx.fillRect(item.x - 5, item.y - 6, 3, 12);
      ctx.fillRect(item.x + 2, item.y - 6, 3, 12);
    }
  }

  for (const d of G.dying) {
    ctx.globalAlpha = d.t / 0.45;
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r * (1 + (0.45 - d.t)), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const e of G.enemies) {
    const helmet = e.key === "sniper" ? "#30485c" : e.key === "fast" ? "#6e5836" : e.key === "boss" ? "#4a2926" : e.key === "heavy" ? "#40312f" : "#4e3933";
    drawSoldier(e.x, e.y, e.r * 1.16, e.angle, e.flash > 0 ? "#ffffff" : e.type.color, helmet, e.r * 1.12 + (e.key === "boss" ? 18 : 8), e.key, false);
    if (e.hp < e.maxHp || e.key === "boss") {
      const bw = e.r * 2.4;
      drawBar(e.x - bw / 2, e.y - e.r - 12, bw, 4, e.hp / e.maxHp, e.key === "boss" ? "#e8892b" : "#d33");
    }
  }

  if (!p.dead) {
    const blink = p.invuln > 0 && Math.floor(p.invuln * 10) % 2 === 0;
    ctx.globalAlpha = blink ? 0.4 : 1;
    const uniform = PLAYER_UNIFORMS[save.profile.avatar] || PLAYER_UNIFORMS.scout;
    drawSoldier(p.x, p.y + Math.sin(p.walk) * 0.8, p.r * 1.16, p.angle, uniform.body, uniform.helmet, w.len + 8, "player", true);
    ctx.globalAlpha = 1;
    if (G.flash > 0) {
      ctx.fillStyle = "rgba(255, 220, 120, 0.9)";
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(p.angle) * (p.r + w.len + 8), p.y + Math.sin(p.angle) * (p.r + w.len + 8), 8, 0, Math.PI * 2);
      ctx.fill();
    }
    if (p.reload > 0) drawBar(p.x - 18, p.y + p.r + 8, 36, 4, 1 - p.reload / w.reload, "#e8892b");
  }

  for (const g of G.grenades) {
    ctx.fillStyle = Math.floor(g.fuse * 8) % 2 ? "#cc3333" : "#3a4a2a";
    ctx.beginPath();
    ctx.arc(g.x, g.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.lineWidth = 2;
  for (const b of G.bullets) {
    ctx.strokeStyle = b.color;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);   // short trail behind the bullet
    ctx.stroke();
  }

  for (const part of G.particles) {
    ctx.globalAlpha = part.life / part.max;
    ctx.fillStyle = part.color;
    ctx.fillRect(part.x, part.y, part.size, part.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawHud();
}


function drawHud() {
  const p = G.player;
  const w = WEAPONS[p.weapon];
  const a = G.ammo[p.weapon];
  const training = G.mode === "training";
  const leftX = 16;
  const leftY = 16;
  const leftW = 274;
  const leftH = 136;
  const rightW = 238;
  const rightX = W - rightW - 16;
  const rightY = 16;
  const rightH = 136;
  const centerW = Touch.enabled ? 232 : 350;     // narrower objective panel on phones
  const centerX = (W - centerW) / 2;
  const hs = Touch.enabled ? 1.2 : 1;            // phones show the arena smaller, so the HUD is drawn larger

  if (G.hurt > 0) {
    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.8);
    grad.addColorStop(0, "rgba(200, 0, 0, 0)");
    grad.addColorStop(1, "rgba(200, 0, 0, " + (G.hurt * 1.35) + ")");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // Operator vitals and current loadout.
  ctx.save();
  ctx.translate(leftX, leftY); ctx.scale(hs, hs); ctx.translate(-leftX, -leftY);
  hudPanel(leftX, leftY, leftW, leftH, p.hp > 30 ? "#c5eb78" : "#ec765e");
  fitLabel("OPERATOR  /  " + (save.profile.callsign || "ROOKIE"), leftX + 15, leftY + 31, leftW - 30, 11, "#dfe9d5");
  label("HEALTH", leftX + 15, leftY + 53, 10, "#91a48d");
  label(Math.ceil(p.hp) + "%", leftX + leftW - 15, leftY + 53, 10, p.hp > 30 ? "#c5eb78" : "#ff8a73", "right");
  drawBar(leftX + 15, leftY + 61, leftW - 30, 10, p.hp / p.maxHp, p.hp > 30 ? "#8fc85a" : "#e45c4d");
  label(training ? "LIVES  ∞" : "LIVES  " + String(G.lives).padStart(2, "0"), leftX + 15, leftY + 91, 11, "#e8eee2");
  label("GRENADES  " + String(p.grenades).padStart(2, "0"), leftX + 145, leftY + 91, 11, "#e8eee2");
  fitLabel(w.name.toUpperCase(), leftX + 15, leftY + 119, 142, 10, "#c5eb78");
  label(a.mag + " / " + (training ? "∞" : a.reserve), leftX + leftW - 15, leftY + 119, 12, "#f0b15d", "right");
  if (p.reload > 0) {
    label("RELOADING", leftX + leftW - 15, leftY + 134, 8, "#f0b15d", "right");
  }
  ctx.restore();

  // Current objective floats at the top centre in its own clear panel.
  ctx.save();
  ctx.translate(W / 2, 16); ctx.scale(Touch.enabled ? 1.1 : 1, Touch.enabled ? 1.1 : 1); ctx.translate(-W / 2, -16);
  hudPanel(centerX, 16, centerW, 66, "#f0b15d");
  const missionName = G.mode === "campaign" ? "OPERATION " + String(G.level + 1).padStart(2, "0") + "  /  " + G.map.name.toUpperCase()
    : G.mode === "survival" ? "SURVIVAL ZONE  /  ENDLESS DEPLOYMENT"
    : G.mode === "timeattack" ? "TIME ATTACK  /  90 SECOND RUN"
    : "TRAINING RANGE  /  LIVE FIRE PRACTICE";
  fitLabel(missionName, W / 2, 43, centerW - 34, 11, "#f0c77f", "center");
  const objective = G.mode === "campaign" ? G.map.objective
    : G.mode === "survival" ? "Survive as long as you can"
    : G.mode === "timeattack" ? "Get as many eliminations as possible"
    : "Hit the targets and test every weapon";
  fitLabel(objective, W / 2, 64, centerW - 34, 10, "#e6ebdf", "center");
  ctx.restore();

  // Score, eliminations and mission progress.
  ctx.save();
  ctx.translate(W - 16, rightY); ctx.scale(hs, hs); ctx.translate(-(W - 16), -rightY);
  hudPanel(rightX, rightY, rightW, rightH, "#f0b15d");
  label("FIELD SCORE", rightX + 15, rightY + 31, 10, "#9eae96");
  label(Math.floor(G.score).toLocaleString(), rightX + rightW - 15, rightY + 58, 23, "#f0f3e9", "right");
  ctx.strokeStyle = "rgba(207, 228, 176, 0.16)";
  ctx.beginPath(); ctx.moveTo(rightX + 15, rightY + 70); ctx.lineTo(rightX + rightW - 15, rightY + 70); ctx.stroke();
  label("ELIMINATIONS  " + String(G.kills).padStart(2, "0"), rightX + 15, rightY + 91, 11, "#e6ebdf");
  let progressText = "TRAINING  /  PRACTICE";
  if (G.mode === "campaign") progressText = "LEVEL " + String(G.level + 1).padStart(2, "0") + "   WAVE " + Math.max(1, G.wave) + "/" + G.map.waves.length;
  else if (G.mode === "survival") progressText = "WAVE " + String(Math.max(1, G.wave)).padStart(2, "0") + "   " + formatTime(G.time);
  else if (G.mode === "timeattack") progressText = "TIME " + formatTime(G.timeLeft) + (G.combo > 1 && G.comboTimer > 0 ? "   COMBO x" + G.combo : "");
  fitLabel(progressText, rightX + 15, rightY + 119, rightW - 30, 10, "#f0b15d");
  label("BEST " + save.highScore.toLocaleString(), rightX + rightW - 15, rightY + 134, 8, "#89998a", "right");
  ctx.restore();

  if (G.banner) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, G.banner.t / 0.5);
    ctx.fillStyle = "rgba(8, 15, 11, 0.85)";
    ctx.strokeStyle = "rgba(198, 239, 112, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(W / 2 - 185, H / 2 - 54, 370, 78, 12); ctx.fill(); ctx.stroke();
    label(G.banner.text, W / 2, H / 2 - 5, 27, "#c9f276", "center");
    ctx.restore();
  }

  if (state === "playing" && !p.dead && (!Touch.enabled || Touch.aiming)) {
    ctx.save();
    ctx.strokeStyle = "#ffd074";
    ctx.lineWidth = 2;
    if (!Touch.enabled) {                       // glow is costly on phones, so desktop only
      ctx.shadowColor = "rgba(255, 176, 75, 0.7)";
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, 9, 0, Math.PI * 2);
    ctx.moveTo(mouse.x - 15, mouse.y); ctx.lineTo(mouse.x - 5, mouse.y);
    ctx.moveTo(mouse.x + 5, mouse.y);  ctx.lineTo(mouse.x + 15, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 15); ctx.lineTo(mouse.x, mouse.y - 5);
    ctx.moveTo(mouse.x, mouse.y + 5);  ctx.lineTo(mouse.x, mouse.y + 15);
    ctx.stroke();
    ctx.restore();
  }
}


/* ---------- Loop and input ---------- */

function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  Touch.sync();
  if (state === "playing" && G) update(dt);    // nothing updates while paused
  render();
  requestAnimationFrame(loop);
}

function mouseToWorld(event) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = (event.clientX - rect.left) * W / rect.width;
  mouse.y = (event.clientY - rect.top) * H / rect.height;
}

canvas.addEventListener("mousemove", mouseToWorld);
canvas.addEventListener("mousedown", function (event) {
  if (event.button === 0) { mouseToWorld(event); mouse.down = true; }
});
window.addEventListener("mouseup", function () { mouse.down = false; });
canvas.addEventListener("contextmenu", function (event) { event.preventDefault(); });

window.addEventListener("keydown", function (event) {
  if (event.code === "Escape") {
    if (state === "playing") pauseGame();
    else if (state === "paused") resumeGame();
    return;
  }
  if (state !== "playing") return;
  if (event.code.indexOf("Arrow") === 0 || event.code === "Space") event.preventDefault();

  keys[event.code] = true;
  if (event.repeat) return;
  if (event.code === "KeyR") startReload();
  else if (event.code === "KeyG") throwGrenade();
  else if (event.code >= "Digit1" && event.code <= "Digit4") switchWeapon(Number(event.code.slice(5)) - 1);
});

window.addEventListener("keyup", function (event) { keys[event.code] = false; });

// leaving the tab pauses the game
function autoPause() {
  for (const k in keys) keys[k] = false;
  pauseGame();
}
window.addEventListener("blur", autoPause);
document.addEventListener("visibilitychange", function () { if (document.hidden) autoPause(); });
