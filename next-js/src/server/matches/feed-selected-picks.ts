import "server-only";

import { feedMarketPickIdentity } from "../../domain/feed-market-picks.ts";
import { isAnyMarkets, type FeedQuery } from "../../domain/feed-query.ts";
import { registeredForecastGoalMarkets } from "../../domain/goal-market-definitions.ts";
import { legacyGoalMarketIdentities } from "../../domain/legacy-goal-market-identities.ts";
import { LOCAL_FIRST_MARKET_REGISTRY_VERSION } from "../../domain/market-registry.ts";
import type { MarketSource } from "../../domain/markets.ts";
import { LOCAL_FIRST_FORECAST_CASCADE } from "../fallback/fallback-contract.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { activeNovemberReplaySql } from "../intelligence/november-replay-store.ts";
import { minimumFixturePrice } from "../odds/odds-read.ts";

const launch = Object.entries(legacyGoalMarketIdentities);
const canonicalMarket = Prisma.sql`CASE mp.family ${Prisma.join(launch.map(([family, { key }]) => Prisma.sql`WHEN ${family} THEN ${key}`), " ")} END`;
const canonicalSelection = Prisma.sql`CASE mp.selection ${Prisma.join(launch.flatMap(([, { choices }]) =>
  Object.entries(choices).filter(([canonical, previous]) => canonical !== previous)
    .map(([canonical, previous]) => Prisma.sql`WHEN ${previous} THEN ${canonical}`)), " ")} ELSE mp.selection END`;
const decisionMarket = Prisma.sql`REPLACE(JSON_UNQUOTE(JSON_SEARCH(receipt.resultJson,'one',${canonicalMarket},
  NULL,'$.forecastDecision.markets[*].marketKey')),'.marketKey','')`;
const decisionAttribute = (attribute: string) => Prisma.sql`JSON_UNQUOTE(JSON_EXTRACT(receipt.resultJson,CONCAT(${decisionMarket},${attribute})))`;

/** Exact forecast sources. Aliases are mp/ep for picks and f for the owning occurrence. */
export const exactLegacyFeedPickSource = Prisma.sql`mp.available=TRUE AND (mp.source IN ('ai','local-engine') OR
  (mp.source='api-football' AND EXISTS (
    SELECT 1 FROM PredictionSet accepted JOIN PredictionRefreshResult receipt
      ON receipt.fixtureId=f.id AND receipt.cycleId=f.activeCycleId AND receipt.revisionId=accepted.id
      AND receipt.at=accepted.publishedAt AND receipt.outcome='published' AND receipt.reason='accepted'
    WHERE accepted.id=mp.setId AND accepted.fixtureId=f.id AND accepted.cycleId=f.activeCycleId
      AND receipt.integrity=SHA2(CAST(receipt.resultJson AS CHAR),256)
      AND JSON_UNQUOTE(JSON_EXTRACT(accepted.candidateJson,'$.audit.sourceCascade'))=${LOCAL_FIRST_FORECAST_CASCADE}
      AND JSON_UNQUOTE(JSON_EXTRACT(mp.payloadJson,'$.provenance.kind'))='api-football'
      AND JSON_UNQUOTE(JSON_EXTRACT(mp.payloadJson,'$.provenance.source.provider'))='api-football'
      AND JSON_UNQUOTE(JSON_EXTRACT(mp.payloadJson,'$.provenance.source.endpoint'))='predictions'
      AND JSON_UNQUOTE(JSON_EXTRACT(mp.payloadJson,'$.provenance.source.externalFixtureId'))=CAST(f.externalId AS CHAR)
      AND JSON_UNQUOTE(JSON_EXTRACT(receipt.resultJson,'$.forecastDecision.registryVersion'))=${LOCAL_FIRST_MARKET_REGISTRY_VERSION}
      AND JSON_UNQUOTE(JSON_EXTRACT(receipt.resultJson,'$.forecastDecision.version'))='prematch-forecast-decision-v2'
      AND JSON_UNQUOTE(JSON_EXTRACT(receipt.resultJson,'$.forecastDecision.status'))='estimated'
      AND ${decisionAttribute(".source")}='api-football'
      AND ${decisionAttribute(".confidence.status")}='provider-trusted'
      AND ${decisionAttribute(".recommendation.selection")}=${canonicalSelection}
  )))`;
export const exactExtendedFeedPickSource = Prisma.sql`ep.source IN ('ai-score-distribution','local-poisson')
  AND ep.marketKey NOT IN (${Prisma.join(launch.map(([, { key }]) => key))})`;

const registry = registeredForecastGoalMarkets(true);
// Each compact, sealed replay contains at most 256 markets. Only active replay rows expand this small ordinal relation.
const digits = Prisma.join(Array.from({ length: 16 }, (_, number) => Prisma.sql`SELECT ${number} AS ordinal`), " UNION ALL ");
const ordinals = Prisma.sql`(SELECT lo.ordinal+16*hi.ordinal AS ordinal FROM (${digits}) lo CROSS JOIN (${digits}) hi)`;
function exactPicksFor(query: FeedQuery) {
  const all = isAnyMarkets(query.markets);
  return (query.marketPicks ?? []).flatMap((id) => {
    const pick = feedMarketPickIdentity(id);
    return pick && (all || query.markets.some((family) => family === pick.family)) ? [pick] : [];
  });
}

export type FeedSelectedPick = Readonly<{
  marketKey: string; selection: string; probability: number; source: MarketSource; priceHundredths: number | null;
}>;
export const selectedFeedPickColumns = Prisma.sql`feedPick.marketKey,feedPick.selection,feedPick.probability,
  feedPick.source,feedPick.priceHundredths`;

