import type { Metadata } from "next";
import { ContactContent } from "@/app/_components/contact-content";
import { InformationShell } from "@/app/_components/information-shell";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";

const messages = createMessages("en");
export const metadata: Metadata = { title: messages.text("contact.metadataTitle"), description: messages.text("contact.description"),
  alternates: { canonical: new URL("/en/contact", publicPolicy.origin).href } };

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <InformationShell locale={locale} page="contact"><ContactContent locale={locale} /></InformationShell>;
}
