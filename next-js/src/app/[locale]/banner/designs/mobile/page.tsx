import type { Metadata } from "next";
import { MobileBannerDesignGallery } from "@/components/members/banner-review/mobile-banner-design-gallery";

export const metadata: Metadata = {
  title: "Mobile banner designs | Goal Hint",
  description: "Compare ten mobile subscription banners for visitors, members and active subscribers.",
  robots: { index: false, follow: false },
};

export default async function MobileBannerDesignsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <MobileBannerDesignGallery locale={locale} />;
}
