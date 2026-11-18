// storage.js - local operator profile, campaign progress and personal records.

const SAVE_KEY = "strikeforce-save-v2";
const OLD_SAVE_KEY = "strikeforce-save-v1";

function defaultSave() {
  return {
    highScore: 0,
    unlockedLevel: 1,
    unlockedWeapons: ["pistol", "rifle"],
    startWeapon: "pistol",
    settings: { music: 0.35, sfx: 0.7 },
    profile: { callsign: "ROOKIE", avatar: "scout" },
    totalKills: 0,
    xp: 0,
    scores: []
  };
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
  if (!["scout", "desert", "navy", "crimson"].includes(merged.profile.avatar)) merged.profile.avatar = "scout";
  if (typeof merged.profile.callsign !== "string" || !merged.profile.callsign.trim()) merged.profile.callsign = "ROOKIE";

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
