import "server-only";

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getRuntimePolicy, type EvidenceVerifier, type RuntimePolicy } from "../config/runtime-policy.ts";
import { createDatabase, type DatabaseRuntime } from "../database/client.ts";
import { resultSyncFail } from "./result-sync-contract.ts";
import type { createResultSyncService } from "./result-sync-service.ts";

export type ResultSyncBinding = Readonly<{
  authorizeWorker(policy: RuntimePolicy): boolean | Promise<boolean>;
  verifyDatabaseEvidence?: EvidenceVerifier;
  createPoller(database: DatabaseRuntime): ReturnType<typeof createResultSyncService>;
}>;
/** Trusted operator module only; never reachable through a visitor request. */
export async function runResultSyncCommand(args: readonly string[], signal: AbortSignal) {
  if (args.length !== 2 || args[0] !== "--binding" || !args[1] || !/\.(?:mjs|ts)$/u.test(args[1])) return resultSyncFail("invalid-request");
  const bindingModule = await import(pathToFileURL(resolve(args[1])).href) as {
    createResultSyncBinding?: (policy: RuntimePolicy) => ResultSyncBinding | Promise<ResultSyncBinding>;
  };
  const policy = getRuntimePolicy();
  if (typeof bindingModule.createResultSyncBinding !== "function") return resultSyncFail("invalid-request");
  const binding = await bindingModule.createResultSyncBinding(policy);
  if (!binding || typeof binding.authorizeWorker !== "function" || await binding.authorizeWorker(policy) !== true ||
    typeof binding.createPoller !== "function") return resultSyncFail("unauthorized");
  const database = createDatabase(policy, binding.verifyDatabaseEvidence);
  try {
    if (await database.readiness() !== "ready") return resultSyncFail("unavailable");
    await binding.createPoller(database).run(signal);
  } finally { await database.disconnect(); }
}
