import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { getReportingDate } from "../src/domain/calendar.ts";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { createDatabase } from "../src/server/database/client.ts";
import { createFootballCatalogStore } from "../src/server/football/catalog-mysql-store.ts";
import { createFootballCatalogImporter } from "../src/server/football/catalog-service.ts";
import { validateCatalogBatch } from "../src/server/football/catalog-input.ts";
import { MysqlServerUnavailableError, startIsolatedMysql } from "./helpers/mysql-instance.mjs";
import { CATALOG_NOW, catalogFixture, catalogTeam, catalogCompetition, catalogRequest,
  catalogResponse, createSyntheticCatalogAdapter } from "./helpers/catalog-fixtures.mjs";

const execFileAsync = promisify(execFile);
const workspace = fileURLToPath(new URL("../", import.meta.url));
const databaseScript = fileURLToPath(new URL("../scripts/database.mjs", import.meta.url));
// Import receipts and audits are append-only, matching the application role.
const catalogAppendOnly = ['FootballFixtureAudit', 'FootballImport'];
const catalogTables = ["FootballCatalogLock", "FootballTeam", "FootballTeamProvider", "FootballTeamAlias",
  "FootballCompetition", "FootballCompetitionProvider", "FootballCompetitionAlias", "FootballSeason",
  "FootballFixture", "FootballIdentityReview", ...catalogAppendOnly];

function isolatedEnvironment(applicationUrl, migrationUrl) {
  const env = { ...process.env };
  const credentials = new Set(["DATABASE_URL", "TEST_DATABASE_URL", "MIGRATION_DATABASE_URL", "API_FOOTBALL_KEY", "AI_API_KEY", "RESEARCH_API_KEY"]);
  for (const key of Object.keys(env)) {
    if (key.startsWith("GOAL_HINT_") || key.startsWith("NEXT_PUBLIC_") || credentials.has(key)) delete env[key];
  }
  return { ...env, NODE_ENV: "test", DEBUG: "", GOAL_HINT_OPERATION_SCOPE: "disabled", GOAL_HINT_DATABASE_ENABLED: "true",
    TEST_DATABASE_URL: applicationUrl, MIGRATION_DATABASE_URL: migrationUrl,
    GOAL_HINT_DATABASE_CONNECTION_MODE: "direct", GOAL_HINT_DATABASE_POOL_LIMIT: "4",
    GOAL_HINT_DATABASE_TLS_MODE: "disabled", GOAL_HINT_DATABASE_CONNECT_TIMEOUT_MS: "1000",
    GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS: "10000" };
}

function syntheticAuthority(overrides = {}) {
  return { authorize() {}, authorizeMapping() {}, verifyRetention: () => true, verifyObservation: () => true,
    verifyLogo: () => true, verifyRegulationScore: () => true, verifyMapping: () => false,
    regulationEvidenceRef: () => "synthetic-verified-regulation-source", verifyKnownSubset: () => true, ...overrides };
}

function fixtureSelection(id) { return { kind: "fixtures", query: { fixtureId: id } }; }

