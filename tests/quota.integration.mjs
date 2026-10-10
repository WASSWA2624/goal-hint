import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { createDatabase } from "../src/server/database/client.ts";
import { createQuotaLimiter } from "../src/server/football/quota-limiter.ts";
import { createQuotaGateway } from "../src/server/football/quota-gateway.ts";
import { createMysqlQuotaStore } from "../src/server/football/quota-mysql-store.ts";
import { createApiFootballAdapter } from "../src/server/football/api-football-adapter.ts";
import { parseTrialPlan } from "../src/server/football/provider-trial-input.ts";
import { withTrialJournal } from "../src/server/football/provider-trial-journal.ts";
import { chargedTrialRequests, runProviderTrial } from "../src/server/football/provider-trial-runner.ts";
import { MysqlServerUnavailableError, startIsolatedMysql } from "./helpers/mysql-instance.mjs";

const execFileAsync = promisify(execFile);
const workspace = fileURLToPath(new URL("../", import.meta.url));
const databaseScript = fileURLToPath(new URL("../scripts/database.mjs", import.meta.url));
const initialNow = Date.parse("2026-10-08T12:00:00.000Z");
const id = (value) => createHash("sha256").update(value).digest("hex");

function isolatedEnvironment(applicationUrl, migrationUrl) {
  const env = { ...process.env };
  const credentials = new Set(["DATABASE_URL", "TEST_DATABASE_URL", "MIGRATION_DATABASE_URL", "API_FOOTBALL_KEY", "AI_API_KEY", "RESEARCH_API_KEY"]);
  for (const key of Object.keys(env)) {
    if (key.startsWith("GOAL_HINT_") || key.startsWith("NEXT_PUBLIC_") || credentials.has(key)) delete env[key];
  }
  return {
    ...env, NODE_ENV: "test", DEBUG: "", GOAL_HINT_OPERATION_SCOPE: "disabled", GOAL_HINT_DATABASE_ENABLED: "true",
    TEST_DATABASE_URL: applicationUrl, MIGRATION_DATABASE_URL: migrationUrl,
    GOAL_HINT_DATABASE_CONNECTION_MODE: "direct", GOAL_HINT_DATABASE_POOL_LIMIT: "4",
    GOAL_HINT_DATABASE_TLS_MODE: "disabled", GOAL_HINT_DATABASE_CONNECT_TIMEOUT_MS: "1000",
    GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS: "10000",
  };
}

// Clocks, account evidence and mocked provider responses are synthetic. Coordination, transactions, indexes, stored
// counters and races below use the isolated genuine MySQL server and app role.
function clockStore(database, clock) {
  const store = createMysqlQuotaStore(database);
  return {
    transaction(accountId, operation) {
      return store.transaction(accountId, (transaction) => operation({ ...transaction, now: async () => clock.now }));
    },
  };
}

function fixture(database, label, overrides = {}, verifyEvidence = () => true) {
  const clock = { now: initialNow };
  const accountId = id(`account:${label}`);
  const evidence = {
    accountId, periodId: id(`period:${label}:first`), startsAt: initialNow - 3600000,
    endsAt: initialNow + 86400000, subscriptionExpiresAt: initialNow + 864000000,
    providerDailyLimit: 150000, dailyRemaining: 150000, secondLimit: 15, minuteLimit: 900,
    evidenceRef: `synthetic-quota-fixture:${label}`, ...overrides,
  };
  const store = clockStore(database, clock);
  const limiter = createQuotaLimiter({ accountId, store, verifyEvidence });
  let sequence = 0;
  return {
    accountId, clock, evidence, store, limiter,
    request(priority = "results-cutoff", options = {}) {
      const requestName = `${label}:${++sequence}`;
      return {
        requestId: id(`request:${requestName}`), workKey: id(`work:${requestName}`), priority,
        deadlineAt: clock.now + 120000, timeoutMs: 1000, ...options,
      };
    },
    async initialize() {
      const result = await limiter.initialize(evidence);
      assert.equal(result.status, "initialized", JSON.stringify(result));
    },
    async state(periodId = evidence.periodId) {
      return store.transaction(accountId, async (transaction) => ({
        account: await transaction.account(), period: await transaction.period(periodId),
      }));
    },
  };
}

function denied(result, reasons) {
  assert.equal(result.status, "denied", JSON.stringify(result));
  assert.ok([].concat(reasons).includes(result.reason), JSON.stringify(result));
}

async function dispatch(limiter, request) {
  const result = await limiter.reserve(request);
  assert.equal(result.status, "reserved", JSON.stringify(result));
  const claimed = await limiter.claimLaunch(result.permit);
  assert.equal(claimed.status, "claimed", JSON.stringify(claimed));
  return result.permit;
}

