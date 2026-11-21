import "server-only";

import { getPublicationDeadline, getReportingDate, getReportingDayBounds, parseReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { total15MarketKey } from "../../domain/extended-markets.ts";
import { maximumCompetitionScope } from "../../domain/feed-query.ts";
import { displayMarketOddsPrice } from "../../domain/in-play-odds.ts";
import { decideLocalFeaturedPick, inspectLocalFeaturedQuote, verifiedLocalFeaturedBinding } from "../../domain/local-featured-decision.ts";
import { isSlipMarketFamily, isSlipMarketSelection, isTotal15SlipSelection } from "../../domain/slip-markets.ts";
import type { SlipSelection } from "../../domain/slip-builder.ts";
import { slipCohortRules } from "../../domain/slip-cohort.ts";
import { editorialSlipOfferSchema } from "../../domain/slip-quote.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { catalogScopeKey } from "../football/catalog-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { collectUpcomingLocalFeaturedCandidates } from "../matches/upcoming-featured-pick.ts";
import { storedPointInTimeFeaturedBookmakerQuotes, type StoredCurrentBookmakerQuotes } from "../odds/odds-mysql-store.ts";
import { recoveredPreMatchFixtureStatuses } from "../odds/odds-contract.ts";
import { publicOddsEnabled } from "../odds/public-odds-policy.ts";
import { cutoffOperationFromRow } from "../predictions/cutoff-read.ts";
import { readFeaturedGoalMarkets, type FeaturedGoalMarkets } from "../predictions/extended-market-read.ts";
import type { StoredRevision } from "../predictions/history-contract.ts";
import { assertHistorySeal, historyJson, historyTime, storedRevisions, type HistoryRow } from "../predictions/history-read.ts";
import { observationShowsPlay } from "../predictions/publication-eligibility.ts";
import { parsePublicationObservation } from "../predictions/publication-input.ts";
import { refreshResultFromRow } from "../predictions/publication-read.ts";
import { qualifiedEditorialSlipRevision } from "./slip-forecast.ts";
import { projectSlipTotal15Forecast, readSlipGoalExtensions } from "./slip-goal-forecast.ts";
import type { SlipTotal15Forecast } from "../../domain/slip-markets.ts";

type ArchivedFixture = Readonly<{
  fixtureId: string; externalId: bigint; cycleId: string; revisionId: string; kickoff: Date;
  currentKickoff: Date | null; currentStatus: string;
  homeTeamId: string; homeTeamName: string | null; awayTeamId: string; awayTeamName: string | null;
  competitionId: string; competitionName: string | null; competitionCountry: string | null;
  scheduleVersion: number; kickoffObservedAt: Date; refreshId: string | null;
}>;

export type BestSlipHistoricalOfferedLeg = Readonly<{
  selection: SlipSelection; kickoffObservedAt: number; forecastRecordedAt: number; quoteRecordedAt: number; cutoffAt: number;
}>;

/** One shared historical clock. Only original publication revisions currently retained in the source ledger are candidates. */
export async function readBestSlipHistoricalInputs(database: Pick<DatabaseRuntime, "transaction">,
  input: Readonly<{ day: string; observedAt: number; auditedAt: number; competitionIds: readonly number[] }>) {
  const day = parseReportingDate(input.day), { startInclusive, endExclusive } = getReportingDayBounds(day);
  const observedAt = utcInstantFromEpochMilliseconds(input.observedAt), auditedAt = utcInstantFromEpochMilliseconds(input.auditedAt);
  if (getReportingDate(observedAt) !== day || observedAt >= auditedAt || endExclusive > auditedAt ||
    !input.competitionIds.length || input.competitionIds.length > maximumCompetitionScope ||
    new Set(input.competitionIds).size !== input.competitionIds.length ||
    input.competitionIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new RangeError("Invalid historical Best Slips study scope.");
  if (!publicOddsEnabled()) throw new RangeError("Verified odds permission is required.");

  return database.transaction(async (tx) => {
    const at = new Date(observedAt);
    const catalog = await tx.footballImport.findFirst({
      where: { scopeKey: catalogScopeKey({ kind: "fixtures", query: { date: day } }), provider: "api-football",
        observedAt: { lte: at }, recordedAt: { lte: at } },
      orderBy: [{ observedAt: "desc" }, { sequence: "desc" }], select: { status: true },
    });
    const rows = await tx.$queryRaw<ArchivedFixture[]>(Prisma.sql`
      SELECT f.id AS fixtureId,f.externalId,p.cycleId,p.id AS revisionId,s.kickoffAt AS kickoff,
        f.kickoff AS currentKickoff,f.status AS currentStatus,
        f.homeTeamId,ht.name AS homeTeamName,f.awayTeamId,aw.name AS awayTeamName,
        l.id AS competitionId,l.name AS competitionName,l.country AS competitionCountry,
        s.version AS scheduleVersion,s.observedAt AS kickoffObservedAt,
        (SELECT refresh.id FROM PredictionRefreshResult refresh
          WHERE refresh.fixtureId=f.id AND refresh.cycleId=p.cycleId AND refresh.at<=${at}
          ORDER BY refresh.at DESC,refresh.runSequence DESC,refresh.id DESC LIMIT 1) AS refreshId
      FROM FootballFixture f JOIN FootballSeason fs ON fs.id=f.seasonId
      JOIN FootballCompetition l ON l.id=fs.competitionId
      JOIN FootballTeam ht ON ht.id=f.homeTeamId JOIN FootballTeam aw ON aw.id=f.awayTeamId
      JOIN PredictionSet p ON p.id=(SELECT newest.id FROM PredictionSet newest
        WHERE newest.fixtureId=f.id AND newest.recordedAt<=${at} AND newest.publishedAt<=${at}
        ORDER BY newest.fixtureRevision DESC LIMIT 1)
      JOIN PredictionCycle c ON c.id=p.cycleId AND c.fixtureId=f.id
      JOIN PredictionSchedule s ON s.cycleId=p.cycleId AND s.version=p.scheduleVersion AND s.fixtureId=f.id
      WHERE f.provider='api-football' AND f.createdAt<=${at}
        AND s.kickoffAt>=${new Date(startInclusive)} AND s.kickoffAt<${new Date(endExclusive)}
        AND s.observedAt<=${at} AND s.cutoffAt>${at}
        AND c.openedAt<=${at} AND (c.voidedAt IS NULL OR c.voidedAt>${at})
        AND EXISTS (SELECT 1 FROM FootballCompetitionProvider cp
          WHERE cp.competitionId=l.id AND cp.provider='api-football' AND cp.mappedAt<=${at}
          AND cp.externalId IN (${Prisma.join(input.competitionIds)}))
        AND NOT EXISTS (SELECT 1 FROM PredictionSchedule newer WHERE newer.fixtureId=f.id AND newer.observedAt<=${at}
          AND (newer.observedAt>s.observedAt OR newer.observedAt=s.observedAt AND
            (newer.cycleId<>s.cycleId OR newer.version>s.version)))
      ORDER BY s.kickoffAt,f.id LIMIT ${slipCohortRules.maximumRecords + 1}`);
    const found = rows.slice(0, slipCohortRules.maximumRecords);
    const unresolvedOccurrences = found.filter(({ kickoff, currentKickoff, currentStatus }) =>
      currentKickoff?.getTime() !== kickoff.getTime() || !recoveredPreMatchFixtureStatuses.has(currentStatus)).length;
    const result = (offers: readonly BestSlipHistoricalOfferedLeg[], verifiedForecasts: number, pricedFixtures: number) => ({
      day, observedAt, examined: found.length, partialCoverage: catalog?.status !== "complete" || unresolvedOccurrences > 0,
      unresolvedOccurrences,
      searchLimited: rows.length > found.length, verifiedForecasts, pricedFixtures, offers,
    });
    if (!found.length) return result([], 0, 0);

    const revisions = await storedRevisions(tx, found.map(({ revisionId }) => revisionId));
    const receiptIds = found.flatMap(({ refreshId }) => refreshId ? [refreshId] : []);
    const receiptRows = receiptIds.length ? await tx.$queryRaw<HistoryRow[]>(Prisma.sql`
      SELECT *,integrity=SHA2(CAST(resultJson AS CHAR),256) AS validIntegrity FROM PredictionRefreshResult
      WHERE id IN (${Prisma.join(receiptIds)})`) : [];
    const receipts = new Map(receiptRows.map((row) => [row.id, refreshResultFromRow(row)]));
    const operations = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`
      SELECT *,integrity=SHA2(CAST(operationJson AS CHAR),256) AS validIntegrity
      FROM PredictionCycleOperation WHERE cycleId IN (${Prisma.join(found.map(({ cycleId }) => cycleId))})
        AND kind IN ('close','void') AND at<=${new Date(auditedAt)}`);
    const cutoffs = new Map<string, number>();
    for (const row of operations) {
      const action = cutoffOperationFromRow(row, row.kind === "close" ? "close" : "void");
      cutoffs.set(action.cycleId, Math.min(cutoffs.get(action.cycleId) ?? Infinity, action.effectiveCloseAt));
    }
    // An early-play latch can precede final closure. Use its verified actual clock even if closure was recorded later.
    const barriers = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`
      SELECT cycleId,fixtureId,recordedAt,closedAt,observationJson,
        integrity=SHA2(CAST(observationJson AS CHAR),256) AS validIntegrity
      FROM PredictionPublicationBarrier WHERE cycleId IN (${Prisma.join(found.map(({ cycleId }) => cycleId))})
        AND recordedAt<=${new Date(auditedAt)}`);
    for (const row of barriers) {
      assertHistorySeal(row.validIntegrity);
      const observation = parsePublicationObservation(historyJson(row.observationJson));
      const closedAt = historyTime(row.closedAt);
      if (observation.cycleId !== row.cycleId || observation.fixtureId !== row.fixtureId || !observationShowsPlay(observation) ||
        closedAt !== (observation.actualStartedAt ?? observation.retrievedAt) || closedAt > historyTime(row.recordedAt))
        throw new RangeError("Historical publication barrier is inconsistent.");
      cutoffs.set(observation.cycleId, Math.min(cutoffs.get(observation.cycleId) ?? Infinity, closedAt));
    }
    const known = found.flatMap((fixture) => {
      const revision = revisions.get(fixture.revisionId), receipt = receipts.get(fixture.refreshId), kickoffAt = historyTime(fixture.kickoff);
      const kickoffObservedAt = historyTime(fixture.kickoffObservedAt);
      const cutoffAt = Math.min(getPublicationDeadline(kickoffAt), cutoffs.get(fixture.cycleId) ?? Infinity);
      if (!revision || !receipt || observedAt >= cutoffAt || kickoffObservedAt > revision.publishedAt ||
        !originalRevisionMatches(fixture, revision, receipt, kickoffAt, observedAt)) return [];
      return [{ fixture, revision, kickoffAt, kickoffObservedAt, cutoffAt }];
    });
    if (!known.length) return result([], 0, 0);

    const prices = await storedPointInTimeFeaturedBookmakerQuotes(tx,
      known.map(({ fixture, kickoffAt }) => ({ fixtureId: fixture.fixtureId, kickoffAt, decisionAt: observedAt })), auditedAt);
    const priced = known.filter(({ fixture }) => prices.has(fixture.fixtureId));
    const extensions = await readSlipGoalExtensions(tx, priced.map(({ revision }) => revision.id));
    const goalMarkets = await readFeaturedGoalMarkets(tx, priced.flatMap(({ fixture, revision }) => {
      const extension = extensions.get(revision.id);
      return extension && extension.revisionId === revision.id && extension.fixtureId === fixture.fixtureId &&
        extension.cycleId === fixture.cycleId && extension.recordedAt >= revision.publishedAt && extension.recordedAt <= observedAt ? [revision.id] : [];
    }));
    const offers = priced.flatMap(({ fixture, revision, kickoffAt, kickoffObservedAt, cutoffAt }) => {
      const reference = { cycleId: fixture.cycleId, revisionId: revision.id, publishedAt: revision.publishedAt };
      const extension = extensions.get(revision.id) ?? null;
      const total15 = projectSlipTotal15Forecast(extension, fixture.fixtureId, kickoffAt, reference, observedAt);
      return historicalFeaturedOffers(fixture, revision, kickoffAt, observedAt, prices.get(fixture.fixtureId)!,
        goalMarkets.get(revision.id), total15).map((selection) => ({
        selection, kickoffObservedAt, forecastRecordedAt: Math.max(revision.recordedAt,
          isTotal15SlipSelection(selection.selection) ? extension!.recordedAt : 0), quoteRecordedAt: selection.offer.checkedAt, cutoffAt,
      }));
    });
    return result(offers, known.length, prices.size);
  }, { isolationLevel: "RepeatableRead", maxWait: 5_000, timeout: 45_000 });
}

