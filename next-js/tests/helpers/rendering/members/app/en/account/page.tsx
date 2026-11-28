import { cookies } from "next/headers";
import { createAccountRoute } from "@/app/_components/account-route";
import { pageMetadata } from "@/server/seo/metadata";
import { fixtureCheckoutPlans } from "../../fixture-checkout";
import { fixtureServices, fixtureState, fixtureStates } from "../../fixture-member-services";
import { RefreshProbe } from "./refresh-probe";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({ title: "Account", description: "Isolated member acceptance fixture." });
const accountRoutes = Object.fromEntries(fixtureStates.map(state => [state, createAccountRoute({ services: fixtureServices(state),
  plans: async () => ["no-plan", "trial-eligible"].includes(state) ? [] : fixtureCheckoutPlans })]));

/** Synthetic scenarios never touch an account database or message provider. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parameters = await searchParams, jar = await cookies();
  const state = await fixtureState(parameters), source = fixtureServices(state);
  const Account = parameters.deferred === "settings" || parameters.deferred === "identity" ? createAccountRoute({
    auth: async () => {
      if (parameters.deferred === "identity") throw new Error("Synthetic identity read failure");
      return source();
    },
    services: async () => {
      await new Promise(resolve => setTimeout(resolve, 1_800));
      return source();
    },
    plans: async () => fixtureCheckoutPlans,
  }) : accountRoutes[state]!;
  return <><Account locale="en" searchParams={searchParams} /><RefreshProbe initialScenario={typeof parameters.scenario === "string" ? parameters.scenario : jar.get("member-fixture-scenario")?.value ?? "success"} /></>;
}
