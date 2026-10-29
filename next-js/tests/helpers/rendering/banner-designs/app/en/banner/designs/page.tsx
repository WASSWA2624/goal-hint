import BannerDesignsPage from "@/app/[locale]/banner/designs/page";

export { metadata } from "@/app/[locale]/banner/designs/page";

export default function BannerReviewFixturePage() {
  return <BannerDesignsPage params={Promise.resolve({ locale: "en" })} />;
}
