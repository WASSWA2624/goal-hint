import { randomUUID } from 'node:crypto';
import { fixture, query, today, now } from './client-state-fixtures.mjs';
import { resolveFeedDates } from '../../src/domain/feed-query.ts';
import { matchFeedRecordSchema, matchFeedResponseSchema } from '../../src/domain/match-feed.ts';
import { matchDetailResponseSchema } from '../../src/domain/match-detail.ts';

export { query, today, now };
export const ids = { fixture: randomUUID(), cycle: randomUUID(), revision: randomUUID(), run: randomUUID() };
export function liveRecord(overrides = {}) {
  return matchFeedRecordSchema.parse({ ...fixture({ fixtureId: ids.fixture, cycleId: ids.cycle,
    forecast: { ...fixture().forecast, runId: ids.run, revisionId: ids.revision } }),
    cycle: { state: 'open', mode: 'current', ordinal: 1, lockedAt: null, voidReason: null },
    unavailableMarkets: ['total-goals', 'both-teams-to-score'].map(family => ({ family, reason: 'unsupported' })),
    update: { prediction: 'current', result: 'current' }, scorePeriod: null, availabilityMessage: null, ...overrides });
}
export function liveRun(overrides = {}) {
  return { id: ids.run, sequence: '20261009', date: today, phase: 'updating', total: 4, completed: 1, terminal: 1,
    failed: 0, published: 1, partialCoverage: false, message: null, ...overrides };
}
export function liveFeed(records = [liveRecord()], overrides = {}) {
  const range = resolveFeedDates(query(), today);
  return matchFeedResponseSchema.parse({ records, page: 1, nextPage: null, previousPage: null, pageSize: 30,
    paginationVersion: 'a'.repeat(64), total: records.length, totalPages: records.length ? 1 : 0, links: { next: null, previous: null },
    asOf: now, today, range: { from: today, to: today, ...range.window }, state: records.length ? 'ready' : 'no-fixtures', message: null,
    coverage: { partial: false, knownFixtures: records.length, matchingWithMarket: records.length,
      dates: [{ date: today, status: 'complete', observedAt: now, authoritative: true }] }, run: liveRun(), ...overrides });
}
export function liveDetail(record = liveRecord(), overrides = {}) {
  const cycle = { id: record.cycleId, ordinal: record.cycle.ordinal, state: record.cycle.state,
    currentRevisionId: record.forecast?.revisionId ?? null, lockedRevisionId: record.cycle.state === 'closed' ? record.forecast?.revisionId ?? null : null,
    kickoffAt: now + 3600000, cutoffAt: now + 3300000, openedAt: now - 3600000, closedAt: record.cycle.lockedAt,
    lockedAt: record.cycle.lockedAt, voidedAt: null, voidReason: record.cycle.voidReason };
  const snapshot = record.forecast ? { ...record.forecast, cycleId: record.cycleId, runSequence: '20261009', fixtureRevision: 1,
    cycleRevision: 1, fixtureDataVersion: record.dataVersion, evidenceCutoffAt: now - 10000, generationCompletedAt: now - 5000,
    historical: false, applicability: record.cycle.mode, cycle,
    markets: record.forecast.markets.map(item => ({ ...item,
      alternatives: Object.entries(item.market.probabilities).filter(([selection]) => selection !== item.market.selection)
        .map(([selection, probability]) => ({ selection, probability })),
      source: { kind: item.market.source, provisional: false, fallbackReason: null, sourceIds: [] },
      timestamps: { generatedAt: now - 5000, retrievedAt: now - 5000, providerUpdatedAt: null } })),
    unavailableMarkets: record.unavailableMarkets, analysis: { state: 'withheld', reasons: [], uncertainty: null, limitedNews: false, sources: [] }, outcomes: [] } : null;
  return matchDetailResponseSchema.parse({ fixture: record, asOf: now, run: liveRun(), route: { fixtureId: ids.fixture,
    slug: 'synthetic-a-v-synthetic-b', path: `/en/matches/${ids.fixture}/synthetic-a-v-synthetic-b` }, currentRevisionId: record.forecast?.revisionId ?? null,
    selection: 'applicable', selectedCycle: cycle, snapshot,
    history: { limit: 10, revisions: { anchor: 1, entries: [], next: null }, cycles: { anchor: 1, entries: [], next: null } }, ...overrides });
}
