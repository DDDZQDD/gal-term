"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");

const HOST = "127.0.0.1";
const PORT = 47331;
const ROOT = path.join(__dirname, "public");
const FILES = {
  "/": "deck.html",
  "/deck.html": "deck.html",
  "/deck.css": "deck.css",
  "/skins.css": "skins.css",
  "/retro.css": "retro.css",
  "/fonts/pixel.woff2": "fonts/pixel.woff2",
  "/fonts/mono-400.woff2": "fonts/mono-400.woff2",
  "/fonts/mono-600.woff2": "fonts/mono-600.woff2",
  "/deck.js": "deck.js",
  "/admin": "admin.html",
  "/admin.js": "admin.js",
};
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
};
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const ACCESS_FILE = path.join(__dirname, ".access.json");
const HUB_FILE = path.join(ROOT, "hub.json");

function readHub() {
  try {
    const data = JSON.parse(fs.readFileSync(HUB_FILE, "utf8"));
    if (data && Array.isArray(data.clans)) return data;
  } catch {
    /* fichier manquant */
  }
  return { clans: [] };
}
const { watchGame } = require("./hook-game");
const createDirectory = require("./directory");

function loadAccess() {
  try {
    const saved = JSON.parse(fs.readFileSync(ACCESS_FILE, "utf8"));
    if (saved && typeof saved.password === "string" && saved.password.length >= 12 && typeof saved.key === "string") {
      if (typeof saved.adminPassword !== "string" || saved.adminPassword.length < 12) {
        saved.adminPassword = crypto.randomBytes(18).toString("base64url");
        fs.writeFileSync(ACCESS_FILE, JSON.stringify(saved, null, 2), { mode: 0o600 });
      }
      return saved;
    }
  } catch {
    /* create a private password on first launch */
  }
  const created = {
    password: crypto.randomBytes(18).toString("base64url"),
    key: crypto.randomBytes(32).toString("base64url"),
  };
  fs.writeFileSync(ACCESS_FILE, JSON.stringify(created, null, 2), { mode: 0o600 });
  console.log("Mot de passe créé dans .access.json");
  return created;
}

const access = loadAccess();
const loginFails = new Map();
const usedGates = new Map();
const gateIssues = new Map();
const POW_BITS = 16;

function viaTunnel(req) {
  const headers = req.headers || {};
  return Boolean(headers["cf-ray"] || headers["cf-connecting-ip"] || headers["cf-visitor"]);
}

function clientIp(req) {
  const forwarded = req.headers["cf-connecting-ip"];
  if (typeof forwarded === "string" && forwarded) return forwarded;
  return req.socket && req.socket.remoteAddress || "local";
}

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const text = part.trim();
    const eq = text.indexOf("=");
    if (eq === -1) continue;
    if (text.slice(0, eq) === name) return decodeURIComponent(text.slice(eq + 1));
  }
  return "";
}

