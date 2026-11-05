import { cookies } from "next/headers";
import { createAccountRoute } from "@/app/_components/account-route";
import { pageMetadata } from "@/server/seo/metadata";
import { fixtureServices, fixtureState, fixtureStates } from "../../fixture-member-services";
import { RefreshProbe } from "./refresh-probe";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({ title: "Account", description: "Isolated member acceptance fixture." });
const accountRoutes = Object.fromEntries(fixtureStates.map(state => [state, createAccountRoute({ services: fixtureServices(state) })]));

/** Synthetic scenarios never touch an account database or message provider. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parameters = await searchParams, jar = await cookies();
  const Account = accountRoutes[await fixtureState(parameters)]!;
  return <><Account locale="en" searchParams={searchParams} /><RefreshProbe initialScenario={typeof parameters.scenario === "string" ? parameters.scenario : jar.get("member-fixture-scenario")?.value ?? "success"} /></>;
}
