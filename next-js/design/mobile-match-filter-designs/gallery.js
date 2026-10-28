import { concepts, getConcept } from "./concepts.js";

const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const widths = [320, 360, 390, 430];
const state = {
  concept: getConcept(params.get("concept")).id,
  mode: params.get("view") === "all" ? "all" : "focus",
  theme: params.get("theme") === "dark" ? "dark" : "light",
  width: widths.includes(Number(params.get("width")))
    ? Number(params.get("width"))
    : 390,
  shortlist: readShortlist(),
  metrics: new Map(),
};
const frames = new Map();
const storageKey = "goal-hint-mobile-filter-shortlist-v1";

function readShortlist() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("goal-hint-mobile-filter-shortlist-v1") ?? "[]",
    );
    return new Set(
      Array.isArray(saved)
        ? saved.filter((id) => concepts.some((concept) => concept.id === id))
        : [],
    );
  } catch {
    return new Set();
  }
}

function announce(message) {
  $("#announcement").textContent = message;
}

function previewUrl(concept) {
  const query = new URLSearchParams({
    concept: String(concept),
    theme: state.theme,
  });
  return `sample.html?${query}`;
}

function updateUrl() {
  const query = new URLSearchParams({ concept: String(state.concept) });
  if (state.mode === "all") query.set("view", "all");
  if (state.theme === "dark") query.set("theme", "dark");
  if (state.width !== 390) query.set("width", String(state.width));
  history.replaceState(null, "", `${location.pathname}?${query}`);
}

function makeFrame(concept, mode) {
  const key = `${mode}-${concept.id}`;
  if (!frames.has(key)) {
    const frame = document.createElement("iframe");
    frame.title = `${String(concept.id).padStart(2, "0")}. ${concept.name} — interactive mobile preview`;
    frame.src = previewUrl(concept.id);
    frame.dataset.concept = String(concept.id);
    frame.loading = mode === "all" ? "lazy" : "eager";
    frame.addEventListener("load", () => readFrameMetrics(frame));
    frames.set(key, frame);
  }
  return frames.get(key);
}

function buildNavigation() {
  for (const concept of concepts) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "concept-button";
    button.dataset.concept = String(concept.id);
    button.innerHTML = `<span class="concept-number">${String(concept.id).padStart(2, "0")}</span><span class="concept-name">${concept.name}</span><span class="concept-star" aria-hidden="true" hidden>★</span>`;
    button.addEventListener("click", () => selectConcept(concept.id));
    $("#concept-nav").append(button);
  }
}

function buildComparison() {
  for (const concept of concepts) {
    const item = document.createElement("section");
    item.className = "comparison-item";
    item.setAttribute("aria-labelledby", `comparison-title-${concept.id}`);
    item.innerHTML = `<div class="comparison-heading"><span class="concept-number">${String(concept.id).padStart(2, "0")}</span><h2 id="comparison-title-${concept.id}">${concept.name}</h2><button type="button" class="comparison-shortlist" data-shortlist="${concept.id}" aria-label="Shortlist ${concept.name}" aria-pressed="false">☆</button></div><p class="comparison-summary">${concept.summary}</p><div class="phone-frame"></div><div class="comparison-footer"><span data-metric="${concept.id}">Interactive sample</span><button type="button" data-focus="${concept.id}">View in focus →</button></div>`;
    item.querySelector(".phone-frame").append(makeFrame(concept, "all"));
    item
      .querySelector("[data-shortlist]")
      .addEventListener("click", () => toggleShortlist(concept.id));
    item
      .querySelector("[data-focus]")
      .addEventListener("click", () => selectConcept(concept.id));
    $("#all-view").append(item);
  }
}

