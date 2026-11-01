/* Review-only renderers: one content model and layout shared by every treatment. */
const designs = [
  { name: "Porcelain separation", note: "White cards on a cooler inset surface. Small corners and measured gaps create clear layers without adding visual weight.", recommended: true, radius: "control", gap: 8, inner: 6, outer: 14, padding: 6, page: "#edf1f7", parent: "#e9eef6", card: "#ffffff", border: "#d3ddea", heading: "#f3f6fc", treatment: "White / cool porcelain" },
  { name: "Cool slate", note: "A deeper slate parent gives white cards a stronger silhouette. Separation comes primarily from the background contrast.", radius: "control", gap: 8, inner: 8, outer: 14, padding: 6, page: "#e7ecf3", parent: "#dfe6ef", card: "#ffffff", border: "#cbd6e4", heading: "#edf2f9", treatment: "White / slate" },
  { name: "Soft neutral", note: "A neutral grey foundation with understated blue details. Slightly wider match gaps keep this treatment calm and readable.", radius: "control", gap: 10, inner: 6, outer: 14, padding: 6, page: "#eeeeef", parent: "#e8e9ec", card: "#ffffff", border: "#d2d5dc", heading: "#f5f5f7", treatment: "White / neutral grey" },
  { name: "Blue inset", note: "The slip body becomes a pale blue tray around individual white selections. The header stays quiet and clearly belongs to the slip.", radius: "control", gap: 8, inner: 8, outer: 14, padding: 8, page: "#edf2fa", parent: "#e2ebfa", card: "#ffffff", border: "#cbd9ef", heading: "#edf3ff", treatment: "White / pale blue" },
  { name: "Defined edges", note: "A firmer one-pixel border makes each card easy to trace, while restrained spacing preserves the compact reading rhythm.", radius: "control", gap: 8, inner: 6, outer: 14, padding: 6, page: "#eef2f7", parent: "#e9eef5", card: "#ffffff", border: "#b6c5da", heading: "#f3f6fb", treatment: "Stronger slate border" },
  { name: "Quiet elevation", note: "A faint shadow adds a little depth beneath each frame. The same corners and spacing as option 01 make the effect easy to judge.", radius: "control", gap: 8, inner: 6, outer: 14, padding: 6, page: "#edf1f7", parent: "#e9eef6", card: "#ffffff", border: "#d3ddea", heading: "#f3f6fc", shadow: "0 1px 3px rgb(24 38 64 / 8%)", treatment: "Porcelain + faint shadow" },
  { name: "Tinted cards", note: "Very lightly tinted cards on a cooler parent. A softer alternative to bright white that still keeps all three layers distinct.", radius: "control", gap: 8, inner: 8, outer: 14, padding: 6, page: "#e7edf5", parent: "#dee7f3", card: "#f8faff", border: "#c7d4e7", heading: "#edf3fc", treatment: "Blue-white / cool grey" },
  { name: "Crisp compact", note: "The smallest visible corner treatment, paired with clear surfaces. A restrained choice if you prefer cards to remain almost square.", radius: "small", slipRadius: "control", gap: 8, inner: 6, outer: 14, padding: 6, page: "#eaf0f7", parent: "#e4ebf4", card: "#ffffff", border: "#c7d3e3", heading: "#f1f5fb", treatment: "Minimal corners / clear edge" },
  { name: "Soft surfaces", note: "The app's existing surface radius on both slips and matches. Slightly more breathing room gives this option the softest outline.", radius: "overlay", gap: 10, inner: 8, outer: 16, padding: 8, page: "#edf1f7", parent: "#e6edf6", card: "#ffffff", border: "#d1dceb", heading: "#f2f6fc", treatment: "Matching surface corners" },
  { name: "Balanced contrast", note: "A defined cool-grey parent, compact corners, and a little more space. The strongest all-round separation without a shadow.", radius: "control", gap: 10, inner: 8, outer: 16, padding: 6, page: "#e5ebf4", parent: "#dce5f1", card: "#ffffff", border: "#becce0", heading: "#edf3fc", treatment: "White / defined cool grey" },
];

