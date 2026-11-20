import "server-only";

import { nonGoalMarketDefinitionSchema, type NonGoalMarketDefinition } from "../../domain/non-goal-market-definitions.ts";
import { settleNonGoalSelection, type NonGoalSettlementContext } from "../../domain/non-goal-market-settlement.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { provenTrue } from "../shared/authority-proof.ts";
import type { IntelligenceFixture } from "./intelligence-contract.ts";

export const INDEPENDENT_MARKET_EVIDENCE_VERSION = "independent-market-evidence-v1";

type Observation = Readonly<{ fixtureId: string; availableAt: number; observationHash: string; evidenceRef: string }>;
type PlayerObservation = Observation & Readonly<{ playerId: number; teamId: string }>;
export type PlayerLineupEvidence = PlayerObservation & Readonly<{ kind: "lineup"; role: "starting" | "substitute" }>;
export type PlayerAvailabilityEvidence = PlayerObservation & Readonly<{ kind: "availability"; status: "available" | "unavailable" }>;
export type PlayerContributionEvidence = PlayerObservation & Readonly<{
  kind: "match-contribution"; competitionId: string; opponentId: string; kickoffAt: number;
  period: "regulation-including-stoppage-time"; minutes: number; goals: number; penaltyGoals: number | null;
}>;
export type ScorerEnvironmentEvidence = Observation & Readonly<{
  kind: "scoring-environment"; teamId: string; opponentId: string; modelHash: string; expectedTeamGoals: number;
}>;
export type NonGoalModelHistory = Observation & Readonly<{
  kind: "non-goal-result"; competitionId: string; kickoffAt: number; settlement: NonGoalSettlementContext;
}>;
export type ScorerEvidence = PlayerLineupEvidence | PlayerAvailabilityEvidence | PlayerContributionEvidence | ScorerEnvironmentEvidence;

export type ParticipationState = "confirmed-starter" | "confirmed-bench" | "unconfirmed" | "unavailable" | "conflicting";
type ScorerReason = "invalid-scorer-request" | "conflicting-participation" | "unconfirmed-participation" | "player-unavailable" |
  "missing-qualified-participation-model" | "missing-current-team-player-history" | "missing-qualified-scoring-environment" |
  "no-qualified-player-scorer-model" | "no-qualified-scorer-order-model";
type StatisticReason = "invalid-statistic-request" | "missing-verified-period-count-history" | "missing-complete-period-event-history" |
  "no-qualified-statistic-model" | "no-qualified-event-model" | "no-qualified-event-order-model";

const validPlayer = (id: number) => Number.isSafeInteger(id) && id > 0;
const validCount = (count: number) => Number.isSafeInteger(count) && count >= 0;
const validHash = (hash: string) => typeof hash === "string" && /^[a-f0-9]{64}$/u.test(hash);
function validTarget(fixture: IntelligenceFixture): boolean {
  return !!fixture.fixtureId && !!fixture.competitionId && !!fixture.homeTeamId && !!fixture.awayTeamId && fixture.homeTeamId !== fixture.awayTeamId &&
    Number.isSafeInteger(fixture.forecastAt) && Number.isSafeInteger(fixture.kickoffAt) && fixture.forecastAt < fixture.kickoffAt;
}
function knownAt(row: Observation, cutoff: number): boolean {
  return !!row.fixtureId && !!row.evidenceRef && Number.isSafeInteger(row.availableAt) && row.availableAt <= cutoff && validHash(row.observationHash);
}

function latest<Fact extends Observation>(rows: readonly Fact[]): { rows: readonly Fact[]; conflict: boolean } {
  const at = rows.reduce((time, row) => Math.max(time, row.availableAt), Number.NEGATIVE_INFINITY);
  const candidates = rows.filter((row) => row.availableAt === at);
  return { rows: candidates, conflict: new Set(candidates.map((row) => row.observationHash)).size > 1 };
}

function byFixture<Fact extends Observation>(rows: readonly Fact[]): Map<string, Fact[]> {
  const fixtures = new Map<string, Fact[]>();
  for (const row of rows) {
    const versions = fixtures.get(row.fixtureId) ?? [];
    versions.push(row);
    fixtures.set(row.fixtureId, versions);
  }
  return fixtures;
}

