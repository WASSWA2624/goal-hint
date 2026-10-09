import "server-only";

import { randomBytes } from "node:crypto";
import { addReportingDays } from "../../domain/calendar.ts";
import type { createFootballCatalogImporter } from "../football/catalog-service.ts";
import { selectionFail, type DegradedSelectionAction, type SelectionAuthority } from "./selection-contract.ts";
import { parseDegradedAction, parseSelectionPolicy, selectionWindow } from "./selection-input.ts";
import type { DailySelectionStore } from "./selection-mysql-store.ts";

/** Private daily orchestration only. Provider pagination/retries stay inside the
 * canonical importer/adapter/limiter; AI and result polling never run here. */
export function createDailySelectionService(options: Readonly<{
  policy: unknown; authority: SelectionAuthority; store: DailySelectionStore;
  importer: Pick<ReturnType<typeof createFootballCatalogImporter>, "import">;
  cutoff: Readonly<{ scheduleRun(runId: string): Promise<unknown> }>;
}>) {
  const policy = parseSelectionPolicy(options.policy);
  function authorize() {
    try { options.authority.authorize(policy); } catch { return selectionFail("unauthorized"); }
    let verified = false;
    try { verified = options.authority.verifyPolicy(policy) === true; } catch { /* Fail closed. */ }
    if (!verified) return selectionFail("policy-required");
  }
  return Object.freeze({
    async run(scheduledFor: number, input?: DegradedSelectionAction, signal?: AbortSignal) {
      const window = selectionWindow(scheduledFor);
      let action: DegradedSelectionAction | null = null;
      authorize();
      if (input !== undefined) {
        action = parseDegradedAction(input);
        if (policy.degradationPolicyRef === null || action.policyRef !== policy.degradationPolicyRef) return selectionFail("policy-required");
        let verified = false;
        try { verified = options.authority.verifyDegradedAction(action, window.runDate) === true; } catch { /* Fail closed. */ }
        if (!verified) return selectionFail("unauthorized");
      }
      const lease = await options.store.acquire(window.runDate, policy, randomBytes(32).toString("hex"));
      if (!lease) return { status: "busy" as const };
      let lost = false, renewal = Promise.resolve();
      const timer = setInterval(() => {
        renewal = renewal.then(async () => {
          if (!lost) try { await options.store.renew(lease, policy.leaseMs); } catch { lost = true; }
        });
      }, Math.max(100, Math.floor(policy.leaseMs / 3)));
      const checkpoint = async () => {
        await renewal;
        if (lost || signal?.aborted) return selectionFail("lost-lease");
        authorize(); await options.store.renew(lease, policy.leaseMs);
      };
      try {
        const previous = await options.store.inspect(lease.runId);
        if (!previous?.manifest) {
          for (let offset = 0; offset < 7; offset++) {
            const date = addReportingDays(window.runDate, offset);
            for (let attempt = 0; attempt < policy.attemptsPerInvocation; attempt++) {
              await checkpoint();
              const pending = await options.store.beginImport(lease, date, policy);
              if (!pending) break;
              let failed = false;
              try { await options.importer.import(pending.request); } catch { failed = true; }
              await checkpoint();
              await options.store.finishImport(lease, pending.id, failed);
            }
          }
          await checkpoint();
          // Reverify an explicit degraded action immediately before immutable commit.
          if (action && options.authority.verifyDegradedAction(action, window.runDate) !== true) return selectionFail("unauthorized");
          await options.store.commit(lease, policy, action);
        }
        await checkpoint();
        const progress = await options.store.reconcile(lease);
        await checkpoint();
        await options.cutoff.scheduleRun(lease.runId);
        await checkpoint();
        return { status: "committed" as const, runId: lease.runId, ...progress };
      } finally {
        clearInterval(timer); await renewal;
        await options.store.release(lease).catch(() => {});
      }
    },
  });
}
