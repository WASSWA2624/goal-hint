import "server-only";

import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import { decideLocalFeaturedPick } from "../../domain/local-featured-decision.ts";
import { collectUpcomingLocalFeaturedCandidates } from "../matches/upcoming-featured-pick.ts";
import { frozenLocalFeaturedPickSchema, type FrozenLocalFeaturedPick } from "../matches/frozen-featured-picks.ts";
import { storedCutoffFeaturedBookmakerQuotes } from "../odds/odds-mysql-store.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { readFeaturedGoalMarkets } from "./extended-market-read.ts";
import type { StoredRevision } from "./history-contract.ts";

export type CutoffFeaturedOptions = Readonly<{ extendedMarkets: boolean; oddsPermitted(): boolean }>;
type FixtureOccurrence = Readonly<{ id: string; kickoff: Date | null; homeTeamId: string; awayTeamId: string }>;

export async function freezeCutoffLocalFeaturedPick(tx: Prisma.TransactionClient, fixture: FixtureOccurrence,
  revision: StoredRevision, effectiveCloseAt: UtcInstant, auditedAt: UtcInstant,
  { extendedMarkets, oddsPermitted }: CutoffFeaturedOptions): Promise<FrozenLocalFeaturedPick | null> {
  const { kickoff, homeTeamId, awayTeamId } = fixture;
  const { kickoffAt, home, away } = revision.candidate.context.context;
  const beforeCutoff = effectiveCloseAt - 1;
  if (!kickoff || kickoff.getTime() !== kickoffAt || homeTeamId !== home.teamId || awayTeamId !== away.teamId ||
    beforeCutoff < revision.publishedAt || beforeCutoff >= kickoffAt) return null;
  const decisionAt = utcInstantFromEpochMilliseconds(beforeCutoff);
  const markets = Object.values(revision.candidate.markets).flatMap((entry) => entry.available ? [entry] : []);
  const goals = extendedMarkets ? (await readFeaturedGoalMarkets(tx, [revision.id])).get(revision.id) : undefined;
  const candidates = collectUpcomingLocalFeaturedCandidates({ markets }, goals);
  if (candidates === null) return null;
  const quotesPermitted = oddsPermitted();
  const quotes = quotesPermitted ? await storedCutoffFeaturedBookmakerQuotes(tx,
    { fixtureId: fixture.id, kickoffAt, decisionAt }, auditedAt) : undefined;
  const decision = decideLocalFeaturedPick({ fixtureId: fixture.id, kickoffAt, decisionAt,
    outcomes: candidates.map(({ outcome }) => outcome), quotes, quotesPermitted });
  return frozenLocalFeaturedPickSchema.parse({ fixtureId: fixture.id, cycleId: revision.cycleId, revisionId: revision.id,
    homeTeamId, awayTeamId, kickoffAt, decisionAt, decision });
}
