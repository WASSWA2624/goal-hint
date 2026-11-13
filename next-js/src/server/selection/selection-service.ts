import "server-only";

import { randomBytes } from "node:crypto";
import { addReportingDays } from "../../domain/calendar.ts";
import type { createFootballCatalogImporter } from "../football/catalog-service.ts";
import { selectionFail, type DegradedSelectionAction, type SelectionAuthority, type SelectionLease } from "./selection-contract.ts";
import { hourlySelectionWindow, parseDegradedAction, parseSelectionPolicy, SELECTION_HOUR_MS, selectionWindow } from "./selection-input.ts";
import type { DailySelectionStore } from "./selection-mysql-store.ts";

/** Private schedule orchestration. Provider pagination/retries stay inside the
 * canonical importer/adapter/limiter; AI and result polling never run here. */
export function createDailySelectionService(options: Readonly<{
  policy: unknown; authority: SelectionAuthority; store: DailySelectionStore;
  importer: Pick<ReturnType<typeof createFootballCatalogImporter>, "import">;
  hourlyImporter?: Pick<ReturnType<typeof createFootballCatalogImporter>, "import">;
  cutoff: Readonly<{ scheduleRun(runId: string): Promise<unknown> }>;
  reconcileHourly?(lease: SelectionLease, scheduledFor: number, signal?: AbortSignal): Promise<readonly string[]>;
}>) {
  const policy = parseSelectionPolicy(options.policy);
  function authorize() {
    try { options.authority.authorize(policy); } catch { return selectionFail("unauthorized"); }
    let verified = false;
    try { verified = options.authority.verifyPolicy(policy) === true; } catch { /* Fail closed. */ }
    if (!verified) return selectionFail("policy-required");
  }
  async function run(scheduledFor: number, input: DegradedSelectionAction | undefined, signal: AbortSignal | undefined, hourly: boolean) {
    const days = policy.windowDays ?? 7;
    const { window, slotHour } = hourly ? hourlySelectionWindow(scheduledFor, days) : { window: selectionWindow(scheduledFor, days), slotHour: 0 };
    let action: DegradedSelectionAction | null = null;
    authorize();
    if (input !== undefined) {
      action = parseDegradedAction(input);
      if (policy.degradationPolicyRef === null || action.policyRef !== policy.degradationPolicyRef) return selectionFail("policy-required");
      let verified = false;
      try { verified = options.authority.verifyDegradedAction(action, window.runDate) === true; } catch { /* Fail closed. */ }
      if (!verified) return selectionFail("unauthorized");
    }
    const lease = await options.store.acquire(window.runDate, policy, randomBytes(32).toString("hex"), slotHour);
    if (!lease) return { status: "busy" as const };
    const leaseMs = lease.leaseMs ?? policy.leaseMs;
    let lost = false, renewal = Promise.resolve();
    const timer = setInterval(() => {
      renewal = renewal.then(async () => {
        if (!lost) try { await options.store.renew(lease, leaseMs); } catch { lost = true; }
      });
    }, Math.max(100, Math.floor(leaseMs / 3)));
    const checkpoint = async () => {
      await renewal;
      if (lost || signal?.aborted) return selectionFail("lost-lease");
      authorize(); await options.store.renew(lease, leaseMs);
    };
    try {
      const previous = await options.store.inspect(lease.runId);
      if (!previous?.manifest) {
        const importer = hourly ? options.hourlyImporter ?? options.importer : options.importer;
        // Dates beyond a plan's horizon are never requested and remain explicit missing coverage.
        for (let offset = 0; offset < (policy.importDays ?? policy.windowDays ?? 7); offset++) {
          const date = addReportingDays(window.runDate, offset);
          for (let attempt = 0; attempt < (hourly ? 1 : policy.attemptsPerInvocation); attempt++) {
            await checkpoint();
            const pending = await options.store.beginImport(lease, date, policy);
            if (!pending) break;
            let failed = false;
            const deadlineAt = pending.request.bounds.deadlineAt;
            const workflow = hourly && signal ? { signal, deadlineAt, check: () => {
              if (signal.aborted || Date.now() >= deadlineAt) return selectionFail("lost-lease");
            } } : undefined;
            try { await importer.import(pending.request, undefined, workflow); } catch { failed = true; }
            await checkpoint();
            await options.store.finishImport(lease, pending.id, failed);
          }
        }
        // Reuse the midnight date sweep when it completes in its own hourly slot.
        const confirmed = hourly || Date.now() < scheduledFor + SELECTION_HOUR_MS
          ? await options.reconcileHourly?.(lease, scheduledFor, signal) ?? [] : [];
        await checkpoint();
        // Reverify an explicit degraded action immediately before immutable commit.
        if (action && options.authority.verifyDegradedAction(action, window.runDate) !== true) return selectionFail("unauthorized");
        await options.store.commit(lease, policy, action, confirmed);
      }
      await checkpoint();
      const progress = await options.store.reconcile(lease);
      await checkpoint();
      if (!hourly) await options.cutoff.scheduleRun(lease.runId);
      await checkpoint();
      return { status: "committed" as const, runId: lease.runId, ...progress };
    } finally {
      clearInterval(timer); await renewal;
      await options.store.release(lease).catch(() => {});
    }
  }
  return Object.freeze({
    run: (scheduledFor: number, input?: DegradedSelectionAction, signal?: AbortSignal) => run(scheduledFor, input, signal, false),
    runHourly: (scheduledFor: number, signal?: AbortSignal, input?: DegradedSelectionAction) => run(scheduledFor, input, signal, true),
  });
}
