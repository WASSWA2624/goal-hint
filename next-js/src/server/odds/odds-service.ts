import "server-only";

import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { ApiFootballBounds, ApiFootballFallbackWorkflow, ApiFootballResult } from "../football/api-football-contract.ts";
import type { NormalizedFixtureOdds, NormalizedOddsCatalogEntry } from "../football/api-football-normalize.ts";
import type { OddsSweepQuery } from "../football/api-football-adapter.ts";
import { provenTrue as verified } from "../shared/authority-proof.ts";
import { oddsFail, mayRetainRecoveredPreMatchFixtureStatus, type OddsAuthority, type OddsBatchBody, type OddsFixtureOutcome, type OddsImportRequest,
  type OddsImportSummary, type ValidatedOddsObservation } from "./odds-contract.ts";
import { assertValidatedOdds, authorizeOddsRequest, oddsPolicyHash, oddsPricePageScopeKey, oddsScopeKey, validateOddsObservation } from "./odds-input.ts";
import { fixtureQuoteManifests } from "./odds-mysql-store.ts";
import type { MysqlOddsStore, OddsFixtureTarget } from "./odds-mysql-store.ts";

/** The odds namespace of the API-Football adapter; it is separate from evidence and fallback. */
export type OddsProvider = Readonly<{
  prices(query: OddsSweepQuery, bounds: ApiFootballBounds, workflow?: ApiFootballFallbackWorkflow): Promise<ApiFootballResult<NormalizedFixtureOdds>>;
  pricesPage?(query: OddsSweepQuery, page: number, bounds: ApiFootballBounds, workflow?: ApiFootballFallbackWorkflow): Promise<ApiFootballResult<NormalizedFixtureOdds>>;
  bets(bounds: ApiFootballBounds): Promise<ApiFootballResult<NormalizedOddsCatalogEntry>>;
  bookmakers(bounds: ApiFootballBounds): Promise<ApiFootballResult<NormalizedOddsCatalogEntry>>;
}>;
const MAX_RETAINED_COVERAGE = 1_000;
const PRICE_PAGE_SIZE = 10;
const MAX_COMMITTED_PRICE_PAGES = 1_000;

/** Pure receipt classification; prices for unknown, started, rescheduled or non-scheduled fixtures are never applied. */
export function classifyOddsRow(row: NormalizedFixtureOdds, target: OddsFixtureTarget | undefined): OddsFixtureOutcome {
  if (!target) return "unknown-fixture";
  if (target.status !== "scheduled") return "not-scheduled";
  if (target.kickoff === null || row.kickoff === null || target.kickoff !== row.kickoff) return "kickoff-mismatch";
  if (target.kickoff <= row.source.retrievedAt) return "after-kickoff";
  return "apply";
}
export function classifyHistoricalOddsRow(row: NormalizedFixtureOdds, target: OddsFixtureTarget | undefined): OddsFixtureOutcome {
  if (!target) return "unknown-fixture";
  if (target.kickoff === null || row.kickoff === null || target.kickoff !== row.kickoff) return "kickoff-mismatch";
  if (target.kickoff > row.source.retrievedAt || !mayRetainRecoveredPreMatchFixtureStatus(target.status)) return "awaiting-start";
  return "recover";
}
const providerError = (result: ApiFootballResult<unknown>) => result.error === null ? null
  : Object.freeze({ reason: result.error.reason, retryable: result.error.retryable });
function emptyOutcomes(): Record<OddsImportSummary["outcomes"] extends Readonly<Record<infer Key, number>> ? Key : never, number> {
  return { apply: 0, recover: 0, "unknown-fixture": 0, "after-kickoff": 0, "kickoff-mismatch": 0, "not-scheduled": 0,
    "awaiting-start": 0, changed: 0, unchanged: 0, skipped: 0, withdrawn: 0 };
}

/** Quota-limited odds imports. The coordinated worker seals each page with its fixture snapshots after the
 * provider returns. The legacy worker applies fixtures after sealing its aggregate. Withdrawal requires a complete sweep. */
