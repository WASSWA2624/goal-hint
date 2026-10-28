import type { Metadata } from "next";
import { MobileSlipGallery } from "@/components/slips/mobile-slip-gallery";

export const metadata: Metadata = {
  title: "Compact slip designs | Goal Hint",
  description: "Compare ten compact mobile slip designs with date, league and country above each match.",
  robots: { index: false, follow: false },
};

export default async function CompactSlipDesignsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <MobileSlipGallery locale={locale} />;
}
