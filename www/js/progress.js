// progress.js - credits, upgrades, daily missions and achievements.

const OPERATOR_UPGRADES = [
  { id: "hp",       name: "ARMOR PLATING", desc: "+10 maximum health per level",      base: 150 },
  { id: "charge",   name: "POWER CELLS",   desc: "+10% Surge charge per kill",        base: 160 },
  { id: "grenades", name: "GRENADE BELT",  desc: "+1 starting grenade per level",     base: 200 },
  { id: "cores",    name: "CORE SCANNER",  desc: "+20% power core drops per level",   base: 180 }
];

const WEAPON_UPGRADES = [
  { id: "dmg",  name: "DAMAGE",    desc: "+10% damage per level",              base: 120 },
  { id: "mag",  name: "MAGAZINE",  desc: "Bigger magazine, faster reload",     base: 90 },
  { id: "rate", name: "FIRE RATE", desc: "+5% fire rate per level",            base: 150 }
];

const DAILY_POOL = [
  { counter: "kills",  text: "Eliminate {n} enemies",        targets: [30, 50, 80], reward: [40, 60, 90] },
  { counter: "surges", text: "Trigger Power Surge {n} times", targets: [1, 2, 3],    reward: [40, 60, 90] },
  { counter: "clears", text: "Clear {n} campaign missions",  targets: [1, 2, 3],    reward: [50, 80, 120] },
  { counter: "dashes", text: "Dash {n} times",               targets: [15, 30, 50], reward: [30, 50, 80] },
  { counter: "cores",  text: "Collect {n} power cores",      targets: [3, 5, 8],    reward: [40, 60, 90] },
  { counter: "boss",   text: "Defeat {n} boss",              targets: [1, 1, 2],    reward: [70, 90, 140] }
];

const ACHIEVEMENTS = [
  { id: "first_blood",  name: "First Blood",       desc: "Eliminate your first enemy",                reward: 20,  test: function () { return save.totalKills >= 1; } },
  { id: "power_up",     name: "Power Up",          desc: "Trigger a Power Surge",                     reward: 40,  test: function () { return save.stats.surges >= 1; } },
  { id: "giant_slayer", name: "Giant Slayer",      desc: "Defeat a boss",                             reward: 100, test: function () { return save.stats.bossKills >= 1; } },
  { id: "last_stand",   name: "Last Stand",        desc: "Survive a fatal hit with a full Surge",     reward: 80,  test: function () { return save.stats.lastStands >= 1; } },
  { id: "untouchable",  name: "Untouchable",       desc: "Clear a mission without taking damage",     reward: 120 },
  { id: "combo_king",   name: "Combo King",        desc: "Reach a x8 combo in Time Attack",           reward: 60,  test: function () { return save.stats.bestCombo >= 8; } },
  { id: "quick_feet",   name: "Quick Feet",        desc: "Dash 50 times",                             reward: 50,  test: function () { return save.stats.dashes >= 50; } },
  { id: "collector",    name: "Core Collector",    desc: "Collect 20 power cores",                    reward: 60,  test: function () { return save.stats.cores >= 20; } },
  { id: "paymaster",    name: "Paymaster",         desc: "Earn 1,000 credits",                        reward: 100, test: function () { return save.stats.coinsEarned >= 1000; } },
  { id: "veteran",      name: "Veteran",           desc: "Clear 15 campaign missions",                reward: 150, test: function () { return save.unlockedLevel >= 16; } },
  { id: "commander",    name: "Campaign Complete", desc: "Clear all 30 campaign missions",            reward: 400, test: function () { return save.finalCleared === true; } }
];

// which lifetime counter each daily-mission counter feeds
const STAT_FOR = { surges: "surges", dashes: "dashes", cores: "cores", boss: "bossKills" };