function originalRevisionMatches(fixture: ArchivedFixture, revision: StoredRevision, receipt: ReturnType<typeof refreshResultFromRow>,
  kickoffAt: number, observedAt: number) {
  const { context } = revision.candidate.context, { observation } = receipt;
  return revision.id === fixture.revisionId && receipt.revisionId === revision.id && receipt.outcome === "published"
    && revision.fixtureId === fixture.fixtureId && receipt.fixtureId === fixture.fixtureId
    && revision.cycleId === fixture.cycleId && receipt.cycleId === fixture.cycleId && observation.cycleId === fixture.cycleId
    && revision.scheduleVersion === fixture.scheduleVersion && revision.recordedAt <= observedAt
    && receipt.at === revision.publishedAt && receipt.evidenceSnapshotId === revision.evidenceSnapshotId
    && receipt.candidateHash === evidenceFingerprint(revision.candidate) && receipt.generationCompletedAt === revision.generationCompletedAt
    && observation.status === "scheduled" && observation.actualStartedAt === null && observation.retrievedAt <= receipt.at
    && observation.externalFixtureId === Number(fixture.externalId) && context.externalFixtureId === Number(fixture.externalId)
    && observation.kickoffAt === kickoffAt && context.kickoffAt === kickoffAt
    && context.home.teamId === fixture.homeTeamId && context.away.teamId === fixture.awayTeamId;
}

