import "server-only";

import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { getRuntimePolicy, type EvidenceVerifier, type RuntimePolicy } from "../config/runtime-policy.ts";
import { createDatabase, type DatabaseRuntime } from "../database/client.ts";
import { createMysqlJobQueue } from "../jobs/job-mysql-store.ts";
import { createJobRegistry } from "../jobs/job-registry.ts";
import { createJobWorker } from "../jobs/job-worker.ts";
import { parseRecovery, recoveryFail, recoveryScope } from "./recovery-input.ts";
import { createRecoveryWatchdog, type RecoveryAuthority, type RecoveryServices } from "./recovery-service.ts";

export type RecoveryBinding = Readonly<{ policy: unknown; authority: RecoveryAuthority;
  verifyDatabaseEvidence?: EvidenceVerifier;
  createServices(database: DatabaseRuntime): RecoveryServices | Promise<RecoveryServices>;
  close?(): Promise<void>;
}>;
/** Local trusted operator code; never accept binding/input paths from an HTTP request. */
export async function runRecoveryCommand(args: readonly string[], signal: AbortSignal) {
  const [mode, bindingFlag, bindingPath, valueFlag, value, cursorFlag, cursor, ...rest] = args;
  if (!mode || !["inspect", "plan", "apply", "audit", "worker"].includes(mode) || bindingFlag !== "--binding" ||
    !bindingPath || !/\.(?:mjs|ts)$/u.test(bindingPath) || rest.length ||
    (cursorFlag !== undefined && (!["inspect", "plan", "audit"].includes(mode) || cursorFlag !== "--after" || !cursor)) ||
    (mode === "worker" ? valueFlag !== undefined : !value || valueFlag !== (mode === "apply" ? "--input" : mode === "audit" ? "--job" : "--scope")))
    return recoveryFail("invalid-request");
  const bindingModule = await import(pathToFileURL(resolve(bindingPath)).href) as {
    createRecoveryBinding?: (policy: RuntimePolicy) => RecoveryBinding | Promise<RecoveryBinding> };
  if (typeof bindingModule.createRecoveryBinding !== "function") return recoveryFail("invalid-request");
  const runtime = getRuntimePolicy(), binding = await bindingModule.createRecoveryBinding(runtime);
  if (!binding?.authority || await binding.authority.authorize(mode === "inspect" || mode === "plan" || mode === "audit" ? "inspect" : "repair") !== true)
    return recoveryFail("unauthorized");
  const database = createDatabase(runtime, binding.verifyDatabaseEvidence);
  try {
    if (await database.readiness() !== "ready") return recoveryFail("unavailable");
    const queue = createMysqlJobQueue(database), watchdog = createRecoveryWatchdog({ database, queue,
      policy: binding.policy, authority: binding.authority, services: await binding.createServices(database) });
    if (mode === "worker") {
      await createJobWorker({ queue, registry: createJobRegistry([watchdog.definition]), ownerId: randomBytes(32).toString("hex") }).run(signal);
      return { status: "stopped" };
    }
    if (mode === "audit") return watchdog.audit(value!, cursor);
    if (mode === "apply") {
      const file = await open(resolve(value!), "r"), bytes = Buffer.alloc(65_537);
      let length: number;
      try { length = (await file.read(bytes, 0, bytes.length, 0)).bytesRead; } finally { await file.close(); }
      if (length > 65_536) return recoveryFail("invalid-request");
      let plan: unknown; try { plan = JSON.parse(bytes.subarray(0, length).toString("utf8")); } catch { return recoveryFail("invalid-request"); }
      return watchdog.enqueue(plan);
    }
    return watchdog.inspect(parseRecovery(recoveryScope, value), cursor);
  } finally { await binding.close?.().catch(() => {}); await database.disconnect(); }
}
