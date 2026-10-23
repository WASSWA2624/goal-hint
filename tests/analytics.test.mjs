import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fixtureAdminSessions, installAdminFixtureEnvironment } from "./helpers/admin-fixtures.mjs";
after(installAdminFixtureEnvironment());
import { analyticsGoals, analyticsRoute, analyticsRouteLabel, collectPayloadSchema, parseReportParameters, reportParameters } from "../src/domain/analytics.ts";
import { classifyChannel, isBotUserAgent, normalizeSearchTerm, sanitizeTarget, screenBucket, summarizeClient } from "../src/domain/analytics-classify.ts";
import { bucketKeys, comparisonRange, granularityFor, parseDateRange, presetRange, weekStart } from "../src/domain/analytics-range.ts";
import { csvCell, toCsv } from "../src/domain/analytics-csv.ts";
import { csvValue, formatDuration, formatValue } from "../src/domain/analytics-datasets.ts";
import { hashPassword, isPasswordHash, verifyPassword } from "../src/server/analytics/analytics-password.ts";
import { createAnalyticsConfig } from "../src/server/analytics/analytics-config.ts";
import { createCollectLimiter, resolveLocation } from "../src/server/analytics/analytics-collector.ts";
import { createAnalyticsServices, createCollectHandler, createCollectStatusHandler, createExportHandler, createLiveHandler, createLoginHandler, createLogoutHandler,
  createReportHandler, createSettingsHandlers, clientAddress, isSameOrigin } from "../src/server/analytics/analytics-http.ts";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";

const ids = { vid: "0c226900-e90a-42e0-84e3-b9bcc193ff35", sid: "1901969d-923f-49f3-884d-df2f230da111", pv: "36f3d940-66ff-4e02-b0f0-be26dbb5fed2" };
const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const payload = (events = [{ t: "pageview", id: ids.pv, path: "/en/help", title: "Help" }]) =>
  ({ v: 1, vid: ids.vid, sid: ids.sid, ctx: { tz: "Africa/Kampala", lang: "en-GB", sw: 1280, sh: 720, tp: 0 }, events });

test("page templates group concrete URLs and get readable labels", () => {
  assert.equal(analyticsRoute("/"), "/");
  assert.equal(analyticsRoute("/en"), "/[locale]");
  assert.equal(analyticsRoute("/en/predictions/2026-10-14"), "/[locale]/predictions/[date]");
  assert.equal(analyticsRoute("/en/matches/36f3d940-66ff-4e02-b0f0-be26dbb5fed2/arsenal-vs-chelsea"), "/[locale]/matches/[id]/[slug]");
  assert.equal(analyticsRoute("/en/matches/123/a-vs-b"), "/[locale]/matches/[id]/[slug]");
  assert.equal(analyticsRoute("/en/Help"), "/[locale]/help");
  assert.equal(analyticsRouteLabel("/[locale]/matches/[id]/[slug]"), "Match analysis");
  assert.equal(analyticsRouteLabel("/unknown/[id]"), "/unknown/[id]");
});

test("the collect payload is strict: identifiers, paths, sizes and event shapes are validated", () => {
  assert.ok(collectPayloadSchema.safeParse(payload()).success);
  const events = [
    { t: "engage", pv: ids.pv, ms: 30_000 }, { t: "click", pv: ids.pv, label: "Privacy", href: "/en/privacy" },
    { t: "outbound", pv: ids.pv, href: "https://www.bbc.co.uk/sport?x=1" }, { t: "download", pv: ids.pv, href: "/brand/kit.pdf" },
    { t: "search", pv: ids.pv, term: "Arsenal" }, { t: "custom", pv: ids.pv, name: "slip_build" },
  ];
  assert.ok(collectPayloadSchema.safeParse(payload(events)).success);
  for (const bad of [
    { ...payload(), extra: true },
    { ...payload(), vid: "not-a-uuid" },
    payload([{ t: "pageview", id: ids.pv, path: "/en?q=private" }]),
    payload([{ t: "pageview", id: ids.pv, path: "relative" }]),
    payload([{ t: "engage", pv: ids.pv, ms: 10_000_000 }]),
    payload([{ t: "custom", pv: ids.pv, name: "Bad Name" }]),
    payload([{ t: "outbound", pv: ids.pv, href: "javascript:alert(1)" }]),
    payload([{ t: "click", pv: ids.pv, label: "x", value: "typed text" }]),
    payload([]),
    payload(Array.from({ length: 26 }, () => ({ t: "engage", pv: ids.pv, ms: 1 }))),
  ]) assert.equal(collectPayloadSchema.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 120));
});

