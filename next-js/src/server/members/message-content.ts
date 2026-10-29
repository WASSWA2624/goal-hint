import "server-only";

import { publicPolicy } from "../../domain/public-policy.ts";
import { parseMessageTemplates, resolveMessageTemplates, type MessageEvent, type MessageTemplateSettings, type MessageValues } from "../../domain/message-templates.ts";

export type MessagingSettings = Readonly<{ messageTemplates?: MessageTemplateSettings; contactPhone: string | null;
  whatsappPhone: string | null; trialDays: number }>;
export type MessagingSettingsReader = () => Promise<MessagingSettings | null>;
export function sharedMessageValues(settings: MessagingSettings | null, phone: string): MessageValues {
  return { phone: `+${phone}`, account_url: `${publicPolicy.origin}/en/account`, access_url: `${publicPolicy.origin}/en`,
    support_url: `${publicPolicy.origin}/en/contact`,
    ...(settings?.contactPhone ? { support_phone: `+${settings.contactPhone}` } : {}),
    ...(settings?.whatsappPhone ? { support_whatsapp: `+${settings.whatsappPhone}` } : {}),
    ...(settings ? { trial_days: String(settings.trialDays) } : {}) };
}
export type MessageSnapshot = { event: MessageEvent; channel: "sms" | "whatsapp"; source: string; templateName: string; parameters: string[] };
export function eventSnapshots(settings: MessageTemplateSettings, event: MessageEvent): MessageSnapshot[] {
  const template = settings.events[event];
  return template.enabled ? template.channels.map(channel => ({ event, channel, source: template.sms,
    templateName: template.whatsapp.templateName, parameters: [...template.whatsapp.parameters] })) : [];
}
export function readMessageSnapshot(input: unknown): MessageSnapshot {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new RangeError("Invalid message snapshot.");
  const snapshot = input as MessageSnapshot;
  const configuration = resolveMessageTemplates(null);
  if (!Object.hasOwn(configuration.events, snapshot.event) || !["sms", "whatsapp"].includes(snapshot.channel)
    || typeof snapshot.source !== "string" || typeof snapshot.templateName !== "string" || !Array.isArray(snapshot.parameters)
    || snapshot.parameters.some(parameter => typeof parameter !== "string")) throw new RangeError("Invalid message snapshot.");
  // Reuse the same validation as owner writes, including event-scoped variables and immutable authentication mappings.
  configuration.events[snapshot.event] = { enabled: true, channels: [snapshot.channel], sms: snapshot.source,
    whatsapp: { templateName: snapshot.templateName, parameters: snapshot.parameters } };
  if (["account-verification", "password-reset"].includes(snapshot.event)) throw new RangeError("Verification codes cannot be queued.");
  const checked = parseMessageTemplates(configuration);
  if (!checked.ok) throw new RangeError("Invalid message snapshot.");
  return snapshot;
}
