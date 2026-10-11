import cases from '../../../detail-scenarios.json';
import type { DetailPageResult } from '@/server/matches/detail-page';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, values = cases as unknown as Record<string, DetailPageResult>;
  const selected = ['history-current','history-cycle-current','history-locked-current'].map(key => values[key]).find(item => item?.data?.fixture.fixtureId === id)
    ?? Object.values(values).find(item => item.data?.fixture.fixtureId === id && item.data.selection === 'applicable');
  return selected?.data ? Response.json(selected.data, { headers: { 'cache-control': 'no-store' } }) : Response.json({error:'not-found'}, {status:404});
}
