import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { addReportingDays, calendarRules, createPredictionWindow, getPublicationDeadline, getReportingDate,
  isInWindow, isTemporallyEligibleForPublication, parseReportingDate, parseUtcInstant, predictionWindowDays } from "../src/domain/calendar.ts";
import { publicPolicy } from "../src/domain/public-policy.ts";
import { getFeedToday, parseFeedQuery, resolveFeedDates } from "../src/domain/feed-query.ts";
import { evidenceFingerprint } from "../src/server/evidence/evidence-input.ts";
import { publicationEligibility } from "../src/server/predictions/publication-eligibility.ts";
import { createScheduleLifecycleService } from "../src/server/predictions/lifecycle-service.ts";
import { DailySelectionError } from "../src/server/selection/selection-contract.ts";
import { parseSelectionPolicy, selectionWindow } from "../src/server/selection/selection-input.ts";
import { selectionDateState, selectionRunWindow, storedSelectionManifest } from "../src/server/selection/selection-read.ts";
import { createMysqlDailySelectionStore } from "../src/server/selection/selection-mysql-store.ts";
import { createDailySelectionService } from "../src/server/selection/selection-service.ts";
import { degradedAction, selectionAuthority, selectionPolicy } from "./helpers/selection-fixtures.mjs";
import { lifecycleAuthority, lifecyclePolicy } from "./helpers/lifecycle-fixtures.mjs";

const runDate = parseReportingDate("2026-10-07"), start = parseUtcInstant("2026-10-06T21:00:00Z");
const refused = (reason) => (error) => error instanceof DailySelectionError && error.reason === reason;
function runFixture(days = 7, { committed = true, completeDates = days, entries = [] } = {}) {
  const policy = parseSelectionPolicy(selectionPolicy(days === 7 ? {} : { windowDays: days }));
  const window = createPredictionWindow(runDate, days), runId = randomUUID(), now = start + 1000;
  const coverage = Array.from({ length: days }, (_, offset) => ({ date: addReportingDays(runDate, offset),
    status: offset < completeDates ? "complete" : "failed", importId: null, fixtureIds: [], reasons: [],
    missingCoverage: offset < completeDates ? [] : ["date-not-retrieved"], provenance: [] }));
  const row = { id: runId, sequence: 20261007n, eatDate: new Date(`${runDate}T00:00:00Z`), createdAt: new Date(start),
    selectionJson: structuredClone(policy), selectionHash: evidenceFingerprint(policy),
    windowStart: new Date(window.startInclusive), windowEnd: new Date(window.endExclusive),
    ownerId: null, fence: 0, leaseExpiresAt: null, committedAt: committed ? new Date(now) : null,
    partial: completeDates < days, totalJobs: entries.length, completedJobs: 0, terminalJobs: 0 };
  const manifest = { version: 1, runId, runDate, sequence: String(row.sequence), selectionHash: row.selectionHash,
    startInclusive: window.startInclusive, endExclusive: window.endExclusive, committedAt: now,
    partial: row.partial, degradedAction: row.partial ? degradedAction : null, coverage, exclusions: [], entries };
  let sealed = committed ? { runId, manifestHash: evidenceFingerprint(manifest), manifestJson: structuredClone(manifest) } : null;
  const updates = [], clone = (value) => structuredClone(value);
  const tx = { $queryRaw: async (strings) => strings.join("").includes("UTC_TIMESTAMP") ? [{ at: new Date(now) }] : [{ id: runId }],
    dailyRun: { findUnique: async () => clone(row), findUniqueOrThrow: async () => clone(row),
      async update({ data }) { updates.push(clone(data)); for (const [key, value] of Object.entries(data))
        row[key] = value && typeof value === "object" && "increment" in value ? row[key] + value.increment : clone(value); return clone(row); } },
    dailyRunManifest: { findUnique: async () => clone(sealed), async create({ data }) { sealed = clone(data); return clone(data); } },
    dailyRunImport: { findMany: async () => coverage.slice(0, completeDates).map((entry, index) => ({ id: `import-${index}`,
      eatDate: new Date(`${entry.date}T00:00:00Z`), attempt: 1, failure: null })) },
    footballImport: { findUnique: async ({ where }) => {
      const offset = Number(where.id.split("-")[1]); return { id: where.id, status: "complete", fixtureIds: [], missingCoverage: [],
        reasons: [], provenance: [], selection: { kind: "fixtures", query: { date: coverage[offset].date } } };
    } },
    footballFixture: { findMany: async () => [] }, runFixture: { create: async () => assert.fail("empty fixture cohort creates no jobs") } };
  const database = { transaction: async (operation) => operation(tx) };
  return { policy, window, row, manifest, tx, database, updates, get sealed() { return sealed; } };
}

