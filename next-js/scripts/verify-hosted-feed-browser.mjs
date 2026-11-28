import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

const targets = new Set(["https://test.goalhint.com", "https://goalhint.com"]);
const matches = "/en/matches";
const bestSlips = "/en/best-slips";
const navigationTimeout = 15_000;
const documentStartupTimeout = 20_000;
const phaseTimeout = 30_000;
const initialRecoveryTimeout = 45_000;
const totalTimeout = 115_000;
const archiveUnavailableTitle = "Slips could not be loaded. Please try again.";
let initialArchiveFailure;
const isInitialArchive = (url, origin) => url.origin === origin && url.pathname === "/api/best-slips"
  && url.searchParams.get("period") === "today" && url.searchParams.get("status") === "pending"
  && url.searchParams.get("page") === "1" && url.searchParams.get("oddsBand") === "1.5-5";

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
    if (shown(shell, '[data-feed-initial-retry="true"][aria-busy="true"]'))
      return diagnose ? { pending: "matches-list-recovery-deadline" } : false;
    if (phase === "summary" && shown(shell, '[data-feed-summary-retry="true"]'))
      return diagnose ? { pending: "matches-summary-recovery-deadline" } : false;
    if (phase === "summary" && diagnose && shown(shell, '[data-feed-performance-state="loading"]'))
      return { pending: "matches-summary-response-deadline", awaitingResponse: true };
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
  const incompleteCoverage = isMatches && (region.getAttribute("data-feed-list-state") === "data-unavailable"
    || headings.includes("Fixture data unavailable"));
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

function remaining(start, budget = phaseTimeout) {
  return Math.max(1, budget - Math.round(performance.now() - start));
}

