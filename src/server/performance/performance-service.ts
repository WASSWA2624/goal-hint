import "server-only";

import { z } from "zod";
import { getReportingDate, utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { maximumCompetitionScope } from "../../domain/feed-query.ts";
import { matchFeedRules } from "../../domain/match-feed.ts";
import { performanceFamilies, performanceResponseSchema, performanceRules, type PerformanceCell, type PerformanceCoverage, type PerformanceResponse, type PerformanceSource } from "../../domain/performance.ts";
import type { MarketFamily } from "../../domain/markets.ts";
import { canonicalMatchSlug } from "../../domain/match-slug.ts";
import { matchHref } from "../../domain/navigation.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import type { EvaluationProtocol, HorizonBand, MetricObservation } from "../evaluation/evaluation-contract.ts";
import { evaluateQualityGate } from "../evaluation/evaluation-gates.ts";
import { parseEvaluationProtocol } from "../evaluation/evaluation-input.ts";
import { evaluateMarketMetrics } from "../evaluation/evaluation-metrics.ts";
import { MatchFeedError } from "../matches/feed-error.ts";
import { parsePerformanceQuery, type PerformanceQuery } from "./performance-query.ts";
import { readPerformanceSnapshot, type PerformanceSnapshot } from "./performance-read.ts";
import { publicCacheDescriptor, type PublicResponseCache } from "../cache/public-cache.ts";

/** A trusted server binding, never an HTTP input or checksum-as-approval shortcut. */
export type PerformancePolicyBinding = Readonly<{ protocol: EvaluationProtocol; verifyProtocol(protocol: EvaluationProtocol): boolean }>;
function verifiedPolicy(binding: PerformancePolicyBinding | null, asOf: number): EvaluationProtocol | null {
  if (!binding) return null;
  try {
    const protocol = parseEvaluationProtocol(binding.protocol), proof: unknown = binding.verifyProtocol(protocol);
    if (proof instanceof Promise) void proof.catch(() => undefined);
    return proof === true && protocol.frozenAt !== null && protocol.frozenAt <= asOf ? protocol : null;
  } catch { return null; }
}
const blankCoverage = (): PerformanceCoverage => ({ total: 0, available: 0, unavailable: 0, void: 0, filteredOut: 0,
  pending: 0, settled: 0, sources: { ai: 0, "api-football": 0 } });
type Record = PerformanceSnapshot["records"][number];
function versionFor(record: Record, family: MarketFamily, models: PerformanceSnapshot["models"]): PerformanceCell["versions"][number] | null {
  const item = record.revision?.candidate.markets[family];
  if (!item?.available) return null;
  if (item.provenance.kind === "api-football") return { source: "api-football", provider: "api-football", model: null,
    modelVersionId: null, version: item.provenance.source.contractVersion, calibrationVersion: null };
  const model = models.get(item.provenance.modelVersionId);
  if (!model || model.id !== record.revision?.modelVersionId) throw new MatchFeedError("unavailable");
  return { source: "ai", provider: model.provider, model: model.model, modelVersionId: model.id,
    version: model.providerModelVersion, calibrationVersion: model.calibration.version };
}
function cellFor(snapshot: PerformanceSnapshot, query: PerformanceQuery, family: MarketFamily, source: PerformanceSource,
  horizon: HorizonBand | null, protocol: EvaluationProtocol | null): PerformanceCell {
  const coverage = blankCoverage(), observations: MetricObservation[] = [], links: PerformanceCell["evidence"]["links"] = [];
  const versions = new Map<string, PerformanceCell["versions"][number]>(), included: Record[] = [], observedHorizons = new Set<string>();
  let correct = 0, incorrect = 0, outOfPolicy = false;
  for (const record of snapshot.records) {
    const { cycle, revision, result, projection } = record;
    const horizonMs = cycle && revision ? cycle.kickoffAt - revision.publishedAt : null;
    if (horizon && (horizonMs === null || horizonMs < horizon.minimumMs || horizonMs >= horizon.maximumMs)) continue;
    coverage.total++; included.push(record);
    const entry = projection?.markets.find((m) => m.base.family === family), previous = entry?.previous;
    const coherent = previous && previous.inputHash === entry?.inputHash && previous.lockedSetId === cycle?.lockedSetId;
    if (cycle?.state === "void" || coherent && previous.status === "void") { coverage.void++; continue; }
    const item = cycle?.state === "closed" ? revision?.candidate.markets[family] : null;
    if (!item?.available) { coverage.unavailable++; continue; }
    const version = versionFor(record, family, snapshot.models)!;
    if ((query.source !== "combined" && query.source !== item.market.source) || (source !== "combined" && source !== item.market.source) ||
      query.model !== null && query.model !== version.modelVersionId || query.version !== null && query.version !== version.version) {
      coverage.filteredOut++; continue;
    }
    coverage.available++; coverage.sources[item.market.source]++;
    versions.set(evidenceFingerprint(version), version);
    const knownHorizon = protocol?.horizons.find((h) => horizonMs! >= h.minimumMs && horizonMs! < h.maximumMs);
    if (knownHorizon) observedHorizons.add(knownHorizon.id); else outOfPolicy = true;
    if (!protocol?.competitionIds.includes(record.fixture.season.competitionId) ||
      version.source === "ai" && version.modelVersionId !== protocol?.candidateModel?.id ||
      version.source === "api-football" && version.version !== protocol?.providerContractVersion) outOfPolicy = true;
    if (links.length < performanceRules.maximumEvidenceLinks) links.push({ fixtureId: record.fixture.id, cycleId: cycle!.id,
      revisionId: revision!.id, source: item.market.source, evidenceCutoffAt: revision!.evidenceCutoffAt, forecastAt: revision!.publishedAt, forecastHorizonMs: horizonMs!,
      href: `/api/matches/${record.fixture.id}?revision=${revision!.id}`,
      matchLabel: `${record.fixture.homeTeam.name ?? "Home"} v ${record.fixture.awayTeam.name ?? "Away"}`,
      pageHref: `${matchHref(record.fixture.id, canonicalMatchSlug(record.fixture.homeTeam.name, record.fixture.awayTeam.name))}?revision=${revision!.id}#revision-history` });
    if (coherent && result?.regulation.verified && (previous.status === "correct" || previous.status === "incorrect")) {
      coverage.settled++; if (previous.status === "correct") correct++; else incorrect++;
      observations.push({ market: item.market, result: { status: result.status, cycleEligibility: { eligible: true },
        regulationScore: { verified: true, period: "regulation-including-stoppage-time", home: result.regulation.home!, away: result.regulation.away! } } });
    } else coverage.pending++;
  }
  const metrics: PerformanceCell["metrics"] = { state: "unavailable", reasons: [], minimumSamples: null,
    denominator: coverage.settled, correct, incorrect, hitRate: null, brier: null, logLoss: null, calibrationError: null, confidenceZ: null, calibration: [] };
  const horizonId = horizon?.id ?? (observedHorizons.size === 1 ? [...observedHorizons][0] : null);
  const gates = protocol?.gates?.filter((g) => g.purpose === "public-claim" && g.family === family && g.system === source && g.horizonId === horizonId) ?? [];
  metrics.minimumSamples = gates.length ? Math.max(...gates.map((g) => g.minimumSamples)) : null;
  if (!protocol) metrics.reasons = ["unapproved-policy", ...(coverage.settled === 0 ? ["no-settled-samples"] : [])];
  else if (coverage.settled === 0) metrics.reasons = ["no-settled-samples"];
  else if (outOfPolicy || included.some((r) => !protocol.competitionIds.includes(r.fixture.season.competitionId))) metrics.reasons = ["outside-approved-policy-scope"];
  else if (!horizonId) metrics.reasons = ["mixed-or-unknown-horizons-use-horizon-cells"];
  else if (!gates.length) metrics.reasons = ["missing-public-sample-and-quality-gate"];
  else if (coverage.settled < metrics.minimumSamples!) { metrics.state = "insufficient-sample"; metrics.reasons = ["insufficient-settled-samples"]; }
  else {
    const evaluated = evaluateMarketMetrics(family, observations, protocol.calibrationBands, protocol.confidenceZ);
    if (evaluated.count !== coverage.settled || evaluated.correct !== correct || evaluated.incorrect !== incorrect) throw new MatchFeedError("unavailable");
    const checks = gates.map((g) => evaluateQualityGate(g, evaluated, coverage));
    const pending = checks.flatMap((c) => c.reasons), failures = checks.flatMap((c) => c.failures);
    if (!Number.isFinite(evaluated.logLoss)) failures.push("non-finite-log-loss");
    if (pending.length || failures.length) {
      metrics.state = failures.length ? "quality-gate-failed" : "unavailable"; metrics.reasons = [...new Set([...pending, ...failures])];
    } else {
      Object.assign(metrics, { state: "available", hitRate: evaluated.hitRate, brier: evaluated.brier, logLoss: evaluated.logLoss,
        calibrationError: evaluated.calibrationError, confidenceZ: protocol.confidenceZ, calibration: evaluated.calibration });
    }
  }
  return { family, source, label: source === "combined" ? "Combined AI / API-Football fallback" : source === "ai" ? "AI" : "API-Football fallback",
    horizon, coverage, metrics, versions: [...versions.values()].sort((a, b) => `${a.source}:${a.modelVersionId}:${a.version}`.localeCompare(`${b.source}:${b.modelVersionId}:${b.version}`, "en")),
    evidence: { total: coverage.available, truncated: coverage.available > links.length, links } };
}

export function aggregatePerformance(snapshot: PerformanceSnapshot, query: PerformanceQuery, asOf: number,
  protocol: EvaluationProtocol | null): PerformanceResponse {
  const families = query.market === "all" ? performanceFamilies : [query.market];
  const cells = families.flatMap((family) => [null, ...(protocol?.horizons ?? [])].flatMap((horizon) =>
    (["combined", "ai", "api-football"] as const).map((source) => cellFor(snapshot, query, family, source, horizon, protocol))));
  const latest = (times: (number | null)[]) => times.reduce<number | null>((max, at) => at === null ? max : Math.max(max ?? at, at), null);
  return performanceResponseSchema.parse({ asOf, filters: { market: query.market, source: query.source, model: query.model, version: query.version },
    cohort: { from: query.range.startDate, to: query.range.endDate, startInclusive: query.range.window.startInclusive, endExclusive: query.range.window.endExclusive,
      timezone: "Africa/Kampala", basis: "current-fixture-kickoff-applicable-cycle-locked-selection", fixtureCount: snapshot.records.length,
      filterAccounting: "nonmatching-available-forecasts-are-filtered-out;unattributed-unavailable-and-void-remain",
      horizonBasis: "scheduled-kickoff-minus-locked-publication;horizon-cells-only-known-locks" },
    policy: { id: protocol?.id ?? null, state: protocol ? "verified" : "unapproved", publicClaimAuthorized: false, provisional: true }, cells,
    comparisons: families.map((family) => ({ family, candidate: "ai", reference: "api-football", state: "unavailable", reason: "no-matched-locked-forecasts",
      count: 0, brierDifference: null, matchBasis: "same-fixture-family-evidence-cutoff-and-horizon" })),
    historicalCycles: snapshot.historicalCycles, operations: snapshot.operations,
    freshness: { snapshotKey: evidenceFingerprint({ query, policy: protocol?.id ?? null, cells, historicalCycles: snapshot.historicalCycles, operations: snapshot.operations,
      fixtures: snapshot.records.map((r) => ({ id: r.fixture.id, version: r.fixture.dataVersion, cycle: r.cycle, result: r.result?.id ?? null })),
      settlements: snapshot.settlements.map((s) => s.id).sort() }), lastSettledAt: latest(snapshot.settlements.map((s) => s.at)),
      lastCorrectedAt: latest(snapshot.settlements.map((s) => s.correctedAt)), invalidatedBy: ["fixture-or-cycle-change", "locked-revision-change",
        "result-or-settlement-correction", "refresh-job-or-receipt-change", "evaluation-policy-change"] } });
}

export function createPerformanceService(options: Readonly<{ database: DatabaseRuntime; competitionIds: readonly number[];
  clock?: Clock; policy?: PerformancePolicyBinding | null; cache?: PublicResponseCache }>) {
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const policy = options.policy ?? null;
  return Object.freeze({ async query(parameters = new URLSearchParams()): Promise<PerformanceResponse> {
    const asOf = clock.now(), query = parsePerformanceQuery(parameters, getReportingDate(asOf));
    const configured = z.array(z.number().int().positive().max(2_147_483_647)).min(1).max(maximumCompetitionScope).safeParse(options.competitionIds);
    if (!configured.success || new Set(configured.data).size !== configured.data.length) throw new MatchFeedError("unavailable");
    const protocol = verifiedPolicy(policy, asOf);
    try {
      const read = () => options.database.transaction(async (tx) => {
        const snapshot = await readPerformanceSnapshot(tx, query, configured.data);
        // A revoked approval cannot survive an in-flight stored read.
        const current = verifiedPolicy(policy, asOf);
        return aggregatePerformance(snapshot, query, asOf, current?.id === protocol?.id ? current : null);
      }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 30_000 });
      let response = options.cache ? await options.cache.read(publicCacheDescriptor({ kind: "performance", locale: "en", now: asOf,
        query: { projection: 2, ...query }, range: query.range, scope: { competitionIds: [...configured.data].sort((a, b) => a - b), protocol },
        parse: (value) => performanceResponseSchema.parse(value) }), read) : await read();
      // Preserve the reader's unapproved/counts-only response when permission is
      // revoked during a cache probe; never reuse previously approved metrics.
      if (options.cache && verifiedPolicy(policy, clock.now())?.id !== protocol?.id) response = await read();
      if (Buffer.byteLength(JSON.stringify(response), "utf8") > matchFeedRules.maximumResponseBytes) throw new MatchFeedError("unavailable");
      return freezeEvidence(response);
    } catch { throw new MatchFeedError("unavailable"); }
  } });
}
