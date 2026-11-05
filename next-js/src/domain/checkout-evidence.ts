import { paymentDestination, paymentEvidence } from "./payment-sms.ts";
import { normalizePhone, localUgandaPhone, type MobileNetwork } from "./phone.ts";
import { parseTransactionId, transactionKey } from "./payment.ts";
import { validMobilePhone } from "./phone-mobile.ts";

type Numbers = Readonly<Record<MobileNetwork, string | null>>;
const names = { mtn: "MTN Mobile Money", airtel: "Airtel Money" };

/** Validate clipboard content before it can replace a message or its extracted fields. */
export function inspectPaymentMessage(text: string) {
  const evidence = paymentEvidence(text, {}, { bare: false });
  if (text.length > 12_000 || !evidence.transactionId || evidence.amount === null) return { ok: false as const,
    message: "This is not a readable payment transaction message. Paste the complete MTN or Airtel message with its transaction ID and amount. Your current message has not changed." };
  return { ok: true as const, evidence };
}

export type PaymentEvidenceWarning = Readonly<{ id: string; message: string }>;
export type PaymentMessageSource = "message" | "image";
export function paymentMessageSource(extracted?: Readonly<Record<string, unknown>> | null): PaymentMessageSource | "invalid" {
  const source = extracted?.messageSource;
  return source === undefined || source === "message" ? "message" : source === "image" ? "image" : "invalid";
}
export type EvidenceComparison = Readonly<{ text: string; screenshotText: string; hasImage: boolean; messageSource?: unknown; transactionId?: string; amountUgx?: string }>;

/** An editable image transcript remains part of its image, including after corrections. */
export function paymentEvidenceSourceIssue(input: Pick<EvidenceComparison, "hasImage" | "screenshotText" | "messageSource">): string | null {
  const source = paymentMessageSource({ messageSource: input.messageSource });
  if (source === "invalid") return "Check the transaction message source. Paste the original message or read the payment image again.";
  if (source === "image" && !input.hasImage) return "This text came from a payment image. Reattach the image or paste the original transaction message before continuing.";
  if (source === "image" && !input.screenshotText.trim()) return "Read the payment image again before continuing. Its original extracted text is missing.";
  return null;
}

/** Advisory comparisons. OCR and labels cannot verify that a transfer arrived. */
export function checkoutEvidenceWarnings(input: EvidenceComparison, provider: MobileNetwork, numbers: Numbers): PaymentEvidenceWarning[] {
  const issue = paymentEvidenceSourceIssue(input);
  if (issue) return [{ id: "evidence.source", message: issue }];
  const imageText = input.messageSource === "image";
  const sources = [
    ...(input.text.trim() && (!imageText || input.text.trim() !== input.screenshotText.trim())
      ? [{ id: imageText ? "transcript" : "message", label: imageText ? "edited image text" : "transaction message", origin: imageText ? "image" : "message", text: input.text }] : []),
    ...(input.hasImage ? [{ id: "screenshot", label: "screenshot", origin: "image", text: input.screenshotText }] : []),
  ].map(source => {
    const destination = paymentDestination(source.text, numbers);
    const network = destination.network ?? (["mtn", "airtel"] as const).find(key => destination.recipient && normalizePhone(numbers[key]) === destination.recipient) ?? null;
    return { ...source, destination, network, evidence: paymentEvidence(source.text, numbers, { bare: false }) };
  });
  const warnings: PaymentEvidenceWarning[] = [], money = (amount: number) => `UGX ${amount.toLocaleString("en-UG")}`;
  for (const source of sources) {
    const mismatch = paymentDestinationMismatch(source.text, provider, numbers, source.label);
    if (mismatch) warnings.push({ id: `${source.id}.method`, message: mismatch });
    const supported = sources.some(other => other.origin !== source.origin && other.network === provider && source.evidence.transactionId && other.evidence.transactionId
      && transactionKey(source.evidence.transactionId) === transactionKey(other.evidence.transactionId)
      && source.evidence.amount !== null && source.evidence.amount === other.evidence.amount);
    if (source.id !== "transcript" && !source.network && !mismatch && !supported) warnings.push({ id: `${source.id}.unknown-provider`, message: `We couldn’t confirm the ${source.label} is from ${names[provider]}.` });
    if (input.transactionId && source.evidence.transactionId && transactionKey(input.transactionId) !== transactionKey(source.evidence.transactionId))
      warnings.push({ id: `${source.id}.reported-id`, message: `The ${source.label} shows transaction ID ${source.evidence.transactionId}, while the entered ID is ${input.transactionId}.` });
    if (input.amountUgx && Number(input.amountUgx) > 0 && source.evidence.amount !== null && Number(input.amountUgx) !== source.evidence.amount)
      warnings.push({ id: `${source.id}.reported-amount`, message: `The ${source.label} shows ${money(source.evidence.amount)}, while you entered ${money(Number(input.amountUgx))} as the amount paid.` });
  }
  const [message, screenshot] = sources;
  if (message && screenshot) {
    const label = imageText ? "edited image text" : "message";
    if (message.evidence.transactionId && screenshot.evidence.transactionId && transactionKey(message.evidence.transactionId) !== transactionKey(screenshot.evidence.transactionId))
      warnings.push({ id: "sources.id", message: `The ${label} shows transaction ID ${message.evidence.transactionId}; the screenshot shows ${screenshot.evidence.transactionId}. ${imageText ? "Check your edits against the image." : "They may refer to different payments."}` });
    if (message.evidence.amount !== null && screenshot.evidence.amount !== null && message.evidence.amount !== screenshot.evidence.amount)
      warnings.push({ id: "sources.amount", message: `The ${label} shows ${money(message.evidence.amount)}; the screenshot shows ${money(screenshot.evidence.amount)}.` });
    if (message.network && screenshot.network && message.network !== screenshot.network)
      warnings.push({ id: "sources.provider", message: `The ${label} appears to be from ${names[message.network]}; the screenshot appears to be from ${names[screenshot.network]}.` });
    if (message.destination.recipient && screenshot.destination.recipient && message.destination.recipient !== screenshot.destination.recipient)
      warnings.push({ id: "sources.recipient", message: `The ${label} shows receiving number ${localUgandaPhone(message.destination.recipient)}; the screenshot shows ${localUgandaPhone(screenshot.destination.recipient)}.` });
  }
  return warnings;
}

