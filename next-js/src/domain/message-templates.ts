/** Owner-editable content. Event sources and supported transports remain a reviewed application contract. */
export const messageEventKeys = ["welcome", "account-verification", "password-reset", "payment-received", "payment-approved",
  "payment-rejected", "credit-added", "subscription-renewed"] as const;
export type MessageEvent = (typeof messageEventKeys)[number];
export type TemplateChannel = "sms" | "whatsapp";
export type MessageTemplate = { enabled: boolean; channels: TemplateChannel[]; sms: string;
  whatsapp: { templateName: string; parameters: string[] } };
export type MessageTemplateSettings = { version: 1; events: Record<MessageEvent, MessageTemplate> };

export const messagePlaceholders = Object.freeze({
  phone: { label: "Account phone", source: "Registered account", sample: "+256700000111" },
  verification_code: { label: "Verification code", source: "Current verification request", sample: "123456" },
  expiry_hours: { label: "Code validity (hours)", source: "Verification policy", sample: "24" },
  account_url: { label: "Account link", source: "Application address", sample: "https://example.com/en/account" },
  access_url: { label: "Open application", source: "Application address", sample: "https://example.com/en" },
  support_phone: { label: "Support phone", source: "Support settings", sample: "+256700000222" },
  support_whatsapp: { label: "Support WhatsApp", source: "Support settings", sample: "+256700000333" },
  support_url: { label: "Contact support link", source: "Application address", sample: "https://example.com/en/contact" },
  trial_days: { label: "Trial days", source: "Access settings", sample: "2" },
  plan_name: { label: "Plan name", source: "Payment or access period", sample: "Weekly" },
  amount: { label: "Payment amount", source: "Payment record", sample: "UGX 5,000" },
  payment_reference: { label: "Payment reference", source: "Payment record", sample: "PABCD" },
  rejection_reason: { label: "Rejection reason", source: "Payment decision", sample: "Payment not received" },
  expiry_date: { label: "Access expiry", source: "Access period", sample: "5 November 2026, 13:00 EAT" },
  balance: { label: "Credit balance", source: "Account wallet", sample: "UGX 2,000" },
});
export type MessagePlaceholder = keyof typeof messagePlaceholders;
export type MessageValues = Readonly<Partial<Record<MessagePlaceholder, string>>>;
const shared: MessagePlaceholder[] = ["phone", "account_url", "access_url", "support_phone", "support_whatsapp", "support_url"];
export const messageEvents: readonly Readonly<{ key: MessageEvent; label: string; description: string;
  placeholders: readonly MessagePlaceholder[]; verification: boolean }>[] = Object.freeze([
  { key: "welcome", label: "Account welcome", description: "Sent once after the member verifies their account.", placeholders: [...shared, "trial_days"], verification: false },
  { key: "account-verification", label: "Account verification", description: "Sent when a member requests their account verification code.", placeholders: [...shared, "verification_code", "expiry_hours"], verification: true },
  { key: "password-reset", label: "Password reset", description: "Sent when a member requests a password reset code.", placeholders: [...shared, "verification_code", "expiry_hours"], verification: true },
  { key: "payment-received", label: "Payment report received", description: "Confirms a payment report was submitted; it does not confirm money was received.", placeholders: [...shared, "plan_name", "amount", "payment_reference"], verification: false },
  { key: "payment-approved", label: "Payment approved", description: "Sent after the administrator approves a payment.", placeholders: [...shared, "plan_name", "amount", "payment_reference", "expiry_date", "balance"], verification: false },
  { key: "payment-rejected", label: "Payment rejected", description: "Sent after the administrator rejects a payment report.", placeholders: [...shared, "plan_name", "amount", "payment_reference", "rejection_reason"], verification: false },
  { key: "credit-added", label: "Credit added", description: "Sent after a payment adds credit to the account.", placeholders: [...shared, "amount", "payment_reference", "balance"], verification: false },
  { key: "subscription-renewed", label: "Subscription renewed", description: "Sent after automatic renewal buys another access period.", placeholders: [...shared, "plan_name", "expiry_date", "balance"], verification: false },
]);
export const messagingChannelNotes = Object.freeze({
  sms: "SMS uses the registered account phone and the configured YoolaSMS sender.",
  whatsapp: "WhatsApp requires recipient consent and a provider-approved template with matching parameter order.",
  email: "Email is not configured. Member accounts currently have no verified email address or email delivery provider.",
});
const genericUpdate = "Goal Hint: Your account has been updated. Sign in to view the details or contact admin for help.";
export const defaultMessageTemplates: MessageTemplateSettings = {
  version: 1,
  events: Object.fromEntries(messageEvents.map(event => [event.key, {
    enabled: !["welcome", "payment-received"].includes(event.key),
    channels: event.verification ? ["sms", "whatsapp"] : ["sms"],
    sms: event.verification ? `Goal Hint ${event.key === "account-verification" ? "account verification" : "password reset"} code: {{verification_code}}. Valid for {{expiry_hours}} hours. Do not share this code.`
      : event.key === "welcome" ? "Welcome to Goal Hint. Your account is verified. Open {{access_url}} or contact support: {{support_url}}."
      : event.key === "payment-received" ? "Goal Hint: Payment report {{payment_reference}} is waiting for review. View updates: {{account_url}}."
      : genericUpdate,
    whatsapp: { templateName: event.verification ? "yoola_otp_verification" : "", parameters: event.verification ? ["{{verification_code}}"] : [] },
  }])) as Record<MessageEvent, MessageTemplate>,
};

