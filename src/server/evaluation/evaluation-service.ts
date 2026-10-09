import "server-only";

import { getReportingDate } from "../../domain/calendar.ts";
import { settleMarketSelection } from "../../domain/market-settlement.ts";
import { marketSelections } from "../../domain/markets.ts";
import type { AcceptedMarket, MarketFamily, MarketSource } from "../../domain/markets.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import { EVALUATION_VERSION, evaluationSystems } from "./evaluation-contract.ts";
import type { EvaluationAuthority, EvaluationCell, EvaluationCoverage, EvaluationDataset, EvaluationFixture, EvaluationForecast,
  EvaluationGateResult, EvaluationProtocol, EvaluationReport, MatchedComparison, MetricObservation, QualityGate } from "./evaluation-contract.ts";
import { EvaluationInputError, evaluationFixtureKey, parseEvaluationDataset, parseEvaluationProtocol } from "./evaluation-input.ts";
import { reconstructBaselines } from "./evaluation-baselines.ts";
import { evaluateMarketMetrics } from "./evaluation-metrics.ts";

function synchronous(value: unknown): unknown { if (value instanceof Promise) void value.catch(() => undefined); return value; }
function trusted(operation: () => unknown): boolean { try { return synchronous(operation()) === true; } catch { return false; } }
const issuedReports = new WeakMap<object, Readonly<{ protocolId: string; datasetId: string; check(): void }>>();
/** A checksum proves integrity; only an original trusted harness result can be archived. */
export function assertEvaluationReportIssued(value: unknown, protocol: EvaluationProtocol, dataset: EvaluationDataset): void {
  const receipt = value !== null && typeof value === "object" ? issuedReports.get(value) : undefined;
  if (!receipt || !Object.isFrozen(value) || receipt.protocolId !== protocol.id || receipt.datasetId !== dataset.id)
    throw new EvaluationInputError("not-authorized");
  receipt.check();
}
type Scored = Readonly<{ key: string; market: AcceptedMarket | null; result: EvaluationFixture["result"]["context"]; version: string | null }>;
const systemsWithSources = ["ai", "api-football", "combined"] as const;
const prospectiveRequirements = Object.freeze([
  "Approve and freeze actual chronological windows, competition/horizon cohorts, baseline parameters, sample and quality/public-claim gates before the final test.",
  "Select and verify the exact AI model/calibration configuration and provider regulation mapping, freshness, rights and independent operating budgets.",
  "Capture original source/evidence snapshots and all AI/provider/combined forecasts before each predeclared horizon; retain original clocks and every unavailable attempt.",
  "Preserve fixture/cycle manifests and independently verified regulation results, including pending, void and later correction versions.",
  "Run bounded private prospective shadow through the existing cost/quota controls after pipeline-integrity approval; retain untouched final-test artifacts for independent review.",
]);
function verifyForecast(entry: EvaluationForecast, row: EvaluationFixture, system: typeof systemsWithSources[number], protocol: EvaluationProtocol) {
  const hasAi = Object.values(entry.markets.markets).some((market) => market.available && market.market.source === "ai");
  const hasProvider = Object.values(entry.markets.markets).some((market) => market.available && market.market.source === "api-football");
  if (hasAi && (!protocol.candidateModel || entry.modelVersionId !== protocol.candidateModel.id ||
    entry.calibrationVersion !== protocol.candidateModel.calibration.version) || hasProvider && protocol.providerContractVersion === null ||
    system === "api-football" && entry.version !== protocol.providerContractVersion ||
    system === "ai" && entry.version !== protocol.candidateModel?.providerModelVersion ||
    entry.generatedAt !== null && hasAi && entry.generatedAt < row.context.analysisAt) throw new EvaluationInputError("invalid-dataset");
  if (hasAi && Object.values(protocol.candidateModel!.windows).some((window) => window !== null && window.endsAt > row.context.cutoffAt))
    throw new EvaluationInputError("leakage");
}
function coverage(rows: readonly Scored[], baseline: boolean): EvaluationCoverage {
  let available = 0, unavailable = 0, voidCount = 0, pending = 0, settled = 0, ai = 0, provider = 0;
  for (const row of rows) {
    const adjudication = settleMarketSelection("match-result", "home-win", row.result);
    if (adjudication.status === "void") { voidCount++; continue; }
    if (row.market === null) { unavailable++; continue; }
    available++;
    if (!baseline) { if (row.market.source === "ai") ai++; else provider++; }
    const outcome = settleMarketSelection(row.market.family, row.market.selection, row.result);
    if (outcome.status === "correct" || outcome.status === "incorrect") settled++; else pending++;
  }
  return freezeEvidence({ total: rows.length, available, unavailable, void: voidCount, pending, settled, sources: { ai, "api-football": provider } });
}
export function createEvaluationHarness(options: Readonly<{ authority: EvaluationAuthority; maxRows: number; maxBytes: number }>) {
  if (!Number.isSafeInteger(options.maxRows) || options.maxRows < 1 || options.maxRows > 100_000 || !Number.isSafeInteger(options.maxBytes) ||
    options.maxBytes < 1 || options.maxBytes > 67_108_864) throw new EvaluationInputError();
  return Object.freeze({ evaluate(value: Readonly<{ protocol: unknown; dataset: unknown; split: "validation" | "calibration" | "finalTest" }>): EvaluationReport {
    if (value === null || typeof value !== "object" || Object.keys(value).some((key) => !["protocol", "dataset", "split"].includes(key)) ||
      !["validation", "calibration", "finalTest"].includes(value.split)) throw new EvaluationInputError();
    let protocol: EvaluationProtocol, dataset: EvaluationDataset;
    try {
      if (Buffer.byteLength(evidenceSerialize(value), "utf8") > options.maxBytes) throw new Error();
      protocol = parseEvaluationProtocol(value.protocol); dataset = parseEvaluationDataset(value.dataset);
      if (dataset.fixtures.length > options.maxRows || dataset.history.length > options.maxRows || dataset.selectionVersion !== protocol.selectionVersion) throw new Error();
    } catch (error) { if (error instanceof EvaluationInputError) throw error; throw new EvaluationInputError(); }
    const authority = options.authority;
    const authorize = () => { try { if (synchronous(authority.authorize(protocol, dataset)) !== undefined) throw new Error(); }
      catch { throw new EvaluationInputError("not-authorized"); } };
    const requireProof = (operation: () => unknown) => { if (!trusted(operation)) throw new EvaluationInputError("not-authorized"); };
    authorize(); requireProof(() => authority.verifyDataset(dataset));
    if (protocol.candidateModel) requireProof(() => authority.verifyModel(protocol.candidateModel!));
    if (protocol.previousApprovedModel) requireProof(() => authority.verifyModel(protocol.previousApprovedModel!));
    for (const entry of dataset.history) requireProof(() => authority.verifyHistory(entry));
    for (const row of dataset.fixtures) {
      requireProof(() => authority.verifyResult(row));
      for (const system of systemsWithSources) {
        const entry = row.forecasts[system]; if (entry === null) continue;
        verifyForecast(entry, row, system, protocol);
        requireProof(() => authority.verifyForecast(entry, row, system));
        for (const proof of entry.evidence) requireProof(() => authority.verifyEvidence(proof, row));
      }
    }
    const limitations = new Set<string>(["No automatic model promotion or public calibration claim follows from this report.",
      "Wilson intervals assume independent fixtures within each selection/horizon; overlapping events and repeated horizons are not pooled as independent samples.",
      "Brier/log loss combine calibration and discrimination; lower loss alone does not establish calibration."]);
    const window = protocol.windows[value.split], selected: EvaluationFixture[] = [], excluded: { key: string; reason: string }[] = [], cohortKeys = new Set<string>();
    for (const row of dataset.fixtures) {
      const horizon = row.context.kickoffAt - row.forecastAt;
      const reason = window === null ? "unresolved-split-window" : row.context.kickoffAt < window.startsAt || row.context.kickoffAt >= window.endsAt
        ? "outside-split-window" : !protocol.competitionIds.includes(row.competitionId) ? "outside-competition-cohort"
          : !protocol.horizons.some((band) => horizon >= band.minimumMs && horizon < band.maximumMs) ? "outside-horizon-cohort" : null;
      if (reason) excluded.push({ key: evaluationFixtureKey(row), reason }); else {
        const band = protocol.horizons.find((entry) => horizon >= entry.minimumMs && horizon < entry.maximumMs)!;
        const cohortKey = `${row.context.fixtureId}:${row.context.cycleId}:${band.id}`;
        if (cohortKeys.has(cohortKey)) throw new EvaluationInputError("invalid-dataset");
        cohortKeys.add(cohortKey); selected.push(row);
      }
    }
    if (dataset.mode === "synthetic") limitations.add("Synthetic observations verify software only; they establish no actual quality, calibration or permission.");
    if (dataset.mode === "historical") limitations.add("Historical AI/provider comparisons require original authenticated pre-cutoff captures; missing snapshots remain unavailable.");
    if (selected.length === 0) limitations.add("No eligible fixtures are available in this split/cohort.");
    const frozen = protocol.frozenAt !== null && protocol.approvalRef !== null && protocol.gates !== null && trusted(() => authority.verifyProtocol(protocol));
    if (!frozen) limitations.add("Actual approved frozen evaluation windows, cohorts or gates are unresolved/unverified.");
    const knownFit = protocol.candidateModel !== null && protocol.candidateModel.windows.training !== null &&
      (protocol.candidateModel.calibration.kind === "none" || protocol.candidateModel.windows.calibration !== null);
    if (!knownFit) limitations.add("Actual model fitting/calibration provenance is unknown; forecasts remain provisional.");
    const finalProof = value.split === "finalTest" && frozen && trusted(() => authority.verifyUntouchedFinalTest(protocol, dataset));
    if (value.split === "finalTest" && !finalProof) limitations.add("Independent untouched final-test provenance remains unverified.");
    const rows = new Map<string, Scored[]>(), cells: EvaluationCell[] = [], comparisons: MatchedComparison[] = [];
    for (const row of selected) {
      const horizon = protocol.horizons.find((band) => row.context.kickoffAt - row.forecastAt >= band.minimumMs && row.context.kickoffAt - row.forecastAt < band.maximumMs)!;
      const baselines = reconstructBaselines(row, dataset.history, protocol.baselines);
      for (const entry of Object.values(baselines)) for (const limit of entry.limitations) limitations.add(limit);
      for (const system of evaluationSystems) {
        const snapshot = system === "league-frequency" || system === "team-strength" ? baselines[system] : row.forecasts[system];
        if (snapshot === null) limitations.add(`${system}: ${row.unavailableReasons[system as typeof systemsWithSources[number]]}`);
        for (const family of Object.keys(marketSelections) as MarketFamily[]) {
          const entry = snapshot?.markets.markets[family], key = `${system}:${family}:${horizon.id}`, items = rows.get(key) ?? [];
          items.push({ key: evaluationFixtureKey(row), market: entry?.available ? entry.market : null, result: row.result.context, version: snapshot?.version ?? null }); rows.set(key, items);
        }
      }
    }
    const metrics = (items: readonly Scored[], family: MarketFamily) => evaluateMarketMetrics(family,
      items.filter((entry) => entry.market !== null).map((entry): MetricObservation => ({ market: entry.market!, result: entry.result })), protocol.calibrationBands, protocol.confidenceZ);
    for (const system of evaluationSystems) for (const family of Object.keys(marketSelections) as MarketFamily[]) for (const horizon of protocol.horizons) {
      const items = rows.get(`${system}:${family}:${horizon.id}`) ?? [], isBaseline = system === "league-frequency" || system === "team-strength";
      const sourceMetrics = isBaseline ? null : Object.fromEntries((["ai", "api-football"] as MarketSource[]).map((source) =>
        [source, metrics(items.filter((entry) => entry.market?.source === source), family)])) as NonNullable<EvaluationCell["sourceMetrics"]>;
      cells.push({ system, family, horizonId: horizon.id, versions: [...new Set(items.map((entry) => entry.version).filter((entry): entry is string => entry !== null))].sort(),
        coverage: coverage(items, isBaseline), metrics: metrics(items, family), sourceMetrics });
      if (!isBaseline) for (const referenceSystem of evaluationSystems.filter((entry) => entry !== system)) {
        const reference = new Map((rows.get(`${referenceSystem}:${family}:${horizon.id}`) ?? []).map((entry) => [entry.key, entry]));
        const candidate = items.filter((entry) => entry.market !== null && reference.get(entry.key)?.market !== null && reference.has(entry.key) &&
          ["correct", "incorrect"].includes(settleMarketSelection(family, entry.market.selection, entry.result).status));
        const candidateMetrics = metrics(candidate, family), referenceMetrics = metrics(candidate.map((entry) => reference.get(entry.key)!), family);
        comparisons.push({ system: system as MatchedComparison["system"], referenceSystem,
          kind: referenceSystem === "league-frequency" || referenceSystem === "team-strength" ? "baseline" : "source-comparison",
          family, horizonId: horizon.id, count: candidate.length,
          fixtureKeysHash: evidenceFingerprint(candidate.map((entry) => entry.key).sort()), candidate: candidateMetrics, reference: referenceMetrics,
          brierDifference: candidateMetrics.brier === null || referenceMetrics.brier === null ? null : candidateMetrics.brier - referenceMetrics.brier });
      }
    }
    const gateResults: EvaluationGateResult[] = (protocol.gates ?? []).map((gate: QualityGate) => {
      const cell = cells.find((entry) => entry.system === gate.system && entry.family === gate.family && entry.horizonId === gate.horizonId)!;
      const reasons: string[] = [], failures: string[] = [];
      const eligible = cell.coverage.total - cell.coverage.void, ratio = eligible === 0 ? null : cell.coverage.available / eligible;
      if (cell.metrics.count < gate.minimumSamples) reasons.push("insufficient-settled-samples");
      if (ratio === null) reasons.push("no-eligible-coverage-denominator"); else if (ratio < gate.minimumCoverage) failures.push("coverage-below-gate");
      for (const [observed, maximum, reason] of [[cell.metrics.brier, gate.maximumBrier, "brier-above-gate"],
        [cell.metrics.logLoss, gate.maximumLogLoss, "log-loss-above-gate"], [cell.metrics.calibrationError, gate.maximumCalibrationError, "calibration-error-above-gate"]] as const)
        if (maximum !== null) { if (observed === null) reasons.push("missing-score"); else if (observed > maximum) failures.push(reason); }
      if (gate.baseline !== null) {
        const match = comparisons.find((entry) => entry.system === gate.system && entry.referenceSystem === gate.baseline && entry.family === gate.family && entry.horizonId === gate.horizonId);
        if (!match || match.count < gate.minimumSamples || match.brierDifference === null) reasons.push("insufficient-matched-baseline-samples");
        else if (match.brierDifference > gate.maximumBrierDifference!) failures.push("matched-brier-difference-above-gate");
      }
      const diagnostic = reasons.length > 0 ? "pending" : failures.length > 0 ? "failed" : "passed";
      const blockers = [dataset.mode === "synthetic" ? "synthetic-data" : null, !frozen ? "unapproved-protocol" : null,
        !finalProof ? "not-independent-final-test" : null, !protocol.candidateModel ? "unselected-model" : null,
        !knownFit ? "unknown-model-fit-provenance" : null].filter((entry): entry is string => entry !== null);
      return { id: gate.id, purpose: gate.purpose, status: blockers.length > 0 ? "pending" : diagnostic, diagnostic, reasons: [...blockers, ...reasons, ...failures], criteria: gate };
    });
    const candidateGates = gateResults.filter((entry) => entry.purpose === "candidate"), publicGates = gateResults.filter((entry) => entry.purpose === "public-claim");
    const completeCandidateScopes = protocol.horizons.length > 0 && protocol.horizons.every((horizon) => (Object.keys(marketSelections) as MarketFamily[])
      .every((family) => protocol.gates?.some((gate) => gate.purpose === "candidate" && gate.system === "ai" && gate.family === family && gate.horizonId === horizon.id)));
    if (!completeCandidateScopes) limitations.add("Candidate gates do not cover every launch family and configured horizon for the AI model.");
    const failed = candidateGates.some((entry) => entry.status === "failed"), passed = completeCandidateScopes && candidateGates.length > 0 && candidateGates.every((entry) => entry.status === "passed");
    const decision = failed && protocol.previousApprovedModel !== null ? "retain-previous-approved" : passed ? "eligible-for-independent-review" : "remain-provisional";
    if (failed) limitations.add(protocol.previousApprovedModel === null ? "Candidate quality gates failed; no approved previous model exists and launch remains blocked."
      : "Candidate quality gates failed; retain the independently verified previous approved model.");
    const publicClaimStatus = publicGates.some((entry) => entry.status === "failed") ? "blocked" : publicGates.length > 0 && publicGates.every((entry) => entry.status === "passed")
      ? "eligible-for-independent-review" : "pending";
    // The archive reuses this guard rather than accepting shape/checksum as authority.
    function checkCurrent() {
      authorize(); requireProof(() => authority.verifyDataset(dataset));
      for (const row of dataset.fixtures) { requireProof(() => authority.verifyResult(row)); for (const system of systemsWithSources) {
        const entry = row.forecasts[system]; if (entry !== null) { requireProof(() => authority.verifyForecast(entry, row, system));
          for (const proof of entry.evidence) requireProof(() => authority.verifyEvidence(proof, row)); }
      } }
      if (frozen && !trusted(() => authority.verifyProtocol(protocol)) || finalProof && !trusted(() => authority.verifyUntouchedFinalTest(protocol, dataset)))
        throw new EvaluationInputError("not-authorized");
      for (const entry of dataset.history) requireProof(() => authority.verifyHistory(entry));
      if (protocol.candidateModel) requireProof(() => authority.verifyModel(protocol.candidateModel!));
      if (protocol.previousApprovedModel) requireProof(() => authority.verifyModel(protocol.previousApprovedModel!));
    }
    checkCurrent();
    const dates = selected.map((entry) => getReportingDate(entry.context.kickoffAt)).sort();
    const body: Omit<EvaluationReport, "id" | "hash"> = { version: EVALUATION_VERSION, protocolId: protocol.id, datasetId: dataset.id, mode: dataset.mode, split: value.split,
      ruleVersion: protocol.ruleVersion, window, fixtureDatePeriod: { first: dates[0] ?? null, last: dates.at(-1) ?? null },
      candidateModelId: protocol.candidateModel?.id ?? null, previousApprovedModelId: protocol.previousApprovedModel?.id ?? null,
      calibrationVersion: protocol.candidateModel?.calibration.version ?? null, providerContractVersion: protocol.providerContractVersion,
      selectedRows: selected.length, excludedRows: excluded, cells, comparisons, gates: gateResults, decision, publicClaimStatus,
      limitations: [...limitations].sort(), prospectiveRequirements, promotionPerformed: false as const, publicClaimAuthorized: false as const };
    const id = evidenceFingerprint(body), report = freezeEvidence({ ...body, id, hash: id });
    issuedReports.set(report, Object.freeze({ protocolId: protocol.id, datasetId: dataset.id, check: checkCurrent })); return report;
  } });
}
