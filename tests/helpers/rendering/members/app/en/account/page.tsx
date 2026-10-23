import { createAccountRoute } from "@/app/_components/account-route";
import { defaultSubscriptionSettings } from "@/domain/subscription-settings";
import { pageMetadata } from "@/server/seo/metadata";
import type { MemberServices } from "@/server/members/member-http";
import { RefreshProbe } from "./refresh-probe";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({ title: "Account", description: "Isolated member acceptance fixture." });

function fixtureServices(state: string) {
  const unlocked = ["active", "ended"].includes(state), at = Date.now();
  return async () => ({ config: { production: false },
    settings: { settings: state === "unavailable" ? null : { ...defaultSubscriptionSettings, paywallMode: state === "off" ? "off" : "test" } },
    sessions: { async verify() { return ["signed-in", "active", "ended", "blocked"].includes(state)
      ? { phone: "256700000101", blocked: state === "blocked", codeEnteredAt: unlocked ? new Date(at) : null } : null; } },
    auth: { async passwordResetSession() { return state === "password-reset" ? { phone: "256700000101" } : null; },
      async verificationSession() { return ["unverified", "unsupported"].includes(state) ? { phone: state === "unsupported" ? "5511999999999" : "256700000101" } : null; } },
    codes: { async accountView() { return { codes: [{ id: "synthetic", planName: "Weekly", durationDays: 7, extensionDays: 0, revokedAt: null,
      startsAt: new Date(at - 86400000 * 8), endsAt: new Date(at + (state === "ended" ? -1 : 7) * 86400000) }], devices: [{ tokenHash: "synthetic", lastSeenAt: new Date(at) }] }; } },
  }) as unknown as MemberServices;
}
const accountRoutes = Object.fromEntries(["off", "signed-out", "signed-in", "unavailable", "active", "ended", "blocked", "unverified", "unsupported", "password-reset"].map((state) =>
  [state, createAccountRoute({ services: fixtureServices(state) })]));

/** Synthetic scenarios are confined to this isolated acceptance app; no owner setting or developer DB is changed. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parameters = await searchParams;
  const Account = accountRoutes[typeof parameters.state === "string" ? parameters.state : parameters.status === "code-accepted" ? "active" : "signed-out"] ?? accountRoutes["signed-out"]!;
  return <><Account locale="en" searchParams={searchParams} /><RefreshProbe /></>;
}
