import "server-only";

import { marketSelections, marketRules, validateMarketSnapshot, type MarketFamily, type SourceGroup } from "../../domain/markets.ts";
import { selectionOccurred, type SettlementContext } from "../../domain/market-settlement.ts";
import { isDecimalOddsValue } from "../../domain/odds.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import type { BaselineResult, EvaluationMetrics, MetricObservation } from "../evaluation/evaluation-contract.ts";
import { evaluateMarketMetrics } from "../evaluation/evaluation-metrics.ts";
import { provenTrue } from "../shared/authority-proof.ts";
import { estimateLocalGoals } from "./local-goals-model.ts";
import { learnEnsembleArtifact, validateIntelligenceForecast } from "./forecast-validator.ts";
import type { IntelligenceValidationInput } from "./forecast-validator.ts";
import type { ContextualAssessment, IntelligenceFixture, IntelligenceProbabilities, LocalGoalConfiguration,
  OutOfSampleForecast, ProviderIntelligenceForecast, ValidatedIntelligenceForecast } from "./intelligence-contract.ts";

const primary = ["match-result", "total-goals", "both-teams-to-score"] as const;
const systems = ["local", "provider", "ensemble", "league-frequency"] as const;
type System = typeof systems[number];
export type WalkForwardFixture = Readonly<{
  fixture: IntelligenceFixture; status: "settled" | "pending" | "void" | "cancelled" | "unavailable";
  result: BaselineResult | null; provider?: ProviderIntelligenceForecast | null; context?: ContextualAssessment | null;
  quote?: IntelligenceValidationInput["quote"];
}>;
export type WalkForwardCell = Readonly<{
  system: System; family: MarketFamily; competitionId: string; horizon: "under-24h" | "24h-or-more";
  fixtures: number; available: number; coverage: number; abstentions: number;
  pending: number; void: number; cancelled: number; unavailable: number;
  metrics: EvaluationMetrics; pricedSelections: number; illustrativeUnitStakeRoi: number | null;
}>;

export function estimateLeagueFrequency(history: readonly BaselineResult[], fixture: IntelligenceFixture, configuration?: Partial<LocalGoalConfiguration>) {
  const rows = history.filter((row) => row.fixtureId !== fixture.fixtureId && row.competitionId === fixture.competitionId &&
    row.availableAt <= fixture.forecastAt && row.kickoffAt < fixture.forecastAt &&
    row.kickoffAt >= fixture.forecastAt - (configuration?.lookbackMs ?? 730 * 86_400_000));
  if (rows.length < (configuration?.minimumMatches ?? 30)) return null;
  return Object.fromEntries(primary.map((family) => [family, Object.fromEntries(marketSelections[family].map((selection) =>
    [selection, (1 + rows.filter((row) => selectionOccurred(selection, row.homeGoals, row.awayGoals)).length) / (rows.length + marketSelections[family].length)]))])) as
    Pick<IntelligenceProbabilities, SourceGroup>;
}

/** Reconstruct each local forecast independently at its historical cutoff. Only
 * already resolved, earlier out-of-sample forecasts train that step's ensemble.
 * Provider absence stays unavailable; no endpoint is queried to invent history. */
