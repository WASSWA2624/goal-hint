import { paymentEvidence } from "./payment-sms.ts";
import { transactionKey } from "./payment.ts";

export const paymentOcrReviewThreshold = 80;
export const paymentOcrFields = ["transactionId", "amountUgx"] as const;
export type PaymentOcrField = typeof paymentOcrFields[number];
export type PaymentOcrQuality = {
  confidence: number | null;
  fieldConfidence: Record<PaymentOcrField, number | null>;
  uncertainFields: PaymentOcrField[];
  attempts: number;
  enhanced: boolean;
};
export type PaymentOcrResult = PaymentOcrQuality & { text: string };
export type PaymentOcrWord = Readonly<{ text: string; confidence: number }>;
export type PaymentOcrPage = Readonly<{ text: string; confidence: number; words: readonly PaymentOcrWord[] }>;

/** Engine scores describe recognition, not a calibrated probability or payment verification. */
function score(value: number): number | null {
  return Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value) : null;
}

function wordConfidence(text: string, words: readonly PaymentOcrWord[], field: PaymentOcrField, expected: string): number | null {
  const matches: number[] = [];
  let cursor = 0;
  const aligned = words.map(word => {
    const start = text.indexOf(word.text, cursor);
    if (start < 0) return null;
    cursor = start + word.text.length;
    return { ...word, start, end: cursor };
  });
  for (let start = 0; start < aligned.length; start++) {
    const first = aligned[start];
    if (!first) continue;
    let confidence = 100;
    // A grouped amount can span several words. Never join lines or infer characters.
    for (let end = start; end < Math.min(aligned.length, start + 4); end++) {
      const word = aligned[end];
      if (!word) break;
      const confidenceScore = score(word.confidence);
      if (confidenceScore === null) break;
      confidence = Math.min(confidence, confidenceScore);
      const valueText = text.slice(first.start, word.end);
      if (/[\r\n]/u.test(valueText)) break;
      const trimmed = valueText.trim().replace(/[.:;,]+$/u, "");
      if (field === "transactionId") {
        if (!/^[A-Z0-9.\- ]+$/iu.test(trimmed)) break;
        if (transactionKey(trimmed) === expected) matches.push(confidence);
      } else {
        if (!/^\d[\d,.\u00a0 ]*(?:\/=)?$/u.test(trimmed)) break;
        const value = trimmed.replace(/\/=\s*$/u, "").replace(/\.\d{1,2}$/u, "").replace(/[,.\u00a0 ]/gu, "");
        if (value === expected) matches.push(confidence);
      }
    }
  }
  // Repeated values may have different confidence. The weakest exact reading is conservative.
  return matches.length ? Math.min(...matches) : null;
}

export function paymentOcrResult(page: PaymentOcrPage, enhanced = false): PaymentOcrResult {
  const text = page.text.slice(0, 12_000), evidence = paymentEvidence(text, {}, { bare: false });
  const fieldConfidence = {
    transactionId: evidence.transactionId ? wordConfidence(text, page.words, "transactionId", transactionKey(evidence.transactionId)) : null,
    amountUgx: evidence.amount !== null ? wordConfidence(text, page.words, "amountUgx", String(evidence.amount)) : null,
  };
  return { text, confidence: score(page.confidence), fieldConfidence,
    uncertainFields: paymentOcrFields.filter(field => (fieldConfidence[field] ?? -1) < paymentOcrReviewThreshold), attempts: 1, enhanced };
}

export function needsPaymentOcrEnhancement(result: PaymentOcrResult): boolean {
  return !result.text.trim() || (result.confidence ?? -1) < paymentOcrReviewThreshold || result.uncertainFields.length > 0;
}

function readingScore(result: PaymentOcrResult): number {
  const evidence = paymentEvidence(result.text, {}, { bare: false });
  const fields = Number(!!evidence.transactionId) + Number(evidence.amount !== null);
  return fields * 25 + paymentOcrFields.reduce((sum, field) => sum + (result.fieldConfidence[field] ?? 0), 0)
    + (result.confidence ?? 0) * 0.2;
}

/** Select one complete OCR output; competing readings never manufacture a combined identifier. */
export function selectPaymentOcrResult(readings: readonly PaymentOcrResult[]): PaymentOcrResult {
  if (!readings.length || readings.length > 3) throw new RangeError("One to three image readings are required.");
  const selected = readings.reduce((best, current) => readingScore(current) > readingScore(best) ? current : best);
  const uncertain = new Set(selected.uncertainFields);
  for (const field of paymentOcrFields) {
    const values = new Set(readings.filter(reading => (reading.fieldConfidence[field] ?? -1) >= paymentOcrReviewThreshold).flatMap(reading => {
      const evidence = paymentEvidence(reading.text, {}, { bare: false });
      const value = field === "transactionId" ? evidence.transactionId && transactionKey(evidence.transactionId) : evidence.amount;
      return value === null ? [] : [String(value)];
    }));
    if (values.size > 1) uncertain.add(field);
  }
  return { ...selected, uncertainFields: paymentOcrFields.filter(field => uncertain.has(field)), attempts: readings.length };
}
