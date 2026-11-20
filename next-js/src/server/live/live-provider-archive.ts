import "server-only";

import { API_FOOTBALL_CONTRACT_VERSION, apiFootballEndpoints, type ApiFootballEndpoint, type ApiFootballResponseArchive }
  from "../football/api-football-contract.ts";
import { footballSourceHash } from "../football/source-page-payload.ts";
import type { AccountStatus } from "./live-account.ts";

/** The production worker's current odds policy authorizes structured observations only. */
const canRetainResponse = (endpoint: ApiFootballEndpoint) => !apiFootballEndpoints[endpoint].path.startsWith("/odds");

export function bindLiveProviderArchive(archive: ApiFootballResponseArchive) {
  const responseArchive: ApiFootballResponseArchive = {
    async save(page) {
      if (canRetainResponse(page.provenance.endpoint)) await archive.save(page);
    },
    async replay(request) {
      return canRetainResponse(request.endpoint) ? await archive.replay?.(request) ?? null : null;
    },
  };
  return {
    responseArchive,
    observeStatus(status: AccountStatus, body: Uint8Array) {
      const requestKey = footballSourceHash(JSON.stringify(["api-football-account-status", status.accountKey]));
      return responseArchive.save({ requestKey, body, rowCount: 1, provenance: {
        provider: "api-football", endpoint: "accountStatus", requestParameters: {}, contractVersion: API_FOOTBALL_CONTRACT_VERSION,
        retrievedAt: status.retrievedAt, providerUpdatedAt: null, fromCache: false, currentPage: null, totalPages: null,
        quota: { kind: "success" },
      } });
    },
  };
}
