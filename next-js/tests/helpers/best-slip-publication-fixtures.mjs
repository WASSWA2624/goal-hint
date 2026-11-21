import { liveRecord, now } from './live-refresh-fixtures.mjs';
import { parseDecimalOdds } from '../../src/domain/odds.ts';

export const editorialFixtureId = (index) => `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

export function pricedEditorialSelection(index, { odds = '4.00', bookmakerId = 8, kickoffAt = now + 3_600_000, at = now,
  fixtureId = editorialFixtureId(index), cycleId = editorialFixtureId(900), revisionId = editorialFixtureId(901), probability = 0.75 } = {}) {
  const { homeTeam, awayTeam, competition } = liveRecord();
  return { fixtureId, kickoffAt, homeTeam, awayTeam, competition, family: 'match-result', selection: 'home-win', probability,
    odds, oddsBasis: 'bookmaker', source: 'local-engine', bookmaker: { id: bookmakerId, name: null },
    forecast: { cycleId, revisionId, publishedAt: at - 1000 }, offer: { bookmakerId, bookmakerName: null, betId: 1,
      betName: 'Match Winner', providerSelection: 'Home', decimal: parseDecimalOdds(odds).text, checkedAt: at - 1000,
      observedAt: at - 1000, providerUpdatedAt: null, snapshotId: 'a'.repeat(64), receiptId: 'b'.repeat(64) } };
}
