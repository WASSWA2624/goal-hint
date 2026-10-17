import type { DetailSnapshot, MatchDetailResponse } from "./match-detail.ts";
import type { MarketFamily } from "./markets.ts";
import { isSafeEvidenceUrl } from "./evidence-url.ts";
import type { TextKey } from "../i18n/messages.ts";

/** The visible pick keeps its own revision's provenance and applicability, even when another revision exists. */
export function detailRecordNotices(data: MatchDetailResponse): readonly TextKey[] {
  const { fixture, snapshot } = data, notices: TextKey[] = [];
  if (snapshot) {
    for (const source of new Set(snapshot.markets.map((item) => item.source.kind))) notices.push(`market.source.${source}`);
    if (snapshot.markets.some((item) => item.source.provisional)) notices.push("match.provisional");
    notices.push(`history.status.${snapshot.applicability}`);
  } else if (fixture.cycle?.state === "closed") notices.push("detail.noLockedPrediction");
  const refresh = fixture.update?.prediction;
  if ((!snapshot || snapshot.applicability === "current") &&
    (refresh === "delayed" || refresh === "updating" || refresh === "outside-window")) notices.push(`detail.refresh.${refresh}`);
  if (fixture.partialCoverage) notices.push("match.partialCoverage");
  return notices;
}

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
