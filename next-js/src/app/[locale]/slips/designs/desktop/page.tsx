import type { Metadata } from "next";
import { DesktopSlipGallery } from "@/components/slips/desktop-slip-gallery";

export const metadata: Metadata = {
  title: "Desktop slip designs | Goal Hint",
  description: "Compare ten single-line desktop slip samples in collapsed and expanded states.",
  robots: { index: false, follow: false },
};

export default async function DesktopSlipDesignsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <DesktopSlipGallery locale={locale} />;
}
