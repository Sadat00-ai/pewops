// PewOps server: accounts, cloud save, leaderboard and anonymous usage statistics.
// It runs on Cloudflare Workers with a D1 (SQLite) database. See server/README.md.

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-max-age": "86400"
};
const MODES = ["survival", "timeattack", "campaign"];
const EVENT_NAMES = ["app_open", "game_start", "game_end", "surge", "level_clear", "account_created", "login"];
const WEAPONS = ["pistol", "rifle", "shotgun", "sniper"];
const AVATARS = ["scout", "desert", "navy", "crimson"];
const TOKEN_DAYS = 30;
const enc = new TextEncoder();

/* ---------- small helpers ---------- */

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status: status, headers: Object.assign({ "content-type": "application/json" }, CORS, headers) });
}
function fail(message, status = 400) { return json({ error: message }, status); }

function toB64(bytes) {
  const arr = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}
function fromB64(text) { return Uint8Array.from(atob(text), function (c) { return c.charCodeAt(0); }); }
function toB64Url(bytes) { return toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function fromB64Url(text) { return fromB64(text.replace(/-/g, "+").replace(/_/g, "/")); }

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// The Dhaka calendar day (UTC+6), so "today" in the dashboard matches the owner's day.
function dhakaDay(ms) { return new Date(ms + 6 * 3600 * 1000).toISOString().slice(0, 10); }

async function readJson(request) {
  try { return await request.json(); } catch (error) { return {}; }
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: 100000 }, key, 256);
  return toB64(bits);
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toB64Url(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}

async function makeToken(env, user) {
  const head = toB64Url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = toB64Url(enc.encode(JSON.stringify({ uid: user.id, name: user.username, exp: Math.floor(Date.now() / 1000) + TOKEN_DAYS * 86400 })));
  return head + "." + body + "." + await hmac(env.JWT_SECRET, head + "." + body);
}

async function readToken(env, request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = await hmac(env.JWT_SECRET, parts[0] + "." + parts[1]);
  if (!sameText(expected, parts[2])) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromB64Url(parts[1])));
    if (!claims.uid || claims.exp < Date.now() / 1000) return null;
    return { id: claims.uid, username: claims.name };
  } catch (error) { return null; }
}

// at most `max` calls per `seconds` for one key (an IP address or an account)
async function limited(env, key, max, seconds) {
  const now = Date.now();
  const row = await env.DB.prepare("SELECT n, reset_at FROM rate WHERE key = ?").bind(key).first();
  if (!row || row.reset_at < now) {
    await env.DB.prepare("INSERT INTO rate (key, n, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET n = 1, reset_at = excluded.reset_at").bind(key, now + seconds * 1000).run();
    return false;
  }
  if (row.n >= max) return true;
  await env.DB.prepare("UPDATE rate SET n = n + 1 WHERE key = ?").bind(key).run();
  return false;
}

function clientIp(request) { return request.headers.get("cf-connecting-ip") || "unknown"; }

/* ---------- save data ---------- */

function clampInt(value, max) { return Math.max(0, Math.min(max, Math.floor(Number(value) || 0))); }

// only known fields with sane limits are stored, so a bad client cannot fill the database
function cleanSave(s) {
  s = s && typeof s === "object" ? s : {};
  const out = {
    xp: clampInt(s.xp, 1e9),
    totalKills: clampInt(s.totalKills, 1e9),
    coins: clampInt(s.coins, 1e9),
    highScore: clampInt(s.highScore, 1e10),
    unlockedLevel: Math.max(1, clampInt(s.unlockedLevel, 30)),
    finalCleared: s.finalCleared === true,
    startWeapon: WEAPONS.indexOf(s.startWeapon) !== -1 ? s.startWeapon : "pistol",
    unlockedWeapons: (Array.isArray(s.unlockedWeapons) ? s.unlockedWeapons : []).filter(function (w) { return WEAPONS.indexOf(w) !== -1; }),
    upgrades: {},
    weaponUp: {},
    ach: {},
    stats: {}
  };
  if (out.unlockedWeapons.indexOf("pistol") === -1) out.unlockedWeapons.unshift("pistol");
  const up = s.upgrades || {};
  out.upgrades = { hp: clampInt(up.hp, 5), charge: clampInt(up.charge, 5), grenades: clampInt(up.grenades, 3), cores: clampInt(up.cores, 3) };
  WEAPONS.forEach(function (w) {
    const src = (s.weaponUp && s.weaponUp[w]) || {};
    out.weaponUp[w] = { dmg: clampInt(src.dmg, 5), mag: clampInt(src.mag, 5), rate: clampInt(src.rate, 5) };
  });
  Object.keys(s.ach || {}).slice(0, 40).forEach(function (k) { if (/^[a-z_]{1,24}$/.test(k) && s.ach[k] === true) out.ach[k] = true; });
  ["surges", "dashes", "cores", "bossKills", "coinsEarned", "lastStands", "bestCombo"].forEach(function (k) { out.stats[k] = clampInt((s.stats || {})[k], 1e9); });
  const p = s.profile || {};
  out.profile = {
    callsign: String(p.callsign || "ROOKIE").replace(/[^A-Za-z0-9 _-]/g, "").slice(0, 12) || "ROOKIE",
    avatar: AVATARS.indexOf(p.avatar) !== -1 ? p.avatar : "scout"
  };
  return out;
}

