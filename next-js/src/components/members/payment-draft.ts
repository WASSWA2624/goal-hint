import type { MobileNetwork } from "@/domain/phone";
import { clearDraftProgress, decodeDraftProgress, readDraftProgress, writeDraftProgress } from "./draft-storage.ts";

/**
 * The legacy form keeps transaction details in component memory. Only package and method choices survive a reload.
 */
export type PaymentDraft = { purpose: "plan" | "topup"; planId: string; topUpAmount: string; payerPhone: string; network: MobileNetwork | ""; transactionId: string; accepted: boolean };
export function paymentDraftSnapshot(scope: string): string | null {
  return readDraftProgress(scope, "legacy");
}
type PaymentProgress = Pick<PaymentDraft, "purpose" | "planId" | "topUpAmount" | "network">;
export function readPaymentDraft(raw: string | null): PaymentProgress | null {
  const draft = decodeDraftProgress(raw);
  if (!draft || typeof draft.planId !== "string" || draft.planId.length > 64 ||
    draft.network !== "" && draft.network !== "mtn" && draft.network !== "airtel") return null;
  const topUpAmount = typeof draft.topUpAmount === "string" && /^\d{0,6}$/u.test(draft.topUpAmount) ? draft.topUpAmount : "";
  return { purpose: draft.purpose === "topup" ? "topup" : "plan", planId: draft.planId, topUpAmount, network: draft.network };
}
export function savePaymentDraft(scope: string, { purpose, planId, topUpAmount, network }: PaymentDraft) {
  writeDraftProgress(scope, "legacy", { purpose, planId, topUpAmount, network });
}
export function clearPaymentDraft(scope: string) {
  clearDraftProgress(scope, "legacy");
}