test("report parameters round-trip through the query string", () => {
  const query = parseReportParameters(new URLSearchParams("from=2026-10-01&to=2026-10-14&compare=year&f.device=mobile&f.page=%2Fen%2Fhelp"));
  assert.deepEqual(query, { from: "2026-10-01", to: "2026-10-14", compare: "year", filters: { device: "mobile", page: "/en/help" } });
  assert.deepEqual(parseReportParameters(reportParameters(query)), query);
  assert.equal(parseReportParameters(new URLSearchParams("from=2026-10-01&to=2026-10-14")).compare, "previous");
  assert.throws(() => parseReportParameters(new URLSearchParams("from=2026-10-01&to=2026-10-14&f.unknown=x")));
});

test("bots, crawlers, previews, scripts and headless browsers are excluded", () => {
  for (const agent of [null, "", "curl/8.4.0", "Googlebot/2.1 (+http://www.google.com/bot.html)", "Mozilla/5.0 (compatible; bingbot/2.0)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36",
    "facebookexternalhit/1.1", "WhatsApp/2.23.20.0", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1)",
    "python-requests/2.31", "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 Chrome-Lighthouse"]) {
    assert.equal(isBotUserAgent(agent), true, String(agent));
  }
  for (const agent of [chrome, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"]) {
    assert.equal(isBotUserAgent(agent), false, agent);
  }
});

test("user agents reduce to browser, OS and device families without storing the raw string", () => {
  const cases = [
    [chrome, {}, { deviceType: "desktop", browser: "Chrome", browserVersion: "141", os: "Windows", osVersion: "10+" }],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", {},
      { deviceType: "mobile", browser: "Safari", browserVersion: "17", os: "iOS", osVersion: "17" }],
    ["Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36", {},
      { deviceType: "mobile", browser: "Samsung Internet", browserVersion: "25", os: "Android", osVersion: "14" }],
    ["Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", {},
      { deviceType: "tablet", browser: "Chrome", browserVersion: "120", os: "Android", osVersion: "13" }],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15", { touchPoints: 5 },
      { deviceType: "tablet", browser: "Safari", browserVersion: "17", os: "iPadOS", osVersion: null }],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15", {},
      { deviceType: "desktop", browser: "Safari", browserVersion: "17", os: "macOS", osVersion: "10.15" }],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0", {},
      { deviceType: "desktop", browser: "Edge", browserVersion: "141", os: "Windows", osVersion: "10+" }],
    ["Mozilla/5.0 (Mobile; LYF/F271i/LYF_F271i-000-01-23-130121; Android; rv:48.0) Gecko/48.0 Firefox/48.0 KAIOS/2.5", {},
      { deviceType: "mobile", browser: "Firefox", browserVersion: "48", os: "KaiOS", osVersion: "2" }],
    ["Opera/9.80 (J2ME/MIDP; Opera Mini/9.80 (S60; SymbOS; Opera Mobi/23.348; U; en) Presto/2.5.25 Version/10.54", {},
      { deviceType: "mobile", browser: "Opera Mini", browserVersion: "9", os: "Other", osVersion: null }],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", {},
      { deviceType: "desktop", browser: "Firefox", browserVersion: "131", os: "Linux", osVersion: null }],
  ];
  for (const [agent, hints, expected] of cases) assert.deepEqual(summarizeClient(agent, hints), expected, agent);
  assert.equal(summarizeClient(chrome, { mobileHint: true }).deviceType, "mobile");
  const start = performance.now();
  summarizeClient(`Mozilla/5.0 (X11) Version/${"1".repeat(15_000)}`);
  assert.ok(performance.now() - start < 100, "A long user agent cannot backtrack quadratically.");
  assert.equal(screenBucket(390), "360-413");
  assert.equal(screenBucket(undefined), null);
});

