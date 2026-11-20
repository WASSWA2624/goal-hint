import "server-only";

import { marketRules } from "../../domain/markets.ts";
import type { BaselineResult } from "../evaluation/evaluation-contract.ts";
import type { IntelligenceFixture } from "../intelligence/intelligence-contract.ts";
import type { EvidenceAuthority, EvidenceSnapshot, EvidenceValue } from "./evidence-contract.ts";
import { isArchivedFixtureContext, type ArchivedFixtureContext } from "./fixture-context-evidence.ts";
import { evidenceFingerprint, freezeEvidence } from "./evidence-input.ts";
import { assertPreparedEvidenceSnapshot, evidenceSourceExclusion } from "./evidence-snapshot.ts";

export const fixtureModelEvidenceVersion = "fixture-model-evidence-v1";
export const fixtureModelEvidenceBounds = Object.freeze({ history: 1_500, historyInput: 6_000, context: 128 });

export type FixtureModelHistoryRow = Omit<BaselineResult, "cycleId"> & Readonly<{
  halfTime: Readonly<{ home: number; away: number }> | null;
  neutralVenue?: boolean;
}>;

type ContextKind = "player-contribution" | "lineup" | "availability" | "venue" | "rest" |
  "standings" | "season-summary" | "coach" | "squad" | "transfer";
export type FixtureModelContextObservation = Readonly<{
  id: string; kind: ContextKind; teamId: string | null; availableAt: number;
  sourceIds: readonly string[]; claimIds: readonly string[]; value: EvidenceValue;
}>;

const whole = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const positive = (value: unknown): value is number => whole(value) && value > 0;
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 512;
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);

function modelMatch(row: FixtureModelHistoryRow) {
  return { fixtureId: row.fixtureId, competitionId: row.competitionId, homeTeamId: row.homeTeamId, awayTeamId: row.awayTeamId,
    kickoffAt: row.kickoffAt, homeGoals: row.homeGoals, awayGoals: row.awayGoals, period: row.period,
    halfTime: row.halfTime, neutralVenue: row.neutralVenue ?? null };
}

function scopedMatch(row: FixtureModelHistoryRow): FixtureModelHistoryRow {
  const { fixtureId, competitionId, homeTeamId, awayTeamId, kickoffAt, availableAt, homeGoals, awayGoals, period,
    observationHash, evidenceRef, halfTime, neutralVenue } = row;
  return { fixtureId, competitionId, homeTeamId, awayTeamId, kickoffAt, availableAt, homeGoals, awayGoals, period, observationHash, evidenceRef,
    halfTime: halfTime && { home: halfTime.home, away: halfTime.away }, ...(neutralVenue === undefined ? {} : { neutralVenue }) };
}

function validHistory(row: FixtureModelHistoryRow, fixture: IntelligenceFixture) {
  return id(row.fixtureId) && row.fixtureId !== fixture.fixtureId && row.competitionId === fixture.competitionId &&
    id(row.homeTeamId) && id(row.awayTeamId) && row.homeTeamId !== row.awayTeamId && whole(row.kickoffAt) &&
    whole(row.availableAt) && row.kickoffAt < row.availableAt && row.availableAt <= fixture.forecastAt &&
    whole(row.homeGoals) && row.homeGoals <= 100 && whole(row.awayGoals) && row.awayGoals <= 100 &&
    row.period === marketRules.period && hash(row.observationHash) && id(row.evidenceRef) &&
    (row.neutralVenue === undefined || typeof row.neutralVenue === "boolean") &&
    (row.halfTime === null || whole(row.halfTime?.home) && row.halfTime.home <= row.homeGoals &&
      whole(row.halfTime?.away) && row.halfTime.away <= row.awayGoals);
}

function relationshipFeatures(fixture: IntelligenceFixture, matches: readonly FixtureModelHistoryRow[]) {
  const byTeam = new Map<string, FixtureModelHistoryRow[]>();
  for (const match of matches) for (const team of [match.homeTeamId, match.awayTeamId]) {
    const edges = byTeam.get(team) ?? [];
    edges.push(match);
    byTeam.set(team, edges);
  }
  const home = byTeam.get(fixture.homeTeamId) ?? [], away = byTeam.get(fixture.awayTeamId) ?? [];
  const opponent = (fixture: FixtureModelHistoryRow, team: string) => fixture.homeTeamId === team ? fixture.awayTeamId : fixture.homeTeamId;
  const direct = home.filter((match) => opponent(match, fixture.homeTeamId) === fixture.awayTeamId);
  const opponents = new Map<string, { home: string[]; away: string[] }>();
  for (const [side, rows, team, other] of [["home", home, fixture.homeTeamId, fixture.awayTeamId],
    ["away", away, fixture.awayTeamId, fixture.homeTeamId]] as const) for (const match of rows) {
    const key = opponent(match, team);
    if (key === other) continue;
    const group = opponents.get(key) ?? { home: [], away: [] };
    group[side].push(match.fixtureId);
    opponents.set(key, group);
  }
  const teams = new Set([fixture.homeTeamId, fixture.awayTeamId]), queue = [...teams], connected = new Set<string>();
  for (let index = 0; index < queue.length; index++) for (const match of byTeam.get(queue[index]!) ?? []) {
    connected.add(match.fixtureId);
    const next = opponent(match, queue[index]!);
    if (!teams.has(next)) { teams.add(next); queue.push(next); }
  }
  const ids = (rows: readonly FixtureModelHistoryRow[]) => rows.map(({ fixtureId }) => fixtureId);
  return { home: ids(home), away: ids(away), direct: ids(direct),
    commonOpponents: [...opponents].filter(([, group]) => group.home.length && group.away.length)
      .sort(([left], [right]) => left.localeCompare(right)).map(([teamId, group]) => ({ teamId, ...group })),
    connected: ids(matches.filter((match) => connected.has(match.fixtureId))) };
}

