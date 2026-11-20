import "server-only";

import { z } from "zod";
import { getReportingDate, type ReportingDate, type UtcInstant } from "../../domain/calendar.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { API_FOOTBALL_CONTRACT_VERSION, type ApiFootballBounds, type ApiFootballFallbackWorkflow,
  type ApiFootballResult } from "./api-football-contract.ts";
import type { NormalizedFixture } from "./api-football-normalize.ts";
import { parseCatalogImportRequest } from "./catalog-input.ts";
import { catalogPersistenceUnavailable, CatalogStoreError } from "./catalog-mysql-store.ts";
import type { createFootballCatalogImporter } from "./catalog-service.ts";
import type { createFootballHistorySource } from "./history-source.ts";

export type HistoricalDateRepair = Readonly<{
  status: "complete" | "unavailable" | "partial" | "failed" | "deferred";
  reason: string | null;
  requests: number;
  fixtures: number;
  changed: number;
  resumeObservation?: true;
}>;

type FixtureResponse = ApiFootballResult<NormalizedFixture>;
type DateReceipt = Readonly<{ receivedCount: number; changedFixtureIds: readonly string[] }>;
const observationSchema = z.strictObject({ version: z.literal(1), bounds: z.unknown(),
  response: z.looseObject({ status: z.enum(["complete", "partial", "failed"]), data: z.array(z.unknown()),
    completeness: z.looseObject({ complete: z.boolean(), invalidRows: z.number().int().nonnegative(), reasons: z.array(z.string()),
      missingIds: z.array(z.number()), missingCoverage: z.array(z.string()) }),
    requestsDispatched: z.number().int().min(0).max(1), error: z.looseObject({ reason: z.string() }).nullable(),
    provenance: z.array(z.looseObject({ retrievedAt: z.number().int(), requestParameters: z.record(z.string(), z.string()),
      quota: z.looseObject({ kind: z.string() }) })).length(1) }),
});

function matchesDate(response: FixtureResponse, date: ReportingDate, now: UtcInstant) {
  const [page] = response.provenance;
  return response.provenance.length === 1 && page?.provider === "api-football" && page.endpoint === "fixtures" &&
    page.contractVersion === API_FOOTBALL_CONTRACT_VERSION && page.quota.kind === "success" && page.currentPage === 1 &&
    (page.totalPages !== null && page.totalPages > 0 || page.totalPages === 0 && response.data.length === 0) &&
    Object.keys(page.requestParameters).length === 2 && page.requestParameters.date === date &&
    page.requestParameters.timezone === "Africa/Kampala" && page.retrievedAt <= now && getReportingDate(page.retrievedAt) > date;
}

const complete = (response: FixtureResponse) => (response.provenance[0]?.totalPages ?? Infinity) <= 1 &&
  response.status === "complete" && response.error === null && response.completeness.complete &&
  response.completeness.invalidRows === 0 && response.completeness.reasons.length === 0 && response.completeness.missingIds.length === 0;

const deferred = new Set(["quota-denied", "rate-limited", "shared-work-pending", "operation-not-authorized",
  "authentication-error", "invalid-credential", "subscription-expired", "deadline-exceeded"]);

/** A past-day provider observation is sealed before catalog writes, so chunked writes can resume under the original identity. */
export function createFootballHistoryDateRepair(options: Readonly<{
  competitionIds: readonly number[];
  retentionEvidenceRef: string;
  source: Pick<ReturnType<typeof createFootballHistorySource>, "latestPage" | "savePage">;
  fetch(date: ReportingDate, bounds: ApiFootballBounds, workflow: ApiFootballFallbackWorkflow): Promise<FixtureResponse>;
  importer: Pick<ReturnType<typeof createFootballCatalogImporter>, "importObservation">;
  readComplete(date: ReportingDate): Promise<DateReceipt | null>;
  now(): UtcInstant;
}>) {
  const allowed = new Set(options.competitionIds);
  const scope = evidenceFingerprint([...allowed].sort((left, right) => left - right));
  return async (date: ReportingDate, attempt: number, bounds: ApiFootballBounds, workflow: ApiFootballFallbackWorkflow): Promise<HistoricalDateRepair> => {
    const selector = { endpoint: "fixtureRepairDate" as const, parameters: { date, scope, attempt: String(attempt) } };
    const saved = await options.source.latestPage(selector);
    const hash = evidenceFingerprint(["historical-date-repair", scope, date, attempt]);
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    const request = (requestBounds: unknown) => parseCatalogImportRequest({ id, selection: { kind: "fixtures", query: { date } },
      bounds: requestBounds, retentionEvidenceRef: options.retentionEvidenceRef });
    let response: FixtureResponse, requests = 0, catalogRequest = request(bounds);
    if (saved) {
      const [observation] = z.tuple([observationSchema]).parse(saved.rows);
      // Each retained row is revalidated by the normal catalog importer before it can write fixtures.
      response = observation.response as unknown as FixtureResponse;
      catalogRequest = request(observation.bounds);
      if (saved.contract !== API_FOOTBALL_CONTRACT_VERSION || !matchesDate(response, date, options.now()) ||
        saved.retrievedAt.getTime() !== response.provenance[0]!.retrievedAt || catalogRequest.bounds.deadlineAt < saved.retrievedAt.getTime()) {
        throw new Error("Archived date repair evidence does not match its original scope.");
      }
    } else {
      const receipt = await options.readComplete(date);
      if (receipt) return { status: receipt.receivedCount === 0 ? "unavailable" : "complete", requests,
        reason: receipt.receivedCount === 0 ? "no-provider-fixtures" : null, fixtures: receipt.receivedCount,
        changed: receipt.changedFixtureIds.length };
      workflow.check?.();
      response = await options.fetch(date, bounds, workflow);
      requests = response.requestsDispatched;
      const reason = response.error?.reason ?? response.completeness.reasons[0] ?? "unverified-date-coverage";
      if (!matchesDate(response, date, options.now()) || response.status === "failed") {
        return { status: deferred.has(reason) ? "deferred" : "failed", reason, requests, fixtures: 0, changed: 0 };
      }
      await options.source.savePage({ ...selector, rows: [{ version: 1, bounds, response }], retrievedAt: response.provenance[0]!.retrievedAt });
    }

    const data = response.data.filter((fixture) => allowed.has(fixture.competition.id));
    const resultComplete = complete(response);
    if (!data.length) return { status: resultComplete ? "unavailable" : "partial", requests, fixtures: 0, changed: 0,
      reason: resultComplete ? "no-covered-fixtures" : response.error?.reason ?? "incomplete-date-coverage" };
    const subset = data.length !== response.data.length;
    const observation = subset ? { ...response, data, status: "partial" as const, completeness: { ...response.completeness,
      complete: false, missingCoverage: [...response.completeness.missingCoverage, "history-approved-competition-subset"] } } : response;

    try {
      const receipt = await options.importer.importObservation(catalogRequest, observation, workflow.check);
      const status = resultComplete && receipt.rejectedCount === 0 && receipt.importedCount === data.length ? "complete" : "partial";
      return { status, requests, reason: status === "complete" ? null : response.error?.reason ?? receipt.reasons[0] ?? "incomplete-date-coverage",
        fixtures: data.length + response.completeness.invalidRows, changed: receipt.changedFixtureIds.length };
    } catch (error) {
      if (!(error instanceof CatalogStoreError && error.reason === "unavailable") && !workflow.signal?.aborted && options.now() < bounds.deadlineAt) throw error;
      return { status: "deferred", reason: catalogPersistenceUnavailable, requests, fixtures: 0, changed: 0, resumeObservation: true };
    }
  };
}