export function evaluateIntelligenceWalkForward(input: Readonly<{
  mode: "synthetic" | "historical" | "prospective"; fixtures: readonly WalkForwardFixture[]; history: readonly BaselineResult[];
  configuration?: Partial<LocalGoalConfiguration>; minimumEnsembleSamples?: number;
  verifyHistory(row: BaselineResult): boolean;
  verifyProvider?: IntelligenceValidationInput["verifyProvider"];
  verifyContext?: IntelligenceValidationInput["verifyContext"];
}>) {
  if (!["synthetic", "historical", "prospective"].includes(input.mode) || input.fixtures.length > 10_000 || input.history.length > 100_000)
    throw new Error("Invalid walk-forward evaluation input.");
  const identities = new Set<string>();
  for (const entry of input.fixtures) {
    if (!["settled", "pending", "void", "cancelled", "unavailable"].includes(entry.status)) throw new Error("Unknown evaluation status.");
    if (identities.has(entry.fixture.fixtureId) || entry.fixture.forecastAt >= entry.fixture.kickoffAt - 300_000)
      throw new Error("Duplicate fixture or post-lock forecast in evaluation.");
    identities.add(entry.fixture.fixtureId);
    if (entry.result && (entry.result.fixtureId !== entry.fixture.fixtureId || entry.result.competitionId !== entry.fixture.competitionId ||
      entry.result.homeTeamId !== entry.fixture.homeTeamId || entry.result.awayTeamId !== entry.fixture.awayTeamId ||
      entry.result.kickoffAt !== entry.fixture.kickoffAt || entry.result.availableAt < entry.fixture.kickoffAt ||
      entry.result.period !== marketRules.period || ![entry.result.homeGoals, entry.result.awayGoals].every((value) => Number.isInteger(value) && value >= 0) ||
      !provenTrue(() => input.verifyHistory(entry.result!)))) throw new Error("Unverified evaluation result.");
    if (entry.status === "settled" && !entry.result) throw new Error("Settled evaluation requires regulation evidence.");
  }
  if (input.history.some((row) => !provenTrue(() => input.verifyHistory(row)))) throw new Error("Unverified historical evidence.");
  const historyByFixture = new Map(input.history.map((row) => [row.fixtureId, row]));
  if (historyByFixture.size !== input.history.length) throw new Error("Duplicate historical fixture.");
  for (const entry of input.fixtures) if (entry.status === "settled" && entry.result) {
    const existing = historyByFixture.get(entry.fixture.fixtureId);
    if (existing && evidenceFingerprint(existing) !== evidenceFingerprint(entry.result)) throw new Error("Conflicting historical result.");
    historyByFixture.set(entry.fixture.fixtureId, entry.result);
  }
  const history = [...historyByFixture.values()];
  const rows = [...input.fixtures].sort((a, b) => a.fixture.forecastAt - b.fixture.forecastAt ||
    (a.fixture.fixtureId < b.fixture.fixtureId ? -1 : a.fixture.fixtureId > b.fixture.fixtureId ? 1 : 0));
  const archived: OutOfSampleForecast[] = [], forecasts: ValidatedIntelligenceForecast[] = [];
  const cells = new Map<string, {
    system: System; family: MarketFamily; competitionId: string; horizon: WalkForwardCell["horizon"];
    fixtures: number; available: number; pending: number; void: number; cancelled: number; unavailable: number;
    observations: MetricObservation[]; returns: number[];
  }>();
  for (const entry of rows) {
    const { fixture } = entry;
    const local = estimateLocalGoals({ fixture, history, ...(input.configuration ? { configuration: input.configuration } : {}) });
    const provider = entry.provider ?? null;
    const ensemble = provider ? learnEnsembleArtifact({ rows: archived, learnedAt: fixture.forecastAt - 1,
      competitionId: fixture.competitionId, localModelVersion: local.modelVersion, providerModelVersion: provider.modelVersion,
      cohort: fixture.cohort ?? "unspecified",
      ...(input.minimumEnsembleSamples === undefined ? {} : { minimumSamples: input.minimumEnsembleSamples }), verifyRow: (row) => archived.includes(row) }) : null;
    const validation = validateIntelligenceForecast({ fixture, local, provider, context: entry.context ?? null, ensemble,
      ...(entry.quote ? { quote: entry.quote } : {}), ...(input.verifyProvider ? { verifyProvider: input.verifyProvider } : {}),
      ...(input.verifyContext ? { verifyContext: input.verifyContext } : {}),
      verifyEnsemble: (artifact) => artifact === ensemble });
    forecasts.push(validation);
    const providerUsable = provider && provider.fixtureId === fixture.fixtureId && provider.observedAt <= fixture.forecastAt &&
      fixture.forecastAt - provider.observedAt <= 6 * 3_600_000 && provenTrue(() => input.verifyProvider?.(provider));
    const learnedProbabilities = validation.probabilities && ensemble ? Object.fromEntries(primary
      .filter((family) => ensemble.families[family].status === "estimated" && providerUsable && provider.probabilities[family])
      .map((family) => [family, validation.probabilities![family]])) as Partial<Pick<IntelligenceProbabilities, SourceGroup>> : null;
    const candidates = { local: local.probabilities, provider: providerUsable ? provider.probabilities : null,
      ensemble: learnedProbabilities, "league-frequency": estimateLeagueFrequency(history, fixture, input.configuration) };
    for (const system of systems) {
      const candidate = candidates[system];
      // Reuse canonical market/settlement metrics. The legacy domain has no local
      // source label; its private validation marker never escapes these metrics.
      const markets = validateMarketSnapshot(Object.fromEntries(primary.filter((family) => candidate?.[family]).map((family) =>
        [family, { source: system === "provider" ? "api-football" : "ai", period: marketRules.period,
          probabilities: candidate![family], ...(family === "total-goals" ? { line: 2.5 } : {}) }])));
      for (const family of Object.keys(marketSelections) as MarketFamily[]) {
        const horizon = fixture.kickoffAt - fixture.forecastAt < 86_400_000 ? "under-24h" as const : "24h-or-more" as const;
        const key = `${system}:${family}:${fixture.competitionId}:${horizon}`;
        let cell = cells.get(key);
        if (!cell) { cell = { system, family, competitionId: fixture.competitionId, horizon, fixtures: 0, available: 0,
          pending: 0, void: 0, cancelled: 0, unavailable: 0, observations: [], returns: [] }; cells.set(key, cell); }
        cell.fixtures++;
        if (entry.status !== "settled") cell[entry.status]++;
        const availability = markets.markets[family];
        if (!availability.available) continue;
        cell.available++;
        if (entry.status !== "settled" || !entry.result) continue;
        const result: SettlementContext = { status: "finished-regulation", cycleEligibility: { eligible: true },
          regulationScore: { verified: true, period: marketRules.period, home: entry.result.homeGoals, away: entry.result.awayGoals } };
        cell.observations.push({ market: availability.market, result });
        if (entry.quote && entry.quote.family === family && entry.quote.selection === availability.market.selection &&
          entry.quote.observedAt <= fixture.forecastAt && fixture.forecastAt - entry.quote.observedAt <= 6 * 3_600_000 &&
          isDecimalOddsValue(entry.quote.decimalOdds)) cell.returns.push(
            selectionOccurred(availability.market.selection, entry.result.homeGoals, entry.result.awayGoals) ? entry.quote.decimalOdds - 1 : -1);
      }
    }
    if (local.probabilities && providerUsable && entry.status === "settled" && entry.result) {
      const historyIds = new Set(local.historyIds);
      const trainingEndsAt = history.reduce((latest, row) => historyIds.has(row.observationHash) ? Math.max(latest, row.availableAt) : latest, 0);
      for (const family of primary) if (provider.probabilities[family]) archived.push({ fixtureId: fixture.fixtureId,
        competitionId: fixture.competitionId, cohort: fixture.cohort ?? "unspecified", family, kickoffAt: fixture.kickoffAt, forecastAt: fixture.forecastAt, trainingEndsAt,
        resultAvailableAt: entry.result.availableAt, evidenceRef: entry.result.evidenceRef,
        localModelVersion: local.modelVersion, providerModelVersion: provider.modelVersion,
        local: local.probabilities[family], provider: provider.probabilities[family],
        outcome: marketSelections[family].find((selection) => selectionOccurred(selection, entry.result!.homeGoals, entry.result!.awayGoals))! });
    }
  }
  const metrics: WalkForwardCell[] = [...cells.values()].map(({ observations, returns, ...cell }) => ({ ...cell,
    coverage: cell.available / cell.fixtures, abstentions: cell.fixtures - cell.available,
    metrics: evaluateMarketMetrics(cell.family, observations, [0, 0.2, 0.4, 0.6, 0.8, 1], 1.96),
    pricedSelections: returns.length, illustrativeUnitStakeRoi: returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : null }));
  const report = { version: "walk-forward-intelligence-v1", mode: input.mode, publicationAuthorized: false, predictiveAccuracyEstablished: false,
    fixtures: rows.length, forecasts, cells: metrics, limitations: [
      ...(input.mode === "synthetic" ? ["Synthetic fixtures test implementation only; they establish no predictive accuracy."] : []),
      "Independent prospective review and a frozen final test are required before activation.",
      "Missing archived provider forecasts remain unavailable; missing context contributes no numerical probability.",
      "AI incremental value requires matched, authorized contextual evidence; this report makes no AI value claim.",
      "Whole-slip qualification and correlation evidence require separate evaluation.",
    ] };
  return freezeEvidence({ ...report, hash: evidenceFingerprint(report) });
}
