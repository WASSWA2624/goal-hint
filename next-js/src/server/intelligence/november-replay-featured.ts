import "server-only";

import { decideLocalFeaturedPick } from "../../domain/local-featured-decision.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { storedPointInTimeFeaturedBookmakerQuotes } from "../odds/odds-mysql-store.ts";
import { publicOddsEnabled } from "../odds/public-odds-policy.ts";
import { loadNovemberReplayEvidenceInTransaction, type NovemberReplayOccurrence,
  type NovemberReplayTrainingMembership } from "./november-replay-evidence.ts";
import { buildArchivedNovemberReplayMarkets, buildNovemberReplayMarkets } from "./november-replay-model.ts";

export async function preparePricedNovemberReplay(tx: Prisma.TransactionClient, occurrence: NovemberReplayOccurrence,
  auditedAt: number, training?: NovemberReplayTrainingMembership) {
  const evidence = await loadNovemberReplayEvidenceInTransaction(tx, occurrence, auditedAt, training, true);
  const archived = evidence.archivedDecision && buildArchivedNovemberReplayMarkets(evidence.archivedDecision);
  const rebuilt = evidence.forecast && buildNovemberReplayMarkets(evidence.forecast);
  const markets = archived?.length ? archived : rebuilt?.markets;
  const artifactHash = evidence.archivedDecision?.hash ?? evidence.forecast?.hash;
  const { decisionAt } = evidence;
  if (evidence.status !== "qualified" || !markets?.length || !artifactHash || decisionAt === undefined)
    return { evidence, result: null };
  const { fixtureId, kickoffAt } = occurrence;
  const quotesPermitted = publicOddsEnabled();
  const quotes = quotesPermitted ? (await storedPointInTimeFeaturedBookmakerQuotes(tx, [{ fixtureId, kickoffAt, decisionAt }], auditedAt)).get(fixtureId) : null;
  const featuredDecision = decideLocalFeaturedPick({
    fixtureId, kickoffAt, decisionAt, quotes, quotesPermitted,
    outcomes: markets.flatMap(({ definition, selections, ...market }) => selections.map(({ key: selection, outcomes }) => ({
      marketKey: definition.key, selection, settlementProbabilities: outcomes,
      unrepresentedProbability: "unrepresentedProbability" in market ? Number(market.unrepresentedProbability) : 0,
    }))),
  });
  const selected = featuredDecision.status === "priced" ? {
    marketKey: featuredDecision.marketKey, selection: featuredDecision.selection, probability: featuredDecision.probability,
  } : null;
  return { evidence, result: { artifactHash, markets, selected, decisionAt, featuredDecision } };
}
