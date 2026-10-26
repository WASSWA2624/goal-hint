import { normalizePhone, type MobileNetwork } from "./phone.ts";
import { parseTransactionId, transactionKey } from "./payment.ts";

export type PaymentSms = Readonly<{ amount?: number; transactionId?: string; network?: MobileNetwork; counterparty?: string; foreignRecipient?: string }>;
// A transaction ID after its label; shared by the one-message parser and the newest-message search below. A bare "ID:" counts
// only with no word just before it on its line, so "Agent ID:" or "Merchant ID:" codes are not taken for the payment's ID.
const transactionLabel = String.raw`\b(?:transaction\s*(?:id|ref(?:erence)?)|trans\s*id|txn\s*id|tid|(?<![A-Z][ \t]*)id(?=\s*[:#]))\s*[:#=.-]?\s*([A-Z0-9][A-Z0-9.-]{3,39})(?![A-Z0-9.-])`;
// Real MTN and Airtel IDs contain a digit, so a word after a label ("Transaction ID: Confirmed") is not one.
const labelledId = (raw: string | undefined) => { const id = parseTransactionId(raw?.replace(/[.,]+$/u, "").toUpperCase()); return id && /\d/u.test(id) ? id : null; };
// The amount a payment message names after its verb ("You have sent UGX 5,000"); fee and balance amounts have no such verb.
const amountPhrase = String.raw`\b(?:sent|send|paid|received|transferred)\s+(?:(?:an?\s+)?amount\s+(?:of\s+)?)?(?:UGX|USh|Shs)\.?\s*([\d,]+)(?:\.\d{1,2})?\b`;
const validAmount = (raw: string) => { const value = Number(raw.replaceAll(",", "")); return Number.isSafeInteger(value) && value >= 100 && value <= 10_000_000 ? value : undefined; };

