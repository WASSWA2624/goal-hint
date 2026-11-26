import { defaultSubscriptionSettings, protectedSettingFields, type SettingsPageData } from "@/domain/subscription-settings";
import { defaultCommunityLinks, type CommunityLink } from "@/domain/community";

type InvitationAccount = { joined: boolean; invitedAt: number | null; claimId: string | null; pending: boolean };
type FixtureState = {
  role: string;
  settings: SettingsPageData["settings"];
  invitationTime: number | null;
  invitationAccounts: Map<string, InvitationAccount>;
};
const globalState = globalThis as typeof globalThis & { communityAlertFixture?: FixtureState };
export const fixture = globalState.communityAlertFixture ??= {
  role: "visitor", settings: { ...defaultSubscriptionSettings }, invitationTime: null, invitationAccounts: new Map(),
};

export function fixtureAccount(request: Request): string | null {
  const account = request.headers.get("cookie")?.match(/(?:^|; )fixture-community-account=([a-z0-9-]+)/u)?.[1];
  if (account === "guest") return null;
  return account ?? (fixture.role === "visitor" ? null : "default");
}
export const links: CommunityLink[] = [
  { type: "whatsapp-channel", url: "https://whatsapp.com/channel/TEST_ONLY_FIXTURE", enabled: true },
  { type: "telegram-channel", url: "https://t.me/TEST_ONLY_FIXTURE", enabled: true },
  { type: "whatsapp-group", url: "https://chat.whatsapp.com/TEST_ONLY_FIXTURE", enabled: true },
  { type: "tiktok", url: "https://www.tiktok.com/@gh_fixture", enabled: true },
  { type: "x", url: "https://x.com/gh_fixture", enabled: true },
  { type: "instagram", url: "https://www.instagram.com/gh_fixture/", enabled: true },
];
export const communityScenarios = ["unconfigured", "configured", "hidden", "all-hidden"] as const;
export type CommunityScenario = typeof communityScenarios[number];
export function setCommunityScenario(scenario: CommunityScenario) {
  fixture.settings = { ...fixture.settings, communityVisible: scenario !== "hidden",
    communityLinks: scenario === "unconfigured" ? [] : scenario === "all-hidden"
      ? defaultCommunityLinks.map(link => ({ ...link, enabled: false })) : links };
}
export const scope = "a".repeat(64);
export function settingsPage(): SettingsPageData {
  return { settings: fixture.settings, source: fixture.settings.updatedAt ? "stored" : "defaults", protectedFields: protectedSettingFields,
    checkoutReadiness: [], diagnostics: { address: "synthetic", headers: [] } };
}
export const alertStatus = () => ({ scope, enabled: false, repeats: 1, events: [], endpoints: [], publicKey: null, transports: { web: false, fcm: false, windowsClosed: false } });