function historicalFeaturedOffers(fixture: ArchivedFixture, revision: StoredRevision, kickoffAt: number, observedAt: number,
  quotes: StoredCurrentBookmakerQuotes, goals: FeaturedGoalMarkets | undefined, total15: SlipTotal15Forecast | null) {
  const markets = Object.values(revision.candidate.markets).flatMap((market) => market.available ? [market] : []);
  const candidates = collectUpcomingLocalFeaturedCandidates({ markets }, goals);
  if (candidates === null) return [];
  const decision = decideLocalFeaturedPick({ fixtureId: fixture.fixtureId, kickoffAt, decisionAt: observedAt, quotes,
    quotesPermitted: true, outcomes: candidates.map(({ outcome }) => outcome) });
  if (decision.status !== "priced") return [];
  const family = decision.marketKey === total15MarketKey ? "total-goals" : decision.marketKey;
  const selection = decision.marketKey === total15MarketKey ? `${decision.selection}-1.5` : decision.selection;
  if (!isSlipMarketFamily(family) || !isSlipMarketSelection(family, selection) || (decision.marketKey !== family && decision.marketKey !== total15MarketKey)) return [];
  if (isTotal15SlipSelection(selection) && (total15?.source !== "local-poisson" || total15.probabilities[selection] !== decision.probability)) return [];
  const binding = verifiedLocalFeaturedBinding(decision.marketKey, decision.selection);
  if (!binding) return [];
  return quotes.bookmakers.flatMap((book) => {
    const markets = book.offers.filter(({ betId, betName }) => betId === binding.betId && betName === binding.betName);
    if (markets.length !== 1) return [];
    const market = markets[0]!, values = market.values.filter(({ label }) => label === binding.label);
    if (values.length !== 1) return [];
    const inspected = inspectLocalFeaturedQuote(book, market, values[0]!, observedAt);
    if (!("quote" in inspected)) return [];
    const parsed = editorialSlipOfferSchema.safeParse(inspected.quote);
    if (!parsed.success) return [];
    const offer = parsed.data;
    const item: SlipSelection = { fixtureId: fixture.fixtureId, kickoffAt,
      homeTeam: { id: fixture.homeTeamId, name: fixture.homeTeamName }, awayTeam: { id: fixture.awayTeamId, name: fixture.awayTeamName },
      competition: { id: fixture.competitionId, name: fixture.competitionName, country: fixture.competitionCountry },
      family, selection, probability: decision.probability, odds: displayMarketOddsPrice(offer.decimal), oddsBasis: "bookmaker",
      source: "local-engine", bookmaker: { id: offer.bookmakerId, name: offer.bookmakerName }, offer,
      forecast: { cycleId: fixture.cycleId, revisionId: revision.id, publishedAt: revision.publishedAt } };
    return qualifiedEditorialSlipRevision(item, revision) ? [{ ...item, offer }] : [];
  });
}
