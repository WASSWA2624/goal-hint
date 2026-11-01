/** Browser acceptance for an existing Playwright Page; no runtime dependency. */
export const themes = ["porcelain-blue", "evergreen", "ink-and-paper", "copper-sand", "arctic-teal", "plum-studio",
  "slate-precision", "cobalt-night", "forest-night", "graphite-gold"];
export const screens = ["best-slips", "matches", "slip-builder", "results", "help", "privacy", "terms", "contacts",
  "invites", "dashboard", "admin", "analytics"];

const markers = {
  "best-slips": "[data-best-slips-page] [data-slip-id]", matches: "[data-fixture-id]",
  "slip-builder": "[data-slip-builder]", results: "[data-performance-dashboard]", help: "main h1",
  privacy: "main h1", terms: "main h1", contacts: "main h1", invites: "[data-account-referrals]",
  dashboard: "[data-subscription-summary]", admin: '[aria-label="Admin overview"]', analytics: "[data-analytics-dashboard]",
};

function contrast(foreground, background) {
  const luminance = color => {
    const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
      const normalized = value / 255;
      return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
    });
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

export async function verifyDesktopThemes(page, { origin = "http://127.0.0.1:3110", themeIds = themes,
  screenIds = screens, width = 1440, captureDirectory } = {}) {
  const errors = [], checks = [], consoleErrors = [];
  const collectError = error => consoleErrors.push(String(error));
  const collectConsole = message => { if (message.type() === "error") consoleErrors.push(message.text()); };
  page.on("pageerror", collectError); page.on("console", collectConsole);
  await page.setViewportSize({ width, height: 1000 });
  try {
    for (const theme of themeIds) for (const screen of screenIds) {
      const path = `/themes/${theme}${screen === "best-slips" ? "" : `/${screen}`}`;
      const response = await page.goto(origin + path, { waitUntil: "domcontentloaded" });
      if (response.status() !== 200) { errors.push(`${theme}/${screen}: HTTP ${response.status()}`); continue; }
      await page.locator(`[data-preview-theme="${theme}"][data-preview-screen="${screen}"]`).waitFor();
      await page.locator('[data-preview-ready="true"]').waitFor();
      const marker = screen === "slip-builder" ? 'form[action="/en/slips"]'
        : screen === "analytics" ? '[aria-label="Analytics date range"], [data-analytics-dashboard], main h1' : markers[screen];
      await page.locator(marker).first().waitFor({ timeout: 10000 });
      await page.evaluate(() => document.fonts.ready);
      if (screen === "matches") await page.locator('[data-performance-summary="matches"]').waitFor();
      if (screen === "analytics") await page.getByText("2,846", { exact: true }).waitFor({ timeout: 10000 });
      const result = await page.evaluate(() => {
        const ruleProbe = document.createElement("span");
        ruleProbe.style.borderTop = "1px solid";
        document.body.append(ruleProbe);
        const ruleWidth = getComputedStyle(ruleProbe).borderTopWidth;
        ruleProbe.remove();
        const body = getComputedStyle(document.body), canvas = document.querySelector("[data-preview-canvas]");
        const studioElement = document.querySelector("[data-theme-studio]");
        const headerElement = [...canvas.querySelectorAll("[data-app-header], [data-mobile-app-header] > div")]
          .find(element => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0)
          ?? canvas.querySelector("[data-app-header]");
        const studio = studioElement.getBoundingClientRect(), header = headerElement.getBoundingClientRect();
        const muted = getComputedStyle(studioElement.querySelector("p")), surface = getComputedStyle(studioElement);
        const active = getComputedStyle(studioElement.querySelector('nav[aria-label="Desktop themes"] a[aria-current]'));
        const headerStyle = getComputedStyle(headerElement);
        const outsideParent = [...canvas.querySelectorAll("main section, main article, main form")].filter(element => {
          const child = element.getBoundingClientRect(), parent = element.parentElement.getBoundingClientRect();
          return child.width > 0 && parent.width > 0 && (child.left < parent.left - 2 || child.right > parent.right + 2);
        }).length;
        const bordered = [...canvas.querySelectorAll("*")].filter(element => {
          const bounds = element.getBoundingClientRect();
          if (!bounds.width || !bounds.height) return false;
          const style = getComputedStyle(element);
          const edges = ["Top", "Right", "Bottom", "Left"];
          if (element.matches("[data-compact-slip]")) {
            return edges.some(edge => style[`border${edge}Width`] !== ruleWidth || style[`border${edge}Color`] !== style.backgroundColor);
          }
          if (element.matches("[data-slip-selections] > [data-slip-selection] + [data-slip-selection]")) {
            const backdrop = getComputedStyle(element.closest("[data-compact-slip]")).backgroundColor;
            return edges.some(edge => style[`border${edge}Width`] !== (edge === "Top" ? ruleWidth : "0px")) || style.borderTopColor !== backdrop;
          }
          if (element.matches("[data-match-list] > li + li, [data-feed-pagination]")) {
            return edges.some(edge => !["0px", edge === "Top" ? ruleWidth : "0px"].includes(style[`border${edge}Width`]));
          }
          if (element.matches('input:not([type="checkbox"], [type="radio"], [type="range"], [type="file"], [type="hidden"]), textarea, [data-text-field-frame]')) {
            return edges.some(edge => !["0px", ruleWidth].includes(style[`border${edge}Width`]));
          }
          return ["borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"]
            .some(edge => Number.parseFloat(style[edge]) > 0);
        }).map(element => element.tagName.toLowerCase() + (element.id ? `#${element.id}` : ""));
        const idleProgressVisible = !document.querySelector('[data-navigation-pending], main [aria-busy="true"]')
          && [...canvas.querySelectorAll("[data-navigation-progress]")].some(element => getComputedStyle(element).opacity !== "0");
        const footer = canvas.querySelector("[data-app-footer]");
        const statusSelect = [...canvas.querySelectorAll("[data-feed-status]")].find(element => element.getBoundingClientRect().width > 0);
        const statusStyle = statusSelect && getComputedStyle(statusSelect);
        const statusCorners = !statusStyle || ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius"]
          .every(corner => Number.parseFloat(statusStyle[corner]) > 0) && statusStyle.borderTopWidth === "0px";
        const distributionBars = canvas.querySelectorAll("[data-performance-summary] > [aria-hidden=true]").length;
        const textFieldErrors = [];
        if (document.querySelector('[data-preview-theme="porcelain-blue"]')) {
          for (const input of canvas.querySelectorAll('input:not([type="checkbox"], [type="radio"], [type="range"], [type="file"], [type="hidden"], [type="button"], [type="submit"]), textarea')) {
            const bounds = input.getBoundingClientRect();
            if (!bounds.width || !bounds.height || input.matches(":disabled")) continue;
            const nativeStyle = getComputedStyle(input);
            const frame = nativeStyle.borderTopWidth === ruleWidth ? input : input.closest("[data-text-field-frame]");
            const style = frame && getComputedStyle(frame);
            if (!style || style.borderTopWidth !== ruleWidth || style.borderRightWidth !== ruleWidth) {
              textFieldErrors.push(`${input.id || input.name || input.type}: missing field boundary`);
            } else if (input.getAttribute("aria-invalid") !== "true" && style.backgroundColor !== "rgb(255, 255, 255)") {
              textFieldErrors.push(`${input.id || input.name || input.type}: text field is not white`);
            }
          }
        }
        return { overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          foreground: body.color, background: body.backgroundColor,
          mutedForeground: muted.color, mutedBackground: surface.backgroundColor,
          activeForeground: active.color, activeBackground: active.backgroundColor,
          headerForeground: headerStyle.color, headerBackground: headerStyle.backgroundColor,
          themes: document.querySelectorAll('nav[aria-label="Desktop themes"] a').length,
          screens: document.querySelectorAll('nav[aria-label="Preview screens"] a').length,
          overlap: header.width > 0 && header.height > 0 && header.top < studio.bottom - 1,
          outsideParent, bordered, idleProgressVisible, textFieldErrors,
          footerBackground: footer ? getComputedStyle(footer).backgroundColor : null, statusCorners, distributionBars, content: canvas.textContent.trim().length };
      });
      const ratio = contrast(result.foreground, result.background);
      if (result.overflow) errors.push(`${theme}/${screen}: horizontal overflow at ${width}px`);
      if (result.outsideParent) errors.push(`${theme}/${screen}: a panel or form exceeds its parent`);
      if (result.bordered.length) errors.push(`${theme}/${screen}: decorative borders on ${[...new Set(result.bordered)].join(", ")}`);
      if (result.idleProgressVisible) errors.push(`${theme}/${screen}: idle loading track must not form a header border`);
      if (result.footerBackground && result.footerBackground !== result.background) errors.push(`${theme}/${screen}: footer must share the page background`);
      for (const error of result.textFieldErrors) errors.push(`${theme}/${screen}/${width}: ${error}`);
      if (!result.statusCorners) errors.push(`${theme}/${screen}: status selection needs subtle borderless corners`);
      if (result.distributionBars) errors.push(`${theme}/${screen}: performance distribution bar must be absent`);
      if (result.themes !== 10 || result.screens !== 12) errors.push(`${theme}/${screen}: missing navigation`);
      if (result.overlap) errors.push(`${theme}/${screen}: app header overlaps the studio`);
      if (ratio < 4.5) errors.push(`${theme}/${screen}: body contrast ${ratio.toFixed(2)}`);
      for (const role of ["muted", "active", "header"]) {
        const value = contrast(result[`${role}Foreground`], result[`${role}Background`]);
        if (value < 4.5) errors.push(`${theme}/${screen}: ${role} contrast ${value.toFixed(2)}`);
      }
      if (result.content < 100) errors.push(`${theme}/${screen}: incomplete screen`);
      checks.push({ theme, screen, width, contrast: Number(ratio.toFixed(2)), ...result });
      if (captureDirectory && (screen === "best-slips" || theme === themes[0])) {
        await page.screenshot({ path: `${captureDirectory}/${theme}-${screen}-${width}.png`, fullPage: true });
      }
    }
  } finally { page.off("pageerror", collectError); page.off("console", collectConsole); }
  return { passed: errors.length === 0 && consoleErrors.length === 0, checks, errors, consoleErrors: [...new Set(consoleErrors)] };
}

