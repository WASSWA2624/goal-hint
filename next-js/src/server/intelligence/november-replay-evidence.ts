import "server-only";

import { getPublicationDeadline, utcInstantFromEpochMilliseconds, type InstantWindow } from "../../domain/calendar.ts";
import { isPlayedFinalStatus } from "../../domain/market-settlement.ts";
import { marketRules } from "../../domain/markets.ts";
import { novemberReplayRange, novemberReplayZone } from "../../domain/november-replay.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, freezeEvidence, parseEvidenceSnapshot } from "../evidence/evidence-input.ts";
import { evidenceSourceExclusion } from "../evidence/evidence-snapshot.ts";
import { buildFixtureModelEvidence, fixtureModelEvidenceBounds, type FixtureModelEvidence, type FixtureModelHistoryRow } from "../evidence/fixture-model-evidence.ts";
import { Prisma } from "../generated/prisma/client.ts";
import type { CutoffSchedule } from "../predictions/cutoff-contract.ts";
import { reconstructCutoff, revisionEligibleForLock } from "../predictions/cutoff-eligibility.ts";
import { storedCutoffOperation } from "../predictions/cutoff-read.ts";
import { PredictionHistoryError, type StoredCycle } from "../predictions/history-contract.ts";
import { historyJson, historyTime, storedCycle, storedRevision, type HistoryRow } from "../predictions/history-read.ts";
import { storedLifecycleReceipt } from "../predictions/lifecycle-read.ts";
import { statusShowsPlay } from "../predictions/publication-eligibility.ts";
import type { ForecastDecision } from "../predictions/forecast-decision.ts";
import { RevisionPublicationError } from "../predictions/publication-contract.ts";
import { storedPublicationBarrier, storedRefreshResult } from "../predictions/publication-read.ts";
import { fixtureResultFromRow } from "../results/result-read.ts";
import type { LocalGoalForecast } from "./intelligence-contract.ts";
import { estimateLocalGoals, localGoalDefaults, localGoalModelVersion } from "./local-goals-model.ts";
import { DEFAULT_MONITORING_POLICY } from "./monitoring.ts";
import { decodeShadowArchive, ShadowStoreError, type ShadowRevisionBody } from "./shadow-store.ts";

export const NOVEMBER_REPLAY_WINDOW = Object.freeze({ zone: novemberReplayZone, ...novemberReplayRange.window });

export type NovemberReplayCursor = Readonly<{ kickoffAt: number; fixtureId: string }>;
export type NovemberReplayOccurrence = NovemberReplayCursor & Readonly<{
  externalId: bigint; fixtureVersion: bigint; competitionId: string; competitionName: string | null;
  homeTeamId: string; homeTeamName: string | null; awayTeamId: string; awayTeamName: string | null; status: string;
  applicable: boolean; cycleId: string | null; originalRevisionId: string | null;
}>;
export type NovemberReplayEvidence = Readonly<{
  status: "qualified" | "abstained" | "prospective"; reason: string | null; evidenceHash: string;
  cutoffAt: number | null; scheduleHash: string | null; scheduleVersion: number | null;
  historyMatches: number; evidenceReceiptIds: readonly string[]; forecast: LocalGoalForecast | null;
  archivedDecision?: ForecastDecision; decisionAt?: number; modelCoverage?: ReplayModelCoverage;
  contextCoverage?: ReturnType<typeof archivedContextCoverage>;
}>;
type ReplayModelCoverage = ReturnType<typeof replayModelCoverage>;
type ReplayDatabase = Pick<DatabaseRuntime, "query">;
export type NovemberReplayTrainingMembership = Readonly<{
  observedBefore: number; byCompetition: ReadonlyMap<string, readonly string[]>;
}>;
type OccurrenceRow = Omit<NovemberReplayOccurrence, "kickoffAt" | "applicable"> & { kickoff: Date; applicable: number | boolean | bigint };

