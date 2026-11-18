// ui.js - command screens, operator profile, loadout and saved records.

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

const UI = {
  current: "menu",

  show(id) {
    this.current = id;
    document.querySelectorAll(".screen").forEach(function (screen) {
      screen.hidden = screen.id !== id;
    });
    if (id === "menu") this.refreshHome();
  },

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
    const callsign = save.profile.callsign || "ROOKIE";
    const rank = this.rankDetails();
    const weapon = WEAPONS[weaponIndex(save.startWeapon)] || WEAPONS[0];
    const missions = save.unlockedLevel;

    document.getElementById("home-callsign").textContent = callsign;
    document.getElementById("home-rank").textContent = rank.current.name;
    document.getElementById("home-xp").textContent = save.xp.toLocaleString() + " XP EARNED";
    document.getElementById("home-next-rank").textContent = rank.next ? rank.next.xp.toLocaleString() + " XP" : "MAX RANK";
    document.getElementById("home-xp-bar").style.width = rank.progress + "%";
    document.getElementById("home-missions").innerHTML = String(missions).padStart(2, "0") + "<span>/30</span>";
    document.getElementById("home-kills").textContent = String(save.totalKills).padStart(3, "0");
    document.getElementById("home-weapon").textContent = weapon.name.toUpperCase();
    document.getElementById("home-weapon-icon").textContent = ({ pistol: "◢", rifle: "▰", shotgun: "▱", sniper: "⌁" })[weapon.id] || "▰";

    const homeAvatar = document.getElementById("home-avatar");
    homeAvatar.className = "avatar avatar-scout avatar-" + save.profile.avatar;

    const operatorAvatar = document.getElementById("home-operator-avatar");
    if (operatorAvatar) {
      operatorAvatar.className = "operator-portrait avatar avatar-large avatar-" + save.profile.avatar;
    }

    const profileAvatar = document.getElementById("profile-avatar");
    if (profileAvatar) profileAvatar.className = "avatar avatar-profile avatar-" + save.profile.avatar;
  },

  syncPause() {},

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

    WEAPONS.forEach(function (weapon) {
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
    const music = document.getElementById("music-vol");
    const sfx = document.getElementById("sfx-vol");
    const setAudioLabels = function () {
      document.getElementById("music-value").textContent = music.value + "%";
      document.getElementById("sfx-value").textContent = sfx.value + "%";
    };

    music.value = Math.round(save.settings.music * 100);
    sfx.value = Math.round(save.settings.sfx * 100);
    setAudioLabels();

    music.addEventListener("input", function () {
      save.settings.music = Number(music.value) / 100;
      Sound.init();
      Sound.setVolumes();
      setAudioLabels();
      writeSave();
    });
    sfx.addEventListener("input", function () {
      save.settings.sfx = Number(sfx.value) / 100;
      Sound.init();
      Sound.setVolumes();
      setAudioLabels();
      if (save.settings.sfx > 0) Sound.play("pickup");
      writeSave();
    });

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
      survival: function () { startGame("survival"); },
      timeattack: function () { startGame("timeattack"); },
      training: function () { startGame("training"); },
      weapons: function () { UI.buildWeapons(); UI.show("weapons"); },
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
        music.value = Math.round(save.settings.music * 100);
        sfx.value = Math.round(save.settings.sfx * 100);
        setAudioLabels();
        Sound.setVolumes();
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
