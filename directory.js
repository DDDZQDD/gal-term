"use strict";

const fs = require("fs");
const path = require("path");

const STEP_MS = 3000;
const MAX_STEP_MS = 60000;
const WINDOW_MS = 60 * 60 * 1000;
const SETTLE_MS = 30 * 60 * 1000;
const STATS_TTL = 24 * 60 * 60 * 1000;
const FLOOR = Date.parse("2025-11-01T00:00:00Z");

function pair(row) {
  return [Number(row && row.wins) || 0, Number(row && row.losses) || 0];
}

function add(target, value) {
  target[0] += value[0];
  target[1] += value[1];
}

function summarize(stats) {
  const out = { ffa: [0, 0], team: [0, 0], hvn: [0, 0], r1v1: [0, 0], r2v2: [0, 0], priv: [0, 0], total: [0, 0] };
  const pub = (stats && stats.Public) || {};
  const modes = { "Free For All": "ffa", Team: "team", "Humans Vs Nations": "hvn" };
  for (const [mode, byLevel] of Object.entries(pub)) {
    const key = modes[mode];
    if (!key) continue;
    for (const row of Object.values(byLevel || {})) add(out[key], pair(row));
  }
  for (const byLevel of Object.values((stats && stats.Private) || {})) {
    for (const row of Object.values(byLevel || {})) add(out.priv, pair(row));
  }
  const ranked = (stats && stats.Ranked) || {};
  add(out.r1v1, pair(ranked["1v1"]));
  add(out.r2v2, pair(ranked["2v2"]));
  for (const key of ["ffa", "team", "hvn", "r1v1", "r2v2", "priv"]) add(out.total, out[key]);
  return out;
}

function ratio(value) {
  const games = value[0] + value[1];
  return games ? value[0] / games : -1;
}

