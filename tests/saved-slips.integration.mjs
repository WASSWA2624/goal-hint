import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createSubscribers } from "../src/server/admin/subscribers.ts";
import { DatabaseOperationError } from "../src/server/database/client.ts";
import { createAccessCodes } from "../src/server/members/access-codes.ts";
import { createAuthenticatedTestSessions as createMemberSessions } from "./helpers/member-fixtures.mjs";
import { createSavedSlips } from "../src/server/slips/saved-slips.ts";
import { liveRecord } from "./helpers/live-refresh-fixtures.mjs";
import { evidenceFingerprint, evidenceSerialize } from "../src/server/evidence/evidence-input.ts";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { slipForecastFixture } from "./helpers/slip-forecast-fixtures.mjs";

test("saved slips persist privately, settle only completed fixtures and erase under narrow MySQL grants", { timeout: 180_000 }, async t => {
  let f;
  try { f = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => f.close());
  const { database, root, config } = f;
  let instant = Date.parse("2026-10-21T09:00:00Z");
  const now = () => instant;
  const phone = "256700003001", record = liveRecord(), fixtures = [randomUUID(), randomUUID()];
  const forecasts = fixtures.map(fixtureId => slipForecastFixture({ fixtureId, at: instant }));
  // Minimal catalog/result projections let the actual Prisma relation predicates run. Saved-slip tables use the real migration.
  await root.query(`
    CREATE TABLE FootballFixture (id CHAR(36) NOT NULL PRIMARY KEY, status VARCHAR(32) NOT NULL,
      activeCycleId CHAR(36) NULL, kickoff DATETIME(3) NULL, homeTeamId CHAR(36) NOT NULL, awayTeamId CHAR(36) NOT NULL,
      regulationHome INT UNSIGNED NULL, regulationAway INT UNSIGNED NULL,
      regulationVerifiedAt DATETIME(3) NULL, regulationEvidenceRef VARCHAR(512) NULL)
      ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
    CREATE TABLE PredictionCycle (id CHAR(36) NOT NULL PRIMARY KEY, fixtureId CHAR(36) NOT NULL,
      creationKey CHAR(64) NOT NULL, creationHash CHAR(64) NOT NULL, ordinal INT UNSIGNED NOT NULL,
      version INT UNSIGNED NOT NULL, scheduleVersion INT UNSIGNED NOT NULL, kickoffAt DATETIME(3) NOT NULL,
      cutoffAt DATETIME(3) NOT NULL, openedAt DATETIME(3) NOT NULL, state VARCHAR(16) NOT NULL,
      currentSetId CHAR(36) NULL, lockedSetId CHAR(36) NULL, closedAt DATETIME(3) NULL,
      lockedAt DATETIME(3) NULL, voidedAt DATETIME(3) NULL, voidReason VARCHAR(2000) NULL)
      ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
    CREATE TABLE PredictionSchedule (id CHAR(36) NOT NULL PRIMARY KEY, fixtureId CHAR(36) NOT NULL, cycleId CHAR(36) NOT NULL,
      version INT UNSIGNED NOT NULL, kickoffAt DATETIME(3) NOT NULL, cutoffAt DATETIME(3) NOT NULL, observedAt DATETIME(3) NOT NULL,
      providerObservedAt DATETIME(3) NULL, actualStartedAt DATETIME(3) NULL, actor VARCHAR(128) NOT NULL,
      reason VARCHAR(2000) NOT NULL, evidenceRef VARCHAR(512) NOT NULL, UNIQUE KEY(cycleId,version))
      ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
    CREATE TABLE PredictionSet (id CHAR(36) NOT NULL PRIMARY KEY, fixtureId CHAR(36) NOT NULL, fixtureVersion BIGINT UNSIGNED NOT NULL,
      cycleId CHAR(36) NOT NULL, runId CHAR(36) NOT NULL, runSequence BIGINT UNSIGNED NOT NULL, jobId CHAR(64) NOT NULL,
      fixtureRevision INT UNSIGNED NOT NULL, cycleRevision INT UNSIGNED NOT NULL, predecessorId CHAR(36) NULL,
      scheduleVersion INT UNSIGNED NOT NULL, modelVersionId CHAR(64) NULL, evidenceSnapshotId CHAR(64) NOT NULL,
      evidenceHash CHAR(64) NOT NULL, evidenceCutoffAt DATETIME(3) NOT NULL, generationCompletedAt DATETIME(3) NOT NULL,
      publishedAt DATETIME(3) NOT NULL, recordedAt DATETIME(3) NOT NULL, ruleVersion VARCHAR(64) NOT NULL,
      requestHash CHAR(64) NOT NULL, candidateJson JSON NOT NULL, integrity CHAR(64) NOT NULL)
      ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
    CREATE TABLE MarketPrediction (setId CHAR(36) NOT NULL, family VARCHAR(32) NOT NULL, available BOOLEAN NOT NULL,
      source VARCHAR(16) NULL, selection VARCHAR(32) NULL, selectedProbability DOUBLE NULL,
      unavailableReason VARCHAR(32) NULL, probability1 DOUBLE NULL, probability2 DOUBLE NULL, probability3 DOUBLE NULL,
      generatedAt DATETIME(3) NULL, retrievedAt DATETIME(3) NULL, providerUpdatedAt DATETIME(3) NULL,
      payloadJson JSON NOT NULL, integrity CHAR(64) NOT NULL, PRIMARY KEY(setId,family))
      ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
    CREATE TABLE MarketSettlementRevision (id CHAR(64) NOT NULL PRIMARY KEY, fixtureId CHAR(36) NOT NULL,
      cycleId CHAR(36) NOT NULL, family VARCHAR(32) NOT NULL, at DATETIME(3) NOT NULL, body JSON NOT NULL)
      ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
    CREATE TABLE FixtureResult (id CHAR(64) NOT NULL PRIMARY KEY, fixtureId CHAR(36) NOT NULL,
      fixtureVersion BIGINT UNSIGNED NOT NULL, observedAt DATETIME(3) NOT NULL, status VARCHAR(32) NOT NULL,
      regulationVerified BOOLEAN NOT NULL, regulationHome INT UNSIGNED NULL, regulationAway INT UNSIGNED NULL,
      contentHash CHAR(64) NOT NULL, integrity CHAR(64) NOT NULL, body JSON NOT NULL,
      UNIQUE KEY (id,fixtureId), FOREIGN KEY (fixtureId) REFERENCES FootballFixture(id))
      ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
    CREATE TABLE FixtureResultState (fixtureId CHAR(36) NOT NULL PRIMARY KEY, resultId CHAR(64) NULL,
      FOREIGN KEY (fixtureId) REFERENCES FootballFixture(id),
      FOREIGN KEY (resultId,fixtureId) REFERENCES FixtureResult(id,fixtureId))
      ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
    CREATE TABLE FixtureLifecycleState (fixtureId CHAR(36) NOT NULL PRIMARY KEY, issue VARCHAR(128) NULL,
      FOREIGN KEY (fixtureId) REFERENCES FootballFixture(id))
      ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
  `);
  const migration = await readFile(new URL("../prisma/migrations/20261021110000_saved_slips/migration.sql", import.meta.url), "utf8");
  await root.query(migration.slice(migration.indexOf("CREATE TABLE `SavedSlipFixture`")));
  await root.query(`
    REVOKE UPDATE ON goal_hint_test.SavedSlip FROM 'paid_application'@'127.0.0.1';
    GRANT SELECT, INSERT ON goal_hint_test.SavedSlipFixture TO 'paid_application'@'127.0.0.1';
    GRANT SELECT ON goal_hint_test.FootballFixture TO 'paid_application'@'127.0.0.1';
    GRANT SELECT ON goal_hint_test.FixtureResult TO 'paid_application'@'127.0.0.1';
    GRANT SELECT ON goal_hint_test.FixtureResultState TO 'paid_application'@'127.0.0.1';
    GRANT SELECT ON goal_hint_test.FixtureLifecycleState TO 'paid_application'@'127.0.0.1';
    GRANT SELECT ON goal_hint_test.PredictionCycle TO 'paid_application'@'127.0.0.1';
    GRANT SELECT ON goal_hint_test.PredictionSchedule TO 'paid_application'@'127.0.0.1';
    GRANT SELECT ON goal_hint_test.PredictionSet TO 'paid_application'@'127.0.0.1';
    GRANT SELECT ON goal_hint_test.MarketPrediction TO 'paid_application'@'127.0.0.1';
    GRANT SELECT ON goal_hint_test.MarketSettlementRevision TO 'paid_application'@'127.0.0.1';
  `);
  const insert = async (table, value) => {
    const entries = Object.entries(value).filter(([key]) => key !== 'validIntegrity');
    await root.query(`INSERT INTO \`${table}\` (${entries.map(([key]) => `\`${key}\``).join(',')}) VALUES (${entries.map(() => '?').join(',')})`, entries.map(([, value]) => value));
  };
  for (const forecast of forecasts) {
    const fixture = forecast.fixture;
    await root.query("INSERT INTO FootballFixture (id,status,activeCycleId,kickoff,homeTeamId,awayTeamId) VALUES (?,'scheduled',?,?,?,?)",
      [fixture.id, fixture.activeCycleId, fixture.kickoff, fixture.homeTeamId, fixture.awayTeamId]);
    await insert('PredictionCycle', forecast.cycle);
    await insert('PredictionSchedule', { ...forecast.schedule, providerObservedAt: null, actor: 'synthetic', reason: 'synthetic', evidenceRef: 'synthetic' });
    await insert('PredictionSet', { ...forecast.row, integrity: '0'.repeat(64) });
    await root.query("UPDATE PredictionSet SET integrity=SHA2(CONCAT(id,':',requestHash,':',CAST(candidateJson AS CHAR)),256) WHERE id=?", [forecast.row.id]);
    for (const market of forecast.marketRows) {
      await insert('MarketPrediction', { ...market, integrity: '0'.repeat(64) });
      await root.query("UPDATE MarketPrediction SET integrity=SHA2(CAST(payloadJson AS CHAR),256) WHERE setId=? AND family=?", [market.setId, market.family]);
    }
  }
  const sessions = createMemberSessions({ database, config, now, adminPhone: () => false });
  const registered = await sessions.signIn(phone, "198.51.100.10");
  assert.equal(registered.status, "signed-in");
  let member = await sessions.verify(registered.token);
  const service = createSavedSlips(database, config, now);
  function slip(id, legs) {
    return { id, selections: legs.map(([fixture, selection]) => ({ fixtureId: fixtures[fixture], kickoffAt: instant + 3_600_000,
      homeTeam: forecasts[fixture].slip.selections[0].homeTeam, awayTeam: forecasts[fixture].slip.selections[0].awayTeam, competition: record.competition,
      family: "match-result", selection, probability: { 'home-win': 0.7, draw: 0.2, 'away-win': 0.1 }[selection], odds: "2.00", oddsBasis: "bookmaker" })),
    totalOdds: legs.length === 1 ? "2.00" : "4.00", oddsBasis: "bookmaker",
    averageProbability: legs.reduce((sum, [, selection]) => sum + { 'home-win': 0.7, draw: 0.2, 'away-win': 0.1 }[selection], 0) / legs.length };
  }
  const boundSnapshot = item => ({ ...item, selections: item.selections.map(selection => {
    const forecast = forecasts.find(value => value.fixture.id === selection.fixtureId);
    return { ...selection, forecast: { cycleId: forecast.cycle.id, revisionId: forecast.row.id, publishedAt: forecast.row.publishedAt.getTime() } };
  }) });
  const won = slip("won-original", [[0, "home-win"]]), lost = slip("lost-original", [[0, "draw"]]);
  const mixed = slip("mixed-original", [[0, "draw"], [1, "away-win"]]);
  const uncertain = slip("uncertain-original", [[1, "away-win"]]);
  async function finish(index, verified, home, away) {
    instant = Math.max(instant, forecasts[index].at + 7_200_000);
    const fixtureId = fixtures[index], id = createHash("sha256").update(`${fixtureId}:${verified}:${home}:${away}`).digest("hex");
    await root.query("UPDATE PredictionCycle SET state='closed', lockedSetId=currentSetId, closedAt=cutoffAt, lockedAt=cutoffAt WHERE id=?", [forecasts[index].cycle.id]);
    const scoreHome = verified ? home : null, scoreAway = verified ? away : null, evidenceRef = verified ? 'synthetic-result-proof' : null;
    const content = { status: 'finished-regulation', providerStatus: 'FT', elapsedMinutes: 90, reportedGoals: { home, away },
      extraTimeScore: { home: null, away: null }, penaltyScore: { home: null, away: null },
      regulation: { verified, home: scoreHome, away: scoreAway, evidenceRef } };
    const body = { id, fixtureId, fixtureVersion: 1n, previousId: null, observationId: 'b'.repeat(64), observedAt: instant,
      providerUpdatedAt: null, regulationVerifiedAt: verified ? instant : null, ...content };
    await root.query("UPDATE FootballFixture SET status = 'finished-regulation', regulationHome=?, regulationAway=?, regulationVerifiedAt=?, regulationEvidenceRef=? WHERE id = ?",
      [scoreHome, scoreAway, verified ? new Date(instant) : null, evidenceRef, fixtureId]);
    await root.query("INSERT INTO FixtureResult (id,fixtureId,fixtureVersion,observedAt,status,regulationVerified,regulationHome,regulationAway,contentHash,integrity,body) VALUES (?,?,1,?,'finished-regulation',?,?,?,?,?,?)",
      [id, fixtureId, new Date(instant), verified, scoreHome, scoreAway, evidenceFingerprint(content), '0'.repeat(64), evidenceSerialize(body)]);
    await root.query("UPDATE FixtureResult SET integrity=SHA2(CAST(body AS CHAR),256) WHERE id=?", [id]);
    await root.query("INSERT INTO FixtureResultState (fixtureId,resultId) VALUES (?,?) ON DUPLICATE KEY UPDATE resultId = VALUES(resultId)", [fixtureId, id]);
  }

  await t.test("subscription is required and duplicate saves need no UPDATE privilege", async () => {
    assert.equal(await service.save(member, won), "forbidden");
    const grant = await createAccessCodes({ database, config, now }).manual({ phone, durationDays: 1, amountReceivedUgx: 1000, note: "Synthetic integration access" }, "synthetic-owner");
    assert.equal(grant.status, "created"); member = await sessions.verify(registered.token);
    assert.deepEqual(await Promise.all([service.save(member, won), service.save(member, won)]), ["saved", "saved"]);
    assert.equal(await service.save(member, won), "saved");
    assert.equal(await database.query(tx => tx.savedSlip.count()), 1);
    assert.equal(await database.query(tx => tx.savedSlipFixture.count()), 1);
    const saved = await database.query(tx => tx.savedSlip.findFirst());
    assert.deepEqual(saved.snapshotJson, boundSnapshot(won));
    await assert.rejects(database.query(tx => tx.savedSlip.update({ where: { id: saved.id }, data: { snapshotJson: {} } })), DatabaseOperationError);
    await assert.rejects(database.query(tx => tx.savedSlipFixture.deleteMany()), DatabaseOperationError);
    assert.deepEqual(await service.completed(), []);
  });

  await t.test("expired, reset and mismatched sessions cannot persist a slip", async () => {
    await database.query(tx => tx.memberSession.update({ where: { tokenHash: member.tokenHash }, data: { expiresAt: new Date(instant) } }));
    assert.equal(await service.save(member, lost), "forbidden");
    await database.query(tx => tx.memberSession.update({ where: { tokenHash: member.tokenHash }, data: { expiresAt: new Date(instant + 86_400_000), passwordResetAt: new Date(instant) } }));
    assert.equal(await service.save(member, lost), "forbidden");
    await database.query(tx => tx.memberSession.update({ where: { tokenHash: member.tokenHash }, data: { passwordResetAt: null } }));
    const other = await sessions.signIn("256700003002", "198.51.100.11");
    const outsider = await sessions.verify(other.token);
    assert.equal(await service.save({ ...member, tokenHash: outsider.tokenHash }, lost), "forbidden");
    assert.equal(await database.query(tx => tx.savedSlip.count()), 1);
  });

  await t.test("active legs remain private even when another leg has already lost", async () => {
    for (const item of [lost, mixed, uncertain]) assert.equal(await service.save(member, item), "saved");
    assert.deepEqual(await service.completed(), []);
    await finish(0, true, 2, 1);
    const completed = await service.completed();
    assert.deepEqual(completed.map(item => item.slip.id).sort(), [won.id, lost.id].sort());
    assert.equal(completed.find(item => item.slip.id === won.id).outcome, "won");
    assert.equal(completed.find(item => item.slip.id === lost.id).outcome, "lost");
    assert.deepEqual(completed.find(item => item.slip.id === won.id).slip, boundSnapshot(won));
    assert.ok(!JSON.stringify(completed).includes(phone));
    assert.ok(completed.every(item => !("accountId" in item)));
  });

  await t.test("finished unverified results stay pending until verified scores arrive", async () => {
    await finish(1, false, 0, 1);
    const provisional = await service.completed();
    assert.equal(provisional.length, 4);
    assert.equal(provisional.find(item => item.slip.id === uncertain.id).outcome, "pending");
    assert.equal(provisional.find(item => item.slip.id === uncertain.id).results[0].home, null);
    await finish(1, true, 0, 1);
    const verified = await service.completed();
    assert.equal(verified.find(item => item.slip.id === uncertain.id).outcome, "won");
    assert.equal(verified.find(item => item.slip.id === mixed.id).outcome, "lost");
  });

  await t.test("canonical corrections and lifecycle conflicts cannot grade from a stale result pointer", async () => {
    await root.query("UPDATE FootballFixture SET regulationHome=1 WHERE id=?", [fixtures[1]]);
    assert.equal((await service.completed()).find(item => item.slip.id === uncertain.id).outcome, "pending");
    await root.query("UPDATE FootballFixture SET regulationHome=0 WHERE id=?", [fixtures[1]]);
    await root.query("INSERT INTO FixtureLifecycleState (fixtureId,issue) VALUES (?,'conflicting-final-result')", [fixtures[1]]);
    assert.equal((await service.completed()).find(item => item.slip.id === uncertain.id).outcome, "pending");
    await root.query("DELETE FROM FixtureLifecycleState WHERE fixtureId=?", [fixtures[1]]);
    assert.equal((await service.completed()).find(item => item.slip.id === uncertain.id).outcome, "won");
  });

  await t.test("void terminal legs remain in public history and do not become wins", async () => {
    for (const status of ['canceled', 'abandoned', 'awarded']) {
      await root.query("UPDATE FootballFixture SET status=? WHERE id=?", [status, fixtures[1]]);
      const completed = await service.completed();
      assert.equal(completed.find(item => item.slip.id === uncertain.id).outcome, 'void');
      assert.equal(completed.find(item => item.slip.id === mixed.id).outcome, 'lost');
      assert.equal(completed.find(item => item.slip.id === uncertain.id).results[0].outcome, 'void');
    }
  });

  await t.test("a postponed original cycle stays void while the replacement fixture is scheduled or live", async () => {
    await root.query("UPDATE PredictionCycle SET state='void', voidedAt=?, voidReason='formal-postponement' WHERE id=?",
      [new Date(instant), forecasts[1].cycle.id]);
    for (const status of ['scheduled', 'live']) {
      await root.query("UPDATE FootballFixture SET status=?, activeCycleId=? WHERE id=?", [status, randomUUID(), fixtures[1]]);
      const completed = await service.completed();
      assert.equal(completed.find(item => item.slip.id === uncertain.id).outcome, 'void');
      assert.equal(completed.find(item => item.slip.id === mixed.id).outcome, 'lost');
      assert.equal(completed.find(item => item.slip.id === uncertain.id).slip.selections[0].forecast.cycleId, forecasts[1].cycle.id);
    }
  });

  await t.test("account erasure cascades through fixture links without child DELETE privileges", async () => {
    assert.equal(await database.query(tx => tx.savedSlipFixture.count()), 5);
    assert.equal((await createSubscribers(database, now, () => false).action(member.accountId, "erase", undefined, "synthetic-owner")).status, "saved");
    assert.equal(await database.query(tx => tx.savedSlip.count()), 0);
    assert.equal(await database.query(tx => tx.savedSlipFixture.count()), 0);
    assert.deepEqual(await service.completed(), []);
    assert.equal(Number((await root.query("SELECT COUNT(*) AS total FROM FootballFixture"))[0].total), 2);
  });
});
