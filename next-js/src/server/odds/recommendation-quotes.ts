import "server-only";

import { launchOddsGroup, launchOddsMapping } from "../../domain/odds-markets.ts";
import { recommendationPolicy, type RecommendationQuote } from "../../domain/recommendation.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { EvidenceContext } from "../evidence/evidence-contract.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { assertHistorySeal, historyJson } from "../predictions/history-read.ts";
import { provenTrue } from "../shared/authority-proof.ts";
import { storedOddsBatchSchema, storedOddsSnapshotSchema, oddsValuesHash, type StoredOddsSnapshot } from "./odds-mysql-store.ts";
import type { OddsBatchBody } from "./odds-contract.ts";

type Sealed = Readonly<{ body: unknown; validIntegrity: unknown }>;
/** Pure conversion: only the currently observed bet manifest can make an older unchanged snapshot usable.
 * It never copies bookmaker-implied probabilities into a forecast and never renews the original source clocks. */
export function recommendationQuotesFromSnapshots(input: Readonly<{
  context: EvidenceContext; bookmakerId: number; freshnessMs: number; batch: OddsBatchBody;
  snapshots: readonly StoredOddsSnapshot[]; catalog: ReadonlyMap<number, string>; permitted: boolean;
}>): readonly RecommendationQuote[] {
  const { context, batch } = input, cutoff = context.cutoffAt;
  const entry = batch.fixtures.find((fixture) => fixture.externalId === context.externalFixtureId);
  const manifest = entry?.quoteManifest;
  if (!input.permitted || batch.kind !== "prices" || batch.receivedAt > cutoff || entry?.outcome !== "apply" ||
    !manifest || manifest.bookmakerId !== input.bookmakerId || manifest.kickoffAt !== context.kickoffAt || input.freshnessMs <= 0) return [];
  const quotes: RecommendationQuote[] = [];
  for (const mapping of launchOddsMapping) {
    const observed = manifest.bets.filter((bet) => bet.betId === mapping.betId);
    const snapshot = input.snapshots.find((row) => row.betId === mapping.betId);
    if (observed.length !== 1 || !snapshot || snapshot.fixtureId !== context.fixtureId || snapshot.bookmakerId !== input.bookmakerId ||
      snapshot.retrievedAt > cutoff || cutoff - snapshot.retrievedAt > Math.min(input.freshnessMs, recommendationPolicy.quoteMaxAgeMs) ||
      snapshot.retainUntil < cutoff || snapshot.providerUpdatedAt !== null && snapshot.providerUpdatedAt > snapshot.retrievedAt ||
      snapshot.valuesHash !== observed[0]!.valuesHash || snapshot.valuesHash !== oddsValuesHash(snapshot.values) ||
      snapshot.betName !== observed[0]!.betName) continue;
    const group = launchOddsGroup(mapping, { betId: snapshot.betId, betName: snapshot.betName, values: snapshot.values }, input.catalog.get(mapping.betId));
    if (!group) continue;
    for (const selection of group.selections) quotes.push({ fixtureId: context.fixtureId, fixtureVersion: String(context.fixtureVersion),
      homeTeamId: context.home.teamId, awayTeamId: context.away.teamId, family: mapping.family, selection: selection.selection,
      period: publicPolicy.matchPeriod, line: mapping.line === null ? null : Number(mapping.line), bookmakerId: snapshot.bookmakerId,
      decimal: selection.price.text, snapshotId: snapshot.id, observedAt: snapshot.retrievedAt, providerUpdatedAt: snapshot.providerUpdatedAt,
      observationReceiptId: batch.id,
      permitted: true, suspended: false });
  }
  return freezeEvidence(quotes);
}

/** Permitted internal read, independent of public odds display. No network request or mutable public price is used.
 * Changed state after the frozen evidence cutoff is conservatively unavailable; replay uses the sealed decision. */
export function createRecommendationQuoteLoader(database: DatabaseRuntime, options: Readonly<{
  bookmakerId: number; freshnessMs: number; expectedPolicyHash: string; verifyInternalUse(): boolean;
}>) {
  return async (context: EvidenceContext): Promise<readonly RecommendationQuote[]> => {
    if (!provenTrue(options.verifyInternalUse)) return [];
    return database.query(async (tx) => {
      const fixture = await tx.footballFixture.findUnique({ where: { id: context.fixtureId },
        select: { provider: true, externalId: true, homeTeamId: true, awayTeamId: true, kickoff: true, dataVersion: true } });
      if (!fixture || fixture.provider !== context.provider || fixture.externalId !== BigInt(context.externalFixtureId) ||
        fixture.homeTeamId !== context.home.teamId || fixture.awayTeamId !== context.away.teamId || fixture.kickoff?.getTime() !== context.kickoffAt ||
        fixture.dataVersion < context.fixtureVersion) return [];
      const state = await tx.fixtureOddsState.findUnique({ where: { fixtureId: context.fixtureId } });
      if (!state || state.policyHash !== options.expectedPolicyHash || state.withdrawnAt !== null ||
        state.lastRetrievedAt.getTime() > context.cutoffAt || context.cutoffAt - state.lastRetrievedAt.getTime() > options.freshnessMs) return [];
      const row = (await tx.$queryRaw<Sealed[]>`SELECT body, integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity
        FROM OddsImportBatch WHERE id=${state.latestBatchId}`)[0];
      if (!row) return [];
      assertHistorySeal(row.validIntegrity);
      const batch = storedOddsBatchSchema.parse(historyJson(row.body)) as unknown as OddsBatchBody;
      if (batch.id !== state.latestBatchId || batch.policyHash !== options.expectedPolicyHash) return [];
      const catalogRow = (await tx.$queryRaw<Sealed[]>`SELECT body, integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity
        FROM OddsImportBatch WHERE scopeKey='bets' AND kind='bets' AND status='complete' AND receivedAt<=${new Date(context.cutoffAt)}
        ORDER BY receivedAt DESC,id DESC LIMIT 1`)[0];
      if (!catalogRow) return [];
      assertHistorySeal(catalogRow.validIntegrity);
      const catalog = storedOddsBatchSchema.parse(historyJson(catalogRow.body));
      const snapshots: StoredOddsSnapshot[] = [];
      for (const mapping of launchOddsMapping) {
        const quote = (await tx.$queryRaw<Sealed[]>`SELECT body, integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity
          FROM ProviderOddsSnapshot WHERE fixtureId=${context.fixtureId} AND bookmakerExternalId=${options.bookmakerId}
          AND betExternalId=${mapping.betId} AND retrievedAt<=${new Date(context.cutoffAt)} ORDER BY retrievedAt DESC,id DESC LIMIT 1`)[0];
        if (!quote) continue;
        assertHistorySeal(quote.validIntegrity);
        const snapshot = storedOddsSnapshotSchema.parse(historyJson(quote.body));
        const { id, retrievedAt: _retrieved, providerUpdatedAt: _updated, retainUntil: _retain, values: _values, ...identity } = snapshot;
        void _retrieved; void _updated; void _retain; void _values;
        if (evidenceFingerprint(identity) !== id) continue;
        snapshots.push(snapshot);
      }
      if (!provenTrue(options.verifyInternalUse)) return [];
      return recommendationQuotesFromSnapshots({ context, bookmakerId: options.bookmakerId, freshnessMs: options.freshnessMs,
        batch, snapshots, catalog: new Map(catalog.catalog.map((entry) => [entry.id, entry.name])), permitted: true });
    });
  };
}
