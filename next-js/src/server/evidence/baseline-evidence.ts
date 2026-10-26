import "server-only";

import { settleMarketSelection } from "../../domain/market-settlement.ts";
import { isMarketSelection, type MarketFamily, type MarketSelection } from "../../domain/markets.ts";
import type { EvidenceFact, EvidenceSnapshot } from "./evidence-contract.ts";
import { evidenceSourceExclusion } from "./evidence-snapshot.ts";

/** Provisional evidence safeguards, not a calibrated probability or accuracy claim. */
export const baselineEvidencePolicy = Object.freeze({
  version: "baseline-evidence-v1", historyDays: 120, historyPerTeam: 8, minimumPerTeam: 3,
  halfLifeDays: 30, priorSuccesses: 1, priorFailures: 1, minimumEventSupport: 0.40,
  recentFormMatches: 3, importantPlayerMinutes: 450, importantPlayerContributions: 3,
  playerFreshnessMs: 7 * 86_400_000, availabilityFreshnessMs: 24 * 60 * 60_000,
});
export type BaselineEvidencePolicy = typeof baselineEvidencePolicy;
type Observation = Readonly<{ fixtureId: number; kickoffAt: number; homeExternalId: number; awayExternalId: number;
  homeGoals: number; awayGoals: number; sourceIds: readonly string[] }>;
export type BaselineEvidenceAssessment = Readonly<{
  version: string; eligible: boolean; reasons: readonly string[]; uncertainties: readonly string[];
  evidenceSnapshotId: string | null; historicalSupport: number | null;
  cohorts: readonly Readonly<{ teamId: string; role: "home" | "away"; sampleSize: number; venueSampleSize: number;
    wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number;
    fixtureIds: readonly number[]; oldestKickoffAt: number | null; newestKickoffAt: number | null }>[];
  headToHeadSampleSize: number; absentImportantPlayers: readonly number[]; sourceIds: readonly string[];
}>;
const day = 86_400_000;
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Consume only unconflicted confirmed facts backed by still-eligible original source clocks. */
function variants(snapshot: EvidenceSnapshot, kind: EvidenceFact["kind"]) {
  const valid = new Set(snapshot.sources.filter((source) => evidenceSourceExclusion(source, snapshot.context, snapshot.policy) === null).map((source) => source.id));
  return snapshot.facts.filter((fact) => fact.kind === kind && !fact.flags.includes("conflict")).flatMap((fact) =>
    fact.values.filter((value) => value.certainty === "confirmed" && (value.asOfAt === null || value.asOfAt <= snapshot.context.cutoffAt) &&
      value.sourceIds.length > 0 && value.sourceIds.every((id) => valid.has(id))).map((value) => ({ ...value, teamId: fact.subjectTeamId })));
}

/** Historical event rates validate support; they never replace or blend into the independent forecast probability.
 * A match appears once in the combined cohort, even when both teams' histories contain the same H2H result. */
