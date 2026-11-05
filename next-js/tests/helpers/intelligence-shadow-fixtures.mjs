import { evidenceFingerprint } from '../../src/server/evidence/evidence-input.ts';
import { ShadowStoreError, validateShadowRecord } from '../../src/server/intelligence/shadow-store.ts';

export const SHADOW_NOW = Date.UTC(2026, 10, 5, 10);
export const SHADOW_FIXTURE = '11111111-1111-4111-8111-111111111111';
export const shadowObservation = (changes = {}) => ({ fixtureId: SHADOW_FIXTURE, observedAt: SHADOW_NOW, receivedAt: SHADOW_NOW,
  kickoffAt: SHADOW_NOW + 86_400_000, status: 'scheduled', confirmedMajorAbsences: [], unexpectedLineup: false, seriousSecurityIssue: false,
  context: [], odds: { home: 2 }, probabilities: { home: 0.6 }, ...changes });
export const shadowForecast = (fixtureId = SHADOW_FIXTURE, at = SHADOW_NOW, changes = {}) => {
  const body = { version: 'shadow-validator-v1',
  fixtureId, forecastAt: at, mode: 'shadow', publish: false, decision: 'withhold', probabilities: null, calibratedProbability: null,
  evidenceReliability: 'limited', modelUncertainty: 'high', oddsValue: null, components: { local: null, provider: null, context: null }, ensemble: null,
  reasons: ['synthetic-persistence-fixture-only'], ...changes };
  return { ...body, hash: evidenceFingerprint(body) };
};
export function memoryShadowStore() {
  const states = new Map(), checks = new Map(), revisions = new Map();
  return { states, checks, revisions,
    async read(id) { return states.get(id) ?? null; },
    async check(id) { return checks.get(id) ?? null; },
    async record(input) {
      validateShadowRecord(input);
      const { check } = input, old = states.get(check.fixtureId), replay = checks.get(check.id);
      if (replay) {
        if (replay.requestHash !== check.requestHash) throw new ShadowStoreError('conflicting-check');
        return replay;
      }
      if (old && check.checkedAt < old.lastCheckedAt) throw new ShadowStoreError('out-of-order');
      if ((old?.observationHash ?? null) !== input.expectedObservationHash || (old?.latest?.id ?? null) !== input.expectedLatestRevisionId)
        throw new ShadowStoreError('concurrent-change');
      let latest = old?.latest ?? null, latestEligibleRevisionId = old?.latestEligibleRevisionId ?? null;
      if (input.revision && (!latest || latest.semanticHash !== input.revision.semanticHash || latest.modelVersion !== input.revision.modelVersion)) {
        const sequence = (latest?.sequence ?? 0) + 1;
        latest = { ...input.revision, id: evidenceFingerprint({ fixtureId: check.fixtureId, sequence, semanticHash: input.revision.semanticHash, modelVersion: input.revision.modelVersion }),
          fixtureId: check.fixtureId, sequence, createdAt: check.checkedAt, eligible: input.revision.body.forecast.decision === 'eligible-shadow' };
        revisions.set(latest.id, structuredClone(latest)); latestEligibleRevisionId = latest.eligible ? latest.id : null;
      } else if (input.revision) latestEligibleRevisionId = latest?.eligible ? latest.id : null;
      if (input.availability !== 'available') latestEligibleRevisionId = null;
      states.set(check.fixtureId, { fixtureId: check.fixtureId, lastCheckedAt: check.checkedAt, checks: (old?.checks ?? 0n) + 1n,
        availability: input.availability, observation: input.observation ?? old?.observation ?? null,
        observationHash: input.observation ? input.observationHash : old?.observationHash ?? null, latest, latestEligibleRevisionId });
      const receipt = { ...check, revisionId: latest?.id ?? null }; checks.set(check.id, receipt); return receipt;
    },
  };
}
