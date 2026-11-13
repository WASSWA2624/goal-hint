import { authCopy } from "../i18n/messages/auth.ts";
import { communityLinksSchema, defaultCommunityLinks, type CommunityLink } from "./community.ts";
import { normalizePhone, outsideUgandaHint, phoneHint } from "./phone.ts";
import { validMobilePhone } from "./phone-mobile.ts";
import { supportContactsOf, type SupportContact } from "./support-contacts.ts";
import { parseSupportContacts as parseContacts } from "./support-contacts-input.ts";
import { defaultMessageTemplates, parseMessageTemplates, type MessageTemplateSettings } from "./message-templates.ts";
import { parseContactPageEmail } from "./contact-page-email.ts";
import { contactNotice } from "./contact-notice.ts";

export const parseSupportContacts = (input: unknown) => parseContacts(input, validMobilePhone);

/**
 * Paid-access settings the owner edits on /admin/settings (prompts/monetization.md 5.7). They live in one row, id = 1, of
 * SubscriptionSettings; a missing row means these defaults, so paid access ships `off`. These rules are pure and shared by
 * the dashboard form and the server; the migration's CHECK constraints repeat them.
 */
export const paywallModes = Object.freeze(["off", "on"] as const);
/** Off opens public content. On restricts subscriber features to eligible accounts. */
export type PaywallMode = (typeof paywallModes)[number];
/** What the Copy number button copies; numbers are always shown as `256 772 123 456`. */
export const copyFormats = Object.freeze(["international", "local"] as const);
export type CopyFormat = (typeof copyFormats)[number];

export const settingsRules = Object.freeze({
  nameMaxLength: 64,
  shortcutMaxLength: 60,
  paymentNoteMaxLength: 300,
  reviewTimeMaxLength: 60,
  /** Zero disables the new-account trial offer. */
  trialDays: Object.freeze({ min: 0, max: 366, default: 2 }),
  screenshotRetentionDays: Object.freeze({ min: 7, max: 365, default: 90 }),
});