test("only explicit eight-day operational windows extend the unchanged seven-day public default", () => {
  assert.equal(publicPolicy.predictionWindowDays, 7); assert.equal(calendarRules.windowDays, 7);
  const original = createPredictionWindow(runDate), extended = createPredictionWindow(runDate, 8);
  assert.equal(original.lastDate, "2026-10-13"); assert.equal(extended.lastDate, "2026-10-14");
  assert.equal(extended.endDateExclusive, "2026-10-15");
  assert.equal(predictionWindowDays(original), 7); assert.equal(predictionWindowDays(extended), 8);
  assert.equal(isInWindow(extended.endExclusive - 1, extended), true); assert.equal(isInWindow(extended.endExclusive, extended), false);
  for (const days of [0, 6, 9, 31, 7.5, "8"]) assert.throws(() => createPredictionWindow(runDate, days));
  for (const window of [{ ...original, startInclusive: original.startInclusive + 1 },
    { ...extended, endExclusive: extended.endExclusive + 1 }, { ...extended, endExclusive: extended.endExclusive + 86400000 }])
    assert.throws(() => predictionWindowDays(window));
});

test("the eighth EAT date covers seven device-local dates including the furthest east timezone", () => {
  for (const zone of ["America/Los_Angeles", "UTC", "Europe/London", "Asia/Kathmandu", "Pacific/Kiritimati"])
    for (const instant of ["2026-10-07T01:00:00Z", "2026-10-07T10:00:00Z", "2026-10-07T20:59:59Z", "2026-10-07T21:00:00Z"]) {
      const at = parseUtcInstant(instant), reportingToday = getReportingDate(at);
      const query = parseFeedQuery({ when: "next-7-days", tz: zone }, { today: reportingToday, asOf: at });
      const range = resolveFeedDates(query, getFeedToday(query, at)), operational = createPredictionWindow(reportingToday, 8);
      assert.equal(range.dayCount, 7); assert.ok(range.window.endExclusive <= operational.endExclusive, `${zone} ${instant}`);
    }
  const at = parseUtcInstant("2026-10-07T10:00:00Z"), today = getReportingDate(at);
  const query = parseFeedQuery({ when: "next-7-days", tz: "Pacific/Kiritimati" }, { today, asOf: at });
  const edge = resolveFeedDates(query, getFeedToday(query, at)).window.endExclusive - 1;
  assert.equal(isInWindow(edge, createPredictionWindow(today)), false);
  assert.equal(isInWindow(edge, createPredictionWindow(today, 8)), true);
});

test("selection horizon is explicit and old seven-day policy hashes keep their original shape", () => {
  const legacy = selectionPolicy(), parsed = parseSelectionPolicy(legacy);
  assert.equal(Object.hasOwn(parsed, "windowDays"), false); assert.equal(evidenceFingerprint(parsed), evidenceFingerprint(legacy));
  assert.equal(selectionWindow(start).lastDate, "2026-10-13"); assert.equal(selectionWindow(start, 8).lastDate, "2026-10-14");
  assert.equal(parseSelectionPolicy(selectionPolicy({ windowDays: 8, importDays: 8 })).windowDays, 8);
  assert.equal(parseSelectionPolicy(selectionPolicy({ windowDays: 8, importDays: 2 })).importDays, 2);
  for (const changes of [{ windowDays: 9 }, { windowDays: 6 }, { importDays: 8 }, { windowDays: 7, importDays: 8 }, { windowDays: 8, importDays: 9 }])
    assert.throws(() => parseSelectionPolicy(selectionPolicy(changes)), refused("invalid-request"));
});