function makeSession() {
  const payload = String(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const mac = crypto.createHmac("sha256", access.key).update(payload).digest("base64url");
  return payload + "." + mac;
}

function sessionOk(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return false;
  const expected = crypto.createHmac("sha256", access.key).update(parts[0]).digest("base64url");
  const left = Buffer.from(parts[1]);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return false;
  const exp = Number(parts[0]);
  return Number.isFinite(exp) && exp > Date.now();
}

function passwordOk(given) {
  const left = crypto.createHash("sha256").update(String(access.password)).digest();
  const right = crypto.createHash("sha256").update(String(given || "")).digest();
  return crypto.timingSafeEqual(left, right);
}

function adminPasswordOk(given) {
  const secret = String(access.adminPassword || "");
  if (secret.length < 12) return false;
  const left = crypto.createHash("sha256").update(secret).digest();
  const right = crypto.createHash("sha256").update(String(given || "")).digest();
  return crypto.timingSafeEqual(left, right);
}

function makeAdminSession() {
  const payload = String(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const mac = crypto.createHmac("sha256", access.key).update("admin:" + payload).digest("base64url");
  return payload + "." + mac;
}

function adminSessionOk(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return false;
  const expected = crypto.createHmac("sha256", access.key).update("admin:" + parts[0]).digest("base64url");
  const left = Buffer.from(parts[1]);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return false;
  const exp = Number(parts[0]);
  return Number.isFinite(exp) && exp > Date.now();
}

function adminAllowed(req) {
  return adminSessionOk(readCookie(req, "ofdeck-admin"));
}

function allowed(req) {
  if (!viaTunnel(req)) return true;
  return sessionOk(readCookie(req, "ofdeck"));
}

function lockedOut(ip) {
  const row = loginFails.get(ip);
  return Boolean(row && row.count >= 8 && Date.now() - row.at < 15 * 60 * 1000);
}

function tooManyGates(ip) {
  const row = gateIssues.get(ip);
  return Boolean(row && row.count >= 40 && Date.now() - row.at < 15 * 60 * 1000);
}

function noteGateIssue(ip) {
  const row = gateIssues.get(ip);
  if (!row || Date.now() - row.at > 15 * 60 * 1000) gateIssues.set(ip, { count: 1, at: Date.now() });
  else row.count += 1;
}

function noteFail(ip) {
  const row = loginFails.get(ip);
  if (!row || Date.now() - row.at > 15 * 60 * 1000) loginFails.set(ip, { count: 1, at: Date.now() });
  else row.count += 1;
}

function clearFail(ip) {
  loginFails.delete(ip);
}

function gateMac(ip, id, ts, bits) {
  return crypto.createHmac("sha256", access.key).update("pow|" + id + "|" + ts + "|" + bits).digest("hex");
}

function issueGate(ip) {
  const id = crypto.randomBytes(16).toString("hex");
  const ts = Math.floor(Date.now() / 1000);
  return { id, ts, bits: POW_BITS, mac: gateMac(ip, id, ts, POW_BITS) };
}

function leadingZeroBits(hex) {
  let bits = 0;
  for (let i = 0; i < hex.length; i++) {
    const n = parseInt(hex[i], 16);
    if (n === 0) {
      bits += 4;
      continue;
    }
    if (n < 2) return bits + 3;
    if (n < 4) return bits + 2;
    if (n < 8) return bits + 1;
    return bits;
  }
  return bits;
}

function takeGate(id) {
  const now = Date.now();
  for (const [key, exp] of usedGates) {
    if (exp < now) usedGates.delete(key);
  }
  if (usedGates.has(id)) return false;
  usedGates.set(id, now + 180000);
  return true;
}

function proofOk(ip, params) {
  if (String(params.get("website") || "") !== "") return false;
  const id = String(params.get("id") || "").toLowerCase();
  const ts = Number(params.get("ts") || 0);
  const bits = Number(params.get("bits") || 0);
  const mac = String(params.get("mac") || "").toLowerCase();
  const n = String(params.get("n") || "");
  if (bits !== POW_BITS || !/^[a-f0-9]{32}$/.test(id) || !/^[0-9]{1,12}$/.test(n)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (ts < now - 120 || ts > now + 30) return false;
  const expected = gateMac(ip, id, ts, bits);
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return false;
  if (!takeGate(id)) return false;
  const hash = crypto.createHash("sha256").update(id + ":" + n).digest("hex");
  return leadingZeroBits(hash) >= bits;
}

const GUARD = {
  "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data: https:; frame-src https://player.twitch.tv https://www.youtube.com https://www.youtube-nocookie.com",
  "cache-control": "no-store",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 4096) {
        reject(new Error("too big"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function loginPage(failed) {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
  <title>Accès</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #09090b; color: #f4f4f5; font-family: "Segoe UI", sans-serif; }
    .box { width: min(360px, calc(100% - 32px)); background: #12141a; border: 1px solid rgba(255,255,255,.08); border-radius: 16px; padding: 22px; }
    h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: .08em; color: #fbbf24; }
    p { color: #a1a1aa; font-size: 14px; }
    .bad { color: #fb7185; }
  </style>
</head>
<body data-gate="/api/gate" data-post="/login">
  <div class="box">
    <h1>GAL</h1>
    <p>Page du clan, protégée contre les robots.</p>
    ${failed ? '<p class="bad">Vérification refusée. Réessaie.</p>' : '<p data-status>Préparation de la vérification…</p>'}
    <noscript><p class="bad">Active JavaScript pour entrer.</p></noscript>
  </div>
  <script src="/gate.js"></script>
</body>
</html>`;
}

function adminLoginPage(failed) {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
  <title>Admin GAL</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #09090b; color: #f4f4f5; font-family: "Segoe UI", sans-serif; }
    form { width: min(360px, calc(100% - 32px)); background: #12141a; border: 1px solid rgba(255,255,255,.08); border-radius: 16px; padding: 22px; }
    h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: .08em; }
    p { color: #a1a1aa; font-size: 14px; }
    input { width: 100%; box-sizing: border-box; margin: 8px 0 14px; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.12); background: #0c0c0e; color: inherit; }
    button { width: 100%; padding: 10px; border: 0; border-radius: 10px; background: #fbbf24; color: #111; font-weight: 700; cursor: pointer; }
    .bad { color: #fb7185; }
  </style>
</head>
<body>
  <form method="post" action="/admin">
    <h1>ADMIN</h1>
    <p>Liste admin — tag GAL en solo dans une partie équipes.</p>
    ${failed ? '<p class="bad">Code refusé.</p>' : ""}
    <input type="password" name="password" autocomplete="current-password" autofocus required />
    <button type="submit">Entrer</button>
  </form>
</body>
</html>`;
}

let lastState = null;
let lastLivePush = 0;
let lastQueueIds = "";
let livePending = null;
let liveBusy = false;

function pushLive(text, force) {
  livePending = text;
  let queueIds = "";
  try {
    const message = JSON.parse(text);
    queueIds = ((message.queue && message.queue.games) || []).map((game) => game.id).join(",");
  } catch {
    queueIds = "";
  }
  const now = Date.now();
  const mapsChanged = queueIds !== lastQueueIds;
  if (!force && !mapsChanged && now - lastLivePush < 1500 && liveBusy) return;
  if (!force && !mapsChanged && now - lastLivePush < 1500) return;
  lastQueueIds = queueIds;
  flushLive();
}

function flushLive() {
  if (liveBusy || !livePending) return;
  const text = livePending;
  liveBusy = true;
  let key;
  try {
    key = loadAccess().key;
  } catch {
    liveBusy = false;
    return;
  }
  const body = Buffer.from(text);
  let settled = false;
  const done = (ok, detail) => {
    if (settled) return;
    settled = true;
    liveBusy = false;
    if (ok) {
      lastLivePush = Date.now();
      if (livePending === text) livePending = null;
      return;
    }
    if (Date.now() - lastLiveErr > 15000) {
      lastLiveErr = Date.now();
      console.log("live.php", detail);
    }
    setTimeout(flushLive, 2000);
  };
  const req = https.request(
    {
      hostname: "gal.ciriushub.fr",
      path: "/api/live.php",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": body.length,
        "x-live-key": key,
      },
      timeout: 8000,
    },
    (res) => {
      res.resume();
      done(res.statusCode === 200, res.statusCode);
    },
  );
  req.on("error", (error) => done(false, error.message));
  req.on("timeout", () => {
    req.destroy();
    done(false, "timeout");
  });
  req.end(body);
}
let lastLiveErr = 0;
let lastLog = 0;
let lastSnapAt = 0;

const HEART_FILE = path.join(__dirname, "cache", "heartbeat.json");
function writeHeartbeat() {
  try {
    fs.mkdirSync(path.dirname(HEART_FILE), { recursive: true });
    fs.writeFileSync(
      HEART_FILE,
      JSON.stringify({ at: Date.now(), pid: process.pid, port: PORT, snap: lastSnapAt, live: lastLivePush }),
    );
  } catch {
    /* ignore */
  }
}

function pushSnapOnce(name, value, key) {
  const body = Buffer.from(JSON.stringify(value));
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const req = https.request(
      {
        hostname: "gal.ciriushub.fr",
        path: "/api/snap.php?name=" + name,
        method: "POST",
        headers: { "content-type": "application/json", "content-length": body.length, "x-live-key": key },
        timeout: 30000,
      },
      (res) => {
        res.resume();
        if (res.statusCode !== 200) console.log("snap.php", name, res.statusCode);
        done(res.statusCode === 200);
      },
    );
    req.on("error", (error) => {
      console.log("snap.php", name, error.message);
      done(false);
    });
    req.on("timeout", () => {
      req.destroy();
      done(false);
    });
    req.end(body);
  });
}

function pushSnap(name, value) {
  let key;
  try {
    key = loadAccess().key;
  } catch {
    return Promise.resolve(false);
  }
  return (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const ok = await pushSnapOnce(name, value, key);
      if (ok) {
        lastSnapAt = Date.now();
        return true;
      }
      await new Promise((wait) => setTimeout(wait, 2000 * (attempt + 1)));
    }
    return false;
  })();
}

function rollingClan() {
  const hit = clanCache.get("24h");
  if (hit && hit.at && Date.now() - hit.at < 2 * 60 * 1000) return Promise.resolve(hit.value);
  return loadClan(resolveRange("", "", false)).then((value) => {
    clanCache.set("24h", { at: Date.now(), value });
    saveClan(value);
    return value;
  });
}

let snapTurn = 0;
let snapBusy = false;
async function pushSnaps() {
  if (snapBusy) return;
  snapBusy = true;
  const turn = snapTurn++;
  const jobs = [
    ["clan", () => rollingClan()],
    ["week", () => loadWeek(false)],
    ["ranks", () => loadRanks()],
  ];
  if (turn % 5 === 0) jobs.push(["quarter", () => loadQuarter(false)], ["players", () => Promise.resolve(directory.dump())]);
  try {
    for (const [name, load] of jobs) {
      try {
        const value = await background.run(true, load);
        if (value) await pushSnap(name, value);
      } catch (error) {
        console.log("snap", name, error && error.message);
      }
    }
  } finally {
    snapBusy = false;
    writeHeartbeat();
  }
}
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-private-network": "true",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function acceptState(text) {
  if (!text || text.length > 1_500_000) return false;
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return false;
  }
  if (message.type !== "state") return false;
  noteWatch(message);
  lastState = text;
  const shown = enrichState(text);
  pushLive(shown);
  broadcast(shown);
    const now = Date.now();
    if (now - lastLog > 10000) {
      lastLog = now;
    console.log(
      "state",
      "inGame=" + message.inGame,
      "tick=" + (message.match && message.match.tick),
      "phase=" + (message.match && (message.match.spawn ? "spawn" : "play")),
      "gold=" + (message.me && message.me.gold),
      "tiles=" + (message.me && message.me.tiles),
      "views=" + (message.match && message.match.views),
      "err=" + (message.error || ""),
      "bytes=" + text.length,
    );
  }
  return true;
}
const sockets = new Set();

function sendText(socket, text) {
  const payload = Buffer.from(text);
  let header;
  if (payload.length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = payload.length;
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(payload.length, 6);
  }
  try {
    socket.write(Buffer.concat([header, payload]));
  } catch {
    sockets.delete(socket);
  }
}

function broadcast(text, except) {
  for (const socket of sockets) {
    if (socket !== except) sendText(socket, text);
  }
}

function acceptKey(key) {
  return crypto.createHash("sha1").update(key + GUID).digest("base64");
}

function attachSocket(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      "Sec-WebSocket-Accept: " +
      acceptKey(key) +
      "\r\n\r\n",
  );
  sockets.add(socket);
  socket.__remote = viaTunnel(req);
  if (lastState) sendText(socket, enrichState(lastState));
  let buffer = Buffer.alloc(0);
  let fragments = [];
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const fin = (buffer[0] & 0x80) !== 0;
      const opcode = buffer[0] & 0x0f;
      const masked = (buffer[1] & 0x80) !== 0;
      let length = buffer[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }
      const maskLength = masked ? 4 : 0;
      if (buffer.length < offset + maskLength + length) return;
      const mask = masked ? buffer.subarray(offset, offset + 4) : null;
      offset += maskLength;
      const payload = Buffer.from(buffer.subarray(offset, offset + length));
      if (mask) {
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      }
      buffer = buffer.subarray(offset + length);
      if (opcode === 0x8) {
        sockets.delete(socket);
        socket.end();
        return;
      }
      if (opcode === 0x9) {
        const pongHeader = Buffer.alloc(payload.length < 126 ? 2 : 4);
        pongHeader[0] = 0x8a;
        if (payload.length < 126) pongHeader[1] = payload.length;
        else {
          pongHeader[1] = 126;
          pongHeader.writeUInt16BE(payload.length, 2);
        }
        socket.write(Buffer.concat([pongHeader, payload]));
        continue;
      }
      if (opcode === 0x1 || opcode === 0x0) {
        if (opcode === 0x1) fragments = [payload];
        else fragments.push(payload);
        if (!fin) continue;
      } else {
        continue;
      }
      const text = Buffer.concat(fragments).toString("utf8");
      fragments = [];
      if (text.length > 1_500_000) continue;
      try {
        const message = JSON.parse(text);
        if (message.type === "command" || message.type === "state") {
          if (socket.__remote) continue;
        }
        if (message.type === "command") {
          broadcast(text, socket);
          continue;
        }
        if (message.type === "state") {
          acceptState(text);
          continue;
        }
      } catch {
        /* ignore */
      }
    }
  });
  socket.on("close", () => sockets.delete(socket));
  socket.on("error", () => sockets.delete(socket));
}

