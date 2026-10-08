import "server-only";

import { performance } from "node:perf_hooks";
import { getPublicationDeadline, utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import type { createApiFootballAdapter } from "./api-football-adapter.ts";
import type { ApiFootballBounds, ApiFootballResult } from "./api-football-contract.ts";
import type { TrialJournal, TrialPlan, TrialTask, TrialObservation } from "./provider-trial-contract.ts";

export type TrialSession = Readonly<{ read(): TrialJournal; write(journal: TrialJournal): Promise<void> }>;
export type TrialRuntime = Readonly<{
  adapter: ReturnType<typeof createApiFootballAdapter>;
  source: "live-provider" | "synthetic";
  /** Verifies the approved competition/allowance/retention policy before each task. */
  authorize(plan: TrialPlan, task: TrialTask): void;
  verifyObservation: (observation: TrialObservation) => boolean;
  verifyFreshness: (policy: NonNullable<TrialPlan["freshness"]>) => boolean;
}>;
export type TrialRunOutcome = Readonly<{ reason: "completed" | "incomplete" | "waiting" | "budget-exhausted" | "deadline-exceeded" | "blocked" | "dependency-unavailable" }>;
export function chargedTrialRequests(journal: TrialJournal): number {
  return journal.tasks.reduce((total, task) => total + (task.status === "deferred" ? 0 :
    task.status === "completed" && task.dispatchedRequests !== null ? task.dispatchedRequests : task.reservedRequests), 0);
}
async function execute(adapter: TrialRuntime["adapter"], task: TrialTask, bounds: ApiFootballBounds): Promise<ApiFootballResult<unknown>> {
  const operation = task.operation;
  switch (operation.kind) {
    case "account-status": return adapter.evidence.accountStatus(bounds);
    case "fixtures": return adapter.evidence.fixtures(operation.query, bounds);
    case "live": return adapter.evidence.liveFixtures(bounds);
    case "fixture-ids": return adapter.evidence.unresolvedFixtures(operation.ids, bounds);
    case "teams": return adapter.evidence.teams(operation.query, bounds);
    case "competitions": return adapter.evidence.competitions(operation.query, bounds);
    case "player-statistics": return adapter.evidence.playerStatistics(operation.query, bounds);
    case "statistics": return adapter.evidence.statistics(operation.fixtureId, bounds);
    case "lineups": case "injuries": return adapter.evidence.availability(operation.fixtureId, operation.kind, bounds);
    case "predictions": return adapter.fallback.predictions(operation.fixtureId, bounds);
  }
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
export function trialTaskDeadline(plan: TrialPlan, task: TrialTask, journal: TrialJournal,
  runtime: Pick<TrialRuntime, "source" | "verifyObservation" | "verifyFreshness">, clock: Clock): number | null {
  if (task.operation.kind !== "predictions") return plan.deadlineAt;
  const freshness = plan.freshness;
  const contextTask = plan.tasks.find((entry) => entry.id === task.fixtureTaskId);
  const context = journal.tasks.find((state) => state.id === task.fixtureTaskId)?.observation;
  try {
    if (!contextTask || !["fixtures", "live", "fixture-ids"].includes(contextTask.operation.kind)
      || !freshness || runtime.verifyFreshness(freshness) !== true || !context || runtime.verifyObservation(context) !== true
      || context.result.status !== "complete" || context.source !== runtime.source) return null;
    const fixtureId = task.operation.fixtureId;
    const fixture = context.result.data.find((row) => record(row) && row.id === fixtureId);
    const now = clock.now();
    if (!record(fixture) || fixture.status !== "scheduled" || !Number.isSafeInteger(fixture.kickoff) || !record(fixture.source)
      || !Number.isSafeInteger(fixture.source.retrievedAt)) return null;
    const age = now - Number(fixture.source.retrievedAt);
    if (age < 0 || age > freshness.maxRetrievalAgeMs) return null;
    const update = fixture.source.providerUpdatedAt;
    if (update === null ? freshness.unknownUpdateTime !== "retrieval-only" : !Number.isSafeInteger(update)
      || Number(update) > Number(fixture.source.retrievedAt) || now - Number(update) > freshness.maxSourceAgeMs) return null;
    const cutoff = getPublicationDeadline(utcInstantFromEpochMilliseconds(Number(fixture.kickoff)));
    return cutoff > now ? Math.min(plan.deadlineAt!, cutoff) : null;
  } catch { return null; }
}

/** Writes the full bounded intent before I/O; crash recovery never refunds or replays it. */
export async function runProviderTrial(session: TrialSession, runtime: TrialRuntime, options: Readonly<{ clock?: Clock }> = {}): Promise<TrialRunOutcome> {
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const plan = session.read().plan;
  if (plan.deadlineAt === null || plan.maxRequests === null || plan.bounds === null || plan.accountId === null || plan.competitions.length === 0) return { reason: "blocked" };
  const initialNow = clock.now(), monotonicStart = performance.now(), wallAllowance = plan.deadlineAt - initialNow;
  for (const task of plan.tasks) {
    const journal = session.read();
    const previous = journal.tasks.find((state) => state.id === task.id);
    if (previous && previous.status !== "deferred") continue;
    const now = clock.now();
    if (now < journal.updatedAt || now >= plan.deadlineAt || performance.now() - monotonicStart >= wallAllowance) return { reason: "deadline-exceeded" };
    if (task.notBefore !== undefined && now < task.notBefore) return { reason: "waiting" };
    const remaining = plan.maxRequests - chargedTrialRequests(journal);
    if (remaining <= 0) return { reason: "budget-exhausted" };
    try { runtime.authorize(plan, task); } catch { return { reason: "blocked" }; }
    const deadline = trialTaskDeadline(plan, task, journal, runtime, clock);
    if (deadline === null) return { reason: "dependency-unavailable" };
    const reservation = Math.min(task.maxRequests, remaining);
    const running = Object.freeze({ id: task.id, status: "running" as const, startedAt: clock.now(), finishedAt: null,
      reservedRequests: reservation, dispatchedRequests: null, observation: null });
    await session.write({ ...journal, updatedAt: running.startedAt, tasks: previous
      ? journal.tasks.map((state) => state.id === task.id ? running : state) : [...journal.tasks, running] });
    const bounds: ApiFootballBounds = { ...plan.bounds, deadlineAt: utcInstantFromEpochMilliseconds(deadline), maxRequests: reservation,
      cacheScope: `trial:${plan.id}:${task.id}` };
    let result: ApiFootballResult<unknown>;
    try {
      // Revoked authority or a delayed journal commit cannot enter provider transport.
      runtime.authorize(plan, task);
      if (clock.now() < running.startedAt || clock.now() >= deadline || performance.now() - monotonicStart >= wallAllowance) return { reason: "deadline-exceeded" };
      if (trialTaskDeadline(plan, task, session.read(), runtime, clock) === null) return { reason: "dependency-unavailable" };
      result = await execute(runtime.adapter, task, bounds);
    } catch {
      const current = session.read();
      const finishedAt = clock.now();
      await session.write({ ...current, updatedAt: finishedAt, tasks: current.tasks.map((state) => state.id === task.id
        ? { ...state, status: "uncertain", finishedAt } : state) });
      return { reason: "blocked" };
    }
    if (!Number.isSafeInteger(result.requestsDispatched) || result.requestsDispatched < 0 || result.requestsDispatched > reservation) {
      // An invalid transport counter cannot release the committed reservation.
      return { reason: "blocked" };
    }
    const finishedAt = clock.now(), current = session.read();
    const observation: TrialObservation = Object.freeze({ taskId: task.id, source: runtime.source, observedAt: finishedAt, result });
    // A proven zero-dispatch capacity wait can resume; any actual I/O remains immutable.
    const deferred = result.status === "failed" && result.requestsDispatched === 0 &&
      (result.error?.reason === "quota-denied" || result.error?.reason === "shared-work-pending");
    await session.write({ ...current, updatedAt: finishedAt, tasks: current.tasks.map((state) => state.id === task.id
      ? { ...state, status: deferred ? "deferred" : "completed", finishedAt, dispatchedRequests: result.requestsDispatched, observation } : state) });
    if (clock.now() >= plan.deadlineAt || performance.now() - monotonicStart >= wallAllowance) return { reason: "deadline-exceeded" };
    if (result.error?.reason === "operation-not-authorized" || result.error?.reason === "invalid-credential") return { reason: "blocked" };
    if (deferred) return { reason: "waiting" };
  }
  return { reason: session.read().tasks.some((state) => state.status !== "completed" ||
    state.observation?.result.status !== "complete" || !state.observation.result.completeness.complete) ? "incomplete" : "completed" };
}
