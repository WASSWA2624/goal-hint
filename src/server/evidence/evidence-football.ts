import "server-only";

import { getReportingDate, parseReportingDate, utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import type { createApiFootballAdapter } from "../football/api-football-adapter.ts";
import { API_FOOTBALL_CONTRACT_VERSION, apiFootballEndpoints, type ApiFootballBounds,
  type ApiFootballEndpoint, type ApiFootballResult } from "../football/api-football-contract.ts";
import { parseCatalogEvidenceRef, parseCatalogImportRequest } from "../football/catalog-input.ts";
import type { CatalogFixtureSnapshot } from "../football/catalog-mysql-store.ts";
import type { NormalizedAvailability, NormalizedFixture, NormalizedStatistics } from "../football/api-football-normalize.ts";
import type { EvidenceAuthority, EvidenceClaim, EvidenceContext, EvidencePolicy, EvidenceSource, EvidenceWorkflow } from "./evidence-contract.ts";
import { EvidenceInputError, evidenceFingerprint, evidenceSourceId, freezeEvidence, parseEvidenceContext,
  parseEvidencePolicy, parseEvidenceSource } from "./evidence-input.ts";
import { evidenceSourceExclusion } from "./evidence-snapshot.ts";

type FootballAdapter = ReturnType<typeof createApiFootballAdapter>["evidence"];
type FootballRow = NormalizedFixture | NormalizedAvailability | NormalizedStatistics;
export type FootballEvidencePlan = Readonly<{
  from: string; to: string; historyLimitPerTeam: number; statisticsLimitPerTeam: number;
  includeInjuries: boolean; includeLineups: boolean;
  maxRequests: number; maxElapsedMs: number; bounds: ApiFootballBounds;
  evidenceRef: string; reuse: EvidenceSource["reuse"];
}>;
export type FootballEvidenceCollection = Readonly<{
  sources: readonly EvidenceSource[]; requestsDispatched: number; requestCountUnknown: boolean;
  issues: readonly Readonly<{ kind: "history" | "statistic" | "injury" | "lineup"; reason: "unavailable" | "unverified" | "timeout" | "request-limit" }>[];
}>;
const systemClock: Clock = { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
const positive = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
const nonnegative = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
function synchronous(value: unknown): unknown { if (value instanceof Promise) void value.catch(() => undefined); return value; }
export function parseFootballEvidencePlan(value: unknown, context: EvidenceContext): FootballEvidencePlan {
  try {
    const input = value as FootballEvidencePlan;
    if (!input || Object.keys(input).some((key) => !["from", "to", "historyLimitPerTeam", "statisticsLimitPerTeam",
      "includeInjuries", "includeLineups", "maxRequests", "maxElapsedMs", "bounds", "evidenceRef", "reuse"].includes(key))) throw new Error();
    const from = parseReportingDate(input.from), to = parseReportingDate(input.to), bounds = input.bounds;
    if (from > to || to > getReportingDate(context.cutoffAt) || !positive(input.historyLimitPerTeam)
      || !nonnegative(input.statisticsLimitPerTeam) || input.statisticsLimitPerTeam > input.historyLimitPerTeam
      || typeof input.includeInjuries !== "boolean" || typeof input.includeLineups !== "boolean"
      || !positive(input.maxRequests) || !positive(input.maxElapsedMs) || input.maxElapsedMs > 2_147_483_647
      || !bounds
      || !input.reuse || typeof input.reuse.allowSummary !== "boolean" || typeof input.reuse.evidenceRef !== "string"
      || !input.reuse.evidenceRef.trim() || !Number.isSafeInteger(input.reuse.retainUntil)) throw new Error();
    const evidenceRef = parseCatalogEvidenceRef(input.evidenceRef), reuseRef = parseCatalogEvidenceRef(input.reuse.evidenceRef);
    const retainUntil = utcInstantFromEpochMilliseconds(input.reuse.retainUntil);
    // Reuse the existing strict adapter-bounds contract; this performs no catalog import or run creation.
    const request = parseCatalogImportRequest({ id: context.fixtureId, selection: { kind: "fixtures",
      query: { teamId: context.home.externalId, from, to } }, bounds, retentionEvidenceRef: evidenceRef });
    if (!input.reuse.allowSummary || retainUntil < context.analysisAt) throw new Error();
    return freezeEvidence(structuredClone({ ...input, from, to, bounds: request.bounds, evidenceRef,
      reuse: { allowSummary: true, retainUntil, evidenceRef: reuseRef } }));
  } catch { throw new EvidenceInputError(); }
}
function sameFixture(fixture: CatalogFixtureSnapshot, context: EvidenceContext): boolean {
  return fixture.id === context.fixtureId && fixture.dataVersion === context.fixtureVersion && fixture.externalId === context.externalFixtureId
    && fixture.homeTeamId === context.home.teamId && fixture.awayTeamId === context.away.teamId && fixture.kickoff === context.kickoffAt
    && fixture.homeExternalIds.includes(context.home.externalId) && fixture.awayExternalIds.includes(context.away.externalId);
}
function provenance<Row extends FootballRow>(result: ApiFootballResult<Row>, endpoint: ApiFootballEndpoint,
  parameters: Readonly<Record<string, string>>, bounds: ApiFootballBounds): boolean {
  try {
    if (!Array.isArray(result.data) || result.data.length > bounds.maxRows || !Array.isArray(result.provenance) ||
      result.provenance.length > bounds.maxRequests + 1 || !["complete", "partial", "failed"].includes(result.status)) return false;
    return result.provenance.every((page) => page.provider === "api-football" && page.endpoint === endpoint &&
      page.contractVersion === API_FOOTBALL_CONTRACT_VERSION && evidenceFingerprint(page.requestParameters) === evidenceFingerprint(parameters) &&
      utcInstantFromEpochMilliseconds(page.retrievedAt) === page.retrievedAt && (page.providerUpdatedAt === null ||
        utcInstantFromEpochMilliseconds(page.providerUpdatedAt) <= page.retrievedAt) && typeof page.fromCache === "boolean") &&
      result.data.every((row) => row.source.provider === "api-football" && row.source.endpoint === apiFootballEndpoints[endpoint].path &&
        result.provenance.some((page) => page.currentPage === 1 && page.totalPages === 1 && page.quota.kind === "success" &&
          page.retrievedAt === row.source.retrievedAt && page.providerUpdatedAt === row.source.providerUpdatedAt) &&
        ("homeTeam" in row ? [row.homeTeam.source, row.awayTeam.source, row.competition.source] : [row.team.source])
          .every((source) => evidenceFingerprint(source) === evidenceFingerprint(row.source)));
  } catch { return false; }
}
function canonicalHistory(row: NormalizedFixture, fixture: CatalogFixtureSnapshot | null,
  team: EvidenceContext["home"], context: EvidenceContext): fixture is CatalogFixtureSnapshot {
  return fixture !== null && fixture.externalId === row.id && fixture.kickoff === row.kickoff && fixture.status === row.status &&
    fixture.providerStatus === row.providerStatus && fixture.homeExternalIds.includes(row.homeTeam.id) && fixture.awayExternalIds.includes(row.awayTeam.id) &&
    (row.homeTeam.id === team.externalId ? fixture.homeTeamId === team.teamId : fixture.awayTeamId === team.teamId) &&
    fixture.regulationScore?.verified === true && fixture.regulationScore.period === "regulation-including-stoppage-time" &&
    fixture.regulationScore.home === row.regulationScore?.home && fixture.regulationScore.away === row.regulationScore?.away &&
    typeof fixture.regulationEvidenceRef === "string" && fixture.regulationEvidenceRef.trim().length > 0 &&
    fixture.regulationVerifiedAt !== null && fixture.regulationVerifiedAt <= context.cutoffAt &&
    fixture.retrievedAt <= context.cutoffAt && (fixture.providerUpdatedAt === null || fixture.providerUpdatedAt <= context.cutoffAt);
}

/** Uses only the existing quota-controlled primary football adapter; provider forecasts are unreachable. */
export function createFootballEvidenceCollector(options: Readonly<{
  adapter: Pick<FootballAdapter, "fixtures" | "statistics" | "availability">;
  catalog: Readonly<{ fixtureByProviderId(id: number): Promise<CatalogFixtureSnapshot | null> }>;
  authority: EvidenceAuthority; clock?: Clock;
  verifyPlan(plan: FootballEvidencePlan, context: EvidenceContext): boolean;
  verifyFootball(result: ApiFootballResult<FootballRow>, context: EvidenceContext, plan: FootballEvidencePlan): boolean;
}>) {
  const clock = options.clock ?? systemClock;
  return Object.freeze({ async collect(contextInput: EvidenceContext, policyInput: EvidencePolicy, planInput: FootballEvidencePlan,
    workflow?: EvidenceWorkflow): Promise<FootballEvidenceCollection> {
    const context = parseEvidenceContext(contextInput), policy = parseEvidencePolicy(policyInput), selected = parseFootballEvidencePlan(planInput, context);
    function authorize() {
      try {
        if (workflow !== undefined && synchronous(workflow.check()) !== undefined) throw new EvidenceInputError();
        if (workflow?.signal.aborted) throw new EvidenceInputError();
      } catch { throw new EvidenceInputError(); }
      try {
        if (synchronous(options.authority.authorize(context)) !== undefined || synchronous(options.authority.verifyContext(context)) !== true ||
          synchronous(options.authority.verifyPolicy(policy)) !== true || synchronous(options.verifyPlan(selected, context)) !== true) throw new Error();
      } catch { throw new EvidenceInputError("not-authorized"); }
    }
    authorize();
    function now() { try { return utcInstantFromEpochMilliseconds(clock.now()); } catch { throw new EvidenceInputError(); } }
    const startedAt = performance.now(), startTime = now();
    const deadline = Math.min(selected.bounds.deadlineAt, startTime + selected.maxElapsedMs,
      workflow === undefined ? Infinity : utcInstantFromEpochMilliseconds(workflow.deadlineAt));
    const sources: EvidenceSource[] = [], issues: FootballEvidenceCollection["issues"][number][] = [];
    let requestsDispatched = 0, unknownDispatch = false;
    const binding = { fixtureId: context.fixtureId, fixtureVersion: context.fixtureVersion, externalFixtureId: context.externalFixtureId,
      homeTeamId: context.home.teamId, awayTeamId: context.away.teamId, homeExternalId: context.home.externalId, awayExternalId: context.away.externalId };
    function sourcePermission(value: EvidenceSource): boolean {
      try { return synchronous(options.authority.verifySource(value, context)) === true &&
        synchronous(options.authority.verifyReuse(value, context, policy)) === true && value.reuse.retainUntil >= now(); }
      catch { return false; }
    }
    function source(key: unknown, title: string, retrievedAt: EvidenceSource["retrievedAt"], updatedAt: EvidenceSource["providerUpdatedAt"], claims: EvidenceClaim[]) {
      if (claims.length === 0) return null;
      const body: Omit<EvidenceSource, "id"> = { kind: "football", sourceKey: evidenceFingerprint(key), syndicationKey: null,
        version: "football-evidence-v1", publisher: "API-Football", title, sourceUrl: null, publishedAt: null,
        retrievedAt, providerUpdatedAt: updatedAt, binding, evidenceRef: selected.evidenceRef, reuse: selected.reuse, claims };
      const value = parseEvidenceSource({ ...body, id: evidenceSourceId(body) }, policy);
      if (!sourcePermission(value)) return null;
      if (sources.length >= policy.bounds.maxSources) throw new EvidenceInputError("snapshot-too-large");
      sources.push(value);
      // Preserve excluded sources for explicit snapshot flags, while derivations only use eligible observations.
      return evidenceSourceExclusion(value, context, policy) === null ? value : null;
    }
    async function bounded<Value>(operation: () => Promise<Value>): Promise<Value> {
      const remaining = Math.min(deadline - now(), selected.maxElapsedMs - (performance.now() - startedAt));
      if (remaining <= 0 || now() < startTime) throw new EvidenceInputError();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const abort = () => abortWait?.();
      let abortWait: (() => void) | undefined;
      try {
        const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new EvidenceInputError()), remaining); });
        const aborted = new Promise<never>((_resolve, reject) => { abortWait = () => reject(new EvidenceInputError()); });
        workflow?.signal.addEventListener("abort", abort, { once: true });
        const value = await Promise.race([Promise.resolve().then(() => {
          authorize();
          if (now() >= deadline || performance.now() - startedAt >= selected.maxElapsedMs || now() < startTime) throw new EvidenceInputError();
          return operation();
        }), timeout, aborted]);
        authorize();
        if (now() >= deadline || performance.now() - startedAt >= selected.maxElapsedMs || now() < startTime) throw new EvidenceInputError();
        return value;
      } catch (error) { throw error instanceof EvidenceInputError ? error : new EvidenceInputError();
      } finally { if (timer !== undefined) clearTimeout(timer); workflow?.signal.removeEventListener("abort", abort); }
    }
    const fixture = await bounded(() => options.catalog.fixtureByProviderId(context.externalFixtureId));
    if (!fixture || !sameFixture(fixture, context)) throw new EvidenceInputError();
    // Home assignment is a fact. Neutral venue and numerical home advantage remain unknown.
    source({ kind: "canonical-venue", fixtureId: fixture.id, version: fixture.dataVersion }, "Canonical fixture home/away assignment",
      fixture.retrievedAt, fixture.providerUpdatedAt, [context.home, context.away].map((team, index) => ({ kind: "venue" as const,
        subjectTeamId: team.teamId, key: "venue-role", value: { role: index === 0 ? "home" : "away", neutral: null, venueName: null },
        summary: index === 0 ? "Listed home team; neutral venue status is unknown." : "Listed away team; neutral venue status is unknown.",
        certainty: "confirmed" as const, asOfAt: fixture.providerUpdatedAt })));
    async function call<Row extends FootballRow>(kind: FootballEvidenceCollection["issues"][number]["kind"], endpoint: ApiFootballEndpoint,
      parameters: Readonly<Record<string, string>>, operation: (bounds: ApiFootballBounds) => Promise<ApiFootballResult<Row>>) {
      authorize();
      if (unknownDispatch || requestsDispatched >= selected.maxRequests) { issues.push({ kind, reason: "request-limit" }); return null; }
      const remaining = Math.min(deadline - now(), selected.maxElapsedMs - (performance.now() - startedAt));
      if (remaining < 1 || now() < startTime) { issues.push({ kind, reason: "timeout" }); return null; }
      const bounds = { ...selected.bounds, deadlineAt: utcInstantFromEpochMilliseconds(deadline),
        timeoutMs: Math.min(selected.bounds.timeoutMs, Math.floor(remaining)), maxRequests: Math.min(selected.bounds.maxRequests, selected.maxRequests - requestsDispatched),
        // 007 has no external cancellation input. One attempt cannot launch a retry after this workflow stops waiting.
        retry: { ...selected.bounds.retry, maxAttempts: 1 } };
      let result: ApiFootballResult<Row>;
      try { result = await bounded(() => operation(bounds)); }
      catch (error) {
        if (error instanceof EvidenceInputError && error.reason === "not-authorized") throw error;
        unknownDispatch = true; issues.push({ kind, reason: "timeout" }); return null;
      }
      if (!result || !Array.isArray(result.data) || !Array.isArray(result.provenance) || !nonnegative(result.requestsDispatched) ||
        result.requestsDispatched > bounds.maxRequests) throw new EvidenceInputError();
      requestsDispatched += result.requestsDispatched;
      if (result.error?.reason === "transport-error" || result.error?.reason === "deadline-exceeded" ||
        result.error?.reason === "shared-work-pending" || result.provenance.some((page) => page.quota.kind === "uncertain")) unknownDispatch = true;
      authorize();
      let verified = false;
      try { verified = synchronous(options.verifyFootball(result, context, selected)) === true; } catch { /* Withhold private causes. */ }
      if (!verified || !provenance(result, endpoint, parameters, bounds)) { issues.push({ kind, reason: "unverified" }); return null; }
      if (result.status !== "complete") issues.push({ kind, reason: "unavailable" });
      return result;
    }
    for (const team of [context.home, context.away]) {
      const history = await call("history", "fixtures", { team: String(team.externalId), from: selected.from, to: selected.to, timezone: "Africa/Kampala" },
        (bounds) => options.adapter.fixtures({ teamId: team.externalId, from: selected.from, to: selected.to }, bounds));
      const rows = [...(history?.data ?? [])].filter((row) => row.id !== context.externalFixtureId && row.kickoff !== null
        && row.kickoff < context.cutoffAt && [row.homeTeam.id, row.awayTeam.id].includes(team.externalId)
        && ["finished-regulation", "finished-extra-time", "finished-penalties"].includes(row.status)
        && row.regulationScore?.verified === true && row.regulationScore.fixtureId === row.id &&
        row.regulationScore.providerStatus === row.providerStatus && row.regulationScore.period === "regulation-including-stoppage-time" &&
        row.regulationScore.sourceField === "score.fulltime" && getReportingDate(row.kickoff) >= selected.from &&
        getReportingDate(row.kickoff) <= selected.to).sort((a, b) => b.kickoff! - a.kickoff! || a.id - b.id);
      const accepted: { row: NormalizedFixture; source: EvidenceSource }[] = [], seen = new Set<number>();
      for (const row of rows) {
        if (accepted.length >= selected.historyLimitPerTeam) break;
        if (seen.has(row.id)) { issues.push({ kind: "history", reason: "unverified" }); continue; }
        seen.add(row.id);
        const canonical = await bounded(() => options.catalog.fixtureByProviderId(row.id));
        if (!canonicalHistory(row, canonical, team, context)) { issues.push({ kind: "history", reason: "unverified" }); continue; }
        const retained = source({ kind: "history", fixtureId: row.id, canonicalVersion: canonical.dataVersion,
          regulationEvidenceRef: canonical.regulationEvidenceRef }, "Verified regulation result", row.source.retrievedAt, row.source.providerUpdatedAt,
          [{ kind: "history", subjectTeamId: team.teamId, key: `fixture-${row.id}`, value: { fixtureId: row.id,
            homeExternalId: row.homeTeam.id, awayExternalId: row.awayTeam.id, kickoffAt: row.kickoff!, homeGoals: row.regulationScore!.home,
            awayGoals: row.regulationScore!.away, regulationVerified: true, period: "regulation-including-stoppage-time" },
            summary: "Verified regulation score including stoppage time; extra time and penalties are excluded.",
            certainty: "confirmed", asOfAt: row.source.providerUpdatedAt }]);
        if (retained !== null) accepted.push({ row, source: retained });
        else issues.push({ kind: "history", reason: "unverified" });
      }
      // Form/rest derive only from accepted canonical results, never reported aggregate/extra-time scores.
      if (accepted.some((item) => !sourcePermission(item.source))) throw new EvidenceInputError("not-authorized");
      if (accepted.length) {
        let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
        const kickoffs: number[] = [];
        for (const item of accepted) for (const claim of item.source.claims) {
          const home = claim.value.homeExternalId === team.externalId;
          const scored = Number(home ? claim.value.homeGoals : claim.value.awayGoals), conceded = Number(home ? claim.value.awayGoals : claim.value.homeGoals);
          goalsFor += scored; goalsAgainst += conceded; if (scored > conceded) wins++; else if (scored < conceded) losses++; else draws++;
          kickoffs.push(Number(claim.value.kickoffAt));
        }
        const latest = accepted.reduce((a, b) => a.source.retrievedAt >= b.source.retrievedAt ? a : b).source, lastKickoff = Math.max(...kickoffs);
        const updatedAt = accepted.every((item) => item.source.providerUpdatedAt !== null)
          ? utcInstantFromEpochMilliseconds(Math.max(...accepted.map((item) => item.source.providerUpdatedAt!))) : null;
        source({ kind: "form-rest", teamId: team.teamId, sourceIds: accepted.map((item) => item.source.id).sort() }, "Derived form and kickoff gap",
          latest.retrievedAt, updatedAt,
          [{ kind: "form", subjectTeamId: team.teamId, key: "regulation-form", value: { matches: kickoffs.length, wins, draws, losses,
            goalsFor, goalsAgainst, points: wins * 3 + draws, windowStartsAt: Math.min(...kickoffs), windowEndsAt: lastKickoff,
            period: "regulation-including-stoppage-time" }, summary: "Form over the retained verified regulation results.", certainty: "confirmed", asOfAt: updatedAt },
          { kind: "rest", subjectTeamId: team.teamId, key: "kickoff-gap", value: { lastKickoffAt: lastKickoff, restDays: (context.kickoffAt - lastKickoff) / 86_400_000 },
            summary: "Kickoff gap from the last known completed match; actual recovery time is unknown.", certainty: "confirmed", asOfAt: updatedAt }]);
      }
      for (const { row } of accepted.slice(0, selected.statisticsLimitPerTeam)) {
        if (accepted.some((item) => !sourcePermission(item.source))) throw new EvidenceInputError("not-authorized");
        const result = await call("statistic", "statistics", { fixture: String(row.id) }, (bounds) => options.adapter.statistics(row.id, bounds));
        for (const entry of result?.data ?? []) {
          if (entry.team.id !== team.externalId) continue;
          const claims: EvidenceClaim[] = entry.statistics.filter((stat) => stat.supported && stat.metric !== null && stat.value !== null).map((stat) => ({
            kind: "statistic", subjectTeamId: team.teamId, key: `fixture-${row.id}/${stat.metric}`, value: { metric: stat.metric!, value: stat.value,
              unit: stat.unit, fixtureId: row.id, teamExternalId: team.externalId }, summary: "Supported provider statistic for the specified historical fixture.",
            certainty: "confirmed", asOfAt: entry.source.providerUpdatedAt }));
          // 007 exposes unsupported xG as unknown; no source-specific xG mapping is invented here.
          source({ kind: "statistics", fixtureId: row.id, teamId: team.externalId }, "Historical fixture statistics", entry.source.retrievedAt, entry.source.providerUpdatedAt, claims);
        }
      }
    }
    for (const kind of ["injuries", "lineups"] as const) {
      if (kind === "injuries" ? !selected.includeInjuries : !selected.includeLineups) continue;
      const result = await call(kind === "injuries" ? "injury" : "lineup", kind, { fixture: String(context.externalFixtureId) },
        (bounds) => options.adapter.availability(context.externalFixtureId, kind, bounds));
      for (const row of result?.data ?? []) {
        const team = [context.home, context.away].find((candidate) => candidate.externalId === row.team.id);
        if (!team || row.kind !== kind || row.fitnessConclusion !== "unknown" || row.fixtureId !== null && row.fixtureId !== context.externalFixtureId) continue;
        const claims: EvidenceClaim[] = [];
        if (kind === "injuries" && row.reportedInjury) claims.push({ kind: "injury", subjectTeamId: team.teamId,
          key: `injury-${row.reportedInjury.playerId}`, value: { playerExternalId: row.reportedInjury.playerId, playerName: row.reportedInjury.name,
            type: row.reportedInjury.type, reason: row.reportedInjury.reason, status: "reported" }, summary: "Reported absence; missing players do not imply fitness.",
          certainty: "confirmed", asOfAt: row.source.providerUpdatedAt });
        if (kind === "lineups") for (const [role, players] of [["starting", row.startingPlayers], ["substitute", row.substitutes]] as const) {
          for (const player of players) claims.push({ kind: "lineup", subjectTeamId: team.teamId, key: `lineup-${player.id}`, value: {
            playerExternalId: player.id, playerName: player.name, ...(player.number === null ? {} : { number: player.number }), position: player.position,
            grid: player.grid, formation: row.formation, role }, summary: "Provider-reported lineup role; unavailable lineup data stays unknown.",
            certainty: "confirmed", asOfAt: row.source.providerUpdatedAt });
        }
        source({ kind, fixtureId: context.externalFixtureId, teamId: team.externalId }, "Reported player availability", row.source.retrievedAt, row.source.providerUpdatedAt, claims);
      }
    }
    authorize();
    if (sources.some((value) => !sourcePermission(value))) throw new EvidenceInputError("not-authorized");
    return freezeEvidence({ sources, requestsDispatched, requestCountUnknown: unknownDispatch, issues });
  } });
}
