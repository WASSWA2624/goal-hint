import { paymentEvidence } from "./payment-sms.ts";

export const unreadableScreenshotMessage = "We couldn’t read a payment transaction from this screenshot. It may be the wrong image, incomplete or unclear. Please try again with a clear, complete payment screenshot, or paste the transaction message.";
export type ScreenshotMetadata = { version: 1; sourceSha256: string; imageSha256: string; transactionId: string; provider: "mtn" | "airtel" };

/** Readable evidence is a suggestion for review, never verification of incoming money. */
export function inspectPaymentScreenshot(text: string) {
  const evidence = paymentEvidence(text, {}, { bare: false });
  if (!evidence.transactionId || !evidence.amount) return { ok: false as const, message: unreadableScreenshotMessage };
  return { ok: true as const, evidence };
}
