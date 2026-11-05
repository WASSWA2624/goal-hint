import "server-only";

import { ContactPageContacts } from "@/components/members/contact-page";
import { BodyText, Stack } from "@/components/ui/layout";
import type { PublicContactPageSettings } from "@/domain/contact-page";
import { contactNotice } from "@/domain/contact-notice";
import { createContentMessages } from "@/i18n/content-messages";

export function ContactContent({ locale, contact = null }: { locale: string; contact?: PublicContactPageSettings | null }) {
  const messages = createContentMessages(locale);
  return <Stack $gap="md" data-contact-status={contactNotice.publication} data-contact-release-ready={contactNotice.releaseReady}>
    <BodyText>{messages.text("contact.brief")}</BodyText>
    <ContactPageContacts locale={locale} initial={contact} />
  </Stack>;
}
