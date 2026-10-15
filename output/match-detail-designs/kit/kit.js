/* Goal Hint match-details design kit: icons, atoms, data blocks and light interactions shared by
 * the ten samples. Each sample arranges these blocks and adds its own header, picks and chrome. */
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
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" fill="currentColor" stroke="none"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    cross: '<path d="M6 6l12 12M18 6L6 18"/>',
    dot: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
    ball: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.6l3.6 2.6-1.4 4.2H9.8l-1.4-4.2z" fill="currentColor"/><path d="M12 3.5v4.1M15.6 10.2l3.9-1.3M14.2 14.4l2.4 3.4M9.8 14.4l-2.4 3.4M8.4 10.2L4.5 8.9"/>',
    sub: '<path d="M8 19V6M4.5 9.5L8 6l3.5 3.5" stroke="#00824A"/><path d="M16 5v13M12.5 14.5L16 18l3.5-3.5" stroke="#C0362C"/>',
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
    home: '<path d="M4 11l8-6.5 8 6.5V20H4z"/><path d="M9.5 20v-5.5h5V20"/>',
    live: '<circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M8 8a5.6 5.6 0 000 8M16 8a5.6 5.6 0 010 8M5.2 5.2a9.6 9.6 0 000 13.6M18.8 5.2a9.6 9.6 0 010 13.6"/>',
    done: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.8 2.8L16.2 9.6"/>',
    more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor"/>',
    matches: '<rect x="3.5" y="5" width="17" height="14"/><path d="M12 5v14"/><circle cx="12" cy="12" r="2.6"/>',
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
  const evIcon = (type) => ({
    goal: ic("ball", 15), yellow: card("y"), red: card("r"), sub: ic("sub", 15),
    var: '<i class="k-var">VAR</i>', break: "",
  })[type];
  const liveDot = () => '<i class="k-live-dot" aria-hidden="true"></i>';
  /* Form letters arrive newest first; they are drawn oldest → newest so the latest sits at the right. */
  const form = (list, scores = false) => `<span class="k-fm">${[...list].reverse().map(([r, s, opp, v]) =>
    `<span title="${r} ${s} ${v === "H" ? "vs" : "at"} ${opp}"><i class="${r}">${r}</i>${scores ? `<small>${s}</small>` : ""}</span>`).join("")}</span>`;
  const letters = (list) => [...list].reverse().map((f) => f[0]).join("");
  const tick = (ok) => ok ? `<span class="k-now on">${ic("check", 12)}</span>` : `<span class="k-now off">${ic("clock", 12)}</span>`;
  const nowLine = (m) => `<span class="k-nowtxt ${m.live.ok ? "on" : "off"}">${m.live.ok ? ic("check", 12) : ic("clock", 12)}${m.live.text}</span>`;
  const pend = (label = "Pending") => `<span class="k-pend">${label}</span>`;
  const meter = (p, color = "var(--ok)") => `<span class="k-meter"><u style="width:${p}%;background:${color}"></u></span>`;
  const top = () => M.markets.find((m) => m.top);

  /* ---------- blocks ---------- */
  const B = {};

  B.events = () => `<div class="k-ev">${M.events.map((e) => {
    if (e.type === "break") return `<div class="k-ev-ht">${e.text}</div>`;
    const body = `<span class="t"><b>${e.player}</b><small>${e.sub}</small></span>`;
    const icon = `<span class="i">${evIcon(e.type)}</span>`;
    const score = e.score ? `<em class="k-ev-sc">${e.score}</em>` : "";
    return `<div class="k-ev-r">${e.side === "home" ? `<span class="e h">${score}${body}${icon}</span>` : "<span></span>"}<span class="m">${e.min}</span>${e.side === "away" ? `<span class="e a">${icon}${body}${score}</span>` : "<span></span>"}</div>`;
  }).join("")}</div>`;

  B.stats = (n = M.stats.length, from = 0) => `<div class="k-st">${M.stats.slice(from, n).map(([l, h, a, hv, av]) => {
    const t = hv + av || 1, hp = (hv / t) * 100, ap = (av / t) * 100;
    return `<div class="k-st-r"><b class="${hv >= av ? "lead" : ""}">${h}</b><span>${l}</span><b class="${av >= hv ? "lead" : ""}">${a}</b>
      <i class="k-sb"><u class="${hv >= av ? "lead" : ""}" style="width:${hp}%"></u><u class="${av >= hv ? "lead" : ""}" style="width:${ap}%"></u></i></div>`;
  }).join("")}</div>`;

  const marks = (m) => (m ? m.split(" ").map((x) => ({ goal: ic("ball", 11), yellow: card("y"), off: `<i class="k-off">${ic("sub", 11)}</i>`, on: `<i class="k-off">${ic("sub", 11)}</i>` })[x] || "").join("") : "");
  B.lineups = () => `<div class="k-lu">${["home", "away"].map((s) => {
    const l = M.lineups[s], t = team(s);
    return `<div><h4>${crest(t, 16)}<span>${t.name}</span><em>${l.formation}</em></h4><ol>${l.xi.map(([n, name, , m]) =>
      `<li><i>${n}</i><span>${name}</span>${marks(m)}</li>`).join("")}</ol></div>`;
  }).join("")}</div>`;

  B.bench = () => `<div class="k-lu bench">${["home", "away"].map((s) => {
    const l = M.lineups[s];
    return `<div><h5>Bench</h5><ol>${l.bench.map(([n, name, m]) => `<li><i>${n}</i><span>${name}</span>${m ? `<i class="k-in">${ic("sub", 11)} 6${s === "home" ? 3 : 6}'</i>` : ""}</li>`).join("")}</ol>
      <p class="k-coach"><span>Coach</span> ${l.coach}</p></div>`;
  }).join("")}</div>`;

  const lines = `<svg class="k-pitch-lines" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke">
    <rect x="1" y="1" width="98" height="138" vector-effect="non-scaling-stroke"/><path d="M1 70h98" vector-effect="non-scaling-stroke"/><circle cx="50" cy="70" r="11" vector-effect="non-scaling-stroke"/>
    <path d="M24 1v18h52V1M38 1v7h24V1M24 139v-18h52v18M38 139v-7h24v7" vector-effect="non-scaling-stroke"/></g></svg>`;
  const rows = (s) => {
    const l = M.lineups[s], by = new Map();
    l.xi.forEach((p) => { const r = +p[2].split(":")[0]; by.set(r, [...(by.get(r) || []), p]); });
    let out = [...by.entries()].sort((a, b) => a[0] - b[0]).map(([, ps]) => ps.sort((a, b) => +a[2].split(":")[1] - +b[2].split(":")[1]));
    if (s === "home") out = out.reverse(); else out = out.map((r) => r.reverse());
    return out.map((r) => `<div class="k-row">${r.map(([n, name, , m]) => {
      const rating = l.ratings[name];
      return `<span class="k-pl"><i style="--c:${team(s).color}">${n}${rating ? `<u class="${rating >= 7.5 ? "hi" : ""}">${rating.toFixed(1)}</u>` : ""}<span class="bd">${marks(m)}</span></i><em>${name}</em></span>`;
    }).join("")}</div>`).join("");
  };
  B.pitch = (opts = {}) => `<div class="k-pitch ${opts.cls || ""}">${lines}
    <div class="k-half away"><span class="k-fl">${A.name} · ${M.lineups.away.formation}</span>${rows("away")}</div>
    <div class="k-half home">${rows("home")}<span class="k-fl">${H.name} · ${M.lineups.home.formation}</span></div></div>`;

  B.injuries = () => `<div class="k-inj">${["home", "away"].map((s) => `<div><h5>${crest(team(s), 14)}${team(s).name}</h5>${M.injuries[s].map(([n, st, why]) =>
    `<p><b>${n}</b><span class="${st === "Out" ? "out" : "dbt"}">${st}</span><small>${why}</small></p>`).join("")}</div>`).join("")}</div>`;

  B.form = (scores = true) => `<div class="k-form">${["home", "away"].map((s) => {
    const f = M.form[s], w = f.filter((x) => x[0] === "W").length, d = f.filter((x) => x[0] === "D").length, l = f.length - w - d;
    return `<div class="k-form-r">${crest(team(s), 18)}<span class="n">${team(s).name}</span>${form(f, scores)}<em>${w}W ${d}D ${l}L</em></div>`;
  }).join("")}</div>`;

  B.formList = (s) => `<ul class="k-fl-list">${M.form[s].map(([r, sc, opp, v]) => `<li><i class="k-r ${r}">${r}</i><span>${v === "H" ? "vs" : "at"} ${opp}</span><b>${sc}</b></li>`).join("")}</ul>`;

  B.h2h = () => {
    const s = M.h2h.summary;
    return `<div class="k-h2h"><div class="k-h2h-s"><span><b>${s.home}</b>${H.name}</span><span><b>${s.draw}</b>Draws</span><span><b>${s.away}</b>${A.name}</span></div>
      <i class="k-h2h-bar"><u style="flex:${s.home};background:${H.color}"></u><u style="flex:${s.draw}"></u><u style="flex:${s.away || 0.0001};background:${A.color}"></u></i>
      <p class="k-h2h-m">Avg ${s.goals} goals · BTTS ${s.btts} · Over 2.5 ${s.over}</p>
      <ul>${M.h2h.meetings.map(([d, h, sc, a]) => { const [x, y] = sc.split("–").map(Number);
        return `<li><span class="d">${d}</span><span class="h ${x > y ? "w" : ""}">${h}</span><b>${sc}</b><span class="a ${y > x ? "w" : ""}">${a}</span></li>`; }).join("")}</ul></div>`;
  };

  B.table = () => `<table class="k-tbl"><thead><tr><th>#</th><th>Team</th><th>P</th><th>GD</th><th>Pts</th></tr></thead><tbody>${M.table.map(([p, n, pl, gd, pts]) => {
    const t = n === H.name ? H : n === A.name ? A : null;
    return `<tr class="${t ? "me" : ""}" ${t ? `style="--c:${t.color}"` : ""}><td>${p}</td><td>${n}</td><td>${pl}</td><td>${gd}</td><td><b>${pts}</b></td></tr>`;
  }).join("")}</tbody></table>`;

  B.season = () => `<div class="k-ss">${M.season.map(([l, h, a]) => `<div><b>${h}</b><span>${l}</span><b>${a}</b></div>`).join("")}</div>`;

  B.compare = () => `<div class="k-cmp">${M.compare.map(([l, h]) => `<div><span>${l}</span><b>${h}%</b><i><u style="width:${h}%"></u></i><b>${100 - h}%</b></div>`).join("")}</div>`;

  B.players = () => `<div class="k-ply"><div class="hd"><span>Player</span><span>G</span><span>A</span><span>Rating</span></div>${["home", "away"].map((s) => M.players[s].map(([n, pos, g, a, r]) =>
    `<div>${crest(team(s), 14)}<span class="n">${n} <small>${pos}</small></span><b>${g}</b><b>${a}</b><em>${r}</em></div>`).join("")).join("")}</div>`;

  B.info = () => `<dl class="k-info">
    <div>${ic("cal", 14)}<dt>Kick-off</dt><dd>${M.kickoff.day} · ${M.kickoff.time} ${M.kickoff.tz}</dd></div>
    <div>${ic("trophy", 14)}<dt>Competition</dt><dd>${M.league.name} · ${M.league.round}</dd></div>
    <div>${ic("stadium", 14)}<dt>Venue</dt><dd>${M.venue.name}, ${M.venue.city}</dd></div>
    <div>${ic("users", 14)}<dt>Capacity</dt><dd>${M.venue.capacity} · ${M.venue.surface}</dd></div>
    <div>${ic("whistle", 14)}<dt>Referee</dt><dd>${M.referee.name} (${M.referee.country})</dd></div></dl>`;

  B.schedule = () => `<div class="k-sch">${[["Rest", "rest"], ["Last", "last"], ["Next", "next"]].map(([l, k]) =>
    `<div><span>${M.schedule[k].home}</span><em>${l}</em><span>${M.schedule[k].away}</span></div>`).join("")}</div>`;

  B.news = () => `<ul class="k-news">${M.news.map((n) => `<li><a href="#"><b>${n.title}</b><small>${n.publisher} · ${n.kind} · ${n.ago} ago</small></a></li>`).join("")}</ul>`;

  B.odds = () => `<div class="k-odds">${M.markets.map((m) => `<div class="k-odds-r"><span class="mk" style="--h:${hue(m.id)}">${m.code}</span>${m.outcomes.map((o) =>
    `<span class="o ${o.k === m.pick ? "pick" : ""}"><small>${o.k}</small><b>${o.odds}</b></span>`).join("")}</div>`).join("")}<p class="k-meta">${M.oddsMeta}</p></div>`;

  B.history = () => `<ul class="k-hist">${M.history.map((h) => `<li><b>Rev ${h.rev}</b><span>${h.when}</span><small>${h.note}</small>${h.current ? '<em>Current</em>' : ""}</li>`).join("")}</ul>`;

  B.analysis = (opts = {}) => `<div class="k-an"><ol>${M.analysis.reasons.map((r) => `<li>${r}</li>`).join("")}</ol>
    <p class="k-unc">${ic("warn", 13)}<span><b>Watch out:</b> ${M.analysis.uncertainty}</span></p>
    ${opts.sources === false ? "" : `<p class="k-meta">Sources: ${M.analysis.sources.join(", ")} · evidence to ${M.publication.cutoff}</p>`}</div>`;

  B.outcomes = (m, opts = {}) => `<div class="k-out" style="--h:${hue(m.id)}">${m.outcomes.map((o) =>
    `<div class="${o.k === m.pick ? "pick" : ""}"><span class="l">${o.label.startsWith(o.k) ? "" : `<i>${o.k}</i>`}${o.label}</span>${meter(o.p, o.k === m.pick ? hue(m.id) : "var(--quiet)")}<b>${o.p}%</b>${opts.odds === false ? "" : `<em>${o.odds}</em>`}</div>`).join("")}
    ${opts.implied === false ? "" : `<p class="k-meta">Bookmakers imply ${m.outcomes.map((o) => `${o.k} ${o.implied}%`).join(" · ")}</p>`}</div>`;

  B.disc = () => `<p class="k-disc">${M.disclaimer}</p>`;

  /* ---------- chrome ---------- */
  B.bar = (title = "Match details", extra = "") => `<header class="bar"><a class="ic-b" href="#" aria-label="Back">${ic("back", 20)}</a><h1>${title}</h1>${extra}<button class="ic-b" aria-label="Share">${ic("share", 18)}</button></header>`;
  B.nav = () => `<nav class="nav"><a class="on" href="#">${ic("matches", 20)}Matches</a><a href="#">${ic("live", 20)}Live</a><a href="#">${ic("done", 20)}Results</a><a href="#">${ic("more", 20)}More</a></nav>`;

  /* ---------- interactions ---------- */
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href='#']");
    if (a) e.preventDefault();
    const t = e.target.closest("[data-tab]");
    if (t) {
      const g = t.dataset.group || "main";
      document.querySelectorAll(`[data-tab][data-group="${g}"],[data-tab]:not([data-group])`).forEach((b) => {
        if ((b.dataset.group || "main") === g) b.setAttribute("aria-selected", String(b.dataset.tab === t.dataset.tab));
      });
      document.querySelectorAll("[data-panel]").forEach((p) => { if ((p.dataset.group || "main") === g) p.hidden = p.dataset.panel !== t.dataset.tab; });
      const st = document.querySelector("[data-scrolltop]");
      if (st && st.getBoundingClientRect().top < 0) st.scrollIntoView();
      t.scrollIntoView({ block: "nearest", inline: "center" });
    }
    const j = e.target.closest("[data-jump]");
    if (j) { e.preventDefault(); const el = document.getElementById(j.dataset.jump); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - (+j.dataset.offset || 0), behavior: "smooth" }); }
    const x = e.target.closest("[data-toggle]");
    if (x) { const el = document.getElementById(x.dataset.toggle); if (el) { const open = el.hidden; document.querySelectorAll(`[data-tgroup="${x.dataset.tgroup}"]`).forEach((p) => { if (p !== el) p.hidden = true; }); el.hidden = !open; document.querySelectorAll(`[data-toggle][data-tgroup="${x.dataset.tgroup}"]`).forEach((b) => b.setAttribute("aria-expanded", String(b === x && open))); } }
  });

  function mount(html) {
    const app = document.getElementById("app");
    app.innerHTML = html;
    if (FULL) {
      document.documentElement.classList.add("full");
      document.querySelectorAll("details").forEach((d) => (d.open = true));
      document.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = false; p.setAttribute("data-label", p.dataset.title || p.dataset.panel); });
      document.querySelectorAll("[data-tgroup][id]").forEach((p) => { p.hidden = false; });
    }
    requestAnimationFrame(() => { document.title = document.title.replace(/ \[\d+\]$/, "") + ` [${document.documentElement.scrollHeight}]`; });
    setTimeout(() => { document.title = document.title.replace(/ \[\d+\]$/, "") + ` [${document.documentElement.scrollHeight}]`; }, 600);
  }

  window.K = { M, H, A, ic, crest, league, hue, team, card, evIcon, liveDot, form, letters, tick, nowLine, pend, meter, top, B, mount, FULL };
})();
