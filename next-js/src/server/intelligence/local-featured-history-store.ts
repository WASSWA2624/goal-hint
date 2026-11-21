import "server-only";

import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { registeredForecastGoalMarkets } from "../../domain/goal-market-definitions.ts";
import type { LocalFeaturedHistoryContext, LocalFeaturedHistoryObservation } from "../../domain/local-featured-history.ts";
import { marketRules, marketSelections, type MarketFamily } from "../../domain/markets.ts";
import { settleGoalSelection, type GoalGrade, type GoalMarketDefinition, type GoalSettlementContext } from "../../domain/score-distribution-markets.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, parseEvidenceSnapshot } from "../evidence/evidence-input.ts";
import { evidenceSourceExclusion } from "../evidence/evidence-snapshot.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { cutoffOperationFromRow } from "../predictions/cutoff-read.ts";
import { canonicalLegacyForecastSelection, legacyForecastMarketKey } from "../predictions/forecast-market-evaluator.ts";
import { goalMarketExtensionFromRow } from "../predictions/goal-market-store.ts";
import type { StoredRevision } from "../predictions/history-contract.ts";
import { historyJson, historyTime, revisionFromRows, type HistoryRow } from "../predictions/history-read.ts";
import type { RefreshPublicationResult } from "../predictions/publication-contract.ts";
import { refreshResultFromRow } from "../predictions/publication-read.ts";
import { fixtureResultFromRow, type StoredFixtureResult } from "../results/result-read.ts";

const pageSize = 100;
const definitions = new Map(registeredForecastGoalMarkets(true).map(({ definition }) => [definition.key, definition]));
const families = Object.keys(marketSelections) as MarketFamily[];

type Pointer = {
  revisionId: string; fixtureId: string; kickoffAt: Date; publishedAt: Date;
  homeTeamId: string; awayTeamId: string; externalId: bigint; competitionId: string | null; seasonId: string | null;
  closeId: string; voidId: string | null; receiptId: string; venueSnapshot: unknown | null;
};
type ExactOutcome = Readonly<{ definition: GoalMarketDefinition; selection: string; probability: number }>;
type Archive = Readonly<{ source: Pointer; revision: StoredRevision; lockedAt: number; voidedAt: number | null;
  context: LocalFeaturedHistoryContext; outcomes: ExactOutcome[] }>;
type Tx = Prisma.TransactionClient;
type Coverage = {
  candidates: number; verifiedOriginals: number; originalsWithLocalOutcomes: number;
  originalsWithSettledOutcomes: number; resultRevisions: number; unusableOriginals: number; unusableResults: number;
};

