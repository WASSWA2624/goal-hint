import { readFile } from 'node:fs/promises';
import { getReportingDate, utcInstantFromEpochMilliseconds, addReportingDays } from '@/domain/calendar';
const readClock = async () => JSON.parse(await readFile("__LIVE_CLOCK_PATH__", 'utf8')).now as number;
import { notFound } from 'next/navigation';
import { MatchFeedPage } from '@/app/_components/match-feed-page';
import { BodyText } from '@/components/ui/layout';
import { parseFeedQuery, feedQueryKey, resolveFeedDates } from '@/domain/feed-query';
import { parseReportingDate } from '@/domain/calendar';
import type { FeedPageResult } from '@/server/matches/feed-page';
import scenarios from './scenarios.json';
const cases = scenarios as unknown as Record<string, { query: ReturnType<typeof parseFeedQuery>; today: ReturnType<typeof parseReportingDate>; result: FeedPageResult }>;
export default async function FixturePage({ params, searchParams }: {
  params: Promise<{ date?: string; scenario?: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { date, scenario } = await params, input = await searchParams;
  if (!scenario) {
    const instant = await readClock(), today = getReportingDate(utcInstantFromEpochMilliseconds(instant)); const originalToday = parseReportingDate('2026-10-09');
    let query;
    try { query = parseFeedQuery(input, { today, ...(date ? { routeDate: date } : {}) }); } catch { notFound(); }
    // Deliberate test-only delay/error for navigation races and failed refreshes.
    if (query.search === 'Slow query') await new Promise((resolve) => setTimeout(resolve, 1800));
    if (['Unavailable query', 'Slow query', 'Busy query'].includes(query.search)) {
      return <MatchFeedPage query={query} today={today} result={{ data: null, error: query.search === 'Busy query' ? 'rate-limited' : 'unavailable' }} />;
    }
    const selected = Object.values(cases).find((item) => item.result.data && item.today === originalToday && item.query.page === query.page &&
      feedQueryKey(item.query, originalToday) === feedQueryKey(query, originalToday));
    if (!selected) notFound();
    return <MatchFeedPage query={query} today={today} result={{ data: rollover(selected.result.data!, query, today, instant), error: null }} />;
  }
  const selected = cases[scenario]; if (!selected) notFound();
  return <MatchFeedPage {...selected} controls={<BodyText>Synthetic acceptance fixtures only. This isolated app never serves production forecasts.</BodyText>} />;
}
function rollover(original: import('@/domain/match-feed').MatchFeedResponse, query: ReturnType<typeof parseFeedQuery>, today: ReturnType<typeof parseReportingDate>, instant: number) {
  const data = structuredClone(original), relative = ['today','tomorrow','next-7-days'].includes(query.dates.kind);
  const range = resolveFeedDates(query, today), shift = relative ? Date.parse(today) - Date.parse('2026-10-09') : 0;
  data.today = today; data.asOf = Math.max(data.asOf, instant);
  data.range = { from: range.startDate, to: range.endDate, ...range.window };
  if (shift) {
    data.records = data.records.map(record => ({ ...record, dataVersion: String(BigInt(record.dataVersion) + BigInt(shift / 86400000)), kickoffAt: record.kickoffAt === null ? null : (record.kickoffAt + shift) as typeof record.kickoffAt }));
    data.coverage.dates = data.coverage.dates.map(entry => ({ ...entry, date: addReportingDays(parseReportingDate(entry.date), shift / 86400000) }));
    if (data.run) data.run = { ...data.run, date: today, sequence: today.replaceAll('-', '') };
  }
  return data;
}

