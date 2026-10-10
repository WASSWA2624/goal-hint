import { ContactContent } from "@/app/_components/contact-content";
import { InformationShell } from "@/app/_components/information-shell";
import { createInformationMetadata } from "@/server/seo/metadata";

export const generateMetadata = createInformationMetadata("contact");

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <InformationShell locale={locale} page="contact"><ContactContent locale={locale} /></InformationShell>;
}
