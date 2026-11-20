import "server-only";

import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { ApiFootballResult } from "../football/api-football-contract.ts";
import type { NormalizedFixture } from "../football/api-football-normalize.ts";
import type { createFootballCatalogImporter } from "../football/catalog-service.ts";

function discoveryId(value: unknown) {
  const hash = evidenceFingerprint(value);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/** Reuse the result poller's original provider observation when it discovers a new fixture. */
export function createLiveDiscoveryImport(options: Readonly<{
  importer: Pick<ReturnType<typeof createFootballCatalogImporter>, "importObservation">;
  competitionIds: readonly number[]; retentionEvidenceRef: string;
}>) {
  const competitions = new Set(options.competitionIds);
  return async (response: ApiFootballResult<NormalizedFixture>, { unknownIds, signal }: Readonly<{
    unknownIds: readonly number[]; signal?: AbortSignal; channel: "live" | "date";
  }>) => {
    if (signal?.aborted || !unknownIds.length || response.status === "failed") return;
    const page = response.provenance.find(item => item.endpoint === "fixtures" && item.quota.kind === "success" && !item.fromCache);
    const scope = page?.requestParameters;
    if (!page || !scope || scope.live !== "all" && scope.date === undefined || scope.timezone !== "Africa/Kampala") return;
    const ids = new Set(unknownIds);
    const data = response.data.filter(row => ids.has(row.id) && competitions.has(row.competition.id)).map(row => {
      // Enriched fixture views carry separate raw fact blocks outside the canonical catalog schema.
      const { id, homeTeam, awayTeam, competition, kickoff, status, providerStatus, elapsedMinutes, stoppageMinutes, regulationScore,
        reportedGoals, extraTimeScore, penaltyScore, source } = row;
      return { id, homeTeam, awayTeam, competition, kickoff, status, providerStatus, elapsedMinutes, stoppageMinutes,
        regulationScore, reportedGoals, extraTimeScore, penaltyScore, source };
    });
    if (signal?.aborted || !data.length) return;
    const subset = data.length !== response.data.length;
    const query = scope.live === "all" ? { live: true } as const : { date: scope.date! };
    const id = discoveryId(["live-fixture-discovery", query, page.retrievedAt, data.map(row => row.id).sort((a, b) => a - b)]);
    await options.importer.importObservation({ id, selection: { kind: "fixtures", query }, retentionEvidenceRef: options.retentionEvidenceRef,
      bounds: { priority: "live-date-sync", deadlineAt: page.retrievedAt + 60_000, timeoutMs: 30_000,
        maxRequests: Math.max(1, response.requestsDispatched), maxPages: 1, maxRows: data.length, maxResponseBytes: 40_000_000,
        retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, cacheMaxAgeMs: 0 },
    }, { ...response, data, ...(subset ? { status: "partial", completeness: { ...response.completeness, complete: false,
      missingCoverage: [...response.completeness.missingCoverage, "discovery-subset"] } } : {}) });
  };
}
