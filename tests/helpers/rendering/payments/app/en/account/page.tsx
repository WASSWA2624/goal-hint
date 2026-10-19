import { createAccountRoute } from "@/app/_components/account-route";
import { fixtureServices } from "../../fixture";
export const dynamic = "force-dynamic";
const routes = Object.fromEntries(["default", "active"].map((state) => [state, createAccountRoute({ services: async () => fixtureServices(state) })]));
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { const state = (await searchParams).state; const Account = routes[typeof state === "string" ? state : "default"] ?? routes.default!; return <Account locale="en" searchParams={searchParams} />; }
