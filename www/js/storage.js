// storage.js - local operator profile, campaign progress, credits, upgrades and personal records.

const SAVE_KEY = "strikeforce-save-v2";
const OLD_SAVE_KEY = "strikeforce-save-v1";
const WEAPON_IDS = ["pistol", "rifle", "shotgun", "sniper"];
const OP_UPGRADE_MAX = { hp: 5, charge: 5, grenades: 3, cores: 3 };
const WEAPON_UPGRADE_MAX = 5;

function defaultWeaponUp() {
  const out = {};
  WEAPON_IDS.forEach(function (id) { out[id] = { dmg: 0, mag: 0, rate: 0 }; });
  return out;
}

function defaultSave() {
  return {
    highScore: 0,
    unlockedLevel: 1,
    unlockedWeapons: ["pistol", "rifle"],
    startWeapon: "pistol",
    settings: { music: 0.35, sfx: 0.7, haptics: true, fps: 60, aimAssist: true, motion: true },
    profile: { callsign: "ROOKIE", avatar: "scout" },
    totalKills: 0,
    xp: 0,
    scores: [],
    coins: 0,
    upgrades: { hp: 0, charge: 0, grenades: 0, cores: 0 },
    weaponUp: defaultWeaponUp(),
    finalCleared: false,
    tutorialDone: false,
    daily: { day: "", missions: [] },
    ach: {},
    stats: { surges: 0, dashes: 0, cores: 0, bossKills: 0, coinsEarned: 0, lastStands: 0, bestCombo: 0 }
  };
}

function clampInt(value, lo, hi) {
  let n = Math.floor(Number(value));
  if (!isFinite(n)) n = lo;
  return Math.max(lo, Math.min(hi, n));
}

function loadSave() {
  const base = defaultSave();
  let raw = null;

  try {
    raw = JSON.parse(localStorage.getItem(SAVE_KEY));
    // Carry existing campaign progress forward when upgrading from version 1.
    if (!raw) raw = JSON.parse(localStorage.getItem(OLD_SAVE_KEY));
  } catch (error) {
    raw = null;
  }

  if (!raw || typeof raw !== "object") return base;

  const merged = Object.assign({}, base, raw);
  merged.settings = Object.assign({}, base.settings, raw.settings || {});
  merged.profile = Object.assign({}, base.profile, raw.profile || {});
  merged.unlockedLevel = Math.max(1, Math.min(30, Number(merged.unlockedLevel) || 1));
  merged.totalKills = Math.max(0, Number(merged.totalKills) || 0);
  merged.xp = Math.max(0, Number(merged.xp) || 0);
  merged.highScore = Math.max(0, Number(merged.highScore) || 0);

  if (!Array.isArray(merged.unlockedWeapons)) merged.unlockedWeapons = base.unlockedWeapons.slice();
  if (!Array.isArray(merged.scores)) merged.scores = [];
  if (["scout", "desert", "navy", "crimson"].indexOf(merged.profile.avatar) === -1) merged.profile.avatar = "scout";
  if (typeof merged.profile.callsign !== "string" || !merged.profile.callsign.trim()) merged.profile.callsign = "ROOKIE";

  // settings (the last five were added in 2.3)
  const s = merged.settings;
  s.music = Math.max(0, Math.min(1, Number(s.music)));
  if (!isFinite(s.music)) s.music = 0.35;
  s.sfx = Math.max(0, Math.min(1, Number(s.sfx)));
  if (!isFinite(s.sfx)) s.sfx = 0.7;
  s.haptics = s.haptics !== false;
  s.aimAssist = s.aimAssist !== false;
  s.motion = s.motion !== false;
  s.fps = [0, 30, 60].indexOf(Number(s.fps)) !== -1 ? Number(s.fps) : 60;

  // credits, upgrades, missions and achievements (added in 2.3)
  merged.coins = clampInt(merged.coins, 0, 99999999);
  merged.upgrades = Object.assign({}, base.upgrades, merged.upgrades && typeof merged.upgrades === "object" ? merged.upgrades : {});
  for (const id in OP_UPGRADE_MAX) merged.upgrades[id] = clampInt(merged.upgrades[id], 0, OP_UPGRADE_MAX[id]);
  const wu = merged.weaponUp && typeof merged.weaponUp === "object" ? merged.weaponUp : {};
  merged.weaponUp = defaultWeaponUp();
  WEAPON_IDS.forEach(function (id) {
    const src = wu[id] && typeof wu[id] === "object" ? wu[id] : {};
    merged.weaponUp[id] = {
      dmg: clampInt(src.dmg, 0, WEAPON_UPGRADE_MAX),
      mag: clampInt(src.mag, 0, WEAPON_UPGRADE_MAX),
      rate: clampInt(src.rate, 0, WEAPON_UPGRADE_MAX)
    };
  });
  merged.finalCleared = merged.finalCleared === true;
  merged.tutorialDone = merged.tutorialDone === true;
  merged.ach = merged.ach && typeof merged.ach === "object" && !Array.isArray(merged.ach) ? merged.ach : {};
  merged.stats = Object.assign({}, base.stats, merged.stats && typeof merged.stats === "object" ? merged.stats : {});
  for (const key in base.stats) merged.stats[key] = Math.max(0, Number(merged.stats[key]) || 0);
  const d = merged.daily;
  merged.daily = d && typeof d === "object" && typeof d.day === "string" && Array.isArray(d.missions) ? d : { day: "", missions: [] };

  return merged;
}

function writeSave() {
  try {
    const serialized = JSON.stringify(save);
    localStorage.setItem(SAVE_KEY, serialized);

    // Verify the write so the profile screen can report a real save result.
    return localStorage.getItem(SAVE_KEY) === serialized;
  } catch (error) {
    // Keep the current session playable, but let the UI report that it was not saved.
    console.warn("PEWOPS could not access browser storage:", error);
    return false;
  }
}

function addScore(mode, score, kills, firstClear) {
  const earned = Math.max(0, Math.floor(score));
  const eliminations = Math.max(0, Math.floor(kills || 0));

  save.scores.push({ mode: mode, score: earned, date: new Date().toLocaleDateString() });
  save.scores.sort(function (a, b) { return b.score - a.score; });
  save.scores = save.scores.slice(0, 8);
  save.highScore = Math.max(save.highScore, earned);
  save.totalKills += eliminations;
  // the 100 XP mission bonus is only paid on the first clear, so replaying a level cannot farm XP
  save.xp += eliminations * 10 + (mode === "Campaign" && firstClear ? 100 : 0);
  writeSave();
}

let save = loadSave();
