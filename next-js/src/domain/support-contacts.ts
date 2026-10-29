export type SupportContact = Readonly<{
  id: string;
  label: string;
  network: "mtn" | "airtel" | "other";
  phone: string;
  calls: boolean;
  whatsapp: boolean;
  enabled: boolean;
  primary: boolean;
}>;

export type SupportContactSettings = Readonly<{
  supportContacts?: readonly SupportContact[] | null;
  contactPhone: string | null;
  whatsappPhone: string | null;
}>;

export const supportContactRules = Object.freeze({ max: 8, labelMaxLength: 48 });
/** An explicit empty list hides support numbers; missing migrated data keeps the existing contact routes. */
export function supportContactsOf(settings: SupportContactSettings): readonly SupportContact[] {
  if (settings.supportContacts != null) return settings.supportContacts.filter(contact => contact.enabled)
    .sort((a, b) => Number(b.primary) - Number(a.primary));
  const contacts: SupportContact[] = [];
  if (settings.contactPhone) contacts.push({ id: "legacy-phone", label: "Support", network: "other", phone: settings.contactPhone,
    calls: true, whatsapp: settings.whatsappPhone === settings.contactPhone, enabled: true, primary: true });
  if (settings.whatsappPhone && settings.whatsappPhone !== settings.contactPhone) contacts.push({ id: "legacy-whatsapp", label: "WhatsApp support", network: "other",
    phone: settings.whatsappPhone, calls: false, whatsapp: true, enabled: true, primary: contacts.length === 0 });
  return contacts;
}
