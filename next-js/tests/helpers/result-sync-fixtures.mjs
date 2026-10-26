import { createHash } from 'node:crypto';
import { getReportingDate } from '../../src/domain/calendar.ts';
import { createApiFootballAdapter } from '../../src/server/football/api-football-adapter.ts';
import { createQuotaGateway } from '../../src/server/football/quota-gateway.ts';
import { catalogResponse } from './catalog-fixtures.mjs';

export const resultHash = (value) => createHash('sha256').update(value).digest('hex');
// Explicit synthetic policies exercise mechanics and confer no live authorization.
export function resultPolicy(overrides = {}) {
  return { version: 1, evidenceRef: 'synthetic-result-retention-and-horizons', coverage: [{ competitionId: 39, season: 2026 }],
    approachMs: 60_000, activeWindowMs: 3 * 3_600_000,
    unresolved: [{ untilAgeMs: 86_400_000, intervalMs: 300_000 }, { untilAgeMs: 30 * 86_400_000, intervalMs: 3_600_000 }],
    corrections: [{ untilAgeMs: 86_400_000, intervalMs: 60_000 }, { untilAgeMs: 7 * 86_400_000, intervalMs: 3_600_000 }],
    leaseMs: 30_000, tickMs: 1000, maxBatchesPerTick: 10, failureBaseMs: 60_000, failureMaxMs: 900_000,
    requestWindowMs: 10_000, request: { timeoutMs: 1000, maxRequests: 4, maxPages: 4, maxRows: 1000,
      maxResponseBytes: 1_000_000, retry: { maxAttempts: 1, baseDelayMs: 100, maxDelayMs: 100 }, cacheMaxAgeMs: 0 }, ...overrides };
}
export const resultAuthority = (overrides = {}) => ({ authorize() {}, verifyPolicy: () => true, verifyResponse: () => true, ...overrides });
export function resultProvider(clock, options = {}) {
  const network = [], reservations = [];
  const state = { rows: [], status: 200, paging: undefined, ...options };
  const limiter = options.limiter ?? {
    async reserve(request) { reservations.push(request); return { status: 'reserved', permit: {
      requestId: request.requestId, periodId: resultHash('period'), ownerToken: resultHash(request.requestId),
      dispatchedAt: clock.now(), launchBefore: clock.now() + 1000 } }; },
    async claimLaunch() { return { status: 'claimed', timeoutMs: 1000 }; },
    async complete() { return { status: 'recorded' }; },
  };
  const adapter = createApiFootballAdapter({ accountId: options.accountId ?? resultHash('provider-account'),
    credential: { read: () => 'synthetic-result-private-key' }, gateway: createQuotaGateway({ limiter, authorize() {} }),
    authorize() {}, clock, verifyRegulationScore: () => state.verifyScore !== false,
    batchEvidence: { maximumIds: 20, evidenceRef: 'synthetic-confirmed-20-id-contract' }, verifyBatchEvidence: () => true,
    sleep: options.sleep ?? (async () => {}), random: () => 1,
    fetcher: async (input) => {
      const url = new URL(input); network.push({ url, at: clock.now() });
      if (state.respond) return state.respond(url);
      let rows = state.rows;
      if (url.searchParams.has('date')) rows = rows.filter((row) => getReportingDate(Date.parse(row.fixture.date)) === url.searchParams.get('date'));
      if (url.searchParams.has('live')) rows = rows.filter((row) => ['1H','2H','HT','ET','LIVE'].includes(row.fixture.status.short));
      if (url.searchParams.has('ids') || url.searchParams.has('id')) {
        const ids = (url.searchParams.get('ids') ?? url.searchParams.get('id')).split('-').map(Number);
        rows = rows.filter((row) => ids.includes(row.fixture.id));
      }
      return catalogResponse(url, rows, { status: state.status, paging: state.paging });
    } });
  return { state, adapter, network, reservations };
}
