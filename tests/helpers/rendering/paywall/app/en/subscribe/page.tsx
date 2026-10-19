import { PublicShell } from "@/app/_components/public-shell";
import { PageHeading, Stack } from "@/components/ui/layout";
import { pageMetadata } from "@/server/seo/metadata";
import { SegmentedChoiceProbe } from "./probe";

export const metadata = pageMetadata({ title: "Get access", description: "Synthetic plan destination for 062 navigation acceptance." });
export const dynamic = "force-dynamic";
/** 063 supplies the production page; this test destination verifies the 062 renewal link contract. */
export default function Page() {
  return <PublicShell locale="en"><Stack><PageHeading>Get access</PageHeading>
    <section id="plans"><h2>2. Choose a plan</h2><p>Synthetic Daily · UGX 1,000 · 1 day</p><SegmentedChoiceProbe /></section>
  </Stack></PublicShell>;
}
