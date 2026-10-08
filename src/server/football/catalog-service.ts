import "server-only";

import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import type { createApiFootballAdapter } from "./api-football-adapter.ts";
import type { CatalogAuthority, CatalogImportRequest, CatalogProviderRow } from "./catalog-contract.ts";
import type { ApiFootballResult } from "./api-football-contract.ts";
import { CatalogInputError, catalogRequestFingerprint, parseCatalogImportRequest, validateCatalogBatch } from "./catalog-input.ts";
import { CatalogStoreError, type FootballCatalogStore, type CatalogImportSummary } from "./catalog-mysql-store.ts";

/** Private worker entry point. The existing adapter owns every provider request and quota reservation. */
export function createFootballCatalogImporter(options: Readonly<{
  adapter: ReturnType<typeof createApiFootballAdapter>;
  store: FootballCatalogStore;
  authority: CatalogAuthority;
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
  async function execute(request: CatalogImportRequest, fingerprint: string) {
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
    return options.store.importBatch(validateCatalogBatch(request, result, options.authority, clock), options.authority);
  }
  return Object.freeze({
    async import(input: unknown): Promise<CatalogImportSummary> {
      const request = parseCatalogImportRequest(input);
      authorize(request);
      const fingerprint = catalogRequestFingerprint(request), current = running.get(request.id);
      if (current) {
        if (current.fingerprint !== fingerprint) throw new CatalogStoreError("conflicting-import");
        return current.result;
      }
      const result = execute(request, fingerprint).finally(() => running.delete(request.id));
      running.set(request.id, { fingerprint, result });
      return result;
    },
  });
}