const CLAN = "GAL";
const API = "https://api.openfront.io";
const clanCache = new Map();
const QUARTER_FILE = path.join(__dirname, "cache", "quarter.json");
let quarterCache = { at: 0, value: null };
const WEEK_FILE = path.join(__dirname, "cache", "week.json");
const PLAYERS_FILE = path.join(__dirname, "cache", "game-players.json");
let weekCache = { at: 0, value: null };
let weekPending = null;
let weekBlockedUntil = 0;
const CLAN_FILE = path.join(__dirname, "cache", "clan-24h.json");
try {
  const saved = JSON.parse(fs.readFileSync(CLAN_FILE, "utf8"));
  if (saved && saved.value) clanCache.set("24h", { at: 0, value: saved.value });
} catch {
  /* pas encore de cache */
}

function saveClan(value) {
  try {
    fs.mkdirSync(path.dirname(CLAN_FILE), { recursive: true });
    fs.writeFileSync(CLAN_FILE + ".tmp", JSON.stringify({ at: Date.now(), value }));
    fs.renameSync(CLAN_FILE + ".tmp", CLAN_FILE);
  } catch {
    /* cache disque optionnel */
  }
}

// OpenFront bloque les rafales : tous les appels passent par une seule file, les tâches de fond cèdent la place au chargement de la page.
const background = new AsyncLocalStorage();
const gate = { active: 0, pausedUntil: 0, timer: null, high: [], low: [] };

function gateNext() {
  const wait = gate.pausedUntil - Date.now();
  if (wait > 0) {
    if (!gate.timer) gate.timer = setTimeout(() => {
      gate.timer = null;
      gateNext();
    }, wait);
    return;
  }
  while (gate.active < 3) {
    const job = gate.high.shift() || (gate.active < 2 ? gate.low.shift() : null);
    if (!job) break;
    gate.active += 1;
    job();
  }
}

function apiGetOnce(pathname) {
  return new Promise((resolve, reject) => {
    const run = () => rawGet(pathname)
      .then(resolve, (error) => {
        if (/^429/.test(String(error.message || ""))) {
          gate.pausedUntil = Math.max(gate.pausedUntil, Date.now() + (error.retryAfter || 30) * 1000);
        }
        reject(error);
      })
      .finally(() => {
        gate.active -= 1;
        setTimeout(gateNext, 150);
      });
    (background.getStore() ? gate.low : gate.high).push(run);
    gateNext();
  });
}

function rawGet(pathname) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      API + pathname,
      { headers: { accept: "application/json", "user-agent": "of-deck" } },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode !== 200) {
            const error = new Error(res.statusCode + " " + text.slice(0, 220));
            const after = Number(res.headers["retry-after"]);
            if (Number.isFinite(after) && after > 0) error.retryAfter = Math.min(after, 600);
            reject(error);
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("timeout")));
  });
}

async function apiGet(pathname) {
  let last;
  for (let tryNo = 0; tryNo < 3; tryNo++) {
    try {
      return await apiGetOnce(pathname);
    } catch (error) {
      last = error;
      const code = Number(String(error.message || "").slice(0, 3));
      if (code >= 400 && code < 500 && code !== 429) throw error;
      if (tryNo < 2) await new Promise((resolve) => setTimeout(resolve, 300 * (tryNo + 1)));
    }
  }
  throw last;
}

function pageUrl(pathname, extra, page) {
  const params = new URLSearchParams(extra);
  params.set("page", String(page));
  params.set("limit", "50");
  return pathname + "?" + params.toString();
}

async function allPages(pathname, extra) {
  const first = await apiGet(pageUrl(pathname, extra, 1));
  const total = Number(first.total) || (first.results || []).length;
  const results = [...(first.results || [])];
  const pages = Math.min(30, Math.ceil(total / 50));
  if (pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, index) => apiGet(pageUrl(pathname, extra, index + 2))),
    );
    for (const page of rest) results.push(...(page.results || []));
  }
  return { total, results };
}

function sumRoster(members) {
  const modes = ["total", "ffa", "team", "hvn", "duos", "trios", "quads", "2", "3", "4", "5", "6", "7", "ranked", "1v1"];
  const stats = {};
  for (const mode of modes) stats[mode] = { wins: 0, losses: 0 };
  const roles = { leader: 0, officer: 0, member: 0 };
  for (const member of members) {
    roles[member.role] = (roles[member.role] || 0) + 1;
    for (const mode of modes) {
      const row = member.stats && member.stats[mode];
      if (!row) continue;
      stats[mode].wins += Number(row.wins) || 0;
      stats[mode].losses += Number(row.losses) || 0;
    }
  }
  return { roles, stats };
}

const gamePlayerCache = new Map();
try {
  const saved = JSON.parse(fs.readFileSync(PLAYERS_FILE, "utf8"));
  for (const [id, packed] of Object.entries(saved || {})) {
    if (packed && Array.isArray(packed.players)) gamePlayerCache.set(id, packed);
  }
} catch {
  /* pas encore de cache */
}

function saveGamePlayers() {
  const entries = [...gamePlayerCache.entries()].slice(-12000);
  try {
    fs.mkdirSync(path.dirname(PLAYERS_FILE), { recursive: true });
    fs.writeFileSync(PLAYERS_FILE + ".tmp", JSON.stringify(Object.fromEntries(entries)));
    fs.renameSync(PLAYERS_FILE + ".tmp", PLAYERS_FILE);
  } catch {
    /* cache disque optionnel */
  }
}

const watchedGames = new Map();
let galGames = [];
let galKey = "";
let galBusy = false;
let clusterList = null;
let clusterAt = 0;
const finishedCheck = new Map();

async function publicGameEnded(id) {
  const prev = finishedCheck.get(id) || 0;
  if (Date.now() - prev < 8000) return false;
  finishedCheck.set(id, Date.now());
  try {
    const data = await apiGet("/public/game/" + encodeURIComponent(id) + "?turns=false");
    const info = (data && data.info) || data || {};
    return Boolean(info.end);
  } catch {
    return false;
  }
}

function workerIndex(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function noteWatch(message) {
  const now = Date.now();
  for (const game of (message.queue && message.queue.games) || []) {
    if (!game || !game.id) continue;
    watchedGames.set(game.id, { ...(watchedGames.get(game.id) || {}), ...game, seen: now });
  }
  if (message.inGame && message.match && message.match.id) {
    const id = message.match.id;
    if (message.match.over) {
      watchedGames.delete(id);
      finishedCheck.delete(id);
    } else {
      const prev = watchedGames.get(id) || {};
      watchedGames.set(id, {
        ...prev,
        id,
        map: (message.match.config && message.match.config.map) || prev.map || "",
        seen: now,
      });
    }
  }
  for (const [id, game] of watchedGames) {
    if (now - game.seen > 50 * 60 * 1000) watchedGames.delete(id);
  }
}

function enrichState(text) {
  try {
    const body = JSON.parse(text);
    body.galGames = galGames;
    body.t = Date.now();
    return JSON.stringify(body);
  } catch {
    return text;
  }
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { accept: "application/json", "user-agent": "of-deck" } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode === 404) return resolve(null);
        if (res.statusCode !== 200) return reject(new Error(String(res.statusCode)));
        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(8000, () => req.destroy(new Error("timeout")));
  });
}

async function loadCluster() {
  if (clusterList && Date.now() - clusterAt < 5 * 60 * 1000) return clusterList;
  try {
    clusterList = await apiGet("/cluster.json?site=openfront.io");
    clusterAt = Date.now();
  } catch {
    /* garde la dernière liste */
  }
  return clusterList;
}

function workerUrl(id) {
  const servers = (clusterList && clusterList.servers) || {};
  const letter = id.length >= 10 ? id[0] : "c";
  const server = servers[letter] || servers.c;
  if (!server || !server.host) return null;
  const index = workerIndex(id) % (Number(server.numWorkers) || 20);
  return "https://" + server.host + "/w" + index + "/api/game/" + encodeURIComponent(id);
}

function clanTeams(mode, total) {
  const per = mode === "Duos" ? 2 : mode === "Trios" ? 3 : mode === "Quads" ? 4 : 0;
  if (per) return total ? Math.max(2, Math.ceil(total / per)) : 0;
  const teams = Number(mode);
  return Number.isInteger(teams) && teams >= 2 ? teams : 0;
}

function clanPoints(total, teams, gal) {
  if (!total || teams < 2 || gal < 1) return null;
  const ratio = gal / (total / teams);
  const difficulty = Math.max(1, Math.sqrt(teams - 1));
  return { win: ratio * difficulty, loss: ratio / difficulty };
}

