import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

const targets = new Set(["https://test.goalhint.com", "https://goalhint.com"]);
const matches = "/en/matches";
const bestSlips = "/en/best-slips";
const navigationTimeout = 15_000;
const phaseTimeout = 30_000;
const totalTimeout = 115_000;

class ReadinessError extends Error {}

function requireReady(check, reason) {
  if (!check) throw new ReadinessError(reason);
}

/** Production requires populated coverage, while staging can legitimately have no published cohort. */
function feedState({ pathname, phase, staging, diagnose = false }) {
  const isMatches = pathname === "/en/matches";
  const activeSegment = isMatches ? "matches" : "best-slips";
  const visible = element => element && element.getClientRects().length > 0 && getComputedStyle(element).visibility === "visible";
  const shown = (root, selector) => Array.from(root.querySelectorAll(selector)).find(visible);
  if (window.location.pathname !== pathname) return false;
  if (shown(document, "[data-offline-view]")) return { failure: "document-recovery" };
  if (document.title.startsWith("This page couldn’t load")) return { failure: "document-runtime-failure" };
  const shell = shown(document, `[data-app-navigation="${activeSegment}"]`);
  if (!shell) return false;
  if (isMatches) {
    if (shown(shell, "[data-feed-list-recovery]")) return { failure: "matches-list-recovery" };
    if (shown(shell, "[data-feed-navigation-retry]")) return { failure: "matches-list-navigation-retry" };
    const failedSummary = phase === "summary"
      && shown(shell, '[data-feed-performance-state="unavailable"], [data-feed-performance-state="stale"]');
    if (failedSummary) return diagnose ? { failure: "matches-summary-unavailable" } : false;
  } else if (shown(shell, "[data-best-slips-page] [role=alert], [data-best-slips-stale]")) {
    return { failure: "best-slips-unavailable" };
  }
  const region = shown(shell, isMatches ? "[data-feed-match-results]" : "[data-best-slips-page]");
  if (!region || region.getAttribute("aria-busy") === "true") return false;

  const itemAttribute = isMatches ? "data-fixture-id" : "data-slip-key";
  const rows = new Set(Array.from(region.querySelectorAll(`[${itemAttribute}]`)).filter(visible)
    .map(item => item.getAttribute(itemAttribute))).size;
  const headingNodes = Array.from(region.querySelectorAll("h2")).filter(visible);
  const headings = headingNodes.map(heading => heading.textContent.trim());
  const describe = title => {
    const description = headingNodes.find(heading => heading.textContent.trim() === title)?.nextElementSibling;
    return visible(description) ? description.textContent.trim() : "";
  };
  const incompleteCoverage = isMatches && headings.includes("Fixture data unavailable");
  if (incompleteCoverage && (!staging || rows !== 0
    || describe("Fixture data unavailable") !== "Fixture coverage is incomplete or unavailable. Try again later."))
    return { failure: "matches-fixture-coverage-unavailable" };
  const empty = isMatches
    ? headings.some(text => text === "No fixtures confirmed" || text === "No matches for these filters")
    : headings.some(text => text === "No slips match these filters" || /^No published slips in .+ band for these dates$/u.test(text));
  const emptyDetail = isMatches ? "" : describe("No Best Slips available yet");
  const noPublication = emptyDetail.startsWith("Best Slips checks for eligible combinations") ? "awaiting-publication"
    : staging && emptyDetail === "Best Slips need current bookmaker odds approved for display. You can still browse matches and results."
      ? "staging-odds-not-approved" : null;
  if (rows === 0 && !empty && !noPublication && !incompleteCoverage) return false;
  if (rows > (isMatches ? 50 : 20)) return { failure: "unbounded-initial-list" };
  const list = rows > 0 ? "rows" : incompleteCoverage ? "staging-zero-coverage" : noPublication ?? "empty";
  if (phase === "list") return { list, rows };

  const panel = shown(shell, isMatches
    ? '[data-feed-performance-state="ready"] [data-performance-summary="matches"]'
    : '[data-best-slips-page] [data-performance-summary="slips"]');
  if (!panel || panel.getAttribute("aria-busy") === "true") return false;
  const outcomes = ["all", "won", "pending", "lost", "void", "cancelled", "others"];
  const figures = outcomes.map(outcome => panel.querySelector(`[data-summary-count="${outcome}"]`)?.textContent.trim()
    .replace(/[,  ]/gu, ""));
  // Authentic awaiting-publication pages have no values at all. Production also must qualify a populated cohort.
  if (noPublication && figures.every(value => value === "—")) return { summary: noPublication };
  if (figures.some(value => !value || !/^(0|[1-9][0-9]*)$/u.test(value) || !Number.isSafeInteger(Number(value)))) return false;
  const counts = Object.fromEntries(outcomes.map((outcome, index) => [outcome, Number(figures[index])]));
  if (counts.others !== counts.void + counts.cancelled) return { failure: "inconsistent-other-count" };
  return { summary: "ready", counts };
}

