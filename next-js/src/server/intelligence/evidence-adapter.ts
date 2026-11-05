import "server-only";

import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { EvidenceAuthority, EvidenceSnapshot } from "../evidence/evidence-contract.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { assertPreparedEvidenceSnapshot, evidenceSourceExclusion } from "../evidence/evidence-snapshot.ts";
import type { BaselineResult } from "../evaluation/evaluation-contract.ts";
import { provenTrue } from "../shared/authority-proof.ts";

/** Existing history claims lack competition/canonical opponent identity. A
 * separately verified, point-in-time catalog receipt must establish that scope.
 * The target fixture's league must never be assigned to every historical match. */
export type HistoricalFixtureScope = Readonly<{
  externalFixtureId: number; fixtureId: string; cycleId: string; competitionId: string;
  homeExternalId: number; awayExternalId: number; homeTeamId: string; awayTeamId: string;
  observedAt: number; evidenceRef: string;
}>;
export function localHistoryFromEvidence(input: Readonly<{
  snapshot: EvidenceSnapshot; authority: EvidenceAuthority; scopes: readonly HistoricalFixtureScope[];
  verifyScope(scope: HistoricalFixtureScope): boolean;
}>) {
  const { snapshot } = input;
  assertPreparedEvidenceSnapshot(snapshot, input.authority);
  if (input.scopes.length > 100_000) throw new Error("Historical scope bounds exceeded.");
  const sources = new Map(snapshot.sources.filter((source) =>
    evidenceSourceExclusion(source, snapshot.context, snapshot.policy) === null).map((source) => [source.id, source]));
  const scopes = new Map<number, HistoricalFixtureScope>(), conflicts = new Set<number>();
  const reasons = new Set<string>();
  for (const scope of input.scopes) {
    if (!provenTrue(() => input.verifyScope(scope)) || !Number.isSafeInteger(scope.observedAt) || scope.observedAt < 0 ||
      scope.observedAt > snapshot.context.cutoffAt || !Number.isSafeInteger(scope.externalFixtureId) || scope.externalFixtureId < 1 ||
      !Number.isSafeInteger(scope.homeExternalId) || scope.homeExternalId < 1 || !Number.isSafeInteger(scope.awayExternalId) || scope.awayExternalId < 1 ||
      scope.homeExternalId === scope.awayExternalId || scope.homeTeamId === scope.awayTeamId ||
      [scope.fixtureId, scope.cycleId, scope.competitionId, scope.homeTeamId, scope.awayTeamId, scope.evidenceRef]
        .some((value) => typeof value !== "string" || !value || value.length > 512)) {
      reasons.add("unverified-or-late-historical-scope"); continue;
    }
    const previous = scopes.get(scope.externalFixtureId);
    const identity = (entry: HistoricalFixtureScope) => [entry.fixtureId, entry.cycleId, entry.competitionId,
      entry.homeExternalId, entry.awayExternalId, entry.homeTeamId, entry.awayTeamId];
    if (previous && evidenceFingerprint(identity(previous)) !== evidenceFingerprint(identity(scope))) conflicts.add(scope.externalFixtureId);
    else if (!previous || scope.observedAt < previous.observedAt) scopes.set(scope.externalFixtureId, scope);
  }
  const rows = new Map<number, BaselineResult>();
  for (const fact of snapshot.facts) {
    if (fact.kind !== "history" || fact.flags.includes("conflict")) continue;
    for (const entry of fact.values) {
      const value = entry.value, externalId = Number(value.fixtureId), scope = scopes.get(externalId);
      if (entry.certainty !== "confirmed" || !entry.sourceIds.length || entry.sourceIds.some((id) => !sources.has(id)) ||
        value.regulationVerified !== true || value.period !== "regulation-including-stoppage-time") continue;
      if (!scope) { reasons.add("missing-historical-competition-scope"); continue; }
      if (scope.homeExternalId !== value.homeExternalId || scope.awayExternalId !== value.awayExternalId) {
        conflicts.add(externalId); continue;
      }
      if ([snapshot.context.home, snapshot.context.away].some((team) =>
        scope.homeExternalId === team.externalId && scope.homeTeamId !== team.teamId ||
        scope.awayExternalId === team.externalId && scope.awayTeamId !== team.teamId)) {
        conflicts.add(externalId); continue;
      }
      const receipts = entry.sourceIds.map((id) => sources.get(id)!);
      const availableAt = Math.max(scope.observedAt, entry.asOfAt ?? 0, ...receipts.map((source) => source.retrievedAt));
      if (!Number.isSafeInteger(value.kickoffAt) || Number(value.kickoffAt) >= availableAt || availableAt > snapshot.context.cutoffAt ||
        externalId === snapshot.context.externalFixtureId || ![value.homeGoals, value.awayGoals].every((n) =>
          typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= 100)) continue;
      const body = { fixtureId: scope.fixtureId, cycleId: scope.cycleId, competitionId: scope.competitionId,
        homeTeamId: scope.homeTeamId, awayTeamId: scope.awayTeamId,
        kickoffAt: utcInstantFromEpochMilliseconds(Number(value.kickoffAt)), availableAt: utcInstantFromEpochMilliseconds(availableAt),
        homeGoals: Number(value.homeGoals), awayGoals: Number(value.awayGoals), period: "regulation-including-stoppage-time" as const };
      const previous = rows.get(externalId);
      if (previous && ["fixtureId", "competitionId", "homeTeamId", "awayTeamId", "kickoffAt", "homeGoals", "awayGoals"]
        .some((key) => previous[key as keyof BaselineResult] !== body[key as keyof typeof body])) {
        conflicts.add(externalId); continue;
      }
      // First authenticated observation is sufficient; duplicate team histories
      // are one result, never independent observations of the same match.
      if (!previous || availableAt < previous.availableAt) rows.set(externalId, { ...body,
        observationHash: evidenceFingerprint({ ...body, scope: scope.evidenceRef, sources: entry.sourceIds.slice().sort() }),
        evidenceRef: `snapshot:${snapshot.id}:history:${externalId}` });
    }
  }
  if (conflicts.size) reasons.add("conflicting-historical-scope-or-score");
  return freezeEvidence({ history: [...rows].filter(([id]) => !conflicts.has(id)).map(([, row]) => row)
    .sort((a, b) => a.kickoffAt - b.kickoffAt || a.fixtureId.localeCompare(b.fixtureId)),
    snapshotId: snapshot.id, reasons: [...reasons].sort() });
}
