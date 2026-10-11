import { notFound } from 'next/navigation';
import { MatchDetailPage } from '@/app/_components/match-detail-page';
import { parseReportingDate } from '@/domain/calendar';
import type { DetailPageResult } from '@/server/matches/detail-page';
import cases from '../../detail-scenarios.json';
const scenarios = cases as unknown as Record<string, DetailPageResult & { requestQuery?: string }>;
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ scenario: string }> }) {
  const { scenario } = await params, selected = scenarios[scenario]; if (!selected) notFound();
  if (scenario.startsWith('history-')) {
    const primary = ['history-current', 'history-cycle-current', 'history-locked-current'].map(key => scenarios[key]).find(item => item?.data?.fixture.fixtureId === selected.data?.fixture.fixtureId);
    if (!primary) notFound();
    return <MatchDetailPage result={primary} historyResult={selected} historyQuery={selected.requestQuery ?? ''}
      today={parseReportingDate('2026-10-09')} retryHref={primary.data!.route.path} />;
  }
  return <MatchDetailPage result={selected} today={parseReportingDate('2026-10-09')} retryHref={selected.data?.route.path ?? '/detail-cases/open'} />;
}