const tokens = /\{\{([a-z][a-z0-9_]*)\}\}/gu;
function sourceError(event: MessageEvent, source: unknown): string | null {
  if (typeof source !== "string" || !source.trim() || source.length > 1_600) return "Keep message text between 1 and 1,600 characters.";
  const metadata = messageEvents.find(item => item.key === event)!;
  const found = [...source.matchAll(tokens)].map(match => match[1]!);
  if (found.some(key => !metadata.placeholders.includes(key as MessagePlaceholder))) return "This message contains a placeholder unavailable for its event.";
  if (/[{}]/u.test(source.replace(tokens, ""))) return "Use placeholders in the form {{account_url}}.";
  return null;
}
export function parseMessageTemplates(input: unknown): { ok: true; settings: MessageTemplateSettings } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("Choose valid message settings.");
  const object = input as Record<string, unknown>;
  try { if (new TextEncoder().encode(JSON.stringify(input)).length > 48 * 1_024) return fail("Keep all message settings within 48 KiB."); }
  catch { return fail("Message settings must be JSON data."); }
  if (object.version !== 1 || !object.events || typeof object.events !== "object" || Array.isArray(object.events)
    || Object.keys(object).some(key => !["version", "events"].includes(key))) return fail("Choose valid message settings version 1.");
  const events = object.events as Record<string, unknown>;
  if (Object.keys(events).some(key => !messageEventKeys.includes(key as MessageEvent))) return fail("Unknown message event.");
  const settings: MessageTemplateSettings = { version: 1, events: {} as Record<MessageEvent, MessageTemplate> };
  for (const event of messageEvents) {
    const item = events[event.key];
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail(`${event.label}: configuration is missing.`);
    const value = item as Record<string, unknown>;
    if (typeof value.enabled !== "boolean" || !Array.isArray(value.channels) || value.channels.some(channel => !["sms", "whatsapp"].includes(channel))
      || new Set(value.channels).size !== value.channels.length || (value.enabled && !value.channels.length)
      || Object.keys(value).some(key => !["enabled", "channels", "sms", "whatsapp"].includes(key))) return fail(`${event.label}: choose at least one supported delivery channel.`);
    if (event.verification && !value.enabled) return fail(`${event.label}: verification messages must remain enabled.`);
    const channels = value.channels as TemplateChannel[];
    if (event.verification && (["sms", "whatsapp"] as const).some(channel => !channels.includes(channel))) return fail(`${event.label}: keep both member-selected verification channels available.`);
    const error = sourceError(event.key, value.sms);
    if (error) return fail(`${event.label}: ${error}`);
    if (event.verification && ["verification_code", "expiry_hours"].some(key => !(value.sms as string).includes(`{{${key}}}`))) return fail(`${event.label}: include the verification code and validity placeholders.`);
    if (!value.whatsapp || typeof value.whatsapp !== "object" || Array.isArray(value.whatsapp)) return fail(`${event.label}: choose a valid WhatsApp template.`);
    const whatsapp = value.whatsapp as Record<string, unknown>;
    if (typeof whatsapp.templateName !== "string" || !/^[a-z0-9_]{0,128}$/u.test(whatsapp.templateName)
      || !Array.isArray(whatsapp.parameters) || whatsapp.parameters.length > 20
      || Object.keys(whatsapp).some(key => !["templateName", "parameters"].includes(key))
      || whatsapp.parameters.some(parameter => sourceError(event.key, parameter))) return fail(`${event.label}: use an approved template name and valid parameters.`);
    if (value.enabled && value.channels.includes("whatsapp") && !whatsapp.templateName) return fail(`${event.label}: enter the provider-approved WhatsApp template name.`);
    if (event.verification && (whatsapp.templateName !== "yoola_otp_verification" || JSON.stringify(whatsapp.parameters) !== '["{{verification_code}}"]')) return fail(`${event.label}: authentication uses the approved Yoola verification template.`);
    settings.events[event.key] = { enabled: value.enabled, channels: [...value.channels] as TemplateChannel[], sms: value.sms as string,
      whatsapp: { templateName: whatsapp.templateName, parameters: [...whatsapp.parameters] as string[] } };
  }
  return { ok: true, settings };
}
/** Persisted legacy NULL means the established defaults; invalid stored data is never silently dispatched. */
export function resolveMessageTemplates(input: unknown): MessageTemplateSettings {
  if (input === null || input === undefined) return structuredClone(defaultMessageTemplates);
  const parsed = parseMessageTemplates(input);
  if (!parsed.ok) throw new RangeError(parsed.error);
  return parsed.settings;
}
export function renderMessageTemplate(event: MessageEvent, source: string, values: MessageValues): string {
  const error = sourceError(event, source);
  if (error) throw new RangeError(error);
  const rendered = source.replace(tokens, (_, key: MessagePlaceholder) => {
    const value = values[key];
    if (typeof value !== "string" || !value.trim()) throw new RangeError("A required message value is unavailable.");
    return value;
  });
  if (rendered.length > 1_600) throw new RangeError("The rendered message exceeds 1,600 characters.");
  return rendered;
}
export function previewMessageValues(event: MessageEvent): MessageValues {
  return Object.fromEntries(messageEvents.find(item => item.key === event)!.placeholders.map(key => [key, messagePlaceholders[key].sample]));
}
