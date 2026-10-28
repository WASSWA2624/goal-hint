import "server-only";

import { z } from "zod";
import { createHash } from "node:crypto";
import { addReportingDays, getReportingDate, utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { maximumCompetitionScope } from "../../domain/feed-query.ts";
import { matchFeedRules } from "../../domain/match-feed.ts";
import { performanceFamilies, performanceResponseSchema, performanceRules, type PerformanceCell, type PerformanceCoverage, type PerformanceLeague, type PerformanceResponse, type PerformanceSource } from "../../domain/performance.ts";
import type { MarketFamily } from "../../domain/markets.ts";
import { canonicalMatchSlug } from "../../domain/match-slug.ts";
import { matchHref } from "../../domain/navigation.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import type { EvaluationProtocol, HorizonBand } from "../evaluation/evaluation-contract.ts";
import { evaluateQualityGate } from "../evaluation/evaluation-gates.ts";
import { parseEvaluationProtocol } from "../evaluation/evaluation-input.ts";
import { createMarketMetricsAccumulator } from "../evaluation/evaluation-metrics.ts";
import { MatchFeedError } from "../matches/feed-error.ts";
import { parsePerformanceQuery, type PerformanceQuery } from "./performance-query.ts";
import { readPerformanceBatches, type PerformanceSnapshot } from "./performance-read.ts";
import { publicCacheDescriptor, type PublicResponseCache } from "../cache/public-cache.ts";
import { summarizePickPerformance, type PickPerformanceSample } from "../../domain/pick-performance.ts";
import { performanceQuoteKey, verifiedQuotePolicy, type PerformanceQuoteBinding } from "./performance-quotes.ts";
import { prepareDemoRange } from "../demo/read-seed.ts";
import { demoAnalyticsCacheDescriptor } from "../demo/analytics-cache.ts";

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
const competitionIdentity = z.uuid();
type AvailablePrediction = Extract<NonNullable<Record["revision"]>["candidate"]["markets"][MarketFamily], { available: true }>;
function matchesFilters(query: PerformanceQuery, source: PerformanceSource, item: AvailablePrediction, version: PerformanceCell["versions"][number]) {
  return (query.source === "combined" || query.source === item.market.source) && (source === "combined" || source === item.market.source) &&
    (query.model === null || query.model === version.modelVersionId) && (query.version === null || query.version === version.version);
}
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
function createCellAccumulator(query: PerformanceQuery, family: MarketFamily, source: PerformanceSource,
  horizon: HorizonBand | null, protocol: EvaluationProtocol | null) {
  const coverage = blankCoverage(), links: PerformanceCell["evidence"]["links"] = [];
  const versions = new Map<string, PerformanceCell["versions"][number]>(), observedHorizons = new Set<string>();
  const returnSamples: PickPerformanceSample[] = [];
  const observationMetrics = protocol ? createMarketMetricsAccumulator(family, protocol.calibrationBands, protocol.confidenceZ) : null;
  let correct = 0, incorrect = 0, outOfPolicy = false, outsideCompetition = false;
  function keepSample(sample: PickPerformanceSample, shared: Map<string, PickPerformanceSample>) {
    const key = `${family}:${sample.revisionId}`, existing = shared.get(key);
    if (!existing) shared.set(key, sample);
    returnSamples.push(existing ?? sample);
  }
  function add(record: Record, models: PerformanceSnapshot["models"], quotes: PerformanceSnapshot["quotes"], shared: Map<string, PickPerformanceSample>) {
    const { cycle, revision, result, projection } = record;
    const horizonMs = cycle && revision ? cycle.kickoffAt - revision.publishedAt : null;
    if (horizon && (horizonMs === null || horizonMs < horizon.minimumMs || horizonMs >= horizon.maximumMs)) return;
    coverage.total++;
    if (protocol && !protocol.competitionIds.includes(record.fixture.season?.competitionId ?? "")) outsideCompetition = true;
    const entry = projection?.markets.find((m) => m.base.family === family), previous = entry?.previous;
    const coherent = previous && previous.inputHash === entry?.inputHash && previous.lockedSetId === cycle?.lockedSetId;
    if (cycle?.state === "void" || coherent && previous.status === "void") {
      coverage.void++;
      const locked = revision?.candidate.markets[family];
      if (revision && locked?.available && matchesFilters(query, source, locked, versionFor(record, family, models)!)) {
        keepSample({ revisionId: revision.id, publishedAt: revision.publishedAt, outcome: "void", quotedOdds: null }, shared);
      }
      return;
    }
    const item = cycle?.state === "closed" ? revision?.candidate.markets[family] : null;
    if (!item?.available) { coverage.unavailable++; return; }
    const version = versionFor(record, family, models)!;
    if (!matchesFilters(query, source, item, version)) {
      coverage.filteredOut++; return;
    }
    coverage.available++; coverage.sources[item.market.source]++;
    versions.set(evidenceFingerprint(version), version);
    const settledOutcome = coherent && result?.regulation.verified && (previous.status === "correct" || previous.status === "incorrect")
      ? previous.status === "correct" ? "won" : "lost" : "pending";
    keepSample({ revisionId: revision!.id, publishedAt: revision!.publishedAt, outcome: settledOutcome,
      quotedOdds: quotes?.get(`${performanceQuoteKey(revision!.id, family)}:${item.market.selection}`) ?? null }, shared);
    const knownHorizon = protocol?.horizons.find((h) => horizonMs! >= h.minimumMs && horizonMs! < h.maximumMs);
    if (knownHorizon) observedHorizons.add(knownHorizon.id); else outOfPolicy = true;
    if (!protocol?.competitionIds.includes(record.fixture.season?.competitionId ?? "") ||
      version.source === "ai" && version.modelVersionId !== protocol?.candidateModel?.id ||
      version.source === "api-football" && version.version !== protocol?.providerContractVersion) outOfPolicy = true;
    if (links.length < performanceRules.maximumEvidenceLinks) links.push({ fixtureId: record.fixture.id, cycleId: cycle!.id,
      revisionId: revision!.id, source: item.market.source, evidenceCutoffAt: revision!.evidenceCutoffAt, forecastAt: revision!.publishedAt, forecastHorizonMs: horizonMs!,
      href: `/api/matches/${record.fixture.id}?revision=${revision!.id}`,
      matchLabel: `${record.fixture.homeTeam.name ?? "Home"} v ${record.fixture.awayTeam.name ?? "Away"}`,
      pageHref: `${matchHref(record.fixture.id, canonicalMatchSlug(record.fixture.homeTeam.name, record.fixture.awayTeam.name))}?revision=${revision!.id}#revision-history` });
    if (coherent && result?.regulation.verified && (previous.status === "correct" || previous.status === "incorrect")) {
      coverage.settled++; if (previous.status === "correct") correct++; else incorrect++;
      observationMetrics?.add([{ market: item.market, result: { status: result.status, cycleEligibility: { eligible: true },
        regulationScore: { verified: true, period: "regulation-including-stoppage-time", home: result.regulation.home!, away: result.regulation.away! } } }]);
    } else coverage.pending++;
  }
  function finish(): PerformanceCell {
    const metrics: PerformanceCell["metrics"] = { state: "unavailable", reasons: [], minimumSamples: null,
      denominator: coverage.settled, correct, incorrect, hitRate: null, brier: null, logLoss: null, calibrationError: null, confidenceZ: null, calibration: [] };
    const horizonId = horizon?.id ?? (observedHorizons.size === 1 ? [...observedHorizons][0] : null);
    const gates = protocol?.gates?.filter((g) => g.purpose === "public-claim" && g.family === family && g.system === source && g.horizonId === horizonId) ?? [];
    metrics.minimumSamples = gates.length ? Math.max(...gates.map((g) => g.minimumSamples)) : null;
    if (!protocol) metrics.reasons = ["unapproved-policy", ...(coverage.settled === 0 ? ["no-settled-samples"] : [])];
    else if (coverage.settled === 0) metrics.reasons = ["no-settled-samples"];
    else if (outOfPolicy || outsideCompetition) metrics.reasons = ["outside-approved-policy-scope"];
    else if (!horizonId) metrics.reasons = ["mixed-or-unknown-horizons-use-horizon-cells"];
    else if (!gates.length) metrics.reasons = ["missing-public-sample-and-quality-gate"];
    else if (coverage.settled < metrics.minimumSamples!) { metrics.state = "insufficient-sample"; metrics.reasons = ["insufficient-settled-samples"]; }
    else {
      const evaluated = observationMetrics!.snapshot();
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
      returns: summarizePickPerformance(returnSamples), evidence: { total: coverage.available, truncated: coverage.available > links.length, links } };
  }
  return Object.freeze({ add, finish });
}

/** Aggregates one bounded validated database batch at a time. Candidate/evidence JSON
 * leaves memory after add(); only sufficient metric totals, bounded links, freshness
 * identities and compact publication-order return samples survive between batches. */
export function createPerformanceAccumulator(query: PerformanceQuery, asOf: number, protocol: EvaluationProtocol | null) {
  const families = query.market === "all" ? performanceFamilies : [query.market];
  const cells = families.flatMap((family) => [null, ...(protocol?.horizons ?? [])].flatMap((horizon) =>
    (["combined", "ai", "api-football"] as const).map((source) => createCellAccumulator(query, family, source, horizon, protocol))));
  const groups = new Map<string | null, { competition: PerformanceLeague["competition"]; fixtureCount: number;
    cells: ReturnType<typeof createCellAccumulator>[] }>();
  const fixtureHash = createHash("sha256"), settlementIds: string[] = [];
  let fixtureCount = 0, lastSettledAt: number | null = null, lastCorrectedAt: number | null = null;
  const historicalCycles: PerformanceSnapshot["historicalCycles"] = { basis: "void-cycle-original-kickoff-in-period-excluding-applicable-cycle", void: 0, postponed: 0 };
  const operations: PerformanceSnapshot["operations"] = { basis: "refresh-jobs-for-current-cohort-fixtures-across-runs", total: 0,
    failed: 0, pending: 0, failedFixtures: 0, delayedRefreshes: 0, delayedFixtures: 0 };
  function add(snapshot: PerformanceSnapshot) {
    const shared = new Map<string, PickPerformanceSample>();
    fixtureCount += snapshot.records.length;
    if (fixtureCount > performanceRules.maximumCohortFixtures) throw new MatchFeedError("unavailable");
    for (const record of snapshot.records) {
      fixtureHash.update(evidenceSerialize({ id: record.fixture.id, version: record.fixture.dataVersion, cycle: record.cycle, result: record.result?.id ?? null }) + "\n");
      for (const cell of cells) cell.add(record, snapshot.models, snapshot.quotes, shared);
      const candidate = record.fixture.season?.competitionId, id = competitionIdentity.safeParse(candidate).success ? candidate : null;
      let group = groups.get(id);
      if (!group) {
        const competition = id === null ? null : record.fixture.season?.competition;
        group = { competition: { id, name: competition?.name?.trim() || null, country: competition?.country?.trim() || null }, fixtureCount: 0,
          cells: families.map((family) => createCellAccumulator(query, family, query.source, null, protocol)) };
        groups.set(id, group);
      }
      group.fixtureCount++;
      for (const cell of group.cells) cell.add(record, snapshot.models, snapshot.quotes, shared);
    }
    for (const settlement of snapshot.settlements) {
      settlementIds.push(settlement.id);
      lastSettledAt = Math.max(lastSettledAt ?? settlement.at, settlement.at);
      if (settlement.correctedAt !== null) lastCorrectedAt = Math.max(lastCorrectedAt ?? settlement.correctedAt, settlement.correctedAt);
    }
    historicalCycles.void += snapshot.historicalCycles.void;
    historicalCycles.postponed += snapshot.historicalCycles.postponed;
    for (const key of ["total", "failed", "pending", "failedFixtures", "delayedRefreshes", "delayedFixtures"] as const) operations[key] += snapshot.operations[key];
  }
  function finish(): PerformanceResponse {
    const completedCells = cells.map((cell) => cell.finish());
    const ordered = [...groups.values()].sort((a, b) => a.competition.id === null ? 1 : b.competition.id === null ? -1
      : `${a.competition.country ?? ""}:${a.competition.name ?? ""}:${a.competition.id}`.localeCompare(`${b.competition.country ?? ""}:${b.competition.name ?? ""}:${b.competition.id}`, "en"));
    const leagues: PerformanceResponse["leagues"] = { basis: "same-current-fixture-cohort-grouped-by-competition", totalGroups: ordered.length,
      page: query.leaguePage, pageSize: performanceRules.leaguePageSize,
      records: ordered.slice((query.leaguePage - 1) * performanceRules.leaguePageSize, query.leaguePage * performanceRules.leaguePageSize).map((group) => ({
        competition: group.competition, fixtureCount: group.fixtureCount, cells: group.cells.map((aggregate) => {
          const cell = aggregate.finish(); return { family: cell.family, source: cell.source, coverage: cell.coverage,
            metrics: { ...cell.metrics, calibration: [] }, returns: cell.returns };
        }),
      })) };
    return performanceResponseSchema.parse({ asOf, filters: { market: query.market, source: query.source, model: query.model, version: query.version },
      cohort: { from: query.range.startDate, to: query.range.endDate, startInclusive: query.range.window.startInclusive, endExclusive: query.range.window.endExclusive,
        timezone: "Africa/Kampala", basis: "current-fixture-kickoff-applicable-cycle-locked-selection", fixtureCount,
        filterAccounting: "nonmatching-available-forecasts-are-filtered-out;unattributed-unavailable-and-void-remain",
        horizonBasis: "scheduled-kickoff-minus-locked-publication;horizon-cells-only-known-locks" },
      policy: { id: protocol?.id ?? null, state: protocol ? "verified" : "unapproved", publicClaimAuthorized: false, provisional: true }, cells: completedCells, leagues,
      comparisons: families.map((family) => ({ family, candidate: "ai", reference: "api-football", state: "unavailable", reason: "no-matched-locked-forecasts",
        count: 0, brierDifference: null, matchBasis: "same-fixture-family-evidence-cutoff-and-horizon" })), historicalCycles, operations,
      freshness: { snapshotKey: evidenceFingerprint({ query, policy: protocol?.id ?? null, cells: completedCells, leagues, historicalCycles, operations,
        fixtures: fixtureHash.copy().digest("hex"), settlements: [...settlementIds].sort() }), lastSettledAt, lastCorrectedAt,
        invalidatedBy: ["fixture-or-cycle-change", "locked-revision-change", "result-or-settlement-correction", "refresh-job-or-receipt-change", "evaluation-policy-change"] } });
  }
  return Object.freeze({ add, finish });
}

export function aggregatePerformance(snapshot: PerformanceSnapshot, query: PerformanceQuery, asOf: number, protocol: EvaluationProtocol | null): PerformanceResponse {
  const accumulator = createPerformanceAccumulator(query, asOf, protocol);
  accumulator.add(snapshot);
  return accumulator.finish();
}

export function createPerformanceService(options: Readonly<{ database: DatabaseRuntime; competitionIds: readonly number[];
  clock?: Clock; policy?: PerformancePolicyBinding | null; quoteBinding?: PerformanceQuoteBinding | null; cache?: PublicResponseCache }>) {
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const policy = options.policy ?? null;
  const quoteBinding = options.quoteBinding ?? null;
  return Object.freeze({ async query(parameters = new URLSearchParams()): Promise<PerformanceResponse> {
    const asOf = clock.now(), query = parsePerformanceQuery(parameters, getReportingDate(asOf));
    const configured = z.array(z.number().int().positive().max(2_147_483_647)).min(1).max(maximumCompetitionScope).safeParse(options.competitionIds);
    if (!configured.success || new Set(configured.data).size !== configured.data.length) throw new MatchFeedError("unavailable");
    const protocol = verifiedPolicy(policy, asOf);
    const quotePolicy = verifiedQuotePolicy(quoteBinding);
    const demo = isDevelopmentDemo();
    try {
      const prepare = async () => {
        await prepareDemoRange(options.database, query.range, asOf);
        if (demo) {
          const { ensureDemoPublicationQuotes } = await import("../demo/publication-quotes.ts");
          await ensureDemoPublicationQuotes(options.database,
            Array.from({ length: query.range.dayCount }, (_, index) => addReportingDays(query.range.startDate, index)), asOf);
        }
      };
      const read = () => options.database.transaction(async (tx) => {
        const collect = async () => {
          const current = verifiedPolicy(policy, asOf), active = current?.id === protocol?.id ? current : null;
          const currentQuotes = verifiedQuotePolicy(quoteBinding);
          // A grant gained after the query began cannot enter a response/cache scope
          // created without it; a changed or revoked original grant yields no prices.
          const grantedQuotes = evidenceFingerprint(currentQuotes) === evidenceFingerprint(quotePolicy) ? quotePolicy : null;
          const accumulator = createPerformanceAccumulator(query, asOf, active);
          for await (const batch of readPerformanceBatches(tx, query, configured.data, grantedQuotes)) accumulator.add(batch);
          return { response: accumulator.finish(), policyId: active?.id ?? null, quotes: grantedQuotes };
        };
        let collected = await collect();
        // Revocation during streaming requires a new bounded aggregate under the remaining permissions.
        const current = verifiedPolicy(policy, asOf);
        if (collected.policyId !== (current?.id === protocol?.id ? current?.id ?? null : null)
          || evidenceFingerprint(collected.quotes) !== evidenceFingerprint(verifiedQuotePolicy(quoteBinding))) collected = await collect();
        return collected.response;
      }, { isolationLevel: "RepeatableRead", maxWait: 5000,
        // The local synthetic cohort contains 560 fixtures each day; retain one
        // bounded snapshot for its full month while production keeps its budget.
        timeout: demo ? 240_000 : 30_000 });
      const descriptor = publicCacheDescriptor({ kind: "performance", locale: "en", now: asOf,
        query: { projection: 7, ...query }, range: query.range, scope: { competitionIds: [...configured.data].sort((a, b) => a - b), protocol, quotePolicy },
        parse: (value) => performanceResponseSchema.parse(value) });
      let response: PerformanceResponse;
      if (demo && options.cache) {
        // Keep the validated synthetic month for an hour with its original
        // source clock. A hit must precede materialization, which changes tags.
        const demoDescriptor = demoAnalyticsCacheDescriptor(descriptor, asOf), cache = options.cache;
        response = await cache.read(demoDescriptor, async () => {
          await prepare();
          // Preparation can advance generations. Obtain the resulting stamp for
          // the normal snapshot fill; the outer stale stamp is rejected safely.
          return cache.read(demoDescriptor, read);
        });
      } else {
        await prepare();
        response = options.cache ? await options.cache.read(descriptor, read) : await read();
      }
      // Preserve the reader's unapproved/counts-only response when permission is
      // revoked during a cache probe; never reuse previously approved metrics.
      // Quote grants also recheck after uncached transaction wrappers return.
      if (options.cache && verifiedPolicy(policy, clock.now())?.id !== protocol?.id ||
        evidenceFingerprint(verifiedQuotePolicy(quoteBinding)) !== evidenceFingerprint(quotePolicy)) response = await read();
      if (Buffer.byteLength(JSON.stringify(response), "utf8") > matchFeedRules.maximumResponseBytes) throw new MatchFeedError("unavailable");
      return freezeEvidence(response);
    } catch { throw new MatchFeedError("unavailable"); }
  } });
}
