import { paymentEvidence } from "./payment-sms.ts";
import { paymentOcrFields, paymentOcrReviewThreshold, type PaymentOcrQuality } from "./payment-ocr-result.ts";

export const unreadableScreenshotMessage = "We couldn’t read a payment transaction from this screenshot. It may be the wrong image, incomplete or unclear. Please try again with a clear, complete payment screenshot, or paste the transaction message.";
export type ScreenshotMetadata = { version: 1; sourceSha256: string; imageSha256: string; transactionId: string; provider: "mtn" | "airtel"; ocr?: PaymentOcrQuality };

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const confidence = (value: unknown) => value === null || typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function validQuality(value: unknown): value is PaymentOcrQuality {
  if (!record(value) || !exactKeys(value, ["confidence", "fieldConfidence", "uncertainFields", "attempts", "enhanced"])) return false;
  const fieldConfidence = value.fieldConfidence;
  return confidence(value.confidence) && record(fieldConfidence) && exactKeys(fieldConfidence, paymentOcrFields)
    && paymentOcrFields.every(field => confidence(fieldConfidence[field]))
    && Array.isArray(value.uncertainFields) && value.uncertainFields.length <= paymentOcrFields.length
    && value.uncertainFields.every(field => paymentOcrFields.some(allowed => allowed === field))
    && new Set(value.uncertainFields).size === value.uncertainFields.length
    && typeof value.attempts === "number" && Number.isInteger(value.attempts) && value.attempts >= 1 && value.attempts <= 3
    && typeof value.enhanced === "boolean";
}

/** Bounded recognition metadata is advisory; it never establishes receipt or ownership of money. */
export function parseScreenshotOcr(value: unknown): PaymentOcrQuality | null {
  if (typeof value !== "string" || value.length > 1024) return null;
  try { const parsed: unknown = JSON.parse(value); return validQuality(parsed) ? parsed : null; } catch { return null; }
}

export function screenshotOcrUncertainFields(text: string, ocr: PaymentOcrQuality) {
  const evidence = paymentEvidence(text, {}, { bare: false });
  return paymentOcrFields.filter(field => (field === "transactionId" ? !evidence.transactionId : evidence.amount === null)
    || ocr.uncertainFields.includes(field) || ocr.fieldConfidence[field] === null || ocr.fieldConfidence[field] < paymentOcrReviewThreshold);
}

export function screenshotOcrNeedsReview(text: string, ocr: PaymentOcrQuality) {
  return ocr.confidence === null || ocr.confidence < paymentOcrReviewThreshold || screenshotOcrUncertainFields(text, ocr).length > 0;
}

/** Readable evidence is a suggestion for review, never verification of incoming money. */
export function inspectPaymentScreenshot(text: string, ocr?: PaymentOcrQuality) {
  const evidence = paymentEvidence(text, {}, { bare: false });
  if (text.length > 12_000 || (ocr === undefined ? !evidence.transactionId || !evidence.amount : !validQuality(ocr)))
    return { ok: false as const, message: unreadableScreenshotMessage };
  return { ok: true as const, evidence };
}