function contextValue(kind: string, value: EvidenceValue): { kind: ContextKind; value: EvidenceValue } | null {
  const { playerExternalId, competitionExternalId, season, minutes, goals, assists, appearances } = value;
  if (kind === "statistic" && value.metric === "player-season-contribution" && positive(playerExternalId) && positive(competitionExternalId) &&
    positive(season) && whole(minutes) && whole(goals) && whole(assists) && whole(appearances))
    return { kind: "player-contribution", value: { playerExternalId, competitionExternalId, season, minutes, goals, assists, appearances } };
  if (kind === "lineup" && positive(playerExternalId) && (value.role === "starting" || value.role === "substitute"))
    return { kind: "lineup", value: { playerExternalId, role: value.role,
      formation: typeof value.formation === "string" && /^\d(?:-\d){1,4}$/u.test(value.formation) ? value.formation : null } };
  if (kind === "injury" && positive(playerExternalId) && (value.status === "confirmed-absent" || value.status === "doubtful" || value.status === "reported"))
    return { kind: "availability", value: { playerExternalId, status: value.status } };
  if (kind === "venue" && (value.role === "home" || value.role === "away" || value.role === "neutral"))
    return { kind: "venue", value: { role: value.role, neutral: typeof value.neutral === "boolean" ? value.neutral : null } };
  if (kind === "rest" && whole(value.lastKickoffAt) && typeof value.restDays === "number" && Number.isFinite(value.restDays) && value.restDays >= 0)
    return { kind: "rest", value: { lastKickoffAt: value.lastKickoffAt, restDays: value.restDays } };
  return null;
}

function preparedContext(fixture: IntelligenceFixture, snapshot: EvidenceSnapshot, authority: EvidenceAuthority) {
  assertPreparedEvidenceSnapshot(snapshot, authority);
  const { context, policy } = snapshot;
  if (context.fixtureId !== fixture.fixtureId || context.kickoffAt !== fixture.kickoffAt || context.cutoffAt !== fixture.forecastAt ||
    context.home.teamId !== fixture.homeTeamId || context.away.teamId !== fixture.awayTeamId) throw new Error("Fixture evidence scope mismatch.");
  const eligible = new Map(snapshot.sources.filter((source) => source.kind === "football" &&
    evidenceSourceExclusion(source, context, policy) === null).map((source) => [source.id,
    { retrievedAt: source.retrievedAt, claims: new Set(source.claims.map(evidenceFingerprint)) }]));
  const observations = new Map<string, FixtureModelContextObservation>();
  const conflicts = new Set<string>();
  for (const fact of snapshot.facts) {
    if (fact.flags.includes("conflict")) continue;
    for (const variant of fact.values) {
      if (variant.certainty !== "confirmed" && !(fact.kind === "injury" && variant.value.status === "doubtful")) continue;
      const data = contextValue(fact.kind, variant.value);
      if (!data) continue;
      const sourceIds = variant.sourceIds.filter((sourceId) => eligible.has(sourceId)).sort();
      if (!sourceIds.length) continue;
      const availableAt = Math.max(variant.asOfAt ?? 0, ...sourceIds.map((sourceId) => eligible.get(sourceId)!.retrievedAt));
      const claimIds = variant.claimIds.filter((claimId) => sourceIds.some((sourceId) =>
        eligible.get(sourceId)!.claims.has(claimId))).sort();
      if (!claimIds.length || availableAt > fixture.forecastAt) continue;
      const body = { ...data, teamId: fact.subjectTeamId, availableAt, sourceIds, claimIds };
      const previous = observations.get(fact.id), candidate = { ...body, id: evidenceFingerprint(body) };
      if (!previous || previous.availableAt < availableAt) {
        observations.set(fact.id, candidate);
        conflicts.delete(fact.id);
      } else if (previous.availableAt === availableAt && evidenceFingerprint(previous.value) !== evidenceFingerprint(data.value)) {
        conflicts.add(fact.id);
      }
    }
  }
  return [...observations].filter(([key]) => !conflicts.has(key)).map(([, observation]) => observation)
    .sort((left, right) => right.availableAt - left.availableAt || left.id.localeCompare(right.id));
}

