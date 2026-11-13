import { supportContactsOf, type SupportContact, type SupportContactSettings } from "./support-contacts.ts";

export type PublicSupportSettings = Readonly<{
  contactPhone: string | null;
  whatsappPhone: string | null;
  supportContacts: readonly SupportContact[];
}>;

/** Public client props include only enabled contact methods, including the legacy contact fallback. */
export function publicSupportContactSettings(settings: SupportContactSettings | null | undefined): PublicSupportSettings {
  const contacts = settings ? supportContactsOf(settings).map(({ id, label, network, phone, calls, whatsapp, enabled, primary }) =>
    ({ id, label, network, phone, calls, whatsapp, enabled, primary })) : [];
  return { contactPhone: contacts.find(contact => contact.calls)?.phone ?? null,
    whatsappPhone: contacts.find(contact => contact.whatsapp)?.phone ?? null, supportContacts: contacts };
}
