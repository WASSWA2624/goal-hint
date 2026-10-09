import "server-only";
import type { ReportingDate } from "@/domain/calendar";
import type { FeedQuery } from "@/domain/feed-query";
import { loadMatchFeedPage } from "@/server/matches/feed-page";
import { MatchFeedPage } from "./match-feed-page";
import { getShellInstant } from "./public-shell";

export async function FeedShell({ query, today }: { query: FeedQuery; today: ReportingDate }) {
  const asOf = await getShellInstant();
  const result = await loadMatchFeedPage(query, today, { now: () => asOf });
  return <MatchFeedPage query={query} today={today} result={result} />;
}
