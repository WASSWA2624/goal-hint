import { paymentDestination, paymentEvidence, sameTransactionId } from "./payment-sms.ts";
import { normalizePhone, localUgandaPhone, type MobileNetwork } from "./phone.ts";
import { parseTransactionId } from "./payment.ts";
import { validMobilePhone } from "./phone-mobile.ts";

type Numbers = Readonly<Record<MobileNetwork, string | null>>;
const names = { mtn: "MTN Mobile Money", airtel: "Airtel Money" };

/** Validate clipboard content before it can replace a message or its extracted fields. */
export function inspectPaymentMessage(text: string, provider: MobileNetwork, numbers: Numbers, screenshotTransactionId: string | null = null) {
  const evidence = paymentEvidence(text, numbers, { bare: false });
  if (text.length > 12_000 || !evidence.transactionId || evidence.amount === null) return { ok: false as const,
    message: "This is not a readable payment transaction message. Paste the complete MTN or Airtel message with its transaction ID and amount. Your current message has not changed." };
  const mismatch = paymentDestinationMismatch(text, provider, numbers, "transaction message");
  if (mismatch) return { ok: false as const, message: mismatch };
  if (screenshotTransactionId && !sameTransactionId(screenshotTransactionId, evidence.transactionId)) return { ok: false as const,
    message: "The transaction message and screenshot show different transaction IDs. Paste the message for this payment, or remove or replace the screenshot. Your current message has not changed." };
  return { ok: true as const, evidence };
}

export function paymentDestinationMismatch(text: string, provider: MobileNetwork, numbers: Numbers, source = "evidence"): string | null {
  const found = paymentDestination(text, numbers), expected = normalizePhone(numbers[provider]);
  if (found.recipient && expected && found.recipient !== expected) {
    const other = (["mtn", "airtel"] as const).find(network => normalizePhone(numbers[network]) === found.recipient);
    return `The ${source} shows ${localUgandaPhone(found.recipient)}${other ? ` (${names[other]})` : ""} as the receiving number, but you selected ${names[provider]}. Check the payment method and use evidence showing the receiving number ${localUgandaPhone(expected)}.`;
  }
  if (found.network && found.network !== provider) return `The ${source} shows ${names[found.network]}, but you selected ${names[provider]}. Check the payment method or provide the matching evidence.`;
  return null;
}

/** Run for both entry and final submission; edits and restored drafts must not bypass evidence checks. */
export function checkoutDetailsIssue(input: { text: string; screenshotText: string; hasImage: boolean; screenshotReady: boolean;
  transactionId: string; amountUgx: string; payerPhone: string }, provider: MobileNetwork, numbers: Numbers): string | null {
  if (input.hasImage && !input.screenshotReady) return "Recheck or remove the saved screenshot before continuing.";
  if (!input.hasImage && !input.text.trim()) return "Add a payment screenshot or paste the transaction message before continuing. The filled-in transaction details are kept, but at least one evidence source is required.";
  for (const [source, text] of [["transaction message", input.text], ["screenshot", input.screenshotText]] as const) {
    const mismatch = paymentDestinationMismatch(text, provider, numbers, source);
    if (mismatch) return mismatch;
  }
  const messageId = paymentEvidence(input.text).transactionId, screenshotId = paymentEvidence(input.screenshotText, {}, { bare: false }).transactionId;
  if (messageId && screenshotId && !sameTransactionId(messageId, screenshotId)) return "The message and screenshot show different transaction IDs. Use evidence for the same payment.";
  if (!parseTransactionId(input.transactionId) || !Number.isSafeInteger(Number(input.amountUgx)) || Number(input.amountUgx) <= 0 || Number(input.amountUgx) > 2_000_000_000 || !validMobilePhone(input.payerPhone))
    return "Enter a valid transaction ID, reported amount and the number used to make payment.";
  return null;
}
