import type { Metadata } from "next";
import { InformationShell } from "@/app/_components/information-shell";
import { TermsContent } from "@/app/_components/terms-content";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";

const messages = createMessages("en");
export const metadata: Metadata = { title: messages.text("terms.metadataTitle"), description: messages.text("terms.description"),
  alternates: { canonical: new URL("/en/terms", publicPolicy.origin).href } };

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <InformationShell locale={locale} page="terms"><TermsContent locale={locale} /></InformationShell>;
}