test("selection orchestration visits eight dates or only the explicitly available provider dates", async () => {
  for (const importDays of [undefined, 2]) {
    const dates = [], policy = selectionPolicy({ windowDays: 8, ...(importDays ? { importDays } : {}) });
    const lease = { runId: randomUUID(), ownerId: "synthetic-owner", fence: 1 };
    let commits = 0;
    const service = createDailySelectionService({ policy, authority: selectionAuthority(),
      importer: { import: async () => assert.fail("complete existing imports require no provider I/O") }, cutoff: { scheduleRun: async () => {} },
      store: { acquire: async () => lease, inspect: async () => null, renew: async () => {}, release: async () => {},
        beginImport: async (_lease, date) => { dates.push(date); return null; },
        commit: async () => { commits++; }, reconcile: async () => ({ total: 0, completed: 0, terminal: 0 }) } });
    assert.equal((await service.run(start)).status, "committed"); assert.equal(commits, 1);
    assert.deepEqual(dates, Array.from({ length: importDays ?? 8 }, (_, offset) => addReportingDays(runDate, offset)));
  }
});

test("the stored eight-day manifest retains honest coverage for the Free plan's two imported dates", async () => {
  for (const completeDates of [2, 8]) {
    const s = runFixture(8, { committed: false, completeDates });
    s.row.ownerId = "a".repeat(64); s.row.fence = 1; s.row.leaseExpiresAt = new Date(start + 120000);
    const store = createMysqlDailySelectionStore(s.database, {});
    const manifest = await store.commit({ runId: s.row.id, ownerId: s.row.ownerId, fence: 1 }, s.policy,
      completeDates === 8 ? null : degradedAction);
    assert.equal(manifest.coverage.length, 8); assert.equal(manifest.coverage[7].date, "2026-10-14");
    assert.equal(manifest.partial, completeDates !== 8);
    assert.equal(manifest.endExclusive, createPredictionWindow(runDate, 8).endExclusive);
    assert.equal(selectionDateState(manifest, "2026-10-14").state, completeDates === 8 ? "no-fixtures" : "data-unavailable");
    assert.deepEqual(await storedSelectionManifest(s.tx, s.row), manifest);
  }
});

test("sealed windows require their original seven/eight-day policy and complete calendar coverage", async () => {
  for (const days of [7, 8]) {
    const s = runFixture(days);
    assert.equal(predictionWindowDays(selectionRunWindow(s.row)), days);
    assert.deepEqual(await storedSelectionManifest(s.tx, s.row), s.manifest);
    assert.throws(() => selectionRunWindow({ ...s.row, windowEnd: new Date(s.row.windowEnd.getTime() + 1) }), refused("unavailable"));
  }
  const s = runFixture(7), extended = createPredictionWindow(runDate, 8);
  assert.throws(() => selectionRunWindow({ ...s.row, windowEnd: new Date(extended.endExclusive) }), refused("unavailable"));
  const malformed = { ...s.manifest, coverage: s.manifest.coverage.slice(1) };
  await assert.rejects(() => storedSelectionManifest({ dailyRunManifest: { findUnique: async () => ({
    manifestHash: evidenceFingerprint(malformed), manifestJson: malformed }) } }, s.row), refused("unavailable"));
});

