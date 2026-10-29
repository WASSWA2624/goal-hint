"use client";

import { ChatIcon, PhoneIcon } from "@/components/ui/icons";
import { TextLink } from "@/components/ui/controls";
import { telHref, waHref } from "@/domain/phone";
import { supportContactsOf, type SupportContactSettings } from "@/domain/support-contacts";
import { resolveLocale } from "@/i18n/locales";
import { createMessages } from "@/i18n/messages";
import { AccountNote } from "./account-styles";
import { ActionLink, HelpActions } from "./subscribe-styles";
import { DesktopSupportContacts, DesktopSupportContent, MobileSupportContent } from "./support-contact-links";

export type AdminContact = SupportContactSettings;

/** A call is the primary route to the admin and a WhatsApp chat the written fallback; an unset number hides its link. */
export function AdminContactLinks({ locale, contact, text, compact = false }: { locale: string; contact: AdminContact; text?: string | undefined; compact?: boolean }) {
  const m = createMessages(locale);
  if (!contact.contactPhone && !contact.whatsappPhone && !supportContactsOf(contact).length) return null;
  return <><MobileSupportContent><HelpActions $equal={compact} data-admin-contact>
    {contact.contactPhone && <ActionLink href={telHref(contact.contactPhone)} data-analytics-ignore><PhoneIcon />{m.text(compact ? "subscribe.call" : "subscribe.callAdmin")}</ActionLink>}
    {contact.whatsappPhone && <ActionLink href={waHref(contact.whatsappPhone, text)} variant="secondary" data-analytics-ignore><ChatIcon />{m.text(compact ? "subscribe.whatsapp" : "subscribe.whatsappAdmin")}</ActionLink>}
  </HelpActions></MobileSupportContent><DesktopSupportContacts locale={locale} contact={contact} text={text} /></>;
}

/** Account recovery always has a help route, including before administrator numbers are configured. */
export function AccountHelpLinks({ locale, contact }: { locale: string; contact: AdminContact }) {
  return contact.contactPhone || contact.whatsappPhone || supportContactsOf(contact).length ? <AdminContactLinks locale={locale} contact={contact} />
    : <AccountNote><TextLink href={`/${resolveLocale(locale)}/contact`} prefetch={false}>{createMessages(locale).text("account.contactAdmin")}</TextLink></AccountNote>;
}

/** One persistent support action fits beside account navigation on small screens. */
export function AccountSupportLink({ locale, contact, text }: { locale: string; contact: AdminContact; text?: string }) {
  const href = contact.contactPhone ? telHref(contact.contactPhone) : contact.whatsappPhone ? waHref(contact.whatsappPhone, text) : `/${resolveLocale(locale)}/contact`;
  return <><MobileSupportContent><TextLink href={href} prefetch={false} data-analytics-ignore>{createMessages(locale).text("account.contactSupport")}</TextLink></MobileSupportContent>
    {supportContactsOf(contact).length ? <DesktopSupportContacts locale={locale} contact={contact} text={text} appearance="text" />
      : <DesktopSupportContent><TextLink href={`/${resolveLocale(locale)}/contact`} prefetch={false}>{createMessages(locale).text("account.contactSupport")}</TextLink></DesktopSupportContent>}</>;
}