async function refreshGal() {
  if (galBusy) return;
  galBusy = true;
  try {
    await loadCluster();
    const now = Date.now();
    for (const [id, game] of watchedGames) {
      if (now - game.seen > 50 * 60 * 1000) watchedGames.delete(id);
    }
    const ids = [...watchedGames.keys()];
    const rows = await mapPool(ids, 4, async (id) => {
      const url = workerUrl(id);
      if (!url) return undefined;
      try {
        return await httpsGet(url);
      } catch {
        return undefined;
      }
    });
    const startedIds = ids.filter((id, index) => {
      const body = rows[index];
      if (!body) return false;
      const startsAt = body.startsAt || (watchedGames.get(id) || {}).startsAt;
      const serverTime = body.serverTime || null;
      return !!(startsAt && serverTime && startsAt <= serverTime);
    });
    const endedFlags = await mapPool(startedIds, 4, (id) => publicGameEnded(id));
    const ended = new Map(startedIds.map((id, index) => [id, endedFlags[index]]));
    const next = [];
    ids.forEach((id, index) => {
      const body = rows[index];
      if (body === null || ended.get(id)) {
        watchedGames.delete(id);
        finishedCheck.delete(id);
        return;
      }
      if (!body || !Array.isArray(body.clients)) return;
      const gal = body.clients.filter((client) => String(client.clanTag || "").toUpperCase() === "GAL");
      const meta = watchedGames.get(id) || {};
      const startsAt = body.startsAt || meta.startsAt || null;
      const serverTime = body.serverTime || null;
      const started = !!(startsAt && serverTime && startsAt <= serverTime);
      const connected = body.clients.length;
      const lobbyPlayers = Number(meta.players) || 0;
      const cap = Number((body.gameConfig && body.gameConfig.maxPlayers) || meta.max || 0);
      let roster;
      let rosterFrozen = !!meta.rosterFrozen;
      if (!started && !rosterFrozen) {
        roster = cap || lobbyPlayers || connected;
      } else if (!started) {
        roster = Number(meta.roster) || cap || lobbyPlayers || connected;
      } else if (!rosterFrozen) {
        roster = Math.max(lobbyPlayers, connected) || cap;
        rosterFrozen = true;
      } else {
        roster = Number(meta.roster) || lobbyPlayers || connected;
        if (connected > roster) roster = connected;
      }
      const currentGal = {};
      for (const client of gal) currentGal[client.username || "GAL"] = true;
      if (!Object.keys(currentGal).length) {
        watchedGames.delete(id);
        finishedCheck.delete(id);
        return;
      }
      let galNames;
      let galFrozen = !!meta.galFrozen;
      if (!started) galNames = currentGal;
      else if (!galFrozen) {
        galNames = { ...(meta.galNames || {}), ...currentGal };
        galFrozen = true;
      } else galNames = { ...(meta.galNames || {}), ...currentGal };
      const teamMode = (body.gameConfig && body.gameConfig.playerTeams) || meta.teamMode || null;
      const hvn = !!meta.hvn || teamMode === "Humans Vs Nations";
      const teams = clanTeams(teamMode, roster);
      const points = hvn ? null : clanPoints(roster, teams, Object.keys(galNames).length);
      watchedGames.set(id, { ...meta, roster, rosterFrozen, galNames, galFrozen, teamMode });
      next.push({
        id,
        map: (body.gameConfig && body.gameConfig.gameMap) || meta.map || "",
        players: connected,
        roster,
        max: Number((body.gameConfig && body.gameConfig.maxPlayers) || meta.max || 0),
        startsAt,
        serverTime,
        started,
        teamMode,
        teamCount: teams,
        hvn,
        win: points ? points.win : null,
        loss: points ? points.loss : null,
        gal: Object.keys(galNames).map((name) => ({ name })),
      });
    });
    next.sort((a, b) => Number(b.started) - Number(a.started) || b.gal.length - a.gal.length);
    galGames = next;
    const key = next.map((game) => [game.id, game.roster, game.teamCount, game.win == null ? "" : game.win.toFixed(2), game.gal.map((player) => player.name).join(",")].join(":")).join("|");
    if (key !== galKey) {
      galKey = key;
      if (lastState) pushLive(enrichState(lastState), true);
    }
  } finally {
    galBusy = false;
  }
}

setInterval(refreshGal, 4000);

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function fetchPlayers(gameId) {
  const data = await apiGetOnce("/public/game/" + encodeURIComponent(gameId) + "?turns=false");
  const info = data.info || {};
  const players = (info.players || [])
    .filter((player) => player && player.username)
    .map((player) => ({ name: player.username, clan: player.clanTag || null, publicId: player.publicID || null }));
  const packed = { players, map: (info.config && info.config.gameMap) || null };
  gamePlayerCache.set(gameId, packed);
  return packed;
}

async function playersOf(gameId) {
  if (!gameId) return { players: [], map: null };
  const cached = gamePlayerCache.get(gameId);
  if (cached && Array.isArray(cached.players)) return cached;
  try {
    const data = await apiGet("/public/game/" + encodeURIComponent(gameId) + "?turns=false");
    const info = data.info || {};
    const players = (info.players || [])
      .filter((player) => player && player.username)
      .map((player) => ({ name: player.username, clan: player.clanTag || null, publicId: player.publicID || null }));
    const packed = { players, map: (info.config && info.config.gameMap) || null };
    gamePlayerCache.set(gameId, packed);
    return packed;
  } catch {
    return { players: [], map: null };
  }
}

async function attachPlayers(sessions) {
  const rows = sessions.results || [];
  const lists = await mapPool(rows, 8, (row) => playersOf(row.gameId));
  rows.forEach((row, index) => {
    const packed = lists[index] || { players: [], map: null };
    row.players = Array.isArray(packed) ? packed : packed.players || [];
    row.map = Array.isArray(packed) ? null : packed.map || null;
  });
  return sessions;
}

function isSoloGalTeam(row) {
  if (Number(row.clanPlayerCount) !== 1) return false;
  if (row.playerTeams === "Humans Vs Nations") return false;
  const mode = row.playerTeams;
  if (mode === "Duos" || mode === "Trios" || mode === "Quads") return true;
  const teams = Number(mode);
  return Number.isInteger(teams) && teams >= 2;
}

async function gameDetail(gameId) {
  try {
    const data = await apiGet("/public/game/" + encodeURIComponent(gameId) + "?turns=false");
    const info = data.info || {};
    const config = info.config || {};
    const mods = config.publicGameModifiers || {};
    const players = (info.players || [])
      .filter((player) => player && player.username)
      .map((player) => ({
        name: player.username,
        clan: player.clanTag || null,
        publicId: player.publicID || null,
        verified: !!(player.cosmetics && player.cosmetics.verified),
        creator: !!player.isLobbyCreator,
      }));
    return {
      map: config.gameMap || null,
      compact: config.gameMapSize === "Compact" || !!mods.isCompact,
      duration: info.duration || null,
      winner: info.winner || null,
      type: config.gameType || null,
      mode: config.gameMode || null,
      players,
    };
  } catch {
    return { map: null, compact: false, duration: null, winner: null, type: null, mode: null, players: [] };
  }
}

function packSolo(row, detail) {
  const players = (detail && detail.players) || [];
  const gal = players.find((player) => String(player.clan || "").toUpperCase() === "GAL") || null;
  const others = players.filter((player) => player !== gal);
  return {
    gameId: row.gameId,
    start: row.gameStart,
    score: Number(row.score) || 0,
    won: !!row.hasWon,
    mode: row.playerTeams,
    teams: Number(row.numTeams) || 0,
    total: Number(row.totalPlayerCount) || 0,
    map: (detail && detail.map) || row.map || "",
    compact: !!(detail && detail.compact),
    duration: detail && detail.duration,
    winner: detail && detail.winner,
    gal: gal ? gal.name : "GAL",
    publicId: gal ? gal.publicId : null,
    verified: !!(gal && gal.verified),
    others,
  };
}

function summarizeSolo(games) {
  const map = new Map();
  for (const game of games) {
    const key = String(game.publicId || game.gal || "").toLowerCase();
    if (!key) continue;
    let row = map.get(key);
    if (!row) {
      row = {
        name: game.gal,
        publicId: game.publicId,
        verified: game.verified,
        games: 0,
        wins: 0,
        losses: 0,
        points: 0,
        last: game.start,
        lastMap: game.map,
        lastId: game.gameId,
      };
      map.set(key, row);
    }
    row.games += 1;
    if (game.won) row.wins += 1;
    else row.losses += 1;
    row.points += Number(game.score) || 0;
    if (String(game.start || "") > String(row.last || "")) {
      row.last = game.start;
      row.lastMap = game.map;
      row.lastId = game.gameId;
      row.name = game.gal;
      row.publicId = game.publicId || row.publicId;
    }
  }
  return [...map.values()].sort((a, b) => b.games - a.games || Math.abs(b.points) - Math.abs(a.points) || String(a.name).localeCompare(String(b.name)));
}

async function loadSolo(range) {
  const windows = rangeWindows(range.start, range.end);
  const slices = await Promise.all(
    windows.map(async (window) => {
      const query = { start: window.start, end: window.end };
      return allPages("/public/clan/" + CLAN + "/sessions", query);
    }),
  );
  const merged = mergeSessions(slices);
  const solo = (merged.results || []).filter(isSoloGalTeam);
  const details = await mapPool(solo, 6, (row) => gameDetail(row.gameId));
  const games = solo.map((row, index) => packSolo(row, details[index]));
  return {
    from: range.start.toISOString(),
    to: range.end.toISOString(),
    rolling: !!range.rolling,
    total: games.length,
    players: summarizeSolo(games),
    games,
  };
}

