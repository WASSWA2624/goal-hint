import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { createDatabase } from "../src/server/database/client.ts";
import { createFootballCatalogStore } from "../src/server/football/catalog-mysql-store.ts";
import { createFootballCatalogImporter } from "../src/server/football/catalog-service.ts";
import { createMysqlEvidenceStore } from "../src/server/evidence/evidence-mysql-store.ts";
import { buildEvidenceSnapshot } from "../src/server/evidence/evidence-snapshot.ts";
import { evidenceFingerprint, evidenceSerialize } from "../src/server/evidence/evidence-input.ts";
import { MysqlServerUnavailableError, startIsolatedMysql } from "./helpers/mysql-instance.mjs";
import { CATALOG_NOW, catalogFixture, catalogRequest, createSyntheticCatalogAdapter } from "./helpers/catalog-fixtures.mjs";
import { EVIDENCE_NOW, evidenceAuthority, evidenceContext, evidenceHash, evidencePolicy, evidenceSource } from "./helpers/evidence-fixtures.mjs";

const execFileAsync = promisify(execFile);
const workspace = fileURLToPath(new URL("../", import.meta.url));
const databaseScript = fileURLToPath(new URL("../scripts/database.mjs", import.meta.url));
const catalogTables = ["FootballCatalogLock", "FootballTeam", "FootballTeamProvider", "FootballTeamAlias",
  "FootballCompetition", "FootballCompetitionProvider", "FootballCompetitionAlias", "FootballSeason",
  "FootballFixture", "FootballFixtureAudit", "FootballImport", "FootballIdentityReview"];
const evidenceTables = ["EvidenceSourceVersion", "FixtureEvidenceSnapshot", "FixtureEvidenceSnapshotSource"];

function isolatedEnvironment(applicationUrl, migrationUrl) {
  const env = { ...process.env };
  const credentials = new Set(["DATABASE_URL", "TEST_DATABASE_URL", "MIGRATION_DATABASE_URL", "API_FOOTBALL_KEY", "AI_API_KEY", "RESEARCH_API_KEY"]);
  for (const key of Object.keys(env)) if (key.startsWith("GOAL_HINT_") || key.startsWith("NEXT_PUBLIC_") || credentials.has(key)) delete env[key];
  return { ...env, NODE_ENV: "test", DEBUG: "", GOAL_HINT_OPERATION_SCOPE: "disabled", GOAL_HINT_DATABASE_ENABLED: "true",
    TEST_DATABASE_URL: applicationUrl, MIGRATION_DATABASE_URL: migrationUrl, GOAL_HINT_DATABASE_CONNECTION_MODE: "direct",
    GOAL_HINT_DATABASE_POOL_LIMIT: "4", GOAL_HINT_DATABASE_TLS_MODE: "disabled", GOAL_HINT_DATABASE_CONNECT_TIMEOUT_MS: "1000",
    GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS: "10000" };
}
function catalogAuthority() {
  return { authorize() {}, authorizeMapping() {}, verifyRetention: () => true, verifyObservation: () => true,
    verifyLogo: () => true, verifyRegulationScore: () => true, verifyMapping: () => false,
    regulationEvidenceRef: () => "synthetic-verified-regulation-source", verifyKnownSubset: () => true };
}

