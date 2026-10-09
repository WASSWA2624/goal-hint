import { notFound } from "next/navigation";
import { FeedShell } from "@/app/_components/feed-shell";
import { CalendarValidationError } from "@/domain/calendar";
import { parseFeedView } from "@/domain/navigation";

export default async function DatedFeedPage({ params, searchParams }: {
  params: Promise<{ locale: string; date: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, date } = await params;
  const { status } = await searchParams;
  let view;
  try {
    view = parseFeedView(date, status);
  } catch (error) {
    if (error instanceof CalendarValidationError || error instanceof RangeError) notFound();
    throw error;
  }
  return <FeedShell locale={locale} view={view} />;
}
