import { notFound } from 'next/navigation';
import { MatchFeedPage } from '@/app/_components/match-feed-page';
import { BodyText } from '@/components/ui/layout';
import { parseFeedQuery, feedQueryKey } from '@/domain/feed-query';
import { parseReportingDate } from '@/domain/calendar';
import type { FeedPageResult } from '@/server/matches/feed-page';
import scenarios from './scenarios.json';
const cases = scenarios as unknown as Record<string, { query: ReturnType<typeof parseFeedQuery>; today: ReturnType<typeof parseReportingDate>; result: FeedPageResult }>;
export default async function FixturePage({ params, searchParams }: {
  params: Promise<{ date?: string; scenario?: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { date, scenario } = await params, input = await searchParams;
  if (!scenario) {
    const today = parseReportingDate('2026-10-09');
    // Captured SQL pagination uses 30 rows even when the application default changes.
    let query;
    try { query = parseFeedQuery({ pageSize: "30", ...input }, { today, ...(date ? { routeDate: date } : {}) }); } catch { notFound(); }
    // Deliberate test-only delay/error for navigation races and failed refreshes.
    if (query.search === 'Slow query') await new Promise((resolve) => setTimeout(resolve, 1800));
    if (['Unavailable query', 'Slow query', 'Busy query'].includes(query.search)) {
      return <MatchFeedPage query={query} today={today} result={{ data: null, error: query.search === 'Busy query' ? 'rate-limited' : 'unavailable' }} />;
    }
    const selected = Object.values(cases).find((item) => item.result.data && item.today === today && item.query.page === query.page &&
      feedQueryKey(item.query, today) === feedQueryKey(query, today));
    if (!selected) notFound();
    return <MatchFeedPage query={query} today={today} result={selected.result} />;
  }
  const selected = cases[scenario]; if (!selected) notFound();
  return <MatchFeedPage {...selected} controls={<BodyText>Synthetic acceptance fixtures only. This isolated app never serves production forecasts.</BodyText>} />;
}
