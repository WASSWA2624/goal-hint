// Builds ticket.html: the chosen Ticket card (design 5) with the requested changes, drawn on a full phone feed in light and dark.
// Run: node output/mobile-ui-samples/match-cards/make-ticket.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// [name, crest colour, letter colour, letter]
const T = {
  kcc: ["KCCA", "#F4C300", "#14213D", "K"], vip: ["Vipers SC", "#5B2A86", "#fff", "V"],
  liv: ["Liverpool", "#C8102E", "#fff", "L"], mci: ["Manchester City", "#6CABDD", "#0B2545", "M"],
  boc: ["Boca Juniors", "#103F79", "#F3B229", "B"], riv: ["River Plate", "#fff", "#E30613", "R"],
  exp: ["Express FC", "#D21034", "#fff", "E"], vil: ["SC Villa", "#0047AB", "#fff", "V"],
  bar: ["Barcelona", "#A50044", "#fff", "B"], gir: ["Girona", "#CE1126", "#fff", "G"],
  ars: ["Arsenal", "#DB0007", "#fff", "A"], che: ["Chelsea", "#034694", "#fff", "C"],
  bet: ["Real Betis", "#0BB363", "#fff", "B"], sev: ["Sevilla", "#fff", "#D7001F", "S"],
  int: ["Inter", "#0068A8", "#fff", "I"], mil: ["AC Milan", "#C8102E", "#fff", "M"],
  bmg: ["Borussia Mönchengladbach", "#1A1A1A", "#fff", "B"], sge: ["Eintracht Frankfurt", "#E1000F", "#fff", "E"],
  rcl: ["Lens", "#FFD100", "#C8001A", "L"], los: ["Lille", "#E01E13", "#fff", "L"],
};
// One day, earliest first: every state the card must handle.
const matches = [
  { lg: "Uganda Premier League", fl: "uga", h: T.kcc, a: T.vip, t: "13:00", st: "ft", sc: [2, 0], fam: "dc", pick: "Home or draw", pct: 80, res: "won" },
  { lg: "LaLiga", fl: "esp", h: T.bar, a: T.gir, t: "14:00", st: "ft", sc: [0, 0], fam: "tg", pick: "Over 2.5", pct: 68, res: "lost" },
  { lg: "Copa Libertadores", fl: "int", h: T.boc, a: T.riv, t: "14:30", st: "aet", sc: [1, 1], fam: "dc", pick: "Home or draw", pct: 74, res: "won" },
  { lg: "Uganda Premier League", fl: "uga", h: T.exp, a: T.vil, t: "15:00", st: "pp", fam: "mr", pick: "Home win", pct: 51, res: "void" },
  { lg: "Premier League", fl: "eng", h: T.ars, a: T.che, t: "17:00", st: "live", min: "63′", sc: [1, 0], fam: "mr", pick: "Home win", pct: 58, odds: "1.72" },
  { lg: "LaLiga", fl: "esp", h: T.bet, a: T.sev, t: "17:30", st: "ht", sc: [1, 1], fam: "tg", pick: "Over 2.5", pct: 61 },
  { lg: "Premier League", fl: "eng", h: T.liv, a: T.mci, t: "19:30", st: "up", fam: "bt", pick: "Both score", pct: 57, note: "Limited news coverage" },
  { lg: "Bundesliga", fl: "ger", h: T.bmg, a: T.sge, t: "21:00", st: "up", fam: "mr", pick: "Away win", pct: 47 },
  { lg: "Ligue 1", fl: "fra", h: T.rcl, a: T.los, t: "22:00", st: "up", nopick: "Awaiting" },
];

const CODE = { mr: "1X2", dc: "DC", tg: "O/U 2.5", bt: "BTTS" };
const ICON = { won: "check", lost: "x", void: "minus" };
const WORD = { won: "Won", lost: "Lost", void: "Void" };
const icon = (name, cls = "ic") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const flag = (m) => m.fl === "int" ? icon("globe", "fl gl") : `<i class="fl f-${m.fl}"></i>`;
const crest = (team) => `<i class="cr" style="--c1:${team[1]};--c2:${team[2]}">${team[3]}</i>`;
const scored = (m) => ["live", "ht", "ft", "aet"].includes(m.st);
const lost = (m, side) => m.st === "ft" && m.sc[side] < m.sc[1 - side] ? " lo" : "";
function status(m) {
  if (m.st === "live") return `<span class="pill p-live"><i class="dot"></i>${m.min}</span>`;
  if (m.st === "ht") return `<span class="pill p-live"><i class="dot"></i>HT</span>`;
  if (m.st === "ft") return `<span class="pill p-done">FT</span>`;
  if (m.st === "aet") return `<span class="pill p-done" title="Score after 90 minutes">AET</span>`;
  if (m.st === "pp") return `<span class="pill p-halt">Postponed</span>`;
  return "";
}

