import { normalizeFixture } from '../../src/server/football/api-football-normalize.ts';
import { catalogFixture } from './catalog-fixtures.mjs';

// Synthetic mapping approval only; production needs validated provider evidence.
export function lifecyclePolicy(overrides = {}) {
  return { version: 1, evidenceRef: 'synthetic-lifecycle-policy-proof', ordering: 'retrieval-and-provider-update',
    unknownUpdate: 'use-retrieval', conflictResolution: 'newer-verified-observation', mappings: [
      ['NS', 'scheduled'], ['PST', 'postponed'], ['LIVE', 'live'], ['1H', 'live'], ['FT', 'finished-regulation'],
      ['AET', 'finished-extra-time'], ['PEN', 'finished-penalties'], ['CANC', 'canceled'], ['ABD', 'abandoned'],
      ['AWD', 'awarded'], ['WO', 'awarded'],
    ].map(([providerStatus, status]) => ({ providerStatus, status })), ...overrides };
}
export function lifecycleAuthority(overrides = {}) {
  return { authorize() {}, verifyPolicy: () => true, verifyObservation: () => true, ...overrides };
}
export function lifecycleInput(state, at, { status = 'NS', kickoffAt = state.cycle.kickoffAt,
  actualStartedAt = null, providerUpdatedAt = null, raw = {} } = {}) {
  const row = catalogFixture(state.fixture.externalId, {
    kickoff: kickoffAt === null ? null : new Date(kickoffAt).toISOString(), status, ...raw,
  });
  row.fixture.date = kickoffAt === null ? null : new Date(kickoffAt).toISOString();
  row.fixture.timestamp = kickoffAt === null ? null : Math.floor(kickoffAt / 1000);
  const normalized = normalizeFixture(row, { retrievedAt: at, endpoint: '/fixtures', verifyRegulationScore: () => true });
  if (!normalized.valid) throw new Error('Invalid synthetic lifecycle observation');
  return { fixtureId: state.fixture.id, fixture: { ...normalized.data, source: { ...normalized.data.source, providerUpdatedAt } },
    actualStartedAt, actor: 'synthetic-schedule-observer', evidenceRef: 'synthetic-provider-observation' };
}
