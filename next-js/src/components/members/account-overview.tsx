"use client";

import styled, { css } from "styled-components";
import { Button, TextLink } from "@/components/ui/controls";
import { telHref, waHref } from "@/domain/phone";
import { supportContactsOf } from "@/domain/support-contacts";
import { resolveLocale } from "@/i18n/locales";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import type { AdminContact } from "./admin-contact";
import { DesktopSupportContacts, DesktopSupportContent, MobileSupportContent } from "./support-contact-links";


const attention = css`
  margin-inline: calc(-1 * var(--gh-spacing-4_5)); padding-inline: var(--gh-spacing-4_5);
  color: ${({ theme }) => theme.color.outcome.pending.text};
  background: ${({ theme }) => theme.color.outcome.pending.background};
  a, p { color: inherit; }
  a { text-decoration: underline; text-underline-offset: var(--gh-size-0_75); }
  ${media.desktop} { margin-inline: calc(-1 * var(--gh-spacing-8)); padding-inline: var(--gh-spacing-8); }
`;
/** One sentence group; its actions sit beneath it on phones and beside it once there is room. */
export const AccountBlock = styled.section<{ $attention?: boolean }>`
  display: flex; flex-wrap: wrap; align-items: center; gap: 0 var(--gh-spacing-5); min-inline-size: 0;
  padding-block: var(--gh-spacing-2_5) var(--gh-spacing-0_5);
  border-block-end: 0;
  ${({ $attention }) => $attention && attention}
`;
export const AccountBlockText = styled.div`
  flex: 1 1 var(--gh-size-88); display: grid; gap: var(--gh-spacing-1); min-inline-size: 0; padding-block-end: var(--gh-spacing-2);
`;
export const AccountBlockActions = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: 0 var(--gh-spacing-4_5); min-inline-size: 0; padding-block-end: var(--gh-spacing-2);
  form { display: contents; }
`;
/** Small print inside a block: review times, last use, notes. */
export const AccountFine = styled.p`
  font-size: ${({ theme }) => theme.typography.scale.secondary}; line-height: var(--gh-leading-normal); color: ${({ theme }) => theme.color.mutedText};
`;
export const AccountActivityList = styled.ol`
  list-style: none; margin: 0; padding: 0; display: grid; gap: var(--gh-spacing-2);
  li { min-inline-size: 0; padding-block-end: var(--gh-spacing-2); border-block-end: 0; }
  li:last-child { border-block-end: 0; padding-block-end: 0; }
  li > p { font-size: ${({ theme }) => theme.typography.scale.body}; }
  time { display: block; color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
`;
const actionText = css`
  min-block-size: var(--form-control-height); padding: 0; border: 0; background: none;
  color: ${({ theme }) => theme.color.link}; font-size: ${({ theme }) => theme.typography.scale.body}; font-weight: ${({ theme }) => theme.typography.weight.bold}; text-decoration: none;
`;
// The doubled class outranks Button's own colours, so the disabled look is restated at the same strength.
export const AccountAction = styled(Button)`
  && { ${actionText} }
  &&:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: not-allowed; }
`;
export const AccountActionLink = styled(TextLink)`
  display: inline-flex; align-items: center; ${actionText}
`;
/** Status messages after a change, above the sentences. */
export const AccountFlash = styled.p`
  && { margin-block-start: var(--gh-spacing-2); }
  padding: var(--gh-spacing-2) var(--gh-spacing-3); border-radius: ${({ theme }) => theme.radius.surface};
  color: ${({ theme }) => theme.color.outcome.correct.text}; background: ${({ theme }) => theme.color.outcome.correct.background};
  font-size: var(--gh-font-emphasis);
`;

/** Text links to the admin; a missing number hides its link, and no number at all falls back to the contact page. */
export function AccountContactLinks({ locale, contact, text }: { locale: string; contact: AdminContact; text?: string }) {
  const m = createMessages(locale);
  const fallback = <AccountActionLink href={`/${resolveLocale(locale)}/contact`} prefetch={false}>{m.text("account.contactSupport")}</AccountActionLink>;
  return <><MobileSupportContent>{!contact.contactPhone && !contact.whatsappPhone ? fallback : <>
    {contact.contactPhone && <AccountActionLink href={telHref(contact.contactPhone)} data-analytics-ignore>{m.text("subscribe.callAdmin")}</AccountActionLink>}
    {contact.whatsappPhone && <AccountActionLink href={waHref(contact.whatsappPhone, text)} data-analytics-ignore>{m.text("subscribe.whatsapp")}</AccountActionLink>}
  </>}</MobileSupportContent>{supportContactsOf(contact).length ? <DesktopSupportContacts locale={locale} contact={contact} text={text} appearance="text" />
    : <DesktopSupportContent>{fallback}</DesktopSupportContent>}</>;
}