function card(m) {
  const live = m.st === "live" || m.st === "ht";
  const score = scored(m)
    ? `<span class="sb${live ? " sb-live" : ""}"><b class="${lost(m, 0) ? "lo" : ""}">${m.sc[0]}</b><b class="${lost(m, 1) ? "lo" : ""}">${m.sc[1]}</b></span>` : "";
  const stub = m.fam
    ? `<span class="s1">${m.res ? `<span class="rs rs-${m.res}">${icon(ICON[m.res])}${WORD[m.res]}</span>` : `<span class="chip">${CODE[m.fam]}</span>`}<b class="pc">${m.pct}%</b></span><span class="pt">${m.pick}</span>`
    : `<span class="s1"><b class="np">No pick</b></span><span class="pt mut">${m.nopick}</span>`;
  return `<article class="tk m-${m.fam ?? "none"}${m.res ? ` r-${m.res}` : ""}">
<header class="tk-hd">${flag(m)}<span class="nm lg">${m.lg}</span>${m.odds ? `<span class="od">Odds ${m.odds}</span>` : ""}<time>Wed, Oct 14 · <b>${m.t}</b> EAT</time></header>
<div class="tk-b"><div class="tk-m">
<span class="tm${lost(m, 0)}">${crest(m.h)}<span class="nm">${m.h[0]}</span></span>
<span class="tm${lost(m, 1)}">${crest(m.a)}<span class="nm">${m.a[0]}</span></span>
<span class="stx">${status(m)}${score}</span>
</div><div class="tk-s">${stub}</div></div>
${m.note ? `<p class="nt">${icon("info")}${m.note}</p>` : ""}</article>`;
}

const icons = {
  search: `<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>`,
  moon: `<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.3 6.3 0 0 0 10 10z"/>`,
  left: `<path d="m15 6-6 6 6 6"/>`, right: `<path d="m9 6 6 6-6 6"/>`, down: `<path d="m6 9 6 6 6-6"/>`,
  calendar: `<rect x="3.5" y="5" width="17" height="15.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>`,
  sort: `<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5"/>`,
  sliders: `<path d="M3 6h11M18 6h3M3 12h3M10 12h11M3 18h13M20 18h1"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>`,
  home: `<path d="M4 10.5 12 4l8 6.5V20h-5.5v-6h-5v6H4z"/>`,
  live: `<circle cx="12" cy="12" r="2"/><path d="M8 8a5.7 5.7 0 0 0 0 8M16 8a5.7 5.7 0 0 1 0 8M5.2 5.2a9.6 9.6 0 0 0 0 13.6M18.8 5.2a9.6 9.6 0 0 1 0 13.6"/>`,
  results: `<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.5 2.5 4.5-5"/>`,
  more: `<circle cx="12" cy="5.5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="18.5" r="1"/>`,
  globe: `<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.4 5.2 3.4 8.5s-1 6.1-3.4 8.5M12 3.5C9.6 5.9 8.6 8.7 8.6 12s1 6.1 3.4 8.5"/>`,
  check: `<path d="m5 12.5 4.5 4.5L19 7.5"/>`, x: `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`, minus: `<path d="M6 12h12"/>`,
  info: `<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.4"/>`,
};
const sprite = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${Object.entries(icons).map(([id, body]) =>
  `<symbol id="i-${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`).join("")}</svg>`;

const days = [["Tue", "13"], ["Wed", "14", "on today"], ["Thu", "15"]];
function phone(theme, caption) {
  return `<figure><div class="device"><div class="screen ${theme}">
