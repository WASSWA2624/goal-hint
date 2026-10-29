import type { Metadata } from "next";
import { BannerDesignGallery } from "@/components/members/banner-review/banner-design-gallery";

export const metadata: Metadata = {
  title: "Desktop banner designs | Goal Hint",
  description: "Compare ten desktop subscription banners for signed-out visitors, members and active subscribers.",
  robots: { index: false, follow: false },
};

export default async function BannerDesignsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <BannerDesignGallery locale={locale} />;
}
