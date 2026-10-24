"use client";

import { ChatIcon, PhoneIcon } from "@/components/ui/icons";
import { TextLink } from "@/components/ui/controls";
import { telHref, waHref } from "@/domain/phone";
import type { SubscriptionSettings } from "@/domain/subscription-settings";
import { resolveLocale } from "@/i18n/locales";
import { createMessages } from "@/i18n/messages";
import { AccountNote } from "./account-styles";
import { ActionLink, HelpActions } from "./subscribe-styles";

export type AdminContact = Pick<SubscriptionSettings, "contactPhone" | "whatsappPhone">;

/** A call is the primary route to the admin and a WhatsApp chat the written fallback; an unset number hides its link. */
export function AdminContactLinks({ locale, contact, text }: { locale: string; contact: AdminContact; text?: string | undefined }) {
  const m = createMessages(locale);
  if (!contact.contactPhone && !contact.whatsappPhone) return null;
  return <HelpActions data-admin-contact>
    {contact.contactPhone && <ActionLink href={telHref(contact.contactPhone)} data-analytics-ignore><PhoneIcon />{m.text("subscribe.callAdmin")}</ActionLink>}
    {contact.whatsappPhone && <ActionLink href={waHref(contact.whatsappPhone, text)} variant="secondary" data-analytics-ignore><ChatIcon />{m.text("subscribe.whatsappAdmin")}</ActionLink>}
  </HelpActions>;
}

/** Account recovery always has a help route, including before administrator numbers are configured. */
export function AccountHelpLinks({ locale, contact }: { locale: string; contact: AdminContact }) {
  return contact.contactPhone || contact.whatsappPhone ? <AdminContactLinks locale={locale} contact={contact} />
    : <AccountNote><TextLink href={`/${resolveLocale(locale)}/contact`} prefetch={false}>{createMessages(locale).text("account.contactAdmin")}</TextLink></AccountNote>;
}

/** One persistent support action fits beside account navigation on small screens. */
export function AccountSupportLink({ locale, contact, text }: { locale: string; contact: AdminContact; text?: string }) {
  const href = contact.contactPhone ? telHref(contact.contactPhone) : contact.whatsappPhone ? waHref(contact.whatsappPhone, text) : `/${resolveLocale(locale)}/contact`;
  return <TextLink href={href} prefetch={false} data-analytics-ignore>{createMessages(locale).text("account.contactSupport")}</TextLink>;
}