async function archivePage(tx: Tx, before: Date, cursor: Pointer | undefined): Promise<Pointer[]> {
  const after = cursor ? Prisma.sql`AND (ps.publishedAt>${cursor.publishedAt}
    OR (ps.publishedAt=${cursor.publishedAt} AND ps.id>${cursor.revisionId}))` : Prisma.empty;
  return tx.$queryRaw<Pointer[]>(Prisma.sql`
    SELECT ps.id AS revisionId,ps.fixtureId,es.kickoffAt,ps.publishedAt,es.homeTeamId,es.awayTeamId,f.externalId,
      season.competitionId,season.id AS seasonId,cl.id AS closeId,v.id AS voidId,receipt.id AS receiptId,
      CASE WHEN JSON_SEARCH(es.snapshotJson,'one','venue',NULL,'$.facts[*].kind') IS NOT NULL
        THEN es.snapshotJson ELSE NULL END AS venueSnapshot
    FROM PredictionSet ps
    STRAIGHT_JOIN PredictionCycleOperation cl ON cl.cycleId=ps.cycleId AND cl.fixtureId=ps.fixtureId
      AND cl.kind='close' AND cl.revisionId=ps.id AND cl.at<${before}
    STRAIGHT_JOIN FootballFixture f ON f.id=ps.fixtureId AND f.provider='api-football'
    STRAIGHT_JOIN PredictionSchedule s ON s.cycleId=ps.cycleId AND s.version=ps.scheduleVersion AND s.fixtureId=ps.fixtureId
      AND s.observedAt<=ps.publishedAt AND s.cutoffAt>ps.recordedAt
    STRAIGHT_JOIN FixtureEvidenceSnapshot es ON es.requestId=ps.evidenceSnapshotId AND es.fixtureId=ps.fixtureId
      AND es.cycleId=ps.cycleId AND es.runId=ps.runId AND es.fixtureVersion=ps.fixtureVersion AND es.contentHash=ps.evidenceHash
      AND es.kickoffAt=s.kickoffAt AND es.cutoffAt=ps.evidenceCutoffAt AND es.analysisAt<=ps.generationCompletedAt
      AND es.integrity=SHA2(CONCAT(es.requestId,':',es.requestFingerprint,':',CAST(es.snapshotJson AS CHAR)),256)
    STRAIGHT_JOIN DailyRun dr ON dr.id=ps.runId AND dr.sequence=ps.runSequence
      AND dr.committedAt IS NOT NULL AND dr.committedAt<=ps.publishedAt
    STRAIGHT_JOIN PredictionRefreshResult receipt ON receipt.id=(
      SELECT accepted.id FROM PredictionRefreshResult accepted
      WHERE accepted.runId=ps.runId AND accepted.fixtureId=ps.fixtureId AND accepted.cycleId=ps.cycleId
        AND accepted.revisionId=ps.id AND accepted.jobId=ps.jobId AND accepted.at=ps.publishedAt
        AND accepted.outcome='published' AND accepted.reason='accepted'
      ORDER BY accepted.id LIMIT 1
    )
    LEFT JOIN FootballFixtureAudit catalog ON catalog.id=(
      SELECT aud.id FROM FootballFixtureAudit aud
      JOIN FootballImport imp ON imp.id=aud.importId AND imp.provider='api-football'
      WHERE aud.fixtureId=ps.fixtureId AND aud.dataVersion<=ps.fixtureVersion
        AND aud.observedAt<=ps.publishedAt AND imp.recordedAt<=ps.publishedAt
        AND JSON_CONTAINS_PATH(aud.changes,'one','$.seasonId.after')
      ORDER BY aud.dataVersion DESC LIMIT 1
    )
    LEFT JOIN FootballSeason season ON season.id=JSON_UNQUOTE(JSON_EXTRACT(catalog.changes,'$.seasonId.after'))
    LEFT JOIN PredictionCycleOperation v ON v.cycleId=ps.cycleId AND v.fixtureId=ps.fixtureId AND v.kind='void' AND v.at<${before}
    WHERE ps.publishedAt<${before} AND ps.recordedAt<es.kickoffAt AND es.kickoffAt<${before}
      AND (EXISTS (SELECT 1 FROM MarketPrediction m WHERE m.setId=ps.id AND m.available=TRUE AND m.source='local-engine')
        OR EXISTS (SELECT 1 FROM GoalMarketExtension g WHERE g.revisionId=ps.id
          AND JSON_CONTAINS_PATH(g.body,'one','$.localPoisson'))
        OR JSON_SEARCH(receipt.resultJson,'one','local-engine',NULL,'$.forecastDecision.markets[*].source') IS NOT NULL)
      ${after}
    ORDER BY ps.publishedAt,ps.id LIMIT ${pageSize}`);
}

function groupRows(rows: HistoryRow[], key: string) {
  const groups = new Map<unknown, HistoryRow[]>();
  for (const row of rows) {
    const identity = row[key], group = groups.get(identity) ?? [];
    group.push(row);
    groups.set(identity, group);
  }
  return groups;
}

/** Read original event probabilities without rebasing old forecasts onto a later market catalog. */
function exactOutcomes(revision: StoredRevision, receipt: RefreshPublicationResult,
  extensionRow: HistoryRow | undefined, deadline: number) {
  const outcomes = new Map<string, ExactOutcome>();
  function record(definition: GoalMarketDefinition, selection: string, probability: number) {
    const key = definition.key + "|" + selection;
    if (!outcomes.has(key)) outcomes.set(key, { definition, selection, probability });
  }
  for (const { definition, source, selections } of receipt.forecastDecision?.markets ?? []) {
    if (source === "local-engine" && definition) {
      for (const { key, outcomes: mass } of selections) record(definition, key, Number(mass.win));
    }
  }
  for (const family of families) {
    const snapshot = revision.candidate.markets[family];
    if (!snapshot.available || snapshot.market.source !== "local-engine") continue;
    const definition = definitions.get(legacyForecastMarketKey(family));
    if (!definition) continue;
    const probabilities: Readonly<Record<string, number>> = snapshot.market.probabilities;
    for (const selection of marketSelections[family]) {
      const identity = canonicalLegacyForecastSelection(family, selection);
      if (identity) record(definition, identity, probabilities[selection]!);
    }
  }
  if (extensionRow && historyTime(extensionRow.recordedAt) < deadline) {
    const extension = goalMarketExtensionFromRow(extensionRow);
    for (const market of extension.markets) {
      const local = market.localDerivation ?? market.derivation;
      if (local.available && local.market.source === "local-poisson") {
        for (const { key, outcomes: mass } of local.market.selections) record(market.definition, key, mass.win);
      }
    }
  }
  return [...outcomes.values()];
}

