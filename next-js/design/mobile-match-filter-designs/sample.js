import { getConcept } from "./concepts.js";

const params = new URLSearchParams(location.search);
const concept = getConcept(Number(params.get("concept")) || 1);
document.documentElement.dataset.theme =
  params.get("theme") === "dark" ? "dark" : "light";
document.title = `${String(concept.id).padStart(2, "0")} ${concept.name} · Goal Hint`;
const $ = (selector, root = document) => root.querySelector(selector);
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const paths = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>',
  filter: '<path d="M4 7h16M4 17h16"/><path d="M8 4v6m8 4v6"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16"/><path d="M16 3v4M8 3v4M3 11h18m-12 4h2m2 0h2"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m14 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  matches:
    '<rect x="3" y="4" width="18" height="16"/><path d="M12 4v16m-9-8h18"/>',
  slips: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6"/>',
  results: '<path d="M5 20V10m7 10V4m7 16v-7"/>',
  account:
    '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
};
function icon(name, className = "") {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${paths[name] || paths.filter}</svg>`;
}
const today = "2026-10-28";
const statuses = [
  ["all", "All matches"],
  ["live", "Live"],
  ["upcoming", "Upcoming"],
  ["finished", "Finished"],
];
const markets = [
  ["result", "Match result"],
  ["double", "Double chance"],
  ["goals", "Total goals"],
  ["btts", "Both teams to score"],
];
const leagues = [
  "Premier League",
  "La Liga",
  "Serie A",
  "Bundesliga",
  "Ligue 1",
  "Champions League",
];
const countries = ["England", "Spain", "Italy", "Germany", "France", "Europe"];
const defaults = () => ({
  search: "",
  status: "all",
  from: today,
  to: today,
  sort: "earliest",
  picks: true,
  leagues: [],
  countries: [],
  markets: markets.map(([value]) => value),
  min: "",
  max: "",
  timeFrom: "",
  timeTo: "",
});
let state = defaults();
let expanded = false;
let searchOpen = false;
let draft = null;
let editing = "";
let lastTrigger = null;
let toastTimer;
const dialog = $("#editor");
const rows = [
  [
    "Arsenal",
    "Chelsea",
    "Premier League",
    "England",
    "ENG",
    "gb-eng",
    "18:30",
    "live",
    "result",
    "1X2",
    "1",
    "1.72",
    74,
    "#D51E26",
    "#2457C5",
    "1–0",
  ],
  [
    "Barcelona",
    "Atlético",
    "La Liga",
    "Spain",
    "ESP",
    "es",
    "20:00",
    "upcoming",
    "goals",
    "O/U",
    "O 2.5",
    "1.65",
    78,
    "#A50044",
    "#C2410C",
  ],
  [
    "Napoli",
    "Roma",
    "Serie A",
    "Italy",
    "ITA",
    "it",
    "20:45",
    "upcoming",
    "double",
    "DC",
    "1X",
    "1.35",
    83,
    "#1685C6",
    "#9C2328",
  ],
  [
    "Bayern",
    "Dortmund",
    "Bundesliga",
    "Germany",
    "GER",
    "de",
    "21:00",
    "upcoming",
    "btts",
    "BTTS",
    "Yes",
    "1.58",
    76,
    "#D51E26",
    "#867000",
  ],
  [
    "Paris SG",
    "Lyon",
    "Ligue 1",
    "France",
    "FRA",
    "fr",
    "22:00",
    "upcoming",
    "result",
    "1X2",
    "1",
    "1.45",
    81,
    "#17457E",
    "#D51E26",
  ],
  [
    "Inter",
    "Juventus",
    "Serie A",
    "Italy",
    "ITA",
    "it",
    "17:00",
    "finished",
    "double",
    "DC",
    "1X",
    "1.40",
    79,
    "#2457C5",
    "#444",
    "2–1",
  ],
  [
    "Liverpool",
    "Man City",
    "Premier League",
    "England",
    "ENG",
    "gb-eng",
    "19:00",
    "live",
    "btts",
    "BTTS",
    "Yes",
    "1.62",
    75,
    "#D51E26",
    "#397FA8",
    "1–1",
  ],
  [
    "Real Madrid",
    "Benfica",
    "Champions League",
    "Europe",
    "EUR",
    "eu",
    "22:45",
    "upcoming",
    "result",
    "1X2",
    "1",
    "1.50",
    80,
    "#776100",
    "#D51E26",
  ],
].map((r, index) => ({
  home: r[0],
  away: r[1],
  league: r[2],
  country: r[3],
  code: r[4],
  flag: r[5],
  time: r[6],
  status: r[7],
  market: r[8],
  marketLabel: r[9],
  pick: r[10],
  odds: r[11],
  probability: r[12],
  homeColor: r[13],
  awayColor: r[14],
  score: r[15],
  date: today,
  predicted: true,
  index,
}));
// Extra days make the date controls meaningful while keeping every concept on the same snapshot.
const fixtures = [-2, -1, 0, 1, 2, 3, 4].flatMap((offset) =>
  rows.map((row) => ({
    ...row,
    date: addDays(today, offset),
    status: offset < 0 ? "finished" : offset > 0 ? "upcoming" : row.status,
    score: offset < 0 ? "2–1" : offset > 0 ? null : row.score,
    predicted: offset !== 4 || row.index % 2 === 0,
  })),
);
function addDays(date, days) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
function shortDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
function dateLabel(value = state) {
  return value.from === value.to
    ? value.from === today
      ? "Today"
      : shortDate(value.from)
    : `${shortDate(value.from)}–${shortDate(value.to)}`;
}
function statusLabel(value = state) {
  return statuses.find(([key]) => key === value.status)?.[1] || "All matches";
}
function filterCount(value = state) {
  return (
    Number(value.leagues.length > 0) +
    Number(value.countries.length > 0) +
    Number(value.markets.length !== markets.length) +
    Number(value.min !== "" || value.max !== "") +
    Number(value.timeFrom !== "" || value.timeTo !== "") +
    Number(!value.picks) +
    Number(value.sort !== "earliest")
  );
}
function changed() {
  return JSON.stringify(state) !== JSON.stringify(defaults());
}
function filterButton(withText = false) {
  const count = filterCount();
  return `<button type="button" class="${withText ? "button" : "icon-button"} filter-action" data-action="advanced" aria-label="More filters${count ? `, ${count} applied` : ""}">${icon("filter")}${withText ? "Filters" : ""}${count ? `<b class="badge">${count}</b>` : ""}</button>`;
}
function dateButton(label = dateLabel(), action = "date") {
  return `<button type="button" class="field-button grow" data-action="${action}" aria-label="Choose dates, ${escape(label)}" ${state.status === "live" && action === "date" ? "disabled" : ""}>${icon("calendar")}<span>${escape(state.status === "live" ? "Today" : label)}</span>${icon("down", "chevron")}</button>`;
}
function statusButton() {
  return `<button type="button" class="field-button grow" data-action="status" aria-label="Match status, ${statusLabel()}"><span>${state.status === "all" ? "All statuses" : statusLabel()}</span>${icon("down", "chevron")}</button>`;
}
function searchField(combined = false) {
  return `<div class="search${combined ? " search-combined" : ""}">${icon("search")}<input type="search" name="search" aria-label="Search teams or leagues" placeholder="Search teams or leagues" value="${escape(state.search)}" autocomplete="off"><button type="button" class="clear-search" data-action="clear-search" aria-label="Clear search" ${state.search ? "" : "hidden"}>${icon("close")}</button>${combined ? `<button type="button" class="button" data-action="scope" aria-label="Dates and match status, ${dateLabel()}, ${statusLabel()}">${state.status === "live" ? "Live" : dateLabel()}${icon("down")}</button>` : ""}</div>`;
}
function searchButton() {
  return `<button type="button" class="icon-button" data-action="search" aria-label="${searchOpen ? "Hide" : "Open"} search" ${concept.id === 6 ? `aria-expanded="${searchOpen}"` : ""}>${icon(searchOpen ? "close" : "search")}</button>`;
}
function scopeSummary() {
  return `<button type="button" class="summary-scope" data-action="scope" aria-label="Edit dates and status"><strong>${state.status === "live" ? "Live now" : dateLabel()}${icon("down")}</strong><small>${statusLabel()} · ${state.picks ? "Predictions only" : "All fixtures"}</small></button>`;
}
function renderFilters() {
  const patterns = {
    1: () =>
      `${searchField()}<div class="row">${dateButton()}${statusButton()}${filterButton()}</div>`,
    2: () => `<div class="row">${searchField(true)}${filterButton()}</div>`,
    3: () =>
      `<div class="status-tabs" role="group" aria-label="Match status">${statuses.map(([value, label]) => `<button type="button" data-status="${value}" aria-pressed="${state.status === value}">${value === "live" ? '<i class="live-dot"></i>' : ""}${value === "all" ? "All" : label}</button>`).join("")}</div><div class="row">${dateButton()}${searchButton()}${filterButton()}</div>`,
    4: () =>
      `<div class="row">${searchField()}${filterButton()}</div><div class="navigator"><button type="button" class="icon-button" data-action="previous-day" aria-label="Previous day" ${state.status === "live" ? "disabled" : ""}>${icon("left")}</button>${dateButton()}<button type="button" class="icon-button" data-action="next-day" aria-label="Next day" ${state.status === "live" ? "disabled" : ""}>${icon("right")}</button></div>`,
    5: () =>
      `<div class="row">${searchField()}${filterButton()}</div><div class="week" role="group" aria-label="Choose match day">${[
        -2, -1, 0, 1, 2, 3, 4,
      ]
        .map((offset) => {
          const date = addDays(today, offset);
          const day = new Date(`${date}T12:00:00Z`);
          return `<button type="button" class="day" data-day="${date}" aria-label="${shortDate(date)}" aria-pressed="${state.from === date && state.to === date}" ${state.status === "live" ? "disabled" : ""}><span>${offset === 0 ? "Today" : new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(day)}</span><b>${day.getUTCDate()}</b></button>`;
        })
        .join(
          "",
        )}<button type="button" class="icon-button" data-action="date" aria-label="Calendar and date ranges" ${state.status === "live" ? "disabled" : ""}>${icon("calendar")}</button></div>`,
    6: () =>
      `<div class="row">${dateButton()}${statusButton()}${searchButton()}${filterButton()}</div>${searchOpen ? searchField() : ""}`,
    7: () =>
      `${searchField()}<div class="rail-wrap"><div class="rail" role="group" aria-label="Filter categories">${dateButton()}<button type="button" class="button" data-action="status">${state.status === "all" ? "Status" : statusLabel()}${icon("down")}</button><button type="button" class="button" data-action="league">Leagues${state.leagues.length ? ` (${state.leagues.length})` : ""}${icon("down")}</button><button type="button" class="button" data-action="market">Markets${icon("down")}</button>${filterButton(true)}</div></div>`,
    8: () =>
      `<div class="row header-pattern">${scopeSummary()}${searchButton()}${filterButton()}</div>`,
    9: () =>
      `<div class="row header-pattern">${scopeSummary()}<button type="button" class="text-action" data-action="status">${state.status === "live" ? "Change status" : "Live matches"}${icon("right")}</button></div>`,
    10: () =>
      `<div class="row">${searchField()}${filterButton()}</div><button type="button" class="button inline-summary" data-action="expand" aria-expanded="${expanded}" aria-controls="inline-refinement"><span>${icon("filter")}<strong>Refine</strong></span><span>${dateLabel()} · ${state.status === "all" ? "All matches" : statusLabel()}${icon(expanded ? "close" : "down")}</span></button>${expanded ? `<div id="inline-refinement" class="inline-panel"><div class="row">${dateButton()}${statusButton()}</div><label><input type="checkbox" data-inline-picks ${state.picks ? "checked" : ""}>Predictions only</label><div class="row"><button type="button" class="button" data-action="league">Leagues${icon("down")}</button><button type="button" class="button" data-action="advanced">More options${icon("filter")}</button></div></div>` : ""}`,
  };
  $("#filters").innerHTML = patterns[concept.id]();
  $("#dock").innerHTML =
    concept.id === 9
      ? `<div class="dock-row"><button type="button" class="button grow" data-action="search">${icon("search")}Search matches</button>${filterButton(true)}</div>`
      : "";
  renderResults();
  requestAnimationFrame(reportMetrics);
}
function results() {
  const query = state.search.trim().toLocaleLowerCase();
  return fixtures
    .filter(
      (row) =>
        row.date >= state.from &&
        row.date <= state.to &&
        (state.status === "all" || row.status === state.status) &&
        (!query ||
          `${row.home} ${row.away} ${row.league} ${row.country}`
            .toLocaleLowerCase()
            .includes(query)) &&
        (!state.picks || row.predicted) &&
        (!state.leagues.length || state.leagues.includes(row.league)) &&
        (!state.countries.length || state.countries.includes(row.country)) &&
        state.markets.includes(row.market) &&
        (state.min === "" || row.probability >= Number(state.min)) &&
        (state.max === "" || row.probability <= Number(state.max)) &&
        (!state.timeFrom || row.time >= state.timeFrom) &&
        (!state.timeTo || row.time <= state.timeTo),
    )
    .sort((a, b) =>
      state.sort === "probability"
        ? b.probability - a.probability
        : `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`) *
          (state.sort === "latest" ? -1 : 1),
    );
}
function card(row) {
  const marketColor = {
    result: "var(--good)",
    double: "var(--violet)",
    goals: "var(--blue)",
    btts: "var(--orange)",
  }[row.market];
  const score = row.score && row.status !== "upcoming" ? row.score : "VS";
  return `<article class="match-card" style="--market:${marketColor}" aria-label="${row.home} versus ${row.away}"><div class="match-meta"><span>${shortDate(row.date)} · ${row.time}</span><span>${row.flag === "eu" ? "" : `<img class="flag" src="../../public/flags/${row.flag}.svg" alt="">`}${row.code}<span aria-hidden="true">·</span><span class="competition">${row.league}</span></span></div><div class="teams"><span class="team home"><span class="crest" style="--crest:${row.homeColor}" aria-hidden="true">${row.home[0]}</span><span>${row.home}</span></span><span class="versus">${score}</span><span class="team"><span class="crest" style="--crest:${row.awayColor}" aria-hidden="true">${row.away[0]}</span><span>${row.away}</span></span></div>${row.predicted ? `<div class="facts"><span class="fact"><i class="market-tick"></i><small>Mkt</small>${row.marketLabel}</span><span class="fact pick"><small>Pick</small><b>${row.pick}</b></span><span class="fact"><small>Odds</small><b>${row.odds}</b></span><span class="fact"><small>Prob.</small><b>${row.probability}%</b></span></div>` : '<div class="editor-help">No prediction available</div>'}${row.status === "live" ? `<div class="state-row"><span><i class="live-dot"></i>Live · ${row.index === 0 ? "62′" : "34′"}</span><span>Prediction pending</span></div>` : row.status === "finished" ? '<div class="state-row finished"><span>Full time</span><span>Correct prediction ✓</span></div>' : ""}</article>`;
}
function renderResults() {
  const visible = results();
  const showRange =
    concept.id === 5 &&
    (state.from !== state.to ||
      state.from < addDays(today, -2) ||
      state.to > addDays(today, 4));
  $("#result-summary").innerHTML =
    `<span><b>${visible.length}</b> ${visible.length === 1 ? "match" : "matches"}${state.search ? ` for “${escape(state.search)}”` : ""}${showRange ? ` · ${dateLabel()}` : ""}</span><button type="button" class="text-action ${changed() ? "reset-mini" : ""}" data-action="${changed() ? "reset-all" : "sort"}">${changed() ? `${icon("reset")}Reset` : state.sort === "earliest" ? "Earliest first ↓" : state.sort === "latest" ? "Latest first ↓" : "Highest probability ↓"}</button>`;
  $("#matches").innerHTML = visible.length
    ? visible.map(card).join("")
    : `<div class="empty">${icon("search")}<h2>No matches in this sample</h2><p>Try another team, day, or filter.</p><button type="button" class="button" data-action="reset-all">Reset all filters</button></div>`;
}
function reportMetrics() {
  const height = Math.round($("#filters").getBoundingClientRect().height);
  parent.postMessage(
    {
      type: "preview-metrics",
      concept: concept.id,
      height,
      dockHeight: Math.round($("#dock").getBoundingClientRect().height),
    },
    location.origin,
  );
}
function toggleList(key, value) {
  draft[key] = draft[key].includes(value)
    ? draft[key].filter((item) => item !== value)
    : [...draft[key], value];
}
const selected = (condition) => (condition ? "selected" : "");
function field(label, name, type = "text", attributes = "") {
  return `<label class="form-field">${label}<input name="${name}" type="${type}" value="${escape(draft[name])}" ${attributes}></label>`;
}
function statusEditor() {
  return `<fieldset><legend>Match status</legend><div class="editor-grid">${statuses.map(([value, label]) => `<button type="button" class="button" data-draft-status="${value}" aria-pressed="${draft.status === value}">${value === "live" ? '<i class="live-dot"></i>' : ""}${label}</button>`).join("")}</div></fieldset>`;
}
function dateEditor() {
  if (draft.status === "live")
    return '<p class="editor-note">Live matches use Today and all kickoff times. Change the status to browse other dates.</p>';
  const presets = [
    ["Yesterday", -1, -1],
    ["Today", 0, 0],
    ["Tomorrow", 1, 1],
    ["Next 3 days", 0, 2],
    ["Next 7 days", 0, 6],
    ["Last 30 days", -29, 0],
  ];
  return `<fieldset><legend>Dates</legend><div class="editor-grid">${presets.map(([label, start, end]) => `<button type="button" class="button" data-preset-from="${addDays(today, start)}" data-preset-to="${addDays(today, end)}" aria-pressed="${draft.from === addDays(today, start) && draft.to === addDays(today, end)}">${label}</button>`).join("")}</div></fieldset><fieldset><legend>Custom range</legend><div class="editor-grid">${field("From", "from", "date", "required")}${field("To", "to", "date", "required")}</div><p class="editor-help">One day or a range of up to 366 days. The sample contains matches from 26 Oct to 1 Nov.</p></fieldset>`;
}
function listEditor(key, options, title) {
  return `<fieldset><legend>${title}</legend><p class="editor-help">${key === "markets" ? "Select at least one market." : "Leave unchecked to include all."}</p><div class="choice-list">${options
    .map((option) => {
      const [value, label] = Array.isArray(option) ? option : [option, option];
      return `<label class="check-label"><input type="checkbox" data-list="${key}" value="${value}" ${draft[key].includes(value) ? "checked" : ""}>${label}</label>`;
    })
    .join("")}</div></fieldset>`;
}
function sortEditor() {
  return `<label class="form-field">Sort matches<select name="sort"><option value="earliest" ${selected(draft.sort === "earliest")}>Earliest first</option><option value="latest" ${selected(draft.sort === "latest")}>Latest first</option><option value="probability" ${selected(draft.sort === "probability")}>Highest probability</option></select></label>`;
}
function limitsEditor() {
  return `<fieldset><legend>Probability</legend><div class="editor-grid">${field("Minimum %", "min", "number", 'min="0" max="100" step="any" placeholder="0"')}${field("Maximum %", "max", "number", 'min="0" max="100" step="any" placeholder="100"')}</div></fieldset><fieldset><legend>Kickoff time · Kampala (UTC+3)</legend>${draft.status === "live" ? '<p class="editor-note">All kickoff times included for live matches.</p>' : `<div class="editor-grid">${field("From time", "timeFrom", "time")}${field("To time", "timeTo", "time")}</div>`}</fieldset>`;
}
function renderEditor() {
  const titles = {
    date: "Choose dates",
    status: "Match status",
    scope: "Dates & status",
    advanced: "Refine matches",
    league: "Choose leagues",
    market: "Choose markets",
    search: "Search matches",
    sort: "Sort matches",
    help: "Try the design",
  };
  $("#editor-title").textContent = titles[editing];
  const sections = {
    date: () => dateEditor(),
    status: () => statusEditor(),
    scope: () => `${statusEditor()}${dateEditor()}`,
    advanced: () =>
      `${[4, 5].includes(concept.id) ? statusEditor() : ""}${sortEditor()}<label class="check-label"><input name="picks" type="checkbox" ${draft.picks ? "checked" : ""}>Predictions only</label><details><summary class="button quiet">Leagues${draft.leagues.length ? ` · ${draft.leagues.length} selected` : " · All"}</summary>${listEditor("leagues", leagues, "Leagues")}</details><details><summary class="button quiet">Countries${draft.countries.length ? ` · ${draft.countries.length} selected` : " · All"}</summary>${listEditor("countries", countries, "Countries")}</details>${listEditor("markets", markets, "Markets")}${limitsEditor()}<p class="editor-help">Odds filtering is currently unavailable.</p>`,
    league: () => listEditor("leagues", leagues, "Leagues"),
    market: () => listEditor("markets", markets, "Markets"),
    sort: () => sortEditor(),
    search: () =>
      `<div class="search">${icon("search")}<input type="search" name="search" aria-label="Search teams or leagues" placeholder="Search teams or leagues" value="${escape(draft.search)}" autocomplete="off"></div><p class="editor-help">Try Arsenal, Barcelona, or Premier League. Apply to update the matches.</p>`,
    help: () =>
      '<p class="editor-help">Explore the date, search and filter controls. Every match is illustrative. Filters apply to this preview only.</p><p class="editor-help">The navigation and match cards provide visual context. Choose a concept in the gallery to compare another layout.</p>',
  };
  $("#editor-body").innerHTML = sections[editing]();
  $(".sheet-foot").hidden = editing === "help";
}
function openEditor(section, trigger) {
  draft = structuredClone(state);
  editing = section;
  lastTrigger = trigger || document.activeElement;
  renderEditor();
  document.body.style.overflow = "hidden";
  dialog.showModal();
  if (section === "search") $('input[name="search"]', dialog).focus();
}
function closeEditor() {
  dialog.close();
  document.body.style.overflow = "";
  draft = null;
  if (lastTrigger?.isConnected) lastTrigger.focus();
}
function readDraft() {
  $("#editor-body")
    .querySelectorAll("input[name],select[name]")
    .forEach((input) => {
      draft[input.name] =
        input.type === "checkbox" ? input.checked : input.value;
    });
}
function enforceLive(value) {
  if (value.status === "live") {
    value.from = today;
    value.to = today;
    value.timeFrom = "";
    value.timeTo = "";
  }
}
function validateDraft() {
  if (!draft.markets.length) return "Select at least one market.";
  if (
    (draft.min !== "" &&
      (!Number.isFinite(Number(draft.min)) ||
        Number(draft.min) < 0 ||
        Number(draft.min) > 100)) ||
    (draft.max !== "" &&
      (!Number.isFinite(Number(draft.max)) ||
        Number(draft.max) < 0 ||
        Number(draft.max) > 100))
  )
    return "Probability must be between 0 and 100.";
  if (
    draft.min !== "" &&
    draft.max !== "" &&
    Number(draft.min) > Number(draft.max)
  )
    return "Minimum probability must be no greater than maximum.";
  if (draft.timeFrom && draft.timeTo && draft.timeFrom > draft.timeTo)
    return "From time must be no later than To time.";
  const first = new Date(`${draft.from}T00:00:00Z`),
    last = new Date(`${draft.to}T00:00:00Z`);
  if (
    !Number.isFinite(+first) ||
    !Number.isFinite(+last) ||
    last < first ||
    (last - first) / 86400000 > 365
  )
    return "Choose an ordered date range of up to 366 days.";
  return "";
}
function notify(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3500);
}
function resetAll() {
  state = defaults();
  expanded = false;
  searchOpen = false;
  if (dialog.open) closeEditor();
  renderFilters();
}
document.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.draftStatus) {
    readDraft();
    draft.status = target.dataset.draftStatus;
    enforceLive(draft);
    renderEditor();
    $(`[data-draft-status="${draft.status}"]`, dialog).focus();
    return;
  }
  if (target.dataset.presetFrom) {
    readDraft();
    draft.from = target.dataset.presetFrom;
    draft.to = target.dataset.presetTo;
    renderEditor();
    $(
      `[data-preset-from="${draft.from}"][data-preset-to="${draft.to}"]`,
      dialog,
    )?.focus();
    return;
  }
  if (target.dataset.status) {
    state.status = target.dataset.status;
    enforceLive(state);
    renderFilters();
    $(`[data-status="${state.status}"]`)?.focus();
    return;
  }
  if (target.dataset.day) {
    state.from = target.dataset.day;
    state.to = target.dataset.day;
    renderFilters();
    $(`[data-day="${state.from}"]`)?.focus();
    return;
  }
  const action = target.dataset.action;
  if (
    [
      "date",
      "status",
      "scope",
      "advanced",
      "league",
      "market",
      "sort",
      "help",
    ].includes(action)
  ) {
    openEditor(action, target);
    return;
  }
  if (action === "search") {
    if (concept.id === 6) {
      searchOpen = !searchOpen;
      renderFilters();
      if (searchOpen) $('#filters input[name="search"]').focus();
      else $('[data-action="search"]').focus();
    } else openEditor("search", target);
  }
  if (action === "cancel") closeEditor();
  if (action === "expand") {
    expanded = !expanded;
    renderFilters();
    $('[data-action="expand"]').focus();
  }
  if (action === "clear-search") {
    state.search = "";
    document
      .querySelectorAll('#filters input[name="search"]')
      .forEach((input) => {
        input.value = "";
      });
    renderResults();
    target.hidden = true;
    $('#filters input[name="search"]')?.focus();
  }
  if (action === "reset-all") resetAll();
  if (action === "previous-day" || action === "next-day") {
    state.from = addDays(state.from, action === "previous-day" ? -1 : 1);
    state.to = state.from;
    renderFilters();
    $(`[data-action="${action}"]`)?.focus();
  }
  if (action === "reset-section") {
    const keys =
      {
        date: ["from", "to"],
        status: ["status"],
        scope: ["from", "to", "status"],
        league: ["leagues"],
        market: ["markets"],
        search: ["search"],
        sort: ["sort"],
        advanced: [
          "sort",
          "picks",
          "leagues",
          "countries",
          "markets",
          "min",
          "max",
          "timeFrom",
          "timeTo",
        ],
      }[editing] || [];
    if (editing === "advanced" && [4, 5].includes(concept.id))
      keys.push("status");
    const initial = defaults();
    keys.forEach((key) => {
      draft[key] = initial[key];
    });
    enforceLive(draft);
    renderEditor();
    $('[data-action="reset-section"]').focus();
  }
  if (action === "nav")
    notify("Navigation is shown for context. Explore the match filters above.");
});
document.addEventListener("input", (event) => {
  const input = event.target;
  if (input.matches('#filters input[name="search"]')) {
    state.search = input.value;
    $(".clear-search", $("#filters")).hidden = !input.value;
    renderResults();
  }
});
document.addEventListener("change", (event) => {
  const input = event.target;
  if (input.dataset.list && draft) toggleList(input.dataset.list, input.value);
  if (input.matches("[data-inline-picks]")) {
    state.picks = input.checked;
    renderFilters();
    $("[data-inline-picks]")?.focus();
  }
});
$("#editor-form").addEventListener("submit", (event) => {
  event.preventDefault();
  readDraft();
  enforceLive(draft);
  const error = validateDraft();
  if (error) {
    let alert = $(".error", dialog);
    if (!alert) {
      alert = document.createElement("p");
      alert.className = "error";
      alert.setAttribute("role", "alert");
      $("#editor-body").prepend(alert);
    }
    alert.textContent = error;
    alert.scrollIntoView({ block: "nearest" });
    return;
  }
  state = structuredClone(draft);
  const action = lastTrigger?.dataset.action;
  closeEditor();
  renderFilters();
  if (action) $(`[data-action="${action}"]`)?.focus();
});
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeEditor();
});
dialog.addEventListener("click", (event) => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (
    event.clientY < bounds.top ||
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY > bounds.bottom
  )
    closeEditor();
});
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== parent) return;
  if (event.data?.type === "reset-preview") resetAll();
});
new ResizeObserver(reportMetrics).observe($("#filters"));
document
  .querySelectorAll("[data-nav]")
  .forEach((button) =>
    button.insertAdjacentHTML("afterbegin", icon(button.dataset.nav)),
  );
$('[data-action="help"]').innerHTML = icon("info");
$('[data-action="cancel"]', $(".sheet-head")).innerHTML = icon("close");
renderFilters();
