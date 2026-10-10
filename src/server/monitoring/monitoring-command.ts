import "server-only";

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getRuntimePolicy, type EvidenceVerifier, type RuntimePolicy } from "../config/runtime-policy.ts";
import { createDatabase } from "../database/client.ts";
import { authorizeMonitoring, monitoringFail, monitoringPolicySchema, parseMonitoring,
  type MonitoringAuthority, type MonitoringCost } from "./monitoring-contract.ts";
import { createOperationsMonitor, type MonitoringSink } from "./monitoring-alerts.ts";
import { createMysqlMonitoringStore } from "./monitoring-mysql-store.ts";
import { createMonitoringInspector } from "./monitoring-scan.ts";
import { discoveryMeasurementStatus } from "./monitoring-evidence.ts";

export type MonitoringBinding = Readonly<{ policy: unknown; authority: MonitoringAuthority; sink?: MonitoringSink;
  verifyDatabaseEvidence?: EvidenceVerifier; costs?: () => Promise<readonly MonitoringCost[]>; close?(): Promise<void> }>;
/** Trusted operator module, never a path supplied by a public request. No bundled live authorization. */
export async function runMonitoringCommand(args: readonly string[], signal: AbortSignal) {
  const [mode, flag, path, ...rest] = args;
  if (!mode || !["inspect", "notify"].includes(mode) || flag !== "--binding" || !path || !/\.(?:mjs|ts)$/u.test(path) || rest.length)
    return monitoringFail("invalid-input");
  const bindingModule = await import(pathToFileURL(resolve(path)).href) as {
    createMonitoringBinding?: (runtime: RuntimePolicy) => MonitoringBinding | Promise<MonitoringBinding> };
  if (typeof bindingModule.createMonitoringBinding !== "function") return monitoringFail("invalid-input");
  const runtime = getRuntimePolicy(), binding = await bindingModule.createMonitoringBinding(runtime);
  try {
    const policy = parseMonitoring(monitoringPolicySchema, binding.policy);
    await authorizeMonitoring(binding.authority, policy, mode === "inspect" ? "inspect" : "notify");
    if (signal.aborted || mode === "notify" && !binding.sink) return monitoringFail("invalid-input");
    const database = createDatabase(runtime, binding.verifyDatabaseEvidence);
    try {
      const inspector = createMonitoringInspector({ database, policy, authority: binding.authority, ...(binding.costs ? { costs: binding.costs } : {}) });
      const snapshot = await inspector.inspect();
      if (mode === "inspect") return { snapshot, discovery: discoveryMeasurementStatus };
      const monitor = createOperationsMonitor({ policy, authority: binding.authority,
        store: createMysqlMonitoringStore(database), sink: binding.sink! });
      return { detection: await monitor.observe(snapshot), delivery: await monitor.deliver(signal), discovery: discoveryMeasurementStatus };
    } finally { await database.disconnect(); }
  } finally { await binding.close?.().catch(() => {}); }
}