test("new eight-day composition safely rejoins a committed seven-day run without rewriting policy or boundaries", async () => {
  const s = runFixture(7), frozen = structuredClone({ policy: s.row.selectionJson, hash: s.row.selectionHash,
    start: s.row.windowStart, end: s.row.windowEnd, manifest: s.sealed });
  const next = selectionPolicy({ windowDays: 8, importDays: 8, leaseMs: 60000 }), originalStore = createMysqlDailySelectionStore(s.database, {});
  const service = createDailySelectionService({ policy: next, authority: selectionAuthority(),
    importer: { import: async () => assert.fail("a sealed run performs no imports") }, cutoff: { scheduleRun: async () => {} },
    store: { ...originalStore, beginImport: async () => assert.fail("cannot extend sealed coverage"),
      commit: async () => assert.fail("cannot replace an immutable manifest"), reconcile: async () => ({ total: 0, completed: 0, terminal: 0 }) } });
  assert.equal((await service.run(start)).status, "committed");
  assert.deepEqual({ policy: s.row.selectionJson, hash: s.row.selectionHash, start: s.row.windowStart,
    end: s.row.windowEnd, manifest: s.sealed }, frozen);
  assert.ok(s.updates.length > 0); assert.ok(s.updates.every((update) => Object.keys(update).every((key) =>
    ["ownerId", "fence", "leaseExpiresAt"].includes(key))));
  const pending = runFixture(7, { committed: false });
  const store = createMysqlDailySelectionStore(pending.database, {});
  await assert.rejects(() => store.acquire(runDate, parseSelectionPolicy(next), "b".repeat(64)), refused("conflicting-request"));
  assert.equal(pending.updates.length, 0);
});

test("publication includes the edge day only for an original eight-day run", () => {
  const now = start + 1000, kickoffAt = start + 7 * 86400000 + 3600000;
  const fixtureId = randomUUID(), cycleId = randomUUID();
  const cycle = { id: cycleId, fixtureId, state: "open", scheduleVersion: 1, kickoffAt, cutoffAt: getPublicationDeadline(kickoffAt) };
  const input = { now, cycle, activeCycleId: cycleId, kickoffAt, status: "scheduled", scheduleVersion: 1, candidateKickoffAt: kickoffAt,
    observation: { provider: "api-football", fixtureId, externalFixtureId: 1, cycleId, kickoffAt,
      status: "scheduled", retrievedAt: now, providerUpdatedAt: null, actualStartedAt: null, evidenceRef: "synthetic-edge-observation" },
    maxObservationAgeMs: 1000, earlierCloseAt: null };
  for (const days of [7, 8]) {
    const originalWindow = createPredictionWindow(runDate, days);
    assert.equal(publicationEligibility({ ...input, originalWindow }), days === 8 ? null : "outside-window");
    assert.equal(isTemporallyEligibleForPublication(now, { scheduledKickoff: kickoffAt, originalWindow,
      isOriginalManifestMember: true }), days === 8);
  }
  assert.equal(publicationEligibility({ ...input, originalWindow: { startInclusive: start, endExclusive: start + 9 * 86400000 } }), "outside-window");
});

test("lifecycle refresh eligibility follows the selected immutable horizon rather than a global extension", async () => {
  const fixtureId = randomUUID(), cycleId = randomUUID(), kickoffAt = start + 7 * 86400000 + 3600000;
  for (const days of [7, 8]) {
    const s = runFixture(days, { entries: [{ fixtureId, cycleId, kickoffAt: days === 8 ? kickoffAt : start + 3600000, rank: 0, envelope: {} }] });
    s.tx.footballFixture.findUniqueOrThrow = async () => ({ status: "scheduled", kickoff: new Date(kickoffAt), dataVersion: 1n,
      activeCycle: { id: cycleId, state: "open", cutoffAt: new Date(getPublicationDeadline(kickoffAt)) }, lifecycleState: null });
    s.tx.runFixture.findFirst = async () => ({ fixtureId, cycleId, run: s.row });
    const service = createScheduleLifecycleService({ database: s.database, cutoff: {}, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
    const result = await service.refreshEligibility(fixtureId);
    assert.equal(result.eligible, days === 8); assert.equal(result.reason, days === 8 ? null : "outside-window");
  }
});
