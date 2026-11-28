/** Measure cold delivery from benchmark-ui.py --serve, using its isolated fixture. */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const routes = [
  { path: "/en/matches", row: "[data-fixture-id]", count: '[data-performance-summary="matches"] [data-summary-count="won"]' },
  { path: "/best-slips/browse", row: "[data-slip-key]", count: '[data-performance-summary="slips"] [data-summary-count="won"]' },
];
const profiles = [
  { name: "mobile", width: 390, height: 844, rtt: 150, down: 625_000, up: 125_000, cpu: 4 },
  { name: "desktop", width: 1440, height: 900 },
];

function observe({ row, count }) {
  const result = { contentMs: null, summaryMs: null, lcpMs: null, cls: 0, longTasks: 0, blockingMs: 0 };
  window.feedDelivery = result;
  const mark = () => {
    if (result.contentMs === null && document.querySelector(row)?.getBoundingClientRect().height) {
      result.contentMs = performance.now();
    }
    const value = document.querySelector(count);
    if (result.summaryMs === null && /^\s*\d[\d,]*\s*$/u.test(value?.textContent ?? "")
      && value.getBoundingClientRect().height) {
      result.summaryMs = performance.now();
      result.won = value.textContent.trim();
    }
    if (result.contentMs !== null && result.summaryMs !== null) observer.disconnect();
  };
  const observer = new MutationObserver(() => requestAnimationFrame(mark));
  observer.observe(document, { childList: true, subtree: true, characterData: true });
  for (const type of ["largest-contentful-paint", "layout-shift", "longtask"]) {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (type === "largest-contentful-paint") result.lcpMs = entry.startTime;
        if (type === "layout-shift" && !entry.hadRecentInput) result.cls += entry.value;
        if (type === "longtask") { result.longTasks++; result.blockingMs += Math.max(0, entry.duration - 50); }
      }
    }).observe({ type, buffered: true });
  }
}

async function measure(browser, origin, profile, route, theme, screenshot) {
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: profile.width, height: profile.height },
    colorScheme: theme, isMobile: profile.name === "mobile", hasTouch: profile.name === "mobile" });
  try {
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(observe, route);
    if (profile.rtt) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: profile.rtt,
        downloadThroughput: profile.down, uploadThroughput: profile.up, connectionType: "cellular4g" });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
    }
    const response = await page.goto(origin + route.path, { waitUntil: "commit", timeout: 30_000 });
    if (response?.status() !== 200) throw new Error(`Document HTTP ${response?.status()}`);
    await page.waitForFunction(() => window.feedDelivery && window.feedDelivery.contentMs !== null && window.feedDelivery.summaryMs !== null,
      null, { timeout: 20_000 });
    await page.waitForLoadState("load", { timeout: 30_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    if (errors.length) throw new Error(errors.join("\n"));
    const sample = await page.evaluate(() => {
      const documentTiming = performance.getEntriesByType("navigation")[0];
      const resources = performance.getEntriesByType("resource").filter(entry => new URL(entry.name).origin === location.origin);
      const scripts = resources.filter(entry => new URL(entry.name).pathname.endsWith(".js"));
      return { ...window.feedDelivery, ttfbMs: documentTiming.responseStart,
        fcpMs: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
        requests: resources.length + 1, wireBytes: documentTiming.transferSize + resources.reduce((sum, entry) => sum + entry.transferSize, 0),
        scriptBytes: scripts.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
        documentBytes: documentTiming.encodedBodySize, rows: document.querySelectorAll("[data-fixture-id], [data-slip-key]").length };
    });
    if (screenshot) {
      await page.waitForFunction(mode => document.querySelector('meta[name="color-scheme"]')?.content === mode, theme);
      await page.screenshot({ path: screenshot, animations: "disabled" });
    }
    return sample;
  } finally { await context.close(); }
}

const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(p * values.length) - 1] : null;
function summarize(samples) {
  const passed = samples.filter(sample => !sample.error);
  const metrics = Object.entries(passed[0] ?? {}).filter(([, value]) => typeof value === "number").map(([key]) => key);
  return { total: samples.length, pass: passed.length, failures: samples.length - passed.length,
    won: [...new Set(passed.map(sample => sample.won))],
    metrics: Object.fromEntries(metrics.map(key => {
      const values = passed.map(sample => sample[key]).filter(Number.isFinite);
      return [key, { p50: percentile(values, 0.50), p95: percentile(values, 0.95) }];
    })) };
}

const { values } = parseArgs({ options: { before: { type: "string" }, after: { type: "string" },
  playwright: { type: "string" }, output: { type: "string", default: "output/playwright/feed-delivery" },
  runs: { type: "string", default: "5" } } });
const origins = Object.entries({ before: values.before, after: values.after }).filter(([, origin]) => origin);
const runs = Number(values.runs);
if (!origins.length || origins.some(([, origin]) => !["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  || !Number.isInteger(runs) || runs < 1 || runs > 50) throw new Error("Provide loopback fixture origins and 1–50 runs.");
const { chromium } = await import(values.playwright ? pathToFileURL(path.resolve(values.playwright)).href : "playwright");
await mkdir(values.output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = { chromium: browser.version(), profiles, lab: true, data: [] };
try {
  for (const profile of profiles) for (const route of routes) {
    const samples = Object.fromEntries(origins.map(([label]) => [label, []]));
    for (let index = 0; index < runs; index++) {
      for (const [label, origin] of index % 2 ? [...origins].reverse() : origins) {
        const theme = index % 2 ? "dark" : "light";
        const shot = index < 2 ? path.join(values.output, `${label}-${profile.name}-${theme}-${route.path.split("/").slice(1).join("-")}.png`) : null;
        try { samples[label].push(await measure(browser, origin, profile, route, theme, shot)); }
        catch (error) { samples[label].push({ error: String(error) }); }
      }
    }
    report.data.push({ profile: profile.name, path: route.path, samples,
      summary: Object.fromEntries(Object.entries(samples).map(([name, results]) => [name, summarize(results)])) });
    console.log(JSON.stringify({ profile: profile.name, path: route.path, summary: report.data.at(-1).summary }));
  }
} finally {
  await browser.close();
  await writeFile(path.join(values.output, "delivery.json"), JSON.stringify(report, null, 2));
}
