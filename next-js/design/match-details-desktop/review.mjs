import { variants, tabs, viewers, statuses, reviewState } from "./catalog.mjs";

const root = document.querySelector("#studio"), dialog = document.querySelector("#detail-dialog");
const storageKey = "goal-hint-match-details-review-v1";
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const date = value => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Kampala" }).format(new Date(value));
let state = reviewState(new URLSearchParams(location.search)), fixture = null, loading = true, failed = false;
let pending, focusMode = false, favoritesOnly = false, feedbackTimer;
const controls = { h2h: "three", competition: "all", venue: "all", market: "All", lineup: "number", stat: "form", events: "all" };
let saved;
try { saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}"); } catch { saved = {}; }
const favorites = new Set(Array.isArray(saved?.favorites) ? saved.favorites.filter(id => variants.some(item => item.id === id)) : []);
const notes = saved?.notes && typeof saved.notes === "object" && !Array.isArray(saved.notes) ? saved.notes : {};
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify({ favorites: [...favorites], notes })); }
  catch { feedback("Browser storage is unavailable. Your choices remain available for this session."); }
}
function feedback(message) {
  const target = document.querySelector("#feedback"); target.textContent = message; target.classList.add("visible");
  clearTimeout(feedbackTimer); feedbackTimer = setTimeout(() => target.classList.remove("visible"), 3500);
}