<div class="sbar"><span>9:41</span><span class="sbar-r"><svg width="16" height="10" viewBox="0 0 16 10" fill="currentColor"><rect x="0" y="6.5" width="2.8" height="3.5"/><rect x="4.4" y="4.5" width="2.8" height="5.5"/><rect x="8.8" y="2.3" width="2.8" height="7.7"/><rect x="13.2" y="0" width="2.8" height="10"/></svg><svg width="23" height="11" viewBox="0 0 23 11"><rect x=".5" y=".5" width="19" height="10" rx="2.5" fill="none" stroke="currentColor" opacity=".5"/><rect x="2" y="2" width="14" height="7" rx="1.2" fill="currentColor"/><rect x="20.6" y="3.5" width="1.6" height="4" rx=".8" fill="currentColor" opacity=".5"/></svg></span></div>
<div class="brand"><span class="logo"><svg class="mark" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11"/><path d="M17.3 8.4A6.2 6.2 0 1 0 18.2 13h-5.6"/></svg>Goal Hint</span><span class="tgl">${icon("moon", "i")}</span></div>
<div class="feed">
  <div class="srch"><label class="field">${icon("search", "i")}<span class="ph">Team or league</span></label><span class="go">${icon("search", "i s")}Search</span></div>
  <div class="strip"><span class="arw">${icon("left", "i")}</span><div class="days">${days.map(([wd, d, cls = ""]) =>
    `<span class="day ${cls}"><small>${wd}-Oct</small><b>${d}</b></span>`).join("")}</div><span class="arw">${icon("right", "i")}</span><span class="cal">${icon("calendar", "i s")}<small>Calendar</small></span></div>
  <div class="tools"><span class="count">${matches.length} matches</span><span class="sel">${icon("sort", "i s")}Earliest first${icon("down", "i s")}</span><span class="flt">${icon("sliders", "i s")}Filters</span></div>
  ${matches.map(card).join("\n")}
</div>
<nav class="tabs"><span class="on">${icon("home", "i")}Matches</span><span>${icon("live", "i")}Live</span><span>${icon("results", "i")}Results</span><span>${icon("more", "i")}More</span></nav>
</div></div><figcaption>${caption}</figcaption></figure>`;
}

const light = `--page:#CEDBE3;--surface:#FFFFFF;--soft:#EAF0F2;--head:#F6F8FA;--text:#102A3A;--muted:#486071;--border:#C5D4DE;--control:#7C8A95;--brand:#007F7A;--brand-ink:#00645F;--brand-soft:#E2F3F1;--on-brand:#FFFFFF;
  --bar:#102A3A;--bar-text:#FFFFFF;--bar-accent:#39D5CA;--bar-ctl:#1D3B4A;
  --mr-s:#00824A;--mr-f:#DBF9E7;--mr-t:#00603B;--dc-s:#7C3AED;--dc-f:#EFE9FF;--dc-t:#5B21B6;--tg-s:#2563EB;--tg-f:#E3EDFF;--tg-t:#1E40AF;--bt-s:#C2410C;--bt-f:#FFEADB;--bt-t:#9A3412;
  --ok-t:#007754;--ok-f:#E5F4EC;--ko-t:#9C2328;--ko-f:#FFF0F1;--vd-t:#515C6B;--vd-f:#F0F3F6;--lv-s:#DC2626;--lv-t:#B91C1C;--lv-f:#FEE2E2;--am-t:#92400E;--am-f:#FEF0C7;--ring:rgba(16,42,58,.16)`;
const dark = `--page:#141C22;--surface:#1E2932;--soft:#28343D;--head:#18232B;--text:#F2F7F8;--muted:#B1BEC8;--border:#3C505E;--control:#69808F;--brand:#53D5C6;--brand-ink:#53D5C6;--brand-soft:#183C3B;--on-brand:#102A3A;
  --bar:#10181D;--bar-text:#F2F7F8;--bar-accent:#53D5C6;--bar-ctl:#1B2A34;
  --mr-s:#70DEA4;--mr-f:#1C342B;--mr-t:#70DEA4;--dc-s:#C6AEFF;--dc-f:#322B45;--dc-t:#C6AEFF;--tg-s:#9EC5FF;--tg-f:#233449;--tg-t:#9EC5FF;--bt-s:#FFBA8F;--bt-f:#3D2D25;--bt-t:#FFBA8F;
  --ok-t:#70DEA4;--ok-f:#1C342B;--ko-t:#FF9C9C;--ko-f:#3B252C;--vd-t:#B1BEC8;--vd-f:#28343D;--lv-s:#FF9C9C;--lv-t:#FF9C9C;--lv-f:#3B252C;--am-t:#F6C453;--am-f:#322A1E;--ring:rgba(242,247,248,.22)`;