/** The canonical Matches instant range plus displaced catalog, schedule and lifecycle occurrences for the audit. */
export async function readNovemberReplayPage(database: ReplayDatabase,
  input: Readonly<{ after?: NovemberReplayCursor; limit: number; auditedAt: number;
    scope?: "canonical" | "displaced" | "all"; range?: InstantWindow }>): Promise<readonly NovemberReplayOccurrence[]> {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 250) throw new RangeError("Use a replay page size from 1 to 250.");
  const auditedAt = new Date(utcInstantFromEpochMilliseconds(input.auditedAt));
  const range = input.range ?? NOVEMBER_REPLAY_WINDOW;
  const lower = new Date(range.startInclusive), upper = new Date(range.endExclusive);
  const after = input.after ? new Date(utcInstantFromEpochMilliseconds(input.after.kickoffAt)) : lower;
  const cursorId = input.after?.fixtureId ?? "";
  const canonical = Prisma.sql`SELECT f.id AS fixtureId, f.kickoff FROM FootballFixture f FORCE INDEX (FootballFixture_kickoff_idx)
    WHERE f.provider='api-football' AND f.kickoff>=${lower} AND f.kickoff<${upper} AND f.createdAt<=${auditedAt}
      AND (f.kickoff>${after} OR (f.kickoff=${after} AND f.id>${cursorId}))`;
  const catalogKickoff = Prisma.sql`JSON_UNQUOTE(JSON_EXTRACT(a.changes,CASE side.ordinal
    WHEN 0 THEN '$.kickoff.before' ELSE '$.kickoff.after' END))`;
  // A catalog reschedule records both sides of the change after the fixture's initial version.
  const displaced = Prisma.sql`SELECT historic.fixtureId,CAST(historic.kickoff AS DATETIME(3)) AS kickoff FROM (
    SELECT a.fixtureId,CAST(REPLACE(LEFT(${catalogKickoff},23),'T',' ') AS DATETIME(3)) AS kickoff
    FROM FootballFixtureAudit a FORCE INDEX (PRIMARY)
    STRAIGHT_JOIN (SELECT 0 AS ordinal UNION ALL SELECT 1) side ON TRUE
    STRAIGHT_JOIN FootballImport i ON i.id=a.importId
    WHERE a.dataVersion>1 AND a.observedAt<=${auditedAt} AND i.recordedAt<=${auditedAt} AND i.provider='api-football'
      AND JSON_CONTAINS_PATH(a.changes,'one','$.kickoff')
      AND ${catalogKickoff}>=${lower.toISOString()} AND ${catalogKickoff}<${upper.toISOString()}
    UNION
    SELECT s.fixtureId,s.kickoffAt FROM PredictionSchedule s
    WHERE s.kickoffAt>=${lower} AND s.kickoffAt<${upper} AND s.observedAt<=${auditedAt}
    UNION
    SELECT life.fixtureId,CAST(TIMESTAMPADD(MICROSECOND,
      CAST(JSON_UNQUOTE(JSON_EXTRACT(life.receiptJson,'$.observation.kickoffAt')) AS SIGNED)*1000,'1970-01-01 00:00:00.000') AS DATETIME(3))
    FROM FixtureLifecycleObservation life
    WHERE life.at<=${auditedAt} AND life.outcome IN ('accepted','unchanged')
      AND CAST(JSON_UNQUOTE(JSON_EXTRACT(life.receiptJson,'$.observation.kickoffAt')) AS SIGNED)>=${range.startInclusive}
      AND CAST(JSON_UNQUOTE(JSON_EXTRACT(life.receiptJson,'$.observation.kickoffAt')) AS SIGNED)<${range.endExclusive}
      AND life.integrity=SHA2(CAST(life.receiptJson AS CHAR),256)
  ) historic JOIN FootballFixture f ON f.id=historic.fixtureId WHERE NOT (f.kickoff<=>historic.kickoff)`;
  const occurrence = input.scope === "canonical" ? canonical : input.scope === "displaced" ? displaced : Prisma.sql`${canonical} UNION ALL ${displaced}`;
  const rows = await database.query((tx) => tx.$queryRaw<OccurrenceRow[]>(Prisma.sql`
    WITH occurrence AS (${occurrence}), page AS (
      SELECT f.id AS fixtureId, o.kickoff FROM occurrence o JOIN FootballFixture f ON f.id=o.fixtureId
      WHERE f.provider='api-football' AND (o.kickoff>${after} OR (o.kickoff=${after} AND o.fixtureId>${cursorId}))
      ORDER BY o.kickoff,o.fixtureId LIMIT ${input.limit}
    )
    SELECT f.id AS fixtureId, f.externalId, f.dataVersion AS fixtureVersion, CAST(p.kickoff AS DATETIME(3)) AS kickoff, f.status,
      s.competitionId, comp.name AS competitionName, f.homeTeamId, home.name AS homeTeamName, f.awayTeamId, away.name AS awayTeamName,
      (f.kickoff<=>p.kickoff) AS applicable, cycle.id AS cycleId,
      CASE WHEN cycle.state='open' THEN cycle.currentSetId WHEN cycle.state='closed' THEN cycle.lockedSetId ELSE NULL END AS originalRevisionId
    FROM page p JOIN FootballFixture f ON f.id=p.fixtureId JOIN FootballSeason s ON s.id=f.seasonId
    JOIN FootballCompetition comp ON comp.id=s.competitionId JOIN FootballTeam home ON home.id=f.homeTeamId
    JOIN FootballTeam away ON away.id=f.awayTeamId
    LEFT JOIN PredictionCycle cycle ON cycle.id=CASE WHEN f.kickoff=p.kickoff THEN f.activeCycleId ELSE (
      SELECT hist.cycleId FROM PredictionSchedule hist JOIN PredictionCycle prior ON prior.id=hist.cycleId
      WHERE hist.fixtureId=f.id AND hist.kickoffAt=p.kickoff AND hist.observedAt<=${auditedAt}
      ORDER BY prior.ordinal DESC,hist.version DESC LIMIT 1) END
    ORDER BY p.kickoff,p.fixtureId`));
  return freezeEvidence(rows.map(({ kickoff, applicable, ...row }) => ({ ...row, kickoffAt: historyTime(kickoff), applicable: Boolean(applicable) })));
}

type CatalogChange = Readonly<{ after?: unknown }>;
type CatalogProof = Readonly<{ id: string; version: bigint; observedAt: number; recordedAt: number; value: unknown }>;
function catalogProof(changes: readonly Readonly<{ id: string; importId: string; dataVersion: bigint; observedAt: Date;
  changes: Prisma.JsonValue; import: { recordedAt: Date } }>[], key: string): CatalogProof | null {
  for (const row of changes) {
    const change = (row.changes as Record<string, CatalogChange> | null)?.[key];
    if (change && Object.hasOwn(change, "after")) return { id: row.id, version: row.dataVersion,
      observedAt: historyTime(row.observedAt), recordedAt: historyTime(row.import.recordedAt), value: change.after };
  }
  return null;
}

type ScheduleEvidence = Readonly<{ cutoffAt: number; scheduleHash: string; scheduleVersion: number | null }>;
type ScheduleCheck = Readonly<{ prospective: boolean; reason: string | null; schedule: ScheduleEvidence | null;
  publication?: NonNullable<Awaited<ReturnType<typeof readPublishedScheduleProof>>> }>;
const missingSchedule = (reason: string): ScheduleCheck => ({ prospective: false, reason, schedule: null });