async function phaseState(page, pathname, phase, start, staging, budget = phaseTimeout) {
  const parameters = { pathname, phase, staging };
  let state;
  try {
    state = await page.waitForFunction(feedState, parameters, { timeout: remaining(start, budget) });
    const result = await state.jsonValue();
    requireReady(!result.failure, result.failure);
    return result;
  } catch (cause) {
    if (cause?.name === "TimeoutError") {
      const result = await page.evaluate(feedState, { ...parameters, diagnose: true });
      requireReady(!result?.failure, result?.failure);
      if (result?.list || result?.summary) return result;
      if (result?.awaitingResponse && budget === phaseTimeout && diagnostic.summaryRequestedAt > start) {
        const responseBudget = Math.min(initialRecoveryTimeout, phaseTimeout + diagnostic.summaryRequestedAt - start);
        return phaseState(page, pathname, phase, start, staging, responseBudget);
      }
      if (result?.pending && !result.awaitingResponse && budget === phaseTimeout)
        return phaseState(page, pathname, phase, start, staging, initialRecoveryTimeout);
      requireReady(!result?.pending, result?.pending);
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
  diagnostic.phase = "best-slips-trigger";
  const navigation = page.locator("[data-responsive-navigation]:visible").first();
  const link = navigation.locator(`a[data-nav-key="best-slips"][href="${bestSlips}"]:visible`).first();
  if (!await link.isVisible()) {
    const more = navigation.locator("[data-nav-more] summary:visible").first();
    if (await more.isVisible()) await more.click({ timeout: navigationTimeout });
  }
  await link.click({ timeout: navigationTimeout });
  diagnostic.phase = "best-slips-route-commit";
  // The app keeps its foreground progress indicator visible for 30 seconds
  // during client-side route changes. Match that window for the URL commit.
  await page.waitForURL(url => url.origin === origin && url.pathname === bestSlips, { waitUntil: "commit", timeout: phaseTimeout });
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

async function verifyBestSlipsList(page, origin, start, staging, document) {
  try {
    return await phaseState(page, bestSlips, "list", start, staging);
  } catch (cause) {
    if (!(cause instanceof ReadinessError) || cause.message !== "best-slips-unavailable" || (!document && !initialArchiveFailure)) throw cause;
    const failure = initialArchiveFailure;
    const panel = page.locator('[data-best-slips-page] [role="alert"]')
      .filter({ has: page.getByRole("heading", { name: archiveUnavailableTitle, exact: true }) });
    if (!await panel.isVisible()) throw cause;
    diagnostic.phase = "best-slips-initial-retry";
    const retryAt = performance.now(), documentStart = await page.evaluate(() => performance.timeOrigin);
    const response = page.waitForResponse(value => failure ? value.url() === failure.href : isInitialArchive(new URL(value.url()), origin),
      { timeout: phaseTimeout });
    const [reply] = await Promise.all([response, panel.getByRole("button", { name: "Try again", exact: true })
      .click({ timeout: navigationTimeout })]);
    requireReady(reply.status() === 200, "best-slips-initial-retry-response");
    const list = await phaseState(page, bestSlips, "list", retryAt, staging);
    requireReady(await page.evaluate(() => performance.timeOrigin) === documentStart, "best-slips-initial-retry-reloaded");
    return { ...list, initialArchiveStatus: failure?.status ?? "document-read-unavailable", archiveRecoveryMs: Math.round(performance.now() - retryAt) };
  }
}

async function qualify(page, origin, observations, state, name, pathname, open) {
  const start = performance.now();
  state.acceptedList = null;
  state.summaryRequestedAt = 0;
  initialArchiveFailure = undefined;
  state.phase = `${name}-navigation`;
  const confirmDocument = await open();
  const navigationAt = performance.now();
  const navigationMs = Math.round(navigationAt - start);
  state.phase = `${name}-list`;
  const staging = origin === "https://test.goalhint.com";
  const list = name === "best-slips-navigation" || name === "best-slips-cold"
    ? await verifyBestSlipsList(page, origin, confirmDocument ? start : navigationAt, staging, Boolean(confirmDocument))
    : await phaseState(page, pathname, "list", confirmDocument ? start : navigationAt, staging);
  const listMs = Math.round(performance.now() - start);
  state.acceptedList = { listMs, ...list };
  let documentReadyMs;
  if (confirmDocument) {
    // A streamed list can be visible before the browser finishes parsing the
    // document and running its deferred scripts. Measure data after startup.
    state.phase = `${name}-document-startup`;
    await page.waitForLoadState("domcontentloaded", { timeout: documentStartupTimeout });
    documentReadyMs = Math.round(performance.now() - start);
  }
  state.phase = `${name}-summary`;
  const summary = await phaseState(page, pathname, "summary", performance.now(), staging);
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
  observations.push({ phase: name, navigationMs, listMs, summaryMs, ...(documentReadyMs !== undefined && { documentReadyMs }), ...list, ...summary });
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

async function verifyMore(page, observations, kind, maximum = 2) {
  const matchesFeed = kind === "matches";
  const pagination = matchesFeed ? "[data-feed-pagination]" : "[data-best-slips-pagination]";
  const row = matchesFeed ? "[data-feed-match-results] [data-fixture-id]" : "[data-slip-list] [data-slip-key]";
  const identity = matchesFeed ? "data-fixture-id" : "data-slip-key";
  const button = page.locator(`${pagination} [data-show-more]`);
  for (let attempt = 1; attempt <= maximum && await button.isVisible(); attempt++) {
    const initialRows = await page.locator(`${row}:visible`).count();
    requireReady(initialRows > 0, `${kind}-append-needs-rows`);
    const started = performance.now();
    diagnostic.phase = `${kind}-load-more-${attempt}`;
    await button.click({ timeout: remaining(started) });
    const appended = await page.waitForFunction(({ row, identity, initialRows, pagination }) => {
      if (document.querySelector(`${pagination} [data-show-more-status], ${pagination} [data-pagination-retry]`)) return { failed: true };
      const results = Array.from(document.querySelectorAll(row))
        .filter(item => item.getClientRects().length && getComputedStyle(item).visibility === "visible")
        .map(item => item.getAttribute(identity));
      const control = document.querySelector(`${pagination} [data-show-more]`);
      if (control?.getAttribute("aria-busy") === "true" || control && results.length <= initialRows) return null;
      return { rows: results.length, unique: new Set(results).size, terminal: results.length <= initialRows };
    }, { row, identity, initialRows, pagination }, { timeout: remaining(started) });
    const result = await appended.jsonValue();
    await appended.dispose();
    requireReady(!result.failed, `${kind}-append-unavailable`);
    requireReady(result.rows === result.unique, `${kind}-append-duplicate-rows`);
    observations.push({ phase: diagnostic.phase, initialRows, rows: result.rows, listMs: Math.round(performance.now() - started),
      ...(result.terminal && { terminal: true }) });
  }
}

async function verifyStagedSlipFault(page) {
  const start = performance.now();
  diagnostic.phase = "best-slips-injected-503";
  const api = url => url.pathname === "/api/best-slips" && url.searchParams.get("period") === "yesterday"
    && url.searchParams.get("status") === "all";
  const pageContainer = page.locator("[data-best-slips-page]");
  const figures = pageContainer.locator("[data-summary-count]");
  const rows = pageContainer.locator("[data-slip-key]");
  const previousFigures = await figures.allTextContents(), previousRows = await rows.count();
  await pageContainer.locator("[data-best-slips-filter-trigger]").click({ timeout: remaining(start) });
  const dialog = page.getByRole("dialog");
  await dialog.locator("[data-slip-period-select]").click({ timeout: remaining(start) });
  await dialog.getByRole("option", { name: "Yesterday", exact: true }).click({ timeout: remaining(start) });
  await dialog.getByRole("combobox", { name: /^Status:/u }).click({ timeout: remaining(start) });
  await dialog.getByRole("option", { name: "All slips", exact: true }).click({ timeout: remaining(start) });
  await page.route(api, route => route.fulfill({ status: 503, json: { error: "unavailable" } }), { times: 1 });
  await dialog.getByRole("button", { name: "Apply Filters", exact: true }).click({ timeout: remaining(start) });
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
  let page;
  try {
    const viewport = option ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    const context = await browser.newContext({ viewport, serviceWorkers: "block", colorScheme: option ? "dark" : "light",
      isMobile: Boolean(option), hasTouch: Boolean(option) });
    page = await context.newPage();
    const community = page.locator("dialog[data-community-invitation][open]");
    const communitySettings = url => url.origin === origin && url.pathname === "/api/community";
    await page.addLocatorHandler(community, async dialog => {
      await dialog.getByRole("button", { name: "Close", exact: true }).click({ timeout: 5000 });
      diagnostic.communityInvitationDismissed = true;
    }, { times: 1 });
    page.on("pageerror", () => { diagnostic.pageErrors++; });
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.origin === origin && url.pathname === "/api/matches/summary") {
        diagnostic.summaryRequests++;
        if (!diagnostic.summaryRequestedAt) diagnostic.summaryRequestedAt = performance.now();
      }
    });
    page.on("requestfailed", request => {
      const url = new URL(request.url());
      if (url.origin !== origin || !(request.resourceType() === "script" || ["/api/matches", "/api/matches/summary", "/api/best-slips"].includes(url.pathname))) return;
      diagnostic.failedRequests.push({ path: request.resourceType() === "script" ? "script" : url.pathname,
        error: request.failure()?.errorText?.match(/^net::ERR_[A-Z_]+$/u)?.[0] ?? "request-failed" });
      if (diagnostic.failedRequests.length > 8) diagnostic.failedRequests.shift();
    });
    page.on("response", response => {
      const url = new URL(response.url());
      const headers = response.headers();
      const routeHeaders = url.pathname === bestSlips ? response.request().headers() : {};
      const slipFlight = routeHeaders.rsc === "1";
      if (url.origin !== origin || (!slipFlight && !["/api/matches", "/api/matches/summary", "/api/best-slips"].includes(url.pathname))) return;
      if (isInitialArchive(url, origin) && [502, 503, 504].includes(response.status())
        && ["best-slips-route-commit", "best-slips-navigation-list", "best-slips-cold-list"].includes(diagnostic.phase))
        initialArchiveFailure ??= { href: response.url(), status: response.status() };
      const id = headers["x-request-id"], duration = headers["server-timing"]?.match(/\bapp;dur=(\d+)\b/u)?.[1];
      diagnostic.apiResponses.push({ path: url.pathname, status: response.status(),
        ...(slipFlight && { flight: true, prefetch: Boolean(routeHeaders["next-router-prefetch"] || routeHeaders["next-router-segment-prefetch"]),
          componentResponse: headers["content-type"]?.startsWith("text/x-component") ?? false }),
        ...(/^[a-f0-9-]{36}$/u.test(id ?? "") && { requestId: id }), ...(duration && { appMs: Number(duration) }) });
      if (diagnostic.apiResponses.length > 8) diagnostic.apiResponses.shift();
    });
    if (option) {
      await page.route(communitySettings, route => route.fulfill({ json: {
        visible: true, links: [{ type: "whatsapp-channel", url: "https://www.whatsapp.com/channel/goalhint-verification", enabled: true }],
      } }));
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 160, downloadThroughput: 625_000, uploadThroughput: 312_500 });
    }
    const cold = await qualify(page, origin, observations, diagnostic, "matches-cold", matches,
      () => navigate(page, new URL(matches, origin), build));
    if (option && !diagnostic.communityInvitationDismissed) {
      diagnostic.phase = "staged-community-invitation";
      await page.waitForFunction(() => Boolean(document.querySelector("dialog[data-community-invitation][open]")),
        null, { timeout: navigationTimeout });
    }
    const initialArchiveRoute = url => isInitialArchive(url, origin);
    if (option) await page.route(initialArchiveRoute,
      route => route.fulfill({ status: 503, json: { error: "unavailable" } }), { times: 1 });
    const slips = await qualify(page, origin, observations, diagnostic, "best-slips-navigation", bestSlips,
      () => openBestSlips(page, origin));
    if (option) {
      requireReady(diagnostic.communityInvitationDismissed, "staged-community-invitation-not-dismissed");
      // A completed Flight seed bypasses the initial archive GET. If the page
      // did request it, exercise its injected fault and same-query retry.
      if (diagnostic.apiResponses.some(item => item.path === "/api/best-slips"))
        requireReady(observations.some(item => item.phase === "best-slips-navigation" && item.initialArchiveStatus === 503),
          "staged-best-slips-initial-retry-not-observed");
      await page.unroute(initialArchiveRoute);
      await page.unroute(communitySettings);
    }
    const back = await qualify(page, origin, observations, diagnostic, "matches-history-return", matches, async () => {
      await page.goBack({ waitUntil: "commit", timeout: phaseTimeout });
      await page.waitForURL(url => url.origin === origin && url.pathname === matches, { waitUntil: "commit", timeout: phaseTimeout });
    });
    await verifyMore(page, observations, "matches");
    const coldSlips = await qualify(page, origin, observations, diagnostic, "best-slips-cold", bestSlips,
      () => navigate(page, new URL(bestSlips, origin), build));
    await verifyMore(page, observations, "best-slips");
    if (option) observations.push(await verifyStagedSlipFault(page));
    if (!staging && !cold && !back) await qualifyCoverage(page, origin, build, observations, diagnostic, matches,
      [["matches-today-all", "when=today&result=all"], ["matches-yesterday-all", "when=yesterday&result=all"]]);
    if (!staging && !slips && !coldSlips) await qualifyCoverage(page, origin, build, observations, diagnostic, bestSlips,
      [["best-slips-yesterday-all", "period=yesterday&status=all"], ["best-slips-today-all", "period=today&status=all"]]);
    requireReady(!diagnostic.pageErrors, "uncaught-page-error");
    return { build, viewport, observations, communityInvitationDismissed: diagnostic.communityInvitationDismissed, pageErrors: diagnostic.pageErrors };
  } catch (cause) {
    diagnostic.document = await page?.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      const summary = document.querySelector("[data-feed-performance-state]")?.getAttribute("data-feed-performance-state");
      return { state: document.readyState, responseEndMs: Math.round(navigation?.responseEnd ?? 0),
        domContentLoadedMs: Math.round(navigation?.domContentLoadedEventEnd ?? 0),
        scriptsCompleted: performance.getEntriesByType("resource").filter(entry => entry.initiatorType === "script").length,
        clientAppearance: Boolean(document.querySelector('meta[name="goal-hint-appearance"]')),
        summaryDeferred: Boolean(document.querySelector('[data-feed-performance-deferred="true"]')),
        ...(["loading", "ready", "unavailable", "stale", "unknown"].includes(summary) && { summary }) };
    }).catch(() => null);
    throw cause;
  } finally { await browser.close(); }
}

const observations = [];
const diagnostic = { phase: "browser-start", pageErrors: 0, acceptedList: null, apiResponses: [], failedRequests: [],
  summaryRequests: 0, summaryRequestedAt: 0, communityInvitationDismissed: false };
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
