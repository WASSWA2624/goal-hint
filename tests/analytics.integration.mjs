import assert from "node:assert/strict";
import { execFile } from "./helpers/command-runtime.mjs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { createDatabase } from "../src/server/database/client.ts";
import { createAnalyticsConfig } from "../src/server/analytics/analytics-config.ts";
import { createAnalyticsCollector } from "../src/server/analytics/analytics-collector.ts";
import { createAnalyticsReporter } from "../src/server/analytics/analytics-report.ts";
import { createAnalyticsRetention } from "../src/server/analytics/analytics-retention.ts";
import { adminSessionRules, createAdminAuth } from "../src/server/analytics/analytics-auth.ts";
import { hashPassword } from "../src/server/analytics/analytics-password.ts";
import { MysqlServerUnavailableError, startIsolatedMysql } from "./helpers/mysql-instance.mjs";
import { costTestEnvironment } from "./helpers/cost-fixtures.mjs";

const execFileAsync = promisify(execFile);
const workspace = fileURLToPath(new URL("../", import.meta.url));
const databaseScript = fileURLToPath(new URL("../scripts/database.py", import.meta.url));
const tables = ["AnalyticsVisitor", "AnalyticsSession", "AnalyticsPageview", "AnalyticsEvent", "AnalyticsAdminSession", "AnalyticsLoginThrottle", "AnalyticsSetting"];
const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const windows = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
// 10 October 2026, 10:00 EAT (07:00 UTC); a Saturday.
const START = Date.parse("2026-10-10T07:00:00.000Z");