module.exports = function createDirectory({ apiGet, background, cacheDir }) {
  const FILE = path.join(cacheDir, "directory.json");
  let players = {};
  let clans = {};
  let ranks = { at: 0, list: {} };
  let state = { head: 0, tail: 0, window: null, games: 0, deletedAt: 0, deletedSince: 0 };
  let dirty = false;
  let stepMs = STEP_MS;
  let turn = 0;
  let lastError = "";

  try {
    const saved = JSON.parse(fs.readFileSync(FILE, "utf8"));
    players = saved.players || {};
    clans = saved.clans || {};
    ranks = saved.ranks || ranks;
    state = { ...state, ...(saved.state || {}) };
  } catch {
    /* premier lancement */
  }

  function save() {
    if (!dirty) return;
    dirty = false;
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(FILE + ".tmp", JSON.stringify({ players, clans, ranks, state }));
      fs.renameSync(FILE + ".tmp", FILE);
    } catch {
      dirty = true;
    }
  }
  setInterval(save, 20000).unref();

  function remember(player, at) {
    const id = player.publicID;
    const row = players[id] || { id, name: player.username, clan: player.clanTag || null, first: at, last: 0, seen: 0, stats: null, statsAt: 0 };
    if (at >= row.last) {
      row.name = player.username || row.name;
      row.clan = player.clanTag || null;
      row.last = at;
    }
    row.first = Math.min(row.first || at, at);
    row.seen += 1;
    players[id] = row;
  }

  async function openWindow() {
    const now = Date.now();
    const settled = now - SETTLE_MS;
    if (!state.head) {
      state.head = settled;
      state.tail = settled;
    }
    let start;
    let end;
    let dir;
    if (settled - state.head >= 10 * 60 * 1000) {
      start = state.head;
      end = Math.min(state.head + WINDOW_MS, settled);
      dir = "head";
    } else if (state.tail > FLOOR) {
      start = Math.max(FLOOR, state.tail - WINDOW_MS);
      end = state.tail;
      dir = "tail";
    } else {
      return false;
    }
    const ids = [];
    for (let offset = 0; offset < 20000; offset += 1000) {
      const query = new URLSearchParams({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), type: "Public", limit: "1000", offset: String(offset) });
      const page = await apiGet("/public/games?" + query.toString());
      for (const game of Array.isArray(page) ? page : []) ids.push([game.game, Date.parse(game.start) || start]);
      if (!Array.isArray(page) || page.length < 1000) break;
    }
    state.window = { start, end, dir, ids, index: 0 };
    dirty = true;
    return true;
  }

  function closeWindow() {
    const window = state.window;
    if (window.dir === "head") state.head = window.end;
    else state.tail = window.start;
    state.window = null;
    dirty = true;
  }

  async function readGame() {
    const window = state.window;
    if (window.index >= window.ids.length) {
      closeWindow();
      return;
    }
    const [id, at] = window.ids[window.index];
    try {
      const data = await apiGet("/public/game/" + encodeURIComponent(id) + "?turns=false");
      for (const player of (data.info && data.info.players) || []) {
        if (player && player.publicID && player.cosmetics && player.cosmetics.verified) remember(player, at);
      }
    } catch (error) {
      if (!/^404/.test(String(error.message || ""))) throw error;
    }
    window.index += 1;
    state.games += 1;
    dirty = true;
  }

  function stalest() {
    let pick = null;
    const limit = Date.now() - STATS_TTL;
    for (const row of Object.values(players)) {
      if (row.statsAt > limit) continue;
      if (!pick || row.statsAt < pick.statsAt) pick = row;
    }
    return pick;
  }

  async function readProfile(row) {
    try {
      const data = await apiGet("/public/player/" + encodeURIComponent(row.id));
      row.stats = summarize(data.stats);
      row.created = data.createdAt || null;
      row.statsAt = Date.now();
    } catch (error) {
      if (/^404/.test(String(error.message || ""))) delete players[row.id];
      else throw error;
    }
    dirty = true;
  }

  function staleClan() {
    const limit = Date.now() - STATS_TTL;
    const tags = new Set(Object.values(players).map((row) => row.clan).filter(Boolean));
    let pick = null;
    for (const tag of tags) {
      const at = (clans[tag] && clans[tag].at) || 0;
      if (at > limit) continue;
      if (pick === null || at < ((clans[pick] && clans[pick].at) || 0)) pick = tag;
    }
    return pick;
  }

  async function readClan(tag) {
    try {
      const data = await apiGet("/public/clan/" + encodeURIComponent(tag));
      const clan = data.clan || {};
      clans[tag] = {
        games: Number(clan.games) || 0,
        wins: Number(clan.wins) || 0,
        losses: Number(clan.losses) || 0,
        weightedWins: Number(clan.weightedWins) || 0,
        weightedLosses: Number(clan.weightedLosses) || 0,
        at: Date.now(),
      };
    } catch (error) {
      if (/^404/.test(String(error.message || ""))) clans[tag] = { games: 0, wins: 0, losses: 0, weightedWins: 0, weightedLosses: 0, at: Date.now() };
      else throw error;
    }
    dirty = true;
  }

  async function readRanks() {
    const data = await apiGet("/public/clans/leaderboard");
    const list = {};
    (data.clans || []).forEach((clan, index) => {
      list[clan.clanTag] = index + 1;
    });
    ranks = { at: Date.now(), list };
    dirty = true;
  }

  async function readDeleted() {
    // OpenFront demande de purger chaque jour les comptes supprimés des données collectées.
    const since = Math.max(state.deletedSince || 0, Date.now() - 6 * 24 * 60 * 60 * 1000);
    const rows = await apiGet("/public/players/recently-deleted?since=" + encodeURIComponent(new Date(since).toISOString()));
    for (const row of Array.isArray(rows) ? rows : []) delete players[row.publicId];
    state.deletedSince = Date.now();
    state.deletedAt = Date.now();
    dirty = true;
  }

  async function step() {
    turn += 1;
    if (Date.now() - state.deletedAt > 24 * 60 * 60 * 1000) return readDeleted();
    if (Date.now() - ranks.at > 6 * 60 * 60 * 1000) return readRanks();
    if (turn % 3 === 0) {
      const row = stalest();
      if (row) return readProfile(row);
    }
    if (turn % 7 === 0) {
      const tag = staleClan();
      if (tag) return readClan(tag);
    }
    if (!state.window) {
      if (await openWindow()) return;
      const row = stalest();
      if (row) return readProfile(row);
      return;
    }
    return readGame();
  }

  async function tick() {
    try {
      await background.run(true, step);
      lastError = "";
      stepMs = Math.max(STEP_MS, Math.round(stepMs * 0.8));
    } catch (error) {
      lastError = String(error.message || error).slice(0, 120);
      stepMs = Math.min(MAX_STEP_MS, stepMs * 2);
    }
    setTimeout(tick, stepMs).unref();
  }

  function start() {
    setTimeout(tick, 5000).unref();
  }

  function clanOf(tag) {
    if (!tag) return null;
    const clan = clans[tag];
    return {
      tag,
      rank: ranks.list[tag] || null,
      games: clan ? clan.games : null,
      wins: clan ? clan.wins : null,
      losses: clan ? clan.losses : null,
      weightedWins: clan ? clan.weightedWins : null,
      weightedLosses: clan ? clan.weightedLosses : null,
    };
  }

  function view(row) {
    return { id: row.id, name: row.name, clan: clanOf(row.clan), first: row.first, last: row.last, seen: row.seen, stats: row.stats, statsAt: row.statsAt };
  }

  const SORTS = {
    name: (row) => String(row.name || "").toLowerCase(),
    clan: (row) => String(row.clan || "~").toLowerCase(),
    games: (row) => (row.stats ? row.stats.total[0] + row.stats.total[1] : -1),
    wins: (row) => (row.stats ? row.stats.total[0] : -1),
    ratio: (row) => (row.stats ? ratio(row.stats.total) : -1),
    team: (row) => (row.stats ? row.stats.team[0] : -1),
    ffa: (row) => (row.stats ? row.stats.ffa[0] : -1),
    ranked: (row) => (row.stats ? row.stats.r1v1[0] + row.stats.r2v2[0] : -1),
    clanGames: (row) => (row.clan && clans[row.clan] ? clans[row.clan].games : -1),
    clanRatio: (row) => {
      const clan = row.clan && clans[row.clan];
      return clan && clan.games ? clan.wins / clan.games : -1;
    },
    last: (row) => row.last || 0,
  };

  function query(params) {
    const q = String(params.get("q") || "").trim().toLowerCase();
    const clan = String(params.get("clan") || "").trim().toUpperCase();
    const sort = SORTS[params.get("sort")] ? params.get("sort") : "wins";
    const asc = params.get("dir") === "asc";
    const size = Math.min(100, Math.max(10, Number(params.get("size")) || 25));
    let rows = Object.values(players);
    if (q) rows = rows.filter((row) => `${row.name || ""} ${row.id} ${row.clan || ""}`.toLowerCase().includes(q));
    if (clan) rows = rows.filter((row) => String(row.clan || "").toUpperCase() === clan);
    const key = SORTS[sort];
    rows.sort((a, b) => {
      const left = key(a);
      const right = key(b);
      const order = left < right ? -1 : left > right ? 1 : 0;
      return (asc ? order : -order) || String(a.name || "").localeCompare(String(b.name || ""), "fr");
    });
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const page = Math.min(pages - 1, Math.max(0, Number(params.get("page")) || 0));
    return {
      total: rows.length,
      page,
      pages,
      size,
      sort,
      dir: asc ? "asc" : "desc",
      rows: rows.slice(page * size, page * size + size).map(view),
      status: status(),
    };
  }

  function status() {
    const all = Object.values(players);
    const window = state.window;
    return {
      players: all.length,
      withStats: all.filter((row) => row.stats).length,
      clans: Object.keys(clans).length,
      games: state.games,
      from: state.tail || null,
      to: state.head || null,
      window: window ? { dir: window.dir, done: window.index, size: window.ids.length } : null,
      stepMs,
      error: lastError,
    };
  }

  function one(id) {
    const row = players[id];
    return row ? view(row) : null;
  }

  function dump() {
    return { rows: Object.values(players).map(view), status: status() };
  }

  return { start, query, one, status, dump };
};
