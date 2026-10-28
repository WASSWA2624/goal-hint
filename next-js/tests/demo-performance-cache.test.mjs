import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function run(script, mode = "development") {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-test-module-mocks", "--input-type=module"], {
    cwd: new URL("../", import.meta.url), env: { ...process.env, NODE_ENV: mode, NEXT_PUBLIC_GOAL_HINT_DEMO: "true",
      ...(mode === "development" ? { DATABASE_URL: "mysql://demo@127.0.0.1/goal_hint_demo_cache_test" } : {}) },
    encoding: "utf8", timeout: 20_000, input: script,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
}

const setup = `
  import assert from "node:assert/strict";
  import { mock } from "node:test";
  import { createPublicResponseCache } from "./src/server/cache/public-cache.ts";
  import { performanceRecord, performanceSnapshot, performanceProtocol } from "./tests/helpers/performance-fixtures.mjs";
  let now = Date.parse("2026-10-28T10:00:00Z"), generation = 0, prepares = 0, quotePrepares = 0,
    reads = 0, transactions = 0, acceptedFills = 0, rejectedFills = 0, approved = true, revokeOnLookup = false;
  const entries = new Map(), descriptors = [];
  const demo = process.env.NODE_ENV === "development";
  mock.module("./src/server/demo/read-seed.ts", { exports: { prepareDemoRange: async () => {
    prepares++; if (demo) generation++;
  } } });
  mock.module("./src/server/demo/publication-quotes.ts", { exports: { ensureDemoPublicationQuotes: async () => { quotePrepares++; } } });
  mock.module("./src/server/performance/performance-read.ts", { exports: {
    readPerformanceBatches: async function* (_tx, _query, _scope, grant) {
      reads++;
      const snapshot = performanceSnapshot([performanceRecord()]), record = snapshot.records[0];
      if (grant) snapshot.quotes.set(record.revision.id + ":match-result:" + record.revision.candidate.markets["match-result"].market.selection, "2.25");
      yield snapshot;
    },
  } });
  const store = {
    lookup: async (key, tags) => {
      if (revokeOnLookup) { approved = false; revokeOnLookup = false; }
      const current = entries.get(key), valid = current?.generation === generation;
      return { generations: Object.fromEntries(tags.map(tag => [tag, String(generation)])),
        value: valid ? current.value : null, createdAt: valid ? current.createdAt : null, expiresAt: valid ? current.expiresAt : null };
    },
    fill: async (key, tags, stamp, value, createdAt, expiresAt) => {
      if (tags.some(tag => stamp[tag] !== String(generation))) { rejectedFills++; return false; }
      acceptedFills++; entries.set(key, { generation, value, createdAt, expiresAt }); return true;
    },
    reconcile: async () => ({ acknowledged: 0, removed: 0 }),
  };
  const ordinaryCache = createPublicResponseCache(store, () => now, () => {});
  const cache = { ...ordinaryCache, read: async (descriptor, load) => {
    descriptors.push(descriptor); return ordinaryCache.read(descriptor, load);
  } };
  const { createPerformanceService } = await import("./src/server/performance/performance-service.ts");
  const service = createPerformanceService({ competitionIds: [39], clock: { now: () => now }, cache,
    quoteBinding: { bookmakerId: 8, maximumAgeMs: 300_000, verifyPublicDisplay: () => approved },
    database: { transaction: async (operation, options) => {
      transactions++; assert.equal(options.timeout, demo ? 240_000 : 30_000); return operation({});
    } },
  });
  const main = result => result.cells.find(cell => cell.family === "match-result" && cell.source === "combined" && cell.horizon === null);
`;

test("demo cache hits skip materialization and snapshots while invalidation reloads under the post-preparation stamp", () => {
  run(setup + `
    const first = await service.query(), originalAsOf = first.asOf;
    assert.equal(main(first).returns.returnsSampleCount, 1);
    assert.deepEqual([prepares, quotePrepares, reads, transactions], [1, 1, 1, 1]);
    assert.deepEqual([acceptedFills, rejectedFills], [1, 1]);
    assert.ok(descriptors.every(descriptor => descriptor.lifetimeMs === 3_600_000));
    const entry = [...entries.values()][0]; assert.equal(entry.expiresAt - entry.createdAt, 3_600_000);
    now += 60_000;
    const hit = await service.query();
    assert.equal(hit.asOf, originalAsOf);
    assert.deepEqual([prepares, quotePrepares, reads, transactions], [1, 1, 1, 1]);
    generation++; // A committed correction invalidates the same ordinary generation check.
    const corrected = await service.query();
    assert.equal(corrected.asOf, now);
    assert.deepEqual([prepares, quotePrepares, reads, transactions], [2, 2, 2, 2]);
    assert.deepEqual([acceptedFills, rejectedFills], [2, 2]);
    now += 3_600_001;
    await service.query();
    assert.deepEqual([prepares, quotePrepares, reads, transactions], [3, 3, 3, 3]);
  `);
});

test("a demo cache hit cannot retain quoted returns after public display permission is revoked", () => {
  run(setup + `
    const first = await service.query(); assert.equal(main(first).returns.returnsSampleCount, 1);
    now += 1000; revokeOnLookup = true;
    const revoked = await service.query();
    assert.equal(main(revoked).returns.returnsSampleCount, 0);
    assert.equal(main(revoked).returns.excludedQuoteCount, 1);
    assert.equal(main(revoked).returns.roi, null);
    assert.deepEqual([prepares, quotePrepares, reads, transactions], [1, 1, 2, 2]);
  `);
});

test("a demo cache hit cannot retain approved metrics after evaluation permission is revoked", () => {
  run(setup + `
    const protocol = performanceProtocol({ gate: { minimumSamples: 1 } });
    const withPolicy = createPerformanceService({ competitionIds: [39], clock: { now: () => now }, cache,
      policy: { protocol, verifyProtocol: () => approved },
      database: { transaction: async operation => { transactions++; return operation({}); } },
    });
    const first = await withPolicy.query();
    assert.equal(first.policy.state, "verified"); assert.equal(main(first).metrics.state, "available");
    now += 1000; revokeOnLookup = true;
    const revoked = await withPolicy.query();
    assert.equal(revoked.policy.state, "unapproved"); assert.equal(main(revoked).metrics.hitRate, null);
    assert.equal(revoked.policy.publicClaimAuthorized, false);
    assert.deepEqual([prepares, quotePrepares, reads, transactions], [1, 1, 2, 2]);
  `);
});

test("production retains the ordinary five-second cache lifetime and preparation order", () => {
  run(setup + `
    await service.query();
    assert.deepEqual([prepares, quotePrepares, reads, transactions], [1, 0, 1, 1]);
    assert.equal(descriptors.length, 1); assert.equal(descriptors[0].lifetimeMs, 5000);
    now += 1000; await service.query();
    assert.deepEqual([prepares, quotePrepares, reads, transactions], [2, 0, 1, 1]);
    now += 5000; await service.query();
    assert.deepEqual([prepares, quotePrepares, reads, transactions], [3, 0, 2, 2]);
  `, "production");
});
