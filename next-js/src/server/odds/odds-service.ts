import "server-only";

import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { ApiFootballBounds, ApiFootballResult } from "../football/api-football-contract.ts";
import type { NormalizedFixtureOdds, NormalizedOddsCatalogEntry } from "../football/api-football-normalize.ts";
import type { OddsQuery } from "../football/api-football-adapter.ts";
import { provenTrue as verified } from "../shared/authority-proof.ts";
import { oddsFail, type OddsAuthority, type OddsBatchBody, type OddsFixtureOutcome, type OddsImportRequest,
  type OddsImportSummary, type ValidatedOddsObservation } from "./odds-contract.ts";
import { assertValidatedOdds, authorizeOddsRequest, validateOddsObservation } from "./odds-input.ts";
import { oddsValuesHash } from "./odds-mysql-store.ts";
import type { MysqlOddsStore, OddsFixtureTarget } from "./odds-mysql-store.ts";

/** The odds namespace of the API-Football adapter; it is separate from evidence and fallback. */
export type OddsProvider = Readonly<{
  prices(query: OddsQuery, bounds: ApiFootballBounds): Promise<ApiFootballResult<NormalizedFixtureOdds>>;
  bets(bounds: ApiFootballBounds): Promise<ApiFootballResult<NormalizedOddsCatalogEntry>>;
  bookmakers(bounds: ApiFootballBounds): Promise<ApiFootballResult<NormalizedOddsCatalogEntry>>;
}>;
const MAX_RETAINED_COVERAGE = 1_000;

/** Pure receipt classification; prices for unknown, started, rescheduled or non-scheduled fixtures are never applied. */
export function classifyOddsRow(row: NormalizedFixtureOdds, target: OddsFixtureTarget | undefined): OddsFixtureOutcome {
  if (!target) return "unknown-fixture";
  if (target.status !== "scheduled") return "not-scheduled";
  if (target.kickoff === null || row.kickoff === null || target.kickoff !== row.kickoff) return "kickoff-mismatch";
  if (target.kickoff <= row.source.retrievedAt) return "after-kickoff";
  return "apply";
}
const providerError = (result: ApiFootballResult<unknown>) => result.error === null ? null
  : Object.freeze({ reason: result.error.reason, retryable: result.error.retryable });
function emptyOutcomes(): Record<OddsImportSummary["outcomes"] extends Readonly<Record<infer Key, number>> ? Key : never, number> {
  return { apply: 0, "unknown-fixture": 0, "after-kickoff": 0, "kickoff-mismatch": 0, "not-scheduled": 0, changed: 0, unchanged: 0, skipped: 0, withdrawn: 0 };
}

/** Quota-limited odds imports. All provider I/O happens before any transaction; receipts are written first,
 * then each fixture is applied in its own short transaction. Withdrawal happens only after a complete sweep. */
