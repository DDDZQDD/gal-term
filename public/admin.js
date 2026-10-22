(() => {
  const TAG = "GAL";
  const API = /admin\.php$/i.test(location.pathname) ? "api/admin.php" : "/api/admin";
  const MAP_FR = {"Cape Cod":"Cap Cod","Qing China":"Chine de Qing","China":"Chine de Qing","Giant World Map":"Carte du monde géante","Gulf Of Mexico":"Golfe du Mexique","Gulf Of Guinea":"Golfe de Guinée","Black Sea":"Mer Noire","World":"Monde","Pluto":"Pluton","Mars":"Mars","Europe":"Europe","Africa":"Afrique","Pangaea":"Pangée","Bering Sea":"Mer de Béring","Deglaciated Antarctica":"Antarctique Déglacée","Indian Subcontinent":"Sous-continent Indien","Caucasus":"Caucase","Lisbon":"Lisbonne","Four Islands":"Quatre Îles","Juan De Fuca Strait":"Détroit de Juan De Fuca","Mississippi River":"Mississippi","Caspian Sea":"Mer Caspienne"};

  const app = { rolling: true, from: "", to: "", untilNow: false, data: null, error: "" };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
  function fmt(value) {
    return new Intl.NumberFormat("fr-FR").format(Number(value) || 0);
  }
  function dec(value) {
    return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
  }
  function signed(value) {
    const n = Number(value) || 0;
    return (n >= 0 ? "+" : "") + dec(n);
  }
  function when(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "—";
    return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
  }
  function mapName(raw) {
    return MAP_FR[raw] || raw || "Map";
  }
  function modeText(mode, teams) {
    if (mode === "Duos" || mode === "Trios" || mode === "Quads") return mode;
    if (teams) return fmt(teams) + " équipes";
    return String(mode || "Équipes");
  }
  function duration(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return "—";
    const ms = n > 100000 ? n : n * 1000;
    const seconds = Math.round(ms / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m + " min " + String(s).padStart(2, "0") + " s";
  }
  function todayParis() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  }
  function link(id) {
    return "https://openfront.io/game/" + encodeURIComponent(id || "") + "?spectate";
  }

  function paint() {
    const root = document.getElementById("app");
    const data = app.data;
    const players = (data && data.players) || [];
    const games = (data && data.games) || [];
    root.innerHTML = `
      <header class="top">
        <div class="brand"><strong>ADMIN</strong><span>GAL solo équipes</span></div>
        <span class="status">${app.error ? esc(app.error) : data ? fmt(data.total) + " parties" : "Chargement…"}</span>
        <button type="button" class="ghost" data-fresh>Rafraîchir</button>
      </header>
      <main class="admin">
        <section class="card">
          <p class="sub">Joueurs avec le tag GAL dans une partie publique en équipes, sans aucun autre GAL. Un code admin est exigé. La page n’est pas liée depuis le site clan.</p>
          <div class="dates pills">
            <button type="button" data-roll class="${app.rolling ? "on" : ""}">24 h glissantes</button>
            <button type="button" data-now class="${!app.rolling && app.untilNow ? "on" : ""}">Jusqu'à maintenant</button>
            <label>Du <input type="date" data-from value="${esc(app.from)}"></label>
            <label>Au <input type="date" data-to value="${esc(app.to)}"></label>
          </div>
        </section>
        <section class="card">
          <h2>Joueurs ${data ? "· " + fmt(players.length) : ""}</h2>
          ${!players.length ? `<p class="empty">Aucun solo GAL sur cette fenêtre.</p>` : `<table>
            <thead><tr><th>#</th><th>Joueur</th><th class="num">Parties</th><th class="num">V</th><th class="num">D</th><th class="num">Points</th><th>Dernière</th><th>Id</th></tr></thead>
            <tbody>${players.map((row, i) => `<tr>
              <td>${fmt(i + 1)}</td>
              <td><span class="pill leader">${esc(row.name)}</span>${row.verified ? " <span class=\"meta\">vérifié</span>" : ""}</td>
              <td class="num">${fmt(row.games)}</td>
              <td class="num up">${fmt(row.wins)}</td>
              <td class="num down">${fmt(row.losses)}</td>
              <td class="num ${row.points >= 0 ? "up" : "down"}">${signed(row.points)}</td>
              <td>${esc(when(row.last))} · ${esc(mapName(row.lastMap))}</td>
              <td class="meta">${esc(row.publicId || "—")}</td>
            </tr>`).join("")}</tbody>
          </table>`}
        </section>
        <section class="card">
          <h2>Parties ${data ? "· " + fmt(games.length) : ""}</h2>
          ${!games.length ? `<p class="empty">Aucune partie solo GAL.</p>` : games.map((game) => `
            <article class="played">
              <div class="played-line">
                <b class="played-score ${game.won ? "up" : "down"}">${game.won ? "Victoire" : "Défaite"} ${signed(game.score)}</b>
                <time class="played-when">${esc(when(game.start))}</time>
                <div class="played-names"><span class="pill leader">${esc(game.gal)}</span></div>
              </div>
              <p class="meta">${esc(mapName(game.map))}${game.compact ? " · compacte" : ""} · ${esc(modeText(game.mode, game.teams))} · ${fmt(game.teams)} équipes · ${fmt(game.total)} joueurs · ${esc(duration(game.duration))}${game.publicId ? " · id " + esc(game.publicId) : ""}</p>
              <div class="who">${(game.others || []).map((player) => `<span class="pill">${esc(player.name)}${player.clan ? " [" + esc(player.clan) + "]" : ""}</span>`).join("")}</div>
              <a class="watch" href="${link(game.gameId)}" target="_blank" rel="noopener noreferrer">Voir la partie</a>
            </article>`).join("")}
        </section>
      </main>`;
    root.querySelector("[data-fresh]").onclick = () => load(true);
    root.querySelector("[data-roll]").onclick = () => {
      app.rolling = true;
      app.untilNow = false;
      load(true);
    };
    root.querySelector("[data-now]").onclick = () => {
      app.rolling = false;
      app.untilNow = true;
      if (!app.from) app.from = todayParis();
      load(true);
    };
    root.querySelector("[data-from]").onchange = (event) => {
      app.from = event.target.value;
      app.rolling = false;
      if (!app.untilNow && !app.to) app.to = app.from;
      load(true);
    };
    root.querySelector("[data-to]").onchange = (event) => {
      app.to = event.target.value;
      app.rolling = false;
      app.untilNow = false;
      load(true);
    };
  }

  async function load(fresh) {
    const params = new URLSearchParams();
    if (!app.rolling) {
      if (app.from) params.set("from", app.from);
      if (app.untilNow) params.set("now", "1");
      else if (app.to) params.set("to", app.to);
    }
    if (fresh) params.set("fresh", "1");
    try {
      const response = await fetch(API + (params.toString() ? "?" + params.toString() : ""));
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Liste indisponible");
      app.data = body;
      app.error = "";
    } catch (error) {
      app.error = error.message || "Liste indisponible";
    }
    paint();
  }

  paint();
  load(false);
})();
