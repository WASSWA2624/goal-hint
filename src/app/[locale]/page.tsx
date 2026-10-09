import { notFound } from "next/navigation";
import { FeedShell } from "@/app/_components/feed-shell";
import { getShellDate } from "@/app/_components/public-shell";
import { CalendarValidationError } from "@/domain/calendar";
import { parseFeedQuery } from "@/domain/feed-query";

export default async function HomePage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const today = await getShellDate();
  let query;
  try { query = parseFeedQuery(await searchParams, { today, locale }); }
  catch (error) { if (error instanceof RangeError || error instanceof CalendarValidationError) notFound(); throw error; }
  return <FeedShell query={query} today={today} />;
}
