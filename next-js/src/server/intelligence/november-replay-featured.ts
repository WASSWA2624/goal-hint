import "server-only";

import { getPublicationDeadline, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { auditLocalFeaturedCoverage } from "../../domain/local-featured-coverage.ts";
import { assessLocalFeaturedPick, decideLocalFeaturedPick, localFeaturedDecisionVersion, type LocalFeaturedDecision } from "../../domain/local-featured-decision.ts";
import { inclusiveReplayEvidenceCutoff } from "../../domain/november-replay.ts";
import type { GoalGrade } from "../../domain/score-distribution-markets.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { hasRetainedPreMatchQuoteCandidates, storedPointInTimeFeaturedBookmakerQuotes } from "../odds/odds-mysql-store.ts";
import { publicOddsEnabled } from "../odds/public-odds-policy.ts";
import { loadNovemberReplayEvidenceInTransaction, type NovemberReplayOccurrence,
  type NovemberReplayTrainingMembership } from "./november-replay-evidence.ts";
import { buildArchivedNovemberReplayMarkets, buildNovemberReplayMarkets } from "./november-replay-model.ts";

type ReplayDecisionVersion = LocalFeaturedDecision["version"];
type ReplayPricingMarket = Readonly<{ definition: { key: string };
  selections: readonly { key: string; outcomes: Readonly<Record<GoalGrade, number>> }[];
  unrepresentedProbability?: number }>;

type PricingOccurrence = Readonly<{ fixtureId: string; kickoffAt: number; decisionAt: number }>;

async function loadPricingInput(tx: Prisma.TransactionClient, fixture: PricingOccurrence, auditedAt: number,
  markets: readonly ReplayPricingMarket[], inventoryAllMarkets = false) {
  const quotesPermitted = publicOddsEnabled();
  const hasCandidates = quotesPermitted && (markets.length > 0 || inventoryAllMarkets &&
    await hasRetainedPreMatchQuoteCandidates(tx, fixture.fixtureId, fixture.decisionAt, auditedAt));
  const quotes = hasCandidates ? (await storedPointInTimeFeaturedBookmakerQuotes(tx, [fixture], auditedAt, inventoryAllMarkets)).get(fixture.fixtureId) : null;
  return {
    ...fixture, quotes, quotesPermitted,
    outcomes: markets.flatMap(({ definition, selections, unrepresentedProbability }) => selections.map(({ key: selection, outcomes }) => ({
      marketKey: definition.key, selection, settlementProbabilities: outcomes, unrepresentedProbability: unrepresentedProbability ?? 0,
    }))),
  };
}

export async function loadNovemberReplayPrices(tx: Prisma.TransactionClient, fixture: PricingOccurrence,
  auditedAt: number, markets: readonly ReplayPricingMarket[]) {
  const input = await loadPricingInput(tx, fixture, auditedAt, markets);
  return (version: ReplayDecisionVersion) => decideLocalFeaturedPick(input, version);
}

export function replayFeaturedSelection(decision: LocalFeaturedDecision) {
  return decision.status === "abstained" ? null :
    { marketKey: decision.marketKey, selection: decision.selection, probability: decision.probability };
}

export function replayFeaturedMode(decision: LocalFeaturedDecision) {
  return decision.status === "priced" ? decision.tier ?? "standard" : decision.status;
}

/** The policy version and rung are private; they do not change the displayed outcome. */
export function sameReplayFeaturedDisplay(before: LocalFeaturedDecision, after: LocalFeaturedDecision) {
  if (before.status === "abstained" || after.status === "abstained") return before.status === after.status;
  if (replayFeaturedMode(before) !== replayFeaturedMode(after) || before.marketKey !== after.marketKey ||
    before.selection !== after.selection || before.probability !== after.probability) return false;
  return before.status !== "priced" || after.status !== "priced" ||
    before.quote.decimal === after.quote.decimal && before.quote.bookmakerId === after.quote.bookmakerId;
}

export function sameLegacyReplaySelection(before: ReturnType<typeof replayFeaturedSelection>, after: LocalFeaturedDecision) {
  return before === null ? after.status === "abstained" : after.status !== "abstained" &&
    before.marketKey === after.marketKey && before.selection === after.selection && before.probability === after.probability;
}

export async function preparePricedNovemberReplay(tx: Prisma.TransactionClient, occurrence: NovemberReplayOccurrence,
  auditedAt: number, training?: NovemberReplayTrainingMembership, version: ReplayDecisionVersion = localFeaturedDecisionVersion,
  comparisonVersion?: ReplayDecisionVersion, coverage?: "counts" | "trace") {
  const withCoverage = coverage !== undefined;
  const loadedEvidence = await loadNovemberReplayEvidenceInTransaction(tx, occurrence, auditedAt, training, true, withCoverage);
  const evidence = occurrence.originalRevisionId === null ? Object.freeze({ ...loadedEvidence,
    cutoffAt: inclusiveReplayEvidenceCutoff(loadedEvidence.cutoffAt, loadedEvidence.decisionAt) }) : loadedEvidence;
  const archived = evidence.archivedDecision && buildArchivedNovemberReplayMarkets(evidence.archivedDecision);
  const rebuilt = evidence.forecast && buildNovemberReplayMarkets(evidence.forecast);
  const markets = archived?.length ? archived : rebuilt?.markets;
  const artifactHash = evidence.archivedDecision?.hash ?? evidence.forecast?.hash;
  const { decisionAt } = evidence;
  const { fixtureId, kickoffAt } = occurrence;
  if (evidence.status !== "qualified" || !markets?.length || !artifactHash || decisionAt === undefined) {
    const catalogOnlyAt = decisionAt ?? getPublicationDeadline(utcInstantFromEpochMilliseconds(kickoffAt)) - 1;
    const diagnostic = withCoverage && occurrence.applicable && kickoffAt <= auditedAt && evidence.status !== "prospective"
      ? auditLocalFeaturedCoverage(await loadPricingInput(tx, { fixtureId, kickoffAt, decisionAt: catalogOnlyAt }, auditedAt, [], true), coverage === "trace") : null;
    return { evidence, result: null, comparativeDecision: null, diagnostic, priceGates: null,
      inventoryClock: diagnostic ? decisionAt ?? null : null };
  }
  const occurrenceAtDecision = { fixtureId, kickoffAt, decisionAt };
  // The broader catalog scan may see unrelated receipt accounts and offers. Keep the
  // exact selector input identical to the read used for activation revalidation.
  const input = await loadPricingInput(tx, occurrenceAtDecision, auditedAt, markets);
  const diagnostic = withCoverage ? auditLocalFeaturedCoverage(
    await loadPricingInput(tx, occurrenceAtDecision, auditedAt, markets, true), coverage === "trace") : null;
  const { decision: featuredDecision, diagnostics: priceGates } = assessLocalFeaturedPick(input, version);
  return { evidence, result: { artifactHash, markets, selected: replayFeaturedSelection(featuredDecision), decisionAt, featuredDecision },
    comparativeDecision: comparisonVersion ? decideLocalFeaturedPick(input, comparisonVersion) : null, diagnostic, priceGates,
    inventoryClock: diagnostic ? decisionAt : null };
}
