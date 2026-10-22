"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "public");
const OUT = path.join(__dirname, "ovh");

const LIVE = `  async function pullLive() {
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

`;

const SAME = `{ credentials: "same-origin", cache: "no-store" }`;

const SWAPS = [
  [`fetch("/api/player/" + encodeURIComponent(publicId))`, `fetch("api/player.php?id=" + encodeURIComponent(publicId), ${SAME})`],
  [`fetch("/api/clan" + (params.toString() ? "?" + params.toString() : ""), { cache: "no-store" })`, `fetch("api/clan.php" + (params.toString() ? "?" + params.toString() : ""), ${SAME})`],
  [`fetch("/api/quarter" + (fresh ? "?fresh=1" : ""), { cache: "no-store" })`, `fetch("api/snap.php?name=quarter", ${SAME})`],
  [`fetch("/api/week" + (fresh ? "?fresh=1" : ""), { cache: "no-store" })`, `fetch("api/snap.php?name=week", ${SAME})`],
  [`fetch("/api/ranks", { cache: "no-store" })`, `fetch("api/snap.php?name=ranks", ${SAME})`],
  [`fetch("/api/players?" + params.toString(), { cache: "no-store" })`, `fetch("api/players.php?" + params.toString(), ${SAME})`],
  [`fetch("/api/hub", { cache: "no-store" })`, `fetch("api/hub.php", ${SAME})`],
];

function swap(text, from, to) {
  if (!text.includes(from)) throw new Error("Introuvable dans deck.js : " + from.slice(0, 80));
  return text.split(from).join(to);
}

let deck = fs.readFileSync(path.join(SRC, "deck.js"), "utf8");
for (const [from, to] of SWAPS) deck = swap(deck, from, to);
const start = deck.indexOf("  function connect() {");
const end = deck.indexOf("  function hubClan() {");
if (start < 0 || end < start) throw new Error("Bloc connect() introuvable dans deck.js");
deck = deck.slice(0, start) + LIVE + deck.slice(end);
if (/"\/api\/|new WebSocket/.test(deck)) throw new Error("Il reste un appel local dans deck.js");
fs.writeFileSync(path.join(OUT, "deck.js"), deck);

for (const name of ["deck.css", "skins.css"]) fs.copyFileSync(path.join(SRC, name), path.join(OUT, name));
fs.writeFileSync(path.join(OUT, "retro.css"), fs.readFileSync(path.join(SRC, "retro.css"), "utf8").split('url("/fonts/').join('url("fonts/'));
fs.mkdirSync(path.join(OUT, "fonts"), { recursive: true });
for (const name of fs.readdirSync(path.join(SRC, "fonts"))) fs.copyFileSync(path.join(SRC, "fonts", name), path.join(OUT, "fonts", name));
fs.copyFileSync(path.join(SRC, "hub.json"), path.join(OUT, "cache", "hub.json"));

let index = fs.readFileSync(path.join(OUT, "index.php"), "utf8");
for (const name of ["deck.css", "skins.css", "retro.css", "deck.js"]) {
  const version = crypto.createHash("sha1").update(fs.readFileSync(path.join(OUT, name))).digest("hex").slice(0, 10);
  index = index.replace(new RegExp(`(href|src)="${name.replace(".", "\\.")}(\\?v=[0-9a-f]+)?"`), `$1="${name}?v=${version}"`);
}
fs.writeFileSync(path.join(OUT, "index.php"), index);

console.log("ovh prêt");