function parisWallClock(date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
}

function parisStart(ymd) {
  const [year, month, day] = ymd.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  return new Date(guess - (parisWallClock(new Date(guess)) - guess));
}

function resolveRange(from, to, untilNow) {
  if (!from && !to && !untilNow) {
    const end = new Date();
    return { start: new Date(end.getTime() - 24 * 60 * 60 * 1000), end, rolling: true };
  }
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
    throw new Error("Date invalide.");
  }
  const start = parisStart(from || to);
  const end = untilNow || !to ? new Date() : new Date(Math.min(parisStart(to).getTime() + 24 * 60 * 60 * 1000 - 1, Date.now()));
  if (end < start) throw new Error("La fin est avant le début.");
  if (end.getTime() - start.getTime() > 14 * 24 * 60 * 60 * 1000) throw new Error("14 jours maximum.");
  return { start, end, rolling: false };
}

function rangeWindows(start, end) {
  const out = [];
  let cursor = start.getTime();
  const last = end.getTime();
  while (cursor <= last && out.length < 16) {
    const next = Math.min(cursor + 24 * 60 * 60 * 1000 - 1000, last);
    out.push({ start: new Date(cursor).toISOString(), end: new Date(next).toISOString() });
    cursor = next + 1000;
  }
  return out;
}

function addPair(left, right) {
  return [(Number(left && left[0]) || 0) + (Number(right && right[0]) || 0), (Number(left && left[1]) || 0) + (Number(right && right[1]) || 0)];
}

function mergeBreakdown(target, source) {
  for (const [key, row] of Object.entries(source || {})) {
    const current = target[key] || { wl: [0, 0], weightedWL: [0, 0] };
    target[key] = { wl: addPair(current.wl, row.wl), weightedWL: addPair(current.weightedWL, row.weightedWL) };
  }
}

function mergeStats(rows) {
  if (rows.length <= 1) return rows[0] || null;
  const stats = {
    games: 0,
    wins: 0,
    losses: 0,
    weightedWins: 0,
    weightedLosses: 0,
    playerSessions: 0,
    softBalance: rows[rows.length - 1].softBalance,
    hardBalance: rows[rows.length - 1].hardBalance,
    teamTypeWL: {},
    teamCountWL: {},
  };
  for (const row of rows) {
    stats.games += Number(row.games) || 0;
    stats.wins += Number(row.wins) || 0;
    stats.losses += Number(row.losses) || 0;
    stats.weightedWins += Number(row.weightedWins) || 0;
    stats.weightedLosses += Number(row.weightedLosses) || 0;
    stats.playerSessions += Number(row.playerSessions) || 0;
    mergeBreakdown(stats.teamTypeWL, row.teamTypeWL);
    mergeBreakdown(stats.teamCountWL, row.teamCountWL);
  }
  stats.weightedWLRatio = stats.weightedLosses > 0 ? stats.weightedWins / stats.weightedLosses : stats.weightedWins;
  return stats;
}

function mergeSessions(lists) {
  const seen = new Set();
  const results = [];
  for (const list of lists) {
    for (const row of list.results || []) {
      if (!row || seen.has(row.gameId)) continue;
      seen.add(row.gameId);
      results.push(row);
    }
  }
  results.sort((a, b) => String(b.gameStart || "").localeCompare(String(a.gameStart || "")));
  return { total: results.length, results };
}

const memo = new Map();

function memoized(key, ttl, load) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.value);
  return load().then((value) => {
    memo.set(key, { at: Date.now(), value });
    return value;
  }, (error) => {
    if (hit) return hit.value;
    throw error;
  });
}

async function loadClan(range) {
  const windows = rangeWindows(range.start, range.end);
  const [board, members, slices] = await Promise.all([
    memoized("board", 5 * 60 * 1000, () => apiGet("/public/clans/leaderboard")),
    memoized("members", 15 * 60 * 1000, () => allPages("/public/clan/" + CLAN + "/members", {})),
    mapPool(windows, 3, async (window) => {
      const query = { start: window.start, end: window.end };
      const [stats, sessions] = await Promise.all([
        apiGet("/public/clan/" + CLAN + "?" + new URLSearchParams(query).toString()),
        allPages("/public/clan/" + CLAN + "/sessions", query),
      ]);
      return { stats: stats.clan || {}, sessions };
    }),
  ]);
  const sessions = mergeSessions(slices.map((slice) => slice.sessions));
  await attachPlayers(sessions);
  const clans = board.clans || [];
  const index = clans.findIndex((clan) => clan.clanTag === CLAN);
  return {
    tag: CLAN,
    fetchedAt: new Date().toISOString(),
    day: { start: range.start.toISOString(), end: range.end.toISOString(), rolling: !!range.rolling },
    season: {
      start: board.start,
      end: board.end,
      rank: index >= 0 ? index + 1 : null,
      listed: clans.length,
      entry: index >= 0 ? clans[index] : null,
    },
    leaderboard: clans,
    stats: mergeStats(slices.map((slice) => slice.stats)),
    members,
    sessions,
    roster: sumRoster(members.results || []),
  };
}

async function loadQuarter(force) {
  const ttl = 15 * 60 * 1000;
  if (!force && quarterCache.value && Date.now() - quarterCache.at < ttl) return quarterCache.value;
  if (!force && !quarterCache.value) {
    try {
      const saved = JSON.parse(fs.readFileSync(QUARTER_FILE, "utf8"));
      if (saved && saved.value && Date.now() - Number(saved.at) < ttl) {
        quarterCache = { at: Number(saved.at), value: saved.value };
        return saved.value;
      }
    } catch {
      /* pas encore de cache */
    }
  }
  const now = Date.now();
  const keys = dayKeys(now - 90 * DAY, now);
  const slices = [];
  for (const key of keys) {
    try {
      slices.push((await archiveDay(key)).stats || {});
    } catch {
      /* jour relu au prochain calcul */
    }
  }
  if (!slices.length) throw new Error("OpenFront limite les requêtes, nouvel essai dans quelques minutes.");
  const value = {
    start: new Date(dayBounds(keys[0]).start).toISOString(),
    end: new Date(now).toISOString(),
    days: slices.length,
    stats: mergeStats(slices),
  };
  quarterCache = { at: Date.now(), value };
  try {
    fs.mkdirSync(path.dirname(QUARTER_FILE), { recursive: true });
    fs.writeFileSync(QUARTER_FILE, JSON.stringify(quarterCache));
  } catch {
    /* cache disque optionnel */
  }
  return value;
}

const ARCHIVE_DIR = path.join(__dirname, "cache", "archive");
const DAY = 24 * 60 * 60 * 1000;
const archiveMem = new Map();
const liveDays = new Map();
const archiveBusy = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function utcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function dayBounds(key) {
  const start = Date.parse(key + "T00:00:00.000Z");
  return { start, end: start + DAY - 1000 };
}

function dayKeys(from, to) {
  const keys = [];
  for (let at = dayBounds(utcDay(from)).start; at <= to; at += DAY) keys.push(utcDay(at));
  return keys;
}

function galOf(players) {
  return (players || [])
    .filter((player) => String(player.clan || "").toUpperCase() === CLAN)
    .map((player) => ({ name: player.name, publicId: player.publicId || null }));
}

function readArchive(key) {
  if (archiveMem.has(key)) return archiveMem.get(key);
  try {
    const value = JSON.parse(fs.readFileSync(path.join(ARCHIVE_DIR, key + ".json"), "utf8"));
    if (value && value.complete) {
      archiveMem.set(key, value);
      return value;
    }
  } catch {
    /* jour pas encore archivé */
  }
  return null;
}

function writeArchive(day) {
  archiveMem.set(day.key, day);
  try {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    const file = path.join(ARCHIVE_DIR, day.key + ".json");
    fs.writeFileSync(file + ".tmp", JSON.stringify(day));
    fs.renameSync(file + ".tmp", file);
  } catch {
    /* archive disque optionnelle */
  }
}

async function fetchDay(key) {
  const { start, end } = dayBounds(key);
  const query = { start: new Date(start).toISOString(), end: new Date(Math.min(end, Date.now())).toISOString() };
  const stats = await apiGet("/public/clan/" + CLAN + "?" + new URLSearchParams(query).toString());
  const sessions = await allPages("/public/clan/" + CLAN + "/sessions", query);
  const known = new Map(((liveDays.get(key) || {}).value || { sessions: [] }).sessions.map((row) => [row.gameId, row.gal]));
  return {
    key,
    // Une partie peut encore être comptée quelques heures après minuit.
    complete: end < Date.now() - 3 * 60 * 60 * 1000,
    at: Date.now(),
    stats: stats.clan || {},
    sessions: (sessions.results || []).map((row) => {
      const { players, map, ...rest } = row;
      const cached = gamePlayerCache.get(row.gameId);
      return { ...rest, gal: known.get(row.gameId) || (cached ? galOf(cached.players) : null) };
    }),
  };
}