/* ---------- account routes ---------- */

async function linkDevice(env, deviceId, userId) {
  if (typeof deviceId === "string" && /^[A-Za-z0-9-]{8,64}$/.test(deviceId)) {
    await env.DB.prepare("UPDATE devices SET user_id = ? WHERE device_id = ?").bind(userId, deviceId).run();
  }
}

async function register(request, env) {
  const body = await readJson(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) return fail("Username must be 3 to 16 letters, numbers or underscores.");
  if (password.length < 6 || password.length > 72) return fail("Password must be 6 to 72 characters.");
  if (await limited(env, "reg:" + clientIp(request), 6, 3600)) return fail("Too many sign-ups from this network. Try again later.", 429);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt);
  const now = Date.now();
  let id;
  try {
    const result = await env.DB.prepare("INSERT INTO users (username, username_lc, pass_hash, salt, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(username, username.toLowerCase(), hash, toB64(salt), now, now).run();
    id = result.meta.last_row_id;
  } catch (error) {
    if (/UNIQUE/i.test(String(error))) return fail("That username is taken.", 409);
    throw error;
  }
  await linkDevice(env, body.device_id, id);
  const user = { id: id, username: username };
  return json({ token: await makeToken(env, user), user: user });
}

async function login(request, env) {
  const body = await readJson(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (await limited(env, "login:" + clientIp(request), 25, 600)) return fail("Too many attempts. Try again in a few minutes.", 429);
  const row = await env.DB.prepare("SELECT id, username, pass_hash, salt FROM users WHERE username_lc = ?").bind(username.toLowerCase()).first();
  if (!row) return fail("Wrong username or password.", 401);
  const hash = await hashPassword(password, fromB64(row.salt));
  if (!sameText(hash, row.pass_hash)) return fail("Wrong username or password.", 401);
  await env.DB.prepare("UPDATE users SET last_login = ? WHERE id = ?").bind(Date.now(), row.id).run();
  await linkDevice(env, body.device_id, row.id);
  const user = { id: row.id, username: row.username };
  return json({ token: await makeToken(env, user), user: user });
}

async function me(request, env, who) {
  const row = await env.DB.prepare("SELECT username, save, save_updated FROM users WHERE id = ?").bind(who.id).first();
  if (!row) return fail("Account not found.", 404);
  let save = null;
  try { save = row.save ? JSON.parse(row.save) : null; } catch (error) { save = null; }
  return json({ user: { id: who.id, username: row.username }, save: save, save_updated: row.save_updated || 0 });
}

async function putSave(request, env, who) {
  const text = await request.text();
  if (text.length > 40000) return fail("Save is too large.", 413);
  let body;
  try { body = JSON.parse(text); } catch (error) { return fail("Bad data."); }
  if (await limited(env, "save:" + who.id, 120, 3600)) return fail("Saving too often.", 429);
  const clean = cleanSave(body.save);
  const now = Date.now();
  await env.DB.prepare("UPDATE users SET save = ?, save_updated = ? WHERE id = ?").bind(JSON.stringify(clean), now, who.id).run();
  return json({ ok: true, save_updated: now });
}

async function postScore(request, env, who) {
  const body = await readJson(request);
  if (MODES.indexOf(body.mode) === -1) return fail("Unknown mode.");
  const score = clampInt(body.score, 1e9);
  const kills = clampInt(body.kills, 1e5);
  if (await limited(env, "score:" + who.id, 120, 3600)) return fail("Too many scores.", 429);
  await env.DB.prepare(
    "INSERT INTO scores (user_id, mode, score, kills, updated_at) VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT(user_id, mode) DO UPDATE SET " +
    "kills = CASE WHEN excluded.score > scores.score THEN excluded.kills ELSE scores.kills END, " +
    "score = MAX(scores.score, excluded.score), updated_at = excluded.updated_at"
  ).bind(who.id, body.mode, score, kills, Date.now()).run();
  return json({ ok: true });
}

async function leaderboard(request, env) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "survival";
  if (MODES.indexOf(mode) === -1) return fail("Unknown mode.");
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit")) || 20));
  const rows = await env.DB.prepare("SELECT u.username AS name, s.score AS score, s.kills AS kills FROM scores s JOIN users u ON u.id = s.user_id WHERE s.mode = ? ORDER BY s.score DESC LIMIT ?").bind(mode, limit).all();
  let mine = null;
  const who = await readToken(env, request);
  if (who) {
    const row = await env.DB.prepare("SELECT score FROM scores WHERE user_id = ? AND mode = ?").bind(who.id, mode).first();
    if (row) {
      const rank = await env.DB.prepare("SELECT COUNT(*) + 1 AS rank FROM scores WHERE mode = ? AND score > ?").bind(mode, row.score).first();
      mine = { name: who.username, score: row.score, rank: rank.rank };
    }
  }
  return json({ mode: mode, rows: rows.results, mine: mine }, 200, { "cache-control": "no-store" });
}

