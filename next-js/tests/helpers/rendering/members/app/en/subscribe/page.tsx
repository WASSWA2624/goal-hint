import { createSubscribeRoute } from "@/app/_components/subscribe-route";
import { pageMetadata } from "@/server/seo/metadata";
import { fixtureCheckoutPlans } from "../../fixture-checkout";
import { fixtureServices, fixtureState, fixtureStates } from "../../fixture-member-services";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({ title: "Subscribe", description: "Isolated member acceptance fixture." });
const subscribeRoutes = Object.fromEntries(fixtureStates.map(state => [state, createSubscribeRoute({ services: fixtureServices(state), plans: async () => ["no-plan", "trial-eligible"].includes(state) ? [] : fixtureCheckoutPlans })]));
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const Subscribe = subscribeRoutes[await fixtureState(await searchParams)]!;
  return <Subscribe locale="en" searchParams={searchParams} />;
}
