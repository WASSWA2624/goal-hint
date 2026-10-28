import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import test from "node:test";
import { utcInstantFromEpochMilliseconds } from "../src/domain/calendar.ts";
import { fixtureAdvance } from "../src/domain/fixture-reconciliation.ts";
import { mergeLiveDetail } from "../src/domain/live-refresh.ts";
import { getDatabase, createDatabase, disconnectDatabase } from "../src/server/database/client.ts";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { demoFixturesForDate } from "../src/server/demo/api-football.ts";
import { demoId } from "../src/server/demo/forecast.ts";
import { ensureDemoDates } from "../src/server/demo/seed.ts";
import { createMatchDetailService } from "../src/server/matches/detail-service.ts";

test("demo clock transitions advance canonical versions and the normal live client accepts score/status changes", {
  skip: process.env.DEMO_DATABASE_INTEGRATION !== "1", timeout: 480_000,
}, async () => {
  const control = getDatabase(), date = "2026-06-01";
  const connection = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(connection.hostname));
  assert.equal(connection.pathname, "/goal_hint_demo");
  const schema = `goal_hint_demo_clock_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^goal_hint_demo_clock_[a-f0-9]{32}$/u);
  connection.pathname = `/${schema}`;
  const env = { ...process.env, DATABASE_URL: connection.href, MIGRATION_DATABASE_URL: connection.href };
  let database, created = false;
  const fixture = demoFixturesForDate(date, Date.parse(`${date}T00:00:00+03:00`))
    .filter((row) => row.fixture.status.short === "NS").sort((a, b) => a.fixture.timestamp - b.fixture.timestamp)[0];
  const id = demoId("fixture", fixture.fixture.id), kickoffAt = fixture.fixture.timestamp * 1000;
  const access = { tier: "full", signedIn: true, mode: "on" };
  const read = (at) => createMatchDetailService({ database, clock: { now: () => utcInstantFromEpochMilliseconds(at) } }).query(id);
  try {
    // Clock rewinds need a fresh occurrence. Reusing persisted final matches would
    // correctly violate the production protection against older observations.
    await control.query((tx) => tx.$executeRawUnsafe(`CREATE DATABASE \`${schema}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`));
    created = true;
    await promisify(execFile)(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env, cwd: process.cwd(), windowsHide: true, timeout: 180_000, maxBuffer: 2_000_000,
    });
    database = createDatabase(parseRuntimePolicy(env));
    await ensureDemoDates(database, [date], kickoffAt - 30 * 60_000);
    const scheduled = await read(kickoffAt - 30 * 60_000);
    assert.equal(scheduled.fixture.status, "scheduled"); assert.equal(scheduled.fixture.cycle.state, "open");
    await ensureDemoDates(database, [date], kickoffAt + 75 * 60_000);
    const live = await read(kickoffAt + 75 * 60_000);
    assert.equal(live.fixture.status, "live"); assert.equal(live.fixture.cycle.state, "closed");
    assert.ok(BigInt(live.fixture.dataVersion) > BigInt(scheduled.fixture.dataVersion)); assert.equal(fixtureAdvance(scheduled.fixture, live.fixture), 1);
    const merged = mergeLiveDetail({ ...scheduled, access }, { ...live, access });
    assert.equal(merged.fixture.status, "live"); assert.deepEqual(merged.fixture.score, live.fixture.score);
    assert.deepEqual(merged.fixture.liveClock, live.fixture.liveClock); assert.ok(merged.liveMatch.statistics.items.length > 0);
    const recorded = await database.query((tx) => tx.fixtureResultState.findUniqueOrThrow({ where: { fixtureId: id }, include: { result: true } }));
    assert.equal(String(recorded.result.fixtureVersion), live.fixture.dataVersion);
    const [quotes] = await database.query((tx) => tx.$queryRaw`SELECT COUNT(*) AS mismatches FROM FixtureOddsPrice p
      JOIN ProviderOddsSnapshot s ON s.id=p.snapshotId
      WHERE p.retrievedAt<>s.retrievedAt OR NOT (p.providerUpdatedAt<=>s.providerUpdatedAt)`);
    assert.equal(Number(quotes.mismatches), 0, "clock refreshes preserve exact immutable quote provenance");
    const generationBefore = await database.query((tx) => tx.publicCacheTag.findUniqueOrThrow({ where: { tag: `date:${date}` } }));
    const delayed = createDatabase(parseRuntimePolicy(env));
    try {
      await ensureDemoDates(delayed, [date], kickoffAt - 30 * 60_000);
      const current = await delayed.query((tx) => tx.footballFixture.findUniqueOrThrow({ where: { id }, select: { status: true, dataVersion: true } }));
      assert.equal(current.status, "live", "a delayed pinned request cannot rewind a newer observation");
      assert.equal(String(current.dataVersion), live.fixture.dataVersion);
      const generationAfter = await delayed.query((tx) => tx.publicCacheTag.findUniqueOrThrow({ where: { tag: `date:${date}` } }));
      assert.equal(generationAfter.generation, generationBefore.generation, "a delayed no-op cannot invalidate a coherent slip scan");
    } finally { await delayed.disconnect(); }
  } finally {
    try { await database?.disconnect(); }
    finally {
      try {
        // Only this test's freshly created, strictly named schema may be removed.
        if (created) await control.query((tx) => tx.$executeRawUnsafe(`DROP DATABASE \`${schema}\``));
      } finally { await disconnectDatabase(); }
    }
  }
});