test("durable account-wide quota contracts on isolated genuine MySQL", { timeout: 600000 }, async (t) => {
  let instance;
  try {
    instance = await startIsolatedMysql();
  } catch (error) {
    if (!(error instanceof MysqlServerUnavailableError)) throw error;
    t.skip(`${error.message} Database-backed quota acceptance remains pending.`);
    return;
  }
  t.diagnostic(`Owned throwaway server: ${instance.version}. Reset boundaries and account evidence in this suite are synthetic; no provider request is made.`);
  t.beforeEach(() => instance.assertOwnership());
  const migrationPassword = randomBytes(24).toString("hex");
  const applicationPassword = randomBytes(24).toString("hex");
  const migrationUrl = `mysql://quota_migration:${migrationPassword}@127.0.0.1:${instance.port}/goal_hint_test`;
  const applicationUrl = `mysql://quota_application:${applicationPassword}@127.0.0.1:${instance.port}/goal_hint_test`;
  const env = isolatedEnvironment(applicationUrl, migrationUrl);
  const databases = [];
  function replica() {
    const database = createDatabase(parseRuntimePolicy(env));
    databases.push(database);
    return database;
  }
  try {
    await instance.executeAdmin(`
      CREATE USER 'quota_migration'@'127.0.0.1' IDENTIFIED BY '${migrationPassword}';
      CREATE USER 'quota_application'@'127.0.0.1' IDENTIFIED BY '${applicationPassword}';
      GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES, TRIGGER
        ON goal_hint_test.* TO 'quota_migration'@'127.0.0.1';
    `);
    await execFileAsync(process.execPath, ["--conditions=react-server", databaseScript, "deploy"], {
      cwd: workspace, env, windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024,
    });
    await instance.assertOwnership();
    await instance.executeAdmin(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON goal_hint_test.ApiQuotaAccount TO 'quota_application'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE, DELETE ON goal_hint_test.ApiQuotaPeriod TO 'quota_application'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE, DELETE ON goal_hint_test.ApiQuotaAttempt TO 'quota_application'@'127.0.0.1';
    `);
    const firstDatabase = replica();
    const secondDatabase = replica();

    await t.test("separate application replicas serialize one account and deduplicate the same work", async () => {
      const f = fixture(firstDatabase, "concurrent");
      await f.initialize();
      const second = createQuotaLimiter({ accountId: f.accountId, store: clockStore(secondDatabase, f.clock), verifyEvidence: () => true });
      const workKey = id("shared-account-work");
      const results = await Promise.all(Array.from({ length: 16 }, (_, index) =>
        (index % 2 ? second : f.limiter).reserve(f.request("results-cutoff", { workKey }))));
      assert.equal(results.filter((result) => result.status === "reserved").length, 1);
      assert.equal(results.filter((result) => result.status === "joined").length, 15);
      const winner = results.find((result) => result.status === "reserved");
      assert.ok(results.filter((result) => result.status === "joined").every((result) => result.requestId === winner.permit.requestId));
      assert.equal((await f.state()).period.used, 1);
      const claims = await Promise.all([f.limiter.claimLaunch(winner.permit), second.claimLaunch(winner.permit)]);
      assert.equal(claims.filter((result) => result.status === "claimed").length, 1);
      assert.equal(claims.filter((result) => result.status === "denied").length, 1);
      await f.limiter.complete(winner.permit, { kind: "success" });
      f.clock.now += 84;
      const unique = await Promise.all(Array.from({ length: 8 }, (_, index) =>
        (index % 2 ? second : f.limiter).reserve(f.request())));
      assert.equal(unique.filter((result) => result.status === "reserved").length, 1);
      assert.ok(unique.filter((result) => result.status === "denied").every((result) => ["pacing", "priority-wait"].includes(result.reason)));
      assert.equal((await f.state()).period.used, 2);
    });

    await t.test("725 accepted dispatches remain evenly paced within every rolling second and minute", { timeout: 300000 }, async (subtest) => {
      const f = fixture(firstDatabase, "rolling");
      await f.initialize();
      const dispatchTimes = [];
      for (let index = 0; index < 725; index++) {
        subtest.signal.throwIfAborted();
        const permit = await dispatch(f.limiter, f.request());
        dispatchTimes.push(permit.dispatchedAt);
        f.clock.now += 84;
      }
      assert.equal((await f.state()).period.used, 725);
      let secondStart = 0;
      let minuteStart = 0;
      for (let index = 0; index < dispatchTimes.length; index++) {
        const current = dispatchTimes[index];
        while (dispatchTimes[secondStart] <= current - 1000) secondStart++;
        while (dispatchTimes[minuteStart] <= current - 60000) minuteStart++;
        assert.ok(index - secondStart + 1 <= 12);
        assert.ok(index - minuteStart + 1 <= 720);
        if (index) assert.ok(current - dispatchTimes[index - 1] >= 84);
      }
    });

    await t.test("lower account rate limits pace across callers and enforce exact rolling boundaries", async () => {
      const f = fixture(firstDatabase, "lower-rates", { secondLimit: 2, minuteLimit: 5 });
      await f.initialize();
      const second = createQuotaLimiter({ accountId: f.accountId, store: clockStore(secondDatabase, f.clock), verifyEvidence: () => true });
      for (let index = 0; index < 5; index++) {
        await dispatch(index % 2 ? second : f.limiter, f.request());
        f.clock.now += 11999;
        const tooSoon = f.request();
        denied(await second.reserve(tooSoon), ["pacing", "minute-limit"]);
        f.clock.now += 1;
        await dispatch(second, tooSoon);
        // The extra accepted dispatch is included in the next period of the
        // rolling proof; advance to the following evenly paced slot.
        f.clock.now += 12000;
      }
      const attempts = await f.store.transaction(f.accountId, (transaction) => transaction.rollingAttempts(initialNow - 1));
      for (const attempt of attempts) {
        const inMinute = attempts.filter((candidate) => candidate.dispatchedAt > attempt.dispatchedAt - 60000 && candidate.dispatchedAt <= attempt.dispatchedAt);
        assert.ok(inMinute.length <= 5);
      }
      const state = await f.state();
      assert.equal(state.period.secondLimit, 2);
      assert.equal(state.period.minuteLimit, 5);
    });

    await t.test("daily ordinary work cannot enter the protected essential reserve and all callers stop at the cap", async () => {
      const f = fixture(firstDatabase, "reserve", { dailyRemaining: 50001 });
      await f.initialize();
      assert.equal((await f.state()).period.used, 99999);
      const ordinary = await dispatch(f.limiter, f.request("enrichment"));
      await f.limiter.complete(ordinary, { kind: "success" });
      f.clock.now += 84;
      denied(await f.limiter.reserve(f.request("daily-inputs")), "essential-reserve");
      const essential = await dispatch(f.limiter, f.request("results-cutoff"));
      await f.limiter.complete(essential, { kind: "success", dailyRemaining: 30001 });
      f.clock.now += 84;
      const final = await dispatch(f.limiter, f.request("recovery"));
      await f.limiter.complete(final, { kind: "success", dailyRemaining: 30000 });
      f.clock.now += 84;
      denied(await f.limiter.reserve(f.request("results-cutoff")), "daily-limit");
      const state = await f.state();
      // Header evidence also imports usage from other account callers. The
      // unclassified extra spend is conservatively charged to ordinary work.
      assert.equal(state.period.used, 120000);
      assert.equal(state.period.ordinaryUsed, 119998);
      assert.equal(state.period.dayRemaining, 0);
      assert.equal(state.period.dayLimit, 120000);
    });

    await t.test("the 120000 internal daily ceiling leaves 30000 advertised headroom even for essential work", async () => {
      const f = fixture(firstDatabase, "day-cap", { dailyRemaining: 30001 });
      await f.initialize();
      const permit = await dispatch(f.limiter, f.request());
      await f.limiter.complete(permit, { kind: "success", dailyRemaining: 30000 });
      f.clock.now += 84;
      denied(await f.limiter.reserve(f.request()), "daily-limit");
      assert.equal((await f.state()).period.used, 120000);
      assert.equal((await f.state()).period.dayRemaining, 0);
    });

    await t.test("lower daily plan limits are honored before dispatch and cannot be raised by a later header", async () => {
      const f = fixture(firstDatabase, "lower-day", { providerDailyLimit: 30000, dailyRemaining: 20001 });
      await f.initialize();
      const first = await dispatch(f.limiter, f.request("daily-inputs"));
      // 25,000/day keeps a proportional 4,166 essential reserve; 21,000 used enters it.
      await f.limiter.complete(first, { kind: "success", dailyLimit: 25000, dailyRemaining: 4000 });
      f.clock.now += 84;
      denied(await f.limiter.reserve(f.request("enrichment")), "essential-reserve");
      const second = await dispatch(f.limiter, f.request("near-kickoff-fallback"));
      await f.limiter.complete(second, { kind: "success", dailyLimit: 150000, dailyRemaining: 140000 });
      assert.equal((await f.state()).period.dayLimit, 25000);
      assert.equal((await f.state()).period.providerDailyLimit, 25000);
      assert.ok((await f.state()).period.dayRemaining <= 4000);
    });

    await t.test("small plans keep a proportional essential reserve instead of blocking all ordinary work", async () => {
      const f = fixture(firstDatabase, "free-plan", { providerDailyLimit: 100, dailyRemaining: 100, secondLimit: 1, minuteLimit: 10 });
      await f.initialize();
      const ordinary = await dispatch(f.limiter, f.request("daily-inputs"));
      await f.limiter.complete(ordinary, { kind: "success", dailyLimit: 100, dailyRemaining: 16 });
      f.clock.now += 6000;
      // 100/day keeps 16 essential requests: after 84 are used only essential work may continue.
      denied(await f.limiter.reserve(f.request("daily-inputs")), "essential-reserve");
      const essential = await dispatch(f.limiter, f.request("results-cutoff"));
      await f.limiter.complete(essential, { kind: "success" });
      assert.equal((await f.state()).period.dayLimit, 100);
    });

    await t.test("uncertain attempts, crashes and replacement replicas never refund durable reservations", async () => {
      const f = fixture(firstDatabase, "restart");
      await f.initialize();
      const request = f.request("results-cutoff", { timeoutMs: 100 });
      const crashed = await dispatch(f.limiter, request);
      const replacementDatabase = replica();
      const replacement = createQuotaLimiter({ accountId: f.accountId, store: clockStore(replacementDatabase, f.clock), verifyEvidence: () => true });
      assert.equal((await replacement.reserve(f.request("results-cutoff", { workKey: request.workKey }))).status, "joined");
      f.clock.now += 101;
      const retried = await dispatch(replacement, f.request("results-cutoff", { workKey: request.workKey }));
      await replacement.complete(retried, { kind: "uncertain" });
      denied(await replacement.reserve(request), "already-attempted");
      assert.equal((await f.state()).period.used, 2);
      const attempts = await f.store.transaction(f.accountId, async (transaction) => [await transaction.attempt(crashed.requestId), await transaction.attempt(retried.requestId)]);
      assert.ok(attempts.every((attempt) => attempt.state === "uncertain"));
      const initializedAgain = await replacement.initialize(f.evidence);
      assert.equal(initializedAgain.status, "initialized");
      assert.equal((await f.state()).period.used, 2);
      await replacementDatabase.disconnect();
    });

    await t.test("stale daily and minute headers subtract later reservations and unresolved earlier attempts", async () => {
      const f = fixture(firstDatabase, "headers");
      await f.initialize();
      const earlier = await dispatch(f.limiter, f.request());
      f.clock.now += 84;
      const later = await dispatch(f.limiter, f.request());
      await f.limiter.complete(later, { kind: "success", dailyRemaining: 30010, minuteRemaining: 3 });
      const firstState = await f.state();
      assert.ok(firstState.period.dayRemaining <= 9);
      assert.ok(firstState.period.minuteRemaining <= 2);
      await f.limiter.complete(earlier, { kind: "success", dailyRemaining: 150000, minuteRemaining: 900 });
      const staleState = await f.state();
      assert.ok(staleState.period.dayRemaining <= firstState.period.dayRemaining);
      assert.ok(staleState.period.minuteRemaining <= firstState.period.minuteRemaining);
      f.clock.now += 84;
      const following = await dispatch(f.limiter, f.request());
      await f.limiter.complete(following, { kind: "success", minuteRemaining: 0 });
      f.clock.now += 84;
      const queued = f.request();
      denied(await f.limiter.reserve(queued), "minute-limit");
      f.clock.now += 60000;
      await dispatch(f.limiter, queued);
      assert.ok((await f.state()).period.dayRemaining <= firstState.period.dayRemaining - 2);
    });

    await t.test("a counted reset probe cannot resume bulk traffic until exact trusted confirmation", async () => {
      const f = fixture(firstDatabase, "reset", { endsAt: initialNow + 1000, dailyRemaining: 30000 });
      await f.initialize();
      denied(await f.limiter.reserve(f.request()), "daily-limit");
      const candidate = {
        ...f.evidence, periodId: id("reset:candidate"), startsAt: f.evidence.endsAt,
        endsAt: f.evidence.endsAt + 86400000, dailyRemaining: 150000,
        evidenceRef: "synthetic-quota-fixture:verified-candidate",
      };
      denied(await f.limiter.reserveResetProbe(candidate, f.request()), ["reset-unconfirmed", "invalid-reset-evidence"]);
      f.clock.now = candidate.startsAt;
      denied(await f.limiter.reserve(f.request()), "reset-unconfirmed");
      const probe = await f.limiter.reserveResetProbe(candidate, f.request("recovery"));
      assert.equal(probe.status, "reserved", JSON.stringify(probe));
      assert.equal((await f.state(candidate.periodId)).period.used, 1);
      assert.equal((await f.state()).period.used, 120000);
      denied(await f.limiter.reserveResetProbe(candidate, f.request("recovery")), ["reset-unconfirmed", "already-attempted"]);
      const claimed = await f.limiter.claimLaunch(probe.permit);
      assert.equal(claimed.status, "claimed", JSON.stringify(claimed));
      await f.limiter.complete(probe.permit, { kind: "success", dailyLimit: 150000, dailyRemaining: 149999 });
      denied(await f.limiter.reserve(f.request()), "reset-unconfirmed");
      denied(await f.limiter.confirmReset(id("different-probe"), { ...candidate, dailyRemaining: 149999 }), "invalid-reset-evidence");
      const untrusted = createQuotaLimiter({ accountId: f.accountId, store: f.store, verifyEvidence: (_evidence, purpose) => purpose !== "reset-confirmation" });
      denied(await untrusted.confirmReset(probe.permit.requestId, { ...candidate, dailyRemaining: 149999 }), "invalid-reset-evidence");
      const confirmation = await f.limiter.confirmReset(probe.permit.requestId, { ...candidate, dailyRemaining: 149999 });
      assert.equal(confirmation.status, "confirmed", JSON.stringify(confirmation));
      f.clock.now += 84;
      await dispatch(f.limiter, f.request("daily-inputs"));
      assert.equal((await f.state(candidate.periodId)).period.used, 2);
      assert.equal((await f.state()).period.used, 120000);
      assert.equal((await f.state()).account.activePeriodId, candidate.periodId);
    });

    await t.test("an uncertain or unconfirmed candidate probe remains one counted attempt after restart", async () => {
      const f = fixture(firstDatabase, "reset-uncertain", { endsAt: initialNow + 1000 });
      await f.initialize();
      f.clock.now = f.evidence.endsAt;
      const candidate = { ...f.evidence, periodId: id("uncertain:candidate"), startsAt: f.clock.now, endsAt: f.clock.now + 86400000 };
      const probe = await f.limiter.reserveResetProbe(candidate, f.request("recovery"));
      assert.equal(probe.status, "reserved");
      assert.equal((await f.limiter.claimLaunch(probe.permit)).status, "claimed");
      await f.limiter.complete(probe.permit, { kind: "uncertain" });
      f.clock.now += 1001;
      const restarted = createQuotaLimiter({ accountId: f.accountId, store: clockStore(secondDatabase, f.clock), verifyEvidence: () => true });
      denied(await restarted.reserveResetProbe(candidate, f.request("recovery")), ["already-attempted", "reset-unconfirmed"]);
      denied(await restarted.confirmReset(probe.permit.requestId, { ...candidate, dailyRemaining: 149999 }), "invalid-reset-evidence");
      denied(await restarted.reserve(f.request()), "reset-unconfirmed");
      assert.equal((await f.state(candidate.periodId)).period.used, 1);
    });

    await t.test("a late successful response from the old period cannot confirm or refill a new period", async () => {
      const f = fixture(firstDatabase, "reset-stale", { endsAt: initialNow + 1000 });
      await f.initialize();
      const old = await dispatch(f.limiter, f.request());
      f.clock.now = f.evidence.endsAt;
      const candidate = { ...f.evidence, periodId: id("stale:candidate"), startsAt: f.clock.now, endsAt: f.clock.now + 86400000 };
      const probe = await f.limiter.reserveResetProbe(candidate, f.request("recovery"));
      assert.equal(probe.status, "reserved");
      assert.equal((await f.limiter.claimLaunch(probe.permit)).status, "claimed");
      await f.limiter.complete(probe.permit, { kind: "success", dailyRemaining: 149999 });
      await f.limiter.complete(old, { kind: "success", dailyRemaining: 150000, minuteRemaining: 900 });
      denied(await f.limiter.reserve(f.request()), "reset-unconfirmed");
      assert.equal((await f.state()).account.activePeriodId, f.evidence.periodId);
      const confirmation = await f.limiter.confirmReset(probe.permit.requestId, { ...candidate, dailyRemaining: 149999 });
      assert.equal(confirmation.status, "confirmed");
      const before = (await f.state(candidate.periodId)).period;
      await f.limiter.complete(old, { kind: "success", dailyRemaining: 150000, minuteRemaining: 900 });
      assert.deepEqual((await f.state(candidate.periodId)).period, before);
      assert.equal((await f.state()).period.used, 1);
    });

    await t.test("reset confirmation cannot raise lower plan terms observed by the counted candidate probe", async () => {
      const f = fixture(firstDatabase, "reset-lower-terms", { endsAt: initialNow + 1000 });
      await f.initialize();
      f.clock.now = f.evidence.endsAt;
      const candidate = { ...f.evidence, periodId: id("lower-terms:candidate"), startsAt: f.clock.now, endsAt: f.clock.now + 86400000 };
      const probe = await f.limiter.reserveResetProbe(candidate, f.request("recovery"));
      assert.equal(probe.status, "reserved");
      assert.equal((await f.limiter.claimLaunch(probe.permit)).status, "claimed");
      await f.limiter.complete(probe.permit, {
        kind: "success", dailyLimit: 100000, dailyRemaining: 99999, minuteLimit: 5,
      });
      const confirmation = await f.limiter.confirmReset(probe.permit.requestId, { ...candidate, dailyRemaining: 149999 });
      assert.equal(confirmation.status, "confirmed");
      const state = (await f.state(candidate.periodId)).period;
      assert.equal(state.providerDailyLimit, 100000);
      assert.equal(state.dayLimit, 100000);
      assert.equal(state.minuteLimit, 5);
      assert.equal(state.dayRemaining, 99999);
      f.clock.now += 11999;
      const queued = f.request("daily-inputs");
      denied(await f.limiter.reserve(queued), "pacing");
      f.clock.now += 1;
      await dispatch(f.limiter, queued);
    });

    await t.test("a still-active minute header floor survives the daily candidate boundary", async () => {
      const f = fixture(firstDatabase, "minute-floor-boundary", { endsAt: initialNow + 1000 });
      await f.initialize();
      const old = await dispatch(f.limiter, f.request());
      await f.limiter.complete(old, { kind: "success", minuteRemaining: 0 });
      const oldFloorUntil = (await f.state()).period.minuteFloorUntil;
      assert.equal(oldFloorUntil, initialNow + 60000);
      f.clock.now = f.evidence.endsAt;
      const candidate = { ...f.evidence, periodId: id("minute-floor:candidate"), startsAt: f.clock.now, endsAt: f.clock.now + 86400000 };
      const probeRequest = f.request("recovery");
      denied(await f.limiter.reserveResetProbe(candidate, probeRequest), "minute-limit");
      let state = (await f.state(candidate.periodId)).period;
      assert.equal(state.used, 0);
      assert.equal(state.probeRequestId, null);
      assert.equal(state.minuteRemaining, 0);
      assert.equal(state.minuteFloorUntil, oldFloorUntil);
      f.clock.now = oldFloorUntil;
      const probe = await f.limiter.reserveResetProbe(candidate, probeRequest);
      assert.equal(probe.status, "reserved", JSON.stringify(probe));
      assert.equal((await f.limiter.claimLaunch(probe.permit)).status, "claimed");
      state = (await f.state(candidate.periodId)).period;
      assert.equal(state.used, 1);
      assert.equal(state.probeRequestId, probe.permit.requestId);
    });

    await t.test("a late old-period minute observation constrains the new period without resetting daily allowance", async () => {
      const f = fixture(firstDatabase, "minute-floor-late", { endsAt: initialNow + 1000 });
      await f.initialize();
      const old = await dispatch(f.limiter, f.request());
      f.clock.now = f.evidence.endsAt;
      const candidate = { ...f.evidence, periodId: id("minute-floor-late:candidate"), startsAt: f.clock.now, endsAt: f.clock.now + 86400000 };
      const probe = await f.limiter.reserveResetProbe(candidate, f.request("recovery"));
      assert.equal(probe.status, "reserved");
      assert.equal((await f.limiter.claimLaunch(probe.permit)).status, "claimed");
      await f.limiter.complete(probe.permit, { kind: "success", dailyRemaining: 149999 });
      assert.equal((await f.limiter.confirmReset(probe.permit.requestId, { ...candidate, dailyRemaining: 149999 })).status, "confirmed");
      const before = (await f.state(candidate.periodId)).period;
      await f.limiter.complete(old, { kind: "success", dailyRemaining: 150000, minuteRemaining: 0 });
      const after = (await f.state(candidate.periodId)).period;
      assert.equal(after.used, before.used);
      assert.equal(after.dayLimit, before.dayLimit);
      assert.equal(after.dayRemaining, before.dayRemaining);
      assert.equal(after.minuteRemaining, 0);
      assert.equal(after.minuteFloorUntil, f.clock.now + 60000);
      f.clock.now += 84;
      const queued = f.request();
      denied(await f.limiter.reserve(queued), "minute-limit");
      f.clock.now = after.minuteFloorUntil;
      await dispatch(f.limiter, queued);
      assert.equal((await f.state(candidate.periodId)).period.used, 2);
      assert.equal((await f.state()).period.used, 1);
    });

    await t.test("expired unlaunched permits stay spent and a clock regression cannot reopen a dispatch slot", async () => {
      const f = fixture(firstDatabase, "launch-expiry");
      await f.initialize();
      const pending = await f.limiter.reserve(f.request());
      assert.equal(pending.status, "reserved");
      f.clock.now = pending.permit.launchBefore;
      denied(await f.limiter.claimLaunch(pending.permit), "dispatch-expired");
      assert.equal((await f.state()).period.used, 1);
      const expired = await f.store.transaction(f.accountId, (transaction) => transaction.attempt(pending.permit.requestId));
      assert.equal(expired.state, "uncertain");
      assert.equal(expired.launchedAt, null);
      f.clock.now = initialNow - 1;
      denied(await f.limiter.reserve(f.request()), "clock-regression");
      assert.equal((await f.state()).period.used, 1);
      f.clock.now = pending.permit.launchBefore + 84;
      await dispatch(f.limiter, f.request());
      assert.equal((await f.state()).period.used, 2);

      const subscription = fixture(firstDatabase, "natural-subscription-expiry", { subscriptionExpiresAt: initialNow + 1000 });
      await subscription.initialize();
      subscription.clock.now += 1000;
      denied(await subscription.limiter.reserve(subscription.request()), "subscription-expired");
      assert.equal((await subscription.state()).period.used, 0);
    });

    await t.test("higher priority queued safety work wins the next slot and exposes lower-work delay", async () => {
      const f = fixture(firstDatabase, "priority");
      await f.initialize();
      const first = await dispatch(f.limiter, f.request());
      await f.limiter.complete(first, { kind: "success" });
      const enrichment = f.request("enrichment");
      const safety = f.request("results-cutoff");
      denied(await f.limiter.reserve(enrichment), "pacing");
      denied(await f.limiter.reserve(safety), "pacing");
      f.clock.now += 84;
      denied(await f.limiter.reserve(enrichment), "priority-wait");
      const safetyPermit = await dispatch(f.limiter, safety);
      await f.limiter.complete(safetyPermit, { kind: "success" });
      f.clock.now += 84;
      await dispatch(f.limiter, enrichment);
    });

    await t.test("an abandoned queued waiter releases the head without spending capacity", async () => {
      const f = fixture(firstDatabase, "abandon");
      await f.initialize();
      const first = await dispatch(f.limiter, f.request());
      await f.limiter.complete(first, { kind: "success" });
      const gone = f.request("results-cutoff"), next = f.request("daily-inputs");
      denied(await f.limiter.reserve(gone), "pacing");
      denied(await f.limiter.reserve(next), ["pacing", "priority-wait"]);
      f.clock.now += 84;
      denied(await f.limiter.reserve(next), "priority-wait");
      const before = (await f.state()).period.used;
      assert.deepEqual(await f.limiter.abandon(gone.requestId), { status: "abandoned" });
      assert.deepEqual(await f.limiter.abandon(gone.requestId), { status: "unchanged" });
      await dispatch(f.limiter, next);
      assert.equal((await f.state()).period.used, before + 1, "the abandoned waiter consumed nothing");
      assert.deepEqual(await f.limiter.abandon(next.requestId), { status: "unchanged" }, "dispatched attempts stay counted");
      denied(await f.limiter.reserve(gone), "already-attempted");
    });

    await t.test("a safety caller promotes duplicated queued enrichment without spending a second reservation", async () => {
      const f = fixture(firstDatabase, "priority-promotion", { dailyRemaining: 50002 });
      await f.initialize();
      const first = await dispatch(f.limiter, f.request("results-cutoff"));
      await f.limiter.complete(first, { kind: "success" });
      const enrichment = f.request("enrichment");
      denied(await f.limiter.reserve(enrichment), "pacing");
      const joined = await f.limiter.reserve(f.request("results-cutoff", { workKey: enrichment.workKey }));
      assert.equal(joined.status, "joined");
      assert.equal(joined.requestId, enrichment.requestId);
      const promoted = await f.store.transaction(f.accountId, (transaction) => transaction.attempt(enrichment.requestId));
      assert.equal(promoted.rank, 0);
      assert.equal(promoted.essential, true);
      assert.equal(promoted.priority, "results-cutoff");
      assert.equal((await f.state()).period.used, 99999);
      f.clock.now += 84;
      await dispatch(f.limiter, enrichment);
      assert.equal((await f.state()).period.used, 100000);
      assert.equal((await f.state()).period.ordinaryUsed, 99998);
    });

    await t.test("lower plan terms arriving between reservation and launch preserve the essential reserve", async () => {
      const f = fixture(firstDatabase, "lower-before-launch");
      await f.initialize();
      const earlier = await dispatch(f.limiter, f.request("results-cutoff"));
      f.clock.now += 84;
      const ordinary = await f.limiter.reserve(f.request("daily-inputs"));
      assert.equal(ordinary.status, "reserved");
      // 20,000/day keeps a proportional 3,333 essential reserve; 17,000 used enters it.
      await f.limiter.complete(earlier, { kind: "success", dailyLimit: 20000, dailyRemaining: 3000 });
      denied(await f.limiter.claimLaunch(ordinary.permit), "essential-reserve");
      const state = (await f.state()).period;
      assert.equal(state.dayLimit, 20000);
      assert.ok(state.used >= 2);
      const withheld = await f.store.transaction(f.accountId, (transaction) => transaction.attempt(ordinary.permit.requestId));
      assert.equal(withheld.launchedAt, null);
    });

    await t.test("verified same-period reinitialization only tightens limits and never refunds usage", async () => {
      const f = fixture(firstDatabase, "verified-lower-period");
      await f.initialize();
      const permit = await dispatch(f.limiter, f.request());
      await f.limiter.complete(permit, { kind: "success" });
      const lowered = await f.limiter.initialize({ ...f.evidence, secondLimit: 1, minuteLimit: 5, dailyRemaining: 149999 });
      assert.equal(lowered.status, "initialized");
      let state = await f.state();
      assert.equal(state.period.used, 1);
      assert.equal(state.period.secondLimit, 1);
      assert.equal(state.period.minuteLimit, 5);
      assert.ok(state.account.nextDispatchAt >= initialNow + 12000);
      const higher = await f.limiter.initialize(f.evidence);
      assert.equal(higher.status, "initialized");
      state = await f.state();
      assert.equal(state.period.used, 1);
      assert.equal(state.period.secondLimit, 1);
      assert.equal(state.period.minuteLimit, 5);
      f.clock.now += 11999;
      const queued = f.request();
      denied(await f.limiter.reserve(queued), "pacing");
      f.clock.now += 1;
      await dispatch(f.limiter, queued);
      assert.equal((await f.state()).period.used, 2);
    });

    await t.test("invalid permit timestamps cannot bypass single-use dispatch freshness", async () => {
      const f = fixture(firstDatabase, "invalid-permit");
      await f.initialize();
      const pending = await f.limiter.reserve(f.request());
      assert.equal(pending.status, "reserved");
      denied(await f.limiter.claimLaunch({ ...pending.permit, launchBefore: Number.NaN }), "invalid-request");
      denied(await f.limiter.claimLaunch({ ...pending.permit, dispatchedAt: Number.NaN }), "invalid-request");
      f.clock.now = pending.permit.launchBefore + 1;
      denied(await f.limiter.claimLaunch(pending.permit), "dispatch-expired");
      assert.equal((await f.state()).period.used, 1);
      const attempt = await f.store.transaction(f.accountId, (transaction) => transaction.attempt(pending.permit.requestId));
      assert.equal(attempt.launchedAt, null);
    });

    await t.test("429 retry delays, credential failures and subscription expiry stop other replicas without refund", async () => {
      const f = fixture(firstDatabase, "rate-limit");
      await f.initialize();
      const permit = await dispatch(f.limiter, f.request());
      await f.limiter.complete(permit, { kind: "rate-limited", retryAfterMs: 2000 });
      const second = createQuotaLimiter({ accountId: f.accountId, store: clockStore(secondDatabase, f.clock), verifyEvidence: () => true });
      f.clock.now += 1999;
      const waiting = f.request();
      denied(await second.reserve(waiting), "retry-delay");
      f.clock.now += 1;
      const retry = await dispatch(second, waiting);
      await second.complete(retry, { kind: "credential-failure" });
      f.clock.now += 84;
      denied(await f.limiter.reserve(f.request()), "credential-failure");
      assert.equal((await f.state()).period.used, 2);

      const expired = fixture(firstDatabase, "subscription", { subscriptionExpiresAt: initialNow + 1000 });
      await expired.initialize();
      const last = await dispatch(expired.limiter, expired.request());
      await expired.limiter.complete(last, { kind: "subscription-expired" });
      expired.clock.now += 84;
      denied(await expired.limiter.reserve(expired.request()), "subscription-expired");
      assert.equal((await expired.state()).period.used, 1);
    });

    await t.test("storage errors and row lock contention fail closed without leaking private details", async () => {
      const f = fixture(firstDatabase, "contention");
      await f.initialize();
      let unlock;
      let locked;
      const lockAcquired = new Promise((resolve) => { locked = resolve; });
      const lockRelease = new Promise((resolve) => { unlock = resolve; });
      const owner = f.store.transaction(f.accountId, async () => {
        locked();
        await lockRelease;
      });
      await lockAcquired;
      const contender = createQuotaLimiter({ accountId: f.accountId, store: clockStore(secondDatabase, f.clock), verifyEvidence: () => true });
      let settled = false;
      const pending = contender.reserve(f.request()).then((result) => { settled = true; return result; });
      try {
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.equal(settled, false, "another replica must wait for the durable account lock");
      } finally {
        unlock();
      }
      await owner;
      const accepted = await pending;
      assert.equal(accepted.status, "reserved", JSON.stringify(accepted));
      assert.equal((await f.state()).period.used, 1);

      const closedDatabase = replica();
      const unavailable = createQuotaLimiter({ accountId: f.accountId, store: createMysqlQuotaStore(closedDatabase), verifyEvidence: () => true });
      await closedDatabase.disconnect();
      const failure = await unavailable.reserve(f.request());
      denied(failure, "storage-unavailable");
      assert.ok(!JSON.stringify(failure).includes(applicationPassword));
      assert.ok(!JSON.stringify(failure).includes("127.0.0.1"));
      assert.equal((await f.state()).period.used, 1);
    });

    await t.test("corrupted durable quota state fails closed rather than silently creating fresh allowance", async () => {
      const f = fixture(firstDatabase, "corruption");
      await f.initialize();
      await firstDatabase.query((client) => client.$executeRaw`
        UPDATE ApiQuotaAccount SET stateJson = JSON_OBJECT('private', ${applicationPassword}) WHERE id = ${f.accountId}
      `);
      const result = await f.limiter.reserve(f.request());
      denied(result, "storage-unavailable");
      assert.ok(!JSON.stringify(result).includes(applicationPassword));
    });

    await t.test("private provider trial resumes zero-I/O deferral and durable adapter retries without replay or budget renewal", async (subtest) => {
      const f = fixture(firstDatabase, "provider-trial-resume");
      const clock = { now: () => f.clock.now };
      const prefix = "goal-hint-provider-trial-quota-";
      const directory = resolve(await mkdtemp(join(tmpdir(), prefix)));
      subtest.after(async () => {
        assert.equal(dirname(directory), resolve(tmpdir()), "cleanup must stay within the explicitly owned temporary directory");
        assert.ok(basename(directory).startsWith(prefix));
        await rm(directory, { recursive: true, force: true });
      });
      const trialPlan = parseTrialPlan({
        version: 1, id: "synthetic-mysql-trial", accountId: f.accountId,
        competitions: [{ id: 39, season: 2026 }], maxRequests: 2, deadlineAt: initialNow + 120_000,
        bounds: { priority: "enrichment", timeoutMs: 5000, maxPages: 1, maxRows: 5, maxResponseBytes: 10_000,
          retry: { maxAttempts: 2, baseDelayMs: 1000, maxDelayMs: 1000 }, cacheMaxAgeMs: 0 },
        freshness: null, evidence: [],
        tasks: [
          { id: "fixture", case: "league", operation: { kind: "fixtures", query: { fixtureId: 101 } }, maxRequests: 2 },
          { id: "must-wait-for-budget", case: "league", operation: { kind: "fixtures", query: { fixtureId: 102 } }, maxRequests: 1 },
        ],
      });
      let providerCalls = 0;
      const fetcher = async (input, init) => {
        const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
        assert.equal(url.origin, "https://v3.football.api-sports.io");
        assert.equal(url.pathname, "/fixtures");
        assert.equal(url.searchParams.get("id"), "101", "the exhausted follow-up task must never enter HTTP transport");
        assert.equal(init.signal.aborted, false);
        providerCalls++;
        const headers = { "content-type": "application/json", "x-ratelimit-requests-limit": "150000",
          "x-ratelimit-requests-remaining": String(150000 - providerCalls), "x-ratelimit-limit": "900",
          "x-ratelimit-remaining": String(900 - providerCalls) };
        if (providerCalls === 1) return new Response(JSON.stringify({ errors: { server: "Synthetic temporary failure" } }), { status: 503, headers });
        assert.equal(providerCalls, 2, "completed trial work must not be replayed after the journal is reopened");
        return new Response(JSON.stringify({ get: "fixtures", parameters: Object.fromEntries(url.searchParams), errors: [],
          results: 1, paging: { current: 1, total: 1 }, response: [{
            fixture: { id: 101, date: "2026-10-08T16:00:00+03:00", timezone: "Africa/Kampala",
              timestamp: Math.floor((initialNow + 3_600_000) / 1000), status: { short: "NS", elapsed: null } },
            league: { id: 39, name: "Synthetic league", country: "Synthetic", type: "League", season: 2026 },
            teams: { home: { id: 1, name: "Synthetic home" }, away: { id: 2, name: "Synthetic away" } },
            goals: { home: null, away: null }, score: { fulltime: { home: null, away: null },
              extratime: { home: null, away: null }, penalty: { home: null, away: null } },
          }] }), { status: 200, headers });
      };
      const runtimeFor = (limiter) => ({
        source: "synthetic", authorize: () => {}, verifyObservation: () => true, verifyFreshness: () => true,
        adapter: createApiFootballAdapter({ accountId: f.accountId, credential: { read: () => "synthetic-trial-key" },
          gateway: createQuotaGateway({ limiter, authorize: () => {} }), authorize: () => {}, clock, fetcher,
          random: () => 1, sleep: async (milliseconds) => { f.clock.now += milliseconds; } }),
      });
      // No quota account exists yet: the real durable gateway withholds HTTP,
      // while the private journal records a retryable task with zero dispatches.
      await withTrialJournal(directory, trialPlan, async (session) => {
        assert.deepEqual(await runProviderTrial(session, runtimeFor(f.limiter), { clock }), { reason: "waiting" });
        assert.equal(session.read().tasks[0].status, "deferred");
        assert.equal(session.read().tasks[0].dispatchedRequests, 0);
        assert.equal(session.read().tasks[0].observation.result.error.quotaReason, "unknown-account");
        assert.equal(chargedTrialRequests(session.read()), 0);
      }, { clock });
      assert.equal(providerCalls, 0);
      assert.equal((await f.state()).account, null);
      await f.initialize();

      const secondLimiter = createQuotaLimiter({ accountId: f.accountId,
        store: clockStore(secondDatabase, f.clock), verifyEvidence: () => true });
      let persistedObservation;
      await withTrialJournal(directory, trialPlan, async (session) => {
        assert.equal(session.read().tasks[0].status, "deferred");
        assert.deepEqual(await runProviderTrial(session, runtimeFor(secondLimiter), { clock }), { reason: "budget-exhausted" });
        const state = session.read().tasks[0];
        assert.equal(state.status, "completed");
        assert.equal(state.reservedRequests, 2);
        assert.equal(state.dispatchedRequests, 2);
        assert.equal(state.observation.source, "synthetic");
        assert.equal(state.observation.result.status, "complete");
        assert.equal(state.observation.result.data[0].id, 101);
        assert.equal(chargedTrialRequests(session.read()), 2);
        assert.equal(session.read().tasks.length, 1);
        persistedObservation = state.observation;
      }, { clock });
      assert.equal(providerCalls, 2);
      const attempts = await f.store.transaction(f.accountId, (transaction) => transaction.rollingAttempts(initialNow - 1));
      assert.equal(attempts.length, 2);
      assert.equal(new Set(attempts.map((attempt) => attempt.id)).size, 2, "each retry owns a separate durable reservation");
      assert.equal(new Set(attempts.map((attempt) => attempt.workKey)).size, 1);
      assert.ok(attempts.every((attempt) => attempt.state === "completed" && attempt.launchedAt !== null));
      assert.deepEqual(attempts.map((attempt) => attempt.responseKind), ["provider-error", "success"]);
      assert.equal((await f.state()).period.used, 2);
      assert.equal((await f.state()).period.ordinaryUsed, 2);

      f.clock.now += 84;
      await withTrialJournal(directory, trialPlan, async (session) => {
        assert.deepEqual(session.read().tasks[0].observation, persistedObservation);
        assert.deepEqual(await runProviderTrial(session, runtimeFor(secondLimiter), { clock }), { reason: "budget-exhausted" });
        assert.equal(chargedTrialRequests(session.read()), 2);
        assert.equal(session.read().tasks.length, 1);
        assert.equal(session.read().plan.deadlineAt, initialNow + 120_000);
      }, { clock });
      assert.equal(providerCalls, 2);
      assert.equal((await f.state()).period.used, 2);
    });

    await t.test("stalled adapter bodies retain early quota headers and stop another MySQL-backed replica", async () => {
      const f = fixture(firstDatabase, "adapter-stalled-body");
      await f.initialize();
      let providerCalls = 0;
      let bodyCancellations = 0;
      const completions = [];
      const tracedLimiter = {
        ...f.limiter,
        async complete(permit, feedback) {
          completions.push({ permit, feedback });
          return f.limiter.complete(permit, feedback);
        },
      };
      const fetcher = async (input, init) => {
        const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
        assert.equal(url.pathname, "/fixtures");
        assert.equal(url.searchParams.get("live"), "all");
        assert.equal(init.signal.aborted, false);
        providerCalls++;
        // Synthetic lower-account terms. A normal initial allowance remains
        // available unless these headers survive the never-completing body.
        return new Response(new ReadableStream({ cancel() { bodyCancellations++; } }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-ratelimit-requests-limit": "1",
            "x-ratelimit-requests-remaining": "0",
            "x-ratelimit-limit": "900",
            "x-ratelimit-remaining": "0",
          },
        });
      };
      const adapterFor = (limiter) => createApiFootballAdapter({
        accountId: f.accountId,
        credential: { read: () => "synthetic-stalled-body-key" },
        gateway: createQuotaGateway({ limiter, authorize: () => {} }),
        authorize: () => {},
        clock: { now: () => f.clock.now },
        fetcher,
      });
      const bounds = () => ({
        priority: "results-cutoff", timeoutMs: 1000, deadlineAt: f.clock.now + 5000,
        maxRequests: 1, maxPages: 1, maxRows: 1, maxResponseBytes: 1024,
        retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, cacheMaxAgeMs: 0,
      });
      const first = await adapterFor(tracedLimiter).evidence.liveFixtures(bounds());
      assert.equal(first.status, "failed", JSON.stringify(first));
      assert.equal(first.error.reason, "transport-error");
      assert.equal(first.requestsDispatched, 1);
      assert.equal(providerCalls, 1);
      assert.equal(bodyCancellations, 1);
      assert.equal(completions.length, 1);
      assert.equal(completions[0].feedback.kind, "uncertain");
      assert.equal(completions[0].feedback.dailyRemaining, 0);
      assert.equal(completions[0].feedback.minuteRemaining, 0);
      let state = await f.state();
      assert.equal(state.period.used, 1);
      assert.equal(state.period.providerDailyLimit, 1);
      assert.equal(state.period.dayRemaining, 0);
      assert.equal(state.period.minuteRemaining, 0);
      const firstAttempt = await f.store.transaction(f.accountId,
        (transaction) => transaction.attempt(completions[0].permit.requestId));
      assert.equal(firstAttempt.state, "uncertain");
      assert.equal(firstAttempt.responseKind, "uncertain");
      assert.ok(firstAttempt.launchedAt !== null);

      f.clock.now += 84;
      const secondLimiter = createQuotaLimiter({ accountId: f.accountId,
        store: clockStore(secondDatabase, f.clock), verifyEvidence: () => true });
      const second = await adapterFor(secondLimiter).evidence.liveFixtures(bounds());
      assert.equal(second.status, "failed", JSON.stringify(second));
      assert.equal(second.error.reason, "quota-denied");
      assert.ok(["daily-limit", "minute-limit"].includes(second.error.quotaReason));
      assert.equal(second.requestsDispatched, 0);
      assert.equal(providerCalls, 1);
      state = await f.state();
      assert.equal(state.period.used, 1);
      assert.equal(state.period.dayRemaining, 0);
      assert.equal(state.period.minuteRemaining, 0);
    });

    await t.test("actual-clock gateway dispatches one authorized mocked transport through durable MySQL claims", async (subtest) => {
      const now = Date.now();
      const accountId = id("account:real-clock-gateway");
      const store = createMysqlQuotaStore(firstDatabase);
      const evidence = {
        accountId, periodId: id("period:real-clock-gateway"), startsAt: now - 3600000,
        endsAt: now + 86400000, subscriptionExpiresAt: now + 864000000,
        providerDailyLimit: 150000, dailyRemaining: 150000, secondLimit: 15, minuteLimit: 900,
        evidenceRef: "synthetic-quota-fixture:real-clock-gateway",
      };
      const limiter = createQuotaLimiter({ accountId, store, verifyEvidence: () => true });
      assert.equal((await limiter.initialize(evidence)).status, "initialized");
      let authorizations = 0;
      let transportCalls = 0;
      const stages = [];
      const tracedLimiter = {
        ...limiter,
        async reserve(request) {
          const started = performance.now();
          const result = await limiter.reserve(request);
          stages.push({ operation: "reserve", status: result.status, elapsedMs: Math.round(performance.now() - started),
            ...(result.status === "reserved" ? { launchWindowMs: result.permit.launchBefore - result.permit.dispatchedAt } : {}) });
          return result;
        },
        async claimLaunch(permit) {
          const started = performance.now();
          const result = await limiter.claimLaunch(permit);
          stages.push({ operation: "claim", status: result.status, elapsedMs: Math.round(performance.now() - started),
            ...(result.status === "denied" ? { reason: result.reason } : {}) });
          return result;
        },
        async complete(permit, feedback) {
          const started = performance.now();
          const result = await limiter.complete(permit, feedback);
          stages.push({ operation: "complete", status: result.status, elapsedMs: Math.round(performance.now() - started) });
          return result;
        },
      };
      const gateway = createQuotaGateway({ limiter: tracedLimiter, authorize: () => { authorizations++; } });
      const request = {
        requestId: id("request:real-clock-gateway"), workKey: id("work:real-clock-gateway"),
        priority: "results-cutoff", deadlineAt: Date.now() + 120000, timeoutMs: 5000,
      };
      const started = performance.now();
      const result = await gateway.execute(request, async (signal) => {
        assert.equal(signal.aborted, false);
        transportCalls++;
        return { value: "stored mock response", feedback: { kind: "success" } };
      });
      subtest.diagnostic(`Real-clock MySQL gateway outcome=${JSON.stringify(result)}, elapsed=${(performance.now() - started).toFixed(1)}ms, stages=${JSON.stringify(stages)}; no network I/O.`);
      assert.equal(result.status, "completed", JSON.stringify(result));
      assert.equal(result.value, "stored mock response");
      assert.equal(transportCalls, 1);
      assert.equal(authorizations, 3);
      const state = await store.transaction(accountId, async (transaction) => ({
        period: await transaction.period(evidence.periodId), attempt: await transaction.attempt(request.requestId),
      }));
      assert.equal(state.period.used, 1);
      assert.equal(state.attempt.state, "completed");
      assert.ok(state.attempt.launchedAt !== null);
    });
  } finally {
    try {
      await Promise.all(databases.map((database) => database.disconnect()));
    } finally {
      await instance.stop();
    }
  }
});