test("traffic channels follow campaign tags, then click identifiers, then the referring site", () => {
  assert.equal(classifyChannel(null, undefined), "direct");
  assert.equal(classifyChannel("google.co.ug", undefined), "organic-search");
  assert.equal(classifyChannel("com.google.android.googlequicksearchbox", undefined), "organic-search");
  assert.equal(classifyChannel("duckduckgo.com", undefined), "organic-search");
  assert.equal(classifyChannel("l.facebook.com", undefined), "social");
  assert.equal(classifyChannel("t.co", undefined), "social");
  assert.equal(classifyChannel("chatgpt.com", undefined), "ai-assistant");
  assert.equal(classifyChannel("mail.google.com", undefined), "email");
  assert.equal(classifyChannel("bbc.co.uk", undefined), "referral");
  assert.equal(classifyChannel("google.com", { source: "google", medium: "cpc" }), "paid-search");
  assert.equal(classifyChannel(null, { source: "facebook", medium: "cpc" }), "paid-social");
  assert.equal(classifyChannel(null, { source: "weekly", medium: "Newsletter" }), "email");
  assert.equal(classifyChannel(null, { source: "whatsapp" }), "social");
  assert.equal(classifyChannel(null, { campaign: "launch" }), "campaign");
  assert.equal(classifyChannel("bing.com", { click: "microsoft" }), "paid-search");
  assert.equal(classifyChannel(null, { click: "meta" }), "social");
});

test("search terms and labels are minimized before storage", () => {
  assert.equal(normalizeSearchTerm("  ARSENAL   vs  Chelsea "), "arsenal vs chelsea");
  assert.equal(normalizeSearchTerm("call me +256 772 123456 or jane.doe@example.org"), "call me [number] or [email]");
  assert.equal(normalizeSearchTerm("   "), null);
  assert.equal(normalizeSearchTerm("x".repeat(300)).length, 100);
  assert.deepEqual(sanitizeTarget("https://www.bbc.co.uk/sport/football/123?utm_source=x&token=secret#top", "https://goalhint.com"),
    { host: "bbc.co.uk", target: "https://www.bbc.co.uk/sport/football/123", file: "123" });
  assert.equal(sanitizeTarget("mailto:someone@example.org", "https://goalhint.com"), null);
});

test("dashboard periods, comparisons and buckets follow the EAT reporting calendar", () => {
  const today = "2026-10-14";
  assert.deepEqual(presetRange("today", today), { from: today, to: today });
  assert.deepEqual(presetRange("last-7", today), { from: "2026-10-08", to: today });
  assert.deepEqual(presetRange("this-month", today), { from: "2026-10-01", to: today });
  assert.deepEqual(presetRange("last-month", today), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(comparisonRange({ from: "2026-10-08", to: "2026-10-14" }, "previous"), { from: "2026-10-01", to: "2026-10-07" });
  assert.deepEqual(comparisonRange({ from: "2028-02-29", to: "2028-03-01" }, "year"), { from: "2027-02-28", to: "2027-03-01" });
  assert.equal(comparisonRange({ from: today, to: today }, "none"), null);
  assert.equal(granularityFor({ from: "2026-10-13", to: today }), "hour");
  assert.equal(granularityFor({ from: "2026-07-01", to: today }), "day");
  assert.equal(granularityFor({ from: "2025-10-14", to: today }), "week");
  assert.equal(bucketKeys({ from: "2026-10-13", to: today }, "hour").length, 48);
  assert.equal(bucketKeys({ from: "2026-10-13", to: today }, "hour")[0], "2026-10-13 00");
  assert.equal(weekStart("2026-10-14"), "2026-10-12");
  assert.deepEqual(bucketKeys({ from: "2026-10-01", to: "2026-10-14" }, "week"), ["2026-09-28", "2026-10-05", "2026-10-12"]);
  assert.throws(() => parseDateRange("2026-10-14", "2026-10-01"), RangeError);
  assert.throws(() => parseDateRange("2020-01-01", "2026-10-01"), RangeError);
  assert.throws(() => parseDateRange("2026-02-30", "2026-03-01"));
});

test("CSV export neutralizes spreadsheet formulas and quotes safely", () => {
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvCell("+256"), "'+256");
  assert.equal(csvCell("-5"), "'-5");
  assert.equal(csvCell(-5), "-5");
  assert.equal(csvCell("a,b"), "\"a,b\"");
  assert.equal(csvCell(null), "");
  const csv = toCsv([{ header: "Page", value: (row) => row.path }, { header: "Views", value: (row) => row.views }], [{ path: "/en", views: 3 }]);
  assert.equal(csv, "﻿Page,Views\r\n/en,3\r\n");
  assert.equal(csvValue(0.1234, "percent"), 12.34);
  assert.equal(csvValue(65_432, "duration"), 65.4);
  assert.equal(formatDuration(65_432), "1m 05s");
  assert.equal(formatDuration(3_725_000), "1h 02m");
  assert.equal(formatValue(0.5, "percent"), "50%");
});