function verifiedContribution(row: PlayerContributionEvidence, input: Pick<ScorerCapabilityInput, "fixture" | "playerId">): boolean {
  return row.playerId === input.playerId && row.fixtureId !== input.fixture.fixtureId && !!row.competitionId && !!row.teamId && !!row.opponentId &&
    row.teamId !== row.opponentId && Number.isSafeInteger(row.kickoffAt) && row.kickoffAt < row.availableAt &&
    row.period === "regulation-including-stoppage-time" && validCount(row.minutes) && validCount(row.goals) && (row.minutes > 0 || row.goals === 0) &&
    (row.penaltyGoals === null || validCount(row.penaltyGoals) && row.penaltyGoals <= row.goals);
}

type ScorerCapabilityInput = Readonly<{
  fixture: IntelligenceFixture; teamId: string; playerId: number; order: "any" | "first" | "last";
  observations: readonly ScorerEvidence[]; verifyEvidence(row: ScorerEvidence): boolean;
}>;
export type ScorerCapability = Readonly<{
  version: typeof INDEPENDENT_MARKET_EVIDENCE_VERSION; status: "unavailable"; reasons: readonly ScorerReason[];
  participation: Readonly<{ state: ParticipationState; expectedMinutes: null }>;
  support: Readonly<{ currentTeamMatches: number; previousTeamMatches: number; recordedPenaltyMatches: number;
    conflictingMatches: number; scoringEnvironment: boolean; observationHashes: readonly string[] }>;
}>;

/** Reports the available inputs for a distinct player model. A verified lineup
 * identifies today's role. Expected minutes and scorer probabilities still need
 * separately fitted, prospectively qualified player artifacts. */
export function assessScorerCapability(input: ScorerCapabilityInput): ScorerCapability {
  const { fixture, teamId, playerId, order } = input;
  const opponentId = teamId === fixture.homeTeamId ? fixture.awayTeamId : teamId === fixture.awayTeamId ? fixture.homeTeamId : null;
  const valid = validTarget(fixture) && opponentId !== null && validPlayer(playerId) && ["any", "first", "last"].includes(order);
  const observations = valid ? input.observations.filter((row) => knownAt(row, fixture.forecastAt) && provenTrue(() => input.verifyEvidence(row))) : [];
  const lineup = latest(observations.filter((row): row is PlayerLineupEvidence => row.kind === "lineup" && row.fixtureId === fixture.fixtureId &&
    row.playerId === playerId && (row.teamId === teamId || row.teamId === opponentId) && ["starting", "substitute"].includes(row.role)));
  const availability = latest(observations.filter((row): row is PlayerAvailabilityEvidence => row.kind === "availability" && row.fixtureId === fixture.fixtureId &&
    row.playerId === playerId && row.teamId === teamId && ["available", "unavailable"].includes(row.status)));
  const role = lineup.rows[0], unavailable = availability.rows[0]?.status === "unavailable";
  let participation: ParticipationState = "unconfirmed";
  if (lineup.conflict || availability.conflict || role && (unavailable || role.teamId !== teamId)) participation = "conflicting";
  else if (unavailable) participation = "unavailable";
  else if (role) participation = role.role === "starting" ? "confirmed-starter" : "confirmed-bench";

  const playerHistory = byFixture(observations.filter((row): row is PlayerContributionEvidence =>
    row.kind === "match-contribution" && verifiedContribution(row, input)));
  const contributions: PlayerContributionEvidence[] = [];
  let conflictingMatches = 0;
  for (const observations of playerHistory.values()) {
    const current = latest(observations);
    if (current.conflict) { conflictingMatches++; continue; }
    const row = current.rows[0]!;
    if (row.competitionId === fixture.competitionId && row.minutes > 0) contributions.push(row);
  }
  const environment = latest(observations.filter((row): row is ScorerEnvironmentEvidence => row.kind === "scoring-environment" &&
    row.fixtureId === fixture.fixtureId && row.teamId === teamId && row.opponentId === opponentId && validHash(row.modelHash) &&
    Number.isFinite(row.expectedTeamGoals) && row.expectedTeamGoals >= 0));
  const scoringEnvironment = environment.rows.length > 0 && !environment.conflict;
  const currentTeamMatches = contributions.filter((row) => row.teamId === teamId).length;
  const reasons: ScorerReason[] = [];
  if (valid) {
    if (participation === "conflicting") reasons.push("conflicting-participation");
    if (participation === "unconfirmed") reasons.push("unconfirmed-participation");
    if (participation === "unavailable") reasons.push("player-unavailable");
    if (["confirmed-starter", "confirmed-bench"].includes(participation)) reasons.push("missing-qualified-participation-model");
    if (!currentTeamMatches) reasons.push("missing-current-team-player-history");
    if (!scoringEnvironment) reasons.push("missing-qualified-scoring-environment");
    reasons.push(order === "any" ? "no-qualified-player-scorer-model" : "no-qualified-scorer-order-model");
  } else reasons.push("invalid-scorer-request");
  const hashes = [...lineup.rows, ...availability.rows, ...contributions, ...(scoringEnvironment ? environment.rows : [])]
    .map(({ observationHash }) => observationHash);
  return freezeEvidence({ version: INDEPENDENT_MARKET_EVIDENCE_VERSION, status: "unavailable", reasons,
    participation: { state: participation, expectedMinutes: null }, support: { currentTeamMatches, previousTeamMatches: contributions.length - currentTeamMatches,
      recordedPenaltyMatches: contributions.filter((row) => row.teamId === teamId && row.penaltyGoals !== null).length,
      conflictingMatches, scoringEnvironment, observationHashes: [...new Set(hashes)].sort() } });
}