const fixtures = [
  { home: "Arsenal", away: "Chelsea", homeCode: "ARS", awayCode: "CHE", homeColor: "#c82438", awayColor: "#2457c5", league: "Premier L.", date: "01 Nov", time: "19:30", market: "Goals", pick: "Over 1.5", odds: "1.32", chance: "86%", status: "pending", caption: "◷ Upcoming" },
  { home: "Barcelona", away: "Villarreal", homeCode: "BAR", awayCode: "VIL", homeColor: "#8b244d", awayColor: "#e7c52d", awayInk: "#493d0b", league: "La Liga", date: "01 Nov", time: "20:00", market: "Result", pick: "Home", odds: "1.48", chance: "81%", status: "live", caption: "● Live · 63′", scores: [2, 0] },
  { home: "Inter Milan", away: "Atalanta", homeCode: "INT", awayCode: "ATA", homeColor: "#265386", awayColor: "#32658b", league: "Serie A", date: "01 Nov", time: "17:00", market: "Goals", pick: "Over 1.5", odds: "1.36", chance: "84%", status: "won", caption: "✓ Won · FT", scores: [2, 1] },
  { home: "Manchester United", away: "Brighton & Hove Albion", homeCode: "MUN", awayCode: "BHA", homeColor: "#b72737", awayColor: "#3979b3", league: "Premier L.", date: "01 Nov", time: "22:00", market: "Double ch.", pick: "1X", odds: "1.29", chance: "87%", status: "pending", caption: "◷ Upcoming" },
];
const root = document.documentElement;
const gallery = document.querySelector("#gallery");
const navigation = document.querySelector(".option-nav");
const requestedOption = new URLSearchParams(location.search).get("option");
const selectedDesign = /^0[1-9]$|^10$/.test(requestedOption ?? "") ? requestedOption : null;
const number = index => String(index + 1).padStart(2, "0");

function team(name, code, color, ink, score) {
  return `<span class="team"><span class="crest" style="--crest-color:${color};--crest-ink:${ink ?? "#fff"}" aria-hidden="true">${code}</span><span class="team-name" title="${name}">${name}</span>${score === undefined ? "" : `<b class="score">${score}</b>`}</span>`;
}

function matchCard(fixture, index) {
  return `<li><article class="match-card" data-status="${fixture.status}" aria-label="${fixture.home} versus ${fixture.away}">
    <div class="match-meta"><span class="match-number">${index + 1}</span><time>${fixture.date}</time><span>${fixture.time}</span><span class="competition" title="${fixture.league}">${fixture.league}</span></div>
    <span class="match-status">${fixture.caption}</span>
    <div class="team-stack">${team(fixture.home, fixture.homeCode, fixture.homeColor, fixture.homeInk, fixture.scores?.[0])}${team(fixture.away, fixture.awayCode, fixture.awayColor, fixture.awayInk, fixture.scores?.[1])}</div>
    <div class="match-facts"><div class="match-metrics"><span>Odds<b>${fixture.odds}</b></span><span>Prob.<b>${fixture.chance}</b></span></div><div class="match-pick"><span>${fixture.market}</span><b>${fixture.pick}</b></div></div>
  </article></li>`;
}

function slip(index) {
  const entries = index === 0 ? fixtures.slice(0, 2) : fixtures.slice(2);
  return `<details class="slip" open><summary aria-label="Toggle Slip ${index + 1}"><span class="slip-title"><b>Slip ${index + 1}</b><time>Sun, 01 Nov</time></span><span class="slip-state">◷ ${index === 0 ? "In progress" : "Pending"}</span><span class="chevron" aria-hidden="true">⌄</span><span class="slip-metrics"><span>Total odds<b>${index === 0 ? "1.95" : "1.75"}</b></span><span>Probability<b>${index === 0 ? "83.5%" : "85.5%"}</b></span><span><b>2</b> matches</span></span></summary><ul class="match-list">${entries.map(matchCard).join("")}</ul></details>`;
}

function screen(context) {
  const title = { best: "Best slips", matches: "Matches", builder: "Slip Builder" }[context];
  const toolbar = context === "builder"
    ? `<div class="builder-fields"><span>Slips<b>2</b></span><span>Total odds<b>1.50 – 3.00</b></span><span>Probability<b>80 – 95%</b></span></div><span class="mock-control">Markets⌄</span><span class="mock-control">Leagues⌄</span><span class="mock-control solid">Build slips</span>`
    : `<span class="mock-control selected">Today</span><span class="mock-control">${context === "best" ? "2 matches" : "All matches"}⌄</span><span class="mock-control">Markets⌄</span><span class="mock-control">Filters⌄</span>`;
  return `<div class="screen-example" data-screen="${context}"><div class="screen-label"><h3>${title}</h3><span>${context === "matches" ? "Standalone match cards" : "Slip frames + nested match cards"}</span></div><div class="app-preview"><div class="app-topbar"><span class="app-title">${title}</span><span>Sun, 01 Nov</span></div><div class="mock-toolbar" aria-label="Illustrative filters">${toolbar}</div><div class="list-caption"><strong>${context === "matches" ? "4 matches" : context === "builder" ? "2 generated slips" : "Today's best slips"}</strong><span>${context === "builder" ? "Original selections" : "All statuses"}</span></div>${context === "matches" ? `<ul class="match-list">${fixtures.map(matchCard).join("")}</ul>` : `<div class="slip-list">${slip(0)}${slip(1)}</div>`}<p class="app-footnote">Illustrative fixtures · EAT (UTC+3)</p></div></div>`;
}

