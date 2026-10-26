import { isCanonicalPhone } from "./phone.ts";

export const messageChannels = Object.freeze(["sms", "whatsapp"] as const);
export type MessageChannel = (typeof messageChannels)[number];
export type VerificationPurpose = "account" | "password-reset";

export const verificationCodeLifetimeMs = 24 * 60 * 60_000;
export const verificationRequestWindowMs = verificationCodeLifetimeMs;
export const verificationRequestLimit = 3;
export const passwordChangeWindowMs = verificationCodeLifetimeMs;

const noChannels: readonly MessageChannel[] = Object.freeze([]);
const smsOnly: readonly MessageChannel[] = Object.freeze(["sms"]);
// Exact live route prefixes on yoolasms.com/coverage; international routes need account activation.
// Generic "more countries" and "other EU countries" entries do not establish additional routes.
const smsCountryCodes = Object.freeze([
  "256", "265", "260", "254", "255", "250", // Local pricing: Uganda, Malawi, Zambia, Kenya, Tanzania, Rwanda.
  "211", "251", "243", // South Sudan, Ethiopia, DR Congo.
  "234", "233", "27", "263", "237", "221", "225", "235", "226", // Other named African countries.
  "971", "1", "44", "91", "86", "81", "82", "65", "49", "33", "39", "34", "31", "61",
  "966", "965", "974", "60", "66", "63", // Named Middle East and Asia Pacific destinations.
]);
const whatsappCountryCodes = Object.freeze(["256", "265", "260", "254", "255", "250", "263"]);

/** Published Yoola coverage for a canonical registered number; no country or network is inferred from local input. */
export function supportedMessageChannels(phone: string): readonly MessageChannel[] {
  if (!isCanonicalPhone(phone)) return noChannels;
  if (!smsCountryCodes.some((prefix) => phone.startsWith(prefix))) return noChannels;
  return whatsappCountryCodes.some((prefix) => phone.startsWith(prefix)) ? messageChannels : smsOnly;
}