/** Digits, `*` and `#`, with `{amount}` where the price goes: the menu string the owner tested on their own phone. */
export const menuShortcutPattern = /^(?:[0-9*#]|\{amount\})+$/u;

/** Timestamps are ISO strings, so the same value serves the server, the API and the dashboard form. */
export type SubscriptionSettings = Readonly<{
  paywallMode: PaywallMode;
  allowUnsubscribedMembers: boolean;
  mtnEnabled: boolean;
  mtnNumber: string | null;
  mtnName: string | null;
  mtnMenuShortcut: string | null;
  airtelEnabled: boolean;
  airtelNumber: string | null;
  airtelName: string | null;
  airtelMenuShortcut: string | null;
  copyFormat: CopyFormat;
  contactPhone: string | null;
  whatsappPhone: string | null;
  contactPageEmail: string | null;
  contactPageEmailVisible: boolean;
  /** Null keeps the legacy/configured support numbers until the owner saves a contact list. */
  supportContacts: readonly SupportContact[] | null;
  messageTemplates: MessageTemplateSettings;
  communityVisible: boolean;
  communityLinks: readonly CommunityLink[];
  paymentAlertsEnabled: boolean;
  paymentAlertRepeats: number;
  paymentNote: string | null;
  reviewTime: string | null;
  trialDays: number;
  screenshotRetentionDays: number;
  paymentNumbersChangedAt: string | null;
  lastMembersPurgeAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}>;

/** A missing row defaults to public access with a two-day trial configured for when paid access is on. */
export const defaultSubscriptionSettings: SubscriptionSettings = Object.freeze({
  paywallMode: "off",
  allowUnsubscribedMembers: false,
  mtnEnabled: false, mtnNumber: null, mtnName: null, mtnMenuShortcut: null,
  airtelEnabled: false, airtelNumber: null, airtelName: null, airtelMenuShortcut: null,
  copyFormat: "international",
  contactPhone: null, whatsappPhone: null,
  contactPageEmail: contactNotice.email, contactPageEmailVisible: true,
  supportContacts: null, messageTemplates: defaultMessageTemplates,
  communityVisible: true, communityLinks: defaultCommunityLinks, paymentAlertsEnabled: false, paymentAlertRepeats: 1,
  paymentNote: null, reviewTime: null,
  trialDays: settingsRules.trialDays.default,
  screenshotRetentionDays: settingsRules.screenshotRetentionDays.default,
  paymentNumbersChangedAt: null, lastMembersPurgeAt: null, updatedAt: null, updatedBy: null,
});

/** The fields the Settings form saves; the mode has its own two-tap control. */
export const editableSettingFields = Object.freeze(["mtnEnabled", "mtnNumber", "mtnName", "mtnMenuShortcut", "airtelEnabled", "airtelNumber", "airtelName",
  "airtelMenuShortcut", "copyFormat", "contactPhone", "whatsappPhone", "paymentNote", "reviewTime", "allowUnsubscribedMembers", "trialDays",
  "screenshotRetentionDays", "supportContacts", "messageTemplates", "communityVisible", "communityLinks", "paymentAlertsEnabled", "paymentAlertRepeats", "contactPageEmail", "contactPageEmailVisible"] as const);
export type EditableSettingField = (typeof editableSettingFields)[number];
export type SettingsChanges = Partial<Pick<SubscriptionSettings, EditableSettingField>>;

/**
 * The numbers and names that Safety tips tell subscribers to trust. Changing any of them needs the owner password again
 * and is audited with the old and new values.
 */
export const identitySettingFields = Object.freeze(["mtnNumber", "mtnName", "mtnMenuShortcut", "airtelNumber", "airtelName",
  "airtelMenuShortcut", "contactPhone", "whatsappPhone"] as const);
export const protectedSettingFields = Object.freeze([...identitySettingFields, "mtnEnabled", "airtelEnabled", "supportContacts", "messageTemplates", "communityVisible", "communityLinks", "paymentAlertsEnabled", "contactPageEmail", "contactPageEmailVisible"] as const);
export type ProtectedSettingField = (typeof protectedSettingFields)[number];
export const isProtectedSettingField = (field: string): field is ProtectedSettingField =>
  (protectedSettingFields as readonly string[]).includes(field);

export const settingLabels: Readonly<Record<EditableSettingField, string>> = Object.freeze({
  mtnEnabled: "MTN MoMo payments",
  mtnNumber: "MTN MoMo receiving number",
  mtnName: "MTN MoMo registered account name",
  mtnMenuShortcut: "MTN menu shortcut",
  airtelEnabled: "Airtel Money payments",
  airtelNumber: "Airtel Money receiving number",
  airtelName: "Airtel Money registered account name",
  airtelMenuShortcut: "Airtel menu shortcut",
  copyFormat: "Copy number format",
  contactPhone: "Contact phone (calls)",
  whatsappPhone: "WhatsApp number",
  contactPageEmail: "Contact page email",
  contactPageEmailVisible: "Show email on contact page",
  supportContacts: "Support contacts",
  messageTemplates: "Message templates",
  communityVisible: "Show Community to the public",
  communityLinks: "Community links",
  paymentAlertsEnabled: "Payment alerts",
  paymentAlertRepeats: "Foreground sound repeats",
  paymentNote: "Extra payment note",
  reviewTime: "Typical review time",
  allowUnsubscribedMembers: "Allow access for verified members without a subscription",
  trialDays: authCopy.trialRegistrationDays,
  screenshotRetentionDays: "Keep screenshots after approval (days)",
});

const phoneFields = new Set<EditableSettingField>(["mtnNumber", "airtelNumber", "contactPhone", "whatsappPhone"]);
const nameFields = new Set<EditableSettingField>(["mtnName", "airtelName"]);
const shortcutFields = new Set<EditableSettingField>(["mtnMenuShortcut", "airtelMenuShortcut"]);
/** Each payment number and the menu shortcut that dials it; a new number makes the tested shortcut stale. */
export const shortcutOfNumber = Object.freeze({ mtnNumber: "mtnMenuShortcut", airtelNumber: "airtelMenuShortcut" } as const);
export type ShortcutField = (typeof shortcutOfNumber)[keyof typeof shortcutOfNumber];
const ranges = {
  trialDays: settingsRules.trialDays,
  screenshotRetentionDays: settingsRules.screenshotRetentionDays,
} as const;
// Control characters other than the note's line breaks never belong in owner copy shown on the Get access page.
const controlCharacters = /[\u0000-\u0009\u000b-\u001f\u007f]/u;

type FieldErrors = Partial<Record<EditableSettingField | "changes", string>>;
export type ParsedChanges = Readonly<{ ok: true; changes: SettingsChanges }> | Readonly<{ ok: false; errors: FieldErrors }>;

/** Optional text: trimmed, empty means none; too long or carrying control characters is refused. */
function text(value: unknown, maximum: number, multiline = false): { value: string | null } | { error: string } {
  if (value === null) return { value: null };
  if (typeof value !== "string") return { error: "Enter text." };
  const trimmed = (multiline ? value.replace(/\r\n?/gu, "\n") : value).trim();
  if (trimmed === "") return { value: null };
  if (controlCharacters.test(trimmed) || (!multiline && trimmed.includes("\n"))) return { error: "Remove special characters." };
  if (trimmed.length > maximum) return { error: `Use at most ${maximum} characters.` };
  return { value: trimmed };
}

export type ManualPaymentSettings = Pick<SubscriptionSettings, "mtnEnabled" | "mtnNumber" | "mtnName" | "airtelEnabled" | "airtelNumber" | "airtelName">;

export function manualPaymentProvider(settings: ManualPaymentSettings, network: "mtn" | "airtel"):
  { number: string; name: string; reason: null } | { number: null; name: null; reason: string } {
  if (!settings[`${network}Enabled`]) return { number: null, name: null, reason: "This payment method is disabled." };
  const number = validMobilePhone(settings[`${network}Number`]);
  const name = text(settings[`${network}Name`], settingsRules.nameMaxLength);
  if (!number || !("value" in name) || !name.value) {
    return { number: null, name: null, reason: "Receiving details are incomplete or invalid." };
  }
  return { number, name: name.value, reason: null };
}

/**
 * Validate the fields a save sends. Phones become canonical digits (an empty field clears the number), shortcuts lose
 * their spaces, text is trimmed, and whole numbers must sit inside the owner's ranges. Unknown fields are refused.
 */
export function parseSettingsChanges(input: unknown): ParsedChanges {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: { changes: "Send the changed settings." } };
  const errors: FieldErrors = {};
  const changes: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(input)) {
    if (!(editableSettingFields as readonly string[]).includes(field)) { errors.changes = `Unknown setting: ${field.slice(0, 40)}.`; continue; }
    const key = field as EditableSettingField;
    if (key === "contactPageEmail") {
      const parsed = parseContactPageEmail(value);
      if (parsed.ok) changes[key] = parsed.email;
      else errors[key] = parsed.error;
    } else if (key === "contactPageEmailVisible") {
      if (typeof value === "boolean") changes[key] = value;
      else errors[key] = "Choose whether to show email on the contact page.";
    } else if (key === "communityLinks") {
      const parsed = communityLinksSchema.safeParse(value);
      if (parsed.success) changes[key] = parsed.data;
      else errors[key] = "Use a valid HTTPS link for each platform, or leave it blank.";
    } else if (key === "communityVisible") {
      if (typeof value === "boolean") changes[key] = value;
      else errors[key] = "Choose whether Community is visible to everyone.";
    } else if (key === "allowUnsubscribedMembers") {
      if (typeof value === "boolean") changes[key] = value;
      else errors[key] = "Choose whether verified members can access subscriber features without a subscription.";
    } else if (key === "paymentAlertsEnabled" || key === "mtnEnabled" || key === "airtelEnabled") {
      if (typeof value === "boolean") changes[key] = value;
      else errors[key] = key === "paymentAlertsEnabled" ? "Choose whether to enable payment alerts." : "Choose whether to enable this payment method.";
    } else if (key === "paymentAlertRepeats") {
      if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 3) changes[key] = value;
      else errors[key] = "Choose 1–3 foreground sound repeats.";
    } else if (key === "supportContacts") {
      const parsed = parseSupportContacts(value);
      if (parsed.ok) changes[key] = parsed.contacts;
      else errors[key] = parsed.error;
    } else if (key === "messageTemplates") {
      const parsed = parseMessageTemplates(value);
      if (parsed.ok) changes[key] = parsed.settings;
      else errors[key] = parsed.error;
    } else if (phoneFields.has(key)) {
      if (value === null || value === "") { changes[key] = null; continue; }
      const phone = validMobilePhone(value);
      if (phone === null) errors[key] = phoneHint(value) === "outside-uganda" ? `${outsideUgandaHint}.`
        : normalizePhone(value) ? "Enter a mobile number that is valid for its country." : "Enter a full number, for example 256 772 123 456.";
      else changes[key] = phone;
    } else if (shortcutFields.has(key)) {
      if (value !== null && typeof value !== "string") { errors[key] = "Enter the menu shortcut."; continue; }
      const shortcut = value === null ? "" : value.replace(/\s+/gu, "");
      if (shortcut === "") changes[key] = null;
      else if (shortcut.length > settingsRules.shortcutMaxLength) errors[key] = `Use at most ${settingsRules.shortcutMaxLength} characters.`;
      else if (!menuShortcutPattern.test(shortcut)) errors[key] = "Use digits, * and #, with {amount} where the price goes.";
      else changes[key] = shortcut;
    } else if (key === "copyFormat") {
      if ((copyFormats as readonly unknown[]).includes(value)) changes[key] = value;
      else errors[key] = "Choose international or local.";
    } else if (key === "trialDays" || key === "screenshotRetentionDays") {
      const { min, max } = ranges[key];
      if (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max) changes[key] = value;
      else errors[key] = `Enter a whole number from ${min} to ${max}.`;
    } else {
      const maximum = nameFields.has(key) ? settingsRules.nameMaxLength
        : key === "paymentNote" ? settingsRules.paymentNoteMaxLength : settingsRules.reviewTimeMaxLength;
      const parsed = text(value, maximum, key === "paymentNote");
      if ("error" in parsed) errors[key] = parsed.error;
      else changes[key] = parsed.value;
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, changes: changes as SettingsChanges };
}