const radiusSizes = { small: "2px", control: "4px", overlay: "8px" };
navigation.innerHTML = `<span>JUMP TO OPTION</span>${designs.map((design, index) => `<a href="${selectedDesign ? "./" : ""}#design-${number(index)}" title="${number(index)} · ${design.name}">${number(index)}</a>`).join("")}`;
gallery.innerHTML = designs.map((design, index) => {
  const id = number(index);
  if (selectedDesign && selectedDesign !== id) return "";
  const variables = {
    "match-radius": `var(--radius-${design.radius})`, "slip-radius": `var(--radius-${design.slipRadius ?? "overlay"})`,
    "match-gap": `${design.gap}px`, "inner-gap": `${design.inner}px`, "slip-gap": `${design.outer}px`, "inner-padding": `${design.padding}px`,
    "light-page": design.page, "light-parent": design.parent, "light-card": design.card,
    "light-border": design.border, "light-heading": design.heading, "light-shadow": design.shadow ?? "none",
  };
  return `<section class="design" id="design-${id}" aria-labelledby="title-${id}" style="${Object.entries(variables).map(([key, value]) => `--${key}:${value}`).join(";")}"><header class="design-heading"><span class="design-number" aria-hidden="true">${id}</span><div><h2 id="title-${id}">${design.name}${design.recommended ? '<span class="recommendation">RECOMMENDED START</span>' : ""}</h2><p>${design.note}</p></div><a class="open-option" href="?option=${id}" aria-label="Open option ${id} independently">Open independently ↗</a></header><div class="specifications"><span>Match corners <b>${radiusSizes[design.radius]}</b></span><span>Slip corners <b>${radiusSizes[design.slipRadius ?? "overlay"]}</b></span><span>Match gap <b>${design.gap}px</b></span><span>Inside slips <b>${design.inner}px</b></span><span>Between slips <b>${design.outer}px</b></span><span>${design.treatment}</span></div><div class="screens">${["best", "matches", "builder"].map(screen).join("")}</div><div class="design-footer"><span class="spacing-note">Mobile spacing · Desktop keeps its existing density</span><a href="${selectedDesign ? "./" : ""}#design-${number((index + 1) % designs.length)}">${index === 9 ? "Back to option 01 ↑" : `Next · ${number(index + 1)} ↓`}</a></div></section>`;
}).join("");
document.querySelector(".all-options").hidden = !selectedDesign;

function updateStatus() {
  const current = root.dataset.comparison === "current";
  const desktop = root.dataset.width === "desktop";
  document.querySelector("#comparison-status").textContent = `${current ? "Showing the current card treatment" : "Showing proposed card treatments"} · ${desktop ? "Desktop spacing retained" : `${root.dataset.width}px mobile preview (fits smaller screens)`}. The same sample fixtures appear in every option.`;
  document.querySelectorAll(".spacing-note").forEach(note => {
    note.textContent = current ? "Current baseline · Square match cards / 6px list gap / 4px nested gap" : desktop ? "Desktop · Continuous match rows / 4.5px between slips / No extra spacing" : "Mobile spacing · Desktop keeps its existing density";
  });
}

document.querySelectorAll("[data-theme-choice], [data-comparison-choice]").forEach(button => {
  button.addEventListener("click", () => {
    const kind = button.hasAttribute("data-theme-choice") ? "theme" : "comparison";
    root.dataset[kind] = button.dataset[`${kind}Choice`];
    document.querySelectorAll(`[data-${kind}-choice]`).forEach(choice => choice.setAttribute("aria-pressed", String(choice === button)));
    if (kind === "theme") document.querySelector('meta[name="color-scheme"]').content = root.dataset.theme;
    updateStatus();
  });
});
document.querySelector("#preview-width").addEventListener("change", event => {
  root.dataset.width = event.target.value;
  root.style.setProperty("--preview-width", event.target.value === "desktop" ? "100%" : `${event.target.value}px`);
  updateStatus();
});
document.querySelector("#preview-context").addEventListener("change", event => { root.dataset.context = event.target.value; });

const observer = new IntersectionObserver(entries => {
  const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  navigation.querySelectorAll("a").forEach(link => {
    if (link.hash === `#${visible.target.id}`) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  });
}, { rootMargin: "-70px 0px -35% 0px", threshold: [0, .25, .5] });
document.querySelectorAll(".design").forEach(section => observer.observe(section));
updateStatus();
