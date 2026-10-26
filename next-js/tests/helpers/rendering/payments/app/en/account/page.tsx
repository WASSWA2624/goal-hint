import { createAccountRoute } from "@/app/_components/account-route";
import { fixtureServices, paymentScenarios, plans } from "../../fixture";
export const dynamic = "force-dynamic";
const routes = Object.fromEntries(paymentScenarios.map((state) => [state, createAccountRoute({ services: async () => fixtureServices(state), plans: async () => plans })]));
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { const state = (await searchParams).state; const Account = routes[typeof state === "string" ? state : "default"] ?? routes.default!; return <Account locale="en" searchParams={searchParams} />; }
