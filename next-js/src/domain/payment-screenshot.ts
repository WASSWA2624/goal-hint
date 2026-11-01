import { paymentEvidence, sameTransactionId } from "./payment-sms.ts";

export const unreadableScreenshotMessage = "We couldn’t read a payment transaction from this screenshot. It may be the wrong image, incomplete or unclear. Please try again with a clear, complete payment screenshot, or paste the transaction message.";
export type ScreenshotMetadata = { version: 1; sourceSha256: string; imageSha256: string; transactionId: string; provider: "mtn" | "airtel" };

/** Readable evidence is a suggestion for review, never verification of incoming money. */
export function inspectPaymentScreenshot(text: string, provider: "mtn" | "airtel", numbers: { mtn: string | null; airtel: string | null }, messageTransactionId: string | null = null) {
  const evidence = paymentEvidence(text, numbers, { bare: false });
  if (!evidence.transactionId || !evidence.amount) return { ok: false as const, message: unreadableScreenshotMessage };
  if (evidence.network && evidence.network !== provider) return { ok: false as const,
    message: `This screenshot appears to show ${evidence.network === "mtn" ? "MTN Mobile Money" : "Airtel Money"}, but you selected ${provider === "mtn" ? "MTN Mobile Money" : "Airtel Money"}. Choose the matching payment method or use the correct screenshot.` };
  if (messageTransactionId && !sameTransactionId(messageTransactionId, evidence.transactionId)) return { ok: false as const,
    message: "The screenshot and transaction message show different transaction IDs. Use evidence for the same payment, or clear the message before choosing this screenshot." };
  return { ok: true as const, evidence };
}