function remaining(start) {
  return Math.max(1, phaseTimeout - Math.round(performance.now() - start));
}

async function phaseState(page, pathname, phase, start, staging) {
  const parameters = { pathname, phase, staging };
  let state;
  try {
    state = await page.waitForFunction(feedState, parameters, { timeout: remaining(start) });
    const result = await state.jsonValue();
    requireReady(!result.failure, result.failure);
    return result;
  } catch (cause) {
    if (cause?.name === "TimeoutError") {
      const result = await page.evaluate(feedState, { ...parameters, diagnose: true });
      requireReady(!result?.failure, result?.failure);
    }
    throw cause;
  } finally { await state?.dispose(); }
}

async function navigate(page, url, build) {
  const response = await page.goto(url.href, { waitUntil: "commit", timeout: navigationTimeout });
  requireReady(response?.status() === 200 && new URL(response.url()).origin === url.origin, "document-response");
  return async () => {
    // Next emits the exact build identity in the root Flight record of complete browser documents.
    const html = await response.text();
    requireReady(html.includes(String.raw`\"b\":\"${build}\"`), "document-build-identity");
  };
}

async function openBestSlips(page, origin) {
  const link = page.locator(`a[href="${bestSlips}"]:visible`).first();
  if (!await link.isVisible()) {
    const more = page.locator("[data-nav-more] > summary:visible").first();
    if (await more.isVisible()) await more.click({ timeout: navigationTimeout });
  }
  await link.click({ timeout: navigationTimeout });
  await page.waitForURL(url => url.origin === origin && url.pathname === bestSlips, { waitUntil: "commit", timeout: navigationTimeout });
}

async function verifyStagingCoverage(page, origin, start) {
  const url = new URL("/api/matches?when=today&pageSize=1", origin);
  const response = await page.request.get(url.href, { timeout: remaining(start), maxRedirects: 0 });
  requireReady(response.status() === 200, "staging-zero-coverage-response");
  const data = await response.json();
  requireReady(data?.state === "data-unavailable" && Array.isArray(data.records) && data.records.length === 0
    && data.total === 0 && data.page === 1 && data.pageSize === 1 && typeof data.today === "string"
    && data.range?.from === data.today && data.range?.to === data.today && data.access?.tier === "free"
    && data.access?.signedIn === false && data.coverage?.knownFixtures === 0 && data.coverage?.partial === true,
  "staging-zero-coverage-shape");
}

async function qualify(page, origin, observations, state, name, pathname, open) {
  const start = performance.now();
  state.phase = `${name}-navigation`;
  const confirmDocument = await open();
  state.phase = `${name}-list`;
  const staging = origin === "https://test.goalhint.com";
  const list = await phaseState(page, pathname, "list", start, staging);
  const listMs = Math.round(performance.now() - start);
  state.phase = `${name}-summary`;
  const summary = await phaseState(page, pathname, "summary", start, staging);
  const summaryMs = Math.round(performance.now() - start);
  if (list.list === "staging-zero-coverage" && !state.stagingCoverageChecked) {
    state.phase = `${name}-staging-coverage`;
    await verifyStagingCoverage(page, origin, start);
    state.stagingCoverageChecked = true;
  }
  if (confirmDocument) {
    state.phase = `${name}-document-identity`;
    await confirmDocument();
  }
  requireReady(new URL(page.url()).origin === origin, "unexpected-navigation-origin");
  requireReady(!state.pageErrors, "uncaught-page-error");
  observations.push({ phase: name, listMs, summaryMs, ...list, ...summary });
  return list.rows > 0 && summary.summary === "ready";
}

async function qualifyCoverage(page, origin, build, observations, state, path, alternatives) {
  for (const [name, query] of alternatives) {
    const populated = await qualify(page, origin, observations, state, name, path,
      () => navigate(page, new URL(`${path}?${query}`, origin), build));
    if (populated) return;
  }
  throw new ReadinessError(path === matches ? "production-matches-cohort-uncovered" : "production-best-slips-cohort-uncovered");
}

