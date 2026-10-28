import HeaderDesignsPage from "@/app/[locale]/header/designs/page";

export { metadata } from "@/app/[locale]/header/designs/page";

export default function HeaderReviewFixturePage() {
  return <HeaderDesignsPage params={Promise.resolve({ locale: "en" })} />;
}