/** Label-based suggestions only. Raw messages are never persisted or submitted. */
export function parsePaymentSms(text: string, ownerNumbers: Readonly<Partial<Record<MobileNetwork, string | null>>>): PaymentSms {
  if (text.length > 12_000) return {};
  const result: { -readonly [K in keyof PaymentSms]: PaymentSms[K] } = {};
  const amount = new RegExp(amountPhrase, "iu").exec(text), value = amount ? validAmount(amount[1]!) : undefined;
  if (value !== undefined) result.amount = value;
  const transactionId = labelledId(new RegExp(transactionLabel, "iu").exec(text)?.[1]);
  if (transactionId) result.transactionId = transactionId;
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

// Real MTN and Airtel IDs always contain a digit, so a word or two never passes as a bare ID; nor does a Ugandan mobile
// number, such as the payee number the page's Copy button just put on the clipboard.
const onlyIdCharacters = /^(?=.*\d)[A-Z0-9.\-\s]{4,60}$/iu, ugandanMobile = /^(?:\+?256|0)?7\d{8}$/u;
export type PaymentEvidence = Readonly<{ transactionId: string | null; amount: number | null; network: MobileNetwork | null }>;

// A shilling amount written either way round ("UGX 5,000", "5,000 UGX", "5000/=", "Amount: 5,000"), with thousands grouped
// by commas, dots or spaces as OCR may read them. UGX has no cents, so ".00" is dropped.
const numberPattern = String.raw`\d{1,3}(?:[,.\u00a0 ]\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?`, currency = String.raw`(?:UGX|UShs?|Shs?)`;
const shillings = String.raw`${currency}\.?\s*(${numberPattern})|(${numberPattern})\s*(?:${currency}\b|/=)|\bamount\s*(?:of\s*)?[:=]?\s*(${numberPattern})`;
// Fee, tax and balance figures never are the amount paid.
const notPaid = /\b(?:f[e3][e3]s?|charges?|charged|tax|levy|commission|b[a4@][l1i](?:[a4@]nce)?|avail(?:able)?)\b[^\d]{0,20}$/iu;
function shillingValue(raw: string): number | undefined {
  const grouped = /^\d{1,3}(?:[,.\u00a0 ]\d{3})+/u.exec(raw)?.[0];
  const value = Number(grouped ? grouped.replace(/\D/gu, "") : raw.replace(/\.\d{1,2}$/u, ""));
  return Number.isSafeInteger(value) && value >= 100 && value <= 10_000_000 ? value : undefined;
}

/**
 * What a member's pasted message or screenshot text says about their payment: the newest message's transaction ID and the
 * amount it paid, and the network. A screenshot of a message thread shows older payments above the newest. Labels with no paid
 * amount between them belong to one SMS ("Financial Transaction Id … External Transaction Id"), the first naming it. In a
 * message that names the amount before its ID ("You have sent UGX 5,000 … Transaction ID: …") the amount is the last one
 * before that ID; in one that starts with its ID ("SENT. TID 123. UGX 5,000 to …") it is the first one after. With `bare`,
 * text that is only an ID is the ID; screenshot text never is, since stray words read from an image are not an ID.
 */
export function paymentEvidence(text: string, ownerNumbers: Readonly<Partial<Record<MobileNetwork, string | null>>> = {},
  { bare = true }: { bare?: boolean } = {}): PaymentEvidence {
  if (text.length > 12_000) return { transactionId: null, amount: null, network: null };
  const paid = [...text.matchAll(new RegExp(shillings, "giu"))].flatMap((match) => {
    const value = shillingValue(match[1] ?? match[2] ?? match[3] ?? "");
    return value !== undefined && !notPaid.test(text.slice(Math.max(0, match.index - 30), match.index)) ? [{ index: match.index, value }] : [];
  });
  const messages: { start: number; end: number; id: string }[] = [];
  for (const match of text.matchAll(new RegExp(transactionLabel, "giu"))) {
    const id = labelledId(match[1]), last = messages.at(-1);
    if (!id) continue;
    // Only MTN's "External Transaction Id" after its "Financial Transaction Id" is a second label of the same SMS.
    const secondary = /\b(?:external|ext\.?)\s*$/iu.test(text.slice(Math.max(0, match.index - 14), match.index));
    if (last && secondary && !paid.some((amount) => amount.index > last.end && amount.index < match.index)) last.end = match.index + match[0].length;
    else messages.push({ start: match.index, end: match.index + match[0].length, id });
  }
  const newest = messages.at(-1), earlier = messages.at(-2), trimmed = text.trim();
  // The newest message starts with its ID ("SENT.TID 498…. UGX 5,000 to") when a paid amount follows its label directly;
  // judged on that message alone, since a thread's top message is often cut off.
  const next = newest && paid.find((value) => value.index >= newest.end);
  const idFirst = !!newest && !!next && /^[\s.,;:-]*$/u.test(text.slice(newest.end, next.index));
  const amount = !newest ? paid[0]?.value : idFirst ? paid.find((value) => value.index > newest.start)?.value
    : paid.filter((value) => value.index < newest.start && value.index > (earlier?.end ?? -1)).at(-1)?.value;
  const own = newest ? text.slice(idFirst ? newest.start : earlier?.end ?? 0, idFirst ? undefined : newest.end) : text;
  const bareId = bare && onlyIdCharacters.test(trimmed) && !ugandanMobile.test(trimmed.replace(/[\s-]/gu, "")) ? parseTransactionId(trimmed) : null;
  return { transactionId: newest?.id ?? bareId, amount: amount ?? null,
    network: parsePaymentSms(own, ownerNumbers).network ?? parsePaymentSms(text, ownerNumbers).network ?? null };
}

// Look-alike characters OCR swaps in transaction IDs, folded to one form before comparing.
const lookAlike: Readonly<Record<string, string>> = { O: "0", Q: "0", D: "0", I: "1", L: "1", S: "5", B: "8", Z: "2", G: "6" };
/**
 * Whether a typed or pasted ID is the one a screenshot shows, allowing one OCR slip: look-alike characters, or one character
 * added, dropped or changed in an ID of 8 or more characters. The owner still compares the ID with their wallet SMS.
 */
export function sameTransactionId(typed: string, read: string): boolean {
  const fold = (id: string) => transactionKey(id).replace(/[OQDILSBZG]/gu, (letter) => lookAlike[letter]!);
  const a = fold(typed), b = fold(read);
  if (a === b) return true;
  if (Math.max(a.length, b.length) < 8 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
