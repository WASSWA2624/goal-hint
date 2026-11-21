import "server-only";

import { z } from "zod";
import { bestSlipExactRange, dailyBestSlipBandLimit, defaultBestSlipOddsBand } from "../../domain/best-slip-odds-bands.ts";
import { bestSlipCombinationIdentity, bestSlipDailyCriteria } from "../../domain/best-slips.ts";
import { getPublicationDeadline, getReportingDate, getReportingDayBounds, parseReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { isMarketFamily } from "../../domain/markets.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { preMatchReferenceOddsFreshMs } from "../../domain/reference-odds.ts";
import { buildSlips, type BuiltSlip, type SlipSelection } from "../../domain/slip-builder.ts";
import { slipCohortRules } from "../../domain/slip-cohort.ts";
import { indexSlipResults, slipSelectionSnapshotSchema, slipSnapshotRules, slipSnapshotSchema, type SlipResult } from "../../domain/slip-snapshot.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { fourDigitYearInstant as instant } from "../shared/utc-instant.ts";
import { sealBestSlipStudyCapture, sealBestSlipStudyReceipt } from "./best-slip-study-contract.ts";
import { evaluateBestSlipStudy } from "./best-slip-study-evaluation.ts";
import { gradeBestSlipStudySlate } from "./best-slip-study-results.ts";

const historicalBand = defaultBestSlipOddsBand;
const historicalLegs = 4;
const observationOffset = (6 * 60 + 30) * 60_000;
const captureVersion = "best-slips-historical-capture-v1";
const receiptVersion = "best-slips-historical-receipt-v1";
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const countSchema = z.number().int().nonnegative().max(slipCohortRules.maximumRecords);
const proofTimes = { kickoffObservedAt: instant, forecastRecordedAt: instant, quoteRecordedAt: instant, cutoffAt: instant };
const proofSchema = z.strictObject({ fixtureId: z.uuid(), bookmakerId: z.number().int().positive(), ...proofTimes });
const offerSchema = z.strictObject({
  selection: slipSelectionSnapshotSchema.transform(value => value as SlipSelection), ...proofTimes,
});
const captureSchema = z.strictObject({
  version: z.literal(captureVersion), day: z.string(), observedAt: instant, reconstructedAt: instant,
  scopeHash: hashSchema, examined: countSchema, eligible: countSchema,
  partialCoverage: z.boolean(), searchLimited: z.boolean(),
  slates: z.array(z.strictObject({
    band: z.literal(historicalBand), slip: slipSnapshotSchema.transform(value => value as BuiltSlip),
  })).max(dailyBestSlipBandLimit),
  proofs: z.array(proofSchema).max(dailyBestSlipBandLimit * historicalLegs),
});
const receiptSchema = z.strictObject({
  version: z.literal(receiptVersion), captureHash: hashSchema, availableAt: instant, recordedAt: instant,
  outcomes: z.array(z.strictObject({
    slipId: z.string().min(1).max(slipSnapshotRules.maximumIdentityLength),
    outcome: z.enum(["won", "lost", "void", "pending", "unavailable"]),
  })).max(dailyBestSlipBandLimit),
});

type OfferClocks = Readonly<{ kickoffObservedAt: number; forecastRecordedAt: number; quoteRecordedAt: number; cutoffAt: number }>;
type HistoricalOffer = Readonly<{ selection: SlipSelection } & OfferClocks>;
export type BestSlipHistoricalDayInput = Readonly<{
  day: string; observedAt: number; examined: number; partialCoverage: boolean;
  searchLimited: boolean; offers: readonly HistoricalOffer[];
}>;
type HistoricalCaptureBody = z.infer<typeof captureSchema>;
type HistoricalReceiptBody = z.infer<typeof receiptSchema>;
export type BestSlipHistoricalCapture = Readonly<HistoricalCaptureBody & { hash: string }>;
export type BestSlipHistoricalReceipt = Readonly<HistoricalReceiptBody & { hash: string }>;

const invalid = () => new RangeError("Invalid Best Slips historical day, clock or evidence membership.");

/** Fixed before the retrospective read so fixture and result availability cannot move the decision time. */
export function bestSlipHistoricalObservationAt(day: string) {
  return utcInstantFromEpochMilliseconds(getReportingDayBounds(parseReportingDate(day)).startInclusive + observationOffset);
}

function offerAvailable(selection: SlipSelection, times: OfferClocks, day: string, at: number) {
  const { forecast, offer, source, family } = selection;
  const kickoff = utcInstantFromEpochMilliseconds(selection.kickoffAt);
  return forecast !== undefined && offer !== undefined && source === "local-engine"
    && isMarketFamily(family) && publicPolicy.markets.includes(family)
    && getReportingDate(kickoff) === day && times.kickoffObservedAt <= at
    && times.cutoffAt <= getPublicationDeadline(kickoff) && at < times.cutoffAt
    && forecast.publishedAt <= times.forecastRecordedAt && times.forecastRecordedAt <= at
    && offer.observedAt <= offer.checkedAt && offer.checkedAt <= times.quoteRecordedAt && times.quoteRecordedAt <= at
    && at - offer.observedAt <= preMatchReferenceOddsFreshMs
    && (offer.providerUpdatedAt === null || (offer.providerUpdatedAt <= offer.checkedAt
      && at - offer.providerUpdatedAt <= preMatchReferenceOddsFreshMs));
}

function studyProjection({ day, observedAt, reconstructedAt, scopeHash, examined, eligible, partialCoverage, searchLimited,
  slates, proofs }: HistoricalCaptureBody) {
  if (observedAt !== bestSlipHistoricalObservationAt(day) || observedAt >= reconstructedAt) throw invalid();
  const byFixture = new Map(proofs.map((proof) => [proof.fixtureId, proof]));
  const selections = slates.flatMap(({ slip }) => slip.selections);
  if (byFixture.size !== proofs.length || selections.length !== proofs.length ||
    slates.some(({ slip }) => slip.selections.length !== historicalLegs) || selections.some((selection) => {
      const proof = byFixture.get(selection.fixtureId);
      return !proof || proof.bookmakerId !== selection.bookmaker?.id || !offerAvailable(selection, proof, day, observedAt);
    })) throw invalid();
  // This projection lives only inside historical analysis. Its observation clock anchors the two study windows.
  return sealBestSlipStudyCapture({
    scopeHash, observedAt, capturedAt: observedAt, examined, eligible, partialCoverage, searchLimited, slates,
  });
}

function checkedCapture(value: unknown) {
  const { hash, ...body } = captureSchema.extend({ hash: hashSchema }).parse(value);
  if (evidenceFingerprint(body) !== hash) throw invalid();
  return { hash, body, projection: studyProjection(body) };
}

function validOffers(input: BestSlipHistoricalDayInput) {
  const offers = new Map<string, z.infer<typeof offerSchema>>();
  const original = new Map<string, string>(), ambiguous = new Set<string>();
  for (const value of input.offers) {
    const parsed = offerSchema.safeParse(value);
    if (!parsed.success) continue;
    const { selection, ...proof } = parsed.data;
    if (!offerAvailable(selection, proof, input.day, input.observedAt)) continue;
    const { fixtureId, bookmaker, offer, kickoffAt, forecast, source, family, probability } = selection;
    if (!bookmaker || !offer) continue;
    // A fixture may have several books for the same verified pick. Conflicting picks or duplicate books are ambiguous.
    const identity = evidenceFingerprint({ kickoffAt, forecast, source, family, selection: selection.selection, probability,
      homeTeamId: selection.homeTeam.id, awayTeamId: selection.awayTeam.id, competitionId: selection.competition.id,
      kickoffObservedAt: proof.kickoffObservedAt, forecastRecordedAt: proof.forecastRecordedAt, cutoffAt: proof.cutoffAt });
    const key = `${fixtureId}:${bookmaker.id}`, previous = original.get(fixtureId);
    if ((previous && previous !== identity) || offers.has(key)) ambiguous.add(fixtureId);
    original.set(fixtureId, identity);
    offers.set(key, parsed.data);
  }
  return [...offers.values()].filter(({ selection }) => !ambiguous.has(selection.fixtureId));
}

export function buildBestSlipHistoricalSlates(input: BestSlipHistoricalDayInput,
  { scopeHash, reconstructedAt }: Readonly<{ scopeHash: string; reconstructedAt: number }>): BestSlipHistoricalCapture {
  if (input.observedAt !== bestSlipHistoricalObservationAt(input.day) || input.observedAt >= reconstructedAt) throw invalid();
  const offers = validOffers(input);
  const selections = offers.map(({ selection }) => selection);
  const proofBySelection = new Map(offers.map((entry) => [entry.selection, entry]));
  const result = buildSlips({ ...bestSlipDailyCriteria(input.day, historicalBand), teamsMin: historicalLegs,
    teamsMax: historicalLegs }, [], input.observedAt, {
    accepts: (slip) => new Set(slip.selections.flatMap(({ homeTeam, awayTeam }) => [homeTeam.id, awayTeam.id])).size === historicalLegs * 2,
    compare: (left, right) => left.id < right.id ? -1 : Number(left.id > right.id),
  }, { editorial: { selections, combinationIdentity: bestSlipCombinationIdentity,
    exclusiveMaximum: bestSlipExactRange(historicalBand).exclusiveMaximum } });
  const slates = result.slips.map((slip) => ({ band: historicalBand, slip: { ...slip, id: bestSlipCombinationIdentity(slip.selections) } }));
  const proofs = result.slips.flatMap((slip) => slip.selections.map((selection) => {
    const proof = proofBySelection.get(selection);
    if (!proof || !selection.bookmaker) throw invalid();
    const { kickoffObservedAt, forecastRecordedAt, quoteRecordedAt, cutoffAt } = proof;
    return { fixtureId: selection.fixtureId, bookmakerId: selection.bookmaker.id, kickoffObservedAt, forecastRecordedAt, quoteRecordedAt, cutoffAt };
  }));
  const body = captureSchema.parse({ version: captureVersion, day: input.day, observedAt: input.observedAt, reconstructedAt,
    scopeHash, examined: input.examined, eligible: new Set(selections.map(({ fixtureId }) => fixtureId)).size,
    partialCoverage: input.partialCoverage, searchLimited: input.searchLimited || result.searchLimited, slates, proofs });
  studyProjection(body);
  return freezeEvidence({ ...body, hash: evidenceFingerprint(body) });
}

export function gradeBestSlipHistoricalDay(capture: BestSlipHistoricalCapture,
  { availableAt, recordedAt, results }: Readonly<{ availableAt: number; recordedAt: number; results: readonly SlipResult[] }>): BestSlipHistoricalReceipt {
  const { hash, body: historical } = checkedCapture(capture);
  if (availableAt <= historical.observedAt || availableAt > recordedAt || historical.reconstructedAt > recordedAt) throw invalid();
  const candidates = indexSlipResults(results);
  const body = receiptSchema.parse({ version: receiptVersion, captureHash: hash, availableAt, recordedAt,
    outcomes: historical.slates.map(({ slip }) => ({ slipId: slip.id, outcome: slip.selections.some(({ kickoffAt }) => kickoffAt >= availableAt)
      ? "pending" : gradeBestSlipStudySlate(slip, candidates(slip)) })) });
  return freezeEvidence({ ...body, hash: evidenceFingerprint(body) });
}

/** Compare only verified as-of samples and keep their retrospective provenance separate from live captures. */
export function evaluateBestSlipHistoricalStudy(input: Readonly<{
  captures: readonly unknown[]; receipts: readonly unknown[]; scopeHash: string;
  windows: Readonly<{ fitFrom: string; fitUntil: string; holdoutFrom: string; holdoutUntil: string }>; assessedAt: number;
}>) {
  const { captures, receipts, assessedAt, ...criteria } = input;
  const byCapture = new Map<string, ReturnType<typeof checkedCapture>>();
  for (const value of captures) {
    const capture = checkedCapture(value);
    if (capture.body.reconstructedAt > assessedAt || byCapture.has(capture.hash)) throw invalid();
    byCapture.set(capture.hash, capture);
  }
  const receiptHashes: string[] = [];
  const projections = receipts.map((value) => {
    const { hash, ...body } = receiptSchema.extend({ hash: hashSchema }).parse(value);
    const capture = byCapture.get(body.captureHash);
    if (!capture || body.availableAt <= capture.body.observedAt || body.availableAt > body.recordedAt ||
      body.recordedAt < capture.body.reconstructedAt || body.recordedAt > assessedAt || evidenceFingerprint(body) !== hash) throw invalid();
    receiptHashes.push(hash);
    return sealBestSlipStudyReceipt({ captureHash: capture.projection.hash, observedAt: body.availableAt, outcomes: body.outcomes });
  });
  const comparison = evaluateBestSlipStudy({ ...criteria, assessedAt,
    captures: [...byCapture.values()].map(({ projection }) => projection), receipts: projections });
  const body = { version: "best-slips-historical-evaluation-v1", provenance: "retrospective-point-in-time",
    approvedForPublication: false as const, status: comparison.status, comparison,
    historicalEvidenceHash: evidenceFingerprint([[...byCapture.keys()].sort(), receiptHashes.sort()]) };
  return freezeEvidence({ ...body, hash: evidenceFingerprint(body) });
}
