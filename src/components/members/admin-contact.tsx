"use client";

import { ChatIcon, PhoneIcon } from "@/components/ui/icons";
import { telHref, waHref } from "@/domain/phone";
import type { SubscriptionSettings } from "@/domain/subscription-settings";
import { createMessages } from "@/i18n/messages";
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