export type SettingsChange = Readonly<{
  next: SubscriptionSettings;
  /** Every field whose stored value changes, including a shortcut cleared by its number. */
  changed: readonly EditableSettingField[];
  protectedChanged: readonly ProtectedSettingField[];
  /** Shortcuts dropped because their payment number changed and no new shortcut came with it. */
  cleared: readonly ShortcutField[];
  paymentNumbersChanged: boolean;
}>;

/**
 * Merge validated changes into the current settings. A changed payment number clears its menu shortcut, which the owner
 * tested against the old number, unless the same save sets a new shortcut. A shortcut without its number is refused.
 */
export function applySettingsChanges(current: SubscriptionSettings, changes: SettingsChanges):
  Readonly<{ ok: true; change: SettingsChange }> | Readonly<{ ok: false; errors: FieldErrors }> {
  const next: { -readonly [Key in keyof SubscriptionSettings]: SubscriptionSettings[Key] } = { ...current, ...changes };
  const cleared: ShortcutField[] = [];
  const errors: FieldErrors = {};
  for (const [number, shortcut] of Object.entries(shortcutOfNumber) as [keyof typeof shortcutOfNumber, ShortcutField][]) {
    const newShortcut = changes[shortcut] !== undefined && changes[shortcut] !== current[shortcut];
    if (next[number] !== current[number] && !newShortcut && current[shortcut] !== null) {
      next[shortcut] = null;
      cleared.push(shortcut);
    }
    if (next[shortcut] !== null && next[number] === null) errors[shortcut] = "Add the payment number first: a menu shortcut works only beside it.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const changed = editableSettingFields.filter((field) => field === "supportContacts" || field === "messageTemplates" || field === "communityLinks"
    ? JSON.stringify(next[field]) !== JSON.stringify(current[field]) : next[field] !== current[field]);
  return { ok: true, change: {
    next: Object.freeze({ ...next }),
    changed,
    protectedChanged: changed.filter(isProtectedSettingField),
    cleared,
    paymentNumbersChanged: changed.includes("mtnNumber") || changed.includes("airtelNumber"),
  } };
}

