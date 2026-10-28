import type { Metadata } from "next";
import { DesktopSlipGallery } from "@/components/slips/desktop-slip-gallery";

export const metadata: Metadata = {
  title: "Desktop slip designs | Goal Hint",
  description: "Compare ten compact desktop slip concepts with aligned teams, scores, match progress and selection outcomes.",
  robots: { index: false, follow: false },
};

export default async function DesktopSlipDesignsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <DesktopSlipGallery locale={locale} />;
}