function archivedNeutralVenue(pointer: Pointer, revision: StoredRevision) {
  if (pointer.venueSnapshot === null) return;
  const snapshot = parseEvidenceSnapshot(historyJson(pointer.venueSnapshot));
  if (snapshot.hash !== revision.evidenceHash ||
    evidenceFingerprint(snapshot.context) !== evidenceFingerprint(revision.candidate.context.context)) return;
  const sources = new Set(snapshot.sources.filter((source) => source.kind === "football" &&
    source.retrievedAt < revision.publishedAt && evidenceSourceExclusion(source, snapshot.context, snapshot.policy) === null)
    .map(({ id }) => id));
  const venue = new Set<boolean>();
  for (const { kind, flags, values } of snapshot.facts) {
    if (kind !== "venue" || flags.includes("conflict")) continue;
    for (const { value, sourceIds, certainty } of values) {
      if (certainty === "confirmed" && sourceIds.some((id) => sources.has(id)) && typeof value.neutral === "boolean")
        venue.add(value.neutral);
    }
  }
  if (venue.size === 1) return [...venue][0];
}

function verifiedVoidClock(row: HistoryRow | undefined, revision: StoredRevision, lockedAt: number) {
  if (!row) return null;
  try {
    const operation = cutoffOperationFromRow(row, "void");
    return operation.cycleId === revision.cycleId && operation.fixtureId === revision.fixtureId && operation.at >= lockedAt
      ? operation.at : null;
  } catch { return null; }
}

