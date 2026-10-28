import type { Metadata } from "next";
import { MobileSlipHeaderGallery } from "@/components/slips/mobile-slip-header-gallery";

export const metadata: Metadata = {
  title: "Vertical rules mobile slip headers | Goal Hint",
  description: "Compare ten shorter mobile headers with aligned columns, equal status widths and unchanged Clean ledger matches.",
  robots: { index: false, follow: false },
};

export default async function MobileSlipHeaderDesignsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <MobileSlipHeaderGallery locale={locale} />;
}