test("immutable fixture evidence on isolated genuine MySQL", { timeout: 300000 }, async (t) => {
  let instance;
  try { instance = await startIsolatedMysql(); }
  catch (error) {
    if (!(error instanceof MysqlServerUnavailableError)) throw error;
    t.skip(`${error.message} Database-backed fixture evidence acceptance remains pending.`);
    return;
  }
  t.diagnostic(`Owned throwaway server: ${instance.version}. Evidence, permissions and clocks are synthetic; no licensed research or provider request is made.`);
  t.beforeEach(() => instance.assertOwnership());
  const migrationPassword = randomBytes(24).toString("hex"), applicationPassword = randomBytes(24).toString("hex");
  const migrationUrl = `mysql://evidence_migration:${migrationPassword}@127.0.0.1:${instance.port}/goal_hint_test`;
  const applicationUrl = `mysql://evidence_application:${applicationPassword}@127.0.0.1:${instance.port}/goal_hint_test`;
  const env = isolatedEnvironment(applicationUrl, migrationUrl), databases = [];
  function replica() { const database = createDatabase(parseRuntimePolicy(env)); databases.push(database); return database; }
  try {
    await instance.executeAdmin(`
      CREATE USER 'evidence_migration'@'127.0.0.1' IDENTIFIED BY '${migrationPassword}';
      CREATE USER 'evidence_application'@'127.0.0.1' IDENTIFIED BY '${applicationPassword}';
      GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES ON goal_hint_test.* TO 'evidence_migration'@'127.0.0.1';
    `);
    await execFileAsync(process.execPath, ["--conditions=react-server", databaseScript, "deploy"],
      { cwd: workspace, env, windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
    await instance.executeAdmin(catalogTables.map((table) =>
      `GRANT SELECT, INSERT, UPDATE, DELETE ON goal_hint_test.${table} TO 'evidence_application'@'127.0.0.1';`).join("\n"));
    await instance.executeAdmin(evidenceTables.map((table) =>
      `GRANT SELECT, INSERT ON goal_hint_test.${table} TO 'evidence_application'@'127.0.0.1';`).join("\n"));
    const firstDatabase = replica(), secondDatabase = replica();
    const firstCatalog = createFootballCatalogStore(firstDatabase, { clock: { now: () => CATALOG_NOW + 60_000 } });
    const secondCatalog = createFootballCatalogStore(secondDatabase, { clock: { now: () => CATALOG_NOW + 60_000 } });
    const firstStore = createMysqlEvidenceStore(firstDatabase, { catalog: firstCatalog });
    const secondStore = createMysqlEvidenceStore(secondDatabase, { catalog: secondCatalog });
    const authority = evidenceAuthority(), policy = evidencePolicy();

    async function seed(id, overrides = {}, now = CATALOG_NOW) {
      const synthetic = createSyntheticCatalogAdapter({ rows: [catalogFixture(id, overrides)] });
      synthetic.clock.value = now;
      const importer = createFootballCatalogImporter({ adapter: synthetic.adapter, store: firstCatalog,
        authority: catalogAuthority(), clock: { now: () => now } });
      assert.equal((await importer.import(catalogRequest({ kind: "fixtures", query: { fixtureId: id } }, now))).status, "complete");
      return firstCatalog.fixtureByProviderId(id);
    }
    function prepared(context, sources = [evidenceSource(context)], approved = authority) {
      return buildEvidenceSnapshot({ context, policy, sources }, approved);
    }
    const request = () => evidenceHash(randomUUID());
    const fingerprint = (context) => evidenceFingerprint({ context, policy, selection: "synthetic-explicit-evidence-request" });
    const fixture = await seed(101), context = evidenceContext(fixture);

    await t.test("migration privileges, schema drift and evidence-only incremental storage", async () => {
      assert.equal(await firstDatabase.readiness(), "ready");
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`CREATE TABLE forbidden_evidence_ddl (id INT PRIMARY KEY)`),
        (error) => error.name === "DatabaseOperationError");
      await assert.rejects(firstDatabase.query((client) => client.$queryRaw`SELECT migration_name FROM _prisma_migrations`),
        (error) => error.name === "DatabaseOperationError");
      await execFileAsync(process.execPath, ["--conditions=react-server", databaseScript, "verify"],
        { cwd: workspace, env, windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
      const columns = await firstDatabase.query((client) => client.$queryRaw`
        SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('EvidenceSourceVersion', 'FixtureEvidenceSnapshot', 'FixtureEvidenceSnapshotSource')`);
      assert.ok(columns.some((column) => column.COLUMN_NAME === "metadataJson"));
      assert.ok(columns.every((column) => !/articleBody|rawBody|prompt|credential|apiKey/iu.test(column.COLUMN_NAME)));
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`UPDATE FixtureEvidenceSnapshot SET sufficient = false`),
        (error) => error.name === "DatabaseOperationError");
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`DELETE FROM EvidenceSourceVersion`),
        (error) => error.name === "DatabaseOperationError");
      const invented = await firstDatabase.query((client) => client.$queryRaw`
        SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('AnalysisCycle', 'AnalysisRun')`);
      assert.equal(invented.length, 0);
    });

    await t.test("concurrent replicas record one immutable request and one source version", async () => {
      const snapshot = prepared(context), id = request(), fp = fingerprint(context);
      const records = await Promise.all(Array.from({ length: 8 }, (_, index) =>
        (index % 2 ? firstStore : secondStore).save(id, fp, snapshot, authority)));
      assert.ok(records.every((record) => record.snapshot.hash === snapshot.hash && record.requestFingerprint === fp));
      const rows = await firstDatabase.query((client) => client.$queryRaw`SELECT requestId FROM FixtureEvidenceSnapshot WHERE requestId = ${id}`);
      assert.equal(rows.length, 1);
      const sourceRows = await firstDatabase.query((client) => client.$queryRaw`SELECT id FROM EvidenceSourceVersion WHERE id = ${snapshot.sources[0].id}`);
      assert.equal(sourceRows.length, 1);
      assert.deepEqual(await secondStore.find(id), { requestFingerprint: fp, snapshot });
    });

    await t.test("identical content supports distinct explicit request IDs without duplicating source versions", async () => {
      const snapshot = prepared(context), firstId = request(), secondId = request(), fp = fingerprint(context);
      await Promise.all([firstStore.save(firstId, fp, snapshot, authority), secondStore.save(secondId, fp, snapshot, authority)]);
      assert.equal((await firstStore.find(firstId)).snapshot.hash, (await secondStore.find(secondId)).snapshot.hash);
      const sources = await firstDatabase.query((client) => client.$queryRaw`SELECT id FROM EvidenceSourceVersion WHERE id = ${snapshot.sources[0].id}`);
      assert.equal(sources.length, 1);
    });

    await t.test("request IDs cannot be rebound to different fingerprints or normalized facts", async () => {
      const id = request(), snapshot = prepared(context), fp = fingerprint(context);
      await firstStore.save(id, fp, snapshot, authority);
      await assert.rejects(secondStore.save(id, evidenceHash("changed-request"), snapshot, authority),
        (error) => error.reason === "conflicting-request");
      const changed = prepared(context, [evidenceSource(context, { version: "synthetic-football-v2", claims: [
        { ...snapshot.sources[0].claims[0], value: { role: "neutral", neutral: true } } ] })]);
      await assert.rejects(secondStore.save(id, fp, changed, authority), (error) => error.reason === "conflicting-request");
      assert.equal((await firstStore.find(id)).snapshot.hash, snapshot.hash);
    });

    await t.test("a new source version retains original attribution, claims and retrieval times", async () => {
      const originalSource = evidenceSource(context, { sourceKey: evidenceHash("versioned-source") });
      const original = prepared(context, [originalSource]), originalId = request();
      await firstStore.save(originalId, fingerprint(context), original, authority);
      const newerSource = evidenceSource(context, { ...originalSource, version: "synthetic-football-v2", retrievedAt: context.cutoffAt,
        title: "Synthetic updated venue observation", claims: [{ ...originalSource.claims[0], summary: "Synthetic corrected observation." }] });
      const newer = prepared(context, [newerSource]), newerId = request();
      await secondStore.save(newerId, fingerprint(context), newer, authority);
      const retained = (await secondStore.find(originalId)).snapshot;
      assert.equal(retained.sources[0].retrievedAt, originalSource.retrievedAt);
      assert.equal(retained.sources[0].title, originalSource.title);
      assert.notEqual(retained.sources[0].id, newer.sources[0].id);
      const versions = await firstDatabase.query((client) => client.$queryRaw`SELECT id FROM EvidenceSourceVersion WHERE sourceKey = ${originalSource.sourceKey}`);
      assert.equal(versions.length, 2);
    });

    await t.test("sources unavailable at cutoff are excluded before incremental storage", async () => {
      const future = evidenceSource(context, { sourceKey: evidenceHash("future-source"), retrievedAt: context.cutoffAt + 1 });
      const snapshot = prepared(context, [evidenceSource(context), future]), id = request();
      assert.ok(snapshot.exclusions.some((entry) => entry.reason === "future"));
      await firstStore.save(id, fingerprint(context), snapshot, authority);
      assert.equal((await firstStore.find(id)).snapshot.sources.length, 1);
      const leaked = await firstDatabase.query((client) => client.$queryRaw`SELECT id FROM EvidenceSourceVersion WHERE id = ${future.id}`);
      assert.equal(leaked.length, 0);
    });

    await t.test("wrong fixture and team sources never enter snapshot links or retained source versions", async () => {
      const otherFixture = await seed(102, { homeId: 30, awayId: 40 });
      const other = evidenceContext(otherFixture, { home: { teamId: otherFixture.homeTeamId, externalId: 30 },
        away: { teamId: otherFixture.awayTeamId, externalId: 40 } });
      const wrongFixture = evidenceSource(other), wrongTeam = evidenceSource(context, { binding: { homeTeamId: randomUUID() } });
      const snapshot = prepared(context, [evidenceSource(context), wrongFixture, wrongTeam]), id = request();
      assert.ok(snapshot.exclusions.some((entry) => entry.reason === "wrong-fixture"));
      assert.ok(snapshot.exclusions.some((entry) => entry.reason === "wrong-team"));
      await firstStore.save(id, fingerprint(context), snapshot, authority);
      const retained = await firstDatabase.query((client) => client.$queryRaw`SELECT id FROM EvidenceSourceVersion WHERE id IN (${wrongFixture.id}, ${wrongTeam.id})`);
      assert.equal(retained.length, 0);
    });

    await t.test("cross-fixture source attachment fails both composite foreign key bindings", async () => {
      const otherFixture = await firstCatalog.fixtureByProviderId(102), other = evidenceContext(otherFixture,
        { home: { teamId: otherFixture.homeTeamId, externalId: 30 }, away: { teamId: otherFixture.awayTeamId, externalId: 40 } });
      const snapshot = prepared(context), otherSnapshot = prepared(other), id = request(), otherId = request();
      await firstStore.save(id, fingerprint(context), snapshot, authority);
      await secondStore.save(otherId, fingerprint(other), otherSnapshot, authority);
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`INSERT INTO FixtureEvidenceSnapshotSource
        (requestId, sourceVersionId, fixtureId, homeTeamId, awayTeamId, fixtureVersion)
        VALUES (${id}, ${otherSnapshot.sources[0].id}, ${context.fixtureId}, ${context.home.teamId}, ${context.away.teamId}, ${context.fixtureVersion})`),
      (error) => error.name === "DatabaseOperationError");
      assert.equal((await firstStore.find(id)).snapshot.sources.length, 1);
    });

    await t.test("canonical fixture changes before commit reject collected context while archived snapshots stay reproducible", async () => {
      const original = prepared(context), originalId = request();
      await firstStore.save(originalId, fingerprint(context), original, authority);
      const changed = await seed(101, { kickoff: "2026-10-10T12:00:00.000Z" }, CATALOG_NOW + 1000);
      assert.ok(changed.dataVersion > context.fixtureVersion);
      const id = request();
      await assert.rejects(secondStore.save(id, fingerprint(context), original, authority), (error) => error.reason === "fixture-changed");
      assert.equal(await firstStore.find(id), null);
      assert.equal(evidenceSerialize((await secondStore.find(originalId)).snapshot), evidenceSerialize(original));
      assert.equal((await secondStore.find(originalId)).snapshot.context.kickoffAt, context.kickoffAt);
    });

    await t.test("unregistered, cloned and wrong-authority snapshots cannot create records", async () => {
      const current = evidenceContext(await firstCatalog.fixtureByProviderId(101)), snapshot = prepared(current), id = request();
      await assert.rejects(firstStore.save(id, fingerprint(current), structuredClone(snapshot), authority), (error) => error.reason === "not-authorized");
      await assert.rejects(firstStore.save(id, fingerprint(current), snapshot, evidenceAuthority()), (error) => error.reason === "not-authorized");
      assert.equal(await firstStore.find(id), null);
    });

    await t.test("revocation after a source insert rolls source versions, snapshot and links back together", async () => {
      const current = evidenceContext(await firstCatalog.fixtureByProviderId(101));
      let approved = true, inserted = false;
      const scopedAuthority = evidenceAuthority({ verifyReuse: () => approved });
      const source = evidenceSource(current, { sourceKey: evidenceHash("revoked-during-write-source") });
      const snapshot = prepared(current, [source], scopedAuthority), id = request();
      const revokingCatalog = { ...firstCatalog, withFixtureTransaction(fixtureId, callback) {
        return firstCatalog.withFixtureTransaction(fixtureId, (transaction, fixtureSnapshot) => callback(new Proxy(transaction, {
          get(target, property) {
            if (property !== "$executeRaw") return Reflect.get(target, property);
            return async (...args) => {
              const result = await target.$executeRaw(...args);
              if (String(args[0]).includes("INSERT INTO EvidenceSourceVersion")) { inserted = true; approved = false; }
              return result;
            };
          },
        }), fixtureSnapshot));
      } };
      const revoking = createMysqlEvidenceStore(firstDatabase, { catalog: revokingCatalog });
      await assert.rejects(revoking.save(id, fingerprint(current), snapshot, scopedAuthority), (error) => error.reason === "not-authorized");
      assert.equal(inserted, true);
      assert.equal(await secondStore.find(id), null);
      const orphan = await firstDatabase.query((client) => client.$queryRaw`SELECT id FROM EvidenceSourceVersion WHERE id = ${source.id}`);
      assert.equal(orphan.length, 0);
    });

    await t.test("explicit nullable cycle/run references persist without fabricating future lifecycle records", async () => {
      const fixtureNow = await firstCatalog.fixtureByProviderId(101), current = evidenceContext(fixtureNow), id = request();
      await firstStore.save(id, fingerprint(current), prepared(current), authority);
      assert.equal((await secondStore.find(id)).snapshot.context.cycleId, null);
      assert.equal((await secondStore.find(id)).snapshot.context.runId, null);
      const linked = evidenceContext(fixtureNow, { cycleId: randomUUID(), runId: randomUUID() }), linkedId = request();
      await firstStore.save(linkedId, fingerprint(linked), prepared(linked), authority);
      assert.equal((await secondStore.find(linkedId)).snapshot.context.runId, linked.runId);
    });

    await t.test("fixture versions retain exact values beyond JavaScript safe integers", async () => {
      const fixtureNow = await firstCatalog.fixtureByProviderId(101), large = 9_007_199_254_740_993n;
      await firstDatabase.query((client) => client.footballFixture.update({ where: { id: fixtureNow.id }, data: { dataVersion: large } }));
      const current = evidenceContext(await firstCatalog.fixtureByProviderId(101)), id = request(), snapshot = prepared(current);
      await firstStore.save(id, fingerprint(current), snapshot, authority);
      assert.equal((await secondStore.find(id)).snapshot.context.fixtureVersion, large);
      assert.equal((await secondStore.find(id)).snapshot.sources[0].binding.fixtureVersion, large);
    });

    await t.test("storage checksum rejects changed source content without exposing copied text", async () => {
      const current = evidenceContext(await firstCatalog.fixtureByProviderId(101));
      const source = evidenceSource(current, { sourceKey: evidenceHash("corrupted-source") }), id = request();
      await firstStore.save(id, fingerprint(current), prepared(current, [source]), authority);
      await instance.executeAdmin(`UPDATE EvidenceSourceVersion SET metadataJson = JSON_SET(metadataJson,
        '$.title', 'synthetic private changed title') WHERE id = '${source.id}'`);
      await assert.rejects(secondStore.find(id), (error) => error.reason === "invalid-state" && !error.message.includes("synthetic private changed title"));
    });

    await t.test("native source metadata cannot disagree with an otherwise intact source version", async () => {
      const current = evidenceContext(await firstCatalog.fixtureByProviderId(101));
      const source = evidenceSource(current, { sourceKey: evidenceHash("corrupted-native-source-projection") }), id = request();
      await firstStore.save(id, fingerprint(current), prepared(current, [source]), authority);
      await instance.executeAdmin(`UPDATE EvidenceSourceVersion SET title = 'synthetic changed native title' WHERE id = '${source.id}'`);
      await assert.rejects(secondStore.find(id), (error) => error.reason === "invalid-state");
    });

    await t.test("native chronology and version checks reject contradictory inserts", async () => {
      const current = evidenceContext(await firstCatalog.fixtureByProviderId(101)), source = evidenceSource(current), id = request();
      await firstStore.save(id, fingerprint(current), prepared(current, [source]), authority);
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`INSERT INTO FixtureEvidenceSnapshot
        (requestId, requestFingerprint, contentHash, fixtureId, homeTeamId, awayTeamId, fixtureVersion, analysisAt, cutoffAt, kickoffAt,
          cycleId, runId, policyVersion, sufficient, integrity, snapshotJson)
        SELECT ${request()}, requestFingerprint, contentHash, fixtureId, homeTeamId, awayTeamId, fixtureVersion, kickoffAt, cutoffAt, kickoffAt,
          cycleId, runId, policyVersion, sufficient, integrity, snapshotJson FROM FixtureEvidenceSnapshot WHERE requestId = ${id}`),
      (error) => error.name === "DatabaseOperationError");
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`INSERT INTO FixtureEvidenceSnapshot
        (requestId, requestFingerprint, contentHash, fixtureId, homeTeamId, awayTeamId, fixtureVersion, analysisAt, cutoffAt, kickoffAt,
          cycleId, runId, policyVersion, sufficient, integrity, snapshotJson)
        SELECT ${request()}, requestFingerprint, contentHash, fixtureId, homeTeamId, awayTeamId, 0, analysisAt, cutoffAt, kickoffAt,
          cycleId, runId, policyVersion, sufficient, integrity, snapshotJson FROM FixtureEvidenceSnapshot WHERE requestId = ${id}`),
      (error) => error.name === "DatabaseOperationError");
    });

    await t.test("snapshot checksum covers normalized JSON, request identity and request fingerprint", async () => {
      const current = evidenceContext(await firstCatalog.fixtureByProviderId(101)), snapshot = prepared(current), id = request();
      await firstStore.save(id, fingerprint(current), snapshot, authority);
      await instance.executeAdmin(`UPDATE FixtureEvidenceSnapshot SET requestFingerprint = '${evidenceHash("corrupted-request-fingerprint")}' WHERE requestId = '${id}'`);
      await assert.rejects(secondStore.find(id), (error) => error.reason === "invalid-state");
      const secondId = request();
      await firstStore.save(secondId, fingerprint(current), snapshot, authority);
      await instance.executeAdmin(`UPDATE FixtureEvidenceSnapshot SET snapshotJson = JSON_SET(snapshotJson,
        '$.coverage.sufficient', false) WHERE requestId = '${secondId}'`);
      await assert.rejects(secondStore.find(secondId), (error) => error.reason === "invalid-state");
    });

    await t.test("source and fixture foreign keys preserve reproducible archives against deletions", async () => {
      const current = evidenceContext(await firstCatalog.fixtureByProviderId(101)), source = evidenceSource(current), id = request();
      await firstStore.save(id, fingerprint(current), prepared(current, [source]), authority);
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`DELETE FROM EvidenceSourceVersion WHERE id = ${source.id}`),
        (error) => error.name === "DatabaseOperationError");
      await assert.rejects(firstDatabase.query((client) => client.$executeRaw`DELETE FROM FootballFixture WHERE id = ${current.fixtureId}`),
        (error) => error.name === "DatabaseOperationError");
    });

    await t.test("closed storage fails safely and malformed request identities do not reach SQL", async () => {
      const closedDatabase = replica(), closedStore = createMysqlEvidenceStore(closedDatabase);
      await closedDatabase.disconnect();
      await assert.rejects(closedStore.find(request()), (error) => error.reason === "unavailable" && !error.message.includes(applicationPassword));
      await assert.rejects(firstStore.find("not-an-identity"), (error) => error.reason === "invalid-request");
      assert.equal(EVIDENCE_NOW, CATALOG_NOW);
    });
  } finally {
    try { await Promise.all(databases.map((database) => database.disconnect())); }
    finally { await instance.stop(); }
  }
});
