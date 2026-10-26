import { InformationShell } from "@/app/_components/information-shell";
import { PrivacyContent } from "@/app/_components/privacy-content";
import { createInformationMetadata } from "@/server/seo/metadata";

export const generateMetadata = createInformationMetadata("privacy");

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <InformationShell locale={locale} page="privacy"><PrivacyContent locale={locale} /></InformationShell>;
}