const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
export type ReceiptEvidenceValidation = { warnings: PaymentEvidenceWarning[]; fingerprint: string | null; reviewed: boolean; selectedProvider: string | null };

/** Only server-created validation records and server-only correction markers qualify for review. */
export function receiptEvidenceValidation(original: unknown, corrections: unknown): ReceiptEvidenceValidation {
  const history = Array.isArray(corrections) ? corrections : corrections ? [corrections] : [];
  const latest = history.map(record).filter(entry => entry?.evidence).at(-1)?.evidence ?? original;
  const fields = record(record(latest)?.extracted);
  let warnings: PaymentEvidenceWarning[] = [];
  if (fields?.validationVersion === 1 && typeof fields.validationWarnings === "string") {
    try {
      const parsed: unknown = JSON.parse(fields.validationWarnings);
      if (Array.isArray(parsed)) warnings = parsed.flatMap(value => {
        const item = record(value);
        return typeof item?.id === "string" && typeof item.message === "string" ? [{ id: item.id, message: item.message }] : [];
      });
    } catch { /* Historical evidence may predate validation metadata. */ }
  }
  const fingerprint = typeof fields?.validationFingerprint === "string" ? fields.validationFingerprint : null;
  return { warnings, fingerprint, selectedProvider: typeof fields?.selectedProvider === "string" ? fields.selectedProvider : null,
    reviewed: warnings.length === 0 || !!fingerprint && history.some(value => {
      const entry = record(value);
      return entry?.kind === "warning-review" && entry.validationFingerprint === fingerprint;
    }) };
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
  transactionId: string; amountUgx: string; payerPhone: string; messageSource?: unknown }): string | null {
  const sourceIssue = paymentEvidenceSourceIssue(input);
  if (sourceIssue) return sourceIssue;
  if (input.hasImage && !input.screenshotReady) return "Recheck or remove the saved screenshot before continuing.";
  if (!input.hasImage && !input.text.trim()) return "Add a payment screenshot or paste the transaction message before continuing. The filled-in transaction details are kept, but at least one evidence source is required.";
  if (!parseTransactionId(input.transactionId) || !Number.isSafeInteger(Number(input.amountUgx)) || Number(input.amountUgx) <= 0 || Number(input.amountUgx) > 2_000_000_000 || !validMobilePhone(input.payerPhone))
    return "Enter a valid transaction ID, amount paid and the number used to make payment.";
  return null;
}
