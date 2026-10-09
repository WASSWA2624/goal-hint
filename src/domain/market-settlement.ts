import { MARKET_RULE_VERSION, isMarketSelection } from "./markets.ts";
import type { MarketSelection } from "./markets.ts";

/** Provider statuses must be mapped and verified before entering this domain. */
export type SettlementStatus =
  | "scheduled"
  | "live"
  | "finished-regulation"
  | "finished-extra-time"
  | "finished-penalties"
  | "postponed"
  | "canceled"
  | "abandoned"
  | "awarded"
  | "unknown";

export type CycleIneligibilityReason =
  | "postponed-cycle"
  | "cutoff-invalidated"
  | "ineligible-cycle";

export type CycleEligibility =
  | Readonly<{ eligible: true }>
  | Readonly<{ eligible: false; reason: CycleIneligibilityReason }>;

export type VerifiedRegulationScore = Readonly<{
  verified: true;
  period: "regulation-including-stoppage-time";
  home: number;
  away: number;
}>;

export type UnverifiedRegulationScore = Readonly<{
  verified: false;
  period?: string;
  home?: number;
  away?: number;
}>;

export type SettlementContext = Readonly<{
  status: SettlementStatus;
  cycleEligibility: CycleEligibility;
  regulationScore: VerifiedRegulationScore | UnverifiedRegulationScore | null;
}>;

export type SettlementOutcomeStatus = "correct" | "incorrect" | "pending" | "void" | "unavailable";

export function isPlayedFinalStatus(status: SettlementStatus): boolean {
  return status === "finished-regulation" || status === "finished-extra-time" || status === "finished-penalties";
}

export type SettlementReason =
  | "missing-selection"
  | "unsupported-market-selection"
  | "invalid-context"
  | CycleIneligibilityReason
  | "fixture-postponed"
  | "fixture-canceled"
  | "fixture-abandoned"
  | "fixture-awarded"
  | "awaiting-final-result"
  | "unknown-fixture-status"
  | "missing-regulation-score"
  | "unverified-regulation-score"
  | "invalid-score-period"
  | "invalid-regulation-score"
  | "selection-occurred"
  | "selection-did-not-occur";

export type SettlementOutcome = Readonly<{
  ruleVersion: typeof MARKET_RULE_VERSION;
  status: SettlementOutcomeStatus;
  reason: SettlementReason;
}>;

function outcome(status: SettlementOutcomeStatus, reason: SettlementReason): SettlementOutcome {
  return Object.freeze({ ruleVersion: MARKET_RULE_VERSION, status, reason });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCycleIneligibilityReason(value: unknown): value is CycleIneligibilityReason {
  return value === "postponed-cycle" || value === "cutoff-invalidated" || value === "ineligible-cycle";
}

function isGoalCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function occurred(selection: MarketSelection, home: number, away: number): boolean {
  switch (selection) {
    case "home-win": return home > away;
    case "draw": return home === away;
    case "away-win": return away > home;
    case "home-or-draw": return home >= away;
    case "away-or-draw": return away >= home;
    case "home-or-away": return home !== away;
    case "over-2.5": return home + away >= 3;
    case "under-2.5": return home + away <= 2;
    case "yes": return home > 0 && away > 0;
    case "no": return home === 0 || away === 0;
  }
}

/**
 * Adjudicates one already selected pick. It neither locks a prediction nor
 * interprets a provider's final/extra-time/penalty totals as regulation scores.
 */
export function settleMarketSelection(
  family: unknown,
  selection: unknown,
  context: SettlementContext,
): SettlementOutcome {
  if (!isMarketSelection(family, selection)) {
    return outcome("unavailable", selection === null || selection === undefined
      ? "missing-selection" : "unsupported-market-selection");
  }

  // Runtime guards also protect callers receiving untrusted persisted records.
  const input: unknown = context;
  if (!isRecord(input) || !isRecord(input.cycleEligibility)) {
    return outcome("pending", "invalid-context");
  }
  const eligibility = input.cycleEligibility;
  if (eligibility.eligible === false) {
    return isCycleIneligibilityReason(eligibility.reason)
      ? outcome("void", eligibility.reason)
      : outcome("pending", "invalid-context");
  }
  if (eligibility.eligible !== true) return outcome("pending", "invalid-context");

  switch (input.status) {
    case "postponed": return outcome("void", "fixture-postponed");
    case "canceled": return outcome("void", "fixture-canceled");
    case "abandoned": return outcome("void", "fixture-abandoned");
    case "awarded": return outcome("void", "fixture-awarded");
    case "scheduled":
    case "live": return outcome("pending", "awaiting-final-result");
    case "unknown": return outcome("pending", "unknown-fixture-status");
    case "finished-regulation":
    case "finished-extra-time":
    case "finished-penalties": break;
    default: return outcome("pending", "invalid-context");
  }

  const score = input.regulationScore;
  if (score === null || score === undefined) return outcome("pending", "missing-regulation-score");
  if (!isRecord(score)) return outcome("pending", "invalid-regulation-score");
  if (score.verified !== true) return outcome("pending", "unverified-regulation-score");
  if (score.period !== "regulation-including-stoppage-time") {
    return outcome("pending", "invalid-score-period");
  }
  if (!isGoalCount(score.home) || !isGoalCount(score.away) || !Number.isSafeInteger(score.home + score.away)) {
    return outcome("pending", "invalid-regulation-score");
  }

  return occurred(selection, score.home, score.away)
    ? outcome("correct", "selection-occurred")
    : outcome("incorrect", "selection-did-not-occur");
}
