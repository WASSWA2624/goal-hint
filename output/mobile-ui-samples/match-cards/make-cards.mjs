// Builds index.html: ten compact mobile match-card designs, each shown on a light "Today" phone and a dark "Results" phone.
// Run: node output/mobile-ui-samples/match-cards/make-cards.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/* ---------- sample data ---------- */
// [name, crest colour, letter colour, letter]
const T = {
  ars: ["Arsenal", "#DB0007", "#fff", "A"], che: ["Chelsea", "#034694", "#fff", "C"],
  bet: ["Real Betis", "#0BB363", "#fff", "B"], sev: ["Sevilla", "#fff", "#D7001F", "S"],
  kcc: ["KCCA", "#F4C300", "#14213D", "K"], vip: ["Vipers SC", "#5B2A86", "#fff", "V"],
  int: ["Inter", "#0068A8", "#fff", "I"], mil: ["AC Milan", "#C8102E", "#fff", "M"],
  bmg: ["Borussia Mönchengladbach", "#1A1A1A", "#fff", "B"], sge: ["Eintracht Frankfurt", "#E1000F", "#fff", "E"],
  rcl: ["Lens", "#FFD100", "#C8001A", "L"], los: ["Lille", "#E01E13", "#fff", "L"],
  fey: ["Feyenoord", "#E3000B", "#fff", "F"], az: ["AZ Alkmaar", "#B5001C", "#fff", "A"],
  liv: ["Liverpool", "#C8102E", "#fff", "L"], mci: ["Manchester City", "#6CABDD", "#0B2545", "M"],
  bar: ["Barcelona", "#A50044", "#fff", "B"], gir: ["Girona", "#CE1126", "#fff", "G"],
  boc: ["Boca Juniors", "#103F79", "#F3B229", "B"], riv: ["River Plate", "#fff", "#E30613", "R"],
  exp: ["Express FC", "#D21034", "#fff", "E"], vil: ["SC Villa", "#0047AB", "#fff", "V"],
  nap: ["Napoli", "#12A0D7", "#fff", "N"], rom: ["Roma", "#8E1F2F", "#F0BC42", "R"],
  aja: ["Ajax", "#fff", "#D2122E", "A"], psv: ["PSV", "#ED1C24", "#fff", "P"],
  psg: ["Paris Saint-Germain", "#004170", "#fff", "P"], om: ["Marseille", "#2FAEE0", "#fff", "M"],
};

const today = [
  { lg: "Premier League", fl: "eng", h: T.ars, a: T.che, st: "live", min: "63′", t: "17:00", sc: [1, 0], fam: "mr", sel: "home", pct: 58, odds: "1.72", dist: { home: 58, draw: 24, away: 18 } },
  { lg: "LaLiga", fl: "esp", h: T.bet, a: T.sev, st: "ht", t: "17:30", sc: [1, 1], fam: "tg", sel: "over", pct: 61, dist: { over: 61, under: 39 } },
  { lg: "Uganda Premier League", fl: "uga", h: T.kcc, a: T.vip, st: "up", t: "18:00", fam: "dc", sel: "1X", pct: 80, odds: "1.28", dist: { "1X": 80, X2: 50, 12: 70 } },
  { lg: "Serie A", fl: "ita", h: T.int, a: T.mil, st: "up", t: "19:30", fam: "bt", sel: "yes", pct: 57, dist: { yes: 57, no: 43 }, note: "Limited news coverage" },
  { lg: "Bundesliga", fl: "ger", h: T.bmg, a: T.sge, st: "up", t: "21:00", fam: "mr", sel: "away", pct: 47, dist: { home: 29, draw: 24, away: 47 } },
  { lg: "Ligue 1", fl: "fra", h: T.rcl, a: T.los, st: "up", t: "22:00", nopick: "Awaiting prediction" },
  { lg: "Eredivisie", fl: "ned", h: T.fey, a: T.az, st: "up", t: "22:00", fam: "tg", sel: "under", pct: 55, dist: { over: 45, under: 55 } },
];
const results = [
  { lg: "Premier League", fl: "eng", h: T.liv, a: T.mci, st: "ft", t: "19:30", sc: [2, 1], fam: "mr", sel: "home", pct: 49, odds: "2.05", res: "won", dist: { home: 49, draw: 25, away: 26 } },
  { lg: "LaLiga", fl: "esp", h: T.bar, a: T.gir, st: "ft", t: "20:00", sc: [0, 0], fam: "tg", sel: "over", pct: 68, res: "lost", dist: { over: 68, under: 32 } },
  { lg: "Copa Libertadores", fl: "int", h: T.boc, a: T.riv, st: "aet", t: "20:30", sc: [1, 1], fam: "dc", sel: "1X", pct: 74, res: "won", dist: { "1X": 74, X2: 60, 12: 66 } },
  { lg: "Uganda Premier League", fl: "uga", h: T.exp, a: T.vil, st: "pp", t: "21:00", fam: "mr", sel: "home", pct: 51, res: "void", dist: { home: 51, draw: 27, away: 22 } },
  { lg: "Serie A", fl: "ita", h: T.nap, a: T.rom, st: "ft", t: "21:45", sc: [2, 2], fam: "bt", sel: "yes", pct: 59, res: "won", dist: { yes: 59, no: 41 } },
  { lg: "Eredivisie", fl: "ned", h: T.aja, a: T.psv, st: "ft", t: "21:45", sc: [3, 1], nopick: "No prediction locked" },
  { lg: "Ligue 1", fl: "fra", h: T.psg, a: T.om, st: "ft", t: "22:00", sc: [2, 0], fam: "tg", sel: "under", pct: 54, res: "won", dist: { over: 46, under: 54 } },
];

/* ---------- shared fragments ---------- */
const CODE = { mr: "1X2", dc: "DC", tg: "O/U 2.5", bt: "BTTS" };
const SHORT = {
  mr: { home: "Home win", draw: "Draw", away: "Away win" },
  dc: { "1X": "Home or draw", X2: "Away or draw", 12: "No draw" },
  tg: { over: "Over 2.5", under: "Under 2.5" },
  bt: { yes: "Both score", no: "Not both score" },
};
const BOARD = {
  mr: [["home", "Home"], ["draw", "Draw"], ["away", "Away"]],
  dc: [["1X", "1X"], ["X2", "X2"], ["12", "12"]],
  tg: [["over", "Over"], ["under", "Under"]],
  bt: [["yes", "Yes"], ["no", "No"]],
};
function named(m) {
  const home = m.h[0], away = m.a[0];
  if (m.fam === "mr") return m.sel === "home" ? `${home} win` : m.sel === "away" ? `${away} win` : "Draw";
  if (m.fam === "dc") return m.sel === "1X" ? `${home} or draw` : m.sel === "X2" ? `${away} or draw` : "No draw";
  if (m.fam === "tg") return m.sel === "over" ? "Over 2.5 goals" : "Under 2.5 goals";
  return m.sel === "yes" ? "Both teams score" : "Not both teams score";
}
function sentence(m) {
  const home = m.h[0], away = m.a[0];
  if (m.fam === "mr") return m.sel === "home" ? `${home} to win` : m.sel === "away" ? `${away} to win` : "A draw";
  if (m.fam === "dc") return m.sel === "1X" ? `${home} to win or draw` : m.sel === "X2" ? `${away} to win or draw` : "Either team to win";
  if (m.fam === "tg") return m.sel === "over" ? "Over 2.5 goals" : "Under 2.5 goals";
  return m.sel === "yes" ? "Both teams to score" : "Not both teams to score";
}
const ICON = { won: "check", lost: "x", void: "minus" };
const WORD = { won: "Won", lost: "Lost", void: "Void" };
const icon = (name, cls = "ic") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const res = (m, words = WORD) => m.res ? `<span class="rs rs-${m.res}">${icon(ICON[m.res])}${words[m.res]}</span>` : "";
const odds = (m, prefix = "Odds ") => m.odds ? `<span class="od">${prefix}${m.odds}</span>` : "";
const flag = (m) => m.fl === "int" ? icon("globe", "fl gl") : `<i class="fl f-${m.fl}"></i>`;
const crest = (team) => `<i class="cr" style="--c1:${team[1]};--c2:${team[2]}">${team[3]}</i>`;
const chip = (m) => `<span class="chip">${CODE[m.fam]}</span>`;
const scored = (m) => ["live", "ht", "ft", "aet"].includes(m.st);
const mk = (m) => m.fam ? `m-${m.fam}` : "m-none";
const lost = (m, side) => m.st === "ft" && m.sc[side === "h" ? 0 : 1] < m.sc[side === "h" ? 1 : 0] ? " lo" : "";
const note = (m) => m.note ? `<p class="nt">${icon("info")}${m.note}</p>` : "";
function status(m, { short = false } = {}) {
  if (m.st === "live") return `<span class="st st-live"><i class="dot"></i>${m.min}</span>`;
  if (m.st === "ht") return `<span class="st st-live"><i class="dot"></i>HT</span>`;
  if (m.st === "up") return `<span class="st st-up">${m.t}</span>`;
  if (m.st === "pp") return `<span class="st st-halt">${short ? "Postp." : "Postponed"}</span>`;
  return `<span class="st st-done">${m.st === "aet" ? "AET" : "FT"}</span>`;
}
const score = (m, sep = "–") => scored(m) ? `${m.sc[0]}${sep}${m.sc[1]}` : "";

