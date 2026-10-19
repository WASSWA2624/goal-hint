import { createAccountRoute } from "@/app/_components/account-route";
import { defaultSubscriptionSettings } from "@/domain/subscription-settings";
import { pageMetadata } from "@/server/seo/metadata";
import type { MemberServices } from "@/server/members/member-http";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({ title: "Account", description: "Isolated member acceptance fixture." });

function fixtureServices(state: string) {
  return async () => ({ config: { production: false },
    settings: { settings: state === "unavailable" ? null : { ...defaultSubscriptionSettings, paywallMode: state === "off" ? "off" : "test" } },
    sessions: { async verify() { return state === "signed-in" ? { phone: "256700000101", codeEnteredAt: null } : null; } },
  }) as unknown as MemberServices;
}
const accountRoutes = Object.fromEntries(["off", "signed-out", "signed-in", "unavailable"].map((state) =>
  [state, createAccountRoute({ services: fixtureServices(state) })]));

/** Synthetic scenarios are confined to this isolated acceptance app; no owner setting or developer DB is changed. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parameters = await searchParams;
  const Account = accountRoutes[typeof parameters.state === "string" ? parameters.state : "signed-out"] ?? accountRoutes["signed-out"]!;
  return <Account locale="en" searchParams={searchParams} />;
}
