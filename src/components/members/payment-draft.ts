import { paymentDraftStorageKey } from "@/domain/member-navigation";
import type { MobileNetwork } from "@/domain/phone";

/** The amount is the plan's price and is never kept; the payer and transaction ID are the optional "More details". */
export type PaymentDraft = { planId: string; payerPhone: string; network: MobileNetwork | ""; transactionId: string; accepted: boolean };
const key = (accountId: string) => `${paymentDraftStorageKey}:${accountId}`;
export function paymentDraftSnapshot(accountId: string): string | null {
  try { return sessionStorage.getItem(key(accountId)); } catch { return null; }
}
export function readPaymentDraft(accountId: string, raw = paymentDraftSnapshot(accountId)): PaymentDraft | null {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object") return null;
    const draft = value as Record<string, unknown>;
    if (!["planId", "payerPhone", "transactionId"].every((field) => typeof draft[field] === "string" && (draft[field] as string).length <= 64)
      || !["", "mtn", "airtel"].includes(String(draft.network)) || typeof draft.accepted !== "boolean") return null;
    return { planId: draft.planId as string, payerPhone: draft.payerPhone as string, transactionId: draft.transactionId as string,
      network: draft.network as PaymentDraft["network"], accepted: draft.accepted };
  } catch { return null; }
}
export function savePaymentDraft(accountId: string, draft: PaymentDraft) {
  try { sessionStorage.setItem(key(accountId), JSON.stringify(draft)); } catch { /* The form works with storage disabled. */ }
}
export function clearPaymentDraft(accountId: string) {
  try { sessionStorage.removeItem(key(accountId)); } catch { /* The form works with storage disabled. */ }
}
