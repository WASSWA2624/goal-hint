import "server-only";

import type { createApiFootballAdapter } from "../football/api-football-adapter.ts";
import { API_FOOTBALL_CONTRACT_VERSION, type ApiFootballBounds, type ApiFootballFallbackWorkflow, type ApiFootballResult } from "../football/api-football-contract.ts";
import type { NormalizedFixture } from "../football/api-football-normalize.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { LifecycleInput } from "../predictions/lifecycle-contract.ts";
import type { RefreshMember } from "./refresh-contract.ts";
import { refreshFail } from "./refresh-contract.ts";

export function createRefreshObservationCollector(options: Readonly<{
  adapter: Pick<ReturnType<typeof createApiFootballAdapter>["evidence"], "fixtures">;
  evidenceRef: string;
  verifyResponse(result: ApiFootballResult<NormalizedFixture>, member: RefreshMember): boolean;
}>) {
  return Object.freeze({ async collect(member: RefreshMember, bounds: ApiFootballBounds, workflow: ApiFootballFallbackWorkflow) {
    workflow.check();
    const result = await options.adapter.fixtures({ fixtureId: member.context.externalFixtureId }, bounds, workflow);
    workflow.check();
    const approved: unknown = options.verifyResponse(result, member);
    if (approved instanceof Promise) { void approved.catch(() => {}); return refreshFail("unauthorized"); }
    const fixture = result.data[0], parameters = { id: String(member.context.externalFixtureId), timezone: "Africa/Kampala" };
    if (approved !== true || result.status !== "complete" || result.data.length !== 1 || !fixture ||
      fixture.id !== member.context.externalFixtureId || fixture.source.endpoint !== "/fixtures" ||
      result.provenance.length !== 1 || result.provenance.some((page) => page.provider !== "api-football" || page.endpoint !== "fixtures" ||
        page.contractVersion !== API_FOOTBALL_CONTRACT_VERSION || page.quota.kind !== "success" || page.currentPage !== 1 || page.totalPages !== 1 ||
        evidenceFingerprint(page.requestParameters) !== evidenceFingerprint(parameters) || page.retrievedAt !== fixture.source.retrievedAt ||
        page.providerUpdatedAt !== fixture.source.providerUpdatedAt) || result.requestsDispatched > bounds.maxRequests) return refreshFail("unavailable");
    const input: LifecycleInput = { fixtureId: member.context.fixtureId, fixture, actualStartedAt: null,
      actor: "prediction-refresh", evidenceRef: options.evidenceRef };
    return Object.freeze({ input, requestsDispatched: result.requestsDispatched, requestCountUnknown: false });
  } });
}
