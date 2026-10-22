(() => {
  const TAG = "GAL";
  const ATTACKS = ["Troupes envoyées", "Troupes reçues", "Troupes annulées", "Plus grosse attaque reçue"];
  const GOLD = ["Travailleurs", "Guerre", "Commerce", "Piraterie", "Tes trains", "Trains des autres", "Dons reçus"];
  const TILES = ["Pic de cases", "Pic avant la chute", "Creux"];
  const ALLIANCES = ["Formées", "Rompues par l'autre", "Expirées", "Tenues jusqu'à la fin", "Pic simultanées", "Plus longue (ticks)"];
  const DONATIONS = ["Or reçu", "Or reçu à sec"];
  const CONQUESTS = ["Humains", "Nations", "Bots"];
  const BOAT = ["Envoyés", "Arrivés", "Capturés", "Détruits", "Perdus"];
  const BOMB = ["Lancées", "Atterries", "Interceptées"];
  const UNIT = ["Construits", "Détruits", "Capturés", "Perdus", "Améliorations"];
  const NAMES = {
    trade: "Cargo", trans: "Transport", abomb: "Bombe A", hbomb: "Bombe H", mirv: "MIRV", mirvw: "Ogives MIRV",
    city: "Ville", defp: "Défense", port: "Port", wshp: "Navire", silo: "Silo", saml: "SAM", fact: "Usine",
    attacks: "Attaques", gold: "Or gagné", tiles: "Territoire", alliances: "Alliances", donations: "Dons",
    conquests: "Conquêtes", boats: "Bateaux", bombs: "Bombes", units: "Unités", betrayals: "Trahisons",
    peakTroops: "Pic de troupes", finalTiles: "Cases finales", killedAt: "Tick de mort", kills: "Éliminations",
  };
  const MODES = [
    ["total", "Total"], ["team", "Équipes"], ["ffa", "Chacun pour soi"], ["hvn", "Humains vs nations"],
    ["ranked", "Classé"], ["1v1", "1v1"], ["duos", "Duos"], ["trios", "Trios"], ["quads", "Quads"],
    ["2", "2 équipes"], ["3", "3 équipes"], ["4", "4 équipes"], ["5", "5 équipes"], ["6", "6 équipes"], ["7", "7 équipes"],
  ];
  const ROLES = { leader: "Chef", officer: "Officier", member: "Membre" };
  const RANKINGS = [
    ["solde", "Solde", "jour", "Points gagnés moins points perdus, du plus haut au plus bas. Chaque joueur GAL de la partie reçoit le score entier de cette partie."],
    ["gained", "Points gagnés", "jour", "Somme des scores des victoires, du plus gros total au plus petit."],
    ["lost", "Points perdus", "jour", "Somme des points perdus en défaite, du plus gros total au plus petit."],
    ["wins", "Victoires", "jour", "Nombre de parties GAL gagnées sur cette fenêtre."],
    ["losses", "Défaites", "jour", "Nombre de parties GAL perdues sur cette fenêtre."],
    ["games", "Parties", "jour", "Nombre de parties GAL jouées sur cette fenêtre."],
    ["ratio", "Ratio", "jour", "Victoires divisées par les parties. À égalité, celui qui a le plus joué passe devant."],
    ["c-total", "Victoires totales", "carriere", "Victoires de la fiche, tous modes confondus. Ce classement n’utilise pas le score de clan."],
    ["c-rate", "Ratio total", "carriere", "Pourcentage de victoires sur la fiche, tous modes. À égalité, le plus de parties passe devant."],
    ["c-team", "Victoires équipes", "carriere", "Victoires en parties en équipes, sur la fiche."],
    ["c-team-rate", "Ratio équipes", "carriere", "Pourcentage de victoires en équipes, sur la fiche."],
    ["c-ranked", "Victoires classées", "carriere", "Victoires en parties classées, sur la fiche."],
    ["c-ffa", "Victoires FFA", "carriere", "Victoires en chacun pour soi, sur la fiche."],
  ];
  const RANK_PERIODS = [["24h", "24 h"], ["7", "7 jours"], ["30", "30 jours"], ["90", "3 mois"]];
  const SKINS = [
    { id: "radar", name: "Radar" },
    { id: "ion", name: "Ion" },
    { id: "void", name: "Vide" },
    { id: "oxide", name: "Oxyde" },
    { id: "grit", name: "Grit" },
  ];

  const app = {
    root: document.getElementById("app"),
    clan: null,
    error: "",
    rolling: true,
    from: "",
    to: "",
    untilNow: false,
    limit: 0,
    page: 0,
    week: null,
    panel: "classement",
    board: "record",
    more: {},
    squad: 2,
    snap: null,
    quarter: null,
    link: false,
    query: "",
    sort: "wins",
    dir: "desc",
    rank: "solde",
    member: null,
    profile: null,
    profileError: "",
    leaf: "all",
    skin: (function () {
      try {
        const saved = localStorage.getItem("ofdeck-skin");
        if (saved && ["radar", "ion", "void", "oxide", "grit"].includes(saved)) return saved;
        localStorage.setItem("ofdeck-skin", "radar");
      } catch {
        /* stockage bloqué */
      }
      return "radar";
    })(),
    view: "board",
    hub: { clans: [] },
    find: { q: "", role: "", mode: "total", minWins: "", minGames: "", minRatio: "" },
    dir: { q: "", clan: "", sort: "wins", order: "desc", page: 0, data: null, error: "" },
    tutoLang: "fr",
    clanQuery: "",
    clanBoard: { sort: "rank", order: "asc", page: 0 },
    rankPeriod: "24h",
    ranks: null,
    profileTab: "vue",
    profQuery: "",
    clanFiche: null,
    bound: false,
  };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  function bi(value) {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
    if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
    const n = Number(value);
    return Number.isFinite(n) ? BigInt(Math.trunc(n)) : 0n;
  }

  function fmt(value) {
    const n = bi(value);
    const neg = n < 0n;
    const text = (neg ? -n : n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
    return (neg ? "−" : "") + text;
  }

  function dec(value, digits = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function signed(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return (n > 0 ? "+" : n < 0 ? "−" : "") + dec(Math.abs(n));
  }

  function lossPts(value) {
    const n = Math.abs(Number(value) || 0);
    return (n ? "−" : "") + dec(n);
  }

  function pct(wins, losses) {
    const w = Number(wins) || 0;
    const l = Number(losses) || 0;
    if (w + l <= 0) return "—";
    return ((100 * w) / (w + l)).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %";
  }

  function when(iso, withTime) {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("fr-FR", withTime
      ? { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "short", year: "numeric" });
  }

  function wl(row) {
    const wins = Number(row && row.wins) || 0;
    const losses = Number(row && row.losses) || 0;
    return { wins, losses };
  }

  function bar(wins, losses) {
    const total = (Number(wins) || 0) + (Number(losses) || 0);
    const width = total ? Math.round((100 * wins) / total) : 0;
    return `<div class="bar" title="${esc(pct(wins, losses))}"><i style="width:${width}%"></i></div>`;
  }

  function meter(tone, label, value, small) {
    return `<div class="meter ${tone}"><em>${esc(label)}</em><strong>${value}</strong>${small ? `<small>${small}</small>` : ""}</div>`;
  }

  function currentSkin() {
    return SKINS.find((skin) => skin.id === app.skin) || SKINS[0];
  }

  function applySkin() {
    const spec = currentSkin();
    document.documentElement.dataset.skin = spec.id;
    document.body.dataset.skin = spec.id;
    document.body.dataset.layout = "desk";
    document.title = "Clan " + TAG + " · " + spec.name;
  }

  function setSkin(id) {
    if (!SKINS.some((skin) => skin.id === id)) return;
    app.skin = id;
    try {
      localStorage.setItem("ofdeck-skin", id);
    } catch {
      /* stockage bloqué */
    }
    applySkin();
    if (app.view === "board") buildFrame();
    paint();
    paintLive();
  }

  function setView(id) {
    app.view = id || "board";
    const frame = app.root.querySelector("[data-frame]");
    if (frame && app.view === "board") {
      frame.className = "frame";
      buildFrame();
    }
    paint();
    paintLive();
    if (app.view === "players") loadDir();
  }

  function frameHtml() {
    return `<div data-slot="hero"></div>
      <div data-slot="live"></div>
      <div data-slot="queue"></div>
      <div data-slot="played"></div>
      <div data-slot="ranks"></div>`;
  }

  function buildFrame() {
    const frame = app.root.querySelector("[data-frame]");
    if (frame) frame.innerHTML = frameHtml();
    liveKey = null;
    queueKey = null;
    heightTarget = null;
  }

  function pageBox() {
    return (app.root && (app.root.querySelector(".term-main") || app.root.querySelector(".work"))) || document.scrollingElement;
  }

  function snapScroll(node) {
    const page = pageBox();
    return {
      page: page ? page.scrollTop : 0,
      win: window.scrollY,
      boxes: node ? [...node.querySelectorAll(".scroll, section, .panel-body")].map((box) => box.scrollTop) : [],
    };
  }

  function applyScroll(node, snap) {
    if (!snap) return;
    if (node) {
      node.querySelectorAll(".scroll, section, .panel-body").forEach((box, index) => {
        if (snap.boxes[index]) box.scrollTop = snap.boxes[index];
      });
    }
    const page = pageBox();
    if (page && page.scrollTop !== snap.page) page.scrollTop = snap.page;
    if (window.scrollY !== snap.win) window.scrollTo(0, snap.win);
  }

  function keepScroll(node, change) {
    const snap = snapScroll(node);
    change();
    applyScroll(node, snap);
  }

  const slotHtml = new WeakMap();

  function fillSlot(name, html) {
    const node = app.root.querySelector('[data-slot="' + name + '"]');
    if (!node || slotHtml.get(node) === html) return;
    keepScroll(node, () => {
      node.innerHTML = html;
      slotHtml.set(node, html);
    });
  }

  function bindChrome() {
    window.addEventListener("resize", () => requestAnimationFrame(syncPanelHeights));
    window.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (event.target && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (app.member || app.clanFiche) closeFiche();
    });
    app.root.addEventListener("click", (event) => {
      const fresh = event.target.closest("[data-fresh]");
      if (fresh) {
        load(true);
        return;
      }
      const more = event.target.closest("[data-more]");
      if (more) {
        app.more[more.dataset.more] = !app.more[more.dataset.more];
        repaintKeep();
        return;
      }
      const squad = event.target.closest("[data-squad]");
      if (squad) {
        const count = Number(squad.dataset.squad);
        if (count && count !== app.squad) {
          app.squad = count;
          repaintKeep();
        }
        return;
      }
      const rolling = event.target.closest("[data-rolling]");
      if (rolling) {
        app.rolling = true;
        app.untilNow = false;
        app.from = "";
        app.to = "";
        load(true);
        return;
      }
      const now = event.target.closest("[data-now]");
      if (now) {
        app.rolling = false;
        app.untilNow = true;
        app.to = "";
        if (!app.from) app.from = todayParis();
        load(true);
        return;
      }
      const limit = event.target.closest("[data-limit]");
      if (limit) {
        app.limit = Number(limit.dataset.limit) || 0;
        repaintKeep();
        return;
      }
      const view = event.target.closest("[data-view]");
      if (view) {
        setView(view.dataset.view);
        return;
      }
      const dirSort = event.target.closest("[data-dir-sort]");
      if (dirSort) {
        const key = dirSort.dataset.dirSort;
        app.dir.order = app.dir.sort === key && app.dir.order === "desc" ? "asc" : "desc";
        app.dir.sort = key;
        app.dir.page = 0;
        loadDir();
        return;
      }
      const period = event.target.closest("[data-rank-period]");
      if (period) {
        app.rankPeriod = period.dataset.rankPeriod;
        app.page = 0;
        if (String(app.rank).startsWith("c-")) app.rank = "solde";
        app.root.querySelectorAll("[data-rank-period]").forEach((button) => button.classList.toggle("on", button.dataset.rankPeriod === app.rankPeriod));
        paintRanks();
        return;
      }
      const cbSort = event.target.closest("[data-cb-sort]");
      if (cbSort) {
        const key = cbSort.dataset.cbSort;
        const state = app.clanBoard;
        const first = key === "rank" || key === "tag" ? "asc" : "desc";
        state.order = state.sort === key ? (state.order === "asc" ? "desc" : "asc") : first;
        state.sort = key;
        state.page = 0;
        const box = app.root.querySelector("[data-clan-board]");
        if (box) box.innerHTML = clanBoard();
        return;
      }
      const cbPage = event.target.closest("[data-cb-page]");
      if (cbPage) {
        app.clanBoard.page += cbPage.dataset.cbPage === "next" ? 1 : -1;
        const box = app.root.querySelector("[data-clan-board]");
        if (box) box.innerHTML = clanBoard();
        return;
      }
      const dirPage = event.target.closest("[data-dir-page]");
      if (dirPage) {
        app.dir.page = Math.max(0, app.dir.page + (dirPage.dataset.dirPage === "next" ? 1 : -1));
        loadDir();
        return;
      }
      const page = event.target.closest("[data-page]");
      if (page) {
        app.page = (app.page || 0) + (page.dataset.page === "next" ? 1 : -1);
        const box = app.root.querySelector(app.panel === "membres" ? "[data-member-box]" : "[data-ranks]");
        if (box) box.innerHTML = app.panel === "membres" ? memberTable() : rankTable();
        return;
      }
      const panel = event.target.closest("[data-panel]");
      if (panel) {
        app.panel = panel.dataset.panel;
        app.page = 0;
        repaintKeep();
        return;
      }
      const board = event.target.closest("[data-board]");
      if (board) {
        app.board = board.dataset.board;
        repaintKeep();
        return;
      }
      const sort = event.target.closest("[data-sort]");
      if (sort) {
        const key = sort.dataset.sort;
        if (app.sort === key) app.dir = app.dir === "desc" ? "asc" : "desc";
        else {
          app.sort = key;
          app.dir = key === "name" || key === "joined" ? "asc" : "desc";
        }
        app.page = 0;
        const box = app.root.querySelector("[data-member-box]");
        if (box) box.innerHTML = memberTable();
        return;
      }
      const rank = event.target.closest("[data-rank]");
      if (rank) {
        app.rank = rank.dataset.rank;
        app.page = 0;
        paintRanks();
        return;
      }
      const clanOpen = event.target.closest("[data-clan-open]");
      if (clanOpen) {
        openClanFiche(clanOpen.dataset.clanOpen);
        return;
      }
      const nick = event.target.closest("[data-open-player]");
      const row = nick || event.target.closest("[data-id]");
      if (row && app.root.contains(row) && !event.target.closest("[data-drawer]") && !event.target.closest("a")) {
        const id = (row.dataset.openPlayer != null ? row.dataset.openPlayer : row.dataset.id) || "";
        const name = row.dataset.name || "";
        const member = findMember(name, id);
        openPlayer(id, {
          ...(member || {}),
          publicId: id || (member && member.publicId) || "",
          username: name || (member && member.username) || "",
          role: (member && member.role) || "",
          stats: (member && member.stats) || {},
        });
      }
    });
    app.root.addEventListener("change", (event) => {
      const skin = event.target.closest("[data-skin]");
      if (skin) {
        setSkin(skin.value);
        return;
      }
      const from = event.target.closest("[data-from]");
      if (from) {
        app.from = from.value;
        app.rolling = false;
        if (!app.untilNow && !app.to) app.to = app.from;
        if (app.from) load(true);
        return;
      }
      const to = event.target.closest("[data-to]");
      if (to) {
        app.to = to.value;
        app.rolling = false;
        app.untilNow = false;
        if (!app.from) app.from = app.to;
        if (app.from && app.to) load(true);
        return;
      }
      const find = event.target.closest("[data-find]");
      if (find) {
        app.find[find.dataset.find] = find.value;
        const box = app.root.querySelector("[data-find-rows]");
        if (box) box.innerHTML = playerSearchRows();
        return;
      }
      const lang = event.target.closest("[data-tuto-lang]");
      if (lang) {
        app.tutoLang = lang.value;
        if (app.view === "tutos") paintHub();
      }
    });
    app.root.addEventListener("input", (event) => {
      const search = event.target.closest("[data-search]");
      if (search) {
        app.query = search.value;
        app.page = 0;
        const box = app.root.querySelector("[data-member-box]");
        if (box) box.innerHTML = memberTable();
        return;
      }
      const find = event.target.closest("[data-find]");
      if (find) {
        app.find[find.dataset.find] = find.value;
        const box = app.root.querySelector("[data-find-rows]");
        if (box) box.innerHTML = playerSearchRows();
        return;
      }
      const dirInput = event.target.closest("[data-dir]");
      if (dirInput) {
        app.dir[dirInput.dataset.dir] = dirInput.value;
        app.dir.page = 0;
        clearTimeout(dirTimer);
        dirTimer = setTimeout(loadDir, 250);
        return;
      }
      const clans = event.target.closest("[data-clan-query]");
      if (clans) {
        app.clanQuery = clans.value;
        app.clanBoard.page = 0;
        const board = app.root.querySelector("[data-clan-board]");
        if (board) board.innerHTML = clanBoard();
        const box = app.root.querySelector("[data-clan-list]");
        if (box) box.innerHTML = clanCards();
      }
    });
  }

  function ico(name) {
    const paths = {
      board: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
      players: '<path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z"/>',
      clans: '<path d="M4 18V8l8-4 8 4v10H4zm8-7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
      rewards: '<path d="M7 4h10v3l-2 2v4l5 7H4l5-7V9L7 7V4z"/>',
      media: '<path d="M4 6h16v12H4zM10 9l6 3-6 3V9z"/>',
      tutos: '<path d="M5 5h14v2H5zm0 4h14v10H5z"/>',
    };
    return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${paths[name] || ""}</svg>`;
  }

  function plain(text) {
    return String(text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function panelHead(title, code) {
    return `<header class="panel-head"><h2 class="eyebrow" aria-label="${esc(title)}">${esc(plain(title))}</h2>${code ? `<span>${esc(code)}</span>` : ""}</header>`;
  }

  function kpi(label, tag, value) {
    return `<div class="stat"><em>${esc(label)}<i>${esc(tag)}</i></em><strong>${value}</strong></div>`;
  }

  function weekLabel(iso, last) {
    if (last) return "24 h";
    return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "short" }).format(new Date(iso)).replace(".", "");
  }

  function weekSeries(pick, live) {
    const days = (app.week && app.week.days) || [];
    if (days.length < 7) return null;
    return days.map((day, index) => ({
      label: weekLabel(day.end, index === days.length - 1),
      value: index === days.length - 1 ? Number(live) || 0 : day.failed ? null : Number(pick(day)) || 0,
    }));
  }

  function niceCeil(value) {
    if (value <= 0) return 0;
    const power = 10 ** Math.floor(Math.log10(value));
    const n = value / power;
    const nice = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((step) => n <= step);
    return nice * power;
  }

  function spark(series, show, unit, short) {
    if (series === false) return "";
    if (!series) return `<div class="spark wait">${app.weekFailed ? "7 jours indisponibles, nouvel essai dans 5 min." : "7 jours en chargement…"}</div>`;
    const known = series.filter((item) => item.value != null).map((item) => item.value);
    const top = niceCeil(Math.max(0, ...known)) || 1;
    const low = Math.min(...known, 0) < 0 ? -niceCeil(-Math.min(...known)) : 0;
    const W = 320;
    const H = 124;
    const L = 40;
    const R = 50;
    const T = 18;
    const B = 18;
    const step = (W - L - R) / (series.length - 1);
    const x = (index) => L + index * step;
    const y = (value) => T + ((top - value) / (top - low)) * (H - T - B);
    const ticks = low < 0 ? [low, 0, top] : [0, top / 2, top];
    const grid = ticks.map((tick) => `<line class="${tick === 0 ? "zero" : "grid"}" x1="${L}" x2="${W - R}" y1="${y(tick).toFixed(1)}" y2="${y(tick).toFixed(1)}"/>
      <text class="tick" x="${L - 6}" y="${(y(tick) + 3).toFixed(1)}" text-anchor="end">${esc(short(tick))}</text>`).join("");
    const segments = [];
    let run = [];
    series.forEach((item, index) => {
      if (item.value == null) {
        if (run.length) segments.push(run);
        run = [];
        return;
      }
      run.push(`${x(index).toFixed(1)},${y(item.value).toFixed(1)}`);
    });
    if (run.length) segments.push(run);
    const lines = segments.map((points) => `<polyline class="line" points="${points.join(" ")}"/>`).join("");
    const mean = meanOf(series);
    const average = mean == null ? "" : `<g><title>Moyenne 7 jours : ${esc(show(mean))}</title>
      <line class="avg" x1="${L}" x2="${W - R}" y1="${y(mean).toFixed(1)}" y2="${y(mean).toFixed(1)}"/>
      <text class="avg-label" x="${W - R + 20}" y="${(y(mean) + 4).toFixed(1)}">${esc(short(mean))}</text>
    </g>`;
    const last = series.length - 1;
    const points = series.map((item, index) => {
      const cx = x(index).toFixed(1);
      const hot = item.now || (item.now !== false && index === last && series.every((row) => !row.now));
      const day = `<text class="day${hot ? " now" : ""}" x="${cx}" y="${H - 4}" text-anchor="middle">${esc(item.label)}</text>`;
      if (item.value == null) return `${day}<text class="value gap" x="${cx}" y="${(y((top + low) / 2) + 3).toFixed(1)}" text-anchor="middle">?</text>`;
      const cy = y(item.value);
      return `<g><title>${esc(item.label)} : ${esc(show(item.value))}</title>
        <circle class="dot${hot ? " now" : ""}" cx="${cx}" cy="${cy.toFixed(1)}" r="${hot ? 3.5 : 2.5}"/>
        <text class="value${hot ? " now" : ""}" x="${cx}" y="${(cy - (hot ? 9 : 7)).toFixed(1)}" text-anchor="middle">${esc(short(item.value))}</text>
      </g>${day}`;
    }).join("");
    return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="7 derniers jours">
      <text class="unit" x="${L - 6}" y="9" text-anchor="end">${esc(unit)}</text>
      ${grid}${average}${lines}${points}
    </svg>`;
  }

  function meanOf(series) {
    const known = (series || []).filter((item) => item.value != null).map((item) => item.value);
    return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
  }

  function trend(series) {
    if (!Array.isArray(series) || !series.length) return "";
    const now = series[series.length - 1].value;
    const mean = meanOf(series);
    if (now == null || !mean) return "";
    const pct = Math.round(((now - mean) / Math.abs(mean)) * 100);
    const side = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
    const sign = pct > 0 ? "▲ +" : pct < 0 ? "▼ −" : "= ";
    return `<span class="trend ${side}" title="24 h comparé à la moyenne des 7 jours">${sign}${Math.abs(pct)} %<small>vs moy.</small></span>`;
  }

  function chartBox(label, value, foot, graphic, tag, extra) {
    return `<div class="stat chart">
      <em>${esc(label)}${tag ? `<i>${esc(tag)}</i>` : ""}</em>
      <div class="stat-head"><strong>${value}</strong>${extra || ""}</div>
      ${foot ? `<small>${foot}</small>` : ""}
      ${graphic}
    </div>`;
  }

  function chartCard(label, value, foot, series, show, unit, short, tag) {
    return chartBox(label, value, foot, spark(series, show, unit, short), tag || "24 H", trend(series));
  }

  function barChart(series, show, unit, short) {
    if (!series || !series.length) return "";
    const known = series.filter((item) => item.value != null).map((item) => Number(item.value) || 0);
    if (!known.length) return "";
    const top = niceCeil(Math.max(0, ...known)) || 1;
    const low = Math.min(0, ...known) < 0 ? -niceCeil(-Math.min(0, ...known)) : 0;
    const W = 320;
    const H = 132;
    const L = 36;
    const R = 10;
    const T = 16;
    const B = 28;
    const inner = W - L - R;
    const gap = series.length > 10 ? 2 : 4;
    const bw = Math.max(6, (inner - gap * (series.length - 1)) / series.length);
    const y = (value) => T + ((top - value) / (top - low || 1)) * (H - T - B);
    const zero = y(0);
    const ticks = low < 0 ? [low, 0, top] : [0, top / 2, top];
    const grid = ticks.map((tick) => `<line class="${tick === 0 ? "zero" : "grid"}" x1="${L}" x2="${W - R}" y1="${y(tick).toFixed(1)}" y2="${y(tick).toFixed(1)}"/>
      <text class="tick" x="${L - 6}" y="${(y(tick) + 3).toFixed(1)}" text-anchor="end">${esc(short(tick))}</text>`).join("");
    const bars = series.map((item, index) => {
      const value = Number(item.value) || 0;
      const x = L + index * (bw + gap);
      const y1 = y(Math.max(value, 0));
      const y2 = y(Math.min(value, 0));
      const hot = !!item.now;
      return `<g><title>${esc(item.label)} : ${esc(show(value))}</title>
        <rect class="bar${hot ? " now" : ""}" x="${x.toFixed(1)}" y="${Math.min(y1, y2).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, Math.abs(y2 - y1)).toFixed(1)}"/>
        <text class="day${hot ? " now" : ""}" x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(item.label)}</text>
      </g>`;
    }).join("");
    return `<svg class="chart-svg bars" viewBox="0 0 ${W} ${H}" role="img">
      <text class="unit" x="${L - 6}" y="9" text-anchor="end">${esc(unit)}</text>
      ${grid}${bars}
    </svg>`;
  }

  function periodSeries(windows, pick) {
    return [["24h", "24 h"], ["7", "7 j"], ["30", "30 j"], ["90", "90 j"]].map(([key, label]) => ({
      label,
      value: windows && windows[key] ? pick(windows[key]) : null,
      now: key === "24h",
    }));
  }

  function boardSeries(pick, limit, focus) {
    const all = ((app.clan && app.clan.leaderboard) || []).map(clanDecor);
    const ranked = all.slice().sort((a, b) => pick(b) - pick(a) || a.rank - b.rank).slice(0, limit || 10);
    if (focus && !ranked.some((row) => row.clanTag === focus)) {
      const mine = all.find((row) => row.clanTag === focus);
      if (mine) ranked[ranked.length - 1] = mine;
    }
    return ranked.map((row) => ({ label: row.clanTag, value: pick(row), now: row.clanTag === (focus || TAG) }));
  }

  function shortNum(value) {
    const n = Number(value) || 0;
    if (Math.abs(n) >= 1000) return dec(n / 1000, 1).replace(",0", "") + "k";
    return Number.isInteger(n) ? fmt(n) : dec(n, 1);
  }

  const VIEWS = [["board", "Tableau"], ["players", "Joueurs"], ["clans", "Clans"], ["rewards", "Prix"], ["media", "Live"], ["tutos", "Tutos"]];
  const HEADS = {
    board: ["Le clan en chiffres", "Statistiques, parties en cours, file Équipes et classement des joueurs."],
    players: ["Joueurs vérifiés", "Tous les joueurs au badge vérifié croisés dans les parties publiques, avec leurs stats et celles de leur clan."],
    clans: ["Classement des clans", "Saison en cours : rang, volume, points, occupation et fiches de chaque clan."],
    rewards: ["Récompenses", "Prix du clan et campagnes en cours."],
    media: ["Streams en direct", "Chaînes Twitch et YouTube du clan."],
    tutos: ["Tutoriels", "Guides pour progresser sur OpenFront."],
  };

  function paintHead() {
    const node = app.root && app.root.querySelector("[data-head]");
    if (!node) return;
    const index = Math.max(0, VIEWS.findIndex(([id]) => id === app.view));
    const [id, label] = VIEWS[index];
    const [title, text] = HEADS[id] || HEADS.board;
    node.innerHTML = `<p class="term-module">&gt; Module ${String(index + 1).padStart(2, "0")} / ${esc(label)}</p>
      <h1 class="term-title" aria-label="${esc(title)}">${esc(plain(title))}<span class="term-cursor" aria-hidden="true">_</span></h1>
      <p class="term-lead">${esc(text)}</p>`;
  }

  function shell() {
    applySkin();
    const discord = ((app.hub && app.hub.clans) || []).find((clan) => String(clan.tag || "").toUpperCase() === TAG);
    app.root.innerHTML = `
      <div class="term">
        <header class="term-top">
          <div class="term-brand">
            <span class="term-logo" aria-hidden="true"></span>
            <div>
              <strong>${esc(TAG)}.TERM</strong>
              <span>Observatoire du clan ${esc(TAG)}</span>
            </div>
          </div>
          <nav class="term-nav">
            ${VIEWS.map(([id, label], index) => `<button type="button" data-view="${id}" class="${app.view === id ? "on" : ""}"><b>${String(index + 1).padStart(2, "0")}</b>${label}</button>`).join("")}
          </nav>
        </header>
        <div class="term-bar">
          <span class="term-ok"><span class="dot" data-dot title="Lien avec la partie"></span><span data-status>Hors partie</span></span>
          <span>Source : API OpenFront</span>
          <span>Clan : ${esc(TAG)}</span>
          <span class="term-tools">
            ${discord && discord.discord ? `<a href="${esc(discord.discord)}" target="_blank" rel="noopener noreferrer">Discord</a>` : ""}
            <button type="button" data-fresh>Sync</button>
          </span>
        </div>
        <main class="term-main">
          <div class="term-head" data-head></div>
          <div class="frame" data-frame></div>
        </main>
      </div>
    `;
    paintHead();
    buildFrame();
    if (!app.bound) {
      bindChrome();
      app.bound = true;
    }
  }

  function paint() {
    const frame = app.root.querySelector("[data-frame]");
    if (!frame) return;
    app.root.querySelectorAll("[data-view]").forEach((btn) => btn.classList.toggle("on", btn.dataset.view === app.view));
    paintHead();
    if (app.view !== "board") {
      paintHub();
      return;
    }
    if (!app.clan && !app.error) {
      frame.innerHTML = `<p class="loading">Chargement du clan ${TAG}…</p>`;
      return;
    }
    if (app.error && !app.clan) {
      frame.innerHTML = `<p class="loading">${esc(app.error)}</p>`;
      return;
    }
    frame.className = "frame";
    if (!app.root.querySelector("[data-slot]")) buildFrame();
    const clan = app.clan;
    const season = clan.season || {};
    const pulse = dayPulse();
    const best = pulse.top;
    const bestNet = best ? best.gained - best.lost : 0;
    fillSlot("hero", `${app.error ? `<p class="loading">${esc(app.error)}</p>` : ""}
      <section class="hero" id="vue">
        ${panelHead("Statistics", "CLAN." + clan.tag)}
        <div class="panel-body">
          <p class="rank"><b>${esc(clan.tag)}</b> · ${season.rank ? `Rang <b>#${fmt(season.rank)}</b> / ${fmt(season.listed)}` : "Hors classement"}</p>
          ${app.week && app.week.partial ? `<p class="sub">Graphiques incomplets${app.week.missing ? ` : ${fmt(app.week.missing)} parties restent à lire` : ""}, ils se complètent tout seuls.</p>` : ""}
          <div class="stat-grid charts">
            ${chartCard("Parties jouées", fmt(pulse.games), "", weekSeries((day) => day.games, pulse.games), (v) => fmt(v) + " parties", "parties", shortNum)}
            ${chartCard("Points gagnés", "+" + dec(pulse.gained), "victoires seulement", weekSeries((day) => day.gained, pulse.gained), (v) => "+" + dec(v) + " pts", "pts", shortNum)}
            ${chartCard("Joueurs actifs", fmt(pulse.unique), "au moins 1 partie", weekSeries((day) => day.unique, pulse.unique), (v) => fmt(v) + " joueurs", "joueurs", shortNum)}
            ${chartCard("Meilleur joueur", best ? esc(playerLabel(best)) : "—", best ? signed(bestNet) + " pts" : "pas encore", best ? weekSeries((day) => weekScore(day, best), bestNet) : false, (v) => signed(v) + " pts", "pts", shortNum)}
          </div>
        </div>
      </section>`);
    fillSlot("queue", `<section class="card" id="file">
        ${panelHead("File Équipes", "QUEUE.TEAM")}
        <div class="panel-body">
        <p class="squad-label">${esc(TAG)} dans ton équipe</p>
        <div class="pills squad">${[1, 2, 3, 4, 5, 6, 7, 8].map((count) => `<button type="button" data-squad="${count}" class="${app.squad === count ? "on" : ""}">${count} ${esc(TAG)}</button>`).join("")}</div>
        <div data-queue>${queueCards()}</div>
        </div>
      </section>`);
    fillSlot("ranks", `<section class="card" id="joueurs" data-rank-card>
        ${panelHead(app.panel === "membres" ? "Membres" : "Classement joueurs", "RANK." + TAG)}
        <div class="panel-body">
        <div class="pills switch">
          <button type="button" data-panel="classement" class="${app.panel === "classement" ? "on" : ""}">Classement</button>
          <button type="button" data-panel="membres" class="${app.panel === "membres" ? "on" : ""}">Membres</button>
        </div>
        ${app.panel === "membres" ? `
          <div class="filters"><input data-search type="search" placeholder="Chercher un pseudo" value="${esc(app.query)}" /></div>
          <div class="scroll" data-member-box>${memberTable()}</div>
        ` : `
          <div class="rank-groups">
            <div>
              <p class="rank-label">Période</p>
              <div class="pills period">${RANK_PERIODS.map(([id, label]) => `<button type="button" data-rank-period="${id}" class="${app.rankPeriod === id ? "on" : ""}">${esc(id === "24h" && !app.rolling ? "Dates choisies" : label)}</button>`).join("")}</div>
              <div class="pills">${rankButtons("jour")}</div>
            </div>
            <div>
              <p class="rank-label">Carrière</p>
              <div class="pills">${rankButtons("carriere")}</div>
            </div>
          </div>
          <div class="scroll" data-ranks>${rankTable()}</div>
        `}
        </div>
      </section>`);
    const live = liveHtml(true);
    fillSlot("live", live);
    liveKey = live;
    paintPlayed(pulse);
    watchPanelHeights();
  }

  const MAP_FR = {"Achiran":"Achiran","Aegean":"Mer Égée","Africa":"Afrique","All":"Tout","Alps":"Alpes","Amazon River":"Fleuve Amazone","Antarctica":"Antarctique","Archipelago Sea":"Saaristomeri","Arctic":"Arctique","Asia":"Asie","Australia":"Australie","Baikal":"Lac Baïkal","Baikal (Nuke Wars)":"Baïkal (Guerres Nucléaires)","Baja California":"Basse-Californie","Balkans":"Balkans","Balkhash":"Lac Balkhach","Baltics":"Terres Baltiques","Bering Sea":"Mer de Béring","Bering Strait":"Détroit de Béring","Between Two Seas":"Entre deux mers","Black Sea":"Mer Noire","Bosphorus Straits":"Détroits du Bosphore","Branching Paths":"Ramifications","Britannia":"Grande-Bretagne","Britannia (Classic)":"Grande-Bretagne (Classique)","Cape Cod":"Cap Cod","Caribbean":"Caraïbes","Caspian Sea":"Mer Caspienne","Caucasus":"Caucase","Central America":"Amérique Centrale","Channel Islands":"Îles de la Manche","China":"Chine de Qing","Chopping Block":"Carréidoscope","Clearwater Lakes":"Lacs Wiyâshâkimî","Conakry":"Conakry","Crimea":"Crimée","Danish Straits":"Détroits Danois","Deglaciated Antarctica":"Antarctique Déglacée","Didier":"Didier","Didier (France)":"Didier (France)","Dyslexdria":"Dyslexdria","East Asia":"Asie de l'Est","Europe":"Europe","Europe (Classic)":"Europe (Classique)","Falkland Islands":"Îles Malouines","Faroe Islands":"Îles Féroé","Favourites":"Favoris","Featured":"En vedette","Finger Lakes":"Finger Lakes","Four Islands":"Quatre Îles","France":"France","Gateway to the Atlantic":"Porte de l'Atlantique","Germany":"Allemagne","Giant World Map":"Carte du monde géante","Great Lakes":"Grands Lacs","Gulf Of Guinea":"Golfe de Guinée","Gulf Of Mexico":"Golfe du Mexique","Gulf of St. Lawrence":"Golfe du Saint-Laurent","Halkidiki":"Chalcidique","Hawaii":"Hawaï","Hecate Strait":"Détroit d’Hecate","Hong Kong":"Hong Kong","Iceland":"Islande","Indian Subcontinent":"Sous-continent Indien","Irish Sea":"Mer d'Irlande","Italia":"Italie","Japan":"Japon","Juan De Fuca Strait":"Détroit de Juan De Fuca","Korea":"Corée","Labyrinth":"Labyrinthe","Las Vegas Strip":"Strip de Las Vegas","Lemnos":"Lemnos","Levant":"Levant","Lisbon":"Lisbonne","Los Angeles":"Los Angeles","Luna":"Luna","Manicouagan":"Manicouagan","Map":"Carte","Mare Nostrum":"Mare Nostrum","Mars":"Mars","MENA":"MOAN","Middle East":"Moyen-Orient","Milky Way":"Voie lactée","Mississippi River":"Mississippi","Montreal":"Montréal","More Than Luck":"Cinq Feuilles","New York City":"New York City","Nile Delta":"Delta du Nil","North America":"Amérique du Nord","Northwest Passage":"Passage du Nord-Ouest","Oceania":"Océanie","Onion":"Oignon","Pangaea":"Pangée","Passage":"Passage","Pluto":"Pluton","Qing China":"Chine de Qing","Random":"Aléatoire","Russia":"Russie","San Francisco":"San Francisco","Scandinavia":"Scandinavie","Sierpinski":"Sierpinski","Sol":"Système solaire","South America":"Amérique du Sud","Southeast Asia":"Asie du Sud-Est","Strait of Gibraltar":"Détroit de Gibraltar","Strait of Hormuz":"Détroit d'Ormuz","Strait Of Malacca":"Détroit de Malacca","Surrounded":"Encerclé","Svalmel":"Svalmel","Taiwan Strait":"Détroit de Taïwan","The Box":"La boite","Tierra Del Fuego":"Tierra Del Fuego","Titan":"Titan","Tourney 2 Teams":"Tournoi 2 Équipes","Tourney 3 Teams":"Tournoi 3 Équipes","Tourney 4 Teams":"Tournoi 4 Équipes","Tourney 8 Teams":"Tournoi 8 Équipes","Traders Dream":"Le rêve d'un commerçant","Two Lakes":"Deux Lacs","United States":"États-Unis","Venice":"Venise","Vietnam":"Viêt Nam","Warship Warship":"Warship Warship","World":"Monde","World Inverted":"Monde inversé","Yangtze River":"Yangtsé","Yellow Sea":"Mer Jaune","Yenisei":"Ienisseï"};

  let queueKey = null;
  let liveKey = null;
  let heightObs = null;
  let heightTarget = null;
  let heightLock = false;

  function fitHeight(node, next) {
    if (!node || !(next > 0)) return;
    const cur = node.style.height ? parseFloat(node.style.height) : 0;
    if (Math.abs(cur - next) <= 1) return;
    node.style.height = next + "px";
  }

  function syncPanelHeights() {
    if (heightLock || app.view !== "board" || !app.root) return;
    const frame = app.root.querySelector("[data-frame]");
    if (!frame) return;
    const hero = frame.querySelector('[data-slot="hero"]');
    const live = frame.querySelector('[data-slot="live"]');
    const queue = frame.querySelector('[data-slot="queue"]');
    const played = frame.querySelector('[data-slot="played"]');
    if (!hero || !live || !queue || !played) return;
    const snap = snapScroll(played);
    heightLock = true;
    hero.style.height = "auto";
    live.style.height = "auto";
    const pairH = Math.ceil(Math.max(hero.getBoundingClientRect().height, live.getBoundingClientRect().height));
    const queueH = Math.ceil(queue.getBoundingClientRect().height);
    if (pairH > 0) {
      hero.style.height = pairH + "px";
      live.style.height = pairH + "px";
    }
    fitHeight(played, queueH);
    heightLock = false;
    applyScroll(played, snap);
  }

  function watchPanelHeights() {
    const frame = app.root && app.root.querySelector("[data-frame]");
    if (!frame) return;
    const hero = frame.querySelector('[data-slot="hero"]');
    const live = frame.querySelector('[data-slot="live"]');
    const queue = frame.querySelector('[data-slot="queue"]');
    if (heightObs && heightTarget === frame && hero && live && queue) {
      requestAnimationFrame(syncPanelHeights);
      return;
    }
    if (heightObs) heightObs.disconnect();
    heightTarget = frame;
    heightObs = new ResizeObserver(() => {
      if (heightLock) return;
      requestAnimationFrame(syncPanelHeights);
    });
    if (hero) heightObs.observe(hero);
    if (live) heightObs.observe(live);
    if (queue) heightObs.observe(queue);
    requestAnimationFrame(syncPanelHeights);
  }

  function mapName(raw) {
    return MAP_FR[raw] || raw || "Map";
  }

  function previewPoints(total, teams, gal) {
    if (!total || teams < 2 || gal < 1) return null;
    const ratio = gal / (total / teams);
    const difficulty = Math.max(1, Math.sqrt(teams - 1));
    return { win: ratio * difficulty, loss: ratio / difficulty };
  }

  function clock(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    if (minutes > 0) return minutes + " min " + String(rest).padStart(2, "0") + " s";
    return rest + " s";
  }

  function gameLink(id, watch) {
    return "https://openfront.io/game/" + encodeURIComponent(id || "") + (watch ? "?spectate" : "");
  }

  function isTeamQueue(game) {
    if (!game || game.hvn) return false;
    const bucket = game.bucket || "team";
    if (bucket === "ffa") return false;
    if (bucket !== "team" && bucket !== "special") return false;
    return Number(game.teams) >= 2 && Number(game.per) > 0;
  }

  function queueCard(game, index) {
    const badge = index === 0
      ? (game.startsAt ? `<p class="game-phase ok">Départ <span data-start="${Number(game.startsAt)}">…</span></p>` : `<p class="game-phase ok">En cours</p>`)
      : `<p class="game-phase">File ${fmt(index)}</p>`;
    const mode = game.teams && game.per ? `${fmt(game.teams)} équipes de ${fmt(game.per)}` : "Équipes";
    const compact = game.compact ? " · compacte" : "";
    let table = "";
    if (game.per > 0 && game.teams >= 2 && game.max > 0) {
      const wanted = app.squad || 1;
      const count = Math.min(wanted, game.per);
      const pts = previewPoints(game.max, game.teams, count);
      const warn = wanted > game.per ? `<p class="sub">Équipe de ${fmt(game.per)} : ${fmt(wanted)} ${esc(TAG)} ne tiennent pas.</p>` : "";
      table = `${warn}<div class="queue-pts"><div><span>Victoire</span><b class="up">+${dec(pts.win)}</b></div><div><span>Défaite</span><b class="down">${lossPts(pts.loss)}</b></div></div>`;
    }
    return `<article class="queue-card">
      ${badge}
      <h3>${esc(mapName(game.map))}</h3>
      <p class="game-facts">${mode}${compact} · ${fmt(game.players)}/${fmt(game.max)}</p>
      ${table}
      <a class="join" href="${gameLink(game.id)}" target="_blank" rel="noopener noreferrer">Rejoindre</a>
    </article>`;
  }

  function queueColumn(title, games) {
    const body = games.length
      ? `<div class="queue-grid">${games.map((game, index) => queueCard(game, index)).join("")}</div>`
      : `<p class="empty">Aucune partie dans cette file.</p>`;
    return `<div><h3 class="queue-col" aria-label="${esc(title)}">${esc(plain(title))}</h3>${body}</div>`;
  }

  function queueCards() {
    const queue = app.snap && app.snap.queue;
    if (!queue) {
      return `<p class="empty">En attente de la file Équipes. Quitte OpenFront complètement, relance-le, puis reste sur le menu : les maps d'ici suivent celles du jeu.</p>`;
    }
    const games = (queue.games || []).filter(isTeamQueue);
    const normal = games.filter((game) => (game.bucket || "team") !== "special");
    const special = games.filter((game) => game.bucket === "special");
    return `<div class="queue-split">${queueColumn("Équipes", normal)}${queueColumn("Spécial", special)}</div>`;
  }

  function queueClock() {
    const offset = app.queueOffset || 0;
    document.querySelectorAll("[data-start]").forEach((el) => {
      const at = Number(el.dataset.start);
      if (!at) return;
      const left = at - (Date.now() + offset);
      el.textContent = left > 0 ? clock(left) : "imminent";
    });
    const now = Date.now() + offset;
    document.querySelectorAll("[data-run]").forEach((el) => {
      const at = Number(el.dataset.run);
      if (!at) return;
      const delta = now - at;
      el.textContent = delta >= 0 ? clock(delta) : "Départ " + clock(-delta);
    });
  }

  function paintQueue() {
    const box = document.querySelector("[data-queue]");
    if (!box) return;
    const games = (app.snap && app.snap.queue && app.snap.queue.games) || null;
    const key = (games ? JSON.stringify(games) : "") + "|" + (app.squad || 1);
    if (key === queueKey && box.dataset.ready === "1") return;
    queueKey = key;
    const queue = app.snap && app.snap.queue;
    if (queue && queue.serverTime) app.queueOffset = queue.serverTime - Date.now();
    box.innerHTML = queueCards();
    box.dataset.ready = "1";
    queueClock();
    requestAnimationFrame(syncPanelHeights);
  }

  function todayParis() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }

  function periodLabel() {
    const row = RANK_PERIODS.find((item) => item[0] === app.rankPeriod);
    return row ? row[1] : "";
  }

  function periodTitle() {
    if (app.rolling) return "Dernières 24 heures";
    if (app.untilNow) return "Jusqu'à maintenant";
    return "Période choisie";
  }

  function repaintKeep() {
    keepScroll(app.root, () => {
      paint();
      paintLive();
    });
  }

  function rangePicker() {
    return `<div class="dates">
      <button type="button" data-rolling class="${app.rolling ? "on" : ""}">24 h glissantes</button>
      <button type="button" data-now class="${app.untilNow ? "on" : ""}">Jusqu'à maintenant</button>
      <label>Du <input data-from type="date" value="${esc(app.from)}" /></label>
      <label>Au <input data-to type="date" value="${esc(app.to)}" ${app.untilNow ? "disabled" : ""} /></label>
    </div>`;
  }

  const PAGE = 10;

  function pageOf(rows) {
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    app.page = Math.min(Math.max(0, app.page || 0), pages - 1);
    const start = app.page * PAGE;
    return { shown: rows.slice(start, start + PAGE), start, pages, total: rows.length };
  }

  function pager(view) {
    if (view.total <= PAGE) return "";
    const last = Math.min(view.start + PAGE, view.total);
    return `<div class="pager">
      <button type="button" data-page="prev" ${app.page <= 0 ? "disabled" : ""}>◀ Préc.</button>
      <span>${fmt(view.start + 1)}–${fmt(last)} sur ${fmt(view.total)}</span>
      <button type="button" data-page="next" ${app.page >= view.pages - 1 ? "disabled" : ""}>Suiv. ▶</button>
    </div>`;
  }

  function limitButtons() {
    return [[10, "10"], [25, "25"], [50, "50"], [0, "Tous"]]
      .map(([count, label]) => `<button type="button" data-limit="${count}" class="${app.limit === count ? "on" : ""}">${label}</button>`)
      .join("");
  }

  function boardButtons() {
    return [["record", "Parties, V, D"], ["share", "% et sessions"], ["points", "Pts D, Pts V, ratio"]]
      .map(([id, label]) => `<button type="button" data-board="${id}" class="${app.board === id ? "on" : ""}">${label}</button>`)
      .join("");
  }

  function boardHint() {
    if (app.board === "share") return "Pourcentage de victoires et nombre de sessions joueurs. Demi-vie 30 jours. GAL est surligné.";
    if (app.board === "points") return "Points de défaite, points de victoire et ratio. Demi-vie 30 jours. GAL est surligné.";
    return "Parties, victoires et défaites. Demi-vie 30 jours. GAL est surligné.";
  }

  function rankButtons(group) {
    return RANKINGS.filter((item) => item[2] === group)
      .map(([id, label, , hint]) => `<button type="button" data-rank="${id}" class="${app.rank === id ? "on" : ""}" title="${esc(hint)}">${esc(label)}</button>`)
      .join("");
  }

  function paintRanks() {
    const box = document.querySelector("[data-ranks]");
    if (box) box.innerHTML = rankTable();
    document.querySelectorAll("[data-rank]").forEach((button) => button.classList.toggle("on", button.dataset.rank === app.rank));
  }

  function findMember(name, publicId) {
    const members = (app.clan && app.clan.members && app.clan.members.results) || [];
    if (publicId) {
      const byId = members.find((member) => member.publicId === publicId);
      if (byId) return byId;
    }
    const key = String(name || "").toLowerCase();
    return members.find((member) => String(member.username || "").toLowerCase() === key) || null;
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
    const mark = (name, item) => {
      if (name) byName.set(String(name).toLowerCase(), item);
    };
    for (const item of map.values()) {
      if (!item.publicId) continue;
      mark(item.name, item);
      for (const alias of item.aliases || []) mark(alias, item);
    }
    for (const member of (app.clan && app.clan.members && app.clan.members.results) || []) {
      if (!member.publicId || !member.username) continue;
      const host = map.get("id:" + member.publicId);
      if (host) mark(member.username, host);
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

  function playerLabel(row) {
    const member = findMember(row.name, row.publicId);
    return (member && member.username) || row.name || row.publicId || "?";
  }

  function playerTitle(row) {
    const label = playerLabel(row);
    const extras = [...(row.aliases || []), row.name].filter((name) => name && name !== label);
    return extras.length ? "Aussi vu comme " + extras.join(", ") : "";
  }

  function nickBtn(id, name, cls) {
    const label = name || id || "?";
    const pid = id || "";
    return `<button type="button" class="${cls || "nick"}" data-open-player="${esc(pid)}" data-id="${esc(pid)}" data-name="${esc(label)}">${esc(label)}</button>`;
  }

  function nickPill(player, mine) {
    const id = player.publicId || "";
    const name = player.name || player.username || id || "?";
    const extra = !mine && player.clan ? " [" + player.clan + "]" : "";
    return `<button type="button" class="nick pill ${mine ? "leader" : ""}" data-open-player="${esc(id)}" data-id="${esc(id)}" data-name="${esc(name)}">${esc(name)}${esc(extra)}</button>`;
  }

  function sameAccount(row, id, name) {
    if (id && row.publicId === id) return true;
    const key = String(name || "").toLowerCase();
    if (!key) return false;
    if (String(row.name || "").toLowerCase() === key) return true;
    return (row.aliases || []).some((alias) => String(alias).toLowerCase() === key);
  }

  function periodRows() {
    if (app.rankPeriod !== "24h" && app.ranks && app.ranks.periods && app.ranks.periods[app.rankPeriod]) {
      return (app.ranks.periods[app.rankPeriod].rows || []).slice();
    }
    return dayPlayers();
  }

  function playerMatches(id, name) {
    const names = new Set();
    const add = (value) => {
      if (value) names.add(String(value).toLowerCase());
    };
    add(name);
    const member = findMember(name, id);
    if (member) add(member.username);
    const hits = [];
    for (const row of (app.clan && app.clan.sessions && app.clan.sessions.results) || []) {
      let seen = false;
      for (const player of row.players || []) {
        if (String(player.clan || "").toUpperCase() !== TAG) continue;
        if (id && player.publicId) {
          if (player.publicId === id) {
            seen = true;
            break;
          }
          continue;
        }
        if ((id && player.publicId === id) || names.has(String(player.name || "").toLowerCase())) {
          seen = true;
          break;
        }
      }
      if (seen) hits.push(row);
    }
    return hits;
  }

  function metricValue(row, key) {
    if (key === "gained") return row.gained;
    if (key === "lost") return row.lost;
    if (key === "wins") return row.wins;
    if (key === "losses") return row.losses;
    if (key === "games") return (row.wins || 0) + (row.losses || 0);
    if (key === "ratio") {
      const games = (row.wins || 0) + (row.losses || 0);
      return games ? row.wins / games : -1;
    }
    return (Number(row.gained) || 0) - (Number(row.lost) || 0);
  }

  function emptyRec() {
    return { games: 0, wins: 0, losses: 0, gained: 0, lost: 0 };
  }

  function recFromRow(row) {
    if (!row) return emptyRec();
    return {
      games: (row.wins || 0) + (row.losses || 0),
      wins: row.wins || 0,
      losses: row.losses || 0,
      gained: row.gained || 0,
      lost: row.lost || 0,
    };
  }

  function recFromRank(id, name, period) {
    const span = app.ranks && app.ranks.periods && app.ranks.periods[period];
    if (!span || !span.rows) return null;
    const row = span.rows.find((item) => sameAccount(item, id, name));
    return row ? recFromRow(row) : null;
  }

  function playerWindows(id, name) {
    const fromDossier = (dossierOf() && dossierOf().windows) || {};
    const day = recFromRow(dayPlayers().find((item) => sameAccount(item, id, name)));
    const pick = (key, fallback) => {
      const rec = fromDossier[key];
      if (rec && (rec.games || rec.wins || rec.losses || rec.gained || rec.lost)) return rec;
      return fallback;
    };
    return {
      "24h": pick("24h", day),
      7: pick("7", recFromRank(id, name, "7")),
      30: pick("30", recFromRank(id, name, "30")),
      90: pick("90", recFromRank(id, name, "90")),
    };
  }

  function playerDisplayName(id, fallback) {
    const dossier = dossierOf();
    if (dossier && dossier.username && dossier.username !== id) return dossier.username;
    const member = app.member || {};
    if (member.username && member.username !== member.publicId) return member.username;
    if (fallback && fallback !== id) return fallback;
    const row = dayPlayers().find((item) => sameAccount(item, id, fallback));
    if (row && row.name) return row.name;
    return member.username || fallback || id || "?";
  }

  function boardPeek(id, name) {
    const metric = String(app.rank).startsWith("c-") ? "solde" : app.rank;
    const rows = periodRows();
    rows.sort((a, b) => {
      const delta = metricValue(b, metric) - metricValue(a, metric);
      if (delta) return delta;
      return String(a.name || "").localeCompare(String(b.name || ""), "fr");
    });
    const index = rows.findIndex((row) => sameAccount(row, id, name));
    const row = index >= 0 ? rows[index] : null;
    const games = playerMatches(id, name);
    const recent = games.slice(0, 12).reverse();
    const form = recent.map((item, i) => ({
      label: String(i + 1),
      value: Number(item.score) || 0,
      now: i === recent.length - 1,
    }));
    let streak = 0;
    let hot = null;
    for (const item of games) {
      const won = !!item.hasWon;
      if (hot == null) hot = won;
      if (won === hot) streak += 1;
      else break;
    }
    const pulse = dayPulse();
    const avgGames = pulse.unique ? pulse.games / pulse.unique : 0;
    return { row, rank: index >= 0 ? index + 1 : null, listed: rows.length, games, form, streak, hot, avgGames, pulse };
  }

  function weekScore(day, player) {
    const bag = day.players || {};
    if (player.publicId && bag["id:" + player.publicId]) return bag["id:" + player.publicId][1];
    const names = [player.name, ...(player.aliases || [])].map((name) => String(name || "").toLowerCase()).filter(Boolean);
    for (const name of names) {
      if (bag["name:" + name]) return bag["name:" + name][1];
      if (bag[name]) return bag[name][1];
    }
    return 0;
  }

  function dayPulse() {
    const sessions = (app.clan && app.clan.sessions && app.clan.sessions.results) || [];
    const rows = dayPlayers();
    let points = 0;
    let gained = 0;
    for (const row of sessions) {
      const score = Number(row.score) || 0;
      points += score;
      if (score > 0) gained += score;
    }
    const top = rows.slice().sort((a, b) => (b.gained - b.lost) - (a.gained - a.lost) || b.gained - a.gained)[0] || null;
    return { games: sessions.length, points, gained, unique: rows.length, top };
  }

  function dayPlayers() {
    const map = new Map();
    for (const row of (app.clan && app.clan.sessions && app.clan.sessions.results) || []) {
      const score = Number(row.score) || 0;
      const seen = new Set();
      for (const player of row.players || []) {
        if (String(player.clan || "").toUpperCase() !== TAG) continue;
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

  function dayValue(row) {
    return metricValue(row, app.rank);
  }

  function careerMode() {
    if (app.rank === "c-team" || app.rank === "c-team-rate") return "team";
    if (app.rank === "c-ranked") return "ranked";
    if (app.rank === "c-ffa") return "ffa";
    return "total";
  }

  function rankTable() {
    const career = String(app.rank).startsWith("c-");
    if (!career) {
      const sessions = (app.clan && app.clan.sessions && app.clan.sessions.results) || [];
      const span = app.rankPeriod !== "24h" && app.ranks && app.ranks.periods ? app.ranks.periods[app.rankPeriod] : null;
      if (app.rankPeriod !== "24h" && !span) return `<p class="empty">Chargement du classement ${esc(periodLabel())}…</p>`;
      const rows = span ? span.rows.map((row) => ({ ...row })) : dayPlayers();
      const coverage = span && span.read < span.games
        ? `<p class="dir-status">Joueurs connus pour <b>${fmt(span.read)}</b> parties sur <b>${fmt(span.games)}</b>. Le reste se complète tout seul, sans surcharger OpenFront.</p>`
        : "";
      if (!rows.length) {
        const waiting = span ? span.games > 0 : sessions.length && sessions.some((row) => !(row.players || []).length);
        return `${coverage}<p class="empty">${waiting ? "Les joueurs des parties arrivent, le classement se remplit ensuite." : "Aucun joueur GAL sur cette fenêtre."}</p>`;
      }
      rows.sort((a, b) => {
        const delta = dayValue(b) - dayValue(a);
        if (delta) return delta;
        if (app.rank === "ratio") return b.wins + b.losses - (a.wins + a.losses);
        return String(a.name).localeCompare(String(b.name), "fr");
      });
      const view = pageOf(rows);
      const me = app.snap && app.snap.account && app.snap.account.publicId;
      const on = (key) => (app.rank === key ? "gold" : "");
      return `${coverage}<div class="dir-table"><table class="rank-table"><thead><tr><th>#</th><th>Joueur</th><th class="num">Solde</th><th class="num">Gagnés</th><th class="num">Perdus</th><th class="num">V</th><th class="num">D</th><th class="num">Parties</th><th class="num">%</th></tr></thead><tbody>
        ${view.shown.map((row, index) => {
          const member = findMember(row.name, row.publicId);
          const games = row.wins + row.losses;
          const mine = (member && member.publicId === me) || (row.publicId && row.publicId === me);
          const title = playerTitle(row);
          const pid = (member && member.publicId) || row.publicId || "";
          const label = playerLabel(row);
          return `<tr class="pick ${mine ? "me" : ""}" ${pid ? `data-id="${esc(pid)}"` : ""} data-name="${esc(label)}">
            <td>${fmt(view.start + index + 1)}</td>
            <td${title ? ` title="${esc(title)}"` : ""}>${nickBtn(pid, label)}</td>
            <td class="num ${on("solde")} ${row.gained - row.lost >= 0 ? "up" : "down"}">${signed(row.gained - row.lost)}</td>
            <td class="num ${on("gained")} up">+${dec(row.gained)}</td>
            <td class="num ${on("lost")} down">${lossPts(row.lost)}</td>
            <td class="num ${on("wins")}">${fmt(row.wins)}</td>
            <td class="num ${on("losses")}">${fmt(row.losses)}</td>
            <td class="num ${on("games")}">${fmt(games)}</td>
            <td class="num ${on("ratio")}">${pct(row.wins, row.losses)}</td>
          </tr>`;
        }).join("")}
      </tbody></table></div>${pager(view)}`;
    }
    const mode = careerMode();
    const ratio = app.rank.endsWith("rate");
    let rows = [...((app.clan && app.clan.members && app.clan.members.results) || [])];
    rows = rows.filter((member) => {
      const record = wl(member.stats && member.stats[mode]);
      return record.wins + record.losses > 0;
    });
    rows.sort((a, b) => {
      const left = wl(a.stats && a.stats[mode]);
      const right = wl(b.stats && b.stats[mode]);
      const leftValue = ratio ? left.wins / (left.wins + left.losses) : left.wins;
      const rightValue = ratio ? right.wins / (right.wins + right.losses) : right.wins;
      if (leftValue !== rightValue) return rightValue - leftValue;
      return right.wins + right.losses - (left.wins + left.losses);
    });
    if (!rows.length) return `<p class="empty">Aucun membre n’a de parties dans ce mode.</p>`;
    const view = pageOf(rows);
    const me = app.snap && app.snap.account && app.snap.account.publicId;
    return `<table class="rank-table"><thead><tr><th>#</th><th>Joueur</th><th class="num">Victoires</th><th class="num">Défaites</th><th class="num">%</th></tr></thead><tbody>
      ${view.shown.map((member, index) => {
        const record = wl(member.stats && member.stats[mode]);
        return `<tr class="pick ${member.publicId === me ? "me" : ""}" data-id="${esc(member.publicId)}" data-name="${esc(member.username || member.publicId || "")}">
          <td>${fmt(view.start + index + 1)}</td>
          <td title="${esc(ROLES[member.role] || member.role || "")}">${nickBtn(member.publicId, member.username || member.publicId)}</td>
          <td class="num ${ratio ? "" : "gold"}" title="${fmt(record.wins + record.losses)} parties">${fmt(record.wins)}</td>
          <td class="num">${fmt(record.losses)}</td>
          <td class="num ${ratio ? "gold" : ""}">${pct(record.wins, record.losses)}</td>
        </tr>`;
      }).join("")}
    </tbody></table>${pager(view)}`;
  }

  function breakdownTable(map, numeric) {
    const rows = Object.entries(map || {});
    rows.sort((a, b) => (numeric ? Number(a[0]) - Number(b[0]) : String(a[0]).localeCompare(String(b[0]), "fr")));
    if (!rows.length) return `<p class="empty">Aucune partie sur cette fenêtre.</p>`;
    return `<table><thead><tr><th>Format</th><th class="num">V</th><th class="num">D</th><th class="num">%</th><th>Part</th><th class="num">Pts V</th><th class="num">Pts D</th></tr></thead><tbody>
      ${rows.map(([name, row]) => {
        const wins = row.wl ? row.wl[0] : 0;
        const losses = row.wl ? row.wl[1] : 0;
        const winPts = row.weightedWL ? row.weightedWL[0] : 0;
        const lossValue = row.weightedWL ? row.weightedWL[1] : 0;
        return `<tr><td>${esc(name)}</td><td class="num up">${fmt(wins)}</td><td class="num down">${fmt(losses)}</td><td class="num">${pct(wins, losses)}</td><td>${bar(wins, losses)}</td><td class="num up">+${dec(winPts)}</td><td class="num down">${lossPts(lossValue)}</td></tr>`;
      }).join("")}
    </tbody></table>`;
  }

  function modeTable(stats) {
    return `<table><thead><tr><th>Mode</th><th class="num">Victoires</th><th class="num">Défaites</th><th class="num">%</th><th>Part</th></tr></thead><tbody>
      ${MODES.map(([key, label]) => {
        const row = wl(stats[key]);
        return `<tr><td>${esc(label)}</td><td class="num up">${fmt(row.wins)}</td><td class="num down">${fmt(row.losses)}</td><td class="num">${pct(row.wins, row.losses)}</td><td>${bar(row.wins, row.losses)}</td></tr>`;
      }).join("")}
    </tbody></table>`;
  }

  function memberValue(member, key) {
    if (key === "name") return (member.username || member.publicId || "").toLowerCase();
    if (key === "joined") return member.joinedAt || "";
    if (key === "role") return member.role || "";
    const row = wl(member.stats && member.stats[key]);
    if (key === "rate") return row.wins + row.losses ? row.wins / (row.wins + row.losses) : 0;
    return row.wins;
  }

  function memberList() {
    const query = app.query.trim().toLowerCase();
    let rows = [...(app.clan.members.results || [])];
    if (query) {
      rows = rows.filter((member) => `${member.username || ""} ${member.publicId}`.toLowerCase().includes(query));
    }
    const dir = app.dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const left = memberValue(a, app.sort);
      const right = memberValue(b, app.sort);
      if (left < right) return -1 * dir;
      if (left > right) return 1 * dir;
      return String(a.username || "").localeCompare(String(b.username || ""), "fr");
    });
    return pageOf(rows);
  }

  function memberRows(view) {
    const me = app.snap && app.snap.account && app.snap.account.publicId;
    if (!view.total) return `<tr><td colspan="8">Aucun membre pour cette recherche.</td></tr>`;
    return view.shown.map((member) => {
      const total = wl(member.stats && member.stats.total);
      const team = wl(member.stats && member.stats.team);
      const ffa = wl(member.stats && member.stats.ffa);
      const ranked = wl(member.stats && member.stats.ranked);
      return `<tr class="pick ${member.publicId === me ? "me" : ""}" data-id="${esc(member.publicId)}" data-name="${esc(member.username || member.publicId || "")}">
        <td>${nickBtn(member.publicId, member.username || member.publicId)}</td>
        <td><span class="pill ${esc(member.role)}">${esc(ROLES[member.role] || member.role)}</span></td>
        <td>${esc(when(member.joinedAt))}</td>
        <td class="num">${fmt(total.wins)}–${fmt(total.losses)} <span class="muted">${pct(total.wins, total.losses)}</span></td>
        <td class="num">${fmt(team.wins)}–${fmt(team.losses)}</td>
        <td class="num">${fmt(ffa.wins)}–${fmt(ffa.losses)}</td>
        <td class="num">${fmt(ranked.wins)}–${fmt(ranked.losses)}</td>
        <td class="num muted">${esc(member.publicId)}</td>
      </tr>`;
    }).join("");
  }

  function memberTable() {
    const head = (key, label, numeric) => `<th ${numeric ? 'class="num"' : ""} data-sort="${key}">${esc(label)}</th>`;
    const view = memberList();
    return `<table><thead><tr>
      ${head("name", "Pseudo")}${head("role", "Rôle")}${head("joined", "Depuis")}
      ${head("total", "Total", true)}${head("team", "Équipes", true)}${head("ffa", "FFA", true)}${head("ranked", "Classé", true)}
      <th class="num">Id</th>
    </tr></thead><tbody data-members>${memberRows(view)}</tbody></table>${pager(view)}`;
  }

  function playerCell(row) {
    const players = row.players || [];
    if (!players.length) return `<td class="muted">Liste indisponible</td>`;
    const gal = [];
    const rest = [];
    for (const player of players) {
      if (String(player.clan || "").toUpperCase() === TAG) gal.push(player);
      else rest.push(player);
    }
    const chip = (player, mine) => nickPill(player, mine);
    const open = !!app.more[row.gameId];
    const toggle = rest.length ? `<button type="button" class="plus" data-more="${esc(row.gameId)}" title="${open ? "Masquer les autres joueurs" : "Afficher les joueurs hors GAL"}">${open ? "−" : "+"}</button>` : "";
    return `<td class="players"><div class="chips">${toggle}${gal.map((player) => chip(player, true)).join("")}${open ? rest.map((player) => chip(player, false)).join("") : ""}</div></td>`;
  }

  function paintPlayed(pulse) {
    const list = sessionTable();
    const label = `${fmt(pulse.games)} ${pulse.games > 1 ? "parties GAL" : "partie GAL"}`;
    const slot = app.root.querySelector('[data-slot="played"]');
    const box = slot && slot.querySelector("[data-sessions]");
    const count = slot && slot.querySelector(".live-count");
    if (box && count && slot.querySelector("#parties")) {
      if (count.textContent !== label) count.textContent = label;
      if (box.dataset.html !== list) {
        const y = box.scrollTop;
        box.innerHTML = list;
        box.dataset.html = list;
        box.scrollTop = y;
      }
      return;
    }
    fillSlot("played", `<section class="card" id="parties">
          ${panelHead("Parties 24 h", "LOG.24H")}
          <div class="panel-body">
          <p class="live-count">${label}</p>
          <div class="scroll played-scroll" data-sessions>${list}</div>
          </div>
        </section>`);
    const next = app.root.querySelector("[data-sessions]");
    if (next) next.dataset.html = list;
  }

  function sessionTable() {
    const rows = (app.clan && app.clan.sessions && app.clan.sessions.results) || [];
    if (!rows.length) return `<p class="empty">Aucune partie GAL sur cette fenêtre.</p>`;
    return rows.map((row) => {
      const players = row.players || [];
      const gal = [];
      const rest = [];
      for (const player of players) {
        if (String(player.clan || "").toUpperCase() === TAG) gal.push(player);
        else rest.push(player);
      }
      const open = !!app.more[row.gameId];
      const chip = (player, mine) => nickPill(player, mine);
      const toggle = rest.length ? `<button type="button" class="plus" data-more="${esc(row.gameId)}" title="${open ? "Masquer les autres joueurs" : "Afficher les joueurs hors GAL"}">${open ? "−" : "+"}</button>` : "";
      const waiting = !players.length ? `<span class="muted">Joueurs…</span>` : "";
      const everyone = open ? `<div class="chips everyone">${players.map((player) => chip(player, String(player.clan || "").toUpperCase() === TAG)).join("")}</div>` : "";
      return `<article class="played" data-game="${esc(row.gameId || "")}" data-loaded="${players.length ? "1" : "0"}">
        <div class="played-line">
          <b class="played-score ${Number(row.score) >= 0 ? "up" : "down"}">${signed(row.score)}</b>
          <time class="played-when">${esc(when(row.gameStart, true))}</time>
          <div class="played-names">
            <div class="chips names">${waiting}${gal.map((player) => chip(player, true)).join("")}</div>
            ${toggle}
          </div>
        </div>
        ${everyone}
      </article>`;
    }).join("");
  }

  function boardTable() {
    const rows = app.clan.leaderboard || [];
    const head = app.board === "share"
      ? `<th class="num">%</th><th class="num">Sessions</th>`
      : app.board === "points"
        ? `<th class="num">Pts D</th><th class="num">Pts V</th><th class="num">Ratio</th>`
        : `<th class="num">Parties</th><th class="num">Victoires</th><th class="num">Défaites</th>`;
    const cells = (row) => app.board === "share"
      ? `<td class="num">${pct(row.wins, row.losses)}</td><td class="num">${fmt(row.playerSessions)}</td>`
      : app.board === "points"
        ? `<td class="num down">${lossPts(row.weightedLosses)}</td><td class="num up">+${dec(row.weightedWins)}</td><td class="num gold">${dec(row.weightedWLRatio)}</td>`
        : `<td class="num">${fmt(row.games)}</td><td class="num up">${fmt(row.wins)}</td><td class="num down">${fmt(row.losses)}</td>`;
    return `<table><thead><tr><th>#</th><th>Clan</th>${head}</tr></thead><tbody>
      ${rows.map((row, index) => `<tr class="${row.clanTag === TAG ? "gal" : ""}">
        <td>${fmt(index + 1)}</td>
        <td>${esc(row.clanTag)}</td>
        ${cells(row)}
      </tr>`).join("")}
    </tbody></table>`;
  }

  function sameClan(player) {
    return player && String(player.clan || "").toUpperCase() === TAG;
  }

  function teamCount(playerTeams, playerCount) {
    const perTeam = playerTeams === "Duos" ? 2 : playerTeams === "Trios" ? 3 : playerTeams === "Quads" ? 4 : 0;
    if (perTeam) return Math.max(2, Math.ceil(playerCount / perTeam));
    const teams = Number(playerTeams);
    if (Number.isInteger(teams) && teams >= 2) return teams;
    return 0;
  }

  function outlook(snap) {
    const cfg = (snap.match && snap.match.config) || {};
    if (!/team/i.test(String(cfg.mode || "")) || cfg.type !== "Public") {
      return { ok: false, reason: "Les points de clan comptent dans une partie publique en équipes." };
    }
    const spawning = !!(snap.match && snap.match.spawn);
    const players = (snap.players || []).filter((player) => {
      if (String(player.kind || "").toUpperCase() !== "HUMAN") return false;
      return spawning || player.spawned !== false;
    });
    const clanCount = players.filter(sameClan).length;
    const teams = teamCount(cfg.teams, players.length);
    if (teams < 2 || !clanCount) return { ok: false, reason: "Pas encore assez d'équipes, ou aucun GAL dans la partie." };
    const ratio = clanCount / (players.length / teams);
    const difficulty = Math.max(1, Math.sqrt(teams - 1));
    return { ok: true, win: ratio * difficulty, loss: ratio / difficulty, teams, clanCount, players: players.length };
  }

  function localGalStillPlaying(snap) {
    if (!snap || !snap.inGame || !snap.match || snap.match.over) return false;
    const mine = (snap.players || []).filter(sameClan);
    if (!mine.length) return false;
    if (snap.match.spawn) return true;
    return mine.some((player) => player.alive !== false);
  }

  function liveGames() {
    const snap = app.snap || {};
    const localId = snap.inGame && snap.match && snap.match.id;
    const playing = localGalStillPlaying(snap);
    const games = (Array.isArray(snap.galGames) ? snap.galGames.slice() : []).filter((game) => {
      if (localId && game.id === localId && !playing) return false;
      return true;
    });
    if (localId && playing && !games.some((game) => game.id === localId)) {
      const mine = (snap.players || []).filter(sameClan);
      games.unshift({
        id: localId,
        map: (snap.match.config && snap.match.config.map) || "",
        players: (snap.players || []).length,
        max: 0,
        started: !snap.match.spawn && !snap.match.over,
        gal: mine.map((player) => ({ name: player.name || "GAL" })),
      });
    }
    games.sort((a, b) => Number(b.started) - Number(a.started) || (b.gal || []).length - (a.gal || []).length);
    return games;
  }

  function livePoints(game) {
    if (game.hvn || game.teamMode === "Humans Vs Nations") return null;
    if (Number.isFinite(Number(game.win)) && Number.isFinite(Number(game.loss))) {
      return { win: Number(game.win), loss: Number(game.loss) };
    }
    const total = Number(game.roster) || 0;
    const gal = (game.gal || []).length;
    const teams = teamCount(game.teamMode, total);
    if (!gal || teams < 2 || !total) return null;
    return previewPoints(total, teams, gal);
  }

  function teamEco(snap) {
    const land = Number(snap.match && snap.match.land) || 0;
    const groups = new Map();
    for (const player of snap.players || []) {
      if (String(player.kind || "").toUpperCase() === "BOT") continue;
      const team = player.team || "Seul";
      if (!groups.has(team)) groups.set(team, []);
      groups.get(team).push(player);
    }
    return [...groups.entries()].map(([team, players]) => {
      const troops = players.reduce((sum, player) => sum + (Number(player.troops) || 0), 0);
      const tiles = players.reduce((sum, player) => sum + (Number(player.tiles) || 0), 0);
      return {
        team,
        troops,
        share: land ? (100 * tiles) / land : 0,
        players: players.map((player) => ({
          name: player.name || "?",
          troops: Number(player.troops) || 0,
          share: land ? (100 * (Number(player.tiles) || 0)) / land : 0,
          clan: player.clan || "",
        })),
      };
    }).sort((a, b) => b.troops - a.troops);
  }

  function shareText(value) {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value) + " %";
  }

  function lobbyShape(game) {
    const mode = game.teamMode;
    const per = mode === "Duos" ? 2 : mode === "Trios" ? 3 : mode === "Quads" ? 4 : 0;
    const total = Number(game.max) || Number(game.roster) || 0;
    if (per && total) return `${fmt(Math.max(2, Math.ceil(total / per)))} équipes de ${fmt(per)}`;
    const teams = Number(game.teamCount) || Number(mode);
    if (Number.isInteger(teams) && teams >= 2 && total) return `${fmt(teams)} équipes de ${fmt(Math.floor(total / teams))}`;
    return "";
  }

  function liveHtml(compact) {
    const snap = app.snap;
    const linked = app.link;
    const failed = snap && snap.error;
    const games = liveGames();
    if (!games.length) {
      const empty = failed
        ? "La partie est reliée, mais la lecture a planté. Quitte OpenFront complètement, puis relance-le."
        : linked
          ? "Aucune partie en cours avec un joueur GAL."
          : "OpenFront n'est pas relié. Lance le jeu et reste sur le menu pour voir toutes les parties GAL.";
      return `<section class="live" id="jeu">${panelHead("En jeu", "LIVE")}<div class="panel-body"><p class="live-count">0 partie GAL</p><p class="empty">${empty}</p></div></section>`;
    }
    return `<section class="live" id="jeu">
      ${panelHead("En jeu", "LIVE")}
      <div class="panel-body">
      <p class="live-count">${fmt(games.length)} ${games.length > 1 ? "parties GAL" : "partie GAL"}</p>
      <div class="live-games">
      ${games.map((game) => {
        const names = game.gal || [];
        const phase = game.started ? "En cours" : "Salon";
        const filled = !game.started && game.max
          ? `${fmt(game.players)}/${fmt(game.max)}`
          : game.roster
            ? `${fmt(game.roster)} joueurs`
            : game.max ? `${fmt(game.players)}/${fmt(game.max)}` : "";
        const shape = lobbyShape(game);
        const local = snap && snap.inGame && snap.match && snap.match.id === game.id;
        const eco = local ? teamEco(snap) : [];
        const duration = game.startsAt ? ` · <span data-run="${Number(game.startsAt)}">…</span>` : "";
        const facts = [shape, filled].filter(Boolean).join(" · ");
        const points = livePoints(game);
        const pointBox = points
          ? `<div class="queue-pts"><div><span>Victoire</span><b class="up">+${dec(points.win)}</b></div><div><span>Défaite</span><b class="down">${lossPts(points.loss)}</b></div></div>`
          : "";
        const economy = !compact && eco.length ? `<div class="eco">${eco.map((team) => `<div class="eco-team">
            <b><span>${esc(team.team)}</span><span>${fmt(team.troops)} troupes · ${shareText(team.share)} carte</span></b>
            ${team.players.map((player) => `<div class="eco-player"><span>${esc(player.name)}</span><span>${fmt(player.troops)} troupes · ${shareText(player.share)} carte</span></div>`).join("")}
          </div>`).join("")}</div>` : "";
        return `<article class="gal-game">
          <p class="game-phase ${game.started ? "ok" : "wait"}">${phase}${duration}</p>
          <h3>${esc(mapName(game.map))}</h3>
          ${facts ? `<p class="game-facts">${facts}</p>` : ""}
          <div class="chips">${names.map((player) => nickPill({ name: player.name || "GAL", publicId: player.publicId || "" }, true)).join("")}</div>
          ${pointBox}
          ${economy}
          <a class="watch" href="${gameLink(game.id, true)}" target="_blank" rel="noopener noreferrer">Voir la partie</a>
        </article>`;
      }).join("")}
      </div>
      </div>
    </section>`;
  }

  function paintLive() {
    paintQueue();
    const node = app.root.querySelector("#jeu");
    const dot = app.root.querySelector("[data-dot]");
    const status = app.root.querySelector("[data-status]");
    if (dot) {
      dot.classList.toggle("on", app.link && !!(app.snap && app.snap.inGame));
      dot.classList.toggle("wait", app.link && !(app.snap && app.snap.inGame));
    }
    if (status) status.textContent = app.snap && app.snap.inGame ? "En partie" : app.link ? "Hors partie" : "Jeu non relié";
    if (!node || !app.clan) return;
    const html = liveHtml(true);
    if (html !== liveKey) {
      liveKey = html;
      const wrap = document.createElement("div");
      wrap.innerHTML = html;
      keepScroll(app.root.querySelector('[data-slot="played"]'), () => {
        node.replaceWith(wrap.firstElementChild);
      });
      requestAnimationFrame(syncPanelHeights);
    }
    queueClock();
  }

  function isLeaf(node) {
    return !!node && typeof node === "object" && !Array.isArray(node) && "wins" in node && "total" in node;
  }

  function walkLeaves(node, path, out) {
    if (!node || typeof node !== "object") return;
    if (isLeaf(node)) {
      out.push({ path, leaf: node });
      return;
    }
    for (const key of Object.keys(node)) walkLeaves(node[key], path.concat(key), out);
  }

  function mergeStats(dst, src) {
    for (const [key, value] of Object.entries(src || {})) {
      if (Array.isArray(value)) {
        dst[key] = dst[key] || [];
        value.forEach((item, index) => {
          dst[key][index] = bi(dst[key][index]) + bi(item);
        });
      } else if (value && typeof value === "object") {
        dst[key] = dst[key] || {};
        mergeStats(dst[key], value);
      } else {
        dst[key] = bi(dst[key]) + bi(value);
      }
    }
  }

  function arrayLabels(key) {
    if (key === "attacks") return ATTACKS;
    if (key === "gold") return GOLD;
    if (key === "tiles") return TILES;
    if (key === "alliances") return ALLIANCES;
    if (key === "donations") return DONATIONS;
    if (key === "conquests") return CONQUESTS;
    if (key === "boats" || key === "trade" || key === "trans") return BOAT;
    if (key === "bombs" || key === "abomb" || key === "hbomb" || key === "mirv" || key === "mirvw") return BOMB;
    if (key === "units" || ["city", "defp", "port", "wshp", "silo", "saml", "fact"].includes(key)) return UNIT;
    return null;
  }

  function renderValue(value, key) {
    if (Array.isArray(value)) {
      const labels = arrayLabels(key) || [];
      return `<div class="grid">${value.map((item, index) => `<div class="cell"><em>${esc(labels[index] || "Valeur " + (index + 1))}</em><strong>${item == null ? "—" : fmt(item)}</strong></div>`).join("")}</div>`;
    }
    if (value && typeof value === "object") {
      return Object.entries(value).map(([child, inner]) => `<h3 style="margin-top:10px">${esc(NAMES[child] || child)}</h3>${renderValue(inner, child)}`).join("");
    }
    return `<div class="row"><span>${esc(NAMES[key] || key)}</span><b>${value == null ? "—" : fmt(value)}</b></div>`;
  }

  const PROF_TABS = [["vue", "Vue"], ["carriere", "Carrière"], ["clan", "Clan"], ["allies", "Alliés"]];
  const BUCKET_FR = { Public: "Public", Private: "Privé", Ranked: "Classé", Singleplayer: "Solo" };
  const MODE_FR = { "Free For All": "FFA", Team: "Équipes", "Humans Vs Nations": "HvN", "1v1": "1v1", "2v2": "2v2" };
  const DIFF_FR = { Easy: "Facile", Medium: "Moyen", Hard: "Difficile", Impossible: "Impossible" };

  function dossierOf() {
    return (app.profile && app.profile.dossier) || null;
  }

  function recNet(rec) {
    return (Number(rec && rec.gained) || 0) - (Number(rec && rec.lost) || 0);
  }

  function matchQ(text) {
    const q = String(app.profQuery || "").trim().toLowerCase();
    return !q || String(text || "").toLowerCase().includes(q);
  }

  function filterBox(placeholder) {
    return `<div class="dir-search solo prof-find"><label class="dir-main"><span>Filtrer</span><input data-prof-q type="search" placeholder="${esc(placeholder)}" value="${esc(app.profQuery || "")}" autocomplete="off" /></label></div>`;
  }

  function mateTable(rows, empty) {
    const shown = (rows || []).filter((row) => matchQ(row.name));
    if (!shown.length) return `<p class="empty">${esc(empty)}</p>`;
    return `<div class="dir-table"><table class="rank-table"><thead><tr><th>Alliés</th><th class="num">V</th><th class="num">D</th><th class="num">Parties</th><th class="num">%</th><th class="num">Solde</th></tr></thead><tbody>
        ${shown.map((row) => `<tr class="pick" data-id="${esc(row.id || "")}" data-name="${esc(row.name || "")}">
        <td>${nickBtn(row.id || "", row.name || "")}</td>
        <td class="num up">${fmt(row.wins)}</td>
        <td class="num down">${fmt(row.losses)}</td>
        <td class="num">${fmt(row.games)}</td>
        <td class="num">${pct(row.wins, row.losses)}</td>
        <td class="num ${row.gained - row.lost >= 0 ? "up" : "down"}">${signed(recNet(row))}</td>
      </tr>`).join("")}
    </tbody></table></div>`;
  }

  function heroStats(items) {
    return `<div class="prof-hero">${items.map((item) => `<div><em>${esc(item[0])}</em><strong class="${item[2] || ""}">${item[1]}</strong></div>`).join("")}</div>`;
  }

  function identLine(parts) {
    return `<p class="prof-id">${parts.filter(Boolean).join(" · ")}</p>`;
  }

  function profileHtml() {
    const member = app.member || {};
    const dossier = dossierOf();
    const profile = app.profile;
    const id = (dossier && dossier.publicId) || member.publicId || "";
    const name = playerDisplayName(id, member.username);
    const role = (dossier && dossier.role) || member.role || "";
    const clan = dossier && dossier.clan;
    const career = dossier && dossier.career;
    const windows = playerWindows(id, name);
    const tab = app.profileTab || "vue";
    let body = "";
    if (tab === "carriere") {
      const groups = (career && career.groups) || [];
      const shown = groups.filter((row) => matchQ([row.bucket, row.mode, row.diff].join(" ")));
      const modeMap = new Map();
      for (const row of groups) {
        const label = MODE_FR[row.mode] || row.mode;
        const item = modeMap.get(label) || { label, value: 0 };
        item.value += Number(row.games) || 0;
        modeMap.set(label, item);
      }
      if (!modeMap.size && member.stats) {
        for (const [key, label] of MODES) {
          if (key === "total") continue;
          const rec = wl(member.stats[key]);
          if (rec.wins + rec.losses) modeMap.set(label, { label, value: rec.wins + rec.losses });
        }
      }
      const modes = [...modeMap.values()].sort((a, b) => b.value - a.value);
      const total = career && career.games != null ? career.games : wl(member.stats && member.stats.total);
      const totalGames = typeof total === "number" ? total : total.wins + total.losses;
      const publicWins = groups.filter((row) => row.bucket === "Public").reduce((n, row) => n + row.wins, 0);
      const publicLosses = groups.filter((row) => row.bucket === "Public").reduce((n, row) => n + row.losses, 0);
      body = `
        ${modes.length ? `<div class="stat-grid charts">
          ${chartBox("Parties par mode", fmt(totalGames), "", barChart(modes, (v) => fmt(v) + " parties", "nb", shortNum), "CARRIÈRE")}
          ${groups.length ? chartBox("Ratio public", pct(publicWins, publicLosses), "", spark(groups.filter((row) => row.bucket === "Public").map((row) => ({ label: (MODE_FR[row.mode] || row.mode).slice(0, 4), value: row.games, now: row.mode === "Team" })), (v) => fmt(v) + " parties", "nb", shortNum), "PUBLIC") : ""}
        </div>` : ""}
        ${groups.length ? filterBox("Type, mode ou difficulté") : ""}
        ${shown.length ? `<div class="dir-table"><table class="rank-table"><thead><tr><th>Type</th><th>Mode</th><th>Diff.</th><th class="num">V</th><th class="num">D</th><th class="num">Parties</th><th class="num">%</th></tr></thead><tbody>
          ${shown.map((row) => `<tr>
            <td>${esc(BUCKET_FR[row.bucket] || row.bucket)}</td>
            <td>${esc(MODE_FR[row.mode] || row.mode)}</td>
            <td>${esc(DIFF_FR[row.diff] || row.diff || "—")}</td>
            <td class="num up">${fmt(row.wins)}</td>
            <td class="num down">${fmt(row.losses)}</td>
            <td class="num">${fmt(row.games)}</td>
            <td class="num">${pct(row.wins, row.losses)}</td>
          </tr>`).join("")}
        </tbody></table></div>` : groups.length ? `<p class="empty">Aucun découpage pour ce filtre.</p>` : ""}
        <h3 class="prof-h">Détail de combat</h3>
        ${career && career.deep ? renderValue(career.deep, "stats") : `<div class="dir-table">${modeTable(member.stats || {})}</div>`}`;
    } else if (tab === "clan") {
      const rows = [["24h", "24 h"], ["7", "7 jours"], ["30", "30 jours"], ["90", "3 mois"]]
        .map(([key, label]) => ({ key, label, rec: windows[key] || { games: 0, wins: 0, losses: 0, gained: 0, lost: 0 } }))
        .filter((row) => matchQ(row.label));
      body = `
        <div class="stat-grid charts">
          ${chartBox("Parties clan", fmt((windows["24h"] && windows["24h"].games) || 0), "", spark(periodSeries(windows, (rec) => rec.games), (v) => fmt(v) + " parties", "nb", shortNum), "24 H")}
          ${chartBox("Solde clan", signed(recNet(windows["24h"])), "", spark(periodSeries(windows, recNet), (v) => signed(v) + " pts", "pts", shortNum), "24 H")}
          ${chartBox("Victoires clan", fmt((windows["24h"] && windows["24h"].wins) || 0), "", spark(periodSeries(windows, (rec) => rec.wins), (v) => fmt(v) + " V", "V", shortNum), "24 H")}
          ${chartBox("Points gagnés", "+" + dec((windows["24h"] && windows["24h"].gained) || 0), "", spark(periodSeries(windows, (rec) => rec.gained), (v) => "+" + dec(v), "pts", shortNum), "24 H")}
        </div>
        ${filterBox("Fenêtre")}
        <div class="dir-table"><table class="rank-table"><thead><tr><th>Fenêtre</th><th class="num">Solde</th><th class="num">Gagnés</th><th class="num">Perdus</th><th class="num">V</th><th class="num">D</th><th class="num">Parties</th><th class="num">%</th></tr></thead><tbody>
          ${rows.map((row) => `<tr>
            <td>${esc(row.label)}</td>
            <td class="num ${recNet(row.rec) >= 0 ? "up" : "down"}">${signed(recNet(row.rec))}</td>
            <td class="num up">+${dec(row.rec.gained)}</td>
            <td class="num down">${lossPts(row.rec.lost)}</td>
            <td class="num up">${fmt(row.rec.wins)}</td>
            <td class="num down">${fmt(row.rec.losses)}</td>
            <td class="num">${fmt(row.rec.games)}</td>
            <td class="num">${pct(row.rec.wins, row.rec.losses)}</td>
          </tr>`).join("")}
        </tbody></table></div>
        <h3 class="prof-h">Modes clan</h3>
        ${modeTable((dossier && dossier.clanModes) || member.stats || {})}`;
    } else if (tab === "allies") {
      const mates = (dossier && dossier.mates) || { allies: [], duos: [], trios: [], quads: [] };
      const top = (mates.allies || []).slice(0, 8).map((row) => ({ label: String(row.name || "").slice(0, 8), value: row.wins, now: false }));
      if (top.length) top[0].now = true;
      body = `
        ${top.length ? `<div class="stat-grid charts">${chartBox("Victoires avec alliés", fmt(mates.allies[0].wins), mates.allies[0].name, barChart(top, (v) => fmt(v) + " V", "V", shortNum), "90 J")}</div>` : ""}
        ${filterBox("Pseudo d’allié")}
        <h3 class="prof-h">Meilleurs alliés GAL</h3>
        ${mateTable(mates.allies, "Pas encore d’alliés GAL lus sur 90 jours.")}
        <h3 class="prof-h">Duos</h3>
        ${mateTable(mates.duos, "Pas encore de duo GAL lu.")}
        <h3 class="prof-h">Trios</h3>
        ${mateTable(mates.trios, "Pas encore de trio GAL lu.")}
        <h3 class="prof-h">Quads</h3>
        ${mateTable(mates.quads, "Pas encore de quad GAL lu.")}`;
    } else {
      const aliases = ((dossier && dossier.aliases) || []).filter((alias) => String(alias).toLowerCase() !== String(name).toLowerCase());
      const peek = boardPeek(id, name);
      const local = peek.row || recFromRow(null);
      const localGames = local.games || (local.wins + local.losses);
      const age = dossier && dossier.ageDays != null ? dossier.ageDays + " j" : "";
      const activity = dossier && dossier.activity != null ? dec(dossier.activity, 1) : "";
      const liveNet = recNet(windows["24h"] || local);
      const week = weekSeries((day) => weekScore(day, { publicId: id, name, aliases: aliases.length ? aliases : [name] }), liveNet);
      const modes = [];
      const modeMap = new Map();
      for (const row of (career && career.groups) || []) {
        const label = MODE_FR[row.mode] || row.mode;
        const item = modeMap.get(label) || { label, value: 0 };
        item.value += Number(row.games) || 0;
        modeMap.set(label, item);
      }
      if (!modes.length && member.stats) {
        for (const [key, label] of MODES) {
          if (key === "total") continue;
          const rec = wl(member.stats[key]);
          if (rec.wins + rec.losses) modes.push({ label, value: rec.wins + rec.losses });
        }
        modes.sort((a, b) => b.value - a.value);
      }
      const last = peek.games.slice(0, 5);
      const vsAvg = peek.avgGames
        ? fmt(localGames) + " parties (" + (localGames >= peek.avgGames ? "+" : "") + dec(localGames - peek.avgGames, 1) + " vs moy. clan " + dec(peek.avgGames, 1) + ")"
        : fmt(localGames) + " parties GAL";
      body = `
        ${heroStats([
          ["Rang " + periodLabel(), peek.rank ? "#" + fmt(peek.rank) : "—", "gold"],
          ["Solde", signed(recNet(local)), recNet(local) >= 0 ? "up" : "down"],
          ["Ratio clan", pct(local.wins || 0, local.losses || 0)],
          ["Série", peek.streak ? peek.streak + (peek.hot ? " V" : " D") : "—", peek.hot ? "up" : peek.streak ? "down" : ""],
        ])}
        <p class="sub">${[
          vsAvg + " · " + fmt(local.wins || 0) + " V / " + fmt(local.losses || 0) + " D",
          profile && profile.createdAt ? "compte " + age : "",
          (dossier && dossier.joinedAt) || member.joinedAt ? "GAL depuis le " + when((dossier && dossier.joinedAt) || member.joinedAt) : "",
          activity ? activity + " parties / jour" : "",
          aliases.length ? "aussi " + aliases.join(", ") : "",
        ].filter(Boolean).join(" · ")}</p>
        <div class="stat-grid charts">
          ${peek.form.length ? chartBox("Dernière partie", signed(peek.form[peek.form.length - 1].value), "12 dernières GAL, plus ancienne à gauche", barChart(peek.form, (v) => signed(v) + " pts", "pts", shortNum), "24 H") : ""}
          ${chartCard("Solde 7 j", signed(liveNet), "point 24 h sur la courbe", week, (v) => signed(v) + " pts", "pts", shortNum)}
          ${chartBox("Volume clan", fmt((windows["24h"] && windows["24h"].games) || localGames), "24 h, 7 j, 30 j, 90 j", spark(periodSeries(windows, (rec) => rec.games), (v) => fmt(v) + " parties", "nb", shortNum), "FENÊTRES")}
          ${chartBox("Victoires clan", fmt((windows["24h"] && windows["24h"].wins) || local.wins || 0), "", spark(periodSeries(windows, (rec) => rec.wins), (v) => fmt(v) + " V", "V", shortNum), "FENÊTRES")}
          ${modes.length ? chartBox("Modes joués", esc(modes[0].label), "", barChart(modes, (v) => fmt(v) + " parties", "nb", shortNum), "CARRIÈRE") : ""}
        </div>
        ${last.length ? `<h3 class="prof-h">Dernières parties</h3>
          <div class="dir-table"><table class="rank-table"><thead><tr><th>Quand</th><th>Carte</th><th class="num">Score</th><th>Résultat</th></tr></thead><tbody>
            ${last.map((row) => `<tr>
              <td>${esc(when(row.gameStart, true))}</td>
              <td>${esc(row.map ? mapName(row.map) : "—")}</td>
              <td class="num ${Number(row.score) >= 0 ? "up" : "down"}">${signed(row.score)}</td>
              <td>${row.hasWon ? "Victoire" : "Défaite"}</td>
            </tr>`).join("")}
          </tbody></table></div>` : ""}`;
    }
    return `
      <div class="drawer peek" data-drawer>
        <div class="sheet prof">
          <div class="sheet-head">
            <div>
              <p class="prof-name">${esc(name)}</p>
              ${identLine([id ? "id " + esc(id) : "", clan ? esc(clan.tag) + (clan.name ? " " + esc(clan.name) : "") : "", role ? esc(ROLES[role] || role) : ""])}
            </div>
            <button class="ghost" type="button" data-close>Fermer</button>
          </div>
          <div class="pills prof-tabs">${PROF_TABS.map(([key, label]) => `<button type="button" data-prof-tab="${key}" class="${tab === key ? "on" : ""}">${esc(label)}</button>`).join("")}</div>
          <div class="panel-body prof-body">${body}</div>
        </div>
      </div>`;
  }

  function bindDrawer() {
    const drawer = app.root.querySelector("[data-drawer]");
    if (!drawer) return;
    drawer.addEventListener("click", (event) => {
      if (event.target === drawer || event.target.closest("[data-close]")) {
        closeFiche();
        return;
      }
      const tab = event.target.closest("[data-prof-tab]");
      if (tab) {
        app.profileTab = tab.dataset.profTab;
        paintDrawer();
        return;
      }
      const find = event.target.closest("[data-prof-q]");
      if (find) return;
      const next = event.target.closest("[data-id]");
      if (next && next.dataset.id && app.member && next.dataset.id !== app.member.publicId) {
        openPlayer(next.dataset.id, { publicId: next.dataset.id, username: next.dataset.name || "", role: "", stats: {} });
      }
    });
  }

  function paintDrawer() {
    const old = app.root.querySelector("[data-drawer]");
    if (!app.member && !app.clanFiche) {
      if (old) old.remove();
      return;
    }
    const wrap = document.createElement("div");
    wrap.innerHTML = app.clanFiche ? clanFicheHtml() : profileHtml();
    const next = wrap.firstElementChild;
    if (old) old.replaceWith(next);
    else app.root.appendChild(next);
    bindDrawer();
    const find = next.querySelector("[data-prof-q]");
    if (find) {
      find.addEventListener("input", () => {
        app.profQuery = find.value;
        paintDrawer();
        const again = app.root.querySelector("[data-prof-q]");
        if (again) {
          again.focus();
          const end = again.value.length;
          again.setSelectionRange(end, end);
        }
      });
    }
  }

  function closeFiche() {
    app.member = null;
    app.profile = null;
    app.profileError = "";
    app.leaf = "all";
    app.profileTab = "vue";
    app.profQuery = "";
    app.clanFiche = null;
    paintDrawer();
  }

  async function openPlayer(id, hint) {
    const name = (hint && (hint.username || hint.name)) || "";
    const found = findMember(name, id);
    const member = found || hint || { publicId: id || "", username: name, role: "", stats: {} };
    const publicId = id || member.publicId || "";
    if (!publicId && !name) return;
    app.clanFiche = null;
    app.member = { ...member, publicId, username: name || member.username || publicId };
    app.profile = null;
    app.profileError = "";
    app.leaf = "all";
    app.profileTab = "vue";
    app.profQuery = "";
    paintDrawer();
    if (!publicId) return;
    try {
      const response = await fetch("api/player.php?id=" + encodeURIComponent(publicId), { credentials: "same-origin", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Profil indisponible");
      if (app.member && app.member.publicId === publicId) {
        app.profile = body;
        if (body.username) app.member.username = body.username;
        paintDrawer();
      }
    } catch (error) {
      if (app.member && app.member.publicId === publicId) {
        app.profileError = error.message || "Profil indisponible";
        paintDrawer();
      }
    }
  }

  function clanRowByTag(tag) {
    const rows = (app.clan && app.clan.leaderboard) || [];
    const index = rows.findIndex((row) => row.clanTag === tag);
    return index >= 0 ? { ...rows[index], rank: index + 1 } : null;
  }

  function openClanFiche(tag) {
    app.member = null;
    app.profile = null;
    app.clanFiche = clanRowByTag(tag) || { clanTag: tag, rank: null };
    paintDrawer();
  }

  function clanFicheHtml() {
    const raw = app.clanFiche || {};
    const row = clanDecor(raw, (raw.rank || 1) - 1);
    const tag = row.clanTag || "";
    const hub = ((app.hub && app.hub.clans) || []).find((clan) => clan.tag === tag);
    const galWeek = tag === TAG;
    return `
      <div class="drawer" data-drawer>
        <div class="sheet prof">
          <div class="sheet-head">
            <div>
              ${panelHead(tag || "Clan", "CLAN." + tag)}
              ${identLine([hub && hub.name ? esc(hub.name) : "", row.rank ? "Rang #" + fmt(row.rank) : "Hors classement", fmt(row.games) + " parties", dec(row.stack, 1) + " j / partie"])}
            </div>
            <button class="ghost" type="button" data-close>Fermer</button>
          </div>
          <div class="panel-body prof-body">
            ${heroStats([
              ["Rang", row.rank ? "#" + fmt(row.rank) : "—", "gold"],
              ["Solde", signed(row.solde), row.solde >= 0 ? "up" : "down"],
              ["Ratio", pct(row.wins, row.losses)],
              ["Victoires", fmt(row.wins), "up"],
            ])}
            <p class="sub">${fmt(row.losses)} défaites · ${fmt(row.playerSessions)} sessions · +${dec(row.weightedWins)} / ${lossPts(row.weightedLosses)} pts · ratio pts ${dec(row.weightedWLRatio)} · ${dec(row.avg)} pts / partie</p>
            <div class="stat-grid charts">
              ${galWeek ? chartCard("Parties GAL", fmt(dayPulse().games), "7 derniers jours", weekSeries((day) => day.games, dayPulse().games), (v) => fmt(v) + " parties", "parties", shortNum) : ""}
              ${galWeek ? chartCard("Points GAL", "+" + dec(dayPulse().gained), "victoires seulement", weekSeries((day) => day.gained, dayPulse().gained), (v) => "+" + dec(v) + " pts", "pts", shortNum) : ""}
              ${chartBox("Solde des clans", signed(row.solde), "top 10 + ce clan", barChart(boardSeries((item) => item.solde, 10, tag), (v) => signed(v) + " pts", "pts", shortNum), "SAISON")}
              ${chartBox("Parties saison", fmt(row.games), "", barChart(boardSeries((item) => item.games, 10, tag), (v) => fmt(v) + " parties", "nb", shortNum), "SAISON")}
              ${chartBox("% victoires", pct(row.wins, row.losses), "min. 200 parties", barChart(boardSeries((item) => item.games >= 200 ? item.rate * 100 : 0, 10, tag), (v) => dec(v, 1) + " %", "%", shortNum), "SAISON")}
              ${chartBox("Ratio de points", dec(row.weightedWLRatio), "", barChart(boardSeries((item) => Number(item.weightedWLRatio) || 0, 10, tag), (v) => dec(v), "x", shortNum), "SAISON")}
            </div>
            ${hub && hub.promo ? `<p class="sub">${esc(hub.promo)}</p>` : ""}
            ${hub && hub.discord ? `<p><a href="${esc(hub.discord)}" target="_blank" rel="noopener noreferrer">Discord</a></p>` : ""}
          </div>
        </div>
      </div>`;
  }

  let loadToken = 0;
  async function load(fresh) {
    const token = ++loadToken;
    const params = new URLSearchParams();
    if (!app.rolling) {
      if (app.from) params.set("from", app.from);
      if (app.untilNow) params.set("now", "1");
      else if (app.to) params.set("to", app.to);
    }
    if (fresh) params.set("fresh", "1");
    try {
      const response = await fetch("api/clan.php" + (params.toString() ? "?" + params.toString() : ""), { credentials: "same-origin", cache: "no-store" });
      const body = await response.json();
      if (token !== loadToken) return;
      if (!response.ok) throw new Error(body.error || "Clan indisponible");
      app.clan = body;
      app.error = "";
    } catch (error) {
      if (token !== loadToken) return;
      const message = error.message || "Clan indisponible";
      app.error = /1015|429/.test(message) ? "Trop de requêtes vers OpenFront. Réessaie dans une minute." : message;
      if (!app.clan) setTimeout(() => load(false), 5000);
    }
    paint();
    paintLive();
    fetch("api/snap.php?name=quarter", { credentials: "same-origin", cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((body) => {
        if (token !== loadToken || !body || !body.stats) return;
        app.quarter = body;
        if (app.view === "board") paint();
      })
      .catch(() => {});
    loadWeek(fresh, token);
    fetch("api/snap.php?name=ranks", { credentials: "same-origin", cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((body) => {
        if (token !== loadToken || !body || !body.periods) return;
        app.ranks = body;
        if (app.view === "board" && app.rankPeriod !== "24h") paintRanks();
        if (app.member) paintDrawer();
      })
      .catch(() => {});
  }

  function loadWeek(fresh, token) {
    fetch("api/snap.php?name=week", { credentials: "same-origin", cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((body) => {
        if (token !== loadToken) return;
        if (!body || !Array.isArray(body.days)) {
          app.weekFailed = true;
          if (app.view === "board") paint();
          setTimeout(() => {
            if (token === loadToken) loadWeek(false, token);
          }, 5 * 60 * 1000);
          return;
        }
        app.week = body;
        app.weekFailed = false;
        if (app.view === "board") paint();
        if (app.member) paintDrawer();
        if (body.partial) {
          setTimeout(() => {
            if (token === loadToken) loadWeek(false, token);
          }, 5 * 60 * 1000);
        }
      })
      .catch(() => {});
  }

  async function pullLive() {
    try {
      const response = await fetch("api/live.php", { credentials: "same-origin", cache: "no-store" });
      if (response.status === 401) {
        location.reload();
        return;
      }
      if (!response.ok) {
        app.link = false;
        paintLive();
        return;
      }
      const body = await response.json();
      if (!body || body.type !== "state") return;
      const fresh = body.t && Date.now() - body.t < 20000;
      app.link = !!fresh;
      if (fresh) app.snap = body;
      else {
        const prev = app.snap || {};
        app.snap = { ...body, inGame: false, match: null, galGames: [], players: [], queue: body.queue || prev.queue || null };
      }
      paintLive();
    } catch {
      app.link = false;
      paintLive();
    }
  }

  function connect() {
    pullLive();
    setInterval(pullLive, 1000);
  }

  function hubClan() {
    const clans = (app.hub && app.hub.clans) || [];
    return clans.find((clan) => String(clan.tag || "").toUpperCase() === TAG) || clans[0] || {
      tag: TAG, name: TAG, promo: "", events: [], campaigns: [], rewards: [], streamers: [], videos: [], tutos: [],
    };
  }

  function ytFrame(id) {
    if (!id) return `<p class="empty">Colle un identifiant YouTube dans public/hub.json.</p>`;
    return `<iframe class="media-frame" src="https://www.youtube-nocookie.com/embed/${esc(id)}" title="YouTube" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  }

  function twitchFrame(channel) {
    if (!channel) return `<p class="empty">Ajoute un pseudo Twitch dans public/hub.json.</p>`;
    return `<iframe class="media-frame" src="https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(location.hostname)}&muted=true" title="Twitch" allowfullscreen></iframe>`;
  }

  let dirTimer = null;
  let dirToken = 0;

  function loadDir() {
    const token = ++dirToken;
    const params = new URLSearchParams({ q: app.dir.q, clan: app.dir.clan, sort: app.dir.sort, dir: app.dir.order, page: String(app.dir.page), size: "25" });
    fetch("api/players.php?" + params.toString(), { credentials: "same-origin", cache: "no-store" })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error("Annuaire indisponible")))
      .then((body) => {
        if (token !== dirToken) return;
        app.dir.data = body;
        app.dir.page = body.page;
        app.dir.error = "";
        paintDir();
      })
      .catch((error) => {
        if (token !== dirToken) return;
        app.dir.error = error.message || "Annuaire indisponible";
        paintDir();
      });
  }

  function paintDir() {
    if (app.view !== "players") return;
    const status = app.root.querySelector("[data-dir-status]");
    const rows = app.root.querySelector("[data-dir-rows]");
    if (status) status.innerHTML = dirStatus();
    if (rows) rows.innerHTML = dirRows();
  }

  function dirStatus() {
    const data = app.dir.data;
    if (app.dir.error) return esc(app.dir.error);
    if (!data) return "Chargement de l'annuaire…";
    const s = data.status || {};
    const span = s.from && s.to ? `Parties lues du ${when(new Date(s.from).toISOString(), true)} au ${when(new Date(s.to).toISOString(), true)}. ` : "";
    const slow = s.stepMs > 3000 ? `OpenFront freine, lecture ralentie (1 requête / ${fmt(Math.round(s.stepMs / 1000))} s). ` : "";
    return `<span title="${esc(span + slow + "La liste grandit toute seule.")}"><b>${fmt(s.players || 0)}</b> joueurs vérifiés · <b>${fmt(s.withStats || 0)}</b> avec stats · <b>${fmt(s.games || 0)}</b> parties lues</span>${slow ? ` <span class="down">· lecture ralentie</span>` : ""}`;
  }

  function dirHead(key, label, num) {
    const on = app.dir.sort === key;
    const arrow = on ? (app.dir.order === "asc" ? " ▲" : " ▼") : "";
    return `<th class="${num ? "num " : ""}sortable${on ? " on" : ""}"><button type="button" data-dir-sort="${key}">${esc(label)}${arrow}</button></th>`;
  }

  function wlCell(pair, key, title) {
    if (!pair) return `<td class="num muted">…</td>`;
    const [w, l] = pair;
    return `<td class="num${app.dir.sort === key ? " gold" : ""}"${title ? ` title="${esc(title)}"` : ""}>${fmt(w)} / ${fmt(l)}<small>${pct(w, l)}</small></td>`;
  }

  function dirRows() {
    const data = app.dir.data;
    if (!data) return "";
    if (!data.rows.length) return `<p class="empty">${data.status && data.status.players ? "Aucun joueur pour ces filtres." : "Aucun joueur vérifié lu pour l'instant, les premiers arrivent dans quelques minutes."}</p>`;
    const start = data.page * data.size;
    const rows = data.rows.map((row, index) => {
      const s = row.stats;
      const clan = row.clan;
      const ranked = s ? [s.r1v1[0] + s.r2v2[0], s.r1v1[1] + s.r2v2[1]] : null;
      const on = (key) => (app.dir.sort === key ? " gold" : "");
      const clanRecord = clan && clan.games != null ? [clan.wins, clan.losses] : null;
      return `<tr class="pick" data-id="${esc(row.id)}" data-name="${esc(row.name || "")}">
        <td>${fmt(start + index + 1)}</td>
        <td><b class="${on("name").trim()}">${esc(row.name || row.id)}</b><small>${esc(row.id)}</small></td>
        <td>${clan ? `<b class="gold">${esc(clan.tag)}</b>${clan.rank ? `<small>#${fmt(clan.rank)}</small>` : ""}` : `<span class="muted">—</span>`}</td>
        <td class="num${on("games")}">${s ? fmt(s.total[0] + s.total[1]) : "…"}</td>
        ${wlCell(s && s.total, s && app.dir.sort === "wins" ? "wins" : "ratio")}
        ${wlCell(s && s.team, "team")}
        ${wlCell(s && s.ffa, "ffa")}
        ${wlCell(ranked, "ranked")}
        ${clanRecord ? wlCell(clanRecord, app.dir.sort === "clanGames" ? "clanGames" : "clanRatio", fmt(clan.games) + " parties du clan") : `<td class="num muted">${clan ? "…" : "—"}</td>`}
        <td class="num${on("last")}">${esc(when(new Date(row.last).toISOString(), true))}</td>
      </tr>`;
    }).join("");
    const last = Math.min(start + data.size, data.total);
    return `<div class="dir-table"><table class="rank-table"><thead><tr>
        <th>#</th>${dirHead("name", "Joueur")}${dirHead("clan", "Clan")}
        ${dirHead("games", "Parties", true)}${dirHead("ratio", "Total V / D", true)}${dirHead("team", "Équipes", true)}${dirHead("ffa", "FFA", true)}${dirHead("ranked", "Classé", true)}
        ${dirHead("clanRatio", "Clan V / D", true)}${dirHead("last", "Vu le", true)}
      </tr></thead><tbody>${rows}</tbody></table></div>
      <div class="pager">
        <button type="button" data-dir-page="prev" ${data.page <= 0 ? "disabled" : ""}>◀ Préc.</button>
        <span>${fmt(start + 1)}–${fmt(last)} sur ${fmt(data.total)}</span>
        <button type="button" data-dir-page="next" ${data.page >= data.pages - 1 ? "disabled" : ""}>Suiv. ▶</button>
      </div>`;
  }

  function playerSearchRows() {
    const find = app.find;
    let rows = [...((app.clan && app.clan.members && app.clan.members.results) || [])];
    const q = String(find.q || "").trim().toLowerCase();
    rows = rows.filter((member) => {
      if (q && !`${member.username || ""} ${member.publicId || ""}`.toLowerCase().includes(q)) return false;
      if (find.role && member.role !== find.role) return false;
      const stats = wl(member.stats && member.stats[find.mode || "total"]);
      const games = stats.wins + stats.losses;
      const minWins = Number(find.minWins);
      const minGames = Number(find.minGames);
      const minRatio = Number(String(find.minRatio).replace(",", "."));
      if (Number.isFinite(minWins) && find.minWins !== "" && stats.wins < minWins) return false;
      if (Number.isFinite(minGames) && find.minGames !== "" && games < minGames) return false;
      if (Number.isFinite(minRatio) && find.minRatio !== "" && (games ? (100 * stats.wins) / games : 0) < minRatio) return false;
      return true;
    });
    rows.sort((a, b) => wl(b.stats && b.stats[find.mode || "total"]).wins - wl(a.stats && a.stats[find.mode || "total"]).wins);
    if (!rows.length) return `<p class="empty">Aucun joueur pour ces filtres.</p>`;
    return `<table><thead><tr><th>Joueur</th><th>Rôle</th><th class="num">V</th><th class="num">D</th><th class="num">Parties</th><th class="num">%</th></tr></thead><tbody>
      ${rows.map((member) => {
        const stats = wl(member.stats && member.stats[find.mode || "total"]);
        return `<tr class="pick" data-id="${esc(member.publicId)}"><td>${esc(member.username)}</td><td>${esc(ROLES[member.role] || member.role || "")}</td><td class="num">${fmt(stats.wins)}</td><td class="num">${fmt(stats.losses)}</td><td class="num">${fmt(stats.wins + stats.losses)}</td><td class="num">${pct(stats.wins, stats.losses)}</td></tr>`;
      }).join("")}
    </tbody></table>`;
  }

  const CLAN_COLS = [
    ["rank", "Rang", (row) => row.rank],
    ["tag", "Clan", (row) => String(row.clanTag || "").toLowerCase()],
    ["games", "Parties", (row) => Number(row.games) || 0],
    ["wins", "Victoires", (row) => Number(row.wins) || 0],
    ["losses", "Défaites", (row) => Number(row.losses) || 0],
    ["rate", "% V", (row) => (row.games ? row.wins / row.games : 0)],
    ["sessions", "Sessions", (row) => Number(row.playerSessions) || 0],
    ["stack", "Occup.", (row) => (row.games ? (Number(row.playerSessions) || 0) / row.games : 0)],
    ["ptsWin", "Pts V", (row) => Number(row.weightedWins) || 0],
    ["ptsLoss", "Pts D", (row) => Number(row.weightedLosses) || 0],
    ["solde", "Solde", (row) => (Number(row.weightedWins) || 0) - (Number(row.weightedLosses) || 0)],
    ["avg", "Pts / p.", (row) => (row.games ? ((Number(row.weightedWins) || 0) + (Number(row.weightedLosses) || 0)) / row.games : 0)],
    ["ratio", "Ratio pts", (row) => Number(row.weightedWLRatio) || 0],
  ];
  const CLAN_PAGE = 25;

  function clanDecor(row, index) {
    const games = Number(row.games) || 0;
    const wins = Number(row.wins) || 0;
    return {
      ...row,
      rank: index + 1,
      solde: (Number(row.weightedWins) || 0) - (Number(row.weightedLosses) || 0),
      stack: games ? (Number(row.playerSessions) || 0) / games : 0,
      avg: games ? ((Number(row.weightedWins) || 0) + (Number(row.weightedLosses) || 0)) / games : 0,
      rate: games ? wins / games : 0,
    };
  }

  function clanSpotlight() {
    const all = ((app.clan && app.clan.leaderboard) || []).map(clanDecor);
    if (!all.length) return "";
    const gal = all.find((row) => row.clanTag === TAG) || all[0];
    const pulse = dayPulse();
    return `${heroStats([
        ["Rang GAL", "#" + fmt(gal.rank), "gold"],
        ["Solde", signed(gal.solde), gal.solde >= 0 ? "up" : "down"],
        ["Ratio", pct(gal.wins, gal.losses)],
        ["Parties", fmt(gal.games)],
      ])}
      <div class="stat-grid charts">
        ${chartCard("Parties GAL", fmt(pulse.games), "notre clan, 7 jours", weekSeries((day) => day.games, pulse.games), (v) => fmt(v) + " parties", "parties", shortNum)}
        ${chartCard("Points GAL", "+" + dec(pulse.gained), "victoires seulement", weekSeries((day) => day.gained, pulse.gained), (v) => "+" + dec(v) + " pts", "pts", shortNum)}
        ${chartBox("Solde saison", signed(gal.solde), "top 10 clans", barChart(boardSeries((row) => row.solde, 10, TAG), (v) => signed(v) + " pts", "pts", shortNum), "SAISON")}
        ${chartBox("Parties saison", fmt(gal.games), "", barChart(boardSeries((row) => row.games, 10, TAG), (v) => fmt(v) + " parties", "nb", shortNum), "SAISON")}
        ${chartBox("% victoires", pct(gal.wins, gal.losses), "min. 200 parties", barChart(boardSeries((row) => row.games >= 200 ? row.rate * 100 : 0, 10, TAG), (v) => dec(v, 1) + " %", "%", shortNum), "SAISON")}
        ${chartBox("Occupation", dec(gal.stack, 1), "joueurs du clan / partie", barChart(boardSeries((row) => row.stack, 10, TAG), (v) => dec(v, 1), "j", shortNum), "SAISON")}
      </div>`;
  }

  function clanBoard() {
    const all = ((app.clan && app.clan.leaderboard) || []).map(clanDecor);
    if (!all.length) return `${clanSpotlight()}<p class="empty">${app.clan ? "Classement des clans indisponible." : "Chargement du classement…"}</p>`;
    const state = app.clanBoard;
    const q = String(app.clanQuery || "").trim().toLowerCase();
    const rows = q ? all.filter((row) => String(row.clanTag || "").toLowerCase().includes(q)) : all.slice();
    const col = CLAN_COLS.find((item) => item[0] === state.sort) || CLAN_COLS[0];
    const sign = state.order === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const left = col[2](a);
      const right = col[2](b);
      return (left < right ? -1 : left > right ? 1 : 0) * sign || a.rank - b.rank;
    });
    const pages = Math.max(1, Math.ceil(rows.length / CLAN_PAGE));
    state.page = Math.min(Math.max(0, state.page), pages - 1);
    const start = state.page * CLAN_PAGE;
    const shown = rows.slice(start, start + CLAN_PAGE);
    const season = (app.clan && app.clan.season) || {};
    const span = season.start && season.end ? ` · du ${esc(when(season.start))} au ${esc(when(season.end))}` : "";
    const head = CLAN_COLS.map(([key, label]) => {
      const on = state.sort === key;
      const arrow = on ? (state.order === "asc" ? " ▲" : " ▼") : "";
      return `<th class="${key === "tag" || key === "rank" ? "" : "num "}sortable${on ? " on" : ""}"><button type="button" data-cb-sort="${key}">${esc(label)}${arrow}</button></th>`;
    }).join("");
    const gold = (key) => (state.sort === key ? " gold" : "");
    const body = shown.map((row) => `<tr class="pick ${row.clanTag === TAG ? "gal" : ""}" data-clan-open="${esc(row.clanTag)}">
        <td class="${gold("rank").trim()}">${fmt(row.rank)}</td>
        <td><b class="gold">${esc(row.clanTag)}</b></td>
        <td class="num${gold("games")}">${fmt(row.games)}</td>
        <td class="num up${gold("wins")}">${fmt(row.wins)}</td>
        <td class="num down${gold("losses")}">${fmt(row.losses)}</td>
        <td class="num${gold("rate")}">${pct(row.wins, row.losses)}</td>
        <td class="num${gold("sessions")}">${fmt(row.playerSessions)}</td>
        <td class="num${gold("stack")}">${dec(row.stack, 1)}</td>
        <td class="num up${gold("ptsWin")}">+${dec(row.weightedWins)}</td>
        <td class="num down${gold("ptsLoss")}">${lossPts(row.weightedLosses)}</td>
        <td class="num ${row.solde >= 0 ? "up" : "down"}${gold("solde")}">${signed(row.solde)}</td>
        <td class="num${gold("avg")}">${dec(row.avg)}</td>
        <td class="num${gold("ratio")}">${dec(row.weightedWLRatio)}</td>
      </tr>`).join("");
    const last = Math.min(start + CLAN_PAGE, rows.length);
    return `${q ? "" : clanSpotlight()}<p class="dir-status"><b>${fmt(all.length)}</b> clans classés${span} · demi-vie 30 jours · clique une ligne pour la fiche</p>
      ${rows.length ? `<div class="dir-table"><table class="rank-table clan-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
      <div class="pager">
        <button type="button" data-cb-page="prev" ${state.page <= 0 ? "disabled" : ""}>◀ Préc.</button>
        <span>${fmt(start + 1)}–${fmt(last)} sur ${fmt(rows.length)}</span>
        <button type="button" data-cb-page="next" ${state.page >= pages - 1 ? "disabled" : ""}>Suiv. ▶</button>
      </div>` : `<p class="empty">Aucun clan pour « ${esc(app.clanQuery)} ».</p>`}`;
  }

  function clanCards() {
    const q = String(app.clanQuery || "").trim().toLowerCase();
    const clans = ((app.hub && app.hub.clans) || []).filter((clan) => {
      if (!q) return true;
      return `${clan.tag || ""} ${clan.name || ""} ${clan.promo || ""}`.toLowerCase().includes(q);
    });
    if (!clans.length) return `<p class="empty">Aucun clan. Édite public/hub.json pour en ajouter.</p>`;
    return clans.map((clan) => `<article class="card">
      <h2>${esc(clan.tag)} <span class="muted">${esc(clan.name || "")}</span></h2>
      <p class="sub">${esc(clan.promo || "Pas encore de présentation.")}</p>
      ${clan.discord ? `<p><a href="${esc(clan.discord)}" target="_blank" rel="noopener noreferrer">Discord</a></p>` : ""}
      <h3>Événements</h3>
      ${(clan.events || []).length ? (clan.events || []).map((event) => `<p><b>${esc(event.title)}</b> · ${esc(event.when || "")}<br>${esc(event.detail || "")}</p>`).join("") : `<p class="empty">Aucun événement.</p>`}
      <h3>Campagnes</h3>
      ${(clan.campaigns || []).length ? (clan.campaigns || []).map((row) => `<p><b>${esc(row.title)}</b><br>${esc(row.detail || "")}</p>`).join("") : `<p class="empty">Aucune campagne.</p>`}
    </article>`).join("");
  }

  function rewardCards() {
    const clan = hubClan();
    const rows = dayPlayers().sort((a, b) => (b.gained - b.lost) - (a.gained - a.lost));
    const leader = rows[0];
    const rewards = clan.rewards || [];
    if (!rewards.length) return `<p class="empty">Aucune récompense définie dans hub.json.</p>`;
    return rewards.map((reward) => `<article class="card ${leader ? "winner" : ""}">
      <h2>${esc(reward.title)}</h2>
      <p class="sub">Prix : ${esc(reward.prize || "À définir")}. Calculé sur la fenêtre de dates du tableau.</p>
      ${leader ? `<p class="rank">En tête : <b>${esc(playerLabel(leader))}</b> · solde ${signed(leader.gained - leader.lost)} · ${fmt(leader.wins)} V / ${fmt(leader.losses)} D</p>` : `<p class="empty">Pas encore de joueur GAL sur cette fenêtre.</p>`}
    </article>`).join("");
  }

  function paintHub() {
    const frame = app.root.querySelector("[data-frame]");
    if (!frame) return;
    frame.className = "hub";
    const clan = hubClan();
    if (app.view === "players") {
      frame.innerHTML = `<section class="card" id="annuaire">
        ${panelHead("Joueurs vérifiés", "DIR.OF")}
        <div class="panel-body">
          <div class="dir-search">
            <label class="dir-main"><span>Rechercher</span><input data-dir="q" type="search" placeholder="Pseudo, identifiant ou clan" value="${esc(app.dir.q)}" autocomplete="off" /></label>
            <label class="dir-clan"><span>Clan</span><input data-dir="clan" placeholder="ex. GAL" value="${esc(app.dir.clan)}" autocomplete="off" /></label>
          </div>
          <p class="dir-status" data-dir-status>${dirStatus()}</p>
          <div data-dir-rows>${dirRows()}</div>
        </div>
      </section>`;
      return;
    }
    if (app.view === "clans") {
      const board = frame.querySelector("[data-clan-board]");
      if (board) {
        board.innerHTML = clanBoard();
        return;
      }
      frame.innerHTML = `<section class="card" id="clans">
        ${panelHead("Classement des clans", "RANK.CLANS")}
        <div class="panel-body">
          <div class="dir-search solo">
            <label class="dir-main"><span>Rechercher un clan</span><input data-clan-query type="search" placeholder="Tag du clan, ex. GAL" value="${esc(app.clanQuery)}" autocomplete="off" /></label>
          </div>
          <div data-clan-board>${clanBoard()}</div>
        </div>
      </section>`;
      return;
    }
    if (app.view === "rewards") {
      frame.innerHTML = `<section class="card">
        <h2>Récompenses ${esc(clan.tag)}</h2>
        <p class="sub">Chaque clan définit ses prix. Ici : meilleur solde de la fenêtre → tag Discord.</p>
      </section>${rewardCards()}`;
      return;
    }
    if (app.view === "media") {
      const liveName = app.snap && app.snap.account && (app.snap.account.username || "");
      const streamers = clan.streamers || [];
      const playing = streamers.filter((row) => liveName && String(row.name || "").toLowerCase() === String(liveName).toLowerCase());
      frame.innerHTML = `<section class="card">
        <h2>Streams ${esc(clan.tag)}</h2>
        <p class="sub">Si un joueur du clan stream avec le tag, son Twitch s’affiche ici. Les chaînes se règlent dans public/hub.json.</p>
      </section>
      ${playing.length ? playing.map((row) => `<section class="card winner"><h2>${esc(row.name)} en jeu</h2>${twitchFrame(row.twitch)}</section>`).join("") : ""}
      <div class="hub-grid">${streamers.length ? streamers.map((row) => `<section class="card"><h2>${esc(row.name)}</h2><p class="sub">twitch.tv/${esc(row.twitch)}</p>${twitchFrame(row.twitch)}</section>`).join("") : `<p class="empty">Aucun streamer enregistré.</p>`}</div>
      <section class="card">
        <h2>Vidéos d’équipe</h2>
        <div class="hub-grid">${(clan.videos || []).length ? (clan.videos || []).map((row) => `<div><h3>${esc(row.title)}</h3>${ytFrame(row.youtube)}</div>`).join("") : `<p class="empty">Aucune vidéo YouTube.</p>`}</div>
      </section>`;
      return;
    }
    if (app.view === "tutos") {
      const langs = [...new Set((clan.tutos || []).map((row) => row.lang || "fr"))];
      const rows = (clan.tutos || []).filter((row) => (row.lang || "fr") === app.tutoLang);
      frame.innerHTML = `<section class="card">
        <h2>Tutos ${esc(clan.tag)}</h2>
        <p class="sub">Vidéos YouTube par langue, configurables par clan dans public/hub.json.</p>
        <label>Langue <select data-tuto-lang>${(langs.length ? langs : ["fr", "en"]).map((lang) => `<option value="${esc(lang)}" ${app.tutoLang === lang ? "selected" : ""}>${esc(lang)}</option>`).join("")}</select></label>
      </section>
      <div class="hub-grid">${rows.length ? rows.map((row) => `<section class="card"><h2>${esc(row.title)}</h2>${ytFrame(row.youtube)}</section>`).join("") : `<p class="empty">Aucun tuto pour ${esc(app.tutoLang)}.</p>`}</div>`;
    }
  }

  async function loadHub() {
    try {
      const response = await fetch("api/hub.php", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json();
      if (body && Array.isArray(body.clans)) app.hub = body;
    } catch {
      /* hub optionnel */
    }
    if (app.view !== "board") paintHub();
  }

  setInterval(queueClock, 250);
  shell();
  connect();
  loadHub();
  load(false);
  setInterval(() => load(false), 60000);
  setInterval(() => {
    if (app.view === "players") loadDir();
  }, 30000);
})();