async function deleteAccount(request, env, who) {
  const body = await readJson(request);
  const row = await env.DB.prepare("SELECT pass_hash, salt FROM users WHERE id = ?").bind(who.id).first();
  if (!row) return json({ ok: true });
  const hash = await hashPassword(String(body.password || ""), fromB64(row.salt));
  if (!sameText(hash, row.pass_hash)) return fail("Wrong password.", 401);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM scores WHERE user_id = ?").bind(who.id),
    env.DB.prepare("UPDATE devices SET user_id = NULL WHERE user_id = ?").bind(who.id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(who.id)
  ]);
  return json({ ok: true });
}

/* ---------- anonymous usage statistics ---------- */

async function postEvents(request, env) {
  const text = await request.text();
  if (text.length > 8000) return fail("Too much data.", 413);
  let body;
  try { body = JSON.parse(text); } catch (error) { return fail("Bad data."); }
  const deviceId = String(body.device_id || "");
  if (!/^[A-Za-z0-9-]{8,64}$/.test(deviceId)) return fail("Bad device id.");
  const list = (Array.isArray(body.events) ? body.events : []).filter(function (e) { return e && EVENT_NAMES.indexOf(e.name) !== -1; }).slice(0, 30);
  if (!list.length) return json({ ok: true });
  if (await limited(env, "ev:" + deviceId, 200, 3600)) return json({ ok: true });

  const now = Date.now();
  const country = (request.cf && request.cf.country) || "";
  const platform = ["android", "ios", "web"].indexOf(body.platform) !== -1 ? body.platform : "web";
  const version = String(body.version || "").replace(/[^0-9A-Za-z.\-]/g, "").slice(0, 12);
  const statements = [
    env.DB.prepare("INSERT INTO devices (device_id, first_seen, first_day, last_seen, country, platform, version) VALUES (?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(device_id) DO UPDATE SET last_seen = excluded.last_seen, country = excluded.country, platform = excluded.platform, version = excluded.version")
      .bind(deviceId, now, dhakaDay(now), now, country, platform, version)
  ];
  list.forEach(function (e) {
    const mode = MODES.indexOf(e.mode) !== -1 || e.mode === "training" ? e.mode : null;
    statements.push(env.DB.prepare("INSERT INTO events (ts, day, device_id, name, mode, value) VALUES (?, ?, ?, ?, ?, ?)").bind(now, dhakaDay(now), deviceId, e.name, mode, clampInt(e.value, 1e9)));
  });
  await env.DB.batch(statements);
  return json({ ok: true });
}

