// ui.js - lobby, command screens, operator profile, upgrades, daily missions and saved records.

const RANKS = [
  { name: "RECRUIT", xp: 0 },
  { name: "PRIVATE", xp: 100 },
  { name: "CORPORAL", xp: 300 },
  { name: "SERGEANT", xp: 600 },
  { name: "LIEUTENANT", xp: 1000 },
  { name: "CAPTAIN", xp: 1500 },
  { name: "MAJOR", xp: 2200 },
  { name: "COMMANDER", xp: 3000 }
];

const MUSIC_SCREENS = ["menu", "campaign", "weapons", "shop", "missions", "profile", "settings", "instructions", "leaderboard"];

const UI = {
  current: "menu",
  shopWeapon: null,

  show(id) {
    this.current = id;
    document.querySelectorAll(".screen").forEach(function (screen) {
      screen.hidden = screen.id !== id;
    });
    if (id === "menu") this.refreshHome();
    if (MUSIC_SCREENS.indexOf(id) !== -1) Sound.startMusic("menu");
  },

  pad(n, size) { return String(n).padStart(size || 2, "0"); },

  rankDetails() {
    let current = RANKS[0];
    let next = null;
    for (let i = 0; i < RANKS.length; i++) {
      if (save.xp >= RANKS[i].xp) current = RANKS[i];
      else { next = RANKS[i]; break; }
    }
    const earned = save.xp - current.xp;
    const needed = next ? next.xp - current.xp : 1;
    return {
      current: current,
      next: next,
      progress: next ? Math.min(100, earned / needed * 100) : 100,
      label: next ? earned + " / " + needed + " XP" : "MAXIMUM RANK"
    };
  },

  refreshHome() {
    Progress.ensureDaily();
    const callsign = save.profile.callsign || "ROOKIE";
    const rank = this.rankDetails();
    const weapon = WEAPONS[weaponIndex(save.startWeapon)] || WEAPONS[0];
    const unlocked = Math.max(1, Math.min(LEVELS.length, save.unlockedLevel));
    const level = LEVELS[unlocked - 1];
    const cleared = save.finalCleared ? LEVELS.length : unlocked - 1;
    const get = function (id) { return document.getElementById(id); };

    get("home-callsign").textContent = callsign;
    get("home-rank").textContent = rank.current.name;
    get("home-xp").textContent = save.xp.toLocaleString() + " XP";
    get("home-xp-bar").style.width = rank.progress + "%";
    get("home-coins").textContent = save.coins.toLocaleString();
    get("home-missions").innerHTML = this.pad(unlocked) + "<span>/30</span>";
    get("home-kills").textContent = this.pad(save.totalKills, 3);
    get("home-weapon").textContent = weapon.name.toUpperCase();

    get("home-continue-label").textContent = save.finalCleared ? "REPLAY CAMPAIGN" : cleared === 0 ? "START CAMPAIGN" : "CONTINUE CAMPAIGN";
    get("home-continue-name").textContent = "OP " + this.pad(unlocked) + " · " + level.name.toUpperCase();
    get("home-continue-tag").textContent = level.difficulty;
    get("home-campaign-bar").style.width = (cleared / LEVELS.length * 100) + "%";

    const claimable = Progress.claimable();
    const missionsBadge = get("badge-missions");
    missionsBadge.hidden = claimable === 0;
    missionsBadge.textContent = claimable;
    get("badge-upgrades").hidden = !Progress.canAfford();

    // the lobby shows the daily mission that is closest to being finished
    const daily = save.daily.missions;
    const next = daily.find(function (m) { return !m.claimed && m.progress < m.target; }) || daily.find(function (m) { return !m.claimed; });
    if (next) {
      get("home-daily-label").textContent = next.progress >= next.target ? "READY TO CLAIM" : "TODAY'S MISSION";
      get("home-daily-text").textContent = next.text;
      get("home-daily-reward").textContent = "+" + next.reward + " CR";
      get("home-daily-bar").style.width = Math.min(100, next.progress / next.target * 100) + "%";
    } else {
      get("home-daily-label").textContent = "TODAY'S MISSION";
      get("home-daily-text").textContent = "All daily missions complete";
      get("home-daily-reward").textContent = "DONE";
      get("home-daily-bar").style.width = "100%";
    }

    get("home-avatar").className = "avatar avatar-" + save.profile.avatar;

    const profileAvatar = document.getElementById("profile-avatar");
    if (profileAvatar) profileAvatar.className = "avatar avatar-profile avatar-" + save.profile.avatar;
  },

  applySettings() {
    document.documentElement.classList.toggle("no-motion", !save.settings.motion);
    document.documentElement.classList.toggle("vivid", !!save.settings.vivid);               // HDR-style colour boost
    document.documentElement.style.setProperty("--hud", String(save.settings.hud / 100));    // on-screen button size
    document.querySelectorAll(".seg[data-setting]").forEach(function (group) {
      const key = group.dataset.setting;
      const current = String(typeof save.settings[key] === "boolean" ? (save.settings[key] ? 1 : 0) : save.settings[key]);
      group.querySelectorAll("button").forEach(function (button) {
        const on = button.dataset.value === current;
        button.classList.toggle("on", on);
        button.setAttribute("aria-pressed", on ? "true" : "false");
      });
    });
  },

  // keep the settings and pause-menu volume sliders in step with each other
  syncVolumes() {
    const pairs = [["music-vol", "music"], ["pause-music-vol", "music"], ["sfx-vol", "sfx"], ["pause-sfx-vol", "sfx"]];
    pairs.forEach(function (pair) {
      const input = document.getElementById(pair[0]);
      if (input) input.value = Math.round(save.settings[pair[1]] * 100);
    });
    document.getElementById("music-value").textContent = Math.round(save.settings.music * 100) + "%";
    document.getElementById("sfx-value").textContent = Math.round(save.settings.sfx * 100) + "%";
  },

  syncPause() { this.syncVolumes(); },

  showEnd(title, lines, actions) {
    document.getElementById("end-title").textContent = title;

    const stats = document.getElementById("end-stats");
    stats.innerHTML = "";
    lines.forEach(function (line) {
      const item = document.createElement("li");
      item.textContent = line;
      stats.appendChild(item);
    });

    const box = document.getElementById("end-actions");
    box.innerHTML = "";
    actions.forEach(function (action, index) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn " + (index === 0 ? "btn-primary" : "btn-ghost");
      button.textContent = action.label;
      button.addEventListener("click", action.run);
      box.appendChild(button);
    });
    this.show("end");
  },

  buildCampaign() {
    const list = document.getElementById("level-list");
    list.innerHTML = "";
    const unlocked = Math.max(1, Math.min(LEVELS.length, save.unlockedLevel));

    LEVELS.forEach(function (level, index) {
      const number = index + 1;
      const available = number <= unlocked;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mission-card" + (available ? " unlocked" : "") + (number === unlocked ? " current" : "");
      button.disabled = !available;
      button.innerHTML = "<span class='mission-top'><b></b><i class='mission-state'></i></span><strong class='mission-name'></strong><span class='mission-meta'><i></i><b></b></span>";
      button.querySelector(".mission-top b").textContent = "OP " + String(number).padStart(2, "0");
      button.querySelector(".mission-state").textContent = available ? (number === unlocked ? "NEXT" : "OPEN") : "LOCKED";
      button.querySelector(".mission-name").textContent = level.name;
      button.querySelector(".mission-meta i").textContent = level.region;
      button.querySelector(".mission-meta b").textContent = level.difficulty;
      button.title = level.objective;
      button.addEventListener("click", function () { startGame("campaign", index); });
      list.appendChild(button);
    });

    document.getElementById("campaign-progress").innerHTML = String(unlocked).padStart(2, "0") + "<span>/30</span>";
    document.getElementById("campaign-progress-bar").style.width = (unlocked / LEVELS.length * 100) + "%";
  },

  buildWeapons() {
    const list = document.getElementById("weapon-list");
    list.innerHTML = "";
    const icons = { pistol: "◢", rifle: "▰", shotgun: "▱", sniper: "⌁" };
    const categories = { pistol: "SIDEARM / SEMI-AUTOMATIC", rifle: "ASSAULT / FULL-AUTOMATIC", shotgun: "BREACHING / CLOSE RANGE", sniper: "PRECISION / LONG RANGE" };

    WEAPONS.forEach(function (base) {
      const weapon = effectiveWeapon(base);
      const unlocked = save.unlockedWeapons.indexOf(weapon.id) !== -1;
      const selected = save.startWeapon === weapon.id;
      const card = document.createElement("button");
      card.type = "button";
      card.disabled = !unlocked;
      card.className = "weapon-card" + (selected ? " selected" : "") + (!unlocked ? " locked" : "");
      card.innerHTML = "<div class='weapon-art'><span></span></div><h3></h3><p class='weapon-type'></p><div class='weapon-stats'><div class='weapon-stat'><small>DAMAGE</small><strong class='damage'></strong></div><div class='weapon-stat'><small>MAGAZINE</small><strong class='magazine'></strong></div><div class='weapon-stat'><small>FIRE RATE</small><strong class='rate'></strong></div><div class='weapon-stat'><small>RELOAD</small><strong class='reload'></strong></div></div><p class='weapon-tag'></p>";
      card.querySelector(".weapon-art span").textContent = icons[weapon.id];
      card.querySelector("h3").textContent = weapon.name.toUpperCase();
      card.querySelector(".weapon-type").textContent = categories[weapon.id];
      card.querySelector(".damage").textContent = weapon.damage * weapon.pellets;
      card.querySelector(".magazine").textContent = weapon.mag + " ROUNDS";
      card.querySelector(".rate").textContent = (1 / weapon.rate).toFixed(1) + " / SEC";
      card.querySelector(".reload").textContent = weapon.reload.toFixed(1) + " SEC";
      card.querySelector(".weapon-tag").textContent = !unlocked
        ? "LOCKED · CLEAR OPERATION " + WEAPON_UNLOCKS[weapon.id]
        : selected ? "✓ EQUIPPED FOR DEPLOYMENT" : "SELECT AS PRIMARY WEAPON";
      card.addEventListener("click", function () {
        save.startWeapon = weapon.id;
        writeSave();
        UI.buildWeapons();
      });
      list.appendChild(card);
    });
  },

  // ---- upgrades ----
  upgradeRow(def, level, max, buy) {
    const row = document.createElement("div");
    row.className = "up-row";
    const info = document.createElement("span");
    info.className = "up-info";
    const name = document.createElement("strong");
    name.textContent = def.name;
    const desc = document.createElement("small");
    desc.textContent = def.desc;
    info.append(name, desc);

    const pips = document.createElement("span");
    pips.className = "up-pips";
    pips.setAttribute("aria-label", "Level " + level + " of " + max);
    for (let i = 0; i < max; i++) {
      const pip = document.createElement("i");
      if (i < level) pip.className = "on";
      pips.appendChild(pip);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn up-buy";
    if (level >= max) {
      button.textContent = "MAX";
      button.disabled = true;
    } else {
      const price = Progress.cost(def, level);
      button.textContent = price.toLocaleString() + " CR";
      button.classList.toggle("btn-primary", save.coins >= price);
      button.addEventListener("click", function () {
        const result = buy();
        if (result.ok) {
          Sound.play("core");
          UI.buildShop();
          document.getElementById("shop-note").textContent = def.name + " UPGRADED";
        } else if (result.reason === "coins") {
          Sound.play("empty");
          document.getElementById("shop-note").textContent = "NOT ENOUGH CREDITS";
        }
      });
    }
    row.append(info, pips, button);
    return row;
  },

  buildShop() {
    document.getElementById("shop-coins").textContent = save.coins.toLocaleString();
    const op = document.getElementById("shop-operator");
    op.innerHTML = "";
    OPERATOR_UPGRADES.forEach(function (def) {
      op.appendChild(UI.upgradeRow(def, save.upgrades[def.id], OP_UPGRADE_MAX[def.id], function () { return Progress.buyOperator(def.id); }));
    });

    const owned = WEAPONS.filter(function (w) { return save.unlockedWeapons.indexOf(w.id) !== -1; });
    if (!owned.some(function (w) { return w.id === UI.shopWeapon; })) UI.shopWeapon = owned[0].id;

    const tabs = document.getElementById("shop-weapon-tabs");
    tabs.innerHTML = "";
    owned.forEach(function (w) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.textContent = w.name.replace("Assault ", "").replace(" Rifle", "").toUpperCase();
      tab.className = w.id === UI.shopWeapon ? "on" : "";
      tab.addEventListener("click", function () { UI.shopWeapon = w.id; UI.buildShop(); });
      tabs.appendChild(tab);
    });

    const base = WEAPONS[weaponIndex(UI.shopWeapon)];
    const eff = effectiveWeapon(base);
    document.getElementById("shop-weapon-stats").textContent =
      "DMG " + eff.damage * eff.pellets + "  ·  MAG " + eff.mag + "  ·  " + (1 / eff.rate).toFixed(1) + "/SEC";
    const list = document.getElementById("shop-weapon");
    list.innerHTML = "";
    WEAPON_UPGRADES.forEach(function (def) {
      list.appendChild(UI.upgradeRow(def, save.weaponUp[base.id][def.id], WEAPON_UPGRADE_MAX, function () { return Progress.buyWeapon(base.id, def.id); }));
    });
  },

  // ---- daily missions and medals ----
  buildMissions() {
    Progress.ensureDaily();
    const list = document.getElementById("daily-list");
    list.innerHTML = "";
    document.getElementById("daily-day").textContent = save.daily.day;

    save.daily.missions.forEach(function (m, index) {
      const row = document.createElement("div");
      row.className = "daily-row" + (m.claimed ? " claimed" : m.progress >= m.target ? " done" : "");
      const main = document.createElement("span");
      main.className = "daily-main";
      const title = document.createElement("strong");
      title.textContent = m.text;
      const bar = document.createElement("span");
      bar.className = "daily-bar";
      const fill = document.createElement("i");
      fill.style.width = Math.min(100, m.progress / m.target * 100) + "%";
      bar.appendChild(fill);
      const count = document.createElement("small");
      count.textContent = Math.min(m.progress, m.target) + " / " + m.target;
      main.append(title, bar, count);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn daily-claim";
      if (m.claimed) {
        button.textContent = "CLAIMED ✓";
        button.disabled = true;
      } else if (m.progress >= m.target) {
        button.textContent = "CLAIM +" + m.reward + " CR";
        button.classList.add("btn-primary");
        button.addEventListener("click", function () {
          if (Progress.claim(index)) { Sound.play("core"); UI.buildMissions(); }
        });
      } else {
        button.textContent = "+" + m.reward + " CR";
        button.disabled = true;
      }
      row.append(main, button);
      list.appendChild(row);
    });

    const medals = document.getElementById("ach-list");
    medals.innerHTML = "";
    let earned = 0;
    ACHIEVEMENTS.forEach(function (a) {
      const done = !!save.ach[a.id];
      if (done) earned++;
      const item = document.createElement("li");
      item.className = done ? "done" : "";
      const star = document.createElement("i");
      star.textContent = done ? "★" : "☆";
      const text = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = a.name;
      const desc = document.createElement("small");
      desc.textContent = a.desc;
      text.append(name, desc);
      const reward = document.createElement("b");
      reward.textContent = "+" + a.reward;
      item.append(star, text, reward);
      medals.appendChild(item);
    });
    document.getElementById("ach-count").textContent = earned + " / " + ACHIEVEMENTS.length;
  },

  buildProfile() {
    const rank = this.rankDetails();
    document.getElementById("callsign-input").value = save.profile.callsign;
    document.getElementById("profile-rank").textContent = rank.current.name;
    document.getElementById("profile-kills").textContent = save.totalKills.toLocaleString();
    document.getElementById("profile-missions").textContent = save.unlockedLevel + " / 30";
    document.getElementById("profile-score").textContent = save.highScore.toLocaleString();
    document.getElementById("profile-xp").textContent = save.xp.toLocaleString() + " XP";
    document.getElementById("profile-rank-progress").textContent = rank.label;
    document.getElementById("profile-xp-bar").style.width = rank.progress + "%";
    document.querySelectorAll(".avatar-choice").forEach(function (button) {
      button.classList.toggle("chosen", button.dataset.avatar === save.profile.avatar);
    });
    this.refreshHome();
  },

  buildScores() {
    const list = document.getElementById("score-list");
    list.innerHTML = "";
    if (!save.scores.length) {
      const item = document.createElement("li");
      item.textContent = "No field records yet. Complete a deployment to enter the board.";
      list.appendChild(item);
      return;
    }

    save.scores.forEach(function (entry, index) {
      const item = document.createElement("li");
      const rank = document.createElement("strong");
      const details = document.createElement("span");
      const score = document.createElement("strong");
      rank.className = "score-rank";
      details.className = "score-details";
      score.className = "score-value";
      rank.textContent = String(index + 1).padStart(2, "0");
      details.textContent = entry.mode + " · " + entry.date;
      score.textContent = Number(entry.score).toLocaleString();
      item.append(rank, details, score);
      list.appendChild(item);
    });
  },

  openProfile() {
    this.buildProfile();
    this.show("profile");
  },

  init() {
    // Both the settings screen and the pause menu have volume sliders.
    [["music-vol", "music"], ["pause-music-vol", "music"], ["sfx-vol", "sfx"], ["pause-sfx-vol", "sfx"]].forEach(function (pair) {
      document.getElementById(pair[0]).addEventListener("input", function (event) {
        save.settings[pair[1]] = Number(event.target.value) / 100;
        Sound.init();
        Sound.setVolumes();
        UI.syncVolumes();
        if (pair[1] === "sfx" && save.settings.sfx > 0) Sound.play("pickup");
        writeSave();
      });
    });

    // ON/OFF and frame-rate buttons in the settings screen
    document.querySelectorAll(".seg[data-setting]").forEach(function (group) {
      group.addEventListener("click", function (event) {
        const button = event.target.closest("button");
        if (!button) return;
        const key = group.dataset.setting;
        const value = Number(button.dataset.value);
        save.settings[key] = typeof defaultSave().settings[key] === "boolean" ? value === 1 : value;
        writeSave();
        UI.applySettings();
        if (key === "resolution") resizeGameCanvas();
        Sound.init();
        Sound.play("switch");
        if (key === "haptics" && save.settings.haptics) Haptics.buzz(30);
      });
    });
    UI.syncVolumes();
    UI.applySettings();

    const profileForm = document.getElementById("profile-form");
    const callsignInput = document.getElementById("callsign-input");
    const profileFeedback = document.getElementById("profile-feedback");

    // Saving through a form supports both the button and the Enter key.
    profileForm.addEventListener("submit", function (event) {
      event.preventDefault();

      const callsign = callsignInput.value
        .replace(/[^a-z0-9 _-]/gi, "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 16)
        .toUpperCase();

      if (!callsign) {
        profileFeedback.textContent = "ENTER A NAME BEFORE SAVING";
        callsignInput.focus();
        return;
      }

      save.profile.callsign = callsign;
      const saved = writeSave();
      UI.buildProfile();
      profileFeedback.textContent = saved
        ? "PLAYER NAME SAVED — " + callsign
        : "NAME UPDATED FOR THIS SESSION, BUT THIS DEVICE BLOCKED SAVING IT.";
    });

    callsignInput.addEventListener("input", function () {
      profileFeedback.textContent = "UNSAVED NAME CHANGE";
    });

    document.querySelectorAll(".avatar-choice").forEach(function (button) {
      button.addEventListener("click", function () {
        save.profile.avatar = button.dataset.avatar;
        writeSave();
        UI.buildProfile();
        document.getElementById("profile-feedback").textContent = "FIELD COLOURS UPDATED";
      });
    });

    const actions = {
      campaign: function () { UI.buildCampaign(); UI.show("campaign"); },
      continue: function () { startGame("campaign", Math.max(1, Math.min(LEVELS.length, save.unlockedLevel)) - 1); },
      survival: function () { startGame("survival"); },
      timeattack: function () { startGame("timeattack"); },
      training: function () { startGame("training"); },
      weapons: function () { UI.buildWeapons(); UI.show("weapons"); },
      shop: function () { UI.buildShop(); document.getElementById("shop-note").textContent = "EARN CREDITS BY ELIMINATING ENEMIES AND CLEARING MISSIONS"; UI.show("shop"); },
      missions: function () { UI.buildMissions(); UI.show("missions"); },
      tutorialGo: function () {
        save.tutorialDone = true;
        writeSave();
        const next = pendingStart;
        pendingStart = null;
        if (next) startGame(next[0], next[1]);
        else UI.show("menu");
      },
      profile: function () { UI.openProfile(); },
      settings: function () { UI.show("settings"); },
      instructions: function () { UI.show("instructions"); },
      leaderboard: function () { UI.buildScores(); UI.show("leaderboard"); },
      back: function () { UI.show("menu"); },
      resume: resumeGame,
      restart: function () { startGame(G.mode, G.level); },
      quit: quitToMenu,
      reset: function () {
        if (!confirm("Delete all local campaign progress, operator details and records?")) return;
        save = defaultSave();
        writeSave();
        Sound.setVolumes();
        UI.syncVolumes();
        UI.applySettings();
        UI.refreshHome();
      }
    };

    // One delegated listener keeps all screen navigation in one place.
    document.getElementById("stage").addEventListener("click", function (event) {
      const button = event.target.closest("[data-action]");
      if (!button || !actions[button.dataset.action]) return;
      Sound.init();
      actions[button.dataset.action]();
    });

    this.show("menu");
  }
};
