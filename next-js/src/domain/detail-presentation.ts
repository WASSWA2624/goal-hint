import type { StoredDetailSnapshot, MatchDetailResponse } from "./match-detail.ts";
import { fullDetailSnapshot } from "./detail-snapshot.ts";
import type { MarketFamily, MarketSource } from "./markets.ts";
import { isSafeEvidenceUrl } from "./evidence-url.ts";
import { marketRow } from "./match-details.ts";
import { utcInstantFromEpochMilliseconds } from "./calendar.ts";
import type { Messages, TextKey } from "../i18n/messages.ts";

export function bookmakerOddsSource({ bookmakerId, bookmakerName, observedAt, providerUpdatedAt }: Readonly<{
  bookmakerId: number; bookmakerName: string | null; observedAt: number; providerUpdatedAt: number | null;
}>, messages: Messages): string {
  const format = (at: number) => messages.reportingInstant(utcInstantFromEpochMilliseconds(at));
  const bookmaker = bookmakerName ?? messages.text("touchline.bookmakerNumber", { id: messages.number(bookmakerId, { useGrouping: false }) });
  const retrieved = `${messages.text("detail.retrieved")} ${format(observedAt)}`;
  return providerUpdatedAt === null ? `${bookmaker} · ${retrieved}`
    : [bookmaker, retrieved, messages.text("liveMatch.updated", { time: format(providerUpdatedAt) })].join(" · ");
}

/** The visible pick keeps its own revision's provenance and applicability, even when another revision exists. */
export function detailRecordNotices(data: MatchDetailResponse, featuredSource?: MarketSource): readonly TextKey[] {
  const fixture = data.fixture, snapshot = fullDetailSnapshot(data), notices: TextKey[] = [];
  if (snapshot) {
    for (const source of featuredSource ? [featuredSource] : new Set(snapshot.markets.map((item) => item.source.kind)))
      notices.push(`market.source.short.${source}`);
    if (snapshot.markets.some((item) => item.source.provisional)) notices.push("match.provisional");
    notices.push(`history.status.${snapshot.applicability}`);
  }
  if (fixture.partialCoverage) notices.push("match.partialCoverage");
  return notices;
}

/** Use this one revision exclusively; never supplement it from fixture.forecast. */
export function detailMarket(data: MatchDetailResponse, family: MarketFamily) {
  const { item, outcome, reason } = marketRow(data, family);
  return { item, outcome, unavailableReason: reason };
}
/** Defense at the HTML boundary reuses the same offline rules as the resolver. */
export function detailAnalysis(analysis: StoredDetailSnapshot["analysis"]): StoredDetailSnapshot["analysis"] {
  const sources = analysis.sources.map((source) => ({ ...source, url: isSafeEvidenceUrl(source.url) ? source.url : null }));
  const allowed = new Set(sources.flatMap((source) => source.url ? [source.url] : []));
  const permitted = analysis.state === "available" && [...analysis.reasons, ...(analysis.uncertainty ? [analysis.uncertainty] : [])]
    .every((reason) => reason.sourceUrls.every((url) => allowed.has(url) && isSafeEvidenceUrl(url)));
  return { ...analysis, sources, state: permitted ? "available" : "withheld",
    reasons: permitted ? analysis.reasons : [], uncertainty: permitted ? analysis.uncertainty : null };
}