const Progress = {
  toasts: [],

  today: function () {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  // small deterministic random generator, so everyone on the same day gets the same missions
  rng: function (text) {
    let h = 1779033703 ^ text.length;
    for (let i = 0; i < text.length; i++) {
      h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  ensureDaily: function () {
    const day = this.today();
    if (save.daily.day === day && save.daily.missions.length === 3) return;
    const rand = this.rng("pewops-" + day);
    const order = DAILY_POOL.map(function (_, i) { return i; });
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    save.daily = {
      day: day,
      missions: order.slice(0, 3).map(function (index) {
        const def = DAILY_POOL[index];
        const tier = Math.floor(rand() * 3);
        return {
          counter: def.counter,
          text: def.text.replace("{n}", def.targets[tier]),
          target: def.targets[tier],
          reward: def.reward[tier],
          progress: 0,
          claimed: false
        };
      })
    };
  },

  // a counter went up (kills, surges, dashes, cores, clears, boss)
  event: function (counter, n) {
    n = n || 1;
    this.ensureDaily();
    if (STAT_FOR[counter]) save.stats[STAT_FOR[counter]] += n;
    save.daily.missions.forEach(function (m) {
      if (m.counter === counter && !m.claimed) m.progress = Math.min(m.target, m.progress + n);
    });
    this.check();
  },

  claimable: function () {
    this.ensureDaily();
    return save.daily.missions.filter(function (m) { return !m.claimed && m.progress >= m.target; }).length;
  },

  claim: function (index) {
    this.ensureDaily();
    const m = save.daily.missions[index];
    if (!m || m.claimed || m.progress < m.target) return false;
    m.claimed = true;
    this.addCoins(m.reward);
    this.check();
    writeSave();
    return true;
  },

  addCoins: function (n) {
    n = Math.floor(n);
    if (!n) return;
    save.coins = Math.max(0, save.coins + n);
    if (n > 0) save.stats.coinsEarned += n;
  },

  check: function () {
    for (let i = 0; i < ACHIEVEMENTS.length; i++) {
      const a = ACHIEVEMENTS[i];
      if (!save.ach[a.id] && a.test && a.test()) this.unlock(a.id);
    }
  },

  unlock: function (id) {
    if (save.ach[id]) return;
    const a = ACHIEVEMENTS.find(function (item) { return item.id === id; });
    if (!a) return;
    save.ach[id] = true;
    this.addCoins(a.reward);
    this.toasts.push({ title: "ACHIEVEMENT", text: a.name, reward: a.reward });
    Sound.play("achieve");
  },

  // ---- upgrades ----
  cost: function (def, level) { return def.base * (level + 1); },

  buyOperator: function (id) {
    const def = OPERATOR_UPGRADES.find(function (u) { return u.id === id; });
    if (!def) return { ok: false, reason: "unknown" };
    const level = save.upgrades[id];
    if (level >= OP_UPGRADE_MAX[id]) return { ok: false, reason: "max" };
    const price = this.cost(def, level);
    if (save.coins < price) return { ok: false, reason: "coins" };
    save.coins -= price;
    save.upgrades[id] = level + 1;
    writeSave();
    return { ok: true };
  },

  buyWeapon: function (weaponId, stat) {
    const def = WEAPON_UPGRADES.find(function (u) { return u.id === stat; });
    const up = save.weaponUp[weaponId];
    if (!def || !up) return { ok: false, reason: "unknown" };
    if (up[stat] >= WEAPON_UPGRADE_MAX) return { ok: false, reason: "max" };
    const price = this.cost(def, up[stat]);
    if (save.coins < price) return { ok: false, reason: "coins" };
    save.coins -= price;
    up[stat] += 1;
    writeSave();
    return { ok: true };
  },

  // true when at least one upgrade can be bought right now (shows a dot on the lobby button)
  canAfford: function () {
    const self = this;
    const op = OPERATOR_UPGRADES.some(function (u) {
      return save.upgrades[u.id] < OP_UPGRADE_MAX[u.id] && save.coins >= self.cost(u, save.upgrades[u.id]);
    });
    if (op) return true;
    return save.unlockedWeapons.some(function (id) {
      return WEAPON_UPGRADES.some(function (u) {
        return save.weaponUp[id][u.id] < WEAPON_UPGRADE_MAX && save.coins >= self.cost(u, save.weaponUp[id][u.id]);
      });
    });
  }
};