/* ---------- the ten designs ---------- */
const designs = [];

// 1 · Scoreline Stack
designs.push({
  name: "Scoreline Stack",
  idea: "Reads like a live-score app. Time on the left, teams on their own lines, the pick in its own column.",
  how: ["Each team has its own line with its goals, so most names fit whole.",
    "The pick column holds the pick, its chance and the market colour.",
    "Odds, or the result once settled, sit top right."],
  trade: "The pick column says Home or Away instead of the team name, to stay narrow.",
  card(m) {
    const pick = m.fam
      ? `<span class="p1${m.res === "void" ? " mut" : ""}">${SHORT[m.fam][m.sel]}</span><span class="p2">${chip(m)}<b class="pc">${m.pct}%</b></span>`
      : `<span class="p0"><b>No pick</b>${m.nopick}</span>`;
    return `<article class="c c1 ${mk(m)}">
<span class="c1-st">${status(m, { short: true })}</span>
<span class="c1-lg">${flag(m)}<span class="nm">${m.lg}</span></span>
<span class="c1-ex">${m.res ? res(m) : odds(m)}</span>
<span class="c1-t h${lost(m, "h")}">${crest(m.h)}<span class="nm">${m.h[0]}</span>${scored(m) ? `<b class="g">${m.sc[0]}</b>` : ""}</span>
<span class="c1-t a${lost(m, "a")}">${crest(m.a)}<span class="nm">${m.a[0]}</span>${scored(m) ? `<b class="g">${m.sc[1]}</b>` : ""}</span>
${pick}${note(m)}</article>`;
  },
});

// 2 · Face-off
designs.push({
  name: "Face-off",
  idea: "Today's card, tightened. One face-off line, one pick line, no column captions.",
  how: ["Kickoff time sits where the score will be, then becomes the score.",
    "The live minute, HT or FT sits under the score.",
    "One pick line: market, the pick by team name, chance and result."],
  trade: "Two long team names share one line and get trimmed.",
  card(m) {
    const mid = scored(m)
      ? `<b class="sc">${score(m, " – ")}</b>${status(m)}`
      : m.st === "pp" ? `<b class="vs">v</b>${status(m, { short: true })}` : `<b class="tm">${m.t}</b>`;
    const pick = m.fam
      ? `${chip(m)}<span class="nm pt${m.res === "void" ? " mut" : ""}">${named(m)}</span><b class="pc">${m.pct}%</b>${res(m)}`
      : `<span class="nm mut">No pick · ${m.nopick}</span>`;
    return `<article class="c c2 ${mk(m)}">
<div class="c2-hd">${flag(m)}<span class="nm">${m.lg}</span>${odds(m)}</div>
<div class="c2-vs"><span class="c2-tm h${lost(m, "h")}"><span class="nm">${m.h[0]}</span>${crest(m.h)}</span><span class="c2-mid">${mid}</span><span class="c2-tm a${lost(m, "a")}">${crest(m.a)}<span class="nm">${m.a[0]}</span></span></div>
<div class="c2-pk">${pick}</div>${note(m)}</article>`;
  },
});

// 3 · Chance First
designs.push({
  name: "Chance First",
  idea: "The chance is the first thing you see, in a block coloured by market.",
  how: ["A coloured block on the left holds the chance and the market.",
    "Three slim lines: league and status, teams and score, the pick.",
    "Odds and the result close the pick line."],
  trade: "Team names share one line and may be trimmed.",
  card(m) {
    const block = m.fam ? `<b>${m.pct}%</b><span>${CODE[m.fam]}</span>` : `<b>—</b><span>No pick</span>`;
    const mid = scored(m) ? `<b class="sc">${score(m)}</b>` : `<i class="vs">v</i>`;
    const pick = m.fam
      ? `<span class="nm pt${m.res === "void" ? " mut" : ""}">${named(m)}</span>${odds(m)}${res(m)}`
      : `<span class="nm mut">${m.nopick}</span>`;
    return `<article class="c c3 ${mk(m)}"><div class="c3-b">${block}</div><div class="c3-r">
<div class="c3-l1">${flag(m)}<span class="nm">${m.lg}</span>${status(m)}</div>
<div class="c3-l2"><span class="tn${lost(m, "h")}">${crest(m.h)}<span class="nm">${m.h[0]}</span></span>${mid}<span class="tn${lost(m, "a")}">${crest(m.a)}<span class="nm">${m.a[0]}</span></span></div>
<div class="c3-l3">${pick}</div></div>${note(m)}</article>`;
  },
});

// 4 · Plain Words
designs.push({
  name: "Plain Words",
  idea: "No codes and no boxes. The pick is a short sentence anyone can read.",
  how: ["Teams and score read as one line: Arsenal 1–0 Chelsea.",
    "The pick reads as words: Arsenal to win, 58%.",
    "The result says Correct, Wrong or Void."],
  trade: "No market badge; a small colour square tells markets apart.",
  card(m) {
    const words = { won: "Correct", lost: "Wrong", void: "Void" };
    const teams = `${m.h[0]} ${scored(m) ? `<b class="sc">${score(m)}</b>` : `<i>v</i>`} ${m.a[0]}`;
    const pick = m.fam
      ? `<i class="sq"></i><span class="nm sen${m.res === "void" ? " mut" : ""}"><em>Pick</em> ${sentence(m)} · <b>${m.pct}%</b></span>${res(m, words)}`
      : `<i class="sq"></i><span class="nm sen mut">No pick yet · ${m.nopick}</span>`;
    return `<article class="c c4 ${mk(m)}">
<div class="c4-l1"><span class="nm tms">${teams}</span>${status(m)}</div>
<div class="c4-l2">${flag(m)}<span class="nm">${m.lg}</span>${odds(m)}</div>
<div class="c4-l3">${pick}</div>${note(m)}</article>`;
  },
});

