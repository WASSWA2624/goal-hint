import type { Metadata } from "next";
import { MobileSlipHeaderGallery } from "@/components/slips/mobile-slip-header-gallery";

export const metadata: Metadata = {
  title: "Mobile slip header designs | Goal Hint",
  description: "Compare ten single-row mobile slip headers with original Clean ledger match rows.",
  robots: { index: false, follow: false },
};

export default async function MobileSlipHeaderDesignsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <MobileSlipHeaderGallery locale={locale} />;
}
