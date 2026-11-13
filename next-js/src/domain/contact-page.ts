import { publicSupportContactSettings, type PublicSupportSettings } from "./public-support-settings.ts";
import type { SubscriptionSettings } from "./subscription-settings.ts";
import { parseContactPageEmail } from "./contact-page-email.ts";
import { parsePublicSupportContacts } from "./support-contacts-input.ts";
export { contactPageRules, contactPageEmailHref, parseContactPageEmail } from "./contact-page-email.ts";

export type PublicContactPageSettings = PublicSupportSettings & Readonly<{ email: string | null }>;
type ContactPageSettings = Pick<SubscriptionSettings, "contactPhone" | "whatsappPhone" | "supportContacts" | "contactPageEmail" | "contactPageEmailVisible">;

/** Only visible public fields leave the server; page-specific hiding never changes checkout/account support. */
export function publicContactPageSettings(settings: ContactPageSettings | null | undefined): PublicContactPageSettings {
  // Project from the source directory before its public allowlist drops the internal visibility flag.
  const visibleSupport = settings ? publicSupportContactSettings({ ...settings,
    supportContacts: settings.supportContacts?.filter(contact => contact.showOnContactPage !== false) ?? null }) : publicSupportContactSettings(null);
  const parsedEmail = parseContactPageEmail(settings?.contactPageEmail ?? null);
  return { ...visibleSupport, email: settings?.contactPageEmailVisible && parsedEmail.ok ? parsedEmail.email : null };
}

/** Revalidate fetched public data, recomputing compact numbers from the allowed contacts rather than trusting fallbacks. */
export function parsePublicContactPageSettings(input: unknown): PublicContactPageSettings | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const body = input as Record<string, unknown>;
  if (!Object.hasOwn(body, "email")) return null;
  const email = parseContactPageEmail(body.email), contacts = parsePublicSupportContacts(body.supportContacts);
  if (!email.ok || !contacts.ok) return null;
  return publicContactPageSettings({ contactPhone: null, whatsappPhone: null, supportContacts: contacts.contacts,
    contactPageEmail: email.email, contactPageEmailVisible: true });
}
