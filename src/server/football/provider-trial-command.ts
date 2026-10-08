import "server-only";

import { lstat, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { getRuntimePolicy, assertOperationAllowed, type RuntimePolicy, type EvidenceVerifier } from "../config/runtime-policy.ts";
import { createApiFootballAdapter, type ApiFootballAdapterOptions } from "./api-football-adapter.ts";
import { createPolicyQuotaGateway } from "./quota-gateway.ts";
import { createQuotaLimiter } from "./quota-limiter.ts";
import { createMysqlQuotaStore } from "./quota-mysql-store.ts";
import type { QuotaEvidenceVerifier, QuotaPeriodEvidence } from "./quota-contract.ts";
import { buildTrialReport, renderTrialReport } from "./provider-trial-evaluation.ts";
import { withTrialJournal } from "./provider-trial-journal.ts";
import { createOfflineTrialPlan, parseTrialPlan } from "./provider-trial-input.ts";
import { runProviderTrial, trialTaskDeadline, type TrialRuntime, type TrialSession } from "./provider-trial-runner.ts";
import type { TrialPlan, TrialTask, TrialEvidence, TrialObservation, TrialFreshness } from "./provider-trial-contract.ts";

/** Privileged local verification code, supplied by the operator; data labels never grant authority. */
export type TrialAuthority = Readonly<{
  verifyRuntimeEvidence: EvidenceVerifier;
  verifyQuotaEvidence: QuotaEvidenceVerifier;
  quotaEvidence: QuotaPeriodEvidence;
  authorizeTrial(plan: TrialPlan, task: TrialTask): void;
  verifyEvidence: (evidence: TrialEvidence) => boolean;
  verifyObservation: (observation: TrialObservation) => boolean;
  verifyFreshness: (policy: TrialFreshness) => boolean;
  verifyLogo?: ApiFootballAdapterOptions["verifyLogo"];
  verifyRegulationScore?: ApiFootballAdapterOptions["verifyRegulationScore"];
  batchEvidence?: ApiFootballAdapterOptions["batchEvidence"];
  verifyBatchEvidence?: ApiFootballAdapterOptions["verifyBatchEvidence"];
}>;
export class TrialCommandError extends Error {
  readonly reason: "invalid-arguments" | "invalid-file" | "live-blocked" | "storage-error";
  constructor(reason: TrialCommandError["reason"]) { super(`Provider trial ${reason}; private diagnostics are withheld.`); this.name = "TrialCommandError"; this.reason = reason; }
}
async function privateJson(file: string, maximum = 33_554_432): Promise<unknown> {
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > maximum) throw new TrialCommandError("invalid-file");
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) { if (error instanceof TrialCommandError) throw error; throw new TrialCommandError("invalid-file"); }
}
async function writeReport(directory: string, filename: string, text: string): Promise<void> {
  const destination = path.join(directory, filename), temporary = `${destination}.${randomBytes(16).toString("hex")}.tmp`;
  try {
    try { const info = await lstat(destination); if (!info.isFile() || info.isSymbolicLink()) throw new TrialCommandError("storage-error"); }
    catch (error) { if (!(error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error; }
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(text, "utf8"); await file.sync(); } finally { await file.close(); }
    await rename(temporary, destination);
  } catch { throw new TrialCommandError("storage-error"); }
  finally { try { await unlink(temporary); } catch { /* Only this invocation's random temporary file. */ } }
}
async function loadAuthority(file: string): Promise<TrialAuthority> {
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) throw new TrialCommandError("live-blocked");
    const authorityModule = await import(pathToFileURL(file).href);
    const authority: TrialAuthority = authorityModule.trialAuthority;
    if (!authority || [authority.verifyRuntimeEvidence, authority.verifyQuotaEvidence, authority.authorizeTrial,
      authority.verifyEvidence, authority.verifyObservation, authority.verifyFreshness].some((method) => typeof method !== "function")) throw new TrialCommandError("live-blocked");
    return authority;
  } catch { throw new TrialCommandError("live-blocked"); }
}
async function liveRuntime(plan: TrialPlan, authority: TrialAuthority, policy: RuntimePolicy, session: TrialSession) {
  if (policy.scope !== "trial" || policy.mode === "test" || plan.accountId === null || plan.maxRequests === null || plan.bounds === null
    || plan.deadlineAt === null || plan.deadlineAt <= Date.now() || plan.competitions.length === 0
    || policy.choices.football.trialRequestLimit === null || plan.maxRequests > policy.choices.football.trialRequestLimit
    || policy.choices.competitionIds === null || plan.competitions.some((entry) => !policy.choices.competitionIds!.includes(entry.id))
    || authority.quotaEvidence?.accountId !== plan.accountId) throw new TrialCommandError("live-blocked");
  assertOperationAllowed(policy, "football", authority.verifyRuntimeEvidence);
  assertOperationAllowed(policy, "database", authority.verifyRuntimeEvidence);
  const { createDatabase } = await import("../database/client.ts");
  const database = createDatabase(policy, authority.verifyRuntimeEvidence);
  try {
    const limiter = createQuotaLimiter({ accountId: plan.accountId, store: createMysqlQuotaStore(database), verifyEvidence: authority.verifyQuotaEvidence });
    if ((await limiter.initialize(authority.quotaEvidence)).status !== "initialized") throw new TrialCommandError("live-blocked");
    let currentTask: TrialTask | null = null;
    const authorize = () => {
      assertOperationAllowed(policy, "football", authority.verifyRuntimeEvidence);
      if (!currentTask) throw new TrialCommandError("live-blocked");
      authority.authorizeTrial(plan, currentTask);
      const clock = { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
      const deadline = trialTaskDeadline(plan, currentTask, session.read(), { ...authority, source: "live-provider" }, clock);
      if (deadline === null || deadline <= clock.now()) throw new TrialCommandError("live-blocked");
    };
    const gateway = createPolicyQuotaGateway({ limiter, policy, verifyEvidence: (_reference, requirement) => {
      if (!currentTask) return false;
      try { authorize(); return authority.verifyRuntimeEvidence(_reference, requirement) === true; } catch { return false; }
    } });
    const adapter = createApiFootballAdapter({ accountId: plan.accountId, credential: { read: () => policy.secrets.footballKey?.read() ?? "" }, gateway, authorize,
      ...(authority.verifyLogo === undefined ? {} : { verifyLogo: authority.verifyLogo }),
      ...(authority.verifyRegulationScore === undefined ? {} : { verifyRegulationScore: authority.verifyRegulationScore }),
      ...(authority.batchEvidence === undefined ? {} : { batchEvidence: authority.batchEvidence }),
      ...(authority.verifyBatchEvidence === undefined ? {} : { verifyBatchEvidence: authority.verifyBatchEvidence }),
    });
    const runtime: TrialRuntime = { adapter, source: "live-provider", authorize: (_plan, task) => { currentTask = task; authorize(); },
      verifyObservation: authority.verifyObservation, verifyFreshness: authority.verifyFreshness };
    return { runtime, close: () => database.disconnect() };
  } catch (error) { await database.disconnect().catch(() => {}); throw error; }
}

export type TrialCommandOptions = Readonly<{ action: "init" | "report" | "run"; directory: string; planFile?: string; authorityFile?: string; clock?: Clock }>;
/** Offline actions never parse live policy, construct a database or call a provider. */
export async function executeTrialCommand(options: TrialCommandOptions) {
  const directory = path.resolve(options.directory);
  let plan: TrialPlan;
  if (options.planFile) plan = parseTrialPlan(await privateJson(path.resolve(options.planFile), 1_048_576));
  else {
    const existing = path.join(directory, "provider-trial-journal.json");
    try { plan = parseTrialPlan((await privateJson(existing) as { plan: unknown }).plan); }
    catch (error) {
      // An existing unreadable journal must never become a fresh allowance.
      try { await lstat(existing); throw error; }
      catch (missing) { if (missing !== null && typeof missing === "object" && "code" in missing && missing.code === "ENOENT") plan = createOfflineTrialPlan(); else throw error; }
    }
  }
  const authority = options.authorityFile ? await loadAuthority(path.resolve(options.authorityFile)) : null;
  return withTrialJournal(directory, plan, async (session) => {
    let reason = "offline";
    if (options.action === "run") {
      let live: Awaited<ReturnType<typeof liveRuntime>> | undefined;
      try {
        if (!authority) throw new TrialCommandError("live-blocked");
        live = await liveRuntime(plan, authority, getRuntimePolicy(), session);
        reason = (await runProviderTrial(session, live.runtime, options.clock === undefined ? {} : { clock: options.clock })).reason;
      } catch { reason = "blocked"; }
      finally { if (live) try { await live.close(); } catch { reason = "blocked"; } }
    }
    const report = buildTrialReport(session.read(), {
      ...(options.clock === undefined ? {} : { clock: options.clock }),
      ...(authority === null ? {} : { verifyEvidence: authority.verifyEvidence, verifyObservation: authority.verifyObservation, verifyFreshness: authority.verifyFreshness }),
    });
    const reportFile = path.join(directory, "provider-trial-report.md"), jsonFile = path.join(directory, "provider-trial-report.json");
    await writeReport(directory, "provider-trial-report.json", `${JSON.stringify(report, null, 2)}\n`);
    await writeReport(directory, "provider-trial-report.md", renderTrialReport(report));
    return { reason, report, reportFile, jsonFile };
  }, options.clock === undefined ? {} : { clock: options.clock });
}
