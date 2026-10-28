import "server-only";

import { createHash } from "node:crypto";
import { marketRules, validateMarketSnapshot } from "../../domain/markets.ts";
import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { buildEvidenceSnapshot } from "../evidence/evidence-snapshot.ts";
import { evidenceFingerprint, evidenceSourceId } from "../evidence/evidence-input.ts";
import type { EvidenceContext, EvidencePolicy, EvidenceSource } from "../evidence/evidence-contract.ts";
import { createModelPin, createModelVersion } from "../predictor/predictor-input.ts";
import { parseResolvedForecastCandidate } from "../fallback/fallback-input.ts";
import { demoApiFootballResponse, demoFixtureProbabilities, demoTeamForm, type ApiFootballDemoFixture } from "./api-football.ts";

export const demoHash = (value: string) => createHash("sha256").update(`goal-hint-demo-v1:${value}`).digest("hex");
/** UUIDs remain stable across processes, resets and operating systems. */
export function demoId(kind: string, externalId: string | number): string {
  const hash = demoHash(`${kind}:${externalId}`);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export const demoModel = createModelVersion({ version: 1, provider: "development-demo", model: "deterministic-football-simulation",
  providerModelVersion: "2026-v1", contractVersion: "demo-v1", contractEvidenceRef: "synthetic-development-only",
  promptVersion: "demo-v1", schemaVersion: "demo-v1", windows: { training: null, validation: null, calibration: null, finalTest: null },
  calibration: { kind: "none", version: "demo-v1", evidenceRef: "synthetic-development-only" },
  evaluation: { status: "evaluated", version: "demo-v1", evidenceRef: "synthetic-development-only", evaluationRef: "synthetic-not-a-production-evaluation" },
  outputTiming: { maxAgeMs: 31_536_000_000, basis: "generated", unknownGeneration: "reject", unknownUpdate: "reject" },
  bounds: { maxInputBytes: 1_000_000, maxOutputBytes: 100_000, maxSources: 20, maxFacts: 1000,
    maxReasonCharacters: 1000, maxUncertaintyCharacters: 1000, maxCitationsPerItem: 100, maxCitationCharacters: 1000 } });

const policy: EvidencePolicy = { version: "development-demo-v1", evidenceRef: "synthetic-development-only",
  freshness: { football: { maxAgeMs: 31_536_000_000, basis: "retrieved", unknownTimestamp: "allow-flagged", conflicts: "preserve" },
    news: { maxAgeMs: 31_536_000_000, basis: "retrieved", unknownTimestamp: "allow-flagged", conflicts: "preserve" } },
  minimum: { historyPerTeam: 0, formPerTeam: 0, statisticsPerTeam: 0, requireVenue: true, requireRest: false, newsSources: 0 },
  bounds: { maxSources: 20, maxClaimsPerSource: 200, maxSummaryCharacters: 1000, maxTitleCharacters: 1000,
    maxPublisherCharacters: 512, maxValueCharacters: 1000, maxSourceBytes: 300_000, maxSnapshotBytes: 1_000_000 } };

type Row = Record<string, unknown>;
const row = (value: unknown): Row => value !== null && typeof value === "object" ? value as Row : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const string = (value: unknown) => typeof value === "string" ? value : null;
const number = (value: unknown) => typeof value === "number" ? value : null;

/** Uses only synthetic provider data. No model, news or football network calls occur. */
export function demoForecast(fixture: ApiFootballDemoFixture, nowMs: number) {
  const externalId = fixture.fixture.id, fixtureId = demoId("fixture", externalId), cycleId = demoId("cycle", externalId);
  const kickoffAt = Date.parse(fixture.fixture.date), date = new Date(kickoffAt + 3 * 3_600_000).toISOString().slice(0, 10);
  const analysisAt = Math.min(nowMs - 60_000, Date.parse(`${date}T00:00:00+03:00`) - 12 * 3_600_000), at = utcInstantFromEpochMilliseconds(analysisAt);
  const context: EvidenceContext = { fixtureId, fixtureVersion: 1n, provider: "api-football", externalFixtureId: externalId,
    home: { teamId: demoId("team", fixture.teams.home.id), externalId: fixture.teams.home.id },
    away: { teamId: demoId("team", fixture.teams.away.id), externalId: fixture.teams.away.id },
    kickoffAt: utcInstantFromEpochMilliseconds(kickoffAt), analysisAt: at, cutoffAt: at, cycleId, runId: demoId("run", date) };
  const claims: EvidenceSource["claims"][number][] = [{ kind: "venue", subjectTeamId: context.home.teamId, key: "venue-role",
    value: { role: "home", venueName: fixture.fixture.venue.name, neutral: false }, summary: "Home venue in the synthetic fixture schedule.",
    certainty: "confirmed", asOfAt: at }];
  // Season evidence and player availability are observed before kickoff. Match events and final statistics stay in their own live snapshot.
  for (const [side, team] of [["home", fixture.teams.home], ["away", fixture.teams.away]] as const) {
    const subjectTeamId = context[side].teamId;
    const recent = demoTeamForm(team.id, analysisAt);
    const wins = [...recent].filter((value) => value === "W").length, draws = [...recent].filter((value) => value === "D").length,
      losses = [...recent].filter((value) => value === "L").length, seed = team.id % 97;
    claims.push({ kind: "form", subjectTeamId, key: "last-five", value: { matches: recent.length, wins, draws, losses,
      points: wins * 3 + draws,
      windowStartsAt: analysisAt - 18 * 86_400_000, windowEndsAt: analysisAt - 86_400_000, period: marketRules.period },
    summary: `${team.name} recorded ${wins} wins, ${draws} draws and ${losses} defeats in the demo form sample.`, certainty: "confirmed", asOfAt: at });
    for (const [metric, amount, unit] of [["Goals scored per match", 0.8 + seed % 25 / 10, "goals"],
      ["Shots on goal per match", 2 + seed % 55 / 10, "shots"], ["Average possession", 35 + seed % 31, "%"]] as const) {
      claims.push({ kind: "statistic", subjectTeamId, key: `season-${metric.replaceAll(" ", "-").toLowerCase()}`,
        value: { metric, value: amount, unit, teamExternalId: team.id, competitionExternalId: fixture.league.id, season: 2026, appearances: 15 + seed % 20 },
        summary: `${team.name}: ${amount} ${unit}.`, certainty: "confirmed", asOfAt: at });
    }
  }
  const injuries = demoApiFootballResponse("injuries", { fixture: String(externalId) }, analysisAt).response;
  for (const value of list(injuries)) {
    const injury = row(value), teamId = number(row(injury.team).id), player = row(injury.player);
    if (teamId === null || teamId !== fixture.teams.home.id && teamId !== fixture.teams.away.id) continue;
    claims.push({ kind: "injury", subjectTeamId: demoId("team", teamId), key: `injury-${String(player.id)}`,
      value: { playerExternalId: number(player.id), playerName: string(player.name), type: string(player.type), reason: string(player.reason), status: "unavailable" },
      summary: `${String(player.name)}: ${String(player.reason)}.`, certainty: "confirmed", asOfAt: at });
  }
  const lineups = demoApiFootballResponse("fixtures/lineups", { fixture: String(externalId) }, analysisAt).response;
  for (const value of list(lineups)) {
    const lineup = row(value), teamId = number(row(lineup.team).id);
    if (teamId === null || teamId !== fixture.teams.home.id && teamId !== fixture.teams.away.id) continue;
    for (const [key, role] of [["startXI", "starting"], ["substitutes", "substitute"]] as const) {
      for (const entry of list(lineup[key])) {
        const player = row(row(entry).player), playerId = number(player.id);
        if (playerId === null) continue;
        claims.push({ kind: "lineup", subjectTeamId: demoId("team", teamId), key: `lineup-${playerId}`,
          value: { playerExternalId: playerId, playerName: string(player.name), number: number(player.number) ?? 0,
            position: string(player.pos), grid: string(player.grid), formation: string(lineup.formation), role },
          summary: `${String(player.name)}: ${role}.`, certainty: "confirmed", asOfAt: at });
      }
    }
  }
  const sourceBody: Omit<EvidenceSource, "id"> = { kind: "football", sourceKey: demoHash(`source:${externalId}`), syndicationKey: null,
    version: "demo-v1", publisher: "Goal Hint development simulation", title: `${fixture.teams.home.name} v ${fixture.teams.away.name}: demo match evidence`,
    sourceUrl: null, publishedAt: at, retrievedAt: at, providerUpdatedAt: at,
    binding: { fixtureId, fixtureVersion: 1n, externalFixtureId: externalId, homeTeamId: context.home.teamId,
      awayTeamId: context.away.teamId, homeExternalId: context.home.externalId, awayExternalId: context.away.externalId },
    evidenceRef: "synthetic-development-only", reuse: { evidenceRef: "synthetic-development-only", retainUntil: utcInstantFromEpochMilliseconds(Date.parse("2036-01-01T00:00:00Z")), allowSummary: true }, claims };
  const source: EvidenceSource = { ...sourceBody, id: evidenceSourceId(sourceBody) };
  const snapshot = buildEvidenceSnapshot({ context, policy, sources: [source] }, { authorize() {}, verifyContext: () => true,
    verifyPolicy: () => true, verifySource: () => true, verifyReuse: () => true });
  const jobId = demoHash(`job:${externalId}`), pin = createModelPin({ version: 1, invocationId: demoHash(`invocation:${externalId}`), jobId, modelVersionId: demoModel.id });
  // Forecasts, odds and results share the synthetic provider's coherent score model.
  const probabilities = demoFixtureProbabilities(externalId)!;
  // Six decimal places retain far more precision than the public display while
  // preserving exact decimal-derived relationships through native MySQL JSON.
  const rounded = (value: number) => Number(value.toFixed(6));
  const home = rounded(probabilities.home), draw = rounded(probabilities.draw), away = rounded(1 - home - draw),
    btts = rounded(probabilities.btts), over = rounded(probabilities.over(2.5));
  const markets = validateMarketSnapshot({ "match-result": { source: "ai", period: marketRules.period, probabilities: { "home-win": home, draw, "away-win": away } },
    "total-goals": { source: "ai", period: marketRules.period, line: 2.5, probabilities: { "over-2.5": over, "under-2.5": Number((1 - over).toFixed(6)) } },
    "both-teams-to-score": { source: "ai", period: marketRules.period, probabilities: { yes: btts, no: Number((1 - btts).toFixed(6)) } } });
  const provenance = { kind: "ai" as const, modelVersionId: demoModel.id, evidenceHash: snapshot.hash,
    calibration: { kind: "none" as const, version: "demo-v1", method: null, appliedFamilies: [], evidenceRef: "synthetic-development-only", evaluationRef: null },
    evaluation: demoModel.evaluation, provisional: false, sources: snapshot.sources.map((item) => ({ sourceId: item.id, publisher: item.publisher,
      title: item.title, sourceUrl: item.sourceUrl, version: item.version, publishedAt: item.publishedAt, retrievedAt: item.retrievedAt, providerUpdatedAt: item.providerUpdatedAt })),
    evidence: { policyVersion: policy.version, coverage: snapshot.coverage, missingness: snapshot.missingness },
    outputTiming: demoModel.outputTiming, pin, transportEvidenceRef: "synthetic-development-no-ai-call" };
  const timestamps = { generatedAt: analysisAt + 1000, retrievedAt: analysisAt + 1000, providerUpdatedAt: analysisAt };
  const candidate = parseResolvedForecastCandidate({ context: { context, jobId, pin, evidenceHash: snapshot.hash },
    markets: Object.fromEntries(Object.entries(markets.markets).map(([family, item]) => [family, item.available
      ? { ...item, provenance, timestamps, flags: [], fallback: null } : item])), issues: markets.issues,
    reasons: [{ text: `${fixture.teams.home.name} and ${fixture.teams.away.name} have different recent form and scoring profiles in this synthetic season.`, sourceUrls: [] },
      { text: "The simulated forecast combines home advantage, attacking output and defensive form; each market retains its own probabilities.", sourceUrls: [] }],
    uncertainty: { text: "Development simulation: football outcomes remain uncertain, and these values are synthetic examples.", sourceUrls: [] },
    audit: { aiStatus: "candidate", aiReason: null, providerStatus: "not-requested", providerReason: null } });
  return { fixtureId, cycleId, runId: context.runId!, date, context, candidate, snapshot, source, jobId, pin,
    revisionId: demoId("revision", externalId), requestId: demoHash(`evidence-request:${externalId}`),
    requestHash: evidenceFingerprint(candidate), publishedAt: analysisAt + 3000 };
}
