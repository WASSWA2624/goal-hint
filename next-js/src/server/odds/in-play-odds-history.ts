import "server-only";

import { reconcileOddsCatalog } from "../../domain/market-registry.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { NormalizedInPlayOdds } from "../football/api-football-normalize.ts";
import { Prisma } from "../generated/prisma/client.ts";

export const inPlayOddsSource = Object.freeze({ provider: "api-football", sourceId: "api-football-live", namespace: "in-play", bookmakerId: null } as const);
const writeBatchSize = 100;
const textOrder = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

export type InPlayFixtureOccurrence = Readonly<{
  id: string; providerId: bigint; kickoffAt: Date; homeTeamId: string; awayTeamId: string;
}>;
type MatchedOdds = Readonly<{ fixture: InPlayFixtureOccurrence; row: NormalizedInPlayOdds }>;
type CatalogReview = ReturnType<typeof reconcileOddsCatalog>[number];

function reviewNames(catalog: Readonly<Record<string, string>>) {
  const rows = reconcileOddsCatalog("in-play", Object.entries(catalog).map(([id, name]) => ({ id: Number(id), name })));
  return new Map(rows.map(row => [row.id, row]));
}

export function structuredInPlayOdds(row: NormalizedInPlayOdds, catalog: Readonly<Record<string, string>>,
  review: ReadonlyMap<number, CatalogReview> = reviewNames(catalog)) {
  const received = [...row.bets.map(bet => ({ bet, complete: true })), ...(row.partialBets ?? []).map(bet => ({ bet, complete: false }))];
  const markets = received.sort((a, b) => a.bet.id - b.bet.id).map(({ bet, complete }) => {
    const catalogName = catalog[bet.id] ?? null;
    const reviewed = catalogName !== null && catalogName === bet.name ? review.get(bet.id) : undefined;
    const periods = new Set(reviewed?.mappings.map(mapping => mapping.period));
    const values = bet.values.map(value => ({ label: value.label, line: value.handicap, price: value.odd, main: value.main, suspended: value.suspended }))
      .sort((a, b) => textOrder(a.label, b.label) || textOrder(a.line ?? "", b.line ?? "") || textOrder(a.price ?? "", b.price ?? "") ||
        Number(a.main) - Number(b.main) || Number(a.suspended) - Number(b.suspended));
    return { marketId: bet.id, name: bet.name, catalogName, complete, period: periods.size === 1 ? [...periods][0]! : null,
      review: reviewed ?? { status: "unmapped", reason: catalogName === null ? "catalog-entry-unavailable" : "provider-name-mismatch", mappings: [] }, values };
  });
  const offered = markets.filter(market => market.values.some(quote => !quote.suspended && quote.price !== null));
  return {
    version: 1, phase: "in-play", source: inPlayOddsSource,
    providerFixtureId: row.fixtureId, competitionId: row.competitionId, season: row.season,
    homeProviderTeamId: row.homeTeamId, awayProviderTeamId: row.awayTeamId,
    availability: row.finished ? "finished" : row.blocked || row.stopped ? "suspended" :
      offered.some(market => market.complete) ? "offered" : offered.length > 0 ? "partial-offers" : "no-offers",
    flags: { finished: row.finished, blocked: row.blocked, stopped: row.stopped }, markets,
  } as const;
}

function occurrenceHash(fixture: InPlayFixtureOccurrence) {
  return evidenceFingerprint([fixture.id, fixture.kickoffAt.getTime(), fixture.homeTeamId, fixture.awayTeamId]);
}

type Head = InPlayFixtureOccurrence & { revisionId: string; occurrenceHash: string; semanticHash: string; outOfOrder: boolean | number | bigint;
  lastObservedAt: Date; lastProviderUpdatedAt: Date | null; bodyJson: unknown };

type ObservedBody = ReturnType<typeof structuredInPlayOdds>;
type HistoryBody = ObservedBody | (Omit<ObservedBody, "availability" | "flags" | "markets"> &
  { availability: "not-returned"; flags: null; markets: readonly [] });

function sourceRecord(row: Head): HistoryBody | null {
  try {
    const value: unknown = typeof row.bodyJson === "string" ? JSON.parse(row.bodyJson) : row.bodyJson;
    if (value === null || Array.isArray(value) || typeof value !== "object" || !("providerFixtureId" in value) ||
        !("availability" in value) || evidenceFingerprint(value) !== row.semanticHash) return null;
    return value as HistoryBody;
  } catch { return null; }
}

