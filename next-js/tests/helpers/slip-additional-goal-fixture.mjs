import { parseFeedQuery, resolveFeedDates } from "../../src/domain/feed-query.ts";
import { LOCAL_FIRST_GOAL_EVALUATION_PROFILE, localFirstGoalMarketDefinitions } from "../../src/domain/goal-market-definitions.ts";
import { evidenceFingerprint } from "../../src/server/evidence/evidence-input.ts";
import { goalMarketExtensionFromRow, prepareGoalMarketExtension } from "../../src/server/predictions/goal-market-store.ts";
import { slipPricesFromBookmakers } from "../../src/server/slips/price-read.ts";
import { projectSlipAdditionalGoalForecast } from "../../src/server/slips/slip-goal-forecast.ts";
import { liveRecord, now, today } from "./live-refresh-fixtures.mjs";

export { now, today };

const offer = (betId, betName, values) => ({ betId, betName,
  values: values.map(([label, odd]) => ({ label, odd })), providerUpdatedAt: now - 500 });

export function additionalGoalFixture() {
  const fixture = liveRecord({ kickoffAt: now + 3_600_000 });
  const record = { ...fixture, forecast: { ...fixture.forecast, provisional: true, updateDelayed: false } };
  const reference = { cycleId: record.cycleId, revisionId: record.forecast.revisionId, publishedAt: record.forecast.publishedAt };
  const prepared = prepareGoalMarketExtension({
    localPoisson: { home: 0.9, away: 1.1 }, definitions: localFirstGoalMarketDefinitions, evaluationProfile: LOCAL_FIRST_GOAL_EVALUATION_PROFILE,
  });
  const body = { ...prepared, cycleId: reference.cycleId, revisionId: reference.revisionId, fixtureId: record.fixtureId,
    contentHash: evidenceFingerprint(prepared), recordedAt: reference.publishedAt };
  const extension = goalMarketExtensionFromRow({ ...body, body, validIntegrity: 1, recordedAt: new Date(body.recordedAt) });
  const quotes = { fixtureId: record.fixtureId, kickoffAt: record.kickoffAt, checkedAt: now - 500, primaryBookmakerId: 8,
    bookmakers: [
      { bookmakerId: 8, bookmakerName: "Bookmaker 8", offers: [
        offer(5, "Goals Over/Under", [["Under 3.5", "1.321"], ["Under 2.5", "9.50"]]),
        offer(6, "Goals Over/Under First Half", [["Under 3.5", "9.99"]]),
        offer(16, "Total - Home", [["Under 2.5", "1.2451"], ["Under 3.5", "8.50"]]),
        offer(17, "Total - Away", [["Under 2.5", "1.51"]]),
      ] },
      { bookmakerId: 9, bookmakerName: "Bookmaker 9", offers: [
        offer(16, "Total - Away", [["Under 2.5", "8.50"]]),
        offer(17, "Total - Away", [["Under 2.5", "8.90"], ["Under 2.5", "9.20"]]),
      ] },
    ],
  };
  return {
    record, reference, extension,
    readCohort: async (parameters, context, clock) => {
      const query = parseFeedQuery(parameters, { today, asOf: now, providerOdds: true });
      const range = resolveFeedDates(query, today);
      const forecast = projectSlipAdditionalGoalForecast(extension, record.fixtureId, record.kickoffAt, reference, now,
        context.additionalGoals?.keys ?? []);
      const prices = slipPricesFromBookmakers(record, quotes, context.additionalGoals?.only ? [] : query.markets, undefined, forecast ?? undefined);
      return { records: [record], selectionPrices: { [record.fixtureId]: prices },
        ...(forecast ? { additionalGoalForecasts: { [record.fixtureId]: forecast } } : {}),
        asOf: clock.now(), today, range: { from: range.startDate, to: range.endDate, ...range.window }, partialCoverage: false, searchLimited: false };
    },
  };
}
