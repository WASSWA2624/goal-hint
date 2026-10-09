import assert from "node:assert/strict";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "../src/domain/calendar.ts";
import { feedHref, getFeedEntry, informationPages } from "../src/domain/navigation.ts";

// Inspect the actual production build: npm run build; npm run start -- --port 3106.
const origin = new URL(process.argv[2] ?? "http://127.0.0.1:3106");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname), "Use a local acceptance server.");
const today = getReportingDate(utcInstantFromEpochMilliseconds(Date.now()));
const todayPath = feedHref(getFeedEntry(today, "today"));
const resultsPath = feedHref(getFeedEntry(today, "results"));

async function request(path) {
  // Every fetch starts without visitor credentials, tokens or a cookie jar.
  const response = await fetch(new URL(path, origin), {
    redirect: "manual", headers: { "Accept-Language": "fr-FR,sw;q=0.8" }, signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.headers.get("set-cookie"), null, `${path}: no visitor cookie`);
  return { response, html: await response.text() };
}

const root = await request("/");
assert.equal(root.response.status, 308);
assert.equal(new URL(root.response.headers.get("location"), origin).pathname, "/en");

for (const path of ["/en", todayPath, resultsPath, "/en/predictions/2020-02-29?status=finished",
  ...informationPages.map((page) => `/en/${page}`)]) {
  const { response, html } = await request(path);
  assert.equal(response.status, 200, path);
  assert.match(html, /<html[^>]*lang="en"/);
  assert.match(html, /<meta name="robots" content="noindex, follow"/);
  assert.match(html, /<header[\s>]/);
  assert.match(html, /<main[^>]*id="main-content"[^>]*tabindex="-1"/);
  assert.match(html, /<footer[\s>]/);
  assert.equal((html.match(/<main[\s>]/g) ?? []).length, 1);
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1);
  assert.match(html, /href="#main-content"/);
  assert.ok(/<style data-styled[=\s]/.test(html), `${path}: server-rendered styled-components CSS`);
  assert.ok(html.indexOf("data-styled=") < html.indexOf("<header"), `${path}: initial shell CSS`);
  const visibleHtml = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, "");
  assert.equal((visibleHtml.match(/aria-current="page"/g) ?? []).length, 1, `${path}: initial current location`);
  assert.ok(visibleHtml.includes(`href="${todayPath}"`), `${path}: Today target`);
  assert.ok(visibleHtml.includes(`href="${resultsPath}"`), `${path}: Results target`);
  assert.doesNotMatch(visibleHtml, /<select|sign[ -]?in|log[ -]?in|no fixtures|no matches|54%|Brand styling preview/i);
  for (const page of informationPages) assert.ok(visibleHtml.includes(`href="/en/${page}"`));
  console.log(`PASS initial anonymous HTML: ${path}`);
}

for (const [path, target] of [["/fr", "/en"], ["/sw/privacy", "/en/privacy"],
  ["/en-US/predictions/2020-02-29?status=finished", "/en/predictions/2020-02-29?status=finished"]]) {
  const { response } = await request(path);
  assert.equal(response.status, 307, path);
  assert.equal(new URL(response.headers.get("location"), origin).pathname +
    new URL(response.headers.get("location"), origin).search, target);
}

for (const path of ["/en/predictions/2026-02-29", "/en/predictions/2026-1-01",
  "/en/predictions/2026-10-09?status=correct", "/en/predictions/2026-10-09?status=all&status=finished",
  "/en/matches/unknown/home-v-away", "/en/results", "/en/not-a-page"]) {
  const { response, html } = await request(path);
  assert.equal(response.status, 404, path);
  assert.match(html, /Page not found/);
  assert.match(html, /noindex/);
}
console.log("PASS root redirect, path/query-preserving English fallback, and invalid/unknown-route 404s.");
