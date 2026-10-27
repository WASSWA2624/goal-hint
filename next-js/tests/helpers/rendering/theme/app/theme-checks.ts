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
  const check = (selector: string, expected: string, property: "backgroundColor" | "color" = "backgroundColor") => {
    const elements = [...document.querySelectorAll(selector)].filter(visible);
    assert(elements.length > 0, `Missing visible ${selector}`);
    for (const element of elements) assert(getComputedStyle(element)[property] === normalize(expected), `${selector}: unexpected ${property}`);
  };
  const dark = theme.mode === "dark";
  const phone = window.innerWidth < 1024;
  check("body", theme.color.page);
  check("#theme-controls", theme.color.surface);
  check("#theme-controls [data-surface-control], #theme-control-input, #theme-control-select", theme.color.surface);
  check("#theme-slips [data-slip-id]", theme.color.surface);
  check("#theme-member-step", theme.color.brandSoft);
  check("#theme-member-step", theme.color.link, "color");
  const headerSelector = phone ? "#theme-phone-header > div > div:first-child" : "[data-app-header]";
  check(headerSelector, theme.header.background);
  const header = document.querySelector(headerSelector);
  if (header) {
    const amount = lightness(getComputedStyle(header).backgroundColor);
    assert(dark ? amount < 0.25 : amount > 0.85, `${theme.mode} header must follow its theme's neutral surface`);
  }
  const matchSurfaces = phone ? "#theme-matches [data-fixture-id]" : "#theme-matches [data-match-board], #theme-matches ul > li:nth-child(even)";
  for (const element of document.querySelectorAll(`${matchSurfaces}, #theme-slips [data-slip-id], #theme-member-step`)) {
    const amount = lightness(getComputedStyle(element).backgroundColor);
    assert(dark ? amount < 0.4 : amount > 0.7, `${theme.mode} card/member step must not retain the opposite theme's fill`);
  }
  for (const image of document.querySelectorAll<HTMLImageElement>("[data-app-header] img, #theme-phone-header img")) {
    assert(dark ? image.src.startsWith("data:image/svg+xml") || image.src.includes("logo-inverse.svg")
      : image.src.includes("logo-primary.svg"), `${theme.mode} header needs adaptive brand artwork`);
  }
  const mark = document.querySelector<HTMLImageElement>("footer img");
  assert(!!mark?.src.includes(`mark-${dark ? "inverse" : "primary"}.svg`), "Footer brand mark follows the active theme");
  if (phone) {
    check("#theme-matches [data-fixture-id]", theme.color.surface);
    check("#theme-slips [data-slip-summary], #theme-slips [data-mobile=\"numbers\"]", theme.color.surface);
    check("nav:has([data-responsive-navigation=\"mobile\"])", theme.header.navigationBackground);
  } else {
    // Desktop articles are transparent so the board and alternating row supply their surfaces.
    check("#theme-matches [data-match-board]", theme.color.surface);
    check("#theme-matches [data-match-board] > ul > li:nth-child(even)", theme.color.cardHeader);
    check("#theme-matches [data-match-table-header]", theme.gradient.tableHeader);
    check("#theme-slips th", theme.header.background);
    for (const tableHeader of document.querySelectorAll("#theme-slips th, #theme-matches [data-match-table-header]")) {
      const style = getComputedStyle(tableHeader);
      assert(style.backgroundImage === "none", "Desktop table header must use the theme's flat surface");
      assert(dark ? lightness(style.backgroundColor) < 0.25 : lightness(style.backgroundColor) > 0.85,
        "Desktop table header must follow the active neutral theme");
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