/** A private prospective capture can corroborate an unchanged schedule; the model is always refitted. */
async function readShadowScheduleProof(tx: Prisma.TransactionClient, occurrence: NovemberReplayOccurrence, cutoffAt: number) {
  const earliest = cutoffAt - 1 - DEFAULT_MONITORING_POLICY.maximumAgeMs;
  const candidates = await tx.intelligenceShadowRevision.findMany({ where: { fixtureId: occurrence.fixtureId, eligible: true,
    modelVersion: localGoalModelVersion(), createdAt: { gte: new Date(earliest), lt: new Date(cutoffAt) } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 4 });
  for (const row of candidates) {
    let body: ShadowRevisionBody;
    try { body = decodeShadowArchive<ShadowRevisionBody>(row.bodyJson); }
    catch (error) { if (error instanceof ShadowStoreError) continue; throw error; }
    const observation = body.observation, forecast = body.forecast, fixture = forecast.components.local.fixture;
    const createdAt = row.createdAt.getTime();
    if (evidenceFingerprint(body) !== row.integrity || body.policyVersion !== "canonical-local-forecast-shadow-v1" ||
      forecast.mode !== "shadow" || forecast.publish || forecast.decision !== "eligible-shadow" ||
      forecast.fixtureId !== occurrence.fixtureId || observation.fixtureId !== occurrence.fixtureId || observation.status !== "scheduled" ||
      fixture.fixtureId !== occurrence.fixtureId || observation.kickoffAt !== occurrence.kickoffAt ||
      fixture.kickoffAt !== occurrence.kickoffAt || fixture.competitionId !== occurrence.competitionId ||
      fixture.homeTeamId !== occurrence.homeTeamId || fixture.awayTeamId !== occurrence.awayTeamId ||
      forecast.forecastAt > createdAt || observation.observedAt < earliest ||
      observation.observedAt > observation.receivedAt || observation.receivedAt > createdAt) continue;
    return row.id;
  }
  return null;
}

/** A published receipt already passed the original observation-freshness policy. */
async function readPublishedScheduleProof(tx: Prisma.TransactionClient, occurrence: NovemberReplayOccurrence, cycle: StoredCycle,
  schedules: readonly CutoffSchedule[], cutoffAt: number, withCoverage: boolean) {
  const revisionId = occurrence.originalRevisionId;
  if (!revisionId || cycle.state !== "closed" || cycle.lockedSetId !== revisionId) return null;
  const known = await tx.predictionRefreshResult.findFirst({ where: { cycleId: cycle.id, fixtureId: occurrence.fixtureId,
    revisionId, outcome: "published", at: { lt: new Date(cutoffAt) } }, orderBy: { at: "desc" }, select: { id: true } });
  if (!known) return null;
  const records = await Promise.all([storedRevision(tx, revisionId), storedRefreshResult(tx, known.id)]).catch((error: unknown) => {
    if (error instanceof PredictionHistoryError || error instanceof RevisionPublicationError) return null;
    throw error;
  });
  if (!records) return null;
  const [revision, receipt] = records;
  if (!revision || !receipt || !revisionEligibleForLock(revision, cycle, schedules, utcInstantFromEpochMilliseconds(cutoffAt))) return null;
  const context = revision.candidate.context.context, observation = receipt.observation;
  if (receipt.revisionId !== revisionId || receipt.runId !== revision.runId || receipt.runSequence !== revision.runSequence ||
    receipt.jobId !== revision.jobId || receipt.evidenceSnapshotId !== revision.evidenceSnapshotId ||
    receipt.candidateHash !== evidenceFingerprint(revision.candidate) || receipt.at !== revision.publishedAt ||
    receipt.generationCompletedAt !== revision.generationCompletedAt || revision.recordedAt >= cutoffAt ||
    observation.retrievedAt > receipt.at || observation.actualStartedAt !== null || observation.status !== "scheduled" ||
    context.externalFixtureId !== Number(occurrence.externalId) || observation.externalFixtureId !== context.externalFixtureId ||
    context.home.teamId !== occurrence.homeTeamId || context.away.teamId !== occurrence.awayTeamId || observation.kickoffAt !== occurrence.kickoffAt)
    return null;
  // The accepted publication validated the snapshot and bound its immutable team pair and fixture.
  const [evidence] = await tx.$queryRaw<{ requestId: string; snapshotJson: unknown }[]>`SELECT requestId,
    ${withCoverage ? Prisma.sql`snapshotJson` : Prisma.sql`NULL`} AS snapshotJson FROM FixtureEvidenceSnapshot
    WHERE requestId=${revision.evidenceSnapshotId} AND contentHash=${revision.evidenceHash} AND fixtureId=${occurrence.fixtureId}
      AND fixtureVersion=${revision.fixtureVersion} AND cycleId=${cycle.id} AND runId=${revision.runId}
      AND homeTeamId=${occurrence.homeTeamId} AND awayTeamId=${occurrence.awayTeamId} AND kickoffAt=${new Date(occurrence.kickoffAt)}
      AND analysisAt<=${new Date(revision.generationCompletedAt)}
      AND integrity=SHA2(CONCAT(requestId,':',requestFingerprint,':',CAST(snapshotJson AS CHAR)),256)`;
  return evidence ? { receiptId: receipt.id, snapshotId: evidence.requestId, confirmedAt: observation.retrievedAt,
    evidenceCutoffAt: revision.evidenceCutoffAt, decision: receipt.forecastDecision,
    ...(withCoverage && { contextCoverage: archivedContextCoverage(evidence.snapshotJson, revision.evidenceHash, revision.evidenceCutoffAt) }) } : null;
}

function archivedContextCoverage(body: unknown, expectedHash: string, cutoffAt: number) {
  try {
    const { hash, sources, facts, exclusions, missingness, context, policy } = parseEvidenceSnapshot(historyJson(body));
    if (hash !== expectedHash || context.cutoffAt > cutoffAt) return null;
    const eligible = new Map(sources.filter((source) => source.kind === "football" &&
      evidenceSourceExclusion(source, context, policy) === null).map((source) => [source.id, source.retrievedAt]));
    const tally = (values: readonly string[]) => Object.fromEntries([...new Set(values)].sort()
      .map((value) => [value, values.filter((entry) => entry === value).length]));
    const confirmed = facts.filter(({ flags, values }) => !flags.includes("conflict") && values.some(({ certainty, asOfAt, sourceIds }) =>
      certainty === "confirmed" && (asOfAt === null || asOfAt <= context.cutoffAt) && sourceIds.some((id) => eligible.has(id))));
    return { cutoffAt: context.cutoffAt, footballSources: eligible.size, latestSourceAt: eligible.size ? Math.max(...eligible.values()) : null,
      confirmedFacts: tally(confirmed.map(({ kind }) => kind)), exclusions: tally(exclusions.map(({ reason }) => reason)),
      missingOrConflicting: tally(missingness.map(({ kind, reason }) => `${kind}:${reason}`)) };
  } catch { return null; }
}

async function readReplaySchedule(tx: Prisma.TransactionClient, occurrence: NovemberReplayOccurrence, auditedAt: number,
  preferPublication = false, withCoverage = false): Promise<ScheduleCheck> {
  const nominal = getPublicationDeadline(utcInstantFromEpochMilliseconds(occurrence.kickoffAt));
  const auditClock = new Date(auditedAt), now = utcInstantFromEpochMilliseconds(auditedAt);
  const [current, cycle, lifeStarts] = await Promise.all([
    tx.footballFixture.findUnique({ where: { id: occurrence.fixtureId }, include: { season: true } }),
    occurrence.cycleId === null ? null : storedCycle(tx, occurrence.cycleId),
    tx.$queryRaw<{ id: string }[]>`SELECT id FROM FixtureLifecycleObservation
      WHERE fixtureId=${occurrence.fixtureId} AND at<=${auditClock} AND outcome<>'conflict'
        AND CAST(JSON_UNQUOTE(JSON_EXTRACT(receiptJson,'$.observation.kickoffAt')) AS SIGNED)=${occurrence.kickoffAt}
        AND (JSON_TYPE(JSON_EXTRACT(receiptJson,'$.observation.actualStartedAt')) IN ('INTEGER','UNSIGNED INTEGER') OR
          (outcome IN ('accepted','unchanged') AND JSON_UNQUOTE(JSON_EXTRACT(receiptJson,'$.observation.status'))
            IN ('live','finished-regulation','finished-extra-time','finished-penalties')))
      ORDER BY CASE WHEN JSON_TYPE(JSON_EXTRACT(receiptJson,'$.observation.actualStartedAt')) IN ('INTEGER','UNSIGNED INTEGER')
        THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(receiptJson,'$.observation.actualStartedAt')) AS SIGNED)
        ELSE TIMESTAMPDIFF(MICROSECOND,'1970-01-01 00:00:00.000',retrievedAt) DIV 1000 END,id LIMIT 1`,
  ]);
  if (!current || current.dataVersion !== occurrence.fixtureVersion || current.kickoff?.getTime() !== occurrence.kickoffAt ||
    current.activeCycleId !== occurrence.cycleId || current.season.competitionId !== occurrence.competitionId ||
    current.homeTeamId !== occurrence.homeTeamId || current.awayTeamId !== occurrence.awayTeamId)
    return missingSchedule("occurrence-changed");
  if (occurrence.cycleId !== null && (!cycle || cycle.fixtureId !== occurrence.fixtureId || cycle.kickoffAt !== occurrence.kickoffAt ||
    cycle.state === "void" || cycle.openedAt > auditedAt)) return missingSchedule("schedule-changed");
  const lifeStart = lifeStarts[0] ? await storedLifecycleReceipt(tx, lifeStarts[0].id) : null;
  const firstPlayAt = lifeStart ? lifeStart.observation.actualStartedAt ?? lifeStart.observation.retrievedAt : null;
  const storedBarrier = cycle ? await storedPublicationBarrier(tx, cycle.id) : null;
  const barrier = storedBarrier && storedBarrier.recordedAt <= auditedAt ? storedBarrier : null;
  const starts = [firstPlayAt, barrier?.closedAt].filter((at) => at != null);
  const early = starts.length ? utcInstantFromEpochMilliseconds(Math.min(...starts)) : null;
  let cutoffAt: number = Math.min(nominal, early ?? Infinity);
  let cycleScheduleHash: string | null = null;
  let lockId: string | null = null;
  let schedules: readonly CutoffSchedule[] = [];
  if (cycle) {
    const rows = await tx.predictionSchedule.findMany({ where: { cycleId: cycle.id, fixtureId: occurrence.fixtureId }, orderBy: { version: "asc" } });
    schedules = rows.map((row) => ({ version: row.version, kickoffAt: historyTime(row.kickoffAt), cutoffAt: historyTime(row.cutoffAt),
      observedAt: historyTime(row.observedAt), actualStartedAt: row.actualStartedAt === null ? null : historyTime(row.actualStartedAt) }));
    const reconstructed = reconstructCutoff(cycle, schedules, now, early);
    const close = await storedCutoffOperation(tx, cycle.id, "close");
    if (close && (close.at > auditedAt || close.scheduleHash !== evidenceFingerprint(schedules.slice(0, close.cycle.scheduleVersion)) ||
      close.cycle.kickoffAt !== occurrence.kickoffAt)) return missingSchedule("schedule-changed");
    cutoffAt = Math.min(cutoffAt, reconstructed.effectiveCloseAt, cycle.closedAt ?? Infinity, close?.effectiveCloseAt ?? Infinity);
    const scheduleAtCutoff = schedules.filter((row) => row.observedAt < cutoffAt).at(-1);
    if (!scheduleAtCutoff || scheduleAtCutoff.kickoffAt !== occurrence.kickoffAt || cycle.openedAt >= cutoffAt)
      return missingSchedule("schedule-unverified-at-cutoff");
    cycleScheduleHash = evidenceFingerprint(rows.filter((row) => row.observedAt.getTime() < cutoffAt).map((row) => ({ id: row.id,
      version: row.version, kickoffAt: row.kickoffAt.toISOString(), cutoffAt: row.cutoffAt.toISOString(), observedAt: row.observedAt.toISOString(),
      providerObservedAt: row.providerObservedAt?.toISOString() ?? null, evidenceRef: row.evidenceRef })));
    lockId = close?.id ?? null;
  }
  if (auditedAt < cutoffAt && occurrence.status === "scheduled") return { prospective: true, reason: null, schedule: null };
  if (auditedAt < cutoffAt || !statusShowsPlay(occurrence.status)) return missingSchedule("play-unverified");
  const lock = new Date(cutoffAt);
  const [changes, lifeRows] = await Promise.all([
    tx.footballFixtureAudit.findMany({ where: { fixtureId: occurrence.fixtureId, observedAt: { lt: lock },
      import: { provider: "api-football", recordedAt: { lt: lock } } },
      orderBy: { dataVersion: "desc" }, include: { import: { select: { recordedAt: true } } } }),
    tx.fixtureLifecycleObservation.findFirst({ where: { fixtureId: occurrence.fixtureId, at: { lt: lock },
      retrievedAt: { lt: lock }, outcome: { in: ["accepted", "unchanged", "conflict"] } }, orderBy: [{ at: "desc" }, { id: "desc" }], select: { id: true } }),
  ]);
  const home = catalogProof(changes, "homeTeamId"), away = catalogProof(changes, "awayTeamId"), season = catalogProof(changes, "seasonId"),
    kickoff = catalogProof(changes, "kickoff"), status = catalogProof(changes, "status");
  const life = lifeRows ? await storedLifecycleReceipt(tx, lifeRows.id) : null;
  const catalogIdentity = home?.value === occurrence.homeTeamId && away?.value === occurrence.awayTeamId && season?.value === current.seasonId;
  let lifecycleIdentity = false;
  // An accepted receipt checked the canonical identity at observation; resolve the same provider IDs now.
  if (!catalogIdentity && life && life.outcome !== "conflict" && life.observation.externalFixtureId === Number(occurrence.externalId) &&
    life.observation.season === current.season.year) {
    const [teams, competition] = await Promise.all([
      tx.footballTeamProvider.findMany({ where: { provider: "api-football", OR: [
        { teamId: occurrence.homeTeamId, externalId: BigInt(life.observation.homeExternalId) },
        { teamId: occurrence.awayTeamId, externalId: BigInt(life.observation.awayExternalId) },
      ] }, select: { teamId: true } }),
      tx.footballCompetitionProvider.findFirst({ where: { provider: "api-football", competitionId: occurrence.competitionId,
        externalId: BigInt(life.observation.competitionExternalId) }, select: { competitionId: true } }),
    ]);
    lifecycleIdentity = competition !== null && teams.length === 2;
  }
  const identity = catalogIdentity || lifecycleIdentity;
  const newerLife = life !== null && life.fixtureVersion >= (kickoff?.version ?? 0n) && life.fixtureVersion >= (status?.version ?? 0n);
  const provenSchedule = newerLife ? life.outcome !== "conflict" && life.observation.kickoffAt === occurrence.kickoffAt &&
    life.observation.externalFixtureId === Number(occurrence.externalId) && life.observation.status === "scheduled"
    : kickoff?.value === new Date(occurrence.kickoffAt).toISOString() && status?.value === "scheduled";
  const lastConfirmedAt = newerLife ? life.observation.retrievedAt : Math.max(kickoff?.observedAt ?? 0, status?.observedAt ?? 0);
  const stale = cutoffAt - 1 - lastConfirmedAt > DEFAULT_MONITORING_POLICY.maximumAgeMs;
  const fresh = identity && provenSchedule && !stale;
  const shadowId = identity && provenSchedule && stale ? await readShadowScheduleProof(tx, occurrence, cutoffAt) : null;
  const published = cycle && (preferPublication || !fresh && shadowId === null && (season?.value === current.seasonId || lifecycleIdentity))
    ? await readPublishedScheduleProof(tx, occurrence, cycle, schedules, cutoffAt, withCoverage) : null;
  const correctedAfterObservation = published !== null && (
    (kickoff && kickoff.observedAt >= published.confirmedAt && kickoff.value !== new Date(occurrence.kickoffAt).toISOString()) ||
    (status && status.observedAt >= published.confirmedAt && status.value !== "scheduled") ||
    (home && home.observedAt >= published.confirmedAt && home.value !== occurrence.homeTeamId) ||
    (away && away.observedAt >= published.confirmedAt && away.value !== occurrence.awayTeamId) ||
    (newerLife && !provenSchedule && life.observation.retrievedAt >= published.confirmedAt));
  if (!fresh && shadowId === null && (published === null || correctedAfterObservation))
    return missingSchedule(identity && provenSchedule ? "schedule-stale-at-cutoff" : "schedule-unverified-at-cutoff");
  const publication = published && !correctedAfterObservation ? published : undefined;
  const schedulePublication = !fresh && shadowId === null && published
    ? { receiptId: published.receiptId, snapshotId: published.snapshotId, confirmedAt: published.confirmedAt } : null;
  return { prospective: false, reason: null, ...(publication && { publication }), schedule: { cutoffAt, scheduleVersion: cycle?.scheduleVersion ?? null,
    scheduleHash: evidenceFingerprint({ cutoffAt, cycleScheduleHash, lockId,
      barrier: barrier && barrier.closedAt < nominal ? barrier.observation : null,
      earlyId: firstPlayAt !== null && firstPlayAt < nominal ? lifeStart?.id ?? null : null,
      identity: lifecycleIdentity ? life?.id ?? null : [home?.id ?? null, away?.id ?? null, season?.id ?? null],
      recorded: newerLife ? life.id : [kickoff?.id ?? null, status?.id ?? null], shadowId, published: schedulePublication }) } };
}

const displacedTrainingFixtures = Prisma.sql`
  SELECT s.competitionId,a.fixtureId FROM FootballFixtureAudit a
  STRAIGHT_JOIN FootballSeason s ON s.id=JSON_UNQUOTE(JSON_EXTRACT(a.changes,'$.seasonId.before'))
  WHERE a.dataVersion>1`;

/** An identity superset from the source database. The individual label still has to predate its fixture's lock. */
export async function readNovemberReplayTrainingMembership(database: ReplayDatabase, auditedAt?: number): Promise<NovemberReplayTrainingMembership> {
  const observedBefore = utcInstantFromEpochMilliseconds(auditedAt ?? await database.query(async (tx) =>
    historyTime((await tx.$queryRaw<[{ at: Date }]>`SELECT UTC_TIMESTAMP(3) AS at`)[0].at)));
  const rows = await database.query((tx) => tx.$queryRaw<{ competitionId: string; fixtureId: string }[]>(Prisma.sql`
    SELECT s.competitionId,f.id AS fixtureId FROM (
      SELECT DISTINCT fixtureId FROM FixtureResult WHERE observedAt<${new Date(observedBefore)}
    ) labeled JOIN FootballFixture f ON f.id=labeled.fixtureId AND f.provider='api-football'
    JOIN FootballSeason s ON s.id=f.seasonId
    UNION ${displacedTrainingFixtures}`));
  const competitions = new Map<string, string[]>();
  for (const row of rows) {
    let members = competitions.get(row.competitionId);
    if (!members) { members = []; competitions.set(row.competitionId, members); }
    members.push(row.fixtureId);
  }
  return { observedBefore, byCompetition: competitions };
}

async function readHistoryCandidates(tx: Pick<Prisma.TransactionClient, "$queryRaw">, occurrence: NovemberReplayOccurrence,
  cutoffAt: number, membership: Prisma.Sql, lookbackMs: number): Promise<HistoryRow[]> {
  const lock = new Date(cutoffAt), lower = new Date(cutoffAt - 1 - lookbackMs);
  return tx.$queryRaw<HistoryRow[]>(Prisma.sql`
    WITH candidates AS (
      ${membership}
    ), versions AS (
      SELECT a.fixtureId,
        MAX(IF(JSON_CONTAINS_PATH(a.changes,'one','$.homeTeamId.after'),a.dataVersion,NULL)) AS homeVersion,
        MAX(IF(JSON_CONTAINS_PATH(a.changes,'one','$.awayTeamId.after'),a.dataVersion,NULL)) AS awayVersion,
        MAX(IF(JSON_CONTAINS_PATH(a.changes,'one','$.seasonId.after'),a.dataVersion,NULL)) AS seasonVersion,
        MAX(IF(JSON_CONTAINS_PATH(a.changes,'one','$.status.after'),a.dataVersion,NULL)) AS statusVersion,
        MAX(IF(JSON_CONTAINS_PATH(a.changes,'one','$.kickoff.after'),a.dataVersion,NULL)) AS kickoffVersion
      FROM candidates c JOIN FootballFixtureAudit a ON a.fixtureId=c.fixtureId JOIN FootballImport i ON i.id=a.importId
      WHERE i.provider='api-football' AND i.recordedAt<${lock} AND a.observedAt<${lock} AND a.fixtureId<>${occurrence.fixtureId}
      GROUP BY a.fixtureId
    ), identities AS (
      SELECT v.*, s.competitionId, JSON_UNQUOTE(JSON_EXTRACT(h.changes,'$.homeTeamId.after')) AS homeTeamId,
        JSON_UNQUOTE(JSON_EXTRACT(a.changes,'$.awayTeamId.after')) AS awayTeamId,
        JSON_UNQUOTE(JSON_EXTRACT(k.changes,'$.kickoff.after')) AS kickoff,
        JSON_UNQUOTE(JSON_EXTRACT(st.changes,'$.status.after')) AS catalogStatus
      FROM versions v JOIN FootballFixtureAudit h ON h.fixtureId=v.fixtureId AND h.dataVersion=v.homeVersion
      JOIN FootballFixtureAudit a ON a.fixtureId=v.fixtureId AND a.dataVersion=v.awayVersion
      JOIN FootballFixtureAudit k ON k.fixtureId=v.fixtureId AND k.dataVersion=v.kickoffVersion
      JOIN FootballFixtureAudit st ON st.fixtureId=v.fixtureId AND st.dataVersion=v.statusVersion
      JOIN FootballFixtureAudit season ON season.fixtureId=v.fixtureId AND season.dataVersion=v.seasonVersion
      JOIN FootballSeason s ON s.id=JSON_UNQUOTE(JSON_EXTRACT(season.changes,'$.seasonId.after'))
      WHERE s.competitionId=${occurrence.competitionId}
        AND JSON_UNQUOTE(JSON_EXTRACT(k.changes,'$.kickoff.after'))>=${lower.toISOString()}
        AND JSON_UNQUOTE(JSON_EXTRACT(k.changes,'$.kickoff.after'))<${lock.toISOString()}
    ), frozen AS (
      SELECT r.id, p.fixtureId, p.competitionId, p.homeTeamId, p.awayTeamId, p.kickoff,
        GREATEST(r.observedAt,COALESCE(sourceEvent.at,sourceImport.recordedAt)) AS availableAt,
        CASE WHEN sourceEvent.at IS NULL THEN sourceImport.id ELSE NULL END AS catalogImportId,
        ROW_NUMBER() OVER (ORDER BY p.kickoff DESC,p.fixtureId DESC) AS historyOrder
      FROM identities p JOIN FixtureResult r ON r.id=(
        SELECT possible.id
        FROM FixtureResult possible LEFT JOIN PredictionChangeEvent ev ON ev.fixtureResultId=possible.id
        LEFT JOIN FootballFixtureAudit audit ON audit.fixtureId=possible.fixtureId AND audit.dataVersion=possible.fixtureVersion
        LEFT JOIN FootballImport receipt ON receipt.id=audit.importId AND receipt.provider='api-football'
        WHERE possible.fixtureId=p.fixtureId AND possible.observedAt<${lock} AND COALESCE(ev.at,receipt.recordedAt)<${lock}
        ORDER BY possible.fixtureVersion DESC,possible.observedAt DESC,possible.id DESC LIMIT 1
      )
      LEFT JOIN PredictionChangeEvent sourceEvent ON sourceEvent.fixtureResultId=r.id
      LEFT JOIN FootballFixtureAudit sourceAudit ON sourceAudit.fixtureId=r.fixtureId AND sourceAudit.dataVersion=r.fixtureVersion
      LEFT JOIN FootballImport sourceImport ON sourceImport.id=sourceAudit.importId AND sourceImport.provider='api-football'
      WHERE r.fixtureVersion>=GREATEST(p.homeVersion,p.awayVersion,p.seasonVersion,p.kickoffVersion)
        AND r.regulationVerified=TRUE AND r.status IN ('finished-regulation','finished-extra-time','finished-penalties')
        AND (p.statusVersion<=r.fixtureVersion OR p.catalogStatus=r.status)
        AND NOT EXISTS (
          SELECT 1 FROM FixtureLifecycleObservation life
          WHERE life.fixtureId=p.fixtureId AND life.at<${lock} AND life.retrievedAt<${lock} AND life.fixtureVersion>r.fixtureVersion
            AND (life.outcome='conflict' OR (life.outcome IN ('accepted','unchanged') AND (
              JSON_UNQUOTE(JSON_EXTRACT(life.receiptJson,'$.observation.status'))<>r.status OR
              (JSON_TYPE(JSON_EXTRACT(life.receiptJson,'$.observation.kickoffAt')) IN ('INTEGER','UNSIGNED INTEGER') AND
                CAST(JSON_UNQUOTE(JSON_EXTRACT(life.receiptJson,'$.observation.kickoffAt')) AS SIGNED)<>TIMESTAMPDIFF(MICROSECOND,'1970-01-01 00:00:00.000',
                  CAST(REPLACE(LEFT(p.kickoff,23),'T',' ') AS DATETIME(3))) DIV 1000)
            )))
        )
    )
    SELECT r.*, p.competitionId,p.homeTeamId,p.awayTeamId,p.kickoff,p.availableAt,p.catalogImportId,
      r.integrity=SHA2(CAST(r.body AS CHAR),256) AS validIntegrity
    FROM frozen p JOIN FixtureResult r ON r.id=p.id AND r.fixtureId=p.fixtureId
    WHERE p.historyOrder<=${fixtureModelEvidenceBounds.history} ORDER BY p.historyOrder`);
}

const maximumMembershipBatch = 8_000;
const descendingText = (left: string, right: string) => left === right ? 0 : left > right ? -1 : 1;

/** Reconstruct each training label from append-only records visible before this lock. */
export async function readNovemberReplayHistory(tx: Pick<Prisma.TransactionClient, "$queryRaw">, occurrence: NovemberReplayOccurrence,
  cutoffAt: number, fixtureIds?: readonly string[], lookbackMs = localGoalDefaults.lookbackMs): Promise<FixtureModelHistoryRow[]> {
  let rows: HistoryRow[] = [];
  if (fixtureIds === undefined) {
    rows = await readHistoryCandidates(tx, occurrence, cutoffAt, Prisma.sql`
      SELECT f.id AS fixtureId FROM FootballSeason s JOIN FootballFixture f ON f.seasonId=s.id
      WHERE s.competitionId=${occurrence.competitionId} AND f.provider='api-football'
      UNION
      SELECT prior.fixtureId FROM (${displacedTrainingFixtures}) prior WHERE prior.competitionId=${occurrence.competitionId}`, lookbackMs);
  } else {
    const ids = [...new Set(fixtureIds)];
    for (let offset = 0; offset < ids.length; offset += maximumMembershipBatch) {
      const batch = ids.slice(offset, offset + maximumMembershipBatch);
      const candidates = await readHistoryCandidates(tx, occurrence, cutoffAt, Prisma.sql`
        SELECT id AS fixtureId FROM FootballFixture WHERE id IN (${Prisma.join(batch)})`, lookbackMs);
      // Every global top-N row is also in its own batch's top N. Apply the
      // global cutoff before decoding or filtering any sealed result.
      rows = [...rows, ...candidates].sort((a, b) => descendingText(String(a.kickoff), String(b.kickoff)) ||
        descendingText(String(a.fixtureId), String(b.fixtureId))).slice(0, fixtureModelEvidenceBounds.history);
    }
  }
  return rows.flatMap((row) => {
    const result = fixtureResultFromRow(row);
    const kickoffAt = utcInstantFromEpochMilliseconds(Date.parse(String(row.kickoff))), availableAt = historyTime(row.availableAt);
    const catalogSeed = row.catalogImportId === null || result.observationId === evidenceFingerprint({
      importId: row.catalogImportId, fixtureId: result.fixtureId, observedAt: result.observedAt });
    if (!catalogSeed || !isPlayedFinalStatus(result.status) || !result.regulation.verified || result.observedAt <= kickoffAt ||
      availableAt >= cutoffAt || result.providerUpdatedAt !== null && result.providerUpdatedAt > result.observedAt) return [];
    return [{ fixtureId: result.fixtureId, competitionId: String(row.competitionId),
      homeTeamId: String(row.homeTeamId), awayTeamId: String(row.awayTeamId), kickoffAt, availableAt,
      homeGoals: result.regulation.home!, awayGoals: result.regulation.away!, period: marketRules.period,
      observationHash: result.id, evidenceRef: result.regulation.evidenceRef!,
      halfTime: result.halfTime ? { home: result.halfTime.home, away: result.halfTime.away } : null }];
  });
}

function replayModelCoverage(inputs: FixtureModelEvidence, historyFrom: number) {
  const { history, fixture, relationships, coverage } = inputs;
  return { historyFrom, cutoffAt: fixture.forecastAt + 1, competitionMatches: history.length,
    homeTeamMatches: relationships.home.length, awayTeamMatches: relationships.away.length,
    headToHeadMatches: relationships.direct.length, commonOpponents: relationships.commonOpponents.length,
    homeTeamAsHome: history.filter(({ homeTeamId, neutralVenue }) => homeTeamId === fixture.homeTeamId && neutralVenue !== true).length,
    awayTeamAsAway: history.filter(({ awayTeamId, neutralVenue }) => awayTeamId === fixture.awayTeamId && neutralVenue !== true).length,
    verifiedVenueFacts: history.filter(({ neutralVenue }) => neutralVenue !== undefined).length,
    verifiedHalfTime: coverage.verifiedHalfTime, excludedRows: coverage.excludedRows,
    ambiguousOccurrences: coverage.ambiguousOccurrences, sampleCap: fixtureModelEvidenceBounds.history,
    latestKickoffAt: history[0]?.kickoffAt ?? null, earliestKickoffAt: history.at(-1)?.kickoffAt ?? null };
}

/** Uses one millisecond before effective lock as the final instant a pre-match prediction could have used. */
export async function loadNovemberReplayEvidence(database: ReplayDatabase, occurrence: NovemberReplayOccurrence,
  auditedAt: number, training?: NovemberReplayTrainingMembership): Promise<NovemberReplayEvidence> {
  return database.query((tx) => loadReplayEvidence(tx, occurrence, auditedAt, training));
}

export async function loadNovemberReplayEvidenceInTransaction(tx: Prisma.TransactionClient, occurrence: NovemberReplayOccurrence,
  auditedAt: number, training?: NovemberReplayTrainingMembership, priced = false, withCoverage = false): Promise<NovemberReplayEvidence> {
  return loadReplayEvidence(tx, occurrence, auditedAt, training, priced, withCoverage);
}

async function loadReplayEvidence(tx: Prisma.TransactionClient, occurrence: NovemberReplayOccurrence, auditedAt: number,
  training?: NovemberReplayTrainingMembership, priced = false, withCoverage = false): Promise<NovemberReplayEvidence> {
  utcInstantFromEpochMilliseconds(auditedAt);
  const identity = { fixtureId: occurrence.fixtureId, competitionId: occurrence.competitionId,
    homeTeamId: occurrence.homeTeamId, awayTeamId: occurrence.awayTeamId, kickoffAt: occurrence.kickoffAt };
  function finish(status: NovemberReplayEvidence["status"], reason: string | null, schedule: ScheduleEvidence | null,
    forecast: LocalGoalForecast | null = null, decisionAt?: number, modelCoverage?: ReplayModelCoverage): NovemberReplayEvidence {
    return freezeEvidence({ status, reason, cutoffAt: schedule?.cutoffAt ?? null, scheduleHash: schedule?.scheduleHash ?? null,
      ...(decisionAt !== undefined && { decisionAt }), ...(modelCoverage && { modelCoverage }),
      scheduleVersion: schedule?.scheduleVersion ?? null, historyMatches: forecast?.diagnostics.matches ?? 0,
      evidenceReceiptIds: forecast?.historyIds ?? [], forecast,
      evidenceHash: evidenceFingerprint({ version: "november-replay-evidence-v1", identity, status, reason, schedule,
        modelVersion: localGoalModelVersion(), forecastHash: forecast?.hash ?? null }) });
  }
  if (!occurrence.applicable) return finish("abstained", "displaced-occurrence", null);
  const { prospective, reason, schedule, publication } = await readReplaySchedule(tx, occurrence, auditedAt, priced, withCoverage);
  if (prospective) return finish("prospective", null, null);
  if (!schedule) return finish("abstained", reason, null);
  const decisionAt = priced ? schedule.cutoffAt - 1 : undefined;
  const originalCutoffAt = priced ? publication?.evidenceCutoffAt : undefined;
  const forecastSchedule = originalCutoffAt === undefined ? schedule : { ...schedule, cutoffAt: originalCutoffAt };
  const archivedDecision = priced ? publication?.decision : undefined;
  const forecastAt = forecastSchedule.cutoffAt - 1;
  const fixture = { ...identity, forecastAt };
  const fixtureIds = training ? training.byCompetition.get(occurrence.competitionId) ?? [] : undefined;
  let modelCoverage: ReplayModelCoverage | undefined, coveredHistory: readonly FixtureModelHistoryRow[] | undefined;
  if (withCoverage && (!priced || occurrence.originalRevisionId === null || originalCutoffAt !== undefined) &&
    (!training || training.observedBefore >= forecastSchedule.cutoffAt)) {
    const from = new Date(forecastAt);
    from.setUTCFullYear(from.getUTCFullYear() - 3);
    const history = await readNovemberReplayHistory(tx, occurrence, forecastSchedule.cutoffAt, fixtureIds, forecastAt - from.getTime());
    const inputs = buildFixtureModelEvidence({ fixture, history });
    modelCoverage = replayModelCoverage(inputs, from.getTime());
    coveredHistory = history;
  }
  if (publication && decisionAt !== undefined &&
    archivedDecision?.markets.some((market) => market.source === "local-engine" && market.definition)) {
    return freezeEvidence({ status: "qualified", reason: null, cutoffAt: archivedDecision.evidenceCutoffAt,
      scheduleHash: schedule.scheduleHash, scheduleVersion: schedule.scheduleVersion, historyMatches: 0, forecast: null,
      decisionAt, archivedDecision, ...(modelCoverage && { modelCoverage }), contextCoverage: publication.contextCoverage ?? null,
      evidenceReceiptIds: [publication.receiptId, publication.snapshotId],
      evidenceHash: evidenceFingerprint({ version: "archived-local-replay-v1", identity, schedule,
        receipt: publication.receiptId, snapshot: publication.snapshotId, decision: archivedDecision.hash }) });
  }
  if (priced && occurrence.originalRevisionId !== null && originalCutoffAt === undefined)
    return finish("abstained", "original-evidence-cutoff-unverified", schedule, null, decisionAt);
  if (training && training.observedBefore < forecastSchedule.cutoffAt)
    return finish("abstained", "training-membership-precedes-cutoff", forecastSchedule, null, decisionAt);
  const history = coveredHistory?.filter(({ kickoffAt }) => kickoffAt >= forecastAt - localGoalDefaults.lookbackMs) ??
    await readNovemberReplayHistory(tx, occurrence, forecastSchedule.cutoffAt, fixtureIds);
  const inputs = buildFixtureModelEvidence({ fixture, history });
  const forecast = estimateLocalGoals({ fixture: inputs.fixture, history: inputs.history.map(({ halfTime, ...result }) => {
    void halfTime;
    return result;
  }) });
  return forecast.status === "estimated" && forecast.expectedGoals && forecast.probabilities
    ? finish("qualified", null, forecastSchedule, forecast, decisionAt, modelCoverage)
    : finish("abstained", forecast.reasons[0] ?? "insufficient-point-in-time-history", forecastSchedule, forecast, decisionAt, modelCoverage);
}
