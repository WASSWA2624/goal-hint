import { InformationShell } from "@/app/_components/information-shell";
import { TermsContent } from "@/app/_components/terms-content";
import { createInformationMetadata } from "@/server/seo/metadata";

export const generateMetadata = createInformationMetadata("terms");

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <InformationShell locale={locale} page="terms"><TermsContent locale={locale} /></InformationShell>;
}
