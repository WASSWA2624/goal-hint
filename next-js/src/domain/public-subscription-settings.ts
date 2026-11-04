import { manualPaymentProvider, type ManualPaymentSettings, type SubscriptionSettings } from "./subscription-settings.ts";
import { supportContactsOf, type SupportContact, type SupportContactSettings } from "./support-contacts.ts";

export type PublicSupportSettings = Readonly<{
  contactPhone: string | null;
  whatsappPhone: string | null;
  supportContacts: readonly SupportContact[];
}>;
export type PublicSubscriptionSettings = ManualPaymentSettings & Pick<SubscriptionSettings,
  "mtnMenuShortcut" | "airtelMenuShortcut" | "copyFormat" | "paymentNote" | "reviewTime"> & SupportContactSettings;

/** Public client props include only enabled contact methods, including the legacy contact fallback. */
export function publicSupportContactSettings(settings: SupportContactSettings | null | undefined): PublicSupportSettings {
  const contacts = settings ? supportContactsOf(settings).map(({ id, label, network, phone, calls, whatsapp, enabled, primary }) =>
    ({ id, label, network, phone, calls, whatsapp, enabled, primary })) : [];
  return { contactPhone: contacts.find(contact => contact.calls)?.phone ?? null,
    whatsappPhone: contacts.find(contact => contact.whatsapp)?.phone ?? null, supportContacts: contacts };
}

/** The payment form never receives owner message templates, disabled contacts, audit metadata, or retention policy. */
export function publicSubscriptionSettings(settings: SubscriptionSettings): PublicSubscriptionSettings {
  const mtn = manualPaymentProvider(settings, "mtn"), airtel = manualPaymentProvider(settings, "airtel");
  return { mtnEnabled: settings.mtnEnabled, mtnNumber: mtn.number, mtnName: mtn.name, mtnMenuShortcut: mtn.reason === null ? settings.mtnMenuShortcut : null,
    airtelEnabled: settings.airtelEnabled, airtelNumber: airtel.number, airtelName: airtel.name, airtelMenuShortcut: airtel.reason === null ? settings.airtelMenuShortcut : null,
    copyFormat: settings.copyFormat, paymentNote: settings.paymentNote, reviewTime: settings.reviewTime,
    ...publicSupportContactSettings(settings) };
}
