import "server-only";

import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { getReportingDate } from "@/domain/calendar";
import { loadMatchDetailPage, matchDetailMetadata, matchDetailPageParameters, matchStructuredData, parseMatchDetailPageInput } from "@/server/matches/detail-page";
import { serializeStructuredData } from "@/domain/discovery";
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
    const result = await loadMatchDetailPage(id, { now: () => instant }, read);
    return { result, today: getReportingDate(instant), instant };
  });
  const loadPreview = cache(async (id: string): Promise<InsightsPreview | null> => {
    const instant = await getShellInstant();
    // Optional section previews must not delay metadata; failed reads retain each section's retry.
    try { return insightsPreview(await readInsights(id, { now: () => instant })); }
    catch { return null; }
  });
  const load = cache(async (id: string, query: string) => {
    const current = await loadCurrent(id);
    const historyResult = query && current.result.data
      ? await loadMatchDetailPage(id, { now: () => current.instant }, read, new URLSearchParams(query)) : current.result;
    return { ...current, historyResult, query };
  });
  async function resolve({ params, searchParams }: Props, withPreview = false) {
    const route = await params;
    let id, query, viewQuery;
    try {
      // Match-view keys (section, item, filters) are client state; only history keys reach the stored read.
      const input = await searchParams, { rest } = splitMatchViewParameters(input);
      id = parseMatchDetailPageInput(route.fixtureId, rest); query = matchDetailPageParameters(rest).toString();
      viewQuery = matchDetailPageParameters(input).toString();
    }
    catch (error) { if (error instanceof MatchFeedError) notFound(); throw error; }
    const [loaded, preview] = await Promise.all([load(id, query), withPreview ? loadPreview(id) : null]);
    if (loaded.result.error === "not-found" || loaded.historyResult.error === "not-found") notFound();
    return { ...loaded, preview, route, viewQuery };
  }
  return {
    async generateMetadata(props: Props) {
      const { result, route, query } = await resolve(props);
      return matchDetailMetadata(result, route.locale, query !== "", policy());
    },
    async Page(props: Props) {
      const { result, historyResult, query, today, route, preview, viewQuery } = await resolve(props, true);
      if (result.data && (route.slug !== result.data.route.slug || route.fixtureId !== result.data.route.fixtureId)) {
        permanentRedirect(`${result.data.route.path}${viewQuery ? `?${viewQuery}` : ""}${query ? "#revision-history" : ""}`);
      }
      return <>
        {result.data && !query && <script type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeStructuredData(matchStructuredData(result.data, route.locale)) }} />}
        <MatchDetailPage result={result} today={today} locale={route.locale} preview={preview}
          historyResult={historyResult} historyQuery={query}
          retryHref={`/en/matches/${encodeURIComponent(route.fixtureId)}/${encodeURIComponent(route.slug)}`} />
      </>;
    },
  };
}