test("admin passwords use salted scrypt hashes that verify in constant time and fit the environment contract", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.match(hash, /^scrypt:32768:8:1:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/);
  assert.notEqual(hash, await hashPassword("correct horse battery staple"), "Every hash has its own salt.");
  assert.equal(isPasswordHash(hash), true);
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("wrong", hash), false);
  assert.equal(await verifyPassword("anything", "plain-text"), false);
  assert.equal(isPasswordHash(hash.replace(":32768:", ":1024:")), false, "Weak parameters are refused.");
  assert.equal(isPasswordHash(hash.replace(":32768:", ":67108864:")), false, "Unbounded memory parameters are refused.");
  const policy = parseRuntimePolicy({ GOAL_HINT_ANALYTICS_ADMIN_PASSWORD_HASH: hash });
  assert.equal(policy.secrets.analyticsPasswordHash.read(), hash);
  assert.equal(JSON.stringify(policy).includes(hash), false, "The hash is redacted from serialized policy.");
  assert.throws(() => parseRuntimePolicy({ GOAL_HINT_ANALYTICS_ADMIN_PASSWORD_HASH: "admin" }));
  assert.throws(() => parseRuntimePolicy({ GOAL_HINT_ANALYTICS_SECRET: "too-short" }));
});

test("development falls back to admin/admin; production refuses missing, default or unkeyed credentials", async () => {
  const development = await createAnalyticsConfig(parseRuntimePolicy({}));
  assert.equal(development.admin.username, "admin");
  assert.equal(await verifyPassword("admin", development.admin.passwordHash), true);
  assert.equal(development.usingDevelopmentCredentials, true);
  assert.equal(development.cookies.session, "goal-hint-analytics");
  assert.equal(development.cookies.secure, false);
  assert.equal(development.collecting, false, "No collection without the database capability.");

  const secret = "s".repeat(40);
  const base = { NODE_ENV: "production" };
  const missingSecret = await createAnalyticsConfig(parseRuntimePolicy(base));
  assert.equal(missingSecret.admin, null); assert.equal(missingSecret.adminProblem, "missing-secret");
  const missingAdmin = await createAnalyticsConfig(parseRuntimePolicy({ ...base, GOAL_HINT_ANALYTICS_SECRET: secret }));
  assert.equal(missingAdmin.admin, null); assert.equal(missingAdmin.adminProblem, "not-configured");
  const defaultPassword = await createAnalyticsConfig(parseRuntimePolicy({ ...base, GOAL_HINT_ANALYTICS_SECRET: secret,
    GOAL_HINT_ANALYTICS_ADMIN_USERNAME: "owner", GOAL_HINT_ANALYTICS_ADMIN_PASSWORD_HASH: await hashPassword("admin") }));
  assert.equal(defaultPassword.admin, null); assert.equal(defaultPassword.adminProblem, "insecure-default");
  const secure = await createAnalyticsConfig(parseRuntimePolicy({ ...base, GOAL_HINT_ANALYTICS_SECRET: secret,
    GOAL_HINT_ANALYTICS_ADMIN_USERNAME: "owner", GOAL_HINT_ANALYTICS_ADMIN_PASSWORD_HASH: await hashPassword("a long production passphrase") }));
  assert.equal(secure.admin.username, "owner");
  assert.equal(secure.usingDevelopmentCredentials, false);
  assert.equal(secure.cookies.session, "__Host-goal-hint-analytics");
  assert.equal(secure.cookies.secure, true);
  assert.notEqual(secure.key("visitor", ids.vid), development.key("visitor", ids.vid), "Keys depend on the configured secret.");
  assert.match(secure.key("visitor", ids.vid), /^[0-9a-f]{64}$/);
});