const css = `
:root{--bg:#E8EEF1;--paper:#F6F9FA;--ink:#102A3A;--ink-muted:#4A6070;--line:#C8D5DD;--accent:#007F7A;--device:#0E1A22;--device-edge:#2A3A45}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0E151A;--paper:#141D23;--ink:#E9F0F3;--ink-muted:#A6B5BF;--line:#2B3B46;--accent:#53D5C6;--device:#05090C;--device-edge:#33444F;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0E151A;--paper:#141D23;--ink:#E9F0F3;--ink-muted:#A6B5BF;--line:#2B3B46;--accent:#53D5C6;--device:#05090C;--device-edge:#33444F;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;padding:40px 16px 80px;background:var(--bg);color:var(--ink);font-family:"Manrope",Arial,sans-serif;font-size:15px;line-height:1.5}
.wrap{max-width:1000px;margin:0 auto}
.eyebrow{margin:0 0 8px;font-family:"IBM Plex Mono",monospace;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-muted)}
h1{margin:0 0 10px;font-size:clamp(28px,4.6vw,42px);line-height:1.08;letter-spacing:-.02em}
.lede{max-width:64ch;margin:0 0 20px;color:var(--ink-muted)}
.notes{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:12px;margin:0 0 32px;padding:0;list-style:none}
.notes li{padding:12px 14px;background:var(--paper);border:1px solid var(--line);font-size:14px;color:var(--ink-muted)}
.notes b{display:block;color:var(--ink);font-size:14px}
.phones{display:flex;flex-wrap:wrap;justify-content:center;gap:32px}
figure{margin:0;display:grid;gap:12px;justify-items:center}
figcaption{font-family:"IBM Plex Mono",monospace;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-muted)}
.device{width:376px;max-width:100%;padding:8px;background:var(--device);border-radius:44px;box-shadow:inset 0 0 0 1.5px var(--device-edge),0 30px 50px -30px rgba(11,31,51,.55)}
.screen{width:360px;max-width:100%;border-radius:36px;overflow:hidden;background:var(--page);color:var(--text);font-size:12px;line-height:1.3}
.lt{${light}}
.dk{${dark};color-scheme:dark}
.i{width:18px;height:18px;flex:none}
.i.s{width:15px;height:15px}
.sbar{height:30px;display:flex;align-items:flex-end;justify-content:space-between;padding:0 24px 5px 30px;background:var(--bar);color:var(--bar-text);font-size:12.5px;font-weight:700}
.sbar-r{display:flex;gap:6px;align-items:center}
.brand{height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 8px 0 10px;background:var(--bar);color:var(--bar-text);border-bottom:2px solid var(--bar-accent)}
.logo{display:flex;align-items:center;gap:8px;font-size:20px;font-weight:800;letter-spacing:-.01em}
.mark{width:26px;height:26px}.mark circle{fill:var(--bar-accent)}.mark path{fill:none;stroke:var(--bar);stroke-width:2.7;stroke-linecap:round}
.tgl{width:36px;height:36px;display:grid;place-items:center}
.feed{display:grid;gap:6px;padding:8px 8px 10px}
/* search with its button */
.srch{display:flex;gap:6px}
.field{flex:1;min-width:0;display:flex;align-items:center;gap:8px;height:44px;padding:0 10px;background:var(--surface);border:1px solid var(--control);color:var(--muted);font-size:16px}
.ph{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.go{flex:none;display:inline-flex;align-items:center;gap:6px;height:44px;padding:0 14px;background:var(--brand);color:var(--on-brand);font-size:14px;font-weight:800}
/* day strip */
.strip{display:flex;gap:4px}
.arw{flex:none;width:32px;height:44px;display:grid;place-items:center;background:var(--surface);border:1px solid var(--border);color:var(--brand-ink)}
.days{flex:1;min-width:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}
.day{display:grid;place-content:center;justify-items:center;gap:1px;height:44px;background:var(--surface);border:1px solid var(--border);line-height:1.1;white-space:nowrap}
.day small{font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.01em}
.day b{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums}
.day.today small{color:var(--brand-ink)}
.day.on{background:var(--brand);border-color:var(--brand);color:var(--on-brand)}
.day.on small{color:inherit}
.cal{flex:none;display:grid;place-content:center;justify-items:center;width:58px;height:44px;border:1px dashed var(--control);background:var(--surface);color:var(--brand-ink);line-height:1.1}
.cal small{font-size:10px;font-weight:700}
.tools{display:flex;align-items:center;gap:6px}
.count{margin-right:auto;font-size:12px;font-weight:800;color:var(--muted);white-space:nowrap}
.sel,.flt{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 9px;background:var(--surface);border:1px solid var(--control);font-size:13px;font-weight:800;white-space:nowrap}
/* ---------- the ticket card ---------- */
.m-mr{--ms:var(--mr-s);--mf:var(--mr-f);--mt:var(--mr-t)}
.m-dc{--ms:var(--dc-s);--mf:var(--dc-f);--mt:var(--dc-t)}
.m-tg{--ms:var(--tg-s);--mf:var(--tg-f);--mt:var(--tg-t)}
.m-bt{--ms:var(--bt-s);--mf:var(--bt-f);--mt:var(--bt-t)}
.m-none{--ms:var(--border);--mf:var(--soft);--mt:var(--muted)}
.tk{--stub:var(--mf);--stub-w:98px;position:relative;background:var(--surface);border:1px solid var(--border);overflow:hidden}
.tk.r-won{--stub:var(--ok-f)}.tk.r-lost{--stub:var(--ko-f)}.tk.r-void{--stub:var(--vd-f)}
.nm{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.mut{color:var(--muted)!important}
.tk-hd{display:flex;align-items:center;gap:6px;height:22px;padding:0 8px;background:var(--head);border-bottom:1px solid var(--border);font-size:11px;color:var(--muted);white-space:nowrap}
.tk-hd .lg{flex:1;font-weight:600}
.tk-hd .od{flex:none;font-weight:700}
.tk-hd .od::after{content:"·";margin-left:6px}
.tk-hd time{flex:none;font-variant-numeric:tabular-nums}
.tk-hd time b{color:var(--text);font-weight:800}
.fl{width:15px;height:10px;flex:none;display:inline-block;box-shadow:inset 0 0 0 1px rgba(0,0,0,.14)}
.fl.gl{width:13px;height:13px;box-shadow:none;color:var(--muted)}
.f-eng{background:linear-gradient(90deg,transparent 42%,#CE1124 42% 58%,transparent 58%),linear-gradient(transparent 36%,#CE1124 36% 64%,transparent 64%),#fff}
.f-esp{background:linear-gradient(#AA151B 25%,#F1BF00 25% 75%,#AA151B 75%)}
.f-ger{background:linear-gradient(#000 33.3%,#DD0000 33.3% 66.6%,#FFCE00 66.6%)}
.f-fra{background:linear-gradient(90deg,#002395 33.3%,#fff 33.3% 66.6%,#ED2939 66.6%)}
.f-uga{background:linear-gradient(#000 16.6%,#FCDC04 16.6% 33.3%,#D90000 33.3% 50%,#000 50% 66.6%,#FCDC04 66.6% 83.3%,#D90000 83.3%)}
.tk-b{display:grid;grid-template-columns:minmax(0,1fr) var(--stub-w)}
/* match side: names left, the status pill and the scoreboard right */
.tk-m{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:20px 20px;align-items:center;column-gap:8px;padding:6px 10px 6px 8px;min-width:0}
.tm{grid-column:1;display:flex;align-items:center;gap:7px;min-width:0;font-size:13px;font-weight:700}
.tm.lo{color:var(--muted)}.tm.lo .nm{font-weight:600}
.cr{flex:none;display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--c1);color:var(--c2);font-style:normal;font-size:9px;font-weight:800;line-height:1;box-shadow:inset 0 0 0 1px var(--ring)}
.stx{grid-column:2;grid-row:1/3;display:flex;align-items:center;gap:7px;align-self:stretch}
.pill{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 6px;font-size:11px;font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums}
.p-live{background:var(--lv-s);color:var(--surface)}
.p-done{background:var(--soft);color:var(--text)}
.p-halt{background:var(--am-f);color:var(--am-t)}
.dot{width:6px;height:6px;border-radius:50%;background:currentColor;animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.dot{animation:none}}
.sb{display:grid;grid-template-rows:20px 20px;align-self:center;min-width:26px;background:var(--soft)}
.sb b{display:grid;place-items:center;font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
.sb b.lo{color:var(--muted);font-weight:700}
.sb-live{background:var(--lv-f);color:var(--lv-t)}
/* pick stub */
.tk-s{position:relative;display:grid;align-content:center;gap:3px;padding:5px 7px 5px 8px;background:var(--stub);border-left:1.5px dashed color-mix(in srgb,var(--muted) 55%,transparent);min-width:0}
.tk-s::before,.tk-s::after{content:"";position:absolute;left:-7px;width:12px;height:12px;border-radius:50%;background:var(--page);box-shadow:inset 0 0 0 1px var(--border)}
.tk-s::before{top:-7px}.tk-s::after{bottom:-7px}
.s1{display:flex;align-items:center;justify-content:space-between;gap:4px;min-height:20px}
.chip{flex:none;padding:1px 4px;background:var(--surface);color:var(--mt);font-size:10px;font-weight:800;line-height:1.4;white-space:nowrap;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ms) 45%,transparent)}
.pc{font-size:16px;font-weight:800;line-height:1;color:var(--mt);font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.r-won .pc,.r-lost .pc,.r-void .pc{color:var(--text)}
.pt{font-size:11.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.np{font-size:11.5px;font-weight:800;color:var(--muted)}
.rs{flex:none;display:inline-flex;align-items:center;gap:2px;height:18px;padding:0 4px 0 2px;font-size:10.5px;font-weight:800;color:var(--surface);white-space:nowrap}
.rs .ic{width:11px;height:11px;stroke-width:3}
.rs-won{background:var(--ok-t)}.rs-lost{background:var(--ko-t)}.rs-void{background:var(--vd-t)}
.nt{display:flex;align-items:center;gap:5px;margin:0;padding:2px 8px;font-size:11px;font-weight:700;color:var(--am-t);background:var(--am-f);border-top:1px solid var(--border)}
.nt .ic{width:12px;height:12px;flex:none}
.tabs{display:grid;grid-template-columns:repeat(4,1fr);height:60px;padding-bottom:10px;background:var(--bar);border-top:1px solid var(--border)}
.tabs span{display:grid;justify-items:center;align-content:center;gap:2px;font-size:10.5px;font-weight:700;color:color-mix(in srgb,var(--bar-text) 75%,transparent);border-top:2px solid transparent}
.tabs span.on{color:var(--bar-accent);border-top-color:var(--bar-accent)}
@media (max-width:392px){.device{padding:0;border-radius:0;background:none;box-shadow:none}.screen{border-radius:0}}
`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ticket Card Design</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=Manrope:wght@400;500;600;700;800&display=swap">
<style>${css}</style>
</head>
<body>
${sprite}
<div class="wrap">
  <p class="eyebrow">Goal Hint · Matches feed · Phone width 360 px</p>
  <h1>Ticket cards, ready for approval</h1>
  <p class="lede">Design 5 with your changes, drawn in light and dark on the full phone feed. The list shows every state the card handles. Nothing is built yet.</p>
  <ul class="notes">
    <li><b>Search button</b>Sits to the right of the search field and runs the search for the typed text.</li>
    <li><b>Day strip</b>Each day reads Day-Month over the date, such as Tue-Oct and 13. Today's label is teal.</li>
    <li><b>Kickoff always shown</b>Every card's top line has the league, then the kickoff date and time in EAT.</li>
    <li><b>Status and score</b>Live minute and HT in a red pill, FT and AET in grey, Postponed in amber, next to a boxed score.</li>
    <li><b>Prediction stub</b>Market, chance and pick. Once settled it turns green, red or grey with Won, Lost or Void.</li>
    <li><b>No wrapping</b>Team and league names end with an ellipsis; sizes are chosen so every label fits on one line.</li>
  </ul>
  <div class="phones">${phone("lt", "Light")}${phone("dk", "Dark")}</div>
</div>
</body>
</html>
`;
writeFileSync(join(here, "ticket.html"), html);
console.log(`Wrote ${join(here, "ticket.html")}`);