async function verifyStagedSlipFault(page) {
  const start = performance.now();
  diagnostic.phase = "best-slips-injected-503";
  const api = url => url.pathname === "/api/best-slips";
  const pageContainer = page.locator("[data-best-slips-page]");
  const figures = pageContainer.locator("[data-summary-count]");
  const rows = pageContainer.locator("[data-slip-key]");
  const previousFigures = await figures.allTextContents(), previousRows = await rows.count();
  await pageContainer.locator("[data-best-slips-filter-trigger]").click({ timeout: remaining(start) });
  const dialog = page.getByRole("dialog");
  await dialog.locator("[data-slip-period-select]").selectOption("yesterday", { timeout: remaining(start) });
  await dialog.locator('select[name="status"]').selectOption("all", { timeout: remaining(start) });
  await page.route(api, route => route.fulfill({ status: 503, json: { error: "unavailable" } }), { times: 1 });
  await dialog.getByRole("button", { name: "Apply", exact: true }).click({ timeout: remaining(start) });
  const failure = pageContainer.locator("[data-best-slips-update-failed]");
  await failure.waitFor({ timeout: remaining(start) });
  requireReady(await rows.count() === previousRows && JSON.stringify(await figures.allTextContents()) === JSON.stringify(previousFigures),
    "staged-fault-discarded-accepted-content");

  diagnostic.phase = "best-slips-injected-503-retry";
  const response = page.waitForResponse(result => api(new URL(result.url())) && result.status() === 200, { timeout: remaining(start) });
  await Promise.all([response, failure.getByRole("button", { name: "Try again", exact: true }).click({ timeout: remaining(start) })]);
  await failure.waitFor({ state: "hidden", timeout: remaining(start) });
  const list = await phaseState(page, bestSlips, "list", start, true);
  const summary = await phaseState(page, bestSlips, "summary", start, true);
  return { phase: "best-slips-injected-503", recoveryMs: Math.round(performance.now() - start), ...list, ...summary };
}

async function run() {
  const [source, build, playwright, option, ...rest] = process.argv.slice(2);
  const origin = source?.replace(/\/$/u, "");
  requireReady(targets.has(origin) && /^[A-Za-z0-9_-]{6,128}$/u.test(build ?? "") && playwright && isAbsolute(playwright)
    && (!option || option === "--faults") && rest.length === 0, "invalid-arguments");
  const staging = origin === "https://test.goalhint.com";
  requireReady(!option || staging, "fault-testing-requires-staging");
  const { chromium } = await import(pathToFileURL(playwright).href);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const viewport = option ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    const context = await browser.newContext({ viewport, serviceWorkers: "block", colorScheme: option ? "dark" : "light",
      isMobile: Boolean(option), hasTouch: Boolean(option) });
    const page = await context.newPage();
    page.on("pageerror", () => { diagnostic.pageErrors++; });
    if (option) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 160, downloadThroughput: 625_000, uploadThroughput: 312_500 });
    }
    const cold = await qualify(page, origin, observations, diagnostic, "matches-cold", matches,
      () => navigate(page, new URL(matches, origin), build));
    const slips = await qualify(page, origin, observations, diagnostic, "best-slips-navigation", bestSlips,
      () => openBestSlips(page, origin));
    const back = await qualify(page, origin, observations, diagnostic, "matches-history-return", matches, async () => {
      await page.goBack({ waitUntil: "commit", timeout: navigationTimeout });
      await page.waitForURL(url => url.origin === origin && url.pathname === matches, { waitUntil: "commit", timeout: navigationTimeout });
    });
    const coldSlips = await qualify(page, origin, observations, diagnostic, "best-slips-cold", bestSlips,
      () => navigate(page, new URL(bestSlips, origin), build));
    if (option) observations.push(await verifyStagedSlipFault(page));
    if (!staging && !cold && !back) await qualifyCoverage(page, origin, build, observations, diagnostic, matches,
      [["matches-today-all", "when=today&result=all"], ["matches-yesterday-all", "when=yesterday&result=all"]]);
    if (!staging && !slips && !coldSlips) await qualifyCoverage(page, origin, build, observations, diagnostic, bestSlips,
      [["best-slips-yesterday-all", "period=yesterday&status=all"], ["best-slips-today-all", "period=today&status=all"]]);
    requireReady(!diagnostic.pageErrors, "uncaught-page-error");
    return { build, viewport, observations, pageErrors: diagnostic.pageErrors };
  } finally { await browser.close(); }
}

const observations = [];
const diagnostic = { phase: "browser-start", pageErrors: 0 };
const watchdog = setTimeout(() => {
  console.error(JSON.stringify({ ok: false, failure: "browser-deadline", ...diagnostic, observations }));
  process.exit(1);
}, totalTimeout);
watchdog.unref();
try {
  console.log(JSON.stringify({ ok: true, ...await run() }));
} catch (cause) {
  const failure = diagnostic.pageErrors ? "uncaught-page-error" : cause instanceof ReadinessError ? cause.message
    : cause?.name === "TimeoutError" ? "readiness-deadline" : "browser-verifier-error";
  console.error(JSON.stringify({ ok: false, failure, ...diagnostic, observations }));
  process.exitCode = 1;
} finally { clearTimeout(watchdog); }
