"use client";

import styled from "styled-components";
import { ChatIcon, PhoneIcon } from "@/components/ui/icons";
import { TextLink } from "@/components/ui/controls";
import { formatPhone, telHref, waHref } from "@/domain/phone";
import { supportContactsOf, type SupportContactSettings } from "@/domain/support-contacts";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { ActionLink } from "./subscribe-styles";

/** Existing mobile support controls keep their layout while desktop can show the complete contact directory. */
export const MobileSupportContent = styled.div`
  display: contents;
  ${media.desktop} { display: none; }
`;
export const DesktopSupportContent = styled.div`
  display: none;
  ${media.desktop} { display: contents; }
`;

const ContactList = styled.div`
  display: none;
  ${media.desktop} { display: grid; gap: var(--gh-spacing-2); min-inline-size: 0; inline-size: 100%; }
`;
const ContactRow = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--gh-spacing-1) var(--gh-spacing-4); min-inline-size: 0;
  & + & { padding-block-start: var(--gh-spacing-2); border-block-start: 0; }
`;
const ContactIdentity = styled.div`
  display: grid; gap: var(--gh-spacing-0_25); min-inline-size: 0; font-size: var(--gh-font-body); line-height: var(--gh-leading-compact);
  strong { font-weight: var(--gh-weight-bold); overflow-wrap: anywhere; }
  span { color: ${({ theme }) => theme.color.mutedText}; font-variant-numeric: tabular-nums; }
`;
const ContactActions = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-1) var(--gh-spacing-3);
  a { min-block-size: var(--form-control-height); border-radius: ${({ theme }) => theme.radius.control}; }
`;
const ContactTextLink = styled(TextLink)`
  display: inline-flex; align-items: center; gap: var(--gh-spacing-1_5); font-size: var(--gh-font-emphasis);
`;

/** All enabled contacts share one presentation across payment, account, and recovery screens. */
export function DesktopSupportContacts({ locale, contact, text, appearance = "buttons" }: {
  locale: string; contact: SupportContactSettings; text?: string | undefined; appearance?: "buttons" | "text";
}) {
  const contacts = supportContactsOf(contact), m = createMessages(locale);
  if (!contacts.length) return null;
  const Link = appearance === "text" ? ContactTextLink : ActionLink;
  return <ContactList data-desktop-support>{contacts.map(item => <ContactRow key={item.id}>
    <ContactIdentity><strong>{item.network === "other" || item.label.toLowerCase().includes(item.network) ? item.label
      : `${item.network === "mtn" ? "MTN" : "Airtel"} · ${item.label}`}</strong><span>+{formatPhone(item.phone)}</span></ContactIdentity>
    <ContactActions>
      {item.calls && <Link href={telHref(item.phone)} data-analytics-ignore aria-label={`${m.text("subscribe.call")} ${item.label}`}><PhoneIcon />{m.text("subscribe.call")}</Link>}
      {item.whatsapp && <Link href={waHref(item.phone, text)} data-analytics-ignore aria-label={`${m.text("subscribe.whatsapp")} ${item.label}`}><ChatIcon />{m.text("subscribe.whatsapp")}</Link>}
    </ContactActions>
  </ContactRow>)}</ContactList>;
}