function archiveDay(key) {
  const saved = readArchive(key);
  if (saved) return Promise.resolve(saved);
  const live = liveDays.get(key);
  if (live && Date.now() - live.at < 5 * 60 * 1000) return Promise.resolve(live.value);
  if (archiveBusy.has(key)) return archiveBusy.get(key);
  const job = (async () => {
    let last;
    for (let tryNo = 0; tryNo < 3; tryNo++) {
      try {
        const day = await fetchDay(key);
        if (day.complete) writeArchive(day);
        else liveDays.set(key, { at: Date.now(), value: day });
        return day;
      } catch (error) {
        last = error;
        if (tryNo < 2) await sleep([3000, 8000][tryNo]);
      }
    }
    if (live) return live.value;
    throw last;
  })().finally(() => archiveBusy.delete(key));
  archiveBusy.set(key, job);
  return job;
}

async function fillGal(days, budget) {
  let missing = 0;
  for (const day of days) {
    let changed = false;
    for (const row of day.sessions) {
      if (row.gal) continue;
      const cached = gamePlayerCache.get(row.gameId);
      if (cached) {
        row.gal = galOf(cached.players);
        changed = true;
        continue;
      }
      if (budget <= 0 || Date.now() < weekBlockedUntil) {
        missing += 1;
        continue;
      }
      budget -= 1;
      try {
        row.gal = galOf((await fetchPlayers(row.gameId)).players);
        changed = true;
      } catch (error) {
        missing += 1;
        if (/^429/.test(String(error.message || ""))) weekBlockedUntil = Date.now() + 5 * 60 * 1000;
      }
      await sleep(400);
    }
    if (changed && day.complete) writeArchive(day);
  }
  saveGamePlayers();
  return missing;
}

function weekDay(rows, window) {
  const players = {};
  const accounts = new Set();
  let gained = 0;
  let points = 0;
  for (const row of rows) {
    const score = Number(row.score) || 0;
    points += score;
    if (score > 0) gained += score;
    const seen = new Set();
    for (const player of row.gal || []) {
      const key = accountKey(player);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      accounts.add(key);
      const name = player.name || player.publicId || "";
      const item = players[key] || [name, 0];
      item[1] += score;
      if (name) item[0] = item[0] || name;
      players[key] = item;
      const nick = String(name).toLowerCase();
      if (nick) players[nick] = item;
    }
  }
  return {
    start: window.start,
    end: window.end,
    games: rows.length,
    gained,
    points,
    unique: accounts.size,
    players,
  };
}

async function buildWeek() {
  const now = Date.now();
  const windows = [];
  for (let back = 6; back >= 0; back--) {
    const end = now - back * DAY;
    windows.push({ start: end - DAY + 1000, end });
  }
  const keys = dayKeys(windows[0].start, now);
  const days = [];
  const failed = new Set();
  for (const key of keys.slice().reverse()) {
    try {
      days.push(await archiveDay(key));
    } catch {
      failed.add(key);
    }
  }
  if (!days.length) throw new Error("OpenFront limite les requêtes, nouvel essai dans quelques minutes.");
  const missing = await fillGal(days, 150);
  const seen = new Set();
  const rows = [];
  for (const day of days) {
    for (const row of day.sessions) {
      if (seen.has(row.gameId)) continue;
      seen.add(row.gameId);
      rows.push(row);
    }
  }
  return {
    builtAt: new Date(now).toISOString(),
    partial: missing > 0 || failed.size > 0,
    missing,
    days: windows.map((window) => {
      const inside = rows.filter((row) => {
        const at = Date.parse(row.gameStart || "");
        return at >= window.start && at <= window.end;
      });
      const hole = [...failed].some((key) => {
        const bounds = dayBounds(key);
        return bounds.start <= window.end && bounds.end >= window.start;
      });
      return {
        ...weekDay(inside, { start: new Date(window.start).toISOString(), end: new Date(window.end).toISOString() }),
        failed: hole,
      };
    }),
  };
}

async function loadWeek(force) {
  const ttl = weekCache.value && weekCache.value.partial ? 5 * 60 * 1000 : 10 * 60 * 1000;
  if (Date.now() < weekBlockedUntil && weekCache.value) return weekCache.value;
  if (!force && weekCache.value && Date.now() - weekCache.at < ttl) return weekCache.value;
  if (!force && !weekCache.value) {
    try {
      const saved = JSON.parse(fs.readFileSync(WEEK_FILE, "utf8"));
      if (saved && saved.value) {
        weekCache = { at: Number(saved.at), value: saved.value };
        if (Date.now() - weekCache.at < ttl) return saved.value;
      }
    } catch {
      /* pas encore de cache */
    }
  }
  if (!weekPending) {
    weekPending = buildWeek()
      .then((value) => {
        weekCache = { at: Date.now(), value };
        try {
          fs.mkdirSync(path.dirname(WEEK_FILE), { recursive: true });
          fs.writeFileSync(WEEK_FILE + ".tmp", JSON.stringify(weekCache));
          fs.renameSync(WEEK_FILE + ".tmp", WEEK_FILE);
        } catch {
          /* cache disque optionnel */
        }
        return value;
      })
      .finally(() => {
        weekPending = null;
      });
  }
  if (weekCache.value && !force) {
    weekPending.catch(() => {});
    return weekCache.value;
  }
  return weekPending;
}

const RANK_PERIODS = [7, 30, 90];
const RANKS_FILE = path.join(__dirname, "cache", "ranks.json");
let ranksCache = { at: 0, value: null };
let ranksPending = null;
try {
  const saved = JSON.parse(fs.readFileSync(RANKS_FILE, "utf8"));
  if (saved && saved.value) ranksCache = { at: Number(saved.at) || 0, value: saved.value };
} catch {
  /* pas encore de cache */
}

function saveRanks(value) {
  try {
    fs.mkdirSync(path.dirname(RANKS_FILE), { recursive: true });
    fs.writeFileSync(RANKS_FILE + ".tmp", JSON.stringify({ at: Date.now(), value }));
    fs.renameSync(RANKS_FILE + ".tmp", RANKS_FILE);
  } catch {
    /* ignore */
  }
}

function accountKey(player) {
  if (player && player.publicId) return "id:" + String(player.publicId);
  const name = String((player && player.name) || "").trim();
  return name ? "name:" + name.toLowerCase() : "";
}

function rememberName(item, name) {
  if (!name) return;
  if (!item.name) item.name = name;
  else if (name !== item.name && !(item.aliases || []).includes(name)) item.aliases.push(name);
}

function mergeNameOnly(map) {
  const byName = new Map();
  for (const item of map.values()) {
    if (!item.publicId) continue;
    if (item.name) byName.set(String(item.name).toLowerCase(), item);
    for (const alias of item.aliases || []) byName.set(String(alias).toLowerCase(), item);
  }
  for (const [key, item] of [...map.entries()]) {
    if (!key.startsWith("name:")) continue;
    const host = byName.get(key.slice(5));
    if (!host || host === item) continue;
    host.gained += item.gained;
    host.lost += item.lost;
    host.wins += item.wins;
    host.losses += item.losses;
    rememberName(host, item.name);
    for (const alias of item.aliases || []) rememberName(host, alias);
    map.delete(key);
  }
}

function rankPlayers(rows) {
  const map = new Map();
  for (const row of rows) {
    const score = Number(row.score) || 0;
    const seen = new Set();
    for (const player of row.gal || []) {
      const key = accountKey(player);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      let item = map.get(key);
      if (!item) {
        item = { name: "", publicId: player.publicId || "", aliases: [], gained: 0, lost: 0, wins: 0, losses: 0 };
        map.set(key, item);
      }
      rememberName(item, player.name || player.publicId || "");
      if (player.publicId && !item.publicId) item.publicId = player.publicId;
      if (row.hasWon) item.wins += 1;
      else item.losses += 1;
      if (score >= 0) item.gained += score;
      else item.lost += -score;
    }
  }
  mergeNameOnly(map);
  return [...map.values()];
}

async function buildRanks(budget) {
  const now = Date.now();
  const longest = Math.max(...RANK_PERIODS);
  const days = [];
  for (const key of dayKeys(now - longest * DAY, now).reverse()) {
    try {
      days.push(await archiveDay(key));
    } catch {
      /* jour relu au prochain calcul */
    }
  }
  if (budget > 0) await fillGal(days, budget);
  const seen = new Set();
  const rows = [];
  for (const day of days) {
    for (const row of day.sessions) {
      if (seen.has(row.gameId)) continue;
      seen.add(row.gameId);
      rows.push(row);
    }
  }
  const periods = {};
  for (const span of RANK_PERIODS) {
    const start = now - span * DAY;
    const inside = rows.filter((row) => Date.parse(row.gameStart || "") >= start);
    periods[span] = {
      days: span,
      start: new Date(start).toISOString(),
      end: new Date(now).toISOString(),
      games: inside.length,
      read: inside.filter((row) => row.gal).length,
      rows: rankPlayers(inside),
    };
  }
  return { builtAt: new Date(now).toISOString(), periods };
}