test("canonical football catalog invariants on isolated genuine MySQL", { timeout: 300000 }, async (t) => {
  let instance;
  try { instance = await startIsolatedMysql(); }
  catch (error) {
    if (!(error instanceof MysqlServerUnavailableError)) throw error;
    t.skip(`${error.message} Database-backed catalog acceptance remains pending.`);
    return;
  }
  t.diagnostic(`Owned throwaway server: ${instance.version}. Provider bodies, clocks and permissions are synthetic; no provider or media request is made.`);
  t.beforeEach(() => instance.assertOwnership());
  const migrationPassword = randomBytes(24).toString("hex");
  const applicationPassword = randomBytes(24).toString("hex");
  const migrationUrl = `mysql://catalog_migration:${migrationPassword}@127.0.0.1:${instance.port}/goal_hint_test`;
  const applicationUrl = `mysql://catalog_application:${applicationPassword}@127.0.0.1:${instance.port}/goal_hint_test`;
  const env = isolatedEnvironment(applicationUrl, migrationUrl);
  const databases = [];
  function replica() {
    const database = createDatabase(parseRuntimePolicy(env));
    databases.push(database);
    return database;
  }
  try {
    await instance.executeAdmin(`
      CREATE USER 'catalog_migration'@'127.0.0.1' IDENTIFIED BY '${migrationPassword}';
      CREATE USER 'catalog_application'@'127.0.0.1' IDENTIFIED BY '${applicationPassword}';
      GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES, TRIGGER
        ON goal_hint_test.* TO 'catalog_migration'@'127.0.0.1';
    `);
    await execFileAsync(process.execPath, ["--conditions=react-server", databaseScript, "deploy"],
      { cwd: workspace, env, windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
    await instance.executeAdmin(catalogTables.map((table) =>
      `GRANT ${catalogAppendOnly.includes(table) ? 'SELECT, INSERT' : 'SELECT, INSERT, UPDATE, DELETE'} ON goal_hint_test.${table} TO 'catalog_application'@'127.0.0.1';`).join("\n"));
    const firstDatabase = replica(), secondDatabase = replica();
    const clock = { now: () => CATALOG_NOW + 60_000 };
    const firstStore = createFootballCatalogStore(firstDatabase, { clock });
    const secondStore = createFootballCatalogStore(secondDatabase, { clock });

    function operation(rows, { store = firstStore, authority = syntheticAuthority(), now = CATALOG_NOW,
      importerOptions = {}, ...adapterOptions } = {}) {
      const state = createSyntheticCatalogAdapter({ rows, ...adapterOptions });
      state.clock.value = now;
      const importer = createFootballCatalogImporter({ adapter: state.adapter, store, authority,
        clock: { now: () => state.clock.value }, ...importerOptions });
      return { ...state, importer, authority,
        async run(selection, overrides = {}) { return importer.import(catalogRequest(selection, state.clock.value, overrides)); } };
    }
    const fixture = (id) => firstDatabase.query((client) => client.footballFixture.findUnique({
      where: { provider_externalId: { provider: "api-football", externalId: BigInt(id) } },
      include: { homeTeam: true, awayTeam: true, season: { include: { competition: true } } } }));

    await t.test("migration and application credentials keep schema administration outside catalog imports", async () => {
      assert.equal(await firstDatabase.readiness(), "ready");
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`
        CREATE TABLE forbidden_catalog_ddl (id INT NOT NULL PRIMARY KEY) ENGINE=InnoDB
      `), (error) => error.name === "DatabaseOperationError");
      await assert.rejects(firstDatabase.query((client) => client.$queryRaw`SELECT migration_name FROM _prisma_migrations`),
        (error) => error.name === "DatabaseOperationError");
      await execFileAsync(process.execPath, ["--conditions=react-server", databaseScript, "verify"],
        { cwd: workspace, env, windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
      const columns = await firstDatabase.query((client) => client.$queryRaw`
        SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE ${"Football%"}
      `);
      assert.ok(columns.some((column) => column.COLUMN_NAME === "logoUrl" && column.DATA_TYPE === "varchar"));
      assert.ok(columns.every((column) => !/blob|binary/iu.test(column.DATA_TYPE)));
    });

    await t.test("concurrent repeated identities across competitions and seasons reuse canonical teams", async () => {
      const states = Array.from({ length: 8 }, (_, index) => operation([catalogFixture(2000 + index,
        { competitionId: 210 + index % 2, season: 2026 + index % 2, homeId: 2100, awayId: 2101 })],
      { store: index % 2 ? secondStore : firstStore }));
      const requests = states.map((_, index) => catalogRequest(fixtureSelection(2000 + index)));
      const results = await Promise.all(states.map((state, index) => state.importer.import(requests[index])));
      assert.ok(results.every((result) => result.status === "complete"));
      const rows = await Promise.all(states.map((_, index) => fixture(2000 + index)));
      assert.equal(new Set(rows.map((row) => row.homeTeamId)).size, 1);
      assert.equal(new Set(rows.map((row) => row.awayTeamId)).size, 1);
      const mappings = await firstDatabase.query((client) => client.footballTeamProvider.findMany({
        where: { provider: "api-football", externalId: { in: [2100n, 2101n] } } }));
      assert.equal(mappings.length, 2);
      assert.equal(new Set(rows.map((row) => row.seasonId)).size, 2);
      const repeated = await states[0].importer.import(requests[0]);
      assert.equal(repeated.id, results[0].id);
      assert.equal(states[0].network.length, 1, "a completed durable import ID must not repeat provider I/O");
      assert.equal((await fixture(2000)).dataVersion, rows[0].dataVersion);
      const aliases = await firstDatabase.query((client) => client.footballTeamAlias.count({ where: { teamId: rows[0].homeTeamId } }));
      assert.equal(aliases, 1);
    });

    await t.test("concurrent repeated fixture imports keep one identity and one version per material change", async () => {
      const states = Array.from({ length: 6 }, (_, index) => operation([catalogFixture(3600,
        { homeId: 3601, awayId: 3602, competitionId: 360 })], { store: index % 2 ? firstStore : secondStore }));
      const results = await Promise.all(states.map((state) => state.run(fixtureSelection(3600))));
      const row = await fixture(3600);
      assert.equal(await firstDatabase.query((client) => client.footballFixture.count({ where: {
        provider: "api-football", externalId: 3600n } })), 1);
      assert.equal(row.dataVersion, 1n);
      assert.equal(await firstDatabase.query((client) => client.footballFixtureAudit.count({ where: { fixtureId: row.id } })), 1);
      assert.equal(new Set(results.flatMap((result) => result.fixtureIds)).size, 1);
      const older = operation([catalogFixture(3600, { homeId: 3601, awayId: 3602, competitionId: 360, status: "PST" })],
        { store: firstStore, now: CATALOG_NOW + 1000 });
      const newer = operation([catalogFixture(3600, { homeId: 3601, awayId: 3602, competitionId: 360, status: "NS",
        kickoff: "2026-10-10T12:00:00.000Z" })], { store: secondStore, now: CATALOG_NOW + 2000 });
      await Promise.all([older.run(fixtureSelection(3600)), newer.run(fixtureSelection(3600))]);
      const latest = await fixture(3600);
      assert.equal(latest.status, "scheduled");
      assert.equal(latest.kickoff.toISOString(), "2026-10-10T12:00:00.000Z");
      assert.ok(latest.dataVersion > row.dataVersion);
      const audits = await firstDatabase.query((client) => client.footballFixtureAudit.findMany({
        where: { fixtureId: row.id }, orderBy: { dataVersion: "asc" } }));
      assert.equal(new Set(audits.map((audit) => audit.dataVersion)).size, audits.length);
      assert.equal(audits.at(-1).dataVersion, latest.dataVersion);
    });

    await t.test("same names remain separate identities and historical aliases support case-insensitive search", async () => {
      const first = operation([{ team: catalogTeam(2200, { name: "Synthetic Shared Name" }) }]);
      const second = operation([{ team: catalogTeam(2201, { name: "Synthetic Shared Name" }) }]);
      await first.run({ kind: "teams", query: { teamId: 2200 } });
      await second.run({ kind: "teams", query: { teamId: 2201 } });
      const mappings = await firstDatabase.query((client) => client.footballTeamProvider.findMany({ where: { externalId: { in: [2200n, 2201n] } } }));
      assert.equal(new Set(mappings.map((mapping) => mapping.teamId)).size, 2);
      const renamed = operation([{ team: catalogTeam(2200, { name: "Synthetic Renamed Club" }) }], { now: CATALOG_NOW + 1000 });
      await renamed.run({ kind: "teams", query: { teamId: 2200 } });
      const historical = await firstStore.searchTeams("sYnThEtIc ShArEd NaMe", { limit: 10 });
      assert.equal(historical.length, 2);
      const current = await firstStore.searchTeams("SYNTHETIC RENAMED", { limit: 10 });
      assert.equal(current.length, 1);
      assert.equal(current[0].id, mappings.find((mapping) => mapping.externalId === 2200n).teamId);
    });

    await t.test("provider mapping uniqueness and fixture foreign keys hold at the database boundary", async () => {
      const known = await fixture(2000);
      await assert.rejects(firstDatabase.query((client) => client.footballTeamProvider.create({ data: {
        provider: "api-football", externalId: 2100n, teamId: known.homeTeamId, mappedAt: new Date(CATALOG_NOW) } })),
      (error) => error.name === "DatabaseOperationError" && error.code === "constraint");
      await assert.rejects(firstDatabase.query((client) => client.footballFixture.create({ data: {
        id: randomUUID(), provider: "api-football", externalId: 2999n, homeTeamId: randomUUID(),
        awayTeamId: known.awayTeamId, seasonId: known.seasonId, retrievedAt: new Date(CATALOG_NOW) } })),
      (error) => error.name === "DatabaseOperationError" && error.code === "constraint");
      await assert.rejects(firstDatabase.query((client) => client.footballFixture.update({ where: { id: known.id },
        data: { awayTeamId: known.homeTeamId } })), (error) => error.name === "DatabaseOperationError");
      await assert.rejects(firstDatabase.query((client) => client.footballFixture.update({ where: { id: known.id },
        data: { regulationHome: 1 } })), (error) => error.name === "DatabaseOperationError");
      assert.equal((await fixture(2000)).awayTeamId, known.awayTeamId);
    });

    await t.test("alternate team IDs need attributable proof and conflicting canonical mappings remain unresolved", async () => {
      const proposed = { externalId: 2210, candidateExternalId: 2200, evidenceRef: null,
        sourceRef: "synthetic-identity-observation", observedAt: CATALOG_NOW + 1000 };
      const pending = await firstStore.registerTeamMapping(proposed, syntheticAuthority(), "synthetic-catalog-retention");
      assert.equal(pending.status, "unresolved");
      assert.equal(await firstDatabase.query((client) => client.footballTeamProvider.findUnique({ where: {
        provider_externalId: { provider: "api-football", externalId: 2210n } } })), null);
      const authority = syntheticAuthority({ verifyMapping: (mapping) => mapping.evidenceRef === "synthetic-verified-alternate-id" });
      const resolved = await secondStore.registerTeamMapping({ ...proposed,
        evidenceRef: "synthetic-verified-alternate-id" }, authority, "synthetic-catalog-retention");
      assert.equal(resolved.status, "resolved");
      const target = await firstDatabase.query((client) => client.footballTeamProvider.findUnique({ where: {
        provider_externalId: { provider: "api-football", externalId: 2200n } } }));
      const linked = await firstDatabase.query((client) => client.footballTeamProvider.findUnique({ where: {
        provider_externalId: { provider: "api-football", externalId: 2210n } } }));
      assert.equal(linked.teamId, target.teamId);
      assert.equal(linked.evidenceRef, "synthetic-verified-alternate-id");
      await firstStore.registerTeamMapping({ ...proposed, observedAt: CATALOG_NOW + 2000 },
        syntheticAuthority(), "synthetic-catalog-retention");
      await secondStore.registerTeamMapping({ ...proposed, observedAt: CATALOG_NOW,
        evidenceRef: "synthetic-older-mapping-proof" }, syntheticAuthority({ verifyMapping: () => true }), "synthetic-catalog-retention");
      const retainedReview = await firstDatabase.query((client) => client.footballIdentityReview.findUnique({ where: {
        provider_externalId_candidateExternalId: { provider: "api-football", externalId: 2210n, candidateExternalId: 2200n } } }));
      assert.equal(retainedReview.status, "resolved");
      assert.equal(retainedReview.evidenceRef, "synthetic-verified-alternate-id");
      assert.equal(retainedReview.observedAt.getTime(), CATALOG_NOW + 1000);
      await assert.rejects(firstStore.registerTeamMapping({ ...proposed, observedAt: clock.now() + 1,
        evidenceRef: "synthetic-verified-alternate-id" }, authority, "synthetic-catalog-retention"));
      const retainedMapping = await firstDatabase.query((client) => client.footballTeamProvider.findUnique({ where: {
        provider_externalId: { provider: "api-football", externalId: 2210n } } }));
      assert.equal(retainedMapping.teamId, target.teamId);
      assert.equal(retainedMapping.evidenceRef, "synthetic-verified-alternate-id");
      const separate = await firstDatabase.query((client) => client.footballTeamProvider.findUnique({ where: {
        provider_externalId: { provider: "api-football", externalId: 2201n } } }));
      const conflict = await firstStore.registerTeamMapping({ ...proposed, externalId: 2201,
        evidenceRef: "synthetic-verified-alternate-id" }, authority, "synthetic-catalog-retention");
      assert.equal(conflict.status, "unresolved");
      const preserved = await firstDatabase.query((client) => client.footballTeamProvider.findUnique({ where: {
        provider_externalId: { provider: "api-football", externalId: 2201n } } }));
      assert.equal(preserved.teamId, separate.teamId);
      const reviews = await firstDatabase.query((client) => client.footballIdentityReview.findMany({ where: {
        externalId: { in: [2210n, 2201n] } } }));
      assert.equal(reviews.length, 2);
      assert.equal(reviews.find((review) => review.externalId === 2201n).status, "pending");
    });

    await t.test("mapping operation and retention revocation leave no alternate identity or private review writes", async () => {
      const mapping = { externalId: 3800, candidateExternalId: 2200, evidenceRef: "synthetic-verified-alternate-id",
        sourceRef: "synthetic-identity-observation", observedAt: CATALOG_NOW + 1000 };
      await assert.rejects(firstStore.registerTeamMapping(mapping, syntheticAuthority({ authorizeMapping() {
        throw Error("synthetic private mapping authorization refusal");
      } }), "synthetic-catalog-retention"));
      for (const [index, revokedGate] of ["operation", "retention"].entries()) {
        let allowed = true, retained = true;
        const externalId = 3801 + index;
        const authority = syntheticAuthority({
          authorizeMapping() { if (!allowed) throw Error("synthetic revoked mapping approval"); },
          verifyRetention: () => retained,
          verifyMapping() { if (revokedGate === "operation") allowed = false; else retained = false; return true; },
        });
        await assert.rejects(secondStore.registerTeamMapping({ ...mapping, externalId }, authority, "synthetic-catalog-retention"));
        assert.equal(await firstDatabase.query((client) => client.footballTeamProvider.count({ where: { externalId: BigInt(externalId) } })), 0);
        assert.equal(await firstDatabase.query((client) => client.footballIdentityReview.count({ where: { externalId: BigInt(externalId) } })), 0);
      }
      assert.equal(await firstDatabase.query((client) => client.footballIdentityReview.count({ where: { externalId: 3800n } })), 0);
    });

    await t.test("partial and failed responses preserve known fixtures and record bounded import evidence", async () => {
      const initial = operation([catalogFixture(2300, { homeId: 2301, awayId: 2302, status: "LIVE" })]);
      await initial.run(fixtureSelection(2300));
      const previous = await fixture(2300);
      const incomplete = catalogFixture(2300, { homeId: 2301, awayId: 2302,
        fixture: { id: 2300, date: null, timestamp: null, timezone: "UTC", status: null },
        teams: { home: catalogTeam(2301, { name: null, code: null, country: null, national: null, logo: null }),
          away: catalogTeam(2302, { name: null, code: null, country: null, national: null, logo: null }) } });
      const partial = operation([incomplete], { now: CATALOG_NOW + 1000,
        respond: (url) => catalogResponse(url, [incomplete, { fixture: { id: "malformed" } }]) });
      const partialResult = await partial.run(fixtureSelection(2300));
      assert.equal(partialResult.status, "partial");
      const retained = await fixture(2300);
      assert.equal(retained.kickoff.toISOString(), previous.kickoff.toISOString());
      assert.equal(retained.status, "live");
      assert.equal(retained.homeTeam.name, previous.homeTeam.name);
      assert.equal(retained.homeTeam.logoUrl, previous.homeTeam.logoUrl);
      const failed = operation([], { now: CATALOG_NOW + 2000,
        respond: () => new Response("synthetic outage", { status: 503 }) });
      const failedResult = await failed.run(fixtureSelection(2300));
      assert.equal(failedResult.status, "failed");
      const afterOutage = await fixture(2300);
      assert.equal(afterOutage.status, "live");
      assert.equal(afterOutage.dataVersion, retained.dataVersion);
      const imports = await firstDatabase.query((client) => client.footballImport.findMany({ where: {
        id: { in: [partialResult.id, failedResult.id] } } }));
      assert.equal(imports.length, 2);
      const serialized = JSON.stringify(imports, (_key, value) => typeof value === "bigint" ? value.toString() : value);
      assert.ok(!serialized.includes("synthetic-catalog-private-key"));
      assert.ok(!serialized.includes("synthetic outage"));
      assert.ok(imports.every((row) => !JSON.stringify(row.provenance).includes("dailyRemaining")));
    });

    await t.test("older observations cannot roll back reliable fixture or shared team data", async () => {
      const newer = operation([catalogFixture(2400, { homeId: 2401, awayId: 2402, status: "PST",
        teams: { home: catalogTeam(2401, { name: "Synthetic New Name" }), away: catalogTeam(2402) } })],
      { now: CATALOG_NOW + 3000 });
      await newer.run(fixtureSelection(2400));
      const current = await fixture(2400);
      const older = operation([catalogFixture(2400, { homeId: 2401, awayId: 2402, status: "NS" })], { now: CATALOG_NOW + 2000 });
      await older.run(fixtureSelection(2400));
      const after = await fixture(2400);
      assert.equal(after.status, "postponed");
      assert.equal(after.homeTeam.name, "Synthetic New Name");
      // A previously unseen, attributable historical alias may expand search
      // coverage even though stale observations cannot replace current values.
      assert.ok(after.dataVersion >= current.dataVersion);
    });

    await t.test("missing provider update times retain a known watermark that rejects later stale updates", async () => {
      const authority = syntheticAuthority();
      async function observation(retrievedAt, providerUpdatedAt, name, status) {
        const state = createSyntheticCatalogAdapter({ rows: [catalogFixture(3900, { homeId: 3901, awayId: 3902,
          status, teams: { home: catalogTeam(3901, { name }), away: catalogTeam(3902) } })] });
        state.clock.value = retrievedAt;
        const request = catalogRequest(fixtureSelection(3900), retrievedAt);
        // These timestamp fields are explicitly synthetic future contract
        // evidence. The current direct-v3 adapter truthfully reports them null.
        const result = structuredClone(await state.adapter.evidence.fixtures(request.selection.query, request.bounds));
        result.provenance[0].providerUpdatedAt = providerUpdatedAt;
        for (const row of result.data) {
          for (const source of [row.source, row.homeTeam.source, row.awayTeam.source, row.competition.source]) source.providerUpdatedAt = providerUpdatedAt;
        }
        return firstStore.importBatch(validateCatalogBatch(request, result, authority, { now: () => retrievedAt }), authority);
      }
      const knownUpdate = CATALOG_NOW - 1000;
      await observation(CATALOG_NOW, knownUpdate, "Synthetic Current Watermark Name", "PST");
      await observation(CATALOG_NOW + 1000, null, "Synthetic Current Watermark Name", "PST");
      const current = await fixture(3900);
      assert.equal(current.providerUpdatedAt.getTime(), knownUpdate);
      assert.equal(current.homeTeam.providerUpdatedAt.getTime(), knownUpdate);
      await observation(CATALOG_NOW + 2000, knownUpdate - 1000, "Synthetic Stale Provider Name", "NS");
      const retained = await fixture(3900);
      assert.equal(retained.status, "postponed");
      assert.equal(retained.homeTeam.name, "Synthetic Current Watermark Name");
      assert.equal(retained.providerUpdatedAt.getTime(), knownUpdate);
      assert.equal(retained.homeTeam.providerUpdatedAt.getTime(), knownUpdate);
    });

    await t.test("only complete trusted responses establish empty dates in their exact EAT query scope", async () => {
      const selected = { kind: "fixtures", query: { date: "2026-10-12", competitionId: 300, season: 2026 } };
      const wholeDate = { kind: "fixtures", query: { date: "2026-10-12" } };
      assert.equal((await firstStore.dateCoverage(selected)).state, "unknown");
      await operation([]).run(selected);
      const scoped = await firstStore.dateCoverage(selected);
      assert.equal(scoped.state, "complete-empty");
      assert.equal(scoped.providerReturnedEmpty, true);
      assert.equal(scoped.knownFixtureIds.length, 0);
      assert.equal((await firstStore.dateCoverage(wholeDate)).state, "unknown");
      await operation([]).run(wholeDate);
      assert.equal((await firstStore.dateCoverage(wholeDate)).state, "complete-empty");
      const partialDate = { kind: "fixtures", query: { date: "2026-10-13" } };
      await operation([], { respond: (url) => catalogResponse(url, [], { paging: { current: 1, total: 2 } }) }).run(partialDate);
      assert.ok(["partial", "failed"].includes((await firstStore.dateCoverage(partialDate)).state));
      const failedDate = { kind: "fixtures", query: { date: "2026-10-14" } };
      await operation([], { respond: () => new Response("synthetic outage", { status: 503 }) }).run(failedDate);
      assert.equal((await firstStore.dateCoverage(failedDate)).state, "failed");
    });

    await t.test("durable import sequence resolves equal observation and receipt times without ordering opaque IDs", async () => {
      const selected = { kind: "fixtures", query: { date: "2026-10-18" } };
      const completed = await operation([]).run(selected);
      const failed = await operation([], { respond: () => new Response("synthetic outage", { status: 503 }) }).run(selected);
      assert.equal(completed.observedAt, failed.observedAt);
      assert.equal(completed.recordedAt, failed.recordedAt);
      const coverage = await firstStore.dateCoverage(selected);
      assert.equal(coverage.state, "failed");
      assert.equal(coverage.importId, failed.id);
      assert.equal(coverage.lastCompleteImportId, completed.id);
    });

    await t.test("provider disappearance preserves stored schedules and reports a complete response without an empty catalog", async () => {
      const selected = { kind: "fixtures", query: { date: "2026-10-15", competitionId: 310, season: 2026 } };
      await operation([catalogFixture(3100, { homeId: 3101, awayId: 3102, competitionId: 310,
        kickoff: "2026-10-15T10:00:00.000Z", status: "LIVE" })]).run(selected);
      const known = await fixture(3100);
      await operation([], { now: CATALOG_NOW + 1000 }).run(selected);
      const retained = await fixture(3100);
      assert.equal(retained.status, "live");
      assert.equal(retained.dataVersion, known.dataVersion);
      const coverage = await firstStore.dateCoverage(selected);
      assert.equal(coverage.state, "complete");
      assert.equal(coverage.providerReturnedEmpty, true);
      assert.deepEqual(coverage.knownFixtureIds, [known.id]);
    });

    await t.test("round-filtered date coverage retains the exact scope of stored fixture membership", async () => {
      const broad = { kind: "fixtures", query: { date: "2026-10-17", competitionId: 370, season: 2026 } };
      const roundOne = { kind: "fixtures", query: { ...broad.query, round: "Synthetic round 1" } };
      const roundTwo = { kind: "fixtures", query: { ...broad.query, round: "Synthetic round 2" } };
      await operation([catalogFixture(3700, { homeId: 3701, awayId: 3702, competitionId: 370,
        kickoff: "2026-10-17T10:00:00.000Z" })]).run(broad);
      assert.equal((await firstStore.dateCoverage(roundOne)).state, "unknown");
      await operation([]).run(roundTwo);
      const empty = await firstStore.dateCoverage(roundTwo);
      assert.equal(empty.state, "complete-empty");
      assert.equal(empty.knownFixtureIds.length, 0);
      assert.equal((await firstStore.dateCoverage(broad)).knownFixtureIds.length, 1);
      const stored = await fixture(3700);
      assert.equal(stored.round, "Synthetic round 1");
    });

    await t.test("explicit verified known subsets remain degraded and retain their import proof", async () => {
      const selected = { kind: "fixtures", query: { date: "2026-10-16", competitionId: 320, season: 2026 } };
      const raw = catalogFixture(3200, { homeId: 3201, awayId: 3202, competitionId: 320,
        kickoff: "2026-10-16T10:00:00.000Z" });
      const state = operation([raw], { respond: (url) => catalogResponse(url, [raw, { fixture: { id: "malformed" } }]) });
      const result = await state.run(selected, { knownSubset: { fixtureIds: [3200], evidenceRef: "synthetic-known-subset" } });
      assert.equal(result.status, "degraded");
      const coverage = await firstStore.dateCoverage(selected);
      assert.equal(coverage.state, "degraded");
      assert.equal(coverage.providerReturnedEmpty, false);
      assert.ok(coverage.knownFixtureIds.includes((await fixture(3200)).id));
      const audit = await firstDatabase.query((client) => client.footballImport.findUnique({ where: { id: result.id } }));
      assert.equal(audit.subsetEvidenceRef, "synthetic-known-subset");
      assert.ok(audit.rejectedCount > 0);
    });

    await t.test("shared team name and approved remote logo updates advance referencing fixture versions once", async () => {
      const initial = operation([catalogFixture(2500, { homeId: 2501, awayId: 2502 })]);
      const other = operation([catalogFixture(2503, { homeId: 2502, awayId: 2501, competitionId: 250 })]);
      await initial.run(fixtureSelection(2500));
      await other.run(fixtureSelection(2503));
      const before = await Promise.all([fixture(2500), fixture(2503)]);
      const url = "https://media.api-sports.io/football/teams/synthetic-new.png";
      const canonicalTeamId = before[0].homeTeamId;
      let coordinations = 0;
      const coordinated = createFootballCatalogStore(firstDatabase, { clock,
        async coordinateFixtureMutation({ before: snapshot, apply }) {
          const previous = before.find((row) => row.id === snapshot.id);
          const previousTeam = snapshot.homeTeam.id === canonicalTeamId ? snapshot.homeTeam : snapshot.awayTeam;
          assert.equal(snapshot.dataVersion, previous.dataVersion);
          assert.equal(previousTeam.name, "Synthetic club 2501");
          assert.equal(previousTeam.logoUrl, "https://media.api-sports.io/football/teams/2501.png");
          const updated = await apply();
          const updatedTeam = updated.homeTeam.id === canonicalTeamId ? updated.homeTeam : updated.awayTeam;
          assert.equal(updatedTeam.name, "Synthetic Updated Team");
          assert.equal(updatedTeam.logoUrl, url);
          coordinations++;
        } });
      const update = operation([{ team: catalogTeam(2501, { name: "Synthetic Updated Team", logo: url }) }],
        { now: CATALOG_NOW + 1000, store: coordinated });
      const result = await update.run({ kind: "teams", query: { teamId: 2501 } });
      const after = await Promise.all([fixture(2500), fixture(2503)]);
      assert.equal(after[0].homeTeam.id, after[1].awayTeam.id);
      assert.equal(after[0].homeTeam.logoUrl, url);
      assert.equal(after[1].awayTeam.name, "Synthetic Updated Team");
      after.forEach((row, index) => assert.equal(row.dataVersion, before[index].dataVersion + 1n));
      assert.equal(update.network.length, 1);
      assert.equal(update.network[0].url.pathname, "/teams");
      const audits = await firstDatabase.query((client) => client.footballFixtureAudit.findMany({ where: { importId: result.id } }));
      assert.equal(audits.length, 2);
      assert.ok(audits.every((audit) => audit.dataVersion === after.find((row) => row.id === audit.fixtureId).dataVersion));
      assert.equal(coordinations, 2);
      for (const audit of audits) {
        const changes = audit.changes.sharedIdentity.teams.find((team) => team.id === canonicalTeamId);
        assert.deepEqual(changes.fields.name, { before: "Synthetic club 2501", after: "Synthetic Updated Team" });
        assert.deepEqual(changes.fields.logoUrl, {
          before: "https://media.api-sports.io/football/teams/2501.png", after: url });
        assert.ok(changes.aliasesAdded.some((alias) => alias.name === "Synthetic Updated Team" &&
          alias.normalizedSearch === "synthetic updated team" && alias.observedAt === CATALOG_NOW + 1000));
      }
      update.clock.value += 1000;
      const unchanged = await update.run({ kind: "teams", query: { teamId: 2501 } });
      assert.equal((await fixture(2500)).dataVersion, after[0].dataVersion);
      assert.equal(await firstDatabase.query((client) => client.footballFixtureAudit.count({ where: { importId: unchanged.id } })), 0);
      assert.equal(coordinations, 2);
    });

    await t.test("competition metadata and seasons remain reusable canonical records", async () => {
      const state = operation([catalogCompetition(260, 2026)]);
      await state.run({ kind: "competitions", query: { competitionId: 260, season: 2026 } });
      const next = operation([catalogCompetition(260, 2027)], { now: CATALOG_NOW + 1000 });
      await next.run({ kind: "competitions", query: { competitionId: 260, season: 2027 } });
      const mapping = await firstDatabase.query((client) => client.footballCompetitionProvider.findUnique({
        where: { provider_externalId: { provider: "api-football", externalId: 260n } },
        include: { competition: { include: { seasons: true } } } }));
      assert.deepEqual(mapping.competition.seasons.map((season) => season.year).sort(), [2026, 2027]);
      assert.equal(mapping.competition.logoUrl, "https://media.api-sports.io/football/leagues/260.png");
    });

    await t.test("UTC instants and EAT dates agree across midnight and opaque fixture IDs remain unchanged", async () => {
      const state = operation([catalogFixture(2700, { homeId: 2701, awayId: 2702,
        kickoff: "2026-10-09T21:30:00.000Z" })]);
      await state.run(fixtureSelection(2700));
      const row = await fixture(2700);
      assert.equal(row.kickoff.toISOString(), "2026-10-09T21:30:00.000Z");
      assert.equal(row.eatDate.toISOString().slice(0, 10), "2026-10-10");
      const snapshot = await firstStore.fixtureByProviderId(2700);
      assert.equal(snapshot.id, row.id);
      assert.equal(snapshot.dataVersion, row.dataVersion);
    });

    await t.test("synthetic historical normalized instants reuse Kampala calendar offsets instead of today's three-hour offset", async () => {
      const kickoff = "1930-01-04T21:15:00.000Z";
      const state = createSyntheticCatalogAdapter({ rows: [catalogFixture(2703, { homeId: 2704, awayId: 2705 })] });
      const request = catalogRequest(fixtureSelection(2703));
      const result = structuredClone(await state.adapter.evidence.fixtures(request.selection.query, request.bounds));
      // The current direct-v3 adapter supports nonnegative epochs. This labeled
      // future contract observation tests only catalog/calendar compatibility.
      result.data[0].kickoff = Date.parse(kickoff);
      const authority = syntheticAuthority();
      await firstStore.importBatch(validateCatalogBatch(request, result, authority, { now: () => CATALOG_NOW }), authority);
      const row = await fixture(2703);
      assert.equal(row.kickoff.toISOString(), kickoff);
      assert.equal(row.eatDate.toISOString().slice(0, 10), getReportingDate(Date.parse(kickoff)));
      assert.equal(row.eatDate.toISOString().slice(0, 10), "1930-01-04");
    });

    await t.test("verified regulation scores remain distinct from extra-time and shootout totals", async () => {
      const raw = catalogFixture(3300, { homeId: 3301, awayId: 3302, status: "PEN",
        goals: { home: 7, away: 6 }, score: { fulltime: { home: 2, away: 1 },
          extratime: { home: 4, away: 4 }, penalty: { home: 7, away: 6 } } });
      await operation([raw]).run(fixtureSelection(3300));
      const verified = await fixture(3300);
      assert.equal(verified.status, "finished-penalties");
      assert.equal(verified.regulationHome, 2);
      assert.equal(verified.regulationAway, 1);
      assert.ok(verified.regulationEvidenceRef);
      assert.ok(verified.regulationVerifiedAt instanceof Date);
      raw.score.fulltime = null;
      await operation([raw], { now: CATALOG_NOW + 1000 }).run(fixtureSelection(3300));
      const retained = await fixture(3300);
      assert.equal(retained.regulationHome, 2);
      assert.equal(retained.regulationAway, 1);
      assert.equal(retained.dataVersion, verified.dataVersion);
      const unverified = operation([catalogFixture(3304, { homeId: 3301, awayId: 3302, status: "AET",
        goals: { home: 4, away: 3 }, score: { fulltime: { home: 1, away: 1 },
          extratime: { home: 4, away: 3 }, penalty: null } })], { verifyRegulationScore: () => false });
      await unverified.run(fixtureSelection(3304));
      const unknown = await fixture(3304);
      assert.equal(unknown.regulationHome, null);
      assert.equal(unknown.regulationAway, null);
    });

    await t.test("coordinated material changes share one transaction and coordinator failure rolls back catalog and audit writes", async () => {
      const initial = operation([catalogFixture(3400, { homeId: 3401, awayId: 3402 })]);
      await initial.run(fixtureSelection(3400));
      const before = await fixture(3400);
      let entered = 0;
      const coordinated = createFootballCatalogStore(firstDatabase, { clock,
        async coordinateFixtureMutation({ transaction, before: snapshot, apply }) {
          entered++;
          assert.equal(snapshot.id, before.id);
          assert.equal(snapshot.dataVersion, before.dataVersion);
          assert.ok(transaction.footballFixture);
          await apply();
          throw Error("synthetic coordinator rollback");
        } });
      const attempt = operation([catalogFixture(3400, { homeId: 3401, awayId: 3402, status: "PST" })],
        { store: coordinated, now: CATALOG_NOW + 1000 });
      const id = randomUUID();
      await assert.rejects(attempt.run(fixtureSelection(3400), { id }));
      assert.equal(entered, 1);
      const after = await fixture(3400);
      assert.equal(after.status, before.status);
      assert.equal(after.dataVersion, before.dataVersion);
      assert.equal(await firstDatabase.query((client) => client.footballImport.count({ where: { id } })), 0);
      assert.equal(await firstDatabase.query((client) => client.footballFixtureAudit.count({ where: { importId: id } })), 0);
      let committed = 0;
      const working = createFootballCatalogStore(secondDatabase, { clock,
        async coordinateFixtureMutation({ transaction, before: snapshot, apply }) {
          assert.equal(snapshot.id, before.id);
          const updated = await apply();
          const durable = await transaction.footballFixture.findUnique({ where: { id: before.id } });
          assert.equal(durable.dataVersion, updated.dataVersion);
          assert.equal(durable.status, "postponed");
          committed++;
        } });
      await operation([catalogFixture(3400, { homeId: 3401, awayId: 3402, status: "PST" })],
        { store: working, now: CATALOG_NOW + 1000 }).run(fixtureSelection(3400));
      assert.equal(committed, 1);
      assert.equal((await fixture(3400)).dataVersion, before.dataVersion + 1n);
    });

    await t.test("fixture transaction boundaries serialize later services and versions remain exact beyond JavaScript safe integers", async () => {
      await operation([catalogFixture(3500, { homeId: 3501, awayId: 3502 })]).run(fixtureSelection(3500));
      const before = await fixture(3500);
      const large = 9_007_199_254_740_993n;
      await firstDatabase.query((client) => client.footballFixture.update({ where: { id: before.id }, data: { dataVersion: large } }));
      let releaseFirst, firstEntered;
      const firstReady = new Promise((resolve) => { firstEntered = resolve; });
      const firstRelease = new Promise((resolve) => { releaseFirst = resolve; });
      const order = [];
      const first = firstStore.withFixtureTransaction(before.id, async (transaction, snapshot) => {
        assert.equal(snapshot.dataVersion, large);
        order.push("first-enter"); firstEntered();
        await firstRelease;
        await transaction.footballFixture.update({ where: { id: before.id }, data: { elapsedMinutes: 1 } });
        order.push("first-exit");
      });
      await firstReady;
      const second = secondStore.withFixtureTransaction(before.id, async (_transaction, snapshot) => {
        order.push("second-enter");
        assert.equal(snapshot.elapsedMinutes, 1);
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert.deepEqual(order, ["first-enter"]);
      releaseFirst();
      await Promise.all([first, second]);
      assert.deepEqual(order, ["first-enter", "first-exit", "second-enter"]);
      await operation([catalogFixture(3500, { homeId: 3501, awayId: 3502, status: "PST" })],
        { now: CATALOG_NOW + 1000 }).run(fixtureSelection(3500));
      assert.equal((await fixture(3500)).dataVersion, large + 1n);
      assert.equal((await firstStore.fixtureByProviderId(3500)).dataVersion, large + 1n);
    });

    await t.test("unawaited, repeated and omitted coordinated mutations roll back durable imports", async () => {
      const before = await fixture(3400);
      const coordinators = [
        async ({ apply }) => { void apply(); throw Error("synthetic unawaited coordinator failure"); },
        async ({ apply }) => { await apply(); await apply(); },
        async () => {},
      ];
      for (const coordinateFixtureMutation of coordinators) {
        const store = createFootballCatalogStore(firstDatabase, { clock, coordinateFixtureMutation });
        const state = operation([catalogFixture(3400, { homeId: 3401, awayId: 3402, status: "LIVE" })],
          { store, now: CATALOG_NOW + 2000 });
        const id = randomUUID();
        await assert.rejects(state.run(fixtureSelection(3400), { id }));
        const after = await fixture(3400);
        assert.equal(after.status, before.status);
        assert.equal(after.dataVersion, before.dataVersion);
        assert.equal(await firstDatabase.query((client) => client.footballImport.count({ where: { id } })), 0);
        assert.equal(await firstDatabase.query((client) => client.footballFixtureAudit.count({ where: { importId: id } })), 0);
      }
    });

    await t.test("safe provider identities beyond 32 bits persist exactly through the existing adapter contract", async () => {
      const externalId = 9_007_199_254_740_991;
      const homeId = 4_294_967_300, awayId = 4_294_967_301, competitionId = 4_294_967_302;
      await operation([catalogFixture(externalId, { homeId, awayId, competitionId })]).run(fixtureSelection(externalId));
      const stored = await fixture(externalId);
      assert.equal(stored.externalId, BigInt(externalId));
      const snapshot = await firstStore.fixtureByProviderId(externalId);
      assert.equal(snapshot.externalId, externalId);
      assert.equal(await firstDatabase.query((client) => client.footballTeamProvider.count({ where: {
        externalId: { in: [BigInt(homeId), BigInt(awayId)] } } })), 2);
    });

    await t.test("an import ID cannot be reused for a different provider selection", async () => {
      const state = operation([catalogFixture(2800, { homeId: 2801, awayId: 2802 })]);
      const id = randomUUID();
      await state.run(fixtureSelection(2800), { id });
      await assert.rejects(state.run(fixtureSelection(2803), { id }));
      assert.equal(state.network.length, 1);
      assert.equal(await firstDatabase.query((client) => client.footballImport.count({ where: { id } })), 1);
    });

    await t.test("the store accepts only frozen batches produced by the validated provider boundary", async () => {
      const state = createSyntheticCatalogAdapter({ rows: [catalogFixture(4000, { homeId: 4001, awayId: 4002 })] });
      const request = catalogRequest(fixtureSelection(4000));
      const result = await state.adapter.evidence.fixtures(request.selection.query, request.bounds);
      const authority = syntheticAuthority();
      const batch = validateCatalogBatch(request, result, authority, { now: () => CATALOG_NOW });
      assert.ok(Object.isFrozen(batch));
      assert.ok(Object.isFrozen(batch.rows.fixtures[0]));
      await assert.rejects(firstStore.importBatch(structuredClone(batch), authority));
      await assert.rejects(firstStore.importBatch(batch, syntheticAuthority({ verifyObservation: () => false })),
        (error) => error.name === "CatalogInputError" && error.reason === "invalid-result");
      assert.equal(await fixture(4000), null);
      assert.equal(await firstStore.findImport(request.id), null);
      await firstStore.importBatch(batch, authority);
      assert.ok(await fixture(4000));
    });

    await t.test("retention and observation authority are checked before provider I/O and before durable writes", async () => {
      const denied = operation([catalogFixture(2900, { homeId: 2901, awayId: 2902 })],
        { authority: syntheticAuthority({ verifyRetention: () => false }) });
      await assert.rejects(denied.run(fixtureSelection(2900)));
      assert.equal(denied.network.length, 0);
      assert.equal(await fixture(2900), null);
      let retained = true;
      const revoked = operation([catalogFixture(2910, { homeId: 2911, awayId: 2912 })], {
        authority: syntheticAuthority({ verifyRetention: () => retained }),
        respond(url) { retained = false; return catalogResponse(url, [catalogFixture(2910, { homeId: 2911, awayId: 2912 })]); } });
      await assert.rejects(revoked.run(fixtureSelection(2910)));
      assert.equal(revoked.network.length, 1);
      assert.equal(await fixture(2910), null);
      const untrusted = operation([catalogFixture(2920, { homeId: 2921, awayId: 2922 })],
        { authority: syntheticAuthority({ verifyObservation: () => false }) });
      await assert.rejects(untrusted.run(fixtureSelection(2920)),
        (error) => error.name === "CatalogInputError" && error.reason === "unverified-observation");
      assert.equal(await fixture(2920), null);
    });
  } finally {
    try { await Promise.all(databases.map((database) => database.disconnect())); }
    finally { await instance.stop(); }
  }
});
