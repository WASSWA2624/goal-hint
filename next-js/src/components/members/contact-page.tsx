"use client";

import { useEffect, useState } from "react";
import styled from "styled-components";
import { TextLink } from "@/components/ui/controls";
import { MailIcon } from "@/components/ui/icons";
import { MutedText, Stack } from "@/components/ui/layout";
import { contactPageEmailHref, parsePublicContactPageSettings, type PublicContactPageSettings } from "@/domain/contact-page";
import { startRequestDeadline } from "@/domain/request-deadline";
import { createMessages } from "@/i18n/messages";
import { SupportContactLinks } from "./support-contact-links";

const updateEvent = "goalhint:contact-settings-updated";
const refreshInterval = 15_000;

/** Notify this page and other open tabs after an administrator saves support settings. */
export function refreshContactPageSettings() {
  window.dispatchEvent(new Event(updateEvent));
  try { window.localStorage.setItem(updateEvent, String(Date.now())); } catch { /* Polling also covers restricted browser storage. */ }
}

const EmailLink = styled(TextLink)`
  display: inline-flex; align-items: center; gap: ${({ theme }) => theme.space.sm};
  min-block-size: var(--form-control-height); max-inline-size: 100%; overflow-wrap: anywhere;
  > svg { flex: none; }
`;
const ContactDirectory = styled(Stack)`
  inline-size: 100%; max-inline-size: ${({ theme }) => theme.layout.formMaxWidth};
`;

export function ContactPageContacts({ locale, initial }: { locale: string; initial: PublicContactPageSettings | null }) {
  const [contact, setContact] = useState(initial);
  const messages = createMessages(locale);
  useEffect(() => {
    let active = true, pending = false;
    let controller: AbortController | null = null;
    async function refresh(force = false) {
      if (controller) { pending ||= force; return; }
      controller = new AbortController();
      const clearDeadline = startRequestDeadline(controller);
      try {
        const response = await fetch("/api/contact", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const next = parsePublicContactPageSettings(await response.json());
        if (active && next) setContact(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      } catch { /* A temporary outage keeps the last confirmed contact details visible. */ }
      finally {
        clearDeadline();
        controller = null;
        if (active && pending) { pending = false; void refresh(); }
      }
    }
    const onUpdate = () => { void refresh(true); };
    const onFocus = () => { void refresh(); };
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const onStorage = (event: StorageEvent) => { if (event.key === updateEvent) onUpdate(); };
    window.addEventListener(updateEvent, onUpdate);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(onVisible, refreshInterval);
    void refresh();
    return () => {
      active = false;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener(updateEvent, onUpdate);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return <ContactDirectory $gap="sm" data-contact-page aria-live="polite">
    {contact === null ? <MutedText>{messages.text("contact.unavailable")}</MutedText>
      : !contact.email && !contact.supportContacts.length ? <MutedText>{messages.text("contact.empty")}</MutedText>
        : <>
          {contact.email && <div><EmailLink href={contactPageEmailHref(contact.email)} data-analytics-ignore><MailIcon /><span>{contact.email}</span></EmailLink></div>}
          <SupportContactLinks locale={locale} contact={contact} appearance="text" />
        </>}
  </ContactDirectory>;
}
