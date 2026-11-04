"use client";

import { useEffect, useState } from "react";
import type { ReceiptEvidenceValidation } from "@/domain/checkout-evidence";
import type { OwnerPayment } from "@/domain/owner-members";
import { CheckoutReviewView } from "./checkout-review-view";

type Receipt = { id: string; provider: string; transactionId: string; verifiedAt: string | null; verifiedBy: string | null;
  amountUgx: number | null; disputed: boolean; senderPhone: string | null; recipient: string | null;
  allocatedSubmissionId: string | null; intendedSubmissionId: string | null; receivedAt: string | null;
  claims: { submissionId: string; submission: { reference: string; accountId: string } }[] };
export type CheckoutReviewDetail = { revision: number; status: string; walletUgx: number; referralDays: number; receivingNumber: string | null;
  reservationActive: boolean; reservationUntil: string | null; amountToSend: number; remainingUgx: number; excessUgx: number; verifiedUgx: number;
  claims: { id: string; receipt: Receipt; amountUgx: number; payerPhone: string | null; paidAt: string; original: unknown; corrections: unknown; imageSha256: string | null; withdrawn: boolean; purgedAt: string | null;
    legacyImage: boolean; imageIsLegacy: boolean; validation: ReceiptEvidenceValidation;
    evidence: { id: string; createdAt: string }[] }[];
};

export function CheckoutReview({ payment, hasNext, busy, onBusyChange, onResolved }: {
  payment: OwnerPayment; hasNext: boolean; busy: boolean; onBusyChange: (busy: boolean) => void; onResolved: (approved: boolean) => void;
}) {
  const [record, setRecord] = useState<{ url: string; detail: CheckoutReviewDetail | null }>();
  const [feedback, setFeedback] = useState({ url: "", error: "", notice: "" });
  const [shownPayment, setShownPayment] = useState(payment);
  const url = `/api/admin/payments/${payment.id}`;
  const detailUrl = `${url}?view=compact`;
  const current = record?.url === detailUrl;
  const detail = current ? record.detail : null;
  const { error, notice } = feedback.url === detailUrl ? feedback : { error: "", notice: "" };
  if (current && shownPayment !== payment) setShownPayment(payment);

  async function refresh() {
    const response = await fetch(detailUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("Review is unavailable.");
    setRecord({ url: detailUrl, detail: await response.json() });
  }
  useEffect(() => {
    const controller = new AbortController();
    void fetch(detailUrl, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Review unavailable.");
      const result = await response.json();
      if (!controller.signal.aborted) setRecord({ url: detailUrl, detail: result });
    }).catch(e => {
      if (!controller.signal.aborted) setFeedback({ url: detailUrl, error: e.message, notice: "" });
    });
    return () => controller.abort();
  }, [detailUrl]);
  async function act(body: Record<string, unknown>, advance = false) {
    if (busy || !detail) return;
    onBusyChange(true); setFeedback({ url: detailUrl, error: "", notice: "" });
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, revision: detail.revision }) });
      const result = await response.json();
      if (response.ok && advance) { onResolved(body.action === "approve-checkout"); return; }
      await refresh();
      if (result.code === "remaining") { setFeedback({ url: detailUrl, error: "", notice: result.message }); return; }
      if (!response.ok) throw new Error(result.message ?? "Action could not be completed.");
      setFeedback({ url: detailUrl, error: "", notice: "Saved." });
    } catch (e) { setFeedback({ url: detailUrl, error: (e as Error).message, notice: "" }); }
    finally { onBusyChange(false); }
  }
  const changing = !current && !error;
  return <CheckoutReviewView payment={changing && record ? shownPayment : payment}
    detail={changing ? record?.detail ?? null : detail} busy={busy || !current} loading={changing}
    hasNext={hasNext} error={error} notice={notice} act={act} />;
}