async function readArchives(tx: Tx, pointers: Pointer[], coverage: Coverage): Promise<Archive[]> {
  const ids = Prisma.join(pointers.map(({ revisionId }) => revisionId));
  const revisions = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *,
    integrity=SHA2(CONCAT(id,':',requestHash,':',CAST(candidateJson AS CHAR)),256) AS validIntegrity
    FROM PredictionSet WHERE id IN (${ids})`);
  const markets = groupRows(await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *,
    integrity=SHA2(CAST(payloadJson AS CHAR),256) AS validIntegrity FROM MarketPrediction WHERE setId IN (${ids})`), "setId");
  const receipts = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *,
    integrity=SHA2(CAST(resultJson AS CHAR),256) AS validIntegrity FROM PredictionRefreshResult
    WHERE id IN (${Prisma.join(pointers.map(({ receiptId }) => receiptId))})`);
  const operations = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *,
    integrity=SHA2(CAST(operationJson AS CHAR),256) AS validIntegrity FROM PredictionCycleOperation
    WHERE id IN (${Prisma.join(pointers.flatMap(({ closeId, voidId }) => voidId ? [closeId, voidId] : [closeId]))})`);
  const extensions = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *,
    integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity FROM GoalMarketExtension
    WHERE revisionId IN (${ids}) AND JSON_CONTAINS_PATH(body,'one','$.localPoisson')`);
  const revisionsById = new Map(revisions.map((row) => [row.id, row]));
  const receiptsById = new Map(receipts.map((row) => [row.id, row]));
  const operationById = new Map(operations.map((row) => [row.id, row]));
  const extensionsById = new Map(extensions.map((row) => [row.revisionId, row]));
  return pointers.flatMap((source) => {
    try {
      const revision = revisionFromRows(revisionsById.get(source.revisionId)!, markets.get(source.revisionId) ?? []);
      const receipt = refreshResultFromRow(receiptsById.get(source.receiptId)!);
      const close = cutoffOperationFromRow(operationById.get(source.closeId)!, "close");
      const original = revision.candidate.context.context, kickoffAt = source.kickoffAt.getTime();
      const deadline = Math.min(close.effectiveCloseAt, close.cycle.cutoffAt, kickoffAt);
      if (revision.fixtureId !== source.fixtureId || original.kickoffAt !== kickoffAt || Number(source.externalId) !== original.externalFixtureId ||
        original.home.teamId !== source.homeTeamId || original.away.teamId !== source.awayTeamId ||
        close.cycle.id !== revision.cycleId || close.cycle.kickoffAt !== kickoffAt || close.cycle.lockedSetId !== revision.id ||
        close.at < revision.recordedAt || revision.recordedAt >= deadline || revision.evidenceCutoffAt > kickoffAt ||
        receipt.fixtureId !== revision.fixtureId || receipt.cycleId !== revision.cycleId || receipt.revisionId !== revision.id ||
        receipt.runId !== revision.runId || receipt.runSequence !== revision.runSequence || receipt.jobId !== revision.jobId ||
        receipt.evidenceSnapshotId !== revision.evidenceSnapshotId || receipt.candidateHash !== evidenceFingerprint(revision.candidate) ||
        receipt.at !== revision.publishedAt || receipt.generationCompletedAt !== revision.generationCompletedAt ||
        receipt.observation.status !== "scheduled" || receipt.observation.actualStartedAt !== null ||
        receipt.observation.kickoffAt !== kickoffAt || receipt.observation.externalFixtureId !== original.externalFixtureId ||
        receipt.observation.retrievedAt > receipt.at) throw new Error("Unverified original forecast occurrence.");
      const outcomes = exactOutcomes(revision, receipt, extensionsById.get(source.revisionId), deadline);
      const neutralVenue = archivedNeutralVenue(source, revision);
      const context = { ...(source.competitionId ? { competitionId: source.competitionId } : {}),
        homeTeamId: source.homeTeamId, awayTeamId: source.awayTeamId,
        ...(neutralVenue === undefined ? {} : { neutralVenue }) };
      coverage.verifiedOriginals++;
      if (outcomes.length) coverage.originalsWithLocalOutcomes++;
      const voidedAt = verifiedVoidClock(operationById.get(source.voidId), revision, close.at);
      return outcomes.length ? [{ source, revision, lockedAt: close.at, voidedAt, context, outcomes }] : [];
    } catch {
      coverage.unusableOriginals++;
      return [];
    }
  });
}

const grades: Partial<Record<ReturnType<typeof settleGoalSelection>["status"], GoalGrade>> = {
  correct: "win", incorrect: "loss", "half-win": "half-win", "half-loss": "half-loss", push: "push",
};

function invalidationClock(archive: Archive, changes: HistoryRow[]) {
  const { source, revision, voidedAt } = archive;
  let first = voidedAt ?? Infinity;
  for (const row of changes) {
    if (typeof row.dataVersion !== "bigint" || row.dataVersion <= revision.fixtureVersion) continue;
    const { homeTeam, awayTeam, kickoff, season, previousSeason } = row;
    const changed = homeTeam !== null && homeTeam !== source.homeTeamId ||
      awayTeam !== null && awayTeam !== source.awayTeamId ||
      kickoff !== null && (typeof kickoff !== "string" || Date.parse(kickoff) !== source.kickoffAt.getTime()) ||
      season !== null && (source.seasonId !== null ? season !== source.seasonId : previousSeason !== null && previousSeason !== "null");
    if (changed) first = Math.min(first, historyTime(row.availableAt));
  }
  return Number.isFinite(first) ? first : undefined;
}

async function readResultObservations(tx: Tx, archives: Archive[], before: Date, coverage: Coverage) {
  const ids = Prisma.join([...new Set(archives.map(({ revision }) => revision.fixtureId))]);
  const resultRows = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`
    SELECT r.*,r.integrity=SHA2(CAST(r.body AS CHAR),256) AS validIntegrity,
      GREATEST(r.observedAt,COALESCE(ev.at,imp.recordedAt)) AS availableAt,
      CASE WHEN ev.at IS NULL THEN imp.id ELSE NULL END AS catalogImportId
    FROM FixtureResult r
    LEFT JOIN PredictionChangeEvent ev ON ev.fixtureResultId=r.id AND ev.fixtureId=r.fixtureId AND ev.version=r.fixtureVersion
    LEFT JOIN FootballFixtureAudit aud ON aud.fixtureId=r.fixtureId AND aud.dataVersion=r.fixtureVersion
    LEFT JOIN FootballImport imp ON imp.id=aud.importId AND imp.provider='api-football'
    WHERE r.fixtureId IN (${ids}) AND r.observedAt<${before} AND COALESCE(ev.at,imp.recordedAt)<${before}
    ORDER BY r.fixtureId,r.fixtureVersion,r.observedAt,r.id`);
  const byFixture = groupRows(resultRows, "fixtureId");
  const identityChanges = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`
    SELECT aud.fixtureId,aud.dataVersion,GREATEST(aud.observedAt,imp.recordedAt) AS availableAt,
      JSON_UNQUOTE(JSON_EXTRACT(aud.changes,'$.homeTeamId.after')) AS homeTeam,
      JSON_UNQUOTE(JSON_EXTRACT(aud.changes,'$.awayTeamId.after')) AS awayTeam,
      JSON_UNQUOTE(JSON_EXTRACT(aud.changes,'$.kickoff.after')) AS kickoff,
      JSON_UNQUOTE(JSON_EXTRACT(aud.changes,'$.seasonId.before')) AS previousSeason,
      JSON_UNQUOTE(JSON_EXTRACT(aud.changes,'$.seasonId.after')) AS season
    FROM FootballFixtureAudit aud JOIN FootballImport imp ON imp.id=aud.importId AND imp.provider='api-football'
    WHERE aud.fixtureId IN (${ids}) AND aud.observedAt<${before} AND imp.recordedAt<${before}
      AND JSON_CONTAINS_PATH(aud.changes,'one','$.homeTeamId.after','$.awayTeamId.after','$.seasonId.after','$.kickoff.after')`);
  const changesByFixture = groupRows(identityChanges, "fixtureId");
  return archives.flatMap((archive) => {
    const { source, revision, lockedAt, context, outcomes } = archive;
    const fixtureKickoffAt = source.kickoffAt.getTime();
    const occurrenceInvalidatedAt = invalidationClock(archive, changesByFixture.get(revision.fixtureId) ?? []);
    const observations: LocalFeaturedHistoryObservation[] = [];
    let settled = false;
    for (const row of byFixture.get(revision.fixtureId) ?? []) {
      let result: StoredFixtureResult, resultAvailableAt: number;
      try {
        result = fixtureResultFromRow(row);
        resultAvailableAt = historyTime(row.availableAt);
        if (result.observedAt <= fixtureKickoffAt || result.fixtureVersion < revision.fixtureVersion ||
          result.providerUpdatedAt !== null && result.providerUpdatedAt > result.observedAt ||
          row.catalogImportId !== null && result.observationId !== evidenceFingerprint({
            importId: row.catalogImportId, fixtureId: result.fixtureId, observedAt: result.observedAt })) continue;
      } catch {
        coverage.unusableResults++;
        continue;
      }
      if (occurrenceInvalidatedAt !== undefined && occurrenceInvalidatedAt <= resultAvailableAt) continue;
      const { regulation, halfTime } = result;
      const truth: GoalSettlementContext = {
        status: result.status, cycleEligibility: { eligible: true }, halfTimeScore: halfTime ?? null,
        regulationScore: regulation.verified && regulation.home !== null && regulation.away !== null
          ? { verified: true, home: regulation.home, away: regulation.away, period: marketRules.period } : null,
      };
      coverage.resultRevisions++;
      for (const { definition, selection, probability } of outcomes) {
        const grade = grades[settleGoalSelection(definition, selection, truth).status] ?? null;
        settled ||= grade !== null;
        observations.push({ fixtureId: revision.fixtureId, revisionId: revision.id, marketKey: definition.key, selection, probability,
          source: "local-engine", origin: "original", accepted: true, fixtureKickoffAt, originalLockedAt: lockedAt,
          evidenceCutoffAt: revision.evidenceCutoffAt, publishedAt: revision.publishedAt,
          resultId: result.id, resultObservedAt: result.observedAt, resultAvailableAt, grade, context,
          ...(occurrenceInvalidatedAt === undefined ? {} : { occurrenceInvalidatedAt }) });
      }
    }
    if (settled) coverage.originalsWithSettledOutcomes++;
    return observations;
  });
}

/** Load all retained accepted original Local forecasts and result revisions in bounded pages.
 * Consumers choose the result revision available strictly before their own target cutoff. */
export async function readLocalFeaturedHistory(database: Pick<DatabaseRuntime, "query">, input: Readonly<{ before: number }>) {
  const before = new Date(utcInstantFromEpochMilliseconds(input.before));
  const coverage: Coverage = { candidates: 0, verifiedOriginals: 0, originalsWithLocalOutcomes: 0,
    originalsWithSettledOutcomes: 0, resultRevisions: 0, unusableOriginals: 0, unusableResults: 0 };
  const observations: LocalFeaturedHistoryObservation[] = [];
  const contextByOriginalRevision = new Map<string, LocalFeaturedHistoryContext>();
  let cursor: Pointer | undefined;
  for (;;) {
    const page = await database.query(async (tx) => {
      const pointers = await archivePage(tx, before, cursor);
      coverage.candidates += pointers.length;
      if (!pointers.length) return { pointers, observations: [] };
      const archives = await readArchives(tx, pointers, coverage);
      for (const { revision, context } of archives) contextByOriginalRevision.set(revision.id, context);
      return { pointers, observations: archives.length ? await readResultObservations(tx, archives, before, coverage) : [] };
    });
    for (const observation of page.observations) observations.push(observation);
    if (page.pointers.length < pageSize) return { observations, coverage, contextByOriginalRevision };
    cursor = page.pointers.at(-1);
  }
}
