export const paymentRejectionReasons = ["unreadable", "amount-mismatch", "not-received", "duplicate", "wrong-number", "other"] as const;

export type PaymentRejectionReason = typeof paymentRejectionReasons[number];
export const paymentRejectionMaxLength = 200;

export const paymentRejectionLabels: Record<PaymentRejectionReason, string> = {
  unreadable: "Unreadable receipt",
  "amount-mismatch": "Wrong amount",
  "not-received": "Payment not received",
  duplicate: "Duplicate payment",
  "wrong-number": "Wrong recipient",
  other: "Other",
};

export function paymentRejectionText(presets: readonly PaymentRejectionReason[], reason = "") {
  const note = reason.trim();
  if ((note || !presets.length || presets.includes("other")) && note.length < 3) return null;
  const text = [...new Set(presets)].filter(preset => preset !== "other").map(preset => paymentRejectionLabels[preset]);
  if (note) text.push(note);
  const combined = text.join(" · ");
  return combined.length <= paymentRejectionMaxLength ? combined : null;
}
