import "server-only";

import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { getReportingDate } from "@/domain/calendar";
import { loadMatchDetailPage, matchDetailMetadata, parseMatchDetailPageInput } from "@/server/matches/detail-page";
import { readPublicMatchDetail } from "@/server/matches/public-detail";
import { MatchFeedError } from "@/server/matches/feed-error";
import { getShellInstant } from "./public-shell";
import { MatchDetailPage } from "./match-detail-page";

type Props = { params: Promise<{ locale: string; fixtureId: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The production route and isolated stored-data acceptance use this same path. */
export function createMatchDetailRoute(read: typeof readPublicMatchDetail = readPublicMatchDetail) {
  const load = cache(async (id: string) => {
    const instant = await getShellInstant();
    return { result: await loadMatchDetailPage(id, { now: () => instant }, read), today: getReportingDate(instant) };
  });
  async function resolve({ params, searchParams }: Props) {
    const route = await params;
    let id;
    try { id = parseMatchDetailPageInput(route.fixtureId, await searchParams); }
    catch (error) { if (error instanceof MatchFeedError) notFound(); throw error; }
    const loaded = await load(id);
    if (loaded.result.error === "not-found") notFound();
    return { ...loaded, route };
  }
  return {
    async generateMetadata(props: Props) {
      const { result, route } = await resolve(props);
      return matchDetailMetadata(result, route.locale);
    },
    async Page(props: Props) {
      const { result, today, route } = await resolve(props);
      if (result.data && (route.slug !== result.data.route.slug || route.fixtureId !== result.data.route.fixtureId)) permanentRedirect(result.data.route.path);
      return <MatchDetailPage result={result} today={today} locale={route.locale}
        retryHref={`/en/matches/${encodeURIComponent(route.fixtureId)}/${encodeURIComponent(route.slug)}`} />;
    },
  };
}
