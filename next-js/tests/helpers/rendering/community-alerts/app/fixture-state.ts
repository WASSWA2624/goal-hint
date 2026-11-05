import { defaultSubscriptionSettings, protectedSettingFields, type SettingsPageData } from "@/domain/subscription-settings";
import { defaultCommunityLinks, type CommunityLink } from "@/domain/community";

const globalState = globalThis as typeof globalThis & { communityAlertFixture?: { role: string; settings: SettingsPageData["settings"] } };
export const fixture = globalState.communityAlertFixture ??= { role: "visitor", settings: { ...defaultSubscriptionSettings } };
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
    requirements: { test: [], on: [] }, diagnostics: { address: "synthetic", headers: [] } };
}
export const alertStatus = () => ({ scope, enabled: false, repeats: 1, events: [], endpoints: [], publicKey: null, transports: { web: false, fcm: false, windowsClosed: false } });
