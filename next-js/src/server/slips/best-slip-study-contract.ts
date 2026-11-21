import "server-only";

import { z } from "zod";
import { bestSlipCombinationIdentity, bestSlipExactTotal } from "../../domain/best-slips.ts";
import { bestSlipExactRange, bestSlipOddsBands, dailyBestSlipBandLimit } from "../../domain/best-slip-odds-bands.ts";
import { getPublicationDeadline, getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { BuiltSlip } from "../../domain/slip-builder.ts";
import { slipCohortRules } from "../../domain/slip-cohort.ts";
import { slipSnapshotRules, slipSnapshotSchema } from "../../domain/slip-snapshot.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";

const legacyCaptureVersion = "best-slips-study-capture-v1";
const captureVersion = "best-slips-study-capture-v2";
const legacyMinimumPickProbability = 0.75;
const receiptVersion = "best-slips-study-receipt-v1";
const instant = z.number().int().positive().max(253_402_300_799_999);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const band = z.enum(bestSlipOddsBands.map(({ id }) => id));
const maxSlates = bestSlipOddsBands.length * dailyBestSlipBandLimit;
const slipId = z.string().min(1).max(slipSnapshotRules.maximumIdentityLength);
const captureSchema = z.strictObject({
  version: z.literal([legacyCaptureVersion, captureVersion]),
  observedAt: instant,
  capturedAt: instant,
  scopeHash: hashSchema,
  examined: z.number().int().min(0).max(slipCohortRules.maximumRecords),
  eligible: z.number().int().min(0).max(slipCohortRules.maximumRecords),
  searchLimited: z.boolean(),
  partialCoverage: z.boolean(),
  slates: z.array(z.strictObject({ band, slip: slipSnapshotSchema.transform(slip => slip as BuiltSlip) })).max(maxSlates),
});
const receiptSchema = z.strictObject({
  version: z.literal(receiptVersion),
  captureHash: hashSchema,
  observedAt: instant,
  outcomes: z.array(z.strictObject({ slipId, outcome: z.enum(["won", "lost", "void", "pending", "unavailable"]) })).max(maxSlates),
});
type CaptureBody = Readonly<Omit<z.infer<typeof captureSchema>, "slates"> & {
  slates: readonly Readonly<z.infer<typeof captureSchema>["slates"][number]>[];
}>;
type ReceiptBody = Readonly<Omit<z.infer<typeof receiptSchema>, "outcomes"> & {
  outcomes: readonly Readonly<z.infer<typeof receiptSchema>["outcomes"][number]>[];
}>;
export type BestSlipStudyCapture = CaptureBody & Readonly<{ hash: string }>;
export type BestSlipStudyReceipt = ReceiptBody & Readonly<{ hash: string }>;
export type BestSlipStudyOutcome = ReceiptBody["outcomes"][number]["outcome"];

function checkCapture(capture: CaptureBody) {
  const at = utcInstantFromEpochMilliseconds(capture.capturedAt);
  const day = getReportingDate(at);
  if (capture.capturedAt < capture.observedAt || getReportingDate(utcInstantFromEpochMilliseconds(capture.observedAt)) !== day
    || capture.eligible > capture.examined) throw new RangeError("Incoherent Best Slips observation clock or cohort.");
  const seenFixtures = new Set<string>(), seenSlips = new Set<string>(), perBand = new Map<string, number>();
  for (const { band, slip } of capture.slates) {
    const count = (perBand.get(band) ?? 0) + 1;
    perBand.set(band, count);
    if (count > dailyBestSlipBandLimit || slip.id !== bestSlipCombinationIdentity(slip.selections) ||
      seenSlips.has(slip.id) || slip.selections.length < 2 || slip.selections.length > 8) {
      throw new RangeError("Incoherent Best Slips study slate.");
    }
    seenSlips.add(slip.id);
    const teams = new Set<string>(), bookmakerId = slip.selections[0]?.bookmaker?.id;
    for (const selection of slip.selections) {
      const { kickoffAt, offer, forecast, probability, homeTeam, awayTeam } = selection;
      const kickoff = utcInstantFromEpochMilliseconds(kickoffAt);
      if (seenFixtures.has(selection.fixtureId) || teams.has(homeTeam.id) || teams.has(awayTeam.id) || homeTeam.id === awayTeam.id ||
        !offer || !forecast || selection.source !== "local-engine" || !bookmakerId || offer.bookmakerId !== bookmakerId ||
        selection.bookmaker?.id !== bookmakerId || selection.oddsBasis !== "bookmaker" ||
        (capture.version === legacyCaptureVersion && probability < legacyMinimumPickProbability) ||
        forecast.publishedAt > capture.observedAt || offer.checkedAt > capture.observedAt ||
        at >= getPublicationDeadline(kickoff) || getReportingDate(kickoff) !== day) {
        throw new RangeError("Best Slips study requires exact original pre-cutoff picks and prices.");
      }
      seenFixtures.add(selection.fixtureId);
      teams.add(homeTeam.id);
      teams.add(awayTeam.id);
    }
    const { product, denominator } = bestSlipExactTotal(slip.selections);
    const range = bestSlipExactRange(band), scaled = product * 100n;
    const upper = BigInt(range.maximum) * denominator;
    const rounded = (scaled * 2n + denominator) / (denominator * 2n);
    const average = slip.selections.reduce((sum, selection) => sum + selection.probability, 0) / slip.selections.length;
    if (slip.oddsBasis !== "bookmaker" || scaled < BigInt(range.minimum) * denominator ||
      (range.exclusiveMaximum ? scaled >= upper : scaled > upper) ||
      rounded !== BigInt(slip.totalOdds.replace(".", "")) ||
      Math.abs(average - slip.averageProbability) > Number.EPSILON * slip.selections.length * 2) {
      throw new RangeError("Best Slips study odds do not match the original legs.");
    }
  }
  if (seenFixtures.size > capture.eligible) throw new RangeError("Best Slips study slate exceeds measured eligibility.");
}

export function sealBestSlipStudyCapture(input: Omit<CaptureBody, "version">): BestSlipStudyCapture {
  const body = captureSchema.parse({ ...input, version: captureVersion });
  checkCapture(body);
  return freezeEvidence({ ...body, hash: evidenceFingerprint(body) });
}

export function parseBestSlipStudyCapture(input: unknown): BestSlipStudyCapture {
  const { hash, ...body } = captureSchema.extend({ hash: hashSchema }).parse(input);
  checkCapture(body);
  if (evidenceFingerprint(body) !== hash) throw new RangeError("Best Slips capture seal mismatch.");
  return freezeEvidence({ ...body, hash });
}

function checkReceipt(body: ReceiptBody) {
  if (new Set(body.outcomes.map(({ slipId }) => slipId)).size !== body.outcomes.length)
    throw new RangeError("Duplicate Best Slips study outcome.");
}

export function sealBestSlipStudyReceipt(input: Omit<ReceiptBody, "version">): BestSlipStudyReceipt {
  const body = receiptSchema.parse({ ...input, version: receiptVersion });
  checkReceipt(body);
  return freezeEvidence({ ...body, hash: evidenceFingerprint(body) });
}

export function parseBestSlipStudyReceipt(input: unknown): BestSlipStudyReceipt {
  const { hash, ...body } = receiptSchema.extend({ hash: hashSchema }).parse(input);
  checkReceipt(body);
  if (evidenceFingerprint(body) !== hash) throw new RangeError("Best Slips study outcome seal mismatch.");
  return freezeEvidence({ ...body, hash });
}
