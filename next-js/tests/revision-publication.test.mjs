import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createPredictionWindow, getPublicationDeadline, getReportingDate } from '../src/domain/calendar.ts';
import { parsePublicationPolicy, parsePublishRevision } from '../src/server/predictions/publication-input.ts';
import { RevisionPublicationError } from '../src/server/predictions/publication-contract.ts';
import { publicationEligibility, publicationSourceIsFresh, revisionEligibleForSchedule } from '../src/server/predictions/publication-eligibility.ts';
import { historyCandidate } from './helpers/prediction-history-fixtures.mjs';
import { publicationPolicy, publicationInput, emptyCandidate, PUBLICATION_NOW } from './helpers/publication-fixtures.mjs';

const denied = (reason) => (error) => error instanceof RevisionPublicationError && error.reason === reason;
function eligible() {
  const now = PUBLICATION_NOW, fixtureId = randomUUID(), cycleId = randomUUID(), kickoffAt = now + 600_000;
  const cycle = { id: cycleId, fixtureId, scheduleVersion: 1, state: 'open', kickoffAt, cutoffAt: getPublicationDeadline(kickoffAt) };
  return { now, cycle, activeCycleId: cycleId, kickoffAt, status: 'scheduled', scheduleVersion: 1, candidateKickoffAt: kickoffAt,
    originalWindow: createPredictionWindow(getReportingDate(now)), maxObservationAgeMs: 1000, earlierCloseAt: null,
    observation: { provider: 'api-football', fixtureId, externalFixtureId: 101, cycleId, kickoffAt, status: 'scheduled',
      retrievedAt: now, providerUpdatedAt: null, actualStartedAt: null, evidenceRef: 'synthetic-observation' } };
}
test('live publication has no invented freshness defaults and requires a complete bounded policy', () => {
  assert.throws(() => parsePublicationPolicy(null), denied('policy-required'));
  assert.throws(() => parsePublicationPolicy({ ...publicationPolicy(), maxObservationAgeMs: 0 }), denied('invalid-request'));
  assert.throws(() => parsePublicationPolicy({ ...publicationPolicy(), sources: {} }), denied('invalid-request'));
  assert.ok(Object.isFrozen(parsePublicationPolicy(publicationPolicy()).sources.ai));
});
test('cutoff is strict at the millisecond; early play and its durable barrier close eligibility', () => {
  const input = eligible();
  assert.equal(publicationEligibility({ ...input, now: input.cycle.cutoffAt - 1,
    observation: { ...input.observation, retrievedAt: input.cycle.cutoffAt - 1 } }), null);
  for (const now of [input.cycle.cutoffAt, input.cycle.cutoffAt + 1]) assert.equal(publicationEligibility({ ...input, now }), 'cutoff-passed');
  assert.equal(publicationEligibility({ ...input, observation: { ...input.observation, status: 'live' } }), 'early-play');
  assert.equal(publicationEligibility({ ...input, observation: { ...input.observation, actualStartedAt: input.now - 1 } }), 'early-play');
  assert.equal(publicationEligibility({ ...input, earlierCloseAt: input.now - 1000 }), 'early-play');
});
test('both EAT windows, active cycle, current schedule and eligible status are checked independently', () => {
  const input = eligible();
  assert.equal(publicationEligibility(input), null);
  assert.equal(publicationEligibility({ ...input, activeCycleId: randomUUID() }), 'wrong-cycle');
  assert.equal(publicationEligibility({ ...input, cycle: { ...input.cycle, state: 'closed' } }), 'closed-cycle');
  assert.equal(publicationEligibility({ ...input, scheduleVersion: 2 }), 'schedule-changed');
  assert.equal(publicationEligibility({ ...input, kickoffAt: input.kickoffAt + 1 }), 'schedule-changed');
  assert.equal(publicationEligibility({ ...input, observation: { ...input.observation, kickoffAt: input.kickoffAt + 1 } }), 'schedule-changed');
  assert.equal(publicationEligibility({ ...input, originalWindow: { startInclusive: input.kickoffAt + 1, endExclusive: input.kickoffAt + 2 } }), 'outside-window');
  const future = input.now + 8 * 86_400_000;
  assert.equal(publicationEligibility({ ...input, now: future }), 'outside-window');
  assert.equal(publicationEligibility({ ...input, status: 'postponed' }), 'status-ineligible');
});
test('original retrieval age includes cache age; freshness boundaries and future clocks fail closed', () => {
  const input = eligible();
  assert.equal(publicationEligibility({ ...input, observation: { ...input.observation, retrievedAt: input.now - 1000 } }), null);
  assert.equal(publicationEligibility({ ...input, observation: { ...input.observation, retrievedAt: input.now - 1001 } }), 'stale-observation');
  assert.equal(publicationEligibility({ ...input, observation: { ...input.observation, retrievedAt: input.now + 1 } }), 'future-observation');
  const timestamps = { generatedAt: input.now - 1001, retrievedAt: input.now, providerUpdatedAt: null }, policy = publicationPolicy().sources.ai;
  assert.equal(publicationSourceIsFresh(timestamps, { ...policy, basis: 'generated', maxAgeMs: 1000 }, input.now), false);
  assert.equal(publicationSourceIsFresh(timestamps, { ...policy, unknownUpdate: 'reject' }, input.now), false);
  assert.equal(publicationSourceIsFresh({ ...timestamps, generatedAt: null }, { ...policy, basis: 'generated' }, input.now), true);
});
test('full snapshot/source validation runs again; all-unavailable is valid only as a refresh result', () => {
  const base = historyCandidate(), candidate = { ...base, context: { ...base.context,
    context: { ...base.context.context, cycleId: randomUUID(), runId: randomUUID() } } };
  const input = publicationInput(candidate, 'a'.repeat(64));
  assert.equal(parsePublishRevision(input).candidate.markets['match-result'].available, true);
  assert.equal(parsePublishRevision({ ...input, candidate: emptyCandidate(candidate) }).candidate.markets['match-result'].available, false);
  const invalid = structuredClone(input); invalid.candidate.markets['match-result'].market.probabilities.draw = 0.99;
  assert.throws(() => parsePublishRevision(invalid), denied('invalid-request'));
  const mixed = structuredClone(input); mixed.candidate.markets['double-chance'].timestamps.retrievedAt++;
  assert.throws(() => parsePublishRevision(mixed), denied('invalid-request'));
  assert.throws(() => parsePublishRevision({ ...input, publishedAt: PUBLICATION_NOW }), denied('invalid-request'));
});
test('retention eligibility uses the same cycle and strict current schedule/start boundary', () => {
  const { cycle } = eligible(), revision = { fixtureId: cycle.fixtureId, cycleId: cycle.id, scheduleVersion: 1, publishedAt: cycle.cutoffAt - 1 };
  assert.equal(revisionEligibleForSchedule(revision, cycle, null), true);
  assert.equal(revisionEligibleForSchedule({ ...revision, publishedAt: cycle.cutoffAt }, cycle, null), false);
  assert.equal(revisionEligibleForSchedule(revision, cycle, revision.publishedAt), false);
  assert.equal(revisionEligibleForSchedule({ ...revision, cycleId: randomUUID() }, cycle, null), false);
});
