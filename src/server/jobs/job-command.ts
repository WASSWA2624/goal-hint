import "server-only";

import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getRuntimePolicy, type EvidenceVerifier, type RuntimePolicy } from "../config/runtime-policy.ts";
import { createDatabase } from "../database/client.ts";
import { jobFail } from "./job-contract.ts";
import { createMysqlJobQueue } from "./job-mysql-store.ts";
import type { JobRegistry } from "./job-registry.ts";
import { createJobWorker, type WorkerEvent } from "./job-worker.ts";

export type WorkerBinding = Readonly<{
  registry: JobRegistry; authorizeWorker(policy: RuntimePolicy): boolean | Promise<boolean>;
  verifyDatabaseEvidence?: EvidenceVerifier; pollMs?: number;
}>;
/** The module is trusted operator code, never a path supplied by an HTTP request. */
export async function runJobWorkerCommand(args: readonly string[], options: Readonly<{
  signal: AbortSignal; onEvent?: (event: WorkerEvent) => void; onReady?: () => void;
}>) {
  if (args.length !== 2 || args[0] !== "--binding" || !args[1] || !/\.(?:mjs|ts)$/u.test(args[1])) return jobFail("invalid-request");
  const bindingModule = await import(pathToFileURL(resolve(args[1])).href) as { createWorkerBinding?: (policy: RuntimePolicy) => WorkerBinding | Promise<WorkerBinding> };
  const policy = getRuntimePolicy();
  if (typeof bindingModule.createWorkerBinding !== "function") return jobFail("invalid-request");
  const binding = await bindingModule.createWorkerBinding(policy);
  if (!binding || typeof binding.authorizeWorker !== "function" || await binding.authorizeWorker(policy) !== true ||
    !binding.registry || binding.registry.types.length === 0) return jobFail("unauthorized");
  const database = createDatabase(policy, binding.verifyDatabaseEvidence);
  try {
    if (await database.readiness() !== "ready") return jobFail("unavailable");
    const worker = createJobWorker({ queue: createMysqlJobQueue(database), registry: binding.registry,
      ownerId: randomBytes(32).toString("hex"), ...(binding.pollMs === undefined ? {} : { pollMs: binding.pollMs }),
      ...(options.onEvent === undefined ? {} : { onEvent: options.onEvent }) });
    options.onReady?.(); await worker.run(options.signal);
  } finally { await database.disconnect(); }
}
