import { notFound } from 'next/navigation';
import { MatchFeedPage } from '@/app/_components/match-feed-page';
import { createFeedRoute } from '@/app/_components/feed-route';
import { BodyText } from '@/components/ui/layout';
import { parseFeedQuery, feedQueryKey } from '@/domain/feed-query';
import { parseReportingDate, utcInstantFromEpochMilliseconds } from '@/domain/calendar';
import { storedMatchFeedResponseSchema } from '@/domain/match-feed';
import { MatchFeedError } from '@/server/matches/feed-error';
import { fullAccess } from '@/../tests/helpers/full-access';
import type { FeedPageResult } from '@/server/matches/feed-page';
import scenarios from './scenarios.json';
const cases = scenarios as unknown as Record<string, { query: ReturnType<typeof parseFeedQuery>; today: ReturnType<typeof parseReportingDate>; result: FeedPageResult }>;
const today = parseReportingDate('2026-10-09');
const routeOptions = {
  resolveAccess: fullAccess, document: async () => false,
  instant: async () => utcInstantFromEpochMilliseconds(cases.today!.result.data!.asOf),
  read: async (parameters: URLSearchParams | Readonly<Record<string, string | string[] | undefined>>) => {
    const query = parseFeedQuery(parameters, { today });
    if (query.search === 'Slow query') await new Promise((resolve) => setTimeout(resolve, 1800));
    if (['Unavailable query', 'Slow query', 'Busy query'].includes(query.search)) {
      throw new MatchFeedError(query.search === 'Busy query' ? 'rate-limited' : 'unavailable');
    }
    const selected = Object.values(cases).find((item) => item.result.data && item.today === today && item.query.page === query.page &&
      feedQueryKey(item.query, today) === feedQueryKey(query, today));
    if (!selected?.result.data) throw new MatchFeedError('unavailable');
    const { access, ...stored } = selected.result.data;
    if (access.tier !== 'full') throw new Error('Stored acceptance projections require full-access capture.');
    return storedMatchFeedResponseSchema.parse(stored);
  },
};
const matches = createFeedRoute(routeOptions), archive = createFeedRoute({ ...routeOptions, dated: true });
export default async function FixturePage({ params, searchParams }: {
  params: Promise<{ date?: string; scenario?: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { date, scenario } = await params, input = await searchParams;
  if (!scenario) {
    // Captured SQL pagination uses 30 rows even when the application default changes.
    return (date ? archive : matches).Page({ params: Promise.resolve({ locale: 'en', ...(date ? { date } : {}) }),
      searchParams: Promise.resolve({ pageSize: '30', ...input }) });
  }
  const selected = cases[scenario]; if (!selected) notFound();
  return <MatchFeedPage {...selected} controls={<BodyText>Synthetic acceptance fixtures only. This isolated app never serves production forecasts.</BodyText>} />;
}
