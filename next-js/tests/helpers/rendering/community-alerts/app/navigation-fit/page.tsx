import { ResponsiveNavigation } from "@/components/navigation/responsive-navigation";

export default function Page() {
  return <main data-community-short-navigation>
    <ResponsiveNavigation current="best-slips" moreLabel="More" destinations={[
      { key: "best-slips", href: "/en/best-slips", label: "Best slips", tab: "Slips", icon: "slips", tone: "blue" },
    ]} />
  </main>;
}
