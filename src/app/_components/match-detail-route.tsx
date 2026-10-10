import "server-only";

import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { getReportingDate } from "@/domain/calendar";
import { loadMatchDetailPage, matchDetailMetadata, matchDetailPageParameters, parseMatchDetailPageInput } from "@/server/matches/detail-page";
import { readPublicMatchDetail } from "@/server/matches/public-detail";
import { readPublicMatchInsights } from "@/server/matches/public-insights";
import { insightsPreview, type InsightsPreview } from "@/domain/match-insights";
import { splitMatchViewParameters } from "@/domain/match-view";
import { MatchFeedError } from "@/server/matches/feed-error";
import { getShellInstant } from "./public-shell";
import { getDiscoveryPolicy } from "@/server/seo/policy";
import { MatchDetailPage } from "./match-detail-page";

type Props = { params: Promise<{ locale: string; fixtureId: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The production route and isolated stored-data acceptance use this same path. */
export function createMatchDetailRoute(read: typeof readPublicMatchDetail = readPublicMatchDetail, policy = getDiscoveryPolicy,
  readInsights: typeof readPublicMatchInsights = readPublicMatchInsights) {
  const loadCurrent = cache(async (id: string) => {
    const instant = await getShellInstant();
    const [result, preview] = await Promise.all([loadMatchDetailPage(id, { now: () => instant }, read),
      // Section previews are optional: a failed insights read leaves each section with its own retry.
      readInsights(id, { now: () => instant }).then(insightsPreview).catch((): InsightsPreview | null => null)]);
    return { result, preview, today: getReportingDate(instant), instant };
  });
  const load = cache(async (id: string, query: string) => {
    const current = await loadCurrent(id);
    const historyResult = query && current.result.data
      ? await loadMatchDetailPage(id, { now: () => current.instant }, read, new URLSearchParams(query)) : current.result;
    return { ...current, historyResult, query };
  });
  async function resolve({ params, searchParams }: Props) {
    const route = await params;
    let id, query, viewQuery;
    try {
      // Match-view keys (section, item, filters) are client state; only history keys reach the stored read.
      const input = await searchParams, { rest } = splitMatchViewParameters(input);
      id = parseMatchDetailPageInput(route.fixtureId, rest); query = matchDetailPageParameters(rest).toString();
      viewQuery = matchDetailPageParameters(input).toString();
    }
    catch (error) { if (error instanceof MatchFeedError) notFound(); throw error; }
    const loaded = await load(id, query);
    if (loaded.result.error === "not-found" || loaded.historyResult.error === "not-found") notFound();
    return { ...loaded, route, viewQuery };
  }
  return {
    async generateMetadata(props: Props) {
      const { result, route, query } = await resolve(props);
      return matchDetailMetadata(result, route.locale, query !== "", policy());
    },
    async Page(props: Props) {
      const { result, historyResult, query, today, route, preview, viewQuery } = await resolve(props);
      if (result.data && (route.slug !== result.data.route.slug || route.fixtureId !== result.data.route.fixtureId)) {
        permanentRedirect(`${result.data.route.path}${viewQuery ? `?${viewQuery}` : ""}${query ? "#revision-history" : ""}`);
      }
      return <MatchDetailPage result={result} today={today} locale={route.locale} preview={preview}
        historyResult={historyResult} historyQuery={query}
        retryHref={`/en/matches/${encodeURIComponent(route.fixtureId)}/${encodeURIComponent(route.slug)}`} />;
    },
  };
}
