import { normalizePhone, type MobileNetwork } from "./phone.ts";

export type PaymentSms = Readonly<{ amount?: number; transactionId?: string; network?: MobileNetwork; counterparty?: string; foreignRecipient?: string }>;
/** Label-based suggestions only. Raw messages are never persisted or submitted. */
export function parsePaymentSms(text: string, ownerNumbers: Readonly<Partial<Record<MobileNetwork, string | null>>>): PaymentSms {
  if (text.length > 12_000) return {};
  const result: { -readonly [K in keyof PaymentSms]: PaymentSms[K] } = {};
  const amount = /\b(?:sent|send|paid|received|transferred)\s+(?:(?:an?\s+)?amount\s+(?:of\s+)?)?(?:UGX|USh|Shs)\.?\s*([\d,]+)(?:\.\d{1,2})?\b/iu.exec(text);
  if (amount) { const value = Number(amount[1]!.replaceAll(",", "")); if (Number.isSafeInteger(value) && value >= 100 && value <= 10_000_000) result.amount = value; }
  const id = /\b(?:transaction\s*(?:id|ref(?:erence)?)|trans\s*id|tid)\s*[:#=.-]?\s*([A-Z0-9][A-Z0-9.-]{3,39})(?![A-Z0-9.-])/iu.exec(text)?.[1]?.replace(/[.,]+$/u, "").toUpperCase();
  if (id && id.length >= 4) result.transactionId = id;
  if (/\bAirtel\b/iu.test(text)) result.network = "airtel";
  else if (/\bMTN\b|\bMoMo\b/iu.test(text)) result.network = "mtn";
  const recipient = /\b(?:to|recipient|receiver)\s*[:=]?\s*(?:[^\d\n]{0,60}?)((?:\+?256[ -]?)?0?7\d{2}(?:[ -]?\d{3}){2})(?!\d)/iu.exec(text)?.[1];
  const sender = /\b(?:from|sender)\s*[:=]?\s*(?:[^\d\n]{0,60}?)((?:\+?256[ -]?)?0?7\d{2}(?:[ -]?\d{3}){2})(?!\d)/iu.exec(text)?.[1];
  const counterparty = normalizePhone(recipient ?? sender);
  if (counterparty) {
    result.counterparty = counterparty;
    const network = (["mtn", "airtel"] as const).find((key) => ownerNumbers[key] === counterparty);
    if (network) result.network = network;
    else if (recipient) result.foreignRecipient = counterparty;
  }
  return result;
}
