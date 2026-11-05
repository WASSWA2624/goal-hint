import { createConservativeJointModel, validatedSlipCandidateKey } from '../../src/server/slips/conservative-joint-model.ts';

export const shadowAt = Date.parse('2026-11-05T08:00:00Z');
/** Synthetic functional proof only; this helper never establishes empirical qualification. */
export function shadowCandidate(id, odds = '2.00', probability = 0.8, changes = {}) {
  return { selection: { fixtureId: id, kickoffAt: shadowAt + 3_600_000,
    homeTeam: { id: `${id}-h`, name: `${id} Home` }, awayTeam: { id: `${id}-a`, name: `${id} Away` },
    competition: { id: 'league', name: 'Synthetic League', country: 'Uganda' },
    family: 'match-result', selection: 'home-win', probability, odds, oddsBasis: 'bookmaker' },
    eligible: true, calibrated: true, modelVersion: 'synthetic-v1', evidenceReference: `synthetic-${id}`,
    validatedAt: shadowAt - 1000, validUntil: shadowAt + 60_000, oddsObservedAt: shadowAt - 2000,
    evidenceReliability: 0.8, ...changes };
}
export function shadowStudy(candidates, changes = {}) {
  return { reference: 'synthetic-mutual-independence', method: 'validated-mutual-independence',
    candidateKeys: candidates.map(validatedSlipCandidateKey), sampleSize: 500, assessedAt: shadowAt - 1000,
    validUntil: shadowAt + 60_000, ...changes };
}
export function shadowModel(candidates, independence = [], changes = {}) {
  return createConservativeJointModel({ candidates, independence,
    calibrationReference: 'synthetic-calibration', correlationReference: 'synthetic-correlation',
    asOf: shadowAt, validUntil: shadowAt + 60_000, minimumStudySample: 500,
    verifyCandidate: () => true, verifyIndependence: () => true, ...changes });
}
