import { parseFeedQuery, feedQueryKey } from '@/domain/feed-query';
import { parseReportingDate } from '@/domain/calendar';
import type { MatchFeedResponse } from '@/domain/match-feed';
import scenarios from '../../scenarios.json';
const cases = scenarios as unknown as Record<string, { query: ReturnType<typeof parseFeedQuery>; today: string; result: { data: MatchFeedResponse | null } }>;
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const today = parseReportingDate('2026-10-09');
  // Polls, Load more and draft counts send the leagues=0 response option; full leagues are harmless here.
  const url = new URL(request.url); url.searchParams.delete('leagues'); if (!url.searchParams.has('pageSize')) url.searchParams.set('pageSize', '30');
  let query; try { query = parseFeedQuery(url.searchParams, { today }); } catch { return Response.json({ error: 'invalid-query' }, { status: 400 }); }
  const selected = Object.entries(cases).find(([name, item]) => !name.startsWith('pagination-changed') &&
    item.result.data && item.today === today && item.query.page === query.page && feedQueryKey(item.query, today) === feedQueryKey(query, today));
  return selected ? Response.json(selected[1].result.data, { headers: { 'cache-control': 'no-store' } }) : Response.json({error:'unavailable'},{status:503});
}