export type CheckoutReadinessIssue = Readonly<{ key: "plan" | "payment-number" | "contact" | "privacy" | "terms"; message: string }>;
export type CheckoutReadinessFacts = Readonly<{ activePlans: number; privacyReleaseReady: boolean; termsReleaseReady: boolean }>;

/** Setup for offering purchases to customers, independent of the paid access switch. */
export function checkoutReadiness(settings: SubscriptionSettings, facts: CheckoutReadinessFacts): readonly CheckoutReadinessIssue[] {
  const missing: CheckoutReadinessIssue[] = [];
  if (facts.activePlans < 1) missing.push({ key: "plan", message: "Activate a subscription plan" });
  if (manualPaymentProvider(settings, "mtn").reason !== null && manualPaymentProvider(settings, "airtel").reason !== null) {
    missing.push({ key: "payment-number", message: "Set up a Mobile Money receiving account" });
  }
  if (supportContactsOf(settings).length === 0) missing.push({ key: "contact", message: "Add a support contact" });
  if (!facts.privacyReleaseReady) missing.push({ key: "privacy", message: "Publish the privacy notice" });
  if (!facts.termsReleaseReady) missing.push({ key: "terms", message: "Publish the terms of use" });
  return missing;
}

/** The owner's settings, outstanding checkout setup, and address diagnostics. */
export type SettingsPageData = Readonly<{
  settings: SubscriptionSettings;
  source: "stored" | "defaults";
  checkoutReadiness: readonly CheckoutReadinessIssue[];
  protectedFields: readonly string[];
  environmentFields?: readonly ProtectedSettingField[];
  diagnostics: Readonly<{ address: string; headers: readonly Readonly<{ name: string; value: string | null }>[] }>;
}>;
