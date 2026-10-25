import { marketRules, validateMarketSnapshot } from "../../src/domain/markets.ts";
import { evidenceHash } from "./evidence-fixtures.mjs";

// Synthetic receipts, results and clocks for the private source comparison; no forecast here is real.
export const COMPARISON_KICKOFF = Date.parse("2026-11-01T15:00:00Z");
const id = (number) => `40000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const result = (probabilities, source) => ({ source, period: marketRules.period, probabilities });
const unsupported = (snapshot) => ({ ...snapshot, markets: { ...snapshot.markets, "total-goals": { available: false, reason: "unsupported-family" },
  "both-teams-to-score": { available: false, reason: "unsupported-family" } } });
export const finished = (home, away) => ({ status: "finished-regulation", cycleEligibility: { eligible: true },
  regulationScore: { verified: true, period: marketRules.period, home, away } });
export const scheduled = () => ({ status: "scheduled", cycleEligibility: { eligible: true }, regulationScore: null });
const unavailableReceipt = (source, reason) => ({ source, status: "unavailable", reason, markets: validateMarketSnapshot({}), timestamps: null,
  version: null, modelVersionId: null, evidence: null });
export function comparisonReceipts({ ai, provider, evidence = { conflicting: false, limitedNews: false }, order = "provider-first" }) {
  const timestamps = { generatedAt: null, retrievedAt: COMPARISON_KICKOFF - 86_400_000, providerUpdatedAt: null };
  return { version: 1, order,
    ai: ai === null ? unavailableReceipt("ai", "invalid-output") : { source: "ai", status: "candidate", reason: null,
      markets: validateMarketSnapshot({ "match-result": result(ai, "ai"),
        "total-goals": { source: "ai", period: marketRules.period, line: 2.5, probabilities: { "over-2.5": 0.6, "under-2.5": 0.4 } },
        "both-teams-to-score": { source: "ai", period: marketRules.period, probabilities: { yes: 0.6, no: 0.4 } } }),
      timestamps, version: "synthetic-ai-output-v1", modelVersionId: evidenceHash("synthetic-comparison-model"), evidence },
    "api-football": provider === null ? unavailableReceipt("api-football", "stale") : { source: "api-football", status: "candidate", reason: null,
      markets: unsupported(validateMarketSnapshot({ "match-result": result(provider, "api-football") })), timestamps,
      version: "synthetic-provider-v1", modelVersionId: null, evidence: null } };
}
export function comparisonRecord(number, { state = "closed", order = "provider-first", kickoffAt = COMPARISON_KICKOFF - number * 86_400_000,
  forecastAt = kickoffAt - 3_600_000, settlement = finished(2, 1), published = { "match-result": "api-football" } } = {}) {
  return { fixtureId: id(number), cycleId: id(number + 100), state, kickoffAt,
    locked: state === "closed" ? { jobId: evidenceHash(`synthetic-comparison-job-${number}`), forecastAt, sourceOrder: order, published } : null,
    settlement, matchLabel: `Home ${number} v Away ${number}`, href: `/en/matches/${id(number)}/home-${number}-v-away-${number}` };
}
export const comparisonOptions = (overrides = {}) => ({ families: ["match-result", "double-chance", "total-goals", "both-teams-to-score"],
  horizons: null, bands: [0, 0.5, 1], confidenceZ: 1.96, ...overrides });
