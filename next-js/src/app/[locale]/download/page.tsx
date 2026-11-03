import type { Metadata } from "next";
import { PublicShell } from "@/app/_components/public-shell";
import { DownloadPage } from "@/components/downloads/download-page";
import { createMessages } from "@/i18n/messages";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const messages = createMessages(locale);
  return { title: messages.text("downloads.metadataTitle"), description: messages.text("downloads.description") };
}
export default async function AppDownloadPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PublicShell locale={locale} current="download"><DownloadPage locale={locale} /></PublicShell>;
}
