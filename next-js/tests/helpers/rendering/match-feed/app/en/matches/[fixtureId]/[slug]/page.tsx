import { notFound } from 'next/navigation';
import { PublicShell } from '@/app/_components/public-shell';
import { BodyText, PageHeading } from '@/components/ui/layout';
import { canonicalMatchSlug } from '@/domain/match-slug';
import type { MatchFeedResponse } from '@/domain/match-feed';
import scenarios from '../../../../scenarios.json';
const cases = scenarios as unknown as Record<string, { result: { data: MatchFeedResponse | null } }>;
export default async function Page({ params }: { params: Promise<{ fixtureId: string; slug: string }> }) {
  const { fixtureId, slug } = await params;
  const fixture = Object.values(cases).flatMap((item) => item.result.data?.records ?? []).find((item) => item.fixtureId === fixtureId);
  if (!fixture || slug !== canonicalMatchSlug(fixture.homeTeam.name, fixture.awayTeam.name)) notFound();
  return <PublicShell><PageHeading>Synthetic analysis destination</PageHeading>
    <BodyText>{fixture.homeTeam.name} v {fixture.awayTeam.name}</BodyText>
    <BodyText>Isolated one-tap navigation check; real detail content belongs to prompt 035.</BodyText></PublicShell>;
}
