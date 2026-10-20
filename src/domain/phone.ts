/**
 * Phone numbers for paid access (prompts/monetization.md 3 and 5.2). The canonical form is digits with the country
 * code and no plus (`256772123456`): member accounts, payer numbers and the owner's settings numbers are all stored
 * that way and shown grouped in threes (`256 772 123 456`). Input previews and `tel:`/`sms:` links include the leading plus.
 *
 * The phone field starts with `256`, so `normalizePhone` also accepts a full number typed or pasted after that prefill
 * (`2560772…`, `256+256…`, `25600254…`). Ugandan numbers must be `2567` plus 8 digits; numbers from other countries are
 * accepted when typed in full (10–15 digits, no leading 0).
 */

export const mobileNetworks = Object.freeze(["mtn", "airtel"] as const);
export type MobileNetwork = (typeof mobileNetworks)[number];

/** Canonical prefixes per network, each written in full with the country code (for example `25677`). */
export type NetworkPrefixTable = Readonly<Record<MobileNetwork, readonly string[]>>;

/**
 * Empty until the owner confirms each network's prefixes in full (OP-38, plan section 12). Until then no number
 * pre-picks a network; the subscriber and the owner always choose it themselves.
 */
export const networkPrefixes: NetworkPrefixTable = Object.freeze({ mtn: Object.freeze([]), airtel: Object.freeze([]) });

/** Shown under the field when `256` is followed by a digit that cannot start a Ugandan mobile number. */
export const outsideUgandaHint = "For a number outside Uganda, delete 256 and type the full number with its country code";
export type PhoneHint = "outside-uganda";

const ugandaCode = "256";
// Anything longer is not a phone number; refusing early keeps a pasted paragraph cheap.
export const phoneInputMaxLength = 64;
const separators = /[\s\-.()[\]\u2010-\u2015\u2212]/gu;

/** Steps 1–3 of `normalizePhone`: separators removed, a number typed after the prefill kept, then `+` or `00` dropped. */
function digitsOf(input: unknown): string | null {
  if (typeof input !== "string" || input.length > phoneInputMaxLength) return null;
  let value = input.replace(separators, "");
  const rest = value.slice(ugandaCode.length);
  if (value.startsWith(ugandaCode) && (rest.startsWith("+") || rest.startsWith("0") || rest.startsWith(ugandaCode))) value = rest;
  if (value.startsWith("+")) value = value.slice(1);
  else if (value.startsWith("00")) value = value.slice(2);
  return value;
}

/** True for canonical digits: 10–15 of them, no leading 0, and a `256` number must be `2567` plus 8 digits. */
export function isCanonicalPhone(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9]\d{9,14}$/u.test(value)) return false;
  return !value.startsWith(ugandaCode) || /^2567\d{8}$/u.test(value);
}

/**
 * The canonical number for what was typed or pasted, or null when it is not a valid number:
 * 1. remove spaces, dashes, dots and brackets;
 * 2. `256` followed by `+`, `0` or `256` means a full number was typed after the prefill: keep only the rest;
 * 3. drop a leading `+` or `00`;
 * 4. `0` plus 9 digits, or 9 digits starting with 7, become `256` plus the 9 digits;
 * 5. accept only canonical digits (`isCanonicalPhone`).
 */
export function normalizePhone(input: unknown): string | null {
  let value = digitsOf(input);
  if (value === null) return null;
  if (/^0\d{9}$/u.test(value)) value = ugandaCode + value.slice(1);
  else if (/^7\d{8}$/u.test(value)) value = ugandaCode + value;
  return isCanonicalPhone(value) ? value : null;
}

export type PhoneInputIssue = "required" | "invalid" | "too-long" | "country-code";
/** UI validation uses the same canonical-number contract as every server mutation. */
export function phoneInputIssue(value: string, required = false): PhoneInputIssue | null {
  if (!value.trim()) return required ? "required" : null;
  if (normalizePhone(value)) return null;
  if (value.length > phoneInputMaxLength || (value.match(/\d/gu)?.length ?? 0) > 15) return "too-long";
  return phoneHint(value) ? "country-code" : "invalid";
}

/** The hint for a refused or unfinished number that starts `256` and then a digit other than 7 or 0. */
export function phoneHint(input: unknown): PhoneHint | null {
  if (normalizePhone(input) !== null) return null;
  const value = digitsOf(input);
  return value !== null && /^256[1-689]/u.test(value) ? "outside-uganda" : null;
}

/** Canonical digits grouped in threes: `256 772 123 456`. Anything else is returned unchanged. */
export function formatPhone(phone: string): string {
  return /^\d+$/u.test(phone) ? (phone.match(/\d{1,3}/gu) ?? []).join(" ") : phone;
}

/** The last three digits only, for code messages that may be forwarded: "ending 456". */
export function maskPhone(phone: string): string {
  return `ending ${phone.slice(-3)}`;
}

/**
 * The local form `0772123456` of a Ugandan number, for the Copy button when the owner's copy format is `local`.
 * Other numbers have no local form here and keep their canonical digits.
 */
export function localUgandaPhone(phone: string): string {
  return /^2567\d{8}$/u.test(phone) ? `0${phone.slice(ugandaCode.length)}` : phone;
}

/**
 * The network whose prefix table entry is the longest prefix of the number, or null when none matches or both networks
 * claim an equally long prefix. Inject a table in tests; the default stays empty until the owner confirms it.
 */
export function networkForPrefix(phone: string, table: NetworkPrefixTable = networkPrefixes): MobileNetwork | null {
  let found: MobileNetwork | null = null, length = 0, tied = false;
  for (const network of mobileNetworks) {
    for (const prefix of table[network]) {
      if (!/^\d+$/u.test(prefix) || !phone.startsWith(prefix)) continue;
      if (prefix.length > length) [found, length, tied] = [network, prefix.length, false];
      else if (prefix.length === length && found !== network) tied = true;
    }
  }
  return tied ? null : found;
}

/** `tel:+256772123456`: the plus lives only inside the link. */
export function telHref(phone: string): string {
  return `tel:+${phone}`;
}

/** A wa.me chat link; the optional message is encoded with `encodeURIComponent`, so `#`, `&` and line breaks survive. */
export function waHref(phone: string, text?: string): string {
  return text === undefined ? `https://wa.me/${phone}` : `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/** An SMS link; `?&body=` is the form that both Android and iOS messaging apps read. */
export function smsHref(phone: string, text?: string): string {
  return text === undefined ? `sms:+${phone}` : `sms:+${phone}?&body=${encodeURIComponent(text)}`;
}
