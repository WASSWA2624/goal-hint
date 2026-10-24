import "server-only";
import { walletRules } from "../../domain/wallet.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { createAccessCodes } from "./access-codes.ts";

const BATCH = 100;
export type AutoRenewResult = Readonly<{ checked: number; renewed: number; failed: number }>;

/**
 * Renews accounts whose periods end within the lead, from credit. Each renewal re-checks under the account lock and is keyed by
 * the chain end it renews, so overlapping sweeps (web, CLI, workers) and a member's own request never charge twice; no claim
 * row is needed. Only recent lapses are renewed here (walletRules.jobMaxLapseMs): after a long outage, members renew on their
 * next visit, when their new period starts at once.
 */
export function createAutoRenew(database: DatabaseRuntime, now = Date.now) {
  const codes = createAccessCodes({ database, now });
  async function run(): Promise<AutoRenewResult> {
    const at = new Date(now()), result = { checked: 0, renewed: 0, failed: 0 };
    // Paged by id, so accounts renewDue skips (a revoked renewal's end, say) never starve the rest.
    for (let after = "", page = 0; page < 100; page++) {
      const due = await database.query(tx => tx.$queryRaw<{ id: string }[]>`
        SELECT a.id FROM MemberAccount a JOIN SubscriptionPlan p ON p.id = a.autoRenewPlanId
        WHERE a.id > ${after} AND a.autoRenew = TRUE AND a.erasedAt IS NULL AND a.blockedAt IS NULL AND a.phone IS NOT NULL AND p.active = TRUE
          AND a.creditUgx >= p.priceUgx
          AND (SELECT MAX(c.endsAt) FROM AccessCode c WHERE c.accountId = a.id AND c.revokedAt IS NULL)
            BETWEEN ${new Date(+at - walletRules.jobMaxLapseMs)} AND ${new Date(+at + walletRules.renewLeadMs)}
        ORDER BY a.id LIMIT ${BATCH}`);
      for (const { id } of due) {
        result.checked++;
        try { if (await codes.renewDue(id, { maxLapseMs: walletRules.jobMaxLapseMs }) === "renewed") result.renewed++; }
        catch { result.failed++; }
      }
      if (due.length < BATCH) break;
      after = due.at(-1)!.id;
    }
    return result;
  }
  let pending: Promise<AutoRenewResult> | null = null, checkedAt = -Infinity;
  return { run, maybeSweep() {
    if (pending || now() - checkedAt < walletRules.jobSlotMs) return;
    checkedAt = now();
    pending = run().catch(() => ({ checked: 0, renewed: 0, failed: 0 })).finally(() => { pending = null; });
  } };
}
const services = new WeakMap<DatabaseRuntime, ReturnType<typeof createAutoRenew>>();
export function autoRenewFor(database: DatabaseRuntime) { let service = services.get(database); if (!service) { service = createAutoRenew(database); services.set(database, service); } return service; }
