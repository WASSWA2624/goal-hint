import { InformationShell } from "@/app/_components/information-shell";

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <InformationShell locale={locale} page="contact" />;
}
