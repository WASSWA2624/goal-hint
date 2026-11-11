import { createHash } from "node:crypto";
import { appendFile, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { addReportingDays, getReportingDate, parseReportingDate, utcInstantFromEpochMilliseconds } from "../src/domain/calendar.ts";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { createDatabase } from "../src/server/database/client.ts";
import { createPolicyApiFootballAdapter } from "../src/server/football/api-football-adapter.ts";
import { createMysqlQuotaStore } from "../src/server/football/quota-mysql-store.ts";
import { createAccountStatusReader, createQuotaRouter } from "../src/server/live/live-account.ts";
import { loadOwnerApprovals, ownerEvidenceVerifier } from "../src/server/live/live-approvals.ts";

const detailFields = ["events", "lineups", "statistics", "players"];
const unplayed = new Set(["NS", "TBD", "PST", "CANC", "AWD", "WO"]);
const rangeLimits = new Set(["response-body-error", "response-too-large", "pagination-incomplete"]);

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function save(path, value) {
  const temp = `${path}.writing`;
  await writeFile(temp, value, "utf8");
  await rename(temp, path);
}

function datesBetween(start, end) {
  const dates = [];
  for (let date = start; date <= end; date = addReportingDays(date, 1)) {
    if (dates.length === 62) throw new Error("The snapshot must cover at most 62 days.");
    dates.push(date);
  }
  return dates;
}

function orderDates(dates, baseline) {
  const center = dates.indexOf(baseline);
  if (center === -1) throw new Error("The baseline must be inside the import window.");
  const recent = Math.max(0, center - 7);
  return [...dates.slice(recent, center + 1).reverse(), ...dates.slice(center + 1), ...dates.slice(0, recent).reverse()];
}

function stagingDatabase() {
  const url = new URL(process.env.GOAL_HINT_LOCAL_FOOTBALL_DATABASE_URL ?? "");
  if (url.protocol !== "mysql:" || url.hostname !== "127.0.0.1" || !/^\/goal_hint_football_\d{6}$/u.test(url.pathname)) {
    throw new Error("Set GOAL_HINT_LOCAL_FOOTBALL_DATABASE_URL to the dedicated loopback snapshot database.");
  }
  return createDatabase(parseRuntimePolicy({
    NODE_ENV: "development", GOAL_HINT_DATABASE_ENABLED: "true", DATABASE_URL: url.href,
    GOAL_HINT_DATABASE_POOL_LIMIT: "2",
  }));
}

async function main() {
  const [startText, endText, baselineText] = process.argv.slice(2);
  const start = parseReportingDate(startText), end = parseReportingDate(endText), baseline = parseReportingDate(baselineText);
  const dates = datesBetween(start, end), ordered = orderDates(dates, baseline);
  const budget = 2000;
  const folder = join(".goal-hint", "real-football-import", `${start}_${end}`);
  const pages = join(folder, "pages");
  await mkdir(pages, { recursive: true });
  const lockPath = join(folder, "fetch.lock");
  const lock = await open(lockPath, "wx");
  let database;
  try {
    database = stagingDatabase();
    if (await database.readiness() !== "ready") throw new Error("The isolated snapshot database is unavailable.");
    const operationEnv = { ...process.env };
    delete operationEnv.GOAL_HINT_LOCAL_FOOTBALL_DATABASE_URL;
    delete operationEnv.GOAL_HINT_LOCAL_FOOTBALL_DATADIR;
    const policy = parseRuntimePolicy(operationEnv);
    const verifyEvidence = ownerEvidenceVerifier(loadOwnerApprovals());
    const readStatus = createAccountStatusReader({ policy, verifyEvidence });
    const quota = createQuotaRouter({ store: createMysqlQuotaStore(database), readStatus });
    const day = await quota.refresh();
    let captured = null;
    const adapter = createPolicyApiFootballAdapter({
      accountId: day.status.accountKey, policy, limiter: quota.limiter, verifyEvidence,
      batchEvidence: { maximumIds: 20, evidenceRef: "api-football-documentation-v3:fixtures-ids-maximum-20" },
      verifyBatchEvidence: (evidence) => evidence.maximumIds === 20,
      observeFixturePage: (rows, source) => { captured = { rows, source }; },
    });
    let requests = 0;
    const attempts = join(folder, "requests.ndjson");
    const previous = await readFile(attempts, "utf8").catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    const previousRequests = previous.trim().split("\n").filter(Boolean)
      .reduce((total, line) => total + JSON.parse(line).requests, 0);

    async function getPage(name, operation, maximumRows) {
      const path = join(pages, `${name}.json`);
      const saved = await readJson(path);
      if (saved) return saved;
      const remaining = budget - previousRequests - requests;
      if (remaining < 1) throw new Error("The snapshot request budget has been reached.");
      captured = null;
      const result = await operation({
        priority: "enrichment", deadlineAt: utcInstantFromEpochMilliseconds(Math.min(day.endsAt, Date.now() + 120_000)),
        timeoutMs: 45_000, maxRequests: Math.min(2, remaining), maxPages: 1, maxRows: maximumRows,
        maxResponseBytes: 48 * 1024 * 1024, retry: { maxAttempts: 2, baseDelayMs: 1000, maxDelayMs: 5000 }, cacheMaxAgeMs: 0,
      });
      requests += result.requestsDispatched;
      const reason = result.error?.reason ?? null;
      await appendFile(attempts, JSON.stringify({ name, requests: result.requestsDispatched, reason }) + "\n", "utf8");
      if (!captured || result.status !== "complete") return { reason: reason ?? "page-not-captured" };
      const page = { rows: captured.rows, listQuery: captured.source.requestParameters,
        retrievedAt: new Date(captured.source.retrievedAt).toISOString() };
      await save(path, JSON.stringify(page));
      return page;
    }

    const coverage = {}, fixtures = new Map();
    function addList(page, selected) {
      const allowed = new Set(selected);
      for (const row of page.rows) {
        const date = getReportingDate(Date.parse(row.fixture.date));
        if (!allowed.has(date) || fixtures.has(row.fixture.id)) throw new Error("The fixture list contained an unexpected date or duplicate.");
        fixtures.set(row.fixture.id, {
          listQuery: page.listQuery, listRetrievedAt: page.retrievedAt, retrievedAt: page.retrievedAt, fixture: row,
        });
      }
      for (const date of selected) coverage[date] = { listQuery: page.listQuery, listRetrievedAt: page.retrievedAt, complete: true };
    }

    const fallbackPath = join(folder, "split.json");
    const range = start === end ? { reason: "single-day" } : await readJson(fallbackPath)
      ?? await getPage(`range-${start}-${end}`, (bounds) => adapter.evidence.fixtures({ from: start, to: end }, bounds), 100_000);
    if (range.rows) {
      addList(range, dates);
      console.log(`One date-range query returned ${fixtures.size} fixtures across ${dates.length} Kampala dates.`);
    } else {
      if (range.reason !== "single-day" && !rangeLimits.has(range.reason)) throw new Error(`Fixture range failed (${range.reason}).`);
      await save(fallbackPath, JSON.stringify({ reason: range.reason }));
      console.log(`The full range returned ${range.reason}. Fetching fixture lists by date.`);
      for (const date of ordered) {
        const page = await getPage(`date-${date}`, (bounds) => adapter.evidence.fixturesByDate(date, bounds), 20_000);
        if (!page.rows) throw new Error(`Fixture list failed for ${date} (${page.reason}).`);
        addList(page, [date]);
      }
      console.log(`Date queries returned ${fixtures.size} fixtures across ${dates.length} Kampala dates.`);
    }
    if (!fixtures.size) throw new Error("The selected window has no fixtures to replace the local demo.");

    const rank = new Map(ordered.map((date, index) => [date, index]));
    const rows = [...fixtures.values()].sort((a, b) =>
      rank.get(getReportingDate(Date.parse(a.fixture.fixture.date))) - rank.get(getReportingDate(Date.parse(b.fixture.fixture.date)))
      || Date.parse(a.fixture.fixture.date) - Date.parse(b.fixture.fixture.date)
      || a.fixture.fixture.id - b.fixture.fixture.id);
    const pending = rows.filter(({ fixture }) => !unplayed.has(fixture.fixture.status.short)
      && !detailFields.every((field) => Array.isArray(fixture[field])));
    let batches = 0;
    for (let offset = 0; offset < pending.length; offset += 20) {
      const group = pending.slice(offset, offset + 20);
      const ids = group.map(({ fixture }) => fixture.fixture.id).sort((a, b) => a - b);
      const key = createHash("sha256").update(ids.join("-")).digest("hex");
      const page = await getPage(`details-${key}`, (bounds) => adapter.evidence.unresolvedFixtures(ids, bounds), 20);
      if (!page.rows) throw new Error(`Detail batch ${batches + 1} failed (${page.reason}).`);
      for (const detail of page.rows) {
        const entry = fixtures.get(detail.fixture.id);
        const original = entry.fixture;
        if (detail.league.id !== original.league.id || detail.league.season !== original.league.season
          || detail.teams.home.id !== original.teams.home.id || detail.teams.away.id !== original.teams.away.id) {
          throw new Error(`Fixture ${detail.fixture.id} changed teams or competition during retrieval.`);
        }
        if (getReportingDate(Date.parse(detail.fixture.date)) !== getReportingDate(Date.parse(original.fixture.date))) {
          throw new Error(`Fixture ${detail.fixture.id} changed reporting dates during retrieval.`);
        }
        entry.fixture = { ...original, ...detail };
        entry.retrievedAt = page.retrievedAt;
      }
      batches++;
      if (batches % 20 === 0) console.log(`Retrieved details for ${Math.min(offset + 20, pending.length)} / ${pending.length} fixtures.`);
    }
    await save(join(folder, "fixtures.ndjson"), rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
    await save(join(folder, "fixture-coverage.json"), JSON.stringify({ dates: coverage }));
    const nonemptyDetailSections = Object.fromEntries(detailFields.map((field) => [field,
      rows.filter(({ fixture }) => fixture[field]?.length > 0).length]));
    const summary = { start, end, baseline, fixtures: rows.length, dates: dates.length, matchDetailBatches: batches,
      requestsThisRun: requests, requestsTotal: previousRequests + requests, nonemptyDetailSections,
      daily: Object.fromEntries(dates.map((date) => [date, rows.filter(({ fixture }) => getReportingDate(Date.parse(fixture.fixture.date)) === date).length])) };
    await save(join(folder, "fetch-summary.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    try { await database?.disconnect(); }
    finally { await lock.close(); await rm(lockPath, { force: true }); }
  }
}

main().catch((error) => {
  // Request details and local database credentials are never printed.
  console.error(error instanceof TypeError && error.code === "ERR_INVALID_URL" ? "Missing or invalid snapshot database URL." : error.message);
  process.exitCode = 1;
});
