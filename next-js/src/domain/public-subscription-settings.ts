import type { SubscriptionSettings } from "./subscription-settings.ts";
import { supportContactsOf, type SupportContact, type SupportContactSettings } from "./support-contacts.ts";

export type PublicSupportSettings = Readonly<{
  contactPhone: string | null;
  whatsappPhone: string | null;
  supportContacts: readonly SupportContact[];
}>;
export type PublicSubscriptionSettings = Pick<SubscriptionSettings,
  "mtnNumber" | "mtnName" | "mtnMenuShortcut" | "airtelNumber" | "airtelName" | "airtelMenuShortcut" | "copyFormat" | "paymentNote" | "reviewTime">
  & SupportContactSettings;

/** Public client props include only enabled contact methods, including the legacy contact fallback. */
export function publicSupportContactSettings(settings: SupportContactSettings | null | undefined): PublicSupportSettings {
  const contacts = settings ? supportContactsOf(settings).map(({ id, label, network, phone, calls, whatsapp, enabled, primary }) =>
    ({ id, label, network, phone, calls, whatsapp, enabled, primary })) : [];
  return { contactPhone: contacts.find(contact => contact.calls)?.phone ?? null,
    whatsappPhone: contacts.find(contact => contact.whatsapp)?.phone ?? null, supportContacts: contacts };
}

/** The payment form never receives owner message templates, disabled contacts, audit metadata, or retention policy. */
export function publicSubscriptionSettings(settings: SubscriptionSettings): PublicSubscriptionSettings {
  return { mtnNumber: settings.mtnNumber, mtnName: settings.mtnName, mtnMenuShortcut: settings.mtnMenuShortcut,
    airtelNumber: settings.airtelNumber, airtelName: settings.airtelName, airtelMenuShortcut: settings.airtelMenuShortcut,
    copyFormat: settings.copyFormat, paymentNote: settings.paymentNote, reviewTime: settings.reviewTime,
    ...publicSupportContactSettings(settings) };
}
