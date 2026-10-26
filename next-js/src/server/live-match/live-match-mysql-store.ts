import "server-only";

import { z } from "zod";
import { maximumCompetitionScope } from "../../domain/feed-query.ts";
import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { liveMatchRules, liveMatchSnapshotSchema, type LiveMatchSnapshot } from "../../domain/live-match.ts";
import { settlementStatuses, type SettlementStatus } from "../../domain/market-settlement.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { historyJson } from "../predictions/history-read.ts";
import { fourDigitYearInstant } from "../shared/utc-instant.ts";
import { LiveMatchError, liveMatchFail, type LiveMatchLease, type LiveMatchStore, type LiveMatchTarget } from "./live-match-contract.ts";

type Tx = Prisma.TransactionClient;
const key = z.string().regex(/^[a-f0-9]{64}$/u), uuid = z.uuid(), epoch = new Date(0);
const finalStatuses = new Set<SettlementStatus>(["finished-regulation", "finished-extra-time", "finished-penalties", "abandoned"]);
const bounded = (value: number, maximum: number) => Number.isSafeInteger(value) && value > 0 && value <= maximum;
const date = (value: number | null) => value === null ? null : new Date(fourDigitYearInstant.parse(value));
const stamp = (value: Date | null) => value?.getTime() ?? null;
const status = (value: string): SettlementStatus => z.enum(settlementStatuses).parse(value);
const at = async (tx: Tx) => utcInstantFromEpochMilliseconds((await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`)[0]!.at.getTime());
type FixtureRow = Readonly<{ fixtureId: string; externalId: bigint; cycleId: string | null; kickoffAt: Date | null;
  homeTeamId: string; awayTeamId: string; homeExternalId: bigint; awayExternalId: bigint; status: string; firstFinalAt?: Date | null }>;
type SnapshotRow = Readonly<{ receivedAt: Date | null; bodyJson: unknown; validIntegrity: bigint | number | null; failures: number }>;
/** Canonical participants are included so even an identity correction without a prediction cycle starts a new occurrence. */
function occurrence(row: FixtureRow): string {
  return evidenceFingerprint({ fixtureId: row.fixtureId, cycleId: row.cycleId, kickoffAt: stamp(row.kickoffAt),
    homeTeamId: row.homeTeamId, awayTeamId: row.awayTeamId });
}
function snapshot(row: SnapshotRow, fixture: Pick<LiveMatchTarget, "fixtureId" | "cycleId" | "kickoffAt">): LiveMatchSnapshot | null {
  if (row.bodyJson === null) return null;
  if (Number(row.validIntegrity) !== 1 || row.receivedAt === null) return liveMatchFail("unavailable");
  const value = liveMatchSnapshotSchema.parse(historyJson(row.bodyJson));
  if (value.fixtureId !== fixture.fixtureId || value.cycleId !== fixture.cycleId || value.kickoffAt !== fixture.kickoffAt ||
    value.collectedAt !== row.receivedAt.getTime() || Buffer.byteLength(evidenceSerialize(value)) > liveMatchRules.maxSnapshotBytes)
    return liveMatchFail("unavailable");
  return freezeEvidence(value);
}
function coverage(value: unknown, name: string): boolean | null {
  const parsed = historyJson(value);
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) &&
    typeof (parsed as Record<string, unknown>)[name] === "boolean" ? (parsed as Record<string, boolean>)[name]! : null;
}

/** One stable account lease serializes the collector across restarts and provider-day changes. */
export function createMysqlLiveMatchStore(options: Readonly<{ database: DatabaseRuntime; accountKey: string }>): LiveMatchStore {
  const { database } = options, accountKey = key.parse(options.accountKey);
  async function transaction<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
    let failure: unknown;
    try { return await database.transaction(async (tx) => {
      try { return await operation(tx); } catch (error) { failure = error; throw error; }
    }, { isolationLevel: "ReadCommitted", timeout: 30_000 }); }
    catch { if (failure instanceof LiveMatchError) throw failure; return liveMatchFail("unavailable"); }
  }
  async function locked(tx: Tx, lease?: LiveMatchLease) {
    const row = (await tx.$queryRaw<{ ownerId: string | null; fence: bigint; leaseUntil: Date }[]>`
      SELECT ownerId, fence, leaseUntil FROM LiveMatchPollerLease WHERE accountKey = ${accountKey} FOR UPDATE`)[0];
    const now = await at(tx);
    if (!row || lease && (lease.accountKey !== accountKey || row.ownerId !== lease.ownerId || row.fence !== lease.fence || row.leaseUntil.getTime() <= now))
      return liveMatchFail("lost-lease");
    return { row, now };
  }
  const leaseValue = (ownerId: string, fence: bigint, until: number): LiveMatchLease =>
    freezeEvidence({ accountKey, ownerId, fence, until: utcInstantFromEpochMilliseconds(until) });
  async function current(tx: Tx, target: LiveMatchTarget) {
    const row = (await tx.$queryRaw<FixtureRow[]>`SELECT f.id AS fixtureId, f.externalId, f.activeCycleId AS cycleId, f.kickoff AS kickoffAt,
      f.homeTeamId, f.awayTeamId, f.status, h.externalId AS homeExternalId, a.externalId AS awayExternalId,
      COALESCE(rs.firstFinalAt,f.retrievedAt) AS firstFinalAt
      FROM FootballFixture f
      JOIN FootballTeamProvider h ON h.teamId=f.homeTeamId AND h.provider='api-football'
      JOIN FootballTeamProvider a ON a.teamId=f.awayTeamId AND a.provider='api-football'
      LEFT JOIN FixtureResultState rs ON rs.fixtureId=f.id
      WHERE f.id = ${target.fixtureId} AND f.provider='api-football'
        AND NOT EXISTS (SELECT 1 FROM FootballTeamProvider otherHome WHERE otherHome.teamId=f.homeTeamId
          AND otherHome.provider='api-football' AND otherHome.externalId<>h.externalId)
        AND NOT EXISTS (SELECT 1 FROM FootballTeamProvider otherAway WHERE otherAway.teamId=f.awayTeamId
          AND otherAway.provider='api-football' AND otherAway.externalId<>a.externalId) FOR SHARE`)[0];
    if (!row || occurrence(row) !== target.occurrenceId || row.cycleId !== target.cycleId || stamp(row.kickoffAt) !== target.kickoffAt ||
      Number(row.externalId) !== target.externalId || Number(row.homeExternalId) !== target.homeExternalId ||
      Number(row.awayExternalId) !== target.awayExternalId || row.status !== target.status) return liveMatchFail("invalid-request");
    return row;
  }
  const store: LiveMatchStore = {
    acquire(ownerId, leaseMs) {
      key.parse(ownerId);
      if (!bounded(leaseMs, 3_600_000)) return liveMatchFail("invalid-request");
      return transaction(async (tx) => {
        // An exclusive upsert also serializes two cold starts without a separate parent coordination row.
        await tx.$executeRaw`INSERT INTO LiveMatchPollerLease (accountKey, ownerId, fence, leaseUntil)
          VALUES (${accountKey}, NULL, 0, ${epoch}) ON DUPLICATE KEY UPDATE accountKey=LiveMatchPollerLease.accountKey`;
        const { row, now } = await locked(tx);
        if (row.ownerId !== null && row.leaseUntil.getTime() > now) return null;
        const until = now + leaseMs, fence = row.fence + 1n;
        await tx.$executeRaw`UPDATE LiveMatchPollerLease SET ownerId=${ownerId}, fence=${fence}, leaseUntil=${new Date(until)} WHERE accountKey=${accountKey}`;
        return leaseValue(ownerId, fence, until);
      });
    },
    renew(lease, leaseMs) {
      if (!bounded(leaseMs, 3_600_000)) return liveMatchFail("invalid-request");
      return transaction(async (tx) => { const { now } = await locked(tx, lease), until = now + leaseMs;
        await tx.$executeRaw`UPDATE LiveMatchPollerLease SET leaseUntil=${new Date(until)} WHERE accountKey=${accountKey}`;
        return leaseValue(lease.ownerId, lease.fence, until);
      });
    },
    release(lease) {
      return transaction(async (tx) => { const { row } = await locked(tx);
        if (lease.accountKey === accountKey && row.ownerId === lease.ownerId && row.fence === lease.fence)
          await tx.$executeRaw`UPDATE LiveMatchPollerLease SET ownerId=NULL, leaseUntil=${epoch} WHERE accountKey=${accountKey}`;
      });
    },
    async due(policy, now, limit) {
      if (!bounded(limit, 100) || !bounded(policy.finalWindowMs, 31 * 86_400_000) || !Array.isArray(policy.coverage) ||
        policy.coverage.length > maximumCompetitionScope || policy.coverage.some((v) => !bounded(v.competitionId, Number.MAX_SAFE_INTEGER) || !bounded(v.season, 9999)))
        return liveMatchFail("invalid-request");
      fourDigitYearInstant.parse(now);
      if (policy.coverage.length === 0) return [];
      try {
        const scope = JSON.stringify(policy.coverage);
        const rows = await database.query((tx) => tx.$queryRaw<(FixtureRow & SnapshotRow & { seasonCoverage: unknown })[]>`
          SELECT f.id AS fixtureId, f.externalId, f.activeCycleId AS cycleId, f.kickoff AS kickoffAt, f.homeTeamId, f.awayTeamId,
            f.status, h.externalId AS homeExternalId, a.externalId AS awayExternalId, s.coverage AS seasonCoverage,
            l.receivedAt, l.bodyJson, l.integrity=SHA2(CAST(l.bodyJson AS CHAR),256) AS validIntegrity, COALESCE(l.failures,0) AS failures
          FROM FootballFixture f JOIN FootballSeason s ON s.id=f.seasonId
          JOIN FootballCompetitionProvider cp ON cp.competitionId=s.competitionId AND cp.provider='api-football'
          JOIN JSON_TABLE(${scope}, '$[*]' COLUMNS (competitionId BIGINT PATH '$.competitionId', season INTEGER PATH '$.season')) wanted
            ON wanted.competitionId=cp.externalId AND wanted.season=s.year
          JOIN FootballTeamProvider h ON h.teamId=f.homeTeamId AND h.provider='api-football'
          JOIN FootballTeamProvider a ON a.teamId=f.awayTeamId AND a.provider='api-football'
          LEFT JOIN LiveMatchSnapshot l ON l.fixtureId=f.id AND l.cycleId <=> f.activeCycleId AND l.kickoffAt <=> f.kickoff
            AND l.homeTeamId=f.homeTeamId AND l.awayTeamId=f.awayTeamId
          LEFT JOIN FixtureResultState rs ON rs.fixtureId=f.id
          WHERE f.provider='api-football' AND (f.status='live' OR
            (f.status IN ('finished-regulation','finished-extra-time','finished-penalties','abandoned')
              AND COALESCE(l.firstFinalAt,rs.firstFinalAt,f.retrievedAt) >= ${new Date(now - policy.finalWindowMs)}))
            AND (l.nextPollAt IS NULL OR l.nextPollAt <= ${new Date(now)})
            AND NOT EXISTS (SELECT 1 FROM FootballTeamProvider otherHome WHERE otherHome.teamId=f.homeTeamId
              AND otherHome.provider='api-football' AND otherHome.externalId<>h.externalId)
            AND NOT EXISTS (SELECT 1 FROM FootballTeamProvider otherAway WHERE otherAway.teamId=f.awayTeamId
              AND otherAway.provider='api-football' AND otherAway.externalId<>a.externalId)
          ORDER BY COALESCE(l.attemptedAt,${epoch}), f.kickoff, f.id LIMIT ${limit}`);
        return freezeEvidence(rows.map((row) => {
          const target = { occurrenceId: occurrence(row), fixtureId: uuid.parse(row.fixtureId), externalId: Number(row.externalId),
            cycleId: row.cycleId, kickoffAt: stamp(row.kickoffAt), homeExternalId: Number(row.homeExternalId), awayExternalId: Number(row.awayExternalId),
            status: status(row.status), statisticsCoverage: coverage(row.seasonCoverage, "fixtures.statistics_fixtures"),
            eventsCoverage: coverage(row.seasonCoverage, "fixtures.events"), failures: row.failures };
          if (![target.externalId, target.homeExternalId, target.awayExternalId].every((v) => bounded(v, Number.MAX_SAFE_INTEGER)))
            return liveMatchFail("unavailable");
          return { ...target, previous: snapshot(row, target) };
        }));
      } catch (error) { if (error instanceof LiveMatchError) throw error; return liveMatchFail("unavailable"); }
    },
    schedule(lease, target, nextAt) {
      key.parse(target.occurrenceId); date(nextAt);
      return transaction(async (tx) => {
        const { now } = await locked(tx, lease), fixture = await current(tx, target);
        if (nextAt <= now) return liveMatchFail("invalid-request");
        const finalAt = finalStatuses.has(target.status) ? new Date(Math.min(now, fixture.firstFinalAt?.getTime() ?? now)) : null;
        await tx.$executeRaw`INSERT INTO LiveMatchSnapshot
          (id,fixtureId,cycleId,kickoffAt,homeTeamId,awayTeamId,attemptedAt,nextPollAt,firstFinalAt,failures)
          VALUES (${target.occurrenceId},${target.fixtureId},${target.cycleId},${date(target.kickoffAt)},${fixture.homeTeamId},${fixture.awayTeamId},
            ${new Date(now)},${new Date(nextAt)},${finalAt},0)
          ON DUPLICATE KEY UPDATE attemptedAt=${new Date(now)},nextPollAt=${new Date(nextAt)},firstFinalAt=COALESCE(LiveMatchSnapshot.firstFinalAt,${finalAt})`;
      });
    },
    save(lease, target, input, nextAt, failures) {
      const value = liveMatchSnapshotSchema.parse(input), body = evidenceSerialize(value);
      if (Buffer.byteLength(body) > liveMatchRules.maxSnapshotBytes || value.fixtureId !== target.fixtureId || value.cycleId !== target.cycleId ||
        value.kickoffAt !== target.kickoffAt || value.status !== target.status || !Number.isSafeInteger(failures) || failures < 0 || failures > 16)
        return liveMatchFail("invalid-request");
      date(nextAt);
      return transaction(async (tx) => {
        const { now } = await locked(tx, lease); await current(tx, target);
        const row = (await tx.$queryRaw<(SnapshotRow & { attemptedAt: Date })[]>`SELECT receivedAt,bodyJson,attemptedAt,failures,
          integrity=SHA2(CAST(bodyJson AS CHAR),256) AS validIntegrity FROM LiveMatchSnapshot WHERE id=${target.occurrenceId} FOR UPDATE`)[0];
        if (!row || value.collectedAt > now || value.collectedAt < row.attemptedAt.getTime() ||
          row.receivedAt !== null && value.collectedAt < row.receivedAt.getTime() || nextAt < row.attemptedAt.getTime()) return liveMatchFail("invalid-request");
        const previous = snapshot(row, target);
        if (previous && (["statistics", "events"] as const).some((section) => {
          const old = previous[section], next = value[section];
          return next.retrievedAt !== null && old.retrievedAt !== null && next.retrievedAt < old.retrievedAt ||
            next.providerUpdatedAt !== null && old.providerUpdatedAt !== null && next.providerUpdatedAt < old.providerUpdatedAt;
        })) return liveMatchFail("invalid-request");
        await tx.$executeRaw`UPDATE LiveMatchSnapshot SET receivedAt=${new Date(value.collectedAt)},bodyJson=JSON_EXTRACT(${body},'$'),
          integrity=SHA2(CAST(JSON_EXTRACT(${body},'$') AS CHAR),256),nextPollAt=${new Date(nextAt)},failures=${failures}
          WHERE id=${target.occurrenceId}`;
        await locked(tx, lease);
      });
    },
  };
  return Object.freeze(store);
}
