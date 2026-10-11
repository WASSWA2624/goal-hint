import { HelpContent } from "@/app/_components/help-content";
import { InformationShell } from "@/app/_components/information-shell";
import { createInformationMetadata } from "@/server/seo/metadata";

export const generateMetadata = createInformationMetadata("help");

export default async function HelpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <InformationShell locale={locale} page="help"><HelpContent locale={locale} /></InformationShell>;
}