export async function verifyDesktopInteractions(page, origin = "http://127.0.0.1:3110") {
  const checks = [];
  const assert = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
  const visit = async path => { await page.goto(origin + path, { waitUntil: "domcontentloaded" }); await page.locator('[data-preview-ready="true"]').waitFor(); };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await visit("/themes/forest-night/matches?q=Northbridge");
  await page.getByRole("navigation", { name: "Desktop themes", exact: true }).getByRole("link", { name: "03 Ink & Paper", exact: true }).click();
  await page.waitForURL("**/ink-and-paper/matches?q=Northbridge");
  assert(page.url().includes("/ink-and-paper/matches?q=Northbridge"), "Theme navigation retains the screen and URL filters");
  await page.getByRole("navigation", { name: "Preview screens", exact: true }).getByRole("link", { name: "Best Slips", exact: true }).click();
  await page.getByRole("button", { name: "Custom range", exact: true }).click();
  assert(await page.getByRole("dialog").isVisible(), "Custom-date dialog opens");
  await page.keyboard.press("Escape");
  assert(await page.getByRole("dialog").count() === 0 || !await page.getByRole("dialog").isVisible(), "Escape closes the dialog");
  await page.getByRole("button", { name: "Custom range", exact: true }).focus();
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineWidth);
  assert(outline !== "0px", "Keyboard focus has a visible outline");
  await page.getByRole("button", { name: "Won: 1 (33.3%)", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-slip-id]").length === 1);
  assert(await page.locator("[data-slip-id]").count() === 1, "Result filters update the slip list");
  const observation = page.waitForResponse(response => response.url().endsWith("/api/slips/match-states") && response.request().method() === "POST");
  await visit("/themes/forest-night");
  assert((await observation).status() === 200, "Synthetic slip observation reads succeed");
  await page.locator("[data-slip-id]").first().locator("summary").click();
  assert(await page.locator("[data-slip-id]").first().locator("details").getAttribute("open") !== null, "Native slip disclosure expands");
  assert(!(await page.locator("[data-slip-id]").first().innerText()).includes("Unknown"), "Observation refresh preserves the sample result labels");
  const originalPreference = await page.evaluate(() => localStorage.getItem("goal-hint-theme"));
  await page.locator("[data-app-header] [data-theme-toggle]").click();
  assert(await page.evaluate(() => localStorage.getItem("goal-hint-theme")) === originalPreference, "The preview leaves the application theme preference intact");
  await page.getByRole("button", { name: /Shortlist/ }).click();
  const selected = await page.getByRole("button", { name: /Shortlist/ }).getAttribute("aria-pressed");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-preview-ready="true"]').waitFor();
  assert(await page.getByRole("button", { name: /Shortlist/ }).getAttribute("aria-pressed") === selected, "The shortlist survives reload");
  await page.getByRole("button", { name: /Shortlist/ }).click();
  await page.getByRole("navigation", { name: "Preview screens", exact: true }).getByRole("link", { name: "Slip Builder", exact: true }).click();
  await page.locator('form[action="/en/slips"] button[type="submit"]').click();
  await page.waitForURL(url => url.pathname === "/themes/forest-night/slip-builder" && url.searchParams.get("build") === "1");
  assert(await page.locator("[data-slip-id]").count() > 0, "Building sample slips stays in the selected theme");
  await page.getByRole("navigation", { name: "Preview screens", exact: true }).getByRole("link", { name: "Help", exact: true }).click();
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy", exact: true }).click();
  await page.waitForURL("**/themes/forest-night/privacy");
  assert(page.url().includes("/themes/forest-night/privacy"), "Footer navigation stays inside the selected theme");
  await page.evaluate(() => window.scrollTo(0, 800));
  const positioned = await page.evaluate(() => {
    const studio = document.querySelector("[data-theme-studio]").getBoundingClientRect();
    const header = document.querySelector("[data-app-header]").getBoundingClientRect();
    return Math.abs(studio.top) < 1 && header.top >= studio.bottom - 1;
  });
  assert(positioned, "Studio and app headers remain visible without overlapping while scrolling");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const duration = await page.locator("[data-app-header] [data-theme-toggle]").evaluate(element => getComputedStyle(element).transitionDuration);
  assert(duration === "0s" || duration === "1e-05s", "Reduced-motion preference removes the preview transitions");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  return { passed: true, count: checks.length, checks };
}
