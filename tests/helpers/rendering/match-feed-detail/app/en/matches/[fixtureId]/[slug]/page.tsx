import { createMatchDetailRoute } from '@/app/_components/match-detail-route';
import { MatchFeedError } from '@/server/matches/feed-error';
import { parseMatchDetailQuery } from '@/server/matches/detail-query';
import type { DetailPageResult } from '@/server/matches/detail-page';
import cases from '../../../../detail-scenarios.json';
const scenarios = cases as unknown as Record<string, DetailPageResult & { requestQuery?: string }>;
let failNextHistory = true, busyNextHistory = true;
const route = createMatchDetailRoute(async (id, parameters = new URLSearchParams()) => {
  const query = parseMatchDetailQuery(id, parameters), values = Object.values(scenarios);
  const primary = ['history-current', 'history-cycle-current', 'history-locked-current'].map(key => scenarios[key]).find(item => item?.data?.fixture.fixtureId === id)
    ?? values.find(item => item.data?.fixture.fixtureId === id && item.data.selection === 'applicable');
  if (!primary?.data) throw new MatchFeedError('not-found');
  if (!parameters.size) return primary.data;
  if (query.limit === 20 && failNextHistory) { failNextHistory = false; throw new MatchFeedError('unavailable'); }
  if (query.limit === 19 && busyNextHistory) { busyNextHistory = false; throw new MatchFeedError('rate-limited'); }
  const selected = values.find(item => item.data?.fixture.fixtureId === id &&
    (query.revision ? item.data.selection === 'revision' && item.data.snapshot?.revisionId === query.revision
      : query.cycle ? item.data.selection === 'cycle' && item.data.selectedCycle?.id === query.cycle : item.data.selection === 'applicable') &&
    (query.revisionBefore === null || new URLSearchParams(item.requestQuery).get('revisionBefore') === String(query.revisionBefore)) &&
    (query.cycleBefore === null || new URLSearchParams(item.requestQuery).get('cycleBefore') === String(query.cycleBefore)));
  if (selected?.data) return selected.data;
  if (query.revision || query.cycle) throw new MatchFeedError('not-found');
  return primary.data;
}, undefined, async () => {
  // This fixture exercises captured detail/history only; optional section previews remain unavailable.
  throw new MatchFeedError('unavailable');
});
type Props = { params: Promise<{ fixtureId: string; slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const normalized = (props: Props) => ({ ...props, params: props.params.then(params => ({ ...params, locale: 'en' })) });
export const dynamic = 'force-dynamic';
export function generateMetadata(props: Props) { return route.generateMetadata(normalized(props)); }
export default function Page(props: Props) { return route.Page(normalized(props)); }