// 5 · Ticket
designs.push({
  name: "Ticket",
  idea: "The match on the left, the pick on a torn-off stub.",
  how: ["A perforated stub holds the market, the chance and the pick.",
    "Once settled, the stub turns green, red or grey and says Won, Lost or Void.",
    "Teams have their own lines, so long names stay whole."],
  trade: "The stub is narrow, so picks say Home or Away.",
  card(m) {
    const top = m.res ? res(m) : m.fam ? `${chip(m)}${m.odds ? `<span class="od">@${m.odds}</span>` : ""}` : "";
    const stub = m.fam
      ? `<span class="s1">${top}</span><b class="pc">${m.pct}%</b><span class="pt">${SHORT[m.fam][m.sel]}</span>`
      : `<span class="s1"></span><b class="pc mut">—</b><span class="pt pw mut">${m.nopick}</span>`;
    return `<article class="c c5 ${mk(m)}${m.res ? ` r-${m.res}` : ""}"><div class="c5-m">
<div class="c5-hd">${flag(m)}<span class="nm">${m.lg}</span>${status(m)}</div>
<div class="c5-t${lost(m, "h")}">${crest(m.h)}<span class="nm">${m.h[0]}</span>${scored(m) ? `<b class="g">${m.sc[0]}</b>` : ""}</div>
<div class="c5-t${lost(m, "a")}">${crest(m.a)}<span class="nm">${m.a[0]}</span>${scored(m) ? `<b class="g">${m.sc[1]}</b>` : ""}</div>
</div><div class="c5-s">${stub}</div>${note(m)}</article>`;
  },
});

// 6 · Fill Bar
designs.push({
  name: "Fill Bar",
  idea: "The pick line doubles as a meter. The fuller the line, the likelier the pick.",
  how: ["League and status on top, the face-off in the middle.",
    "The pick line fills to its chance in the market colour.",
    "Result sits at the end of the pick line."],
  trade: "Two long names share one line and get trimmed.",
  card(m) {
    const mid = scored(m) ? `<b class="sc">${score(m, " – ")}</b>` : `<i class="vs">v</i>`;
    const bar = m.fam
      ? `<div class="c6-bar" style="--p:${m.pct}%"><span class="code">${CODE[m.fam]}</span><span class="nm pt${m.res === "void" ? " mut" : ""}">${named(m)}</span><b>${m.pct}%</b>${res(m)}</div>`
      : `<div class="c6-bar none"><span class="nm mut">No pick · ${m.nopick}</span></div>`;
    return `<article class="c c6 ${mk(m)}">
<div class="c6-hd">${flag(m)}<span class="nm">${m.lg}</span>${odds(m)}${status(m)}</div>
<div class="c6-vs"><span class="h${lost(m, "h")}">${crest(m.h)}<span class="nm">${m.h[0]}</span></span>${mid}<span class="a${lost(m, "a")}"><span class="nm">${m.a[0]}</span>${crest(m.a)}</span></div>
${bar}${note(m)}</article>`;
  },
});

// 7 · Timeline
designs.push({
  name: "Timeline",
  idea: "Matches hang on a time rail, like an agenda. No boxes, just hairlines.",
  how: ["Kickoff time always shows, with the live minute or FT under it.",
    "The dot on the rail shows the state: hollow, live, tick, cross.",
    "Each row: league, teams and score, the pick."],
  trade: "The time rail uses 54 px of width, so names trim a little sooner.",
  wrap: (cards) => `<div class="tl">${cards}</div>`,
  card(m) {
    const dot = m.res ? `<i class="nd nd-${m.res}">${icon(ICON[m.res])}</i>` : `<i class="nd nd-${m.st}"></i>`;
    const sub = m.st === "live" ? `<small class="live">${m.min}</small>` : m.st === "ht" ? `<small class="live">HT</small>`
      : m.st === "pp" ? `<small class="halt">Postp.</small>` : m.st === "up" ? "" : `<small>${m.st === "aet" ? "AET" : "FT"}</small>`;
    const mid = scored(m) ? `<b class="sc">${score(m)}</b>` : `<i class="vs">v</i>`;
    const pick = m.fam
      ? `${chip(m)}<span class="nm pt${m.res === "void" ? " mut" : ""}">${named(m)}</span>${odds(m, "@ ")}<b class="pc">${m.pct}%</b>${res(m)}`
      : `<span class="nm mut">No pick · ${m.nopick}</span>`;
    return `<article class="c7 ${mk(m)}"><div class="c7-tm"><b>${m.t}</b>${sub}</div>${dot}<div class="c7-r">
<div class="c7-l1">${flag(m)}<span class="nm">${m.lg}</span></div>
<div class="c7-l2"><span class="tn${lost(m, "h")}">${crest(m.h)}<span class="nm">${m.h[0]}</span></span>${mid}<span class="tn${lost(m, "a")}">${crest(m.a)}<span class="nm">${m.a[0]}</span></span></div>
<div class="c7-l3">${pick}</div>${note(m)}</div></article>`;
  },
});

// 8 · Pick Header
designs.push({
  name: "Pick Header",
  idea: "The pick leads each card in a coloured band. The match sits under it.",
  how: ["The band shows market, pick and chance in the market colour.",
    "Once settled, Won, Lost or Void closes the band.",
    "Under it: teams and score, then league and odds."],
  trade: "The match comes second in the reading order.",
  card(m) {
    const band = m.fam
      ? `<span class="code">${CODE[m.fam]}</span><span class="nm pt${m.res === "void" ? " mut" : ""}">${named(m)}</span><b>${m.pct}%</b>${res(m)}`
      : `<span class="nm">No pick · ${m.nopick}</span>`;
    const mid = scored(m) ? `<b class="sc">${score(m)}</b>` : `<i class="vs">v</i>`;
    return `<article class="c c8 ${mk(m)}"><div class="c8-band">${band}</div><div class="c8-b">
<div class="c8-l1"><span class="tn${lost(m, "h")}">${crest(m.h)}<span class="nm">${m.h[0]}</span></span>${mid}<span class="tn${lost(m, "a")}">${crest(m.a)}<span class="nm">${m.a[0]}</span></span>${status(m)}</div>
<div class="c8-l2">${flag(m)}<span class="nm">${m.lg}</span>${odds(m)}</div>${note(m)}</div></article>`;
  },
});

// 9 · Two-Up
designs.push({
  name: "Two-Up",
  idea: "Two tiles per row, so about twice as many matches fit on a screen.",
  how: ["Each tile: league and status, both teams with goals, the pick.",
    "The pick sits in its own band at the foot of the tile.",
    "Result or odds sit beside the chance."],
  trade: "Tiles are tall and the reading order zigzags, so scanning by kickoff time is harder.",
  wrap: (cards) => `<div class="g2">${cards}</div>`,
  card(m) {
    const pick = m.fam
      ? `<span class="r1">${chip(m)}<span class="nm${m.res === "void" ? " mut" : ""}">${SHORT[m.fam][m.sel]}</span></span><span class="r2"><b class="pc">${m.pct}%</b>${m.res ? res(m) : odds(m, "@ ")}</span>`
      : `<span class="r1 mut"><b>No pick</b></span><span class="r2"><span class="nm mut">${m.nopick}</span></span>`;
    return `<article class="c c9 ${mk(m)}">
<div class="c9-hd">${flag(m)}<span class="nm">${m.lg}</span>${status(m, { short: true })}</div>
<div class="c9-t${lost(m, "h")}">${crest(m.h)}<span class="nm">${m.h[0]}</span>${scored(m) ? `<b class="g">${m.sc[0]}</b>` : ""}</div>
<div class="c9-t${lost(m, "a")}">${crest(m.a)}<span class="nm">${m.a[0]}</span>${scored(m) ? `<b class="g">${m.sc[1]}</b>` : ""}</div>
<div class="c9-pk">${pick}</div>${m.note ? `<p class="nt">${icon("info")}Limited news</p>` : ""}</article>`;
  },
});