/** Counts the fixtures which can settle the exact market as written. Count
 * metrics, period/line rules and event timelines keep their own evidence gates. */
export function assessStatisticCapability(input: Readonly<{
  fixture: IntelligenceFixture; definition: NonGoalMarketDefinition;
  history: readonly NonGoalModelHistory[]; verifyHistory(row: NonGoalModelHistory): boolean;
}>) {
  const { fixture } = input, parsed = nonGoalMarketDefinitionSchema.safeParse(input.definition);
  const valid = parsed.success && parsed.data.playerId === null && validTarget(fixture);
  const definition = valid ? parsed.data : null;
  const event = definition !== null && (definition.kind.startsWith("event-") || definition.kind.endsWith("-event-team"));
  const observations = definition ? byFixture(input.history.filter((row) => row.kind === "non-goal-result" && row.fixtureId !== fixture.fixtureId &&
    row.competitionId === fixture.competitionId && Number.isSafeInteger(row.kickoffAt) && row.kickoffAt < row.availableAt &&
    knownAt(row, fixture.forecastAt) && provenTrue(() => input.verifyHistory(row)))) : new Map<string, NonGoalModelHistory[]>();
  const hashes: string[] = [];
  let conflictingMatches = 0;
  for (const versions of observations.values()) {
    const current = latest(versions);
    if (current.conflict) { conflictingMatches++; continue; }
    const row = current.rows[0]!, settlement = settleNonGoalSelection(definition, definition?.selections[0]?.key ?? null, row.settlement);
    if (["correct", "incorrect", "half-win", "half-loss", "push"].includes(settlement.status)) hashes.push(row.observationHash);
  }
  const reasons: StatisticReason[] = [];
  if (!definition) reasons.push("invalid-statistic-request");
  else {
    if (!hashes.length) reasons.push(event ? "missing-complete-period-event-history" : "missing-verified-period-count-history");
    reasons.push(event ? definition.kind === "event-any" ? "no-qualified-event-model" : "no-qualified-event-order-model" : "no-qualified-statistic-model");
  }
  return freezeEvidence({ version: INDEPENDENT_MARKET_EVIDENCE_VERSION, status: "unavailable", marketKey: definition?.key ?? null,
    basis: definition === null ? null : event ? "event" : "count", reasons, support: { matches: hashes.length,
      conflictingMatches, observationHashes: [...new Set(hashes)].sort() } } as const);
}
