// online.js - accounts, cloud save, the world leaderboard and anonymous usage statistics.
// The game always works offline: every call here fails quietly when there is no internet.

const Online = {
  deviceId: "",
  token: "",
  username: "",
  queue: [],
  lastPush: 0,
  lastSync: 0,
  fields: ["xp", "totalKills", "coins", "highScore", "unlockedLevel", "finalCleared", "startWeapon", "unlockedWeapons", "upgrades", "weaponUp", "ach", "stats", "profile"],

  init: function () {
    const self = this;
    this.deviceId = this.read("pewops-device");
    if (!this.deviceId) {
      this.deviceId = window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(16).slice(2, 12);
      this.write("pewops-device", this.deviceId);
    }
    try {
      const auth = JSON.parse(this.read("pewops-auth") || "null");
      if (auth && auth.token) { this.token = auth.token; this.username = auth.username || ""; }
    } catch (error) { /* an unreadable login just means the player is logged out */ }

    this.track("app_open");
    setInterval(function () { self.flush(); }, 20000);
    document.addEventListener("visibilitychange", function () { if (document.hidden) self.flush(); });
    if (this.token) this.syncDown(true);
  },

  read: function (key) { try { return localStorage.getItem(key) || ""; } catch (error) { return ""; } },
  write: function (key, value) { try { localStorage.setItem(key, value); } catch (error) { /* storage can be blocked */ } },
  remove: function (key) { try { localStorage.removeItem(key); } catch (error) { /* nothing to do */ } },

  platform: function () {
    const cap = window.Capacitor;
    const name = cap && typeof cap.getPlatform === "function" ? cap.getPlatform() : "web";
    return name === "android" || name === "ios" ? name : "web";
  },

  loggedIn: function () { return !!this.token; },

  /* ---------- anonymous usage statistics (can be switched off in the account screen) ---------- */

  track: function (name, mode, value) {
    if (save.settings.stats === false) return;
    this.queue.push({ name: name, mode: mode || null, value: value || 0 });
    if (this.queue.length >= 15) this.flush();
  },

  flush: function () {
    if (!this.queue.length) return;
    if (save.settings.stats === false) { this.queue.length = 0; return; }
    const batch = this.queue.splice(0, 30);
    try {
      fetch(API_URL + "/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ device_id: this.deviceId, platform: this.platform(), version: APP_VERSION, events: batch })
      }).catch(function () { /* statistics are best-effort */ });
    } catch (error) { /* ignore */ }
  },

  /* ---------- talking to the server ---------- */

  request: function (method, path, body) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, 9000) : null;
    const headers = { "content-type": "application/json" };
    if (this.token) headers.authorization = "Bearer " + this.token;
    return fetch(API_URL + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, signal: controller ? controller.signal : undefined })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) { return { ok: response.ok, status: response.status, data: data }; });
      })
      .catch(function () { return { ok: false, status: 0, data: { error: "Cannot reach the server. Check your internet connection." } }; })
      .then(function (result) { if (timer) clearTimeout(timer); return result; });
  },

  setAuth: function (token, user) {
    this.token = token;
    this.username = user.username;
    this.write("pewops-auth", JSON.stringify({ token: token, username: user.username }));
  },

  signUp: function (username, password) { return this.enter("/api/register", username, password, "account_created"); },
  logIn: function (username, password) { return this.enter("/api/login", username, password, "login"); },

  enter: function (path, username, password, eventName) {
    const self = this;
    return this.request("POST", path, { username: username, password: password, device_id: this.deviceId }).then(function (result) {
      if (result.ok && result.data.token) {
        self.setAuth(result.data.token, result.data.user);
        self.track(eventName);
        return self.syncDown(false).then(function (note) { result.note = note; return result; });
      }
      return result;
    });
  },

  logOut: function () {
    this.token = "";
    this.username = "";
    this.remove("pewops-auth");
  },

  deleteAccount: function (password) {
    const self = this;
    return this.request("POST", "/api/account", { password: password }).then(function (result) {
      if (result.ok) self.logOut();
      return result;
    });
  },

  /* ---------- cloud save: the copy with more XP wins ---------- */

  snapshot: function () {
    const out = {};
    this.fields.forEach(function (key) { out[key] = save[key]; });
    return out;
  },

  // returns a short sentence describing what happened
  syncDown: function (quiet) {
    const self = this;
    if (!this.token) return Promise.resolve("Not logged in.");
    return this.request("GET", "/api/me").then(function (result) {
      if (result.status === 401) { self.logOut(); return "Your login expired. Please log in again."; }
      if (!result.ok) return quiet ? "" : result.data.error || "Sync failed.";
      self.username = result.data.user.username;
      const cloud = result.data.save;
      self.lastSync = Date.now();
      if (cloud && Number(cloud.xp) > save.xp) {
        const merged = Object.assign({}, save);
        self.fields.forEach(function (key) { if (cloud[key] !== undefined) merged[key] = cloud[key]; });
        Online.write(SAVE_KEY, JSON.stringify(merged));
        save = loadSave();                       // loadSave cleans and limits every value
        if (typeof UI !== "undefined") UI.refreshHome();
        return "Progress loaded from your online account.";
      }
      return self.pushSave(true).then(function () { return "Progress saved online."; });
    });
  },

  pushSave: function (force) {
    const self = this;
    if (!this.token) return Promise.resolve();
    if (!force && Date.now() - this.lastPush < 10000) return Promise.resolve();
    this.lastPush = Date.now();
    return this.request("PUT", "/api/save", { save: this.snapshot() }).then(function (result) {
      if (result.status === 401) self.logOut();
      else if (result.ok) self.lastSync = Date.now();
    });
  },

  // called when a run ends
  afterRun: function (mode, score, kills) {
    this.track("game_end", mode, Math.floor(score));
    if (!this.token) return;
    if (["survival", "timeattack", "campaign"].indexOf(mode) !== -1) {
      this.request("POST", "/api/score", { mode: mode, score: Math.floor(score), kills: kills });
    }
    this.pushSave(true);
  },

  leaderboard: function (mode) {
    return this.request("GET", "/api/leaderboard?mode=" + encodeURIComponent(mode) + "&limit=20");
  }
};
