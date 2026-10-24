import { createSubscribeRoute } from "@/app/_components/subscribe-route";
import { pageMetadata } from "@/server/seo/metadata";
import { fixtureServices, paymentScenarios, plans } from "../../fixture";
import { ImageProbe } from "../../image-probe";
export const dynamic = "force-dynamic";
export const metadata = pageMetadata({ title: "Get access", description: "Synthetic payment acceptance only." });
const scenarios = Object.fromEntries(paymentScenarios.map((state) =>
  [state, createSubscribeRoute({ services: async () => fixtureServices(state), plans: async () => plans })]));
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parameters = await searchParams, state = typeof parameters.state === "string" ? parameters.state : "default";
  const Subscribe = scenarios[state] ?? scenarios.default!;
  return <><Subscribe locale="en" searchParams={searchParams} /><ImageProbe /></>;
}
