import { readFile } from 'node:fs/promises';
import { getReportingDate, utcInstantFromEpochMilliseconds, addReportingDays } from '@/domain/calendar';
const readClock = async () => JSON.parse(await readFile("__LIVE_CLOCK_PATH__", 'utf8')).now as number;
import { parseFeedQuery, feedQueryKey, isFeedDatePreset, resolveFeedDates } from '@/domain/feed-query';
import { parseReportingDate } from '@/domain/calendar';
import type { MatchFeedResponse } from '@/domain/match-feed';
import scenarios from '../../scenarios.json';
const cases = scenarios as unknown as Record<string, { query: ReturnType<typeof parseFeedQuery>; today: string; result: { data: MatchFeedResponse | null } }>;
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const instant = await readClock(), today = getReportingDate(utcInstantFromEpochMilliseconds(instant)); const originalToday = parseReportingDate('2026-10-09');
  // Polls, Load more and draft counts send the leagues=0 response option; full leagues are harmless here.
  const url = new URL(request.url); url.searchParams.delete('leagues');
  let query; try { query = parseFeedQuery(url.searchParams, { today }); } catch { return Response.json({ error: 'invalid-query' }, { status: 400 }); }
  const selected = Object.entries(cases).find(([name, item]) => !name.startsWith('pagination-changed') &&
    item.result.data && item.today === originalToday && item.query.page === query.page && feedQueryKey(item.query, originalToday) === feedQueryKey(query, originalToday));
  return selected ? Response.json(rollover(selected[1].result.data!, query, today, instant), { headers: { 'cache-control': 'no-store' } }) : Response.json({error:'unavailable'},{status:503});
}
function rollover(original: import('@/domain/match-feed').MatchFeedResponse, query: ReturnType<typeof parseFeedQuery>, today: ReturnType<typeof parseReportingDate>, instant: number) {
  const data = structuredClone(original), relative = isFeedDatePreset(query.dates.kind);
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

