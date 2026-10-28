import type { Metadata } from "next";
import { HeaderDesignGallery } from "@/components/navigation/header-review/header-design-gallery";

export const metadata: Metadata = {
  title: "Header designs | Goal Hint",
  description: "Compare ten compact Goal Hint headers on mobile and desktop before choosing a design.",
  robots: { index: false, follow: false },
};

export default async function HeaderDesignsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <HeaderDesignGallery locale={locale} />;
}