export function createOddsImportService(options: Readonly<{
  adapter: OddsProvider; store: MysqlOddsStore; authority: OddsAuthority;
  /** Provider-day quota account that owns the receipts (an ApiQuotaAccount row). */
  accountId: () => string;
  bounds: (request: OddsImportRequest) => ApiFootballBounds;
  clock?: Clock;
}>) {
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  async function receipt(observation: ValidatedOddsObservation, fixtures: OddsBatchBody["fixtures"]): Promise<OddsBatchBody> {
    const valid = assertValidatedOdds(observation), { request } = valid;
    const content = { accountId: options.accountId(), kind: request.kind, scopeKey: valid.scopeKey, policyHash: valid.policyHash,
      status: valid.status, requestsDispatched: valid.requestsDispatched, receivedAt: valid.receivedAt, requestId: request.id, slot: request.slot,
      date: request.date, contractVersion: request.policy.contractVersion, reasons: valid.reasons,
      missingCoverage: valid.missingCoverage.slice(0, MAX_RETAINED_COVERAGE), pages: valid.provenance, fixtures,
      catalog: valid.catalog.map(({ id, name }) => ({ id, name })) };
    return options.store.saveBatch({ id: evidenceFingerprint(content), ...content } as OddsBatchBody);
  }
  return Object.freeze({
    /** One EAT date for the one documented bookmaker. Returns counts only; prices stay in the store. */
    async importDate(input: OddsImportRequest, signal?: AbortSignal): Promise<OddsImportSummary> {
      const request = authorizeOddsRequest(input, options.authority);
      if (request.kind !== "prices" || request.date === null) return oddsFail("invalid-request");
      const bounds = options.bounds(request);
      const result = await options.adapter.prices({ date: request.date, bookmakerId: request.policy.bookmakerId }, bounds);
      // Authorization, policy and retention are re-verified after I/O, inside validation.
      const observation = validateOddsObservation(request, result, bounds, options.authority, clock);
      const targets = await options.store.resolveFixtures(observation.rows.map((row) => row.fixtureId));
      const classified = observation.rows.map((row) => ({ row, target: targets.get(row.fixtureId), outcome: classifyOddsRow(row, targets.get(row.fixtureId)) }));
      const batch = await receipt(observation, classified.map(({ row, outcome }) => ({ externalId: row.fixtureId, outcome,
        observationHash: evidenceFingerprint(row), quoteManifest: { bookmakerId: request.policy.bookmakerId, kickoffAt: row.kickoff,
          bets: (row.bookmakers.find((bookmaker) => bookmaker.id === request.policy.bookmakerId)?.bets ?? [])
            .map((bet) => ({ betId: bet.id, betName: bet.name, valuesHash: oddsValuesHash(bet.values) })) } })));
      const outcomes = emptyOutcomes();
      for (const { outcome } of classified) outcomes[outcome]++;
      const publicDisplay = verified(() => options.authority.verifyPublicDisplay());
      const catalog = publicDisplay ? await options.store.latestBetCatalog() : null;
      // The bounds end the provider walk early enough to leave the writes their own part of the job timeout; the store
      // verifies the receipt once per import and writes each fixture's changed bets in one statement. A job aborted
      // here keeps every fixture already applied; its retry walks the pages again, charged to the odds spare.
      for (const { row, target, outcome } of classified) {
        if (outcome !== "apply") continue;
        if (signal?.aborted) return oddsFail("unavailable");
        outcomes[await options.store.applyFixture({ batchId: batch.id, policy: request.policy, policyHash: observation.policyHash,
          fixtureId: target!.fixtureId, row, publicDisplay, catalog })]++;
      }
      // Partial sweeps never withdraw: absence from an incomplete response proves nothing.
      if (batch.status === "complete") outcomes.withdrawn = await options.store.markWithdrawn({ batchId: batch.id, date: request.date,
        seenFixtureIds: classified.flatMap(({ target }) => target ? [target.fixtureId] : []) });
      return Object.freeze({ batchId: batch.id, status: batch.status, requestsDispatched: batch.requestsDispatched, outcomes: Object.freeze(outcomes),
        error: providerError(result) });
    },
    /** /odds/bets (every observed name is retained for 053/054 mapping) or /odds/bookmakers. */
    async importCatalog(input: OddsImportRequest): Promise<OddsImportSummary> {
      const request = authorizeOddsRequest(input, options.authority);
      if (request.kind === "prices") return oddsFail("invalid-request");
      const bounds = options.bounds(request);
      const result = request.kind === "bets" ? await options.adapter.bets(bounds) : await options.adapter.bookmakers(bounds);
      const observation = validateOddsObservation(request, result, bounds, options.authority, clock);
      const batch = await receipt(observation, []);
      if (request.kind === "bets" && batch.catalog.length > 0) await options.store.saveBetObservations(batch.id, batch.catalog);
      return Object.freeze({ batchId: batch.id, status: batch.status, requestsDispatched: batch.requestsDispatched, outcomes: Object.freeze(emptyOutcomes()),
        error: providerError(result) });
    },
    /** Write-time staleness sweep; makes no provider calls, so it runs on every runner tick even while imports are off.
     * Without verified display rights it first stales every fresh public price, closing prices after kickoff included,
     * so withdrawn rights never leave a fresh row behind. Returns how many fixtures changed. */
    async expire(freshnessMs: number, limit: number): Promise<number> {
      const hidden = verified(() => options.authority.verifyPublicDisplay()) ? 0 : await options.store.staleUnauthorized(limit);
      return hidden + await options.store.expireStale(freshnessMs, limit);
    },
  });
}
export type OddsImportService = ReturnType<typeof createOddsImportService>;
