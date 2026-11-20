import "server-only";

import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { API_FOOTBALL_CONTRACT_VERSION } from "../football/api-football-contract.ts";

export function verifiedFixturePage(provenance: unknown, expected: Readonly<Record<string, string>>, retrievedAt: number) {
  if (!Array.isArray(provenance) || provenance.length !== 1) return false;
  const [page] = provenance;
  return page?.provider === "api-football" && page.endpoint === "fixtures" && page.contractVersion === API_FOOTBALL_CONTRACT_VERSION &&
    page.retrievedAt === retrievedAt && page.fromCache === false && page.currentPage === 1 && page.totalPages === 1 &&
    evidenceFingerprint(page.requestParameters ?? null) === evidenceFingerprint({ ...expected, timezone: "Africa/Kampala" });
}