const paths = {
  arrow: '<path d="m9 5 7 7-7 7"/>', back: '<path d="m15 5-7 7 7 7"/>', link: '<path d="m9 15 6-6M7 17l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 0 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(2 -1)"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  chart: '<path d="M4 20V4m0 16h17M8 16v-5m5 5V7m5 9V4"/>', versus: '<path d="M3 8h14m-4-4 4 4-4 4M21 16H7m4-4-4 4 4 4"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v16"/>',
  shirt: '<path d="m8 3-5 3-2 5 4 2 2-3v11h10V10l2 3 4-2-2-5-5-3c-1 3-7 3-8 0Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>', stadium: '<path d="m3 8 9-5 9 5v12H3V8Zm0 6h18M7 7v5m5-8v8m5-5v5M7 20v-3m5 3v-3m5 3v-3"/>',
  document: '<path d="M5 3h10l4 4v14H5V3Zm10 0v5h4M8 12h8m-8 4h6"/>', lock: '<rect x="5" y="10" width="14" height="11" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
  check: '<path d="m5 12 4 4L19 6"/>', people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-17a3 3 0 0 1 0 6m1 4a5 5 0 0 1 4 5v2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>', whistle: '<path d="m14 7 7-3v7l-5 3a6 6 0 1 1-5-7h3Zm2 1v5M8 7V3M4 8 1 5"/><circle cx="10" cy="13" r="2"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  goal: '<circle cx="12" cy="12" r="9"/><path d="m12 7 5 4-2 6H9l-2-6 5-4Zm0 0V3m5 8 4-1m-6 7 2 4m-8-4-2 4m0-10-4-1"/>',
  card: '<rect x="6" y="3" width="12" height="18" rx="1" fill="currentColor" stroke="none"/>', sub: '<path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4"/>',
  expand: '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/>', note: '<path d="M14 4H4v17h17V11M10 14l1-5 7-7 4 4-7 7-5 1Z"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
function icon(name, extra = "") { return `<svg class="icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.target}</svg>`; }
function crest(team, size = "") { return `<span class="crest ${size}" style="--team:${team.color}" aria-hidden="true"><svg viewBox="0 0 60 70"><path d="M5 4h50v35c0 12-13 22-25 27C18 61 5 51 5 39Z" fill="var(--team)"/><path d="M10 9h40v29c0 10-10 18-20 23C20 56 10 48 10 38Z" fill="none" stroke="#fff" stroke-opacity=".7"/><path d="M10 22h40M10 48h40" stroke="#fff" stroke-opacity=".35"/><text x="30" y="43" text-anchor="middle" fill="white" font-size="27" font-family="Georgia" font-weight="bold">${team.code[0]}</text></svg></span>`; }
const label = (text, className = "") => `<span class="eyebrow ${className}">${text}</span>`;
const chip = (text, className = "") => `<span class="chip ${className}">${text}</span>`;
const button = (text, action, className = "", extra = "") => `<button type="button" class="button ${className}" data-action="${action}" ${extra}>${text}</button>`;
function options(items, selected) { return items.map(item => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${escape(item.name)}</option>`).join(""); }
function select(name, items, selected, attributes = "") { return `<select aria-label="${name}" ${attributes}>${options(items, selected)}</select>`; }

function studioHeader(variant) {
  const index = variants.indexOf(variant);
  return `<header class="studio-toolbar"><div class="studio-title">${label("DESIGN REVIEW · DESKTOP")}<strong>Match details <span>studio</span></strong></div>
    <div class="variant-picker">${button(icon("back"), "previous", "icon-button", 'aria-label="Previous variant" title="Previous variant · Alt + Left"')}
    ${select("Design variant", variants.map((item, i) => ({ id: item.id, name: `${String(i + 1).padStart(2, "0")} / ${item.name}` })), variant.id, 'data-state="variant"')}
    ${button(icon("arrow"), "next", "icon-button", 'aria-label="Next variant" title="Next variant · Alt + Right"')}</div>
    <div class="state-controls"><label>Viewing as${select("Viewing as", viewers, state.viewer, 'data-state="viewer"')}</label>
    <label>Match status${select("Match status", statuses, state.status, 'data-state="status"')}</label></div>
    <div class="studio-actions">${button(icon("link"), "copy", "icon-button", 'aria-label="Copy review link" title="Copy this exact review link"')}${button(icon("expand"), "focus", "icon-button", `aria-label="${focusMode ? "Show design navigator" : "Focus preview"}" title="Focus preview" aria-pressed="${focusMode}"`)}</div>
    <span class="sr-only" aria-live="polite">Variant ${index + 1} of 10, ${variant.name}</span></header>`;
}
function sidebar(variant) {
  return `<aside class="studio-sidebar" aria-label="Design review navigator"><div class="sidebar-intro">${label("TEN WAYS TO SEE THE GAME")}<h1>One match.<br>Ten perspectives.</h1><p>Switch designs. Explore the tabs.<br>Find your matchday experience.</p></div>
    <div class="sidebar-list-heading"><span>DESIGNS <b>10</b></span>${button(icon("star") + ` ${favorites.size}`, "filter-favorites", "shortlist-filter", `aria-label="Show shortlisted variants" aria-pressed="${favoritesOnly}"`)}</div>
    <nav class="design-list" aria-label="Desktop variants">${variants.filter(item => !favoritesOnly || favorites.has(item.id)).map(item => {
      const i = variants.indexOf(item);
      return `<button class="design-option ${variant.id === item.id ? "selected" : ""}" type="button" data-variant="${item.id}" aria-current="${variant.id === item.id ? "true" : "false"}"><span class="design-number">${String(i + 1).padStart(2, "0")}</span><span><strong>${item.name}</strong><small>${item.tag}</small></span><span class="design-swatch" style="--swatch:${item.accent};--swatch-surface:${item.surface}" aria-hidden="true"></span>${favorites.has(item.id) ? '<span class="saved-star" aria-label="Shortlisted">★</span>' : ""}</button>`;
    }).join("") || '<p class="empty-shortlist">Star a design to add it here.</p>'}</nav>
    <div class="sidebar-bottom"><p>${icon("lock")} Local design sandbox</p><span>Illustrative fixture, players and data.<br>Access controls simulate real states.</span></div></aside>`;
}
function productHeader() {
  return `<header class="product-header"><img class="product-logo" src="/logo.svg" width="139" height="20" alt="Goal Hint"><nav aria-label="Sample app navigation"><button data-action="preview-nav">Best slips</button><button class="active" data-action="preview-nav">Matches</button><button data-action="preview-nav">Slip builder</button><button data-action="preview-nav">Results</button></nav><div class="account-status">${chip(fixture.canView ? icon("check") + (fixture.accessReason === "completed" ? "Public result" : state.viewer === "referral" ? "Earned access" : "Full access") : icon("user") + (state.viewer === "guest" ? "Guest" : "Free account"), fixture.canView ? "good" : "")}${button(icon("user"), "account", "icon-button", 'aria-label="Preview account details"')}</div></header>`;
}
function matchHeader() {
  const status = state.status;
  const stamp = status === "live" ? '<span class="live-dot"></span> LIVE · 67′' : status === "finished-regulation" ? "FULL-TIME" : status === "postponed" ? "POSTPONED" : "KICKOFF · 20:30 EAT";
  return `<section class="scoreboard" aria-labelledby="match-title"><div class="match-context">${crest(fixture.home, "tiny")}<span>${fixture.competition}</span><i>·</i><span>${fixture.round}</span><i>·</i><time datetime="${fixture.kickoff}">Sat, 31 Oct 2026</time></div>
    <h1 class="sr-only" id="match-title">${fixture.home.name} vs ${fixture.away.name}</h1>
    <div class="team home-team"><div class="team-copy">${label("HOME")}<strong>${fixture.home.name}</strong><span>${fixture.home.city}</span></div>${crest(fixture.home)}</div>
    <div class="match-score"><strong>${fixture.score ? `${fixture.score.home}<span>:</span>${fixture.score.away}` : status === "postponed" ? "—" : '<span class="versus">VS</span>'}</strong><span class="status ${status === "live" ? "live" : ""}">${stamp}</span></div>
    <div class="team away-team">${crest(fixture.away)}<div class="team-copy">${label("AWAY")}<strong>${fixture.away.name}</strong><span>${fixture.away.city}</span></div></div></section>`;
}
function gate() {
  const guest = state.viewer === "guest";
  return `<div class="access-gate" data-access-gate><div class="gate-icon">${icon("lock")}</div><div class="gate-main">${label("FEATURED PREDICTION · LOCKED")}<h2>${guest ? "Your match insight starts here." : "Unlock the thinking behind the match."}</h2><p>${guest ? "Create an account to subscribe or earn access by inviting friends." : "Subscribe for full predictions, or earn access through your referral link."}</p><div class="gate-actions">${button(guest ? "Create free account " + icon("arrow") : "View subscription plans " + icon("arrow"), guest ? "register" : "subscribe", "primary")}${button(guest ? "Sign in" : icon("people") + " Invite friends", guest ? "signin" : "referrals", "secondary")}</div></div><div class="referral-guidance">${icon("people")}<strong>A friend joins. You earn a day.</strong><p>One eligible friend registers through your link and verifies their phone. You earn 1 day of access.</p><span>Completed-match predictions are free for everyone.</span></div></div>`;
}
function featured() {
  if (!fixture.canView) return gate();
  const pick = fixture.forecasts.featured;
  return `<section class="featured" aria-label="Featured prediction" data-featured><div class="featured-lead"><div class="prediction-icon">${icon("target")}</div><div>${label("FEATURED PREDICTION")}<h2>${pick.market} <span>·</span> <b>${pick.selection}</b></h2><p>${state.status === "finished-regulation" ? "Published before kickoff · Both teams scored" : state.viewer === "referral" ? "Unlocked with your earned referral access" : "Our leading selection for this match"}</p></div></div><div class="prediction-numbers"><div class="probability"><strong>${pick.probability}<small>%</small></strong><span>Estimated probability</span><div class="probability-track"><i style="width:${pick.probability}%"></i></div></div><div class="odds"><strong>${pick.odds.toFixed(2)}</strong><span>Sample odds</span></div></div><div class="featured-action">${chip(state.status === "finished-regulation" ? icon("check") + " Correct" : icon("check") + " Prediction available", "good")}${button("Why this pick? " + icon("arrow"), "featured-reason", "text-button")}</div></section>`;
}
function tabNavigation(variant) {
  const vertical = variant.layout === "vertical", grouped = variant.id === "dugout";
  const groups = { stats: "THE TEAMS", markets: "THE PREDICTIONS", events: "THE MATCH" };
  return `<nav class="section-navigation" aria-label="Match information"><div role="tablist" aria-label="Match detail sections" aria-orientation="${vertical ? "vertical" : "horizontal"}">${tabs.map((tab, i) => `${grouped && groups[tab.id] ? `<span class="nav-group" role="presentation">${groups[tab.id]}</span>` : ""}<button type="button" role="tab" id="tab-${tab.id}" aria-controls="match-panel" aria-selected="${state.tab === tab.id}" tabindex="${state.tab === tab.id ? "0" : "-1"}" data-tab="${tab.id}"><span class="tab-number">${String(i + 1).padStart(2, "0")}</span>${icon(tab.icon)}<span>${vertical ? tab.name : tab.short}</span>${((tab.id === "markets" || tab.id === "analysis") && !fixture.canView) ? icon("lock", "tab-lock") : ""}${vertical ? icon("arrow", "tab-arrow") : ""}</button>`).join("")}</div></nav>`;
}
function panelHeading(kicker, title, text, extra = "") { return `<div class="panel-heading"><div>${label(kicker)}<h2>${title}</h2><p>${text}</p></div>${extra}</div>`; }
function comparisonRows(metrics) {
  return `<div class="comparison-legend"><span>${crest(fixture.home, "tiny")} Arsenal</span><span>Liverpool ${crest(fixture.away, "tiny")}</span></div><div class="comparison-rows">${metrics.map(metric => `<div class="comparison-row"><div><strong>${metric.home}${metric.suffix ?? ""}</strong><span>${metric.name}</span><strong>${metric.away}${metric.suffix ?? ""}</strong></div><div class="comparison-tracks"><span><i style="width:${metric.home / metric.max * 100}%"></i></span><span><i style="width:${metric.away / metric.max * 100}%"></i></span></div></div>`).join("")}</div>`;
}
function formTable(group) {
  return `<section class="form-card"><div class="form-heading"><span>${crest(group.team, "small")}<strong>${group.team.name}</strong></span><b>${group.points}<small> / 15 pts</small></b></div><div class="form-results">${group.records.map(row => `<span class="result ${row.scored > row.conceded ? "win" : row.scored === row.conceded ? "draw" : "loss"}" title="${row.opponent}: ${row.scored}–${row.conceded}">${row.scored > row.conceded ? "W" : row.scored === row.conceded ? "D" : "L"}</span>`).join("")}<span class="muted">Latest first</span></div><div class="recent-results">${group.records.map(row => `<div><time>${date(row.date).slice(0, 6)}</time><span class="venue-code">${row.venue}</span><span>${row.opponent}</span><strong>${row.scored} – ${row.conceded}</strong></div>`).join("")}</div></section>`;
}
function statsPanel() {
  const current = controls.stat === "match" && fixture.liveStats;
  const selectMode = fixture.liveStats ? `<div class="segmented" aria-label="Statistics scope">${button("Recent form", "stat-form", controls.stat === "form" ? "selected" : "", `aria-pressed="${controls.stat === "form"}"`)}${button("This match", "stat-match", controls.stat === "match" ? "selected" : "", `aria-pressed="${controls.stat === "match"}"`)}</div>` : chip("LAST 5 MATCHES", "subtle");
  return panelHeading("THE TEAM COMPARISON", current ? "The match in numbers" : "Two teams. The recent picture.", current ? (state.status === "live" ? "Live sample statistics · Through 67 minutes" : "Full-time sample statistics · Regulation time") : "All competitions · Last five completed matches · Per-match averages", selectMode)
    + `<div class="stats-layout"><section class="metric-card"><div class="card-heading"><h3>${current ? "Match statistics" : "Performance comparison"}</h3>${icon("chart")}</div>${comparisonRows(current ? fixture.liveStats : fixture.comparisons)}<p class="data-note">${current ? "Match totals are separate from the recent-form sample." : "Per-match averages from the previous five completed fixtures."}</p></section><section class="form-section"><div class="card-heading"><h3>Recent results</h3>${label("LAST FIVE")}</div><div class="form-grid">${fixture.form.map(formTable).join("")}</div></section></div>`;
}
function h2hPanel() {
  const rows = fixture.meetings.filter(row => (controls.h2h !== "three" || row.date >= "2023-08-01") && (controls.competition === "all" || row.competition === controls.competition) && (controls.venue === "all" || row.home.id === controls.venue)).slice(0, 20);
  const wins = rows.filter(row => (row.homeScore > row.awayScore ? row.home.id : row.homeScore < row.awayScore ? row.away.id : "draw") === "ars").length;
  const draws = rows.filter(row => row.homeScore === row.awayScore).length;
  const count = rows.length;
  return panelHeading("THE PREVIOUS MEETINGS", "History, on both sides.", "Only meetings between these two teams. All competitions and both home grounds.", chip(`${count} available meetings`, "subtle"))
    + `<div class="filter-row"><label>History window${select("History window", [{ id: "three", name: "Last 3 seasons" }, { id: "all", name: "Up to 20 meetings" }], controls.h2h, 'data-control="h2h"')}</label><label>Competition${select("H2H competition", [{ id: "all", name: "All competitions" }, { id: "Premier League", name: "Premier League" }, { id: "FA Cup", name: "FA Cup" }, { id: "League Cup", name: "League Cup" }], controls.competition, 'data-control="competition"')}</label><label>Ground${select("H2H ground", [{ id: "all", name: "Both grounds" }, { id: "ars", name: "Arsenal at home" }, { id: "liv", name: "Liverpool at home" }], controls.venue, 'data-control="venue"')}</label></div>
    ${count ? `<section class="h2h-balance" aria-label="Head-to-head summary"><div><strong>${wins}</strong><span>Arsenal wins</span></div><div><strong>${draws}</strong><span>Draws</span></div><div><strong>${count - wins - draws}</strong><span>Liverpool wins</span></div><div class="h2h-strip"><i style="flex:${wins};background:var(--home)"></i><i style="flex:${draws};background:var(--neutral)"></i><i style="flex:${count - wins - draws};background:var(--away)"></i></div></section><div class="table-wrap"><table class="h2h-table"><caption class="sr-only">Previous Arsenal and Liverpool meetings</caption><thead><tr><th>Date</th><th>Competition</th><th class="align-right">Home</th><th class="center">Score</th><th>Away</th></tr></thead><tbody>${rows.map(row => `<tr><td><time>${date(row.date)}</time></td><td><span class="competition-label">${row.competition}</span></td><td class="align-right">${row.home.name} ${crest(row.home, "tiny")}</td><td class="center"><b class="score-cell">${row.homeScore} – ${row.awayScore}</b></td><td>${crest(row.away, "tiny")} ${row.away.name}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state">${icon("versus")}<h3>No meetings match these filters.</h3><p>Try both grounds or all competitions.</p></div>`}
    <p class="data-note">Newest first · Up to 20 available meetings · No unrelated team results are included.</p>`;
}
function standingsPanel() {
  return panelHeading("THE COMPETITION", "The table tells its own story.", "Premier League · Illustrative standings before this fixture", chip("20 CLUBS", "subtle"))
    + `<div class="table-wrap"><table class="standings-table"><caption class="sr-only">Premier League sample standings</caption><thead><tr><th>#</th><th>Club</th><th>MP</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>${fixture.table.map(row => `<tr class="${row.name === "Arsenal" || row.name === "Liverpool" ? "highlighted" : ""}"><td><span class="position ${row.position <= 4 ? "qualification" : row.position >= 18 ? "relegation" : ""}">${row.position}</span></td><th scope="row">${row.name === "Arsenal" ? crest(fixture.home, "tiny") : row.name === "Liverpool" ? crest(fixture.away, "tiny") : `<span class="club-monogram" aria-hidden="true">${row.name[0]}</span>`}${row.name}${row.name === "Arsenal" || row.name === "Liverpool" ? '<span class="table-team-marker">THIS MATCH</span>' : ""}</th><td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td>${row.gd > 0 ? "+" : ""}${row.gd}</td><td><strong>${row.points}</strong></td></tr>`).join("")}</tbody></table></div><div class="table-key"><span><i class="key-square qualification"></i>Qualification places</span><span><i class="key-square relegation"></i>Relegation places</span><span>Positions shown for design review.</span></div>`;
}
function pitchLines() {
  return '<svg class="pitch-lines" viewBox="0 0 340 460" preserveAspectRatio="none" aria-hidden="true"><rect x="12" y="12" width="316" height="436"/><path d="M12 230h316M74 12v75h192V12M121 12v30h98V12M74 448v-75h192v75M121 448v-30h98v30M150 12V3h40v9m-40 436v9h40v-9"/><circle cx="170" cy="230" r="43"/><circle cx="170" cy="230" r="2"/><circle cx="170" cy="66" r="2"/><circle cx="170" cy="394" r="2"/><path d="M132 87a43 43 0 0 0 76 0m-76 286a43 43 0 0 1 76 0"/></svg>';
}
function playerMarkup(player, squad, index, substitute = false) {
  const detail = controls.lineup === "age" ? `${player.age} yrs` : controls.lineup === "rating" ? player.rating.toFixed(1) : player.number;
  const content = `${player.photo ? `<img class="player-photo" src="${escape(player.photo)}" alt="">` : `<span class="player-shirt">${icon("shirt")}<b>${player.number}</b></span>`}<span class="player-name">${escape(player.name)}</span>${controls.lineup !== "number" || player.photo ? `<span class="player-detail ${controls.lineup === "rating" ? "rating" : ""}">${detail}</span>` : ""}`;
  return `<button type="button" class="${substitute ? "substitute" : "pitch-player"}" data-player="${squad.team.id}-${substitute ? "sub" : "start"}-${index}" ${substitute ? "" : `style="left:${player.x}%;top:${player.y}%"`} aria-label="${escape(player.name)}, ${player.position}, ${squad.team.name}, ${controls.lineup === "rating" ? "last match rating" : controls.lineup === "age" ? "age" : "shirt number"} ${detail}">${content}</button>`;
}
function lineupsPanel() {
  const confirmed = state.status === "live" || state.status === "finished-regulation";
  return panelHeading("THE PEOPLE ON THE PITCH", "Shape. Roles. Individuals.", `${confirmed ? "Sample confirmed" : "Provisional sample"} lineups · Select a player for their profile · Attacking direction ↑`, chip(confirmed ? "SAMPLE TEAM SHEETS" : "PROVISIONAL", "subtle"))
    + `<div class="lineup-controls"><label>Player detail${select("Player detail", [{ id: "number", name: "Shirt number" }, { id: "age", name: "Age" }, { id: "rating", name: "Last-match rating" }], controls.lineup, 'data-control="lineup"')}</label><p>${controls.lineup === "rating" ? "Ratings refer to each player’s previous appearance, not a prediction for this match." : "Names stay visible in every mode. Portraits fall back to team shirts when unavailable."}</p></div><div class="lineup-grid">${fixture.squads.map(squad => `<section class="squad" style="--kit:${squad.team.color}"><div class="squad-heading"><span>${crest(squad.team, "small")}<strong>${squad.team.name}</strong></span><b>${squad.formation}</b></div><div class="pitch" aria-label="${squad.team.name} ${squad.formation} formation">${pitchLines()}${squad.starters.map((player, i) => playerMarkup(player, squad, i)).join("")}</div><div class="manager"><span class="role-avatar">${icon("user")}</span><div>${label("MANAGER")}<strong>${squad.manager}</strong></div><span class="manager-label">Technical area</span></div><div class="bench"><h3>Substitutes <span>${squad.substitutes.length}</span></h3>${squad.substitutes.map((player, i) => playerMarkup(player, squad, i, true)).join("")}</div></section>`).join("")}</div><p class="data-note">Illustrative players and managers · Portraits unavailable in this fixture · No inferred injury or selection claims.</p>`;
}
function marketsPanel() {
  if (!fixture.canView) return panelHeading("THE OTHER POSSIBILITIES", "Find a different angle.", "Additional selections are organized by market once access is available.")
    + `<div class="empty-state restricted-markets">${icon("lock")}<h3>Additional markets will appear here.</h3><p>Use the access options above to see the selections, estimated probabilities and available odds.</p>${button("Go to access options " + icon("arrow"), "jump-access", "secondary")}</div>`;
  const rows = fixture.forecasts.markets.filter(row => controls.market === "All" || row.category === controls.market);
  return panelHeading("THE OTHER POSSIBILITIES", "Find a different angle.", "Additional model selections · The featured prediction appears only above", chip(`${fixture.forecasts.markets.length} MARKETS`, "subtle"))
    + `<div class="market-toolbar"><div class="segmented" aria-label="Market category">${["All", "Result", "Goals"].map(item => button(item, `market-${item}`, controls.market === item ? "selected" : "", `aria-pressed="${controls.market === item}"`)).join("")}</div><span>Model estimate <i>≠</i> bookmaker odds</span></div><div class="table-wrap"><table class="markets-table"><caption class="sr-only">Additional prediction markets</caption><thead><tr><th>Market</th><th>Prediction</th><th>Probability</th><th>Sample odds</th><th><span class="sr-only">Explanation</span></th></tr></thead><tbody>${rows.map(row => `<tr><td><span class="market-icon">${icon(row.category === "Goals" ? "goal" : "target")}</span><strong>${row.market}</strong></td><td>${chip(row.selection, "selection")}</td><td><div class="market-probability"><b>${row.probability}%</b><span><i style="width:${row.probability}%"></i></span></div></td><td><b>${row.odds === null ? "—" : row.odds.toFixed(2)}</b>${row.odds === null ? '<small class="odds-unavailable">Unavailable</small>' : ""}</td><td>${button(icon("arrow"), `market-reason-${row.id}`, "icon-button", `aria-label="Explain ${row.market}"`)}</td></tr>`).join("")}</tbody></table></div><div class="market-footnote">${icon("document")}<p>Model probabilities estimate how often an outcome may occur. Odds are sample decimal prices and may be unavailable.</p></div>`;
}
function eventsPanel() {
  const rows = fixture.events.filter(row => controls.events === "all" || row.type === controls.events);
  return panelHeading("THE MATCH, MOMENT BY MOMENT", "Every turning point.", state.status === "live" ? "Live sample timeline · Events through 67 minutes" : state.status === "finished-regulation" ? "Completed sample timeline · Chronological order" : "The timeline becomes available when the match starts.")
    + (fixture.events.length ? `<div class="filter-row"><label>Event type${select("Event type", [{ id: "all", name: "All events" }, { id: "goal", name: "Goals" }, { id: "card", name: "Cards" }, { id: "sub", name: "Substitutions" }], controls.events, 'data-control="events"')}</label></div><div class="timeline">${rows.map(row => `<article class="timeline-event ${row.side}"><time>${row.minute}′</time><span class="event-symbol ${row.type}">${icon(row.type)}</span><div><strong>${row.title}</strong><p>${row.detail}</p></div>${row.side !== "neutral" ? crest(row.side === "home" ? fixture.home : fixture.away, "small") : ""}</article>`).join("")}</div>` : `<div class="empty-state">${icon("clock")}<h3>${state.status === "postponed" ? "Waiting for a new kickoff." : "The story is still to come."}</h3><p>${state.status === "postponed" ? "Events will appear when the rescheduled match begins." : "Goals, cards, substitutions and match milestones will appear here."}</p></div>`);
}
function stadiumArt() {
  return '<svg class="stadium-art" viewBox="0 0 640 300" role="img" aria-label="Illustration of a football stadium and its pitch"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#b9d1d4"/><stop offset="1" stop-color="#e4e8da"/></linearGradient></defs><rect width="640" height="300" fill="url(#sky)"/><path d="M0 100 100 58h440l100 42v180H0Z" fill="#415763"/><path d="M20 109 113 72h414l93 37-80 117H100Z" fill="#f1eee2"/><path d="m45 119 78-29h394l78 29-71 94H116Z" fill="#a94e4c"/><path d="m66 131 66-25h376l66 25-65 71H131Z" fill="#536975"/><path d="m90 140 51-19h358l51 19-49 56H139Z" fill="#c96b61"/><path d="M90 140h460M76 125h488m-464 32h440m-428 19h416" stroke="#f5dcd0" stroke-width="3"/><path d="m150 155 80-29h180l80 29-40 112H190Z" fill="#508765"/><path d="m160 162 76-27h168l76 27-38 95H198Z" fill="none" stroke="#e1eed5"/><path d="M177 209h286m-183-74-8 29h96l-8-29m-145 122 12-30h90l12 30" fill="none" stroke="#e1eed5"/><ellipse cx="320" cy="209" rx="30" ry="13" fill="none" stroke="#e1eed5"/><path d="M0 279h640v21H0Z" fill="#314b46"/></svg>';
}
function venuePanel() {
  const v = fixture.venue;
  return panelHeading("THE SETTING & THE OFFICIALS", "A place. A pitch. The people in charge.", "Venue and officiating information · Illustrative assignment and conditions")
    + `<div class="venue-grid"><section class="venue-card">${stadiumArt()}<div class="venue-copy">${label("THE GROUND")}<h3>${v.name}</h3><p>${icon("pin")}${v.location}</p><dl class="venue-facts"><div><dt>Capacity</dt><dd>${v.capacity}</dd></div><div><dt>Pitch dimensions</dt><dd>${v.pitch}</dd></div><div><dt>Playing surface</dt><dd>${v.surface}</dd></div></dl><div class="weather">${icon("sun")}<strong>${v.weather}</strong><div>${v.conditions}<small>Sample conditions · Not a forecast</small></div></div></div></section><div class="officials"><section class="referee-card"><div class="referee-portrait">${icon("user")}<span>${icon("whistle")}</span></div>${label("MATCH REFEREE")}<h3>${v.referee}</h3><p>On-field official</p><div class="official-role">${icon("whistle")} Controls the match and applies the laws of the game.</div></section><section class="official-team"><h3>Officiating team</h3><div>${icon("people")}<span>${label("ASSISTANT REFEREES")}<strong>${v.assistant}</strong></span></div><div>${icon("document")}<span>${label("VIDEO ASSISTANT REFEREE")}<strong>${v.var}</strong></span></div></section></div></div>`;
}
function analysisPanel() {
  return panelHeading("THE CONTEXT BEHIND THE GAME", "Read the match, beyond the numbers.", "Reporting, possible outcomes, and the evidence behind them", chip("ILLUSTRATIVE ANALYSIS", "subtle"))
    + `<div class="analysis-grid"><div><section class="analysis-story"><div class="article-heading">${label("MATCH BRIEFING")}<span>${icon("document")} AI-assisted · Sample</span></div><h3>A midfield contest with room on the wings.</h3><p>Both formations place considerable responsibility on the central midfielders. The home side’s overlapping runs can create width, while the visitors’ double pivot provides cover for transitions.</p><p>Team-sheet changes, early bookings and set pieces can change that balance. Confirmed information should take priority over an assumed tactical pattern.</p></section>
    <section class="scenarios"><div class="card-heading"><h3>Possible result scenarios</h3>${icon(fixture.canView ? "target" : "lock")}</div>${fixture.canView ? fixture.forecasts.scenarios.map(row => `<article><div><strong>${row.title}</strong>${icon("arrow")}</div><p>${row.text}</p></article>`).join("") : `<div class="scenario-lock">${icon("lock")}<strong>Predictive scenarios require access.</strong><p>Unlock the featured prediction above to read result explanations.</p>${button("Go to access options", "jump-access", "secondary")}</div>`}</section></div><aside class="news-column"><div class="card-heading"><h3>Match news</h3>${icon("document")}</div>${fixture.news.map(row => `<article class="news-card">${label(row.tag)}<h3>${row.title}</h3><p>${row.text}</p><span>${row.source} · ${row.time}</span></article>`).join("")}<details class="sources"><summary>Sources & verification ${icon("arrow")}</summary><p>These are example source categories, not fetched reports. Published analysis must link to the actual trusted evidence used.</p>${fixture.sources.map(source => `<div><strong>${source.name}</strong><span>${source.scope}</span></div>`).join("")}<p>Sample content only. No live article or AI research has been fetched.</p></details></aside></div>`;
}
const panels = { stats: statsPanel, h2h: h2hPanel, standings: standingsPanel, lineups: lineupsPanel, markets: marketsPanel, events: eventsPanel, venue: venuePanel, analysis: analysisPanel };

function render() {
  const variant = variants.find(item => item.id === state.variant);
  const oldFocus = document.activeElement;
  const focusAttribute = oldFocus?.dataset?.state ? `[data-state="${oldFocus.dataset.state}"]` : oldFocus?.dataset?.control ? `[data-control="${oldFocus.dataset.control}"]` : null;
  root.className = focusMode ? "focus-mode" : "";
  root.innerHTML = `${studioHeader(variant)}${sidebar(variant)}<div class="studio-workspace"><div class="review-strip"><div><span class="review-index">${String(variants.indexOf(variant) + 1).padStart(2, "0")} / 10</span><strong>${variant.name}</strong><span class="variant-description">${variant.description}</span></div><div>${button(icon("note"), "notes", "icon-button", 'aria-label="Review notes" title="Save notes about this design"')}${button(icon("star") + (favorites.has(variant.id) ? " Shortlisted" : " Shortlist"), "favorite", `favorite-button ${favorites.has(variant.id) ? "saved" : ""}`, `aria-pressed="${favorites.has(variant.id)}"`)}</div></div>
    <main class="product variant-${variant.id} layout-${variant.layout} style-${variant.style}" id="match-screen" data-variant-id="${variant.id}" tabindex="-1">${loading || failed || !fixture ? `<div class="loading-state" role="status">${failed ? '<h2>Unable to load the preview.</h2><p>Check the local server and try again.</p>' + button("Retry preview", "retry", "primary") : '<div class="loading-line"></div><p>Preparing the match preview…</p>'}</div>` : `${productHeader()}<div class="match-body"><div class="match-breadcrumb"><span>${icon("back")} Matches <i>/</i> Match details</span><span class="sample-label">DESIGN FIXTURE · SYNTHETIC DATA</span></div>${matchHeader()}${featured()}<div class="match-workspace">${tabNavigation(variant)}<section class="tab-panel" id="match-panel" role="tabpanel" aria-labelledby="tab-${state.tab}" tabindex="0" data-active-tab="${state.tab}">${panels[state.tab]()}</section></div><footer class="product-footer"><span>GOAL HINT <i>·</i> Know the game.</span><span>Illustrative fixture and people · Estimates are not guarantees.</span></footer></div>`}</main></div>`;
  document.title = `${String(variants.indexOf(variant) + 1).padStart(2, "0")} ${variant.name} · Match Details Studio`;
  root.dataset.ready = String(!loading && !failed);
  if (focusAttribute) root.querySelector(focusAttribute)?.focus({ preventScroll: true });
}
async function load() {
  pending?.abort(); pending = new AbortController();
  const signal = pending.signal; loading = true; failed = false; fixture = null; render();
  try {
    const response = await fetch(`/api/fixture?viewer=${state.viewer}&status=${state.status}`, { signal, cache: "no-store" });
    if (!response.ok) throw new Error("Preview unavailable");
    const data = await response.json();
    if (signal.aborted) return;
    fixture = data; loading = false; render();
  } catch { if (!signal.aborted) { failed = true; loading = false; render(); } }
}
function update(change, push = true) {
  const previous = state;
  state = reviewState(new URLSearchParams({ ...state, ...change }));
  const parameters = new URLSearchParams(state);
  if (push) history.pushState(null, "", `${location.pathname}?${parameters}`);
  if (state.viewer !== previous.viewer || state.status !== previous.status) load(); else render();
}
function showDialog(title, body) {
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="dialog-title">${title}</h2><button class="button icon-button" data-close-dialog aria-label="Close dialog">${icon("close")}</button></div><div class="dialog-body">${body}</div>`;
  if (!dialog.open) dialog.showModal();
}
function accessDialog(action) {
  const content = {
    register: ["Create your Goal Hint account", "An account gives you a personal referral link and lets you choose a subscription. Registration alone does not unlock unfinished-match predictions."],
    signin: ["Sign in to continue", "Use your existing account to restore an active subscription or unexpired referral access."],
    subscribe: ["Choose your access", "A subscription unlocks upcoming and live predictions, other markets and predictive analysis. You can also earn access by inviting an eligible friend."],
    referrals: ["Invite a friend. Earn a day.", "Share your personal link. When an eligible new friend registers through it and verifies their phone, you earn one day of access. Registration without phone verification does not yet earn the reward."],
    account: ["Preview account", `${viewers.find(item => item.id === state.viewer).name}. ${fixture.canView ? fixture.accessReason === "completed" ? "This match is completed, so its predictions are public." : "This preview account currently has prediction access." : "This preview account needs a subscription or earned referral access to view unfinished-match predictions."}`],
  }[action];
  showDialog(content[0], `<p>${content[1]}</p>${action === "referrals" ? '<div class="referral-example"><span>Example referral link</span><code>goalhint.example/r/your-code</code></div>' : ""}<div class="dialog-note">This is a design preview. Account, payment and referral actions connect to the existing application after a design is selected.</div>`);
}
root.addEventListener("change", event => {
  if (event.target.dataset.state) update({ [event.target.dataset.state]: event.target.value });
  if (event.target.dataset.control) { controls[event.target.dataset.control] = event.target.value; render(); }
});
root.addEventListener("click", async event => {
  const target = event.target.closest("button"); if (!target) return;
  if (target.dataset.variant) { update({ variant: target.dataset.variant }); return; }
  if (target.dataset.tab) { update({ tab: target.dataset.tab }); document.querySelector(`#tab-${state.tab}`)?.focus({ preventScroll: true }); return; }
  if (target.dataset.player) {
    const [team, group, index] = target.dataset.player.split("-");
    const squad = fixture.squads.find(item => item.team.id === team), player = (group === "start" ? squad.starters : squad.substitutes)[Number(index)];
    showDialog(escape(player.name), `<div class="player-profile" style="--kit:${squad.team.color}"><span class="profile-shirt">${icon("shirt")}<b>${player.number}</b></span><div>${label(player.position)}<strong>${squad.team.name}</strong><span>Illustrative squad member</span></div></div><dl class="profile-facts"><div><dt>Age</dt><dd>${player.age} years</dd></div><div><dt>Shirt number</dt><dd>${player.number}</dd></div><div><dt>Last-match rating</dt><dd>${player.rating.toFixed(1)} / 10</dd></div></dl><p class="muted">Player portrait unavailable. The team shirt provides a clear fallback.</p>`); return;
  }
  const action = target.dataset.action;
  if (action === "previous" || action === "next") { const index = variants.findIndex(item => item.id === state.variant); update({ variant: variants[(index + (action === "next" ? 1 : -1) + variants.length) % variants.length].id }); }
  else if (action === "favorite") { if (favorites.has(state.variant)) favorites.delete(state.variant); else favorites.add(state.variant); persist(); render(); }
  else if (action === "filter-favorites") { favoritesOnly = !favoritesOnly; render(); }
  else if (action === "focus") { focusMode = !focusMode; render(); }
  else if (action === "notes") { showDialog(`Review notes · ${variants.find(item => item.id === state.variant).name}`, `<label class="notes-label" for="review-notes">What works? What would you change?</label><textarea id="review-notes" rows="7" maxlength="4000" placeholder="Your notes stay in this browser…">${escape(typeof notes[state.variant] === "string" ? notes[state.variant] : "")}</textarea><p class="muted">Saved automatically on this device.</p>`); }
  else if (action === "copy") { try { await navigator.clipboard.writeText(location.href); feedback("Review link copied. It preserves the design, tab, viewer and match status."); } catch { showDialog("Copy this review link", `<label for="review-link">Select and copy the URL</label><input id="review-link" readonly value="${escape(location.href)}">`); } }
  else if (action === "jump-access") { root.querySelector("[data-access-gate]")?.scrollIntoView({ block: "center" }); root.querySelector("[data-access-gate] button")?.focus({ preventScroll: true }); }
  else if (["register", "signin", "subscribe", "referrals", "account"].includes(action)) accessDialog(action);
  else if (action === "featured-reason") { const pick = fixture.forecasts?.featured; if (pick) showDialog("Why this featured prediction?", `<p>${pick.explanation}</p><div class="dialog-note">Illustrative model explanation · Based on the sample’s team comparison. It is not a guarantee or a live recommendation.</div>`); }
  else if (action?.startsWith("market-reason-")) { const pick = fixture.forecasts?.markets.find(row => row.id === action.slice(14)); if (pick) showDialog(`${pick.market} · ${pick.selection}`, `<p>${pick.explanation}</p><p class="muted">Model estimate: ${pick.probability}% · Sample data</p>`); }
  else if (action?.startsWith("market-")) { controls.market = action.slice(7); render(); }
  else if (action === "stat-form" || action === "stat-match") { controls.stat = action === "stat-match" ? "match" : "form"; render(); }
  else if (action === "retry") load();
  else if (action === "preview-nav") feedback("This studio focuses on match details. Use the eight match tabs to explore this screen.");
});
dialog.addEventListener("click", event => { if (event.target.closest("[data-close-dialog]") || event.target === dialog) dialog.close(); });
dialog.addEventListener("input", event => { if (event.target.id === "review-notes") { notes[state.variant] = event.target.value; persist(); } });
document.addEventListener("keydown", event => {
  if (dialog.open) return;
  if (event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); root.querySelector(`[data-action="${event.key === "ArrowLeft" ? "previous" : "next"}"]`).click(); return; }
  if (event.target.matches('[role="tab"]')) {
    const vertical = variants.find(item => item.id === state.variant).layout === "vertical";
    const forward = vertical ? "ArrowDown" : "ArrowRight", backward = vertical ? "ArrowUp" : "ArrowLeft";
    if (![forward, backward, "Home", "End"].includes(event.key)) return;
    event.preventDefault(); const index = tabs.findIndex(item => item.id === state.tab);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === forward ? 1 : -1) + tabs.length) % tabs.length;
    update({ tab: tabs[next].id }); document.querySelector(`#tab-${state.tab}`).focus({ preventScroll: true });
  }
});
window.addEventListener("popstate", () => update(reviewState(new URLSearchParams(location.search)), false));
await load();
