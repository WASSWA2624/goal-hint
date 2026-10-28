import type { GoalHintTheme } from "@/styles/theme";

const visible = (element: Element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
const rgb = (color: string) => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const lightness = (color: string) => {
  const channels = rgb(color).map((value) => value / 255);
  return (Math.max(...channels) + Math.min(...channels)) / 2;
};

/** Browser-only acceptance assertions against the real production components and resolved provider. */
export function checkRenderedTheme(theme: GoalHintTheme): string[] {
  const errors: string[] = [];
  const normalize = (color: string) => {
    const probe = document.createElement("span");
    probe.style.color = color;
    document.body.append(probe);
    const normalized = getComputedStyle(probe).color;
    probe.remove();
    return normalized;
  };
  const assert = (condition: boolean, message: string) => { if (!condition) errors.push(message); };
  const check = (selector: string, expected: string, property: "backgroundColor" | "color" | "borderTopColor" = "backgroundColor") => {
    const elements = [...document.querySelectorAll(selector)].filter(visible);
    assert(elements.length > 0, `Missing visible ${selector}`);
    for (const element of elements) assert(getComputedStyle(element)[property] === normalize(expected), `${selector}: unexpected ${property}`);
  };
  const dark = theme.mode === "dark";
  const phone = window.innerWidth < 1024;
  check("body", theme.color.page);
  check("#theme-controls", theme.color.surface);
  check("#theme-controls, #theme-checks, #theme-performance [data-performance-summary]", theme.color.border, "borderTopColor");
  check("#theme-controls [data-surface-control], #theme-control-input, #theme-control-select", theme.color.surface);
  check("#theme-slips [data-slip-id]", theme.color.surface);
  check("#theme-member-step", theme.color.brandSoft);
  check("#theme-member-step", theme.color.link, "color");
  check("#theme-performance [data-performance-summary]", theme.color.surface);
  const summary = document.querySelector("#theme-performance [data-performance-summary]");
  const predicted = summary?.querySelector("[data-summary-predicted]");
  assert(!!predicted && visible(predicted), "Predicted match total remains visible on phone and desktop");
  assert(predicted?.querySelector("dt")?.textContent === "Predicted" && predicted.querySelector("dd")?.textContent === "116",
    "Predicted total excludes four unavailable or filtered-out fixtures and includes two void forecasts");
  const wideSummary = (summary?.clientWidth ?? 0) >= 56 * Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  const shares = { correct: "(62.1%)", incorrect: "(20.7%)", pending: "(15.5%)" } as const;
  for (const outcome of ["correct", "incorrect", "pending"] as const) {
    const selector = `#theme-performance [data-summary-outcome="${outcome}"]`;
    check(selector, theme.color.performanceOutcome[outcome].background);
    check(`${selector}, ${selector} dt, ${selector} dd, ${selector} svg`, theme.color.performanceOutcome[outcome].text, "color");
    const percentage = summary?.querySelector(`[data-summary-percentage="${outcome}"]`);
    assert(percentage?.textContent === shares[outcome], `${outcome} percentage uses the predicted total`);
    assert(!!percentage && visible(percentage) === wideSummary, `${outcome} percentage shows only in the desktop summary layout`);
  }
  const headerSelector = phone ? "#theme-phone-header > div > div:first-child" : "[data-app-header]";
  check(headerSelector, theme.header.background);
  const header = document.querySelector(headerSelector);
  if (header) {
    const amount = lightness(getComputedStyle(header).backgroundColor);
    assert(dark ? amount < 0.25 : amount > 0.85, `${theme.mode} header must follow its theme's neutral surface`);
  }
  const matchSurfaces = phone ? "#theme-matches [data-fixture-id]" : "#theme-matches [data-match-board]";
  for (const element of document.querySelectorAll(`${matchSurfaces}, #theme-slips [data-slip-id], #theme-member-step`)) {
    const amount = lightness(getComputedStyle(element).backgroundColor);
    assert(dark ? amount < 0.4 : amount > 0.7, `${theme.mode} card/member step must not retain the opposite theme's fill`);
  }
  for (const image of document.querySelectorAll<HTMLImageElement>("[data-app-header] img, #theme-phone-header img")) {
    assert(dark ? image.src.startsWith("data:image/svg+xml") || image.src.includes("logo-inverse.svg")
      : image.src.includes("header-primary.svg"), `${theme.mode} header needs adaptive brand artwork`);
  }
  const mark = document.querySelector<HTMLImageElement>("footer img");
  assert(!!mark?.src.includes(`mark-${dark ? "inverse" : "primary"}.svg`), "Footer brand mark follows the active theme");
  if (phone) {
    check("#theme-matches [data-fixture-id]", theme.color.surface);
    check("#theme-matches [data-fixture-id], #theme-slips [data-slip-id]", theme.phoneCardFrame.border, "borderTopColor");
    check("#theme-slips [data-slip-summary]", theme.color.surface);
    check("nav:has([data-responsive-navigation=\"mobile\"])", theme.header.navigationBackground);
  } else {
    // Matches and slips use the same aligned match-row treatment, without the former table header or stripes.
    check("#theme-matches [data-match-board]", theme.color.surface);
    const matchRows = [...document.querySelectorAll("#theme-matches [data-desktop-row]")].filter(visible);
    const fixtures = [...document.querySelectorAll("#theme-matches [data-fixture-id]")].filter(visible);
    assert(matchRows.length > 0 && matchRows.length === fixtures.length, "Each desktop fixture uses the shared match row");
    assert(!document.querySelector("#theme-matches [data-match-table-header]"), "The former desktop match column header is absent");
    for (const row of matchRows) {
      assert(getComputedStyle(row).display === "grid", "Desktop match rows retain aligned fields");
      assert(!!row.querySelector("[data-row-teams] [data-home]") && !!row.querySelector("[data-row-teams] [data-away]"),
        "Shared desktop rows retain both team identities");
      assert(!!row.querySelector("[data-match-analysis-link]"), "The score or VS keeps canonical match analysis navigation");
    }
  }
  if ([...document.querySelectorAll("[data-nav-more] details[open] ul")].some(visible)) {
    check("[data-nav-more] details[open] ul", theme.color.surface);
    for (const link of [...document.querySelectorAll("[data-nav-more] details[open] ul a")].filter(visible)) {
      assert(getComputedStyle(link).color === normalize(link.getAttribute("aria-current") === "page" ? theme.color.brand : theme.color.text),
        "Open navigation menu links follow the active theme");
    }
  }
  const dialog = document.querySelector<HTMLDialogElement>("#theme-dialog");
  if (dialog?.open && dialog.dataset.enhanced === "true") check("#theme-dialog", theme.color.surface);
  assert(document.documentElement.scrollWidth <= window.innerWidth, "Fixture must not overflow the viewport");
  return errors;
}