// 10 · Market Board
designs.push({
  name: "Market Board",
  idea: "Shows every outcome with its chance. The pick is the filled box.",
  how: ["Three boxes for 1X2 and double chance, two for goals and both-teams-score.",
    "The filled box is the pick; the others show what else could happen.",
    "Status, odds and the result sit on the league line."],
  trade: "The tallest card here; double chance uses the 1X, X2 and 12 codes.",
  card(m) {
    const mid = scored(m) ? `<b class="sc">${score(m, " – ")}</b>` : m.st === "up" ? `<b class="tm">${m.t}</b>` : `<i class="vs">v</i>`;
    const board = m.fam
      ? `<div class="c10-bd${m.res === "void" ? " void" : ""}" style="--n:${BOARD[m.fam].length}"><span class="code">${CODE[m.fam]}</span>${BOARD[m.fam].map(([key, label]) =>
        `<span class="o${key === m.sel ? " on" : ""}">${label}<b>${m.dist[key]}%</b></span>`).join("")}</div>`
      : `<div class="c10-bd none"><span class="nm">No pick · ${m.nopick}</span></div>`;
    return `<article class="c c10 ${mk(m)}">
<div class="c10-hd">${flag(m)}<span class="nm">${m.lg}</span>${odds(m)}${m.st === "up" ? "" : status(m)}${res(m)}</div>
<div class="c10-vs"><span class="c10-tm h${lost(m, "h")}"><span class="nm">${m.h[0]}</span>${crest(m.h)}</span><span class="c10-mid">${mid}</span><span class="c10-tm a${lost(m, "a")}">${crest(m.a)}<span class="nm">${m.a[0]}</span></span></div>
${board}${note(m)}</article>`;
  },
});

/* ---------- facts, measured in the browser at 320 px: median card height, matches per screen, team names trimmed of 28 ---------- */
const facts = [
  ["64 px", "7", "2"], ["78 px", "5½", "4"], ["64 px", "7", "4"], ["67 px", "6½", "1"], ["64 px", "7", "0"],
  ["80 px", "5½", "3"], ["67 px", "7", "5"], ["69 px", "6½", "3"], ["103 px", "9", "2"], ["80 px", "5½", "4"],
];
const recommended = 5;

/* ---------- page ---------- */
const sb = `<div class="sb"><span>9:41</span><span class="sb-r"><svg width="16" height="10" viewBox="0 0 16 10" fill="currentColor"><rect x="0" y="6.5" width="2.8" height="3.5"/><rect x="4.4" y="4.5" width="2.8" height="5.5"/><rect x="8.8" y="2.3" width="2.8" height="7.7"/><rect x="13.2" y="0" width="2.8" height="10"/></svg><svg width="23" height="11" viewBox="0 0 23 11"><rect x=".5" y=".5" width="19" height="10" rx="2.5" fill="none" stroke="currentColor" opacity=".5"/><rect x="2" y="2" width="14" height="7" rx="1.2" fill="currentColor"/><rect x="20.6" y="3.5" width="1.6" height="4" rx=".8" fill="currentColor" opacity=".5"/></svg></span></div>`;
const ab = `<div class="ab"><span class="brand"><svg class="mark" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11"/><path d="M17.3 8.4A6.2 6.2 0 1 0 18.2 13h-5.6"/></svg>Goal Hint</span><span class="ab-btn">${icon("search", "i")}</span></div>`;
const tb = `<nav class="tb"><span class="on">${icon("ball", "i")}Matches</span><span>${icon("live", "i")}Live</span><span>${icon("results", "i")}Results</span><span>${icon("slip", "i")}Slip builder</span><span>${icon("more", "i")}More</span></nav>`;
function phone(design, list, theme, day, caption) {
  const cards = list.map((m) => design.card(m)).join("");
  return `<figure><div class="device"><div class="screen ${theme}">${sb}${ab}<div class="main"><div class="dh"><b>${day[0]}</b><span>${day[1]}</span><span class="dz">${list.length} matches · EAT</span></div>${design.wrap ? design.wrap(cards) : cards}</div>${tb}</div></div><figcaption>${caption}</figcaption></figure>`;
}
const sections = designs.map((design, index) => {
  const n = index + 1, [height, perScreen, names] = facts[index];
  return `<section class="design" id="d${n}" aria-labelledby="h${n}">
  <div class="info">
    <div class="num"><span>${n}</span>${n === recommended ? `<em class="rec">Recommended</em>` : ""}</div>
    <h2 id="h${n}">${design.name}</h2>
    <p class="idea">${design.idea}</p>
    <ul class="how">${design.how.map((line) => `<li>${line}</li>`).join("")}</ul>
    <dl class="facts"><div><dt>Card height</dt><dd>${height}</dd></div><div><dt>Cards per screen</dt><dd>${perScreen}</dd></div><div><dt>Names trimmed, of 28</dt><dd>${names}</dd></div></dl>
    <p class="trade"><b>Trade-off</b>${design.trade}</p>
  </div>
  <div class="phones">
    ${phone(design, today, "lt", ["Today", "Wed 14 Oct"], "Today · light")}
    ${phone(design, results, "dk", ["Yesterday", "Tue 13 Oct"], "Results · dark")}
  </div>
</section>`;
}).join("\n");

const icons = {
  search: `<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>`,
  ball: `<circle cx="12" cy="12" r="8.5"/><path d="m12 8 3.4 2.5-1.3 4h-4.2l-1.3-4zM12 8V3.5M15.4 10.5l4.2-1.4M14.1 14.5l2.6 3.6M9.9 14.5l-2.6 3.6M8.6 10.5 4.4 9.1"/>`,
  live: `<circle cx="12" cy="12" r="2"/><path d="M8 8a5.7 5.7 0 0 0 0 8M16 8a5.7 5.7 0 0 1 0 8M5.2 5.2a9.6 9.6 0 0 0 0 13.6M18.8 5.2a9.6 9.6 0 0 1 0 13.6"/>`,
  results: `<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.5 2.5 4.5-5"/>`,
  slip: `<path d="M5.5 3.5h13v17l-2.6-1.6-2.2 1.6-2.2-1.6-2.2 1.6-2.2-1.6-1.6 1.6z"/><path d="M9 8.5h6M9 12.5h6"/>`,
  more: `<circle cx="12" cy="5.5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="18.5" r="1"/>`,
  globe: `<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.4 5.2 3.4 8.5s-1 6.1-3.4 8.5M12 3.5C9.6 5.9 8.6 8.7 8.6 12s1 6.1 3.4 8.5"/>`,
  check: `<path d="m5 12.5 4.5 4.5L19 7.5"/>`,
  x: `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`,
  minus: `<path d="M6 12h12"/>`,
  info: `<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.4"/>`,
};
const sprite = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${Object.entries(icons).map(([id, body]) =>
  `<symbol id="i-${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`).join("")}</svg>`;

const light = `--a-page:#CEDBE3;--a-surface:#FFFFFF;--a-soft:#EAF0F2;--a-text:#102A3A;--a-muted:#486071;--a-border:#C5D4DE;--a-brand:#007F7A;--a-brand-ink:#00645F;--a-on-mkt:#FFFFFF;
  --a-head:#102A3A;--a-head-ctl:#1D3B4A;--a-head-text:#FFFFFF;--a-head-accent:#39D5CA;--a-head-line:#102A3A;
  --mr-s:#00824A;--mr-f:#DBF9E7;--mr-t:#00603B;--dc-s:#7C3AED;--dc-f:#EFE9FF;--dc-t:#5B21B6;--tg-s:#2563EB;--tg-f:#E3EDFF;--tg-t:#1E40AF;--bt-s:#C2410C;--bt-f:#FFEADB;--bt-t:#9A3412;
  --ok-t:#007754;--ok-f:#E5F4EC;--ko-t:#9C2328;--ko-f:#FFF0F1;--vd-t:#515C6B;--vd-f:#F0F3F6;--lv-s:#DC2626;--lv-t:#C81E1E;--lv-f:#FEE2E2;--am-t:#92400E;--am-f:#FEF0C7;--ring:rgba(16,42,58,.16)`;
