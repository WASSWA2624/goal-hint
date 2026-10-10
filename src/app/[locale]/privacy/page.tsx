import type { Metadata } from "next";
import { InformationShell } from "@/app/_components/information-shell";
import { PrivacyContent } from "@/app/_components/privacy-content";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";

const messages = createMessages("en");
export const metadata: Metadata = { title: messages.text("privacy.metadataTitle"), description: messages.text("privacy.description"),
  alternates: { canonical: new URL("/en/privacy", publicPolicy.origin).href } };

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <InformationShell locale={locale} page="privacy"><PrivacyContent locale={locale} /></InformationShell>;
}