function renderNotes() {
  const concept = getConcept(state.concept);
  const number = String(concept.id).padStart(2, "0");
  $("#note-number").textContent = `Concept ${number}`;
  $("#note-name").textContent = concept.name;
  $("#note-summary").textContent = concept.summary;
  $("#note-benefit").textContent = concept.benefit;
  $("#note-tradeoff").textContent = concept.tradeoff;
  $("#note-hint").textContent = concept.hint;
  $("#view-caption").textContent =
    state.mode === "all"
      ? "All ten concepts · Compare and shortlist"
      : `${number} / 10 · ${concept.name}`;
  $("#open-phone").href = previewUrl(concept.id);
  $("#previous-concept").disabled = concept.id === 1;
  $("#next-concept").disabled = concept.id === 10;
  const frame = makeFrame(concept, "focus");
  if ($("#focus-phone").firstElementChild !== frame)
    $("#focus-phone").replaceChildren(frame);
  renderMetrics();
}

function frameMetric(frame) {
  const metric = state.metrics.get(frame);
  if (
    !metric ||
    !frame?.isConnected ||
    frame.clientWidth < 1 ||
    Math.abs(metric.width - frame.clientWidth) > 1 ||
    metric.theme !== state.theme
  )
    return null;
  return metric;
}

function metricText(metric, compact = false) {
  if (!metric) return "Interactive sample";
  if (metric.dockHeight > 0)
    return compact
      ? `${metric.height} px top + ${metric.dockHeight} px dock`
      : `Top filters: ${metric.height} px · Bottom dock: ${metric.dockHeight} px`;
  return compact
    ? `Filter area · ${metric.height} px`
    : `Filter area: ${metric.height} px in this preview`;
}

function renderMetrics() {
  const metric = frameMetric(frames.get(`focus-${state.concept}`));
  $("#measured-height").hidden = !metric;
  if (metric) $("#measured-height").textContent = metricText(metric);
  document.querySelectorAll("[data-metric]").forEach((element) => {
    element.textContent = metricText(
      frameMetric(frames.get(`all-${element.dataset.metric}`)),
      true,
    );
  });
}

function renderActualWidth() {
  const frame = $("#focus-phone iframe");
  const width = frame?.clientWidth || state.width;
  $("#ruler-width").textContent =
    width === state.width
      ? `${width} px`
      : `${width} px · ${state.width} requested`;
  frames.forEach((preview) => readFrameMetrics(preview));
}

function saveFrameMetrics(frame, height, dockHeight = 0) {
  if (
    !frame.isConnected ||
    frame.clientWidth < 1 ||
    !Number.isFinite(height) ||
    height < 0 ||
    height > 2000 ||
    !Number.isFinite(dockHeight) ||
    dockHeight < 0 ||
    dockHeight > 2000
  )
    return;
  state.metrics.set(frame, {
    height: Math.round(height),
    dockHeight: Math.round(dockHeight),
    width: frame.clientWidth,
    theme: new URL(frame.src).searchParams.get("theme") || "light",
  });
  renderMetrics();
}

function readFrameMetrics(frame) {
  try {
    const document = frame.contentDocument;
    const filters = document?.querySelector("#filters");
    if (!filters) return;
    saveFrameMetrics(
      frame,
      filters.getBoundingClientRect().height,
      document.querySelector("#dock")?.getBoundingClientRect().height || 0,
    );
  } catch {
    /* Metrics are supplementary; the previews remain usable. */
  }
}