test("approximate location prefers a configured edge header, then the browser time zone", () => {
  assert.deepEqual(resolveLocation("Africa/Kampala", null), { country: "UG", city: "Kampala", geoSource: "timezone" });
  assert.deepEqual(resolveLocation("America/Argentina/Buenos_Aires", null), { country: "AR", city: "Buenos Aires", geoSource: "timezone" });
  assert.deepEqual(resolveLocation("Asia/Calcutta", null), { country: "IN", city: "Calcutta", geoSource: "timezone" });
  assert.deepEqual(resolveLocation("Europe/Amsterdam", null), { country: "NL", city: "Amsterdam", geoSource: "timezone" });
  assert.deepEqual(resolveLocation("UTC", null), { country: null, city: null, geoSource: "unknown" });
  assert.deepEqual(resolveLocation("Africa/Kampala", { country: "ke", city: "Nairobi" }), { country: "KE", city: "Nairobi", geoSource: "edge" });
  assert.deepEqual(resolveLocation("Africa/Kampala", { country: "XX", city: null }), { country: "UG", city: "Kampala", geoSource: "timezone" });
});

test("the collect limiter bounds each visit and the process per window", () => {
  let now = 0;
  const limiter = createCollectLimiter({ perSession: 3, perProcess: 5, windowMs: 1000, now: () => now });
  assert.equal(limiter.allow("a", 2), true);
  assert.equal(limiter.allow("a", 2), false);
  assert.equal(limiter.allow("b", 3), true);
  assert.equal(limiter.allow("c", 1), false, "The process budget is shared.");
  now = 1000;
  assert.equal(limiter.allow("a", 3), true);
});

function fakeServices({ production = false, admin = true } = {}) {
  const calls = { collect: [], login: [], logout: [], ownerVerify: [], memberLogout: [] };
  let memberAvailable = admin;
  const prefix = production ? "__Host-" : "";
  const config = {
    production, collecting: true, admin: { username: "owner", passwordHash: "x" }, adminProblem: null, usingDevelopmentCredentials: false,
    retentionDays: 395, geoSource: "timezone",
    cookies: { session: `${prefix}goal-hint-analytics`, exclude: `${prefix}goal-hint-analytics-exclude`, secure: production },
    key: (purpose, value) => `${purpose}:${value}`,
  };
  const report = { range: { from: "2026-10-01", to: "2026-10-14", days: 14, granularity: "day" }, comparison: null, previous: null,
    summary: { visitors: 1, visits: 2, pageviews: 3, pagesPerVisit: 1.5, avgVisitMs: 1000, bounceRate: 0.5, avgPageMs: 500, conversions: 1,
      conversionRate: 0.5, newVisitors: 1, returningVisitors: 1 },
    series: [{ key: "2026-10-14", visitors: 1, visits: 2, pageviews: 3, bounceRate: 0.5, avgVisitMs: 1000, conversions: 1 }],
    breakdowns: { pages: [{ path: "=cmd|' /C calc'!A0", title: "Help", views: 3, visitors: 1, avgMs: 1500, entries: 1, exits: 1, exitRate: 0.333 }] } };
  const sessions = fixtureAdminSessions({ token: "t".repeat(43), key: config.key, available: () => memberAvailable,
    remove: hash => { calls.memberLogout.push(hash); memberAvailable = false; } });
  const services = {
    config, database: { async query(run) { return run({ memberSession: sessions }); } },
    auth: {
      async verify(token) { calls.ownerVerify.push(token); return admin && token === "t".repeat(43) ? { username: "owner", expiresAt: new Date() } : null; },
      async login(username, password, address) { calls.login.push({ username, address }); throw new Error("Legacy browser credentials must never be checked."); },
      async logout(token) { calls.logout.push(token); },
    },
    collector: { async collect(body, context) { calls.collect.push({ body, context }); return { accepted: body.events.length, dropped: 0 }; } },
    reporter: { async report() { return report; }, async live() { return { visitors: 2, visits: 2, pages: [], generatedAt: "" }; } },
    retention: { lastPurgedAt: null, maybePurge() {}, async state() { return { retentionDays: 395, source: "environment", lastPurgedAt: this.lastPurgedAt }; },
      async setRetentionDays() {}, async purge() { this.lastPurgedAt = "2026-10-14T07:00:00.000Z"; return { sessions: 0, pageviews: 0, events: 0 }; } },
    limiter: createCollectLimiter({ perSession: 30 }),
  };
  return { services, calls, resolve: async () => services };
}

