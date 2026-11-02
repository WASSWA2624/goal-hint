import type { GoalHintTheme } from "@/styles/theme";
import { textFieldSelector } from "@/components/ui/filled-surfaces";

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
  // Chromium snaps thin borders to physical pixels at fractional display scales.
  const ruleProbe = document.createElement("span");
  ruleProbe.style.borderTop = `${theme.phoneCardFrame.ruleWidth} solid`;
  document.body.append(ruleProbe);
  const ruleWidth = getComputedStyle(ruleProbe).borderTopWidth;
  const fieldBorderWidth = Number.parseFloat(theme.textField.borderWidth) === 0 ? "0px" : ruleWidth;
  ruleProbe.remove();
  const checkRadius = (selector: string, expected: string | Record<"borderTopLeftRadius" | "borderTopRightRadius" | "borderBottomLeftRadius" | "borderBottomRightRadius", string>) => {
    const elements = [...document.querySelectorAll(selector)].filter(visible);
    assert(elements.length > 0, `Missing visible radius example ${selector}`);
    for (const element of elements) {
      const style = getComputedStyle(element);
      const target = element.id ? `#${element.id}` : element.getAttribute("data-slip-id") ?? element.tagName.toLowerCase();
      for (const corner of ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius"] as const) {
        assert(Number.parseFloat(style[corner]) === Number.parseFloat(typeof expected === "string" ? expected : expected[corner]), `${target}: unexpected ${corner} ${style[corner]}`);
      }
    }
  };
  checkRadius("#theme-radius-badge", theme.radius.small);
  checkRadius("#theme-control-input, #theme-control-select, #theme-controls [data-surface-control], #theme-admin-input, #theme-payment-input, #theme-payment-action, [data-slip-custom-range]", theme.radius.control);
  checkRadius("#theme-controls, #theme-admin-panel, #theme-performance [data-performance-summary]", phone ? theme.radius.surface : theme.radius.none);
  checkRadius("#theme-large-action, #theme-admin-record, [data-subscribe-layout=stepwise]", theme.radius.surface);
  if (!phone) checkRadius("#theme-matches [data-match-board]", theme.radius.none);
  checkRadius("#theme-slips [data-slip-id]", phone ? theme.radius.surface : theme.frame.desktopCardRadius);
  for (const summary of [...document.querySelectorAll("#theme-slips summary[data-slip-summary]")].filter(visible)) {
    const innerRadius = `${Math.max(0, Number.parseFloat(theme.radius.surface) - Number.parseFloat(theme.phoneCardFrame.ruleWidth))}px`;
    const expanded = summary.parentElement?.hasAttribute("open");
    checkRadius("#theme-slips summary[data-slip-summary]", {
      borderTopLeftRadius: innerRadius, borderTopRightRadius: innerRadius,
      borderBottomLeftRadius: expanded ? theme.radius.none : innerRadius,
      borderBottomRightRadius: expanded ? theme.radius.none : innerRadius,
    });
    const indicator = summary.querySelector("[data-header-chevron], [data-toggle-chevron]");
    assert(!!indicator && visible(indicator), "Collapsible slips retain a visible disclosure indicator");
    if (!indicator) continue;
    const rect = indicator.getBoundingClientRect(), header = summary.getBoundingClientRect();
    const offset = phone ? Number.parseFloat(theme.spacing[2]) : 0;
    assert(Math.abs(rect.top - header.top - offset) < 0.1, "Disclosure indicator stays in its themed header slot");
    const rotation = new DOMMatrix(getComputedStyle(indicator, "::after").transform);
    assert(summary.parentElement?.hasAttribute("open") ? rotation.b > 0 : rotation.b < 0,
      "Disclosure indicator faces right when collapsed and down when expanded");
  }
  checkRadius("#theme-joined-controls", theme.radius.control);
  checkRadius("#theme-joined-controls > button", theme.radius.none);
  const dateFace = document.querySelector("[data-slip-period-select]");
  const dateTrigger = dateFace?.querySelector("button") ?? dateFace;
  if (!phone) assert(!!dateTrigger && Number.parseFloat(getComputedStyle(dateTrigger).borderTopLeftRadius) === Number.parseFloat(theme.radius.control), "Best slips date selection keeps the reference control radius");
  if (document.querySelector("[data-select-options]")) checkRadius("[data-select-options]", theme.radius.overlay);
  for (const dialog of document.querySelectorAll<HTMLDialogElement>("dialog[open][data-enhanced=true]")) {
    checkRadius(`#${CSS.escape(dialog.id)}`, theme.radius.overlay);
  }
  check("body", theme.color.page);
  check("[data-app-footer]", theme.color.page);
  check("#theme-filters [data-best-slips-filters]", theme.color.page);
  if (!dark) {
    check("body", "#FFFFFF");
    assert(theme.color.surface === theme.color.page, "Light components share the white page canvas");
  }
  check("#theme-controls", theme.color.surface);
  check("#theme-controls [data-surface-control]", theme.color.brandSoft);
  check("#theme-control-input, #theme-admin-input, #theme-payment-input", theme.textField.background);
  check("#theme-search [data-text-field-frame], #theme-textarea", theme.textField.background);
  check("#theme-invalid-input", dark ? theme.color.outcome.incorrect.background : theme.textField.background);
  check("#theme-disabled-input", dark ? theme.color.disabledSurface : theme.textField.background);
  check("#theme-control-select", theme.textField.background);
  check("#theme-slips [data-slip-id]", theme.phoneCardFrame.inset);
  check("#theme-slips [data-slip-summary]", phone ? theme.phoneCardFrame.mobileHeader : theme.phoneCardFrame.header);
  check("#theme-member-step", theme.color.brandSoft);
  check("#theme-member-step", theme.color.link, "color");
  check("#theme-performance [data-performance-summary]", theme.color.surface);
  const summary = document.querySelector("#theme-performance [data-performance-summary]");
  assert(!summary?.querySelector(":scope > [aria-hidden=true]"), "Performance totals have no distribution bar");
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
  check(headerSelector, phone ? theme.header.background : theme.header.desktopBackground);
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
    check("#theme-slips [data-slip-summary]", theme.phoneCardFrame.mobileHeader);
    checkRadius("#theme-matches [data-fixture-id]", theme.radius.none);
    checkRadius("#theme-matches [data-fixture-id] > a", theme.radius.none);
    if (document.querySelector("#theme-slips [data-slip-disclosure][open]")) {
      check("#theme-slips [data-slip-selection] > [data-fixture-id]", theme.phoneCardFrame.selection);
    }
    check("nav:has([data-responsive-navigation=\"mobile\"])", theme.header.navigationBackground);
  } else {
    // Matches and slips use the same aligned match-row treatment, without the former table header or stripes.
    check("#theme-matches [data-match-board]", theme.color.page);
    const list = document.querySelector("#theme-matches [data-match-list]");
    assert(!!list && getComputedStyle(list).rowGap === "0px", "Desktop matches retain their joined rows");
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
  if (dialog?.open && dialog.dataset.enhanced === "true") check("#theme-dialog", theme.mode === "light" ? theme.textField.background : theme.color.surface);
  for (const list of [...document.querySelectorAll("[data-theme-fixture] [data-slip-selections]")].filter(visible)) {
    const items = [...list.querySelectorAll(":scope > [data-slip-selection]")];
    assert(getComputedStyle(list).rowGap === "0px", "Slip matches join without gaps");
    for (const [index, item] of items.entries()) {
      const row = item.querySelector(":scope > [data-fixture-id]");
      assert(!!row, "Each selection retains its match card");
      if (!row) continue;
      const style = getComputedStyle(row), separator = getComputedStyle(item);
      assert(style.backgroundColor === normalize(theme.phoneCardFrame.selection), "Joined match rows retain their selection fill");
      for (const corner of ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius"] as const) {
        const rounded = corner.startsWith("borderTop") ? index === 0 : index === items.length - 1;
        assert(Number.parseFloat(style[corner]) === Number.parseFloat(rounded ? theme.phoneCardFrame.radius : theme.radius.none), "Only the outside selection corners are rounded");
      }
      assert(separator.borderTopWidth === (index ? ruleWidth : "0px"), "Selection separators stay thin");
      if (index) {
        assert(separator.borderTopColor === normalize(theme.phoneCardFrame.separator), "Separators retain their semantic theme color");
        const previous = items[index - 1]!.getBoundingClientRect(), current = item.getBoundingClientRect();
        assert(Math.abs(current.top - previous.bottom) < 0.1, "Selection wrappers touch without gaps");
      }
      const analysis = row.querySelector("[data-row-analysis]");
      if (analysis) assert(getComputedStyle(analysis).borderRadius === style.borderRadius, "Analysis focus follows the joined corners");
    }
  }
  for (const element of [...document.querySelectorAll("[data-theme-fixture] *")].filter(visible)) {
    const style = getComputedStyle(element);
    const target = element.id || element.tagName.toLowerCase();
    for (const edge of ["borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"] as const) {
      const frame = element.matches("[data-compact-slip]");
      const matchFrame = element.matches("[data-match-list] > li:has(> article:only-child), [data-match-list] > li:has(> [data-desktop-row]:only-child)");
      const matchFrameEdge = matchFrame && (edge !== "borderTopWidth" || element.matches(":first-child"));
      const separator = (element.matches("[data-slip-selections] > [data-slip-selection] + [data-slip-selection], [data-feed-pagination]")
        ) && edge === "borderTopWidth";
      const floating = element.matches("[data-floating-outline], [data-floating-control], [data-select-trigger]") || !!element.closest("[data-floating-control]");
      const field = element.matches(textFieldSelector + ", select, [data-text-field-frame]");
      const expected = frame || matchFrameEdge || separator ? ruleWidth : field ? fieldBorderWidth : "0px";
      assert(floating ? Number.parseFloat(style[edge]) <= 2 : style[edge] === expected || field && style[edge] === "0px", `${target}: unexpected ${edge}`);
      if (frame) assert(style.borderTopColor === normalize(theme.phoneCardFrame.separator), "Slip frames retain their semantic theme color");
    }
  }
  for (const button of document.querySelectorAll<HTMLElement>("[data-feed-search-submit]")) {
    const input = button.parentElement?.querySelector("input");
    const style = getComputedStyle(button), rect = button.getBoundingClientRect();
    assert(!!input && rect.left >= input.getBoundingClientRect().right - 1, "Search submission stays on the right");
    assert(style.borderTopLeftRadius === "0px" && style.borderBottomLeftRadius === "0px", "Joined search actions have square left corners");
  }
  for (const selector of ["#theme-control-input", "#theme-admin-input", "#theme-payment-input"]) {
    const field = document.querySelector(selector);
    const boundary = field?.closest("[data-floating-control]")?.querySelector("[data-floating-outline]") ?? field;
    assert(!!boundary && getComputedStyle(boundary).borderTopWidth === (boundary.matches("[data-floating-outline]") ? ruleWidth : fieldBorderWidth), "Text entry has one thin boundary");
    assert(!!boundary && getComputedStyle(boundary).borderTopColor === normalize(boundary.matches("[data-floating-outline]") ? theme.textField.borderColor : theme.color.controlBorder), "Floating boundaries retain the faint theme color");
  }
  assert(document.documentElement.scrollWidth <= window.innerWidth, "Fixture must not overflow the viewport");
  return errors;
}
