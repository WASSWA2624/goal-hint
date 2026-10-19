import { paymentDraftStorageKey } from "@/domain/member-navigation";
import type { MobileNetwork } from "@/domain/phone";

export type PaymentDraft = { planId: string; payerPhone: string; network: MobileNetwork | ""; transactionId: string;
  amount: string; amountEdited: boolean; payCard: MobileNetwork | ""; accepted: boolean };
const key = (accountId: string) => `${paymentDraftStorageKey}:${accountId}`;
export function paymentDraftSnapshot(accountId: string): string | null {
  try { return sessionStorage.getItem(key(accountId)); } catch { return null; }
}
export function readPaymentDraft(accountId: string, raw = paymentDraftSnapshot(accountId)): PaymentDraft | null {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object") return null;
    const draft = value as Record<string, unknown>;
    if (!["planId", "payerPhone", "transactionId", "amount"].every((field) => typeof draft[field] === "string" && (draft[field] as string).length <= 64)
      || !["", "mtn", "airtel"].includes(String(draft.network)) || !["", "mtn", "airtel"].includes(String(draft.payCard))
      || typeof draft.accepted !== "boolean" || typeof draft.amountEdited !== "boolean") return null;
    return { planId: draft.planId as string, payerPhone: draft.payerPhone as string, transactionId: draft.transactionId as string,
      amount: draft.amount as string, network: draft.network as PaymentDraft["network"], payCard: draft.payCard as PaymentDraft["payCard"],
      accepted: draft.accepted, amountEdited: draft.amountEdited };
  } catch { return null; }
}
export function savePaymentDraft(accountId: string, draft: PaymentDraft) {
  try { sessionStorage.setItem(key(accountId), JSON.stringify(draft)); } catch { /* The form works with storage disabled. */ }
}
export function clearPaymentDraft(accountId: string) {
  try { sessionStorage.removeItem(key(accountId)); } catch { /* The form works with storage disabled. */ }
}
