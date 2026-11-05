import "server-only";

import { createHash } from "node:crypto";
import { calendarRules } from "../../domain/calendar.ts";
import type { JointSlipModel } from "../../domain/joint-slip-model.ts";
import { isMarketSelection } from "../../domain/markets.ts";
import type { SlipSelection } from "../../domain/slip-builder.ts";
import { provenTrue } from "../shared/authority-proof.ts";

/** A shadow candidate carries its own validation; it is never a published forecast. */
export type ValidatedSlipCandidate = Readonly<{
  selection: SlipSelection;
  eligible: boolean;
  calibrated: boolean;
  modelVersion: string;
  evidenceReference: string;
  validatedAt: number;
  validUntil: number;
  oddsObservedAt: number;
  evidenceReliability: number;
}>;

/** Evidence covers this exact complete set, not merely its pairs. Pairwise independence is insufficient. */
export type SlipIndependenceEvidence = Readonly<{
  reference: string;
  method: "validated-mutual-independence";
  candidateKeys: readonly string[];
  sampleSize: number;
  assessedAt: number;
  validUntil: number;
}>;

export function slipSelectionKey(selection: SlipSelection): string {
  return createHash("sha256").update(JSON.stringify([
    selection.fixtureId, selection.kickoffAt, selection.homeTeam.id, selection.awayTeam.id,
    selection.competition.id, selection.family, selection.selection, selection.probability,
    selection.odds, selection.oddsBasis, selection.forecast
      ? [selection.forecast.cycleId, selection.forecast.revisionId, selection.forecast.publishedAt] : null,
  ])).digest("hex");
}

export function validatedSlipCandidateKey(candidate: ValidatedSlipCandidate): string {
  return createHash("sha256").update(JSON.stringify([
    slipSelectionKey(candidate.selection), candidate.modelVersion, candidate.evidenceReference,
    candidate.validatedAt, candidate.validUntil, candidate.oddsObservedAt, candidate.evidenceReliability,
  ])).digest("hex");
}

export function eligibleShadowSlipCandidate(candidate: ValidatedSlipCandidate, at: number): boolean {
  const { selection } = candidate;
  return Number.isFinite(at) && candidate.eligible === true && candidate.calibrated === true
    && !!candidate.modelVersion.trim() && !!candidate.evidenceReference.trim()
    && Number.isFinite(candidate.validatedAt) && candidate.validatedAt >= 0 && candidate.validatedAt <= at
    && Number.isFinite(candidate.validUntil) && at < candidate.validUntil
    && Number.isFinite(candidate.oddsObservedAt) && candidate.oddsObservedAt >= 0 && candidate.oddsObservedAt <= candidate.validatedAt
    && Number.isFinite(candidate.evidenceReliability) && candidate.evidenceReliability >= 0 && candidate.evidenceReliability <= 1
    && Number.isFinite(selection.probability) && selection.probability >= 0 && selection.probability <= 1
    && Number.isFinite(selection.kickoffAt) && at < selection.kickoffAt - calendarRules.cutoffSecondsBeforeKickoff * 1000
    && !!selection.fixtureId && !!selection.homeTeam.id && !!selection.awayTeam.id
    && selection.homeTeam.id !== selection.awayTeam.id && isMarketSelection(selection.family, selection.selection);
}

const setKey = (keys: readonly string[]) => [...keys].sort().join(":");

/** No runtime binding is installed. Verifiers must check retained out-of-sample calibration and full-set dependence
 * evidence, including league/context effects and forecast lead time. References and sample counts alone prove neither. */
export function createConservativeJointModel(input: Readonly<{
  candidates: readonly ValidatedSlipCandidate[];
  independence: readonly SlipIndependenceEvidence[];
  calibrationReference: string;
  correlationReference: string;
  asOf: number;
  validUntil: number;
  minimumStudySample: number;
  verifyCandidate: (candidate: ValidatedSlipCandidate) => boolean;
  verifyIndependence: (evidence: SlipIndependenceEvidence) => boolean;
}>): JointSlipModel {
  const { asOf, validUntil, calibrationReference, correlationReference, minimumStudySample, verifyCandidate, verifyIndependence } = input;
  if (!Number.isFinite(asOf) || !Number.isFinite(validUntil) || validUntil <= asOf
    || !calibrationReference.trim() || !correlationReference.trim()
    || !Number.isSafeInteger(minimumStudySample) || minimumStudySample < 1) {
    throw new RangeError("Invalid joint-model qualification policy.");
  }
  // Copy data before verification so callers cannot mutate a previously qualified estimate.
  const candidates = new Map<string, ValidatedSlipCandidate>();
  const ambiguous = new Set<string>();
  for (const value of input.candidates) {
    const candidate = structuredClone(value), key = slipSelectionKey(candidate.selection);
    if (candidates.has(key)) ambiguous.add(key);
    candidates.set(key, candidate);
  }
  const studies = new Map<string, SlipIndependenceEvidence>();
  for (const value of input.independence) {
    const study = structuredClone(value);
    if (study.method !== "validated-mutual-independence" || !study.reference.trim()
      || !Number.isSafeInteger(study.sampleSize) || study.sampleSize < minimumStudySample
      || !Number.isFinite(study.assessedAt) || study.assessedAt > asOf
      || !Number.isFinite(study.validUntil) || study.validUntil < validUntil
      || study.candidateKeys.length < 2 || new Set(study.candidateKeys).size !== study.candidateKeys.length) continue;
    studies.set(setKey(study.candidateKeys), study);
  }
  return Object.freeze({
    calibrationReference, correlationReference, validFrom: asOf, validUntil,
    estimate(selections: readonly SlipSelection[]): number | null {
      if (!selections.length) return null;
      const fixtureIds = new Set<string>(), teamIds = new Set<string>(), keys: string[] = [];
      let probability = 1, latestValidation = 0;
      for (const selection of selections) {
        const key = slipSelectionKey(selection), candidate = candidates.get(key);
        if (!candidate || ambiguous.has(key) || !eligibleShadowSlipCandidate(candidate, asOf)
          || candidate.validUntil < validUntil
          || validUntil > selection.kickoffAt - calendarRules.cutoffSecondsBeforeKickoff * 1000
          || !provenTrue(() => verifyCandidate(structuredClone(candidate)))
          || fixtureIds.has(selection.fixtureId) || teamIds.has(selection.homeTeam.id) || teamIds.has(selection.awayTeam.id)) return null;
        fixtureIds.add(selection.fixtureId); teamIds.add(selection.homeTeam.id); teamIds.add(selection.awayTeam.id);
        keys.push(validatedSlipCandidateKey(candidate)); probability *= selection.probability;
        latestValidation = Math.max(latestValidation, candidate.validatedAt);
      }
      if (selections.length > 1) {
        const study = studies.get(setKey(keys));
        if (!study || study.assessedAt < latestValidation || !provenTrue(() => verifyIndependence(structuredClone(study)))) return null;
      }
      return probability;
    },
  });
}
