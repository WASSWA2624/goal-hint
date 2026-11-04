export const paymentReversalReasons = ["network-reversal", "wrong-account"] as const;
export type PaymentReversalReason = typeof paymentReversalReasons[number];
export const paymentReversalLabels: Record<PaymentReversalReason, string> = {
  "network-reversal": "Network reversal",
  "wrong-account": "Wrong account",
};
export const paymentReversalNoteLimit = 200;

export type PaymentReversalDetails = Readonly<{ reasons: readonly PaymentReversalReason[]; note: string }>;

function isReason(value: unknown): value is PaymentReversalReason {
  return paymentReversalReasons.some(reason => reason === value);
}

export function readPaymentReversal(body: Record<string, unknown>): { reason: PaymentReversalReason; details?: PaymentReversalDetails } | null {
  if (body.reasons === undefined) return isReason(body.reason) ? { reason: body.reason } : null;
  const reasons: unknown = body.reasons, note = body.note === undefined ? "" : body.note;
  if (body.endAccess !== true || !Array.isArray(reasons) || !reasons.length || reasons.length > paymentReversalReasons.length
    || !reasons.every(isReason) || new Set(reasons).size !== reasons.length || typeof note !== "string" || note.length > paymentReversalNoteLimit) return null;
  // Wrong-account reversal also enables recovery for the real payer.
  return { reason: reasons.includes("wrong-account") ? "wrong-account" : "network-reversal", details: { reasons, note: note.trim() } };
}
