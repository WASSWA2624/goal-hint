import { notFound } from "next/navigation";
import { FeedShell } from "@/app/_components/feed-shell";
import { getShellDate } from "@/app/_components/public-shell";
import { MatchFeedError } from "@/server/matches/feed-error";
import { parseMatchFeedQuery } from "@/server/matches/feed-service";

export default async function HomePage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const today = await getShellDate();
  let query;
  try { query = parseMatchFeedQuery(await searchParams, today, { locale }); }
  catch (error) { if (error instanceof MatchFeedError && error.code === "invalid-query") notFound(); throw error; }
  return <FeedShell query={query} today={today} />;
}
