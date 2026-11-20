import "server-only";

import { countMetrics, type CountMetric } from "../../domain/non-goal-market-definitions.ts";
import type { NonGoalResultEvidence } from "../../domain/non-goal-market-settlement.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import type { NormalizedFixtureMatchDetails } from "../football/fixture-match-details.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { createMysqlPredictionHistoryStore } from "../predictions/history-mysql-store.ts";
import { fixtureResultMatchesCanonical, storedFixtureResult } from "../results/result-read.ts";
import { appendImpliedResultEvidence, readImpliedResultEvidence, type ImpliedResultEvidenceInput } from "./implied-market-evidence.ts";

const reviewedCountMetrics = new Set<string>(countMetrics);

export function finalRegulationStatisticCounts(
  detail: NormalizedFixtureMatchDetails,
): NonGoalResultEvidence["counts"] {
  if (detail.status !== "finished-regulation" || detail.providerStatus !== "FT" || detail.regulationScore?.verified !== true ||
    detail.source.provider !== "api-football" || detail.source.endpoint !== "/fixtures" || detail.matchStatistics?.length !== 2) return [];
  const { homeTeam, awayTeam, source } = detail;
  const home = detail.matchStatistics.find((row) => row.team.id === homeTeam.id);
  const away = detail.matchStatistics.find((row) => row.team.id === awayTeam.id);
  if (homeTeam.id === awayTeam.id || !home || !away || [home, away].some((row) => row.source.provider !== source.provider ||
    row.source.endpoint !== source.endpoint || row.source.retrievedAt !== source.retrievedAt ||
    row.source.providerUpdatedAt !== source.providerUpdatedAt)) return [];
  const index = (row: typeof home) => new Map(row.statistics.filter(({ supported, unit, metric }) =>
    supported && unit === "count" && metric !== null && reviewedCountMetrics.has(metric)).map(({ metric, value }) => [metric as CountMetric, value]));
  const left = index(home), right = index(away);
  const value = (entry: unknown) => typeof entry === "number" && Number.isSafeInteger(entry) && entry >= 0 && entry <= 1_000_000 ? entry : null;
  return freezeEvidence(countMetrics.flatMap((metric) => {
    const h = value(left.get(metric)), a = value(right.get(metric));
    return h === null || a === null ? [] : [{ metric, period: "full-time" as const, scope: "regulation-including-stoppage-time" as const,
      countingRule: "provider-reported-count-v1", verified: true, home: h, away: a }];
  }));
}

async function hasLockedImpliedMarket(tx: Prisma.TransactionClient, fixtureId: string): Promise<boolean> {
  const [active] = await tx.$queryRaw<{ revisionId: string }[]>`SELECT x.revisionId FROM ImpliedMarketExtension x
    JOIN PredictionCycle c ON c.lockedSetId=x.revisionId WHERE c.fixtureId=${fixtureId} AND c.state='closed' LIMIT 1`;
  return active !== undefined;
}

/** Consume a final detail already checked by the protected collector. No
 * provider dispatch or public projection runs here. */
export function createFinalImpliedCountCapture(database: DatabaseRuntime, verifyPrivateUse: () => boolean) {
  const history = createMysqlPredictionHistoryStore(database);
  return async ({ fixtureId, detail, checkedAt }: Readonly<{
    fixtureId: string; detail: NormalizedFixtureMatchDetails; checkedAt: number;
  }>): Promise<boolean> => {
    if (verifyPrivateUse() !== true) return false;
    const counts = finalRegulationStatisticCounts(detail);
    if (!counts.length || !await database.query((tx) => hasLockedImpliedMarket(tx, fixtureId))) return false;
    return history.withFixtureTransaction(fixtureId, async (_writer, tx) => {
      if (verifyPrivateUse() !== true || !await hasLockedImpliedMarket(tx, fixtureId)) return false;
      const fixture = await tx.footballFixture.findUniqueOrThrow({ where: { id: fixtureId } });
      const state = await tx.fixtureResultState.findUnique({ where: { fixtureId } });
      const issue = (await tx.fixtureLifecycleState.findUnique({ where: { fixtureId } }))?.issue ?? null;
      const result = state?.resultId ? await storedFixtureResult(tx, fixtureId, state.resultId) : null;
      if (!result || !fixtureResultMatchesCanonical(fixture, result, issue) || result.status !== "finished-regulation" || result.providerStatus !== "FT" ||
        result.regulation.home !== detail.regulationScore?.home || result.regulation.away !== detail.regulationScore?.away ||
        fixture.provider !== "api-football" || fixture.externalId !== BigInt(detail.id) || fixture.kickoff?.getTime() !== detail.kickoff ||
        detail.source.retrievedAt < result.observedAt) return false;
      const aliases = await tx.footballTeamProvider.findMany({ where: { provider: "api-football",
        teamId: { in: [fixture.homeTeamId, fixture.awayTeamId] } }, select: { teamId: true, externalId: true } });
      if (aliases.length !== 2 || !aliases.some((row) => row.teamId === fixture.homeTeamId && row.externalId === BigInt(detail.homeTeam.id)) ||
        !aliases.some((row) => row.teamId === fixture.awayTeamId && row.externalId === BigInt(detail.awayTeam.id))) return false;
      const prior = await readImpliedResultEvidence(tx, fixtureId, result.id);
      // Keep independently verified events/periods in a pre-existing snapshot.
      // These counts alone cannot establish authority to supersede those facts.
      if (prior && (prior.evidence.events.length || prior.evidence.participation?.length ||
        prior.evidence.counts.some((row) => row.period !== "full-time" || row.countingRule !== "provider-reported-count-v1"))) return false;
      const { source } = detail;
      const observation = { fixture: detail.id, home: detail.homeTeam.id, away: detail.awayTeam.id, source,
        regulation: detail.regulationScore, counts };
      const input: ImpliedResultEvidenceInput = {
        fixtureId, resultId: result.id, provider: "api-football", externalFixtureId: fixture.externalId.toString(),
        homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId, contractVersion: "verified-non-goal-result-v1",
        sources: [{ endpoint: "fixtures/ids", sourceRef: evidenceFingerprint(observation), retrievedAt: source.retrievedAt,
          providerUpdatedAt: source.providerUpdatedAt }], evidence: { counts: [...counts], events: [] },
      };
      const expected = evidenceFingerprint(input);
      await appendImpliedResultEvidence(tx, input, checkedAt, { verify: async (_tx, candidate) =>
        verifyPrivateUse() === true && evidenceFingerprint(candidate) === expected });
      return true;
    });
  };
}
