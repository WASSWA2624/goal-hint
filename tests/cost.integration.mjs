import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { createDatabase } from "../src/server/database/client.ts";
import { createMysqlCostStore } from "../src/server/cost-control/cost-mysql-store.ts";
import { createCostService } from "../src/server/cost-control/cost-service.ts";
import { costFingerprint, parseCostAttempt } from "../src/server/cost-control/cost-input.ts";
import { costAttemptTotals } from "../src/server/cost-control/cost-totals.ts";
import { createMysqlQuotaStore } from "../src/server/football/quota-mysql-store.ts";
import { createQuotaLimiter } from "../src/server/football/quota-limiter.ts";
import { MysqlServerUnavailableError, startIsolatedMysql } from "./helpers/mysql-instance.mjs";
import { COST_NOW, USD, costId, costPeriod, costJob, costRate, costRequest, costUsage,
  costTestEnvironment, syntheticCostAuthority } from "./helpers/cost-fixtures.mjs";

const execFileAsync = promisify(execFile);
const workspace = fileURLToPath(new URL("../", import.meta.url));
const databaseScript = fileURLToPath(new URL("../scripts/database.mjs", import.meta.url));
const costTables = ["CostBudgetAccount", "CostBudgetPeriod", "CostBudgetJob", "CostBudgetAttempt"];
const quotaTables = ["ApiQuotaAccount", "ApiQuotaPeriod", "ApiQuotaAttempt"];

function denied(result, reason) {
  assert.equal(result.status, "denied");
  assert.ok([].concat(reason).includes(result.reason), `Expected ${[].concat(reason).join(" / ")}, got ${result.reason}`);
}

function controlledCostStore(database, clock) {
  const store = createMysqlCostStore(database);
  return { transaction(accountId, category, operation) {
    return store.transaction(accountId, category, (transaction) => operation({ ...transaction, now: async () => clock.now }));
  } };
}

