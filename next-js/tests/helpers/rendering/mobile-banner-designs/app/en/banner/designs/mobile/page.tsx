import MobileBannerDesignsPage from "@/app/[locale]/banner/designs/mobile/page";

export { metadata } from "@/app/[locale]/banner/designs/mobile/page";

export default function MobileBannerReviewFixturePage() {
  return <MobileBannerDesignsPage params={Promise.resolve({ locale: "en" })} />;
}
