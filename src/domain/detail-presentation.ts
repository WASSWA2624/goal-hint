import type { DetailSnapshot, MatchDetailResponse } from "./match-detail.ts";
import type { MarketFamily } from "./markets.ts";
import { isSafeEvidenceUrl } from "./evidence-url.ts";

/** Use this one revision exclusively; never supplement it from fixture.forecast. */
export function detailMarket(data: MatchDetailResponse, family: MarketFamily) {
  const snapshot = data.snapshot, item = snapshot?.markets.find((entry) => entry.market.family === family) ?? null;
  const outcome = item ? snapshot?.outcomes.find((entry) => entry.family === family && entry.selection === item.market.selection &&
    entry.revisionId === snapshot.revisionId && entry.cycleId === snapshot.cycleId) ?? null : null;
  return { item, outcome, unavailableReason: (snapshot?.unavailableMarkets ?? data.fixture.unavailableMarkets)
    .find((entry) => entry.family === family)?.reason ?? "not-published" };
}
/** Defense at the HTML boundary reuses the same offline rules as the resolver. */
export function detailAnalysis(analysis: DetailSnapshot["analysis"]): DetailSnapshot["analysis"] {
  const sources = analysis.sources.map((source) => ({ ...source, url: isSafeEvidenceUrl(source.url) ? source.url : null }));
  const allowed = new Set(sources.flatMap((source) => source.url ? [source.url] : []));
  const permitted = analysis.state === "available" && [...analysis.reasons, ...(analysis.uncertainty ? [analysis.uncertainty] : [])]
    .every((reason) => reason.sourceUrls.every((url) => allowed.has(url) && isSafeEvidenceUrl(url)));
  return { ...analysis, sources, state: permitted ? "available" : "withheld",
    reasons: permitted ? analysis.reasons : [], uncertainty: permitted ? analysis.uncertainty : null };
}