function renderShortlist() {
  const selected = state.shortlist.has(state.concept);
  const toggle = $("#shortlist-toggle");
  toggle.setAttribute("aria-pressed", String(selected));
  toggle.children[0].textContent = selected ? "★" : "☆";
  toggle.children[1].textContent = selected
    ? "Shortlisted"
    : "Shortlist this design";
  $("#shortlist-count").textContent = String(state.shortlist.size);
  $("#clear-shortlist").hidden = state.shortlist.size === 0;
  const list = $("#shortlist-list");
  list.replaceChildren();
  if (!state.shortlist.size) {
    const empty = document.createElement("p");
    empty.textContent = "Your favourite designs will appear here.";
    list.append(empty);
  }
  concepts
    .filter((concept) => state.shortlist.has(concept.id))
    .forEach((concept) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${String(concept.id).padStart(2, "0")} · ${concept.name}`;
      button.addEventListener("click", () => selectConcept(concept.id));
      list.append(button);
    });
  document.querySelectorAll(".concept-button").forEach((button) => {
    button.setAttribute(
      "aria-current",
      String(Number(button.dataset.concept) === state.concept),
    );
    button.querySelector(".concept-star").hidden = !state.shortlist.has(
      Number(button.dataset.concept),
    );
  });
  document.querySelectorAll("[data-shortlist]").forEach((button) => {
    const active = state.shortlist.has(Number(button.dataset.shortlist));
    button.setAttribute("aria-pressed", String(active));
    button.textContent = active ? "★" : "☆";
  });
}

function persistShortlist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...state.shortlist]));
  } catch {
    /* The review works without browser storage. */
  }
  renderShortlist();
}

function toggleShortlist(id) {
  if (state.shortlist.has(id)) state.shortlist.delete(id);
  else state.shortlist.add(id);
  persistShortlist();
  announce(
    `${getConcept(id).name} ${state.shortlist.has(id) ? "added to" : "removed from"} your shortlist.`,
  );
}

function selectConcept(id) {
  state.concept = getConcept(id).id;
  state.mode = "focus";
  render();
  announce(`Concept ${state.concept}: ${getConcept(state.concept).name}.`);
}

function render() {
  document.documentElement.style.setProperty(
    "--phone-width",
    `${state.width}px`,
  );
  $("#phone-width").value = String(state.width);
  $("#ruler-width").textContent = `${state.width} px`;
  $("#focus-view").hidden = state.mode !== "focus";
  $("#all-view").hidden = state.mode !== "all";
  document
    .querySelectorAll("[data-mode]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.mode === state.mode),
      ),
    );
  document
    .querySelectorAll("[data-theme]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.theme === state.theme),
      ),
    );
  renderNotes();
  renderActualWidth();
  renderShortlist();
  updateUrl();
}

buildNavigation();
buildComparison();
document.querySelectorAll("[data-mode]").forEach((button) =>
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    render();
  }),
);
document.querySelectorAll("[data-theme]").forEach((button) =>
  button.addEventListener("click", () => {
    state.theme = button.dataset.theme;
    frames.forEach((frame) => {
      frame.src = previewUrl(Number(frame.dataset.concept));
    });
    render();
  }),
);
$("#phone-width").addEventListener("change", (event) => {
  state.width = Number(event.target.value);
  render();
});
$("#previous-concept").addEventListener("click", () =>
  selectConcept(state.concept - 1),
);
$("#next-concept").addEventListener("click", () =>
  selectConcept(state.concept + 1),
);
$("#shortlist-toggle").addEventListener("click", () =>
  toggleShortlist(state.concept),
);
$("#clear-shortlist").addEventListener("click", () => {
  state.shortlist.clear();
  persistShortlist();
  announce("Shortlist cleared.");
});
$("#reset-demo").addEventListener("click", () => {
  frames.forEach((frame) => {
    if (frame.isConnected)
      frame.contentWindow?.postMessage(
        { type: "reset-preview" },
        location.origin,
      );
    else frame.src = previewUrl(Number(frame.dataset.concept));
  });
  announce("Preview filters reset. Your shortlist has been kept.");
});
window.addEventListener("message", (event) => {
  if (
    event.origin !== location.origin ||
    event.data?.type !== "preview-metrics"
  )
    return;
  const entry = [...frames.values()].find(
    (frame) => frame.contentWindow === event.source,
  );
  const { concept, height, dockHeight = 0 } = event.data;
  if (!entry || Number(entry.dataset.concept) !== Number(concept)) return;
  saveFrameMetrics(entry, height, dockHeight);
});
new ResizeObserver(renderActualWidth).observe($("#focus-phone"));
render();
