import "server-only";

import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { DatabaseOperationError } from "../database/client.ts";
import type { createApiFootballAdapter } from "./api-football-adapter.ts";
import type { CatalogAuthority, CatalogImportRequest, CatalogPreparedBatch, CatalogProviderRow } from "./catalog-contract.ts";
import type { ApiFootballResult } from "./api-football-contract.ts";
import { CatalogInputError, catalogRequestFingerprint, parseCatalogImportRequest, validateCatalogBatch } from "./catalog-input.ts";
import { catalogPersistenceUnavailable, CatalogStoreError, type FootballCatalogStore, type CatalogImportSummary } from "./catalog-mysql-store.ts";

type VerifySavedFixtureScope = (observation: Readonly<{ retrievedAt: number; rowCount: number }>) => Promise<boolean>;

export class CatalogPersistenceDeferredError extends CatalogStoreError {
  readonly requestsDispatched: number;
  readonly receivedCount: number;
  readonly observedAt: number;
  readonly reasons: readonly string[];
  readonly rawArchived: boolean;
  constructor(batch: CatalogPreparedBatch, rawArchived: boolean) {
    super("unavailable");
    this.name = "CatalogPersistenceDeferredError";
    this.rawArchived = rawArchived;
    this.requestsDispatched = batch.requestsDispatched;
    this.receivedCount = batch.rows.fixtures.length + batch.invalidRows;
    this.observedAt = batch.observedAt;
    this.reasons = Object.freeze([...batch.reasons, catalogPersistenceUnavailable].sort());
  }
}

const unavailable = (error: unknown) => error instanceof CatalogStoreError && error.reason === "unavailable";

/** Private worker entry point. The existing adapter owns every provider request and quota reservation. */
export function createFootballCatalogImporter(options: Readonly<{
  adapter: ReturnType<typeof createApiFootballAdapter>;
  store: Pick<FootballCatalogStore, "findImport" | "importBatch" | "deferImport">;
  authority: CatalogAuthority;
  deferFixtureWritesAbove?: number;
  clock?: Clock;
}>) {
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const running = new Map<string, { fingerprint: string; result: Promise<CatalogImportSummary> }>();
  function authorize(request: CatalogImportRequest) {
    try { options.authority.authorize(request); } catch { throw new CatalogInputError("operation-not-authorized"); }
    let permitted = false;
    try { permitted = options.authority.verifyRetention({ selection: request.selection,
      evidenceRef: request.retentionEvidenceRef, purpose: "structured-catalog-and-audit-history", rawPayloadsStored: false }) === true; } catch { /* Fail closed. */ }
    if (!permitted) throw new CatalogInputError("retention-not-authorized");
  }
  async function reconcile(batch: CatalogPreparedBatch) {
    const previous = await options.store.findImport(batch.request.id).catch((error: unknown) => {
      if (error instanceof DatabaseOperationError || unavailable(error)) return null;
      throw error;
    });
    authorize(batch.request);
    if (previous && (previous.fingerprint !== batch.fingerprint || previous.requestFingerprint !== batch.requestFingerprint)) {
      throw new CatalogStoreError("conflicting-import");
    }
    return previous;
  }
  async function execute(request: CatalogImportRequest, fingerprint: string, verifySavedFixtureScope?: VerifySavedFixtureScope) {
    const previous = await options.store.findImport(request.id);
    authorize(request);
    if (previous) {
      if (previous.requestFingerprint !== fingerprint) throw new CatalogStoreError("conflicting-import");
      return previous;
    }
    const selection = request.selection;
    let result: ApiFootballResult<CatalogProviderRow>;
    switch (selection.kind) {
      case "fixtures": result = await options.adapter.evidence.fixtures(selection.query, request.bounds); break;
      case "teams": result = await options.adapter.evidence.teams(selection.query, request.bounds); break;
      case "competitions": result = await options.adapter.evidence.competitions(selection.query, request.bounds); break;
    }
    authorize(request);
    const batch = validateCatalogBatch(request, result, options.authority, clock);
    const [page] = batch.provenance;
    async function hasSavedFixtures() {
      return verifySavedFixtureScope !== undefined && batch.requestsDispatched === 1 && result.provenance.length === 1 &&
        result.provenance[0]?.quota?.kind === "success" && batch.provenance.length === 1 && page !== undefined &&
        !page.fromCache && page.currentPage === 1 && page.totalPages === 1 &&
        await verifySavedFixtureScope({ retrievedAt: page.retrievedAt, rowCount: batch.rows.fixtures.length + batch.invalidRows }).catch(() => false);
    }
    async function defer(alreadyVerified?: boolean) {
      authorize(request);
      const recovered = await reconcile(batch);
      if (recovered) return recovered;
      const rawArchived = alreadyVerified ?? await hasSavedFixtures();
      if (rawArchived) {
        try { return await options.store.deferImport(batch, options.authority); }
        catch (error) { if (!unavailable(error)) throw error; }
        const recoveredDeferral = await reconcile(batch);
        if (recoveredDeferral) return recoveredDeferral;
      }
      throw new CatalogPersistenceDeferredError(batch, rawArchived);
    }
    if (selection.kind === "fixtures" && batch.status === "complete" && options.deferFixtureWritesAbove !== undefined &&
      batch.rows.fixtures.length > options.deferFixtureWritesAbove && await hasSavedFixtures()) return defer(true);
    try { return await options.store.importBatch(batch, options.authority); }
    catch (error) {
      if (!verifySavedFixtureScope || selection.kind !== "fixtures" || !unavailable(error)) throw error;
      return defer();
    }
  }
  return Object.freeze({
    async import(input: unknown, verifySavedFixtureScope?: VerifySavedFixtureScope): Promise<CatalogImportSummary> {
      const request = parseCatalogImportRequest(input);
      authorize(request);
      const fingerprint = catalogRequestFingerprint(request), current = running.get(request.id);
      if (current) {
        if (current.fingerprint !== fingerprint) throw new CatalogStoreError("conflicting-import");
        return current.result;
      }
      const result = execute(request, fingerprint, verifySavedFixtureScope).finally(() => running.delete(request.id));
      running.set(request.id, { fingerprint, result });
      return result;
    },
  });
}
