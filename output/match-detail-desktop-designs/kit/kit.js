/* Goal Hint desktop match-details kit: icons, atoms, data blocks and light interactions shared by the ten designs.
 * Each design arranges these blocks and adds its own header, verdict and chrome. Every block root carries
 * data-b="<name>" so the gallery can check that each design shows everything. */
(function () {
  const M = window.M;
  const H = M.home, A = M.away;
  const q = new URLSearchParams(location.search);
  const FULL = q.has("full");

  /* ---------- icons ---------- */
  const P = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    share: '<path d="M12 3v12M7 8l5-5 5 5M5 13v6h14v-6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    moon: '<path d="M19.5 14.5A7.5 7.5 0 019.5 4.5a7.5 7.5 0 1010 10z"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" fill="currentColor" stroke="none"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    cross: '<path d="M6 6l12 12M18 6L6 18"/>',
    ball: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.6l3.6 2.6-1.4 4.2H9.8l-1.4-4.2z" fill="currentColor"/><path d="M12 3.5v4.1M15.6 10.2l3.9-1.3M14.2 14.4l2.4 3.4M9.8 14.4l-2.4 3.4M8.4 10.2L4.5 8.9"/>',
    sub: '<path d="M8 19V6M4.5 9.5L8 6l3.5 3.5" stroke="#00A35C"/><path d="M16 5v13M12.5 14.5L16 18l3.5-3.5" stroke="#D9473A"/>',
    stadium: '<path d="M3 19.5h18M5 19.5v-9L12 6l7 4.5v9M9.5 19.5v-4.5h5v4.5"/>',
    whistle: '<circle cx="9" cy="14" r="5"/><path d="M12.5 10.5L20 6v4l-5 2.3"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    cal: '<rect x="4" y="5.5" width="16" height="14"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.4"/>',
    news: '<rect x="4" y="4.5" width="16" height="15"/><path d="M8 9h8M8 12.5h8M8 16h5"/>',
    users: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.5" cy="8.5" r="2.6"/><path d="M15.5 13.3c2.6-.3 4.5 1.4 5 4.4"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    list: '<path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.5M4 12h.5M4 17.5h.5"/>',
    pitch: '<rect x="4" y="3.5" width="16" height="17"/><path d="M4 12h16"/><circle cx="12" cy="12" r="2.6"/><path d="M9 3.5v3h6v-3M9 20.5v-3h6v3"/>',
    trophy: '<path d="M8 4.5h8v4.5a4 4 0 01-8 0zM8 6.5H4.5a3 3 0 003.6 3.4M16 6.5h3.5a3 3 0 01-3.6 3.4M12 13v4M8.5 20h7M10 17h4v3h-4z"/>',
    bolt: '<path d="M13 3L5.5 13.5H12L11 21l7.5-10.5H12z"/>',
    medic: '<rect x="4" y="4" width="16" height="16"/><path d="M12 8v8M8 12h8"/>',
    swap: '<path d="M4 8h14M14.5 4.5L18 8l-3.5 3.5M20 16H6M9.5 12.5L6 16l3.5 3.5"/>',
    history: '<path d="M4 12a8 8 0 103-6.2"/><path d="M4 4.5v4h4M12 8v4.5l3 1.8"/>',
    coins: '<ellipse cx="9" cy="7" rx="5" ry="2.5"/><path d="M4 7v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7"/><path d="M10 15.5c.9 1.2 2.9 2 5 2 2.8 0 5-1.1 5-2.5v-4c0-1.2-1.6-2.2-3.8-2.4"/>',
    bulb: '<path d="M9 17.5h6M10 21h4M12 3.5a5.5 5.5 0 00-3.2 10c.6.5 1.2 1.4 1.2 2.2v1.8h4v-1.8c0-.8.6-1.7 1.2-2.2A5.5 5.5 0 0012 3.5z"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    live: '<circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M8 8a5.6 5.6 0 000 8M16 8a5.6 5.6 0 010 8M5.2 5.2a9.6 9.6 0 000 13.6M18.8 5.2a9.6 9.6 0 010 13.6"/>',
    done: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.8 2.8L16.2 9.6"/>',
    more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor"/>',
    matches: '<rect x="3.5" y="5" width="17" height="14"/><path d="M12 5v14"/><circle cx="12" cy="12" r="2.6"/>',
    slip: '<rect x="5" y="3.5" width="14" height="17"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
    help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 114 2c-.9.6-1.6 1.1-1.6 2.2M12 16.6v.4"/>',
    warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17v.3"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5h4"/>',
  };
  const ic = (name, size = 16, extra = "") =>
    `<svg class="ic ic-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" ${extra}>${P[name]}</svg>`;

  /* ---------- atoms ---------- */
  const crest = (t, s = 24) =>
    `<span class="crest" style="--s:${s}px;--c:${t.color}"><b>${t.short}</b><img alt="" src="${t.logo}" onload="this.parentNode.classList.add('ok')" onerror="this.remove()"></span>`;
  const league = (s = 16) =>
    `<span class="crest lg" style="--s:${s}px;--c:#3D195B"><b>PL</b><img alt="" src="${M.league.logo}" onload="this.parentNode.classList.add('ok')" onerror="this.remove()"></span>`;
  const hue = (id) => `var(--${id})`;
  const team = (side) => (side === "home" ? H : A);
  const card = (c) => `<i class="k-card ${c}" aria-label="${c === "y" ? "Yellow card" : "Red card"}"></i>`;
  const evIcon = (type, s = 15) => ({
    goal: ic("ball", s), yellow: card("y"), red: card("r"), sub: ic("sub", s),
    var: '<i class="k-var">VAR</i>', break: "",
  })[type];
  const liveDot = () => '<i class="k-live-dot" aria-hidden="true"></i>';
  /* Form letters arrive newest first; they are drawn oldest → newest so the latest sits at the right. */
  const form = (list, scores = false) => `<span class="k-fm">${[...list].reverse().map(([r, s, opp, v]) =>
    `<span title="${r} ${s} ${v === "H" ? "vs" : "at"} ${opp}"><i class="${r}">${r}</i>${scores ? `<small>${s}</small>` : ""}</span>`).join("")}</span>`;
  const letters = (list) => [...list].reverse().map((f) => f[0]).join("");
  const mini = (side) => `<span class="k-mini">${letters(M.form[side]).split("").map((l) => `<i class="${l}"></i>`).join("")}</span>`;
  const miniStr = (s) => `<span class="k-mini">${s.split("").map((l) => `<i class="${l}"></i>`).join("")}</span>`;
  const tick = (ok) => ok ? `<span class="k-now on" title="On track">${ic("check", 12)}</span>` : `<span class="k-now off" title="Not yet">${ic("clock", 12)}</span>`;
  const nowLine = (m, long = false) => `<span class="k-nowtxt ${m.live.ok ? "on" : "off"}">${m.live.ok ? ic("check", 12) : ic("clock", 12)}${long ? m.live.need : m.live.text}</span>`;
  const pend = (label = "Pending") => `<span class="k-pend">${label}</span>`;
  const meter = (p, color) => `<span class="k-meter"><u style="width:${p}%${color ? `;background:${color}` : ""}"></u></span>`;
  const top = () => M.markets.find((m) => m.top);
  const mr = () => M.markets[0];
  const hd = (title, aside = "") => `<div class="k-hd"><h3>${title}</h3>${aside ? `<span>${aside}</span>` : ""}</div>`;
  const tm = (side, s = 16) => `<span class="k-tm">${crest(team(side), s)}${team(side).name}</span>`;

  /* ---------- blocks ---------- */
  const B = {};

  /* Picks: code, pick, chance, odds, as it stands, status. */
  B.picks = (opts = {}) => `<table class="k-picks" data-b="picks"><tbody>${M.markets.map((m) => `<tr class="${m.top ? "top" : ""}" style="--h:${hue(m.id)}">
    <td><span class="k-code">${m.code}</span></td>
    <td class="p">${m.pickLabel}${opts.names === false ? "" : `<small>${m.name}${m.top ? " · our top pick" : ""}</small>`}</td>
    <td class="c">${meter(m.prob)}<b>${m.prob}%</b></td>
    <td class="o">${m.odds}</td>
    ${opts.live === false ? "" : opts.live === "icon" ? `<td>${tick(m.live.ok)}</td>` : `<td>${nowLine(m)}</td>`}
    ${opts.status === false ? "" : `<td>${pend(m.status)}</td>`}</tr>`).join("")}</tbody></table>`;

  B.outcomes = (m, opts = {}) => `<div class="k-out" data-b="outcomes" style="--h:${hue(m.id)}">
    ${opts.head === false ? "" : `<div class="hdr"><span style="text-align:left">${opts.title || "Outcome"}</span><span></span><span>Ours</span><span>Market</span><span>Odds</span></div>`}
    ${m.outcomes.map((o) => `<div class="${o.k === m.pick ? "pick" : ""}"><span class="l">${o.label.startsWith(o.k) ? "" : `<i>${o.k}</i>`}${o.label}</span>${meter(o.p)}<b>${o.p}%</b><span class="m">${o.implied}%</span><em>${o.odds}</em></div>`).join("")}</div>`;

  B.resultBar = (cls = "") => { const o = mr().outcomes;
    return `<div class="k-tri ${cls}" data-b="resultBar" aria-label="Match result chances: ${H.name} ${o[0].p}%, draw ${o[1].p}%, ${A.name} ${o[2].p}%">
      <span style="flex:${o[0].p};background:${H.color}">${H.short} ${o[0].p}%</span><span class="d" style="flex:${o[1].p}">Draw ${o[1].p}%</span>
      <span class="a" style="flex:${o[2].p};background:${A.color}">${A.short} ${o[2].p}%</span></div>`; };

  B.analysis = (opts = {}) => `<div class="k-an" data-b="analysis"><ol>${M.analysis.reasons.map((r) => `<li>${r}</li>`).join("")}</ol>
    <p class="k-unc">${ic("warn", 14)}<span><b>Watch out:</b> ${M.analysis.uncertainty}</span></p>
    ${opts.sources === false ? "" : `<p class="k-meta">Sources: ${M.analysis.sources.join(", ")} · evidence to ${M.publication.cutoff} · ${M.publication.source}</p>`}</div>`;

  /* Two-sided vertical timeline. */
  B.events = () => `<div class="k-ev" data-b="events">${M.events.map((e) => {
    if (e.type === "break") return `<div class="k-ev-ht">${e.text}</div>`;
    const body = `<span class="t"><b>${e.player}</b><small>${e.sub}</small></span>`;
    const icon = `<span class="i">${evIcon(e.type)}</span>`;
    const score = e.score ? `<em class="k-ev-sc">${e.score}</em>` : "";
    return `<div class="k-ev-r">${e.side === "home" ? `<span class="e h">${score}${body}${icon}</span>` : "<span></span>"}<span class="m">${e.min}</span>${e.side === "away" ? `<span class="e a">${icon}${body}${score}</span>` : "<span></span>"}</div>`;
  }).join("")}</div>`;

  /* One-column event list. */
  B.eventList = () => `<ol class="k-evl" data-b="events">${M.events.map((e) => e.type === "break" ? `<li class="ht">${e.text}</li>`
    : `<li><em>${e.min}</em><span class="i">${evIcon(e.type)}</span>${crest(team(e.side), 16)}<span><b>${e.player}</b><small>${e.sub}</small></span>${e.score ? `<em class="k-ev-sc">${e.score}</em>` : "<i></i>"}</li>`).join("")}</ol>`;

  /* Horizontal 0–90' minute line: home above, away below, labels on two tiers where events crowd. */
  B.timeline = () => {
    const pos = (m) => `${(Math.min(m, 90) / 90) * 100}%`;
    const tier = { home: [-99, 0], away: [-99, 0] };
    const marks = M.events.filter((e) => e.type !== "break").map((e) => {
      const t = tier[e.side]; const level = e.m - t[0] < 10 ? 1 - t[1] : 0; tier[e.side] = [e.m, level];
      const who = e.player.replace(/^[A-Z]\. /, "");
      const lbl = `<small>${who} <i>${e.min}</i></small>`;
      return `<span class="ev ${e.side === "home" ? "h" : "a"} t${level}" style="left:${pos(e.m)}" title="${e.min} ${e.player} · ${e.sub}">${e.side === "home" ? `${lbl}${evIcon(e.type, 14)}` : `${evIcon(e.type, 14)}${lbl}`}</span>`;
    }).join("");
    return `<div class="k-tl" data-b="timeline" aria-label="Match timeline"><span class="side h">${H.short}</span><span class="side a">${A.short}</span>
      <i class="ax"></i><i class="done" style="width:${pos(M.status.elapsed)}"></i>
      ${[0, 15, 30, 60, 75, 90].map((m) => `<i class="gap" style="left:${pos(m)}"></i><span class="tk" style="left:${pos(m)}">${m}'</span>`).join("")}
      <span class="tk ht" style="left:50%">HT ${M.status.ht}</span><i class="gap" style="left:50%"></i>
      <span class="now" style="left:${pos(M.status.elapsed)}"><b>${M.status.minute}</b></span>${marks}</div>`;
  };

  B.stats = (opts = {}) => { const rows = opts.rows ? M.stats.filter((r) => opts.rows.includes(r[0])) : M.stats;
    return `<div class="k-st ${opts.narrow ? "narrow" : ""}" data-b="stats">${rows.map(([l, h, a, hv, av]) => {
      const t = hv + av || 1, hp = (hv / t) * 100, ap = (av / t) * 100, hl = hv >= av && hv > 0, al = av >= hv && av > 0;
      return `<div class="k-st-r"><b class="${hl ? "lead" : ""}">${h}</b><i><u class="${hl ? "lead" : ""}" style="width:${hp}%"></u></i><span>${l}</span><i><u class="${al ? "lead" : ""}" style="width:${ap}%"></u></i><b class="${al ? "lead" : ""}">${a}</b></div>`;
    }).join("")}</div>`; };

  const marks = (m, s = 11) => (m ? m.split(" ").map((x) => ({ goal: ic("ball", s), yellow: card("y"), off: `<i class="k-off">${ic("sub", s)}</i>` })[x] || "").join("") : "");
  const rating = (side, name) => { const r = M.lineups[side].ratings[name]; return r ? `<u class="${r >= 7.5 ? "hi" : ""}">${r.toFixed(1)}</u>` : ""; };

  B.lineups = (opts = {}) => `<div class="k-lu" data-b="lineups">${["home", "away"].map((s) => {
    const l = M.lineups[s], t = team(s);
    return `<div><h4>${crest(t, 16)}<span>${t.name}</span><em>${l.formation}</em></h4><ol>${l.xi.map(([n, name, , m]) =>
      `<li><i>${n}</i><span>${name}${name === l.captain ? " (C)" : ""}</span>${marks(m)}${opts.ratings === false ? "" : rating(s, name)}</li>`).join("")}</ol>
      ${opts.bench ? `<h5 data-b="bench">Bench</h5><ol>${l.bench.map(([n, name, m, at]) => `<li><i>${n}</i><span>${name}</span>${m ? `<i class="k-in">${ic("sub", 11)} ${at}</i>${rating(s, name)}` : ""}</li>`).join("")}</ol><p class="k-coach"><span>Coach</span> ${l.coach}</p>` : ""}</div>`;
  }).join("")}</div>`;

  B.bench = () => `<div class="k-lu bench" data-b="bench">${["home", "away"].map((s) => {
    const l = M.lineups[s];
    return `<div><h5>${team(s).short} bench</h5><ol>${l.bench.map(([n, name, m, at]) => `<li><i>${n}</i><span>${name}</span>${m ? `<i class="k-in">${ic("sub", 11)} ${at}</i>${rating(s, name)}` : ""}</li>`).join("")}</ol>
      <p class="k-coach"><span>Coach</span> ${l.coach}</p></div>`;
  }).join("")}</div>`;

  const lines = (h = false) => h
    ? `<svg class="k-pitch-lines" viewBox="0 0 140 100" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke">
      <rect x="1" y="1" width="138" height="98" vector-effect="non-scaling-stroke"/><path d="M70 1v98" vector-effect="non-scaling-stroke"/><circle cx="70" cy="50" r="9" vector-effect="non-scaling-stroke"/>
      <path d="M1 22h18v56H1M1 37h7v26H1M139 22h-18v56h18M139 37h-7v26h7" vector-effect="non-scaling-stroke"/></g></svg>`
    : `<svg class="k-pitch-lines" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke">
      <rect x="1" y="1" width="98" height="138" vector-effect="non-scaling-stroke"/><path d="M1 70h98" vector-effect="non-scaling-stroke"/><circle cx="50" cy="70" r="11" vector-effect="non-scaling-stroke"/>
      <path d="M24 1v18h52V1M38 1v7h24V1M24 139v-18h52v18M38 139v-7h24v7" vector-effect="non-scaling-stroke"/></g></svg>`;
  const lineRows = (s) => {
    const l = M.lineups[s], by = new Map();
    l.xi.forEach((p) => { const r = +p[2].split(":")[0]; by.set(r, [...(by.get(r) || []), p]); });
    return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([, ps]) => ps.sort((a, b) => +a[2].split(":")[1] - +b[2].split(":")[1]));
  };
  const dot = (s, [n, name, , m]) => `<span class="k-pl"><i style="--c:${team(s).color}">${n}${rating(s, name)}<span class="bd">${marks(m)}</span></i><em>${name}</em></span>`;
  /* Vertical pitch: away attacks down from the top, home attacks up from the bottom. */
  B.pitch = (opts = {}) => {
    const rows = (s) => { let out = lineRows(s); out = s === "home" ? out.reverse() : out.map((r) => r.reverse());
      return out.map((r) => `<div class="k-row">${r.map((p) => dot(s, p)).join("")}</div>`).join(""); };
    return `<div class="k-pitch" data-b="pitch" ${opts.h ? `style="height:${opts.h}px"` : ""}>${lines()}
      <div class="k-half away"><span class="k-fl">${A.name} · ${M.lineups.away.formation}</span>${rows("away")}</div>
      <div class="k-half home">${rows("home")}<span class="k-fl">${H.name} · ${M.lineups.home.formation}</span></div></div>`;
  };
  /* Horizontal pitch: home goalkeeper at the left edge, away goalkeeper at the right edge; grid column 1 is each team's left. */
  B.pitchH = (opts = {}) => {
    const cols = (s) => { let out = lineRows(s); if (s === "away") out = out.reverse().map((r) => r.reverse());
      return out.map((r) => `<div class="k-col">${r.map((p) => dot(s, p)).join("")}</div>`).join(""); };
    return `<div class="k-pitchh" data-b="pitch" ${opts.h ? `style="height:${opts.h}px"` : ""}>${lines(true)}
      <div class="k-halfh home"><span class="k-fl">${H.name} · ${M.lineups.home.formation}</span>${cols("home")}</div>
      <div class="k-halfh away"><span class="k-fl">${A.name} · ${M.lineups.away.formation}</span>${cols("away")}</div></div>`;
  };

  /* Per-player match statistics from /fixtures/players. */
  B.playerTable = (side, opts = {}) => {
    const rows = M.playerStats[side];
    return `<table class="k-ptab" data-b="playerTable"><thead><tr><th>#</th><th>${opts.title || `${team(side).name} players`}</th><th>Min</th><th>G</th><th>A</th><th>Shots</th><th>KP</th><th>Passes</th><th>Tkl</th><th>Duels</th><th>Fls</th><th>Rating</th></tr></thead>
      <tbody>${rows.map(([n, name, pos, min, r, g, a, sh, kp, pa, tk, du, fl, cd], i) => `<tr class="${i >= 11 ? "sub" : ""}"><td>${n}</td><td>${name}<small>${pos}${cd ? ` ${card("y")}` : ""}${i >= 11 ? " · sub" : ""}</small></td><td>${min}'</td><td>${g || "–"}</td><td>${a || "–"}</td><td>${sh}</td><td>${kp}</td><td>${pa}</td><td>${tk}</td><td>${du}</td><td>${fl}</td><td class="r"><b class="${r >= 7.5 ? "hi" : ""}">${r.toFixed(1)}</b></td></tr>`).join("")}</tbody></table>`;
  };

  B.injuries = () => `<div class="k-inj" data-b="injuries">${["home", "away"].map((s) => `<div><h5>${crest(team(s), 14)}${team(s).name}</h5>${M.injuries[s].map(([n, st, why]) =>
    `<p><b>${n}</b><span class="${st === "Out" ? "out" : "dbt"}">${st}</span><small>${why}</small></p>`).join("")}</div>`).join("")}</div>`;

  B.form = (scores = true) => `<div class="k-form" data-b="form">${["home", "away"].map((s) => {
    const f = M.form[s], w = f.filter((x) => x[0] === "W").length, d = f.filter((x) => x[0] === "D").length, l = f.length - w - d;
    return `<div class="k-form-r">${crest(team(s), 20)}<span class="n">${team(s).name}</span>${form(f, scores)}<em>${w}W ${d}D ${l}L · last 5</em></div>`;
  }).join("")}</div>`;

  B.formList = (s) => `<ul class="k-fl-list" data-b="formList">${M.form[s].map(([r, sc, opp, v, comp]) => `<li><i class="k-r ${r}">${r}</i><span>${v === "H" ? "vs" : "at"} ${opp}<small>${comp}</small></span><b>${sc}</b></li>`).join("")}</ul>`;

  B.h2h = (opts = {}) => {
    const s = M.h2h.summary;
    return `<div class="k-h2h" data-b="h2h"><div class="k-h2h-s"><span><b>${s.home}</b>${H.name}</span><span><b>${s.draw}</b>Draws</span><span><b>${s.away}</b>${A.name}</span></div>
      <i class="k-h2h-bar"><u style="flex:${s.home};background:${H.color}"></u><u style="flex:${s.draw}"></u><u style="flex:${s.away || 0.0001};background:${A.color}"></u></i>
      <p class="k-h2h-m">Last 5 · avg ${s.goals} goals · both scored ${s.btts} · over 2.5 ${s.over}</p>
      ${opts.list === false ? "" : `<ul>${M.h2h.meetings.map(([d, h, sc, a]) => { const [x, y] = sc.split("–").map(Number);
        return `<li><span class="d">${d}</span><span class="h ${x > y ? "w" : ""}">${h}</span><b>${sc}</b><span class="a ${y > x ? "w" : ""}">${a}</span></li>`; }).join("")}</ul>`}</div>`;
  };

  /* League table; `window` shows the rows around both teams with a toggle for the full table. */
  let tid = 0;
  B.table = (opts = {}) => {
    const id = `tbl${++tid}`, zc = { ucl: "#1D4ED8", uel: "#EA7A0C", uecl: "#0E9F6E", rel: "#C8463B" };
    const row = ([p, n, pl, w, d, l, gf, ga, gd, pts, f, z]) => {
      const t = n === H.name ? H : n === A.name ? A : null;
      return `<tr class="${t ? "me" : ""}" style="${t ? `--c:${t.color};` : ""}${z ? `--z:${zc[z]}` : ""}"><td>${p}</td><td>${n}</td><td>${pl}</td>${opts.compact ? "" : `<td>${w}</td><td>${d}</td><td>${l}</td><td>${gf}:${ga}</td>`}<td>${gd}</td><td><b>${pts}</b></td>${opts.form === false ? "" : `<td>${miniStr(f)}</td>`}</tr>`;
    };
    const head = `<thead><tr><th>#</th><th>Team</th><th>P</th>${opts.compact ? "" : "<th>W</th><th>D</th><th>L</th><th>Goals</th>"}<th>GD</th><th>Pts</th>${opts.form === false ? "" : "<th>Form</th>"}</tr></thead>`;
    const win = M.table.slice(0, opts.rows || 6);
    const zones = `<p class="k-zones">${Object.entries(M.zones).map(([k, v]) => `<span><i style="background:${zc[k]}"></i>${v}</span>`).join("")}</p>`;
    if (opts.window === false) return `<div data-b="table"><table class="k-tbl">${head}<tbody>${M.table.map(row).join("")}</tbody></table>${zones}</div>`;
    return `<div data-b="table"><table class="k-tbl">${head}<tbody>${win.map(row).join("")}</tbody><tbody id="${id}" data-tgroup="${id}" hidden>${M.table.slice(win.length).map(row).join("")}</tbody></table>
      <button class="k-more" data-toggle="${id}" data-tgroup="${id}" aria-expanded="false">Full table · ${M.table.length} teams ${ic("down", 12)}</button>${zones}</div>`;
  };

  B.season = () => `<div class="k-ss" data-b="season">${M.season.map(([l, h, a]) => `<div><b>${h}</b><span>${l}</span><b>${a}</b></div>`).join("")}</div>`;

  /* When each team scores and concedes, by 15-minute period, this season. */
  B.goalMinutes = () => {
    const g = M.goalMinutes, max = Math.max(...g.home.for, ...g.away.for, ...g.home.against, ...g.away.against);
    const chart = (k) => `<div><h5>Goals ${k === "for" ? "scored" : "conceded"} by period</h5><div class="ch">${g.bands.map((_, i) =>
      `<span><u style="height:${(g.home[k][i] / max) * 100}%;background:${H.color}"><b>${g.home[k][i]}</b></u><u style="height:${(g.away[k][i] / max) * 100}%;background:${A.color}"><b>${g.away[k][i]}</b></u></span>`).join("")}</div>
      <div class="ax">${g.bands.map((b) => `<span>${b}</span>`).join("")}</div></div>`;
    return `<div class="k-gm" data-b="goalMinutes">${chart("for")}${chart("against")}</div>`;
  };

  B.compare = (opts = {}) => `<div class="k-cmp" data-b="compare">${M.compare.map(([l, h]) => `<div><span>${l}</span><b>${h}%</b><i><u style="width:${h}%"></u></i><b>${100 - h}%</b></div>`).join("")}
    ${opts.advice === false ? "" : `<p>API-Football advice: <b>${M.apiAdvice}</b></p>`}</div>`;

  B.keyPlayers = () => `<table class="k-ply" data-b="keyPlayers"><thead><tr><th>Season · key players</th><th>Apps</th><th>G</th><th>A</th><th>Rating</th></tr></thead><tbody>${["home", "away"].map((s) => M.players[s].map(([n, pos, ap, g, a, r]) =>
    `<tr><td><span class="k-tm">${crest(team(s), 14)}${n}</span><small>${pos}</small></td><td>${ap}</td><td>${g}</td><td>${a}</td><td>${r}</td></tr>`).join("")).join("")}</tbody></table>`;

  /* Odds by market: ours, the bookmakers' implied chance, opening → closing median, best price. */
  B.odds = (opts = {}) => `<div data-b="odds"><table class="k-odds ${opts.compact ? "cmp" : ""}"><thead><tr><th>Market</th><th>Outcome</th><th>Ours</th><th>Market</th><th>Open</th><th>Now</th><th>Best</th></tr></thead><tbody>${M.markets.map((m) => m.outcomes.map((o, i) => {
    const mv = +o.odds < +o.open ? "dn" : +o.odds > +o.open ? "up" : "";
    return `<tr class="${i === 0 ? "grp" : ""} ${o.k === m.pick ? "pick" : ""}"><td>${i === 0 ? `<span class="k-code" style="--h:${hue(m.id)}">${m.code}</span>` : ""}</td><td>${o.label}</td><td>${o.p}%</td><td>${o.implied}%</td><td class="mv">${o.open}</td><td class="mv ${mv}">${o.odds}${mv === "dn" ? " ↓" : mv === "up" ? " ↑" : ""}</td><td>${o.best}</td></tr>`;
  }).join("")).join("")}</tbody></table>${opts.meta === false ? "" : `<p class="k-meta" style="margin-top:6px">${M.oddsMeta}. “Market” is the chance the median price implies.</p>`}</div>`;

  B.schedule = () => `<div class="k-sch" data-b="schedule">${[["Rest", "rest"], ["Last", "last"], ["Next", "next"]].map(([l, k]) =>
    `<div><span>${M.schedule[k].home}</span><em>${l}</em><span>${M.schedule[k].away}</span></div>`).join("")}</div>`;

  B.info = () => `<dl class="k-info" data-b="info">
    <div>${ic("cal", 14)}<dt>Kick-off</dt><dd>${M.kickoff.day} · ${M.kickoff.time} ${M.kickoff.tz}</dd></div>
    <div>${ic("trophy", 14)}<dt>Competition</dt><dd>${M.league.name} · ${M.league.round} · ${M.league.season}</dd></div>
    <div>${ic("stadium", 14)}<dt>Venue</dt><dd>${M.venue.name}, ${M.venue.address}, ${M.venue.city}</dd></div>
    <div>${ic("users", 14)}<dt>Capacity</dt><dd>${M.venue.capacity} · ${M.venue.surface}</dd></div>
    <div>${ic("whistle", 14)}<dt>Referee</dt><dd>${M.referee.name} (${M.referee.country})</dd></div></dl>`;

  B.news = () => `<ul class="k-news" data-b="news">${M.news.map((n) => `<li><a href="#"><b>${n.title}</b><small>${n.publisher} · ${n.kind} · ${n.ago} ago</small></a></li>`).join("")}</ul>`;

  B.history = () => `<ul class="k-hist" data-b="history">${M.history.map((h) => `<li><b>Rev ${h.rev}</b><span>${h.when}</span><small>${h.note}</small>${h.current ? '<em>Current</em>' : ""}</li>`).join("")}</ul>`;

  B.disc = () => `<p class="k-disc" data-b="disc">${M.disclaimer}</p>`;

  /* ---------- chrome ---------- */
  B.site = () => `<header class="site"><div class="in"><a class="logo" href="#"><img src="../../public/brand/goal-hint-logo-inverse.svg" alt="Goal Hint"></a>
    <nav><a class="on" href="#">${ic("matches", 17)}Predictions</a><a href="#">${ic("live", 17)}Live</a><a href="#">${ic("done", 17)}Results</a><a href="#">${ic("slip", 17)}Slip builder</a><a href="#">${ic("help", 17)}Help</a><a href="#">${ic("more", 17)}More</a></nav>
    <span class="srch">${ic("search", 15)}Search teams, leagues…</span><button class="tg" aria-label="Theme">${ic("moon", 18)}</button></div></header>`;
  B.crumb = (extra = "") => `<p class="crumb"><a href="#">${ic("back", 14)}Back to predictions</a><i>/</i>${M.league.name}<i>/</i>${H.name} v ${A.name}${extra}</p>`;

  /* ---------- interactions ---------- */
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href='#']");
    if (a) e.preventDefault();
    const t = e.target.closest("[data-tab]");
    if (t) {
      const g = t.dataset.group || "main";
      document.querySelectorAll("[data-tab]").forEach((b) => { if ((b.dataset.group || "main") === g) b.setAttribute("aria-selected", String(b.dataset.tab === t.dataset.tab)); });
      document.querySelectorAll("[data-panel]").forEach((p) => { if ((p.dataset.group || "main") === g) p.hidden = p.dataset.panel !== t.dataset.tab; });
    }
    const j = e.target.closest("[data-jump]");
    if (j) { e.preventDefault(); const el = document.getElementById(j.dataset.jump); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - (+j.dataset.offset || 70), behavior: "smooth" }); }
    const x = e.target.closest("[data-toggle]");
    if (x) {
      const el = document.getElementById(x.dataset.toggle);
      if (el) { const open = el.hidden; el.hidden = !open; x.setAttribute("aria-expanded", String(open)); x.closest("[data-card]")?.toggleAttribute("data-open", open); }
    }
  });

  /* Scroll-spy: links with data-spy="<id>" light up while their section is in view. */
  function spy() {
    const links = [...document.querySelectorAll("[data-spy]")];
    if (!links.length) return;
    const on = () => {
      let cur = links[0].dataset.spy;
      for (const l of links) { const el = document.getElementById(l.dataset.spy); if (el && el.getBoundingClientRect().top < 160) cur = l.dataset.spy; }
      links.forEach((l) => l.classList.toggle("on", l.dataset.spy === cur));
    };
    addEventListener("scroll", on, { passive: true }); on();
  }

  function mount(html) {
    const app = document.getElementById("app");
    app.innerHTML = html;
    if (FULL) {
      document.documentElement.classList.add("k-full");
      document.querySelectorAll("details").forEach((d) => (d.open = true));
      document.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = false; p.setAttribute("data-label", p.dataset.title || p.dataset.panel); });
      document.querySelectorAll("[data-tgroup][id]").forEach((p) => { p.hidden = false; });
      document.querySelectorAll("[data-toggle]").forEach((b) => b.setAttribute("aria-expanded", "true"));
      document.querySelectorAll("[data-card]").forEach((c) => c.setAttribute("data-open", ""));
    }
    spy();
    const stamp = () => {
      const blocks = [...new Set([...document.querySelectorAll("[data-b]")].map((n) => n.dataset.b))].sort();
      document.documentElement.dataset.height = document.documentElement.scrollHeight;
      document.documentElement.dataset.blocks = blocks.join(",");
    };
    requestAnimationFrame(stamp); setTimeout(stamp, 600);
  }

  window.K = { M, H, A, ic, crest, league, hue, team, card, evIcon, liveDot, form, letters, mini, miniStr, tick, nowLine, pend, meter, top, mr, hd, tm, B, mount, FULL };
})();