test("consent-gated analytics records, reports, authenticates and expires against isolated genuine MySQL", { timeout: 300_000 }, async (t) => {
  let instance;
  try { instance = await startIsolatedMysql(); }
  catch (error) {
    if (!(error instanceof MysqlServerUnavailableError)) throw error;
    t.skip(`${error.message} Database-backed analytics acceptance remains pending.`);
    return;
  }
  t.diagnostic(`Owned throwaway server: ${instance.version}. Visitors, clocks and credentials are synthetic.`);
  t.beforeEach(() => instance.assertOwnership());
  const migrationPassword = randomBytes(24).toString("hex"), applicationPassword = randomBytes(24).toString("hex");
  const migrationUrl = `mysql://analytics_migration:${migrationPassword}@127.0.0.1:${instance.port}/goal_hint_test`;
  const applicationUrl = `mysql://analytics_application:${applicationPassword}@127.0.0.1:${instance.port}/goal_hint_test`;
  const env = { ...costTestEnvironment(applicationUrl, migrationUrl), GOAL_HINT_ANALYTICS_SECRET: randomBytes(32).toString("hex") };
  let database;
  try {
    await instance.executeAdmin(`
      CREATE USER 'analytics_migration'@'127.0.0.1' IDENTIFIED BY '${migrationPassword}';
      CREATE USER 'analytics_application'@'127.0.0.1' IDENTIFIED BY '${applicationPassword}';
      GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES, TRIGGER ON goal_hint_test.* TO 'analytics_migration'@'127.0.0.1';
    `);
    await execFileAsync(process.execPath, ["--conditions=react-server", databaseScript, "deploy"],
      { cwd: workspace, env, windowsHide: true, timeout: 240_000, maxBuffer: 1024 * 1024 });
    // Least privilege: the application gets row access to the analytics tables only.
    await instance.executeAdmin(tables.map((table) => `GRANT SELECT, INSERT, UPDATE, DELETE ON goal_hint_test.${table} TO 'analytics_application'@'127.0.0.1';`).join("\n"));
    const policy = parseRuntimePolicy(env);
    database = createDatabase(policy);
    const config = await createAnalyticsConfig(policy);
    assert.equal(config.collecting, true);
    const clock = { now: START };
    const now = () => clock.now;
    const collector = createAnalyticsCollector({ database, config, now });
    const reporter = createAnalyticsReporter(database, { now });
    const context = (userAgent = windows, extra = {}) => ({ userAgent, mobileHint: null, host: "goalhint.com", edge: null, ...extra });
    const visit = (vid, sid, events, ctx = {}) => ({ v: 1, vid, sid, ctx: { tz: "Africa/Kampala", lang: "en-GB", sw: 1280, tp: 0, ...ctx }, events });
    const page = (path, extra = {}) => ({ t: "pageview", id: randomUUID(), path, title: `Title ${path}`, ...extra });
    const advance = (ms) => { clock.now += ms; };

    const alice = randomUUID(), bob = randomUUID(), carol = randomUUID();
    const aliceFirst = randomUUID(), aliceSecond = randomUUID(), bobVisit = randomUUID(), carolVisit = randomUUID();
    const match = "/en/matches/36f3d940-66ff-4e02-b0f0-be26dbb5fed2/arsenal-vs-chelsea";
    const otherMatch = "/en/matches/84e3cff6-4a55-4f2a-b0a0-fce0fa618bf2/leeds-vs-everton";

    await t.test("a multi-page visit records entry, sequence, engagement, interactions and deduplicated conversions", async () => {
      const home = page("/en", { ref: "google.com" });
      assert.deepEqual(await collector.collect(visit(alice, aliceFirst, [home]), context()), { accepted: 1, dropped: 0 });
      advance(20_000);
      await collector.collect(visit(alice, aliceFirst, [{ t: "engage", pv: home.id, ms: 20_000 },
        { t: "search", pv: home.id, term: "Arsenal  call +256 772 123456" }, { t: "click", pv: home.id, label: "Arsenal v Chelsea", href: `${match}?from=feed` }]), context());
      const analysis = page(match);
      advance(1_000);
      await collector.collect(visit(alice, aliceFirst, [analysis, { t: "engage", pv: analysis.id, ms: 45_000 },
        { t: "outbound", pv: analysis.id, href: "https://www.bbc.co.uk/sport/football/1?token=secret" },
        { t: "download", pv: analysis.id, href: "https://goalhint.com/files/report.pdf?x=1" }]), context());
      advance(45_000);
      const second = page(otherMatch);
      await collector.collect(visit(alice, aliceFirst, [second, { t: "custom", pv: second.id, name: "slip_build" }]), context());
      const duplicate = await collector.collect(visit(alice, aliceFirst, [second]), context());
      assert.equal(duplicate.accepted, 0, "A retried page view is stored once.");

      const [session] = await database.query((client) => client.$queryRaw`SELECT * FROM AnalyticsSession WHERE id = ${aliceFirst}`);
      assert.equal(session.entryPath, "/en"); assert.equal(session.exitPath, otherMatch);
      assert.equal(Number(session.pageviews), 3); assert.equal(Number(session.interactions), 5);
      assert.equal(Number(session.engagedMs), 65_000); assert.equal(Boolean(session.converted), true);
      assert.equal(session.channel, "organic-search"); assert.equal(session.referrerHost, "google.com");
      assert.equal(session.country, "UG"); assert.equal(session.city, "Kampala"); assert.equal(session.deviceType, "desktop");
      assert.equal(session.browser, "Chrome"); assert.equal(session.os, "Windows"); assert.equal(session.language, "en-GB");
      assert.equal(Boolean(session.isNewVisitor), true); assert.equal(Number(session.visitNumber), 1);
      assert.equal(session.visitorId.length, 64); assert.notEqual(session.visitorId, alice, "Only a keyed hash of the browser ID is stored.");
      const pages = await database.query((client) => client.$queryRaw`SELECT sequence, path, route, previousPath, engagedMs FROM AnalyticsPageview
        WHERE sessionId = ${aliceFirst} ORDER BY sequence`);
      assert.deepEqual(pages.map((row) => [Number(row.sequence), row.route, row.previousPath, Number(row.engagedMs)]), [
        [1, "/[locale]", null, 20_000], [2, "/[locale]/matches/[id]/[slug]", "/en", 45_000], [3, "/[locale]/matches/[id]/[slug]", match, 0]]);
      const events = await database.query((client) => client.$queryRaw`SELECT type, name, target FROM AnalyticsEvent WHERE sessionId = ${aliceFirst} ORDER BY id`);
      assert.deepEqual(events.map((row) => [row.type, row.name, row.target]), [
        ["search", "arsenal call [number]", null], ["conversion", "match-search", null],
        ["click", "Arsenal v Chelsea", match],
        ["conversion", "match-analysis", null],
        ["outbound", "bbc.co.uk", "https://www.bbc.co.uk/sport/football/1"], ["conversion", "source-click", null],
        ["download", "report.pdf", "https://goalhint.com/files/report.pdf"],
        ["custom", "slip_build", null], ["conversion", "slip-built", null],
      ], "Two match pages convert once; query strings and identifiers never reach storage.");
    });

    await t.test("forged, stale and orphaned events are rejected", async () => {
      assert.equal((await collector.collect(visit(bob, aliceFirst, [page("/en")]), context())).reason, "visitor-mismatch");
      assert.equal((await collector.collect(visit(bob, randomUUID(), [{ t: "engage", pv: randomUUID(), ms: 1000 }]), context())).reason, "unknown-session");
      const unknownPage = await collector.collect(visit(alice, aliceFirst, [{ t: "click", pv: randomUUID(), label: "x" }]), context());
      assert.equal(unknownPage.accepted, 0, "Events must belong to a page view of the same visit.");
      const before = clock.now;
      advance(40 * 60_000);
      assert.equal((await collector.collect(visit(alice, aliceFirst, [page("/en/help")]), context())).reason, "expired-session");
      clock.now = before;
    });

    await t.test("returning visitors, campaigns, mobile devices and bounces are classified", async () => {
      clock.now = START + 86_400_000; // Sunday 11 October, 10:00 EAT
      await collector.collect(visit(alice, aliceSecond, [page("/en/help")]), context());
      await collector.collect(visit(bob, bobVisit, [page("/en", { utm: { source: "newsletter", medium: "email", campaign: "october" } })],
        { sw: 390, tp: 5 }), context(iphone));
      clock.now = START + 2 * 86_400_000 + 3_600_000; // Monday 12 October, 11:00 EAT
      const carolHome = page("/en/slips", { ref: "l.facebook.com" });
      await collector.collect(visit(carol, carolVisit, [carolHome]), context(iphone, { edge: null }));
      advance(12_000);
      await collector.collect(visit(carol, carolVisit, [{ t: "engage", pv: carolHome.id, ms: 12_000 }]), context(iphone));
      const [second] = await database.query((client) => client.$queryRaw`SELECT isNewVisitor, visitNumber FROM AnalyticsSession WHERE id = ${aliceSecond}`);
      assert.equal(Boolean(second.isNewVisitor), false); assert.equal(Number(second.visitNumber), 2);
      const [bobRow] = await database.query((client) => client.$queryRaw`SELECT channel, utmCampaign, deviceType, os FROM AnalyticsSession WHERE id = ${bobVisit}`);
      assert.deepEqual({ ...bobRow }, { channel: "email", utmCampaign: "october", deviceType: "mobile", os: "iOS" });
    });

    await t.test("reports reproduce the recorded behaviour exactly, by period, segment and comparison", async () => {
      clock.now = START + 3 * 86_400_000;
      const report = await reporter.report({ from: "2026-10-10", to: "2026-10-12", compare: "previous", filters: {} });
      assert.deepEqual(report.summary, {
        visitors: 3, visits: 4, pageviews: 6, pagesPerVisit: 1.5,
        // Visit durations: Alice 66s (first page to last activity), 0s, Bob 0s, Carol 12s.
        avgVisitMs: Math.round((66_000 + 0 + 0 + 12_000) / 4),
        // Not engaged: Alice's second visit and Bob (one page, under 10s, no conversion).
        bounceRate: 0.5, avgPageMs: Math.round((20_000 + 45_000 + 12_000) / 6),
        conversions: 4, conversionRate: 0.25, newVisitors: 3, returningVisitors: 1,
      });
      assert.deepEqual(report.previous, { visitors: 0, visits: 0, pageviews: 0, pagesPerVisit: 0, avgVisitMs: 0, bounceRate: 0, avgPageMs: 0,
        conversions: 0, conversionRate: 0, newVisitors: 0, returningVisitors: 0 });
      assert.equal(report.range.granularity, "day");
      assert.deepEqual(report.series.map((point) => [point.key, point.visits, point.pageviews, point.conversions]),
        [["2026-10-10", 1, 3, 4], ["2026-10-11", 2, 2, 0], ["2026-10-12", 1, 1, 0]]);
      assert.equal(report.heatmap[5][10], 1, "Saturday 10:00 EAT"); assert.equal(report.heatmap[6][10], 2); assert.equal(report.heatmap[0][11], 1);
      const b = report.breakdowns;
      assert.deepEqual(b.channels.map((row) => [row.value, row.visits]).sort(), [["direct", 1], ["email", 1], ["organic-search", 1], ["social", 1]]);
      assert.deepEqual(b.devices.map((row) => [row.label, row.visits]).sort(), [["Desktop", 2], ["Mobile", 2]]);
      assert.deepEqual(b.countries.map((row) => [row.label, row.visits]), [["Uganda", 4]]);
      assert.deepEqual(b.campaigns.map((row) => [row.source, row.medium, row.campaign, row.visits]), [["newsletter", "email", "october", 1]]);
      assert.deepEqual(b.referrers.map((row) => row.value).sort(), ["google.com", "l.facebook.com"]);
      const matchRow = b.pages.find((row) => row.path === match);
      assert.deepEqual({ ...matchRow }, { path: match, title: `Title ${match}`, views: 1, visitors: 1, avgMs: 45_000, entries: 0, exits: 0, exitRate: 0 });
      assert.deepEqual(b.routes.find((row) => row.route === "/[locale]/matches/[id]/[slug]"),
        { label: "Match analysis", route: "/[locale]/matches/[id]/[slug]", views: 2, visitors: 1, avgMs: 22_500 });
      assert.deepEqual(b.entries.map((row) => [row.path, row.visits]).sort(), [["/en", 2], ["/en/help", 1], ["/en/slips", 1]]);
      assert.deepEqual(b.transitions.map((row) => [row.from, row.to, row.count]).sort(), [["/en", match, 1], [match, otherMatch, 1]]);
      assert.equal(b.journeys.find((row) => row.journey === "Home → Match analysis → Match analysis").visits, 1);
      assert.deepEqual(b.searches.map((row) => [row.term, row.count]), [["arsenal call [number]", 1]]);
      assert.deepEqual(b.outbound.map((row) => [row.host, row.count]), [["bbc.co.uk", 1]]);
      assert.deepEqual(b.downloads.map((row) => [row.file, row.count]), [["report.pdf", 1]]);
      assert.deepEqual(b.conversions.map((row) => row.goal).sort(), ["match-analysis", "match-search", "slip-built", "source-click"]);
      assert.deepEqual(b.frequency.map((row) => [row.label, row.visitors]), [["1 visit", 2], ["2 visits", 1], ["3–5 visits", 0], ["6–10 visits", 0], ["11+ visits", 0]]);
      assert.deepEqual(b.loyalty.slice(0, 2).map((row) => [row.label, row.visits]), [["First visit", 3], ["2nd visit", 1]]);

      const mobile = await reporter.report({ from: "2026-10-10", to: "2026-10-12", compare: "none", filters: { device: "mobile" } });
      assert.equal(mobile.summary.visits, 2); assert.equal(mobile.previous, null); assert.equal(mobile.previousSeries, null);
      const viewedMatch = await reporter.report({ from: "2026-10-10", to: "2026-10-12", compare: "none", filters: { page: match } });
      assert.equal(viewedMatch.summary.visits, 1);
      const returning = await reporter.report({ from: "2026-10-10", to: "2026-10-12", compare: "none", filters: { visitor: "returning" } });
      assert.equal(returning.summary.visits, 1);
      const injection = await reporter.report({ from: "2026-10-10", to: "2026-10-12", compare: "none", filters: { country: "UG' OR '1'='1" } });
      assert.equal(injection.summary.visits, 0, "Filter values are bound parameters.");
      const hourly = await reporter.report({ from: "2026-10-10", to: "2026-10-10", compare: "none", filters: {} });
      assert.equal(hourly.series.length, 24); assert.equal(hourly.series[10].visits, 1, "Bucketed in EAT, not UTC.");
      const later = await reporter.report({ from: "2026-10-13", to: "2026-10-15", compare: "previous", filters: {} });
      assert.equal(later.previous.visits, 4, "The comparison period is the preceding three days.");
    });

    await t.test("live visitors count only recent activity", async () => {
      clock.now = START + 2 * 86_400_000 + 3_600_000 + 12_000 + 60_000;
      const live = await reporter.live();
      assert.equal(live.visitors, 1); assert.equal(live.pages[0].path, "/en/slips");
      clock.now += 10 * 60_000;
      assert.equal((await reporter.live()).visitors, 0);
    });

    await t.test("sign-in verifies hashed credentials, locks after repeated failures and expires sessions", async () => {
      const adminConfig = { ...config, admin: { username: "owner", passwordHash: await hashPassword("a long test passphrase") } };
      const auth = createAdminAuth({ database, config: adminConfig, now });
      assert.equal((await auth.login("owner", "wrong", "198.51.100.1")).status, "invalid");
      assert.equal((await auth.login("intruder", "a long test passphrase", "198.51.100.1")).status, "invalid");
      const signedIn = await auth.login("owner", "a long test passphrase", "198.51.100.2");
      assert.equal(signedIn.status, "signed-in");
      assert.equal((await database.query((client) => client.analyticsAdminSession.findMany())).every((row) => row.tokenHash !== signedIn.token),
        true, "Only a hash of the session token is stored.");
      assert.equal((await auth.verify(signedIn.token)).username, "owner");
      assert.equal(await auth.verify("x".repeat(43)), null);
      for (let attempt = 1; attempt <= 5; attempt++) {
        assert.equal((await auth.login("owner", `guess-${attempt}`, `192.0.2.${attempt}`)).status, "invalid", "Failures spread over addresses lock nothing yet.");
      }
      for (let attempt = 1; attempt <= 4; attempt++) assert.equal((await auth.login("owner", `guess-${attempt}`, "192.0.2.50")).status, "invalid");
      const locked = await auth.login("owner", "guess-5", "192.0.2.50");
      assert.equal(locked.status, "locked");
      assert.equal((await auth.login("owner", "a long test passphrase", "192.0.2.50")).status, "locked", "The address lock holds even with the right password.");
      assert.equal((await auth.login("owner", "a long test passphrase", "192.0.2.99")).status, "signed-in",
        "Failures from one address never lock the owner out from another.");
      for (let attempt = 1; attempt <= 5; attempt++) await auth.login(`user${attempt}`, "x", "203.0.113.7");
      assert.equal((await auth.login("someone", "x", "203.0.113.7")).status, "locked", "One address cannot spray usernames.");
      // Concurrent attempts queue on the locked throttle rows: only the address's first five reach the password check.
      const burst = await Promise.all(Array.from({ length: 30 }, (_, attempt) => auth.login("owner", `burst-${attempt}`, "198.51.100.77")));
      const tally = (status, newlyLocked) => burst.filter((result) => result.status === status && (newlyLocked === undefined || result.newlyLocked === newlyLocked)).length;
      assert.deepEqual([tally("invalid"), tally("locked", true), tally("locked", false)], [4, 1, 25], "A concurrent burst cannot outrun the address lock.");
      assert.equal((await auth.login("owner", "a long test passphrase", "198.51.100.77")).status, "locked");
      clock.now += adminSessionRules.lockMs + 1;
      const again = await auth.login("owner", "a long test passphrase", "192.0.2.50");
      assert.equal(again.status, "signed-in", "Locks expire.");
      const lastSeen = async (token) => (await database.query((client) => client.analyticsAdminSession.findUnique({
        where: { tokenHash: createHash("sha256").update(token).digest("hex") } }))).lastSeenAt.getTime();
      const signedInAt = await lastSeen(again.token);
      clock.now += 30 * 60_000;
      assert.equal((await auth.verify(again.token, { touch: false })).username, "owner");
      assert.equal(await lastSeen(again.token), signedInAt, "verify({ touch: false }) leaves lastSeenAt unchanged.");
      clock.now += adminSessionRules.idleMs - 30 * 60_000;
      assert.equal(await auth.verify(again.token, { touch: false }), null, "Untouched checks never keep an idle session alive.");
      assert.equal(await auth.verify(again.token), null, "Idle sessions expire.");
      const fresh = await auth.login("owner", "a long test passphrase", "192.0.2.99");
      for (let hour = 1; hour <= 12; hour++) { clock.now += 3_600_000; if (hour < 12) assert.ok(await auth.verify(fresh.token), `hour ${hour}`); }
      assert.equal(await auth.verify(fresh.token), null, "Sessions end 12 hours after sign-in regardless of activity.");
      // A fresh hour: 49 failures from 49 addresses lock nothing; the 50th locks the username on every address for 15 minutes.
      for (let attempt = 1; attempt < adminSessionRules.usernameMaximumFailures; attempt++) {
        assert.equal((await auth.login("owner", "guess", `198.18.${attempt}.1`)).status, "invalid", `failure ${attempt}`);
      }
      assert.equal((await auth.login("owner", "guess", "198.18.100.1")).status, "locked");
      assert.equal((await auth.login("owner", "a long test passphrase", "198.18.200.1")).status, "locked", "The username-wide lock holds on any address.");
      clock.now += adminSessionRules.lockMs + 1;
      const last = await auth.login("owner", "a long test passphrase", "198.18.200.1");
      assert.equal(last.status, "signed-in");
      assert.equal((await auth.login("owner", "a long test passphrase", "198.18.201.1")).status, "signed-in",
        "A right password hands back its counted attempt, with the lock that attempt started.");
      await auth.logout(last.token);
      assert.equal(await auth.verify(last.token), null);
    });

    await t.test("retention purges expired records and stale sign-in state only", async () => {
      clock.now = START + 100 * 86_400_000;
      const retention = createAnalyticsRetention(database, { defaultDays: 395, now });
      assert.deepEqual(await retention.state(), { retentionDays: 395, source: "environment", lastPurgedAt: null });
      const kept = await retention.purge();
      assert.equal(kept.sessions + kept.pageviews + kept.events + kept.visitors, 0);
      await assert.rejects(retention.setRetentionDays(0), RangeError);
      assert.equal((await retention.setRetentionDays(90)).retentionDays, 90);
      const removed = await retention.purge();
      assert.deepEqual([removed.sessions, removed.pageviews, removed.events, removed.visitors], [4, 6, 9, 3]);
      for (const table of ["AnalyticsSession", "AnalyticsPageview", "AnalyticsEvent", "AnalyticsVisitor", "AnalyticsAdminSession"]) {
        const [row] = await database.query((client) => client.$queryRawUnsafe(`SELECT COUNT(*) AS count FROM ${table}`));
        assert.equal(Number(row.count), 0, table);
      }
      assert.match((await retention.state()).lastPurgedAt, /^2027-01-18T07:00:00/);
    });

    await t.test("referrers are stored without www. and the site's own host is never recorded as one", async () => {
      const external = randomUUID(), internal = randomUUID();
      await collector.collect(visit(randomUUID(), external, [page("/en", { ref: "www.bbc.co.uk" })]), context());
      await collector.collect(visit(randomUUID(), internal, [page("/en", { ref: "goalhint.com" })]), context());
      const [externalRow] = await database.query((client) => client.$queryRaw`SELECT channel, referrerHost FROM AnalyticsSession WHERE id = ${external}`);
      assert.deepEqual({ ...externalRow }, { channel: "referral", referrerHost: "bbc.co.uk" });
      const [internalRow] = await database.query((client) => client.$queryRaw`SELECT channel, referrerHost FROM AnalyticsSession WHERE id = ${internal}`);
      assert.deepEqual({ ...internalRow }, { channel: "direct", referrerHost: null });
    });
  } finally {
    await database?.disconnect().catch(() => {});
    await instance.stop();
  }
});