/** The caller holds the poll-state fence so history and current quotes cannot publish out of order. */
export async function retainInPlayOddsHistory(tx: Prisma.TransactionClient, matched: readonly MatchedOdds[], returned: ReadonlySet<number>,
  catalog: Readonly<Record<string, string>>, retrievedAt: number, previousWindowMs: number, competitionIds?: readonly number[]): Promise<void> {
  const received = new Date(retrievedAt), cutoff = new Date(retrievedAt - previousWindowMs);
  const matchedIds = matched.map(({ fixture }) => fixture.id);
  const includeSupplied = matchedIds.length ? Prisma.sql`OR h.fixtureId IN (${Prisma.join(matchedIds)})` : Prisma.empty;
  const heads = await tx.$queryRaw<Head[]>`
    WITH ranked AS (
      SELECT h.id,
        ROW_NUMBER() OVER (PARTITION BY h.fixtureId, h.occurrenceHash, h.outOfOrder ORDER BY h.firstObservedAt DESC,h.id DESC) AS rowRank
      FROM FixtureInPlayOddsHistory h
      WHERE h.lastObservedAt >= ${cutoff} ${includeSupplied}
    ) SELECT h.id AS revisionId, f.id, f.externalId AS providerId, f.kickoff AS kickoffAt, f.homeTeamId, f.awayTeamId,
      h.occurrenceHash, h.semanticHash, h.outOfOrder, h.lastObservedAt, h.lastProviderUpdatedAt, h.bodyJson
    FROM ranked r JOIN FixtureInPlayOddsHistory h ON h.id=r.id
    JOIN FootballFixture f ON f.id=h.fixtureId AND f.kickoff IS NOT NULL WHERE r.rowRank = 1`;
  const headKey = (occurrence: string, outOfOrder: boolean) => `${occurrence}:${Number(outOfOrder)}`;
  const previous = new Map(heads.map(row => [headKey(row.occurrenceHash, Boolean(row.outOfOrder)), row]));
  const review = reviewNames(catalog);
  const inserts: Prisma.Sql[] = [], updates: { id: string; updated: number | null }[] = [];
  const distinct = new Set<string>();
  for (const { fixture, row } of matched) {
    const occurrence = occurrenceHash(fixture);
    if (distinct.has(occurrence)) continue;
    distinct.add(occurrence);
    const current = previous.get(headKey(occurrence, false)), sourceTime = row.source.providerUpdatedAt;
    const value = structuredInPlayOdds(row, catalog, review), hash = evidenceFingerprint(value);
    const previousSource = current?.lastProviderUpdatedAt?.getTime();
    const stale = current !== undefined && (current.lastObservedAt.getTime() > retrievedAt ||
      current.lastObservedAt.getTime() === retrievedAt && current.semanticHash !== hash ||
      previousSource !== undefined && (sourceTime === null || sourceTime < previousSource));
    observe(fixture.id, occurrence, value, hash, sourceTime, stale);
  }
  for (const prior of heads) {
    if (prior.outOfOrder || prior.lastObservedAt < cutoff || prior.lastObservedAt >= received || returned.has(Number(prior.providerId)) ||
        occurrenceHash(prior) !== prior.occurrenceHash) continue;
    const old = sourceRecord(prior);
    if (!old || old.availability === "not-returned" || competitionIds && !competitionIds.includes(old.competitionId)) continue;
    const absent = { ...old, availability: "not-returned", flags: null, markets: [] } as const;
    // A missing listing is an observed absence, without a provider update clock or invented quote.
    observe(prior.id, prior.occurrenceHash, absent, evidenceFingerprint(absent), null, false, prior.lastProviderUpdatedAt?.getTime() ?? null);
  }
  for (let offset = 0; offset < inserts.length; offset += writeBatchSize) {
    await tx.$executeRaw`INSERT INTO FixtureInPlayOddsHistory (id, fixtureId, occurrenceHash, semanticHash, outOfOrder,
      firstObservedAt, lastObservedAt, providerUpdatedAt, lastProviderUpdatedAt, bodyJson)
      VALUES ${Prisma.join(inserts.slice(offset, offset + writeBatchSize))}
      ON DUPLICATE KEY UPDATE lastObservedAt=FixtureInPlayOddsHistory.lastObservedAt`;
  }
  for (let offset = 0; offset < updates.length; offset += writeBatchSize) {
    const ranges = updates.slice(offset, offset + writeBatchSize).map(({ id, updated }) =>
      Prisma.sql`SELECT ${id} AS id, CAST(${updated === null ? null : new Date(updated)} AS DATETIME(3)) AS updated`);
    await tx.$executeRaw`UPDATE FixtureInPlayOddsHistory h JOIN (${Prisma.join(ranges, " UNION ALL ")}) watched ON watched.id = h.id
      SET h.lastObservedAt = GREATEST(h.lastObservedAt, ${received}), h.lastProviderUpdatedAt = CASE
        WHEN watched.updated IS NULL THEN h.lastProviderUpdatedAt
        WHEN h.lastProviderUpdatedAt IS NULL THEN watched.updated
        ELSE GREATEST(h.lastProviderUpdatedAt, watched.updated) END`;
  }

  function observe(fixtureId: string, occurrence: string, body: HistoryBody, hash: string, sourceTime: number | null, stale: boolean,
    latestSourceTime = sourceTime) {
    const prior = previous.get(headKey(occurrence, stale));
    if (prior?.semanticHash === hash) {
      if (prior.lastObservedAt < received) updates.push({ id: prior.revisionId, updated: sourceTime });
      return;
    }
    const id = evidenceFingerprint([fixtureId, occurrence, retrievedAt, hash, stale]);
    const updated = sourceTime === null ? null : new Date(sourceTime);
    const latest = latestSourceTime === null ? null : new Date(latestSourceTime);
    inserts.push(Prisma.sql`(${id}, ${fixtureId}, ${occurrence}, ${hash}, ${stale}, ${received}, ${received}, ${updated}, ${latest}, ${JSON.stringify(body)})`);
  }
}
