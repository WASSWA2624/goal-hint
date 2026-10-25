import { liveMatchSnapshotSchema } from '../../src/domain/live-match.ts';

export const liveMatchViewNow = Date.parse('2026-10-25T13:20:00Z');
export const liveMatchViewIdentity = { fixtureId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', cycleId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', kickoffAt: liveMatchViewNow - 3_600_000 };
export function liveMatchViewSnapshot(overrides = {}) {
  return liveMatchSnapshotSchema.parse({ version: 1, ...liveMatchViewIdentity, status: 'live', collectedAt: liveMatchViewNow,
    staleAfterMs: 300_000,
    statistics: { state: 'available', reason: null, retrievedAt: liveMatchViewNow - 20_000, providerUpdatedAt: null,
      items: [{ metric: 'possession', unit: 'percent', home: 57, away: 43 }, { metric: 'corners', unit: 'count', home: 0, away: 3 },
        { metric: 'yellow-cards', unit: 'count', home: 1, away: 0 }] },
    events: { state: 'available', reason: null, retrievedAt: liveMatchViewNow - 10_000, providerUpdatedAt: liveMatchViewNow - 30_000,
      items: [{ sequence: 1, elapsed: 14, extra: null, team: 'home', type: 'goal', detail: 'Normal Goal', player: 'Synthetic Player', assist: 'Synthetic Assist', comments: null },
        { sequence: 2, elapsed: 45, extra: 2, team: 'away', type: 'card', detail: 'Yellow Card', player: 'Synthetic Defender', assist: null, comments: null }] },
    ...overrides });
}
const live = liveMatchViewSnapshot();
const unavailable = { state: 'unavailable', reason: 'coverage-unknown', retrievedAt: null, providerUpdatedAt: null, items: [] };
export const liveMatchViewScenarios = {
  live,
  partial: liveMatchViewSnapshot({ statistics: { ...live.statistics, state: 'partial', reason: 'incomplete-response',
    items: [{ metric: 'corners', unit: 'count', home: 0, away: null }] } }),
  stale: liveMatchViewSnapshot({ statistics: { ...live.statistics, state: 'partial', reason: 'provider-error', retrievedAt: liveMatchViewNow - 600_000 },
    events: { ...live.events, retrievedAt: liveMatchViewNow - 600_000, providerUpdatedAt: null } }),
  empty: liveMatchViewSnapshot({ statistics: unavailable, events: { ...live.events, items: [] } }),
  unavailable: liveMatchViewSnapshot({ statistics: { ...unavailable, reason: 'coverage-unavailable' }, events: unavailable }),
  final: liveMatchViewSnapshot({ status: 'finished-regulation', collectedAt: liveMatchViewNow - 600_000,
    statistics: { ...live.statistics, retrievedAt: liveMatchViewNow - 610_000 }, events: { ...live.events, retrievedAt: liveMatchViewNow - 610_000, providerUpdatedAt: null } }),
  missing: null,
};