const request = (path, { method = "GET", headers = {}, body } = {}) => new Request(`http://localhost:3000${path}`, {
  method, body, headers: { host: "localhost:3000", "user-agent": chrome, ...headers } });
const sameSite = { "sec-fetch-site": "same-origin", origin: "http://localhost:3000" };
/** A chunked upload: a body stream with no Content-Length, which counts the chunks the handler pulled. */
const chunked = (path, totalBytes, headers = {}) => {
  const progress = { pulls: 0 };
  const body = new ReadableStream({ pull(controller) {
    if (progress.pulls * 1024 >= totalBytes) { controller.close(); return; }
    progress.pulls++;
    controller.enqueue(new Uint8Array(1024).fill(120));
  } });
  const sent = new Request(`http://localhost:3000${path}`, { method: "POST", body, duplex: "half",
    headers: { host: "localhost:3000", "user-agent": chrome, ...sameSite, ...headers } });
  assert.equal(sent.headers.get("content-length"), null);
  return { request: sent, progress };
};

test("the collector honours origin, privacy signals, admin browsers, bots, size and rate limits", async () => {
  const { resolve, calls } = fakeServices();
  const collect = createCollectHandler(resolve);
  const send = (headers = {}, body = JSON.stringify(payload())) => collect(request("/api/analytics/collect", { method: "POST", headers: { ...sameSite, ...headers }, body }));
  assert.equal((await send({ "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal((await send({ "sec-gpc": "1" })).status, 204);
  assert.equal((await send({ dnt: "1" })).status, 204);
  assert.equal((await send({ cookie: "goal-hint-analytics-exclude=1" })).status, 204);
  assert.equal((await send({ cookie: "goal-hint-analytics=abc" })).status, 204);
  assert.equal((await send({ cookie: "goal-hint-analytics=%" })).status, 204, "A malformed cookie value still marks an admin browser.");
  assert.equal((await send({ "user-agent": "Googlebot/2.1" })).status, 204);
  assert.equal(calls.collect.length, 0, "Excluded requests never reach storage.");
  assert.equal((await send({ cookie: "goal-hint-member=member-token" })).status, 204);
  assert.equal(calls.collect.length, 1, "Member cookies do not exclude visitors from consented analytics.");
  calls.collect.length = 0;
  assert.equal((await send({}, "{not json")).status, 400);
  assert.equal((await send({}, JSON.stringify(payload([{ t: "pageview", id: ids.pv, path: "/en?q=x" }])))).status, 400);
  assert.equal((await send({}, "x".repeat(20_000))).status, 413);
  const upload = chunked("/api/analytics/collect", 1024 * 1024);
  assert.equal((await collect(upload.request)).status, 413);
  assert.ok(upload.progress.pulls < 64, "An oversized chunked body is refused without buffering all of it.");
  const accepted = await send({ "sec-ch-ua-mobile": "?1", "x-forwarded-host": "goalhint.com" });
  assert.equal(accepted.status, 204);
  assert.equal(accepted.headers.get("cache-control"), "no-store");
  assert.equal(calls.collect.length, 1);
  assert.deepEqual(calls.collect[0].context, { userAgent: chrome, mobileHint: true, host: "goalhint.com", edge: null });
  let status = 204;
  for (let attempt = 0; attempt < 40 && status === 204; attempt++) status = (await send()).status;
  assert.equal(status, 429, "A visit that floods the collector is rate limited.");
});

test("reporting, live, export and settings APIs require a current administrator member session", async () => {
  const { resolve, calls } = fakeServices();
  const handlers = [createReportHandler(resolve), createLiveHandler(resolve), createExportHandler(resolve), createSettingsHandlers(resolve).GET];
  const query = "?from=2026-10-01&to=2026-10-14&dataset=pages";
  for (const handler of handlers) {
    const anonymous = await handler(request(`/api/analytics/report${query}`));
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.headers.get("x-robots-tag"), "noindex, nofollow");
    for (const token of ["forged", "t".repeat(43)]) {
      const legacy = await handler(request(`/api/analytics/report${query}`, { headers: { cookie: `goal-hint-analytics=${token}` } }));
      assert.equal(legacy.status, 401, "Even a valid legacy owner cookie grants no access.");
    }
  }
  const cookie = { cookie: `goal-hint-member=${"t".repeat(43)}` };
  for (const handler of handlers) assert.equal((await handler(request(`/api/analytics/report${query}`, { headers: cookie }))).status, 200);
  assert.deepEqual(calls.ownerVerify, [], "Dashboard authorization never consults legacy owner sessions.");
  const report = await createReportHandler(resolve)(request(`/api/analytics/report${query}`, { headers: cookie }));
  assert.equal(report.status, 200);
  assert.equal((await report.json()).summary.visits, 2);
  assert.equal((await createReportHandler(resolve)(request("/api/analytics/report?from=2026-10-14&to=2026-10-01", { headers: cookie }))).status, 400);
  const csv = await createExportHandler(resolve)(request(`/api/analytics/export${query}`, { headers: cookie }));
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-disposition"), /attachment; filename="goalhint-analytics-pages-2026-10-01-to-2026-10-14\.csv"/);
  const text = await csv.text();
  assert.match(text, /Avg\. time on page \(seconds\)/);
  assert.match(text, /'=cmd/, "Exported cells cannot execute as formulas.");
  assert.equal((await createExportHandler(resolve)(request("/api/analytics/export?from=2026-10-01&to=2026-10-14&dataset=nope", { headers: cookie }))).status, 400);
  const settings = createSettingsHandlers(resolve).POST;
  assert.equal((await settings(request("/api/analytics/settings", { method: "POST", headers: { ...cookie, "sec-fetch-site": "cross-site" },
    body: JSON.stringify({ action: "purge" }) }))).status, 403);
  assert.equal((await settings(request("/api/analytics/settings", { method: "POST", headers: { ...cookie, ...sameSite },
    body: JSON.stringify({ action: "retention", days: 0 }) }))).status, 400);
  const saved = await settings(request("/api/analytics/settings", { method: "POST", headers: { ...cookie, ...sameSite },
    body: JSON.stringify({ action: "retention", days: 90 }) }));
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).retention.lastPurgedAt, "2026-10-14T07:00:00.000Z", "The response reports the purge it just ran.");
});

test("legacy analytics sign-in redirects without authentication; sign-out clears both hardened cookies", async () => {
  for (const production of [false, true]) {
    const { resolve, calls } = fakeServices({ production });
    const login = createLoginHandler();
    const form = request("/api/analytics/login", { method: "POST", headers: { ...sameSite, "content-type": "application/x-www-form-urlencoded" }, body: "username=owner&password=right" });
    const response = await login(form);
    assert.equal(response.status, 303); assert.equal(response.headers.get("location"), "/en/account?view=login");
    assert.equal(response.headers.get("set-cookie"), null); assert.equal(form.bodyUsed, false); assert.deepEqual(calls.login, []);
    const crossSite = request("/api/analytics/login", { method: "POST", headers: { ...sameSite, "sec-fetch-site": "cross-site" }, body: "username=owner&password=right" });
    const refused = await login(crossSite);
    assert.equal(refused.status, 403); assert.equal(refused.headers.get("location"), null);
    assert.equal(refused.headers.get("set-cookie"), null); assert.equal(crossSite.bodyUsed, false);
    const prefix = production ? "__Host-" : "";
    const logout = await createLogoutHandler(resolve)(request("/api/analytics/logout", { method: "POST",
      headers: { ...sameSite, cookie: `${prefix}goal-hint-analytics=${"t".repeat(43)}; ${prefix}goal-hint-member=${"t".repeat(43)}` } }));
    assert.equal(logout.status, 303); assert.equal(logout.headers.get("location"), "/en/account?view=login&status=signed-out");
    const cookies = logout.headers.getSetCookie();
    for (const name of ["goal-hint-member", "goal-hint-analytics"]) {
      const value = cookies.find(value => value.startsWith(`${prefix}${name}=;`));
      assert.ok(value, name); assert.match(value, /HttpOnly/u); assert.match(value, /Path=\//u); assert.match(value, /Max-Age=0/u);
      assert.equal(value.includes("; Secure"), production); assert.equal(value.includes("right"), false);
      assert.match(value, name === "goal-hint-member" ? /SameSite=Lax/u : /SameSite=Strict/u);
    }
    assert.deepEqual(calls.logout, ["t".repeat(43)]);
    assert.equal(calls.memberLogout.length, 1);
    const ended = await createLiveHandler(resolve)(request("/api/analytics/live", { headers: { cookie: `${prefix}goal-hint-member=${"t".repeat(43)}` } }));
    assert.equal(ended.status, 401, "Logging out revokes the member session as well as clearing cookies.");
  }
});

test("origin and client address helpers", () => {
  assert.equal(isSameOrigin(request("/", { headers: { "sec-fetch-site": "same-origin" } })), true);
  assert.equal(isSameOrigin(request("/", { headers: { "sec-fetch-site": "same-site" } })), false);
  assert.equal(isSameOrigin(request("/", { headers: { origin: "http://localhost:3000" } })), true);
  assert.equal(isSameOrigin(request("/", { headers: { origin: "http://localhost:3001" } })), false);
  assert.equal(isSameOrigin(request("/")), false, "State changes without any origin evidence are refused.");
  assert.equal(clientAddress(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" })), "2.2.2.2");
  assert.equal(clientAddress(new Headers()), "unknown");
});

test("services without storage disable collection and sign-in instead of failing", async () => {
  const config = await createAnalyticsConfig(parseRuntimePolicy({}));
  const services = createAnalyticsServices(config, null);
  assert.deepEqual(await (await createCollectStatusHandler(async () => services)()).json(), { enabled: false }, "No consent banner without collection.");
  assert.deepEqual(await (await createCollectStatusHandler(fakeServices().resolve)()).json(), { enabled: true });
  assert.equal(services.auth, null); assert.equal(services.collector, null); assert.equal(services.reporter, null);
  const response = await createCollectHandler(async () => services)(request("/api/analytics/collect", { method: "POST", headers: sameSite, body: JSON.stringify(payload()) }));
  assert.equal(response.status, 204);
  assert.equal((await createReportHandler(async () => services)(request("/api/analytics/report?from=2026-10-01&to=2026-10-14"))).status, 503);
  assert.equal((await createLoginHandler()(request("/api/analytics/login", { method: "POST", headers: sameSite, body: "" })))
    .headers.get("location"), "/en/account?view=login");
});


test("every custom goal passes the shared name-only contract and rejects attached payment data", () => {
  for (const goal of analyticsGoals) {
    if (goal.kind !== "event" || goal.type !== "custom") continue;
    const event = { t: "custom", pv: ids.pv, name: goal.name };
    assert.equal(collectPayloadSchema.safeParse(payload([event])).success, true);
    for (const extra of [{ amount: 1000 }, { phone: "256700000001" }, { code: "SYNTHETIC" }, { transactionId: "TEST-ID" }]) {
      assert.equal(collectPayloadSchema.safeParse(payload([{ ...event, ...extra }])).success, false);
    }
  }
  for (const name of ["trial-requested", "Payment_submitted", "code entered", "a".repeat(49)]) {
    assert.equal(collectPayloadSchema.safeParse(payload([{ t: "custom", pv: ids.pv, name }])).success, false);
  }
});