function loadRanks() {
  if (ranksCache.value && Date.now() - ranksCache.at < 3 * 60 * 1000) return Promise.resolve(ranksCache.value);
  if (!ranksPending) {
    ranksPending = buildRanks(ranksCache.value ? 200 : 0)
      .then((value) => {
        ranksCache = { at: Date.now(), value };
        saveRanks(value);
        return value;
      })
      .catch((error) => {
        if (ranksCache.value) return ranksCache.value;
        throw error;
      })
      .finally(() => {
        ranksPending = null;
      });
  }
  if (ranksCache.value) {
    ranksPending.catch(() => {});
    return Promise.resolve(ranksCache.value);
  }
  return ranksPending;
}

function emptyRec() {
  return { games: 0, wins: 0, losses: 0, gained: 0, lost: 0 };
}

function addGameRec(rec, row) {
  const score = Number(row.score) || 0;
  rec.games += 1;
  if (row.hasWon) rec.wins += 1;
  else rec.losses += 1;
  if (score >= 0) rec.gained += score;
  else rec.lost += -score;
}

function addMate(map, key, name, won, score) {
  if (!key) return;
  let item = map.get(key);
  if (!item) item = { id: key, name: name || key, games: 0, wins: 0, losses: 0, gained: 0, lost: 0 };
  item.games += 1;
  if (won) item.wins += 1;
  else item.losses += 1;
  if (score >= 0) item.gained += score;
  else item.lost += -score;
  if (name) item.name = name;
  map.set(key, item);
}

function topMates(map, limit) {
  return [...map.values()]
    .sort((a, b) => b.wins - a.wins || b.games - a.games || (b.gained - b.lost) - (a.gained - a.lost))
    .slice(0, limit);
}

function walkCareer(node, path, out) {
  if (!node || typeof node !== "object") return;
  if ("wins" in node && "total" in node && !Array.isArray(node)) {
    out.push({ path, leaf: node });
    return;
  }
  for (const key of Object.keys(node)) walkCareer(node[key], path.concat(key), out);
}

function mergeDeep(dst, src) {
  for (const [key, value] of Object.entries(src || {})) {
    if (Array.isArray(value)) {
      dst[key] = dst[key] || [];
      value.forEach((item, index) => {
        dst[key][index] = (Number(dst[key][index]) || 0) + (Number(item) || 0);
      });
    } else if (value && typeof value === "object") {
      dst[key] = dst[key] || {};
      mergeDeep(dst[key], value);
    } else {
      dst[key] = (Number(dst[key]) || 0) + (Number(value) || 0);
    }
  }
}

function careerOf(stats) {
  const leaves = [];
  walkCareer(stats, [], leaves);
  const groups = [];
  const deep = {};
  let wins = 0;
  let losses = 0;
  let games = 0;
  for (const { path, leaf } of leaves) {
    const w = Number(leaf.wins) || 0;
    const l = Number(leaf.losses) || 0;
    const t = Number(leaf.total) || w + l;
    wins += w;
    losses += l;
    games += t;
    groups.push({
      bucket: path[0] || "Autre",
      mode: path[1] || "—",
      diff: path[2] || "",
      wins: w,
      losses: l,
      games: t,
    });
    mergeDeep(deep, leaf.stats || {});
  }
  return { wins, losses, games, groups, deep };
}

function scanPlayerArchive(id) {
  const now = Date.now();
  const allies = new Map();
  const packs = { 2: new Map(), 3: new Map(), 4: new Map() };
  const windows = { 7: emptyRec(), 30: emptyRec(), 90: emptyRec() };
  const aliases = [];
  const seenName = new Set();
  for (const key of dayKeys(now - 90 * DAY, now).reverse()) {
    let day = archiveMem.get(key);
    if (!day) {
      try {
        day = readArchive(key);
      } catch {
        day = null;
      }
    }
    if (!day || !day.sessions) continue;
    for (const row of day.sessions) {
      const gal = row.gal;
      if (!gal) continue;
      const me = gal.find((player) => player.publicId === id);
      if (!me) continue;
      if (me.name && !seenName.has(me.name)) {
        seenName.add(me.name);
        aliases.push(me.name);
      }
      const start = Date.parse(row.gameStart || "");
      const score = Number(row.score) || 0;
      for (const span of RANK_PERIODS) {
        if (Number.isFinite(start) && start >= now - span * DAY) addGameRec(windows[span], row);
      }
      const others = gal.filter((player) => player.publicId !== id);
      for (const other of others) addMate(allies, other.publicId || other.name, other.name, row.hasWon, score);
      const size = gal.length;
      if (size >= 2 && size <= 4) {
        const mates = others
          .map((player) => ({ id: player.publicId || player.name, name: player.name || player.publicId }))
          .sort((a, b) => String(a.id).localeCompare(String(b.id)));
        addMate(packs[size], mates.map((mate) => mate.id).join("|"), mates.map((mate) => mate.name).join(" · "), row.hasWon, score);
      }
    }
  }
  return { allies, packs, windows, aliases };
}

function recFromClanDay(id, clan) {
  const rec = emptyRec();
  for (const row of (clan && clan.sessions && clan.sessions.results) || []) {
    const mine = (row.players || []).some((player) => player.publicId === id && String(player.clan || "").toUpperCase() === CLAN);
    if (!mine) continue;
    addGameRec(rec, row);
  }
  return rec;
}

const dossierCache = new Map();

async function playerDossier(id) {
  const hit = dossierCache.get(id);
  if (hit && Date.now() - hit.at < 3 * 60 * 1000) return hit.value;
  const raw = await apiGet("/public/player/" + id);
  const clan = (clanCache.get("24h") || {}).value || null;
  const member = (((clan && clan.members && clan.members.results) || []).find((row) => row.publicId === id)) || null;
  const ofClan = (raw.clans || []).find((row) => String(row.tag || "").toUpperCase() === CLAN) || (raw.clans || [])[0] || null;
  const career = careerOf(raw.stats || {});
  const scan = scanPlayerArchive(id);
  const created = Date.parse(raw.createdAt || "");
  const ageDays = Number.isFinite(created) ? Math.max(0, Math.round((Date.now() - created) / DAY)) : null;
  const dossier = {
    publicId: raw.publicId || id,
    username: raw.username || (member && member.username) || id,
    createdAt: raw.createdAt || null,
    ageDays,
    activity: ageDays && career.games ? career.games / ageDays : null,
    role: (member && member.role) || (ofClan && ofClan.role) || "",
    joinedAt: (member && member.joinedAt) || (ofClan && ofClan.joinedAt) || null,
    clan: ofClan ? { tag: ofClan.tag, name: ofClan.name, members: ofClan.memberCount } : null,
    aliases: scan.aliases.filter((name) => name && name !== raw.username),
    career,
    clanModes: member && member.stats ? member.stats : null,
    windows: {
      "24h": recFromClanDay(id, clan),
      7: scan.windows[7],
      30: scan.windows[30],
      90: scan.windows[90],
    },
    mates: {
      allies: topMates(scan.allies, 8),
      duos: topMates(scan.packs[2], 6),
      trios: topMates(scan.packs[3], 6),
      quads: topMates(scan.packs[4], 4),
    },
  };
  const value = { ...raw, dossier };
  dossierCache.set(id, { at: Date.now(), value });
  return value;
}

function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    ...GUARD,
    "content-type": "application/json; charset=utf-8",
    "content-length": data.length,
  });
  res.end(data);
}

