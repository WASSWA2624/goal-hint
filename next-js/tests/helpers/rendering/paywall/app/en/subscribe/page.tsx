import { cookies, headers } from "next/headers";
import { createSubscribeRoute } from "@/app/_components/subscribe-route";
import { pageMetadata } from "@/server/seo/metadata";
import { fixtureCheckoutPlans } from "@/../tests/helpers/rendering/members/app/fixture-checkout";
import { fixtureServices, fixtureState, fixtureStates } from "@/../tests/helpers/rendering/members/app/fixture-member-services";

export const metadata = pageMetadata({ title: "Get access", description: "Synthetic subscription checkout fixture." });
export const dynamic = "force-dynamic";

const viewerStates: Record<string, string> = {
  entitled: "active", expired: "expired", test: "free", revoked: "free", "verified-free": "member-free", off: "off",
};
const routes = Object.fromEntries(fixtureStates.map(state => [state, createSubscribeRoute({
  services: async () => {
    const [services, request] = await Promise.all([fixtureServices(state)(), headers()]);
    return { ...services, settings: { ...services.settings, source: "stored" },
      config: { ...services.config, production: request.get("x-test-sales") === "production" } };
  },
  plans: async () => fixtureCheckoutPlans,
})]));

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [parameters, request, jar] = await Promise.all([searchParams, headers(), cookies()]);
  const token = jar.get("goal-hint-member")?.value;
  const viewer = request.get("x-test-viewer") ?? (token === "f".repeat(43) ? "entitled" : token ?? "");
  const state = viewerStates[viewer] ?? await fixtureState(parameters);
  const Subscribe = routes[state]!;
  return <Subscribe locale="en" searchParams={searchParams} />;
}