const dark = `--a-page:#141C22;--a-surface:#1E2932;--a-soft:#18232B;--a-text:#F2F7F8;--a-muted:#B1BEC8;--a-border:#3C505E;--a-brand:#53D5C6;--a-brand-ink:#53D5C6;--a-on-mkt:#102A3A;
  --a-head:#10181D;--a-head-ctl:#1B2A34;--a-head-text:#F2F7F8;--a-head-accent:#53D5C6;--a-head-line:#3C505E;
  --mr-s:#70DEA4;--mr-f:#1C342B;--mr-t:#70DEA4;--dc-s:#C6AEFF;--dc-f:#322B45;--dc-t:#C6AEFF;--tg-s:#9EC5FF;--tg-f:#233449;--tg-t:#9EC5FF;--bt-s:#FFBA8F;--bt-f:#3D2D25;--bt-t:#FFBA8F;
  --ok-t:#70DEA4;--ok-f:#1C342B;--ko-t:#FF9C9C;--ko-f:#3B252C;--vd-t:#B1BEC8;--vd-f:#28343D;--lv-s:#FF9C9C;--lv-t:#FF9C9C;--lv-f:#3B252C;--am-t:#F6C453;--am-f:#322A1E;--ring:rgba(242,247,248,.22)`;

const css = `
:root{
  --bg:#E8EEF1;--paper:#F6F9FA;--ink:#102A3A;--muted:#4A6070;--line:#C8D5DD;--accent:#007F7A;--accent-ink:#00645F;--accent-soft:#DDF1EE;--device:#0E1A22;--device-edge:#2A3A45;
  --f-ui:"Manrope",Arial,sans-serif;--f-mono:"IBM Plex Mono",ui-monospace,Consolas,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0E151A;--paper:#141D23;--ink:#E9F0F3;--muted:#A6B5BF;--line:#2B3B46;--accent:#53D5C6;--accent-ink:#53D5C6;--accent-soft:#183C3B;--device:#05090C;--device-edge:#33444F;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0E151A;--paper:#141D23;--ink:#E9F0F3;--muted:#A6B5BF;--line:#2B3B46;--accent:#53D5C6;--accent-ink:#53D5C6;--accent-soft:#183C3B;--device:#05090C;--device-edge:#33444F;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--f-ui);font-size:15px;line-height:1.55;padding-inline:16px}
.wrap{max-width:1160px;margin:0 auto;padding-block:48px 96px}
.eyebrow{font-family:var(--f-mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
h1{font-size:clamp(30px,5.2vw,52px);line-height:1.05;letter-spacing:-.025em;font-weight:800;margin:0 0 14px;text-wrap:balance;max-width:16ch}
.lede{max-width:62ch;color:var(--muted);font-size:16.5px;margin:0 0 28px}
.intro-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-bottom:28px}
.box{background:var(--paper);border:1px solid var(--line);padding:18px 20px}
.box h3{margin:0 0 10px;font-size:12px;font-family:var(--f-mono);font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.covers{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.covers li{font-size:13px;font-weight:600;padding:3px 9px;border:1px solid var(--line);background:var(--bg)}
.rules{margin:0;padding:0 0 0 18px;font-size:14px;color:var(--muted);display:grid;gap:6px}
.rec-box{border-color:var(--accent);background:var(--accent-soft)}
.rec-box p{margin:0;font-size:15px}
.rec-box a{color:var(--accent-ink);font-weight:800}
.index{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border:1px solid var(--line);background:var(--paper);margin:0;padding:0;list-style:none}
.index li{border-right:1px solid var(--line);border-bottom:1px solid var(--line);margin:0 -1px -1px 0}
.index a{display:flex;gap:10px;align-items:baseline;padding:12px 14px;color:var(--ink);text-decoration:none;font-weight:700;font-size:14px}
.index a span{font-family:var(--f-mono);font-weight:500;color:var(--accent-ink);font-size:13px;min-width:1.6em}
.index a:hover{background:var(--accent-soft)}
.index a:focus-visible,.rec-box a:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.design{display:grid;grid-template-columns:minmax(0,290px) minmax(0,1fr);gap:36px;padding-block:52px;border-top:1px solid var(--line);scroll-margin-top:12px}
.design:first-of-type{margin-top:44px}
.num{display:flex;align-items:center;gap:10px;font-family:var(--f-mono);font-size:44px;line-height:1;color:var(--accent-ink);font-weight:500}
.rec{font-style:normal;font-family:var(--f-ui);font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:4px 8px;background:var(--accent);color:var(--paper)}
.design h2{font-size:26px;letter-spacing:-.015em;margin:12px 0 8px;line-height:1.15}
.idea{margin:0 0 16px;font-size:16px;font-weight:600}
.how{margin:0 0 18px;padding:0;list-style:none;display:grid;gap:8px;color:var(--muted);font-size:14.5px}
.how li{padding-left:16px;position:relative}
.how li::before{content:"";position:absolute;left:0;top:.62em;width:6px;height:6px;background:var(--accent)}
.facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:0 0 16px;border:1px solid var(--line);background:var(--paper)}
.facts div{display:flex;flex-direction:column;justify-content:space-between;padding:10px 10px 9px;border-left:1px solid var(--line)}
.facts div:first-child{border-left:0}
.facts dt{font-size:11px;color:var(--muted);line-height:1.25;margin-bottom:4px}
.facts dd{margin:0;font-family:var(--f-mono);font-size:15px;font-weight:500;font-variant-numeric:tabular-nums}
.trade{margin:0;font-size:14px;color:var(--muted)}
.trade b{display:block;color:var(--ink);font-size:12px;font-family:var(--f-mono);font-weight:500;letter-spacing:.06em;text-transform:uppercase;margin-bottom:2px}
.phones{display:flex;flex-wrap:wrap;gap:28px;min-width:0}
figure{margin:0;display:grid;gap:12px;justify-items:center}
figcaption{font-family:var(--f-mono);font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
@media (max-width:1000px){.design{grid-template-columns:minmax(0,1fr);gap:24px}.info{max-width:62ch}.intro-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.rec-box{grid-column:1/-1}}
@media (max-width:760px){.intro-grid{grid-template-columns:minmax(0,1fr)}.index{grid-template-columns:repeat(2,minmax(0,1fr))}.phones{justify-content:center}}

/* ---------- device + app chrome ---------- */
.device{width:336px;padding:8px;background:var(--device);border-radius:46px;box-shadow:inset 0 0 0 1.5px var(--device-edge),0 30px 50px -30px rgba(11,31,51,.55)}
@media (max-width:372px){.device{zoom:.86}}
.screen{position:relative;width:320px;height:680px;border-radius:38px;overflow:hidden;background:var(--a-page);color:var(--a-text);font-family:var(--f-ui);font-size:12px;line-height:1.3;display:flex;flex-direction:column;text-align:left}
.lt{${light}}
.dk{${dark};color-scheme:dark}
.i{width:18px;height:18px;flex:none}
.sb{height:30px;flex:none;display:flex;align-items:flex-end;justify-content:space-between;padding:0 24px 5px 30px;background:var(--a-head);color:var(--a-head-text);font-size:12.5px;font-weight:700}
.sb-r{display:flex;gap:6px;align-items:center}
.ab{height:46px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 10px 0 12px;background:var(--a-head);color:var(--a-head-text);border-bottom:1px solid var(--a-head-line)}
.brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:18px;letter-spacing:-.01em}
.mark{width:24px;height:24px}
.mark circle{fill:var(--a-head-accent)}
.mark path{fill:none;stroke:var(--a-head);stroke-width:2.7;stroke-linecap:round}
.ab-btn{width:34px;height:34px;display:grid;place-items:center;background:var(--a-head-ctl)}
.main{position:relative;flex:1;min-height:0;overflow:hidden;padding:0 8px 8px;display:flex;flex-direction:column;gap:6px}
.tb{flex:none;height:62px;padding-bottom:12px;display:grid;grid-template-columns:repeat(5,1fr);background:var(--a-surface);border-top:1px solid var(--a-border);position:relative}
.tb::after{content:"";position:absolute;left:50%;bottom:5px;width:110px;height:4px;border-radius:2px;background:var(--a-text);opacity:.85;transform:translateX(-50%)}
.tb span{display:grid;justify-items:center;align-content:center;gap:2px;font-size:10px;font-weight:600;color:var(--a-muted);border-top:2px solid transparent;margin-top:-1px}
.tb span.on{color:var(--a-brand-ink);border-top-color:var(--a-brand)}
.tb .i{width:20px;height:20px}
.dh{flex:none;display:flex;align-items:baseline;gap:6px;height:30px;padding-top:9px;font-size:12px;color:var(--a-muted);font-weight:600}
.dh b{color:var(--a-text);font-weight:800;font-size:13px}
.dh .dz{margin-left:auto;font-size:11px}

/* ---------- shared card atoms ---------- */
.m-mr{--ms:var(--mr-s);--mf:var(--mr-f);--mt:var(--mr-t)}
.m-dc{--ms:var(--dc-s);--mf:var(--dc-f);--mt:var(--dc-t)}
.m-tg{--ms:var(--tg-s);--mf:var(--tg-f);--mt:var(--tg-t)}
.m-bt{--ms:var(--bt-s);--mf:var(--bt-f);--mt:var(--bt-t)}
.m-none{--ms:var(--a-border);--mf:var(--a-soft);--mt:var(--a-muted)}
.c{flex:none;position:relative;background:var(--a-surface);border:1px solid var(--a-border);min-width:0}
.nm{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.mut{color:var(--a-muted)!important}
.fl{width:15px;height:10px;flex:none;display:inline-block;box-shadow:inset 0 0 0 1px rgba(0,0,0,.14)}
.fl.gl{width:12px;height:12px;box-shadow:none;color:var(--a-muted)}
.f-eng{background:linear-gradient(90deg,transparent 42%,#CE1124 42% 58%,transparent 58%),linear-gradient(transparent 36%,#CE1124 36% 64%,transparent 64%),#fff}
.f-esp{background:linear-gradient(#AA151B 25%,#F1BF00 25% 75%,#AA151B 75%)}
.f-ita{background:linear-gradient(90deg,#009246 33.3%,#fff 33.3% 66.6%,#CE2B37 66.6%)}
.f-ger{background:linear-gradient(#000 33.3%,#DD0000 33.3% 66.6%,#FFCE00 66.6%)}
.f-fra{background:linear-gradient(90deg,#002395 33.3%,#fff 33.3% 66.6%,#ED2939 66.6%)}
.f-ned{background:linear-gradient(#AE1C28 33.3%,#fff 33.3% 66.6%,#21468B 66.6%)}
.f-uga{background:linear-gradient(#000 16.6%,#FCDC04 16.6% 33.3%,#D90000 33.3% 50%,#000 50% 66.6%,#FCDC04 66.6% 83.3%,#D90000 83.3%)}
.cr{flex:none;display:inline-grid;place-items:center;width:16px;height:16px;border-radius:50%;background:var(--c1);color:var(--c2);font-style:normal;font-size:8.5px;font-weight:800;line-height:1;box-shadow:inset 0 0 0 1px var(--ring)}
.chip{flex:none;display:inline-block;padding:1px 4px;background:var(--mf);color:var(--mt);font-size:10px;font-weight:800;line-height:1.4;white-space:nowrap}
.st{flex:none;display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums}
.st-up{color:var(--a-text)}
.st-live{color:var(--lv-t)}
.st-done{color:var(--a-muted)}
.st-halt{color:var(--am-t);font-weight:700}
.dot{width:6px;height:6px;border-radius:50%;background:var(--lv-s);box-shadow:0 0 0 2px var(--lv-f)}
.od{flex:none;font-size:10.5px;font-weight:600;color:var(--a-muted);white-space:nowrap;font-variant-numeric:tabular-nums}
.rs{flex:none;display:inline-flex;align-items:center;gap:2px;padding:1px 5px 1px 3px;font-size:10.5px;font-weight:800;line-height:1.35;white-space:nowrap}
.rs .ic{width:11px;height:11px}
.rs-won{color:var(--ok-t);background:var(--ok-f)}
.rs-lost{color:var(--ko-t);background:var(--ko-f)}
.rs-void{color:var(--vd-t);background:var(--vd-f)}
.nt{grid-column:1/-1;display:flex;align-items:center;gap:4px;margin:0;padding:2px 8px;font-size:10.5px;font-weight:700;color:var(--am-t);background:var(--am-f)}
.nt .ic{width:11px;height:11px;flex:none}
.lo{color:var(--a-muted)}
.lo .nm{font-weight:600}
.pc{font-weight:800;font-variant-numeric:tabular-nums}

/* one-line team rows: home keeps up to half, away takes the rest */
.tn{flex:0 1 auto}
.tn:first-child{flex:none;max-width:calc(50% - 18px)}

/* 1 · Scoreline Stack */
.c1{display:grid;grid-template-columns:40px minmax(0,1fr) 96px;grid-template-areas:". lg ex" "st h p1" "st a p2";align-items:center;padding:5px 8px 5px 0}
.c1>.nt{margin:4px -8px -5px 0}
.c1-st{grid-area:st;justify-self:center}
.c1-st .st{flex-direction:column;gap:2px;font-size:11.5px}
.c1-st .st-halt{font-size:10px}
.c1-lg{grid-area:lg;display:flex;align-items:center;gap:5px;height:15px;font-size:11px;font-weight:600;color:var(--a-muted)}
.c1-ex{grid-area:ex;justify-self:end;display:flex}
.c1-t{display:flex;align-items:center;gap:6px;height:18px;padding-right:9px;font-size:12.5px;font-weight:700}
.c1-t.h{grid-area:h;margin-top:2px}
.c1-t.a{grid-area:a}
.c1-t .nm{flex:1}
.c1-t .g{font-size:13px;font-weight:800;font-variant-numeric:tabular-nums}
.c1 .p1,.c1 .p2,.c1 .p0{align-self:stretch;display:flex;align-items:center;border-left:1px solid var(--a-border);padding-left:9px;min-width:0}
.c1 .p1{grid-area:p1;margin-top:2px;font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.c1 .p2{grid-area:p2;justify-content:space-between;gap:4px}
.c1 .pc{font-size:13px}
.c1 .p0{grid-row:2/4;grid-column:3;margin-top:2px;flex-direction:column;align-items:flex-start;justify-content:center;font-size:10.5px;line-height:1.25;color:var(--a-muted)}
.c1 .p0 b{font-size:11.5px;color:var(--a-text)}

/* 2 · Face-off */
.c2{padding:5px 8px 0}
.c2>.nt{margin:0 -8px}
.c2-hd{display:flex;align-items:center;gap:5px;height:15px;font-size:11px;font-weight:600;color:var(--a-muted)}
.c2-hd .nm{flex:1}
.c2-vs{display:grid;grid-template-columns:minmax(0,1fr) 58px minmax(0,1fr);align-items:center;height:32px}
.c2-tm{display:flex;align-items:center;gap:6px;min-width:0;font-size:12.5px;font-weight:700}
.c2-tm.h{justify-content:flex-end}
.c2-mid{display:grid;justify-items:center;gap:1px;line-height:1.1}
.c2-mid .sc{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
.c2-mid .tm{font-size:13.5px;font-weight:800;font-variant-numeric:tabular-nums}
.c2-mid .vs{font-size:12px;color:var(--a-muted)}
.c2-mid .st{font-size:10px}
.c2-mid .dot{width:5px;height:5px}
.c2-pk{display:flex;align-items:center;gap:6px;height:25px;margin:0 -8px;padding:0 8px;border-top:1px solid var(--a-border)}
.c2-pk .pt{flex:1;font-size:12px;font-weight:700}
.c2-pk .pc{font-size:13px}

/* 3 · Chance First */
.c3{display:grid;grid-template-columns:52px minmax(0,1fr)}
.c3-b{display:grid;align-content:center;justify-items:center;gap:2px;background:var(--mf);color:var(--mt)}
.c3-b b{font-size:17px;font-weight:800;letter-spacing:-.02em;line-height:1;font-variant-numeric:tabular-nums}
.c3-b span{font-size:10px;font-weight:800;line-height:1}
.c3-r{display:grid;grid-template-columns:minmax(0,1fr);gap:2px;padding:5px 8px;min-width:0}
.c3-l1{display:flex;align-items:center;gap:5px;height:15px;font-size:11px;font-weight:600;color:var(--a-muted)}
.c3-l1 .nm{flex:1}
.c3-l2{display:flex;align-items:center;gap:6px;height:18px;font-size:12.5px;font-weight:700}
.c3-l2 .tn{display:flex;align-items:center;gap:5px;min-width:0}
.c3-l2 .sc{flex:none;padding:0 5px;background:var(--a-soft);font-size:12.5px;font-weight:800;font-variant-numeric:tabular-nums}
.c3-l2 .vs{flex:none;font-style:normal;color:var(--a-muted);font-weight:600;font-size:11.5px}
.c3-l3{display:flex;align-items:center;gap:6px;height:16px;font-size:12px}
.c3-l3 .pt{flex:1;font-weight:800;color:var(--mt)}
.c3>.nt{grid-column:1/-1}

/* 4 · Plain Words */
.c4{display:grid;grid-template-columns:minmax(0,1fr);gap:1px;padding:5px 10px 5px}
.c4>.nt{margin:3px -10px -5px}
.c4-l1{display:flex;align-items:center;gap:8px;height:18px;font-size:13px;font-weight:800}
.c4-l1 .tms{flex:1}
.c4-l1 .tms i{font-style:normal;font-weight:600;color:var(--a-muted);font-size:12px}
.c4-l1 .sc{padding:0 3px;font-variant-numeric:tabular-nums}
.c4-l2{display:flex;align-items:center;gap:5px;height:15px;font-size:11px;font-weight:600;color:var(--a-muted)}
.c4-l2 .nm{flex:1}
.c4-l3{display:flex;align-items:center;gap:7px;height:19px;margin-top:2px;padding-top:3px;border-top:1px dotted var(--a-border);font-size:12px}
.c4-l3 .sq{flex:none;width:8px;height:8px;background:var(--ms)}
.c4-l3 .sen{flex:1;font-weight:700}
.c4-l3 .sen em{font-style:normal;font-weight:600;color:var(--a-muted);margin-right:2px}
.c4-l3 .sen b{font-weight:800}

/* 5 · Ticket */
.c5{display:grid;grid-template-columns:minmax(0,1fr) 84px;overflow:hidden;--stub:var(--mf)}
.c5.r-won{--stub:var(--ok-f)}.c5.r-lost{--stub:var(--ko-f)}.c5.r-void{--stub:var(--vd-f)}
.c5-m{display:grid;grid-template-columns:minmax(0,1fr);gap:1px;padding:5px 10px 5px 8px;min-width:0}
.c5-hd{display:flex;align-items:center;gap:5px;height:15px;font-size:11px;font-weight:600;color:var(--a-muted)}
.c5-hd .nm{flex:1}
.c5-t{display:flex;align-items:center;gap:6px;height:18px;font-size:12.5px;font-weight:700}
.c5-t .nm{flex:1}
.c5-t .g{font-size:13px;font-weight:800;font-variant-numeric:tabular-nums}
.c5-s{position:relative;display:grid;align-content:center;justify-items:center;gap:2px;padding:5px 4px;background:var(--stub);border-left:1.5px dashed color-mix(in srgb,var(--a-muted) 55%,transparent);text-align:center;min-width:0}
.c5-s::before,.c5-s::after{content:"";position:absolute;left:-7px;width:12px;height:12px;border-radius:50%;background:var(--a-page);box-shadow:inset 0 0 0 1px var(--a-border)}
.c5-s::before{top:-7px}.c5-s::after{bottom:-7px}
.c5-s .s1{display:flex;align-items:center;gap:4px;min-height:15px}
.c5-s .rs{background:var(--a-surface)}
.c5-s .pc{font-size:17px;line-height:1;color:var(--a-text)}
.c5-s .pt{max-width:100%;font-size:10.5px;font-weight:800;color:var(--a-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.c5-s .pw{white-space:normal;line-height:1.2;font-weight:600}
.c5>.nt{grid-column:1/-1}

/* 6 · Fill Bar */
.c6{display:grid;grid-template-columns:minmax(0,1fr);gap:2px;padding:5px 8px 7px}
.c6>.nt{margin:4px -8px -7px}
.c6-hd{display:flex;align-items:center;gap:5px;height:15px;font-size:11px;font-weight:600;color:var(--a-muted)}
.c6-hd .nm{flex:1}
.c6-hd .od{margin-right:4px}
.c6-vs{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:8px;align-items:center;height:23px;font-size:12.5px;font-weight:700}
.c6-vs .h,.c6-vs .a{display:flex;align-items:center;gap:6px;min-width:0}
.c6-vs .a{justify-content:flex-end}
.c6-vs .sc{font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
.c6-vs .vs{font-style:normal;color:var(--a-muted);font-weight:600}
.c6-bar{position:relative;display:flex;align-items:center;gap:6px;height:25px;padding:0 6px 3px 8px;background:var(--mf);font-size:12px}
.c6-bar::before{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:color-mix(in srgb,var(--ms) 22%,transparent)}
.c6-bar::after{content:"";position:absolute;left:0;bottom:0;height:3px;width:var(--p,0);background:var(--ms)}
.c6-bar .code{flex:none;font-size:10px;font-weight:800;color:var(--mt)}
.c6-bar .pt{flex:1;font-weight:700}
.c6-bar>b{font-size:13px;font-weight:800;color:var(--mt);font-variant-numeric:tabular-nums}
.c6-bar.none{padding-bottom:0}

/* 7 · Timeline */
.tl{flex:none;background:var(--a-surface);border:1px solid var(--a-border)}
.c7{position:relative;display:grid;grid-template-columns:54px minmax(0,1fr)}
.c7::before{content:"";position:absolute;left:53px;top:0;bottom:0;width:1px;background:var(--a-border)}
.c7-tm{display:grid;align-content:start;justify-items:end;gap:1px;padding:6px 12px 0 0;font-variant-numeric:tabular-nums}
.c7-tm b{font-size:12px;font-weight:800}
.c7-tm small{font-size:10.5px;font-weight:800;color:var(--a-muted)}
.c7-tm small.live{color:var(--lv-t)}
.c7-tm small.halt{color:var(--am-t);font-weight:700}
.nd{position:absolute;left:49px;top:9px;width:9px;height:9px;border-radius:50%;background:var(--a-surface);box-shadow:inset 0 0 0 1.5px var(--a-muted);display:grid;place-items:center}
.nd-live,.nd-ht{background:var(--lv-s);box-shadow:0 0 0 3px var(--lv-f)}
.nd-ft,.nd-aet{background:var(--a-muted);box-shadow:none}
.nd-pp{box-shadow:inset 0 0 0 1.5px var(--am-t)}
.nd-won,.nd-lost,.nd-void{left:47px;top:7px;width:13px;height:13px;box-shadow:none;color:var(--a-surface)}
.nd-won{background:var(--ok-t)}.nd-lost{background:var(--ko-t)}.nd-void{background:var(--vd-t)}
.nd .ic{width:9px;height:9px;stroke-width:3.2}
.c7-r{display:grid;grid-template-columns:minmax(0,1fr);gap:3px;padding:5px 8px 6px 12px;min-width:0;border-bottom:1px solid var(--a-border)}
.c7:last-child .c7-r{border-bottom:0}
.c7-r>.nt{margin:2px 0 0;padding:2px 6px}
.c7-l1{display:flex;align-items:center;gap:5px;height:14px;font-size:11px;font-weight:600;color:var(--a-muted)}
.c7-l2{display:flex;align-items:center;gap:6px;height:18px;font-size:12.5px;font-weight:700}
.c7-l2 .tn{display:flex;align-items:center;gap:5px;min-width:0}
.c7-l2 .sc{flex:none;font-size:13px;font-weight:800;font-variant-numeric:tabular-nums}
.c7-l2 .vs{flex:none;font-style:normal;color:var(--a-muted);font-weight:600;font-size:11.5px}
.c7-l3{display:flex;align-items:center;gap:6px;height:17px;font-size:12px}
.c7-l3 .pt{flex:1;font-weight:700}
.c7-l3 .pc{font-size:12.5px}

/* 8 · Pick Header */
.c8-band{display:flex;align-items:center;gap:6px;height:24px;padding:0 6px 0 8px;background:var(--mf);color:var(--mt);font-size:12px}
.c8-band .code{flex:none;padding-right:6px;font-size:10px;font-weight:800;border-right:1px solid color-mix(in srgb,var(--mt) 35%,transparent);line-height:1.3}
.c8-band .pt{flex:1;font-weight:800;color:var(--a-text)}
.c8-band>b{font-size:13px;font-weight:800;font-variant-numeric:tabular-nums}
.c8-band .rs{background:var(--a-surface)}
.m-none .c8-band{color:var(--a-muted);font-weight:600}
.c8-b{display:grid;grid-template-columns:minmax(0,1fr);gap:1px;padding:4px 8px 5px}
.c8-b>.nt{margin:3px -8px -5px}
.c8-l1{display:flex;align-items:center;gap:6px;height:19px;font-size:12.5px;font-weight:700}
.c8-l1 .tn{display:flex;align-items:center;gap:5px;min-width:0}
.c8-l1 .sc{flex:none;font-size:13px;font-weight:800;font-variant-numeric:tabular-nums}
.c8-l1 .vs{flex:none;font-style:normal;color:var(--a-muted);font-weight:600;font-size:11.5px}
.c8-l1 .st{margin-left:auto;padding-left:6px}
.c8-l2{display:flex;align-items:center;gap:5px;height:15px;font-size:11px;font-weight:600;color:var(--a-muted)}
.c8-l2 .nm{flex:1}

/* 9 · Two-Up */
.g2{flex:none;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.c9{display:grid;grid-template-columns:minmax(0,1fr);align-content:start;padding:5px 7px 0;min-width:0}
.c9-hd{display:flex;align-items:center;gap:4px;height:15px;margin-bottom:2px;font-size:10.5px;font-weight:600;color:var(--a-muted)}
.c9-hd .nm{flex:1}
.c9-hd .st{font-size:10.5px}
.c9-t{display:flex;align-items:center;gap:5px;height:18px;font-size:12px;font-weight:700}
.c9-t .nm{flex:1}
.c9-t .g{font-size:12.5px;font-weight:800;font-variant-numeric:tabular-nums}
.c9-pk{display:grid;gap:0;margin:3px -7px 0;padding:3px 7px 4px;border-top:1px solid var(--a-border);min-width:0}
.c9-pk .r1{display:flex;align-items:center;gap:5px;height:16px;font-size:11.5px;font-weight:800;min-width:0}
.c9-pk .r2{display:flex;align-items:center;justify-content:space-between;gap:4px;height:17px;min-width:0}
.c9-pk .r2 .nm{font-size:10.5px}
.c9-pk .pc{font-size:13px}
.c9>.nt{margin:0 -7px;padding:2px 7px}

/* 10 · Market Board */
.c10{display:grid;grid-template-columns:minmax(0,1fr);gap:2px;padding:5px 8px 7px}
.c10>.nt{margin:4px -8px -7px}
.c10-hd{display:flex;align-items:center;gap:6px;height:15px;font-size:11px;font-weight:600;color:var(--a-muted)}
.c10-hd .nm{flex:1}
.c10-vs{display:grid;grid-template-columns:minmax(0,1fr) 54px minmax(0,1fr);align-items:center;height:24px}
.c10-tm{display:flex;align-items:center;gap:6px;min-width:0;font-size:12.5px;font-weight:700}
.c10-tm.h{justify-content:flex-end}
.c10-mid{display:grid;justify-items:center}
.c10-mid .sc{font-size:14.5px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
.c10-mid .tm{font-size:13px;font-weight:800;font-variant-numeric:tabular-nums}
.c10-mid .vs{font-style:normal;color:var(--a-muted);font-weight:600}
.c10-bd{display:grid;grid-template-columns:auto repeat(var(--n),minmax(0,1fr));gap:3px;height:24px}
.c10-bd .code{display:grid;place-items:center;padding:0 6px;background:var(--mf);color:var(--mt);font-size:10px;font-weight:800;white-space:nowrap}
.c10-bd .o{display:flex;align-items:center;justify-content:space-between;gap:4px;padding:0 7px;background:var(--a-soft);color:var(--a-muted);font-size:11px;font-weight:600;white-space:nowrap}
.c10-bd .o b{color:var(--a-text);font-size:12px;font-weight:800;font-variant-numeric:tabular-nums}
.c10-bd .o.on{background:var(--ms);color:var(--a-on-mkt);font-weight:700}
.c10-bd .o.on b{color:inherit}
.c10-bd.void .o.on{background:var(--a-soft);color:var(--a-muted);box-shadow:inset 0 0 0 1.5px var(--a-muted)}
.c10-bd.void .o.on b{color:var(--a-muted)}
.c10-bd.none{display:flex;align-items:center;padding:0 8px;background:var(--a-soft);color:var(--a-muted);font-size:11.5px;font-weight:600}
`;

