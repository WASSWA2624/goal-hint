import type { CheckoutSelection, CheckoutView } from "@/domain/checkout";
import type { SubscriptionPlanView } from "@/domain/subscription-plans";

export type CheckoutDraft = { requestKey: string; step: 0 | 1 | 2; purpose: CheckoutSelection["purpose"]; planId: string;
  method: CheckoutSelection["method"] | ""; walletUgx: string; referralDays: string; topUpUgx: string;
  transactionId: string; amountUgx: string; payerPhone: string; paidAt: string; text: string;
  extracted: Record<string, string | number | null>; originalText: string; accepted: boolean; attachingId: string | null };

/** Apply current spendable balances to edits, restored drafts and balance refreshes. */
export function capCheckoutFunding(draft: CheckoutDraft, balances: Pick<CheckoutView, "availableWalletUgx" | "availableReferralDays">,
  plans: readonly Pick<SubscriptionPlanView, "id" | "priceUgx">[]): CheckoutDraft {
  const price = draft.purpose === "plan" ? plans.find(plan => plan.id === draft.planId)?.priceUgx ?? 0 : 0;
  const cap = (value: string, maximum: number) => value.trim() === "" ? "" : String(Math.min(maximum, Math.max(0, Math.floor(Number(value) || 0))));
  const walletUgx = cap(draft.walletUgx, Math.min(balances.availableWalletUgx, price));
  const referralDays = cap(draft.referralDays, Math.min(365, balances.availableReferralDays));
  const method = price > 0 && Number(walletUgx) === price && (draft.method === "mtn" || draft.method === "airtel") ? "wallet" : draft.method;
  return walletUgx === draft.walletUgx && referralDays === draft.referralDays && method === draft.method
    ? draft : { ...draft, walletUgx, referralDays, method, accepted: false };
}
type Stored = { draft: CheckoutDraft; image: Blob | null };
const memory = new Map<string, Stored>();
let queued = Promise.resolve();
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("goal-hint-checkout", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadCheckoutDraft(key: string): Promise<Stored | null> {
  try {
    const db = await database();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("drafts", "readonly"), request = tx.objectStore("drafts").get(key);
      request.onsuccess = () => resolve(request.result ?? null); request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  } catch { return memory.get(key) ?? null; }
}
export function saveCheckoutDraft(key: string, value: Stored): Promise<boolean> {
  memory.set(key, value);
  let saved = true;
  const operation = queued.then(async () => {
    try {
      const db = await database();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("drafts", "readwrite"); tx.objectStore("drafts").put(value, key);
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
      });
    } catch { saved = false; }
  });
  queued = operation;
  return operation.then(() => saved);
}