let downloadsCache = { at: 0, value: null };
async function githubDownloads(env) {
  if (downloadsCache.value && Date.now() - downloadsCache.at < 600000) return downloadsCache.value;
  const value = { total: 0, releases: [], error: null };
  try {
    const response = await fetch("https://api.github.com/repos/" + env.GITHUB_REPO + "/releases?per_page=30", { headers: { "user-agent": "pewops-server", accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error("GitHub answered " + response.status);
    const releases = await response.json();
    value.releases = releases.map(function (r) {
      let apk = 0;
      let aab = 0;
      (r.assets || []).forEach(function (a) { if (/\.apk$/.test(a.name)) apk += a.download_count; else if (/\.aab$/.test(a.name)) aab += a.download_count; });
      return { tag: r.tag_name, apk: apk, aab: aab };
    });
    value.total = value.releases.reduce(function (sum, r) { return sum + r.apk; }, 0);   // only the APK is a direct install; the bundle is for the Play Store
  } catch (error) { value.error = String(error.message || error); }
  downloadsCache = { at: Date.now(), value: value };
  return value;
}

async function stats(env) {
  const now = Date.now();
  const today = dhakaDay(now);
  const ago = function (days) { return dhakaDay(now - days * 86400000); };
  const prepare = function (sql, args) { const st = env.DB.prepare(sql); return args && args.length ? st.bind.apply(st, args) : st; };
  const one = async function (sql, args) { const row = await prepare(sql, args).first(); return row ? row.c : 0; };
  const all = async function (sql, args) { const r = await prepare(sql, args).all(); return r.results; };

  const out = await Promise.all([
    one("SELECT COUNT(*) AS c FROM users"),
    one("SELECT COUNT(*) AS c FROM devices"),
    one("SELECT COUNT(*) AS c FROM devices WHERE last_seen > ?", [now - 5 * 60000]),
    one("SELECT COUNT(DISTINCT device_id) AS c FROM events WHERE day = ?", [today]),
    one("SELECT COUNT(DISTINCT device_id) AS c FROM events WHERE day >= ?", [ago(6)]),
    one("SELECT COUNT(DISTINCT device_id) AS c FROM events WHERE day >= ?", [ago(29)]),
    all("SELECT day, COUNT(DISTINCT device_id) AS active FROM events WHERE day >= ? GROUP BY day", [ago(13)]),
    all("SELECT first_day AS day, COUNT(*) AS fresh FROM devices WHERE first_day >= ? GROUP BY first_day", [ago(13)]),
    all("SELECT day, COUNT(*) AS plays FROM events WHERE name = 'game_start' AND day >= ? GROUP BY day", [ago(13)]),
    all("SELECT COALESCE(mode, 'other') AS mode, COUNT(*) AS plays FROM events WHERE name = 'game_start' AND day >= ? GROUP BY mode ORDER BY plays DESC", [ago(6)]),
    all("SELECT COALESCE(NULLIF(country, ''), '??') AS country, COUNT(*) AS players FROM devices GROUP BY country ORDER BY players DESC LIMIT 10"),
    all("SELECT COALESCE(NULLIF(version, ''), '?') AS version, COUNT(*) AS players FROM devices WHERE last_seen > ? GROUP BY version ORDER BY players DESC LIMIT 8", [now - 14 * 86400000]),
    one("SELECT COUNT(*) AS c FROM devices WHERE first_day = ?", [ago(1)]),
    one("SELECT COUNT(*) AS c FROM devices d WHERE d.first_day = ? AND EXISTS (SELECT 1 FROM events e WHERE e.device_id = d.device_id AND e.day = ?)", [ago(1), today]),
    one("SELECT COUNT(*) AS c FROM devices WHERE first_day = ?", [ago(7)]),
    one("SELECT COUNT(*) AS c FROM devices d WHERE d.first_day = ? AND EXISTS (SELECT 1 FROM events e WHERE e.device_id = d.device_id AND e.day = ?)", [ago(7), today]),
    one("SELECT COUNT(*) AS c FROM events WHERE name = 'game_start'"),
    githubDownloads(env)
  ]);
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(ago(i));
  const pick = function (rows, key) { const m = {}; rows.forEach(function (r) { m[r.day] = r[key]; }); return days.map(function (d) { return m[d] || 0; }); };
  return {
    generated: now,
    today: today,
    accounts: out[0],
    devices: out[1],
    online_now: out[2],
    active_today: out[3],
    active_7d: out[4],
    active_30d: out[5],
    days: days,
    series: { active: pick(out[6], "active"), new_devices: pick(out[7], "fresh"), plays: pick(out[8], "plays") },
    modes: out[9],
    countries: out[10],
    versions: out[11],
    retention: { d1_cohort: out[12], d1_back: out[13], d7_cohort: out[14], d7_back: out[15] },
    total_plays: out[16],
    downloads: out[17]
  };
}

function isAdmin(request, env) {
  const header = request.headers.get("authorization") || "";
  const key = header.startsWith("Bearer ") ? header.slice(7) : "";
  return !!env.ADMIN_KEY && sameText(key, env.ADMIN_KEY);
}

/* ---------- the owner's dashboard page ---------- */

const ADMIN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>PewOps control room</title>
<style>
:root{color-scheme:dark;--bg:#0a100c;--card:#131c16;--line:#2a3a2f;--text:#e8eee2;--muted:#8a9a8c;--lime:#c4df82;--hot:#ff9d3d}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,sans-serif;padding:16px;max-width:1100px;margin:auto}
h1{font-size:22px;letter-spacing:.08em;margin:6px 0 2px}h1 em{color:var(--hot);font-style:normal}small,.muted{color:var(--muted)}
.row{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}input{flex:1;min-width:200px;padding:10px;background:#0e1510;border:1px solid var(--line);color:var(--text);border-radius:6px}
button{padding:10px 16px;background:var(--lime);color:#10180f;border:0;border-radius:6px;font-weight:700;cursor:pointer}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px}
.card b{display:block;font-size:26px;color:var(--lime)}.card span{font-size:11px;letter-spacing:.1em;color:var(--muted);text-transform:uppercase}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-top:12px}
.box{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px}.box h2{margin:0 0 8px;font-size:13px;letter-spacing:.12em;color:var(--hot);text-transform:uppercase}
table{width:100%;border-collapse:collapse}td,th{padding:4px 6px;text-align:left;border-bottom:1px solid var(--line)}th{color:var(--muted);font-weight:600;font-size:12px}
.bar{display:inline-block;height:10px;background:var(--lime);border-radius:2px;vertical-align:middle}.err{color:#ff7a6a}
</style></head><body>
<h1>PEW<em>OPS</em> CONTROL ROOM</h1><small id="stamp">Enter your admin key.</small>
<div class="row"><input id="key" type="password" placeholder="Admin key" autocomplete="off"><button id="go">Open</button></div>
<div id="out"></div>
<script>
var keyBox=document.getElementById('key'),out=document.getElementById('out'),stamp=document.getElementById('stamp'),timer=null;
keyBox.value=localStorage.getItem('pewops-admin')||'';
function n(v){return Number(v||0).toLocaleString()}
function bars(days,vals){var m=Math.max.apply(null,vals.concat([1]));return '<table>'+days.map(function(d,i){return '<tr><td>'+d.slice(5)+'</td><td><span class="bar" style="width:'+Math.round(vals[i]/m*100)+'%"></span></td><td>'+n(vals[i])+'</td></tr>'}).join('')+'</table>'}
function list(rows,a,b){return '<table>'+(rows.length?rows.map(function(r){return '<tr><td>'+r[a]+'</td><td>'+n(r[b])+'</td></tr>'}).join(''):'<tr><td class="muted">No data yet</td></tr>')+'</table>'}
function pct(a,b){return b?Math.round(a/b*100)+'% ('+a+' of '+b+')':'no players in that group yet'}
function draw(s){
 var d=s.downloads,dl=d.error?'<span class="err">GitHub: '+d.error+'</span>':'<table><tr><th>Version</th><th>APK</th><th>AAB</th></tr>'+d.releases.map(function(r){return '<tr><td>'+r.tag+'</td><td>'+n(r.apk)+'</td><td>'+n(r.aab)+'</td></tr>'}).join('')+'</table>';
 out.innerHTML='<div class="cards">'
 +'<div class="card"><b>'+n(s.online_now)+'</b><span>Playing now (5 min)</span></div>'
 +'<div class="card"><b>'+n(s.active_today)+'</b><span>Active today</span></div>'
 +'<div class="card"><b>'+n(s.active_7d)+'</b><span>Active 7 days</span></div>'
 +'<div class="card"><b>'+n(s.active_30d)+'</b><span>Active 30 days</span></div>'
 +'<div class="card"><b>'+n(s.devices)+'</b><span>Devices seen</span></div>'
 +'<div class="card"><b>'+n(s.accounts)+'</b><span>Accounts</span></div>'
 +'<div class="card"><b>'+n(s.total_plays)+'</b><span>Games started</span></div>'
 +'<div class="card"><b>'+n(d.total)+'</b><span>APK downloads (GitHub)</span></div></div>'
 +'<div class="grid"><div class="box"><h2>Active players per day</h2>'+bars(s.days,s.series.active)+'</div>'
 +'<div class="box"><h2>New devices per day</h2>'+bars(s.days,s.series.new_devices)+'</div>'
 +'<div class="box"><h2>Games started per day</h2>'+bars(s.days,s.series.plays)+'</div>'
 +'<div class="box"><h2>Modes (7 days)</h2>'+list(s.modes,'mode','plays')+'</div>'
 +'<div class="box"><h2>Countries</h2>'+list(s.countries,'country','players')+'</div>'
 +'<div class="box"><h2>Versions in use (14 days)</h2>'+list(s.versions,'version','players')+'</div>'
 +'<div class="box"><h2>Players coming back</h2><p>Next day: '+pct(s.retention.d1_back,s.retention.d1_cohort)+'</p><p>After 7 days: '+pct(s.retention.d7_back,s.retention.d7_cohort)+'</p></div>'
 +'<div class="box"><h2>GitHub downloads</h2>'+dl+'<p class="muted">Play Store installs are only shown in the Play Console.</p></div></div>';
 stamp.textContent='Updated '+new Date(s.generated).toLocaleTimeString()+' (day '+s.today+', Dhaka time)';
}
function load(){
 var k=keyBox.value.trim();if(!k)return;
 fetch('/api/stats',{headers:{authorization:'Bearer '+k}}).then(function(r){if(r.status===401)throw new Error('Wrong admin key.');if(!r.ok)throw new Error('Server error '+r.status);return r.json()})
 .then(function(s){localStorage.setItem('pewops-admin',k);draw(s);clearTimeout(timer);timer=setTimeout(load,30000)})
 .catch(function(e){out.innerHTML='<p class="err">'+e.message+'</p>'});
}
document.getElementById('go').onclick=load;keyBox.onkeydown=function(e){if(e.key==='Enter')load()};if(keyBox.value)load();
</script></body></html>`;

/* ---------- routing ---------- */

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (path === "/" || path === "/api/health") return json({ ok: true, name: "pewops-api" });
      if (path === "/admin") return new Response(ADMIN_PAGE, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

      if (path === "/api/register" && request.method === "POST") return await register(request, env);
      if (path === "/api/login" && request.method === "POST") return await login(request, env);
      if (path === "/api/events" && request.method === "POST") return await postEvents(request, env);
      if (path === "/api/leaderboard" && request.method === "GET") return await leaderboard(request, env);
      if (path === "/api/stats" && request.method === "GET") return isAdmin(request, env) ? json(await stats(env), 200, { "cache-control": "no-store" }) : fail("Unauthorized.", 401);

      const who = await readToken(env, request);
      if (path === "/api/me" && request.method === "GET") return who ? await me(request, env, who) : fail("Please log in again.", 401);
      if (path === "/api/save" && request.method === "PUT") return who ? await putSave(request, env, who) : fail("Please log in again.", 401);
      if (path === "/api/score" && request.method === "POST") return who ? await postScore(request, env, who) : fail("Please log in again.", 401);
      if (path === "/api/account" && (request.method === "DELETE" || request.method === "POST")) return who ? await deleteAccount(request, env, who) : fail("Please log in again.", 401);

      return fail("Not found.", 404);
    } catch (error) {
      return fail("Server error.", 500);
    }
  }
};