export function createOddsImportService(options: Readonly<{
  adapter: OddsProvider; store: MysqlOddsStore; authority: OddsAuthority;
  /** Provider-day quota account that owns the receipts (an ApiQuotaAccount row). */
  accountId: () => string;
  bounds: (request: OddsImportRequest) => ApiFootballBounds;
  resumePricePages?: boolean;
  recoverFromCurrentPages?: boolean;
  clock?: Clock;
}>) {
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  function priceQuery(request: OddsImportRequest): OddsSweepQuery {
    if (request.date === null) return oddsFail("invalid-request");
    if (request.fixtureId !== undefined) return request.policy.bookmakerScope === "all"
      ? { fixtureId: request.fixtureId, allBookmakers: true } : { fixtureId: request.fixtureId, bookmakerId: request.policy.bookmakerId };
    return request.recovery || request.policy.bookmakerScope === "all"
      ? { date: request.date, allBookmakers: true } : { date: request.date, bookmakerId: request.policy.bookmakerId };
  }
  function completedRecovery(request: OddsImportRequest) {
    return options.store.completedRecoveryBatch({ requestId: request.id, scopeKey: oddsScopeKey(request), policyHash: oddsPolicyHash(request.policy) });
  }
  function receiptBody(observation: ValidatedOddsObservation, fixtures: OddsBatchBody["fixtures"], checkpoint?: OddsBatchBody["checkpoint"]): OddsBatchBody {
    const valid = assertValidatedOdds(observation), { request } = valid;
    const content = { accountId: options.accountId(), kind: request.kind,
      scopeKey: checkpoint ? oddsPricePageScopeKey(request.id) : valid.scopeKey, policyHash: valid.policyHash,
      status: valid.status, requestsDispatched: valid.requestsDispatched, receivedAt: valid.receivedAt, requestId: request.id, slot: request.slot,
      date: request.date, contractVersion: request.policy.contractVersion, reasons: valid.reasons,
      missingCoverage: valid.missingCoverage.slice(0, MAX_RETAINED_COVERAGE), pages: valid.provenance, fixtures,
      catalog: valid.catalog.map(({ id, name }) => ({ id, name })), ...(checkpoint && { checkpoint }),
      ...(request.recovery && { recovery: true as const }) };
    return { id: evidenceFingerprint(content), ...content } as OddsBatchBody;
  }
  async function classify(observation: ValidatedOddsObservation, recoverFromCurrentPage = false) {
    const targets = await options.store.resolveFixtures(observation.rows.map((row) => row.fixtureId));
    return observation.rows.map((row) => {
      const target = targets.get(row.fixtureId);
      const outcome = observation.request.recovery ? classifyHistoricalOddsRow(row, target) : classifyOddsRow(row, target);
      return { row, target, outcome: recoverFromCurrentPage && outcome !== "apply" && classifyHistoricalOddsRow(row, target) === "recover"
        ? "recover" as const : outcome };
    });
  }
  function fixturesOf(classified: Awaited<ReturnType<typeof classify>>, bookmakerId: number) {
    return classified.map(({ row, outcome }) => ({ externalId: row.fixtureId, outcome, observationHash: evidenceFingerprint(row),
      ...fixtureQuoteManifests(row, bookmakerId) }));
  }
  function workflow(bounds: ApiFootballBounds, signal: AbortSignal | undefined): ApiFootballFallbackWorkflow {
    const check = () => { if (signal?.aborted || clock.now() >= bounds.deadlineAt) oddsFail("unavailable"); };
    return { signal: signal ?? new AbortController().signal, deadlineAt: bounds.deadlineAt, check, beforeReserve: check, beforeDispatch: check };
  }
  async function importPages(request: OddsImportRequest, query: OddsSweepQuery, bounds: ApiFootballBounds,
    signal?: AbortSignal, checkpoint?: () => Promise<void>): Promise<OddsImportSummary> {
    const readPage = options.adapter.pricesPage;
    if (!readPage) return oddsFail("unavailable");
    const policyHash = oddsPolicyHash(request.policy), committed = [...await options.store.pricePageBatches(request.id, policyHash)];
    if (committed.some((batch) => !batch.checkpoint)) return oddsFail("invalid-state");
    committed.sort((left, right) => left.checkpoint!.page - right.checkpoint!.page);
    const previouslyCommitted = committed.length;
    const accountId = options.accountId(), expected = committed[0]?.checkpoint?.totalPages;
    const known = new Set<number>();
    let repeatedHistoryFixture = false;
    for (const [index, batch] of committed.entries()) {
      if (batch.checkpoint?.page !== index + 1 || batch.checkpoint.totalPages !== expected || !request.recovery && batch.accountId !== accountId ||
        batch.requestId !== request.id || batch.date !== request.date || batch.slot !== request.slot || batch.status === "failed" || batch.recovery !== request.recovery ||
        batch.pages.some(({ requestParameters }) => requestParameters.fixture !== (request.fixtureId === undefined ? undefined : String(request.fixtureId))) ||
        !request.recovery && batch.fixtures.some(({ externalId }) => known.has(externalId))) return oddsFail("invalid-state");
      if (request.recovery && batch.fixtures.some(({ externalId }) => known.has(externalId))) repeatedHistoryFixture = true;
      for (const { externalId } of batch.fixtures) known.add(externalId);
    }
    let totalPages = expected, requestsDispatched = 0, countedInPages = 0;
    let error: OddsImportSummary["error"] = null;
    let verifiedEmpty: ValidatedOddsObservation | null = null;
    const outcomes = emptyOutcomes();
    const providerWorkflow = workflow(bounds, signal);
    const publicDisplay = !request.recovery && verified(() => options.authority.verifyPublicDisplay());
    const catalog = publicDisplay ? await options.store.latestBetCatalog() : null;
    while (totalPages === undefined || committed.length < totalPages) {
      if (signal?.aborted) return oddsFail("unavailable");
      if (clock.now() >= bounds.deadlineAt || requestsDispatched >= bounds.maxRequests || committed.length - previouslyCommitted >= bounds.maxPages) {
        error = { reason: "request-budget-exhausted", retryable: true }; break;
      }
      if (committed.length >= MAX_COMMITTED_PRICE_PAGES) { error = { reason: "pagination-incomplete", retryable: false }; break; }
      await checkpoint?.();
      const page = committed.length + 1;
      const pageBounds = { ...bounds, maxRequests: Math.min(2, bounds.maxRequests - requestsDispatched), maxPages: 1,
        maxRows: Math.min(PRICE_PAGE_SIZE, bounds.maxRows), cacheMaxAgeMs: 0 };
      const result = await readPage(query, page, pageBounds, providerWorkflow);
      requestsDispatched += result.requestsDispatched;
      const observation = validateOddsObservation(request, result, pageBounds, options.authority, clock, page);
      const pages = observation.provenance[0]?.totalPages;
      if (observation.status === "failed" || pages == null || request.fixtureId !== undefined && observation.status !== "complete") {
        error = providerError(result) ?? { reason: "schema-error", retryable: false };
        break;
      }
      if (pages === 0 && (request.recovery || request.fixtureId !== undefined) && page === 1 && observation.status === "complete") {
        verifiedEmpty = observation; totalPages = 0; break;
      }
      const repeated = observation.rows.some(({ fixtureId }) => known.has(fixtureId));
      if (totalPages !== undefined && pages !== totalPages || !request.recovery && repeated ||
        page < pages && observation.rows.length !== PRICE_PAGE_SIZE && observation.status === "complete") {
        error = { reason: "pagination-incomplete", retryable: false }; break;
      }
      if (request.recovery && repeated) repeatedHistoryFixture = true;
      totalPages = pages;
      const classified = await classify(observation, options.recoverFromCurrentPages && request.fixtureId === undefined);
      const batch = receiptBody(observation, fixturesOf(classified, request.policy.bookmakerId), { page, totalPages });
      await checkpoint?.();
      if (signal?.aborted || batch.accountId !== accountId) return oddsFail("unavailable");
      const saved = await options.store.saveAndApplyPricePage(batch, classified.flatMap(({ row, target, outcome }) => outcome === "apply" || outcome === "recover" ?
        [{ batchId: batch.id, policy: request.policy, policyHash, fixtureId: target!.fixtureId, row, publicDisplay, catalog }] : []));
      committed.push(saved.batch);
      countedInPages += saved.batch.requestsDispatched;
      for (const { externalId } of saved.batch.fixtures) known.add(externalId);
      for (const outcome of saved.outcomes) outcomes[outcome]++;
    }
    if (error === null && repeatedHistoryFixture) error = { reason: "pagination-incomplete", retryable: false };
    const complete = error === null && committed.length === totalPages && committed.every(({ status }) => status === "complete");
    const reasons = [...new Set([...committed.flatMap((batch) => batch.reasons), ...(error ? [error.reason] : [])])].sort();
    // Per-offer manifests already live on the atomic pages. The terminal receipt only proves date coverage.
    const observations = committed.flatMap((batch) => batch.fixtures.map(({ externalId, outcome, observationHash }) =>
      ({ externalId, outcome, observationHash })));
    const fixtures = request.recovery && repeatedHistoryFixture
      ? [...new Map(observations.map((entry) => [entry.externalId, entry])).values()] : observations;
    const content = { accountId, kind: "prices" as const, scopeKey: oddsScopeKey(request), policyHash,
      status: complete ? "complete" as const : committed.length === 0 ? "failed" as const : "partial" as const,
      // Atomic page receipts already count their physical attempts. Attribute only uncommitted requests here.
      requestsDispatched: requestsDispatched - countedInPages,
      receivedAt: error === null ? verifiedEmpty?.receivedAt ?? committed.at(-1)?.receivedAt ?? clock.now() : clock.now(), requestId: request.id, slot: request.slot,
      date: request.date, contractVersion: request.policy.contractVersion, reasons,
      missingCoverage: verifiedEmpty ? [...new Set([...verifiedEmpty.missingCoverage, "odds-coverage-not-established"])].sort() :
        [...new Set(committed.flatMap((batch) => batch.missingCoverage))].sort().slice(0, MAX_RETAINED_COVERAGE),
      pages: verifiedEmpty?.provenance ?? committed.flatMap((batch) => batch.pages), fixtures, catalog: [],
      ...(request.recovery && { recovery: true as const }) };
    await checkpoint?.();
    if (signal?.aborted) return oddsFail("unavailable");
    const batch = await options.store.saveBatch({ id: evidenceFingerprint(content), ...content });
    for (const { outcome } of fixtures) outcomes[outcome]++;
    if (complete && !request.recovery && request.fixtureId === undefined) {
      const targets = await options.store.resolveFixtures([...known]);
      outcomes.withdrawn = await options.store.markWithdrawn({ batchId: batch.id, date: request.date!,
        seenFixtureIds: [...targets.values()].map((target) => target.fixtureId) });
    }
    return Object.freeze({ batchId: batch.id, status: batch.status, requestsDispatched, outcomes: Object.freeze(outcomes), error,
      continuation: error?.retryable === true });
  }
  return Object.freeze({
    /** One bounded EAT date sweep. Returns counts only; prices stay in the store. */
    async importDate(input: OddsImportRequest, signal?: AbortSignal, checkpoint?: () => Promise<void>): Promise<OddsImportSummary> {
      const request = authorizeOddsRequest(input, options.authority);
      if (request.kind !== "prices" || request.date === null || request.recovery || request.fixtureId !== undefined) return oddsFail("invalid-request");
      const bounds = options.bounds(request);
      const query = priceQuery(request);
      if (options.resumePricePages) return importPages(request, query, bounds, signal, checkpoint);
      const result = await options.adapter.prices(query, bounds, signal && workflow(bounds, signal));
      // Authorization, policy and retention are re-verified after I/O, inside validation.
      const observation = validateOddsObservation(request, result, bounds, options.authority, clock);
      const classified = await classify(observation);
      const batch = await options.store.saveBatch(receiptBody(observation, fixturesOf(classified, request.policy.bookmakerId)));
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
    /** One scheduled fixture. Atomic page receipts never imply that another fixture's odds were withdrawn. */
    async importFixture(input: OddsImportRequest, signal?: AbortSignal, checkpoint?: () => Promise<void>): Promise<OddsImportSummary> {
      const request = authorizeOddsRequest(input, options.authority);
      if (request.kind !== "prices" || request.fixtureId === undefined) return oddsFail("invalid-request");
      return importPages(request, priceQuery(request), options.bounds(request), signal, checkpoint);
    },
    /** Backfill pages use the same structured provider endpoint and keep a separate receipt chain across provider days. */
    async historicalComplete(input: OddsImportRequest): Promise<OddsBatchBody | null> {
      const request = authorizeOddsRequest(input, options.authority);
      if (!request.recovery || request.kind !== "prices" || request.date === null) return oddsFail("invalid-request");
      return completedRecovery(request);
    },
    async importHistoricalDate(input: OddsImportRequest, signal?: AbortSignal, checkpoint?: () => Promise<void>): Promise<OddsImportSummary> {
      const request = authorizeOddsRequest(input, options.authority);
      if (!request.recovery || request.kind !== "prices" || request.date === null) return oddsFail("invalid-request");
      const previous = await completedRecovery(request);
      if (previous) {
        const outcomes = emptyOutcomes();
        for (const { outcome } of previous.fixtures) outcomes[outcome]++;
        return { batchId: previous.id, status: previous.status, requestsDispatched: 0, outcomes, error: null };
      }
      return importPages(request, priceQuery(request), options.bounds(request), signal, checkpoint);
    },
    /** /odds/bets (every observed name is retained for 053/054 mapping) or /odds/bookmakers. */
    async importCatalog(input: OddsImportRequest): Promise<OddsImportSummary> {
      const request = authorizeOddsRequest(input, options.authority);
      if (request.kind === "prices") return oddsFail("invalid-request");
      const bounds = options.bounds(request);
      const result = request.kind === "bets" ? await options.adapter.bets(bounds) : await options.adapter.bookmakers(bounds);
      const observation = validateOddsObservation(request, result, bounds, options.authority, clock);
      const batch = await options.store.saveBatch(receiptBody(observation, []));
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
