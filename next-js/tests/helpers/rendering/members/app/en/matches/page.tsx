import { PublicShell } from "@/app/_components/public-shell";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { cookies } from "next/headers";
import { fixtureSubscriptionStatus, subscriptionScenario } from "../../fixture-subscription";

/** Exercise the real compact feed header without running fixture providers or a database. */
export default async function Matches() {
  const scenario = subscriptionScenario((await cookies()).get("member-fixture-subscription")?.value);
  const active = Boolean(fixtureSubscriptionStatus(scenario).activeUntil);
  return <PublicShell locale="en" app compact current="today"><AppBrandBar locale="en" />
    <section data-fixture-feed data-fixture-feed-access={active ? "active" : "free"}><h1>Matches</h1><p>Synthetic feed header preview.</p></section>
  </PublicShell>;
}
