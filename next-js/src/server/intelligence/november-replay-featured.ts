import "server-only";

import { decideLocalFeaturedPick, localFeaturedDecisionVersion, type LocalFeaturedDecision } from "../../domain/local-featured-decision.ts";
import { inclusiveReplayEvidenceCutoff } from "../../domain/november-replay.ts";
import type { GoalGrade } from "../../domain/score-distribution-markets.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { storedPointInTimeFeaturedBookmakerQuotes } from "../odds/odds-mysql-store.ts";
import { publicOddsEnabled } from "../odds/public-odds-policy.ts";
import { loadNovemberReplayEvidenceInTransaction, type NovemberReplayOccurrence,
  type NovemberReplayTrainingMembership } from "./november-replay-evidence.ts";
import { buildArchivedNovemberReplayMarkets, buildNovemberReplayMarkets } from "./november-replay-model.ts";

type ReplayDecisionVersion = LocalFeaturedDecision["version"];
type ReplayPricingMarket = Readonly<{ definition: { key: string };
  selections: readonly { key: string; outcomes: Readonly<Record<GoalGrade, number>> }[];
  unrepresentedProbability?: number }>;

export async function loadNovemberReplayPrices(tx: Prisma.TransactionClient, fixture: Readonly<{
  fixtureId: string; kickoffAt: number; decisionAt: number;
}>, auditedAt: number, markets: readonly ReplayPricingMarket[]) {
  const quotesPermitted = publicOddsEnabled();
  const quotes = quotesPermitted ? (await storedPointInTimeFeaturedBookmakerQuotes(tx, [fixture], auditedAt)).get(fixture.fixtureId) : null;
  const input = {
    ...fixture, quotes, quotesPermitted,
    outcomes: markets.flatMap(({ definition, selections, unrepresentedProbability }) => selections.map(({ key: selection, outcomes }) => ({
      marketKey: definition.key, selection, settlementProbabilities: outcomes, unrepresentedProbability: unrepresentedProbability ?? 0,
    }))),
  };
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
  comparisonVersion?: ReplayDecisionVersion) {
  const loadedEvidence = await loadNovemberReplayEvidenceInTransaction(tx, occurrence, auditedAt, training, true);
  const evidence = occurrence.originalRevisionId === null ? Object.freeze({ ...loadedEvidence,
    cutoffAt: inclusiveReplayEvidenceCutoff(loadedEvidence.cutoffAt, loadedEvidence.decisionAt) }) : loadedEvidence;
  const archived = evidence.archivedDecision && buildArchivedNovemberReplayMarkets(evidence.archivedDecision);
  const rebuilt = evidence.forecast && buildNovemberReplayMarkets(evidence.forecast);
  const markets = archived?.length ? archived : rebuilt?.markets;
  const artifactHash = evidence.archivedDecision?.hash ?? evidence.forecast?.hash;
  const { decisionAt } = evidence;
  if (evidence.status !== "qualified" || !markets?.length || !artifactHash || decisionAt === undefined)
    return { evidence, result: null, comparativeDecision: null };
  const { fixtureId, kickoffAt } = occurrence;
  const assess = await loadNovemberReplayPrices(tx, { fixtureId, kickoffAt, decisionAt }, auditedAt, markets);
  const featuredDecision = assess(version);
  return { evidence, result: { artifactHash, markets, selected: replayFeaturedSelection(featuredDecision), decisionAt, featuredDecision },
    comparativeDecision: comparisonVersion ? assess(comparisonVersion) : null };
}