const directory = createDirectory({ apiGet, background, cacheDir: path.join(__dirname, "cache") });

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/robots.txt") {
    res.writeHead(200, { ...GUARD, "content-type": "text/plain; charset=utf-8" });
    res.end("User-agent: *\nDisallow: /\n");
    return;
  }
  if (url.pathname === "/mod.js" || url.pathname === "/of-deck/mod.js") {
    fs.readFile(path.join(__dirname, "mod.js"), (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store",
        ...CORS,
        "cross-origin-resource-policy": "cross-origin",
      });
      res.end(data);
    });
    return;
  }
  if (url.pathname === "/health" || url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      pid: process.pid,
      up: Math.floor(process.uptime()),
      live: !!lastState,
      snap: lastSnapAt,
      pushed: lastLivePush,
    });
    return;
  }
  if (url.pathname === "/api/state" && req.method === "POST") {
    if (viaTunnel(req)) {
      res.writeHead(401, { ...CORS, "content-type": "application/json" });
      res.end('{"error":"auth"}');
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_500_000) req.destroy();
      else chunks.push(chunk);
    });
    req.on("end", () => {
      const ok = acceptState(Buffer.concat(chunks).toString("utf8"));
      res.writeHead(ok ? 200 : 400, { ...CORS, "content-type": "application/json" });
      res.end(ok ? '{"ok":true}' : '{"error":"état"}');
    });
    return;
  }
  if (url.pathname === "/gate.js") {
    fs.readFile(path.join(ROOT, "gate.js"), (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { ...GUARD, "content-type": "text/javascript; charset=utf-8" });
      res.end(data);
    });
    return;
  }
  if (url.pathname === "/api/gate" && req.method === "GET") {
    const ip = clientIp(req);
    if (lockedOut(ip) || tooManyGates(ip)) {
      sendJson(res, 429, { error: "lock" });
      return;
    }
    noteGateIssue(ip);
    sendJson(res, 200, issueGate(ip));
    return;
  }
  if (url.pathname === "/deck.css" || url.pathname === "/skins.css") {
    fs.readFile(path.join(ROOT, url.pathname.slice(1)), (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { ...GUARD, "content-type": "text/css; charset=utf-8" });
      res.end(data);
    });
    return;
  }
  if (url.pathname === "/admin.js") {
    fs.readFile(path.join(ROOT, "admin.js"), (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { ...GUARD, "content-type": "text/javascript; charset=utf-8" });
      res.end(data);
    });
    return;
  }
  if (url.pathname === "/admin" && req.method === "GET") {
    if (!adminAllowed(req)) {
      res.writeHead(200, { ...GUARD, "content-type": "text/html; charset=utf-8" });
      res.end(adminLoginPage(url.searchParams.get("e") === "1"));
      return;
    }
    fs.readFile(path.join(ROOT, "admin.html"), (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { ...GUARD, "content-type": "text/html; charset=utf-8" });
      res.end(data);
    });
    return;
  }
  if (url.pathname === "/admin" && req.method === "POST") {
    const ip = clientIp(req);
    readBody(req).then((raw) => {
      if (lockedOut(ip)) {
        res.writeHead(429, { ...GUARD, "content-type": "text/plain; charset=utf-8" });
        res.end("Trop de tentatives. Réessaie dans quelques minutes.");
        return;
      }
      const params = new URLSearchParams(raw);
      if (!adminPasswordOk(params.get("password"))) {
        noteFail(ip);
        res.writeHead(302, { ...GUARD, location: "/admin?e=1" });
        res.end();
        return;
      }
      clearFail(ip);
      const secure = viaTunnel(req) ? "; Secure" : "";
      res.writeHead(302, {
        ...GUARD,
        location: "/admin",
        "set-cookie": "ofdeck-admin=" + encodeURIComponent(makeAdminSession()) + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600" + secure,
      });
      res.end();
    }).catch(() => {
      res.writeHead(400, GUARD);
      res.end();
    });
    return;
  }
  if (url.pathname === "/api/admin") {
    if (!adminAllowed(req)) {
      sendJson(res, 401, { error: "auth" });
      return;
    }
    let range;
    try {
      range = resolveRange(url.searchParams.get("from") || "", url.searchParams.get("to") || "", url.searchParams.get("now") === "1");
    } catch (error) {
      sendJson(res, 400, { error: String(error.message || error) });
      return;
    }
    loadSolo(range)
      .then((value) => sendJson(res, 200, value))
      .catch((error) => sendJson(res, 502, { error: String(error.message || error) }));
    return;
  }
  if (url.pathname === "/login" && req.method === "GET") {
    if (allowed(req)) {
      res.writeHead(302, { ...GUARD, location: "/" });
      res.end();
      return;
    }
    res.writeHead(200, { ...GUARD, "content-type": "text/html; charset=utf-8" });
    res.end(loginPage(url.searchParams.get("e") === "1"));
    return;
  }
  if (url.pathname === "/login" && req.method === "POST") {
    const ip = clientIp(req);
    readBody(req).then((raw) => {
      if (lockedOut(ip)) {
        res.writeHead(429, { ...GUARD, "content-type": "text/plain; charset=utf-8" });
        res.end("Trop de tentatives. Réessaie dans quelques minutes.");
        return;
      }
      const params = new URLSearchParams(raw);
      if (!proofOk(ip, params)) {
        noteFail(ip);
        res.writeHead(302, { ...GUARD, location: "/login?e=1" });
        res.end();
        return;
      }
      clearFail(ip);
      const secure = viaTunnel(req) ? "; Secure" : "";
      res.writeHead(302, {
        ...GUARD,
        location: "/",
        "set-cookie": "ofdeck=" + encodeURIComponent(makeSession()) + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600" + secure,
      });
      res.end();
    }).catch(() => {
      res.writeHead(400, GUARD);
      res.end();
    });
    return;
  }
  if (!allowed(req)) {
    if (url.pathname.startsWith("/api/")) {
      res.writeHead(401, { ...GUARD, "content-type": "application/json; charset=utf-8" });
      res.end('{"error":"auth"}');
      return;
    }
    res.writeHead(302, { ...GUARD, location: "/login" });
    res.end();
    return;
  }
  if (url.pathname === "/api/hub" && req.method === "GET") {
    sendJson(res, 200, readHub());
    return;
  }
  if (url.pathname === "/api/quarter") {
    background.run(true, () => loadQuarter(url.searchParams.get("fresh") === "1"))
      .then((value) => sendJson(res, 200, value))
      .catch((error) => {
        if (quarterCache.value) sendJson(res, 200, quarterCache.value);
        else sendJson(res, 502, { error: String(error.message || error) });
      });
    return;
  }
  if (url.pathname === "/api/week") {
    background.run(true, () => loadWeek(url.searchParams.get("fresh") === "1"))
      .then((value) => sendJson(res, 200, value))
      .catch((error) => {
        if (weekCache.value) sendJson(res, 200, weekCache.value);
        else sendJson(res, 502, { error: String(error.message || error) });
      });
    return;
  }
  if (url.pathname === "/api/ranks") {
    background.run(true, () => loadRanks())
      .then((value) => sendJson(res, 200, value))
      .catch((error) => {
        if (ranksCache.value) sendJson(res, 200, ranksCache.value);
        else sendJson(res, 502, { error: String(error.message || error) });
      });
    return;
  }
  if (url.pathname === "/api/clan") {
    let range;
    try {
      range = resolveRange(url.searchParams.get("from") || "", url.searchParams.get("to") || "", url.searchParams.get("now") === "1");
    } catch (error) {
      sendJson(res, 400, { error: String(error.message || error) });
      return;
    }
    const key = range.rolling ? "24h" : range.start.toISOString() + "|" + range.end.toISOString();
    if (url.searchParams.get("fresh") === "1") clanCache.delete(key);
    const hit = clanCache.get(key);
    const pending = hit && Date.now() - hit.at < 2 * 60 * 1000
      ? Promise.resolve(hit.value)
      : loadClan(range).then((value) => {
          clanCache.set(key, { at: Date.now(), value });
          if (key === "24h") saveClan(value);
          return value;
        }).catch((error) => {
          if (hit) return hit.value;
          throw error;
        });
    pending.then((value) => sendJson(res, 200, value)).catch((error) => {
      const saved = clanCache.get("24h");
      if (saved && saved.value) sendJson(res, 200, saved.value);
      else sendJson(res, 502, { error: String(error.message || error) });
    });
    return;
  }
  if (url.pathname === "/api/players") {
    sendJson(res, 200, directory.query(url.searchParams));
    return;
  }
  if (url.pathname.startsWith("/api/players/")) {
    const row = directory.one(decodeURIComponent(url.pathname.slice("/api/players/".length)));
    if (row) sendJson(res, 200, row);
    else sendJson(res, 404, { error: "Joueur inconnu." });
    return;
  }
  if (url.pathname.startsWith("/api/player/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/player/".length));
    if (!/^[A-Za-z0-9]{4,16}$/.test(id)) {
      sendJson(res, 400, { error: "Joueur invalide." });
      return;
    }
    playerDossier(id)
      .then((value) => sendJson(res, 200, value))
      .catch((error) => sendJson(res, 502, { error: String(error.message || error) }));
    return;
  }
  if (url.pathname === "/ws") {
    res.writeHead(426);
    res.end("websocket");
    return;
  }
  const file = FILES[url.pathname];
  if (!file) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const full = path.join(ROOT, file);
  fs.readFile(full, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, {
      ...GUARD,
      "content-type": TYPES[path.extname(file)] || "text/plain",
    });
    res.end(data);
  });
});

server.on("upgrade", (req, socket) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname !== "/ws" || !allowed(req)) {
    socket.destroy();
    return;
  }
  attachSocket(req, socket);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.log("OF Deck déjà lancé sur http://127.0.0.1:" + PORT);
    process.exit(0);
  }
  console.error(error);
});

server.listen(PORT, HOST, () => {
  watchGame();
  writeHeartbeat();
  console.log("OF Deck http://" + HOST + ":" + PORT);
  background.run(true, () => loadQuarter(false)).catch((error) => console.log("quarter", error && error.message));
  directory.start();
  setTimeout(pushSnaps, 20 * 1000);
  setInterval(pushSnaps, 3 * 60 * 1000);
  setInterval(writeHeartbeat, 20 * 1000);
});

process.on("uncaughtException", (error) => {
  console.error("uncaught", error && error.message ? error.message : error);
});
process.on("unhandledRejection", (error) => {
  console.error("unhandled", error && error.message ? error.message : error);
});
