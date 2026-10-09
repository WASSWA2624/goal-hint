import { FeedShell } from "@/app/_components/feed-shell";
import { getShellDate } from "@/app/_components/public-shell";
import { getFeedEntry } from "@/domain/navigation";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <FeedShell locale={locale} view={getFeedEntry(await getShellDate(), "today")} />;
}
