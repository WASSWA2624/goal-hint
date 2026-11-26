import "server-only";

import { bestSlipActivePublicationDays, bestSlipFixtureWindow, bestSlipKickoffBufferMs,
  bestSlipPreferredKickoffWindowMs } from "../../domain/best-slip-publication-hour.ts";
import { getReportingDate, utcInstantFromEpochMilliseconds, type ReportingDate } from "../../domain/calendar.ts";
import { localDateTimeValue } from "../../domain/date-time.ts";
import { feedQueryRules } from "../../domain/feed-query.ts";
import type { StoredMatchFeedRecord } from "../../domain/match-feed.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { readPotentialFeaturedSlipFixtures } from "../slips/best-slip-recommendations.ts";
import { createStoredSlipCohort } from "../slips/slip-cohort.ts";
import type { OddsPolicy } from "./odds-contract.ts";
import { oddsPolicyHash, oddsScopeKey } from "./odds-input.ts";

export type SlipOddsRefreshCandidate = Readonly<{ fixtureId: number; date: ReportingDate }>;

/** Only seek prices where an upcoming fixture could supply an eligible featured pick. */
export function createSlipOddsRefreshCandidates({ database, competitionIds, policy, now = Date.now }: Readonly<{
  database: DatabaseRuntime; competitionIds: readonly number[]; policy: OddsPolicy; now?: () => number;
}>) {
  const read = createStoredSlipCohort({ database: () => database, competitionIds: () => competitionIds, providerOdds: true });
  const policyHash = oddsPolicyHash(policy);
  return async (publicationSlot: number, limit: number): Promise<readonly SlipOddsRefreshCandidate[]> => {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > feedQueryRules.maximumPageSize) throw new RangeError("Invalid slip odds refresh limit.");
    const asOf = utcInstantFromEpochMilliseconds(Math.max(now(), publicationSlot));
    const earliestKickoff = asOf + bestSlipKickoffBufferMs, latestKickoff = publicationSlot + bestSlipPreferredKickoffWindowMs;
    const records: StoredMatchFeedRecord[] = [];
    for (const day of bestSlipActivePublicationDays(publicationSlot)) {
      const window = bestSlipFixtureWindow(day), first = Math.max(earliestKickoff, window.startInclusive);
      const last = Math.min(latestKickoff, window.endExclusive - 1);
      if (last < first) continue;
      const parameters = new URLSearchParams({
        start: localDateTimeValue(first, publicPolicy.reportingTimeZone), end: localDateTimeValue(last, publicPolicy.reportingTimeZone),
        status: "scheduled", market: publicPolicy.markets.join(","), sort: "kickoff", dir: "asc",
      });
      const cohort = await read(parameters, { featured: true, includeAdditionalFeaturedGoals: true,
        minimumKickoffLeadMs: bestSlipKickoffBufferMs, currentForecastsOnly: true }, { now: () => asOf });
      if (!cohort.featuredSelections) throw new Error("Missing priced slip cohort.");
      const priced = new Set(cohort.featuredSelections.map(({ fixtureId }) => fixtureId));
      records.push(...cohort.records.filter(({ kickoffAt, fixtureId }) =>
        kickoffAt !== null && kickoffAt >= first && kickoffAt <= last && !priced.has(fixtureId)));
    }
    if (!records.length) return [];

    return database.transaction(async (tx) => {
      const ids = await readPotentialFeaturedSlipFixtures(tx, records, asOf);
      if (!ids.length) return [];
      const fixtures = await tx.footballFixture.findMany({ where: { id: { in: ids }, provider: "api-football", status: "scheduled" },
        select: { id: true, externalId: true, kickoff: true, activeCycle: { select: { id: true, currentSetId: true } } } });
      const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
      const candidates = records.flatMap((record) => {
        const fixture = byId.get(record.fixtureId);
        if (!fixture || record.kickoffAt === null || fixture.kickoff?.getTime() !== record.kickoffAt ||
          fixture.activeCycle?.id !== record.cycleId || fixture.activeCycle?.currentSetId !== record.forecast?.revisionId) return [];
        const fixtureId = Number(fixture.externalId);
        if (!Number.isSafeInteger(fixtureId) || fixtureId < 1) return [];
        const date = getReportingDate(utcInstantFromEpochMilliseconds(record.kickoffAt));
        return [{ fixtureId, date, scopeKey: oddsScopeKey({ kind: "prices", fixtureId, date, policy }) }];
      });
      if (!candidates.length) return [];
      // Completed checks include verified empty responses. Stable sorting keeps kickoff order for unchecked fixtures and ties.
      const checks = await tx.oddsImportBatch.groupBy({ by: ["scopeKey"],
        where: { scopeKey: { in: candidates.map(({ scopeKey }) => scopeKey) }, policyHash, status: "complete" },
        _max: { receivedAt: true } });
      const checkedAt = new Map(checks.map(({ scopeKey, _max }) => [scopeKey, _max.receivedAt?.getTime() ?? 0]));
      candidates.sort((left, right) => (checkedAt.get(left.scopeKey) ?? 0) - (checkedAt.get(right.scopeKey) ?? 0));
      return candidates.slice(0, limit).map(({ fixtureId, date }) => ({ fixtureId, date }));
    }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 30_000 });
  };
}