export function assessBaselineEvidence(snapshot: EvidenceSnapshot | null,
  candidate: Readonly<{ family: MarketFamily; selection: MarketSelection }>, policy: BaselineEvidencePolicy = baselineEvidencePolicy): BaselineEvidenceAssessment {
  const reasons: string[] = [], uncertainties: string[] = [], sourceIds = new Set<string>(), absent: number[] = [];
  const cohorts: BaselineEvidenceAssessment["cohorts"][number][] = [];
  if (!snapshot || !isMarketSelection(candidate.family, candidate.selection)) return Object.freeze({ version: policy.version,
    eligible: false, reasons: [snapshot ? "unsupported-selection" : "missing-football-evidence"], uncertainties,
    evidenceSnapshotId: snapshot?.id ?? null, historicalSupport: null, cohorts, headToHeadSampleSize: 0,
    absentImportantPlayers: absent, sourceIds: [] });
  if (!snapshot.coverage.sufficient) reasons.push("insufficient-evidence-coverage");
  if (snapshot.sources.some((source) => source.title.endsWith(" (bounded subset)")))
    uncertainties.push("Optional squad evidence was limited to archive capacity; unretained reports remain unknown.");
  const { context } = snapshot, records = new Map<number, Observation>(), conflicts = new Set<number>();
  for (const fact of variants(snapshot, "history")) {
    const v = fact.value;
    if (![v.fixtureId, v.kickoffAt, v.homeExternalId, v.awayExternalId, v.homeGoals, v.awayGoals].every(integer) ||
      v.regulationVerified !== true || v.period !== "regulation-including-stoppage-time" || v.homeExternalId === v.awayExternalId ||
      Number(v.kickoffAt) >= context.cutoffAt || Number(v.kickoffAt) < context.cutoffAt - policy.historyDays * day ||
      v.fixtureId === context.externalFixtureId) continue;
    const team = [context.home, context.away].find((team) => team.teamId === fact.teamId);
    if (!team || ![v.homeExternalId, v.awayExternalId].includes(team.externalId)) continue;
    const row: Observation = { fixtureId: Number(v.fixtureId), kickoffAt: Number(v.kickoffAt), homeExternalId: Number(v.homeExternalId),
      awayExternalId: Number(v.awayExternalId), homeGoals: Number(v.homeGoals), awayGoals: Number(v.awayGoals), sourceIds: fact.sourceIds };
    const prior = records.get(row.fixtureId);
    if (prior && ["kickoffAt", "homeExternalId", "awayExternalId", "homeGoals", "awayGoals"].some((key) => prior[key as keyof Observation] !== row[key as keyof Observation]))
      conflicts.add(row.fixtureId);
    else records.set(row.fixtureId, { ...row, sourceIds: [...new Set([...(prior?.sourceIds ?? []), ...row.sourceIds])] });
  }
  const history = [...records.values()].filter((row) => !conflicts.has(row.fixtureId)).sort((a, b) => b.kickoffAt - a.kickoffAt || a.fixtureId - b.fixtureId);
  const selected = new Map<number, { row: Observation; home: number; away: number }>();
  for (const [index, team] of [context.home, context.away].entries()) {
    const rows = history.filter((row) => [row.homeExternalId, row.awayExternalId].includes(team.externalId)).slice(0, policy.historyPerTeam);
    let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
    for (const row of rows) {
      const scored = row.homeExternalId === team.externalId ? row.homeGoals : row.awayGoals;
      const conceded = row.homeExternalId === team.externalId ? row.awayGoals : row.homeGoals;
      goalsFor += scored; goalsAgainst += conceded;
      if (scored > conceded) wins++; else if (scored === conceded) draws++; else losses++;
      // For H2H keep the actual matchup identities; for other opponents map this team's role into the upcoming fixture.
      const h2h = [row.homeExternalId, row.awayExternalId].includes(context.home.externalId) && [row.homeExternalId, row.awayExternalId].includes(context.away.externalId);
      const home = h2h ? row.homeExternalId === context.home.externalId ? row.homeGoals : row.awayGoals : index === 0 ? scored : conceded;
      const away = h2h ? row.homeExternalId === context.home.externalId ? row.awayGoals : row.homeGoals : index === 0 ? conceded : scored;
      selected.set(row.fixtureId, { row, home, away }); row.sourceIds.forEach((id) => sourceIds.add(id));
    }
    if (rows.length < policy.minimumPerTeam) reasons.push(`history-${index === 0 ? "home" : "away"}-below-minimum`);
    const recent = rows.slice(0, policy.recentFormMatches), backsWin = candidate.selection === (index === 0 ? "home-win" : "away-win");
    if (backsWin && recent.length === policy.recentFormMatches) {
      const scores = recent.map((row) => row.homeExternalId === team.externalId ? [row.homeGoals, row.awayGoals] : [row.awayGoals, row.homeGoals]);
      if (scores.every(([scored, conceded]) => scored! <= conceded!) && scores.reduce((n, [scored, conceded]) => n + scored! - conceded!, 0) < 0)
        reasons.push(`adverse-recent-form-${index === 0 ? "home" : "away"}`);
    }
    cohorts.push({ teamId: team.teamId, role: index === 0 ? "home" : "away", sampleSize: rows.length,
      venueSampleSize: rows.filter((row) => (row.homeExternalId === team.externalId) === (index === 0)).length,
      wins, draws, losses, goalsFor, goalsAgainst, fixtureIds: rows.map((row) => row.fixtureId),
      oldestKickoffAt: rows.at(-1)?.kickoffAt ?? null, newestKickoffAt: rows[0]?.kickoffAt ?? null });
  }
  let weightedWins = policy.priorSuccesses, weight = policy.priorSuccesses + policy.priorFailures;
  for (const { row, home, away } of selected.values()) {
    const outcome = settleMarketSelection(candidate.family, candidate.selection, { status: "finished-regulation", cycleEligibility: { eligible: true },
      regulationScore: { verified: true, period: "regulation-including-stoppage-time", home, away } });
    if (!["correct", "incorrect"].includes(outcome.status)) continue;
    const recency = 2 ** (-(context.cutoffAt - row.kickoffAt) / (policy.halfLifeDays * day));
    weight += recency; if (outcome.status === "correct") weightedWins += recency;
  }
  const historicalSupport = selected.size ? weightedWins / weight : null;
  if (historicalSupport === null || historicalSupport < policy.minimumEventSupport) reasons.push("historical-event-support-below-minimum");
  const fresh = (entry: { sourceIds: readonly string[] }, maxAgeMs: number) => entry.sourceIds.every((id) => {
    const source = snapshot.sources.find((source) => source.id === id); return source && context.cutoffAt - source.retrievedAt <= maxAgeMs;
  });
  const injuries = variants(snapshot, "injury").filter((entry) => fresh(entry, policy.availabilityFreshnessMs));
  const players = variants(snapshot, "statistic").filter((entry) => entry.value.metric === "player-season-contribution" && fresh(entry, policy.playerFreshnessMs));
  const lineups = variants(snapshot, "lineup").filter((entry) => fresh(entry, policy.availabilityFreshnessMs));
  if (!injuries.length) uncertainties.push("Player availability is unknown; missing reports do not establish fitness.");
  if (!players.length) uncertainties.push("Verified player contribution data is unavailable.");
  for (const injury of injuries) {
    if (injury.value.status !== "confirmed-absent" || !integer(injury.value.playerExternalId)) continue;
    const source = snapshot.sources.find((source) => injury.sourceIds.includes(source.id));
    if (!source || context.cutoffAt - source.retrievedAt > policy.availabilityFreshnessMs) continue;
    const contribution = players.find((entry) => entry.teamId === injury.teamId && entry.value.playerExternalId === injury.value.playerExternalId &&
      Number(entry.value.minutes) >= policy.importantPlayerMinutes && Number(entry.value.goals) + Number(entry.value.assists) >= policy.importantPlayerContributions &&
      entry.value.competitionExternalId === injury.value.competitionExternalId && entry.value.season === injury.value.season &&
      integer(entry.value.competitionExternalId) && Number(entry.value.competitionExternalId) > 0 && integer(entry.value.season) &&
      entry.sourceIds.every((id) => { const source = snapshot.sources.find((source) => source.id === id); return source && context.cutoffAt - source.retrievedAt <= policy.playerFreshnessMs; }));
    if (!contribution) continue;
    const inStartingLineup = lineups.some((entry) => entry.teamId === injury.teamId && entry.value.playerExternalId === injury.value.playerExternalId && entry.value.role === "starting");
    if (inStartingLineup) { uncertainties.push("Conflicting confirmed absence and starting lineup; player impact is unresolved."); continue; }
    absent.push(injury.value.playerExternalId); injury.sourceIds.concat(contribution.sourceIds).forEach((id) => sourceIds.add(id));
    const replacement = players.some((entry) => entry.teamId === injury.teamId && entry.value.playerExternalId !== injury.value.playerExternalId &&
      entry.value.competitionExternalId === contribution.value.competitionExternalId && entry.value.season === contribution.value.season &&
      Number(entry.value.minutes) >= policy.importantPlayerMinutes && Number(entry.value.goals) + Number(entry.value.assists) >= Number(contribution.value.goals) + Number(contribution.value.assists) &&
      lineups.some((lineup) => lineup.teamId === entry.teamId && lineup.value.playerExternalId === entry.value.playerExternalId && lineup.value.role === "starting"));
    const backsTeam = candidate.selection === (injury.teamId === context.home.teamId ? "home-win" : "away-win");
    if (!replacement && (backsTeam || candidate.selection === "over-2.5" || candidate.family === "both-teams-to-score" && candidate.selection === "yes"))
      reasons.push("important-scorer-absence-without-verified-replacement");
  }
  const headToHeadSampleSize = history.filter((row) => [row.homeExternalId, row.awayExternalId].includes(context.home.externalId) &&
    [row.homeExternalId, row.awayExternalId].includes(context.away.externalId)).length;
  return Object.freeze({ version: policy.version, eligible: reasons.length === 0, reasons: [...new Set(reasons)], uncertainties: [...new Set(uncertainties)],
    evidenceSnapshotId: snapshot.id, historicalSupport, cohorts, headToHeadSampleSize, absentImportantPlayers: [...new Set(absent)].sort((a, b) => a - b), sourceIds: [...sourceIds].sort() });
}