/** Tags and summaries point to one copy of each eligible match. Only separately fitted effects may change rates. */
export function buildFixtureModelEvidence(input: Readonly<{
  fixture: IntelligenceFixture; history: readonly FixtureModelHistoryRow[];
  snapshot?: Readonly<{ value: EvidenceSnapshot; authority: EvidenceAuthority }>;
  archivedContext?: ArchivedFixtureContext;
}>) {
  const { fixture } = input;
  if (!id(fixture.fixtureId) || !id(fixture.competitionId) || !id(fixture.homeTeamId) || !id(fixture.awayTeamId) ||
    fixture.homeTeamId === fixture.awayTeamId || !whole(fixture.forecastAt) || !whole(fixture.kickoffAt) || fixture.forecastAt >= fixture.kickoffAt ||
    input.history.length > fixtureModelEvidenceBounds.historyInput) throw new Error("Invalid fixture model evidence.");
  const matches = new Map<string, { row: FixtureModelHistoryRow; material: string; occurrence: string }>();
  const simultaneous = new Set<string>(), occurrences = new Set<string>();
  let excludedRows = 0;
  for (const raw of input.history) {
    if (!validHistory(raw, fixture)) { excludedRows++; continue; }
    const row = scopedMatch(raw);
    const material = evidenceFingerprint(modelMatch(row));
    const occurrence = evidenceFingerprint([row.homeTeamId, row.awayTeamId, row.kickoffAt]);
    const previous = matches.get(row.fixtureId);
    if (previous && previous.occurrence !== occurrence) occurrences.add(row.fixtureId);
    if (!previous || previous.row.availableAt < row.availableAt) {
      matches.set(row.fixtureId, { row, material, occurrence });
      simultaneous.delete(row.fixtureId);
    } else if (previous.row.availableAt === row.availableAt) {
      if (previous.material !== material) simultaneous.add(row.fixtureId);
      else if (row.observationHash < previous.row.observationHash || row.observationHash === previous.row.observationHash &&
        row.evidenceRef < previous.row.evidenceRef) matches.set(row.fixtureId, { row, material, occurrence });
    }
  }
  const usable = [...matches.values()].map(({ row }) => row).filter(({ fixtureId }) => !simultaneous.has(fixtureId) && !occurrences.has(fixtureId))
    .sort((left, right) => right.kickoffAt - left.kickoffAt || left.fixtureId.localeCompare(right.fixtureId));
  const history = usable.slice(0, fixtureModelEvidenceBounds.history);
  const relationships = relationshipFeatures(fixture, history);
  const contextRows = input.snapshot ? preparedContext(fixture, input.snapshot.value, input.snapshot.authority) : [];
  const archived = input.archivedContext;
  if (archived) {
    const { context: binding } = archived;
    if (!isArchivedFixtureContext(archived) || archived.competitionId !== fixture.competitionId || binding.fixtureId !== fixture.fixtureId ||
      binding.home.teamId !== fixture.homeTeamId || binding.away.teamId !== fixture.awayTeamId || binding.kickoffAt !== fixture.kickoffAt ||
      binding.cutoffAt !== fixture.forecastAt || input.snapshot && evidenceFingerprint(binding) !== evidenceFingerprint(input.snapshot.value.context))
      throw new Error("Fixture archive evidence scope mismatch.");
    contextRows.push(...archived.observations);
  }
  // Keep confirmed fixture-specific context ahead of broader career and season summaries when the package is full.
  const context = contextRows.slice(0, fixtureModelEvidenceBounds.context);
  const materialHash = evidenceFingerprint({ version: fixtureModelEvidenceVersion, history: history.map(modelMatch),
    context: context.map(({ kind, teamId, value }) => evidenceFingerprint({ kind, teamId, value })).sort() });
  const body = { version: fixtureModelEvidenceVersion, fixture: { ...fixture }, materialHash, history, relationships, context,
    coverage: { excludedRows, ambiguousOccurrences: new Set([...occurrences, ...simultaneous]).size,
      truncatedMatches: usable.length - history.length, truncatedContext: contextRows.length - context.length,
      verifiedHalfTime: history.filter(({ halfTime }) => halfTime !== null).length,
      contextKinds: [...new Set(context.map(({ kind }) => kind))].sort() } };
  return freezeEvidence({ ...body, hash: evidenceFingerprint(body) });
}

export type FixtureModelEvidence = ReturnType<typeof buildFixtureModelEvidence>;
