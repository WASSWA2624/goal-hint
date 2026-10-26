/**
 * Mobile-number checks with libphonenumber's mobile metadata (about 100 KB), kept apart from `phone.ts` so pages that only
 * format or normalize a number (every page header) do not load it.
 */
import { parsePhoneNumberFromString } from "libphonenumber-js/mobile";
import { normalizePhone, phoneHint, phoneInputMaxLength } from "./phone.ts";

/**
 * The canonical number when it is also a valid mobile number for its country (libphonenumber's mobile metadata), else null.
 * Non-geographic codes (+800 freephone, +883 and the like) belong to no country and are refused.
 */
export function validMobilePhone(input: unknown): string | null {
  const phone = normalizePhone(input), parsed = phone ? parsePhoneNumberFromString(`+${phone}`) : undefined;
  return phone && parsed?.country && parsed.isValid() ? phone : null;
}

export type PhoneInputIssue = "required" | "invalid" | "too-long" | "country-code" | "not-mobile";
/** UI validation uses the same contract as the server: `validMobilePhone` for a new number, `normalizePhone` for a lookup. */
export function phoneInputIssue(value: string, required = false, lookup = false): PhoneInputIssue | null {
  if (!value.trim()) return required ? "required" : null;
  if (lookup ? normalizePhone(value) : validMobilePhone(value)) return null;
  if (normalizePhone(value)) return "not-mobile";
  if (value.length > phoneInputMaxLength || (value.match(/\d/gu)?.length ?? 0) > 15) return "too-long";
  return phoneHint(value) ? "country-code" : "invalid";
}