/** A date-scoped one-row lookup keeps filtering, ranking and the public card on one exact selection. */
export function feedSelectedPickJoin(query: FeedQuery, displayedSet: Prisma.Sql, replayScope: boolean, providerOdds: boolean) {
  const exact = (query.marketPicks?.length ?? 0) > 0;
  const options = exactPicksFor(query);
  const recent = replayScope ? Prisma.sql`replay.revisionId IS NOT NULL` : Prisma.sql`FALSE`;
  const rows: Prisma.Sql[] = [];
  const tuples = (values: readonly { marketKey: string; selection: string }[]) =>
    Prisma.join(values.map(({ marketKey, selection }) => Prisma.sql`(${marketKey},${selection})`));
  const legacy = options.flatMap(({ legacy }) => legacy ? [legacy] : []);
  if (legacy.length) rows.push(Prisma.sql`SELECT f.id AS fixtureId,${canonicalMarket} AS marketKey,${canonicalSelection} AS selection,
    mp.selectedProbability AS probability,mp.source,mp.family AS oddsKey,mp.selection AS oddsSelection
    FROM FeedPickScope f JOIN MarketPrediction mp ON mp.setId=f.displayRevision
    WHERE f.replayBody IS NULL AND ${exactLegacyFeedPickSource}
      AND (mp.family,mp.selection) IN (${Prisma.join(legacy.map(({ family, selection }) => Prisma.sql`(${family},${selection})`))})`);
  if (options.length) rows.push(Prisma.sql`SELECT f.id AS fixtureId,ep.marketKey,ep.selection,ep.selectedProbability AS probability,
    CASE ep.source WHEN 'local-poisson' THEN 'local-engine' ELSE 'ai' END AS source,ep.marketKey AS oddsKey,ep.selection AS oddsSelection
    FROM FeedPickScope f JOIN ExtendedMarketPublishedPick ep ON ep.revisionId=f.displayRevision
    WHERE f.replayBody IS NULL AND ${exactExtendedFeedPickSource}
      AND (ep.marketKey,ep.selection) IN (${tuples(options)})`);

  if (replayScope && (!exact || options.length)) {
    const keys = isAnyMarkets(query.markets) ? null : registry.filter(({ family }) => query.markets.some((item) => item === family))
      .map(({ definition }) => definition.key);
    const market = (field: string) => Prisma.sql`JSON_UNQUOTE(JSON_EXTRACT(f.replayBody,CONCAT('$.markets[',slot.ordinal,'].',${field})))`;
    rows.push(Prisma.sql`SELECT rp.fixtureId,rp.marketKey,rp.selection,rp.probability,'local-engine' AS source,NULL AS oddsKey,NULL AS oddsSelection
      FROM (SELECT f.id AS fixtureId,${market("definition.key")} AS marketKey,${market("selected.selection")} AS selection,
        ${market("selected.probability")}+0e0 AS probability
        FROM FeedPickScope f JOIN ${ordinals} slot ON slot.ordinal<JSON_LENGTH(f.replayBody,'$.markets')
        WHERE f.replayBody IS NOT NULL) rp WHERE rp.marketKey IS NOT NULL
        ${exact ? Prisma.sql`AND (rp.marketKey,rp.selection) IN (${tuples(options)})`
          : keys ? Prisma.sql`AND rp.marketKey IN (${Prisma.join(keys)})` : Prisma.empty}`);
  }
  const source = rows.length ? Prisma.sql`${Prisma.join(rows, " UNION ALL ")}` : Prisma.sql`
    SELECT NULL AS fixtureId,NULL AS marketKey,NULL AS selection,NULL AS probability,NULL AS source,NULL AS oddsKey,NULL AS oddsSelection WHERE FALSE`;
  const price = providerOdds ? Prisma.sql`quote.displayHundredths` : Prisma.sql`NULL`;
  const quoteJoin = providerOdds ? Prisma.sql`LEFT JOIN FixtureOddsPrice quote ON quote.fixtureId=pick.fixtureId
    AND quote.marketKey=pick.oddsKey AND quote.selection=pick.oddsSelection
    AND quote.stale=FALSE AND quote.priceDecimal>=${minimumFixturePrice}` : Prisma.empty;
  const replayJoin = replayScope ? Prisma.sql`LEFT JOIN ${activeNovemberReplaySql} replay ON replay.fixtureId=f.id` : Prisma.empty;
  return { replayActive: recent, join(cohort: Prisma.Sql, where: Prisma.Sql) {
    const replayBody = replayScope ? Prisma.sql`JSON_UNQUOTE(JSON_EXTRACT(replay.body,'$.canonicalBody'))` : Prisma.sql`NULL`;
    return Prisma.sql`${replayJoin}
      LEFT JOIN (
        WITH FeedPickScope AS (SELECT f.id,f.activeCycleId,f.externalId,${displayedSet} AS displayRevision,${replayBody} AS replayBody
          ${cohort} ${replayJoin} WHERE ${where})
        SELECT pick.fixtureId,pick.marketKey,pick.selection,pick.probability,pick.source,${price} AS priceHundredths,
          ROW_NUMBER() OVER (PARTITION BY pick.fixtureId ORDER BY pick.probability DESC,
            CASE pick.source WHEN 'local-engine' THEN 2 ELSE 1 END DESC,
            ${price} DESC, CAST(pick.marketKey AS BINARY), CAST(pick.selection AS BINARY)) AS choice
        FROM (${source}) pick ${quoteJoin}
      ) feedPick ON feedPick.fixtureId=f.id AND feedPick.choice=1`;
  } };
}