const covers = ["League and flag", "Kickoff time", "Live minute, HT, FT", "Postponed and other states", "Teams and crests", "Score", "Market", "Pick", "Chance", "Odds, when imported", "Won, Lost or Void", "Why there is no pick", "Notes such as limited news"];
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Goal Hint Match Cards</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=Manrope:wght@400;500;600;700;800&display=swap">
<style>${css}</style>
</head>
<body>
${sprite}
<div class="wrap">
  <header>
    <p class="eyebrow">Goal Hint · Matches feed · Phone width 320 px</p>
    <h1>Mobile match cards, ten ways</h1>
    <p class="lede">Ten compact designs for the match card on phones. Each design shows the same 14 matches: today's list in light mode and yesterday's results in dark mode, so you can see every state. All ten keep the brand's square corners and market colours. Pick one by number and I will build it.</p>
    <div class="intro-grid">
      <div class="box"><h3>Every card shows</h3><ul class="covers">${covers.map((item) => `<li>${item}</li>`).join("")}</ul></div>
      <div class="box"><h3>Shared rules</h3><ul class="rules"><li>One day header carries the date and time zone, so cards show only the time.</li><li>Won, Lost or Void appears only once the pick is settled.</li><li>A settled score is the 90-minute score; AET or Pens says more was played.</li><li>The whole card opens the match details.</li></ul></div>
      <div class="box rec-box"><h3>My pick</h3><p><a href="#d5">5 · Ticket.</a> The pick has its own stub: a big chance, a plain pick, and green or red once settled. Teams get their own lines, so no name in the sample was trimmed, and 7 cards fit per screen. Runner-up: <a href="#d1">1 · Scoreline Stack</a>, the familiar live-score layout.</p></div>
    </div>
    <ol class="index">${designs.map((design, index) => `<li><a href="#d${index + 1}"><span>${index + 1}</span>${design.name}</a></li>`).join("")}</ol>
  </header>
  <main>
${sections}
  </main>
</div>
</body>
</html>
`;
writeFileSync(join(here, "index.html"), html);
console.log(`Wrote ${join(here, "index.html")} (${(html.length / 1024).toFixed(1)} KB)`);