test("independent durable spending contracts on isolated genuine MySQL", { timeout: 300_000 }, async (t) => {
  let instance;
  try { instance = await startIsolatedMysql(); }
  catch (error) {
    if (!(error instanceof MysqlServerUnavailableError)) throw error;
    t.skip(`${error.message} Database-backed cost acceptance remains pending.`);
    return;
  }
  t.diagnostic(`Owned throwaway server: ${instance.version}. Prices, rates, usage approvals and clocks are synthetic; no paid provider request is made.`);
  t.beforeEach(() => instance.assertOwnership());
  const migrationPassword = randomBytes(24).toString("hex"), applicationPassword = randomBytes(24).toString("hex");
  const migrationUrl = `mysql://cost_migration:${migrationPassword}@127.0.0.1:${instance.port}/goal_hint_test`;
  const applicationUrl = `mysql://cost_application:${applicationPassword}@127.0.0.1:${instance.port}/goal_hint_test`;
  const env = costTestEnvironment(applicationUrl, migrationUrl), databases = [];
  function replica() {
    const database = createDatabase(parseRuntimePolicy(env));
    databases.push(database);
    return database;
  }
  try {
    await instance.executeAdmin(`
      CREATE USER 'cost_migration'@'127.0.0.1' IDENTIFIED BY '${migrationPassword}';
      CREATE USER 'cost_application'@'127.0.0.1' IDENTIFIED BY '${applicationPassword}';
      GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES
        ON goal_hint_test.* TO 'cost_migration'@'127.0.0.1';
    `);
    await execFileAsync(process.execPath, ["--conditions=react-server", databaseScript, "deploy"],
      { cwd: workspace, env, windowsHide: true, timeout: 60_000, maxBuffer: 1024 * 1024 });
    await instance.executeAdmin([...costTables, ...quotaTables].map((table) =>
      `GRANT SELECT, INSERT, UPDATE, DELETE ON goal_hint_test.${table} TO 'cost_application'@'127.0.0.1';`).join("\n"));
    const firstDatabase = replica(), secondDatabase = replica();
    function fixture(label, { category = "ai", period: periodOverrides = {}, job: jobOverrides = {}, rate: rateOverrides = {},
      authority = syntheticCostAuthority() } = {}) {
      const clock = { now: COST_NOW }, period = costPeriod(label, category, periodOverrides);
      const job = costJob(period, label, jobOverrides), rate = costRate(category, rateOverrides);
      let sequence = 0;
      function service(database = firstDatabase, options = {}) {
        return createCostService({ accountId: period.accountId, category, store: controlledCostStore(database, clock),
          authority, rateFor: () => rate, ...options });
      }
      const first = service(), second = service(secondDatabase);
      return { clock, period, job, rate, first, second, service,
        request(overrides = {}) { return costRequest(job, `${label}:${++sequence}`, overrides); },
        async initialize() { assert.equal((await first.initialize(period)).status, "initialized"); },
        async reserve(request, owner = first, selectedJob = job) {
          const result = await owner.reserve(selectedJob, request);
          assert.equal(result.status, "reserved", result.status === "denied" ? result.reason : result.status);
          return result.permit;
        },
        async dispatch(request, owner = first, selectedJob = job) {
          const result = await owner.reserve(selectedJob, request);
          assert.equal(result.status, "reserved", result.status === "denied" ? result.reason : result.status);
          assert.equal((await owner.markDispatched(result.permit)).status, "claimed");
          clock.now = Math.max(clock.now, COST_NOW + 100);
          return result.permit;
        },
        async state() { return controlledCostStore(firstDatabase, clock).transaction(period.accountId, category, async (transaction) => ({
          account: await transaction.account(), periods: await transaction.periods(), attempts: await transaction.attempts() })); },
      };
    }

    await t.test("incremental migration preserves least privilege and exact indexed ledger projections", async () => {
      assert.equal(await firstDatabase.readiness(), "ready");
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`CREATE TABLE forbidden_cost_ddl (id INT NOT NULL PRIMARY KEY) ENGINE=InnoDB`),
        (error) => error.name === "DatabaseOperationError");
      await assert.rejects(firstDatabase.query((client) => client.$queryRaw`SELECT migration_name FROM _prisma_migrations`),
        (error) => error.name === "DatabaseOperationError");
      await execFileAsync(process.execPath, ["--conditions=react-server", databaseScript, "verify"],
        { cwd: workspace, env, windowsHide: true, timeout: 60_000, maxBuffer: 1024 * 1024 });
      const columns = await firstDatabase.query((client) => client.$queryRaw`
        SELECT COLUMN_NAME, DATA_TYPE, NUMERIC_PRECISION, NUMERIC_SCALE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CostBudgetAttempt'
      `);
      for (const name of ["maxCostAmount", "liabilityAmount"]) {
        const column = columns.find((item) => item.COLUMN_NAME === name);
        assert.equal(column.DATA_TYPE, "decimal");
        assert.equal(Number(column.NUMERIC_PRECISION), 38);
        assert.equal(Number(column.NUMERIC_SCALE), 12);
      }
    });

    await t.test("concurrent workers cannot exceed one aggregate spending cap", async () => {
      const f = fixture("aggregate-race", { period: { capUsdPicos: 3n * USD } });
      await f.initialize();
      const results = await Promise.all(Array.from({ length: 16 }, (_, index) => {
        const job = costJob(f.period, `aggregate-race:${index}`), request = costRequest(job, `aggregate-race:${index}`);
        return (index % 2 ? f.first : f.second).reserve(job, request);
      }));
      assert.equal(results.filter((result) => result.status === "reserved").length, 3);
      assert.ok(results.filter((result) => result.status === "denied").every((result) => result.reason === "budget-exhausted"));
      const summary = await f.first.summary();
      assert.equal(summary.status, "summary");
      assert.equal(summary.liabilityUsdPicos, 3n * USD);
      assert.equal(summary.remainingUsdPicos, 0n);
      const state = await f.state();
      assert.equal(state.attempts.filter((attempt) => attempt.state === "reserved").length, 3);
      assert.equal(state.attempts.reduce((total, attempt) => total + attempt.liabilityUsdPicos, 0n), 3n * USD);
    });

    await t.test("concurrent callers enforce the shared job cap and work identity", async () => {
      const f = fixture("job-race", { job: { costCapUsdPicos: 2n * USD } });
      await f.initialize();
      const results = await Promise.all(Array.from({ length: 12 }, (_, index) =>
        (index % 2 ? f.first : f.second).reserve(f.job, f.request())));
      assert.equal(results.filter((result) => result.status === "reserved").length, 2);
      assert.ok(results.filter((result) => result.status === "denied").every((result) => result.reason === "job-budget-exhausted"));
      assert.equal((await f.first.jobSummary(f.job.jobId)).liabilityUsdPicos, 2n * USD);
      const alias = { ...f.job, jobId: costId("different-job-same-work") };
      denied(await f.first.reserve(alias, costRequest(alias, "different-job-same-work")), "conflicting-policy");
      const state = await f.state();
      assert.equal(state.attempts.filter((attempt) => attempt.state === "reserved").length, 2);
    });

    await t.test("one attempt can reserve and launch only once across processes", async () => {
      const f = fixture("one-attempt");
      await f.initialize();
      const request = f.request();
      const results = await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? f.first : f.second).reserve(f.job, request)));
      assert.equal(results.filter((result) => result.status === "reserved").length, 1);
      assert.equal(results.filter((result) => result.status === "joined").length, 7);
      const permit = results.find((result) => result.status === "reserved").permit;
      const claims = await Promise.all([f.first.markDispatched(permit), f.second.markDispatched(permit)]);
      assert.equal(claims.filter((result) => result.status === "claimed").length, 1);
      assert.equal(claims.filter((result) => result.status === "denied").length, 1);
      assert.equal((await f.first.summary()).liabilityUsdPicos, USD);
      denied(await f.first.reserve(f.job, { ...request, timeoutMs: request.timeoutMs + 1 }), "invalid-request");
    });

    await t.test("measured completion releases only documented differences and separates estimates from bills", async () => {
      const f = fixture("measured", { rate: { rates: { requests: { amount: "0", perUnits: 1 },
        inputTokens: null, outputTokens: null, billedUnits: { amount: "0.01", perUnits: 1 } } } });
      await f.initialize();
      const permit = await f.dispatch(f.request({ maximum: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 100 } }));
      const usage = costUsage(permit, "measured", { observedQuantities: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 20 },
        observedUsdPicos: USD / 5n, invoicedUsdPicos: USD / 5n });
      const recorded = await f.first.reconcile(permit, usage);
      assert.equal(recorded.status, "recorded");
      assert.equal(recorded.liabilityUsdPicos, USD / 5n);
      const summary = await f.first.summary();
      assert.equal(summary.estimatedUsdPicos, USD / 5n);
      assert.equal(summary.observedUsdPicos, USD / 5n);
      assert.equal(summary.invoicedUsdPicos, USD / 5n);
      assert.equal(summary.liabilityUsdPicos, USD / 5n);
      assert.equal(summary.requests, 1n);
      assert.equal(summary.billedUnits, 20n);
      assert.equal(summary.elapsedMs, 100n);
      assert.equal((await f.second.reconcile(permit, usage)).status, "recorded");
      assert.equal((await f.first.summary()).liabilityUsdPicos, USD / 5n);
      denied(await f.first.reconcile(permit, { ...usage, observedUsdPicos: USD / 4n }), "conflicting-reconciliation");
      const retry = await f.dispatch(f.request({ maximum: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 10 } }));
      assert.notEqual(retry.attemptId, permit.attemptId);
      assert.equal((await f.first.summary()).liabilityUsdPicos, USD * 3n / 10n);
    });

    await t.test("new receipt IDs and older observations cannot erase known measured billing", async () => {
      const f = fixture("monotonic-receipts", { rate: { rates: { requests: { amount: "0", perUnits: 1 },
        inputTokens: null, outputTokens: null, billedUnits: { amount: "0.01", perUnits: 1 } } } });
      await f.initialize();
      const permit = await f.dispatch(f.request({ maximum: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 100 } }));
      const original = costUsage(permit, "monotonic-original", {
        observedQuantities: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 80 } });
      assert.equal((await f.first.reconcile(permit, original)).liabilityUsdPicos, USD * 4n / 5n);
      f.clock.now = COST_NOW + 200;
      const older = costUsage(permit, "monotonic-older", { observedAt: COST_NOW + 50,
        observedQuantities: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 20 } });
      const oldResult = await f.second.reconcile(permit, older);
      assert.equal(oldResult.status, "recorded");
      assert.equal(oldResult.liabilityUsdPicos, USD * 4n / 5n);
      let state = await f.state(), attempt = state.attempts.find((row) => row.request.attemptId === permit.attemptId);
      assert.equal(attempt.usage.reconciliationId, original.reconciliationId);
      assert.equal(attempt.usage.observedAt, original.observedAt);
      assert.equal(attempt.reconciliations.length, 2);
      f.clock.now = COST_NOW + 300;
      const newer = costUsage(permit, "monotonic-newer", { observedAt: f.clock.now,
        observedQuantities: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 30 } });
      assert.equal((await f.first.reconcile(permit, newer)).liabilityUsdPicos, USD * 4n / 5n);
      state = await f.state(); attempt = state.attempts.find((row) => row.request.attemptId === permit.attemptId);
      assert.equal(attempt.usage.reconciliationId, newer.reconciliationId);
      assert.equal(attempt.usage.observedAt, newer.observedAt);
      assert.equal(attempt.reconciliations.length, 3);
      let summary = await f.first.summary();
      assert.equal(summary.estimatedUsdPicos, USD * 4n / 5n);
      assert.equal(summary.liabilityUsdPicos, USD * 4n / 5n);
      assert.equal(summary.billedUnits, 80n);
      f.clock.now = COST_NOW + 400;
      const invoice = costUsage(permit, "monotonic-invoice", { observedAt: f.clock.now,
        observedQuantities: null, invoicedUsdPicos: USD / 5n });
      assert.equal((await f.second.reconcile(permit, invoice)).liabilityUsdPicos, USD / 5n);
      summary = await f.first.summary();
      assert.equal(summary.estimatedUsdPicos, USD * 4n / 5n);
      assert.equal(summary.invoicedUsdPicos, USD / 5n);
      assert.equal(summary.liabilityUsdPicos, USD / 5n);
      f.clock.now = COST_NOW + 500;
      const revisedActual = costUsage(permit, "monotonic-known-actual", { observedAt: f.clock.now,
        observedQuantities: null, invoicedUsdPicos: USD / 10n, observedUsdPicos: USD * 3n / 10n });
      assert.equal((await f.first.reconcile(permit, revisedActual)).liabilityUsdPicos, USD * 3n / 10n);
      summary = await f.first.summary();
      assert.equal(summary.invoicedUsdPicos, USD / 5n);
      assert.equal(summary.observedUsdPicos, USD * 3n / 10n);
      assert.equal(summary.liabilityUsdPicos, USD * 3n / 10n);
    });

    await t.test("measured billing combines known component maxima across separate verified receipts", async () => {
      const f = fixture("component-receipts", { rate: { rates: { requests: { amount: "0", perUnits: 1 },
        inputTokens: { amount: "0.01", perUnits: 1 }, outputTokens: { amount: "0.02", perUnits: 1 }, billedUnits: null } } });
      await f.initialize();
      const permit = await f.dispatch(f.request({ maximum: { requests: 1, inputTokens: 100, outputTokens: 100, billedUnits: 0 } }));
      assert.equal((await f.first.reconcile(permit, costUsage(permit, "component-input", {
        observedQuantities: { requests: 1, inputTokens: 80, outputTokens: 0, billedUnits: 0 } }))).liabilityUsdPicos, USD * 4n / 5n);
      f.clock.now = COST_NOW + 200;
      const output = costUsage(permit, "component-output", { observedAt: COST_NOW + 50,
        observedQuantities: { requests: 1, inputTokens: 0, outputTokens: 40, billedUnits: 0 } });
      assert.equal((await f.second.reconcile(permit, output)).liabilityUsdPicos, USD * 8n / 5n);
      f.clock.now = COST_NOW + 300;
      const smaller = costUsage(permit, "component-newer-smaller", { observedAt: f.clock.now,
        observedQuantities: { requests: 1, inputTokens: 20, outputTokens: 30, billedUnits: 0 } });
      assert.equal((await f.first.reconcile(permit, smaller)).liabilityUsdPicos, USD * 8n / 5n);
      const summary = await f.first.summary();
      assert.equal(summary.estimatedUsdPicos, USD * 8n / 5n);
      assert.equal(summary.liabilityUsdPicos, USD * 8n / 5n);
      assert.equal(summary.inputTokens, 80n);
      assert.equal(summary.outputTokens, 40n);
    });

    await t.test("partial and unknown outcomes conservatively retain reservations until verified reconciliation", async () => {
      const f = fixture("unknown-partial", { period: { capUsdPicos: 2n * USD } });
      await f.initialize();
      const partial = await f.dispatch(f.request());
      const partialUsage = costUsage(partial, "partial", { kind: "partial", observedQuantities: null,
        observedUsdPicos: USD / 5n });
      assert.equal((await f.first.reconcile(partial, partialUsage)).status, "recorded");
      const unknown = await f.dispatch(f.request());
      assert.equal((await f.first.reconcile(unknown, costUsage(unknown, "unknown", { kind: "unknown", observedQuantities: null }))).status, "recorded");
      const summary = await f.first.summary();
      assert.equal(summary.liabilityUsdPicos, 2n * USD);
      assert.equal(summary.observedUsdPicos, USD / 5n);
      denied(await f.second.reserve(f.job, f.request()), "budget-exhausted");
      denied(await f.second.cancelBeforeDispatch(unknown), ["already-attempted", "uncertain-usage"]);
      const final = costUsage(partial, "partial-final", { invoicedUsdPicos: USD / 5n, observedUsdPicos: USD / 5n });
      assert.equal((await f.second.reconcile(partial, final)).status, "recorded");
      assert.equal((await f.first.summary()).liabilityUsdPicos, USD * 6n / 5n);
    });

    await t.test("invoice-required billing does not release spend on estimated token usage alone", async () => {
      const f = fixture("invoice-required", { rate: { billingRule: "invoice-required", rates: {
        requests: { amount: "0", perUnits: 1 }, inputTokens: null, outputTokens: null, billedUnits: { amount: "0.01", perUnits: 1 } } } });
      await f.initialize();
      const permit = await f.dispatch(f.request({ maximum: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 100 } }));
      assert.equal((await f.first.reconcile(permit, costUsage(permit, "invoice-awaiting", {
        observedQuantities: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 20 } }))).status, "recorded");
      assert.equal((await f.first.summary()).liabilityUsdPicos, USD);
      assert.equal((await f.first.summary()).estimatedUsdPicos, USD / 5n);
      assert.equal((await f.first.summary()).invoicedUsdPicos, 0n);
      assert.equal((await f.second.reconcile(permit, costUsage(permit, "invoice-final", {
        observedQuantities: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 20 }, invoicedUsdPicos: USD / 5n }))).status, "recorded");
      assert.equal((await f.first.summary()).liabilityUsdPicos, USD / 5n);
    });

    await t.test("invoice-only completion releases verified money while retaining unmeasured request and unit bounds", async () => {
      const f = fixture("invoice-only", { job: { requestLimit: 1 }, rate: { billingRule: "invoice-required", rates: {
        requests: { amount: "0", perUnits: 1 }, inputTokens: null, outputTokens: null, billedUnits: { amount: "0.01", perUnits: 1 } } } });
      await f.initialize();
      const permit = await f.dispatch(f.request({ maximum: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 100 } }));
      const usage = costUsage(permit, "invoice-only", { observedQuantities: null, invoicedUsdPicos: USD / 5n });
      const result = await f.first.reconcile(permit, usage);
      assert.equal(result.status, "recorded");
      assert.equal(result.liabilityUsdPicos, USD / 5n);
      const summary = await f.first.summary();
      assert.equal(summary.estimatedUsdPicos, USD);
      assert.equal(summary.invoicedUsdPicos, USD / 5n);
      assert.equal(summary.requests, 1n);
      assert.equal(summary.billedUnits, 100n);
      denied(await f.second.reserve(f.job, f.request()), "request-limit");
    });

    await t.test("confirmed cancellation before dispatch frees spend but launched work stays billable", async () => {
      const f = fixture("cancellation", { period: { capUsdPicos: USD } });
      await f.initialize();
      const unlaunched = await f.reserve(f.request());
      assert.equal((await f.second.cancelBeforeDispatch(unlaunched)).status, "canceled");
      assert.equal((await f.first.summary()).liabilityUsdPicos, 0n);
      denied(await f.first.markDispatched(unlaunched), ["already-attempted", "invalid-permit"]);
      const launched = await f.dispatch(f.request());
      denied(await f.second.cancelBeforeDispatch(launched), ["already-attempted", "uncertain-usage"]);
      assert.equal((await f.first.summary()).liabilityUsdPicos, USD);
      denied(await f.first.reserve(f.job, f.request()), "budget-exhausted");
    });

    await t.test("direct store writes cannot reset charged attempts, immutable metadata or receipt history", async () => {
      const f = fixture("immutable-store"); await f.initialize();
      const permit = await f.dispatch(f.request());
      assert.equal((await f.first.reconcile(permit, costUsage(permit, "immutable-first"))).status, "recorded");
      f.clock.now = COST_NOW + 200;
      assert.equal((await f.second.reconcile(permit, costUsage(permit, "immutable-second", { observedAt: f.clock.now }))).status, "recorded");
      const store = controlledCostStore(firstDatabase, f.clock);
      const original = await store.transaction(f.period.accountId, f.period.category, (transaction) => transaction.attempt(permit.attemptId));
      const summary = await f.first.summary();
      const mutations = [
        { name: "completed to queued", change(attempt) {
          Object.assign(attempt, { state: "queued", reservedAt: null, dispatchedAt: null, completedAt: null, launchBefore: null,
            periodId: null, ownerToken: null, liabilityUsdPicos: 0n, estimatedUsdPicos: null, observedUsdPicos: null,
            invoicedUsdPicos: null, usage: null, reconciliationFingerprint: null, reconciliations: [] });
        } },
        { name: "request change", change(attempt) {
          attempt.request.timeoutMs += 1; attempt.requestFingerprint = costFingerprint(attempt.request);
        } },
        { name: "maximum change", change(attempt) {
          attempt.request.maximum.inputTokens = 100;
          attempt.requestFingerprint = costFingerprint(attempt.request);
          attempt.maximumCostUsdPicos = 2n * USD;
        } },
        { name: "rate change", change(attempt) { attempt.rate.evidenceRef = "synthetic-replaced-rate-evidence"; } },
        { name: "owner fencing change", change(attempt) { attempt.ownerToken = costId("immutable-replacement-owner"); } },
        { name: "queue time change", change(attempt) { attempt.queuedAt -= 1; } },
        { name: "history removal", change(attempt) { attempt.reconciliations = attempt.reconciliations.slice(1); } },
      ];
      for (const { name, change } of mutations) {
        const altered = structuredClone(original);
        change(altered);
        // Each proposed replacement is internally well formed. Rejection must
        // come from the durable transition/immutability boundary, not its shape.
        parseCostAttempt(altered); costAttemptTotals(altered);
        await assert.rejects(store.transaction(f.period.accountId, f.period.category,
          (transaction) => transaction.saveAttempt(altered)), (error) => error.name === "DatabaseOperationError", name);
        const stored = await store.transaction(f.period.accountId, f.period.category, (transaction) => transaction.attempt(permit.attemptId));
        assert.equal(costFingerprint(stored), costFingerprint(original), name);
        const current = await f.first.summary();
        assert.equal(current.liabilityUsdPicos, summary.liabilityUsdPicos, name);
        assert.equal(current.requests, summary.requests, name);
        assert.equal(current.elapsedMs, summary.elapsedMs, name);
      }
      const unlaunched = await f.reserve(f.request());
      assert.equal((await f.second.cancelBeforeDispatch(unlaunched)).status, "canceled");
      assert.equal((await f.first.summary()).liabilityUsdPicos, summary.liabilityUsdPicos);
    });

    await t.test("restart reads stored reservations and periods cannot silently reset spent budgets", async () => {
      const f = fixture("restart", { period: { capUsdPicos: USD } });
      await f.initialize();
      const permit = await f.dispatch(f.request());
      assert.equal((await f.first.reconcile(permit, costUsage(permit, "restart-unknown", { kind: "unknown", observedQuantities: null }))).status, "recorded");
      const reopenedDatabase = replica(), restarted = f.service(reopenedDatabase);
      assert.equal((await restarted.summary()).liabilityUsdPicos, USD);
      assert.equal((await restarted.initialize(f.period)).status, "initialized");
      denied(await restarted.initialize({ ...f.period, capUsdPicos: 10n * USD }), "conflicting-policy");
      denied(await restarted.reserve(f.job, f.request()), "budget-exhausted");
      assert.equal((await restarted.summary()).capUsdPicos, USD);
      assert.equal((await f.state()).attempts.filter((attempt) => attempt.liabilityUsdPicos > 0n).length, 1);
    });

    await t.test("approved new accounting periods preserve old liabilities and immutable job ceilings", async () => {
      const f = fixture("new-period", { period: { endsAt: COST_NOW + 10_000 }, job: { costCapUsdPicos: USD } });
      await f.initialize();
      const permit = await f.dispatch(f.request());
      assert.equal((await f.first.reconcile(permit, costUsage(permit, "new-period-old-unknown", { kind: "unknown", observedQuantities: null }))).status, "recorded");
      f.clock.now += 10_000;
      const next = { ...f.period, periodId: costId("new-period-next"), startsAt: f.period.endsAt, endsAt: f.period.endsAt + 10_000 };
      assert.equal((await f.second.initialize(next)).status, "initialized");
      assert.equal((await f.second.summary()).liabilityUsdPicos, 0n);
      assert.equal((await f.second.summary(f.period.periodId)).liabilityUsdPicos, USD);
      denied(await f.second.reserve(f.job, f.request()), "job-budget-exhausted");
      assert.equal((await f.second.initialize(f.period)).status, "initialized");
      assert.equal((await f.second.summary()).periodId, next.periodId, "reopening a known old period must not switch the active allowance");
    });

    await t.test("unpriced, invalid currency and unapproved policy cannot create affordable dispatch", async () => {
      const f = fixture("unpriced");
      await f.initialize();
      denied(await f.service(firstDatabase, { rateFor: () => null }).reserve(f.job, f.request()), "unpriced");
      denied(await f.service(firstDatabase, { rateFor: () => ({ ...f.rate, currency: "XXX", usdConversion: null }) }).reserve(f.job, f.request()), "unpriced");
      denied(await f.service(firstDatabase, { rateFor: () => ({ ...f.rate, rates: { ...f.rate.rates, requests: null } }) }).reserve(f.job, f.request()), "unpriced");
      denied(await f.service(firstDatabase, { authority: syntheticCostAuthority({ verifyJob: () => false }) }).reserve(f.job, f.request()), "unverified-policy");
      denied(await f.service(firstDatabase, { authority: syntheticCostAuthority({ authorize() { throw new Error("private-key-must-not-leak"); } }) }).reserve(f.job, f.request()), "operation-not-authorized");
      assert.equal((await f.first.summary()).liabilityUsdPicos, 0n);
      assert.equal((await f.state()).attempts.length, 0);
    });

    await t.test("missing configuration fails closed and an explicitly approved zero cap grants no free allowance", async () => {
      const missing = fixture("missing-configuration");
      denied(await missing.first.reserve(missing.job, missing.request()), "unconfigured");
      denied(await missing.first.summary(), "unconfigured");
      const zero = fixture("zero-cap", { period: { capUsdPicos: 0n }, job: { costCapUsdPicos: 0n } });
      await zero.initialize();
      denied(await zero.first.reserve(zero.job, zero.request()), "budget-exhausted");
      assert.equal((await zero.first.summary()).remainingUsdPicos, 0n);
      const unapproved = fixture("unapproved-period", { authority: syntheticCostAuthority({ verifyPeriod: () => false }) });
      denied(await unapproved.first.initialize(unapproved.period), "unverified-policy");
    });

    await t.test("verified opening debt above an approved cap is recorded and blocks new paid work", async () => {
      const f = fixture("opening-debt", { period: { capUsdPicos: USD, openingChargedUsdPicos: 2n * USD } });
      await f.initialize();
      const summary = await f.first.summary();
      assert.equal(summary.status, "summary");
      assert.equal(summary.capUsdPicos, USD);
      assert.equal(summary.openingChargedUsdPicos, 2n * USD);
      assert.equal(summary.liabilityUsdPicos, 2n * USD);
      assert.equal(summary.remainingUsdPicos, 0n);
      assert.equal(summary.overageBlocked, true);
      denied(await f.second.reserve(f.job, f.request()), "budget-exhausted");
    });

    await t.test("inactive opening debt cannot be erased by native cap, amount or account reassignment", async () => {
      const f = fixture("inactive-opening-debt", { period: { capUsdPicos: USD, openingChargedUsdPicos: 2n * USD,
        endsAt: COST_NOW + 10_000 } });
      await f.initialize();
      f.clock.now = COST_NOW + 10_000;
      const next = { ...f.period, periodId: costId("inactive-opening-debt-next"), startsAt: f.period.endsAt,
        endsAt: f.period.endsAt + 10_000, capUsdPicos: 10n * USD, openingChargedUsdPicos: 0n };
      assert.equal((await f.first.initialize(next)).status, "initialized");
      const other = fixture("inactive-opening-debt-target"); await other.initialize();
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`
        UPDATE CostBudgetPeriod SET capAmount = 2
        WHERE accountId = ${f.period.accountId} AND category = ${f.period.category} AND id = ${f.period.periodId}
      `), (error) => error.name === "DatabaseOperationError");
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`
        UPDATE CostBudgetPeriod SET openingChargedAmount = 0
        WHERE accountId = ${f.period.accountId} AND category = ${f.period.category} AND id = ${f.period.periodId}
      `), (error) => error.name === "DatabaseOperationError");
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`
        UPDATE CostBudgetPeriod SET accountId = ${other.period.accountId}
        WHERE accountId = ${f.period.accountId} AND category = ${f.period.category} AND id = ${f.period.periodId}
      `), (error) => error.name === "DatabaseOperationError");
      const summary = await f.first.summary();
      assert.equal(summary.periodId, next.periodId);
      assert.equal(summary.liabilityUsdPicos, 0n);
      assert.equal(summary.overageBlocked, true);
      assert.equal((await f.first.summary(f.period.periodId)).liabilityUsdPicos, 2n * USD);
      denied(await f.second.reserve(f.job, f.request()), "budget-exhausted");
    });

    await t.test("token, request, unit, elapsed-time and fallback reserves produce distinct outcomes", async () => {
      const requests = fixture("request-limit", { job: { requestLimit: 1 } }); await requests.initialize();
      await requests.dispatch(requests.request());
      denied(await requests.first.reserve(requests.job, requests.request()), "request-limit");
      const tokens = fixture("token-limit", { job: { inputTokenLimit: 1, outputTokenLimit: 1 } }); await tokens.initialize();
      denied(await tokens.first.reserve(tokens.job, tokens.request({ maximum: { requests: 1, inputTokens: 2, outputTokens: 0, billedUnits: 0 } })), "token-limit");
      const units = fixture("unit-limit", { job: { billedUnitLimit: 1 } }); await units.initialize();
      denied(await units.first.reserve(units.job, units.request({ maximum: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 2 } })), "billed-unit-limit");
      const time = fixture("time-limit", { job: { timeLimitMs: 1000, fallbackReserveMs: 0 } }); await time.initialize();
      denied(await time.first.reserve(time.job, time.request({ timeoutMs: 1001 })), "time-limit");
      const fallback = fixture("fallback-time", { job: { timeLimitMs: 2000, fallbackReserveMs: 1500 } }); await fallback.initialize();
      denied(await fallback.first.reserve(fallback.job, fallback.request()), "fallback-time-reserved");
      const deadline = fixture("timeout"); await deadline.initialize(); deadline.clock.now = deadline.job.deadlineAt;
      denied(await deadline.first.reserve(deadline.job, deadline.request()), "timeout");
    });

    await t.test("explicit queue priority grants the nearest kickoff before later fixtures and background work", async () => {
      const f = fixture("priority"); await f.initialize();
      const later = f.request({ priority: { kind: "fixture", kickoffAt: COST_NOW + 3_600_000 } });
      const earlier = f.request({ priority: { kind: "fixture", kickoffAt: COST_NOW + 1_800_000 } });
      const background = f.request();
      assert.equal((await f.first.queue(f.job, later)).status, "queued");
      assert.equal((await f.second.queue(f.job, earlier)).status, "queued");
      assert.equal((await f.first.queue(f.job, background)).status, "queued");
      denied(await f.second.reserve(f.job, background), "priority-wait");
      denied(await f.first.reserve(f.job, later), "priority-wait");
      const first = await f.reserve(earlier, f.second);
      assert.equal((await f.second.cancelBeforeDispatch(first)).status, "canceled");
      const second = await f.reserve(later);
      assert.equal((await f.first.cancelBeforeDispatch(second)).status, "canceled");
      await f.reserve(background, f.second);
    });

    await t.test("an unaffordable nearest kickoff remains audited without starving eligible queued work", async () => {
      const f = fixture("blocked-priority"); await f.initialize();
      const blockedJob = costJob(f.period, "blocked-priority-nearest", { costCapUsdPicos: 0n });
      const blocked = costRequest(blockedJob, "blocked-priority-nearest", { priority: { kind: "fixture", kickoffAt: COST_NOW + 1000 } });
      assert.equal((await f.first.queue(blockedJob, blocked)).status, "queued");
      denied(await f.first.reserve(blockedJob, blocked), "job-budget-exhausted");
      const eligible = f.request();
      const permit = await f.reserve(eligible, f.second);
      const state = await f.state();
      assert.equal(state.attempts.find((attempt) => attempt.request.attemptId === blocked.attemptId).state, "queued");
      assert.equal(state.attempts.find((attempt) => attempt.request.attemptId === permit.attemptId).state, "reserved");
      assert.equal((await f.first.summary()).liabilityUsdPicos, USD);
    });

    await t.test("observed billing overages block additional dispatch without hiding known cost", async () => {
      const f = fixture("billing-overage", { period: { capUsdPicos: USD } }); await f.initialize();
      const permit = await f.dispatch(f.request());
      const usage = costUsage(permit, "billing-overage", { invoicedUsdPicos: 2n * USD, observedUsdPicos: 2n * USD });
      const result = await f.first.reconcile(permit, usage);
      assert.equal(result.status, "recorded");
      assert.equal(result.liabilityUsdPicos, 2n * USD);
      const summary = await f.first.summary();
      assert.equal(summary.liabilityUsdPicos, 2n * USD);
      assert.equal(summary.overageBlocked, true);
      assert.equal(summary.remainingUsdPicos, 0n);
      denied(await f.second.reserve(f.job, f.request()), "budget-exhausted");
    });

    await t.test("corrupt JSON or native monetary projections cannot restore dispatch capacity", async () => {
      const f = fixture("projection-corruption", { period: { capUsdPicos: USD } }); await f.initialize();
      const permit = await f.dispatch(f.request());
      assert.equal((await f.first.reconcile(permit, costUsage(permit, "projection-corruption"))).status, "recorded");
      await firstDatabase.query((client) => client.$executeRaw`
        UPDATE CostBudgetAttempt SET liabilityAmount = 0
        WHERE accountId = ${f.period.accountId} AND category = ${f.period.category} AND id = ${permit.attemptId}
      `);
      denied(await f.second.summary(), "service-unavailable");
      denied(await f.second.reserve(f.job, f.request()), "service-unavailable");
      await firstDatabase.query((client) => client.$executeRaw`
        UPDATE CostBudgetAttempt SET liabilityAmount = 1, chargedRequests = 0
        WHERE accountId = ${f.period.accountId} AND category = ${f.period.category} AND id = ${permit.attemptId}
      `);
      denied(await f.second.jobSummary(f.job.jobId), "service-unavailable");
      await firstDatabase.query((client) => client.$executeRaw`
        UPDATE CostBudgetAttempt SET chargedRequests = 1, stateJson = JSON_SET(stateJson, '$.ledger.state', 'queued')
        WHERE accountId = ${f.period.accountId} AND category = ${f.period.category} AND id = ${permit.attemptId}
      `);
      denied(await f.second.summary(), "service-unavailable");
      denied(await f.second.reserve(f.job, f.request()), "service-unavailable");
    });

    await t.test("native period or job reassignment cannot hide a sealed reservation from cap accounting", async () => {
      const f = fixture("scope-corruption", { period: { capUsdPicos: USD, endsAt: COST_NOW + 10_000 } });
      await f.initialize();
      f.clock.now = COST_NOW + 10_000;
      const next = { ...f.period, periodId: costId("scope-corruption-next"), startsAt: f.period.endsAt, endsAt: f.period.endsAt + 10_000 };
      assert.equal((await f.first.initialize(next)).status, "initialized");
      const permit = await f.reserve(f.request());
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`
        UPDATE CostBudgetAttempt SET periodId = ${f.period.periodId}
        WHERE accountId = ${f.period.accountId} AND category = ${f.period.category} AND id = ${permit.attemptId}
      `), (error) => error.name === "DatabaseOperationError");
      assert.equal((await f.second.summary()).liabilityUsdPicos, USD);
      denied(await f.second.reserve(f.job, f.request()), "budget-exhausted");
      const otherJob = costJob(f.period, "scope-corruption-other", { costCapUsdPicos: USD });
      const otherRequest = costRequest(otherJob, "scope-corruption-other");
      assert.equal((await f.first.queue(otherJob, otherRequest)).status, "queued");
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`
        UPDATE CostBudgetAttempt SET jobId = ${otherJob.jobId}
        WHERE accountId = ${f.period.accountId} AND category = ${f.period.category} AND id = ${permit.attemptId}
      `), (error) => error.name === "DatabaseOperationError");
      assert.equal((await f.second.jobSummary(f.job.jobId)).liabilityUsdPicos, USD);
      denied(await f.second.reserve(f.job, f.request()), "budget-exhausted");
      const movedAccountId = costId("scope-corruption-other-account");
      const moved = createCostService({ accountId: movedAccountId, category: "ai", authority: syntheticCostAuthority(),
        rateFor: () => f.rate, store: controlledCostStore(secondDatabase, f.clock) });
      const movedPeriod = { ...next, accountId: movedAccountId };
      const movedJob = { ...f.job, accountId: movedAccountId };
      assert.equal((await moved.initialize(movedPeriod)).status, "initialized");
      assert.equal((await moved.queue(movedJob, costRequest(movedJob, "scope-corruption-moved-account"))).status, "queued");
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`
        UPDATE CostBudgetAttempt SET accountId = ${movedAccountId}
        WHERE accountId = ${f.period.accountId} AND category = ${f.period.category} AND id = ${permit.attemptId}
      `), (error) => error.name === "DatabaseOperationError");
      const research = createCostService({ accountId: f.period.accountId, category: "research", authority: syntheticCostAuthority(),
        rateFor: () => costRate("research"), store: controlledCostStore(secondDatabase, f.clock) });
      const researchPeriod = { ...next, category: "research" }, researchJob = { ...f.job, category: "research" };
      assert.equal((await research.initialize(researchPeriod)).status, "initialized");
      assert.equal((await research.queue(researchJob, costRequest(researchJob, "scope-corruption-moved-category"))).status, "queued");
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`
        UPDATE CostBudgetAttempt SET category = 'research'
        WHERE accountId = ${f.period.accountId} AND category = ${f.period.category} AND id = ${permit.attemptId}
      `), (error) => error.name === "DatabaseOperationError");
      assert.equal((await f.second.summary()).liabilityUsdPicos, USD);
      denied(await f.second.reserve(f.job, f.request()), "budget-exhausted");
    });

    await t.test("native uniqueness, restrictive foreign keys and exact nonnegative checks protect ledger writes", async () => {
      const f = fixture("database-constraints"); await f.initialize();
      const permit = await f.reserve(f.request());
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`
        UPDATE CostBudgetAttempt SET liabilityAmount = -0.000000000001
        WHERE accountId = ${f.period.accountId} AND category = ${f.period.category} AND id = ${permit.attemptId}
      `), (error) => error.name === "DatabaseOperationError");
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`
        UPDATE CostBudgetAttempt SET chargedRequests = 9007199254740992
        WHERE accountId = ${f.period.accountId} AND category = ${f.period.category} AND id = ${permit.attemptId}
      `), (error) => error.name === "DatabaseOperationError");
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`
        DELETE FROM CostBudgetJob WHERE accountId = ${f.period.accountId} AND category = ${f.period.category} AND id = ${f.job.jobId}
      `), (error) => error.name === "DatabaseOperationError");
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`
        UPDATE CostBudgetAttempt SET jobId = ${costId("missing-parent-job")}
        WHERE accountId = ${f.period.accountId} AND category = ${f.period.category} AND id = ${permit.attemptId}
      `), (error) => error.name === "DatabaseOperationError");
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`
        INSERT INTO CostBudgetJob (accountId, category, id, workKey, startsAt, deadlineAt, capAmount, stateJson)
        SELECT accountId, category, ${costId("duplicate-native-work")}, workKey, startsAt, deadlineAt, capAmount, stateJson
        FROM CostBudgetJob WHERE accountId = ${f.period.accountId} AND category = ${f.period.category} AND id = ${f.job.jobId}
      `), (error) => error.name === "DatabaseOperationError");
      const jobs = await firstDatabase.query((client) => client.$queryRaw`
        SELECT id FROM CostBudgetJob WHERE accountId = ${f.period.accountId} AND category = ${f.period.category} AND workKey = ${f.job.workKey}
      `);
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].id, f.job.jobId);
      assert.equal((await f.first.summary()).liabilityUsdPicos, USD);
    });

    await t.test("approved currency conversion rounds conservatively at twelve-decimal SQL precision", async () => {
      const f = fixture("exact-currency", { period: { capUsdPicos: 1n }, job: { costCapUsdPicos: 1n }, rate: {
        currency: "EUR", usdConversion: { numerator: "2", denominator: "1", evidenceRef: "synthetic-eur-usd-conversion" },
        rates: { requests: { amount: "0.000000000001", perUnits: 3 }, inputTokens: null, outputTokens: null, billedUnits: null } } });
      await f.initialize();
      const permit = await f.reserve(f.request());
      assert.equal(permit.maximumCostUsdPicos, 1n);
      assert.equal((await f.first.summary()).liabilityUsdPicos, 1n);
      const rows = await firstDatabase.query((client) => client.$queryRaw`
        SELECT CAST(maxCostAmount AS CHAR) AS maximum, CAST(liabilityAmount AS CHAR) AS liability
        FROM CostBudgetAttempt WHERE accountId = ${f.period.accountId} AND category = ${f.period.category} AND id = ${permit.attemptId}
      `);
      assert.equal(rows[0].maximum, "0.000000000001");
      assert.equal(rows[0].liability, "0.000000000001");
      denied(await f.second.reserve(f.job, f.request()), "budget-exhausted");
    });

    await t.test("AI, research and football quota remain independent under one shared account identity", async () => {
      const accountId = costId("shared-provider-account"), ai = fixture("independent-ai", { period: { accountId, capUsdPicos: USD } });
      const research = fixture("independent-research", { category: "research", period: { accountId, capUsdPicos: USD } });
      await ai.initialize(); await research.initialize();
      const quotaClock = { now: COST_NOW }, nativeQuotaStore = createMysqlQuotaStore(firstDatabase);
      const quotaStore = { transaction(id, operation) { return nativeQuotaStore.transaction(id,
        (transaction) => operation({ ...transaction, now: async () => quotaClock.now })); } };
      const quota = createQuotaLimiter({ accountId, store: quotaStore, verifyEvidence: () => true });
      const periodId = costId("independent-football-period");
      assert.equal((await quota.initialize({ accountId, periodId, startsAt: COST_NOW - 1000, endsAt: COST_NOW + 86_400_000,
        subscriptionExpiresAt: COST_NOW + 864_000_000, providerDailyLimit: 150_000, dailyRemaining: 150_000,
        secondLimit: 15, minuteLimit: 900, evidenceRef: "synthetic-independent-football" })).status, "initialized");
      await ai.dispatch(ai.request());
      denied(await ai.first.reserve(ai.job, ai.request()), "budget-exhausted");
      await research.dispatch(research.request());
      assert.equal((await ai.first.summary()).liabilityUsdPicos, USD);
      assert.equal((await research.first.summary()).liabilityUsdPicos, USD);
      const requestId = costId("independent-football-request");
      const football = await quota.reserve({ requestId, workKey: requestId, priority: "results-cutoff", deadlineAt: COST_NOW + 60_000, timeoutMs: 1000 });
      assert.equal(football.status, "reserved");
      assert.equal((await quota.claimLaunch(football.permit)).status, "claimed");
      const footballState = await quotaStore.transaction(accountId, (transaction) => transaction.period(periodId));
      assert.equal(footballState.used, 1);
      assert.equal((await ai.first.summary()).liabilityUsdPicos, USD);
      assert.equal((await research.first.summary()).liabilityUsdPicos, USD);
    });

    await t.test("unavailable accounting storage stops paid reservation with a safe reason", async () => {
      const f = fixture("unavailable"); await f.initialize();
      const unavailable = f.service(firstDatabase, { store: { async transaction() { throw new Error("mysql://secret-account:secret-password@private-target"); } } });
      const result = await unavailable.reserve(f.job, f.request());
      denied(result, "service-unavailable");
      assert.ok(!JSON.stringify(result).includes("secret"));
      assert.equal((await f.first.summary()).liabilityUsdPicos, 0n);
    });
  } finally {
    try { await Promise.all(databases.map((database) => database.disconnect())); }
    finally { await instance.stop(); }
  }
});
