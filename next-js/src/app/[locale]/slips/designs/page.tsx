import type { Metadata } from "next";
import { CompactSlipGallery } from "@/components/slips/compact-slip-gallery";

export const metadata: Metadata = {
  title: "Compact slip designs | Goal Hint",
  description: "Compare ten compact mobile slip layouts with illustrative sample data.",
  robots: { index: false, follow: false },
};

export default async function CompactSlipDesignsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CompactSlipGallery locale={locale} />;
}
